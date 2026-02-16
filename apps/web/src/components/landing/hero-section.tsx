import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Link } from '@tanstack/react-router'
import { Github } from 'lucide-react'
import { TerminalDemo } from './terminal-demo'
import { Button } from '@/components/ui/button'
import { DOCS_URL, GITHUB_URL, SPRING_ENTRANCE } from '@/lib/constants'

/* ANIMATION STORYBOARD
 *
 *    0ms   waiting for mount
 *  100ms   heading fades in, y 24 → 0
 *  250ms   subtitle fades in, y 16 → 0
 *  450ms   buttons fade in, y 12 → 0
 *  700ms   terminal window fades in, scale 0.97 → 1.0
 *  900ms   terminal lines type in sequentially (stagger 400ms)
 */

const TIMING = {
  heading: 100,
  subtitle: 250,
  buttons: 450,
  terminal: 700,
  terminalLines: 900,
}

const ELEMENTS = {
  heading: { y: 24 },
  subtitle: { y: 16 },
  buttons: { y: 12 },
  terminal: { scale: 0.97 },
}

export function HeroSection() {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), TIMING.heading),
      setTimeout(() => setStage(2), TIMING.subtitle),
      setTimeout(() => setStage(3), TIMING.buttons),
      setTimeout(() => setStage(4), TIMING.terminal),
      setTimeout(() => setStage(5), TIMING.terminalLines),
    ]

    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <section className="hero-grid relative overflow-hidden py-32 sm:py-40">
      {/* Radial glow behind heading */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: '700px',
          height: '500px',
          background:
            'radial-gradient(ellipse at center, oklch(0.6 0.1 230 / 10%) 0%, oklch(0.5 0.08 230 / 5%) 35%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6">
        <div className="flex flex-col items-center text-center">
          <motion.h1
            initial={{ opacity: 0, y: ELEMENTS.heading.y }}
            animate={
              stage >= 1
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: ELEMENTS.heading.y }
            }
            transition={{ ...SPRING_ENTRANCE }}
            className="text-balance text-4xl font-bold text-gray-50 sm:text-5xl lg:text-6xl"
          >
            Expose your localhost to the internet.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: ELEMENTS.subtitle.y }}
            animate={
              stage >= 2
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: ELEMENTS.subtitle.y }
            }
            transition={{ ...SPRING_ENTRANCE }}
            className="mt-6 max-w-2xl text-pretty text-lg text-gray-400"
          >
            One command. No servers. Built on Cloudflare&apos;s global network.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: ELEMENTS.buttons.y }}
            animate={
              stage >= 3
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: ELEMENTS.buttons.y }
            }
            transition={{ ...SPRING_ENTRANCE }}
            className="mt-8 flex items-center gap-3"
          >
            <Button render={<Link to={DOCS_URL} />}>
              Get Started
            </Button>
            <Button
              variant="outline"
              render={
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Github className="size-4" />
              GitHub
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: ELEMENTS.terminal.scale }}
            animate={
              stage >= 4
                ? { opacity: 1, scale: 1 }
                : { opacity: 0, scale: ELEMENTS.terminal.scale }
            }
            transition={{ ...SPRING_ENTRANCE }}
            className="mt-16 w-full max-w-2xl"
          >
            <TerminalDemo visible={stage >= 5} />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
