import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = new Set([
  'Turno',
  'Descanso',
  'Fuera de Obra',
  'Licencia',
  'Falla',
  'Vacaciones',
  'Permiso',
  'Teletrabajo',
  'Acreditacion',
  'Finiquitado',
  'Otro',
])

const statusToReasonCode = (status: string): string | null => {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'turno') return '11'
  if (normalized === 'descanso') return 'D'
  if (normalized === 'fuera de obra') return 'FO'
  if (normalized === 'licencia') return 'L'
  if (normalized === 'falla') return 'F'
  if (normalized === 'vacaciones') return 'VAC'
  if (normalized === 'permiso') return 'P'
  if (normalized === 'teletrabajo') return 'TL'
  if (normalized === 'acreditacion') return 'AC'
  if (normalized === 'finiquitado') return 'FIN'
  return null
}

const normalizeDate = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return new Date().toISOString().slice(0, 10)
  return raw.slice(0, 10)
}

const normalizeOptionalDate = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  return raw.slice(0, 10)
}

const isMissingTableError = (error: any) =>
  String(error?.code || '') === '42P01' ||
  String(error?.message || '').toLowerCase().includes('does not exist')

const fetchRoleHistoryForRows = async (companyId: string, rows: any[]) => {
  
  const collaboratorIds = Array.from(new Set(rows.map((row: any) => String(row?.collaborator_id || '').trim()).filter(Boolean)))
  const minDate = rows
    .map((row: any) => String(row?.work_date || '').slice(0, 10))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))[0]
  const maxDate = rows
    .map((row: any) => String(row?.work_date || '').slice(0, 10))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0]
  if (!companyId || collaboratorIds.length === 0 || !minDate || !maxDate) return []

  const { data, error } = await supabaseAdmin
    .from('pr_collaborator_role_history')
    .select('collaborator_id, position, specialty, worker_type, valid_from, valid_to')
    .eq('company_id', companyId)
    .in('collaborator_id', collaboratorIds)
    .lte('valid_from', maxDate)
    .or(`valid_to.is.null,valid_to.gte.${minDate}`)

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

const pickRoleForDate = (historyRows: any[], collaboratorId: string, workDate: string) => {
  const date = String(workDate || '').slice(0, 10)
  return (historyRows || [])
    .filter((row: any) => {
      if (String(row?.collaborator_id || '') !== String(collaboratorId || '')) return false
      const from = String(row?.valid_from || '').slice(0, 10)
      const to = row?.valid_to ? String(row.valid_to).slice(0, 10) : ''
      return from <= date && (!to || to >= date)
    })
    .sort((a: any, b: any) => String(b?.valid_from || '').localeCompare(String(a?.valid_from || '')))[0] || null
}

