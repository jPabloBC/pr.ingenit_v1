import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest, { params }: { params: { companyId: string } }) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'dev') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = params.companyId
    const { data, error } = await supabaseAdmin
      .from('pr_users')
      .select('id, name, email, role')
      .eq('company_id', companyId)
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ users: data || [] })
  } catch (err) {
    console.error('Error GET /api/dev/companies/[companyId]/users:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { companyId: string } }) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'dev') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = params.companyId
    const body = await req.json()
    const { userId, role } = body || {}
    if (!userId || !role) return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 })

    // Ensure the user belongs to the target company
    const { data: found, error: findErr } = await supabaseAdmin
      .from('pr_users')
      .select('id, company_id')
      .eq('id', userId)
      .maybeSingle()

    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
    if (!found || String(found.company_id) !== String(companyId)) return NextResponse.json({ error: 'User not in company' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('pr_users')
      .update({ role })
      .eq('id', userId)
      .select('id, name, email, role')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ user: data })
  } catch (err) {
    console.error('Error PUT /api/dev/companies/[companyId]/users:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
