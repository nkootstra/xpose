import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { CodeBlock } from '@/components/shared/code-block'

export const Route = createFileRoute('/docs/how-it-works')({
  head: () => ({
    meta: seo({
      title: 'How it works',
      description:
        'Understand the architecture behind xpose tunnels.',
      path: '/docs/how-it-works',
    }),
  }),
  component: HowItWorksPage,
})

function HowItWorksPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-50">How it works</h1>
      <p className="mb-4 leading-relaxed text-gray-400">
        xpose uses Cloudflare Workers and Durable Objects to create a serverless
        tunnel between your local machine and the internet.
      </p>

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Architecture
      </h2>
      <CodeBlock code="Browser → Cloudflare Worker → Durable Object ↔ CLI → localhost" />

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Step by step
      </h2>
      <ol className="mb-4 list-inside list-decimal space-y-3 text-gray-400">
        <li>
          <span className="font-medium text-gray-50">CLI connects via WebSocket</span>
          <p className="mt-1 pl-5 text-sm">
            The xpose CLI establishes a WebSocket connection to a Cloudflare
            Worker at your subdomain.
          </p>
        </li>
        <li>
          <span className="font-medium text-gray-50">
            Worker creates a Durable Object
          </span>
          <p className="mt-1 pl-5 text-sm">
            The Worker creates (or resumes) a Durable Object that manages the
            tunnel session. Each subdomain maps to exactly one Durable Object.
          </p>
        </li>
        <li>
          <span className="font-medium text-gray-50">
            Traffic hits the public URL
          </span>
          <p className="mt-1 pl-5 text-sm">
            When someone visits your public URL, the request hits the Cloudflare
            Worker, which forwards it to the Durable Object.
          </p>
        </li>
        <li>
          <span className="font-medium text-gray-50">
            DO multiplexes through WebSocket
          </span>
          <p className="mt-1 pl-5 text-sm">
            The Durable Object encodes the HTTP request into a binary frame and
            sends it through the WebSocket to your CLI. Multiple requests can be
            in-flight at once.
          </p>
        </li>
        <li>
          <span className="font-medium text-gray-50">
            CLI forwards to localhost
          </span>
          <p className="mt-1 pl-5 text-sm">
            The CLI receives the request, forwards it to your local server, and
            sends the response back through the same WebSocket channel.
          </p>
        </li>
      </ol>
    </div>
  )
}
