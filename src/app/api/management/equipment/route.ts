import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

export const dynamic = 'force-dynamic'

const TABLE_NAME = 'pr_management_equipment_daily'

const writeManagementEquipmentAudit = async (
  session: any,
  params: {
    action: string
    resourceId?: string | null
    beforeData?: any
    afterData?: any
    metadata?: Record<string, any> | null
  }
) => {
  await writeAuditLog({
    supabaseAdmin,
    companyId: String(session?.user?.companyId || ''),
    projectId: session?.user?.projectId || null,
    actorUserId: session?.user?.id || null,
    actorEmail: session?.user?.email || null,
    actorRole: session?.user?.role || null,
    action: params.action as any,
    resourceType: 'management_equipment',
    resourceId: params.resourceId || null,
    beforeData: params.beforeData,
    afterData: params.afterData,
    metadata: params.metadata || null,
  })
}

const toNum = (value: any) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const toBool = (value: any) => Boolean(value)

const normalizeKind = (value: any): 'MAYOR' | 'MENOR' => {
  const raw = String(value || '').trim().toUpperCase()
  return raw === 'MENOR' ? 'MENOR' : 'MAYOR'
}

const equipmentIdentityKey = (row: any) => {
  const kind = normalizeKind(row?.equipment_kind)
  const name = String(row?.equipment_name || '').trim().toLocaleLowerCase('es-CL')
  const patent = String(row?.patent || '').trim().toLocaleLowerCase('es-CL')
  return `${kind}__${name}__${patent}`
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const toDayNumber = (iso: string) => {
  const m = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return Number.NaN
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000)
}

const syncEquipmentLifecycle = async (params: { companyId: string; rows: any[]; snapshotDate: string; actor: string }) => {
  const inputRows = params.rows.filter((row) => String(row?.equipment_name || '').trim())
  if (!inputRows.length) return new Map<string, string>()

  const catalogRows = Array.from(new Map(inputRows.map((row) => {
    const identityKey = equipmentIdentityKey(row)
    return [identityKey, {
      company_id: params.companyId,
      identity_key: identityKey,
      equipment_kind: normalizeKind(row?.equipment_kind),
      equipment_name: String(row?.equipment_name || '').trim(),
      patent: String(row?.patent || '').trim() || null,
      updated_at: new Date().toISOString(),
    }]
  })).values())
  const { data: catalog, error: catalogError } = await supabaseAdmin
    .from('pr_management_equipment')
    .upsert(catalogRows, { onConflict: 'company_id,identity_key' })
    .select('id, identity_key')
  if (catalogError) throw new Error(String(catalogError.message || catalogError))

  const equipmentByKey = new Map((catalog || []).map((item: any) => [String(item.identity_key), String(item.id)]))
  const equipmentIds = Array.from(equipmentByKey.values())
  const { data: periods, error: periodsError } = await supabaseAdmin
    .from('pr_management_equipment_periods')
    .select('id, equipment_id, entry_date, exit_date')
    .in('equipment_id', equipmentIds)
    .order('entry_date', { ascending: true })
  if (periodsError) throw new Error(String(periodsError.message || periodsError))

  const periodsByEquipment = new Map<string, any[]>()
  for (const period of periods || []) {
    const key = String(period.equipment_id)
    periodsByEquipment.set(key, [...(periodsByEquipment.get(key) || []), period])
  }

  for (const row of inputRows) {
    const equipmentId = equipmentByKey.get(equipmentIdentityKey(row))
    if (!equipmentId) continue
    const entryDate = String(row?.entry_date || '').slice(0, 10)
    const exitDate = String(row?.return_date || '').slice(0, 10)
    const equipmentPeriods = periodsByEquipment.get(equipmentId) || []
    const openPeriod = equipmentPeriods.find((period) => !period.exit_date)

    if (exitDate) {
      const periodToClose = openPeriod || [...equipmentPeriods].reverse().find((period) => String(period.entry_date).slice(0, 10) <= exitDate && (!period.exit_date || String(period.exit_date).slice(0, 10) >= exitDate))
      if (periodToClose) {
        const { error } = await supabaseAdmin
          .from('pr_management_equipment_periods')
          .update({ exit_date: exitDate, updated_at: new Date().toISOString(), updated_by: params.actor || null })
          .eq('id', periodToClose.id)
        if (error) throw new Error(String(error.message || error))
      } else {
        const start = entryDate && entryDate <= exitDate ? entryDate : exitDate
        const { error } = await supabaseAdmin.from('pr_management_equipment_periods').insert({
          equipment_id: equipmentId,
          entry_date: start,
          exit_date: exitDate,
          created_by: params.actor || null,
          updated_by: params.actor || null,
        })
        if (error) throw new Error(String(error.message || error))
      }
      continue
    }

    if (!openPeriod) {
      const lastExit = [...equipmentPeriods].reverse().find((period) => period.exit_date)
      const start = entryDate || params.snapshotDate
      if (!lastExit || String(lastExit.exit_date).slice(0, 10) < start) {
        const { error } = await supabaseAdmin.from('pr_management_equipment_periods').insert({
          equipment_id: equipmentId,
          entry_date: start,
          created_by: params.actor || null,
          updated_by: params.actor || null,
        })
        if (error) throw new Error(String(error.message || error))
      }
    } else if (entryDate && String(openPeriod.entry_date).slice(0, 10) !== entryDate) {
      const { error } = await supabaseAdmin
        .from('pr_management_equipment_periods')
        .update({ entry_date: entryDate, updated_at: new Date().toISOString(), updated_by: params.actor || null })
        .eq('id', openPeriod.id)
      if (error) throw new Error(String(error.message || error))
    }
  }

  return equipmentByKey
}

