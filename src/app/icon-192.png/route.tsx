import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#3182F6',
          color: '#FFFFFF',
          fontSize: 92,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        C
      </div>
    ),
    {
      width: 192,
      height: 192,
    }
  )
}
