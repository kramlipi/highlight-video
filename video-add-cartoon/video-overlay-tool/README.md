# Cartoon Face Video Overlay Tool

Adds a looping cartoon face from `d:\karm\video_tutorial\cartoon.mp4` as an **oval overlay** on any input video.

## Overlay settings

| Setting | Value |
|---------|-------|
| Size | 15% of input video **width** (height scaled to preserve cartoon aspect ratio) |
| Shape | Elliptical alpha mask |
| Position | Bottom-right corner |
| Padding | 2.5% of input width from edges |

## Requirements

- **Python 3.10+**
- **FFmpeg** and **ffprobe** on `PATH`

## Quick start (web UI)

```powershell
cd d:\karm\vibe-code\cool-code\video-overlay-tool
python server.py
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/), drag-and-drop a video, wait for processing, then download the result.

Processed files are stored in `work/<job-id>/output.*` until the server is stopped.

## CLI (no browser)

```powershell
python overlay_video.py "D:\path\to\input.mp4"
```

Optional flags:

```powershell
python overlay_video.py input.mp4 -o output.mp4
python overlay_video.py input.mp4 --cartoon "D:\karm\video_tutorial\cartoon.mp4"
```

Default output name: `<input>_cartoon_overlay.<ext>` next to the input file.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Drag-and-drop UI with progress and download |
| `server.py` | Local HTTP server (stdlib only, no pip install) |
| `overlay_video.py` | FFmpeg processing logic (CLI + library) |
| `work/` | Temporary upload/output storage (created at runtime) |

## How it works

1. Probes input and cartoon dimensions with `ffprobe`.
2. Scales cartoon to 15% of main video width.
3. Applies an elliptical alpha mask via FFmpeg `geq`.
4. Loops cartoon (`-stream_loop -1`) if shorter than the main video.
5. Overlays at bottom-right and encodes with `libx264`; copies audio from input.

## Limitations

- Requires FFmpeg installed locally; not browser-only processing.
- Re-encodes video (lossy); audio is copied when present.
- Very long or very large files may take several minutes.
- Cartoon path is fixed to `d:\karm\video_tutorial\cartoon.mp4` by default (override with `--cartoon` in CLI).
- Web UI must be used via `server.py` (opening `index.html` directly will not work for uploads).
