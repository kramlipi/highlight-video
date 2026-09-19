import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useProject } from '../context/ProjectContext'
import {
  engineClipUrl,
  engineJobUrl,
  pingEngine,
  pollEngineJob,
  probeLocalVideo,
  startVerticalJob,
  type EngineHealth,
  type EngineJob,
  type ShortClip,
} from '../lib/cartoonEngine'
import { downloadBlob, startDirectDownload } from '../lib/exportVideo'
import { drawVerticalFrame, exportBrowserShorts, planShorts, type VerticalMode } from '../lib/verticalFrame'
import { zipStoreFiles } from '../lib/zipStore'

const DEFAULT_PATH =
  'D:\\karm\\video_tutorial\\CALL-OF-DUTY-MODERN-WARFARE-THE-EMBASSY-CCTV-ESCAPE.mp4'

function onThisPc() {
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

const MODES: { id: VerticalMode; title: string; detail: string }[] = [
  {
    id: 'blur',
    title: 'Blur fill',
    detail: 'Keep the full landscape frame. Fill the 9:16 edges with a blur.',
  },
  {
    id: 'crop',
    title: 'Tight crop',
    detail: 'Cut a 9:16 slice. Slide focus left or right.',
  },
]

const CLIP_CHOICES = [15, 30, 45, 60]
const COUNT_CHOICES = [
  { id: 6, label: '6 shorts' },
  { id: 12, label: '12 shorts' },
  { id: 24, label: '24 shorts' },
  { id: 0, label: 'All' },
]

function formatClock(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function VerticalDesk() {
  const { setTool } = useProject()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const urlRef = useRef<string | null>(null)

  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [engineChecked, setEngineChecked] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [localPath, setLocalPath] = useState(() => (onThisPc() ? DEFAULT_PATH : ''))
  const [clipBlobs, setClipBlobs] = useState<Record<number, Blob>>({})
  const [mode, setMode] = useState<VerticalMode>('blur')
  const [focus, setFocus] = useState(0.5)
  const [start, setStart] = useState(0)
  const [clip, setClip] = useState(30)
  const [maxShorts, setMaxShorts] = useState(12)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('Input one long landscape video. We cut it into many 9:16 reels.')
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<EngineJob | null>(null)
  const [clips, setClips] = useState<ShortClip[]>([])
  const [probe, setProbe] = useState<{ duration: number | null; short_count: number; name: string } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    const check = () => {
      void pingEngine().then((info) => {
        if (cancelled) return
        setHealth(info)
        setEngineChecked(true)
      })
    }
    check()
    const timer = window.setInterval(check, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!health?.ok || !localPath.trim()) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void probeLocalVideo({
        localPath,
        clip,
        start,
        maxShorts: maxShorts || null,
      })
        .then((info) => {
          if (!cancelled) setProbe(info)
        })
        .catch(() => {
          if (!cancelled) setProbe(null)
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [health?.ok, localPath, clip, start, maxShorts])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (canvas && video && video.readyState >= 2) {
        const ctx = canvas.getContext('2d')
        if (ctx) drawVerticalFrame(ctx, video, mode, focus)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, focus, url])

  const setMain = (next: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = next ? URL.createObjectURL(next) : null
    setFile(next)
    setUrl(urlRef.current ?? '')
    setError('')
    if (next) {
      setLocalPath('')
      setMessage(`${next.name} ready. Preview is 9:16 — then make many shorts.`)
    }
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    const next = event.dataTransfer.files[0]
    if (next) setMain(next)
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    setMain(event.target.files?.[0] ?? null)
    event.target.value = ''
  }

  const estimated =
    probe?.short_count ||
    (videoRef.current?.duration
      ? planShorts(videoRef.current.duration, start, clip, maxShorts || 12).length
      : 0)

  const runBrowserShorts = async () => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video || !url) {
      throw new Error('Drop a video first. The cloud site cannot read a D:\\ path on your PC.')
    }
    const made = await exportBrowserShorts({
      canvas,
      video,
      clip: clip || 30,
      start,
      maxShorts: maxShorts || 12,
      onProgress: (value, label) => {
        setProgress(value)
        setMessage(label)
      },
    })
    const nextBlobs: Record<number, Blob> = {}
    const nextClips: ShortClip[] = made.map((item) => {
      nextBlobs[item.index] = item.blob
      return {
        index: item.index,
        name: item.name,
        start: item.start,
        duration: item.duration,
      }
    })
    const zip = await zipStoreFiles(made.map((item) => ({ name: item.name, blob: item.blob })))
    downloadBlob(zip, 'shotflow-shorts.zip')
    setClipBlobs(nextBlobs)
    setClips(nextClips)
    setMessage(`${made.length} × ${clip || 30}s shorts packed in a zip. Use Download under a reel if you want one file.`)
  }

  const runConvert = async () => {
    if (!localPath.trim() && !file) {
      setError('Drop a video, or paste a local path after starting RUN.bat.')
      return
    }
    setBusy(true)
    setError('')
    setJob(null)
    setClips([])
    setClipBlobs({})
    setJobId('')
    setProgress(0)
    setMessage('Cutting the long video into 9:16 reels…')
    try {
      const engineCutsShorts = Boolean(health?.ok && health.shorts)
      if (engineCutsShorts && (localPath.trim() || file)) {
        const started = await startVerticalJob({
          file,
          localPath,
          mode,
          focus,
          start,
          split: true,
          clip: clip || 30,
          maxShorts: maxShorts || null,
        })
        setJobId(started.job_id)
        const done = await pollEngineJob(started.job_id, (next) => {
          setJob(next)
          setProgress(typeof next.progress === 'number' ? Math.min(1, next.progress / 100) : 0)
          setMessage(next.message || next.step_label || 'Working…')
          if (next.clips?.length) setClips(next.clips)
        })
        setJob(done)
        const made = done.clips ?? []
        setClips(made)
        if (!made.length) {
          throw new Error('Engine returned one full video and no 30s clips. Restart RUN.bat, then make shorts again.')
        }
        startDirectDownload(engineJobUrl(started.job_id))
        const saved = done.final_path_display || done.final_path
        setMessage(
          saved
            ? `${made.length} × ${clip || 30}s shorts zipped. Also on this PC: ${saved}`
            : `${made.length} × ${clip || 30}s shorts packaged in a zip.`,
        )
        setProgress(1)
        return
      }
      await runBrowserShorts()
      setProgress(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shorts convert failed')
    } finally {
      setBusy(false)
    }
  }

  const saveClip = async (item: ShortClip) => {
    const local = clipBlobs[item.index]
    if (local) {
      downloadBlob(local, item.name)
      return
    }
    if (!jobId) return
    startDirectDownload(engineClipUrl(jobId, item.index))
  }

  const saveZip = () => {
    if (jobId) {
      startDirectDownload(engineJobUrl(jobId))
      return
    }
    const packed = clips
      .map((item) => {
        const blob = clipBlobs[item.index]
        return blob ? { name: item.name, blob } : null
      })
      .filter((item): item is { name: string; blob: Blob } => Boolean(item))
    if (!packed.length) return
    void zipStoreFiles(packed).then((zip) => downloadBlob(zip, 'shotflow-shorts.zip'))
  }

  const engineOn = Boolean(health?.ok)

  return (
    <section className="desk vertical-desk">
      <header className="desk-head">
        <p className="eyebrow">Picture · Shorts factory</p>
        <h2>Input one video. Make many reels.</h2>
        <p>
          Drop a landscape file to cut shorts here. A D:\ path only works when RUN.bat is running on this
          PC.
        </p>
      </header>

      <div className={`engine-chip ${engineOn ? 'on' : engineChecked ? 'off' : ''}`}>
        <span className="engine-dot" />
        {engineOn && health?.shorts
          ? 'Local FFmpeg ready — long files stay on this PC, cut into 30s shorts'
          : engineChecked
            ? onThisPc()
              ? 'Drop a video to cut 30s shorts here, or restart video-add-cartoon/RUN.bat for 1 GB+ paths.'
              : 'Cloud site: drop a video to cut 30s shorts in this browser. Huge local files need http://127.0.0.1:8765/ after RUN.bat.'
            : 'Checking local engine…'}
      </div>

      <label className="drop-card drop-card-hero" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <strong>Input video</strong>
        <span>
          {file
            ? file.name
            : localPath
              ? localPath.split(/[/\\]/).pop()
              : 'Drop MP4 / MOV, or click to pick'}
        </span>
        <input type="file" accept="video/*" onChange={onPick} />
      </label>

      <label className="field">
        Local file path (best for long / 1 GB+ videos)
        <input
          className="text-input"
          value={localPath}
          onChange={(event) => {
            setLocalPath(event.target.value)
            if (event.target.value.trim()) setFile(null)
          }}
          placeholder="D:\karm\video_tutorial\take.mp4"
          spellCheck={false}
        />
      </label>

      {probe?.duration ? (
        <p className="hint">
          {probe.name} · {formatClock(probe.duration)} long · this setup makes{' '}
          <strong>{probe.short_count}</strong> shorts
        </p>
      ) : estimated > 0 ? (
        <p className="hint">This setup makes about {estimated} shorts.</p>
      ) : null}

      <div className="step-picker" role="group" aria-label="Reframe style">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={mode === item.id ? 'pick-card on' : 'pick-card'}
            aria-pressed={mode === item.id}
            onClick={() => setMode(item.id)}
          >
            <span className="pick-check">{mode === item.id ? 'On' : 'Off'}</span>
            <strong>{item.title}</strong>
            <em>{item.detail}</em>
          </button>
        ))}
      </div>

      <div className="look-block">
        <p className="look-kicker">Each short</p>
        <div className="font-chips">
          {CLIP_CHOICES.map((seconds) => (
            <button
              key={seconds}
              type="button"
              className={clip === seconds ? 'font-chip on' : 'font-chip'}
              onClick={() => setClip(seconds)}
            >
              {seconds}s
            </button>
          ))}
        </div>
      </div>

      <div className="look-block">
        <p className="look-kicker">How many</p>
        <div className="font-chips">
          {COUNT_CHOICES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={maxShorts === item.id ? 'font-chip on' : 'font-chip'}
              onClick={() => setMaxShorts(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        Start from (seconds)
        <input
          className="text-input"
          type="number"
          min={0}
          step={1}
          value={start}
          onChange={(event) => setStart(Number(event.target.value) || 0)}
        />
      </label>

      {mode === 'crop' ? (
        <label className="field">
          Focus · {focus < 0.33 ? 'left' : focus > 0.67 ? 'right' : 'center'}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={focus}
            onChange={(event) => setFocus(Number(event.target.value))}
          />
        </label>
      ) : null}

      <div className="vertical-preview">
        <canvas ref={canvasRef} className="vertical-canvas" hidden={!url} aria-label="9:16 preview" />
        {url ? null : (
          <p className="preview-placeholder">
            Drop a clip to preview 9:16. A local path still converts — preview is optional.
          </p>
        )}
        <video
          ref={videoRef}
          src={url || undefined}
          className={url ? 'cartoon-scrubber' : 'visually-hidden-video'}
          playsInline
          controls
        />
      </div>

      {job ? (
        <p className="hint">
          {job.step_label ?? job.status}
          {job.step_total ? ` · ${job.step ?? 0}/${job.step_total}` : ''}
        </p>
      ) : null}
      <div className="progress-track" hidden={!busy && progress === 0}>
        <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <p className="hint">{message}</p>
      {error ? <p className="cut-error">{error}</p> : null}

      <div className="panel-actions cartoon-actions">
        <button type="button" className="export-btn" disabled={busy} onClick={() => void runConvert()}>
          {busy ? 'Making shorts…' : `Make ${probe?.short_count || estimated || 'many'} shorts`}
        </button>
        <button type="button" className="ghost-btn" onClick={() => setTool('captions')}>
          Next: Captions
        </button>
      </div>

      {clips.length > 0 ? (
        <div className="shorts-list">
          <p className="look-kicker">Made {clips.length} reels</p>
          {job?.final_path_display || job?.final_path ? (
            <p className="hint">
              Zip on this PC: <code>{job.final_path_display || job.final_path}</code>
            </p>
          ) : null}
          <div className="panel-actions">
            <button type="button" className="ghost-btn" onClick={saveZip}>
              Download zip
            </button>
          </div>
          <ol>
            {clips.map((item) => (
              <li key={item.index}>
                <strong>{item.name}</strong>
                <span>
                  {formatClock(item.start)} → {formatClock(item.start + item.duration)}
                </span>
                <button type="button" className="ghost-btn" onClick={() => void saveClip(item)}>
                  Download
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
