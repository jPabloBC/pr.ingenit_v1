import { createClient } from '@supabase/supabase-js'

export type CurrentActor = {
  userId: string
  email: string | null
  role: string
  companyId: string | null
  projectId: string | null
  projectName: string | null
  source: 'pr_users' | 'session'
}

const clean = (value: unknown) => String(value || '').trim()

export async function resolveCurrentActor(session: any): Promise<CurrentActor | null> {
  const sessionUser = session?.user
  if (!sessionUser) return null

  const sessionUserId = clean(sessionUser.id)
  const sessionEmail = clean(sessionUser.email).toLowerCase()
  const sessionRole = clean(sessionUser.role).toLowerCase()
  const sessionCompanyId = clean(sessionUser.companyId) || null
  const projectId = clean(sessionUser.projectId) || null
  const projectName = clean(sessionUser.projectName) || null

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server credentials')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    let query = supabaseAdmin
      .from('pr_users')
      .select('id, email, role, company_id')
      .limit(1)

    if (sessionUserId) {
      query = query.eq('id', sessionUserId)
    } else if (sessionEmail) {
      query = query.eq('email', sessionEmail)
    } else {
      query = query.eq('id', '__missing_actor__')
    }

    const { data, error } = await query.maybeSingle()
    if (!error && data?.id) {
      return {
        userId: clean(data.id),
        email: clean(data.email).toLowerCase() || sessionEmail || null,
        role: clean(data.role).toLowerCase() || sessionRole,
        companyId: clean(data.company_id) || sessionCompanyId,
        projectId,
        projectName,
        source: 'pr_users',
      }
    }
  } catch {
    // Fallback keeps current API behavior unchanged if actor normalization cannot query pr_users.
  }

  if (!sessionUserId && !sessionEmail) return null
  return {
    userId: sessionUserId || sessionEmail,
    email: sessionEmail || null,
    role: sessionRole,
    companyId: sessionCompanyId,
    projectId,
    projectName,
    source: 'session',
  }
}