export async function GET(request: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = String(session.user.role || '').trim().toLowerCase()
    const isDev = role === 'dev'
    const searchParams = request.nextUrl.searchParams
    const queryCompanyId = String(searchParams.get('company_id') || '').trim()
    const companyId = isDev ? (queryCompanyId || String(session.user.companyId || '').trim()) : String(session.user.companyId || '').trim()
    if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

    const workDate = normalizeDate(searchParams.get('date'))
    const dateFromRaw = normalizeOptionalDate(searchParams.get('date_from'))
    const dateToRaw = normalizeOptionalDate(searchParams.get('date_to'))
    const collaboratorId = String(searchParams.get('collaborator_id') || '').trim()
    const statusFilter = String(searchParams.get('status') || '').trim()
    const datesOnly = ['1', 'true', 'yes', 'si', 'on'].includes(
      String(searchParams.get('dates') || '').trim().toLowerCase()
    )
    const turnoDatesOnly = ['1', 'true', 'yes', 'si', 'on'].includes(
      String(searchParams.get('turno_dates') || '').trim().toLowerCase()
    )
    const includeBounds = ['1', 'true', 'yes', 'si', 'on'].includes(
      String(searchParams.get('include_bounds') || '').trim().toLowerCase()
    )
    const turnoIdsOnly = ['1', 'true', 'yes', 'si', 'on'].includes(
      String(searchParams.get('turno_ids') || '').trim().toLowerCase()
    )
    const lean = ['1', 'true', 'yes', 'si', 'on'].includes(
      String(searchParams.get('lean') || '').trim().toLowerCase()
    )

    if (datesOnly) {
      const buildDatesQuery = () => {
        let q = supabaseAdmin
          .from('pr_collaborator_daily_status')
          .select(turnoDatesOnly ? 'work_date, status, reason' : 'work_date')
          .eq('company_id', companyId)

        if (collaboratorId) q = q.eq('collaborator_id', collaboratorId)
        if (statusFilter) q = q.eq('status', statusFilter)
        return q.order('work_date', { ascending: false })
      }

      const rows: any[] = []
      const pageSize = 1000
      let offset = 0
      while (true) {
        const { data, error } = await buildDatesQuery().range(offset, offset + pageSize - 1)
        if (error) {
          if (String((error as any)?.code || '') === '42P01') {
            return NextResponse.json({ error: 'Daily status table missing. Run migration first.' }, { status: 501 })
          }
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        const chunk = Array.isArray(data) ? data : []
        rows.push(...chunk)
        if (chunk.length < pageSize) break
        offset += pageSize
      }

      const dates = Array.from(
        new Set(
          rows
            .filter((row: any) => {
              if (!turnoDatesOnly) return true
              const statusNorm = String(row?.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
              const reasonNorm = String(row?.reason || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
              return statusNorm === 'turno' || reasonNorm === '11'
            })
            .map((row: any) => String(row?.work_date || '').trim().slice(0, 10))
            .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        )
      ).sort((a, b) => b.localeCompare(a))

      return NextResponse.json({
        dates,
        min_work_date: dates.length ? dates[dates.length - 1] : null,
        max_work_date: dates.length ? dates[0] : null,
        company_id: companyId,
      })
    }

    const hasRangeQuery = Boolean(dateFromRaw || dateToRaw)
    let dateFrom = dateFromRaw
    let dateTo = dateToRaw
    if (hasRangeQuery) {
      if (!dateFrom && dateTo) dateFrom = dateTo
      if (!dateTo && dateFrom) dateTo = dateFrom
      if (!dateFrom) dateFrom = workDate
      if (!dateTo) dateTo = workDate
      if (String(dateFrom) > String(dateTo)) {
        const tmp = dateFrom
        dateFrom = dateTo
        dateTo = tmp
      }
    }

    const buildStatusQuery = () => {
      let q = supabaseAdmin
        .from('pr_collaborator_daily_status')
        .select('id, company_id, collaborator_id, work_date, status, reason, updated_by, updated_at, created_at')
        .eq('company_id', companyId)

      if (hasRangeQuery) {
        q = q.gte('work_date', String(dateFrom)).lte('work_date', String(dateTo))
      } else {
        q = q.eq('work_date', workDate)
      }

      if (collaboratorId) q = q.eq('collaborator_id', collaboratorId)
      if (statusFilter) q = q.eq('status', statusFilter)
      return q.order('work_date', { ascending: false }).order('updated_at', { ascending: false })
    }

    // Supabase may return paginated windows; fetch all pages to avoid cutting
    // older dates when there are many rows (e.g., historical attendance).
    const rows: any[] = []
    const pageSize = 1000
    let offset = 0
    while (true) {
      const { data, error } = await buildStatusQuery().range(offset, offset + pageSize - 1)
      if (error) {
        if (String((error as any)?.code || '') === '42P01') {
          return NextResponse.json({ error: 'Daily status table missing. Run migration first.' }, { status: 501 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const chunk = Array.isArray(data) ? data : []
      rows.push(...chunk)
      if (chunk.length < pageSize) break
      offset += pageSize
    }

    if (lean) {
      const leanRows = rows.map((row: any) => ({
        id: row.id,
        collaborator_id: row.collaborator_id,
        work_date: row.work_date,
        status: row.status,
        reason: row.reason,
      }))

      if (hasRangeQuery) {
        return NextResponse.json({
          rows: leanRows,
          date_from: dateFrom,
          date_to: dateTo,
          company_id: companyId,
          min_work_date: null,
          max_work_date: null,
        })
      }

      return NextResponse.json({
        rows: leanRows,
        date: workDate,
        company_id: companyId,
        min_work_date: null,
        max_work_date: null,
      })
    }
    if (turnoIdsOnly) {
      const normalizeLocal = (value: any) =>
        String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
      
      const ids = Array.from(
        new Set(
          rows
            .filter((row: any) => {
              const statusNorm = normalizeLocal(row?.status)
              const reasonNorm = normalizeLocal(row?.reason)
              return statusNorm === 'turno' || reasonNorm === '11'
            })
            .map((row: any) => String(row?.collaborator_id || '').trim())
            .filter(Boolean)
        )
      )
      if (hasRangeQuery) {
        return NextResponse.json({ ids, date_from: dateFrom, date_to: dateTo, company_id: companyId })
      }
      return NextResponse.json({ ids, date: workDate, company_id: companyId })
    }

    const collaboratorIds = Array.from(
      new Set(
        rows
          .map((row: any) => String(row?.collaborator_id || '').trim())
          .filter(Boolean)
      )
    )

    const collaboratorsById = new Map<string, any>()
    if (collaboratorIds.length > 0) {
      const { data: collabs, error: collabError } = await supabaseAdmin
        .from('pr_collaborators')
        .select('id, first_name, last_name, document, position, specialty, worker_type, is_active')
        .in('id', collaboratorIds)

      if (collabError) {
        return NextResponse.json({ error: collabError.message }, { status: 500 })
      }

      ;(collabs || []).forEach((collab: any) => collaboratorsById.set(String(collab.id), collab))
    }

    let roleHistoryRows: any[] = []
    try {
      roleHistoryRows = await fetchRoleHistoryForRows(companyId, rows)
    } catch (historyError) {
      console.warn('Could not load collaborator role history for daily status:', historyError)
    }

    const enrichedRows = rows.map((row: any) => ({
      ...row,
      collaborator: (() => {
        const current = collaboratorsById.get(String(row.collaborator_id)) || null
        if (!current) return null
        const historical = pickRoleForDate(roleHistoryRows, String(row.collaborator_id), String(row.work_date))
        if (!historical) return current
        return {
          ...current,
          position: historical.position ?? current.position,
          specialty: historical.specialty ?? current.specialty,
          worker_type: historical.worker_type ?? current.worker_type,
          role_history_applied: true,
          role_valid_from: historical.valid_from || null,
          role_valid_to: historical.valid_to || null,
        }
      })(),
    }))

    let min_work_date: string | null = null
    let max_work_date: string | null = null
    if (includeBounds) {
      let minQuery = supabaseAdmin
        .from('pr_collaborator_daily_status')
        .select('work_date')
        .eq('company_id', companyId)

      let maxQuery = supabaseAdmin
        .from('pr_collaborator_daily_status')
        .select('work_date')
        .eq('company_id', companyId)

      if (collaboratorId) {
        minQuery = minQuery.eq('collaborator_id', collaboratorId)
        maxQuery = maxQuery.eq('collaborator_id', collaboratorId)
      }
      if (statusFilter) {
        minQuery = minQuery.eq('status', statusFilter)
        maxQuery = maxQuery.eq('status', statusFilter)
      }

      const [{ data: minRows }, { data: maxRows }] = await Promise.all([
        minQuery.order('work_date', { ascending: true }).limit(1),
        maxQuery.order('work_date', { ascending: false }).limit(1),
      ])
      min_work_date = String(minRows?.[0]?.work_date || '').trim() || null
      max_work_date = String(maxRows?.[0]?.work_date || '').trim() || null
    }

    if (hasRangeQuery) {
      return NextResponse.json({
        rows: enrichedRows,
        date_from: dateFrom,
        date_to: dateTo,
        company_id: companyId,
        min_work_date,
        max_work_date,
      })
    }

    return NextResponse.json({ rows: enrichedRows, date: workDate, company_id: companyId, min_work_date, max_work_date })
  } catch (err) {
    console.error('Error GET /api/collaborators/daily-status', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = String(session.user.role || '').trim().toLowerCase()
    const isDev = role === 'dev'
    const companyId = String(session.user.companyId || '').trim()
    if (!isDev && !companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const date = normalizeDate(body?.date)
    const incomingEntries = Array.isArray(body?.entries)
      ? body.entries
      : [{ collaborator_id: body?.collaborator_id, status: body?.status, reason: body?.reason }]

    const cleaned = incomingEntries
      .map((entry: any) => ({
        collaborator_id: String(entry?.collaborator_id || '').trim(),
        status: String(entry?.status || '').trim(),
        reason: (() => {
          const explicitReason = entry?.reason == null ? '' : String(entry.reason).trim()
          return explicitReason || statusToReasonCode(String(entry?.status || '')) || null
        })(),
      }))
      .filter((entry: any) => entry.collaborator_id)

    if (!cleaned.length) {
      return NextResponse.json({ error: 'No valid entries provided' }, { status: 400 })
    }

    const entriesToClear = cleaned.filter((entry: any) => !entry.status)
    const entriesToUpsert = cleaned.filter((entry: any) => !!entry.status)

    for (const entry of entriesToUpsert) {
      if (!ALLOWED_STATUSES.has(entry.status)) {
        return NextResponse.json({ error: `Invalid status: ${entry.status}` }, { status: 400 })
      }
    }

    const collaboratorIds = cleaned.map((entry: any) => entry.collaborator_id)
    let collabQuery = supabaseAdmin
      .from('pr_collaborators')
      .select('id, company_id')
      .in('id', collaboratorIds)

    if (!isDev) collabQuery = collabQuery.eq('company_id', companyId)
    const { data: collabs, error: collabErr } = await collabQuery
    if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

    const allowedCollaborators = new Map((collabs || []).map((c: any) => [String(c.id), String(c.company_id || '')]))

    const inaccessibleEntries = cleaned.filter((entry: any) => !allowedCollaborators.has(entry.collaborator_id))
    if (inaccessibleEntries.length > 0) {
      return NextResponse.json({ error: 'One or more collaborators are not accessible for this company' }, { status: 403 })
    }

    const rowsToUpsert = entriesToUpsert.map((entry: any) => {
      const entryCompanyId = allowedCollaborators.get(entry.collaborator_id) || companyId
      return {
        company_id: entryCompanyId,
        collaborator_id: entry.collaborator_id,
        work_date: date,
        status: entry.status,
        reason: entry.reason,
        updated_by: session.user.id || null,
      }
    }).filter((row: any) => !!row.company_id)

    for (const entry of entriesToClear) {
      const entryCompanyId = allowedCollaborators.get(entry.collaborator_id) || companyId
      if (!entryCompanyId) continue
      const { error: deleteError } = await supabaseAdmin
        .from('pr_collaborator_daily_status')
        .delete()
        .eq('company_id', entryCompanyId)
        .eq('collaborator_id', entry.collaborator_id)
        .eq('work_date', date)

      if (deleteError) {
        if (String((deleteError as any)?.code || '') === '42P01') {
          return NextResponse.json({ error: 'Daily status table missing. Run migration first.' }, { status: 501 })
        }
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }
    }

    if (rowsToUpsert.length === 0) {
      return NextResponse.json({ ok: true, rows: [] })
    }

    const { data, error } = await supabaseAdmin
      .from('pr_collaborator_daily_status')
      .upsert(rowsToUpsert, { onConflict: 'company_id,collaborator_id,work_date' })
      .select('id, company_id, collaborator_id, work_date, status, reason, updated_by, updated_at, created_at')

    if (error) {
      if (String((error as any)?.code || '') === '42P01') {
        return NextResponse.json({ error: 'Daily status table missing. Run migration first.' }, { status: 501 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Keep collaborator master state consistent with attendance:
    // if a FIN/Finiquitado status is written, collaborator cannot remain Vigente.
    const finiquitadoIds = Array.from(
      new Set(
        rowsToUpsert
          .filter((row: any) => String(row.status || '').trim().toLowerCase() === 'finiquitado')
          .map((row: any) => String(row.collaborator_id || '').trim())
          .filter(Boolean)
      )
    )
    if (finiquitadoIds.length > 0) {
      let syncErr: any = null
      const syncPayload: Record<string, any> = { is_active: false, condition: 'Finiquitado' }
      const syncRes = await supabaseAdmin
        .from('pr_collaborators')
        .update(syncPayload)
        .in('id', finiquitadoIds)
      syncErr = syncRes.error
      if (syncErr && String(syncErr.code) === '42703') {
        const fallbackPayload: Record<string, any> = { is_active: false }
        const retry = await supabaseAdmin
          .from('pr_collaborators')
          .update(fallbackPayload)
          .in('id', finiquitadoIds)
        syncErr = retry.error
      }
      if (syncErr) {
        return NextResponse.json({ error: syncErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, rows: data || [] })
  } catch (err) {
    console.error('Error PUT /api/collaborators/daily-status', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
