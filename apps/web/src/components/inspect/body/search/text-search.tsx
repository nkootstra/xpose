import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'

/**
 * A search bar that highlights text matches inside a given DOM container.
 *
 * It walks the container's text nodes, wraps matches in `<mark>` elements,
 * and provides prev/next navigation with a match counter. The approach is
 * entirely DOM-based so it works with any rendered content (shiki HTML,
 * plain text, etc.) without coupling to a specific renderer.
 */
export function TextSearchBar({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [query, setQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const markElements = useRef<HTMLElement[]>([])

  // -----------------------------------------------------------------------
  // Highlight logic
  // -----------------------------------------------------------------------

  const applyHighlights = useCallback(
    (searchQuery: string) => {
      const container = containerRef.current
      if (!container) return

      clearMarks()

      if (!searchQuery) {
        setMatchCount(0)
        setCurrentIndex(0)
        return
      }

      const textNodes = collectTextNodes(container)
      const newMarks = markMatches(textNodes, searchQuery)

      markElements.current = newMarks
      setMatchCount(newMarks.length)
      setCurrentIndex(newMarks.length > 0 ? 1 : 0)

      if (newMarks.length > 0) {
        scrollToMark(newMarks[0]!)
      }
    },
    [containerRef],
  )

  const navigateTo = useCallback((index: number) => {
    const marks = markElements.current
    if (marks.length === 0) return

    // Remove active highlight from all marks
    for (const m of marks) m.classList.remove('!bg-yellow-400/50')

    const wrapped = ((index - 1 + marks.length) % marks.length) + 1
    setCurrentIndex(wrapped)
    const target = marks[wrapped - 1]
    if (target) scrollToMark(target)
  }, [])

  // Debounced highlight
  useEffect(() => {
    const timer = setTimeout(() => applyHighlights(query), 150)
    return () => clearTimeout(timer)
  }, [query, applyHighlights])

  // Clean up marks on unmount
  useEffect(() => clearMarks, [])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1">
      <Search className="size-3.5 shrink-0 text-gray-500" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            navigateTo(e.shiftKey ? currentIndex - 1 : currentIndex + 1)
          }
          if (e.key === 'Escape') setQuery('')
        }}
        placeholder="Search body..."
        className="w-32 bg-transparent text-xs text-gray-300 placeholder:text-gray-600 focus:outline-none"
      />

      {query && matchCount > 0 && (
        <span className="shrink-0 text-[10px] text-gray-500">
          {currentIndex}/{matchCount}
        </span>
      )}

      {query && matchCount > 0 && (
        <>
          <button
            type="button"
            onClick={() => navigateTo(currentIndex - 1)}
            className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
          >
            <ChevronUp className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => navigateTo(currentIndex + 1)}
            className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
          >
            <ChevronDown className="size-3" />
          </button>
        </>
      )}

      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )

  // -----------------------------------------------------------------------
  // Helpers (scoped to this component's mark refs)
  // -----------------------------------------------------------------------

  function clearMarks() {
    for (const el of markElements.current) {
      const parent = el.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent ?? ''), el)
        parent.normalize()
      }
    }
    markElements.current = []
  }
}

// ---------------------------------------------------------------------------
// Pure DOM helpers
// ---------------------------------------------------------------------------

function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  const nodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) nodes.push(node as Text)
  return nodes
}

function markMatches(textNodes: Text[], query: string): HTMLElement[] {
  const marks: HTMLElement[] = []
  const lowerQuery = query.toLowerCase()

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? ''
    const lowerText = text.toLowerCase()
    let idx = lowerText.indexOf(lowerQuery)
    if (idx === -1) continue

    const frag = document.createDocumentFragment()
    let lastIdx = 0

    while (idx !== -1) {
      if (idx > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)))
      }
      const mark = document.createElement('mark')
      mark.className = 'bg-yellow-500/30 text-yellow-200 rounded-sm px-px'
      mark.textContent = text.slice(idx, idx + query.length)
      frag.appendChild(mark)
      marks.push(mark)
      lastIdx = idx + query.length
      idx = lowerText.indexOf(lowerQuery, lastIdx)
    }

    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)))
    }

    textNode.parentNode?.replaceChild(frag, textNode)
  }

  return marks
}

function scrollToMark(el: HTMLElement) {
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('!bg-yellow-400/50')
}
