import { CodeBlock } from '@/components/shared/code-block'

export function EmptyState() {
  return (
    <div className="py-16 text-center">
      <h2 className="text-lg font-medium text-gray-50">No active tunnels</h2>
      <p className="mt-1 text-pretty text-sm text-gray-400">
        Start a tunnel to see it appear here.
      </p>
      <div className="mx-auto mt-6 max-w-xs">
        <CodeBlock code="npx xpose-dev 3000" />
      </div>
    </div>
  )
}
