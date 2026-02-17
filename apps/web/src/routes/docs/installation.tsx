import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { CodeBlock } from '@/components/shared/code-block'

export const Route = createFileRoute('/docs/installation')({
  head: () => ({
    meta: seo({
      title: 'Installation',
      description: 'Get started with xpose using npx — no install needed.',
      path: '/docs/installation',
    }),
  }),
  component: InstallationPage,
})

function InstallationPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-50">Installation</h1>
      <p className="mb-6 leading-relaxed text-gray-400">
        No install required. Run xpose directly with npx.
      </p>

      <h2 className="mb-3 text-xl font-semibold text-gray-50">Quick start</h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Expose a local server running on port 3000:
      </p>
      <CodeBlock code="npx xpose-dev 3000" />

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Global install (optional)
      </h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        If you prefer a shorter command, install globally:
      </p>
      <CodeBlock code="npm install -g xpose-dev" />
      <p className="mt-4 mb-4 leading-relaxed text-gray-400">
        Then run it directly:
      </p>
      <CodeBlock code="xpose-dev 3000" />

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">Verify</h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Check that it installed correctly:
      </p>
      <CodeBlock code="xpose-dev --version" />
    </div>
  )
}
