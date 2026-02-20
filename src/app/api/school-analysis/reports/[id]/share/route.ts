export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import {
  createPublicShareToken,
  normalizeDistrictCode,
} from '../../../_helpers'

type CreateShareBody = {
  district_code?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params

  let body: CreateShareBody | null = null
  try {
    body = (await request.json()) as CreateShareBody
  } catch {
    body = null
  }

  const districtCode = normalizeDistrictCode(body?.district_code)
  const { token, expires_at } = createPublicShareToken(districtCode)
  const shareUrl = new URL(
    `/school-analysis/share/${token}`,
    request.url
  ).toString()

  return NextResponse.json({
    token,
    share_url: shareUrl,
    expires_at,
  })
}
