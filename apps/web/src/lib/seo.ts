interface SeoOptions {
  title: string
  description: string
  path?: string
}

const SITE_URL = 'https://xpose.dev'
const SITE_NAME = 'xpose'
const OG_IMAGE = `${SITE_URL}/og.png`

export function seo({ title, description, path = '' }: SeoOptions) {
  const url = `${SITE_URL}${path}`
  const fullTitle = path ? `${title} — ${SITE_NAME}` : title

  return [
    { title: fullTitle },
    { name: 'description', content: description },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:type', content: 'website' },
    { property: 'og:image', content: OG_IMAGE },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: OG_IMAGE },
  ]
}
