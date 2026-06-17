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
      sessions: (sessions || []).map((row: any) => ({
        ...row,
        workers: workersBySession.get(clean(row?.id)) || [],
        activities: activitiesBySession.get(clean(row?.id)) || [],
      })),
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

    const programCompanyError = await validateProgramActivitiesInCompany(
      payload.activities.map((activity) => activity.program_activity_id).filter(Boolean) as string[],
      companyId
    )
    if (programCompanyError) return programCompanyError

    const actorUserId = clean(actor?.userId || session?.user?.id) || null

    const collaboratorIdsToValidate = uniqueIds([
      ...payload.workers.map((worker) => worker.collaborator_id),
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
        status: 'draft',
        created_by: actorUserId,
        updated_by: actorUserId,
        metadata: payload.metadata,
      })
      .select('*')
      .single()

    if (insertSessionError) return jsonError(insertSessionError.message, 500)

    const workerRows = payload.workers.map((worker) => ({
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

    const activityRows = payload.activities.map((activity) => ({
      session_id: staffingSession.id,
      company_id: companyId,
      project_id: projectId,
      work_date: payload.work_date,
      program_activity_id: activity.program_activity_id,
      activity: activity.activity,
      area: activity.area,
      unit: activity.unit,
      quantity: activity.quantity,
      user_detail: activity.user_detail,
      display_order: activity.display_order,
      created_by: actorUserId,
      updated_by: actorUserId,
      metadata: activity.metadata,
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

    const activitiesResult = activityRows.length
      ? await supabaseAdmin.from('pr_field_activity_logs').insert(activityRows).select('*')
      : { data: [], error: null }

    if (activitiesResult.error) {
      await cleanupSession()
      return jsonError(activitiesResult.error.message, 500)
    }

    await writeAuditLog({
      supabaseAdmin,
      companyId,
      projectId,
      actorUserId,
      actorEmail: actor?.email || session?.user?.email || null,
      actorRole: actor?.role || session?.user?.role || null,
      action: 'create',
      resourceType: 'staffing_activity',
      resourceId: clean(staffingSession?.id) || null,
      afterData: {
        session: staffingSession,
        workers: workersResult.data || [],
        activities: activitiesResult.data || [],
      },
      metadata: {
        event: 'staffing.create',
        company_id: companyId,
        project_id: projectId,
        work_date: payload.work_date,
        affected_collaborator_ids: collaboratorIdsToValidate,
        activities_count: payload.activities.length,
      },
    })

    return NextResponse.json({
      session: {
        ...staffingSession,
        workers: workersResult.data || [],
        activities: activitiesResult.data || [],
      },
    }, { status: 201 })
  } catch (err) {
    console.error('Error POST /api/staffing-activities', err)
    return jsonError('Unexpected server error', 500)
  }
}
