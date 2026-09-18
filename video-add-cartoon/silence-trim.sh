#!/usr/bin/env bash
# Legacy wrapper — calls cross-platform Python implementation.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${SCRIPT_DIR}/.venv/bin/python"
[[ -x "$PYTHON" ]] || PYTHON="$(command -v python3)"
exec "$PYTHON" "${SCRIPT_DIR}/silence_trim.py" "$@"
