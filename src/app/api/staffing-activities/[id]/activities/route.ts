import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveCurrentActor } from '@/lib/currentActor'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'
import { validateStaffingPayload, type ValidatedStaffingPayload } from '@/lib/staffing/validateStaffingPayload'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()

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

const validateProgramActivitiesInCompany = async (programActivityIds: string[], companyId: string) => {
  const ids = Array.from(new Set(programActivityIds.map((id) => clean(id)).filter(Boolean)))
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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return jsonError('Unauthorized', 401)

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as any
    const actor = await resolveCurrentActor(session)
    const companyId = clean(actor?.companyId || session?.user?.companyId)
    if (!companyId) return jsonError('Missing company_id', 400)

    const role = clean(actor?.role || session?.user?.role).toLowerCase()
    if (role === 'viewer') return jsonError('Forbidden', 403)

    const sessionId = clean(params?.id)
    if (!sessionId) return jsonError('id requerido', 400)

    const { data: staffingSession, error: sessionError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (sessionError) return jsonError(sessionError.message, 500)
    if (!staffingSession?.id) return jsonError('Cuadrilla no encontrada', 404)

    const scopedProjectId = clean(actor?.projectId || sessionProjectId(session) || tokenProjectId(token))
    const staffingProjectId = clean(staffingSession?.project_id)
    if (scopedProjectId && staffingProjectId && scopedProjectId !== staffingProjectId) {
      return jsonError('project_id no coincide con el proyecto de la sesión', 403)
    }

    const status = clean(staffingSession?.status).toLowerCase()
    if (!['draft', 'reopened'].includes(status)) {
      return jsonError('La cuadrilla no está abierta para registrar actividades', 409)
    }

    const body = await req.json().catch(() => ({}))
    let payload: ValidatedStaffingPayload
    try {
      payload = validateStaffingPayload({
        ...body,
        work_date: clean(staffingSession?.work_date).slice(0, 10),
      })
    } catch (validationError: any) {
      return jsonError(String(validationError?.message || validationError), 400)
    }

    if (!payload.activities.length) return jsonError('Debe enviar al menos una actividad', 400)

    const programCompanyError = await validateProgramActivitiesInCompany(
      payload.activities.map((activity) => activity.program_activity_id).filter(Boolean) as string[],
      companyId
    )
    if (programCompanyError) return programCompanyError

    const { data: lastActivity, error: lastActivityError } = await supabaseAdmin
      .from('pr_field_activity_logs')
      .select('display_order')
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .order('display_order', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (lastActivityError) return jsonError(lastActivityError.message, 500)

    const actorUserId = clean(actor?.userId || session?.user?.id) || null
    const baseOrder = Number(lastActivity?.display_order || 0)
    const projectId = staffingProjectId || null
    const workDate = clean(staffingSession?.work_date).slice(0, 10)

    const activityRows = payload.activities.map((activity, index) => ({
      session_id: sessionId,
      company_id: companyId,
      project_id: projectId,
      work_date: workDate,
      program_activity_id: activity.program_activity_id,
      activity: activity.activity,
      activity_start_time: activity.activity_start_time,
      activity_end_time: activity.activity_end_time,
      activity_observations: activity.activity_observations,
      restrictions: activity.restrictions,
      area: activity.area,
      unit: activity.unit,
      quantity: activity.quantity,
      user_detail: activity.user_detail,
      display_order: baseOrder + index + 1,
      created_by: actorUserId,
      updated_by: actorUserId,
      metadata: activity.metadata,
    }))

    const { data: activities, error: insertError } = await supabaseAdmin
      .from('pr_field_activity_logs')
      .insert(activityRows)
      .select('*')

    if (insertError) return jsonError(insertError.message, 500)

    await writeAuditLog({
      supabaseAdmin,
      companyId,
      projectId,
      actorUserId,
      actorEmail: actor?.email || session?.user?.email || null,
      actorRole: actor?.role || session?.user?.role || null,
      action: 'create_activity' as any,
      resourceType: 'staffing_activity_log',
      resourceId: sessionId,
      afterData: {
        session_id: sessionId,
        activities: activities || [],
      },
      metadata: {
        event: 'staffing.activities.create',
        company_id: companyId,
        project_id: projectId,
        work_date: workDate,
        session_id: sessionId,
        activities_count: activities?.length || 0,
      },
    })

    return NextResponse.json({ activities: activities || [] }, { status: 201 })
  } catch (err) {
    console.error('Error POST /api/staffing-activities/[id]/activities', err)
    return jsonError('Unexpected server error', 500)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return jsonError('Unauthorized', 401)

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as any
    const actor = await resolveCurrentActor(session)
    const companyId = clean(actor?.companyId || session?.user?.companyId)
    if (!companyId) return jsonError('Missing company_id', 400)

    const role = clean(actor?.role || session?.user?.role).toLowerCase()
    if (role === 'viewer') return jsonError('Forbidden', 403)

    const sessionId = clean(params?.id)
    if (!sessionId) return jsonError('id requerido', 400)

    const body = await req.json().catch(() => ({}))
    const activityId = clean(body?.activity_id ?? body?.activityId ?? body?.id)
    if (!activityId) return jsonError('activity_id requerido', 400)

    const { data: staffingSession, error: sessionError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (sessionError) return jsonError(sessionError.message, 500)
    if (!staffingSession?.id) return jsonError('Cuadrilla no encontrada', 404)

    const scopedProjectId = clean(actor?.projectId || sessionProjectId(session) || tokenProjectId(token))
    const staffingProjectId = clean(staffingSession?.project_id)
    if (scopedProjectId && staffingProjectId && scopedProjectId !== staffingProjectId) {
      return jsonError('project_id no coincide con el proyecto de la sesión', 403)
    }

    const status = clean(staffingSession?.status).toLowerCase()
    if (!['draft', 'reopened'].includes(status)) {
      return jsonError('La cuadrilla no está abierta para editar actividades', 409)
    }

    const actorUserId = clean(actor?.userId || session?.user?.id) || null
    if (!actorUserId || clean(staffingSession?.created_by) !== actorUserId) {
      return jsonError('Forbidden', 403)
    }

    const { data: existingActivity, error: activityError } = await supabaseAdmin
      .from('pr_field_activity_logs')
      .select('*')
      .eq('id', activityId)
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (activityError) return jsonError(activityError.message, 500)
    if (!existingActivity?.id) return jsonError('Actividad no encontrada', 404)

    const existingMetadata =
      existingActivity.metadata && typeof existingActivity.metadata === 'object' && !Array.isArray(existingActivity.metadata)
        ? existingActivity.metadata
        : {}
    if (clean(existingMetadata.status).toLowerCase() === 'closed') {
      return jsonError('No se puede editar una actividad cerrada', 409)
    }

    let payload: ValidatedStaffingPayload
    try {
      payload = validateStaffingPayload({
        activities: [body],
        work_date: clean(staffingSession?.work_date).slice(0, 10),
      })
    } catch (validationError: any) {
      return jsonError(String(validationError?.message || validationError), 400)
    }

    const activity = payload.activities[0]
    if (!activity) return jsonError('Actividad requerida', 400)

    const metadata = {
      ...existingMetadata,
      ...activity.metadata,
    }

    const { data: updatedActivity, error: updateError } = await supabaseAdmin
      .from('pr_field_activity_logs')
      .update({
        program_activity_id: activity.program_activity_id,
        activity: activity.activity,
        activity_start_time: activity.activity_start_time,
        activity_end_time: activity.activity_end_time,
        activity_observations: activity.activity_observations,
        restrictions: activity.restrictions,
        area: activity.area,
        unit: activity.unit,
        quantity: activity.quantity,
        user_detail: activity.user_detail,
        updated_by: actorUserId,
        updated_at: new Date().toISOString(),
        metadata,
      })
      .eq('id', activityId)
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .select('*')
      .maybeSingle()

    if (updateError) return jsonError(updateError.message, 500)
    if (!updatedActivity?.id) return jsonError('No se pudo actualizar la actividad', 409)

    await writeAuditLog({
      supabaseAdmin,
      companyId,
      projectId: staffingProjectId || null,
      actorUserId,
      actorEmail: actor?.email || session?.user?.email || null,
      actorRole: actor?.role || session?.user?.role || null,
      action: 'update' as any,
      resourceType: 'staffing_activity_log',
      resourceId: activityId,
      beforeData: existingActivity,
      afterData: updatedActivity,
      metadata: {
        event: 'staffing.activities.update',
        company_id: companyId,
        project_id: staffingProjectId || null,
        work_date: staffingSession.work_date || null,
        session_id: sessionId,
      },
    })

    return NextResponse.json({ activity: updatedActivity })
  } catch (err) {
    console.error('Error PATCH /api/staffing-activities/[id]/activities', err)
    return jsonError('Unexpected server error', 500)
  }
}
