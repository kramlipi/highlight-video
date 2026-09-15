import type { Ref } from 'react'
import { ArticleDocument } from './ArticleDocument'
import { typewriterClipPath } from '../lib/motion'
import type { FrameState, LayoutMetrics, LayoutMode, ResolvedTheme } from '../lib/types'

type PreviewStageProps = {
  html: string
  theme: ResolvedTheme
  layout: LayoutMode
  metrics: LayoutMetrics
  frame: FrameState
  fit: number
  sheetRef: Ref<HTMLDivElement>
}

export function PreviewStage({
  html,
  theme,
  layout,
  metrics,
  frame,
  fit,
  sheetRef,
}: PreviewStageProps) {
  const clip =
    frame.typewriterProgress < 0.999
      ? typewriterClipPath(metrics.lines, frame.typewriterProgress, metrics.articleWidth)
      : 'none'

  return (
    <div className="preview-shell">
      <div
        className="stage-frame"
        style={{
          width: metrics.stageWidth * fit,
          height: metrics.stageHeight * fit,
        }}
      >
        <div
          className="stage-viewport"
          style={{
            width: metrics.stageWidth,
            height: metrics.stageHeight,
            transform: `scale(${fit})`,
          }}
        >
          <div
            className="stage-camera"
            style={{
              transform: `translate(${-frame.camera.x * frame.camera.scale}px, ${-frame.camera.y * frame.camera.scale}px) scale(${frame.camera.scale})`,
            }}
          >
            <div className="stage-clip" style={{ clipPath: clip }}>
              <ArticleDocument
                ref={sheetRef}
                html={html}
                theme={theme}
                layout={layout}
                width={metrics.stageWidth}
                minHeight={metrics.stageHeight}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
