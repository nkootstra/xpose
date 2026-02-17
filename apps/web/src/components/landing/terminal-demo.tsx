import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { SPRING_CARD } from '@/lib/constants'

/* ANIMATION STORYBOARD
 *
 * Reproduces the ink TUI using CSS borders (box-drawing characters
 * have inconsistent widths in browser monospace fonts).
 *
 *    0ms   waiting for parent visibility trigger
 *    0ms   stage 0: command prompt
 *  600ms   stage 1: TUI frame appears
 * 1300ms   stage 2: traffic row 1
 * 1650ms   stage 3: traffic row 2
 * 2000ms   stage 4: traffic row 3
 */

const STAGE_DELAY_MS = [0, 600, 1300, 1650, 2000]

interface TerminalDemoProps {
  visible: boolean
}

export function TerminalDemo({ visible }: TerminalDemoProps) {
  const [stage, setStage] = useState(-1)

  useEffect(() => {
    if (!visible) return
    const timers = STAGE_DELAY_MS.map((delay, i) =>
      setTimeout(() => setStage(i), delay),
    )
    return () => timers.forEach(clearTimeout)
  }, [visible])

  return (
    <div className="glow-blue-lg overflow-hidden rounded-lg border border-blue-500/20 bg-[#0c1018] text-left backdrop-blur-sm">
      {/* Title bar */}
      <div className="flex items-center gap-1.5 border-b border-gray-800/60 px-3.5 py-2">
        <div className="size-[11px] rounded-full bg-[#ff5f57]/70" />
        <div className="size-[11px] rounded-full bg-[#febc2e]/70" />
        <div className="size-[11px] rounded-full bg-[#28c840]/70" />
        <span className="ml-2 font-mono text-[11px] text-gray-500">
          Terminal
        </span>
      </div>

      <div className="p-3 sm:p-4">
        {/* Command prompt */}
        <motion.div
          className="font-mono text-[12px] sm:text-[13px]"
          initial={{ opacity: 0, y: 4 }}
          animate={stage >= 0 ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
          transition={{ ...SPRING_CARD }}
        >
          <span className="text-gray-500">$ </span>
          <span className="text-gray-200">npx xpose-dev 3000</span>
        </motion.div>

        {/* TUI panels */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={stage >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{ ...SPRING_CARD }}
          className="mt-3"
        >
          <div className="flex items-stretch font-mono text-[11px] leading-[1.7] sm:text-[12px]">
            {/* Left panel: Tunnels (unfocused) */}
            <div className="relative shrink-0 rounded-lg border border-gray-700/40 px-3 pb-3 pt-4">
              <div className="absolute -top-[9px] left-2.5 bg-[#0c1018] px-1.5">
                <span className="text-[10px] font-medium text-gray-500 sm:text-[11px]">
                  Tunnels
                </span>
              </div>

              <div className="space-y-[1px]">
                <div>
                  <span className="text-green-400">{'✓ '}</span>
                  <span className="text-green-400">Connected</span>
                </div>
                <div>
                  <span className="text-cyan-400">{'→ '}</span>
                  <span className="text-cyan-400">https://k3x9m.xpose.dev</span>
                </div>
                <div className="text-gray-500">
                  {'  Forwarding localhost:3000'}
                </div>
                <div>
                  {'  TTL: '}
                  <span className="text-yellow-400">3h 59m 48s</span>
                </div>
              </div>
            </div>

            {/* Right panel: Traffic (focused/active) */}
            <div className="relative ml-1 min-w-0 flex-1 rounded-lg border border-blue-500/30 px-3 pb-3 pt-4">
              <div className="absolute -top-[9px] left-2.5 bg-[#0c1018] px-1.5">
                <span className="text-[10px] font-medium text-blue-400 sm:text-[11px]">
                  Traffic
                </span>
              </div>

              <div className="terminal-scroll max-h-[62px] space-y-[1px]">
                <TrafficRow stage={stage} i={2}>
                  <span className="text-gray-600">14:32:07</span>
                  {'  '}
                  <span className="text-cyan-400">{'GET '}</span>
                  {'  '}
                  <span className="text-gray-300">/</span>
                  <span className="hidden sm:inline text-gray-300">
                    {'                '}
                  </span>
                  {'  '}
                  <span className="text-green-400">200</span>
                  {'  '}
                  <span className="text-gray-600">12ms</span>
                </TrafficRow>

                <TrafficRow stage={stage} i={3}>
                  <span className="text-gray-600">14:32:08</span>
                  {'  '}
                  <span className="text-cyan-400">{'GET '}</span>
                  {'  '}
                  <span className="text-gray-300">/assets/main.css</span>
                  {'  '}
                  <span className="text-green-400">200</span>
                  {'   '}
                  <span className="text-gray-600">4ms</span>
                </TrafficRow>

                <TrafficRow stage={stage} i={4}>
                  <span className="text-gray-600">14:32:09</span>
                  {'  '}
                  <span className="text-green-400">POST</span>
                  {'  '}
                  <span className="text-gray-300">/api/webhooks</span>
                  <span className="hidden sm:inline">{'   '}</span>
                  {'  '}
                  <span className="text-green-400">201</span>
                  {'  '}
                  <span className="text-gray-600">87ms</span>
                </TrafficRow>

                <TrafficRow stage={stage} i={4}>
                  <span className="text-gray-600">14:32:10</span>
                  {'  '}
                  <span className="text-cyan-400">{'GET '}</span>
                  {'  '}
                  <span className="text-gray-300">/api/health</span>
                  <span className="hidden sm:inline">{'     '}</span>
                  {'  '}
                  <span className="text-green-400">200</span>
                  {'   '}
                  <span className="text-gray-600">2ms</span>
                </TrafficRow>

                <TrafficRow stage={stage} i={4}>
                  <span className="text-gray-600">14:32:11</span>
                  {'  '}
                  <span className="text-cyan-400">{'GET '}</span>
                  {'  '}
                  <span className="text-gray-300">/favicon.ico</span>
                  <span className="hidden sm:inline">{'    '}</span>
                  {'  '}
                  <span className="text-green-400">200</span>
                  {'   '}
                  <span className="text-gray-600">1ms</span>
                </TrafficRow>
              </div>
            </div>
          </div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={stage >= 1 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="mt-2 font-mono text-[10px] text-gray-600 sm:text-[11px]"
          >
            {'  q quit  ·  b browser  ·  tab switch  ·  ↑↓ scroll'}
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

/** Traffic row with staggered fade-in */
function TrafficRow({
  stage,
  i,
  children,
}: {
  stage: number
  i: number
  children: React.ReactNode
}) {
  return (
    <motion.div
      className="whitespace-nowrap"
      initial={{ opacity: 0 }}
      animate={stage >= i ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}
