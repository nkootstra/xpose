import { useMemo, useRef } from 'react'

import { CopyBodyButton } from '../shared/copy-button'
import { TextSearchBar } from '../search/text-search'
import { highlight } from '../shared/highlighter'

interface CodeRendererProps {
  /** The raw source code / markup to display. */
  code: string
  /** The shiki language identifier (e.g. "html", "xml", "json"). */
  lang: string
}

/**
 * Renders a body as syntax-highlighted code with:
 *   - shiki highlighting (synchronous, no WASM)
 *   - DOM-based text search with match navigation
 *   - copy-to-clipboard
 *
 * Used for HTML, plain text, and as the fallback for unknown content types.
 */
export function CodeRenderer({ code, lang }: CodeRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const html = useMemo(() => highlight(code, lang), [code, lang])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <TextSearchBar containerRef={containerRef} />
        <div className="ml-auto">
          <CopyBodyButton text={code} />
        </div>
      </div>

      <div
        ref={containerRef}
        className="terminal-scroll max-h-[60vh] overflow-auto text-sm leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-0 [&_code]:text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
