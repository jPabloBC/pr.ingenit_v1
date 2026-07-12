import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const normalizeStatus = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const isCompletedStatus = (value: any) => {
  const status = normalizeStatus(value)
  return status === 'completed' || status === 'complete' || status === 'completo' || status === 'cerrado' || status === 'closed'
}

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const companyId = String(session?.user?.companyId || '').trim()
    if (!companyId) return NextResponse.json([])

    const { data, error } = await supabaseAdmin
      .from('pr_field_reports')
      .select('id, report_date, date, work_front, front, status')
      .eq('company_id', companyId)
      .order('report_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const byDate = new Map<string, { date: string; total: number; completed: number; fronts: Set<string> }>()

    ;(data || []).forEach((row: any) => {
      const date = String(row?.report_date || row?.date || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
      const current = byDate.get(date) || { date, total: 0, completed: 0, fronts: new Set<string>() }
      current.total += 1
      if (isCompletedStatus(row?.status)) current.completed += 1
      const front = String(row?.work_front || row?.front || '').trim()
      if (front) current.fronts.add(front.toUpperCase())
      byDate.set(date, current)
    })

    const rows = Array.from(byDate.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .reverse()
      .map((row) => ({
        date: row.date,
        total: row.total,
        completed: row.completed,
        frontCount: row.fronts.size,
        fronts: Array.from(row.fronts).sort((a, b) => a.localeCompare(b, 'es')),
      }))

    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
