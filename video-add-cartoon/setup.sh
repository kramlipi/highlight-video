#!/usr/bin/env bash
# Cross-platform setup for Linux/macOS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

for f in "${SCRIPT_DIR}"/*.sh; do
  [[ -f "$f" ]] && sed -i 's/\r$//' "$f" 2>/dev/null || true
done

echo "Video Pipeline Setup (Linux/macOS)"
echo "==================================="

if ! command -v python3 >/dev/null; then
  echo "Error: python3 not found"
  exit 1
fi

if [[ -d .venv/Scripts ]] && [[ ! -f .venv/bin/python ]]; then
  echo "Removing Windows virtual environment..."
  rm -rf .venv
fi

if [[ ! -f .venv/bin/python ]]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install auto-editor

echo
echo "Checking tools..."
command -v ffmpeg >/dev/null && echo "  ffmpeg: OK" || echo "  ffmpeg: MISSING"
command -v ffprobe >/dev/null && echo "  ffprobe: OK" || echo "  ffprobe: MISSING"
command -v auto-editor >/dev/null && echo "  auto-editor: OK" || echo "  auto-editor: in venv"

chmod +x run.sh RUN 2>/dev/null || true

echo
echo "Setup complete. Run ./RUN or ./run.sh to start the UI."
