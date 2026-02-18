import { useMemo, useState } from 'react'

import { useInspect } from './use-inspect'
import type { InspectEntry } from './use-inspect'
import { BodyViewer } from './body/body-viewer'
import { cn } from '@/lib/utils'
import { FileJson, FileText, FileCode, Globe, Search, X } from 'lucide-react'

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-cyan-400',
  HEAD: 'text-cyan-400',
  POST: 'text-green-400',
  PUT: 'text-yellow-400',
  DELETE: 'text-red-400',
  PATCH: 'text-purple-400',
  OPTIONS: 'text-gray-400',
}

function statusColor(status: number): string {
  if (status >= 500) return 'text-red-400'
  if (status >= 400) return 'text-yellow-400'
  if (status >= 300) return 'text-cyan-400'
  if (status >= 200) return 'text-green-400'
  return 'text-gray-400'
}

function statusBg(status: number): string {
  if (status >= 500) return 'bg-red-500/10'
  if (status >= 400) return 'bg-yellow-500/10'
  if (status >= 300) return 'bg-cyan-500/10'
  if (status >= 200) return 'bg-green-500/10'
  return 'bg-gray-500/10'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatBodySize(body: string): string {
  const bytes = new TextEncoder().encode(body).byteLength
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers)
  if (entries.length === 0)
    return <span className="text-gray-500 text-sm">No headers</span>
  return (
    <div className="terminal-scroll max-h-60 overflow-auto">
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b border-white/5 last:border-0">
              <td className="py-1 pr-3 font-mono text-blue-400 whitespace-nowrap align-top">
                {key}
              </td>
              <td className="py-1 font-mono text-gray-300 break-all">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailPanel({ entry }: { entry: InspectEntry }) {
  const [tab, setTab] = useState<'request' | 'response'>('response')

  return (
    <div className="flex h-full flex-col">
      {/* Summary bar */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span
          className={cn(
            'font-mono text-sm font-bold',
            METHOD_COLORS[entry.method] ?? 'text-gray-300',
          )}
        >
          {entry.method}
        </span>
        <span className="truncate font-mono text-sm text-gray-300">
          {entry.path}
        </span>
        <span
          className={cn(
            'ml-auto rounded px-2 py-0.5 font-mono text-xs font-medium',
            statusBg(entry.status),
            statusColor(entry.status),
          )}
        >
          {entry.status}
        </span>
        <span className="font-mono text-xs text-gray-500">
          {formatDuration(entry.duration)}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          type="button"
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            tab === 'request'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300',
          )}
          onClick={() => setTab('request')}
        >
          Request
        </button>
        <button
          type="button"
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            tab === 'response'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300',
          )}
          onClick={() => setTab('response')}
        >
          Response
        </button>
      </div>

      {/* Content */}
      <div className="terminal-scroll flex-1 overflow-auto p-4">
        {tab === 'request' ? (
          <div className="flex flex-col gap-6">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Headers
              </h4>
              <HeadersTable headers={entry.requestHeaders} />
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Body
              </h4>
              <BodyViewer
                body={entry.requestBody}
                contentType={entry.requestContentType}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Headers
              </h4>
              <HeadersTable headers={entry.responseHeaders} />
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Body
              </h4>
              <BodyViewer
                body={entry.responseBody}
                contentType={entry.responseContentType}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionBadge({
  state,
}: {
  state: 'connecting' | 'connected' | 'disconnected'
}) {
  const styles = {
    connecting: 'bg-yellow-500/20 text-yellow-400',
    connected: 'bg-green-500/20 text-green-400',
    disconnected: 'bg-red-500/20 text-red-400',
  }
  const labels = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        styles[state],
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', {
          'bg-yellow-400 animate-pulse': state === 'connecting',
          'bg-green-400': state === 'connected',
          'bg-red-400': state === 'disconnected',
        })}
      />
      {labels[state]}
    </span>
  )
}

function contentTypeIcon(contentType: string | undefined) {
  if (!contentType) return null
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (mime === 'application/json' || mime.endsWith('+json'))
    return <FileJson className="size-3 text-yellow-500/60" />
  if (mime.includes('xml'))
    return <FileCode className="size-3 text-orange-500/60" />
  if (mime === 'text/html' || mime === 'application/xhtml+xml')
    return <Globe className="size-3 text-blue-500/60" />
  if (mime.startsWith('text/'))
    return <FileText className="size-3 text-gray-500/60" />
  return null
}

export function InspectDashboard({ port }: { port: number }) {
  const { entries, connectionState, clear } = useInspect(port)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const filteredEntries = useMemo(() => {
    if (!filter) return entries
    const lf = filter.toLowerCase()
    return entries.filter(
      (e) =>
        e.path.toLowerCase().includes(lf) ||
        e.method.toLowerCase().includes(lf) ||
        String(e.status).includes(lf),
    )
  }, [entries, filter])

  // Auto-select latest entry when nothing is selected
  const latestEntry =
    filteredEntries.length > 0
      ? filteredEntries[filteredEntries.length - 1]
      : undefined

  return (
    <div className="flex h-dvh flex-col bg-gray-950 text-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-200">
            xpose
            <span className="ml-1.5 text-gray-500">inspect</span>
          </h1>
          <ConnectionBadge state={connectionState} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {entries.length} request{entries.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={clear}
            className="rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Request list */}
        <div className="flex w-96 shrink-0 flex-col border-r border-white/10">
          {/* Filter input */}
          {entries.length > 0 && (
            <div className="border-b border-white/10 px-3 py-2">
              <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
                <Search className="size-3.5 shrink-0 text-gray-500" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setFilter('')
                  }}
                  placeholder="Filter by path, method, status..."
                  className="w-full bg-transparent text-xs text-gray-300 placeholder:text-gray-600 focus:outline-none"
                />
                {filter && (
                  <button
                    type="button"
                    onClick={() => setFilter('')}
                    className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="terminal-scroll flex-1 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                <div className="mb-3 text-3xl">
                  {connectionState === 'connected' ? '⏳' : '🔌'}
                </div>
                <p className="text-sm text-gray-500">
                  {connectionState === 'connected'
                    ? 'Waiting for requests...'
                    : connectionState === 'connecting'
                      ? 'Connecting to inspect server...'
                      : 'Could not connect. Is xpose running with --inspect?'}
                </p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                <p className="text-sm text-gray-500">
                  No requests match &ldquo;{filter}&rdquo;
                </p>
              </div>
            ) : (
              [...filteredEntries].reverse().map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    'w-full border-b border-white/5 px-4 py-2.5 text-left transition-colors',
                    selectedId === entry.id
                      ? 'bg-white/[0.07]'
                      : 'hover:bg-white/[0.03]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-16 shrink-0 font-mono text-xs font-bold',
                        METHOD_COLORS[entry.method] ?? 'text-gray-300',
                      )}
                    >
                      {entry.method}
                    </span>
                    <span className="truncate font-mono text-xs text-gray-300">
                      {entry.path}
                    </span>
                    {contentTypeIcon(entry.responseContentType)}
                    <span
                      className={cn(
                        'ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium',
                        statusBg(entry.status),
                        statusColor(entry.status),
                      )}
                    >
                      {entry.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-600">
                    <span>{formatTime(entry.timestamp)}</span>
                    <span>{formatDuration(entry.duration)}</span>
                    {entry.responseBody && (
                      <span className="text-gray-700">
                        {formatBodySize(entry.responseBody)}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="min-w-0 flex-1">
          {selected ? (
            <DetailPanel entry={selected} />
          ) : latestEntry ? (
            <DetailPanel entry={latestEntry} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-600">
              Select a request to inspect
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
