export type ToolId =
  | 'board'
  | 'script'
  | 'highlight'
  | 'captions'
  | 'titles'
  | 'thumb'
  | 'publish'

export type CaptionLang = 'en' | 'hi'

export type ProjectState = {
  markdown: string
  transcript: string
  srt: string
  chunkedSrt: string
  captionLang: CaptionLang
  workingTitle: string
  pinnedComment: string
  hook: string
}

export const TOOLS: { id: ToolId; label: string; blurb: string }[] = [
  { id: 'board', label: 'Board', blurb: 'One workflow from idea to upload pack' },
  { id: 'script', label: 'Script', blurb: 'Write the episode in Markdown' },
  { id: 'highlight', label: 'Highlight', blurb: 'Article clip with yellow marker' },
  { id: 'captions', label: 'Captions', blurb: 'SRT, karaoke chunks, live speech' },
  { id: 'titles', label: 'Titles', blurb: 'YouTube title formulas' },
  { id: 'thumb', label: 'Thumb', blurb: '1280×720 thumbnail card' },
  { id: 'publish', label: 'Publish', blurb: 'Description, chapters, tags, pack' },
]
