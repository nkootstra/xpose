/**
 * CSS-variable theme for @uiw/react-json-view.
 *
 * Matches the dark gray-950 background of the inspect dashboard
 * with VSCode-inspired token colors.
 */
export const jsonViewerTheme: Record<string, string> = {
  '--w-rjv-font-family':
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  '--w-rjv-color': '#9cdcfe',
  '--w-rjv-key-number': '#b5cea8',
  '--w-rjv-key-string': '#9cdcfe',
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-line-color': 'rgba(255,255,255,0.06)',
  '--w-rjv-arrow-color': '#6b7280',
  '--w-rjv-info-color': 'rgba(156,163,175,0.4)',
  '--w-rjv-copied-color': '#9cdcfe',
  '--w-rjv-copied-success-color': '#34d399',
  '--w-rjv-curlybraces-color': '#d4d4d4',
  '--w-rjv-colon-color': '#d4d4d4',
  '--w-rjv-brackets-color': '#d4d4d4',
  '--w-rjv-ellipsis-color': '#6b7280',
  '--w-rjv-quotes-color': '#9cdcfe',
  '--w-rjv-quotes-string-color': '#ce9178',
  '--w-rjv-type-string-color': '#ce9178',
  '--w-rjv-type-int-color': '#b5cea8',
  '--w-rjv-type-float-color': '#b5cea8',
  '--w-rjv-type-bigint-color': '#b5cea8',
  '--w-rjv-type-boolean-color': '#569cd6',
  '--w-rjv-type-date-color': '#b5cea8',
  '--w-rjv-type-url-color': '#3b89cf',
  '--w-rjv-type-null-color': '#569cd6',
  '--w-rjv-type-nan-color': '#859900',
  '--w-rjv-type-undefined-color': '#569cd6',
}
