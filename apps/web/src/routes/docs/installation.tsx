import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { CodeBlock } from '@/components/shared/code-block'

export const Route = createFileRoute('/docs/installation')({
  head: () => ({
    meta: seo({
      title: 'Installation',
      description: 'Install the xpose CLI via Homebrew.',
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
        Install the xpose CLI to use it from anywhere on your machine.
      </p>

      <h2 className="mb-3 text-xl font-semibold text-gray-50">Homebrew</h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Install xpose on macOS or Linux:
      </p>
      <CodeBlock code="brew install nkootstra/tap/xpose" />

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">Verify</h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Check that it installed correctly:
      </p>
      <CodeBlock code="xpose --version" />
    </div>
  )
}
