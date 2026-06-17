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

    const { data: staffingSession, error: fetchError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (fetchError) return jsonError(fetchError.message, 500)
    if (!staffingSession?.id) return jsonError('Sesión de dotación no encontrada', 404)

    if (clean(staffingSession.status) !== 'draft') {
      return jsonError('Solo se pueden eliminar sesiones en estado draft', 409)
    }

    if (clean(staffingSession.generated_crew_id)) {
      return jsonError('No se puede eliminar una sesión con cuadrilla generada', 409)
    }

    const role = clean(actor?.role || session?.user?.role).toLowerCase()
    const actorUserId = clean(actor?.userId || session?.user?.id)
    const isAdmin = role === 'admin' || role === 'dev'
    const isCreator = actorUserId && clean(staffingSession.created_by) === actorUserId
    if (!isAdmin && !isCreator) return jsonError('Forbidden', 403)

    const { data: deletedSession, error: deleteError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .is('generated_crew_id', null)
      .select('id')
      .maybeSingle()

    if (deleteError) return jsonError(deleteError.message, 500)
    if (!deletedSession?.id) {
      return jsonError('La sesión ya no puede eliminarse', 409)
    }

    await writeAuditLog({
      supabaseAdmin,
      companyId,
      projectId: staffingSession.project_id || actor?.projectId || session?.user?.projectId || null,
      actorUserId: actorUserId || null,
      actorEmail: actor?.email || session?.user?.email || null,
      actorRole: actor?.role || session?.user?.role || null,
      action: 'delete',
      resourceType: 'staffing_activity',
      resourceId: id,
      beforeData: staffingSession,
      metadata: {
        event: 'staffing.delete',
        company_id: companyId,
        project_id: staffingSession.project_id || null,
        work_date: staffingSession.work_date || null,
      },
    })

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('Error DELETE /api/staffing-activities/[id]', err)
    return jsonError('Unexpected server error', 500)
  }
}
