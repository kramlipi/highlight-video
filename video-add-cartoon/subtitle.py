#!/usr/bin/env python3
"""Whisper transcription + SRT chunking + FFmpeg subtitle burn-in."""

from __future__ import annotations

import argparse
import datetime
import os
import re
import sys
import tempfile
from pathlib import Path

from paths import DEFAULT_OUTPUT_DIR, ffmpeg_filter_path
from tools import require_tool, run_checked

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base")
WHISPER_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "en")


def format_timestamp(seconds: float) -> str:
    td = datetime.timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    millis = int(td.microseconds / 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def convert_time(time_str: str) -> float:
    h, m, s = time_str.split(":")
    s, ms = s.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def time_to_str(seconds: float) -> str:
    h = int(seconds) // 3600
    m = int(seconds) // 60 % 60
    s = int(seconds) % 60
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def chunk_srt(input_path: Path, output_path: Path) -> Path:
    """Split subtitles into 1-2 word chunks (from video_transcriber/second-pass-srt.py)."""
    lines = input_path.read_text(encoding="utf-8").splitlines()
    srt_entries: list[tuple[int, float, float, str]] = []
    i = 0
    while i < len(lines):
        if not lines[i].strip():
            i += 1
            continue
        index = int(lines[i].strip())
        i += 1
        start_str, end_str = lines[i].strip().split(" --> ")
        i += 1
        text = lines[i].strip()
        i += 1

        start_sec = convert_time(start_str)
        end_sec = convert_time(end_str)
        words = text.split()
        chunks: list[str] = []
        j = 0
        while j < len(words):
            chunk_words = words[j : j + 2]
            j += 2
            chunks.append(" ".join(chunk_words))

        current_time = start_sec
        for chunk in chunks:
            time_for_chunk = len(chunk.split()) * 0.5
            new_end = min(end_sec, current_time + time_for_chunk)
            srt_entries.append((index, current_time, new_end, chunk))
            current_time = new_end

    with output_path.open("w", encoding="utf-8") as f:
        for idx, (_, start, end, text) in enumerate(srt_entries, start=1):
            f.write(f"{idx}\n")
            f.write(f"{time_to_str(start)} --> {time_to_str(end)}\n")
            f.write(f"{text}\n\n")
    return output_path


def extract_audio(video_path: Path, audio_path: Path) -> None:
    ffmpeg = require_tool("ffmpeg")
    run_checked(
        [
            ffmpeg,
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-acodec",
            "libmp3lame",
            "-q:a",
            "4",
            str(audio_path),
        ],
        context="Audio extraction failed",
    )


def transcribe_to_srt(video_path: Path, srt_path: Path, *, language: str = WHISPER_LANGUAGE) -> Path:
    import whisper

    with tempfile.TemporaryDirectory(prefix="vpipe_audio_") as tmp:
        audio_path = Path(tmp) / "audio.mp3"
        extract_audio(video_path, audio_path)

        model = whisper.load_model(WHISPER_MODEL)
        result = model.transcribe(str(audio_path), language=language)

    with srt_path.open("w", encoding="utf-8") as f:
        for i, segment in enumerate(result["segments"], start=1):
            start = format_timestamp(segment["start"])
            end = format_timestamp(segment["end"])
            text = segment["text"].strip()
            f.write(f"{i}\n{start} --> {end}\n{text}\n\n")

    return srt_path


def parse_ffmpeg_progress(line: str, duration: float | None) -> float | None:
    match = re.search(r"time=(\d{2}):(\d{2}):(\d{2}\.\d+)", line)
    if not match or not duration or duration <= 0:
        return None
    h, m, s = match.groups()
    seconds = int(h) * 3600 + int(m) * 60 + float(s)
    return min(99.0, (seconds / duration) * 100.0)


def probe_duration(path: Path) -> float | None:
    import json
    import subprocess

    ffprobe = require_tool("ffprobe")
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    raw = data.get("format", {}).get("duration")
    return float(raw) if raw else None


def burn_subtitles(
    video_path: Path,
    srt_path: Path,
    output_path: Path,
    progress_callback=None,
) -> Path:
    import subprocess

    ffmpeg = require_tool("ffmpeg")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    duration = probe_duration(video_path)
    srt_esc = ffmpeg_filter_path(srt_path)
    style = (
        "FontName=Arial,FontSize=28,PrimaryColour=&HFFFFFF,"
        "OutlineColour=&H000000,BorderStyle=1,Outline=2,Shadow=1,"
        "Alignment=2,MarginV=40"
    )
    vf = f"setsar=1,subtitles='{srt_esc}':force_style='{style}'"

    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(video_path),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "copy",
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
    stderr_lines: list[str] = []
    for line in proc.stderr:
        stderr_lines.append(line)
        if progress_callback:
            pct = parse_ffmpeg_progress(line, duration)
            if pct is not None:
                progress_callback(pct, line.strip())
    rc = proc.wait()
    if rc != 0:
        tail = "".join(stderr_lines[-40:])
        raise RuntimeError(f"Subtitle burn-in failed (exit {rc})\n{tail}")
    if progress_callback:
        progress_callback(100.0, "Done")
    return output_path


def add_subtitles(
    input_path: Path,
    output_path: Path,
    *,
    srt_path: Path | None = None,
    language: str = WHISPER_LANGUAGE,
    progress_callback=None,
) -> tuple[Path, Path]:
    input_path = Path(input_path)
    if not input_path.is_file():
        raise FileNotFoundError(f"Input video not found: {input_path}")

    work_srt = srt_path or input_path.with_suffix(".srt")
    chunked_srt = work_srt.with_name(f"{work_srt.stem}_chunked.srt")

    if progress_callback:
        progress_callback(5.0, "Transcribing audio with Whisper…")
    transcribe_to_srt(input_path, work_srt, language=language)

    if progress_callback:
        progress_callback(35.0, "Chunking subtitles…")
    chunk_srt(work_srt, chunked_srt)

    if progress_callback:
        progress_callback(45.0, "Burning subtitles into video…")

    def burn_progress(pct: float, message: str) -> None:
        overall = 45.0 + (pct * 0.55)
        if progress_callback:
            progress_callback(overall, message)

    burn_subtitles(input_path, chunked_srt, output_path, progress_callback=burn_progress)
    return output_path, chunked_srt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Transcribe and burn subtitles into a video.")
    parser.add_argument("input", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--language", default=WHISPER_LANGUAGE)
    args = parser.parse_args(argv)

    output = args.output or DEFAULT_OUTPUT_DIR / f"{args.input.stem}_subtitled{args.input.suffix}"

    def on_progress(pct: float, msg: str) -> None:
        print(f"\rProgress: {pct:5.1f}%  {msg[:70]}", end="", flush=True)

    try:
        add_subtitles(args.input, output, language=args.language, progress_callback=on_progress)
    except Exception as exc:
        print(f"\nError: {exc}", file=sys.stderr)
        return 1

    print(f"\nSaved: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
