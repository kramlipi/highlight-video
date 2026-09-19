export type VerticalMode = 'blur' | 'crop'

export function drawVerticalFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  mode: VerticalMode,
  focus: number,
) {
  const width = 1080
  const height = 1920
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width
    ctx.canvas.height = height
  }
  if (video.readyState < 2 || !video.videoWidth) return

  const vw = video.videoWidth
  const vh = video.videoHeight
  const clamped = Math.min(1, Math.max(0, focus))

  if (mode === 'crop') {
    const target = width / height
    const src = vw / vh
    let sx = 0
    let sy = 0
    let sw = vw
    let sh = vh
    if (src > target) {
      sw = vh * target
      sx = (vw - sw) * clamped
    } else {
      sh = vw / target
      sy = (vh - sh) * 0.5
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
    return
  }

  ctx.filter = 'blur(28px)'
  const cover = Math.max(width / vw, height / vh)
  const cw = vw * cover
  const ch = vh * cover
  ctx.drawImage(video, (width - cw) / 2, (height - ch) / 2, cw, ch)
  ctx.filter = 'none'
  const fit = Math.min(width / vw, height / vh)
  const fw = vw * fit
  const fh = vh * fit
  ctx.drawImage(video, (width - fw) / 2, (height - fh) / 2, fw, fh)
}

export function planShorts(total: number, start: number, clip: number, maxShorts: number) {
  const planned: { index: number; start: number; duration: number }[] = []
  let cursor = Math.max(0, start)
  let index = 1
  const limit = maxShorts > 0 ? maxShorts : 999
  while (cursor < total - 1.5 && index <= limit) {
    const duration = Math.min(clip, total - cursor)
    if (duration < 3) break
    planned.push({ index, start: cursor, duration })
    cursor += clip
    index += 1
  }
  return planned
}

function waitSeek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      video.removeEventListener('seeked', finish)
      resolve()
    }
    video.addEventListener('seeked', finish)
    video.currentTime = Math.min(time, Math.max(0, (video.duration || time) - 0.05))
  })
}

async function recordClip(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  seconds: number,
  onProgress?: (value: number) => void,
): Promise<Blob> {
  await video.play()
  const stream = canvas.captureStream(30)
  const capture = (
    video as HTMLVideoElement & { captureStream?: () => MediaStream }
  ).captureStream?.()
  capture?.getAudioTracks().forEach((track) => stream.addTrack(track))
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data)
  }
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Recording failed'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
  })
  recorder.start(200)
  const beganMedia = video.currentTime
  const beganWall = performance.now()
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = Math.max(video.currentTime - beganMedia, (performance.now() - beganWall) / 1000)
      onProgress?.(Math.min(0.99, elapsed / seconds))
      if (video.ended || elapsed >= seconds - 0.05) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
  video.pause()
  recorder.stop()
  stream.getTracks().forEach((track) => track.stop())
  return done
}

export async function exportBrowserShorts(opts: {
  canvas: HTMLCanvasElement
  video: HTMLVideoElement
  clip: number
  start: number
  maxShorts: number
  onProgress?: (value: number, label: string) => void
}): Promise<{ index: number; start: number; duration: number; name: string; blob: Blob }[]> {
  const total = opts.video.duration || 0
  if (!total) throw new Error('Could not read that video yet. Drop it again, then retry.')
  const planned = planShorts(total, opts.start, opts.clip, opts.maxShorts)
  if (!planned.length) throw new Error('No shorts to cut from this range.')
  const made: { index: number; start: number; duration: number; name: string; blob: Blob }[] = []
  for (const item of planned) {
    opts.onProgress?.((item.index - 1) / planned.length, `Recording short ${item.index}/${planned.length}`)
    await waitSeek(opts.video, item.start)
    const blob = await recordClip(opts.canvas, opts.video, item.duration, (value) => {
      opts.onProgress?.(
        (item.index - 1 + value) / planned.length,
        `Recording short ${item.index}/${planned.length}`,
      )
    })
    made.push({
      ...item,
      name: `short_${String(item.index).padStart(2, '0')}.webm`,
      blob,
    })
  }
  opts.onProgress?.(1, 'Shorts ready')
  return made
}
