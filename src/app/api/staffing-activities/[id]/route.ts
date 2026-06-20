import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveCurrentActor } from '@/lib/currentActor'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

export const dynamic = 'force-dynamic'
const PROJECT_LOCAL_TIME_ZONE = 'America/Santiago'

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

const getProjectTodayYmd = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PROJECT_LOCAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

const auditDeleteAttempt = async (params: {
  companyId: string
  projectId?: string | null
  actorUserId?: string | null
  actorEmail?: string | null
  actorRole?: string | null
  resourceId?: string | null
  beforeData?: any
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
    action: 'delete',
    resourceType: 'staffing_activity',
    resourceId: params.resourceId || null,
    beforeData: params.beforeData,
    metadata: {
      event: params.allowed ? 'staffing.delete' : 'staffing.delete.rejected',
      allowed: params.allowed,
      reason: params.reason || null,
      ...(params.metadata || {}),
    },
  })
}

export async function DELETE(
  _req: NextRequest,
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
    const actorUserId = clean(actor?.userId || session?.user?.id)
    const selectedProjectId = clean(actor?.projectId || sessionProjectId(session))

    const { data: staffingSession, error: fetchError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (fetchError) return jsonError(fetchError.message, 500)
    if (!staffingSession?.id) return jsonError('Sesión de dotación no encontrada', 404)

    const auditBase = {
      companyId,
      projectId: staffingSession.project_id || selectedProjectId || null,
      actorUserId: actorUserId || null,
      actorEmail: actor?.email || session?.user?.email || null,
      actorRole: actor?.role || session?.user?.role || null,
      resourceId: id,
      beforeData: staffingSession,
      metadata: {
        company_id: companyId,
        project_id: staffingSession.project_id || null,
        work_date: staffingSession.work_date || null,
      },
    }

    if (selectedProjectId && clean(staffingSession.project_id) !== selectedProjectId) {
      await auditDeleteAttempt({ ...auditBase, allowed: false, reason: 'project_scope_mismatch' })
      return jsonError('Sesión de dotación no encontrada', 404)
    }

    if (!actorUserId || clean(staffingSession.created_by) !== actorUserId) {
      await auditDeleteAttempt({ ...auditBase, allowed: false, reason: 'not_creator' })
      return jsonError('Forbidden', 403)
    }

    if (clean(staffingSession.status) !== 'draft') {
      await auditDeleteAttempt({ ...auditBase, allowed: false, reason: 'not_draft' })
      return jsonError('Solo se pueden eliminar sesiones en estado draft', 409)
    }

    if (clean(staffingSession.generated_crew_id)) {
      await auditDeleteAttempt({ ...auditBase, allowed: false, reason: 'generated_crew_exists' })
      return jsonError('No se puede eliminar una sesión con cuadrilla generada', 409)
    }

    const workDate = clean(staffingSession.work_date).slice(0, 10)
    const today = getProjectTodayYmd()
    if (workDate !== today) {
      await auditDeleteAttempt({ ...auditBase, allowed: false, reason: 'not_current_project_date', metadata: { ...auditBase.metadata, today } })
      return jsonError('Solo se pueden eliminar borradores de la fecha actual', 409)
    }

    const { data: deletedSession, error: deleteError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('created_by', actorUserId)
      .eq('status', 'draft')
      .is('generated_crew_id', null)
      .eq('work_date', today)
      .select('id')
      .maybeSingle()

    if (deleteError) return jsonError(deleteError.message, 500)
    if (!deletedSession?.id) {
      await auditDeleteAttempt({ ...auditBase, allowed: false, reason: 'delete_conflict', metadata: { ...auditBase.metadata, today } })
      return jsonError('La sesión ya no puede eliminarse', 409)
    }

    await auditDeleteAttempt({ ...auditBase, allowed: true, metadata: { ...auditBase.metadata, today } })

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('Error DELETE /api/staffing-activities/[id]', err)
    return jsonError('Unexpected server error', 500)
  }
}
