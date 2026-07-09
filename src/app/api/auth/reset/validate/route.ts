import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { checkAuthRateLimit, getRequestIp, recordAuthAttempt } from '../../../../../lib/authRateLimit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) return NextResponse.json({ valid: false, reason: 'missing' }, { status: 400 })
    const ip = getRequestIp(request.headers)

    const rateLimit = await checkAuthRateLimit({
      action: 'reset_validate',
      ip,
      maxAttempts: 30,
      windowSeconds: 10 * 60,
    })
    if (!rateLimit.allowed) {
      await recordAuthAttempt({
        action: 'reset_validate',
        ip,
        success: false,
        metadata: { reason: 'rate_limited' },
      })
      return NextResponse.json({ valid: false, reason: 'limited' }, { status: 429 })
    }

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

    if (!data || data.used || new Date(data.expires_at) < new Date()) {
      await recordAuthAttempt({
        action: 'reset_validate',
        ip,
        success: false,
        metadata: { reason: 'invalid_or_expired_token' },
      })
      return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 400 })
    }

    await recordAuthAttempt({ action: 'reset_validate', ip, success: true })
    return NextResponse.json({ valid: true })
  } catch (err) {
    console.error('validate token error', err)
    return NextResponse.json({ valid: false, reason: 'error' }, { status: 500 })
  }
}
