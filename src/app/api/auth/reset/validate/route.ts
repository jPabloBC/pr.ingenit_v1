import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) return NextResponse.json({ valid: false, reason: 'missing' }, { status: 400 })

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const { data, error } = await supabaseAdmin
      .from('pr_password_resets')
      .select('id, used, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (error) {
      console.error('validate token db error', error)
      return NextResponse.json({ valid: false, reason: 'error' }, { status: 500 })
    }

    if (!data) return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 404 })
    if (data.used) return NextResponse.json({ valid: false, reason: 'used' }, { status: 400 })
    if (new Date(data.expires_at) < new Date()) return NextResponse.json({ valid: false, reason: 'expired' }, { status: 400 })

    return NextResponse.json({ valid: true })
  } catch (err) {
    console.error('validate token error', err)
    return NextResponse.json({ valid: false, reason: 'error' }, { status: 500 })
  }
}
