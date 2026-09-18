#!/usr/bin/env python3
"""Local HTTP server for the cartoon video overlay tool."""

from __future__ import annotations

import cgi
import json
import mimetypes
import shutil
import threading
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from overlay_video import DEFAULT_CARTOON, overlay_video

ROOT = Path(__file__).resolve().parent
WORK = ROOT / "work"
WORK.mkdir(exist_ok=True)

jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def set_job(job_id: str, **fields) -> None:
    with jobs_lock:
        jobs.setdefault(job_id, {})
        jobs[job_id].update(fields)


def get_job(job_id: str) -> dict | None:
    with jobs_lock:
        return jobs.get(job_id, {}).copy() if job_id in jobs else None


def run_job(job_id: str, input_path: Path, output_path: Path) -> None:
    def on_progress(pct: float, message: str) -> None:
        set_job(job_id, status="processing", progress=round(pct, 1), message=message)

    try:
        set_job(job_id, status="processing", progress=0, message="Starting FFmpeg…")
        overlay_video(input_path, output_path, DEFAULT_CARTOON, progress_callback=on_progress)
        set_job(
            job_id,
            status="done",
            progress=100,
            message="Complete",
            output_name=output_path.name,
            output_path=str(output_path),
        )
    except Exception as exc:
        set_job(job_id, status="error", progress=0, message=str(exc))


class Handler(BaseHTTPRequestHandler):
    server_version = "VideoOverlayTool/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.address_string()}] {fmt % args}")

    def _send_json(self, payload: dict, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path) -> None:
        if not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        ctype, _ = mimetypes.guess_type(str(path))
        ctype = ctype or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if path.suffix.lower() in {".mp4", ".webm", ".mov"}:
            self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
            return self._send_file(ROOT / "index.html")

        if path.startswith("/api/status/"):
            job_id = path.split("/")[-1]
            job = get_job(job_id)
            if not job:
                return self._send_json({"error": "Job not found"}, HTTPStatus.NOT_FOUND)
            return self._send_json(job)

        if path.startswith("/api/download/"):
            job_id = path.split("/")[-1]
            job = get_job(job_id)
            if not job or job.get("status") != "done":
                return self._send_json({"error": "Output not ready"}, HTTPStatus.BAD_REQUEST)
            out = Path(job["output_path"])
            return self._send_file(out)

        if path == "/api/health":
            cartoon_ok = DEFAULT_CARTOON.is_file()
            return self._send_json(
                {
                    "ok": True,
                    "cartoon_path": str(DEFAULT_CARTOON),
                    "cartoon_exists": cartoon_ok,
                }
            )

        # Static assets from tool folder
        candidate = (ROOT / path.lstrip("/")).resolve()
        if candidate.is_file() and ROOT in candidate.parents:
            return self._send_file(candidate)

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/process":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return self._send_json({"error": "Expected multipart/form-data"}, HTTPStatus.BAD_REQUEST)

        length = int(self.headers.get("Content-Length", "0"))
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": ctype,
                "CONTENT_LENGTH": str(length),
            },
        )

        if "video" not in form:
            return self._send_json({"error": "Missing 'video' file field"}, HTTPStatus.BAD_REQUEST)

        upload = form["video"]
        if not getattr(upload, "file", None) or not upload.filename:
            return self._send_json({"error": "No file uploaded"}, HTTPStatus.BAD_REQUEST)

        job_id = uuid.uuid4().hex
        job_dir = WORK / job_id
        job_dir.mkdir(parents=True)

        suffix = Path(upload.filename).suffix or ".mp4"
        input_path = job_dir / f"input{suffix}"
        output_path = job_dir / f"output{suffix}"

        with input_path.open("wb") as out:
            shutil.copyfileobj(upload.file, out)

        set_job(
            job_id,
            status="queued",
            progress=0,
            message="Queued",
            input_name=upload.filename,
        )

        thread = threading.Thread(
            target=run_job,
            args=(job_id, input_path, output_path),
            daemon=True,
        )
        thread.start()

        return self._send_json({"job_id": job_id, "input_name": upload.filename})


def main() -> None:
    host, port = "127.0.0.1", 8765
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Cartoon overlay tool: http://{host}:{port}/")
    print(f"Cartoon source: {DEFAULT_CARTOON} ({'found' if DEFAULT_CARTOON.is_file() else 'MISSING'})")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
