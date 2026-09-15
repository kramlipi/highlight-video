# Shotflow

Free **YouTube creation suite** in the browser. One workflow: script → highlighter B-roll → karaoke captions → titles → thumbnail → publish pack.

**Live:** [https://highlight-video.cluevion.workers.dev](https://highlight-video.cluevion.workers.dev)

## Menus

1. **Board** — checklist from idea to upload
2. **Script** — Markdown episode (bold = highlighter)
3. **Highlight** — article video, newspaper/parchment themes, MP4 export
4. **Captions** — paste/upload SRT, EN/HI, live speech, karaoke chunking from `second-pass-srt.py`
5. **Titles** — YouTube title formulas
6. **Thumb** — 1280×720 PNG
7. **Publish** — description, chapters, tags, pinned comment

GPU Whisper (`video_transcriber/transcribe.py`) still runs on your machine. Shotflow takes the SRT or transcript and finishes the upload kit in the browser.

## Start locally

```powershell
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deploy

```powershell
npm run deploy
```
