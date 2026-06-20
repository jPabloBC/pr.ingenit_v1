import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveCurrentActor } from '@/lib/currentActor'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'
import {
  validateStaffingPayload,
  isValidYmdDate,
  type ValidatedStaffingPayload,
} from '@/lib/staffing/validateStaffingPayload'
import { validateCollaboratorsInTurno } from '@/lib/staffing/availableCollaborators'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()

const uniqueIds = (ids: Array<string | null | undefined>) =>
  Array.from(new Set(ids.map((id) => clean(id)).filter(Boolean)))

const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status })

const jsonErrorWithPayload = (message: string, status: number, payload: Record<string, any>) =>
  NextResponse.json({ error: message, ...payload }, { status })

const sessionProjectId = (session: any) =>
  clean(
    session?.user?.projectId ||
    session?.user?.project_id ||
    session?.projectId ||
    session?.project_id
  )

const tokenProjectId = (token: any) =>
  clean(token?.projectId || token?.project_id)

const resolveProjectId = (params: {
  requestedProjectId?: string | null
  actorProjectId?: string | null
  sessionProjectId?: string | null
  tokenProjectId?: string | null
}) => {
  const requestedProjectId = clean(params.requestedProjectId)
  const selectedProjectId = clean(params.actorProjectId || params.sessionProjectId || params.tokenProjectId)
  if (selectedProjectId && requestedProjectId && requestedProjectId !== selectedProjectId) {
    return { projectId: '', error: jsonError('project_id no coincide con el proyecto de la sesión', 403) }
  }
  return { projectId: selectedProjectId || requestedProjectId || null, error: null }
}

