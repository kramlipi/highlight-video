import { ProjectProvider, useProject } from './context/ProjectContext'
import { BoardDesk } from './studio/BoardDesk'
import { CaptionsDesk } from './studio/CaptionsDesk'
import { CartoonDesk } from './studio/CartoonDesk'
import { HighlightStudio } from './studio/HighlightStudio'
import { PublishDesk } from './studio/PublishDesk'
import { ScriptDesk } from './studio/ScriptDesk'
import { StudioNav } from './studio/StudioNav'
import { ThumbDesk } from './studio/ThumbDesk'
import { TitlesDesk } from './studio/TitlesDesk'
import './styles/studio.css'
import './styles/article.css'

function StudioShell() {
  const { tool } = useProject()
  return (
    <div className={tool === 'highlight' ? 'studio studio-highlight' : 'studio'}>
      <header className="studio-bar">
        <div>
          <p className="eyebrow">YouTube creation suite</p>
          <h1>Shotflow</h1>
        </div>
        <p className="bar-note">
          Pick a job from the menu. Highlight, cartoon cut, captions, titles, thumb, publish — jump anywhere.
        </p>
      </header>
      <StudioNav />
      <div className="studio-stage">
        {tool === 'board' ? <BoardDesk /> : null}
        {tool === 'script' ? <ScriptDesk /> : null}
        {tool === 'highlight' ? <HighlightStudio /> : null}
        {tool === 'cartoon' ? <CartoonDesk /> : null}
        {tool === 'captions' ? <CaptionsDesk /> : null}
        {tool === 'titles' ? <TitlesDesk /> : null}
        {tool === 'thumb' ? <ThumbDesk /> : null}
        {tool === 'publish' ? <PublishDesk /> : null}
      </div>
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
