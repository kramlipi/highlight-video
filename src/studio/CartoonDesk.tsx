import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useProject } from '../context/ProjectContext'
import {
  downloadEngineJob,
  pingEngine,
  pollEngineJob,
  startEngineJob,
  type EngineHealth,
  type EngineJob,
} from '../lib/cartoonEngine'
import { drawCartoonOverlay, exportOverlayVideo } from '../lib/cartoonOverlay'
import { downloadBlob } from '../lib/exportVideo'
import type { CutOptions } from '../lib/project'

const STEPS: { id: keyof CutOptions; title: string; detail: string }[] = [
  {
    id: 'silence',
    title: 'Cut silence',
    detail: 'Drop dead air so the talking-head clip moves. Needs the local engine.',
  },
  {
    id: 'still',
    title: 'Cut still frames',
    detail: 'Trim frozen screen recordings. Needs the local engine.',
  },
  {
    id: 'cartoon',
    title: 'Talking face',
    detail: 'Green-screen oval, bottom-right. Preview and export here, or run FFmpeg locally.',
  },
  {
    id: 'subtitles',
    title: 'Burn subtitles',
    detail: 'Whisper on your GPU, then burn-in. Needs the local engine.',
  },
]

function anyStepOn(cut: CutOptions) {
  return cut.silence || cut.still || cut.cartoon || cut.subtitles
}

