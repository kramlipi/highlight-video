import { README_SNIPPETS, fileToDataUrl, imageMarkdown, insertAtCursor } from '../lib/readme'

type EditorPanelProps = {
  markdown: string
  onChange: (value: string) => void
  onLoadSample: () => void
}

export function EditorPanel({ markdown, onChange, onLoadSample }: EditorPanelProps) {
  async function addImage(file: File) {
    const snippet = imageMarkdown(file, await fileToDataUrl(file))
    const { next } = insertAtCursor(markdown, snippet, markdown.length, markdown.length)
    onChange(next)
  }

  return (
    <aside className="panel editor-panel">
      <div className="panel-head">
        <h2>Markdown</h2>
        <div className="panel-actions">
          <label className="file-btn">
            Upload .md
            <input
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                onChange(await file.text())
                event.target.value = ''
              }}
            />
          </label>
          <label className="file-btn">
            Image
            <input
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (file) await addImage(file)
                event.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              const { next } = insertAtCursor(
                markdown,
                README_SNIPPETS['mermaid-flow'].text,
                markdown.length,
                markdown.length,
              )
              onChange(next)
            }}
          >
            Mermaid
          </button>
          <button type="button" className="ghost-btn" onClick={onLoadSample}>
            Sample
          </button>
        </div>
      </div>
      <p className="hint">
        <code>**bold**</code> becomes the yellow marker. Add images, mermaid fences, tables, and task lists
        — or open the Readme desk for a live GitHub preview.
      </p>
      <textarea
        className="md-input"
        value={markdown}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-label="Markdown source"
      />
    </aside>
  )
}
