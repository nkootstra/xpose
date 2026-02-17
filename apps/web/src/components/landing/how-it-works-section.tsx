import { AnimateIn } from '@/components/shared/animate-in'
import { CodeBlock } from '@/components/shared/code-block'

const STEPS = [
  {
    number: '1',
    title: 'Run the CLI',
    description: 'A single command is all you need to get started.',
    code: 'npx xpose-dev 3000',
  },
  {
    number: '2',
    title: 'Get a public URL',
    description: 'A Cloudflare Worker proxies traffic to your machine.',
    code: null,
  },
  {
    number: '3',
    title: 'Share and develop',
    description: 'Send the URL to anyone, live reload included.',
    code: null,
  },
] as const

export function HowItWorksSection() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-6">
        <AnimateIn>
          <div className="mb-16 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-[oklch(0.75_0.15_230)]">
              How it works
            </p>
            <h2 className="mt-3 text-balance text-3xl font-bold text-gray-50">
              Three steps to a public URL
            </h2>
          </div>
        </AnimateIn>

        <div className="mx-auto max-w-lg">
          <div className="relative space-y-12 pl-12">
            {/* Glowing vertical line */}
            <div
              aria-hidden
              className="absolute bottom-0 left-4 top-4 w-px"
              style={{
                background:
                  'linear-gradient(to bottom, oklch(0.7 0.18 230 / 40%), oklch(0.7 0.18 230 / 10%))',
                boxShadow: '0 0 8px 1px oklch(0.7 0.18 230 / 20%)',
              }}
            />

            {STEPS.map((step, i) => (
              <AnimateIn key={step.number} delay={i * 150}>
                <div className="relative">
                  <div
                    className="absolute -left-12 flex size-8 items-center justify-center rounded-full border border-[oklch(0.5_0.12_230)] bg-gray-900 font-mono text-sm text-[oklch(0.75_0.15_230)]"
                    style={{
                      boxShadow: '0 0 12px 2px oklch(0.7 0.18 230 / 15%)',
                    }}
                  >
                    {step.number}
                  </div>
                  <h3 className="text-base font-semibold text-gray-50">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-pretty text-sm text-gray-400">
                    {step.description}
                  </p>
                  {step.code && (
                    <div className="mt-3 max-w-md">
                      <CodeBlock code={step.code} />
                    </div>
                  )}
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
