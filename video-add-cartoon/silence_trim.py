#!/usr/bin/env python3
"""Remove silent sections (no voice / no external audio) via auto-editor."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tools import require_tool, run_checked

# Milder than before: keep quiet speech; only cut true silence.
# Lower dB threshold = quieter sounds still count as "loud" (kept).
SILENCE_THRESHOLD = "-32dB"
SILENCE_MARGIN = "0.3sec"


def run_silence_trim(input_path: Path, output_path: Path | None = None) -> Path:
    """Cut only sections with no audible voice/audio. Does not look at video frames."""
    input_path = Path(input_path)
    if not input_path.is_file():
        raise FileNotFoundError(f"Input video not found: {input_path}")

    auto_editor = require_tool("auto-editor")
    suffix = input_path.suffix or ".mp4"
    output = output_path or input_path.with_name(f"{input_path.stem}_silence{suffix}")
    output.parent.mkdir(parents=True, exist_ok=True)

    run_checked(
        [
            auto_editor,
            str(input_path),
            "--edit",
            f"audio:threshold={SILENCE_THRESHOLD}",
            "--margin",
            SILENCE_MARGIN,
            "--when-silent",
            "cut",
            "--no-open",
            "--output",
            str(output),
        ],
        context="Silence remove failed",
    )

    if not output.is_file():
        raise RuntimeError(f"Expected silence-remove output not found: {output}")
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Remove silent parts (no voice / no external audio)."
    )
    parser.add_argument("input", type=Path, help="Input video")
    parser.add_argument("-o", "--output", type=Path, help="Output video path")
    args = parser.parse_args(argv)

    try:
        output = run_silence_trim(args.input, args.output)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Saved: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
