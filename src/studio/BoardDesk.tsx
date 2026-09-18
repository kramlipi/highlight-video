import { useProject } from '../context/ProjectContext'
import { TOOLS, type ToolId } from '../lib/project'

export function BoardDesk() {
  const { setTool } = useProject()
  const jobs = TOOLS.filter((tool) => tool.id !== 'board')

  return (
    <section className="desk board-desk">
      <header className="desk-head">
        <p className="eyebrow">YouTube creation suite</p>
        <h2>What do you want to make?</h2>
        <p>Pick one job. You can jump around — nothing is locked in order.</p>
      </header>
      <div className="job-grid">
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            className="job-card"
            onClick={() => setTool(job.id as ToolId)}
          >
            <span className="job-group">{job.group}</span>
            <strong>{job.label}</strong>
            <em>{job.blurb}</em>
          </button>
        ))}
      </div>
      <div className="board-note">
        <h3>Typical paths</h3>
        <p>
          <strong>Talking-head video:</strong> Cartoon cut (choose silence / stills / face / subs) → Captions →
          Titles → Thumb → Publish.
        </p>
        <p>
          <strong>Article B-roll:</strong> Script with <code>**bold**</code> → Highlight MP4 → Titles → Publish.
        </p>
        <p>
          Cartoon silence/still/Whisper needs the local engine (<code>video-add-cartoon/RUN.bat</code>). The talking
          face overlay also previews and exports in the browser on this page.
        </p>
      </div>
    </section>
  )
}
