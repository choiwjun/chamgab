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
          fontSize: 248,
          fontWeight: 700,
          letterSpacing: -4,
        }}
      >
        C
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  )
}
