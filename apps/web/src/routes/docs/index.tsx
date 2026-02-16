import { createFileRoute, Link } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { CodeBlock } from '@/components/shared/code-block'

export const Route = createFileRoute('/docs/')({
  head: () => ({
    meta: seo({
      title: 'Introduction',
      description:
        'Learn about xpose, an open-source ngrok alternative built on Cloudflare Workers.',
      path: '/docs',
    }),
  }),
  component: DocsIntroPage,
})

function DocsIntroPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-50">Introduction</h1>
      <p className="mb-4 leading-relaxed text-gray-400">
        xpose is an open-source alternative to ngrok, built entirely on
        Cloudflare Workers. It lets you expose a local development server to the
        internet with a single command — no sign-up required, no servers to
        manage.
      </p>

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Features
      </h2>
      <ul className="mb-4 list-inside list-disc space-y-1 text-gray-400">
        <li>Serverless tunnel via Cloudflare Workers and Durable Objects</li>
        <li>Automatic public URL generation</li>
        <li>Custom subdomain support</li>
        <li>Turborepo integration for auto-discovery</li>
        <li>Traffic logging and request counting</li>
        <li>Auto-reconnection with exponential backoff</li>
        <li>MIT licensed — fully open source</li>
      </ul>

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Quick start
      </h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Get started in seconds. Run the CLI with your local port and you will
        receive a public URL instantly.
      </p>
      <CodeBlock code="npx xpose http 3000" />
      <p className="mt-4 leading-relaxed text-gray-400">
        Read the{' '}
        <Link
          to="/docs/installation"
          className="text-gray-50 underline underline-offset-4 transition-colors hover:text-gray-300"
        >
          installation guide
        </Link>{' '}
        for more options, or jump to{' '}
        <Link
          to="/docs/usage"
          className="text-gray-50 underline underline-offset-4 transition-colors hover:text-gray-300"
        >
          usage
        </Link>{' '}
        for detailed examples.
      </p>
    </div>
  )
}
