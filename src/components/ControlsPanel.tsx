import { FONT_OPTIONS, TEXTURE_OPTIONS, THEME_PRESETS } from '../lib/themes'
import type { LayoutMode, MotionMode, TextureId } from '../lib/types'

type ControlsPanelProps = {
  layout: LayoutMode
  onLayout: (value: LayoutMode) => void
  themeId: string
  onThemeId: (value: string) => void
  font: string
  onFont: (value: string) => void
  foreground: string
  onForeground: (value: string) => void
  background: string
  onBackground: (value: string) => void
  texture: TextureId | ''
  onTexture: (value: TextureId | '') => void
  motion: MotionMode
  onMotion: (value: MotionMode) => void
  duration: number
  onDuration: (value: number) => void
  playing: boolean
  onTogglePlay: () => void
  progress: number
  onScrub: (value: number) => void
  exporting: boolean
  exportProgress: number
  onExport: () => void
}

const MOTION_OPTIONS: { id: MotionMode; label: string; blurb: string }[] = [
  {
    id: 'highlight-draw',
    label: 'Highlighter draw',
    blurb: 'Marker strokes each bold phrase, then holds.',
  },
  {
    id: 'ken-burns',
    label: 'Ken Burns',
    blurb: 'Highlights are on; the camera slowly zooms and pans.',
  },
  {
    id: 'typewriter',
    label: 'Typewriter',
    blurb: 'Lines reveal in order; bold phrases highlight as they appear.',
  },
  {
    id: 'auto-scroll',
    label: 'Auto-scroll',
    blurb: 'Camera eases through the article and highlights in view.',
  },
]

export function ControlsPanel(props: ControlsPanelProps) {
  return (
    <aside className="panel controls-panel">
      <div className="panel-head">
        <h2>Look & motion</h2>
      </div>

      <label className="field">
        <span>Layout</span>
        <div className="segmented">
          <button
            type="button"
            className={props.layout === 'vertical' ? 'on' : ''}
            onClick={() => props.onLayout('vertical')}
          >
            Vertical
          </button>
          <button
            type="button"
            className={props.layout === 'horizontal' ? 'on' : ''}
            onClick={() => props.onLayout('horizontal')}
          >
            Horizontal
          </button>
        </div>
      </label>

      <label className="field">
        <span>Theme</span>
        <select value={props.themeId} onChange={(event) => props.onThemeId(event.target.value)}>
          {THEME_PRESETS.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Font</span>
        <select
          value={props.font}
          onChange={(event) => props.onFont(event.target.value)}
        >
          <option value="">Theme default</option>
          {FONT_OPTIONS.map((font) => (
            <option key={font.id} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </label>

      <div className="color-row">
        <label className="field">
          <span>Foreground</span>
          <input
            type="color"
            value={props.foreground}
            onChange={(event) => props.onForeground(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Background</span>
          <input
            type="color"
            value={props.background}
            onChange={(event) => props.onBackground(event.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="ghost-btn wide"
        onClick={() => {
          props.onForeground('')
          props.onBackground('')
          props.onFont('')
          props.onTexture('')
        }}
      >
        Reset colors & font
      </button>

      <label className="field">
        <span>Texture</span>
        <select
          value={props.texture}
          onChange={(event) => props.onTexture(event.target.value as TextureId | '')}
        >
          <option value="">Theme default</option>
          {TEXTURE_OPTIONS.map((texture) => (
            <option key={texture.id} value={texture.id}>
              {texture.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="motion-set">
        <legend>Motion</legend>
        {MOTION_OPTIONS.map((option) => (
          <label key={option.id} className="radio-card">
            <input
              type="radio"
              name="motion"
              checked={props.motion === option.id}
              onChange={() => props.onMotion(option.id)}
            />
            <span>
              <strong>{option.label}</strong>
              <em>{option.blurb}</em>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span>Duration · {props.duration}s</span>
        <input
          type="range"
          min={6}
          max={24}
          step={1}
          value={props.duration}
          onChange={(event) => props.onDuration(Number(event.target.value))}
        />
      </label>

      <div className="playback">
        <button type="button" className="ghost-btn" onClick={props.onTogglePlay}>
          {props.playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={props.progress}
          onChange={(event) => props.onScrub(Number(event.target.value))}
          aria-label="Timeline"
        />
      </div>

      <button
        type="button"
        className="export-btn"
        disabled={props.exporting}
        onClick={props.onExport}
      >
        {props.exporting
          ? `Exporting ${Math.round(props.exportProgress * 100)}%`
          : 'Export video'}
      </button>
    </aside>
  )
}