const validateProjectInCompany = async (projectId: string | null, companyId: string) => {
  if (!projectId) return null
  const { data, error } = await supabaseAdmin
    .from('pr_projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data?.id) return jsonError('project_id no pertenece a la empresa de la sesión', 403)
  return null
}

const validateWorkFrontInCompany = async (workFrontId: string | null, companyId: string) => {
  if (!workFrontId) return null
  const { data, error } = await supabaseAdmin
    .from('pr_report_fronts')
    .select('id')
    .eq('id', workFrontId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data?.id) return jsonError('work_front_id no pertenece a la empresa de la sesión', 400)
  return null
}

const validateProgramActivitiesInCompany = async (programActivityIds: string[], companyId: string) => {
  const ids = uniqueIds(programActivityIds)
  if (!ids.length) return null

  const { data, error } = await supabaseAdmin
    .from('pr_program')
    .select('id')
    .eq('company_id', companyId)
    .in('id', ids)

  if (error) return jsonError(error.message, 500)

  const foundIds = new Set((data || []).map((row: any) => clean(row?.id)).filter(Boolean))
  const invalidIds = ids.filter((id) => !foundIds.has(id))
  if (invalidIds.length) {
    return jsonError(`Actividades de programa fuera de la empresa: ${invalidIds.join(', ')}`, 400)
  }

  return null
}

const withRoleWorker = (collaboratorId: string | null, role: string) => {
  const id = clean(collaboratorId)
  if (!id) return null
  return {
    collaborator_id: id,
    role,
    is_override: false,
    override_reason: null,
    metadata: {},
  }
}

const normalizeStaffingRole = (role: unknown) => {
  const text = clean(role)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (!text) return null
  if (text.includes('supervisor')) return 'supervisor'
  if (text.includes('foreman') || text.includes('capataz')) return 'foreman'
  if (text.includes('member') || text.includes('integrante') || text.includes('colaborador')) return 'member'
  return text
}

const staffingRolePriority = (role: string | null) => {
  if (role === 'supervisor') return 3
  if (role === 'foreman') return 2
  if (role === 'member') return 1
  return 0
}

const mergeWorkers = (workers: ValidatedStaffingPayload['workers'], extras: Array<ReturnType<typeof withRoleWorker>>) => {
  const byId = new Map<string, ValidatedStaffingPayload['workers'][number]>()
  ;[...extras.filter(Boolean), ...workers].forEach((worker: any) => {
    const id = clean(worker?.collaborator_id)
    if (!id) return
    const normalizedWorker = {
      ...worker,
      collaborator_id: id,
      role: normalizeStaffingRole(worker?.role),
    }
    const current = byId.get(id)
    if (!current || staffingRolePriority(normalizedWorker.role) > staffingRolePriority(current.role)) {
      byId.set(id, normalizedWorker)
    }
  })
  return Array.from(byId.values())
}

const roleIdsFromWorkers = (workers: any[], role: 'supervisor' | 'foreman') =>
  workers
    .filter((worker) => normalizeStaffingRole(worker?.role) === role)
    .map((worker) => clean(worker?.collaborator_id))
    .filter(Boolean)

async function requireStaffingSession(req: NextRequest) {
  const session = (await getServerSession(authOptions as any)) as any
  if (!session?.user) return { session: null, actor: null, companyId: '', error: jsonError('Unauthorized', 401) }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as any
  const actor = await resolveCurrentActor(session)
  const companyId = clean(actor?.companyId || session?.user?.companyId)
  if (!companyId) return { session, actor, companyId: '', error: jsonError('Missing company_id', 400) }

  return { session, token, actor, companyId, error: null }
}

export async function GET(req: NextRequest) {
  try {
    const { session, token, actor, companyId, error } = await requireStaffingSession(req)
    if (error) return error

    const workDate = clean(req.nextUrl.searchParams.get('date'))
    if (!workDate) return jsonError('date requerido', 400)
    if (!isValidYmdDate(workDate)) return jsonError('date debe usar formato YYYY-MM-DD', 400)

    const requestedProjectId = clean(req.nextUrl.searchParams.get('project_id'))
    const { projectId, error: projectScopeError } = resolveProjectId({
      requestedProjectId,
      actorProjectId: actor?.projectId,
      sessionProjectId: sessionProjectId(session),
      tokenProjectId: tokenProjectId(token),
    })
    if (projectScopeError) return projectScopeError

    const projectCompanyError = await validateProjectInCompany(projectId, companyId)
    if (projectCompanyError) return projectCompanyError

    let query = supabaseAdmin
      .from('pr_field_staffing_sessions')
      .select('*')
      .eq('company_id', companyId)
      .eq('work_date', workDate)
      .order('created_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)

    const { data: sessions, error: sessionsError } = await query
    if (sessionsError) return jsonError(sessionsError.message, 500)

    const sessionIds = (sessions || []).map((row: any) => clean(row?.id)).filter(Boolean)
    if (!sessionIds.length) {
      return NextResponse.json({ sessions: [], date: workDate, company_id: companyId, project_id: projectId || null })
    }

    const [{ data: workers, error: workersError }, { data: activities, error: activitiesError }] = await Promise.all([
      supabaseAdmin
        .from('pr_field_staffing_workers')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('pr_field_activity_logs')
        .select('*')
        .in('session_id', sessionIds)
        .order('display_order', { ascending: true }),
    ])

    if (workersError) return jsonError(workersError.message, 500)
    if (activitiesError) return jsonError(activitiesError.message, 500)

    const workersBySession = new Map<string, any[]>()
    ;(workers || []).forEach((row: any) => {
      const id = clean(row?.session_id)
      if (!workersBySession.has(id)) workersBySession.set(id, [])
      workersBySession.get(id)!.push(row)
    })

    const activitiesBySession = new Map<string, any[]>()
    ;(activities || []).forEach((row: any) => {
      const id = clean(row?.session_id)
      if (!activitiesBySession.has(id)) activitiesBySession.set(id, [])
      activitiesBySession.get(id)!.push(row)
    })

    return NextResponse.json({
      sessions: (sessions || []).map((row: any) => {
        const sessionWorkers = workersBySession.get(clean(row?.id)) || []
        const supervisorIds = roleIdsFromWorkers(sessionWorkers, 'supervisor')
        const foremanIds = roleIdsFromWorkers(sessionWorkers, 'foreman')
        return {
          ...row,
          supervisor_id: clean(row?.supervisor_id) || supervisorIds[0] || null,
          foreman_id: clean(row?.foreman_id) || foremanIds[0] || null,
          supervisor_ids: supervisorIds,
          foreman_ids: foremanIds,
          workers: sessionWorkers,
          activities: activitiesBySession.get(clean(row?.id)) || [],
        }
      }),
      date: workDate,
      company_id: companyId,
      project_id: projectId || null,
    })
  } catch (err) {
    console.error('Error GET /api/staffing-activities', err)
    return jsonError('Unexpected server error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session, token, actor, companyId, error } = await requireStaffingSession(req)
    if (error) return error

    const role = clean(actor?.role || session?.user?.role).toLowerCase()
    if (role === 'viewer') return jsonError('Forbidden', 403)

    const body = await req.json().catch(() => ({}))
    let payload: ValidatedStaffingPayload
    try {
      payload = validateStaffingPayload(body)
    } catch (validationError: any) {
      return jsonError(String(validationError?.message || validationError), 400)
    }

    const { projectId, error: projectScopeError } = resolveProjectId({
      requestedProjectId: payload.project_id,
      actorProjectId: actor?.projectId,
      sessionProjectId: sessionProjectId(session),
      tokenProjectId: tokenProjectId(token),
    })
    if (projectScopeError) return projectScopeError

    const projectCompanyError = await validateProjectInCompany(projectId, companyId)
    if (projectCompanyError) return projectCompanyError

    const workFrontCompanyError = await validateWorkFrontInCompany(payload.work_front_id, companyId)
    if (workFrontCompanyError) return workFrontCompanyError

    const actorUserId = clean(actor?.userId || session?.user?.id) || null
    const normalizedWorkers = mergeWorkers(payload.workers, [
      withRoleWorker(payload.supervisor_id, 'supervisor'),
      withRoleWorker(payload.foreman_id, 'foreman'),
    ])
    const supervisorIds = roleIdsFromWorkers(normalizedWorkers, 'supervisor')
    const foremanIds = roleIdsFromWorkers(normalizedWorkers, 'foreman')

    const collaboratorIdsToValidate = uniqueIds([
      ...normalizedWorkers.map((worker) => worker.collaborator_id),
      payload.field_boss_id,
    ])

    const validation = await validateCollaboratorsInTurno({
      supabaseAdmin,
      companyId,
      workDate: payload.work_date,
      collaboratorIds: collaboratorIdsToValidate,
    })

    if (validation.missingIds.length) {
      return jsonError(`Colaboradores fuera de la empresa: ${validation.missingIds.join(', ')}`, 400)
    }
    if (validation.notInTurnoIds.length) {
      return jsonError(`Colaboradores no están en turno: ${validation.notInTurnoIds.join(', ')}`, 400)
    }
    if (validation.validIds.length !== collaboratorIdsToValidate.length) {
      return jsonError('No todos los colaboradores seleccionados son válidos para la dotación', 400)
    }

    const selectedWorkerIds = uniqueIds(normalizedWorkers.map((worker) => worker.collaborator_id))
    if (selectedWorkerIds.length) {
      const { data: existingWorkers, error: existingWorkersError } = await supabaseAdmin
        .from('pr_field_staffing_workers')
        .select('session_id, collaborator_id, role')
        .eq('company_id', companyId)
        .eq('work_date', payload.work_date)
        .in('collaborator_id', selectedWorkerIds)

      if (existingWorkersError) return jsonError(existingWorkersError.message, 500)

      const existingSessionIds = uniqueIds((existingWorkers || []).map((worker: any) => worker?.session_id))
      if (existingSessionIds.length) {
        const { data: existingSessions, error: existingSessionsError } = await supabaseAdmin
          .from('pr_field_staffing_sessions')
          .select('id, work_front_name, status')
          .eq('company_id', companyId)
          .eq('work_date', payload.work_date)
          .in('id', existingSessionIds)
          .neq('status', 'cancelled')

        if (existingSessionsError) return jsonError(existingSessionsError.message, 500)

        const activeSessionsById = new Map(
          (existingSessions || []).map((existingSession: any) => [clean(existingSession?.id), existingSession])
        )
        const assignedCollaborators = (existingWorkers || [])
          .map((worker: any) => {
            const activeSession = activeSessionsById.get(clean(worker?.session_id))
            if (!activeSession) return null
            return {
              collaborator_id: clean(worker?.collaborator_id),
              session_id: clean(worker?.session_id),
              work_front_name: clean(activeSession?.work_front_name) || null,
              role: clean(worker?.role) || null,
            }
          })
          .filter(Boolean)

        if (assignedCollaborators.length) {
          return jsonErrorWithPayload('Hay colaboradores ya asignados a otra cuadrilla del día', 409, {
            code: 'STAFFING_COLLABORATORS_ALREADY_ASSIGNED',
            assigned_collaborators: assignedCollaborators,
          })
        }
      }
    }

    const { data: staffingSession, error: insertSessionError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .insert({
        company_id: companyId,
        project_id: projectId,
        work_date: payload.work_date,
        work_front_id: payload.work_front_id,
        work_front_name: payload.work_front_name,
        crew_name: payload.crew_name,
        specialty: payload.specialty,
        field_boss_id: payload.field_boss_id,
        supervisor_id: supervisorIds[0] || null,
        foreman_id: foremanIds[0] || null,
        status: 'draft',
        created_by: actorUserId,
        updated_by: actorUserId,
        metadata: payload.metadata,
      })
      .select('*')
      .single()

    if (insertSessionError) return jsonError(insertSessionError.message, 500)

    const workerRows = normalizedWorkers.map((worker) => ({
      session_id: staffingSession.id,
      company_id: companyId,
      project_id: projectId,
      work_date: payload.work_date,
      collaborator_id: worker.collaborator_id,
      role: worker.role,
      is_override: worker.is_override,
      override_reason: worker.override_reason,
      created_by: actorUserId,
      updated_by: actorUserId,
      metadata: worker.metadata,
    }))

    const cleanupSession = async () => {
      try {
        await supabaseAdmin
          .from('pr_field_staffing_sessions')
          .delete()
          .eq('id', staffingSession.id)
          .eq('company_id', companyId)
      } catch (cleanupError) {
        console.error('Could not cleanup failed staffing draft', cleanupError)
      }
    }

    const workersResult = workerRows.length
      ? await supabaseAdmin.from('pr_field_staffing_workers').insert(workerRows).select('*')
      : { data: [], error: null }

    if (workersResult.error) {
      await cleanupSession()
      return jsonError(workersResult.error.message, 500)
    }

    await writeAuditLog({
      supabaseAdmin,
      companyId,
      projectId,
      actorUserId,
      actorEmail: actor?.email || session?.user?.email || null,
      actorRole: actor?.role || session?.user?.role || null,
      action: 'create',
      resourceType: 'staffing_session',
      resourceId: clean(staffingSession?.id) || null,
      afterData: {
        session: staffingSession,
        workers: workersResult.data || [],
      },
      metadata: {
        event: 'staffing.session.create',
        company_id: companyId,
        project_id: projectId,
        work_date: payload.work_date,
        affected_collaborator_ids: collaboratorIdsToValidate,
        activities_ignored: payload.activities.length,
      },
    })

    return NextResponse.json({
      session: {
        ...staffingSession,
        supervisor_ids: supervisorIds,
        foreman_ids: foremanIds,
        workers: workersResult.data || [],
        activities: [],
      },
    }, { status: 201 })
  } catch (err) {
    console.error('Error POST /api/staffing-activities', err)
    return jsonError('Unexpected server error', 500)
  }
}
