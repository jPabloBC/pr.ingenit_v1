import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const email = url.searchParams.get('email')
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

    const { data: pu, error: puErr } = await supabaseAdmin
      .from('pr_users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (puErr) return NextResponse.json({ error: 'Error en la consulta pr_users' }, { status: 500 })

    // También comprobar si existe en Auth (tabla interna auth.users)
    let inAuth = false
    try {
      const { data: aData, error: aErr } = await supabaseAdmin
        .from('auth.users')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (!aErr && aData) inAuth = true
    } catch (e) {
      // ignore auth table errors
      console.warn('check-email: auth.users check failed', e)
    }

    return NextResponse.json({ inPrUsers: !!pu, inAuth })
  } catch (err) {
    console.error('check-email error', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
