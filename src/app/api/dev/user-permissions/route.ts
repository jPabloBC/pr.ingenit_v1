import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'dev') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabaseAdmin
      .from('pr_user_permissions')
      .select('id, user_id, company_id, resource_key, can_view')
      .order('id', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ permissions: data || [] })
  } catch (err) {
    console.error('Error GET /api/dev/user-permissions:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'dev') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { user_id, resource_key, company_id, can_view } = body
    if (!user_id || !resource_key) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const payload: any = { user_id, resource_key, can_view: typeof can_view === 'boolean' ? can_view : true }
    if (company_id !== undefined) payload.company_id = company_id

    const { data, error } = await supabaseAdmin
      .from('pr_user_permissions')
      .insert(payload)
      .select()
      .single()

    if (error) {
      // if already exists, try to return existing row
      try {
        const { data: existing, error: e2 } = await supabaseAdmin
          .from('pr_user_permissions')
          .select('id, user_id, company_id, resource_key, can_view')
          .eq('user_id', user_id)
          .eq('resource_key', resource_key)
          .maybeSingle()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        if (existing) return NextResponse.json({ permission: existing })
      } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ permission: data })
  } catch (err) {
    console.error('Error POST /api/dev/user-permissions:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
