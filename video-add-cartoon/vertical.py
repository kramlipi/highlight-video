"""Convert landscape video to 9:16 (1080×1920) with blur-fill or tight crop."""

from __future__ import annotations

import argparse
import struct
import subprocess
import zlib
from pathlib import Path

from tools import find_tool, require_tool


OUT_W = 1080
OUT_H = 1920


def _parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def probe_duration(path: Path) -> float | None:
    ffprobe = find_tool("ffprobe")
    if not ffprobe:
        return None
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return _parse_float((result.stdout or "").strip())


def pick_video_encoder(ffmpeg: str) -> list[str]:
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-encoders"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    encoders = result.stdout or ""
    if "h264_nvenc" in encoders:
        return [
            "-c:v",
            "h264_nvenc",
            "-preset",
            "p4",
            "-rc",
            "vbr",
            "-cq",
            "23",
            "-b:v",
            "0",
            "-pix_fmt",
            "yuv420p",
        ]
    return [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
    ]


def build_filter(mode: str, focus: float) -> str:
    focus = min(1.0, max(0.0, focus))
    if mode == "crop":
        return (
            f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
            f"crop={OUT_W}:{OUT_H}:(iw-{OUT_W})*{focus}:(ih-{OUT_H})/2,"
            "setsar=1"
        )
    return (
        "[0:v]split[fg][bg];"
        f"[bg]scale={OUT_W // 6}:{OUT_H // 6},"
        "gblur=sigma=14,"
        f"scale={OUT_W}:{OUT_H},crop={OUT_W}:{OUT_H}[bg];"
        f"[fg]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
    )


def convert_to_vertical(
    input_path: Path,
    output_path: Path,
    *,
    mode: str = "blur",
    focus: float = 0.5,
    start: float = 0,
    duration: float | None = None,
    on_progress=None,
) -> Path:
    ffmpeg = require_tool("ffmpeg")
    input_path = Path(input_path)
    output_path = Path(output_path)
    if not input_path.is_file():
        raise FileNotFoundError(f"Video not found: {input_path}")
    if mode not in {"blur", "crop"}:
        raise ValueError("mode must be 'blur' or 'crop'")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    total = duration
    if total is None:
        probed = probe_duration(input_path)
        if probed is not None:
            total = max(0.1, probed - start)

    cmd: list[str] = [ffmpeg, "-y", "-hide_banner"]
    if start > 0:
        cmd.extend(["-ss", f"{start:.3f}"])
    if duration is not None and duration > 0:
        cmd.extend(["-t", f"{duration:.3f}"])
    cmd.extend(["-i", str(input_path)])
    if duration is not None and duration > 0:
        cmd.extend(["-t", f"{duration:.3f}"])

    filt = build_filter(mode, focus)
    if mode == "blur":
        cmd.extend(["-filter_complex", filt])
    else:
        cmd.extend(["-vf", filt])

    cmd.extend(pick_video_encoder(ffmpeg))
    cmd.extend(["-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"])
    cmd.extend(["-progress", "pipe:1", "-nostats", str(output_path)])

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        key, _, raw = line.strip().partition("=")
        if key != "out_time_ms" or not on_progress or not total:
            continue
        try:
            seconds = int(raw) / 1_000_000
            on_progress(min(0.99, max(0.0, seconds / total)))
        except ValueError:
            pass

    stderr = proc.stderr.read() if proc.stderr else ""
    code = proc.wait()
    if code != 0 or not output_path.is_file():
        detail = (stderr or "").strip()[-800:]
        raise RuntimeError(detail or f"FFmpeg failed with code {code}")
    if on_progress:
        on_progress(1)
    return output_path


def plan_shorts(
    total: float,
    *,
    start: float = 0,
    clip: float = 30,
    max_shorts: int | None = None,
) -> list[tuple[int, float, float]]:
    clip = max(3.0, clip)
    start = max(0.0, start)
    planned: list[tuple[int, float, float]] = []
    cursor = start
    index = 1
    while cursor < total - 1.5:
        duration = min(clip, total - cursor)
        if duration < 3:
            break
        planned.append((index, cursor, duration))
        cursor += clip
        index += 1
        if max_shorts and index > max_shorts:
            break
    return planned


