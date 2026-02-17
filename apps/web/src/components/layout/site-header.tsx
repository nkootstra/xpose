import { Link } from '@tanstack/react-router'
import { Github } from 'lucide-react'
import { MobileNav } from './mobile-nav'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { DOCS_URL, GITHUB_URL } from '@/lib/constants'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to={DOCS_URL} />}
          >
            Docs
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label="GitHub"
            render={
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" />
            }
          >
            <Github className="size-4" />
          </Button>
        </nav>

        <div className="md:hidden">
          <MobileNav />
        </div>
      </div>
    </header>
  )
}
