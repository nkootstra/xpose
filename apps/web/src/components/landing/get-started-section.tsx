import { Link } from '@tanstack/react-router'
import { AnimateIn } from '@/components/shared/animate-in'
import { CodeBlock } from '@/components/shared/code-block'
import { Button } from '@/components/ui/button'
import { DOCS_URL } from '@/lib/constants'

export function GetStartedSection() {
  return (
    <section className="relative py-24">
      {/* Radial gradient atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, oklch(0.7 0.18 230 / 8%) 0%, transparent 60%)',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6">
        <div className="flex flex-col items-center text-center">
          <AnimateIn>
            <h2 className="text-balance text-3xl font-bold text-gray-50">
              Ready to expose your localhost?
            </h2>
          </AnimateIn>

          <AnimateIn delay={100}>
            <div className="mt-8 w-full max-w-md">
              <CodeBlock code="brew install nkootstra/tap/xpose && xpose 3000" />
            </div>
          </AnimateIn>

          <AnimateIn delay={200}>
            <Button render={<Link to={DOCS_URL} />} className="mt-8">
              Read the docs
            </Button>
          </AnimateIn>
        </div>
      </div>
    </section>
  )
}
