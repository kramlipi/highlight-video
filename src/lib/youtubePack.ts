import { youtubeTime } from './srt'

export function stripMd(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/[_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return stripMd(match?.[1] ?? 'Untitled episode')
}

export function extractBolds(markdown: string): string[] {
  return [...markdown.matchAll(/\*\*(.+?)\*\*/g)].map((match) => stripMd(match[1]))
}

export function extractHeadings(markdown: string): string[] {
  return [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => stripMd(match[1]))
}

export function makeTitles(markdown: string): string[] {
  const topic = extractTitle(markdown)
  const hook = extractBolds(markdown)[0] || topic
  const seen = new Set<string>()
  const list = [
    topic,
    `${hook}: what they buried`,
    `The ${hook} paper trail`,
    `Why ${hook} still matters`,
    `${topic} (watch this first)`,
    `Stop falling for ${hook}`,
    `I read the files on ${hook}`,
    `${hook} — explained without the spin`,
  ]
  return list.filter((title) => {
    const key = title.toLowerCase()
    if (seen.has(key) || title.length < 8) return false
    seen.add(key)
    return true
  })
}

export function makeChapters(markdown: string): { time: string; title: string }[] {
  const headings = extractHeadings(markdown)
  if (headings.length === 0) {
    return [
      { time: '0:00', title: 'Hook' },
      { time: '0:20', title: extractTitle(markdown) },
      { time: '1:10', title: 'The receipts' },
      { time: '2:40', title: 'What to do next' },
    ]
  }
  return headings.map((title, index) => ({
    time: youtubeTime(index * 48),
    title,
  }))
}

export function makeTags(markdown: string): string[] {
  const words = `${extractTitle(markdown)} ${extractBolds(markdown).join(' ')}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3)
  const extras = [
    'youtube',
    'explained',
    'documentary',
    'highlights',
    'captions',
    'infographic',
  ]
  return [...new Set([...words.slice(0, 8), ...extras])].slice(0, 14)
}

export function makeHook(markdown: string): string {
  const bold = extractBolds(markdown)[0]
  if (bold) return `They didn't want this next to ${bold}.`
  return `Here's the part most videos skip.`
}

export function makeDescription(options: {
  markdown: string
  title: string
  hook: string
  chapters: { time: string; title: string }[]
  tags: string[]
}): string {
  const { markdown, title, hook, chapters, tags } = options
  const body = markdown
    .replace(/^#.+$/m, '')
    .replace(/\*\*/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('\n\n')
  const stamps = chapters.map((item) => `${item.time} ${item.title}`).join('\n')
  const hashes = tags.slice(0, 8).map((tag) => `#${tag.replace(/\s+/g, '')}`).join(' ')
  return `${title}

${hook}

${body}

Timestamps
${stamps}

If this helped, subscribe for the next paper-trail episode.

${hashes}
`
}

export function makePinnedComment(title: string, hook: string): string {
  return `${hook} Full sources are in the description. Which line should I highlight next? — ${title}`
}
