import { useEffect } from 'react'
import { useProject } from '../context/ProjectContext'
import { TOOLS, type ToolId } from '../lib/project'

const FEATURES = [
  {
    title: 'Long video → many 9:16 shorts',
    body: 'Drop one landscape file. Shotflow slices it into 15–60s vertical reels for Shorts, Reels, and TikTok.',
    tool: 'vertical' as ToolId,
  },
  {
    title: 'Blur fill or tight crop',
    body: 'Keep the full frame on a blurred backdrop, or cut a 9:16 slice and slide focus left, center, or right.',
    tool: 'vertical' as ToolId,
  },
  {
    title: 'Browser or this-PC engine',
    body: 'Cut shorts in the tab from a dropped file. Huge local paths run on your machine with RUN.bat — the source stays private.',
    tool: 'vertical' as ToolId,
  },
  {
    title: 'Karaoke captions',
    body: 'Chunk SRT into 1–2 word burns, or speak live. Same rhythm as a Shorts caption track.',
    tool: 'captions' as ToolId,
  },
  {
    title: 'Highlighter article clips',
    body: 'Markdown in, yellow marker on **bold**. Themes, paper textures, and rustic brush fonts.',
    tool: 'highlight' as ToolId,
  },
  {
    title: 'Talking-head cartoon',
    body: 'Silence trim, still-frame trim, green-screen oval, Whisper burn-in — pick only the steps you want.',
    tool: 'cartoon' as ToolId,
  },
  {
    title: 'Titles, thumb, publish pack',
    body: 'Title formulas, a 1280×720 card, chapters, tags, description, and a pinned comment — copy into YouTube Studio.',
    tool: 'publish' as ToolId,
  },
  {
    title: 'No locked checklist',
    body: 'Jump from any menu. Make shorts first, or write a script first. The suite does not force an order.',
    tool: 'board' as ToolId,
  },
]

const STEPS = [
  { n: '01', title: 'Input a long video', body: 'Drop an MP4 in the browser, or paste a local path for 1 GB+ files.' },
  { n: '02', title: 'Pick the reel length', body: '15, 30, 45, or 60 seconds. Make 6, 12, 24, or the whole file.' },
  { n: '03', title: 'Reframe to 9:16', body: 'Blur-fill keeps the whole shot. Tight crop punches in on the action.' },
  { n: '04', title: 'Download the shorts', body: 'Each reel is 1080×1920. Zip them, or save one at a time.' },
  { n: '05', title: 'Captions and ship', body: 'Add karaoke SRT, titles, a thumb, then copy the publish pack.' },
]

export function BoardDesk() {
  const { setTool, stats, openWaitlist, unlocked } = useProject()
  const jobs = TOOLS.filter((tool) => tool.id !== 'board')

  useEffect(() => {
    const id = window.location.hash.replace('#', '')
    if (!id) return
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <section className="landing">
      <div className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">invite-only youtube shorts studio</p>
          <h2 className="landing-title">the clip desk built to cut what people actually watch.</h2>
          <p className="landing-lead">
            Turn one long landscape video into many 9:16 shorts. Then add captions, a highlighter B-roll, a
            talking face, titles, and a publish pack — in the browser, or on this PC.
          </p>
          <div className="landing-cta">
            <button
              type="button"
              className="export-btn landing-btn"
              onClick={() => (unlocked ? setTool('vertical') : openWaitlist())}
            >
              {unlocked ? 'Make shorts' : 'Join waitlist'}
            </button>
            <a className="ghost-btn landing-btn" href="#features">
              See features
            </a>
          </div>
          <p className="landing-fine">
            {stats?.visitors
              ? `${stats.visitors.toLocaleString()} ${stats.visitors === 1 ? 'person has' : 'people have'} visited.`
              : 'Visit count runs on Cloudflare.'}{' '}
            {unlocked
              ? 'You are on the waitlist — desks are unlocked.'
              : 'Invite-only: leave an email or phone to use the desks.'}{' '}
            Huge local paths still run with <code>video-add-cartoon/RUN.bat</code>.
          </p>
        </div>
        <div className="phone-stack" aria-hidden="true">
          <div className="phone-frame">
            <span className="phone-badge">9:16</span>
            <span className="phone-caption">wait — that clip hits</span>
            <strong>short 01</strong>
            <em>blur fill · 30s</em>
          </div>
          <div className="phone-frame phone-frame-two">
            <span className="phone-badge">9:16</span>
            <span className="phone-caption">then this one ships</span>
            <strong>short 02</strong>
            <em>tight crop · 30s</em>
          </div>
        </div>
      </div>

      <section id="features" className="landing-block">
        <p className="landing-kicker">what shotflow is</p>
        <h3 className="landing-h">a shorts factory plus the rest of a youtube desk.</h3>
        <p className="landing-lead narrow">
          Slice a long video into vertical reels, then open captions, highlighter clips, cartoon overlay,
          titles, thumbs, and a publish pack. Pick a feature. Nothing is locked in order.
        </p>
        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <button
              key={feature.title}
              type="button"
              className="feature-card"
              onClick={() => setTool(feature.tool)}
            >
              <strong>{feature.title}</strong>
              <span>{feature.body}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="landing-block">
        <p className="landing-kicker">how it works</p>
        <h3 className="landing-h">five steps from one file to a pile of reels.</h3>
        <ol className="how-list">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="how-n">{step.n}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-block">
        <p className="landing-kicker">open a desk</p>
        <h3 className="landing-h">jump to the job you want.</h3>
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
      </section>

      <section className="landing-close">
        <p className="landing-kicker">ready when you are</p>
        <h3 className="landing-h">drop a long video. walk out with a pile of shorts.</h3>
        <div className="landing-cta">
          <button type="button" className="export-btn landing-btn" onClick={() => setTool('vertical')}>
            Make shorts
          </button>
          <button type="button" className="ghost-btn landing-btn" onClick={() => setTool('captions')}>
            Add captions
          </button>
        </div>
      </section>
    </section>
  )
}
