import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = String(session.user.id || '')
    const companyId = String(session.user.companyId || '')

    if (!userId) return NextResponse.json({ projects: [] }, { status: 200 })

    // 1) Preferred: explicit user->project assignments
    let assignmentQuery = supabaseAdmin
      .from('pr_project_users')
      .select('project_id, company_id')
      .eq('user_id', userId)

    if (companyId) {
      assignmentQuery = assignmentQuery.eq('company_id', companyId)
    }

    const { data: assignments, error: assignmentError } = await assignmentQuery
    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 })
    }

    const assignedProjectIds = Array.from(
      new Set((assignments || []).map((row: any) => String(row?.project_id || '')).filter(Boolean)),
    )

    if (assignedProjectIds.length === 0) {
      return NextResponse.json({ projects: [] }, { status: 200 })
    }

    let projectsQuery = supabaseAdmin
      .from('pr_projects')
      .select('id, name, company_id, pr_companies(name, logo_url)')
      .in('id', assignedProjectIds)
      .order('name', { ascending: true })

    if (companyId) {
      projectsQuery = projectsQuery.eq('company_id', companyId)
    }

    const { data: projects, error: projectError } = await projectsQuery
    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500 })
    }

    return NextResponse.json({
      projects: (projects || []).map((project: any) => ({
        id: project.id,
        name: project.name,
        company_id: project.company_id,
        company_name: String(project?.pr_companies?.name || '').trim() || null,
        company_logo_url: String(project?.pr_companies?.logo_url || '').trim() || null,
        source: 'assignment',
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
