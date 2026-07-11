import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { normalizeText } from '@/lib/normalize'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ dates: [] }, { status: 200 })

    const timeZone = 'America/Santiago'
    const localDateKey = (dt: Date) => {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).formatToParts(dt)
        const map: Record<string, string> = {}
        parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
        return `${map.year}-${map.month}-${map.day}`
      } catch {
        return dt.toISOString().slice(0, 10)
      }
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const role = String(session?.user?.role || '').toLowerCase()
    const isAdmin = ['admin', 'dev', 'hr_manager', 'supervisor'].includes(role)
    const userSpec = session?.user?.specialty ? normalizeText(String(session.user.specialty)) : ''

    let crews: any[] = []
    try {
      const { data, error } = await supabaseAdmin
        .from('pr_crews')
        .select('id, specialty, work_date, created_at')
        .eq('company_id', session.user.companyId)
      if (error) throw error
      crews = data || []
    } catch (e: any) {
      const msg = String(e?.message || e)
      const missingCol = /column\s+.*work_date.*does not exist/i.test(msg) || String(e?.code) === '42703'
      if (!missingCol) return NextResponse.json({ error: msg }, { status: 500 })
      const { data, error } = await supabaseAdmin
        .from('pr_crews')
        .select('id, specialty, created_at')
        .eq('company_id', session.user.companyId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      crews = (data || []).map((row: any) => ({ ...row, work_date: null }))
    }

    const uniq = new Set<string>()
    ;(crews || [])
      .filter((row: any) => {
        if (isAdmin || !userSpec) return true
        return normalizeText(String(row?.specialty || '')) === userSpec
      })
      .forEach((row: any) => {
      if (row?.work_date) {
        uniq.add(String(row.work_date))
        return
      }
      if (!row?.created_at) return
      const key = localDateKey(new Date(row.created_at))
      uniq.add(key)
    })

    return NextResponse.json({ dates: Array.from(uniq) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
