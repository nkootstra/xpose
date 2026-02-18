import { createHighlighterCoreSync, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import json from 'shiki/langs/json.mjs'
import xml from 'shiki/langs/xml.mjs'
import html from 'shiki/langs/html.mjs'
import githubDark from 'shiki/themes/github-dark.mjs'

/**
 * Singleton synchronous shiki highlighter.
 *
 * Uses the JavaScript regex engine (no WASM) and bundles only the
 * three grammars we actually need: JSON, XML, HTML.
 * Everything else falls back to plain text.
 */
let _highlighter: HighlighterCore | null = null

function getHighlighter(): HighlighterCore {
  if (!_highlighter) {
    _highlighter = createHighlighterCoreSync({
      themes: [githubDark],
      langs: [json, xml, html],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return _highlighter
}

/** Known languages we have grammars for. */
const SUPPORTED_LANGS = new Set(['json', 'xml', 'html'])

/**
 * Synchronously highlight `code` and return an HTML string.
 *
 * Falls back to a plain `<pre>` wrapper for unsupported languages so
 * consumers never need to handle errors.
 */
export function highlight(code: string, lang: string): string {
  const resolvedLang = SUPPORTED_LANGS.has(lang) ? lang : 'text'

  try {
    const highlighter = getHighlighter()
    return highlighter.codeToHtml(code, {
      lang: resolvedLang === 'text' ? 'json' : resolvedLang, // shiki needs a real grammar; fall back to json tokenizer for plain text appearance
      theme: 'github-dark',
    })
  } catch {
    // If highlighting fails for any reason, return unstyled code.
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<pre style="background:transparent"><code>${escaped}</code></pre>`
  }
}
