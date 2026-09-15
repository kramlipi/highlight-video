import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SAMPLE_MARKDOWN } from '../lib/sample'
import type { ProjectState, ToolId } from '../lib/project'

const STORAGE_KEY = 'shotflow-project-v1'

const defaults: ProjectState = {
  markdown: SAMPLE_MARKDOWN,
  transcript: '',
  srt: '',
  chunkedSrt: '',
  captionLang: 'en',
  workingTitle: '',
  pinnedComment: '',
  hook: '',
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
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<ProjectState>(readStored)
  const [tool, setTool] = useState<ToolId>(() => {
    const hash = window.location.hash.replace('#', '') as ToolId
    return (
      ['board', 'script', 'highlight', 'captions', 'titles', 'thumb', 'publish'] as ToolId[]
    ).includes(hash)
      ? hash
      : 'board'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  }, [project])

  useEffect(() => {
    window.location.hash = tool
  }, [tool])

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