def write_store_zip(files: list[tuple[str, Path]], zip_path: Path) -> Path:
    """Write a classic stored zip Windows Explorer can open."""
    zip_path = Path(zip_path)
    tmp = zip_path.with_suffix(zip_path.suffix + ".part")
    if tmp.exists():
        tmp.unlink()
    if zip_path.exists():
        zip_path.unlink()

    central: list[bytes] = []
    with tmp.open("wb") as out:
        for name, src in files:
            src = Path(src)
            size = src.stat().st_size
            if size >= 0xFFFFFFFF:
                raise RuntimeError(f"{name} is too large for a classic zip. Download that short on its own.")
            crc = 0
            with src.open("rb") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    crc = zlib.crc32(chunk, crc)
            crc &= 0xFFFFFFFF
            name_b = name.replace("\\", "/").encode("ascii", "replace")
            offset = out.tell()
            out.write(
                struct.pack(
                    "<4sHHHHHIIIHH",
                    b"PK\x03\x04",
                    20,
                    0,
                    0,
                    0,
                    0,
                    crc,
                    size,
                    size,
                    len(name_b),
                    0,
                )
            )
            out.write(name_b)
            with src.open("rb") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            central.append(
                struct.pack(
                    "<4sHHHHHHIIIHHHHHII",
                    b"PK\x01\x02",
                    20,
                    20,
                    0,
                    0,
                    0,
                    0,
                    crc,
                    size,
                    size,
                    len(name_b),
                    0,
                    0,
                    0,
                    0,
                    0,
                    offset,
                )
                + name_b
            )
        cd_start = out.tell()
        for block in central:
            out.write(block)
        cd_size = out.tell() - cd_start
        count = len(files)
        if count >= 0xFFFF or cd_start >= 0xFFFFFFFF:
            raise RuntimeError("Too much video for one zip. Download the shorts one by one.")
        out.write(struct.pack("<4sHHHHIIH", b"PK\x05\x06", 0, 0, count, count, cd_size, cd_start, 0))
    tmp.replace(zip_path)
    return zip_path


def convert_many_shorts(
    input_path: Path,
    output_dir: Path,
    *,
    mode: str = "blur",
    focus: float = 0.5,
    start: float = 0,
    clip: float = 30,
    max_shorts: int | None = None,
    on_progress=None,
) -> tuple[list[dict], Path]:
    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    total = probe_duration(input_path) or 0
    if total <= 0:
        raise RuntimeError("Could not read video duration.")
    planned = plan_shorts(total, start=start, clip=clip, max_shorts=max_shorts)
    if not planned:
        raise RuntimeError("No shorts to make from this range.")

    stem = input_path.stem or "video"
    clips: list[dict] = []
    count = len(planned)
    for index, clip_start, clip_duration in planned:
        name = f"{stem}_short_{index:02d}.mp4"
        out = output_dir / name

        def tick(value: float, i: int = index) -> None:
            if not on_progress:
                return
            overall = ((i - 1) + value) / count
            on_progress(overall, i, count, f"Short {i}/{count}")

        convert_to_vertical(
            input_path,
            out,
            mode=mode,
            focus=focus,
            start=clip_start,
            duration=clip_duration,
            on_progress=tick,
        )
        clips.append(
            {
                "index": index,
                "name": name,
                "path": str(out),
                "start": clip_start,
                "duration": clip_duration,
            }
        )

    zip_path = output_dir / f"{stem}_shorts.zip"
    write_store_zip([(clip_info["name"], Path(clip_info["path"])) for clip_info in clips], zip_path)
    if on_progress:
        on_progress(1, count, count, "Shorts ready")
    return clips, zip_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert landscape video to 9:16")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=("blur", "crop"), default="blur")
    parser.add_argument("--focus", type=float, default=0.5)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--duration", type=float, default=None)
    parser.add_argument("--shorts", action="store_true")
    parser.add_argument("--clip", type=float, default=30)
    parser.add_argument("--max-shorts", type=int, default=0)
    args = parser.parse_args()

    if args.shorts:
        def batch_tick(value: float, index: int, count: int, label: str) -> None:
            print(f"{label} progress={value:.3f}", flush=True)

        clips, zip_path = convert_many_shorts(
            Path(args.input),
            Path(args.output),
            mode=args.mode,
            focus=args.focus,
            start=args.start,
            clip=args.clip,
            max_shorts=args.max_shorts or None,
            on_progress=batch_tick,
        )
        print(f"{len(clips)} shorts -> {zip_path}")
        return

    def tick(value: float) -> None:
        print(f"progress={value:.3f}", flush=True)

    out = convert_to_vertical(
        Path(args.input),
        Path(args.output),
        mode=args.mode,
        focus=args.focus,
        start=args.start,
        duration=args.duration,
        on_progress=tick,
    )
    print(out)


if __name__ == "__main__":
    main()
