import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { InspectDashboard } from '@/components/inspect/inspect-dashboard'

const DEFAULT_INSPECT_PORT = 4194

export const Route = createFileRoute('/inspect')({
  validateSearch: (search: Record<string, unknown>) => ({
    port: Number(search.port) || DEFAULT_INSPECT_PORT,
  }),
  head: () => ({
    meta: seo({
      title: 'Inspect — xpose',
      description: 'Real-time request inspection for your xpose tunnels.',
      path: '/inspect',
    }),
  }),
  component: InspectPage,
})

function InspectPage() {
  const { port } = Route.useSearch()
  return <InspectDashboard port={port} />
}
