import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const NON_DELEGABLE_RESOURCE_KEYS = new Set<string>(['admin-permissions'])

export async function GET(req: NextRequest, { params }: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const sessionRole = String(session?.user?.role || '').trim().toLowerCase()
    const sessionUserId = String(session?.user?.id || '')
    const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
    let role = sessionRole
    let resolvedCompanyId = session?.user?.companyId as string | null | undefined
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
    const projectId = String((session?.user as any)?.projectId || '').trim()
    if (!isDev && !companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isDev && role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!projectId) return NextResponse.json({ error: 'Missing project context' }, { status: 400 })

    const userId = params.id
    if (!userId) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })

    if (!isDev) {
      const { data: target, error: targetErr } = await supabaseAdmin
        .from('pr_users')
        .select('id, role, company_id')
        .eq('id', userId)
        .maybeSingle()
      if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 })
      if (!target) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
      if (String(target.company_id || '') !== String(companyId || '')) {
        return NextResponse.json({ error: 'Forbidden: different company' }, { status: 403 })
      }
      const targetRole = String(target.role || '').trim().toLowerCase()
      if (!(targetRole === 'user' || targetRole === 'member')) {
        return NextResponse.json({ error: 'Forbidden: target role is not manageable by admin' }, { status: 403 })
      }
    }

    let query = supabaseAdmin
      .from('pr_project_user_permissions')
      .select('resource_key, can_view, company_id, project_id')
      .eq('user_id', userId)
      .eq('project_id', projectId)
    if (companyId) query = query.eq('company_id', companyId)
    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ permissions: data || [] })
  } catch (err) {
    console.error('Error GET /api/admin/users/[id]/permissions:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const sessionRole = String(session?.user?.role || '').trim().toLowerCase()
    const sessionUserId = String(session?.user?.id || '')
    const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
    let role = sessionRole
    let resolvedCompanyId = session?.user?.companyId as string | null | undefined
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
    const sessionCompanyId = resolvedCompanyId
    const sessionProjectId = String((session?.user as any)?.projectId || '').trim()
    if (!isDev && !sessionCompanyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isDev && role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const userId = params.id
    if (!userId) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    let companyId = sessionCompanyId as string | null | undefined

    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from('pr_users')
      .select('id, role, company_id')
      .eq('id', userId)
      .maybeSingle()
    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 })
    if (!targetUser) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })

    // Dev users are global; resolve target company from selected user.
    if (isDev) {
      companyId = targetUser.company_id || null
      if (!companyId) return NextResponse.json({ error: 'Target user has no company_id' }, { status: 400 })
    } else {
      const targetCompanyId = targetUser.company_id
      if (String(targetCompanyId || '') !== String(companyId || '')) {
        return NextResponse.json({ error: 'Forbidden: different company' }, { status: 403 })
      }
      const targetRole = String(targetUser.role || '').trim().toLowerCase()
      if (!(targetRole === 'user' || targetRole === 'member')) {
        return NextResponse.json({ error: 'Forbidden: target role is not manageable by admin' }, { status: 403 })
      }
    }

    const body = await req.json()
    const perms: Array<{ resource_key: string; can_view: boolean }> = body.permissions || []

    if (!isDev) {
      // Company admins can delegate project module permissions,
      // but cannot grant privileged admin-permissions.
      for (const p of perms) {
        const key = String(p?.resource_key || '').trim()
        if (!key) continue
        if (NON_DELEGABLE_RESOURCE_KEYS.has(key) && !!p.can_view) {
          return NextResponse.json({ error: `Forbidden: cannot grant ${key}` }, { status: 403 })
        }
      }
    }

    // Remove existing permissions for user within company, then insert new
    const { error: delErr } = await supabaseAdmin
      .from('pr_project_user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('project_id', sessionProjectId)
    if (delErr) console.warn('Warning deleting old permissions:', delErr.message)

    const toInsert = perms.map(p => ({
      user_id: userId,
      company_id: companyId,
      project_id: sessionProjectId,
      resource_key: p.resource_key,
      can_view: !!p.can_view
    }))
    if (toInsert.length) {
      const { data: ins, error: insErr } = await supabaseAdmin.from('pr_project_user_permissions').insert(toInsert)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    // Ensure membership in the active project when assigning permissions from this screen.
    if (companyId && sessionProjectId) {
      const { error: assignErr } = await supabaseAdmin
        .from('pr_project_users')
        .upsert(
          [
            {
              user_id: userId,
              company_id: companyId,
              project_id: sessionProjectId,
              status: 'active',
            },
          ],
          { onConflict: 'project_id,user_id' },
        )
      if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error PUT /api/admin/users/[id]/permissions:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
