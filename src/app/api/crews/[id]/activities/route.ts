import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

const writeCrewActivityAudit = async (
  supabaseAdminClient: any,
  session: any,
  params: {
    action: string
    resourceId?: string | null
    crewId?: string | null
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
    resourceType: 'crew_activity',
    resourceId: params.resourceId || null,
    beforeData: params.beforeData,
    afterData: params.afterData,
    metadata: {
      ...(params.metadata || {}),
      crew_id: params.crewId || null
    }
  })
}

export async function GET(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    const crewId = ctx.params.id

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const datesOnly = searchParams.get('dates') === '1' || searchParams.get('dates') === 'true'
    const timeZone = 'America/Santiago'
    const getTimeZoneOffsetMs = (dt: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(dt)
      const map: Record<string, string> = {}
      parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
      const asUTC = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour),
        Number(map.minute),
        Number(map.second)
      )
      return asUTC - dt.getTime()
    }
    const startOfDayUtc = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number)
      const utcDate = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0))
      const offset = getTimeZoneOffsetMs(utcDate)
      return new Date(utcDate.getTime() - offset)
    }

    if (datesOnly) {
      const { data: assignedDates, error: assignedDatesErr } = await supabaseAdmin
        .from('pr_crew_activities')
        .select('created_at')
        .eq('company_id', session.user.companyId)
        .eq('crew_id', crewId)
        .order('created_at', { ascending: false })

      if (assignedDatesErr) return NextResponse.json({ error: assignedDatesErr.message }, { status: 500 })

      const uniq = new Set<string>()
      ;(assignedDates || []).forEach((row: any) => {
        if (!row?.created_at) return
        const key = new Date(row.created_at).toISOString().slice(0, 10)
        uniq.add(key)
      })

      return NextResponse.json({ dates: Array.from(uniq) })
    }

    const fetchAssigned = async (withUserDetail: boolean, withDisplayOrder: boolean) => {
      const selectParts = ['id', 'activity_id', 'created_at', 'work_date']
      if (withUserDetail) selectParts.push('user_detail')
      if (withDisplayOrder) selectParts.push('display_order')
      let q = supabaseAdmin
        .from('pr_crew_activities')
        .select(selectParts.join(', '))
        .eq('company_id', session.user.companyId)
        .eq('crew_id', crewId)
        .order('created_at', { ascending: true })

      if (date) q = q.eq('work_date', date)
      return q
    }

    let assignedHasDisplayOrder = true
    let assignedRaw: any[] | null = null
    let assignedErr: any = null
    {
      const attempts: Array<{ withUserDetail: boolean; withDisplayOrder: boolean }> = [
        { withUserDetail: true, withDisplayOrder: true },
        { withUserDetail: false, withDisplayOrder: true },
        { withUserDetail: true, withDisplayOrder: false },
        { withUserDetail: false, withDisplayOrder: false }
      ]
      for (const a of attempts) {
        const r = await fetchAssigned(a.withUserDetail, a.withDisplayOrder)
        if (!r.error) {
          assignedRaw = r.data || []
          assignedErr = null
          assignedHasDisplayOrder = a.withDisplayOrder
          break
        }
        assignedErr = r.error
      }
    }

    if (assignedErr) return NextResponse.json({ error: assignedErr.message }, { status: 500 })

    let assigned = assignedRaw || []
    if (date) {
      const start = startOfDayUtc(date)
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + 1)
      const fetchFallback = async (withUserDetail: boolean, withDisplayOrder: boolean) => {
        const selectParts = ['id', 'activity_id', 'created_at', 'work_date']
        if (withUserDetail) selectParts.push('user_detail')
        if (withDisplayOrder) selectParts.push('display_order')
        return supabaseAdmin
        .from('pr_crew_activities')
        .select(selectParts.join(', '))
        .eq('company_id', session.user.companyId)
        .eq('crew_id', crewId)
        .is('work_date', null)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
      }

      let assignedFallback: any[] | null = null
      let assignedFallbackErr: any = null
      {
        const attempts: Array<{ withUserDetail: boolean; withDisplayOrder: boolean }> = [
          { withUserDetail: true, withDisplayOrder: assignedHasDisplayOrder },
          { withUserDetail: false, withDisplayOrder: assignedHasDisplayOrder },
          { withUserDetail: true, withDisplayOrder: false },
          { withUserDetail: false, withDisplayOrder: false }
        ]
        for (const a of attempts) {
          const r = await fetchFallback(a.withUserDetail, a.withDisplayOrder)
          if (!r.error) {
            assignedFallback = r.data || []
            assignedFallbackErr = null
            assignedHasDisplayOrder = a.withDisplayOrder
            break
          }
          assignedFallbackErr = r.error
        }
      }
      if (assignedFallbackErr) return NextResponse.json({ error: assignedFallbackErr.message }, { status: 500 })
      assigned = [...assigned, ...(assignedFallback || [])]
    }

    const orderedAssigned = (assigned || [])
      .slice()
      .sort((a: any, b: any) => {
        const ao = Number(a?.display_order)
        const bo = Number(b?.display_order)
        const aHas = Number.isFinite(ao)
        const bHas = Number.isFinite(bo)
        if (aHas && bHas && ao !== bo) return ao - bo
        if (aHas && !bHas) return -1
        if (!aHas && bHas) return 1
        return String(a?.created_at || '').localeCompare(String(b?.created_at || ''))
      })

    const activityIds = orderedAssigned.map((a: any) => a.activity_id).filter(Boolean)
    if (activityIds.length === 0) {
      return NextResponse.json({ activities: [], assigned: [] })
    }

    let activitiesQuery = supabaseAdmin
      .from('pr_program')
      .select('*')
      .eq('company_id', session.user.companyId)
      .in('id', activityIds)

    const { data: activities, error: activitiesErr } = await activitiesQuery

    if (activitiesErr) return NextResponse.json({ error: activitiesErr.message }, { status: 500 })

    const activityMap = new Map((activities || []).map((a: any) => [String(a.id), a]))
    const withAssignedAt = orderedAssigned
      .map((as: any, idx: number) => {
        const activity = activityMap.get(String(as.activity_id))
        if (!activity) return null
        return {
          ...activity,
          assigned_at: as.created_at || null,
          user_detail: as.user_detail ?? null,
          assignment_id: as.id || null,
          display_order: Number.isFinite(Number(as.display_order)) ? Number(as.display_order) : idx + 1
        }
      })
      .filter(Boolean)

    return NextResponse.json({ activities: withAssignedAt, assigned: orderedAssigned || [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })

    const body = await req.json()
    const assignmentId = String(body?.assignmentId || '').trim()
    const activityId = body?.activityId
    if (!assignmentId && !activityId) return NextResponse.json({ error: 'Missing activityId or assignmentId' }, { status: 400 })
    const workDate = typeof body?.workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.workDate)
      ? body.workDate
      : null

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    const crewId = ctx.params.id

    let beforeRows: any[] = []
    try {
      let beforeQuery = supabaseAdmin
        .from('pr_crew_activities')
        .select('*')
        .eq('company_id', session.user.companyId)
        .eq('crew_id', crewId)
      if (assignmentId) beforeQuery = beforeQuery.eq('id', assignmentId)
      else beforeQuery = beforeQuery.eq('activity_id', activityId)
      if (workDate) beforeQuery = beforeQuery.eq('work_date', workDate)
      const { data: rows } = await beforeQuery
      beforeRows = rows || []
    } catch {
      beforeRows = []
    }

    let del = supabaseAdmin
      .from('pr_crew_activities')
      .delete()
      .eq('company_id', session.user.companyId)
      .eq('crew_id', crewId)
      .eq('activity_id', activityId)

    if (workDate) del = del.eq('work_date', workDate)

    const { error } = await del

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeCrewActivityAudit(supabaseAdmin, session, {
      action: 'delete_activity',
      resourceId: assignmentId || String(activityId || ''),
      crewId,
      beforeData: beforeRows,
      metadata: {
        assignment_id: assignmentId || null,
        activity_id: activityId || null,
        work_date: workDate,
        deleted_count: beforeRows.length
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })

    const body = await req.json()
    const hasOrdersPayload = Array.isArray(body?.orders)
    if (hasOrdersPayload) {
      const workDate = typeof body?.workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.workDate)
        ? body.workDate
        : null
      if (!workDate) return NextResponse.json({ error: 'Missing or invalid workDate for reorder' }, { status: 400 })
      const orders = (body.orders as any[])
        .map((o: any) => ({
          assignmentId: String(o?.assignmentId || '').trim(),
          activityId: String(o?.activityId || '').trim(),
          display_order: Number(o?.display_order)
        }))
        .filter((o) => (o.assignmentId || o.activityId) && Number.isFinite(o.display_order) && o.display_order > 0)

      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

      const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
      const crewId = ctx.params.id

      let beforeRows: any[] = []
      try {
        const assignmentIds = orders.map((row) => row.assignmentId).filter(Boolean)
        const activityIds = orders.map((row) => row.activityId).filter(Boolean)
        let beforeQuery = supabaseAdmin
          .from('pr_crew_activities')
          .select('*')
          .eq('company_id', session.user.companyId)
          .eq('crew_id', crewId)
          .eq('work_date', workDate)
        if (assignmentIds.length > 0) beforeQuery = beforeQuery.in('id', assignmentIds)
        else if (activityIds.length > 0) beforeQuery = beforeQuery.in('activity_id', activityIds)
        const { data: rows } = await beforeQuery
        beforeRows = rows || []
      } catch {
        beforeRows = []
      }

      let missingDisplayOrderColumn = false
      for (const row of orders) {
        let q = supabaseAdmin
          .from('pr_crew_activities')
          .update({ display_order: row.display_order })
          .eq('company_id', session.user.companyId)
          .eq('crew_id', crewId)
        if (row.assignmentId) q = q.eq('id', row.assignmentId)
        else q = q.eq('work_date', workDate).eq('activity_id', row.activityId)
        const { error } = await q
        if (error && (
          String((error as any)?.message || '').includes("Could not find the 'display_order' column") ||
          String((error as any)?.message || '').includes('column "display_order" does not exist')
        )) {
          missingDisplayOrderColumn = true
          break
        }
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (missingDisplayOrderColumn) {
        return NextResponse.json(
          { error: 'Falta la columna pr_crew_activities.display_order para guardar el orden de actividades.' },
          { status: 500 }
        )
      }

      let afterRows: any[] = []
      try {
        const assignmentIds = orders.map((row) => row.assignmentId).filter(Boolean)
        const activityIds = orders.map((row) => row.activityId).filter(Boolean)
        let afterQuery = supabaseAdmin
          .from('pr_crew_activities')
          .select('*')
          .eq('company_id', session.user.companyId)
          .eq('crew_id', crewId)
          .eq('work_date', workDate)
        if (assignmentIds.length > 0) afterQuery = afterQuery.in('id', assignmentIds)
        else if (activityIds.length > 0) afterQuery = afterQuery.in('activity_id', activityIds)
        const { data: rows } = await afterQuery
        afterRows = rows || []
      } catch {
        afterRows = []
      }

      await writeCrewActivityAudit(supabaseAdmin, session, {
        action: 'update_activity',
        resourceId: String(crewId),
        crewId,
        beforeData: beforeRows,
        afterData: afterRows,
        metadata: {
          mode: 'reorder',
          work_date: workDate,
          order_count: orders.length
        }
      })

      return NextResponse.json({ ok: true })
    }

    const assignmentId = String(body?.assignmentId || '').trim()
    const activityId = String(body?.activityId || '').trim()
    if (!assignmentId && !activityId) {
      return NextResponse.json({ error: 'Missing activityId or assignmentId' }, { status: 400 })
    }
    const workDate = typeof body?.workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.workDate)
      ? body.workDate
      : null
    const userDetail = body?.user_detail == null ? null : String(body.user_detail)

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    const crewId = ctx.params.id

    let beforeRows: any[] = []
    try {
      let beforeQuery = supabaseAdmin
        .from('pr_crew_activities')
        .select('*')
        .eq('company_id', session.user.companyId)
        .eq('crew_id', crewId)
      if (assignmentId) beforeQuery = beforeQuery.eq('id', assignmentId)
      else beforeQuery = beforeQuery.eq('activity_id', activityId)
      if (workDate) beforeQuery = beforeQuery.eq('work_date', workDate)
      const { data: rows } = await beforeQuery
      beforeRows = rows || []
    } catch {
      beforeRows = []
    }

    let upd = supabaseAdmin
      .from('pr_crew_activities')
      .update({ user_detail: userDetail })
      .eq('company_id', session.user.companyId)
      .eq('crew_id', crewId)
    if (assignmentId) upd = upd.eq('id', assignmentId)
    else upd = upd.eq('activity_id', activityId)

    if (workDate) upd = upd.eq('work_date', workDate)
    const { error } = await upd

    // If column is not migrated yet, do not block field report saving flow
    if (error && (
      String((error as any)?.message || '').includes("Could not find the 'user_detail' column") ||
      String((error as any)?.message || '').includes('column "user_detail" does not exist')
    )) {
      await writeCrewActivityAudit(supabaseAdmin, session, {
        action: 'update_activity',
        resourceId: assignmentId || activityId || null,
        crewId,
        beforeData: beforeRows,
        metadata: {
          assignment_id: assignmentId || null,
          activity_id: activityId || null,
          work_date: workDate,
          skipped: 'user_detail column missing'
        }
      })
      return NextResponse.json({ ok: true, skipped: 'user_detail column missing' })
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    let afterRows: any[] = []
    try {
      let afterQuery = supabaseAdmin
        .from('pr_crew_activities')
        .select('*')
        .eq('company_id', session.user.companyId)
        .eq('crew_id', crewId)
      if (assignmentId) afterQuery = afterQuery.eq('id', assignmentId)
      else afterQuery = afterQuery.eq('activity_id', activityId)
      if (workDate) afterQuery = afterQuery.eq('work_date', workDate)
      const { data: rows } = await afterQuery
      afterRows = rows || []
    } catch {
      afterRows = []
    }

    await writeCrewActivityAudit(supabaseAdmin, session, {
      action: 'update_activity',
      resourceId: assignmentId || activityId || null,
      crewId,
      beforeData: beforeRows,
      afterData: afterRows,
      metadata: {
        assignment_id: assignmentId || null,
        activity_id: activityId || null,
        work_date: workDate,
        mode: 'user_detail'
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
