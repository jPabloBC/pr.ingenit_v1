import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { normalizeText } from '@/lib/normalize'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ crewIds: [] }, { status: 200 })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 })
    const includeActivities = searchParams.get('include') === 'activities'
    const requestedCrewIds = new Set(
      String(searchParams.get('crewIds') || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )

    const timeZone = 'America/Santiago'

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const role = String(session?.user?.role || '').toLowerCase()
    const isAdmin = ['admin', 'dev', 'hr_manager', 'supervisor'].includes(role)
    const userSpec = session?.user?.specialty ? normalizeText(String(session.user.specialty)) : ''

    let crewIds: string[] = []
    if (isAdmin || !userSpec) {
      const { data: crews, error: crewsErr } = await supabaseAdmin
        .from('pr_crews')
        .select('id')
        .eq('company_id', session.user.companyId)
      if (crewsErr) return NextResponse.json({ error: crewsErr.message }, { status: 500 })
      crewIds = (crews || []).map((c: any) => String(c.id)).filter(Boolean)
    } else {
      let crews: any[] = []
      try {
        const { data, error } = await supabaseAdmin
          .from('pr_crews')
          .select('id, specialty, especialidad, discipline')
          .eq('company_id', session.user.companyId)
        if (error) throw error
        crews = data || []
      } catch (e: any) {
        const msg = String(e?.message || e)
        const missingCol = /column\s+.*(especialidad|discipline).*does not exist/i.test(msg) || String(e?.code) === '42703'
        if (!missingCol) return NextResponse.json({ error: msg }, { status: 500 })
        const { data, error } = await supabaseAdmin
          .from('pr_crews')
          .select('id, specialty')
          .eq('company_id', session.user.companyId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        crews = data || []
      }
      crewIds = (crews || [])
        .filter((c: any) => {
          const raw = c.specialty || c.especialidad || c.discipline || ''
          return normalizeText(String(raw)) === userSpec
        })
        .map((c: any) => String(c.id))
        .filter(Boolean)
    }

    if (crewIds.length === 0) return NextResponse.json({ crewIds: [] }, { status: 200 })

    let crews: any[] = []
    try {
      const { data, error } = await supabaseAdmin
        .from('pr_crews')
        .select('id, work_date, created_at')
        .eq('company_id', session.user.companyId)
        .in('id', crewIds)
      if (error) throw error
      crews = data || []
    } catch (e: any) {
      const msg = String(e?.message || e)
      const missingCol = /column\s+.*work_date.*does not exist/i.test(msg) || String(e?.code) === '42703'
      if (!missingCol) return NextResponse.json({ error: msg }, { status: 500 })
      const { data, error } = await supabaseAdmin
        .from('pr_crews')
        .select('id, created_at')
        .eq('company_id', session.user.companyId)
        .in('id', crewIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      crews = (data || []).map((row: any) => ({ ...row, work_date: null }))
    }

    const uniq = new Set<string>()
    ;(crews || []).forEach((row: any) => {
      const id = row?.id ? String(row.id) : ''
      if (!id) return
      if (row?.work_date && String(row.work_date) === date) {
        uniq.add(id)
        return
      }
      if (!row?.work_date && row?.created_at) {
        const createdKey = (() => {
          try {
            const parts = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/Santiago',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).formatToParts(new Date(row.created_at))
            const map: Record<string, string> = {}
            parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
            return `${map.year}-${map.month}-${map.day}`
          } catch {
            return new Date(row.created_at).toISOString().slice(0, 10)
          }
        })()
        if (createdKey === date) uniq.add(id)
      }
    })

    let availableCrewIds = Array.from(uniq)
    if (requestedCrewIds.size > 0) {
      availableCrewIds = availableCrewIds.filter((id) => requestedCrewIds.has(String(id)))
    }

    if (!includeActivities || availableCrewIds.length === 0) {
      return NextResponse.json({ crewIds: availableCrewIds })
    }

    const fetchAssignments = async (withUserDetail: boolean, withDisplayOrder: boolean, useWorkDate: boolean) => {
      const selectParts = ['id', 'crew_id', 'activity_id', 'created_at', 'work_date']
      if (withUserDetail) selectParts.push('user_detail')
      if (withDisplayOrder) selectParts.push('display_order')
      let q = supabaseAdmin
        .from('pr_crew_activities')
        .select(selectParts.join(', '))
        .eq('company_id', session.user.companyId)
        .in('crew_id', availableCrewIds)

      if (useWorkDate) q = q.eq('work_date', date)
      else q = q.is('work_date', null)
      return q
    }

    const fetchAssignmentsCompat = async (useWorkDate: boolean) => {
      const attempts: Array<{ withUserDetail: boolean; withDisplayOrder: boolean }> = [
        { withUserDetail: true, withDisplayOrder: true },
        { withUserDetail: false, withDisplayOrder: true },
        { withUserDetail: true, withDisplayOrder: false },
        { withUserDetail: false, withDisplayOrder: false }
      ]
      let lastError: any = null
      for (const attempt of attempts) {
        const result = await fetchAssignments(attempt.withUserDetail, attempt.withDisplayOrder, useWorkDate)
        if (!result.error) return { data: result.data || [], error: null }
        lastError = result.error
      }
      return { data: [], error: lastError }
    }

    const { data: byWorkDate, error: byWorkDateErr } = await fetchAssignmentsCompat(true)
    if (byWorkDateErr) return NextResponse.json({ error: byWorkDateErr.message }, { status: 500 })

    const { data: legacyRows, error: legacyRowsErr } = await fetchAssignmentsCompat(false)
    if (legacyRowsErr) return NextResponse.json({ error: legacyRowsErr.message }, { status: 500 })

    const legacyForDate = (legacyRows || []).filter((row: any) => {
      if (!row?.created_at) return false
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).formatToParts(new Date(row.created_at))
        const map: Record<string, string> = {}
        parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
        return `${map.year}-${map.month}-${map.day}` === date
      } catch {
        return new Date(row.created_at).toISOString().slice(0, 10) === date
      }
    })

    const seenAssignments = new Set<string>()
    const assignments = [...(byWorkDate || []), ...legacyForDate]
      .filter((row: any) => {
        const key = String(row?.id || `${row?.crew_id || ''}::${row?.activity_id || ''}::${row?.created_at || ''}`)
        if (!key || seenAssignments.has(key)) return false
        seenAssignments.add(key)
        return true
      })
      .sort((a: any, b: any) => {
        const crewA = String(a?.crew_id || '')
        const crewB = String(b?.crew_id || '')
        if (crewA !== crewB) return crewA.localeCompare(crewB)
        const orderA = Number(a?.display_order)
        const orderB = Number(b?.display_order)
        const hasOrderA = Number.isFinite(orderA)
        const hasOrderB = Number.isFinite(orderB)
        if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB
        if (hasOrderA && !hasOrderB) return -1
        if (!hasOrderA && hasOrderB) return 1
        return String(a?.created_at || '').localeCompare(String(b?.created_at || ''))
      })

    const activityIds = Array.from(new Set(assignments.map((row: any) => String(row?.activity_id || '')).filter(Boolean)))
    const { data: activities, error: activitiesErr } = activityIds.length > 0
      ? await supabaseAdmin
          .from('pr_program')
          .select('id, company_id, created_at, updated_at, item_id, sub_id, activity, area, discipline, unit, quantity, package, description, observations')
          .eq('company_id', session.user.companyId)
          .in('id', activityIds)
      : { data: [], error: null }
    if (activitiesErr) return NextResponse.json({ error: activitiesErr.message }, { status: 500 })

    const activityMap = new Map((activities || []).map((activity: any) => [String(activity.id), activity]))
    const activitiesByCrew: Record<string, any[]> = {}
    assignments.forEach((assignment: any, idx: number) => {
      const crewId = String(assignment?.crew_id || '')
      const activity = activityMap.get(String(assignment?.activity_id || ''))
      if (!crewId || !activity) return
      if (!activitiesByCrew[crewId]) activitiesByCrew[crewId] = []
      activitiesByCrew[crewId].push({
        ...activity,
        assigned_at: assignment?.created_at || null,
        user_detail: assignment?.user_detail ?? null,
        assignment_id: assignment?.id || null,
        display_order: Number.isFinite(Number(assignment?.display_order))
          ? Number(assignment.display_order)
          : activitiesByCrew[crewId].length + 1,
        work_date: assignment?.work_date || null,
        _global_order: idx
      })
    })

    Object.keys(activitiesByCrew).forEach((crewId) => {
      activitiesByCrew[crewId] = activitiesByCrew[crewId]
        .sort((a: any, b: any) => {
          const orderA = Number(a?.display_order)
          const orderB = Number(b?.display_order)
          if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) return orderA - orderB
          return Number(a?._global_order || 0) - Number(b?._global_order || 0)
        })
        .map(({ _global_order, ...row }: any) => row)
    })

    return NextResponse.json({ crewIds: availableCrewIds, activitiesByCrew })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
