import { createFileRoute } from '@tanstack/react-router'
import type { Tunnel } from '@/components/dashboard/tunnel-card'
import { seo } from '@/lib/seo'
import { TunnelList } from '@/components/dashboard/tunnel-list'
import { ConnectionStatus } from '@/components/dashboard/connection-status'

export const Route = createFileRoute('/dashboard/')({
  head: () => ({
    meta: seo({
      title: 'Dashboard',
      description: 'View and manage your active xpose tunnels.',
      path: '/dashboard',
    }),
  }),
  component: DashboardPage,
})

const MOCK_TUNNELS: Array<Tunnel> = [
  {
    id: '1',
    url: 'https://abc123def456.xpose.dev',
    localTarget: 'http://localhost:3000',
    status: 'active',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    requestCount: 142,
  },
  {
    id: '2',
    url: 'https://xyz789ghi012.xpose.dev',
    localTarget: 'http://localhost:8080',
    status: 'idle',
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    requestCount: 23,
  },
]

function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-50">Dashboard</h1>
          <p className="mt-1 text-pretty text-gray-400">Your active tunnels</p>
        </div>
        <ConnectionStatus />
      </div>
      <div className="mt-8">
        <TunnelList tunnels={MOCK_TUNNELS} />
      </div>
    </div>
  )
}
