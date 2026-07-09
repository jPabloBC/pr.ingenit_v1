import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { checkAuthRateLimit, getRequestIp, recordAuthAttempt } from '../../../../lib/authRateLimit'

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()
    if (!token || !password) return NextResponse.json({ error: 'Token y contraseña son requeridos' }, { status: 400 })
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const ip = getRequestIp(request.headers)
    const rateLimit = await checkAuthRateLimit({
      action: 'reset_password',
      ip,
      maxAttempts: 10,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      await recordAuthAttempt({
        action: 'reset_password',
        ip,
        success: false,
        metadata: { reason: 'rate_limited' },
      })
      return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Buscar token válido
    const { data: resetRow, error: tokenErr } = await supabaseAdmin
      .from('pr_password_resets')
      .select('id, user_id, expires_at, used')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (tokenErr) return NextResponse.json({ error: 'Error al verificar token' }, { status: 500 })
    if (!resetRow || resetRow.used || new Date(resetRow.expires_at) < new Date()) {
      await recordAuthAttempt({
        action: 'reset_password',
        ip,
        success: false,
        metadata: { reason: 'invalid_or_expired_token' },
      })
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 })
    }

    // Buscar usuario para obtener auth_id
    const { data: user, error: userErr } = await supabaseAdmin
      .from('pr_users')
      .select('id, auth_id')
      .eq('id', resetRow.user_id)
      .maybeSingle()

    if (userErr || !user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 400 })

    // Actualizar contraseña en Supabase Auth con servicio admin
    try {
      // hash password for storing in pr_users if you keep local hashes
      const saltRounds = 10
      const hashed = await bcrypt.hash(password, saltRounds)

      // update auth via supabase admin
      // @ts-ignore - admin API
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.auth_id, { password })
      if (updateErr) {
        console.error('supabase admin update error', updateErr)
        await recordAuthAttempt({
          action: 'reset_password',
          ip,
          success: false,
          metadata: { reason: 'supabase_update_error' },
        })
        return NextResponse.json({ error: 'No se pudo actualizar la contraseña' }, { status: 500 })
      }

      // Optionally update local users table password_hash if used
      await supabaseAdmin
        .from('pr_users')
        .update({ password_hash: hashed })
        .eq('id', user.id)

      // marcar token como usado
      await supabaseAdmin
        .from('pr_password_resets')
        .update({ used: true, used_at: new Date().toISOString() })
        .eq('id', resetRow.id)

      await recordAuthAttempt({
        action: 'reset_password',
        ip,
        success: true,
        metadata: { user_id: user.id },
      })

      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error(err)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export function OPTIONS() {
  return NextResponse.json(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_BASE_URL || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}
