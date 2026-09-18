#!/usr/bin/env python3
"""Remove still / frozen frame sections using perceptual hashing (pHash).

Samples frames by *seeking* with FFmpeg (does not decode the whole 4GB file
frame-by-frame — that thrashes the GPU and can scramble the desktop display).
Re-encodes kept segments with an explicit yuv420p / bt709 pipeline so players
do not show broken / inverted colors.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

from tools import require_tool, run_checked

# Hamming distance on 64-bit pHash — lower means more similar.
HASH_THRESHOLD = 5
# Seconds between frame samples (trade-off: speed vs precision).
SAMPLE_INTERVAL = 0.25
# Only cut still runs at least this long.
MIN_STILL_DURATION = 0.6
# Keep a sliver at still-region edges so cuts feel less abrupt.
EDGE_MARGIN = 0.08
# Above this many keep-segments, switch to concat-demuxer (safer for long videos).
FILTER_COMPLEX_SEGMENT_LIMIT = 40

ProgressCallback = Callable[[float, str], None]


def still_trim_available() -> bool:
    try:
        import imagehash  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        return False
    return True


def require_still_trim_deps() -> None:
    if still_trim_available():
        return
    raise RuntimeError(
        "Still-frame remove needs Pillow and ImageHash. "
        "Run setup.bat or ./setup.sh to install dependencies."
    )


def _probe_video(path: Path) -> tuple[float, float]:
    ffprobe = require_tool("ffprobe")
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate,pix_fmt,color_space,color_transfer,color_primaries",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    data = json.loads(result.stdout)
    duration_raw = data.get("format", {}).get("duration")
    duration = float(duration_raw) if duration_raw else 0.0

    fps = 30.0
    streams = data.get("streams") or []
    if streams:
        rate = streams[0].get("r_frame_rate", "30/1")
        if isinstance(rate, str) and "/" in rate:
            num, den = rate.split("/", 1)
            if float(den):
                fps = float(num) / float(den)

    return max(duration, 0.0), fps or 30.0


def _has_audio(path: Path) -> bool:
    ffprobe = require_tool("ffprobe")
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return bool(result.stdout.strip())


def _extract_frame_phash(ffmpeg: str, input_path: Path, timestamp: float):
    """Seek to one timestamp and hash a tiny RGB thumbnail — no full-file decode."""
    import imagehash
    from PIL import Image
    from io import BytesIO

    # -ss before -i = fast input seek. Scale tiny for pHash; force 8-bit rgb.
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{max(0.0, timestamp):.3f}",
        "-i",
        str(input_path),
        "-frames:v",
        "1",
        "-vf",
        "scale=64:64:flags=area,format=rgb24",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "pipe:1",
    ]
    result = subprocess.run(cmd, capture_output=True, check=False)
    if result.returncode != 0 or not result.stdout:
        return None
    try:
        image = Image.open(BytesIO(result.stdout)).convert("RGB")
        return imagehash.phash(image)
    except Exception:
        return None


def _sample_frame_hashes(
    input_path: Path,
    *,
    duration: float,
    interval: float,
    progress_callback: ProgressCallback | None = None,
) -> list[tuple[float, object]]:
    ffmpeg = require_tool("ffmpeg")
    if duration <= 0:
        duration, _ = _probe_video(input_path)
    if duration <= 0:
        raise RuntimeError("Could not determine video duration for still-frame analysis")

    samples: list[tuple[float, object]] = []
    timestamps = []
    t = 0.0
    while t < duration:
        timestamps.append(t)
        t += interval
    if not timestamps or timestamps[-1] < duration - 0.05:
        timestamps.append(max(0.0, duration - 0.05))

    total = len(timestamps)
    for i, ts in enumerate(timestamps):
        phash = _extract_frame_phash(ffmpeg, input_path, ts)
        if phash is not None:
            samples.append((ts, phash))
        if progress_callback and (i % 8 == 0 or i + 1 == total):
            pct = min(55.0, ((i + 1) / total) * 55.0)
            progress_callback(pct, f"Analyzing frames ({i + 1}/{total} seeks, pHash)…")

    if len(samples) < 2:
        raise RuntimeError(
            "Could not sample enough frames for still-frame detection. "
            "The video may be corrupt or use an unsupported codec."
        )
    return samples


def _find_cut_regions(
    samples: list[tuple[float, object]],
    duration: float,
    *,
    hash_threshold: int,
    min_still_duration: float,
    edge_margin: float,
) -> list[tuple[float, float]]:
    if len(samples) < 2:
        return []

    cuts: list[tuple[float, float]] = []
    run_start = samples[0][0]
    prev_hash = samples[0][1]

    for timestamp, phash in samples[1:]:
        distance = prev_hash - phash
        if distance <= hash_threshold:
            continue

        run_end = timestamp
        run_duration = run_end - run_start
        if run_duration >= min_still_duration:
            cut_start = min(run_start + edge_margin, run_end)
            cut_end = max(run_end - edge_margin, cut_start)
            if cut_end - cut_start >= 0.05:
                cuts.append((cut_start, cut_end))

        run_start = timestamp
        prev_hash = phash

    final_end = duration if duration > 0 else samples[-1][0]
    if final_end - run_start >= min_still_duration:
        cut_start = min(run_start + edge_margin, final_end)
        cut_end = max(final_end - edge_margin, cut_start)
        if cut_end - cut_start >= 0.05:
            cuts.append((cut_start, cut_end))

    return _merge_regions(cuts)


def _merge_regions(regions: list[tuple[float, float]], gap: float = 0.05) -> list[tuple[float, float]]:
    if not regions:
        return []
    merged = [regions[0]]
    for start, end in regions[1:]:
        prev_start, prev_end = merged[-1]
        if start <= prev_end + gap:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))
    return merged


def _keep_segments(duration: float, cuts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not cuts:
        return [(0.0, duration)]

    keep: list[tuple[float, float]] = []
    cursor = 0.0
    for cut_start, cut_end in cuts:
        if cut_start > cursor + 0.02:
            keep.append((cursor, cut_start))
        cursor = max(cursor, cut_end)

    if duration - cursor > 0.02:
        keep.append((cursor, duration))

    return keep


def _x264_args() -> list[str]:
    """Force a player-safe 8-bit yuv420p encode — prevents broken / neon colors."""
    return [
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-movflags",
        "+faststart",
    ]


def _render_via_filter_complex(
    input_path: Path,
    segments: list[tuple[float, float]],
    output_path: Path,
    *,
    has_audio: bool,
) -> None:
    ffmpeg = require_tool("ffmpeg")
    filters: list[str] = []
    concat_inputs: list[str] = []
    for index, (start, end) in enumerate(segments):
        # format=yuv420p before concat avoids chroma/color-space mixups
        filters.append(
            f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS,"
            f"format=yuv420p,setsar=1[v{index}]"
        )
        if has_audio:
            filters.append(
                f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[a{index}]"
            )
            concat_inputs.append(f"[v{index}][a{index}]")
        else:
            concat_inputs.append(f"[v{index}]")

    if has_audio:
        filters.append(
            f"{''.join(concat_inputs)}concat=n={len(segments)}:v=1:a=1[outv][outa]"
        )
        map_args = ["-map", "[outv]", "-map", "[outa]", "-c:a", "aac", "-b:a", "192k"]
    else:
        filters.append(
            f"{''.join(concat_inputs)}concat=n={len(segments)}:v=1:a=0[outv]"
        )
        map_args = ["-map", "[outv]", "-an"]

    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-i",
        str(input_path),
        "-filter_complex",
        ";".join(filters),
        *map_args,
        *_x264_args(),
        str(output_path),
    ]
    run_checked(cmd, context="Still-frame render failed")


def _render_via_concat_demuxer(
    input_path: Path,
    segments: list[tuple[float, float]],
    output_path: Path,
    *,
    has_audio: bool,
) -> None:
    """More reliable for many cuts / huge files: encode each keep-range, then concat."""
    ffmpeg = require_tool("ffmpeg")
    with tempfile.TemporaryDirectory(prefix="still_trim_") as tmp:
        tmp_dir = Path(tmp)
        list_path = tmp_dir / "concat.txt"
        part_paths: list[Path] = []

        for index, (start, end) in enumerate(segments):
            part = tmp_dir / f"part_{index:04d}.mp4"
            duration = max(0.05, end - start)
            cmd = [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-ss",
                f"{start:.3f}",
                "-i",
                str(input_path),
                "-t",
                f"{duration:.3f}",
                "-vf",
                "format=yuv420p,setsar=1",
                *_x264_args(),
            ]
            if has_audio:
                cmd.extend(["-c:a", "aac", "-b:a", "192k"])
            else:
                cmd.append("-an")
            cmd.append(str(part))
            run_checked(cmd, context=f"Still-frame segment {index + 1} failed")
            part_paths.append(part)

        list_path.write_text(
            "".join(f"file '{p.as_posix()}'\n" for p in part_paths),
            encoding="utf-8",
        )
        run_checked(
            [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_path),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(output_path),
            ],
            context="Still-frame concat failed",
        )


def _render_segments(
    input_path: Path,
    segments: list[tuple[float, float]],
    output_path: Path,
    *,
    has_audio: bool,
) -> None:
    if len(segments) == 1:
        start, end = segments[0]
        duration, _ = _probe_video(input_path)
        if start <= 0.01 and end >= duration - 0.05:
            # Nothing to cut — copy as-is (preserves original colors exactly).
            shutil.copy2(input_path, output_path)
            return

    if len(segments) > FILTER_COMPLEX_SEGMENT_LIMIT:
        _render_via_concat_demuxer(input_path, segments, output_path, has_audio=has_audio)
    else:
        _render_via_filter_complex(input_path, segments, output_path, has_audio=has_audio)


def run_still_trim(
    input_path: Path,
    output_path: Path | None = None,
    *,
    progress_callback: ProgressCallback | None = None,
) -> Path:
    """Cut parts where the picture barely changes (long still / frozen frames)."""
    require_still_trim_deps()

    input_path = Path(input_path)
    if not input_path.is_file():
        raise FileNotFoundError(f"Input video not found: {input_path}")

    suffix = input_path.suffix or ".mp4"
    output = output_path or input_path.with_name(f"{input_path.stem}_still{suffix}")
    output.parent.mkdir(parents=True, exist_ok=True)

    if progress_callback:
        progress_callback(2.0, "Scanning video for still frames (seek + pHash)…")

    duration, _ = _probe_video(input_path)
    samples = _sample_frame_hashes(
        input_path,
        duration=duration,
        interval=SAMPLE_INTERVAL,
        progress_callback=progress_callback,
    )

    if progress_callback:
        progress_callback(60.0, "Finding long still sections…")

    cuts = _find_cut_regions(
        samples,
        duration,
        hash_threshold=HASH_THRESHOLD,
        min_still_duration=MIN_STILL_DURATION,
        edge_margin=EDGE_MARGIN,
    )
    keep = _keep_segments(duration, cuts)

    if not keep:
        raise RuntimeError("Still-frame remove would delete the entire video")

    if progress_callback:
        removed = sum(end - start for start, end in cuts)
        progress_callback(
            75.0,
            f"Cutting {len(cuts)} still region(s), saving ~{_format_seconds(removed)}…",
        )

    _render_segments(input_path, keep, output, has_audio=_has_audio(input_path))

    if not output.is_file():
        raise RuntimeError(f"Expected still-frame-remove output not found: {output}")

    if progress_callback:
        progress_callback(100.0, f"Still-frame remove complete: {output.name}")

    return output


def _format_seconds(seconds: float) -> str:
    total = int(round(max(0.0, seconds)))
    mins, secs = divmod(total, 60)
    if mins:
        return f"{mins}m {secs}s"
    return f"{secs}s"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Remove still frames (same picture held for a long time) using pHash."
    )
    parser.add_argument("input", type=Path, help="Input video")
    parser.add_argument("-o", "--output", type=Path, help="Output video path")
    args = parser.parse_args(argv)

    try:
        output = run_still_trim(args.input, args.output)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Saved: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
