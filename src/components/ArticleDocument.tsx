import { forwardRef } from 'react'
import type { LayoutMode, ResolvedTheme } from '../lib/types'

type ArticleDocumentProps = {
  html: string
  theme: ResolvedTheme
  layout: LayoutMode
  width: number
  minHeight: number
}

export const ArticleDocument = forwardRef<HTMLDivElement, ArticleDocumentProps>(
  function ArticleDocument({ html, theme, layout, width, minHeight }, ref) {
    return (
      <div
        ref={ref}
        className={`article-sheet texture-${theme.texture} ${theme.isDark ? 'is-dark' : 'is-light'}`}
        data-layout={layout}
        data-theme={theme.id}
        style={{
          width,
          minHeight,
          ['--article-fg' as string]: theme.foreground,
          ['--article-bg' as string]: theme.background,
          ['--article-muted' as string]: theme.muted,
          ['--article-accent' as string]: theme.accent,
          ['--article-head' as string]: theme.headlineFont,
          ['--article-body' as string]: theme.bodyFont,
          ['--article-highlight' as string]: theme.highlight,
        }}
      >
        <div className="article-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    )
  },
)
