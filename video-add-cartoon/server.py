#!/usr/bin/env python3
"""Cross-platform video pipeline: silence / still trim → cartoon → subtitles."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_file
from werkzeug.utils import secure_filename

from overlay import DEFAULT_CARTOON, DEFAULT_OUTPUT_DIR, overlay_video
from paths import ROOT, WORK_DIR, display_path, resolve_path
from silence_trim import run_silence_trim
from still_trim import run_still_trim, still_trim_available
from subtitle import add_subtitles
from tools import find_tool, tool_version
from vertical import convert_many_shorts, convert_to_vertical, plan_shorts

HOST = "127.0.0.1"
PORT = 8765
# Browser uploads over ~500 MB are unreliable; use local_path for large files.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024  # 8 GB (hard ceiling)
BROWSER_UPLOAD_WARN_BYTES = 400 * 1024 * 1024  # steer users to local path above this
VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpg", ".mpeg"}

WORK_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
app.config["MAX_FORM_MEMORY_SIZE"] = MAX_UPLOAD_BYTES
app.config["MAX_FORM_PARTS"] = 1000

jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def set_job(job_id: str, **fields) -> None:
    with jobs_lock:
        jobs.setdefault(job_id, {})
        jobs[job_id].update(fields)


def get_job(job_id: str) -> dict | None:
    with jobs_lock:
        if job_id not in jobs:
            return None
        return jobs[job_id].copy()


def _parse_bool(value, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _link_or_copy(src: Path, dst: Path) -> None:
    """Prefer hardlink for large files; fall back to copy."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    try:
        os.link(src, dst)
        return
    except OSError:
        pass
    shutil.copy2(src, dst)


def _format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "?"
    total = int(round(seconds))
    mins, secs = divmod(total, 60)
    hours, mins = divmod(mins, 60)
    if hours:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def _format_size(num_bytes: int | None) -> str:
    if num_bytes is None:
        return "?"
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.2f} MB"


def probe_duration(path: Path) -> float | None:
    try:
        ffprobe = find_tool("ffprobe")
        if not ffprobe:
            return None
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
    except (subprocess.CalledProcessError, ValueError, json.JSONDecodeError):
        return None


def file_size(path: Path) -> int | None:
    try:
        return path.stat().st_size if path.is_file() else None
    except OSError:
        return None


def build_comparison_stats(
    original_path: Path,
    silencetrim_path: Path | None,
    final_path: Path,
    *,
    trim_enabled: bool,
) -> dict:
    original_duration = probe_duration(original_path)
    trimmed_duration = probe_duration(silencetrim_path) if silencetrim_path else None
    final_duration = probe_duration(final_path)

    original_size = file_size(original_path)
    trimmed_size = file_size(silencetrim_path) if silencetrim_path else None
    final_size = file_size(final_path)

    time_saved = None
    percent_trimmed = None
    if (
        trim_enabled
        and original_duration is not None
        and trimmed_duration is not None
        and original_duration > 0
    ):
        time_saved = max(0.0, original_duration - trimmed_duration)
        percent_trimmed = round((time_saved / original_duration) * 100, 1)

    return {
        "original_path": str(original_path),
        "original_path_display": display_path(original_path),
        "silencetrim_path": str(silencetrim_path) if silencetrim_path else None,
        "silencetrim_path_display": display_path(silencetrim_path) if silencetrim_path else None,
        "final_path": str(final_path),
        "final_path_display": display_path(final_path),
        "original_duration": original_duration,
        "trimmed_duration": trimmed_duration,
        "final_duration": final_duration,
        "original_duration_fmt": _format_duration(original_duration),
        "trimmed_duration_fmt": _format_duration(trimmed_duration) if trimmed_duration is not None else None,
        "final_duration_fmt": _format_duration(final_duration),
        "time_saved_seconds": round(time_saved, 2) if time_saved is not None else None,
        "time_saved_fmt": _format_duration(time_saved) if time_saved is not None else None,
        "percent_trimmed": percent_trimmed,
        "original_size": original_size,
        "trimmed_size": trimmed_size,
        "final_size": final_size,
        "original_size_fmt": _format_size(original_size),
        "trimmed_size_fmt": _format_size(trimmed_size) if trimmed_size is not None else None,
        "final_size_fmt": _format_size(final_size),
        "trim_enabled": trim_enabled,
    }


