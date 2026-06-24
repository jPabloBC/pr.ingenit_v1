import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveCurrentActor } from '@/lib/currentActor'
import { isValidYmdDate } from '@/lib/staffing/validateStaffingPayload'
import { fetchAvailableCollaborators, resolveTurnoSourceDate, todayYmd } from '@/lib/staffing/availableCollaborators'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()

const uniqueIds = (ids: Array<string | null | undefined>) =>
  Array.from(new Set(ids.map((id) => clean(id)).filter(Boolean)))

const isMissingTableOrColumnError = (error: any) => {
  const message = String(error?.message || '').toLowerCase()
  return (
    String(error?.code || '') === '42P01' ||
    String(error?.code || '') === '42703' ||
    message.includes('does not exist') ||
    message.includes('posicion')
  )
}

const fetchCollaboratorsByIds = async (companyId: string, collaboratorIds: string[]) => {
  const ids = uniqueIds(collaboratorIds)
  if (!ids.length) return []

  const rows: any[] = []
  for (let index = 0; index < ids.length; index += 75) {
    const chunk = ids.slice(index, index + 75)
    let data: any[] | null = null
    let error: any = null
    ;({ data, error } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id, company_id, first_name, last_name, document, position, posicion, specialty, worker_type, is_active, phone, email')
      .eq('company_id', companyId)
      .in('id', chunk))

    if (error && isMissingTableOrColumnError(error)) {
      ;({ data, error } = await supabaseAdmin
        .from('pr_collaborators')
        .select('id, company_id, first_name, last_name, document, position, specialty, worker_type, is_active, phone, email')
        .eq('company_id', companyId)
        .in('id', chunk))
    }

    if (error) throw error
    rows.push(...(Array.isArray(data) ? data : []))
  }

  return rows
}

const fetchRoleHistoryByCollaborator = async (companyId: string, collaboratorIds: string[], workDate: string) => {
  const ids = uniqueIds(collaboratorIds)
  const date = clean(workDate).slice(0, 10)
  if (!ids.length || !date) return new Map<string, any>()

  const rows: any[] = []
  for (let index = 0; index < ids.length; index += 75) {
    const chunk = ids.slice(index, index + 75)
    const { data, error } = await supabaseAdmin
      .from('pr_collaborator_role_history')
      .select('collaborator_id, position, specialty, worker_type, valid_from, valid_to')
      .eq('company_id', companyId)
      .in('collaborator_id', chunk)
      .lte('valid_from', date)
      .or(`valid_to.is.null,valid_to.gte.${date}`)
      .order('valid_from', { ascending: false })

    if (error) {
      if (isMissingTableOrColumnError(error)) return new Map<string, any>()
      throw error
    }
    rows.push(...(Array.isArray(data) ? data : []))
  }

  const byId = new Map<string, any>()
  rows.forEach((row: any) => {
    const id = clean(row?.collaborator_id)
    if (id && !byId.has(id)) byId.set(id, row)
  })
  return byId
}

const normalizeText = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const normalizedFullName = (person: any) =>
  [person?.first_name, person?.last_name]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

