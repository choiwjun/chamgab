import { LandCommercialClient } from '@/components/land/LandCommercialClient'

interface PageProps {
  params: Promise<{ pnu: string }>
}

export default async function LandCommercialPage({ params }: PageProps) {
  const { pnu } = await params

  return (
    <main className="min-h-screen bg-[#F9FAFB]">
      <LandCommercialClient pnu={decodeURIComponent(pnu)} />
    </main>
  )
}
