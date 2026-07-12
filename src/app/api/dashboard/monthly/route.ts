import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const normalizeDateKey = (value: string) => String(value || '').slice(0, 10)

const getChileMonthRange = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const year = Number(values.get('year'))
  const month = Number(values.get('month'))
  const today = `${values.get('year')}-${values.get('month')}-${values.get('day')}`
  const start = `${values.get('year')}-${values.get('month')}-01`
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const elapsedDays = Math.max(1, Number(values.get('day') || 1))
  return { start, end, today, elapsedDays }
}

const countRows = async (query: any) => {
  const { count, error } = await query
  if (error) return 0
  return Number(count || 0)
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions) as any

    const userRole = session?.user?.role
    const isDev = userRole === 'dev'
    const companyId = String(session?.user?.companyId || '').trim()

    if (!isDev && !companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const userSpecialty = session?.user?.specialty
    const isAdmin = ['admin', 'hr_manager', 'supervisor', 'dev'].includes(userRole)
    const { start, today, elapsedDays } = getChileMonthRange()

    let collaboratorsQuery = supabaseAdmin
      .from('pr_collaborators')
      .select('id')
      .eq('is_active', true)

    if (companyId) collaboratorsQuery = collaboratorsQuery.eq('company_id', companyId)
    if (!isAdmin && userSpecialty) collaboratorsQuery = collaboratorsQuery.eq('specialty', userSpecialty)

    const { data: collaborators } = await collaboratorsQuery
    const collaboratorIds = (collaborators || []).map((c: any) => String(c?.id || '').trim()).filter(Boolean)
    const activeCollaboratorCount = collaboratorIds.length

    let presentStatusCount = 0
    if (collaboratorIds.length > 0) {
      let presentQuery = supabaseAdmin
        .from('pr_collaborator_daily_status')
        .select('id', { count: 'exact', head: true })
        .gte('work_date', start)
        .lte('work_date', today)
        .in('collaborator_id', collaboratorIds)
        .or('status.ilike.turno,status.ilike.presente,reason.eq.11,reason.ilike.turno,reason.ilike.presente')
      if (companyId) presentQuery = presentQuery.eq('company_id', companyId)
      presentStatusCount = await countRows(presentQuery)
    }

    let fieldReportsQuery = supabaseAdmin
      .from('pr_field_reports')
      .select('id', { count: 'exact', head: true })
      .gte('report_date', start)
      .lte('report_date', today)
    if (companyId) fieldReportsQuery = fieldReportsQuery.eq('company_id', companyId)

    let dailyReportsQuery = supabaseAdmin
      .from('pr_daily_reports')
      .select('id', { count: 'exact', head: true })
      .gte('report_date', start)
      .lte('report_date', today)
    if (companyId) dailyReportsQuery = dailyReportsQuery.eq('company_id', companyId)

    let crewActivitiesQuery = supabaseAdmin
      .from('pr_crew_activities')
      .select('crew_id')
      .gte('work_date', start)
      .lte('work_date', today)
    if (companyId) crewActivitiesQuery = crewActivitiesQuery.eq('company_id', companyId)

    const [fieldReportsThisMonth, dailyReportsThisMonth, crewActivitiesResult] = await Promise.all([
      countRows(fieldReportsQuery),
      countRows(dailyReportsQuery),
      crewActivitiesQuery,
    ])

    const activeCrewIdsThisMonth = Array.from(
      new Set((crewActivitiesResult.data || []).map((row: any) => String(row?.crew_id || '').trim()).filter(Boolean))
    ).length

    const possibleAttendanceRecords = activeCollaboratorCount * elapsedDays
    const averageAttendance = possibleAttendanceRecords > 0
      ? Math.round((presentStatusCount / possibleAttendanceRecords) * 1000) / 10
      : 0

    return NextResponse.json({
      averageAttendance,
      fieldReportsThisMonth,
      dailyReportsThisMonth,
      activeCrewIdsThisMonth,
      activeCollaboratorCount,
      monthStart: normalizeDateKey(start),
      monthEnd: normalizeDateKey(today),
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
