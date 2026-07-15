import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions) as any
  const companyId = String(session?.user?.companyId || '')
  if (!companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (request.nextUrl.searchParams.get('dates') === '1') {
    const { data, error } = await supabaseAdmin
      .from('pr_daily_reports')
      .select('report_date')
      .eq('company_id', companyId)
      .not('report_date', 'is', null)
      .order('report_date', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const dates = Array.from(new Set((data || []).map((row: any) => String(row.report_date || '').slice(0, 10)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))))
    return NextResponse.json({ dates })
  }

  const date = String(request.nextUrl.searchParams.get('date') || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('pr_daily_reports')
    .select('id, report_no, report_date, work_front')
    .eq('company_id', companyId)
    .eq('report_date', date)
    .order('work_front', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
