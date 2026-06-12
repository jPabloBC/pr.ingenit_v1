import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import { resolveCurrentActor } from '@/lib/currentActor'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

export const dynamic = 'force-dynamic'

const normalizeCrewRoleText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const inferCrewRoleFromPosition = (position: any) => {
  const pos = normalizeCrewRoleText(position)
  if (!pos) return 'member'
  if (pos.includes('topografo') || pos.includes('alarife') || pos.includes('rigger')) return 'member'
  if (pos.includes('mecanico mantencion') || pos.includes('electrico mantencion')) return 'member'
  if (pos.includes('capataz') || pos.includes('encargado') || pos.includes('foreman')) return 'foreman'
  if (pos.includes('supervisor') || pos.includes('jefe') || pos.includes('coordinador')) return 'supervisor'
  if (/maestro|maestra|ayudante|helper|operador|operadora|operario|operaria|peon|obrero|trabajador/.test(pos)) return 'member'
  if (pos.includes('senior') || pos.includes('lead')) return 'supervisor'
  return 'member'
}

const normalizeCrewMemberRole = (role: any, position: any) => {
  const explicit = normalizeCrewRoleText(role)
  if (explicit === 'supervisor') return 'supervisor'
  if (explicit === 'foreman' || explicit === 'capataz') return 'foreman'
  if (explicit === 'member' || explicit === 'integrante' || explicit === 'colaborador') return 'member'
  return inferCrewRoleFromPosition(position)
}

const writeCrewAudit = async (
  supabaseAdminClient: any,
  session: any,
  params: {
    action: string
    resourceId?: string | null
    beforeData?: any
    afterData?: any
    metadata?: Record<string, any> | null
  }
) => {
  await writeAuditLog({
    supabaseAdmin: supabaseAdminClient,
    companyId: String(session?.user?.companyId || ''),
    projectId: session?.user?.projectId || null,
    actorUserId: session?.user?.id || null,
    actorEmail: session?.user?.email || null,
    actorRole: session?.user?.role || null,
    action: params.action as any,
    resourceType: 'crew',
    resourceId: params.resourceId || null,
    beforeData: params.beforeData,
    afterData: params.afterData,
    metadata: params.metadata || null
  })
}

