import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { sendMail } from '../../../../../lib/mailer'
import { resetPasswordEmail } from '../../../../../lib/emailTemplates/resetPassword'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const body = await request.json()
    const email = body?.email
    const secret = body?.secret
    const send = body?.send === true

    if (!process.env.DEBUG_MAIL_SECRET) {
      return NextResponse.json({ error: 'Debug endpoint not enabled' }, { status: 403 })
    }
    if (!secret || secret !== process.env.DEBUG_MAIL_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

    const { data: user, error: userErr } = await supabaseAdmin
      .from('pr_users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()

    if (userErr) return NextResponse.json({ error: 'Error al buscar usuario' }, { status: 500 })
    if (!user) return NextResponse.json({ ok: true, message: 'Usuario no existe' })

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString()

    const { error: insertErr } = await supabaseAdmin
      .from('pr_password_resets')
      .insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt })

    if (insertErr) return NextResponse.json({ error: 'Error al crear token' }, { status: 500 })

    const base = process.env.NEXT_PUBLIC_BASE_URL || `https://pr.ingenit.cl`
    const resetUrl = `${base}/auth/reset?token=${encodeURIComponent(token)}`

    const result: any = { ok: true, resetUrl }

    if (send) {
      const { subject, html, text } = resetPasswordEmail({ name: undefined, resetUrl })
      try {
        const info = await sendMail({ to: user.email, subject, html, text })
        result.mail = { sent: true, info }
      } catch (mailErr) {
        result.mail = { sent: false, error: String(mailErr) }
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('debug forgot error', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export function OPTIONS() {
  return NextResponse.json(null, { status: 204 })
}
