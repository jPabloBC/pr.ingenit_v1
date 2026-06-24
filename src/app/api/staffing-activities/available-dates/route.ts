import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveCurrentActor } from '@/lib/currentActor'
import { resolveTurnoSourceDate, todayYmd } from '@/lib/staffing/availableCollaborators'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()

const isValidYearMonth = (year: number, month: number) =>
  Number.isInteger(year) && Number.isInteger(month) && year >= 2000 && year <= 2100 && month >= 1 && month <= 12

const monthDateRange = (year: number, month: number) => {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { startDate, endDate }
}

const resolveProjectId = (params: {
  requestedProjectId?: string | null
  actorProjectId?: string | null
  sessionProjectId?: string | null
}) => {
  const requestedProjectId = clean(params.requestedProjectId)
  const sessionProjectId = clean(params.actorProjectId || params.sessionProjectId)
  if (sessionProjectId && requestedProjectId && requestedProjectId !== sessionProjectId) {
    return {
      projectId: '',
      error: NextResponse.json({ error: 'project_id no coincide con el proyecto de la sesión' }, { status: 403 }),
    }
  }
  return { projectId: sessionProjectId || requestedProjectId || null, error: null }
}

const validateProjectInCompany = async (projectId: string | null, companyId: string) => {
  if (!projectId) return null
  const { data, error } = await supabaseAdmin
    .from('pr_projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.id) {
    return NextResponse.json({ error: 'project_id no pertenece a la empresa de la sesión' }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const actor = await resolveCurrentActor(session)
    const companyId = clean(actor?.companyId || session?.user?.companyId)
    if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

    const year = Number(clean(req.nextUrl.searchParams.get('year')))
    const month = Number(clean(req.nextUrl.searchParams.get('month')))
    if (!isValidYearMonth(year, month)) {
      return NextResponse.json({ error: 'year/month requeridos y deben ser válidos' }, { status: 400 })
    }
    const { startDate, endDate } = monthDateRange(year, month)

    const requestedProjectId = clean(req.nextUrl.searchParams.get('project_id'))
    const { projectId, error: projectScopeError } = resolveProjectId({
      requestedProjectId,
      actorProjectId: actor?.projectId,
      sessionProjectId: session?.user?.projectId,
    })
    if (projectScopeError) return projectScopeError

    const projectCompanyError = await validateProjectInCompany(projectId, companyId)
    if (projectCompanyError) return projectCompanyError

    const today = todayYmd()
    const sourceDate = today >= startDate && today <= endDate
      ? await resolveTurnoSourceDate({
        supabaseAdmin,
        companyId,
        workDate: today,
      })
      : null
    const dates = sourceDate ? [today] : []

    return NextResponse.json({
      dates,
      attendance_source_date: sourceDate,
      year,
      month,
      start_date: startDate,
      end_date: endDate,
      company_id: companyId,
      project_id: projectId || null,
      availability_scope: 'company',
      project_filter_applied: false,
      note: 'La dotación solo se crea para la fecha actual; si hoy no tiene asistencia cargada, se usa la asistencia del día anterior.',
      rule: {
        status: 'turno',
        reason: '11',
        staffing_date: today,
        attendance_source_date: sourceDate,
      },
    })
  } catch (err) {
    console.error('Error GET /api/staffing-activities/available-dates', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