def run_pipeline(
    job_id: str,
    input_path: Path,
    original_name: str,
    *,
    work_dir: Path | None = None,
    do_silence: bool = True,
    do_still: bool = False,
    do_cartoon: bool = True,
    do_subtitles: bool = True,
) -> None:
    stem = Path(original_name).stem or "video"
    suffix = input_path.suffix or ".mp4"
    job_dir = work_dir or input_path.parent
    job_dir.mkdir(parents=True, exist_ok=True)

    options = {
        "silence": do_silence,
        "still": do_still,
        "cartoon": do_cartoon,
        "subtitles": do_subtitles,
    }
    enabled_steps = [
        name
        for name, on in (
            ("silence", do_silence),
            ("still", do_still),
            ("cartoon", do_cartoon),
            ("subtitles", do_subtitles),
        )
        if on
    ]
    if not enabled_steps:
        set_job(
            job_id,
            status="error",
            progress=0,
            message="Select at least one option: silence, still frames, cartoon, or subtitles.",
            options=options,
        )
        return

    step_total = len(enabled_steps)
    step_index = {name: i + 1 for i, name in enumerate(enabled_steps)}

    def progress_for(step_name: str, local_pct: float) -> float:
        idx = step_index[step_name]
        span = 100 / step_total
        return round((idx - 1) * span + (local_pct * span / 100), 1)

    silence_path = job_dir / f"{stem}_silence{suffix}"
    still_path = job_dir / f"{stem}_still{suffix}"
    cartoon_path = job_dir / f"{stem}_cartoon{suffix}"
    final_path = DEFAULT_OUTPUT_DIR / f"{stem}_final{suffix}"
    srt_path = job_dir / f"{stem}.srt"

    current = input_path
    trimmed: Path | None = None
    cartoon_out: Path | None = None

    try:
        set_job(job_id, options=options, step_total=step_total)

        if do_silence:
            set_job(
                job_id,
                status="processing",
                step=step_index["silence"],
                step_name="silence",
                step_label="Removing silence",
                progress=progress_for("silence", 5),
                message="Cutting sections with no voice / no audio…",
            )
            trimmed = run_silence_trim(current, silence_path)
            current = trimmed
            set_job(
                job_id,
                intermediate_path=str(trimmed),
                intermediate_name=trimmed.name,
                progress=progress_for("silence", 100),
                message=f"Silence remove complete: {trimmed.name}",
            )

        if do_still:

            def on_still_progress(pct: float, message: str) -> None:
                set_job(
                    job_id,
                    status="processing",
                    step=step_index["still"],
                    step_name="still",
                    step_total=step_total,
                    step_label="Removing still frames",
                    progress=progress_for("still", pct),
                    message=message[:200] if message else "Removing still frames…",
                )

            set_job(
                job_id,
                status="processing",
                step=step_index["still"],
                step_name="still",
                step_label="Removing still frames",
                progress=progress_for("still", 2),
                message="Scanning frames with perceptual hash (pHash)…",
            )
            trimmed = run_still_trim(
                current,
                still_path,
                progress_callback=on_still_progress,
            )
            current = trimmed
            set_job(
                job_id,
                intermediate_path=str(trimmed),
                intermediate_name=trimmed.name,
                progress=progress_for("still", 100),
                message=f"Still-frame remove complete: {trimmed.name}",
            )

        if do_cartoon:
            if not DEFAULT_CARTOON.is_file():
                raise FileNotFoundError(
                    f"Cartoon overlay not found: {display_path(DEFAULT_CARTOON)}"
                )

            def on_overlay_progress(pct: float, message: str) -> None:
                set_job(
                    job_id,
                    status="processing",
                    step=step_index["cartoon"],
                    step_name="cartoon",
                    step_total=step_total,
                    step_label="Adding cartoon overlay",
                    progress=progress_for("cartoon", pct),
                    message=message[:200] if message else "Applying cartoon overlay…",
                )

            set_job(
                job_id,
                status="processing",
                step=step_index["cartoon"],
                step_name="cartoon",
                step_label="Adding cartoon overlay",
                progress=progress_for("cartoon", 2),
                message="Starting cartoon overlay…",
            )
            overlay_video(
                current,
                cartoon_path,
                DEFAULT_CARTOON,
                progress_callback=on_overlay_progress,
            )
            cartoon_out = cartoon_path
            current = cartoon_path

        if do_subtitles:

            def on_subtitle_progress(pct: float, message: str) -> None:
                set_job(
                    job_id,
                    status="processing",
                    step=step_index["subtitles"],
                    step_name="subtitles",
                    step_total=step_total,
                    step_label="Generating subtitles",
                    progress=progress_for("subtitles", pct),
                    message=message[:200] if message else "Generating subtitles…",
                )

            set_job(
                job_id,
                status="processing",
                step=step_index["subtitles"],
                step_name="subtitles",
                step_label="Generating subtitles",
                progress=progress_for("subtitles", 2),
                message="Transcribing with Whisper and burning subtitles…",
            )
            add_subtitles(
                current,
                final_path,
                srt_path=srt_path,
                progress_callback=on_subtitle_progress,
            )
        else:
            _link_or_copy(current, final_path)

        original_copy = DEFAULT_OUTPUT_DIR / f"{stem}_original{suffix}"
        try:
            src_size = input_path.stat().st_size
        except OSError:
            src_size = 0
        if src_size and src_size <= BROWSER_UPLOAD_WARN_BYTES:
            _link_or_copy(input_path, original_copy)
        if trimmed and trimmed.is_file():
            trim_copy = DEFAULT_OUTPUT_DIR / f"{stem}_trimmed{suffix}"
            _link_or_copy(trimmed, trim_copy)
        if srt_path.is_file():
            shutil.copy2(srt_path, DEFAULT_OUTPUT_DIR / f"{stem}.srt")

        stats = build_comparison_stats(
            input_path,
            trimmed,
            final_path,
            trim_enabled=do_silence or do_still,
        )

        set_job(
            job_id,
            status="done",
            step=step_total,
            step_total=step_total,
            step_name="done",
            step_label="Complete",
            progress=100,
            message="Pipeline complete",
            options=options,
            output_name=final_path.name,
            output_path=str(final_path),
            output_path_display=display_path(final_path),
            output_path_windows=display_path(final_path),
            cartoon_path=str(cartoon_out) if cartoon_out else None,
            srt_path=str(srt_path) if srt_path.is_file() else None,
            intermediate_path=str(trimmed) if trimmed else None,
            intermediate_name=trimmed.name if trimmed else None,
            **stats,
        )
    except Exception as exc:
        set_job(
            job_id,
            status="error",
            progress=0,
            message=str(exc),
            options=options,
        )


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.errorhandler(413)
def too_large(_err):
    limit_gb = MAX_UPLOAD_BYTES / (1024 * 1024 * 1024)
    return jsonify(
        {"error": f"Video too large (max {limit_gb:.0f} GB). Restart the server if you just updated."}
    ), 413


