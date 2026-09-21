import { useMemo, useState } from 'react'
import { useProject } from '../context/ProjectContext'
import { TOOLS, type ToolId } from '../lib/project'

const GROUPS = ['Start', 'Write', 'Picture', 'Audio', 'Ship']

export function StudioNav() {
  const { tool, setTool } = useProject()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOOLS
    return TOOLS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.blurb.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <nav className="studio-nav" aria-label="Shotflow tools">
      <label className="nav-search">
        <span className="nav-kicker">Jump to</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Shorts, readme, mermaid…"
          aria-label="Filter tools"
        />
      </label>
      {GROUPS.map((group) => {
        const items = filtered.filter((item) => item.group === group)
        if (items.length === 0) return null
        return (
          <div key={group} className="nav-group">
            <p className="nav-kicker">{group}</p>
            {items.map((item) => (
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
          </div>
        )
      })}
    </nav>
  )
}
