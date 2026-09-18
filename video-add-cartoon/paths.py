"""Cross-platform path configuration for the video pipeline."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _default_data_root() -> Path:
    env = os.environ.get("VIDEO_PIPELINE_DATA_ROOT")
    if env:
        return resolve_path(env)

    candidates: list[Path] = []
    if sys.platform == "win32":
        candidates.extend([Path("D:/karm"), Path("C:/karm"), Path.home() / "karm"])
    else:
        candidates.extend(
            [
                Path("/mnt/d/karm"),
                Path.home() / "karm",
                Path("/home") / os.environ.get("USER", "user") / "karm",
            ]
        )

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def resolve_path(value: str | Path) -> Path:
    """Accept Windows (D:\\foo), POSIX (/home/foo), or WSL (/mnt/d/foo) paths."""
    text = str(value).strip().strip('"').replace("\\", "/")

    if text.startswith("/mnt/") and len(text) > 6 and sys.platform == "win32":
        drive = text[5].upper()
        rest = text[6:].lstrip("/")
        return Path(f"{drive}:/{rest}")

    return Path(text).expanduser()


ROOT = Path(__file__).resolve().parent
DATA_ROOT = _default_data_root()

DEFAULT_CARTOON = resolve_path(
    os.environ.get(
        "VIDEO_PIPELINE_CARTOON",
        DATA_ROOT / "video_tutorial" / "cartoon.mp4",
    )
)
DEFAULT_OUTPUT_DIR = resolve_path(
    os.environ.get(
        "VIDEO_PIPELINE_OUTPUT_DIR",
        DATA_ROOT / "video_tutorial",
    )
)
TRANSCRIBER_DIR = resolve_path(
    os.environ.get(
        "VIDEO_TRANSCRIBER_DIR",
        DATA_ROOT / "video_transcriber",
    )
)
WORK_DIR = ROOT / "work"


def display_path(path: Path) -> str:
    """Human-readable path for the current OS."""
    try:
        return str(path.resolve())
    except OSError:
        return str(path)


def ffmpeg_filter_path(path: Path) -> str:
    """Escape a path for FFmpeg filter arguments (subtitles=...)."""
    resolved = path.resolve()
    text = str(resolved).replace("\\", "/")
    text = text.replace(":", "\\:")
    text = text.replace("'", "\\'")
    return text
