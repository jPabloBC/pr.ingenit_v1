import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveCurrentActor } from '@/lib/currentActor'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const COMMUNICATIONS_PERMISSION = 'communications'
export const COMMUNICATIONS_SEND_PERMISSION = 'communications.send'
export const COMMUNICATIONS_FORMS_PERMISSION = 'communications.forms'

export const getCommunicationsActor = async () => {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { session: null, actor: null, allowed: false, canSend: false, canManageForms: false, canAdministerForms: false, permissions: [] as string[] }

  const actor = await resolveCurrentActor(session)
  const role = String(actor?.role || session?.user?.role || '').trim().toLowerCase()
  const permissions = new Set(Array.isArray(session?.user?.permissions) ? session.user.permissions.map((value: unknown) => String(value)) : [])
  if (actor?.userId && actor.projectId && role !== 'admin' && role !== 'dev') {
    let query = supabaseAdmin
      .from('pr_project_user_permissions')
      .select('resource_key')
      .eq('user_id', actor.userId)
      .eq('project_id', actor.projectId)
      .eq('can_view', true)
    if (actor.companyId) query = query.eq('company_id', actor.companyId)
    const { data } = await query
    ;(data || []).forEach((row) => permissions.add(String(row.resource_key || '').trim()))
  }
  const fullAccess = role === 'admin' || role === 'dev' || permissions.has('*')
  const canSend = fullAccess || permissions.has(COMMUNICATIONS_SEND_PERMISSION)
  const canManageForms = fullAccess || permissions.has(COMMUNICATIONS_PERMISSION) || permissions.has(COMMUNICATIONS_FORMS_PERMISSION)
  const canAdministerForms = role === 'admin' || role === 'dev'
  return { session, actor, allowed: canSend || canManageForms, canSend, canManageForms, canAdministerForms, permissions: Array.from(permissions) }
}
