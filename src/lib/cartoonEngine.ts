import type { CutOptions } from './project'

export const ENGINE_URL = 'http://127.0.0.1:8765'

export type EngineHealth = {
  ok: boolean
  ffmpeg: boolean
  whisper_available: boolean
  still_trim_available: boolean
  cartoon_exists: boolean
  cartoon_path?: string
  output_dir?: string
  shorts?: boolean
}

export type ShortClip = {
  index: number
  name: string
  path?: string
  start: number
  duration: number
}

export type EngineJob = {
  status: string
  step?: number
  step_total?: number
  step_label?: string
  progress?: number
  message?: string
  error?: string
  input_name?: string
  output_name?: string
  final_path?: string
  final_path_display?: string
  options?: CutOptions | Record<string, unknown>
  clips?: ShortClip[]
}

export async function pingEngine(): Promise<EngineHealth | null> {
  for (const base of [ENGINE_URL, 'http://localhost:8765']) {
    try {
      const res = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(2500),
      })
      if (!res.ok) continue
      return (await res.json()) as EngineHealth
    } catch {
      /* try the next local URL */
    }
  }
  return null
}

export async function startEngineJob(opts: {
  file?: File | null
  localPath?: string
  cut: CutOptions
}): Promise<{ job_id: string }> {
  const form = new FormData()
  form.set('silence', String(opts.cut.silence))
  form.set('still', String(opts.cut.still))
  form.set('cartoon', String(opts.cut.cartoon))
  form.set('subtitles', String(opts.cut.subtitles))
  const localPath = opts.localPath?.trim()
  if (localPath) form.set('local_path', localPath)
  else if (opts.file) form.set('video', opts.file)
  else throw new Error('Drop a video or paste a local file path.')

  const res = await fetch(`${ENGINE_URL}/api/process`, { method: 'POST', body: form })
  const data = (await res.json()) as { job_id?: string; error?: string }
  if (!res.ok || !data.job_id) throw new Error(data.error || 'Could not start the local cut.')
  return { job_id: data.job_id }
}

export async function pollEngineJob(
  jobId: string,
  onTick: (job: EngineJob) => void,
): Promise<EngineJob> {
  for (;;) {
    const res = await fetch(`${ENGINE_URL}/api/status/${jobId}`)
    const job = (await res.json()) as EngineJob
    onTick(job)
    if (job.status === 'done') return job
    if (job.status === 'error' || job.error) throw new Error(job.error || job.message || 'Cut failed')
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
}

export async function startVerticalJob(opts: {
  file?: File | null
  localPath?: string
  mode: 'blur' | 'crop'
  focus: number
  start: number
  duration?: number | null
  split?: boolean
  clip?: number
  maxShorts?: number | null
}): Promise<{ job_id: string }> {
  const form = new FormData()
  const clip = opts.clip && opts.clip > 0 ? opts.clip : 30
  form.set('mode', opts.mode)
  form.set('focus', String(opts.focus))
  form.set('start', String(opts.start || 0))
  form.set('split', 'true')
  form.set('shorts', 'true')
  form.set('clip', String(clip))
  if (opts.duration && opts.duration > 0) form.set('duration', String(opts.duration))
  if (opts.maxShorts && opts.maxShorts > 0) form.set('max_shorts', String(opts.maxShorts))
  const localPath = opts.localPath?.trim()
  if (localPath) form.set('local_path', localPath)
  else if (opts.file) form.set('video', opts.file)
  else throw new Error('Drop a video or paste a local file path.')

  const res = await fetch(`${ENGINE_URL}/api/vertical`, { method: 'POST', body: form })
  const data = (await res.json()) as { job_id?: string; error?: string }
  if (!res.ok || !data.job_id) throw new Error(data.error || 'Could not start the 9:16 convert.')
  return { job_id: data.job_id }
}

export async function probeLocalVideo(opts: {
  localPath: string
  clip: number
  start?: number
  maxShorts?: number | null
}): Promise<{ duration: number | null; short_count: number; name: string }> {
  const form = new FormData()
  form.set('local_path', opts.localPath)
  form.set('clip', String(opts.clip))
  form.set('start', String(opts.start || 0))
  if (opts.maxShorts && opts.maxShorts > 0) form.set('max_shorts', String(opts.maxShorts))
  const res = await fetch(`${ENGINE_URL}/api/probe`, { method: 'POST', body: form })
  const data = (await res.json()) as {
    duration?: number
    short_count?: number
    name?: string
    error?: string
  }
  if (!res.ok) throw new Error(data.error || 'Could not read that video.')
  return {
    duration: data.duration ?? null,
    short_count: data.short_count ?? 0,
    name: data.name || 'video',
  }
}

export function engineJobUrl(jobId: string) {
  return `${ENGINE_URL}/api/download/${jobId}`
}

export function engineClipUrl(jobId: string, index: number) {
  return `${ENGINE_URL}/api/clip/${jobId}/${index}`
}

export async function downloadEngineJob(jobId: string): Promise<Blob> {
  const res = await fetch(engineJobUrl(jobId))
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || 'Download failed')
  }
  const blob = await res.blob()
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new Error('The zip coming from the local engine was not a zip. Try Download zip again.')
  }
  return blob
}

export async function downloadEngineClip(jobId: string, index: number): Promise<Blob> {
  const res = await fetch(engineClipUrl(jobId, index))
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || 'Download failed')
  }
  return res.blob()
}
