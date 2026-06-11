import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const sessionRole = String(session?.user?.role || '').trim().toLowerCase()
    const sessionUserId = String(session?.user?.id || '')
    const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
    let role = sessionRole
    let resolvedCompanyId = session?.user?.companyId as string | null | undefined

    // Resolve authoritative role from DB to avoid stale JWT/session role mismatches.
    try {
      let actor: any = null
      if (sessionUserId) {
        const { data: byId } = await supabaseAdmin
          .from('pr_users')
          .select('role, company_id')
          .eq('id', sessionUserId)
          .maybeSingle()
        actor = byId || null
      }
      if (!actor && sessionEmail) {
        const { data: byEmail } = await supabaseAdmin
          .from('pr_users')
          .select('role, company_id')
          .eq('email', sessionEmail)
          .maybeSingle()
        actor = byEmail || null
      }
      if (actor?.role) role = String(actor.role).trim().toLowerCase()
      if (actor?.company_id) resolvedCompanyId = actor.company_id
    } catch (e) {
      // fallback to session role
    }

    const isDev = role === 'dev'
    const companyId = resolvedCompanyId
    const sessionProjectId = String((session?.user as any)?.projectId || '').trim()
    if (!isDev && !companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isDev && role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let query = supabaseAdmin
      .from('pr_users')
      .select('id, first_name, last_name, email, role, company_id, allow_late_crew_creation')
      .neq('role', 'dev')
      .order('email', { ascending: true })
    if (!isDev && companyId) {
      query = query.eq('company_id', companyId)
    }
    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const allUsers = data || []

    // Company admin can only manage end-users of their own company.
    // Dev keeps global access to all non-dev roles.
    const users = allUsers.filter((u: any) => {
      if (isDev) return true
      const r = String(u?.role || '').trim().toLowerCase()
      return r === 'user' || r === 'member'
    }).map((u: any) => ({
      ...u,
      name: `${String(u?.first_name || '').trim()} ${String(u?.last_name || '').trim()}`.trim() || null
    }))

    // Candidates: active collaborators with email and no pr_users row
    // in the same company+email pair (potential "convert collaborator -> user").
    let collaboratorsQuery = supabaseAdmin
      .from('pr_collaborators')
      .select('id, company_id, email, first_name, last_name, is_active')
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
    if (!isDev && companyId) {
      collaboratorsQuery = collaboratorsQuery.eq('company_id', companyId)
    }
    const { data: collaborators, error: collErr } = await collaboratorsQuery
    if (collErr) return NextResponse.json({ error: collErr.message }, { status: 500 })

    const existingByCompanyAndEmail = new Set<string>()
    for (const u of allUsers) {
      const uEmail = String((u as any)?.email || '').trim().toLowerCase()
      const uCompany = String((u as any)?.company_id || '')
      if (!uEmail || !uCompany) continue
      existingByCompanyAndEmail.add(`${uCompany}::${uEmail}`)
    }

    const candidates = (collaborators || [])
      .map((c: any) => {
        const email = String(c?.email || '').trim().toLowerCase()
        const cCompany = String(c?.company_id || '')
        if (!email || !cCompany) return null
        const exists = existingByCompanyAndEmail.has(`${cCompany}::${email}`)
        if (exists) return null
        return {
          collaborator_id: c.id,
          company_id: c.company_id,
          email: c.email,
          first_name: c.first_name,
          last_name: c.last_name,
        }
      })
      .filter(Boolean)

    const userIds = users.map((u: any) => String(u.id)).filter(Boolean)
    let usersWithAccess = 0
    if (userIds.length > 0) {
      let accessQuery = supabaseAdmin
        .from('pr_project_user_permissions')
        .select('user_id')
        .in('user_id', userIds)
        .eq('can_view', true)
      if (!isDev && companyId) {
        accessQuery = accessQuery.eq('company_id', companyId)
      }
      if (sessionProjectId) {
        accessQuery = accessQuery.eq('project_id', sessionProjectId)
      }
      const { data: accessRows, error: accessErr } = await accessQuery
      if (accessErr) return NextResponse.json({ error: accessErr.message }, { status: 500 })
      usersWithAccess = new Set((accessRows || []).map((r: any) => String(r.user_id || '')).filter(Boolean)).size
    }

    const summary = {
      total_workers: users.length + candidates.length,
      with_access: usersWithAccess,
      without_access: Math.max((users.length + candidates.length) - usersWithAccess, 0),
    }

    return NextResponse.json({ users, candidates, summary })
  } catch (err) {
    console.error('Error GET /api/admin/users:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
