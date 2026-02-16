import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { CodeBlock } from '@/components/shared/code-block'

export const Route = createFileRoute('/docs/usage')({
  head: () => ({
    meta: seo({
      title: 'Usage',
      description: 'Learn how to use the xpose CLI to expose your local servers.',
      path: '/docs/usage',
    }),
  }),
  component: UsagePage,
})

function UsagePage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-50">Usage</h1>
      <p className="mb-4 leading-relaxed text-gray-400">
        The xpose CLI exposes a local port to the internet through a Cloudflare
        Worker tunnel.
      </p>

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Basic usage
      </h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Expose a local server running on port 3000:
      </p>
      <CodeBlock code="xpose 3000" />

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Multiple ports
      </h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Expose multiple ports at once. Each gets its own tunnel:
      </p>
      <CodeBlock code="xpose 3000 8787" />

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Custom subdomain
      </h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Choose a prefix for your subdomain. A short random code is always
        appended to prevent collisions:
      </p>
      <CodeBlock code="xpose 3000 --subdomain my-app" />
      <p className="mt-2 text-sm text-gray-400">
        This gives you a URL like https://my-app-x7k2m4.xpose.dev
      </p>

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Set a TTL
      </h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Limit how long the tunnel stays active (in seconds):
      </p>
      <CodeBlock code="xpose 3000 --ttl 3600" />
      <p className="mt-2 text-sm text-gray-400">
        Default: 14400 seconds (4 hours). Maximum: 86400 seconds (24 hours).
      </p>

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Turborepo integration
      </h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        If you use Turborepo, xpose can auto-discover the port from a running
        dev task:
      </p>
      <CodeBlock code="xpose --from-turbo" />
    </div>
  )
}
