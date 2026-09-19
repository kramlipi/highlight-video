import { toCanvas } from 'html-to-image'
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeVideo,
} from 'mediabunny'
import { drawnHighlightRects, getFrameState, typewriterPolygon } from './motion'
import type { FrameState, LayoutMetrics, MotionMode, ResolvedTheme } from './types'
import { FPS } from './types'

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function clipPolygon(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
  if (points.length < 3) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
  ctx.clip()
}

export function renderVideoFrame(
  ctx: CanvasRenderingContext2D,
  article: CanvasImageSource,
  articleWidth: number,
  articleHeight: number,
  layout: LayoutMetrics,
  state: FrameState,
  theme: ResolvedTheme,
) {
  const { width, height } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, width, height)

  const { x, y, scale } = state.camera
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.clip()
  ctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale)

  if (state.typewriterProgress < 0.999) {
    ctx.save()
    clipPolygon(
      ctx,
      typewriterPolygon(layout.lines, state.typewriterProgress, layout.articleWidth),
    )
  }

  ctx.drawImage(article, 0, 0, articleWidth, articleHeight)

  ctx.globalCompositeOperation = theme.isDark ? 'overlay' : 'multiply'
  ctx.globalAlpha = theme.isDark ? 0.88 : 1
  ctx.fillStyle = theme.highlight

  layout.highlights.forEach((phrase, index) => {
    const progress = state.highlightProgress[index] ?? 0
    const rects = drawnHighlightRects(phrase, progress)
    for (const rect of rects) {
      ctx.save()
      ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2)
      ctx.rotate(-0.008)
      ctx.translate(-(rect.x + rect.width / 2), -(rect.y + rect.height / 2))
      roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 3)
      ctx.fill()
      ctx.restore()
    }
  })

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  if (state.typewriterProgress < 0.999) ctx.restore()
  ctx.restore()
}

async function captureArticle(sheet: HTMLElement, background: string): Promise<HTMLCanvasElement> {
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
  const previous: string[] = []
  sheet.querySelectorAll<HTMLElement>('.md-highlight').forEach((node) => {
    previous.push(node.style.getPropertyValue('--hl'))
    node.style.setProperty('--hl', '0')
  })
  try {
    return await toCanvas(sheet, {
      pixelRatio: 1,
      backgroundColor: background,
      cacheBust: true,
      width: sheet.scrollWidth,
      height: sheet.scrollHeight,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true
        return !node.classList.contains('highlight-layer')
      },
    })
  } finally {
    sheet.querySelectorAll<HTMLElement>('.md-highlight').forEach((node, index) => {
      node.style.setProperty('--hl', previous[index] || '0')
    })
  }
}

async function encodeMp4(
  canvas: HTMLCanvasElement,
  draw: (frameIndex: number) => void,
  totalFrames: number,
  fps: number,
  onProgress?: (value: number) => void,
): Promise<Blob> {
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  })
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    quality: QUALITY_HIGH,
  })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  for (let i = 0; i < totalFrames; i += 1) {
    draw(i)
    await source.add(i / fps, 1 / fps)
    onProgress?.(0.08 + (i / totalFrames) * 0.9)
  }

  await output.finalize()
  const buffer = target.buffer
  if (!buffer) throw new Error('MP4 encoding produced an empty buffer')
  return new Blob([new Uint8Array(buffer)], { type: 'video/mp4' })
}

function pickRecorderMime(): string {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

async function encodeWebm(
  canvas: HTMLCanvasElement,
  draw: (frameIndex: number) => void,
  totalFrames: number,
  fps: number,
  onProgress?: (value: number) => void,
): Promise<Blob> {
  const stream = canvas.captureStream(fps)
  const mimeType = pickRecorderMime()
  if (!mimeType) throw new Error('This browser cannot record video')
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Video recording failed'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  recorder.start(100)
  const frameDuration = 1000 / fps
  const start = performance.now()
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start
      const index = Math.min(totalFrames - 1, Math.floor(elapsed / frameDuration))
      draw(index)
      onProgress?.(0.08 + (index / totalFrames) * 0.9)
      if (index >= totalFrames - 1 && elapsed >= (totalFrames / fps) * 1000) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  recorder.stop()
  stream.getTracks().forEach((track) => track.stop())
  return done
}

export async function exportArticleVideo(options: {
  sheet: HTMLElement
  layout: LayoutMetrics
  mode: MotionMode
  durationSec: number
  theme: ResolvedTheme
  onProgress?: (value: number) => void
}): Promise<{ blob: Blob; filename: string }> {
  const { sheet, layout, mode, durationSec, theme, onProgress } = options
  onProgress?.(0.04)
  const articleCanvas = await captureArticle(sheet, theme.background)
  onProgress?.(0.08)

  const canvas = document.createElement('canvas')
  canvas.width = layout.stageWidth
  canvas.height = layout.stageHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create a drawing context')

  const totalFrames = Math.max(1, Math.round(durationSec * FPS))
  const draw = (frameIndex: number) => {
    const time = totalFrames === 1 ? 1 : frameIndex / (totalFrames - 1)
    const state = getFrameState(mode, time, layout)
    renderVideoFrame(
      ctx,
      articleCanvas,
      articleCanvas.width,
      articleCanvas.height,
      layout,
      state,
      theme,
    )
  }

  const canMp4 = await canEncodeVideo('avc').catch(() => false)
  try {
    if (canMp4) {
      const blob = await encodeMp4(canvas, draw, totalFrames, FPS, onProgress)
      onProgress?.(1)
      return { blob, filename: 'article-video.mp4' }
    }
  } catch {
    // Fall through to WebM.
  }

  const blob = await encodeWebm(canvas, draw, totalFrames, FPS, onProgress)
  onProgress?.(1)
  return { blob, filename: 'article-video.webm' }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  const delay = Math.min(120_000, Math.max(8_000, Math.round(blob.size / 40_000)))
  window.setTimeout(() => URL.revokeObjectURL(url), delay)
}

export function startDirectDownload(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