export async function GET(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const id = ctx.params.id
    const { data, error } = await supabaseAdmin
      .from('pr_crews')
      .select('*')
      .eq('company_id', session.user.companyId)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    
    // Try to load members and role from pr_crew_members. If `role` column doesn't exist, we'll fallback.
    let membersData: any[] = []
    let membersError: any = null
    try {
      const sel = await supabaseAdmin
        .from('pr_crew_members')
        .select('collaborator_id,role')
        .eq('crew_id', id)
      membersData = sel.data || []
      membersError = sel.error
    } catch (e) {
      membersError = e
    }

    if (membersError) {
      // Retry selecting only collaborator_id if selecting role failed (older schema)
      const sel2 = await supabaseAdmin
        .from('pr_crew_members')
        .select('collaborator_id')
        .eq('crew_id', id)
      if (sel2.error) return NextResponse.json({ error: sel2.error.message || String(sel2.error) }, { status: 500 })
      membersData = sel2.data || []
    }

    const collabIds = (membersData || []).map((m: any) => String(m.collaborator_id))
    if (!collabIds.length) {
      // fallback to legacy fields on pr_crews
      const supLegacy = Array.isArray(data.supervisors) ? data.supervisors.map(String) : (data.supervisor ? [String(data.supervisor)] : [])
      const frmLegacy = Array.isArray(data.foremen) ? data.foremen.map(String) : (data.foreman ? [String(data.foreman)] : [])
      const memLegacy = Array.isArray(data.members) ? data.members.map(String) : (data.member ? [String(data.member)] : [])
      await writeCrewAudit(supabaseAdmin, session, {
        action: 'view',
        resourceId: String(id),
        metadata: { member_count: supLegacy.length + frmLegacy.length + memLegacy.length }
      })
      return NextResponse.json({ ...data, supervisors: supLegacy, foremen: frmLegacy, members: memLegacy })
    }

    const { data: collabs, error: collabErr } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id,position')
      .in('id', collabIds)

    if (collabErr) {
      // If we can't fetch positions, return all as members
      await writeCrewAudit(supabaseAdmin, session, {
        action: 'view',
        resourceId: String(id),
        metadata: { member_count: collabIds.length, members_fallback: true }
      })
      return NextResponse.json({ ...data, supervisors: [], foremen: [], members: collabIds })
    }

    const collabMap = new Map((collabs || []).map((c: any) => [String(c.id), c]))
    const supervisors: string[] = []
    const foremen: string[] = []
    const members: string[] = []
    for (const m of membersData || []) {
      const idv = String(m?.collaborator_id || '')
      if (!idv) continue
      const c = collabMap.get(idv)
      const role = normalizeCrewMemberRole(m?.role, c?.position ?? c?.posicion ?? '')
      if (role === 'supervisor') supervisors.push(idv)
      else if (role === 'foreman') foremen.push(idv)
      else members.push(idv)
    }
    const responseData = {
      ...data,
      supervisors: Array.from(new Set(supervisors)),
      foremen: Array.from(new Set(foremen)),
      members: Array.from(new Set(members))
    }

    await writeCrewAudit(supabaseAdmin, session, {
      action: 'view',
      resourceId: String(id),
      metadata: {
        member_count: responseData.supervisors.length + responseData.foremen.length + responseData.members.length
      }
    })

    return NextResponse.json(responseData)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await resolveCurrentActor(session)
    void actor
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })

    const body = await req.json()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    // Update crew basic fields (name, description only — supervisors/foremen/members are in pr_crew_members table)
    const id = ctx.params.id
    let beforeCrew: any = null
    let beforeMembers: any[] = []
    try {
      const beforeCrewRes = await supabaseAdmin
        .from('pr_crews')
        .select('*')
        .eq('company_id', session.user.companyId)
        .eq('id', id)
        .maybeSingle()
      beforeCrew = beforeCrewRes.data || null

      const beforeMembersRes = await supabaseAdmin
        .from('pr_crew_members')
        .select('*')
        .eq('crew_id', id)
      beforeMembers = beforeMembersRes.data || []
    } catch {
      beforeCrew = null
      beforeMembers = []
    }

    const normalizedName = body?.name ? String(body.name).toLocaleUpperCase('es-CL') : body?.name
    const normalizedSpecialty = body?.specialty ? String(body.specialty).toLocaleUpperCase('es-CL') : body?.specialty
    const fieldBossId = body?.field_boss_id ? String(body.field_boss_id) : null

    const updatePayload: Record<string, any> = {
      name: normalizedName,
      description: body.description || null,
      updated_at: new Date().toISOString()
    }
    if (normalizedSpecialty) updatePayload.specialty = normalizedSpecialty
    if (typeof body.work_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.work_date)) {
      updatePayload.work_date = body.work_date
    }

    let updated: any = null
    try {
      const { data, error } = await supabaseAdmin
        .from('pr_crews')
        .update(updatePayload)
        .eq('company_id', session.user.companyId)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      updated = data
    } catch (e: any) {
      const msg = String(e?.message || e)
      const missingCol = String(e?.code) === '42703'
      if (!missingCol) return NextResponse.json({ error: msg }, { status: 500 })
      const { work_date: _wd, ...fallbackPayload } = updatePayload
      const { data, error } = await supabaseAdmin
        .from('pr_crews')
        .update(fallbackPayload)
        .eq('company_id', session.user.companyId)
        .eq('id', id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      updated = data
    }

    // Best-effort: support alternate column names for "Jefe de Terreno" across schemas.
    if (fieldBossId) {
      const altColumns = ['field_boss_id', 'jefe_terreno_id', 'terrain_boss_id']
      for (const col of altColumns) {
        const { error } = await supabaseAdmin
          .from('pr_crews')
          .update({ [col]: fieldBossId })
          .eq('company_id', session.user.companyId)
          .eq('id', id)
        if (!error) break
        const msg = String((error as any)?.message || '')
        const code = String((error as any)?.code || '')
        const isMissingColumn = code === '42703' || msg.includes('Could not find the') || msg.includes('column')
        if (!isMissingColumn) break
      }
    }

    // Fetch current members from pr_crew_members
    const { data: currentMembers, error: fetchErr } = await supabaseAdmin
      .from('pr_crew_members')
      .select('collaborator_id')
      .eq('crew_id', id)

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })


    const currentMemberIds = (currentMembers || []).map((m: any) => String(m.collaborator_id))
    const supList: string[] = Array.isArray(body.supervisors) ? body.supervisors.map(String) : []
    const frmList: string[] = Array.isArray(body.foremen) ? body.foremen.map(String) : []
    const memList: string[] = Array.isArray(body.members) ? body.members.map(String) : []
    const allowMultiAssignmentIds = new Set<string>(
      Array.isArray(body?.allow_multi_assignment_ids)
        ? body.allow_multi_assignment_ids.map((x: any) => String(x)).filter(Boolean)
        : []
    )

    // Build map of collaboratorId -> bestRole (supervisor > foreman > member)
    const rolePriority: Record<string, number> = { supervisor: 3, foreman: 2, member: 1 }
    const roleMap = new Map<string, string>()
    const setRole = (id: string, role: string) => {
      const prev = roleMap.get(id)
      if (!prev || (rolePriority[role] || 0) > (rolePriority[prev] || 0)) roleMap.set(id, role)
    }
    supList.forEach(id => setRole(String(id), 'supervisor'))
    frmList.forEach(id => setRole(String(id), 'foreman'))
    memList.forEach(id => setRole(String(id), 'member'))

    const newMemberIds = Array.from(new Set(Array.from(roleMap.keys())))
    const nonSupervisorIdsNew = newMemberIds.filter((cid) => (roleMap.get(cid) || '').toLowerCase() !== 'supervisor')

    // Find IDs to remove
    const idsToRemove = currentMemberIds.filter(id => !newMemberIds.includes(id))

    if (idsToRemove.length > 0) {
      const { error: removeErr } = await supabaseAdmin
        .from('pr_crew_members')
        .delete()
        .eq('crew_id', id)
        .in('collaborator_id', idsToRemove)

      if (removeErr) return NextResponse.json({ error: removeErr.message }, { status: 500 })
    }

    // Insert or update members using the real table schema.
    // Role is inferred by collaborator position elsewhere; pr_crew_members has no role column.
    const uniqueIds = newMemberIds
    if (uniqueIds.length > 0) {
      const rows = uniqueIds.map((collabId: string) => ({ crew_id: id, collaborator_id: collabId }))
      const { error: upsertErr } = await supabaseAdmin
        .from('pr_crew_members')
        .upsert(rows, { onConflict: 'crew_id,collaborator_id' })
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

      const { data: savedMembers, error: verifyErr } = await supabaseAdmin
        .from('pr_crew_members')
        .select('collaborator_id')
        .eq('crew_id', id)
        .in('collaborator_id', uniqueIds)
      if (verifyErr) return NextResponse.json({ error: verifyErr.message }, { status: 500 })

      const savedIds = new Set((savedMembers || []).map((m: any) => String(m?.collaborator_id || '')))
      const missingIds = uniqueIds.filter((collabId: string) => !savedIds.has(String(collabId)))
      if (missingIds.length > 0) {
        return NextResponse.json({ error: `No se pudieron persistir integrantes: ${missingIds.join(', ')}` }, { status: 500 })
      }
    }

    // Update collaborator assignment flags for non-supervisors (best-effort)
    try {
      const { data: currentAssigned, error: currErr } = await supabaseAdmin
        .from('pr_collaborators')
        .select('id')
        .eq('current_crew_id', id)
      if (!currErr) {
        const currentIds = (currentAssigned || []).map((r: any) => String(r.id))
        const toClear = currentIds.filter((cid) => !nonSupervisorIdsNew.includes(String(cid)))
        if (toClear.length > 0) {
          await supabaseAdmin
            .from('pr_collaborators')
            .update({ current_crew_id: null, is_assigned: false })
            .in('id', toClear)
            .eq('current_crew_id', id)
        }
      }
      if (nonSupervisorIdsNew.length > 0) {
        await supabaseAdmin
          .from('pr_collaborators')
          .update({ current_crew_id: id, is_assigned: true })
          .in('id', nonSupervisorIdsNew)
          .or(`current_crew_id.is.null,current_crew_id.eq.${id}`)
      }
    } catch (e) {
      console.warn('Could not update collaborator assignment flags', e)
    }

    let afterMembers: any[] = []
    try {
      const { data: memberRows } = await supabaseAdmin
        .from('pr_crew_members')
        .select('*')
        .eq('crew_id', id)
      afterMembers = memberRows || []
    } catch {
      afterMembers = []
    }

    await writeCrewAudit(supabaseAdmin, session, {
      action: 'update',
      resourceId: String(id),
      beforeData: { crew: beforeCrew, members: beforeMembers },
      afterData: { crew: updated, members: afterMembers },
      metadata: {
        name: updated?.name ?? normalizedName ?? null,
        area: updated?.specialty ?? normalizedSpecialty ?? null,
        specialty: updated?.specialty ?? normalizedSpecialty ?? null,
        member_count_before: beforeMembers.length,
        member_count_after: afterMembers.length,
        added_member_ids: newMemberIds.filter((memberId) => !currentMemberIds.includes(memberId)),
        removed_member_ids: idsToRemove
      }
    })

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (role !== 'admin' && role !== 'dev') {
      return NextResponse.json({ error: 'Forbidden: solo admin/dev puede eliminar cuadrillas' }, { status: 403 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    // Delete members then crew
    const id = ctx.params.id
    let beforeCrew: any = null
    let beforeMembers: any[] = []
    try {
      const beforeCrewRes = await supabaseAdmin
        .from('pr_crews')
        .select('*')
        .eq('company_id', session.user.companyId)
        .eq('id', id)
        .maybeSingle()
      beforeCrew = beforeCrewRes.data || null

      const beforeMembersRes = await supabaseAdmin
        .from('pr_crew_members')
        .select('*')
        .eq('crew_id', id)
      beforeMembers = beforeMembersRes.data || []
    } catch {
      beforeCrew = null
      beforeMembers = []
    }

    const { error: delMembersErr } = await supabaseAdmin.from('pr_crew_members').delete().eq('crew_id', id)
    if (delMembersErr) return NextResponse.json({ error: delMembersErr.message }, { status: 500 })

    try {
      await supabaseAdmin
        .from('pr_collaborators')
        .update({ current_crew_id: null, is_assigned: false })
        .eq('current_crew_id', id)
    } catch (e) {
      console.warn('Could not clear collaborator assignment flags', e)
    }

    const { error: delCrewErr } = await supabaseAdmin.from('pr_crews').delete().eq('company_id', session.user.companyId).eq('id', id)
    if (delCrewErr) return NextResponse.json({ error: delCrewErr.message }, { status: 500 })

    await writeCrewAudit(supabaseAdmin, session, {
      action: 'delete',
      resourceId: String(id),
      beforeData: { crew: beforeCrew, members: beforeMembers },
      metadata: {
        name: beforeCrew?.name ?? null,
        area: beforeCrew?.specialty ?? null,
        specialty: beforeCrew?.specialty ?? null,
        member_count: beforeMembers.length
      }
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
