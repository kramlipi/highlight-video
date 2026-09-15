import type { HighlightPhrase, LayoutMetrics, Rect } from './types'

function mergeLineRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Rect[] = []
  for (const rect of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(rect.y - last.y) < Math.max(rect.height, last.height) * 0.5) {
      const x = Math.min(last.x, rect.x)
      const y = Math.min(last.y, rect.y)
      const right = Math.max(last.x + last.width, rect.x + rect.width)
      const bottom = Math.max(last.y + last.height, rect.y + rect.height)
      last.x = x
      last.y = y
      last.width = right - x
      last.height = bottom - y
    } else {
      lines.push({ ...rect })
    }
  }
  return lines
}

export function measureArticle(
  sheet: HTMLElement,
  stageWidth: number,
  stageHeight: number,
): LayoutMetrics {
  const sheetBox = sheet.getBoundingClientRect()
  const scale = sheetBox.width / Math.max(sheet.offsetWidth, 1)
  const toLocal = (client: DOMRectReadOnly): Rect => ({
    x: (client.left - sheetBox.left) / scale,
    y: (client.top - sheetBox.top) / scale,
    width: client.width / scale,
    height: client.height / scale,
  })

  const source = sheet.querySelector<HTMLElement>('.article-body') ?? sheet
  const highlights: HighlightPhrase[] = []
  const highlightNodes = source.querySelectorAll<HTMLElement>('.md-highlight')

  highlightNodes.forEach((node, index) => {
    const rects: Rect[] = []
    for (const client of Array.from(node.getClientRects())) {
      if (client.width < 1 || client.height < 1) continue
      rects.push(toLocal(client))
    }
    if (rects.length > 0 || node.textContent?.trim()) {
      highlights.push({ index, rects })
    }
  })

  const lineRects: Rect[] = []
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const text = node.textContent ?? ''
    if (text.trim()) {
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const client of Array.from(range.getClientRects())) {
        if (client.width < 1 || client.height < 1) continue
        lineRects.push(toLocal(client))
      }
    }
    node = walker.nextNode()
  }

  return {
    articleWidth: sheet.offsetWidth,
    articleHeight: Math.max(sheet.offsetHeight, stageHeight),
    stageWidth,
    stageHeight,
    highlights,
    lines: mergeLineRects(lineRects),
  }
}
