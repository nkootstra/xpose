import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { HeroSection } from '@/components/landing/hero-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { GetStartedSection } from '@/components/landing/get-started-section'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: seo({
      title: 'xpose — Expose your localhost to the internet',
      description:
        'Open-source ngrok alternative built on Cloudflare Workers. One command, no servers.',
    }),
  }),
  component: LandingPage,
})

function LandingPage() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <GetStartedSection />
    </>
  )
}