export function CartoonDesk() {
  const { project, patch, setTool } = useProject()
  const cut = project.cut
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  const mainRef = useRef<HTMLVideoElement>(null)
  const cartoonRef = useRef<HTMLVideoElement>(null)
  const mainUrlRef = useRef<string | null>(null)
  const cartoonUrlRef = useRef<string | null>(null)

  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [engineChecked, setEngineChecked] = useState(false)
  const [mainFile, setMainFile] = useState<File | null>(null)
  const [mainUrl, setMainUrl] = useState('')
  const [cartoonUrl, setCartoonUrl] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('Choose the steps you want, then drop a video.')
  const [error, setError] = useState('')
  const [job, setJob] = useState<EngineJob | null>(null)

  useEffect(() => {
    scratchRef.current = document.createElement('canvas')
    void pingEngine().then((info) => {
      setHealth(info)
      setEngineChecked(true)
    })
    return () => {
      if (mainUrlRef.current) URL.revokeObjectURL(mainUrlRef.current)
      if (cartoonUrlRef.current) URL.revokeObjectURL(cartoonUrlRef.current)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const canvas = canvasRef.current
      const main = mainRef.current
      const scratch = scratchRef.current
      if (canvas && main && scratch && main.readyState >= 2 && main.videoWidth) {
        if (canvas.width !== main.videoWidth || canvas.height !== main.videoHeight) {
          canvas.width = main.videoWidth
          canvas.height = main.videoHeight
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          drawCartoonOverlay(ctx, main, cut.cartoon ? cartoonRef.current : null, scratch)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cut.cartoon, mainUrl, cartoonUrl])

  const setMain = (file: File | null) => {
    if (mainUrlRef.current) URL.revokeObjectURL(mainUrlRef.current)
    mainUrlRef.current = file ? URL.createObjectURL(file) : null
    setMainFile(file)
    setMainUrl(mainUrlRef.current ?? '')
    setError('')
    if (file) setMessage(`${file.name} ready. Preview plays in this tab.`)
  }

  const setCartoon = (file: File | null) => {
    if (cartoonUrlRef.current) URL.revokeObjectURL(cartoonUrlRef.current)
    cartoonUrlRef.current = file ? URL.createObjectURL(file) : null
    setCartoonUrl(cartoonUrlRef.current ?? '')
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>, kind: 'main' | 'cartoon') => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    if (kind === 'main') setMain(file)
    else setCartoon(file)
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>, kind: 'main' | 'cartoon') => {
    const file = event.target.files?.[0] ?? null
    if (kind === 'main') setMain(file)
    else setCartoon(file)
    event.target.value = ''
  }

  const toggle = (id: keyof CutOptions) => {
    patch({ cut: { ...cut, [id]: !cut[id] } })
  }

  const syncCartoon = () => {
    const main = mainRef.current
    const face = cartoonRef.current
    if (!main || !face || !face.duration) return
    const next = main.currentTime % face.duration
    if (Math.abs(face.currentTime - next) > 0.2) face.currentTime = next
    if (main.paused) void face.pause()
    else if (face.paused) void face.play().catch(() => undefined)
  }

  const runBrowserOverlay = async () => {
    const canvas = canvasRef.current
    const main = mainRef.current
    if (!canvas || !main || !mainUrl) {
      setError('Drop a main video first.')
      return
    }
    if (!cut.cartoon) {
      setError('Turn on Talking face to export the browser overlay.')
      return
    }
    setBusy(true)
    setError('')
    setProgress(0)
    setMessage('Recording the oval overlay in the browser…')
    try {
      const blob = await exportOverlayVideo(canvas, main, setProgress)
      downloadBlob(blob, 'shotflow-cartoon-overlay.webm')
      setMessage('Overlay saved. Silence, stills, and Whisper still need the local engine.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Overlay export failed')
    } finally {
      setBusy(false)
    }
  }

  const runLocalEngine = async () => {
    if (!anyStepOn(cut)) {
      setError('Turn on at least one step.')
      return
    }
    if (!health?.ok) {
      setError('Local engine is off. On this computer run video-add-cartoon/RUN.bat, then retry.')
      return
    }
    if (!localPath.trim() && !mainFile) {
      setError('Drop a video or paste a local file path for large clips.')
      return
    }
    setBusy(true)
    setError('')
    setJob(null)
    setProgress(0)
    setMessage('Sending to the local FFmpeg engine…')
    try {
      const started = await startEngineJob({ file: mainFile, localPath, cut })
      const done = await pollEngineJob(started.job_id, (next) => {
        setJob(next)
        setProgress(typeof next.progress === 'number' ? Math.min(1, next.progress / 100) : 0)
        setMessage(next.message || next.step_label || 'Working…')
      })
      setJob(done)
      const blob = await downloadEngineJob(started.job_id)
      downloadBlob(blob, 'shotflow-cartoon-final.mp4')
      setMessage('Local cut finished and downloaded.')
      setProgress(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Local cut failed')
    } finally {
      setBusy(false)
    }
  }

  const engineOn = Boolean(health?.ok)

  return (
    <section className="desk cartoon-desk">
      <header className="desk-head">
        <p className="eyebrow">Picture · talking-head</p>
        <h2>Cartoon cut</h2>
        <p>Choose only the steps you want. Nothing runs until you drop a video.</p>
      </header>

      <div className={`engine-chip ${engineOn ? 'on' : engineChecked ? 'off' : ''}`}>
        <span className="engine-dot" />
        {engineOn
          ? `Local engine ready${health?.ffmpeg ? ' · FFmpeg' : ''}${health?.whisper_available ? ' · Whisper' : ''}`
          : engineChecked
            ? 'Browser overlay is ready. Silence / stills / Whisper need RUN.bat on this PC.'
            : 'Checking local engine…'}
      </div>

      <div className="step-picker" role="group" aria-label="Cut steps">
        {STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            className={cut[step.id] ? 'pick-card on' : 'pick-card'}
            aria-pressed={cut[step.id]}
            onClick={() => toggle(step.id)}
          >
            <span className="pick-check">{cut[step.id] ? 'On' : 'Off'}</span>
            <strong>{step.title}</strong>
            <em>{step.detail}</em>
          </button>
        ))}
      </div>

      <div className="cartoon-grid">
        <label
          className="drop-card"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => onDrop(event, 'main')}
        >
          <strong>Main video</strong>
          <span>{mainFile ? mainFile.name : 'Drop MP4 / MOV, or click to pick'}</span>
          <input type="file" accept="video/*" onChange={(event) => onPick(event, 'main')} />
        </label>
        <label
          className={cut.cartoon ? 'drop-card' : 'drop-card dim'}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => onDrop(event, 'cartoon')}
        >
          <strong>Green-screen face</strong>
          <span>
            {cut.cartoon
              ? cartoonUrl
                ? 'Custom overlay loaded'
                : 'Optional — drop a chroma-key clip, or use the local default'
              : 'Turn on Talking face to use this'}
          </span>
          <input
            type="file"
            accept="video/*"
            disabled={!cut.cartoon}
            onChange={(event) => onPick(event, 'cartoon')}
          />
        </label>
      </div>

      <label className="field">
        Local file path (best for 1 GB+)
        <input
          className="text-input"
          value={localPath}
          onChange={(event) => setLocalPath(event.target.value)}
          placeholder="C:\Videos\take-01.mp4"
          spellCheck={false}
        />
      </label>

      <div className="cartoon-preview">
        <canvas
          ref={canvasRef}
          className="cartoon-canvas"
          hidden={!mainUrl}
          aria-label="Overlay preview"
        />
        {mainUrl ? null : (
          <p className="preview-placeholder">Preview appears here after you drop a main video.</p>
        )}
        <video
          ref={mainRef}
          src={mainUrl || undefined}
          className={mainUrl ? 'cartoon-scrubber' : 'visually-hidden-video'}
          playsInline
          controls
          onTimeUpdate={syncCartoon}
          onPlay={syncCartoon}
          onPause={() => cartoonRef.current?.pause()}
        />
        <video
          ref={cartoonRef}
          src={cartoonUrl || undefined}
          className="visually-hidden-video"
          playsInline
          muted
          loop
        />
      </div>

      {job ? (
        <p className="hint">
          {job.step_label ?? job.status}
          {job.step_total ? ` · step ${job.step ?? 0}/${job.step_total}` : ''}
        </p>
      ) : null}

      <div className="progress-track" hidden={!busy && progress === 0}>
        <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <p className="hint">{message}</p>
      {error ? <p className="cut-error">{error}</p> : null}

      <div className="panel-actions cartoon-actions">
        <button type="button" className="ghost-btn" disabled={busy || !mainUrl} onClick={() => void runBrowserOverlay()}>
          Export overlay in browser
        </button>
        <button type="button" className="export-btn" disabled={busy} onClick={() => void runLocalEngine()}>
          {busy ? 'Working…' : 'Run selected steps locally'}
        </button>
        <button type="button" className="ghost-btn" onClick={() => setTool('captions')}>
          Next: Captions
        </button>
      </div>
    </section>
  )
}
