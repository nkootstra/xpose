import { Globe, Code, Zap } from 'lucide-react'
import { AnimateIn } from '@/components/shared/animate-in'

const FEATURES = [
  {
    icon: Globe,
    title: 'Global Network',
    description: "Powered by Cloudflare's 300+ edge locations.",
    accent: 'text-[oklch(0.75_0.15_230)]',
    accentBg: 'bg-[oklch(0.75_0.15_230_/_10%)]',
    hoverBorder: 'from-[oklch(0.75_0.15_230)] to-transparent',
  },
  {
    icon: Code,
    title: 'Open Source',
    description: 'MIT licensed. Inspect, modify, self-host.',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-400/10',
    hoverBorder: 'from-emerald-400 to-transparent',
  },
  {
    icon: Zap,
    title: 'Zero Infrastructure',
    description: 'No servers to provision or manage.',
    accent: 'text-amber-400',
    accentBg: 'bg-amber-400/10',
    hoverBorder: 'from-amber-400 to-transparent',
  },
] as const

export function FeaturesSection() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-6">
        <AnimateIn>
          <div className="mb-12 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-[oklch(0.75_0.15_230)]">
              Features
            </p>
            <h2 className="mt-3 text-balance text-3xl font-bold text-gray-50">
              Built for developers
            </h2>
          </div>
        </AnimateIn>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <AnimateIn key={feature.title} delay={i * 100} className="h-full">
              <div className="group relative flex h-full cursor-default flex-col overflow-hidden rounded-xl border border-gray-800/60 bg-gray-900/80 p-6 transition-all duration-200 hover:border-gray-700/80 hover:bg-gray-900">
                {/* Hover top-border accent */}
                <div
                  className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${feature.hoverBorder} opacity-0 transition-opacity duration-200 group-hover:opacity-100`}
                />

                <div
                  className={`flex size-10 items-center justify-center rounded-lg ${feature.accentBg}`}
                >
                  <feature.icon className={`size-5 ${feature.accent}`} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-50">
                  {feature.title}
                </h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-gray-400">
                  {feature.description}
                </p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  )
}
