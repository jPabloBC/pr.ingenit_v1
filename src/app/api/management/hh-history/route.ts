import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const toNumber = (value: any) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const parsed = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeFront = (value: any) => {
  const raw = String(value || '').trim().toUpperCase()
  if (raw.includes('PISC')) return 'PISCINAS'
  if (raw.includes('CANA')) return 'CANALETAS'
  return raw || 'SIN FRENTE'
}

const parseJsonMaybe = (value: any) => {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const weekFromReportNo = (reportNo: number) => {
  if (!reportNo) return null
  if (reportNo <= 5) return 1
  return Math.floor((reportNo - 6) / 7) + 2
}

type HistoryRow = {
  id: string
  company_id?: string
  work_front: string
  report_no: number
  report_date: string
  week_no: number | null
  indirect_hh: number
  direct_hh: number
  daily_hh: number
  indirect_hh_accum: number
  direct_hh_accum: number
  total_hh_accum: number
  major_hm_daily: number
  major_hm_accum: number
  minor_hm_daily: number
  minor_hm_accum: number
  source: string
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

const buildDailyRowsFromAccumulated = (rows: HistoryRow[]) => {
  const byFront = new Map<string, HistoryRow[]>()
  rows.forEach((row) => {
    const frontRows = byFront.get(row.work_front) || []
    frontRows.push(row)
    byFront.set(row.work_front, frontRows)
  })

  byFront.forEach((frontRows) => {
    frontRows.sort((a, b) => a.report_no - b.report_no)
    frontRows.forEach((row, index) => {
      if (row.source === 'manual-historical') return
      const previous = frontRows[index - 1]
      if (!previous) return
      if (row.source === 'daily-report') {
        const indirectDaily = Math.max(0, row.indirect_hh)
        const directDaily = Math.max(0, row.direct_hh)
        row.indirect_hh = indirectDaily
        row.direct_hh = directDaily
        row.daily_hh = indirectDaily + directDaily
        row.indirect_hh_accum = previous.indirect_hh_accum + indirectDaily
        row.direct_hh_accum = previous.direct_hh_accum + directDaily
        row.total_hh_accum = row.indirect_hh_accum + row.direct_hh_accum
      } else {
        row.indirect_hh = Math.max(0, row.indirect_hh_accum - previous.indirect_hh_accum)
        row.direct_hh = Math.max(0, row.direct_hh_accum - previous.direct_hh_accum)
        row.daily_hh = Math.max(0, row.total_hh_accum - previous.total_hh_accum)
      }
      row.major_hm_daily = Math.max(0, row.major_hm_accum - previous.major_hm_accum)
      row.minor_hm_daily = Math.max(0, row.minor_hm_accum - previous.minor_hm_accum)
    })
  })

  return Array.from(byFront.values()).flat().sort((a, b) => {
    if (a.work_front !== b.work_front) return a.work_front.localeCompare(b.work_front, 'es')
    return a.report_no - b.report_no
  })
}

export async function GET(request: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })
    const companyId = String(session.user.companyId)
    const dashboardMode = request.nextUrl.searchParams.get('dashboard') === '1'

    const historySelect: string = dashboardMode
      ? 'id, work_front, report_no, report_date, indirect_hh, direct_hh, daily_hh, indirect_hh_accum, direct_hh_accum, total_hh_accum, major_hm_daily, major_hm_accum, minor_hm_daily, minor_hm_accum, source'
      : 'id, company_id, work_front, report_no, report_date, week_no, indirect_hh, direct_hh, daily_hh, indirect_hh_accum, direct_hh_accum, total_hh_accum, major_hm_daily, major_hm_accum, minor_hm_daily, minor_hm_accum, source, notes, created_at, updated_at'
    const baselineSelect: string = dashboardMode
      ? 'id, work_front, as_of_report_no, as_of_date, prev_indirect_hh, prev_direct_hh, prev_total_hh, prev_major_hm, prev_minor_hm, prev_total_hm, source'
      : 'id, company_id, work_front, as_of_report_no, as_of_date, prev_indirect_hh, prev_direct_hh, prev_total_hh, prev_major_hm, prev_minor_hm, prev_total_hm, source, notes, created_at, updated_at'
    const dailyReportsSelect: string = dashboardMode
      ? 'id, report_no, report_date, work_front, s4_curr_indirect_hh, s4_curr_direct_hh, s4_curr_total_hh, s4_curr_total_hm, notes, created_at, updated_at'
      : 'id, company_id, report_no, report_date, work_front, s4_curr_indirect_hh, s4_curr_direct_hh, s4_curr_total_hh, s4_curr_total_hm, notes, created_at, updated_at'

    const [historyRes, baselinesRes, dailyReportsRes] = await Promise.all([
      supabaseAdmin
        .from('pr_daily_report_front_history')
        .select(historySelect)
        .eq('company_id', companyId)
        .order('work_front', { ascending: true })
        .order('report_no', { ascending: true }),
      supabaseAdmin
        .from('pr_daily_report_front_baselines')
        .select(baselineSelect)
        .eq('company_id', companyId),
      supabaseAdmin
        .from('pr_daily_reports')
        .select(dailyReportsSelect)
        .eq('company_id', companyId)
        .gte('report_no', 29)
        .order('work_front', { ascending: true })
        .order('report_no', { ascending: true }),
    ])

    if (historyRes.error) return NextResponse.json({ error: historyRes.error.message }, { status: 500 })
    if (baselinesRes.error) return NextResponse.json({ error: baselinesRes.error.message }, { status: 500 })
    if (dailyReportsRes.error) return NextResponse.json({ error: dailyReportsRes.error.message }, { status: 500 })

    const combined = new Map<string, HistoryRow>()
    const putRow = (row: HistoryRow) => {
      combined.set(`${row.work_front}__${row.report_no}`, row)
    }
    const putRowIfMissing = (row: HistoryRow) => {
      const key = `${row.work_front}__${row.report_no}`
      if (!combined.has(key)) combined.set(key, row)
    }

    ;(historyRes.data || []).forEach((row: any) => {
      const reportNo = Number(row.report_no || 0)
      if (!reportNo) return
      putRow({
        id: String(row.id),
        company_id: row.company_id,
        work_front: normalizeFront(row.work_front),
        report_no: reportNo,
        report_date: String(row.report_date || ''),
        week_no: Number(row.week_no || 0) || weekFromReportNo(reportNo),
        indirect_hh: toNumber(row.indirect_hh),
        direct_hh: toNumber(row.direct_hh),
        daily_hh: toNumber(row.daily_hh),
        indirect_hh_accum: toNumber(row.indirect_hh_accum),
        direct_hh_accum: toNumber(row.direct_hh_accum),
        total_hh_accum: toNumber(row.total_hh_accum),
        major_hm_daily: toNumber(row.major_hm_daily),
        major_hm_accum: toNumber(row.major_hm_accum),
        minor_hm_daily: toNumber(row.minor_hm_daily),
        minor_hm_accum: toNumber(row.minor_hm_accum),
        source: String(row.source || 'manual-historical'),
        notes: row.notes || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
      })
    })

    ;(baselinesRes.data || []).forEach((row: any) => {
      const reportNo = Number(row.as_of_report_no || 0)
      if (reportNo !== 28) return
      const front = normalizeFront(row.work_front)
      putRowIfMissing({
        id: `baseline-${String(row.id)}`,
        company_id: row.company_id,
        work_front: front,
        report_no: reportNo,
        report_date: String(row.as_of_date || ''),
        week_no: weekFromReportNo(reportNo),
        indirect_hh: 0,
        direct_hh: 0,
        daily_hh: 0,
        indirect_hh_accum: toNumber(row.prev_indirect_hh),
        direct_hh_accum: toNumber(row.prev_direct_hh),
        total_hh_accum: toNumber(row.prev_total_hh),
        major_hm_daily: 0,
        major_hm_accum: toNumber(row.prev_major_hm),
        minor_hm_daily: 0,
        minor_hm_accum: toNumber(row.prev_minor_hm) || Math.max(0, toNumber(row.prev_total_hm) - toNumber(row.prev_major_hm)),
        source: 'front-baseline',
        notes: row.notes || 'Baseline operativo reporte 28',
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
      })
    })

    const latestDailyReportsByFrontReport = new Map<string, any>()
    ;(dailyReportsRes.data || []).forEach((row: any) => {
      const reportNo = Number(row.report_no || 0)
      if (reportNo < 29) return
      const front = normalizeFront(row.work_front)
      const key = `${front}__${reportNo}`
      const current = latestDailyReportsByFrontReport.get(key)
      const currentStamp = Date.parse(String(current?.updated_at || current?.created_at || '')) || 0
      const rowStamp = Date.parse(String(row.updated_at || row.created_at || '')) || 0
      if (!current || rowStamp >= currentStamp) latestDailyReportsByFrontReport.set(key, row)
    })

    ;(Array.from(latestDailyReportsByFrontReport.values()) || []).forEach((row: any) => {
      const reportNo = Number(row.report_no || 0)
      if (reportNo < 29) return
      const front = normalizeFront(row.work_front)
      const combinedKey = `${front}__${reportNo}`
      if (combined.has(combinedKey)) return
      const notes = parseJsonMaybe(row.notes) || {}
      const dailyIndirectHh = toNumber(notes?.summary_indirect_hh)
      const dailyDirectHh = toNumber(notes?.summary_direct_hh)
      const dailyTotalHh = toNumber(notes?.summary_total_hh) || (dailyIndirectHh + dailyDirectHh)
      const majorAccum = toNumber(notes?.s4_curr_major_hm)
      const minorAccum = toNumber(notes?.s4_curr_minor_hm)
      const totalHm = toNumber(row.s4_curr_total_hm ?? notes?.s4_curr_total_hm)
      putRow({
        id: String(row.id),
        company_id: row.company_id,
        work_front: front,
        report_no: reportNo,
        report_date: String(row.report_date || ''),
        week_no: weekFromReportNo(reportNo),
        indirect_hh: dailyIndirectHh,
        direct_hh: dailyDirectHh,
        daily_hh: dailyTotalHh,
        indirect_hh_accum: toNumber(row.s4_curr_indirect_hh ?? notes?.s4_curr_indirect_hh),
        direct_hh_accum: toNumber(row.s4_curr_direct_hh ?? notes?.s4_curr_direct_hh),
        total_hh_accum: toNumber(row.s4_curr_total_hh ?? notes?.s4_curr_total_hh),
        major_hm_daily: 0,
        major_hm_accum: majorAccum,
        minor_hm_daily: 0,
        minor_hm_accum: minorAccum || Math.max(0, totalHm - majorAccum),
        source: 'daily-report',
        notes: null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
      })
    })

    const dailyRows = buildDailyRowsFromAccumulated(Array.from(combined.values()))
    if (dashboardMode) {
      return NextResponse.json(dailyRows.map((row) => ({
        id: row.id,
        work_front: row.work_front,
        report_no: row.report_no,
        report_date: row.report_date,
        indirect_hh: row.indirect_hh,
        direct_hh: row.direct_hh,
        daily_hh: row.daily_hh,
        indirect_hh_accum: row.indirect_hh_accum,
        direct_hh_accum: row.direct_hh_accum,
        total_hh_accum: row.total_hh_accum,
      })))
    }
    return NextResponse.json(dailyRows)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
