export interface Tunnel {
  id: string
  url: string
  localTarget: string
  status: 'active' | 'idle' | 'error'
  createdAt: string
  requestCount: number
}

function getRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / (1000 * 60))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const statusColors: Record<Tunnel['status'], string> = {
  active: 'bg-green-500',
  idle: 'bg-yellow-500',
  error: 'bg-red-500',
}

export function TunnelCard({ tunnel }: { tunnel: Tunnel }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <p className="truncate font-mono text-sm text-gray-50">
          {tunnel.url}
        </p>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block size-2 rounded-full ${statusColors[tunnel.status]}`}
          />
          <span className="text-xs capitalize text-gray-400">
            {tunnel.status}
          </span>
        </div>
      </div>

      <p className="mt-1 text-xs text-gray-400">{tunnel.localTarget}</p>

      <div className="mt-3 flex items-center gap-3">
        <span className="tabular-nums text-xs text-gray-400">
          {tunnel.requestCount} requests
        </span>
        <span className="tabular-nums text-xs text-gray-400">
          {getRelativeTime(tunnel.createdAt)}
        </span>
      </div>
    </div>
  )
}
