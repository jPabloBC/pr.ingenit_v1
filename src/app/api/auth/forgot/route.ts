import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { sendMail } from '../../../../lib/mailer'
import { resetPasswordEmail } from '../../../../lib/emailTemplates/resetPassword'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = body?.email
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

    // Buscar usuario en la tabla pr_users
    const { data: user, error: userErr } = await supabaseAdmin
      .from('pr_users')
      .select('id, auth_id, email')
      .eq('email', email)
      .maybeSingle()

    if (userErr) return NextResponse.json({ error: 'Error al buscar usuario' }, { status: 500 })
    if (!user) return NextResponse.json({ ok: true }, { status: 200 }) // no revelar existencia

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString() // 1 hour

    const { error: insertErr } = await supabaseAdmin
      .from('pr_password_resets')
      .insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt })

    if (insertErr) return NextResponse.json({ error: 'Error al crear token' }, { status: 500 })

    const base = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`
    const resetUrl = `${base}/auth/reset?token=${encodeURIComponent(token)}`

    const { subject, html, text } = resetPasswordEmail({ name: undefined, resetUrl })

    try {
      await sendMail({ to: user.email, subject, html, text })
      return NextResponse.json({ ok: true })
    } catch (mailErr) {
      console.error('mail error', mailErr)
      return NextResponse.json({ error: 'Error al enviar correo' }, { status: 500 })
    }
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
