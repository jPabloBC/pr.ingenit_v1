import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    const expected = process.env.INTERNAL_SECRET
    if (!expected) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (secret !== expected) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { userId, resource } = body || {}
    if (!userId || !resource) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    // Try to map auth id -> pr_users.id or accept pr_users.id directly.
    const { data: mappedByAuth, error: authMapErr } = await supabaseAdmin
      .from('pr_users')
      .select('id')
      .eq('auth_id', userId)
      .maybeSingle()
    if (authMapErr) return NextResponse.json({ error: authMapErr.message }, { status: 500 })

    let targetId = mappedByAuth?.id || ''
    if (!targetId) {
      const { data: mappedById, error: idMapErr } = await supabaseAdmin
        .from('pr_users')
        .select('id')
        .eq('id', userId)
        .maybeSingle()
      if (idMapErr) return NextResponse.json({ error: idMapErr.message }, { status: 500 })
      targetId = mappedById?.id || userId
    }

    const { data, error } = await supabaseAdmin
      .from('pr_user_permissions')
      .select('id')
      .eq('user_id', targetId)
      .eq('resource_key', resource)
      .eq('can_view', true)
      .limit(1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const allowed = Array.isArray(data) && data.length > 0
    return NextResponse.json({ allowed })
  } catch (err) {
    console.error('Error POST /api/dev/check-permission', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
