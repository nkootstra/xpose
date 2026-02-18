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
  requestBody?: string // base64
  responseBody?: string // base64
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected'

interface UseInspectResult {
  entries: Array<InspectEntry>
  connectionState: ConnectionState
  clear: () => void
}

/**
 * React hook that connects to the CLI's local inspect WebSocket server.
 * Receives the initial snapshot and live entries via WS.
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
          if (msg.type === 'snapshot') {
            setEntries(msg.data as Array<InspectEntry>)
          } else if (msg.type === 'entry') {
            setEntries((prev) => {
              const next = [...prev, msg.data as InspectEntry]
              // Keep max 500 in the browser
              return next.length > 500 ? next.slice(next.length - 500) : next
            })
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        if (!mounted) return
        setConnectionState('disconnected')
        // Reconnect after 2s
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
