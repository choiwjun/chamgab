const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://chamgab.vercel.app'

interface JsonLdProps {
  data: Record<string, unknown>
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// Organization schema
export function OrganizationJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: '참값',
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        description:
          'AI 기반 부동산 가격 분석 서비스. 아파트 적정가격, 상권분석, 토지 시세를 제공합니다.',
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'support@chamgab.com',
          contactType: 'customer service',
          availableLanguage: 'Korean',
        },
        sameAs: [],
      }}
    />
  )
}

// WebSite schema (AEO: SearchAction for sitelinks search box)
export function WebSiteJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: '참값',
        url: SITE_URL,
        description: 'AI가 분석한 정확한 부동산 참값',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      }}
    />
  )
}

// Breadcrumb schema
interface BreadcrumbItem {
  name: string
  href: string
}

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          item: `${SITE_URL}${item.href}`,
        })),
      }}
    />
  )
}

// FAQ schema (AEO core: AI answer engines pull from FAQPage)
interface FaqItem {
  question: string
  answer: string
}

export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      }}
    />
  )
}

// RealEstateListing for complex/property detail pages
interface RealEstateListingProps {
  name: string
  description: string
  url: string
  address: string
  price?: number
  area?: number
  image?: string
}

export function RealEstateListingJsonLd({
  name,
  description,
  url,
  address,
  price,
  area,
  image,
}: RealEstateListingProps) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'RealEstateListing',
        name,
        description,
        url: `${SITE_URL}${url}`,
        ...(image && { image }),
        about: {
          '@type': 'Residence',
          name,
          address: {
            '@type': 'PostalAddress',
            streetAddress: address,
            addressCountry: 'KR',
          },
          ...(area && {
            floorSize: {
              '@type': 'QuantitativeValue',
              value: area,
              unitCode: 'MTK',
            },
          }),
          ...(price && {
            offers: {
              '@type': 'Offer',
              price,
              priceCurrency: 'KRW',
            },
          }),
        },
      }}
    />
  )
}
