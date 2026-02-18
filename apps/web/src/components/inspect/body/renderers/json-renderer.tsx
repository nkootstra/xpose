import { useCallback, useMemo, useRef, useState } from 'react'
import JsonView from '@uiw/react-json-view'
import { Search, X } from 'lucide-react'

import { jsonViewerTheme } from '../shared/json-theme'
import { CopyBodyButton } from '../shared/copy-button'
import { ViewToggle } from '../shared/view-toggle'
import { TextSearchBar } from '../search/text-search'
import { findMatchingPaths } from '../search/json-search'
import { highlight } from '../shared/highlighter'
import type { ViewMode } from '../shared/view-toggle'

interface JsonRendererProps {
  /** The parsed JSON value to display as a collapsible tree. */
  data: unknown
  /** The raw body string (used for the "Raw" view and copy). */
  raw: string
  /** Optional label shown before the toolbar (e.g. "XML (tree view)"). */
  label?: string
}

/**
 * Renders a JSON (or JSON-converted) body with:
 *   - a collapsible tree view  (Pretty)
 *   - a syntax-highlighted code view  (Raw)
 *   - search that auto-expands matching paths in the tree
 *   - copy-to-clipboard
 */
export function JsonRenderer({ data, raw, label }: JsonRendererProps) {
  const [mode, setMode] = useState<ViewMode>('pretty')
  const [searchQuery, setSearchQuery] = useState('')
  const rawContainerRef = useRef<HTMLDivElement | null>(null)

  // -----------------------------------------------------------------------
  // Search: compute matching key-paths for the tree view
  // -----------------------------------------------------------------------

  const matchingPaths = useMemo(() => {
    if (!searchQuery || mode !== 'pretty') return null
    return findMatchingPaths(data, searchQuery)
  }, [data, searchQuery, mode])

  const shouldExpand = useCallback(
    (
      _isExpanded: boolean,
      props: {
        value?: unknown
        keys: Array<string | number>
        level: number
      },
    ) => {
      if (matchingPaths && matchingPaths.size > 0) {
        return matchingPaths.has(props.keys.join('.'))
      }
      return props.level < 3
    },
    [matchingPaths],
  )

  // -----------------------------------------------------------------------
  // Shiki HTML for the Raw view (computed once, synchronously)
  // -----------------------------------------------------------------------

  const rawHtml = useMemo(() => highlight(raw, 'json'), [raw])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {label && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
            {label}
          </span>
        )}

        <ViewToggle mode={mode} onChange={setMode} />

        {mode === 'pretty' ? (
          <JsonSearchInput
            query={searchQuery}
            matchCount={matchingPaths?.size ?? null}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
          />
        ) : (
          <TextSearchBar containerRef={rawContainerRef} />
        )}

        <div className="ml-auto">
          <CopyBodyButton text={raw} />
        </div>
      </div>

      {/* Content */}
      {mode === 'pretty' ? (
        <div className="terminal-scroll max-h-[60vh] overflow-auto">
          <JsonView
            value={data as object}
            style={jsonViewerTheme}
            displayDataTypes={false}
            enableClipboard
            collapsed={matchingPaths && matchingPaths.size > 0 ? false : 3}
            shouldExpandNodeInitially={shouldExpand}
          />
        </div>
      ) : (
        <div
          ref={rawContainerRef}
          className="terminal-scroll max-h-[60vh] overflow-auto text-sm leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-0 [&_code]:text-sm"
          dangerouslySetInnerHTML={{ __html: rawHtml }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// JSON-specific search input (shows match count for paths, not DOM marks)
// ---------------------------------------------------------------------------

function JsonSearchInput({
  query,
  matchCount,
  onChange,
  onClear,
}: {
  query: string
  matchCount: number | null
  onChange: (q: string) => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1">
      <Search className="size-3.5 shrink-0 text-gray-500" />
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClear()
        }}
        placeholder="Search keys & values..."
        className="w-36 bg-transparent text-xs text-gray-300 placeholder:text-gray-600 focus:outline-none"
      />
      {query && matchCount !== null && (
        <span className="shrink-0 text-[10px] text-gray-500">
          {matchCount} match{matchCount !== 1 ? 'es' : ''}
        </span>
      )}
      {query && (
        <button
          type="button"
          onClick={onClear}
          className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
