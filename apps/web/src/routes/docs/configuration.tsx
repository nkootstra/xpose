import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/docs/configuration')({
  head: () => ({
    meta: seo({
      title: 'Configuration',
      description:
        'Configure the xpose CLI with flags and environment variables.',
      path: '/docs/configuration',
    }),
  }),
  component: ConfigurationPage,
})

function FlagRow({
  flag,
  description,
  defaultValue,
}: {
  flag: string
  description: string
  defaultValue: string
}) {
  return (
    <tr className="border-b border-gray-800/50">
      <td className="py-2 pr-4 font-mono text-xs text-gray-300">{flag}</td>
      <td className="py-2 pr-4">{description}</td>
      <td className="py-2">{defaultValue}</td>
    </tr>
  )
}

function ConfigurationPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-50">Configuration</h1>
      <p className="mb-4 leading-relaxed text-gray-400">
        xpose can be configured via CLI flags and a config file.
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
            <FlagRow
              flag="--subdomain"
              description="Custom subdomain for the tunnel URL"
              defaultValue="Random 12-char ID"
            />
            <FlagRow
              flag="--ttl"
              description="Tunnel time-to-live in seconds"
              defaultValue="14400 (4h)"
            />
            <FlagRow
              flag="--from-turbo"
              description="Auto-discover port from Turborepo"
              defaultValue="false"
            />
            <FlagRow
              flag="--turbo-task"
              description="Turborepo task name to inspect"
              defaultValue="dev"
            />
            <FlagRow
              flag="--turbo-filter"
              description="Turborepo filter for package selection"
              defaultValue="—"
            />
            <FlagRow
              flag="--turbo-path"
              description="Path to the Turborepo project root"
              defaultValue="Current directory"
            />
            <FlagRow
              flag="-r, --resume"
              description="Resume the previous tunnel session (same URLs, within 10 minutes)"
              defaultValue="false"
            />
            <FlagRow
              flag="--domain"
              description="Public tunnel domain (for self-hosting)"
              defaultValue="xpose.dev"
            />
            <FlagRow
              flag="--allow-ips"
              description="Comma-separated IP addresses or CIDR ranges to allow"
              defaultValue="—"
            />
            <FlagRow
              flag="--rate-limit"
              description="Max requests per minute per IP (0 = unlimited)"
              defaultValue="—"
            />
            <FlagRow
              flag="--cors"
              description="Enable permissive CORS headers on all responses"
              defaultValue="false"
            />
            <FlagRow
              flag="--header"
              description="Custom response header (key:value), repeatable"
              defaultValue="—"
            />
            <FlagRow
              flag="--no-inspect"
              description="Disable the local request inspection server"
              defaultValue="false"
            />
            <FlagRow
              flag="--inspect-port"
              description="Port for the inspection server"
              defaultValue="4194"
            />
            <FlagRow
              flag="--config"
              description="Path to config file"
              defaultValue="auto-detect"
            />
            <FlagRow
              flag="--no-config"
              description="Skip loading the config file"
              defaultValue="false"
            />
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-xl font-semibold text-gray-50">
        Config file
      </h2>
      <p className="mb-4 leading-relaxed text-gray-400">
        Create an{' '}
        <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-300">
          xpose.config.ts
        </code>{' '}
        file in your project root for repeatable tunnel configurations. CLI
        flags override config file values.
      </p>
      <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-300">
        {`import { defineConfig } from "@xpose/tunnel-core";

export default defineConfig({
  domain: "xpose.dev",
  tunnels: [
    {
      port: 3000,
      subdomain: "my-app",
      cors: true,
      allowIps: ["203.0.113.0/24"],
      rateLimit: 100,
      headers: { "X-Environment": "development" },
    },
    {
      port: 8787,
      subdomain: "my-api",
    },
  ],
});`}
      </pre>
    </div>
  )
}
