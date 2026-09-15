import { useProject } from '../context/ProjectContext'
import { SAMPLE_MARKDOWN } from '../lib/sample'

export function ScriptDesk() {
  const { project, patch, setTool } = useProject()
  return (
    <section className="desk script-desk">
      <header className="desk-head">
        <h2>Script</h2>
        <p>This Markdown feeds the highlighter clip, titles, chapters, and description.</p>
      </header>
      <div className="panel-actions">
        <label className="file-btn">
          Upload .md
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
        <button type="button" className="ghost-btn" onClick={() => patch({ markdown: SAMPLE_MARKDOWN })}>
          Sample
        </button>
        <button type="button" className="export-btn" onClick={() => setTool('highlight')}>
          Send to Highlight
        </button>
      </div>
      <textarea
        className="md-input"
        value={project.markdown}
        onChange={(event) => patch({ markdown: event.target.value })}
        spellCheck={false}
        aria-label="Episode script"
      />
    </section>
  )
}
