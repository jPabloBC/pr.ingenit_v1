import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    const crewsSource = _req.nextUrl.searchParams.get('source') === 'crews'
    const allRows: any[] = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      let query = supabaseAdmin
        .from('pr_program')
        .select('area')
        .eq('company_id', session.user.companyId)
        .not('area', 'is', null)
        .order('area', { ascending: true })
        .range(from, from + pageSize - 1)

      if (crewsSource) query = query.eq('activity_origin', 'crew_created')

      const { data, error } = await query

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      allRows.push(...(data || []))
      if (!data || data.length < pageSize) break
    }

    const uniq = Array.from(new Set(allRows.map((r: any) => String(r?.area || '').trim()).filter(Boolean)))
    return NextResponse.json(uniq)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
