type EditorPanelProps = {
  markdown: string
  onChange: (value: string) => void
  onLoadSample: () => void
}

export function EditorPanel({ markdown, onChange, onLoadSample }: EditorPanelProps) {
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
          <button type="button" className="ghost-btn" onClick={onLoadSample}>
            Sample
          </button>
        </div>
      </div>
      <p className="hint">
        Wrap key phrases in <code>**bold**</code>. Those become the yellow highlighter in the video.
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
