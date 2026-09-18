import { SAMPLE_MARKDOWN } from '../lib/sample'
import { DEFAULT_CUT, TOOL_IDS, type ProjectState, type ToolId } from '../lib/project'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'shotflow-project-v2'

const defaults: ProjectState = {
  markdown: SAMPLE_MARKDOWN,
  transcript: '',
  srt: '',
  chunkedSrt: '',
  captionLang: 'en',
  workingTitle: '',
  pinnedComment: '',
  hook: '',
  cut: DEFAULT_CUT,
}

type ProjectContextValue = {
  project: ProjectState
  tool: ToolId
  setTool: (id: ToolId) => void
  patch: (partial: Partial<ProjectState>) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

function readStored(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('shotflow-project-v1')
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<ProjectState>
    return { ...defaults, ...parsed, cut: { ...DEFAULT_CUT, ...parsed.cut } }
  } catch {
    return defaults
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<ProjectState>(readStored)
  const [tool, setTool] = useState<ToolId>(() => {
    const hash = window.location.hash.replace('#', '') as ToolId
    return TOOL_IDS.includes(hash) ? hash : 'board'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  }, [project])

  useEffect(() => {
    window.location.hash = tool
  }, [tool])

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace('#', '') as ToolId
      if (TOOL_IDS.includes(hash)) setTool(hash)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const value = useMemo(
    () => ({
      project,
      tool,
      setTool,
      patch: (partial: Partial<ProjectState>) =>
        setProject((current) => ({ ...current, ...partial })),
    }),
    [project, tool],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider')
  return ctx
}
