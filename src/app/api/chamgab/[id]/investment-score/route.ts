import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ML_API_URL =
  process.env.ML_API_URL || process.env.NEXT_PUBLIC_ML_API_URL || ''

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!ML_API_URL) {
    return NextResponse.json(
      { error: 'ML API is not configured' },
      { status: 503 }
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const upstream = await fetch(
      `${ML_API_URL}/api/chamgab/${id}/investment-score`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      }
    )

    const contentType = upstream.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : { error: await upstream.text() }

    return NextResponse.json(payload, { status: upstream.status })
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('aborted'))

    return NextResponse.json(
      {
        error: timedOut
          ? 'Investment score request timed out'
          : 'Failed to fetch investment score',
      },
      { status: timedOut ? 504 : 502 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
