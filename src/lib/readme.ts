export type SnippetId =
  | 'mermaid-flow'
  | 'mermaid-sequence'
  | 'mermaid-pie'
  | 'mermaid-class'
  | 'table'
  | 'code'
  | 'tasks'
  | 'badge'
  | 'quote'
  | 'details'

export const README_SNIPPETS: Record<SnippetId, { label: string; text: string }> = {
  'mermaid-flow': {
    label: 'Mermaid flow',
    text: `
\`\`\`mermaid
flowchart LR
  A[Drop README.md] --> B[Add images]
  B --> C[Mermaid diagrams]
  C --> D[Preview]
  D --> E[Highlight clip]
\`\`\`
`,
  },
  'mermaid-sequence': {
    label: 'Mermaid sequence',
    text: `
\`\`\`mermaid
sequenceDiagram
  participant You
  participant Shotflow
  You->>Shotflow: paste markdown
  Shotflow->>You: live README preview
  You->>Shotflow: export highlighter
\`\`\`
`,
  },
  'mermaid-pie': {
    label: 'Mermaid pie',
    text: `
\`\`\`mermaid
pie showData
  title Clip mix
  "Shorts": 45
  "Captions": 25
  "Highlight": 20
  "Thumb": 10
\`\`\`
`,
  },
  'mermaid-class': {
    label: 'Mermaid class',
    text: `
\`\`\`mermaid
classDiagram
  class Readme {
    +images
    +mermaid
    +tables
  }
  class Highlight {
    +yellow marker
  }
  Readme --> Highlight : send
\`\`\`
`,
  },
  table: {
    label: 'Table',
    text: `
| Step | Tool | Output |
| --- | --- | --- |
| 1 | Readme | README.md |
| 2 | Highlight | article MP4 |
| 3 | Shorts | 9:16 clips |
`,
  },
  code: {
    label: 'Code',
    text: `
\`\`\`ts
npm run dev
\`\`\`
`,
  },
  tasks: {
    label: 'Tasks',
    text: `
- [x] Write the README
- [ ] Drop screenshots
- [ ] Add a mermaid diagram
`,
  },
  badge: {
    label: 'Badge',
    text: `
[![Shotflow](https://img.shields.io/badge/Shotflow-README-d8ff3e?style=flat-square)](https://highlight-video.cluevion.workers.dev)
`,
  },
  quote: {
    label: 'Quote',
    text: `
> One README. Images, diagrams, tables, then a highlighter clip.
`,
  },
  details: {
    label: 'Details',
    text: `
<details>
<summary>More</summary>

Notes, caveats, or extra diagrams go here.

</details>
`,
  },
}

export function insertAtCursor(source: string, snippet: string, start: number, end: number) {
  const text = snippet.replace(/^\n/, '').replace(/\n$/, '')
  const before = source.slice(0, start)
  const after = source.slice(end)
  const padBefore = before && !before.endsWith('\n') ? '\n\n' : before.endsWith('\n') && !before.endsWith('\n\n') ? '\n' : ''
  const padAfter = after && !after.startsWith('\n') ? '\n\n' : ''
  const next = `${before}${padBefore}${text}${padAfter}${after}`
  const caret = (before + padBefore + text).length
  return { next, caret }
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (file.type === 'image/svg+xml' || file.size < 48_000) {
    return readAsDataUrl(file)
  }
  try {
    const bitmap = await createImageBitmap(file)
    const max = 1400
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return readAsDataUrl(file)
    ctx.drawImage(bitmap, 0, 0, width, height)
    const mime = file.type.includes('png') ? 'image/png' : 'image/jpeg'
    return canvas.toDataURL(mime, 0.86)
  } catch {
    return readAsDataUrl(file)
  }
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function imageMarkdown(file: File, dataUrl: string) {
  const alt = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'image'
  return `![${alt}](${dataUrl})`
}

export const SAMPLE_README = `# Shotflow

[![Shotflow](https://img.shields.io/badge/Shotflow-README-d8ff3e?style=flat-square)](https://highlight-video.cluevion.workers.dev)

Turn one long landscape video into **many 9:16 shorts**, then add captions, a highlighter article clip, and a publish pack.

## Why this desk

Drop a \`README.md\`, paste mermaid, and drop screenshots. The preview on the right is what GitHub would show — then send it to Highlight for a yellow-marker clip.

\`\`\`mermaid
flowchart LR
  Readme[README.md] --> Images[Images]
  Readme --> Mermaid[Mermaid]
  Images --> Preview
  Mermaid --> Preview
  Preview --> Highlight[Highlighter MP4]
\`\`\`

## Insert menu

| Button | What it adds |
| --- | --- |
| Image | Screenshot or diagram, compressed in the browser |
| Mermaid | Flow, sequence, pie, or class chart |
| Table / code / tasks | GitHub-flavored README blocks |

- [x] Live preview
- [x] Mermaid diagrams
- [ ] Your screenshots

> Wrap the line you want painted in **bold**. Highlight uses that.

\`\`\`bash
npm run dev
\`\`\`
`
