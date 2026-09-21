import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: false,
})

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function mermaidPlaceholder(source: string) {
  return `<div class="md-mermaid">${source.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
}

export function renderMarkdown(markdown: string): string {
  let html = marked.parse(markdown.trim() || ' ', { async: false })
  html = html.replace(/<pre><code class="([^"]*)">([\s\S]*?)<\/code><\/pre>/gi, (block, cls: string, source: string) => {
    if (!/\bmermaid\b/i.test(cls)) return block
    return mermaidPlaceholder(decodeHtml(source).trim())
  })
  html = html.replace(/<(strong|b)>/gi, '<span class="md-highlight">')
  html = html.replace(/<\/(strong|b)>/gi, '</span>')
  html = html.replace(
    /^(\s*<p>)([\s\S]*?)(<\/p>)(\s*<h[1-3]>)/i,
    '<p class="kicker">$2</p>$4',
  )
  html = html.replace(/<p>(By\s+[^<]+)<\/p>/i, '<p class="byline">$1</p>')
  html = html.replace(/<img /gi, '<img loading="lazy" ')
  return html
}

let mermaidReady: Promise<typeof import('mermaid')> | null = null

async function mermaidApi() {
  mermaidReady ??= import('mermaid').then((mod) => {
    mod.default.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral',
      fontFamily: 'Inter, Segoe UI, sans-serif',
    })
    return mod
  })
  return mermaidReady
}

export async function hydrateMermaid(root: HTMLElement | null) {
  if (!root) return
  const nodes = [...root.querySelectorAll<HTMLElement>('.md-mermaid:not([data-ready])')]
  if (nodes.length === 0) return
  const { default: mermaid } = await mermaidApi()
  for (const node of nodes) {
    const source = decodeHtml(node.innerHTML).trim()
    if (!source) continue
    try {
      const id = `shotflow-mmd-${crypto.randomUUID().replace(/-/g, '')}`
      const { svg } = await mermaid.render(id, source)
      node.innerHTML = svg
      node.dataset.ready = '1'
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid mermaid diagram'
      node.dataset.ready = 'error'
      node.innerHTML = `<pre class="md-mermaid-error">${message}</pre>`
    }
  }
}
