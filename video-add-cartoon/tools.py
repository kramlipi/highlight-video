"""Cross-platform external tool discovery."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def _auto_editor_binary_path() -> Path | None:
    try:
        import auto_editor
    except ImportError:
        return None
    package_dir = Path(auto_editor.__file__).resolve().parent
    local_name = "auto-editor.exe" if sys.platform == "win32" else "auto-editor"
    return package_dir / "bin" / local_name


def _ensure_auto_editor_binary() -> str | None:
    """Return path to the auto-editor native binary (not the pip console script)."""
    binary = _auto_editor_binary_path()
    if binary is None:
        return None
    if not binary.is_file():
        try:
            subprocess.run(
                [sys.executable, "-m", "auto_editor", "--version"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
                check=False,
            )
        except (subprocess.SubprocessError, OSError):
            return None
    return str(binary) if binary.is_file() else None


def find_tool(name: str) -> str | None:
    if name == "auto-editor":
        return _ensure_auto_editor_binary()

    path = shutil.which(name)
    if path:
        return path

    if sys.platform == "win32":
        for suffix in (".exe", ".cmd", ".bat"):
            candidate = Path(sys.prefix) / "Scripts" / f"{name}{suffix}"
            if candidate.is_file():
                return str(candidate)

    local = Path(sys.prefix) / "bin" / name
    if local.is_file():
        return str(local)
    return None


def require_tool(name: str) -> str:
    path = find_tool(name)
    if not path:
        raise RuntimeError(
            f"{name} not found on PATH. Install it and ensure it is available."
        )
    return path


def run_checked(cmd: list[str], *, context: str = "") -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        if not detail:
            detail = f"process exited with code {result.returncode}"
        prefix = f"{context}: " if context else ""
        raise RuntimeError(f"{prefix}{detail}")
    return result


def tool_version(name: str) -> str | None:
    if name == "auto-editor":
        try:
            result = subprocess.run(
                [sys.executable, "-m", "auto_editor", "--version"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=15,
            )
            if result.returncode == 0:
                return (result.stdout or result.stderr).splitlines()[0].strip()
        except (subprocess.SubprocessError, OSError):
            return None
        return None

    path = find_tool(name)
    if not path:
        return None
    try:
        result = subprocess.run(
            [path, "--version"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
        )
        if result.returncode == 0:
            return (result.stdout or result.stderr).splitlines()[0].strip()
    except (subprocess.SubprocessError, OSError):
        return None
    return None
