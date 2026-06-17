import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveCurrentActor } from '@/lib/currentActor'
import { isValidYmdDate } from '@/lib/staffing/validateStaffingPayload'
import { fetchAvailableCollaborators } from '@/lib/staffing/availableCollaborators'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()

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

    const workDate = clean(req.nextUrl.searchParams.get('date'))
    if (!workDate) return NextResponse.json({ error: 'date requerido' }, { status: 400 })
    if (!isValidYmdDate(workDate)) {
      return NextResponse.json({ error: 'date debe usar formato YYYY-MM-DD' }, { status: 400 })
    }

    const requestedProjectId = clean(req.nextUrl.searchParams.get('project_id'))
    const { projectId, error: projectScopeError } = resolveProjectId({
      requestedProjectId,
      actorProjectId: actor?.projectId,
      sessionProjectId: session?.user?.projectId,
    })
    if (projectScopeError) return projectScopeError

    const projectCompanyError = await validateProjectInCompany(projectId, companyId)
    if (projectCompanyError) return projectCompanyError

    const collaborators = await fetchAvailableCollaborators({
      supabaseAdmin,
      companyId,
      workDate,
    })

    return NextResponse.json({
      collaborators,
      date: workDate,
      company_id: companyId,
      project_id: projectId || null,
      availability_scope: 'company',
      project_filter_applied: false,
      note: 'La disponibilidad se calcula por empresa y fecha; el modelo actual no tiene filtro real por proyecto.',
      rule: {
        status: 'turno',
        reason: '11',
      },
    })
  } catch (err) {
    console.error('Error GET /api/staffing-activities/available-collaborators', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
