import { Link } from '@tanstack/react-router'

const links = [
  { label: 'Introduction', to: '/docs' },
  { label: 'Installation', to: '/docs/installation' },
  { label: 'Usage', to: '/docs/usage' },
  { label: 'Configuration', to: '/docs/configuration' },
  { label: 'How it works', to: '/docs/how-it-works' },
] as const

export function DocsSidebar() {
  return (
    <aside className="w-full">
      <nav>
        <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-gray-400">
          Documentation
        </p>
        <ul className="space-y-0.5">
          {links.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                activeOptions={{ exact: true }}
                activeProps={{ className: 'text-gray-50' }}
                inactiveProps={{ className: 'text-gray-400 hover:text-gray-50' }}
                className="block rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
