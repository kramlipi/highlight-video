import { WaitlistPopup } from './components/WaitlistPopup'
import { ProjectProvider, useProject } from './context/ProjectContext'
import { formatCount } from './lib/invite'
import { BoardDesk } from './studio/BoardDesk'
import { CaptionsDesk } from './studio/CaptionsDesk'
import { CartoonDesk } from './studio/CartoonDesk'
import { HighlightStudio } from './studio/HighlightStudio'
import { PublishDesk } from './studio/PublishDesk'
import { ScriptDesk } from './studio/ScriptDesk'
import { StudioNav } from './studio/StudioNav'
import { ThumbDesk } from './studio/ThumbDesk'
import { TitlesDesk } from './studio/TitlesDesk'
import { VerticalDesk } from './studio/VerticalDesk'
import './styles/studio.css'
import './styles/article.css'

function StudioShell() {
  const { tool, setTool, unlocked, openWaitlist, stats } = useProject()
  const visitors = stats?.visitors ?? 0
  const shell =
    tool === 'board' ? 'studio studio-home' : tool === 'highlight' ? 'studio studio-highlight' : 'studio'
  return (
    <div className={shell}>
      <header className="studio-bar">
        <button
          type="button"
          className="brand"
          onClick={() => {
            setTool('board')
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
            document.querySelector('.studio-stage')?.scrollTo({ top: 0 })
          }}
        >
          <p className="eyebrow">shorts studio</p>
          <h1>Shotflow</h1>
        </button>
        <nav className="bar-links" aria-label="Site">
          <span className="visit-chip" title="Unique visitors counted on Cloudflare">
            {visitors > 0 ? `${formatCount(visitors)} visited` : 'counting visits'}
          </span>
          <a
            href="#features"
            onClick={() => {
              setTool('board')
            }}
          >
            Features
          </a>
          <button type="button" onClick={() => setTool('vertical')}>
            Shorts
          </button>
          <button type="button" onClick={() => setTool('captions')}>
            Captions
          </button>
          {unlocked ? (
            <button type="button" className="export-btn bar-cta" onClick={() => setTool('vertical')}>
              Make shorts
            </button>
          ) : (
            <button type="button" className="export-btn bar-cta" onClick={openWaitlist}>
              Get invite
            </button>
          )}
        </nav>
      </header>
      <StudioNav />
      <div className="studio-stage">
        {tool === 'board' ? <BoardDesk /> : null}
        {tool === 'script' ? <ScriptDesk /> : null}
        {tool === 'highlight' ? <HighlightStudio /> : null}
        {tool === 'cartoon' ? <CartoonDesk /> : null}
        {tool === 'vertical' ? <VerticalDesk /> : null}
        {tool === 'captions' ? <CaptionsDesk /> : null}
        {tool === 'titles' ? <TitlesDesk /> : null}
        {tool === 'thumb' ? <ThumbDesk /> : null}
        {tool === 'publish' ? <PublishDesk /> : null}
      </div>
      <WaitlistPopup />
    </div>
  )
}

export default function App() {
  return (
    <ProjectProvider>
      <StudioShell />
    </ProjectProvider>
  )
}
