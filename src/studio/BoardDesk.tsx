import { useProject } from '../context/ProjectContext'
import { TOOLS } from '../lib/project'
import { extractTitle } from '../lib/youtubePack'

export function BoardDesk() {
  const { project, setTool } = useProject()
  const title = project.workingTitle || extractTitle(project.markdown)
  const checks = [
    { id: 'script' as const, ok: project.markdown.trim().length > 40, label: 'Script drafted' },
    { id: 'highlight' as const, ok: /\*\*/.test(project.markdown), label: 'Bold highlights marked' },
    { id: 'captions' as const, ok: Boolean(project.srt || project.chunkedSrt), label: 'Captions ready' },
    { id: 'titles' as const, ok: Boolean(project.workingTitle), label: 'Title picked' },
    { id: 'thumb' as const, ok: Boolean(project.workingTitle), label: 'Thumbnail copy set' },
    { id: 'publish' as const, ok: Boolean(project.pinnedComment), label: 'Publish pack filled' },
  ]

  return (
    <section className="desk board-desk">
      <header className="desk-head">
        <p className="eyebrow">YouTube creation suite</p>
        <h2>One pass from idea to upload</h2>
        <p>
          Working title: <strong>{title}</strong>
        </p>
      </header>
      <ol className="board-steps">
        {checks.map((item, index) => (
          <li key={item.id}>
            <button type="button" className={item.ok ? 'step-card done' : 'step-card'} onClick={() => setTool(item.id)}>
              <span className="step-num">{index + 1}</span>
              <span>
                <strong>{TOOLS.find((tool) => tool.id === item.id)?.label}</strong>
                <em>{item.label}</em>
              </span>
              <span className="step-state">{item.ok ? 'Ready' : 'Open'}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="board-note">
        <h3>How to ship faster</h3>
        <p>
          Write the script with <code>**bold**</code> on the lines you will say on camera. Generate a highlighter
          B-roll clip, chunk captions into 1–2 word karaoke (from the transcriber), pick a title, export a thumb, then
          copy the description pack into YouTube Studio.
        </p>
        <p>
          Full Whisper transcription still runs locally on GPU. In the browser: paste a transcript, upload an SRT, or
          use live speech-to-text.
        </p>
      </div>
    </section>
  )
}
