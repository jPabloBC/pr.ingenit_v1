import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeText } from '@/lib/normalize'
import { resolveCurrentActor } from '@/lib/currentActor'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

export const dynamic = 'force-dynamic'

const normalizeCrewRoleText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const inferCrewRoleFromPosition = (position: any) => {
  const pos = normalizeCrewRoleText(position)
  if (!pos) return 'member'
  if (pos.includes('topografo') || pos.includes('alarife') || pos.includes('rigger')) return 'member'
  if (pos.includes('mecanico mantencion') || pos.includes('electrico mantencion')) return 'member'
  if (pos.includes('capataz') || pos.includes('encargado') || pos.includes('foreman')) return 'foreman'
  if (pos.includes('supervisor') || pos.includes('jefe') || pos.includes('coordinador')) return 'supervisor'
  if (/maestro|maestra|ayudante|helper|operador|operadora|operario|operaria|peon|obrero|trabajador/.test(pos)) return 'member'
  if (pos.includes('senior') || pos.includes('lead')) return 'supervisor'
  return 'member'
}

const normalizeCrewMemberRole = (role: any, position: any) => {
  const explicit = normalizeCrewRoleText(role)
  if (explicit === 'supervisor') return 'supervisor'
  if (explicit === 'foreman' || explicit === 'capataz') return 'foreman'
  if (explicit === 'member' || explicit === 'integrante' || explicit === 'colaborador') return 'member'
  return inferCrewRoleFromPosition(position)
}

const isMissingTableError = (error: any) =>
  String(error?.code || '') === '42P01' ||
  String(error?.message || '').toLowerCase().includes('does not exist')

const isMissingColumnError = (error: any) =>
  String(error?.code || '') === '42703' ||
  String(error?.message || '').toLowerCase().includes('column')

const normalizeYmd = (value: any) => String(value || '').trim().slice(0, 10)

const toChileDateKey = (value: any) => {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const map: Record<string, string> = {}
  parts.forEach((part) => {
    if (part.type !== 'literal') map[part.type] = part.value
  })
  return map.year && map.month && map.day ? `${map.year}-${map.month}-${map.day}` : ''
}

const addDaysToYmd = (value: string, days: number) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

const writeCrewAudit = async (
  supabaseAdminClient: any,
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
    supabaseAdmin: supabaseAdminClient,
    companyId: String(session?.user?.companyId || ''),
    projectId: session?.user?.projectId || null,
    actorUserId: session?.user?.id || null,
    actorEmail: session?.user?.email || null,
    actorRole: session?.user?.role || null,
    action: params.action as any,
    resourceType: 'crew',
    resourceId: params.resourceId || null,
    beforeData: params.beforeData,
    afterData: params.afterData,
    metadata: params.metadata || null
  })
}

const fetchCrewMembersForCrewIds = async (supabaseAdminClient: any, crewIds: string[], withRole: boolean) => {
  const out: any[] = []
  const pageSize = 1000
  for (const chunk of chunkArray(crewIds, 25)) {
    let from = 0
    while (true) {
      const query = supabaseAdminClient
        .from('pr_crew_members')
        .select(withRole ? 'crew_id, collaborator_id, role' : 'crew_id, collaborator_id')
        .in('crew_id', chunk)
        .range(from, from + pageSize - 1)
      const { data, error } = await query
      if (error) throw error
      const rows = data || []
      out.push(...rows)
      if (rows.length < pageSize) break
      from += pageSize
    }
  }
  return out
}

const fetchRoleHistoryByCollaborator = async (
  supabaseAdminClient: any,
  companyId: string,
  collaboratorIds: string[],
  asOfDate: string
) => {
  const ids = Array.from(new Set(collaboratorIds.map((id) => String(id || '').trim()).filter(Boolean)))
  const date = normalizeYmd(asOfDate)
  if (!ids.length || !date) return new Map<string, any>()

  const allRows: any[] = []
  for (const chunk of chunkArray(ids, 75)) {
    const { data, error } = await supabaseAdminClient
      .from('pr_collaborator_role_history')
      .select('collaborator_id, position, specialty, worker_type, valid_from, valid_to')
      .eq('company_id', companyId)
      .in('collaborator_id', chunk)
      .lte('valid_from', date)
      .or(`valid_to.is.null,valid_to.gte.${date}`)
      .order('valid_from', { ascending: false })

    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) return new Map<string, any>()
      throw error
    }
    allRows.push(...(data || []))
  }

  const byId = new Map<string, any>()
  ;(allRows || []).forEach((row: any) => {
    const id = String(row?.collaborator_id || '').trim()
    if (id && !byId.has(id)) byId.set(id, row)
  })
  return byId
}

