export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const ML_API_URL =
  process.env.ML_API_URL || process.env.NEXT_PUBLIC_ML_API_URL || ''

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params

    if (!UUID_REGEX.test(propertyId)) {
      return NextResponse.json(
        { error: 'invalid_property_id' },
        { status: 400 }
      )
    }

    if (!ML_API_URL) {
      return NextResponse.json(
        { error: 'ML API URL is not configured' },
        { status: 503 }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(
      `${ML_API_URL}/api/chamgab/${propertyId}/investment-score`,
      {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timeout))

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return NextResponse.json(
        {
          error: text || 'Failed to fetch investment score',
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    const isTimeout =
      error instanceof DOMException && error.name === 'AbortError'
    return NextResponse.json(
      {
        error: isTimeout
          ? 'Investment score request timed out'
          : 'Internal server error',
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
