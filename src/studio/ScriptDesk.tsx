import { useEffect, useRef, useState } from 'react'
import { useProject } from '../context/ProjectContext'
import { hydrateMermaid, renderMarkdown } from '../lib/markdown'
import {
  SAMPLE_README,
  README_SNIPPETS,
  fileToDataUrl,
  imageMarkdown,
  insertAtCursor,
  type SnippetId,
} from '../lib/readme'
import { SAMPLE_MARKDOWN } from '../lib/sample'

const MERMAID_IDS: SnippetId[] = ['mermaid-flow', 'mermaid-sequence', 'mermaid-pie', 'mermaid-class']

export function ScriptDesk() {
  const { project, patch, setTool } = useProject()
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const html = renderMarkdown(project.markdown)

  useEffect(() => {
    void hydrateMermaid(previewRef.current)
  }, [html])

  function insert(snippet: string) {
    const editor = editorRef.current
    const start = editor?.selectionStart ?? project.markdown.length
    const end = editor?.selectionEnd ?? start
    const { next, caret } = insertAtCursor(project.markdown, snippet, start, end)
    patch({ markdown: next })
    requestAnimationFrame(() => {
      if (!editor) return
      editor.focus()
      editor.setSelectionRange(caret, caret)
    })
  }

  async function addImages(files: FileList | File[]) {
    const images = [...files].filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    const blocks: string[] = []
    for (const file of images) {
      blocks.push(imageMarkdown(file, await fileToDataUrl(file)))
    }
    insert(`\n${blocks.join('\n\n')}\n`)
  }

  function downloadReadme() {
    const blob = new Blob([project.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'README.md'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="desk script-desk">
      <header className="desk-head">
        <h2>Readme</h2>
        <p>GitHub-style README.md: images, mermaid, tables, code, tasks. Preview, then send to Highlight.</p>
      </header>
      <div className="readme-toolbar" role="toolbar" aria-label="README inserts">
        <label className="file-btn">
          Upload README.md
          <input
            type="file"
            accept=".md,.markdown,.txt"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              patch({ markdown: await file.text() })
              event.target.value = ''
            }}
          />
        </label>
        <label className="file-btn">
          Add image
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={async (event) => {
              if (event.target.files) await addImages(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
        <label className="field mermaid-pick">
          Mermaid
          <select
            aria-label="Insert mermaid diagram"
            defaultValue=""
            onChange={(event) => {
              const id = event.target.value as SnippetId
              if (id) insert(README_SNIPPETS[id].text)
              event.target.value = ''
            }}
          >
            <option value="" disabled>
              Diagram code…
            </option>
            {MERMAID_IDS.map((id) => (
              <option key={id} value={id}>
                {README_SNIPPETS[id].label.replace('Mermaid ', '')}
              </option>
            ))}
          </select>
        </label>
        {(['table', 'code', 'tasks', 'badge', 'quote', 'details'] as SnippetId[]).map((id) => (
          <button key={id} type="button" className="ghost-btn" onClick={() => insert(README_SNIPPETS[id].text)}>
            {README_SNIPPETS[id].label}
          </button>
        ))}
        <button type="button" className="ghost-btn" onClick={() => patch({ markdown: SAMPLE_README })}>
          README sample
        </button>
        <button type="button" className="ghost-btn" onClick={() => patch({ markdown: SAMPLE_MARKDOWN })}>
          Highlight sample
        </button>
        <button type="button" className="ghost-btn" onClick={downloadReadme}>
          Download .md
        </button>
        <button type="button" className="export-btn" onClick={() => setTool('highlight')}>
          Send to Highlight
        </button>
      </div>
      <div className={dragging ? 'readme-split is-drop' : 'readme-split'}>
        <label className="readme-pane">
          <span>Markdown</span>
          <textarea
            ref={editorRef}
            className="md-input"
            value={project.markdown}
            onChange={(event) => patch({ markdown: event.target.value })}
            onPaste={(event) => {
              const files = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'))
              if (files.length === 0) return
              event.preventDefault()
              void addImages(files)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const md = [...event.dataTransfer.files].find((file) => /\.md$|\.markdown$/i.test(file.name))
              if (md) {
                void md.text().then((text) => patch({ markdown: text }))
                return
              }
              void addImages(event.dataTransfer.files)
            }}
            spellCheck={false}
            aria-label="README markdown"
          />
        </label>
        <div className="readme-pane">
          <span>Preview</span>
          <div
            ref={previewRef}
            className="readme-preview"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </section>
  )
}
