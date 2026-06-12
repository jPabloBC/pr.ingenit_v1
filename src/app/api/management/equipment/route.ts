import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const TABLE_NAME = 'pr_management_equipment_daily'

const toNum = (value: any) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const toBool = (value: any) => Boolean(value)

const normalizeKind = (value: any): 'MAYOR' | 'MENOR' => {
  const raw = String(value || '').trim().toUpperCase()
  return raw === 'MENOR' ? 'MENOR' : 'MAYOR'
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const toDayNumber = (iso: string) => {
  const m = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return Number.NaN
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000)
}

const resolveSnapshotDate = async (companyId: string, requestedDate?: string | null) => {
  const explicit = String(requestedDate || '').slice(0, 10)
  if (explicit) return explicit
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('report_date')
    .eq('company_id', companyId)
    .order('report_date', { ascending: false })
    .limit(1)
  if (error) throw new Error(String(error.message || error))
  const latest = Array.isArray(data) && data[0]?.report_date
    ? String(data[0].report_date).slice(0, 10)
    : ''
  return latest || todayIso()
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ rows: [] }, { status: 200 })
    const companyId = String(session.user.companyId)
    const requestedDate = String(req.nextUrl.searchParams.get('date') || '').slice(0, 10)
    const fallbackMode = String(req.nextUrl.searchParams.get('fallback') || '').trim().toLowerCase()

    const { data: datesData, error: datesError } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('report_date')
      .eq('company_id', companyId)
      .order('report_date', { ascending: false })
    if (datesError) return NextResponse.json({ error: String(datesError.message || datesError) }, { status: 500 })

    const availableDates = Array.from(
      new Set(
        (Array.isArray(datesData) ? datesData : [])
          .map((row: any) => String(row?.report_date || '').slice(0, 10))
          .filter(Boolean)
      )
    )

    let date = await resolveSnapshotDate(companyId, requestedDate)
    if (requestedDate && fallbackMode === 'nearest' && availableDates.length > 0 && !availableDates.includes(requestedDate)) {
      const requestedDay = toDayNumber(requestedDate)
      if (!Number.isNaN(requestedDay)) {
        // TEMP QA MODE: absolute-nearest snapshot (can be past or future).
        let best = availableDates[0]
        let bestDistance = Number.POSITIVE_INFINITY
        for (const candidate of availableDates) {
          const candidateDay = toDayNumber(candidate)
          if (Number.isNaN(candidateDay)) continue
          const distance = Math.abs(candidateDay - requestedDay)
          if (distance < bestDistance) {
            best = candidate
            bestDistance = distance
          }
        }
        date = best
      }
    }
    if (requestedDate && fallbackMode === 'on_or_before' && availableDates.length > 0 && !availableDates.includes(requestedDate)) {
      const requestedDay = toDayNumber(requestedDate)
      if (!Number.isNaN(requestedDay)) {
        let bestBefore = ''
        let bestBeforeDay = Number.NEGATIVE_INFINITY
        for (const candidate of availableDates) {
          const candidateDay = toDayNumber(candidate)
          if (Number.isNaN(candidateDay)) continue
          if (candidateDay <= requestedDay && candidateDay > bestBeforeDay) {
            bestBefore = candidate
            bestBeforeDay = candidateDay
          }
        }
        if (bestBefore) date = bestBefore
      }
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('id, report_date, equipment_kind, equipment_name, patent, quantity, canaletas_qty, piscinas_qty, is_operational, in_maintenance, in_accreditation, in_breakdown, mileage_km, notes, created_at, updated_at')
      .eq('company_id', companyId)
      .eq('report_date', date)
      .order('equipment_kind', { ascending: true })
      .order('equipment_name', { ascending: true })
      .order('patent', { ascending: true })

    if (error) return NextResponse.json({ error: String(error.message || error) }, { status: 500 })

    const rows = Array.isArray(data) ? data : []
    return NextResponse.json({
      rows,
      snapshot_date: date,
      requested_date: requestedDate || null,
      used_fallback: Boolean(requestedDate && requestedDate !== date),
      available_dates: availableDates
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const companyId = String(session.user.companyId)
    const body = await req.json()
    const date = await resolveSnapshotDate(companyId, body?.date)

    const incomingRows = Array.isArray(body?.rows) ? body.rows : []
    const rows = incomingRows
      .map((row: any) => ({
        company_id: companyId,
        report_date: date,
        equipment_kind: normalizeKind(row?.equipment_kind),
        equipment_name: String(row?.equipment_name || '').trim(),
        patent: String(row?.patent || '').trim() || null,
        quantity: row?.quantity === null || row?.quantity === undefined || String(row?.quantity).trim() === '' ? 1 : toNum(row?.quantity),
        canaletas_qty: row?.canaletas_qty === null || row?.canaletas_qty === undefined || String(row?.canaletas_qty).trim() === '' ? null : toNum(row?.canaletas_qty),
        piscinas_qty: row?.piscinas_qty === null || row?.piscinas_qty === undefined || String(row?.piscinas_qty).trim() === '' ? null : toNum(row?.piscinas_qty),
        is_operational: toBool(row?.is_operational),
        in_maintenance: toBool(row?.in_maintenance),
        in_accreditation: toBool(row?.in_accreditation),
        in_breakdown: toBool(row?.in_breakdown),
        mileage_km: row?.mileage_km === null || row?.mileage_km === undefined || String(row?.mileage_km).trim() === '' ? null : toNum(row?.mileage_km),
        notes: String(row?.notes || '').trim() || null,
        updated_by: String(session?.user?.email || session?.user?.id || '') || null,
      }))
      .filter((row: any) => row.equipment_name)
      .map((row: any) => {
        if (row.is_operational) {
          row.in_maintenance = false
          row.in_accreditation = false
          row.in_breakdown = false
        }
        return row
      })

    const { error: deleteError } = await supabaseAdmin
      .from(TABLE_NAME)
      .delete()
      .eq('company_id', companyId)
      .eq('report_date', date)
    if (deleteError) return NextResponse.json({ error: String(deleteError.message || deleteError) }, { status: 500 })

    if (rows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from(TABLE_NAME)
        .insert(rows)
      if (insertError) return NextResponse.json({ error: String(insertError.message || insertError) }, { status: 500 })
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('id, report_date, equipment_kind, equipment_name, patent, quantity, canaletas_qty, piscinas_qty, is_operational, in_maintenance, in_accreditation, in_breakdown, mileage_km, notes, created_at, updated_at')
      .eq('company_id', companyId)
      .eq('report_date', date)
      .order('equipment_kind', { ascending: true })
      .order('equipment_name', { ascending: true })
      .order('patent', { ascending: true })
    if (error) return NextResponse.json({ error: String(error.message || error) }, { status: 500 })

    return NextResponse.json({ ok: true, rows: Array.isArray(data) ? data : [], snapshot_date: date })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
