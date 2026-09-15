import type {
  FrameState,
  HighlightPhrase,
  LayoutMetrics,
  MotionMode,
  Rect,
} from './types'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export function boundsOf(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const rect of rects) {
    x1 = Math.min(x1, rect.x)
    y1 = Math.min(y1, rect.y)
    x2 = Math.max(x2, rect.x + rect.width)
    y2 = Math.max(y2, rect.y + rect.height)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

export function expandRect(rect: Rect, padX = 7, padY = 4): Rect {
  return {
    x: rect.x - padX,
    y: rect.y - padY,
    width: rect.width + padX * 2,
    height: rect.height + padY * 2,
  }
}

const HOLD = 0.16

function actionT(t: number): number {
  return clamp(t / (1 - HOLD), 0, 1)
}

function focusCamera(
  layout: LayoutMetrics,
  focusY: number,
  focusH: number,
  scale: number,
): { x: number; y: number } {
  const viewH = layout.stageHeight / scale
  const viewW = layout.stageWidth / scale
  const y = clamp(
    focusY + focusH / 2 - viewH * 0.4,
    0,
    Math.max(0, layout.articleHeight - viewH),
  )
  const x = clamp(
    (layout.articleWidth - viewW) / 2,
    0,
    Math.max(0, layout.articleWidth - viewW),
  )
  return { x, y }
}

function phraseFocus(phrase: HighlightPhrase | undefined): { y: number; h: number } {
  if (!phrase || phrase.rects.length === 0) {
    return { y: 0, h: 80 }
  }
  const box = boundsOf(phrase.rects)
  return { y: box.y, h: box.height }
}

export function typewriterPolygon(
  lines: Rect[],
  progress: number,
  articleWidth: number,
): { x: number; y: number }[] {
  if (lines.length === 0 || progress >= 0.999) {
    return []
  }
  if (progress <= 0.001) {
    return [
      { x: 0, y: 0 },
      { x: articleWidth, y: 0 },
      { x: articleWidth, y: 0 },
      { x: 0, y: 0 },
    ]
  }

  const total = lines.reduce((sum, line) => sum + Math.max(line.width, 1), 0)
  let remaining = total * clamp(progress, 0, 1)
  let index = 0
  for (let i = 0; i < lines.length; i += 1) {
    const width = Math.max(lines[i].width, 1)
    if (remaining <= width) {
      index = i
      break
    }
    remaining -= width
    index = i
  }

  const current = lines[index]
  const revealX = current.x + remaining
  const prevBottom = current.y
  const bottom = current.y + current.height + 8
  return [
    { x: 0, y: 0 },
    { x: articleWidth, y: 0 },
    { x: articleWidth, y: prevBottom },
    { x: revealX, y: prevBottom },
    { x: revealX, y: bottom },
    { x: 0, y: bottom },
  ]
}

export function typewriterClipPath(
  lines: Rect[],
  progress: number,
  articleWidth: number,
): string {
  if (progress >= 0.999) return 'none'
  const points = typewriterPolygon(lines, progress, articleWidth)
  if (points.length === 0) return 'none'
  return `polygon(${points.map((p) => `${p.x}px ${p.y}px`).join(', ')})`
}

function revealBottom(lines: Rect[], progress: number, fallback: number): number {
  const points = typewriterPolygon(lines, progress, 1)
  if (points.length === 0) return fallback
  return Math.max(...points.map((p) => p.y))
}

function phraseTypedProgress(
  phrase: HighlightPhrase,
  lines: Rect[],
  progress: number,
): number {
  if (phrase.rects.length === 0) return 0
  const box = boundsOf(phrase.rects)
  const bottom = revealBottom(lines, progress, 0)
  if (bottom >= box.y + box.height - 2) return 1
  if (bottom <= box.y) return 0
  return clamp((bottom - box.y) / Math.max(box.height, 1), 0, 1)
}

export function sequentialHighlightProgress(
  mode: MotionMode,
  time: number,
  count: number,
): number[] {
  if (count <= 0) return []
  const t = clamp(time, 0, 1)
  const at = actionT(t)
  const eased = easeInOutCubic(at)
  const values = Array.from({ length: count }, () => 0)
  if (mode === 'ken-burns') return values.map(() => 1)
  if (mode === 'typewriter') {
    const typed = lerp(at, eased, 0.2) * count
    for (let i = 0; i < count; i += 1) values[i] = clamp(typed - i, 0, 1)
    return values
  }
  if (mode === 'auto-scroll') {
    const along = eased * count
    for (let i = 0; i < count; i += 1) values[i] = clamp(along - i + 0.35, 0, 1)
    return values
  }
  const seq = at * count
  const idx = clamp(Math.floor(seq), 0, count - 1)
  const local = seq - idx
  for (let i = 0; i < count; i += 1) {
    if (i < idx) values[i] = 1
    else if (i === idx) values[i] = easeInOutCubic(clamp(local, 0, 1))
    else values[i] = 0
  }
  return values
}

export function getFrameState(
  mode: MotionMode,
  time: number,
  layout: LayoutMetrics,
): FrameState {
  const t = clamp(time, 0, 1)
  const at = actionT(t)
  const eased = easeInOutCubic(at)
  const count = layout.highlights.length
  const highlightProgress = layout.highlights.map(() => 0)
  let typewriterProgress = 1
  let scale = 1
  let camX = 0
  let camY = 0

  if (mode === 'highlight-draw') {
    if (count === 0) {
      const focus = focusCamera(layout, 0, 120, 1)
      camX = focus.x
      camY = focus.y
    } else {
      const seq = at * count
      const idx = clamp(Math.floor(seq), 0, count - 1)
      const local = seq - idx
      for (let i = 0; i < count; i += 1) {
        if (i < idx) highlightProgress[i] = 1
        else if (i === idx) highlightProgress[i] = easeInOutCubic(clamp(local, 0, 1))
        else highlightProgress[i] = 0
      }
      const previous = idx === 0 ? { y: 0, h: 80 } : phraseFocus(layout.highlights[idx - 1])
      const current = phraseFocus(layout.highlights[idx])
      const mix = easeInOutCubic(idx === 0 ? clamp(seq, 0, 1) : local)
      const cam = focusCamera(
        layout,
        lerp(previous.y, current.y, mix),
        lerp(previous.h, current.h, mix),
        1,
      )
      camX = cam.x
      camY = cam.y
    }
  } else if (mode === 'ken-burns') {
    for (let i = 0; i < count; i += 1) highlightProgress[i] = 1
    scale = lerp(1.02, 1.15, eased)
    const viewH = layout.stageHeight / scale
    const viewW = layout.stageWidth / scale
    const maxY = Math.max(0, layout.articleHeight - viewH)
    const maxX = Math.max(0, layout.articleWidth - viewW)
    const first = layout.highlights[0]
    const targetY = first ? clamp(boundsOf(first.rects).y - viewH * 0.22, 0, maxY) : Math.min(maxY, 90)
    camY = lerp(0, targetY || Math.min(maxY, 70), eased)
    camX = lerp(0, maxX * 0.4, eased)
  } else if (mode === 'typewriter') {
    typewriterProgress = lerp(at, eased, 0.2)
    const bottom = revealBottom(layout.lines, typewriterProgress, layout.articleHeight)
    const cam = focusCamera(layout, Math.max(0, bottom - 70), 90, 1)
    camX = cam.x
    camY = cam.y
    for (let i = 0; i < count; i += 1) {
      highlightProgress[i] = phraseTypedProgress(
        layout.highlights[i],
        layout.lines,
        typewriterProgress,
      )
    }
  } else {
    const maxY = Math.max(0, layout.articleHeight - layout.stageHeight)
    camY = lerp(0, maxY, eased)
    const viewTop = camY
    const fireLine = camY + layout.stageHeight * 0.68
    for (let i = 0; i < count; i += 1) {
      const box = boundsOf(layout.highlights[i].rects)
      if (box.y + box.height < viewTop) {
        highlightProgress[i] = 1
      } else if (box.y < fireLine) {
        highlightProgress[i] = easeInOutCubic(
          clamp((fireLine - box.y) / Math.max(layout.stageHeight * 0.22, 1), 0, 1),
        )
      } else {
        highlightProgress[i] = 0
      }
    }
  }

  return {
    camera: { x: camX, y: camY, scale },
    highlightProgress,
    typewriterProgress: mode === 'typewriter' ? typewriterProgress : 1,
  }
}

export function drawnHighlightRects(
  phrase: HighlightPhrase,
  progress: number,
): Rect[] {
  const total = phrase.rects.reduce((sum, rect) => sum + rect.width, 0)
  if (total <= 0 || progress <= 0) return []
  let remaining = total * clamp(progress, 0, 1)
  const drawn: Rect[] = []
  for (const rect of phrase.rects) {
    if (remaining <= 0) break
    const width = Math.min(rect.width, remaining)
    drawn.push(expandRect({ ...rect, width }))
    remaining -= rect.width
  }
  return drawn
}

export function emptyMetrics(stageWidth: number, stageHeight: number): LayoutMetrics {
  return {
    articleWidth: stageWidth,
    articleHeight: stageHeight,
    stageWidth,
    stageHeight,
    highlights: [],
    lines: [],
  }
}
