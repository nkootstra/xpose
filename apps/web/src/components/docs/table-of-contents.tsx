import { useEffect, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { SPRING_POP } from '@/lib/constants'

interface Heading {
  id: string
  text: string
}

export function TableOfContents() {
  const location = useLocation()
  const [headings, setHeadings] = useState<Array<Heading>>([])
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    // Small delay to ensure the article content has rendered after route change
    const timeout = setTimeout(() => {
      const article = document.querySelector('article')
      if (!article) return

      const h2Elements = article.querySelectorAll('h2')
      const headingData: Array<Heading> = []

      h2Elements.forEach((heading) => {
        const text = heading.textContent || ''
        const id = text
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w-]/g, '')

        heading.id = id
        headingData.push({ id, text })
      })

      setHeadings(headingData)
      setActiveId(headingData[0]?.id ?? '')

      // Set up IntersectionObserver for scroll spy
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id)
            }
          }
        },
        { rootMargin: '-100px 0px -80% 0px' },
      )

      h2Elements.forEach((heading) => observer.observe(heading))

      return () => observer.disconnect()
    }, 50)

    return () => clearTimeout(timeout)
  }, [location.pathname])

  if (headings.length === 0) {
    return null
  }

  const handleClick = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const yOffset = -100
      const y =
        element.getBoundingClientRect().top + window.pageYOffset + yOffset
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  return (
    <aside className="sticky top-20">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
        On this page
      </p>
      <nav>
        <ul className="space-y-1">
          {headings.map((heading) => {
            const isActive = activeId === heading.id
            return (
              <li key={heading.id} className="relative">
                {isActive && (
                  <motion.div
                    layoutId="activeHeading"
                    className="absolute -left-2 top-0 h-full w-0.5 rounded-full bg-gray-50"
                    transition={SPRING_POP}
                  />
                )}
                <button
                  onClick={() => handleClick(heading.id)}
                  className={`block w-full text-left text-sm transition-colors ${
                    isActive
                      ? 'font-medium text-gray-50'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  {heading.text}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
