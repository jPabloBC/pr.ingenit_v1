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

    const role = clean(actor?.role || session?.user?.role).toLowerCase()
    if (role === 'viewer') return jsonError('Forbidden', 403)

    const id = clean(params?.id)
    if (!id) return jsonError('ID requerido', 400)

    const body = await req.json().catch(() => ({}))
    const closureNotes = clean(body?.closure_notes ?? body?.closureNotes) || null
    const actorUserId = clean(actor?.userId || session?.user?.id) || null
    const now = new Date().toISOString()

    const { data: beforeData, error: fetchError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (fetchError) return jsonError(fetchError.message, 500)
    if (!beforeData?.id) return jsonError('Sesión de dotación no encontrada', 404)
    if (clean(beforeData.status) !== 'draft') {
      return jsonError('Solo se pueden cerrar jornadas en estado draft', 409)
    }

    const { data: closedSession, error: updateError } = await supabaseAdmin
      .from('pr_field_staffing_sessions')
      .update({
        status: 'closed',
        closed_at: now,
        closed_by: actorUserId,
        closure_notes: closureNotes,
        updated_by: actorUserId,
        updated_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .select('*')
      .maybeSingle()

    if (updateError) return jsonError(updateError.message, 500)
    if (!closedSession?.id) return jsonError('La jornada ya no puede cerrarse', 409)

    await writeAuditLog({
      supabaseAdmin,
      companyId,
      projectId: closedSession.project_id || actor?.projectId || session?.user?.projectId || null,
      actorUserId,
      actorEmail: actor?.email || session?.user?.email || null,
      actorRole: actor?.role || session?.user?.role || null,
      action: 'update',
      resourceType: 'staffing_activity',
      resourceId: id,
      beforeData,
      afterData: closedSession,
      metadata: {
        event: 'staffing.close',
        company_id: companyId,
        project_id: closedSession.project_id || null,
        work_date: closedSession.work_date || null,
      },
    })

    return NextResponse.json({ session: closedSession })
  } catch (err) {
    console.error('Error PATCH /api/staffing-activities/[id]/close', err)
    return jsonError('Unexpected server error', 500)
  }
}
