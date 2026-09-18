#!/usr/bin/env python3
"""Overlay a cartoon face (oval mask) on a video using FFmpeg."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

DEFAULT_CARTOON = Path(r"d:\karm\video_tutorial\cartoon.mp4")
OVERLAY_WIDTH_RATIO = 0.15
PADDING_RATIO = 0.025


@dataclass
class VideoInfo:
    width: int
    height: int
    duration: float | None = None


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} not found on PATH. Install FFmpeg and ensure ffprobe is available.")
    return path


def probe_video(path: Path) -> VideoInfo:
    ffprobe = require_tool("ffprobe")
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    stream = data["streams"][0]
    duration_raw = data.get("format", {}).get("duration")
    duration = float(duration_raw) if duration_raw else None
    return VideoInfo(
        width=int(stream["width"]),
        height=int(stream["height"]),
        duration=duration,
    )


def compute_overlay_size(main: VideoInfo, cartoon: VideoInfo) -> tuple[int, int]:
    """Scale overlay to 15% of main video width, preserving cartoon aspect ratio."""
    overlay_w = max(2, int(main.width * OVERLAY_WIDTH_RATIO))
    overlay_h = max(2, int(overlay_w * cartoon.height / cartoon.width))
    # Ensure even dimensions for some codecs
    overlay_w -= overlay_w % 2
    overlay_h -= overlay_h % 2
    return overlay_w, overlay_h


def build_filter_complex(main: VideoInfo, overlay_w: int, overlay_h: int) -> str:
    pad = max(4, int(main.width * PADDING_RATIO))
    x = main.width - overlay_w - pad
    y = main.height - overlay_h - pad

    # Elliptical alpha: inside unit ellipse -> opaque, outside -> transparent
    alpha_expr = (
        "if(lte(pow((X-W/2)/(W/2),2)+pow((Y-H/2)/(H/2),2),1),255,0)"
    )
    return (
        f"[1:v]scale={overlay_w}:{overlay_h},format=rgba,"
        f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='{alpha_expr}'[fg];"
        f"[0:v][fg]overlay={x}:{y}:shortest=1[outv]"
    )


def parse_ffmpeg_progress(line: str, duration: float | None) -> float | None:
    """Return progress 0-100 from an ffmpeg stderr line, or None."""
    match = re.search(r"time=(\d{2}):(\d{2}):(\d{2}\.\d+)", line)
    if not match or not duration or duration <= 0:
        return None
    h, m, s = match.groups()
    seconds = int(h) * 3600 + int(m) * 60 + float(s)
    return min(99.0, (seconds / duration) * 100.0)


def overlay_video(
    input_path: Path,
    output_path: Path,
    cartoon_path: Path = DEFAULT_CARTOON,
    progress_callback=None,
) -> Path:
    if not input_path.is_file():
        raise FileNotFoundError(f"Input video not found: {input_path}")
    if not cartoon_path.is_file():
        raise FileNotFoundError(f"Cartoon overlay not found: {cartoon_path}")

    require_tool("ffmpeg")
    main = probe_video(input_path)
    cartoon = probe_video(cartoon_path)
    overlay_w, overlay_h = compute_overlay_size(main, cartoon)
    filter_complex = build_filter_complex(main, overlay_w, overlay_h)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-stream_loop",
        "-1",
        "-i",
        str(cartoon_path),
        "-filter_complex",
        filter_complex,
        "-map",
        "[outv]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "copy",
        "-shortest",
        str(output_path),
    ]

    proc = subprocess.Popen(
        cmd,
        stderr=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert proc.stderr is not None
    for line in proc.stderr:
        if progress_callback:
            pct = parse_ffmpeg_progress(line, main.duration)
            if pct is not None:
                progress_callback(pct, line.strip())
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg failed with exit code {rc}")

    if progress_callback:
        progress_callback(100.0, "Done")
    return output_path


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_cartoon_overlay{input_path.suffix}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Overlay cartoon face in an oval at bottom-right (15% of video width)."
    )
    parser.add_argument("input", type=Path, help="Input video file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output video path (default: <input>_cartoon_overlay.ext)",
    )
    parser.add_argument(
        "--cartoon",
        type=Path,
        default=DEFAULT_CARTOON,
        help=f"Cartoon overlay source (default: {DEFAULT_CARTOON})",
    )
    args = parser.parse_args(argv)

    output = args.output or default_output_path(args.input)

    def on_progress(pct: float, msg: str) -> None:
        print(f"\rProgress: {pct:5.1f}%  {msg[:60]}", end="", flush=True)

    try:
        overlay_video(args.input, output, args.cartoon, progress_callback=on_progress)
    except Exception as exc:
        print(f"\nError: {exc}", file=sys.stderr)
        return 1

    print(f"\nSaved: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
