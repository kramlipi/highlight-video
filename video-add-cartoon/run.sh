#!/usr/bin/env bash
# Native Linux/macOS launcher.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d .venv ]]; then
  echo "First-time setup..."
  bash setup.sh
fi

# shellcheck disable=SC1091
source .venv/bin/activate
exec python launch.py
