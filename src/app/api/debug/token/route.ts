import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    return NextResponse.json({ token: token || null })
  } catch (err) {
    console.error('Error in /api/debug/token', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
