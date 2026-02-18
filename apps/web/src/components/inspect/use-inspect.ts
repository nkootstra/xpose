import { useCallback, useEffect, useRef, useState } from 'react'

/** Matches InspectEntry from the CLI. */
export interface InspectEntry {
  id: string
  method: string
  path: string
  status: number
  duration: number
  timestamp: number
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  requestBody?: string | null
  responseBody?: string | null
  requestContentType?: string
  responseContentType?: string
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected'

/** Max entries kept in the browser to avoid unbounded memory growth. */
const MAX_BROWSER_ENTRIES = 500

interface UseInspectResult {
  entries: Array<InspectEntry>
  connectionState: ConnectionState
  clear: () => void
}

/**
 * React hook that connects to the CLI's local inspect WebSocket server.
 *
 * The server does NOT send historical data — the entry list starts empty
 * and is populated in real time as requests flow through the tunnel.
 * On reconnect the list is reset so the user always sees a fresh view.
 */
export function useInspect(port: number): UseInspectResult {
  const [entries, setEntries] = useState<Array<InspectEntry>>([])
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    setEntries([])
  }, [])

  useEffect(() => {
    let mounted = true

    function connect() {
      if (!mounted) return

      setConnectionState('connecting')
      // Start fresh on every (re)connect — no stale data
      setEntries([])

      const ws = new WebSocket(`ws://localhost:${port}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mounted) return
        setConnectionState('connected')
      }

      ws.onmessage = (event) => {
        if (!mounted) return
        try {
          const msg = JSON.parse(event.data as string)

          if (msg.type === 'connected') {
            // Server acknowledged the connection — nothing else to do,
            // the entry list is already empty.
            return
          }

          if (msg.type === 'entry') {
            setEntries((prev) => {
              const next = [...prev, msg.data as InspectEntry]
              return next.length > MAX_BROWSER_ENTRIES
                ? next.slice(next.length - MAX_BROWSER_ENTRIES)
                : next
            })
          }
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (!mounted) return
        setConnectionState('disconnected')
        reconnectTimer.current = setTimeout(connect, 2000)
      }

      ws.onerror = () => {
        // onclose will fire after this
      }
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [port])

  return { entries, connectionState, clear }
}
