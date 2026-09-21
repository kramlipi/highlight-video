import { SAMPLE_MARKDOWN } from '../lib/sample'
import { DEFAULT_CUT, TOOL_IDS, type ProjectState, type ToolId } from '../lib/project'
import {
  fetchStats,
  hasInvite,
  recordVisit,
  type VisitStats,
} from '../lib/invite'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

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
  unlocked: boolean
  waitlistOpen: boolean
  openWaitlist: () => void
  closeWaitlist: () => void
  unlock: () => void
  stats: VisitStats | null
  setStats: (stats: VisitStats) => void
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

function toolFromHash(unlocked: boolean): ToolId {
  const hash = window.location.hash.replace('#', '') as ToolId
  if (!TOOL_IDS.includes(hash)) return 'board'
  if (hash !== 'board' && !unlocked) return 'board'
  return hash
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const invited = hasInvite()
  const [project, setProject] = useState<ProjectState>(readStored)
  const [unlocked, setUnlocked] = useState(invited)
  const [waitlistOpen, setWaitlistOpen] = useState(!invited)
  const [stats, setStats] = useState<VisitStats | null>(null)
  const [tool, setToolState] = useState<ToolId>(() => toolFromHash(invited))
  const pendingTool = useRef<ToolId | null>(null)

  const setTool = useCallback(
    (id: ToolId) => {
      if (id !== 'board' && !unlocked) {
        pendingTool.current = id
        setWaitlistOpen(true)
        return
      }
      setToolState(id)
    },
    [unlocked],
  )

  const unlock = useCallback(() => {
    setUnlocked(true)
    setWaitlistOpen(false)
    const next = pendingTool.current
    pendingTool.current = null
    if (next && next !== 'board') setToolState(next)
  }, [])

  const openWaitlist = useCallback(() => setWaitlistOpen(true), [])
  const closeWaitlist = useCallback(() => setWaitlistOpen(false), [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  }, [project])

  useEffect(() => {
    window.location.hash = tool
  }, [tool])

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace('#', '') as ToolId
      if (!TOOL_IDS.includes(hash)) return
      setTool(hash)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [setTool])

  useEffect(() => {
    let cancelled = false
    const key = 'shotflow-visit-sent'
    const already = sessionStorage.getItem(key)
    const run = already ? fetchStats() : recordVisit()
    if (!already) sessionStorage.setItem(key, '1')
    void run
      .then((next) => {
        if (!cancelled) setStats(next)
      })
      .catch(() => {
        if (!cancelled) setStats({ visitors: 0, pageviews: 0, waitlist: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({
      project,
      tool,
      setTool,
      patch: (partial: Partial<ProjectState>) =>
        setProject((current) => ({ ...current, ...partial })),
      unlocked,
      waitlistOpen,
      openWaitlist,
      closeWaitlist,
      unlock,
      stats,
      setStats,
    }),
    [project, tool, setTool, unlocked, waitlistOpen, openWaitlist, closeWaitlist, unlock, stats],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider')
  return ctx
}
