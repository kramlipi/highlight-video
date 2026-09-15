import { useMemo } from 'react'
import { useProject } from '../context/ProjectContext'
import { makeHook, makeTitles } from '../lib/youtubePack'

export function TitlesDesk() {
  const { project, patch } = useProject()
  const titles = useMemo(() => makeTitles(project.markdown), [project.markdown])
  const hook = project.hook || makeHook(project.markdown)

  return (
    <section className="desk titles-desk">
      <header className="desk-head">
        <h2>Titles</h2>
        <p>Click a formula to lock it as the working title. It fills the thumbnail and publish pack.</p>
      </header>
      <label className="field">
        <span>Hook line</span>
        <input
          className="text-input"
          value={hook}
          onChange={(event) => patch({ hook: event.target.value })}
        />
      </label>
      <ul className="title-list">
        {titles.map((title) => (
          <li key={title}>
            <button
              type="button"
              className={project.workingTitle === title ? 'title-chip on' : 'title-chip'}
              onClick={() => patch({ workingTitle: title, hook })}
            >
              {title}
            </button>
          </li>
        ))}
      </ul>
      <label className="field">
        <span>Working title ({project.workingTitle.length}/70)</span>
        <input
          className="text-input"
          value={project.workingTitle}
          onChange={(event) => patch({ workingTitle: event.target.value })}
        />
      </label>
    </section>
  )
}
