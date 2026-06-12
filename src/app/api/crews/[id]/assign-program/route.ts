import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

const writeCrewProgramAudit = async (
  supabaseAdminClient: any,
  session: any,
  params: {
    crewId: string
    assignmentId?: string | null
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
    action: 'assign_program' as any,
    resourceType: 'crew',
    resourceId: params.crewId,
    afterData: params.afterData,
    metadata: {
      ...(params.metadata || {}),
      assignment_id: params.assignmentId || null
    }
  })
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })

    const timeZone = 'America/Santiago'
    const localDateKey = (dt: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(dt)
      const map: Record<string, string> = {}
      parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
      return `${map.year}-${map.month}-${map.day}`
    }

    const body = await req.json()
    const crewId = ctx.params.id

    if (!body || (!body.activityId && !body.activity)) {
      return NextResponse.json({ error: 'Missing activity payload' }, { status: 400 })
    }

    // Optionally we can validate crew exists
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const { data: crew, error: crewErr } = await supabaseAdmin.from('pr_crews').select('id,name,work_date').eq('company_id', session.user.companyId).eq('id', crewId).single()
    if (crewErr) return NextResponse.json({ error: 'Crew not found' }, { status: 404 })

    const activityId = body.activityId || (body.activity && body.activity.id)
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

    const { data: activity, error: activityErr } = await supabaseAdmin
      .from('pr_program')
      .select('id')
      .eq('company_id', session.user.companyId)
      .eq('id', activityId)
      .maybeSingle()
    if (activityErr) return NextResponse.json({ error: activityErr.message }, { status: 500 })
    if (!activity) return NextResponse.json({ error: 'Activity not found for current company' }, { status: 404 })

    const workDate = typeof body.workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.workDate)
      ? body.workDate
      : (crew as any)?.work_date || localDateKey(new Date())

    // Avoid duplicates if already assigned
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('pr_crew_activities')
      .select('id, activity_id, created_at')
      .eq('company_id', session.user.companyId)
      .eq('crew_id', crewId)
      .eq('activity_id', activityId)
      .eq('work_date', workDate)
      .maybeSingle()

    if (existingErr && String(existingErr.code) !== 'PGRST116') {
      return NextResponse.json({ error: existingErr.message }, { status: 500 })
    }

    if (existing) {
      await writeCrewProgramAudit(supabaseAdmin, session, {
        crewId,
        assignmentId: existing?.id ? String(existing.id) : null,
        afterData: { crew, assigned: existing },
        metadata: {
          activity_id: activityId,
          work_date: workDate,
          existing: true,
          assigned_count: 1,
          crew_name: crew?.name ?? null
        }
      })
      return NextResponse.json({ success: true, crew, assigned: existing })
    }

    let nextDisplayOrder = 1
    try {
      const { data: lastByOrder, error: lastByOrderErr } = await supabaseAdmin
        .from('pr_crew_activities')
        .select('display_order')
        .eq('company_id', session.user.companyId)
        .eq('crew_id', crewId)
        .eq('work_date', workDate)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!lastByOrderErr) {
        const n = Number(lastByOrder?.display_order)
        if (Number.isFinite(n) && n > 0) nextDisplayOrder = n + 1
      }
    } catch {
      // Compatibility: if display_order doesn't exist yet, fallback insert below.
    }

    let inserted: any = null
    let insertErr: any = null
    const insertWithOrder = await supabaseAdmin
      .from('pr_crew_activities')
      .insert({ company_id: session.user.companyId, crew_id: crewId, activity_id: activityId, work_date: workDate, display_order: nextDisplayOrder })
      .select('id, activity_id, created_at, display_order')
      .single()
    inserted = insertWithOrder.data
    insertErr = insertWithOrder.error

    if (insertErr && (
      String(insertErr?.message || '').includes("Could not find the 'display_order' column") ||
      String(insertErr?.message || '').includes('column "display_order" does not exist')
    )) {
      const legacyInsert = await supabaseAdmin
        .from('pr_crew_activities')
        .insert({ company_id: session.user.companyId, crew_id: crewId, activity_id: activityId, work_date: workDate })
        .select('id, activity_id, created_at')
        .single()
      inserted = legacyInsert.data
      insertErr = legacyInsert.error
    }

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    await writeCrewProgramAudit(supabaseAdmin, session, {
      crewId,
      assignmentId: inserted?.id ? String(inserted.id) : null,
      afterData: { crew, assigned: inserted },
      metadata: {
        activity_id: activityId,
        work_date: workDate,
        existing: false,
        assigned_count: inserted ? 1 : 0,
        crew_name: crew?.name ?? null
      }
    })

    return NextResponse.json({ success: true, crew, assigned: inserted })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
