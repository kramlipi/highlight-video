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
  options?: CutOptions
}

export async function pingEngine(): Promise<EngineHealth | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/health`, {
      signal: AbortSignal.timeout(1800),
    })
    if (!res.ok) return null
    return (await res.json()) as EngineHealth
  } catch {
    return null
  }
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

export async function downloadEngineJob(jobId: string): Promise<Blob> {
  const res = await fetch(`${ENGINE_URL}/api/download/${jobId}`)
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || 'Download failed')
  }
  return res.blob()
}