@app.errorhandler(Exception)
def api_unhandled_error(err):
    """Always return JSON for /api/* so the UI never tries to parse HTML error pages."""
    from werkzeug.exceptions import HTTPException

    if not request.path.startswith("/api/"):
        raise err
    if isinstance(err, HTTPException):
        return jsonify({"error": err.description or err.name}), err.code or 500
    return jsonify({"error": str(err)}), 500


@app.route("/")
@app.route("/index.html")
def index_page():
    return send_file(ROOT / "index.html")


@app.route("/api/health")
def health():
    import sys

    return jsonify(
        {
            "ok": True,
            "platform": sys.platform,
            "cartoon_path": display_path(DEFAULT_CARTOON),
            "cartoon_exists": DEFAULT_CARTOON.is_file(),
            "output_dir": display_path(DEFAULT_OUTPUT_DIR),
            "output_dir_exists": DEFAULT_OUTPUT_DIR.is_dir(),
            "ffmpeg": find_tool("ffmpeg") is not None,
            "ffprobe": find_tool("ffprobe") is not None,
            "auto_editor": find_tool("auto-editor") is not None,
            "auto_editor_version": tool_version("auto-editor"),
            "still_trim_available": still_trim_available(),
            "whisper_available": _whisper_available(),
            "vertical": find_tool("ffmpeg") is not None,
        }
    )


def _whisper_available() -> bool:
    try:
        import whisper  # noqa: F401

        return True
    except ImportError:
        return False


