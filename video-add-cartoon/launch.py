#!/usr/bin/env python3
"""Cross-platform launcher: ensure venv deps, open browser, start server."""

from __future__ import annotations

import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8765/"


def ensure_dependencies() -> None:
    try:
        import flask  # noqa: F401
        import whisper  # noqa: F401
    except ImportError:
        print("Missing dependencies — run setup.bat (Windows) or ./setup.sh (Linux) first.")
        raise SystemExit(1)

    from tools import find_tool

    missing = [name for name in ("ffmpeg", "ffprobe", "auto-editor") if not find_tool(name)]
    if missing:
        print(f"Warning: missing tools on PATH: {', '.join(missing)}")


def open_browser_later() -> None:
    time.sleep(3)
    webbrowser.open(URL)


def main() -> int:
    ensure_dependencies()
    print(f"Opening browser at {URL}")
    threading.Thread(target=open_browser_later, daemon=True).start()
    return subprocess.call([sys.executable, str(ROOT / "server.py")])


if __name__ == "__main__":
    raise SystemExit(main())
