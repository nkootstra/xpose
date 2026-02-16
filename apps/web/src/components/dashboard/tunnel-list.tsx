import {  TunnelCard } from './tunnel-card'
import { EmptyState } from './empty-state'
import type {Tunnel} from './tunnel-card';

interface TunnelListProps {
  tunnels: Array<Tunnel>
}

export function TunnelList({ tunnels }: TunnelListProps) {
  if (tunnels.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {tunnels.map((tunnel) => (
        <TunnelCard key={tunnel.id} tunnel={tunnel} />
      ))}
    </div>
  )
}
