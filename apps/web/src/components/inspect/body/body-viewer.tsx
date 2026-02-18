import { XMLParser } from 'fast-xml-parser'

import { detectContentKind, formatBytes } from './types'
import { JsonRenderer } from './renderers/json-renderer'
import { CodeRenderer } from './renderers/code-renderer'
import { FormRenderer } from './renderers/form-renderer'

// ---------------------------------------------------------------------------
// Parsers — each returns `null` on failure so the orchestrator can fall back.
// ---------------------------------------------------------------------------

function tryParseJson(body: string): unknown | null {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  preserveOrder: false,
  trimValues: true,
})

function tryParseXml(body: string): unknown | null {
  try {
    const trimmed = body.trimStart()
    if (!trimmed.startsWith('<')) return null
    return xmlParser.parse(body)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Shiki language mapping
// ---------------------------------------------------------------------------

const SHIKI_LANG: Record<string, string> = {
  html: 'html',
  xml: 'xml',
  json: 'json',
  text: 'json', // fallback grammar — gives reasonable tokenisation for most text
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface BodyViewerProps {
  body: string | null | undefined
  contentType: string | undefined
}

/**
 * Orchestrator component that detects the content kind from the
 * `Content-Type` header and delegates to the appropriate renderer.
 *
 * Each renderer is a standalone component that handles its own
 * search, copy, and view-toggle concerns (Single Responsibility).
 *
 * New content kinds can be added by:
 *   1. Adding a case to `ContentKind` in `types.ts`
 *   2. Creating a new renderer in `renderers/`
 *   3. Adding a branch below (Open/Closed via strategy-like dispatch)
 */
export function BodyViewer({ body, contentType }: BodyViewerProps) {
  if (!body) {
    return <span className="text-sm italic text-gray-500">No body</span>
  }

  const kind = detectContentKind(contentType)
  const sizeLabel = formatBytes(new TextEncoder().encode(body).byteLength)

  return (
    <div className="flex flex-col gap-2">
      {/* Metadata badges */}
      <div className="flex items-center gap-2">
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
          {sizeLabel}
        </span>
        {kind !== 'text' && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase text-gray-500">
            {kind}
          </span>
        )}
      </div>

      {/* Delegate to the correct renderer */}
      <BodyRendererSwitch body={body} kind={kind} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Renderer dispatch — keeps the main export slim
// ---------------------------------------------------------------------------

function BodyRendererSwitch({
  body,
  kind,
}: {
  body: string
  kind: ReturnType<typeof detectContentKind>
}) {
  // JSON ----------------------------------------------------------------
  if (kind === 'json') {
    const parsed = tryParseJson(body)
    if (parsed !== null) {
      return (
        <JsonRenderer data={parsed} raw={JSON.stringify(parsed, null, 2)} />
      )
    }
    // Malformed JSON — fall through to code view
  }

  // XML → convert to JSON tree -----------------------------------------
  if (kind === 'xml') {
    const parsed = tryParseXml(body)
    if (parsed !== null) {
      return <JsonRenderer data={parsed} raw={body} label="XML (tree view)" />
    }
  }

  // Form URL-encoded ---------------------------------------------------
  if (kind === 'form') {
    return <FormRenderer body={body} />
  }

  // HTML / plain text / fallback ----------------------------------------
  return <CodeRenderer code={body} lang={SHIKI_LANG[kind] ?? 'json'} />
}
