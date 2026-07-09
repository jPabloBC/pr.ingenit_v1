import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    const crewsSource = req.nextUrl.searchParams.get('source') === 'crews'
    let query = supabaseAdmin
      .from('pr_program')
      .select('discipline')
      .eq('company_id', session.user.companyId)

    if (crewsSource) query = query.eq('activity_origin', 'crew_created')

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const list = Array.from(new Set((data || []).map((r: any) => String(r.discipline || '').trim()).filter(Boolean)))
    return NextResponse.json(list)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
