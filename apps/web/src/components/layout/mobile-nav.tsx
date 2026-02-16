import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DOCS_URL, GITHUB_URL, SPRING_ENTRANCE } from '@/lib/constants'

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ ...SPRING_ENTRANCE }}
            className="fixed inset-x-0 top-14 z-50 border-b border-gray-800/50 bg-gray-950/95 backdrop-blur-sm"
          >
            <nav className="mx-auto flex max-w-5xl flex-col gap-1 px-6 py-4">
              <Link
                to={DOCS_URL}
                className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-900 hover:text-gray-50"
                onClick={() => setOpen(false)}
              >
                Docs
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-900 hover:text-gray-50"
                onClick={() => setOpen(false)}
              >
                GitHub
              </a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
