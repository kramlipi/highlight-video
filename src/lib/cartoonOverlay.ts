const GREEN = { r: 0, g: 255, b: 0 }

export function drawCartoonOverlay(
  ctx: CanvasRenderingContext2D,
  main: HTMLVideoElement,
  cartoon: HTMLVideoElement | null,
  scratch: HTMLCanvasElement,
) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  ctx.drawImage(main, 0, 0, w, h)
  if (!cartoon || cartoon.readyState < 2 || !cartoon.videoWidth) return

  const ow = Math.max(2, Math.round(w * 0.15) & ~1)
  const oh = Math.max(2, Math.round((ow * cartoon.videoHeight) / cartoon.videoWidth) & ~1)
  const pad = Math.max(4, Math.round(w * 0.025))
  const x = w - ow - pad
  const y = h - oh - pad

  scratch.width = ow
  scratch.height = oh
  const sctx = scratch.getContext('2d', { willReadFrequently: true })
  if (!sctx) return
  sctx.drawImage(cartoon, 0, 0, ow, oh)
  const frame = sctx.getImageData(0, 0, ow, oh)
  const data = frame.data
  const rx = ow / 2
  const ry = oh / 2
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % ow
    const py = Math.floor(i / 4 / ow)
    const nx = (px - rx) / rx
    const ny = (py - ry) / ry
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const green =
      g > 90 && g > r * 1.35 && g > b * 1.35 && Math.abs(g - GREEN.g) < 140
    if (nx * nx + ny * ny > 1 || green) data[i + 3] = 0
  }
  sctx.putImageData(frame, 0, 0)
  ctx.drawImage(scratch, x, y)
}

export async function exportOverlayVideo(
  canvas: HTMLCanvasElement,
  main: HTMLVideoElement,
  onProgress?: (value: number) => void,
): Promise<Blob> {
  main.currentTime = 0
  await main.play()
  const stream = canvas.captureStream(30)
  const capture = (
    main as HTMLVideoElement & { captureStream?: () => MediaStream }
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
  await new Promise<void>((resolve) => {
    const tick = () => {
      const duration = main.duration || 1
      onProgress?.(Math.min(0.98, main.currentTime / duration))
      if (main.ended || main.currentTime >= duration - 0.05) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
  recorder.stop()
  stream.getTracks().forEach((track) => track.stop())
  onProgress?.(1)
  return done
}
