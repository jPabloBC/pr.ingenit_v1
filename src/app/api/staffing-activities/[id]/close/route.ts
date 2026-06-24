import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveCurrentActor } from '@/lib/currentActor'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

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

const activityMetadata = (activity: any) =>
  activity?.metadata && typeof activity.metadata === 'object' && !Array.isArray(activity.metadata)
    ? activity.metadata
    : {}

const activityReadyToSubmit = (activity: any) => {
  const metadata = activityMetadata(activity)
  const activityType = clean(metadata.activity_type).toLowerCase()
  const images = Array.isArray(metadata.images) ? metadata.images : []

  if (!clean(activity?.activity)) return false
  if (!clean(activity?.activity_description)) return false
  if (!activityType) return false
  if (!clean(activity?.activity_start_time)) return false
  if (!clean(activity?.activity_end_time)) return false
  if (activityType === 'operational') {
    if (!clean(activity?.quantity) || !clean(activity?.unit)) return false
    if (images.length === 0) return false
  }
  return true
}

const auditCloseAttempt = async (params: {
  companyId: string
  projectId?: string | null
  actorUserId?: string | null
  actorEmail?: string | null
  actorRole?: string | null
  resourceId?: string | null
  beforeData?: any
  afterData?: any
  allowed: boolean
  reason?: string
  metadata?: Record<string, any>
}) => {
  await writeAuditLog({
    supabaseAdmin,
    companyId: params.companyId,
    projectId: params.projectId || null,
    actorUserId: params.actorUserId || null,
    actorEmail: params.actorEmail || null,
    actorRole: params.actorRole || null,
    action: 'update',
    resourceType: 'staffing_activity',
    resourceId: params.resourceId || null,
    beforeData: params.beforeData,
    afterData: params.afterData,
    metadata: {
      event: params.allowed ? 'staffing.submit' : 'staffing.submit.rejected',
      allowed: params.allowed,
      reason: params.reason || null,
      ...(params.metadata || {}),
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return jsonError('Unauthorized', 401)

    const actor = await resolveCurrentActor(session)
    const companyId = clean(actor?.companyId || session?.user?.companyId)
    if (!companyId) return jsonError('Missing company_id', 400)

    const id = clean(params?.id)
    if (!id) return jsonError('ID requerido', 400)

    const body = await req.json().catch(() => ({}))
    const closureNotes = clean(body?.closure_notes ?? body?.closureNotes) || null
    const actorUserId = clean(actor?.userId || session?.user?.id) || null
    const selectedProjectId = clean(actor?.projectId || sessionProjectId(session))
    const now = new Date().toISOString()

    const { data: beforeData, error: fetchError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (fetchError) return jsonError(fetchError.message, 500)
    if (!beforeData?.id) return jsonError('Sesión de dotación no encontrada', 404)

    const auditBase = {
      companyId,
      projectId: beforeData.project_id || selectedProjectId || null,
      actorUserId,
      actorEmail: actor?.email || session?.user?.email || null,
      actorRole: actor?.role || session?.user?.role || null,
      resourceId: id,
      beforeData,
      metadata: {
        company_id: companyId,
        project_id: beforeData.project_id || null,
        work_date: beforeData.work_date || null,
      },
    }

    if (selectedProjectId && clean(beforeData.project_id) !== selectedProjectId) {
      await auditCloseAttempt({ ...auditBase, allowed: false, reason: 'project_scope_mismatch' })
      return jsonError('Sesión de dotación no encontrada', 404)
    }

    if (!actorUserId || clean(beforeData.created_by) !== actorUserId) {
      await auditCloseAttempt({ ...auditBase, allowed: false, reason: 'not_creator' })
      return jsonError('Forbidden', 403)
    }

    if (clean(beforeData.status) !== 'draft') {
      await auditCloseAttempt({ ...auditBase, allowed: false, reason: 'not_draft' })
      return jsonError('Solo se pueden cerrar jornadas en estado draft', 409)
    }

    const { data: activities, error: activitiesError } = await supabaseAdmin
      .from('pr_field_activity_logs')
      .select('id, activity, activity_description, activity_start_time, activity_end_time, quantity, unit, metadata')
      .eq('session_id', id)
      .eq('company_id', companyId)

    if (activitiesError) return jsonError(activitiesError.message, 500)

    const activityRows = Array.isArray(activities) ? activities : []
    if (activityRows.length === 0) {
      await auditCloseAttempt({ ...auditBase, allowed: false, reason: 'no_activities' })
      return jsonError('No se puede cerrar una jornada sin actividades', 400)
    }

    const incompleteActivities = activityRows.filter((activity) => !activityReadyToSubmit(activity))
    if (incompleteActivities.length > 0) {
      await auditCloseAttempt({
        ...auditBase,
        allowed: false,
        reason: 'activities_incomplete',
        metadata: {
          ...auditBase.metadata,
          incomplete_activity_count: incompleteActivities.length,
        },
      })
      return jsonError('No se puede enviar la jornada: hay actividades con datos requeridos incompletos', 400)
    }

    const metadata = {
      ...(beforeData.metadata && typeof beforeData.metadata === 'object' && !Array.isArray(beforeData.metadata) ? beforeData.metadata : {}),
      submitted_notes: closureNotes,
      submitted_at: now,
      submitted_by: actorUserId,
    }

    const { data: closedSession, error: updateError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .update({
        status: 'submitted',
        submitted_at: now,
        updated_by: actorUserId,
        updated_at: now,
        metadata,
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('created_by', actorUserId)
      .eq('status', 'draft')
      .select('*')
      .maybeSingle()

    if (updateError) return jsonError(updateError.message, 500)
    if (!closedSession?.id) {
      await auditCloseAttempt({ ...auditBase, allowed: false, reason: 'submit_conflict' })
      return jsonError('La jornada ya no puede cerrarse', 409)
    }

    await auditCloseAttempt({
      ...auditBase,
      allowed: true,
      afterData: closedSession,
      metadata: {
        ...auditBase.metadata,
        submitted_at: now,
      },
    })

    return NextResponse.json({ session: closedSession })
  } catch (err) {
    console.error('Error PATCH /api/staffing-activities/[id]/close', err)
    return jsonError('Unexpected server error', 500)
  }
}
