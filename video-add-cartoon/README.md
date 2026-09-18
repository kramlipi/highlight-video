# Video Pipeline

Cross-platform video processing: **silence trim → cartoon overlay → subtitles**.

Works natively on **Windows** and **Linux** (no WSL required).

## Pipeline

In the browser UI, toggle any combination of steps before starting:

```
video → [silence remove?] → [still-frame remove?] → [cartoon?] → [subtitles?] → {name}_final.mp4
```

| Option (UI toggle) | What it does | Tool |
|------|------|------|
| Remove silence | Cut only when there is no voice / no audio | auto-editor `audio` |
| Remove still frames | Cut when the same picture stays for a long time | pHash frame dedup (OpenCV + ImageHash) |
| Talking cartoon | Oval chromakey face overlay | FFmpeg |
| Subtitles | Whisper transcription burned in | Whisper + FFmpeg |

Silence and still-frame remove are **separate** — turn on only what you need. At least one option must be on.

## Quick start

### Windows

```bat
setup.bat
RUN.bat
```

Opens http://127.0.0.1:8765/ — drop a video in the browser.

### Linux / macOS

```bash
chmod +x setup.sh run.sh RUN
./setup.sh
./RUN
```

## Requirements

- **Python 3.10+**
- **FFmpeg** + **ffprobe** on PATH
- **auto-editor** (installed via pip in setup — silence remove only)
- **opencv-python-headless**, **ImageHash**, **Pillow** (still-frame remove)
- **openai-whisper** (installed via pip in setup)

Setup installs Python deps into `.venv/`. First Whisper run downloads the model (~150 MB for `base`).

## Configuration (environment variables)

| Variable | Default |
|----------|---------|
| `VIDEO_PIPELINE_DATA_ROOT` | `D:/karm` (Windows) or `/mnt/d/karm` / `~/karm` |
| `VIDEO_PIPELINE_CARTOON` | `{DATA_ROOT}/video_tutorial/cartoon.mp4` |
| `VIDEO_PIPELINE_OUTPUT_DIR` | `{DATA_ROOT}/video_tutorial` |
| `VIDEO_TRANSCRIBER_DIR` | `{DATA_ROOT}/video_transcriber` |
| `WHISPER_MODEL` | `base` |
| `WHISPER_LANGUAGE` | `en` |

Paths accept Windows (`D:\foo`), Linux (`/home/foo`), or WSL (`/mnt/d/foo`) formats.

## CLI (without browser)

```bash
# Activate venv first
source .venv/bin/activate   # Linux
.venv\Scripts\activate        # Windows

python silence_trim.py input.mp4
python still_trim.py input.mp4
python overlay.py input_silencetrim.mp4 -o output_cartoon.mp4
python subtitle.py output_cartoon.mp4 -o final.mp4
```

## Files

| File | Purpose |
|------|---------|
| `server.py` | Flask API + 3-step pipeline |
| `index.html` | Drag-drop UI with comparison panel |
| `paths.py` | Cross-platform path resolution |
| `tools.py` | ffmpeg / auto-editor discovery |
| `silence_trim.py` | Silence remove (auto-editor) |
| `still_trim.py` | Still-frame remove (pHash perceptual hashing) |
| `overlay.py` | Cartoon chromakey oval |
| `subtitle.py` | Step 3 — Whisper + burn-in |
| `launch.py` | Start server + open browser |
| `RUN.bat` / `run.sh` / `RUN` | Platform launchers |
| `setup.bat` / `setup.sh` | Install deps |

## Output files

For input `myvideo.mp4`:

```
video_tutorial/myvideo_original.mp4
video_tutorial/myvideo_silencetrim.mp4
video_tutorial/myvideo.srt
video_tutorial/myvideo_final.mp4
```

## Troubleshooting

- **ffmpeg not found** — Install FFmpeg and add to PATH
- **auto-editor not found** — Re-run `setup.bat` or `setup.sh`
- **Whisper slow** — First run downloads model; use `WHISPER_MODEL=tiny` for faster tests
- **Cartoon missing** — Set `VIDEO_PIPELINE_CARTOON` to your cartoon MP4 path
