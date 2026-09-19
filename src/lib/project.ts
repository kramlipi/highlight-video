export type ToolId =
  | 'board'
  | 'script'
  | 'highlight'
  | 'cartoon'
  | 'vertical'
  | 'captions'
  | 'titles'
  | 'thumb'
  | 'publish'

export type CaptionLang = 'en' | 'hi'

export type CutOptions = {
  silence: boolean
  still: boolean
  cartoon: boolean
  subtitles: boolean
}

export type ProjectState = {
  markdown: string
  transcript: string
  srt: string
  chunkedSrt: string
  captionLang: CaptionLang
  workingTitle: string
  pinnedComment: string
  hook: string
  cut: CutOptions
}

export type ToolMeta = {
  id: ToolId
  label: string
  blurb: string
  group: string
}

export const TOOLS: ToolMeta[] = [
  { id: 'board', label: 'Choose', blurb: 'Pick the job you want to do', group: 'Start' },
  { id: 'script', label: 'Script', blurb: 'Write the episode in Markdown', group: 'Write' },
  { id: 'titles', label: 'Titles', blurb: 'YouTube title formulas', group: 'Write' },
  { id: 'highlight', label: 'Highlight', blurb: 'Article clip with yellow marker', group: 'Picture' },
  { id: 'vertical', label: 'Shorts', blurb: 'One long video → many 9:16 reels', group: 'Picture' },
  { id: 'cartoon', label: 'Cartoon cut', blurb: 'Silence, stills, talking face, subs', group: 'Picture' },
  { id: 'thumb', label: 'Thumb', blurb: '1280×720 thumbnail card', group: 'Picture' },
  { id: 'captions', label: 'Captions', blurb: 'SRT, karaoke chunks, live speech', group: 'Audio' },
  { id: 'publish', label: 'Publish', blurb: 'Description, chapters, tags, pack', group: 'Ship' },
]

export const TOOL_IDS = TOOLS.map((tool) => tool.id)

export const DEFAULT_CUT: CutOptions = {
  silence: true,
  still: false,
  cartoon: true,
  subtitles: true,
}