@app.route("/api/process", methods=["POST", "OPTIONS"])
def process():
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        payload = request.get_json(silent=True) or {}
        silence_raw = request.form.get("silence", payload.get("silence"))
        still_raw = request.form.get("still", payload.get("still"))
        legacy_trim = request.form.get("trim", payload.get("trim"))
        if silence_raw is not None:
            do_silence = _parse_bool(silence_raw, True)
        elif legacy_trim is not None:
            do_silence = _parse_bool(legacy_trim, True)
        else:
            do_silence = True
        do_still = _parse_bool(still_raw, False)
        do_cartoon = _parse_bool(request.form.get("cartoon", payload.get("cartoon")), True)
        do_subtitles = _parse_bool(
            request.form.get("subtitles", payload.get("subtitles")), True
        )

        if not (do_silence or do_still or do_cartoon or do_subtitles):
            return jsonify(
                {
                    "error": (
                        "Select at least one option: silence remove, still-frame remove, "
                        "cartoon, or subtitles."
                    )
                }
            ), 400

        local_path_raw = (
            request.form.get("local_path")
            or payload.get("local_path")
            or ""
        ).strip()

        job_id = uuid.uuid4().hex
        job_dir = WORK_DIR / job_id
        job_dir.mkdir(parents=True)

        if local_path_raw:
            source = resolve_path(local_path_raw)
            if not source.is_file():
                return jsonify(
                    {"error": f"Local file not found: {display_path(source)}"}
                ), 400
            if source.suffix.lower() not in VIDEO_SUFFIXES:
                return jsonify(
                    {
                        "error": (
                            f"Unsupported file type '{source.suffix}'. "
                            f"Use: {', '.join(sorted(VIDEO_SUFFIXES))}"
                        )
                    }
                ), 400

            input_path = source.resolve()
            original_name = source.name
            size_bytes = input_path.stat().st_size
        else:
            if "video" not in request.files:
                return jsonify(
                    {
                        "error": (
                            "Missing video. For large files (1GB+ / 4GB), paste the "
                            "full local path instead of uploading."
                        )
                    }
                ), 400

            upload = request.files["video"]
            if not upload or not upload.filename:
                return jsonify({"error": "No file uploaded"}), 400

            content_length = request.content_length or 0
            if content_length > BROWSER_UPLOAD_WARN_BYTES:
                return jsonify(
                    {
                        "error": (
                            f"Browser upload is too large ({content_length / (1024**3):.1f} GB). "
                            "Paste the full file path in “Local file path” instead — "
                            "no upload needed for 4GB videos."
                        )
                    }
                ), 413

            original_name = upload.filename
            safe_stem = secure_filename(Path(original_name).stem) or "video"
            suffix = Path(original_name).suffix or ".mp4"
            input_path = job_dir / f"{safe_stem}{suffix}"
            upload.save(input_path)
            size_bytes = input_path.stat().st_size

        options = {
            "silence": do_silence,
            "still": do_still,
            "cartoon": do_cartoon,
            "subtitles": do_subtitles,
        }
        step_total = sum(1 for on in (do_silence, do_still, do_cartoon, do_subtitles) if on)

        set_job(
            job_id,
            status="queued",
            step=0,
            step_total=step_total,
            step_label="Queued",
            progress=0,
            message=(
                f"Queued ({size_bytes / (1024**3):.2f} GB) — processing from disk…"
                if local_path_raw
                else "Queued for processing"
            ),
            input_name=original_name,
            original_path=str(input_path),
            options=options,
            source_mode="local_path" if local_path_raw else "upload",
        )

        thread = threading.Thread(
            target=run_pipeline,
            args=(job_id, input_path, original_name),
            kwargs={
                "work_dir": job_dir,
                "do_silence": do_silence,
                "do_still": do_still,
                "do_cartoon": do_cartoon,
                "do_subtitles": do_subtitles,
            },
            daemon=True,
        )
        thread.start()

        return jsonify(
            {
                "job_id": job_id,
                "input_name": original_name,
                "options": options,
                "source_mode": "local_path" if local_path_raw else "upload",
                "size_bytes": size_bytes,
            }
        )
    except Exception as exc:
        return jsonify({"error": f"Upload failed: {exc}"}), 500


def _resolve_job_input(payload: dict) -> tuple[Path, str, Path, bool]:
    local_path_raw = (
        request.form.get("local_path") or payload.get("local_path") or ""
    ).strip()
    job_id = uuid.uuid4().hex
    job_dir = WORK_DIR / job_id
    job_dir.mkdir(parents=True)

    if local_path_raw:
        source = resolve_path(local_path_raw)
        if not source.is_file():
            raise ValueError(f"Local file not found: {display_path(source)}")
        if source.suffix.lower() not in VIDEO_SUFFIXES:
            raise ValueError(f"Unsupported file type '{source.suffix}'")
        return source.resolve(), source.name, job_dir, True

    if "video" not in request.files:
        raise ValueError("Missing video. For large files, paste the full local path.")
    upload = request.files["video"]
    if not upload or not upload.filename:
        raise ValueError("No file uploaded")
    original_name = upload.filename
    safe_stem = secure_filename(Path(original_name).stem) or "video"
    suffix = Path(original_name).suffix or ".mp4"
    input_path = job_dir / f"{safe_stem}{suffix}"
    upload.save(input_path)
    return input_path, original_name, job_dir, False


