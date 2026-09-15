import { useMemo } from 'react'
import { useProject } from '../context/ProjectContext'
import { downloadBlob } from '../lib/exportVideo'
import {
  extractTitle,
  makeChapters,
  makeDescription,
  makeHook,
  makePinnedComment,
  makeTags,
} from '../lib/youtubePack'

export function PublishDesk() {
  const { project, patch } = useProject()
  const title = project.workingTitle || extractTitle(project.markdown)
  const hook = project.hook || makeHook(project.markdown)
  const chapters = useMemo(() => makeChapters(project.markdown), [project.markdown])
  const tags = useMemo(() => makeTags(project.markdown), [project.markdown])
  const description = useMemo(
    () => makeDescription({ markdown: project.markdown, title, hook, chapters, tags }),
    [project.markdown, title, hook, chapters, tags],
  )
  const pinned = project.pinnedComment || makePinnedComment(title, hook)

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const downloadAll = () => {
    const pack = `TITLE\n${title}\n\nHOOK\n${hook}\n\nDESCRIPTION\n${description}\n\nPINNED COMMENT\n${pinned}\n\nTAGS\n${tags.join(', ')}\n\nCHAPTERS\n${chapters.map((item) => `${item.time} ${item.title}`).join('\n')}\n`
    downloadBlob(new Blob([pack], { type: 'text/plain' }), 'shotflow-publish-pack.txt')
    if (project.chunkedSrt || project.srt) {
      downloadBlob(new Blob([project.chunkedSrt || project.srt], { type: 'text/plain' }), 'captions.srt')
    }
  }

  return (
    <section className="desk publish-desk">
      <header className="desk-head">
        <h2>Publish pack</h2>
        <p>Copy into YouTube Studio: title, description, timestamps, tags, pinned comment.</p>
      </header>
      <div className="publish-grid">
        <article>
          <h3>Description</h3>
          <pre>{description}</pre>
          <button type="button" className="ghost-btn" onClick={() => void copy(description)}>
            Copy description
          </button>
        </article>
        <article>
          <h3>Chapters</h3>
          <ul>
            {chapters.map((item) => (
              <li key={item.time + item.title}>
                {item.time} {item.title}
              </li>
            ))}
          </ul>
          <h3>Tags</h3>
          <p className="tag-row">{tags.join(', ')}</p>
          <label className="field">
            <span>Pinned comment</span>
            <textarea
              className="md-input short"
              value={pinned}
              onChange={(event) => patch({ pinnedComment: event.target.value })}
            />
          </label>
          <button type="button" className="ghost-btn" onClick={() => void copy(pinned)}>
            Copy pinned comment
          </button>
        </article>
      </div>
      <button type="button" className="export-btn" onClick={downloadAll}>
        Download publish pack
      </button>
    </section>
  )
}
