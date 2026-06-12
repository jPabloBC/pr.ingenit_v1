import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const isUuidLike = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const makeTempPassword = () => `Tmp#${crypto.randomUUID()}`

const resolveAuthUserIdByEmail = async (email: string): Promise<string | null> => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: makeTempPassword(),
      email_confirm: true
    })
    if (!error && data?.user?.id) return data.user.id

    const msg = String(error?.message || '').toLowerCase()
    if (!msg.includes('already')) return null

    // Fallback: find existing auth user by email.
    // listUsers is paginated, so iterate a few pages.
    for (let page = 1; page <= 10; page++) {
      const listed = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
      const users = (listed?.data?.users || []) as any[]
      const found = users.find((u: any) => String(u?.email || '').trim().toLowerCase() === email)
      if (found?.id) return String(found.id)
      if (!users.length) break
    }
    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
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
    } catch {
      // fallback to session role
    }

    const isDev = role === 'dev'
    const companyId = resolvedCompanyId
    const sessionProjectId = String((session?.user as any)?.projectId || '').trim()
    if (!isDev && !companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isDev && role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const collaboratorId = String(body?.collaborator_id || '').trim()
    if (!collaboratorId) return NextResponse.json({ error: 'Missing collaborator_id' }, { status: 400 })

    const { data: collab, error: collErr } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id, company_id, email, first_name, last_name, user_id, is_active')
      .eq('id', collaboratorId)
      .maybeSingle()

    if (collErr) return NextResponse.json({ error: collErr.message }, { status: 500 })
    if (!collab) return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 })
    if (!collab.is_active) return NextResponse.json({ error: 'Collaborator is inactive' }, { status: 400 })
    if (!isDev && String(collab.company_id || '') !== String(companyId || '')) {
      return NextResponse.json({ error: 'Forbidden: collaborator from different company' }, { status: 403 })
    }

    const email = String(collab.email || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'Collaborator has no email' }, { status: 400 })

    const targetCompanyId = collab.company_id
    const { data: existingByCompanyAndEmail, error: existingErr } = await supabaseAdmin
      .from('pr_users')
      .select('id, first_name, last_name, email, role, company_id, auth_id')
      .eq('company_id', targetCompanyId)
      .eq('email', email)
      .maybeSingle()
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

    let user = existingByCompanyAndEmail
    let authIdToSet: string | null = null
    const rawUserId = String(collab.user_id || '').trim()
    if (rawUserId && isUuidLike(rawUserId)) {
      // If this UUID already maps to auth_id in pr_users, it is likely an auth user id.
      const { data: usedAuth } = await supabaseAdmin
        .from('pr_users')
        .select('id')
        .eq('auth_id', rawUserId)
        .maybeSingle()
      if (!usedAuth) authIdToSet = rawUserId
    }
    if (!authIdToSet) {
      authIdToSet = await resolveAuthUserIdByEmail(email)
    }
    if (!authIdToSet) {
      return NextResponse.json({ error: 'No se pudo resolver auth_id para el email del colaborador' }, { status: 500 })
    }

    if (!user) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('pr_users')
        .insert({
          email,
          first_name: String(collab.first_name || '').trim() || null,
          last_name: String(collab.last_name || '').trim() || null,
          role: 'user',
          company_id: targetCompanyId,
          auth_id: authIdToSet
        })
        .select('id, first_name, last_name, email, role, company_id, auth_id')
        .single()
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
      user = inserted
    } else if (!user.auth_id) {
      // Normalize existing rows missing auth mapping.
      const { data: updated, error: updUserErr } = await supabaseAdmin
        .from('pr_users')
        .update({ auth_id: authIdToSet })
        .eq('id', user.id)
        .select('id, first_name, last_name, email, role, company_id, auth_id')
        .single()
      if (updUserErr) return NextResponse.json({ error: updUserErr.message }, { status: 500 })
      user = updated
    }

    // Normalize mapping used by app permissions/auth callbacks.
    const { error: updCollErr } = await supabaseAdmin
      .from('pr_collaborators')
      .update({ user_id: user.id })
      .eq('id', collab.id)
    if (updCollErr) return NextResponse.json({ error: updCollErr.message }, { status: 500 })

    // Keep project assignment aligned when user is created from /users/admin/permissions.
    if (targetCompanyId && sessionProjectId) {
      const { error: upsertProjectErr } = await supabaseAdmin
        .from('pr_project_users')
        .upsert(
          [
            {
              user_id: user.id,
              company_id: targetCompanyId,
              project_id: sessionProjectId,
              status: 'active',
            },
          ],
          { onConflict: 'project_id,user_id' },
        )
      if (upsertProjectErr) {
        return NextResponse.json({ error: upsertProjectErr.message }, { status: 500 })
      }
    }

    const userWithName = {
      ...user,
      name: `${String((user as any)?.first_name || '').trim()} ${String((user as any)?.last_name || '').trim()}`.trim() || null
    }
    return NextResponse.json({ ok: true, user: userWithName })
  } catch (err) {
    console.error('Error POST /api/admin/users/convert-collaborator:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