def run_vertical_job(
    job_id: str,
    input_path: Path,
    original_name: str,
    *,
    work_dir: Path,
    mode: str,
    focus: float,
    start: float,
    duration: float | None,
    split: bool = False,
    clip: float = 30,
    max_shorts: int | None = None,
) -> None:
    options = {
        "mode": mode,
        "focus": focus,
        "start": start,
        "duration": duration,
        "split": split,
        "clip": clip,
        "max_shorts": max_shorts,
    }
    try:
        set_job(
            job_id,
            status="running",
            step=1,
            step_total=1,
            step_label="9:16 convert",
            progress=2,
            message="Reframing to 1080×1920…",
            options=options,
        )
        stem = Path(original_name).stem or "video"

        if split:
            def batch_tick(value: float, index: int, count: int, label: str) -> None:
                set_job(
                    job_id,
                    step=index,
                    step_total=count,
                    step_label=label,
                    progress=max(2, int(value * 100)),
                    message=f"{label} — {int(value * 100)}%",
                )

            clips, zip_path = convert_many_shorts(
                input_path,
                work_dir,
                mode=mode,
                focus=focus,
                start=start,
                clip=clip,
                max_shorts=max_shorts,
                on_progress=batch_tick,
            )
            set_job(
                job_id,
                status="done",
                progress=100,
                step=len(clips),
                step_total=len(clips),
                step_label="Done",
                message=f"{len(clips)} shorts ready",
                final_path=str(zip_path),
                final_path_display=display_path(zip_path),
                output_name=zip_path.name,
                clips=clips,
                options=options,
            )
            return

        output_path = work_dir / f"{stem}_9x16.mp4"

        def tick(value: float) -> None:
            set_job(
                job_id,
                progress=max(2, int(value * 100)),
                message=f"Encoding 9:16 — {int(value * 100)}%",
            )

        convert_to_vertical(
            input_path,
            output_path,
            mode=mode,
            focus=focus,
            start=start,
            duration=duration,
            on_progress=tick,
        )
        set_job(
            job_id,
            status="done",
            progress=100,
            step_label="Done",
            message="9:16 video ready",
            final_path=str(output_path),
            options=options,
        )
    except Exception as exc:
        set_job(
            job_id,
            status="error",
            progress=0,
            message=str(exc),
            options=options,
        )


@app.route("/api/vertical", methods=["POST", "OPTIONS"])
def vertical():
    if request.method == "OPTIONS":
        return ("", 204)
    try:
        payload = request.get_json(silent=True) or {}
        mode = str(request.form.get("mode", payload.get("mode") or "blur")).strip().lower()
        if mode not in {"blur", "crop"}:
            return jsonify({"error": "mode must be blur or crop"}), 400
        try:
            focus = float(request.form.get("focus", payload.get("focus", 0.5)))
        except (TypeError, ValueError):
            focus = 0.5
        try:
            start = float(request.form.get("start", payload.get("start", 0)) or 0)
        except (TypeError, ValueError):
            start = 0
        duration_raw = request.form.get("duration", payload.get("duration"))
        try:
            duration = float(duration_raw) if duration_raw not in (None, "") else None
        except (TypeError, ValueError):
            duration = None
        split = _parse_bool(request.form.get("split", payload.get("split")), False)
        try:
            clip = float(request.form.get("clip", payload.get("clip", 30)) or 30)
        except (TypeError, ValueError):
            clip = 30
        max_raw = request.form.get("max_shorts", payload.get("max_shorts"))
        try:
            max_shorts = int(max_raw) if max_raw not in (None, "", "0") else None
        except (TypeError, ValueError):
            max_shorts = None

        input_path, original_name, job_dir, from_disk = _resolve_job_input(payload)
        job_id = job_dir.name
        set_job(
            job_id,
            status="queued",
            step=0,
            step_total=1,
            step_label="Queued",
            progress=0,
            message="Queued shorts factory" if split else "Queued 9:16 convert",
            input_name=original_name,
            original_path=str(input_path),
            options={
                "mode": mode,
                "focus": focus,
                "start": start,
                "duration": duration,
                "split": split,
                "clip": clip,
                "max_shorts": max_shorts,
            },
            source_mode="local_path" if from_disk else "upload",
        )
        thread = threading.Thread(
            target=run_vertical_job,
            args=(job_id, input_path, original_name),
            kwargs={
                "work_dir": job_dir,
                "mode": mode,
                "focus": focus,
                "start": start,
                "duration": duration,
                "split": split,
                "clip": clip,
                "max_shorts": max_shorts,
            },
            daemon=True,
        )
        thread.start()
        return jsonify({"job_id": job_id, "input_name": original_name})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Vertical convert failed: {exc}"}), 500


