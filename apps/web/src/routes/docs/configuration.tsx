import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/docs/configuration')({
  head: () => ({
    meta: seo({
      title: 'Configuration',
      description: 'Configure the xpose CLI with flags and environment variables.',
      path: '/docs/configuration',
    }),
  }),
  component: ConfigurationPage,
})

function ConfigurationPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-50">Configuration</h1>
      <p className="mb-4 leading-relaxed text-gray-400">
        xpose can be configured via CLI flags.
      </p>

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        CLI flags
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="pb-2 pr-4 text-left font-medium text-gray-50">
                Flag
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-gray-50">
                Description
              </th>
              <th className="pb-2 text-left font-medium text-gray-50">
                Default
              </th>
            </tr>
          </thead>
          <tbody className="text-gray-400">
            <tr className="border-b border-gray-800/50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                --subdomain
              </td>
              <td className="py-2 pr-4">Custom subdomain for the tunnel URL</td>
              <td className="py-2">Random 12-char ID</td>
            </tr>
            <tr className="border-b border-gray-800/50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                --ttl
              </td>
              <td className="py-2 pr-4">
                Tunnel time-to-live in seconds
              </td>
              <td className="py-2">14400 (4h)</td>
            </tr>
            <tr className="border-b border-gray-800/50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                --from-turbo
              </td>
              <td className="py-2 pr-4">
                Auto-discover port from Turborepo
              </td>
              <td className="py-2">false</td>
            </tr>
            <tr className="border-b border-gray-800/50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                --turbo-task
              </td>
              <td className="py-2 pr-4">Turborepo task name to inspect</td>
              <td className="py-2">dev</td>
            </tr>
            <tr className="border-b border-gray-800/50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                --turbo-filter
              </td>
              <td className="py-2 pr-4">Turborepo filter for package selection</td>
              <td className="py-2">&mdash;</td>
            </tr>
            <tr className="border-b border-gray-800/50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                --turbo-path
              </td>
              <td className="py-2 pr-4">Path to the Turborepo project root</td>
              <td className="py-2">Current directory</td>
            </tr>
            <tr className="border-b border-gray-800/50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                -r, --resume
              </td>
              <td className="py-2 pr-4">
                Resume the previous tunnel session (same URLs, within 10 minutes of exit)
              </td>
              <td className="py-2">false</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                --domain
              </td>
              <td className="py-2 pr-4">Public tunnel domain (for self-hosting)</td>
              <td className="py-2">xpose.dev</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