const applyEquipmentPeriods = async (rows: any[], date: string) => {
  const equipmentIds = Array.from(new Set(rows.map((row) => String(row?.equipment_id || '')).filter(Boolean)))
  if (!equipmentIds.length) return rows
  const { data, error } = await supabaseAdmin
    .from('pr_management_equipment_periods')
    .select('equipment_id, entry_date, exit_date')
    .in('equipment_id', equipmentIds)
    .order('entry_date', { ascending: true })
  if (error) throw new Error(String(error.message || error))

  const periodsByEquipment = new Map<string, any[]>()
  for (const period of data || []) {
    const key = String(period.equipment_id)
    periodsByEquipment.set(key, [...(periodsByEquipment.get(key) || []), period])
  }
  return rows.map((row) => {
    const periods = periodsByEquipment.get(String(row?.equipment_id || ''))
    if (!periods?.length) return row
    const previous = periods.filter((period) => String(period.entry_date).slice(0, 10) <= date).at(-1)
    const period = previous || periods[0]
    return {
      ...row,
      entry_date: period.entry_date,
      return_date: period.exit_date,
      lifecycle_periods: periods.map((item) => ({
        entry_date: String(item.entry_date).slice(0, 10),
        exit_date: String(item.exit_date || '').slice(0, 10) || null,
      })),
    }
  })
}

