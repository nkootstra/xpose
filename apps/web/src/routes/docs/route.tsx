import { Outlet, createFileRoute } from '@tanstack/react-router'
import { DocsSidebar } from '@/components/docs/docs-sidebar'
import { TableOfContents } from '@/components/docs/table-of-contents'

export const Route = createFileRoute('/docs')({
  component: DocsLayout,
})

function DocsLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr] lg:grid-cols-[220px_1fr_180px]">
        <DocsSidebar />
        <article className="min-w-0">
          <Outlet />
        </article>
        <div className="hidden lg:block">
          <TableOfContents />
        </div>
      </div>
    </div>
  )
}
