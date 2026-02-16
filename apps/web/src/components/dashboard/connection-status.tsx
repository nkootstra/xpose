const statusConfig = {
  connected: { color: 'bg-green-500', label: 'Connected' },
  connecting: { color: 'bg-yellow-500', label: 'Connecting...' },
  disconnected: { color: 'bg-red-500', label: 'Disconnected' },
} as const

interface ConnectionStatusProps {
  status?: 'connected' | 'connecting' | 'disconnected'
}

export function ConnectionStatus({
  status = 'connected',
}: ConnectionStatusProps) {
  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className={`inline-block size-2 rounded-full ${config.color}`} />
      <span>{config.label}</span>
    </div>
  )
}
