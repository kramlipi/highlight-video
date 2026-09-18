import type { ResolvedTheme, TextureId, ThemePreset } from './types'

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'modern',
    name: 'Modern article',
    headlineFont: '"Playfair Display", Georgia, serif',
    bodyFont: '"Source Sans 3", "Segoe UI", sans-serif',
    foreground: '#1a1a1a',
    background: '#ffffff',
    muted: '#6b7280',
    accent: '#0f766e',
    highlight: '#ffe34d',
    texture: 'none',
  },
  {
    id: 'newspaper',
    name: 'Newspaper',
    headlineFont: '"Newsreader", "Times New Roman", serif',
    bodyFont: '"Libre Baskerville", Georgia, serif',
    foreground: '#111111',
    background: '#f3efe3',
    muted: '#4b4b4b',
    accent: '#8b1e1e',
    highlight: '#ffe34d',
    texture: 'newsprint',
  },
  {
    id: 'parchment',
    name: 'Old yellow paper',
    headlineFont: '"EB Garamond", Georgia, serif',
    bodyFont: '"EB Garamond", Georgia, serif',
    foreground: '#4a3016',
    background: '#e8d09a',
    muted: '#7a5a32',
    accent: '#8a4b12',
    highlight: '#f5d76e',
    texture: 'parchment',
  },
  {
    id: 'dark',
    name: 'Dark editorial',
    headlineFont: '"Source Serif 4", Georgia, serif',
    bodyFont: 'Inter, "Segoe UI", sans-serif',
    foreground: '#f3ead8',
    background: '#1c1a17',
    muted: '#b5aa96',
    accent: '#d4a017',
    highlight: '#e8c547',
    texture: 'fiber',
  },
]

export const FONT_GROUPS = [
  {
    id: 'classic',
    label: 'Classic',
    fonts: [
      { id: 'playfair', label: 'Playfair Display', value: '"Playfair Display", Georgia, serif' },
      { id: 'newsreader', label: 'Newsreader', value: '"Newsreader", "Times New Roman", serif' },
      { id: 'garamond', label: 'EB Garamond', value: '"EB Garamond", Georgia, serif' },
      { id: 'baskerville', label: 'Libre Baskerville', value: '"Libre Baskerville", Georgia, serif' },
      { id: 'source-serif', label: 'Source Serif 4', value: '"Source Serif 4", Georgia, serif' },
      { id: 'source-sans', label: 'Source Sans 3', value: '"Source Sans 3", "Segoe UI", sans-serif' },
      { id: 'inter', label: 'Inter', value: 'Inter, "Segoe UI", sans-serif' },
      { id: 'georgia', label: 'Georgia', value: 'Georgia, serif' },
      { id: 'times', label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
      { id: 'courier', label: 'Courier New', value: '"Courier New", Courier, monospace' },
    ],
  },
  {
    id: 'brush',
    label: 'Brush',
    fonts: [
      { id: 'permanent-marker', label: 'Permanent Marker', value: '"Permanent Marker", "Comic Sans MS", cursive' },
      { id: 'rock-salt', label: 'Rock Salt', value: '"Rock Salt", "Comic Sans MS", cursive' },
      { id: 'homemade-apple', label: 'Homemade Apple', value: '"Homemade Apple", "Segoe Script", cursive' },
      { id: 'covered-grace', label: 'Covered By Your Grace', value: '"Covered By Your Grace", "Segoe Script", cursive' },
      { id: 'sedgwick', label: 'Sedgwick Ave', value: '"Sedgwick Ave", "Comic Sans MS", cursive' },
      { id: 'caveat', label: 'Caveat', value: 'Caveat, "Segoe Script", cursive' },
    ],
  },
  {
    id: 'rustic',
    label: 'Rustic',
    fonts: [
      { id: 'special-elite', label: 'Special Elite', value: '"Special Elite", "Courier New", monospace' },
      { id: 'fredericka', label: 'Fredericka the Great', value: '"Fredericka the Great", Georgia, serif' },
      { id: 'amatic', label: 'Amatic SC', value: '"Amatic SC", "Comic Sans MS", cursive' },
      { id: 'kalam', label: 'Kalam', value: 'Kalam, "Comic Sans MS", cursive' },
      { id: 'architects', label: 'Architects Daughter', value: '"Architects Daughter", "Comic Sans MS", cursive' },
      { id: 'im-fell', label: 'IM Fell English', value: '"IM Fell English", Georgia, serif' },
      { id: 'uncial', label: 'Uncial Antiqua', value: '"Uncial Antiqua", Georgia, serif' },
    ],
  },
]

export const TEXTURE_OPTIONS: { id: TextureId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'paper', label: 'Paper grain' },
  { id: 'newsprint', label: 'Newsprint' },
  { id: 'parchment', label: 'Aged yellow paper' },
  { id: 'fiber', label: 'Laid fiber' },
  { id: 'linen', label: 'Linen weave' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'kraft', label: 'Kraft cardboard' },
  { id: 'notebook', label: 'Notebook rules' },
  { id: 'wood', label: 'Wood grain' },
  { id: 'cork', label: 'Cork board' },
  { id: 'chalkboard', label: 'Chalkboard' },
  { id: 'marble', label: 'Marble' },
  { id: 'watercolor', label: 'Watercolor wash' },
  { id: 'concrete', label: 'Concrete' },
  { id: 'denim', label: 'Denim twill' },
]

function luminance(hex: string): number {
  const raw = hex.replace('#', '')
  if (raw.length !== 6) return 1
  const r = Number.parseInt(raw.slice(0, 2), 16) / 255
  const g = Number.parseInt(raw.slice(2, 4), 16) / 255
  const b = Number.parseInt(raw.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function resolveTheme(
  presetId: string,
  overrides: {
    font?: string
    foreground?: string
    background?: string
    texture?: TextureId | ''
  },
): ResolvedTheme {
  const preset = THEME_PRESETS.find((item) => item.id === presetId) ?? THEME_PRESETS[0]
  const foreground = overrides.foreground || preset.foreground
  const background = overrides.background || preset.background
  const font = overrides.font || ''
  return {
    ...preset,
    headlineFont: font || preset.headlineFont,
    bodyFont: font || preset.bodyFont,
    foreground,
    background,
    texture: overrides.texture || preset.texture,
    isDark: luminance(background) < 0.42,
  }
}
