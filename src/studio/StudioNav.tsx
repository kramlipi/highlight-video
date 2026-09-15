import { TOOLS, type ToolId } from '../lib/project'
import { useProject } from '../context/ProjectContext'

export function StudioNav() {
  const { tool, setTool } = useProject()
  return (
    <nav className="studio-nav" aria-label="Shotflow tools">
      <p className="nav-kicker">Workflow</p>
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={tool === item.id ? 'nav-item on' : 'nav-item'}
          onClick={() => setTool(item.id as ToolId)}
        >
          <strong>{item.label}</strong>
          <span>{item.blurb}</span>
        </button>
      ))}
    </nav>
  )
}
