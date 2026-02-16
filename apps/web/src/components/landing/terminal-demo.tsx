import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { SPRING_CARD } from '@/lib/constants'

/* ANIMATION STORYBOARD
 *
 *    0ms   waiting for parent visibility trigger
 *    0ms   line 1: command types in, y 8 → 0
 *  400ms   line 2: status appears, y 8 → 0
 *  800ms   line 3: public URL appears, y 8 → 0
 * 1200ms   line 4: forwarding info appears, y 8 → 0
 */

const LINE_STAGGER_MS = 400
const LINE_Y_OFFSET = 8

const TERMINAL_LINES = [
  { prefix: '$', text: 'xpose 3000', color: 'text-gray-50' },
  {
    prefix: '\u2713',
    text: "Connected to Cloudflare's edge network",
    color: 'text-green-400',
  },
  {
    prefix: '\u2192',
    text: 'https://abc123.xpose.dev',
    color: 'text-blue-400',
  },
  {
    prefix: ' ',
    text: 'Forwarding to http://localhost:3000',
    color: 'text-gray-400',
  },
]

interface TerminalDemoProps {
  visible: boolean
}

export function TerminalDemo({ visible }: TerminalDemoProps) {
  const [lineStage, setLineStage] = useState(-1)

  useEffect(() => {
    if (!visible) return

    const timers: ReturnType<typeof setTimeout>[] = []

    TERMINAL_LINES.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setLineStage(i)
        }, i * LINE_STAGGER_MS)
      )
    })

    return () => timers.forEach(clearTimeout)
  }, [visible])

  return (
    <div className="glow-blue-lg overflow-hidden rounded-lg border border-gray-700/50 bg-gray-900/90 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 border-b border-gray-800 px-4 py-2.5">
        <div className="size-2.5 rounded-full bg-red-500/40" />
        <div className="size-2.5 rounded-full bg-yellow-500/40" />
        <div className="size-2.5 rounded-full bg-green-500/40" />
        <span className="ml-2 text-xs text-gray-400">Terminal</span>
      </div>

      <div className="space-y-1 p-4 font-mono text-sm">
        {TERMINAL_LINES.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: LINE_Y_OFFSET }}
            animate={
              lineStage >= i
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: LINE_Y_OFFSET }
            }
            transition={{ ...SPRING_CARD }}
            className="flex gap-2"
          >
            <span className={line.color}>{line.prefix}</span>
            <span className={line.color}>{line.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
