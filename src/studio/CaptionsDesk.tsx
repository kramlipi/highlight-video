import { useEffect, useMemo, useRef, useState } from 'react'
import { useProject } from '../context/ProjectContext'
import { downloadBlob } from '../lib/exportVideo'
import {
  activeCue,
  chunkSrt,
  parseSrt,
  stringifySrt,
  transcriptToSrt,
} from '../lib/srt'
import type { CaptionLang } from '../lib/project'

type SpeechRec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: (() => void) | null
}

function getSpeech(lang: CaptionLang): SpeechRec | null {
  const Ctor = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = lang === 'hi' ? 'hi-IN' : 'en-US'
  rec.continuous = true
  rec.interimResults = true
  return rec
}

export function CaptionsDesk() {
  const { project, patch } = useProject()
  const [listening, setListening] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const recRef = useRef<SpeechRec | null>(null)
  const cues = useMemo(
    () => parseSrt(project.chunkedSrt || project.srt),
    [project.chunkedSrt, project.srt],
  )
  const duration = cues[cues.length - 1]?.end || 1
  const current = activeCue(cues, playhead)

  useEffect(() => {
    if (cues.length === 0) return
    const id = window.setInterval(() => {
      setPlayhead((value) => (value + 0.25) % duration)
    }, 250)
    return () => window.clearInterval(id)
  }, [cues.length, duration])

  const fromTranscript = () => {
    const srt = stringifySrt(transcriptToSrt(project.transcript || project.markdown.replace(/[#*_]/g, '')))
    patch({ srt, chunkedSrt: stringifySrt(chunkSrt(parseSrt(srt))) })
  }

  const fromUpload = async (file: File) => {
    const text = await file.text()
    if (file.name.endsWith('.srt') || text.includes('-->')) {
      patch({ srt: text, chunkedSrt: stringifySrt(chunkSrt(parseSrt(text))) })
      return
    }
    patch({ transcript: text })
  }

  const toggleListen = () => {
    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }
    const rec = getSpeech(project.captionLang)
    if (!rec) {
      patch({ transcript: project.transcript || 'Live speech is not available in this browser. Paste a transcript or upload an SRT.' })
      return
    }
    rec.onresult = (event) => {
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i]
        if (piece.isFinal) finalText += `${piece[0]?.transcript ?? ''} `
      }
      if (finalText) {
        patch({ transcript: `${project.transcript} ${finalText}`.trim() })
      }
    }
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  return (
    <section className="desk captions-desk">
      <header className="desk-head">
        <h2>Captions</h2>
        <p>
          Same karaoke split as <code>second-pass-srt.py</code>: 1–2 words, 0.5s per word. Whisper stays on your GPU
          machine; here you paste, upload, or speak.
        </p>
      </header>
      <div className="caption-toolbar">
        <label className="file-btn">
          Upload SRT / txt
          <input
            type="file"
            accept=".srt,.vtt,.txt"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) await fromUpload(file)
              event.target.value = ''
            }}
          />
        </label>
        <div className="segmented">
          <button
            type="button"
            className={project.captionLang === 'en' ? 'on' : ''}
            onClick={() => patch({ captionLang: 'en' })}
          >
            EN
          </button>
          <button
            type="button"
            className={project.captionLang === 'hi' ? 'on' : ''}
            onClick={() => patch({ captionLang: 'hi' })}
          >
            HI
          </button>
        </div>
        <button type="button" className="ghost-btn" onClick={toggleListen}>
          {listening ? 'Stop mic' : 'Live speech'}
        </button>
        <button type="button" className="ghost-btn" onClick={fromTranscript}>
          Transcript → SRT
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() =>
            patch({ chunkedSrt: stringifySrt(chunkSrt(parseSrt(project.srt || stringifySrt(transcriptToSrt(project.transcript))))) })
          }
        >
          Karaoke chunk
        </button>
        <button
          type="button"
          className="export-btn"
          onClick={() =>
            downloadBlob(
              new Blob([project.chunkedSrt || project.srt], { type: 'text/plain' }),
              'captions.srt',
            )
          }
        >
          Download SRT
        </button>
      </div>
      <div className="caption-split">
        <label className="field grow">
          <span>Transcript / notes</span>
          <textarea
            className="md-input"
            value={project.transcript}
            onChange={(event) => patch({ transcript: event.target.value })}
          />
        </label>
        <label className="field grow">
          <span>Karaoke SRT</span>
          <textarea
            className="md-input"
            value={project.chunkedSrt || project.srt}
            onChange={(event) => patch({ chunkedSrt: event.target.value })}
          />
        </label>
      </div>
      <div className="caption-preview" aria-live="polite">
        <p className="caption-time">
          {playhead.toFixed(1)}s / {duration.toFixed(1)}s
        </p>
        <p className="caption-line">{current?.text || 'Captions will pulse here'}</p>
      </div>
    </section>
  )
}
