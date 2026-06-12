import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'dev') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabaseAdmin
      .from('pr_users')
      .select('id, first_name, last_name, email, company_id, role')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const users = (data || []).map((u: any) => ({
      ...u,
      name: `${String(u?.first_name || '').trim()} ${String(u?.last_name || '').trim()}`.trim() || null
    }))
    return NextResponse.json({ users })
  } catch (err) {
    console.error('Error GET /api/dev/users:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
