/** The kinds of body content the inspect dashboard knows how to render. */
export type ContentKind = 'json' | 'xml' | 'html' | 'form' | 'text'

/**
 * Detect the content kind from a MIME content-type header value.
 *
 * Returns a coarse `ContentKind` that determines which renderer to use.
 * The mapping is intentionally simple — each kind maps to exactly one
 * rendering strategy.
 */
export function detectContentKind(
  contentType: string | undefined,
): ContentKind {
  if (!contentType) return 'text'

  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''

  if (mime === 'application/json' || mime.endsWith('+json')) return 'json'

  if (
    mime === 'application/xml' ||
    mime === 'text/xml' ||
    mime.endsWith('+xml')
  )
    return 'xml'

  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'

  if (mime === 'application/x-www-form-urlencoded') return 'form'

  return 'text'
}

/** Human-readable byte-size label (e.g. "2.4 KB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
