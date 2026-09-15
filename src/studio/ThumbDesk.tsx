import { useEffect, useRef } from 'react'
import { useProject } from '../context/ProjectContext'
import { downloadBlob } from '../lib/exportVideo'
import { extractTitle, makeHook } from '../lib/youtubePack'

export function ThumbDesk() {
  const { project } = useProject()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const title = project.workingTitle || extractTitle(project.markdown)
  const hook = project.hook || makeHook(project.markdown)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const w = 1280
    const h = 720
    canvas.width = w
    canvas.height = h
    ctx.fillStyle = '#101218'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#171a22'
    ctx.fillRect(48, 48, w - 96, h - 96)
    ctx.fillStyle = '#e8c547'
    ctx.fillRect(80, 88, 18, 18)
    ctx.font = '700 22px Inter, Segoe UI, sans-serif'
    ctx.fillStyle = '#e8c547'
    ctx.fillText('SHOTFLOW  ·  HIGHLIGHT', 112, 104)
    ctx.fillStyle = '#ffe34d'
    ctx.fillRect(80, 210, Math.min(w - 160, title.length * 22), 92)
    ctx.fillStyle = '#16120a'
    ctx.font = '700 54px Georgia, serif'
    wrapText(ctx, title, 96, 270, w - 192, 62)
    ctx.fillStyle = '#c8cdd8'
    ctx.font = '400 28px Inter, Segoe UI, sans-serif'
    wrapText(ctx, hook, 96, 430, w - 192, 38)
    ctx.fillStyle = '#9aa3b5'
    ctx.font = '500 18px Inter, Segoe UI, sans-serif'
    ctx.fillText('1280 × 720  ·  YouTube thumbnail', 96, 640)
  }, [title, hook])

  return (
    <section className="desk thumb-desk">
      <header className="desk-head">
        <h2>Thumbnail</h2>
        <p>High-contrast card from the working title. Download PNG and drop it into YouTube Studio.</p>
      </header>
      <canvas ref={canvasRef} className="thumb-canvas" />
      <button
        type="button"
        className="export-btn"
        onClick={() => {
          const canvas = canvasRef.current
          if (!canvas) return
          canvas.toBlob((blob) => {
            if (blob) downloadBlob(blob, 'thumbnail.png')
          }, 'image/png')
        }}
      >
        Download PNG
      </button>
    </section>
  )
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ')
  let line = ''
  let cursor = y
  for (const word of words) {
    const test = `${line}${word} `
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, cursor)
      line = `${word} `
      cursor += lineHeight
    } else {
      line = test
    }
  }
  ctx.fillText(line.trim(), x, cursor)
}
