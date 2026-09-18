#!/usr/bin/env bash
# Rerun pipeline on ShareX video and print comparison stats.
set -euo pipefail

INPUT="/mnt/d/installation/ShareX-18.0.1-portable/ShareX/Screenshots/2026-07/msedge_T8U03JGkZp.mp4"
OUTDIR="/mnt/d/karm/video_tutorial"
STEM="msedge_T8U03JGkZp"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"
source .venv/bin/activate

if [[ ! -f "$INPUT" ]]; then
  echo "Error: input not found: $INPUT" >&2
  exit 1
fi

mkdir -p "$OUTDIR"

echo "=== Copying original ==="
cp -f "$INPUT" "$OUTDIR/${STEM}_original.mp4"

echo "=== Step 1: Silence trim (aggressive) ==="
bash "$SCRIPT_DIR/silence-trim.sh" "$INPUT"

TRIM="${INPUT%.mp4}_silencetrim.mp4"
cp -f "$TRIM" "$OUTDIR/${STEM}_silencetrim.mp4"

echo "=== Step 2: Cartoon overlay ==="
python "$SCRIPT_DIR/overlay.py" "$TRIM" -o "$OUTDIR/${STEM}_final.mp4"

python3 <<'PY'
import json
import subprocess
from pathlib import Path

OUTDIR = Path("/mnt/d/karm/video_tutorial")
STEM = "msedge_T8U03JGkZp"
files = {
    "original": OUTDIR / f"{STEM}_original.mp4",
    "silencetrim": OUTDIR / f"{STEM}_silencetrim.mp4",
    "final": OUTDIR / f"{STEM}_final.mp4",
}


def probe(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json", str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def fmt_dur(seconds: float) -> str:
    total = int(round(seconds))
    mins, secs = divmod(total, 60)
    hours, mins = divmod(mins, 60)
    if hours:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def fmt_size(num: int) -> str:
    if num < 1024 * 1024:
        return f"{num / 1024:.1f} KB"
    return f"{num / (1024 * 1024):.2f} MB"


orig_d = probe(files["original"])
trim_d = probe(files["silencetrim"])
final_d = probe(files["final"])
saved = orig_d - trim_d
pct = (saved / orig_d * 100) if orig_d > 0 else 0

print()
print("=== COMPARISON STATS ===")
print(f"original_path:       {files['original']}")
print(f"silencetrim_path:    {files['silencetrim']}")
print(f"final_path:          {files['final']}")
print(f"original_duration:   {orig_d:.2f}s ({fmt_dur(orig_d)})")
print(f"trimmed_duration:    {trim_d:.2f}s ({fmt_dur(trim_d)})")
print(f"final_duration:      {final_d:.2f}s ({fmt_dur(final_d)})")
print(f"time_saved_seconds:  {saved:.2f}s ({fmt_dur(saved)})")
print(f"percent_trimmed:     {pct:.1f}%")
print(f"original_size:       {fmt_size(files['original'].stat().st_size)}")
print(f"trimmed_size:        {fmt_size(files['silencetrim'].stat().st_size)}")
print(f"final_size:          {fmt_size(files['final'].stat().st_size)}")
PY
