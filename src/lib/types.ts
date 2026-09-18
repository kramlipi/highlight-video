export type LayoutMode = 'vertical' | 'horizontal'
export type MotionMode = 'highlight-draw' | 'ken-burns' | 'typewriter' | 'auto-scroll'
export type TextureId =
  | 'none'
  | 'paper'
  | 'newsprint'
  | 'parchment'
  | 'fiber'
  | 'linen'
  | 'canvas'
  | 'kraft'
  | 'notebook'
  | 'wood'
  | 'cork'
  | 'chalkboard'
  | 'marble'
  | 'watercolor'
  | 'concrete'
  | 'denim'

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type HighlightPhrase = {
  index: number
  rects: Rect[]
}

export type LayoutMetrics = {
  articleWidth: number
  articleHeight: number
  stageWidth: number
  stageHeight: number
  highlights: HighlightPhrase[]
  lines: Rect[]
}

export type Camera = {
  x: number
  y: number
  scale: number
}

export type FrameState = {
  camera: Camera
  highlightProgress: number[]
  typewriterProgress: number
}

export type ThemePreset = {
  id: string
  name: string
  headlineFont: string
  bodyFont: string
  foreground: string
  background: string
  muted: string
  accent: string
  highlight: string
  texture: TextureId
}

export type ResolvedTheme = ThemePreset & {
  isDark: boolean
}

export const STAGE = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
} as const

export const FPS = 30
