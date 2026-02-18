import { useMemo, useState } from 'react'

import { useInspect } from './use-inspect'
import type { InspectEntry } from './use-inspect'
import { cn } from '@/lib/utils'

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

/** Decode base64 body to string. Returns null if not decodable as text. */
function decodeBody(b64: string | undefined): string | null {
  if (!b64) return null
  try {
    return atob(b64)
  } catch {
    return null
  }
}

/** Try to pretty-print JSON, otherwise return as-is. */
function prettyBody(raw: string | null): string {
  if (!raw) return '(empty)'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
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

  const requestBodyText = useMemo(
    () => decodeBody(entry.requestBody),
    [entry.requestBody],
  )
  const responseBodyText = useMemo(
    () => decodeBody(entry.responseBody),
    [entry.responseBody],
  )

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
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Headers
              </h4>
              <HeadersTable headers={entry.requestHeaders} />
            </div>
            {requestBodyText !== null && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Body
                </h4>
                <pre className="terminal-scroll max-h-80 overflow-auto rounded bg-black/30 p-3 font-mono text-xs text-gray-300">
                  {prettyBody(requestBodyText)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Headers
              </h4>
              <HeadersTable headers={entry.responseHeaders} />
            </div>
            {responseBodyText !== null && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Body
                </h4>
                <pre className="terminal-scroll max-h-80 overflow-auto rounded bg-black/30 p-3 font-mono text-xs text-gray-300">
                  {prettyBody(responseBodyText)}
                </pre>
              </div>
            )}
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

export function InspectDashboard({ port }: { port: number }) {
  const { entries, connectionState, clear } = useInspect(port)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  // Auto-select latest entry when nothing is selected
  const latestEntry =
    entries.length > 0 ? entries[entries.length - 1] : undefined

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
        <div className="terminal-scroll w-96 shrink-0 overflow-y-auto border-r border-white/10">
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
          ) : (
            [...entries].reverse().map((entry) => (
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
                </div>
              </button>
            ))
          )}
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