@app.route("/api/probe", methods=["POST", "OPTIONS"])
def probe():
    if request.method == "OPTIONS":
        return ("", 204)
    payload = request.get_json(silent=True) or {}
    local_path_raw = (request.form.get("local_path") or payload.get("local_path") or "").strip()
    if not local_path_raw:
        return jsonify({"error": "Paste a local file path to probe."}), 400
    source = resolve_path(local_path_raw)
    if not source.is_file():
        return jsonify({"error": f"Local file not found: {display_path(source)}"}), 400
    total = probe_duration(source)
    try:
        clip = float(request.form.get("clip", payload.get("clip", 30)) or 30)
    except (TypeError, ValueError):
        clip = 30
    try:
        start = float(request.form.get("start", payload.get("start", 0)) or 0)
    except (TypeError, ValueError):
        start = 0
    max_raw = request.form.get("max_shorts", payload.get("max_shorts"))
    try:
        max_shorts = int(max_raw) if max_raw not in (None, "", "0") else None
    except (TypeError, ValueError):
        max_shorts = None
    planned = plan_shorts(total or 0, start=start, clip=clip, max_shorts=max_shorts) if total else []
    return jsonify(
        {
            "ok": True,
            "path": display_path(source),
            "name": source.name,
            "duration": total,
            "clip": clip,
            "short_count": len(planned),
        }
    )


@app.route("/api/clip/<job_id>/<int:index>")
def download_clip(job_id: str, index: int):
    job = get_job(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "Output not ready"}), 400
    clips = job.get("clips") or []
    match = next((item for item in clips if int(item.get("index", 0)) == index), None)
    if not match:
        return jsonify({"error": "Short not found"}), 404
    clip_path = Path(match["path"])
    if not clip_path.is_file():
        return jsonify({"error": "Short file missing"}), 404
    return send_file(clip_path, as_attachment=True, download_name=clip_path.name)


@app.route("/api/status/<job_id>")
def status(job_id: str):
    job = get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api/download/<job_id>")
def download(job_id: str):
    job = get_job(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "Output not ready"}), 400

    out = Path(job["final_path"])
    if not out.is_file():
        return jsonify({"error": "Output file missing"}), 404

    mime = "application/zip" if out.suffix.lower() == ".zip" else "video/mp4"
    return send_file(
        out,
        mimetype=mime,
        as_attachment=True,
        download_name=out.name,
        conditional=False,
    )


@app.route("/api/play/<job_id>/<kind>")
def play(job_id: str, kind: str):
    job = get_job(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "Output not ready"}), 400

    key_map = {
        "original": "original_path",
        "silencetrim": "silencetrim_path",
        "final": "final_path",
    }
    path_key = key_map.get(kind)
    if not path_key or path_key not in job or not job.get(path_key):
        return jsonify({"error": "Unknown video kind"}), 404

    video_path = Path(job[path_key])
    if not video_path.is_file():
        return jsonify({"error": "Video file missing"}), 404

    return send_file(video_path, mimetype="video/mp4")


def main() -> None:
    import sys

    print(f"Video pipeline UI: http://{HOST}:{PORT}/")
    print(f"Platform: {sys.platform}")
    print(f"Cartoon source: {display_path(DEFAULT_CARTOON)} ({'found' if DEFAULT_CARTOON.is_file() else 'MISSING'})")
    print(f"Output directory: {display_path(DEFAULT_OUTPUT_DIR)}")
    print("Large videos: paste local file path in the UI (recommended for 1GB+ / 4GB)")
    print("Options: silence remove · still-frame remove · cartoon · subtitles")
    print("Press Ctrl+C to stop.")
    app.run(host=HOST, port=PORT, threaded=True)


if __name__ == "__main__":
    main()
