import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArticleDocument } from '../components/ArticleDocument'
import { ControlsPanel } from '../components/ControlsPanel'
import { EditorPanel } from '../components/EditorPanel'
import { PreviewStage } from '../components/PreviewStage'
import { useProject } from '../context/ProjectContext'
import { downloadBlob, exportArticleVideo } from '../lib/exportVideo'
import { renderMarkdown } from '../lib/markdown'
import { measureArticle } from '../lib/metrics'
import { emptyMetrics, getFrameState, sequentialHighlightProgress } from '../lib/motion'
import { SAMPLE_MARKDOWN } from '../lib/sample'
import { resolveTheme } from '../lib/themes'
import type { LayoutMode, MotionMode, TextureId } from '../lib/types'
import { STAGE } from '../lib/types'

export function HighlightStudio() {
  const { project, patch } = useProject()
  const [layout, setLayout] = useState<LayoutMode>('vertical')
  const [themeId, setThemeId] = useState('modern')
  const [font, setFont] = useState('')
  const [foreground, setForeground] = useState('')
  const [background, setBackground] = useState('')
  const [texture, setTexture] = useState<TextureId | ''>('')
  const [motion, setMotion] = useState<MotionMode>('highlight-draw')
  const [duration, setDuration] = useState(12)
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [error, setError] = useState('')
  const [fit, setFit] = useState(0.28)

  const theme = useMemo(
    () => resolveTheme(themeId, { font, foreground, background, texture }),
    [themeId, font, foreground, background, texture],
  )
  const html = useMemo(() => renderMarkdown(project.markdown), [project.markdown])
  const stage = STAGE[layout]
  const measureRef = useRef<HTMLDivElement>(null)
  const previewSheetRef = useRef<HTMLDivElement>(null)
  const previewHostRef = useRef<HTMLElement>(null)
  const progressRef = useRef(0)
  const [metrics, setMetrics] = useState(() => emptyMetrics(stage.width, stage.height))

  useEffect(() => {
    const sheet = previewSheetRef.current
    if (!sheet) return
    let cancelled = false
    const run = async () => {
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (cancelled || !previewSheetRef.current) return
      setMetrics(measureArticle(previewSheetRef.current, stage.width, stage.height))
    }
    void run()
    const observer = new ResizeObserver(() => void run())
    observer.observe(sheet)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [html, theme, layout, stage.width, stage.height])

  useEffect(() => {
    const host = previewHostRef.current
    if (!host) return
    const updateFit = () => {
      const padding = 36
      const next = Math.min(
        (host.clientWidth - padding) / stage.width,
        (host.clientHeight - padding) / stage.height,
        1,
      )
      setFit(Math.max(0.1, next))
    }
    updateFit()
    const observer = new ResizeObserver(updateFit)
    observer.observe(host)
    return () => observer.disconnect()
  }, [stage.width, stage.height])

  useEffect(() => {
    if (!playing || exporting) return
    const start = performance.now() - progressRef.current * duration * 1000
    let raf = 0
    const loop = (now: number) => {
      let next = ((now - start) / 1000 / duration) % 1
      if (next < 0) next += 1
      progressRef.current = next
      setProgress(next)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration, exporting])

  const frame = useMemo(() => getFrameState(motion, progress, metrics), [motion, progress, metrics])

  useEffect(() => {
    const apply = (root: HTMLElement | null) => {
      if (!root) return
      const nodes = [...root.querySelectorAll<HTMLElement>('.md-highlight')]
      const values =
        frame.highlightProgress.length === nodes.length && nodes.length > 0
          ? frame.highlightProgress
          : sequentialHighlightProgress(motion, progress, nodes.length)
      nodes.forEach((node, index) => {
        node.style.setProperty('--hl', String(values[index] ?? 0))
      })
    }
    apply(previewSheetRef.current)
    apply(measureRef.current)
  }, [frame, motion, html, progress])

  const onExport = useCallback(async () => {
    const sheet = measureRef.current
    if (!sheet) return
    setError('')
    setExporting(true)
    setExportProgress(0)
    setPlaying(false)
    try {
      const latest = measureArticle(sheet, stage.width, stage.height)
      setMetrics(latest)
      const result = await exportArticleVideo({
        sheet,
        layout: latest,
        mode: motion,
        durationSec: duration,
        theme,
        onProgress: setExportProgress,
      })
      downloadBlob(result.blob, result.filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }, [duration, motion, stage.height, stage.width, theme])

  return (
    <div className="highlight-grid">
      <EditorPanel
        markdown={project.markdown}
        onChange={(value) => patch({ markdown: value })}
        onLoadSample={() => patch({ markdown: SAMPLE_MARKDOWN })}
      />
      <main className="preview-panel" ref={previewHostRef}>
        <PreviewStage
          html={html}
          theme={theme}
          layout={layout}
          metrics={metrics}
          frame={frame}
          fit={fit}
          sheetRef={previewSheetRef}
        />
        {error ? <p className="export-error">{error}</p> : null}
      </main>
      <ControlsPanel
        layout={layout}
        onLayout={setLayout}
        themeId={themeId}
        onThemeId={setThemeId}
        font={font}
        onFont={setFont}
        foreground={theme.foreground}
        onForeground={setForeground}
        background={theme.background}
        onBackground={setBackground}
        texture={texture}
        onTexture={setTexture}
        motion={motion}
        onMotion={setMotion}
        duration={duration}
        onDuration={setDuration}
        playing={playing}
        onTogglePlay={() => setPlaying((value) => !value)}
        progress={progress}
        onScrub={(value) => {
          setPlaying(false)
          setProgress(value)
          progressRef.current = value
        }}
        exporting={exporting}
        exportProgress={exportProgress}
        onExport={() => void onExport()}
      />
      <div className="measure-host" aria-hidden="true">
        <ArticleDocument
          ref={measureRef}
          html={html}
          theme={theme}
          layout={layout}
          width={stage.width}
          minHeight={stage.height}
        />
      </div>
    </div>
  )
}
