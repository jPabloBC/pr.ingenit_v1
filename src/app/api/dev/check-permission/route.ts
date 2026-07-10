import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    const expected = process.env.INTERNAL_SECRET || 'dev-internal-secret'
    if (secret !== expected) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { userId, resource } = body || {}
    if (!userId || !resource) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    // Try to map auth id -> pr_users.id or accept pr_users.id directly
    const { data: mapped, error: mapErr } = await supabaseAdmin
      .from('pr_users')
      .select('id')
      .or(`auth_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle()

    const targetId = (!mapErr && mapped && mapped.id) ? mapped.id : userId

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