const getLatestEquipmentChange = (rows: any[]) => {
  const sorted = (Array.isArray(rows) ? rows : [])
    .map((row: any) => ({
      updated_at: String(row?.updated_at || '').trim(),
      updated_by: String(row?.updated_by || '').trim(),
    }))
    .filter((row) => row.updated_at)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))

  const latest = sorted.at(-1)
  return {
    last_updated_at: latest?.updated_at || null,
    last_updated_by: latest?.updated_by || null,
  }
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
      .select('id, equipment_id, company_id, report_date, equipment_kind, equipment_name, patent, quantity, canaletas_qty, piscinas_qty, is_operational, in_maintenance, in_accreditation, in_breakdown, include_in_daily_report, entry_date, return_date, mileage_km, notes, created_at, updated_at, created_by, updated_by')
      .eq('company_id', companyId)
      .eq('report_date', date)
      .order('equipment_kind', { ascending: true })
      .order('equipment_name', { ascending: true })
      .order('patent', { ascending: true })

    if (error) return NextResponse.json({ error: String(error.message || error) }, { status: 500 })

    const rows = await applyEquipmentPeriods(Array.isArray(data) ? data : [], requestedDate || date)
    const latestChange = getLatestEquipmentChange(rows)
    return NextResponse.json({
      rows,
      snapshot_date: date,
      requested_date: requestedDate || null,
      used_fallback: Boolean(requestedDate && requestedDate !== date),
      available_dates: availableDates,
      last_updated_at: latestChange.last_updated_at,
      last_updated_by: latestChange.last_updated_by,
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
    const propagateToFuture = Boolean(body?.propagateToFuture)
    const changedIdentityKeys = new Set(
      (Array.isArray(body?.changedEquipmentIdentityKeys) ? body.changedEquipmentIdentityKeys : [])
        .map((value: any) => String(value || '').trim())
        .filter(Boolean)
    )

    const incomingRows = Array.isArray(body?.rows) ? body.rows : []
    const lifecycleRows = incomingRows
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
        include_in_daily_report: row?.include_in_daily_report !== false,
        entry_date: String(row?.entry_date || '').slice(0, 10) || null,
        return_date: String(row?.return_date || '').slice(0, 10) || null,
        mileage_km: row?.mileage_km === null || row?.mileage_km === undefined || String(row?.mileage_km).trim() === '' ? null : toNum(row?.mileage_km),
        notes: String(row?.notes || '').trim() || null,
        updated_by: String(session?.user?.email || session?.user?.id || '') || null,
      }))
      .filter((row: any) => row.equipment_name)
      .map((row: any) => {
        if (row.return_date) {
          row.is_operational = false
          row.in_maintenance = false
          row.in_accreditation = false
          row.in_breakdown = false
        } else if (row.is_operational) {
          row.in_maintenance = false
          row.in_accreditation = false
          row.in_breakdown = false
        }
        return row
      })

    const equipmentByKey = await syncEquipmentLifecycle({
      companyId,
      rows: lifecycleRows,
      snapshotDate: date,
      actor: String(session?.user?.email || session?.user?.id || ''),
    })
    const rows = lifecycleRows.map((row: any) => ({
      ...row,
      equipment_id: equipmentByKey.get(equipmentIdentityKey(row)) || null,
    }))

    let beforeRows: any[] = []

    try {
      const { data: existingRows, error: beforeError } = await supabaseAdmin
        .from(TABLE_NAME)
        .select('*')
        .eq('company_id', companyId)
        .eq('report_date', date)
        .order('equipment_kind', { ascending: true })
        .order('equipment_name', { ascending: true })
        .order('patent', { ascending: true })

      if (beforeError) {
        console.warn('Could not read previous management equipment snapshot for audit:', beforeError)
      } else {
        beforeRows = Array.isArray(existingRows) ? existingRows : []
      }
    } catch (auditReadError) {
      console.warn('Could not read previous management equipment snapshot for audit:', auditReadError)
    }

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

    const propagatedDates: string[] = []
    if (propagateToFuture && changedIdentityKeys.size > 0) {
      const changedRow = rows.find((row: any) => changedIdentityKeys.has(equipmentIdentityKey(row)))
      if (changedRow) {
        const { data: futureRows, error: futureRowsError } = await supabaseAdmin
          .from(TABLE_NAME)
          .select('id, equipment_id, report_date, equipment_kind, equipment_name, patent')
          .eq('company_id', companyId)
          .gt('report_date', date)
          .order('report_date', { ascending: true })
        if (futureRowsError) return NextResponse.json({ error: String(futureRowsError.message || futureRowsError) }, { status: 500 })

        const rowsByDate = new Map<string, any[]>()
        for (const futureRow of futureRows || []) {
          const futureDate = String(futureRow?.report_date || '').slice(0, 10)
          if (!futureDate) continue
          rowsByDate.set(futureDate, [...(rowsByDate.get(futureDate) || []), futureRow])
        }

        const fieldsToPropagate = {
          equipment_id: changedRow.equipment_id,
          equipment_kind: changedRow.equipment_kind,
          equipment_name: changedRow.equipment_name,
          patent: changedRow.patent,
          quantity: changedRow.quantity,
          canaletas_qty: changedRow.canaletas_qty,
          piscinas_qty: changedRow.piscinas_qty,
          is_operational: changedRow.is_operational,
          in_maintenance: changedRow.in_maintenance,
          in_accreditation: changedRow.in_accreditation,
          in_breakdown: changedRow.in_breakdown,
          entry_date: changedRow.entry_date,
          return_date: changedRow.return_date,
          mileage_km: changedRow.mileage_km,
          notes: changedRow.notes,
          updated_by: changedRow.updated_by,
          updated_at: new Date().toISOString(),
        }

        for (const [futureDate, snapshotRows] of rowsByDate) {
          const matchingRow = snapshotRows.find((row) => (
            String(row?.equipment_id || '') === String(changedRow.equipment_id || '') ||
            changedIdentityKeys.has(equipmentIdentityKey(row))
          ))
          if (matchingRow?.id) {
            const { error: updateFutureError } = await supabaseAdmin
              .from(TABLE_NAME)
              .update(fieldsToPropagate)
              .eq('id', matchingRow.id)
              .eq('company_id', companyId)
            if (updateFutureError) return NextResponse.json({ error: String(updateFutureError.message || updateFutureError) }, { status: 500 })
          } else {
            const { error: insertFutureError } = await supabaseAdmin
              .from(TABLE_NAME)
              .insert({ ...fieldsToPropagate, company_id: companyId, report_date: futureDate })
            if (insertFutureError) return NextResponse.json({ error: String(insertFutureError.message || insertFutureError) }, { status: 500 })
          }
          propagatedDates.push(futureDate)
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('id, equipment_id, company_id, report_date, equipment_kind, equipment_name, patent, quantity, canaletas_qty, piscinas_qty, is_operational, in_maintenance, in_accreditation, in_breakdown, include_in_daily_report, entry_date, return_date, mileage_km, notes, created_at, updated_at, created_by, updated_by')
      .eq('company_id', companyId)
      .eq('report_date', date)
      .order('equipment_kind', { ascending: true })
      .order('equipment_name', { ascending: true })
      .order('patent', { ascending: true })
    if (error) return NextResponse.json({ error: String(error.message || error) }, { status: 500 })

    const afterRows = Array.isArray(data) ? data : []
    const latestChange = getLatestEquipmentChange(afterRows)

    try {
      await writeManagementEquipmentAudit(session, {
        action: 'save_snapshot',
        resourceId: date,
        beforeData: beforeRows,
        afterData: afterRows,
        metadata: {
          date,
          previous_count: beforeRows.length,
          next_count: afterRows.length,
          propagated_dates: propagatedDates,
        },
      })
    } catch (auditError) {
      console.warn('Could not write management equipment audit log:', auditError)
    }

    return NextResponse.json({
      ok: true,
      rows: afterRows,
      snapshot_date: date,
      last_updated_at: latestChange.last_updated_at,
      last_updated_by: latestChange.last_updated_by,
      propagated_dates: propagatedDates,
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = String(session.user.companyId)
    const body = await req.json()
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ error: 'Equipo requerido.' }, { status: 400 })

    const { data: beforeRow, error: beforeError } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()
    if (beforeError) return NextResponse.json({ error: String(beforeError.message || beforeError) }, { status: 500 })
    if (!beforeRow) return NextResponse.json({ error: 'Equipo no encontrado.' }, { status: 404 })

    const includeInDailyReport = body?.include_in_daily_report !== false
    const updatedBy = String(session?.user?.email || session?.user?.id || '') || null
    const { data: updatedRow, error: updateError } = await supabaseAdmin
      .from(TABLE_NAME)
      .update({
        include_in_daily_report: includeInDailyReport,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single()
    if (updateError) return NextResponse.json({ error: String(updateError.message || updateError) }, { status: 500 })

    try {
      await writeManagementEquipmentAudit(session, {
        action: includeInDailyReport ? 'include_daily_report' : 'exclude_daily_report',
        resourceId: id,
        beforeData: beforeRow,
        afterData: updatedRow,
        metadata: { report_date: String(updatedRow?.report_date || '').slice(0, 10) || null },
      })
    } catch (auditError) {
      console.warn('Could not write equipment daily-report selection audit log:', auditError)
    }

    return NextResponse.json({ ok: true, row: updatedRow })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