const collaboratorRoleText = (collaborator: any) =>
  [
    collaborator?.worker_type,
    collaborator?.position_label,
    collaborator?.position,
    collaborator?.posicion,
    collaborator?.specialty,
    collaborator?.role,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')

const isDirectOperationalCollaborator = (collaborator: any) => {
  const workerType = normalizeText(collaborator?.worker_type)
  const roleText = collaboratorRoleText(collaborator)
  if (!workerType) return false
  if (
    roleText.includes('indirecto') ||
    roleText.includes('indirect') ||
    roleText.includes('directo no operacional') ||
    roleText.includes('directo no operativo') ||
    roleText.includes('no operacional') ||
    roleText.includes('no operativo') ||
    roleText.includes('administrativo') ||
    roleText.includes('supervisor') ||
    roleText.includes('capataz') ||
    roleText.includes('foreman')
  ) {
    return false
  }
  return ['directo', 'direct', 'personal directo', 'directo operacional'].includes(workerType)
}

const collaboratorPositionLabel = (collaborator: any, historicalRole?: any) =>
  clean(
    historicalRole?.position ||
    collaborator?.position ||
    collaborator?.posicion ||
    historicalRole?.specialty ||
    collaborator?.specialty
  )

const resolveProjectId = (params: {
  requestedProjectId?: string | null
  actorProjectId?: string | null
  sessionProjectId?: string | null
}) => {
  const requestedProjectId = clean(params.requestedProjectId)
  const sessionProjectId = clean(params.actorProjectId || params.sessionProjectId)
  if (sessionProjectId && requestedProjectId && requestedProjectId !== sessionProjectId) {
    return {
      projectId: '',
      error: NextResponse.json({ error: 'project_id no coincide con el proyecto de la sesión' }, { status: 403 }),
    }
  }
  return { projectId: sessionProjectId || requestedProjectId || null, error: null }
}

const validateProjectInCompany = async (projectId: string | null, companyId: string) => {
  if (!projectId) return null
  const { data, error } = await supabaseAdmin
    .from('pr_projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.id) {
    return NextResponse.json({ error: 'project_id no pertenece a la empresa de la sesión' }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const actor = await resolveCurrentActor(session)
    const companyId = clean(actor?.companyId || session?.user?.companyId)
    if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

    const workDate = clean(req.nextUrl.searchParams.get('date'))
    if (!workDate) return NextResponse.json({ error: 'date requerido' }, { status: 400 })
    if (!isValidYmdDate(workDate)) {
      return NextResponse.json({ error: 'date debe usar formato YYYY-MM-DD' }, { status: 400 })
    }
    const today = todayYmd()
    if (workDate !== today) {
      return NextResponse.json({ error: 'La dotación solo se puede crear para la fecha actual.' }, { status: 400 })
    }

    const requestedProjectId = clean(req.nextUrl.searchParams.get('project_id'))
    const { projectId, error: projectScopeError } = resolveProjectId({
      requestedProjectId,
      actorProjectId: actor?.projectId,
      sessionProjectId: session?.user?.projectId,
    })
    if (projectScopeError) return projectScopeError

    const projectCompanyError = await validateProjectInCompany(projectId, companyId)
    if (projectCompanyError) return projectCompanyError

    const attendanceSourceDate = await resolveTurnoSourceDate({
      supabaseAdmin,
      companyId,
      workDate,
    })
    if (!attendanceSourceDate) {
      return NextResponse.json({
        collaborators: [],
        assigned_collaborators: [],
        total_collaborators_count: 0,
        available_collaborators_count: 0,
        assigned_collaborators_count: 0,
        total_on_shift_count: 0,
        direct_operational_on_shift_count: 0,
        available_direct_operational_count: 0,
        assigned_direct_operational_count: 0,
        date: workDate,
        attendance_source_date: null,
        company_id: companyId,
        project_id: projectId || null,
        availability_scope: 'company',
        project_filter_applied: false,
        note: 'No existe asistencia de hoy ni del día anterior para usar como base de dotación.',
        rule: {
          status: 'turno',
          reason: '11',
          staffing_date: workDate,
          attendance_source_date: null,
        },
      })
    }

    const collaborators = await fetchAvailableCollaborators({
      supabaseAdmin,
      companyId,
      workDate: attendanceSourceDate,
    })
    const directOperationalCollaborators = collaborators.filter(isDirectOperationalCollaborator)

    const actorUserId = clean(actor?.userId || session?.user?.id)
    const collaboratorsById = new Map(collaborators.map((collaborator: any) => [clean(collaborator?.id), collaborator]))

    let sessionsQuery = supabaseAdmin
      .from('pr_field_staffing_sessions')
      .select('id, work_front_name, created_by')
      .eq('company_id', companyId)
      .eq('work_date', workDate)
      .neq('status', 'cancelled')

    if (projectId) sessionsQuery = sessionsQuery.eq('project_id', projectId)

    const { data: activeSessions, error: sessionsError } = await sessionsQuery
    if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 500 })

    const activeSessionIds = uniqueIds((activeSessions || []).map((row: any) => row?.id))
    const activeSessionsById = new Map((activeSessions || []).map((row: any) => [clean(row?.id), row]))

    const reporterIds = uniqueIds((activeSessions || []).map((row: any) => row?.created_by))

    let reporterUsers: any[] = []
    if (reporterIds.length) {
      const { data, error } = await supabaseAdmin
        .from('pr_users')
        .select('id, auth_id, first_name, last_name, email, role')
        .in('id', reporterIds)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      reporterUsers = Array.isArray(data) ? data : []
    }

    const reporterUserIds = uniqueIds(reporterUsers.map((user: any) => user?.id))
    const reporterAuthIds = uniqueIds(reporterUsers.map((user: any) => user?.auth_id))
    const reporterEmails = uniqueIds(reporterUsers.map((user: any) => user?.email))
    const reporterCollaboratorUserIds = uniqueIds([...reporterUserIds, ...reporterAuthIds])

    let reporterCollaborators: any[] = []
    if (reporterCollaboratorUserIds.length) {
      const { data, error } = await supabaseAdmin
        .from('pr_collaborators')
        .select('user_id, email, first_name, last_name, position, specialty')
        .eq('company_id', companyId)
        .in('user_id', reporterCollaboratorUserIds)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      reporterCollaborators = Array.isArray(data) ? data : []
    }

    if (reporterEmails.length) {
      const { data, error } = await supabaseAdmin
        .from('pr_collaborators')
        .select('user_id, email, first_name, last_name, position, specialty')
        .eq('company_id', companyId)
        .in('email', reporterEmails)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      reporterCollaborators = [...reporterCollaborators, ...(Array.isArray(data) ? data : [])]
    }

    for (const reporterUser of reporterUsers) {
      const firstName = clean(reporterUser?.first_name)
      const lastName = clean(reporterUser?.last_name)
      if (!firstName || !lastName) continue

      const hasLinkedCollaborator =
        reporterCollaborators.some((collaborator: any) => (
          clean(collaborator?.user_id) === clean(reporterUser?.id) ||
          clean(collaborator?.user_id) === clean(reporterUser?.auth_id) ||
          normalizeText(collaborator?.email) === normalizeText(reporterUser?.email)
        ))

      if (hasLinkedCollaborator) continue

      const { data, error } = await supabaseAdmin
        .from('pr_collaborators')
        .select('user_id, email, first_name, last_name, position, specialty')
        .eq('company_id', companyId)
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .limit(5)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      reporterCollaborators = [...reporterCollaborators, ...(Array.isArray(data) ? data : [])]
    }

    const reporterCollaboratorsByUserId = new Map<string, any>()
    const reporterCollaboratorsByEmail = new Map<string, any>()
    const reporterCollaboratorsByName = new Map<string, any>()

    reporterCollaborators.forEach((collaborator: any) => {
      const userId = clean(collaborator?.user_id)
      const email = normalizeText(collaborator?.email)
      const fullName = normalizedFullName(collaborator)

      if (userId) reporterCollaboratorsByUserId.set(userId, collaborator)
      if (email) reporterCollaboratorsByEmail.set(email, collaborator)
      if (fullName) reporterCollaboratorsByName.set(fullName, collaborator)
    })

    const reportersById = new Map(
      reporterUsers.map((user: any) => {
        const userId = clean(user?.id)
        const authId = clean(user?.auth_id)
        const firstName = clean(user?.first_name)
        const lastName = clean(user?.last_name)
        const email = clean(user?.email)
        const fullName = [firstName, lastName].filter(Boolean).join(' ')
        const collaborator =
          reporterCollaboratorsByUserId.get(userId) ||
          reporterCollaboratorsByUserId.get(authId) ||
          reporterCollaboratorsByEmail.get(normalizeText(email)) ||
          reporterCollaboratorsByName.get(normalizedFullName(user))

        return [
          userId,
          {
            reporter_name: fullName || email || null,
            reporter_position: clean(collaborator?.position || collaborator?.specialty) || null,
            reporter_email: email || null,
          },
        ]
      })
    )

    let assignedCollaboratorIds = new Set<string>()
    let assignedCollaborators: any[] = []

    if (activeSessionIds.length) {
      const { data: workers, error: workersError } = await supabaseAdmin
        .from('pr_field_staffing_workers')
        .select('collaborator_id, session_id, role')
        .eq('company_id', companyId)
        .eq('work_date', workDate)
        .in('session_id', activeSessionIds)

      if (workersError) return NextResponse.json({ error: workersError.message }, { status: 500 })

      const workerRows = Array.isArray(workers) ? workers : []
      const workerCollaboratorIds = uniqueIds(workerRows.map((worker: any) => worker?.collaborator_id))
      const missingCollaboratorIds = workerCollaboratorIds.filter((id) => !collaboratorsById.has(id))
      const assignedBaseCollaborators = await fetchCollaboratorsByIds(companyId, missingCollaboratorIds)
      assignedBaseCollaborators.forEach((collaborator: any) => {
        const id = clean(collaborator?.id)
        if (id) collaboratorsById.set(id, collaborator)
      })
      const roleHistoryByCollaborator = await fetchRoleHistoryByCollaborator(companyId, workerCollaboratorIds, workDate)

      assignedCollaborators = workerRows.map((worker: any) => {
        const collaboratorId = clean(worker?.collaborator_id)
        const sessionId = clean(worker?.session_id)
        const staffingSession = activeSessionsById.get(sessionId)
        const collaborator = collaboratorsById.get(collaboratorId)
        const historicalRole = roleHistoryByCollaborator.get(collaboratorId)
        const positionLabel = collaboratorPositionLabel(collaborator, historicalRole)
        return {
          collaborator_id: collaboratorId,
          session_id: sessionId,
          role: clean(worker?.role) || null,
          work_front_name: clean(staffingSession?.work_front_name) || null,
          created_by: clean(staffingSession?.created_by) || null,
          reporter_name: reportersById.get(clean(staffingSession?.created_by))?.reporter_name ?? null,
          reporter_position: reportersById.get(clean(staffingSession?.created_by))?.reporter_position ?? null,
          reporter_email: reportersById.get(clean(staffingSession?.created_by))?.reporter_email ?? null,
          is_own_session: Boolean(actorUserId && clean(staffingSession?.created_by) === actorUserId),
          first_name: collaborator?.first_name ?? null,
          last_name: collaborator?.last_name ?? null,
          document: collaborator?.document ?? null,
          position: positionLabel || null,
          posicion: collaborator?.posicion ?? null,
          position_label: positionLabel || null,
          specialty: historicalRole?.specialty ?? collaborator?.specialty ?? null,
          worker_type: historicalRole?.worker_type ?? collaborator?.worker_type ?? null,
        }
      }).filter((worker: any) => worker.collaborator_id)

      assignedCollaboratorIds = new Set(assignedCollaborators.map((worker: any) => worker.collaborator_id))
    }

    const availableCollaborators = collaborators.filter((collaborator: any) => (
      !assignedCollaboratorIds.has(clean(collaborator?.id))
    ))
    const availableDirectOperationalCollaborators = availableCollaborators.filter(isDirectOperationalCollaborator)
    const directOperationalIds = new Set(directOperationalCollaborators.map((collaborator: any) => clean(collaborator?.id)))
    const assignedDirectOperationalCount = assignedCollaborators.filter((worker: any) => {
      const assignmentRole = normalizeText(worker?.role)
      return (
        directOperationalIds.has(clean(worker?.collaborator_id)) &&
        assignmentRole !== 'supervisor' &&
        assignmentRole !== 'foreman' &&
        assignmentRole !== 'capataz'
      )
    }).length

    return NextResponse.json({
      collaborators: availableCollaborators,
      assigned_collaborators: assignedCollaborators,
      total_collaborators_count: collaborators.length,
      available_collaborators_count: availableCollaborators.length,
      assigned_collaborators_count: assignedCollaboratorIds.size,
      total_on_shift_count: collaborators.length,
      direct_operational_on_shift_count: directOperationalCollaborators.length,
      available_direct_operational_count: availableDirectOperationalCollaborators.length,
      assigned_direct_operational_count: assignedDirectOperationalCount,
      date: workDate,
      attendance_source_date: attendanceSourceDate,
      company_id: companyId,
      project_id: projectId || null,
      availability_scope: 'company',
      project_filter_applied: false,
      note: 'La disponibilidad se calcula por empresa. La dotación es de hoy; si hoy no tiene asistencia, se usa la asistencia del día anterior.',
      rule: {
        status: 'turno',
        reason: '11',
        staffing_date: workDate,
        attendance_source_date: attendanceSourceDate,
      },
    })
  } catch (err) {
    console.error('Error GET /api/staffing-activities/available-collaborators', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
