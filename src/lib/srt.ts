export type SrtCue = {
  index: number
  start: number
  end: number
  text: string
}

export function parseSrt(raw: string): SrtCue[] {
  const blocks = raw.replace(/\r/g, '').trim().split(/\n\s*\n/)
  const cues: SrtCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.length > 0)
    if (lines.length < 2) continue
    const timeLine = lines[0]?.includes('-->') ? lines[0] : lines[1]
    if (!timeLine?.includes('-->')) continue
    const [startStr, endStr] = timeLine.split('-->').map((part) => part.trim())
    const textLines = lines[0]?.includes('-->') ? lines.slice(1) : lines.slice(2)
    cues.push({
      index: cues.length + 1,
      start: convertTime(startStr),
      end: convertTime(endStr),
      text: textLines.join(' ').trim(),
    })
  }
  return cues
}

export function stringifySrt(cues: SrtCue[]): string {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timeToStr(cue.start)} --> ${timeToStr(cue.end)}\n${cue.text}\n`,
    )
    .join('\n')
}

export function convertTime(timeStr: string): number {
  const clean = timeStr.replace('.', ',')
  const [hms, ms = '0'] = clean.split(',')
  const parts = hms.split(':').map((part) => Number(part) || 0)
  const hours = parts.length === 3 ? parts[0] : 0
  const minutes = parts.length === 3 ? parts[1] : parts[0] || 0
  const seconds = parts.length === 3 ? parts[2] : parts[1] || 0
  return hours * 3600 + minutes * 60 + seconds + Number(ms) / 1000
}

export function timeToStr(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const h = Math.floor(clamped / 3600)
  const m = Math.floor(clamped / 60) % 60
  const s = Math.floor(clamped % 60)
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function youtubeTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Port of video_transcriber/second-pass-srt.py — 1–2 word karaoke chunks. */
export function chunkSrt(cues: SrtCue[]): SrtCue[] {
  const out: SrtCue[] = []
  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean)
    const chunks: string[][] = []
    for (let i = 0; i < words.length; i += 2) {
      chunks.push(words.slice(i, i + 2))
    }
    let current = cue.start
    for (const chunk of chunks) {
      const span = chunk.length * 0.5
      const end = Math.min(cue.end, current + span)
      out.push({
        index: out.length + 1,
        start: current,
        end: Math.max(end, current + 0.12),
        text: chunk.join(' '),
      })
      current = end
    }
  }
  return out
}

export function transcriptToSrt(transcript: string, wordsPerSecond = 2.4): SrtCue[] {
  const sentences = transcript
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  let t = 0
  return sentences.map((text, index) => {
    const duration = Math.max(1.2, text.split(/\s+/).length / wordsPerSecond)
    const cue = { index: index + 1, start: t, end: t + duration, text }
    t += duration
    return cue
  })
}

export function activeCue(cues: SrtCue[], time: number): SrtCue | undefined {
  return cues.find((cue) => time >= cue.start && time < cue.end) ?? cues[cues.length - 1]
}
