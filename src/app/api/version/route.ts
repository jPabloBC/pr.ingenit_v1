import { NextResponse } from 'next/server'

export async function GET() {
  const version =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.APP_VERSION ||
    'dev'

  return NextResponse.json(
    {
      version: String(version),
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  )
}