const getAuditOwnedCrewIds = async (
  supabaseAdminClient: any,
  session: any,
  crewIds: string[]
) => {
  const owned = new Set<string>()
  const ids = Array.from(new Set((crewIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
  const userId = String(session?.user?.id || '').trim()
  const userEmail = normalizeText(String(session?.user?.email || ''))
  if (!ids.length || (!userId && !userEmail)) return owned

  try {
    for (const chunk of chunkArray(ids, 75)) {
      const { data, error } = await supabaseAdminClient
        .from('pr_platform_audit_logs')
        .select('resource_id, actor_user_id, actor_email')
        .eq('company_id', session.user.companyId)
        .eq('resource_type', 'crew')
        .eq('action', 'create')
        .in('resource_id', chunk)

      if (error) {
        if (isMissingTableError(error) || isMissingColumnError(error)) return owned
        continue
      }

      ;(data || []).forEach((row: any) => {
        const resourceId = String(row?.resource_id || '').trim()
        if (!resourceId) return
        const actorUserId = String(row?.actor_user_id || '').trim()
        const actorEmail = normalizeText(String(row?.actor_email || ''))
        if ((userId && actorUserId === userId) || (userEmail && actorEmail === userEmail)) {
          owned.add(resourceId)
        }
      })
    }
  } catch {
    return owned
  }

  return owned
}

const parseCrewIdsFromFieldReport = (value: any) => {
  if (Array.isArray(value)) return value.map((id) => String(id || '').trim()).filter(Boolean)
  if (value == null || value === '') return []
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map((id) => String(id || '').trim()).filter(Boolean)
    } catch {}
    return raw
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((id) => id.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
  }
  return [String(value || '').trim()].filter(Boolean)
}

const getFieldReportUsageByCrewIds = async (
  supabaseAdminClient: any,
  companyId: string,
  crewIds: string[]
) => {
  const ids = Array.from(new Set((crewIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
  const usage = new Map<string, { reportIds: Set<string>; samples: any[] }>()
  if (!companyId || ids.length === 0) return usage

  const ensure = (crewId: string) => {
    if (!usage.has(crewId)) usage.set(crewId, { reportIds: new Set<string>(), samples: [] })
    return usage.get(crewId)!
  }

  const register = (crewId: string, row: any) => {
    const id = String(crewId || '').trim()
    if (!id) return
    const reportId = String(row?.id || '').trim()
    if (!reportId) return
    const slot = ensure(id)
    if (slot.reportIds.has(reportId)) return
    slot.reportIds.add(reportId)
    if (slot.samples.length < 5) {
      slot.samples.push({
        id: reportId,
        date: row?.date || null,
        report_sequence_no: row?.report_sequence_no || null,
      })
    }
  }

  const applyRows = (rows: any[], chunkSet: Set<string>) => {
    ;(rows || []).forEach((row: any) => {
      const directCrewId = String(row?.crew_id || '').trim()
      if (directCrewId && chunkSet.has(directCrewId)) register(directCrewId, row)
      parseCrewIdsFromFieldReport(row?.crew_ids).forEach((crewId) => {
        if (chunkSet.has(crewId)) register(crewId, row)
      })
    })
  }

  for (const chunk of chunkArray(ids, 50)) {
    const chunkSet = new Set(chunk.map(String))
    let directQuery = await supabaseAdminClient
      .from('pr_field_reports')
      .select('id, date, report_sequence_no, crew_id, crew_ids')
      .eq('company_id', companyId)
      .in('crew_id', chunk)
      .limit(1000)

    if (directQuery.error && isMissingColumnError(directQuery.error)) {
      directQuery = await supabaseAdminClient
        .from('pr_field_reports')
        .select('id, date, report_sequence_no, crew_id')
        .eq('company_id', companyId)
        .in('crew_id', chunk)
        .limit(1000)
    }
    if (!directQuery.error) applyRows(directQuery.data || [], chunkSet)

    const arrayQuery = await supabaseAdminClient
      .from('pr_field_reports')
      .select('id, date, report_sequence_no, crew_id, crew_ids')
      .eq('company_id', companyId)
      .overlaps('crew_ids', chunk)
      .limit(1000)

    if (!arrayQuery.error) applyRows(arrayQuery.data || [], chunkSet)
  }

  return usage
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })
    const role = String(session?.user?.role || '').toLowerCase()
    const summary = req.nextUrl.searchParams.get('summary') === '1'
    const datesOnly = req.nextUrl.searchParams.get('dates') === '1' || req.nextUrl.searchParams.get('dates') === 'true'
    const dateFrom = normalizeYmd(req.nextUrl.searchParams.get('date_from'))
    const dateTo = normalizeYmd(req.nextUrl.searchParams.get('date_to'))

    // Fetch logged-in collaborator to get their specialty
    const authId = session.user.id
    const email = session.user.email
    let collaborator: any = null
    try {
      if (authId) {
        try {
          const byAuth = await supabaseAdmin
            .from('pr_collaborators')
            .select('*')
            .eq('auth_id', String(authId))
            .maybeSingle()
          if (!byAuth.error) collaborator = byAuth.data
        } catch (e: any) {
          if (String(e?.code) !== '42703') throw e
        }
      }
      if (!collaborator && session?.user?.id) {
        try {
          const byUser = await supabaseAdmin
            .from('pr_collaborators')
            .select('*')
            .eq('user_id', String(session.user.id))
            .maybeSingle()
          if (!byUser.error) collaborator = byUser.data
        } catch (e: any) {
          if (String(e?.code) !== '42703') throw e
        }
      }
      if (!collaborator && email) {
        try {
          const byEmail = await supabaseAdmin
            .from('pr_collaborators')
            .select('*')
            .eq('email', String(email))
            .maybeSingle()
          if (!byEmail.error) collaborator = byEmail.data
        } catch (e: any) {
          if (String(e?.code) !== '42703') throw e
        }
      }
    } catch (dbErr) {
      return NextResponse.json({ error: String(dbErr) }, { status: 500 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    let crewsQuery = supabaseAdminClient
      .from('pr_crews')
      .select(datesOnly ? 'work_date, created_at' : '*')
      .eq('company_id', session.user.companyId)
      .order('created_at', { ascending: false })

    if (dateFrom || dateTo) {
      const from = dateFrom || dateTo
      const to = dateTo || dateFrom
      if (from && to) {
        const toExclusive = addDaysToYmd(to, 1) || to
        crewsQuery = crewsQuery.or(
          `and(work_date.gte.${from},work_date.lte.${to}),and(work_date.is.null,created_at.gte.${from}T00:00:00.000Z,created_at.lt.${toExclusive}T00:00:00.000Z)`
        )
      }
    }

    const { data, error } = await crewsQuery

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows: any[] = data || []

    if (datesOnly) {
      const dates = Array.from(new Set(
        rows
          .map((row: any) => String(row?.work_date || '').trim().slice(0, 10) || toChileDateKey(row?.created_at))
          .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      )).sort((a, b) => b.localeCompare(a))
      return NextResponse.json({ dates })
    }

    // Enrich crews with supervisors/foremen/members from pr_crew_members so UI can
    // reliably detect occupied collaborators by date.
    try {
      const crewIds = rows.map((r: any) => String(r?.id || '')).filter(Boolean)
      if (crewIds.length > 0) {
        let memberRows: any[] = []
        try {
          memberRows = await fetchCrewMembersForCrewIds(supabaseAdminClient, crewIds, true)
        } catch (e: any) {
          // Fallback for older schemas without role column
          memberRows = (await fetchCrewMembersForCrewIds(supabaseAdminClient, crewIds, false))
            .map((m: any) => ({ ...m, role: null }))
        }

        if (summary) {
          const byCrew = new Map<string, { supervisors: string[]; foremen: string[]; members: string[] }>()

          const ensure = (id: string) => {
            if (!byCrew.has(id)) byCrew.set(id, { supervisors: [], foremen: [], members: [] })
            return byCrew.get(id)!
          }

          ;(memberRows || []).forEach((m: any) => {
            const crewId = String(m?.crew_id || '')
            const collaboratorId = String(m?.collaborator_id || '')
            if (!crewId || !collaboratorId) return

            const role = normalizeCrewMemberRole(m?.role, '')
            const slot = ensure(crewId)

            if (role === 'supervisor') slot.supervisors.push(collaboratorId)
            else if (role === 'foreman') slot.foremen.push(collaboratorId)
            else slot.members.push(collaboratorId)
          })

        rows.forEach((r: any) => {
          const crewId = String(r?.id || '')
          const slot = byCrew.get(crewId)
          r.supervisors = Array.from(new Set(slot?.supervisors || []))
          r.foremen = Array.from(new Set(slot?.foremen || []))
          r.members = Array.from(new Set(slot?.members || []))
          r.activities_count = 0
          r.has_activities = false
        })

        const fieldReportUsageByCrewId = await getFieldReportUsageByCrewIds(
          supabaseAdminClient,
          String(session.user.companyId || ''),
          crewIds
        )
        rows.forEach((r: any) => {
          const crewId = String(r?.id || '')
          const usage = fieldReportUsageByCrewId.get(crewId)
          const count = usage?.reportIds?.size || 0
          r.field_report_count = count
          r.has_field_reports = count > 0
          r.is_locked_by_field_report = count > 0
          r.field_report_lock_samples = usage?.samples || []
        })

        const sessionUserId = String(session?.user?.id || '').trim()
        const sessionUserEmail = normalizeText(String(session?.user?.email || ''))
        const auditOwnedCrewIds = await getAuditOwnedCrewIds(supabaseAdminClient, session, crewIds)
        rows.forEach((r: any) => {
          const creatorCandidates = [
            r?.created_by_user_id,
            r?.created_by,
            r?.created_by_id,
            r?.creator_user_id,
            r?.user_id,
            r?.owner_user_id,
            r?.auth_id,
          ].map((value: any) => String(value || '').trim()).filter(Boolean)
          const creatorEmailCandidates = [
            r?.created_by_email,
            r?.owner_email,
            r?.email,
          ].map((value: any) => normalizeText(String(value || ''))).filter(Boolean)
          r.created_by_current_user = Boolean(
            (sessionUserId && creatorCandidates.some((value) => value === sessionUserId)) ||
            (sessionUserEmail && creatorCandidates.some((value) => normalizeText(value) === sessionUserEmail)) ||
            (sessionUserEmail && creatorEmailCandidates.some((value) => value === sessionUserEmail)) ||
            auditOwnedCrewIds.has(String(r?.id || ''))
          )
        })

        try {
            const activityCountsByCrew = new Map<string, number>()
            for (const chunk of chunkArray(crewIds, 75)) {
              let from = 0
              const pageSize = 1000
              while (true) {
                const { data: activityRows, error: activityErr } = await supabaseAdminClient
                  .from('pr_crew_activities')
                  .select('crew_id')
                  .eq('company_id', session.user.companyId)
                  .in('crew_id', chunk)
                  .range(from, from + pageSize - 1)
                if (activityErr) throw activityErr
                const pageRows = activityRows || []
                pageRows.forEach((activity: any) => {
                  const crewId = String(activity?.crew_id || '')
                  if (!crewId) return
                  activityCountsByCrew.set(crewId, (activityCountsByCrew.get(crewId) || 0) + 1)
                })
                if (pageRows.length < pageSize) break
                from += pageSize
              }
            }

            rows.forEach((r: any) => {
              const crewId = String(r?.id || '')
              const count = activityCountsByCrew.get(crewId) || 0
              r.activities_count = count
              r.has_activities = count > 0
            })
          } catch {}

          return NextResponse.json(rows)
        }

        const collabIds = Array.from(new Set(
          (memberRows || [])
            .map((m: any) => String(m?.collaborator_id || ''))
            .filter(Boolean)
        ))
        const collaboratorById = new Map<string, any>()
        if (collabIds.length > 0) {
          for (const chunk of chunkArray(collabIds, 75)) {
            const { data: collabRows, error: collabErr } = await supabaseAdminClient
              .from('pr_collaborators')
              .select('id, first_name, last_name, position, specialty, worker_type, document')
              .in('id', chunk)
            if (collabErr) throw collabErr
            ;(collabRows || []).forEach((c: any) => {
              collaboratorById.set(String(c?.id || ''), c)
            })
          }
        }

        const historyByDate = new Map<string, Map<string, any>>()
        const getRoleSnapshot = async (workDate: string) => {
          const date = normalizeYmd(workDate)
          if (!date) return new Map<string, any>()
          if (!historyByDate.has(date)) {
            historyByDate.set(date, await fetchRoleHistoryByCollaborator(
              supabaseAdminClient,
              String(session.user.companyId),
              collabIds,
              date
            ))
          }
          return historyByDate.get(date)!
        }

        const byCrew = new Map<string, { supervisors: string[]; foremen: string[]; members: string[]; memberDetails: any[] }>()
        const ensure = (id: string) => {
          if (!byCrew.has(id)) byCrew.set(id, { supervisors: [], foremen: [], members: [], memberDetails: [] })
          return byCrew.get(id)!
        }
        const crewById = new Map(rows.map((r: any) => [String(r?.id || ''), r]))
        for (const m of memberRows || []) {
          const cid = String(m?.crew_id || '')
          const collabId = String(m?.collaborator_id || '')
          if (!cid || !collabId) continue
          const crew = crewById.get(cid) as any
          const history = await getRoleSnapshot(String(crew?.work_date || ''))
          const base = collaboratorById.get(collabId) || { id: collabId }
          const historical = history.get(collabId)
          const detail = {
            ...base,
            id: collabId,
            position: historical?.position ?? base?.position ?? '',
            specialty: historical?.specialty ?? base?.specialty ?? '',
            worker_type: historical?.worker_type ?? base?.worker_type ?? '',
          }
          const role = normalizeCrewMemberRole(m?.role, detail.position)
          const slot = ensure(cid)
          if (role === 'supervisor') slot.supervisors.push(collabId)
          else if (role === 'foreman') slot.foremen.push(collabId)
          else slot.members.push(collabId)
          slot.memberDetails.push({ ...detail, crew_role: role })
        }

        rows.forEach((r: any) => {
          const cid = String(r?.id || '')
          const slot = byCrew.get(cid)
          r.supervisors = Array.from(new Set(slot?.supervisors || []))
          r.foremen = Array.from(new Set(slot?.foremen || []))
          r.members = Array.from(new Set(slot?.members || []))

          if (!summary) {
            r.crew_member_details = Array.from(
              new Map((slot?.memberDetails || []).map((c: any) => [String(c?.id || ''), c])).values()
            )
          }
        })
      }
    } catch {
      // keep backward compatibility if member enrichment fails
    }

    // Attach assigned activities per crew (names + item_id) for the full list only.
    // The field-report/daily-report screens request summary=1 and load activities lazily.
    if (!summary) try {
      const crewIds = rows.map(r => r.id).filter(Boolean)
      if (crewIds.length > 0) {
        const fetchAssigned = async (withDisplayOrder: boolean) => {
          const selectCols = ['crew_id', 'activity_id', 'created_at', 'user_detail', 'work_date']
          if (withDisplayOrder) selectCols.push('display_order')
          return supabaseAdminClient
            .from('pr_crew_activities')
            .select(selectCols.join(', '))
            .in('crew_id', crewIds)
            .order('created_at', { ascending: true })
        }

        let assigned: any[] = []
        {
          const first = await fetchAssigned(true)
          if (!first.error) {
            assigned = first.data || []
          } else {
            const second = await fetchAssigned(false)
            if (second.error) throw second.error
            assigned = second.data || []
          }
        }

        const activityIds: string[] = []
        const crewToActivityIds = new Map<string, string[]>()
        const crewActivityDetail = new Map<string, string>()
        const assignedByCrew = new Map<string, any[]>()
        ;(assigned || []).forEach((a: any) => {
          const cid = String(a?.crew_id || '')
          if (!cid) return
          const list = assignedByCrew.get(cid) || []
          list.push(a)
          assignedByCrew.set(cid, list)
        })

        rows.forEach((r: any) => {
          const cid = String(r?.id || '')
          const crewWorkDate = String(r?.work_date || '').trim().slice(0, 10) || toChileDateKey(r?.created_at)
          const allRows = assignedByCrew.get(cid) || []
          const sameDateRows = crewWorkDate
            ? allRows.filter((a: any) => {
              const activityWorkDate = String(a?.work_date || '').slice(0, 10)
              if (activityWorkDate) return activityWorkDate === crewWorkDate
              return toChileDateKey(a?.created_at) === crewWorkDate
            })
            : allRows
          const sourceRows = sameDateRows

          const orderedRows = sourceRows
            .slice()
            .sort((a: any, b: any) => {
              const ao = Number(a?.display_order)
              const bo = Number(b?.display_order)
              const aHas = Number.isFinite(ao)
              const bHas = Number.isFinite(bo)
              if (aHas && bHas && ao !== bo) return ao - bo
              if (aHas && !bHas) return -1
              if (!aHas && bHas) return 1
              return String(a?.created_at || '').localeCompare(String(b?.created_at || ''))
            })

          const seen = new Set<string>()
          const ids: string[] = []
          orderedRows.forEach((a: any) => {
            const aid = String(a?.activity_id || '')
            if (!aid || seen.has(aid)) return
            seen.add(aid)
            ids.push(aid)
            activityIds.push(aid)
            const detail = String(a?.user_detail || '').trim()
            if (detail) crewActivityDetail.set(`${cid}::${aid}`, detail)
          })
          crewToActivityIds.set(cid, ids)
        })

        if (activityIds.length > 0) {
          const { data: activities } = await supabaseAdminClient
            .from('pr_program')
            .select('id, item_id, activity')
            .eq('company_id', session.user.companyId)
            .in('id', activityIds)

          const actMap = new Map((activities || []).map((a: any) => [String(a.id), a]))
          for (const r of rows) {
            const ids = crewToActivityIds.get(String(r.id)) || []
            r.activities = ids.map((aid) => {
              const a = actMap.get(aid) as any
              return {
                id: aid,
                item_id: a?.item_id ?? null,
                activity: a?.activity ?? null,
                user_detail: crewActivityDetail.get(`${String(r.id)}::${aid}`) || null
              }
            })
            // backward-compatible single value for any consumer
            if (ids.length > 0) {
              const first = actMap.get(ids[0]) as any
              r.activity_id = ids[0]
              r.activity_name = first?.activity ?? r.activity_name
            }
          }
        }
      }
    } catch {
      // ignore activity lookup errors
    }

    // Helper to extract specialty value from various formats
    const extractSpecialty = (val: any) => {
      if (val == null) return ''
      if (Array.isArray(val)) return val.join(' ')
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val)
          if (Array.isArray(parsed)) return parsed.join(' ')
        } catch {}
        return val
      }
      return String(val)
    }
    const fieldReportUsageByCrewId = await getFieldReportUsageByCrewIds(
      supabaseAdminClient,
      String(session.user.companyId || ''),
      rows.map((row: any) => String(row?.id || '')).filter(Boolean)
    )
    rows.forEach((row: any) => {
      const crewId = String(row?.id || '')
      const usage = fieldReportUsageByCrewId.get(crewId)
      const count = usage?.reportIds?.size || 0
      row.field_report_count = count
      row.has_field_reports = count > 0
      row.is_locked_by_field_report = count > 0
      row.field_report_lock_samples = usage?.samples || []
    })

    const sessionUserIdForOwnership = String(session?.user?.id || '').trim()
    const sessionUserEmailForOwnership = normalizeText(String(session?.user?.email || ''))
    const isCrewOwnedByCurrentUser = (crew: any) => {
      const creatorCandidates = [
        crew?.created_by_user_id,
        crew?.created_by,
        crew?.created_by_id,
        crew?.creator_user_id,
        crew?.user_id,
        crew?.owner_user_id,
        crew?.auth_id,
      ].map((value: any) => String(value || '').trim()).filter(Boolean)
      if (sessionUserIdForOwnership && creatorCandidates.some((value) => value === sessionUserIdForOwnership)) return true
      if (sessionUserEmailForOwnership && creatorCandidates.some((value) => normalizeText(value) === sessionUserEmailForOwnership)) return true
      const creatorEmailCandidates = [
        crew?.created_by_email,
        crew?.owner_email,
        crew?.email,
      ].map((value: any) => normalizeText(String(value || ''))).filter(Boolean)
      return Boolean(sessionUserEmailForOwnership && creatorEmailCandidates.some((value) => value === sessionUserEmailForOwnership))
    }
    const auditOwnedCrewIds = await getAuditOwnedCrewIds(
      supabaseAdminClient,
      session,
      rows.map((row: any) => String(row?.id || '')).filter(Boolean)
    )
    rows.forEach((row: any) => {
      row.created_by_current_user = isCrewOwnedByCurrentUser(row) || auditOwnedCrewIds.has(String(row?.id || ''))
    })

    // Return all crews for every role (including user). Filtering by crew specialty
    // caused crews to disappear when specialty changed.
    if (role !== 'user') {
      return NextResponse.json(rows)
    }

    const userId = String(session?.user?.id || '')
    const userEmail = normalizeText(String(session?.user?.email || ''))
    const userCollaboratorId = String(collaborator?.id || '')
    let memberCrewIds = new Set<string>()
    if (userCollaboratorId) {
      try {
        const { data: memberRows, error: memberErr } = await supabaseAdminClient
          .from('pr_crew_members')
          .select('crew_id')
          .eq('collaborator_id', userCollaboratorId)
        if (!memberErr) {
          memberCrewIds = new Set((memberRows || []).map((r: any) => String(r?.crew_id || '')).filter(Boolean))
        }
      } catch {
        // ignore
      }
    }
    const isCreatedByLoggedUser = (crew: any) => {
      const creatorCandidates = [
        crew?.created_by_user_id,
        crew?.created_by,
        crew?.created_by_id,
        crew?.creator_user_id,
        crew?.user_id,
        crew?.owner_user_id,
        crew?.auth_id,
      ].map((v: any) => String(v || '').trim()).filter(Boolean)
      if (userId && creatorCandidates.some((v) => v === userId)) return true
      if (userEmail && creatorCandidates.some((v) => normalizeText(v) === userEmail)) return true
      const creatorEmailCandidates = [
        crew?.created_by_email,
        crew?.owner_email,
        crew?.email,
      ].map((v: any) => normalizeText(String(v || ''))).filter(Boolean)
      if (userEmail && creatorEmailCandidates.some((v) => v === userEmail)) return true
      return false
    }
    const isLinkedByLegacyCrewFields = (crew: any) => {
      if (!userCollaboratorId) return false
      const readIds = (a: any, b?: any) => {
        const val = a ?? b
        if (!val) return [] as string[]
        if (Array.isArray(val)) return val.map((x: any) => String(x))
        return [String(val)]
      }
      const ids = [
        ...readIds(crew?.supervisors, crew?.supervisor),
        ...readIds(crew?.foremen, crew?.foreman),
        ...readIds(crew?.members, crew?.member),
      ].filter(Boolean)
      return ids.includes(String(userCollaboratorId))
    }

    // Keep backward-compatible visibility exceptions for users. Specialty filter removed.
    const filtered = rows.filter(r => {
      if (memberCrewIds.has(String(r?.id || ''))) return true
      if (isLinkedByLegacyCrewFields(r)) return true
      if (r?.created_by_current_user === true) return true
      if (isCreatedByLoggedUser(r)) return true
      return true
    })

    return NextResponse.json(filtered)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await resolveCurrentActor(session)
    void actor
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })

    const body = await req.json()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    // Create crew (only store core fields in pr_crews; members are in pr_crew_members)
    const normalizedName = body?.name ? String(body.name).toLocaleUpperCase('es-CL') : body?.name
    const normalizedSpecialty = body?.specialty ? String(body.specialty).toLocaleUpperCase('es-CL') : body?.specialty

    const insertPayload: Record<string, any> = {
      company_id: session.user.companyId,
      name: normalizedName,
      description: body.description || null,
    }

    // Try to include specialty if provided
    if (normalizedSpecialty) {
      insertPayload.specialty = normalizedSpecialty
    }
    const fieldBossId = body?.field_boss_id ? String(body.field_boss_id) : null
    if (typeof body.work_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.work_date)) {
      insertPayload.work_date = body.work_date
    }

    let crew: any = null
    try {
      const { data, error } = await supabaseAdmin
        .from('pr_crews')
        .insert(insertPayload)
        .select()
        .single()
      if (error) throw error
      crew = data
    } catch (e: any) {
      const msg = String(e?.message || e)
      const missingCol = String(e?.code) === '42703'
      if (!missingCol) return NextResponse.json({ error: msg }, { status: 500 })
      const { work_date: _wd, ...fallbackPayload } = insertPayload
      const { data, error } = await supabaseAdmin
        .from('pr_crews')
        .insert(fallbackPayload)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      crew = data
    }

    // Best-effort: support alternate column names for "Jefe de Terreno" across schemas.
    if (crew?.id && fieldBossId) {
      const altColumns = ['field_boss_id', 'jefe_terreno_id', 'terrain_boss_id']
      for (const col of altColumns) {
        const { error } = await supabaseAdmin
          .from('pr_crews')
          .update({ [col]: fieldBossId })
          .eq('company_id', session.user.companyId)
          .eq('id', crew.id)
        if (!error) break
        const msg = String((error as any)?.message || '')
        const code = String((error as any)?.code || '')
        const isMissingColumn = code === '42703' || msg.includes('Could not find the') || msg.includes('column')
        if (!isMissingColumn) break
      }
    }

    // Best-effort: persist creator user reference (for visibility exception in GET).
    if (crew?.id && session?.user?.id) {
      const creatorColumns = ['created_by_user_id', 'created_by', 'created_by_id', 'creator_user_id', 'user_id', 'owner_user_id']
      for (const col of creatorColumns) {
        const { error } = await supabaseAdmin
          .from('pr_crews')
          .update({ [col]: String(session.user.id) })
          .eq('company_id', session.user.companyId)
          .eq('id', crew.id)
        if (!error) break
        const msg = String((error as any)?.message || '')
        const code = String((error as any)?.code || '')
        const isMissingColumn = code === '42703' || msg.includes('Could not find the') || msg.includes('column')
        if (!isMissingColumn) break
      }
    }
    if (crew?.id && session?.user?.email) {
      const creatorEmailColumns = ['created_by_email', 'owner_email']
      for (const col of creatorEmailColumns) {
        const { error } = await supabaseAdmin
          .from('pr_crews')
          .update({ [col]: String(session.user.email) })
          .eq('company_id', session.user.companyId)
          .eq('id', crew.id)
        if (!error) {
          crew = { ...crew, [col]: String(session.user.email) }
          break
        }
        const msg = String((error as any)?.message || '')
        const code = String((error as any)?.code || '')
        const isMissingColumn = code === '42703' || msg.includes('Could not find the') || msg.includes('column')
        if (!isMissingColumn) break
      }
    }
    if (crew) {
      crew.created_by_current_user = true
      if (session?.user?.id && !crew.created_by_user_id) crew.created_by_user_id = String(session.user.id)
      if (session?.user?.email && !crew.created_by_email) crew.created_by_email = String(session.user.email)
    }

    // Assign members if provided — include role per assignment (supervisor/foreman/member)
    const supList: string[] = Array.isArray(body.supervisors) ? body.supervisors.map(String) : []
    const frmList: string[] = Array.isArray(body.foremen) ? body.foremen.map(String) : []
    const memList: string[] = Array.isArray(body.members) ? body.members.map(String) : []
    const allowMultiAssignmentIds = new Set<string>(
      Array.isArray(body?.allow_multi_assignment_ids)
        ? body.allow_multi_assignment_ids.map((x: any) => String(x)).filter(Boolean)
        : []
    )

    // Build map of collaboratorId -> bestRole (supervisor > foreman > member)
    const rolePriority: Record<string, number> = { supervisor: 3, foreman: 2, member: 1 }
    const roleMap = new Map<string, string>()
    const setRole = (id: string, role: string) => {
      const prev = roleMap.get(id)
      if (!prev || (rolePriority[role] || 0) > (rolePriority[prev] || 0)) roleMap.set(id, role)
    }
    supList.forEach(id => setRole(String(id), 'supervisor'))
    frmList.forEach(id => setRole(String(id), 'foreman'))
    memList.forEach(id => setRole(String(id), 'member'))

    const uniqueIds = Array.from(roleMap.keys())
    const nonSupervisorIds = uniqueIds.filter((id) => (roleMap.get(id) || '').toLowerCase() !== 'supervisor')
    if (uniqueIds.length > 0) {
      const targetWorkDate = String(body?.work_date || '').trim()
      // Validate that none of the collaborator IDs are already assigned to another crew in this company
      // Only block if collaborator is already assigned as a 'member'. Supervisors/foremen may belong to multiple crews.
      let assignedRows: any[] = []
      try {
        const sel = await supabaseAdmin
          .from('pr_crew_members')
          .select('collaborator_id,crew_id,role')
          .in('collaborator_id', uniqueIds)
        if (sel.error) throw sel.error
        assignedRows = sel.data || []
      } catch (selErr: any) {
        // If role column doesn't exist, fallback to fetching collaborator_id, crew_id only
        if (selErr && (String(selErr.code) === '42703' || /column\s+\w*role\w*\s+does not exist/i.test(String(selErr.message || selErr)))) {
          const sel2 = await supabaseAdmin
            .from('pr_crew_members')
            .select('collaborator_id,crew_id')
            .in('collaborator_id', uniqueIds)
          if (sel2.error) return NextResponse.json({ error: sel2.error.message }, { status: 500 })
          assignedRows = (sel2.data || []).map((r: any) => ({ ...r, role: null }))
        } else {
          return NextResponse.json({ error: String(selErr?.message || selErr) }, { status: 500 })
        }
      }

      if (assignedRows && assignedRows.length > 0) {
        const crewIds = Array.from(new Set(assignedRows.map((r: any) => r.crew_id)))
        const { data: crewsOfAssigned, error: crewsErr } = await supabaseAdmin
          .from('pr_crews')
          .select('id,company_id,work_date')
          .in('id', crewIds)

        if (crewsErr) return NextResponse.json({ error: crewsErr.message }, { status: 500 })

        // Determine if role column exists in returned rows
        const roleColumnPresent = (assignedRows || []).some((r: any) => Object.prototype.hasOwnProperty.call(r, 'role'))
        if (roleColumnPresent) {
          // Block assignment for any collaborator already assigned to another crew in the same company unless their role is explicitly 'supervisor'.
          const assignedInCompany = (assignedRows || []).filter((r: any) => {
            const crewRec = (crewsOfAssigned || []).find((c: any) => String(c.id) === String(r.crew_id))
            if (!crewRec || String(crewRec.company_id) !== String(session.user.companyId)) return false
            if (!targetWorkDate) return true
            return String(crewRec.work_date || '').trim() === targetWorkDate
          })

          const explicitNonSupervisors = assignedInCompany.filter((r: any) => {
            const role = (r && r.role !== undefined && r.role !== null) ? String(r.role).toLowerCase() : null
            const desiredRole = roleMap.get(String(r.collaborator_id)) || null
            // If the incoming payload intends this collaborator to be a supervisor, allow it.
            if (desiredRole === 'supervisor') return false
            return role !== null && role !== 'supervisor'
          })

          let idsToBlock = new Set<string>()

          // If there are explicit non-supervisors, check collaborator flag `can_belong_to_multiple_crews`
          const explicitIds = explicitNonSupervisors.map((r: any) => String(r.collaborator_id))
          if (explicitIds.length > 0) {
            try {
              const { data: collRows, error: collErr } = await supabaseAdmin
                .from('pr_collaborators')
                .select('id, position, posicion, can_belong_to_multiple_crews')
                .in('id', explicitIds)
              if (!collErr && Array.isArray(collRows)) {
                collRows.forEach((c: any) => {
                  const allowMultiple = !!c.can_belong_to_multiple_crews
                  const pos = String((c.position || c.posicion || '')).toLowerCase()
                  // Block only if collaborator is NOT allowed to belong to multiple crews and not a supervisor
                  if (!allowMultiple && !pos.includes('supervisor')) idsToBlock.add(String(c.id))
                })
              } else if (collErr) {
                console.warn('No se pudieron obtener colaboradores para validar can_belong flag:', collErr)
                // Fallback: block by explicitIds
                explicitIds.forEach(id => idsToBlock.add(id))
              }
            } catch (e) {
              console.warn('Error comprobando can_belong_to_multiple_crews para colaboradores:', e)
              explicitIds.forEach(id => idsToBlock.add(id))
            }
          }

          // For entries with null/undefined role, fallback to checking collaborator position and flag
          let unknownRoleIds = assignedInCompany
            .filter((r: any) => r.role === null || r.role === undefined)
            .map((r: any) => String(r.collaborator_id))

          // Exclude collaborators that the incoming payload intends to assign as supervisors
          unknownRoleIds = unknownRoleIds.filter(id => (roleMap.get(String(id)) !== 'supervisor'))

          if (unknownRoleIds.length > 0) {
            try {
              const { data: collRows, error: collErr } = await supabaseAdmin
                .from('pr_collaborators')
                .select('id, position, posicion, can_belong_to_multiple_crews')
                .in('id', unknownRoleIds)
              if (!collErr && Array.isArray(collRows)) {
                collRows.forEach((c: any) => {
                  const allowMultiple = !!c.can_belong_to_multiple_crews
                  const pos = String((c.position || c.posicion || '')).toLowerCase()
                  if (!allowMultiple && !pos.includes('supervisor')) idsToBlock.add(String(c.id))
                })
              } else if (collErr) {
                console.warn('No se pudieron obtener posiciones para validar roles nulos en pr_crew_members:', collErr)
                // Fallback: treat unknownRoleIds as blocking
                unknownRoleIds.forEach(id => idsToBlock.add(id))
              }
            } catch (e) {
              console.warn('Error verificando posiciones para roles nulos en pr_crew_members:', e)
              unknownRoleIds.forEach(id => idsToBlock.add(id))
            }
          }

          const filteredToBlock = Array.from(idsToBlock).filter((id) => !allowMultiAssignmentIds.has(String(id)))
          if (filteredToBlock.length > 0) {
            return NextResponse.json({ error: `Algunos colaboradores ya están asignados a otra cuadrilla como integrantes: ${filteredToBlock.join(',')}` }, { status: 400 })
          }
        } else {
          // role column missing: fallback to checking collaborator positions; only block if position is NOT supervisor
          // Consider only assignments that belong to this company (use crewsOfAssigned computed above)
          const assignedIdsRaw = (assignedRows || []).map((r: any) => String(r.collaborator_id))
          // Exclude those collaborators that the incoming payload intends as supervisors
          const assignedIds = assignedIdsRaw.filter(id => (roleMap.get(String(id)) !== 'supervisor'))
          if (assignedIds.length > 0) {
            try {
              // Filter assignedRows to those whose crew belongs to this company
              const assignedInCompany = (assignedRows || []).filter((r: any) => {
                const crewRec = (crewsOfAssigned || []).find((c: any) => String(c.id) === String(r.crew_id))
                if (!crewRec || String(crewRec.company_id) !== String(session.user.companyId)) return false
                if (!targetWorkDate) return true
                return String(crewRec.work_date || '').trim() === targetWorkDate
              }).map((r: any) => String(r.collaborator_id))

              // Remove any ids that we're intending to set as supervisors in this request
              const assignedInCompanyFiltered = assignedInCompany.filter(id => (roleMap.get(String(id)) !== 'supervisor'))

              if (assignedInCompanyFiltered.length === 0) {
                // No relevant assignments in this company after excluding intended supervisors
              } else {
                const { data: collRows, error: collErr } = await supabaseAdmin
                  .from('pr_collaborators')
                  .select('id, position, posicion')
                  .in('id', assignedInCompanyFiltered)
                if (collErr) {
                  console.warn('Could not fetch collaborator positions, skipping assignment conflict check', collErr)
                } else {
                  // Find assigned collaborators in same company whose position is NOT supervisor
                  const nonSupervisorAssigned = (collRows || []).filter((c: any) => {
                    const pos = String((c.position || c.posicion || '')).toLowerCase()
                    return !pos.includes('supervisor')
                  }).map((c: any) => String(c.id))
                  const filteredNonSupervisorAssigned = nonSupervisorAssigned.filter((id) => !allowMultiAssignmentIds.has(String(id)))
                  if (filteredNonSupervisorAssigned.length > 0) {
                    return NextResponse.json({ error: `Algunos colaboradores ya están asignados a otra cuadrilla como integrantes: ${filteredNonSupervisorAssigned.join(',')}` }, { status: 400 })
                  }
                }
              }
            } catch (e) {
              console.warn('Error fetching collaborator positions for crew assignment check:', e)
            }
          }
        }
      }

      const rows = uniqueIds.map((collabId: string) => ({ crew_id: crew.id, collaborator_id: collabId }))
      const { error: memErr } = await supabaseAdmin.from('pr_crew_members').insert(rows)
      if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

      const { data: savedMembers, error: verifyErr } = await supabaseAdmin
        .from('pr_crew_members')
        .select('collaborator_id')
        .eq('crew_id', crew.id)
        .in('collaborator_id', uniqueIds)
      if (verifyErr) return NextResponse.json({ error: verifyErr.message }, { status: 500 })

      const savedIds = new Set((savedMembers || []).map((m: any) => String(m?.collaborator_id || '')))
      const missingIds = uniqueIds.filter((collabId: string) => !savedIds.has(String(collabId)))
      if (missingIds.length > 0) {
        return NextResponse.json({ error: `No se pudieron persistir integrantes: ${missingIds.join(', ')}` }, { status: 500 })
      }
    }

    // Update collaborator assignment flags for non-supervisors (best-effort)
    if (nonSupervisorIds.length > 0) {
      try {
        await supabaseAdmin
          .from('pr_collaborators')
          .update({ current_crew_id: crew.id, is_assigned: true })
          .in('id', nonSupervisorIds)
          .or(`current_crew_id.is.null,current_crew_id.eq.${crew.id}`)
      } catch (e) {
        console.warn('Could not update collaborator assignment flags', e)
      }
    }

    await writeCrewAudit(supabaseAdmin, session, {
      action: 'create',
      resourceId: crew?.id ? String(crew.id) : null,
      afterData: crew,
      metadata: {
        name: crew?.name ?? normalizedName ?? null,
        area: crew?.specialty ?? normalizedSpecialty ?? null,
        specialty: crew?.specialty ?? normalizedSpecialty ?? null,
        member_count: uniqueIds.length
      }
    })

    return NextResponse.json(crew)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
