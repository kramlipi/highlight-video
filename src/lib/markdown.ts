import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: false,
})

export function renderMarkdown(markdown: string): string {
  let html = marked.parse(markdown.trim() || ' ', { async: false })
  html = html.replace(/<(strong|b)>/gi, '<span class="md-highlight">')
  html = html.replace(/<\/(strong|b)>/gi, '</span>')
  html = html.replace(
    /^(\s*<p>)([\s\S]*?)(<\/p>)(\s*<h[1-3]>)/i,
    '<p class="kicker">$2</p>$4',
  )
  html = html.replace(/<p>(By\s+[^<]+)<\/p>/i, '<p class="byline">$1</p>')
  return html
}
