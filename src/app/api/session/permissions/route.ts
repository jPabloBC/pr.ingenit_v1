import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const companyId = session.user.companyId
    const projectId = (session.user as any)?.projectId || null
    const role = String(session.user.role || '').trim().toLowerCase()

    if (role === 'dev') {
      return NextResponse.json({ permissions: ['*'] })
    }

    const mergedPermissions = new Set<string>()

    // Prefer project-scoped permissions when a project is selected.
    if (projectId) {
      let projectPermsQuery = supabaseAdmin
        .from('pr_project_user_permissions')
        .select('resource_key')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .eq('can_view', true)

      if (companyId) {
        projectPermsQuery = projectPermsQuery.eq('company_id', companyId)
      }

      const { data: projectPerms, error: projectPermsError } = await projectPermsQuery
      if (projectPermsError) {
        return NextResponse.json({ error: projectPermsError.message }, { status: 500 })
      }
      const projectPermissions = (projectPerms || []).map((r: any) => r.resource_key).filter(Boolean)
      projectPermissions.forEach((perm: string) => mergedPermissions.add(perm))
    } else {
      // If no project is selected in session, still include project-scoped permissions
      // for the user's company so permissions assigned from admin PR (ingenit_v2) are honored.
      let projectPermsQuery = supabaseAdmin
        .from('pr_project_user_permissions')
        .select('resource_key')
        .eq('user_id', userId)
        .eq('can_view', true)

      if (companyId) {
        projectPermsQuery = projectPermsQuery.eq('company_id', companyId)
      }

      const { data: anyProjectPerms, error: anyProjectPermsError } = await projectPermsQuery
      if (anyProjectPermsError) {
        return NextResponse.json({ error: anyProjectPermsError.message }, { status: 500 })
      }
      ;(anyProjectPerms || []).forEach((row: any) => {
        const key = String(row?.resource_key || '').trim()
        if (key) mergedPermissions.add(key)
      })
    }

    return NextResponse.json({ permissions: Array.from(mergedPermissions) })
  } catch (err) {
    console.error('Error GET /api/session/permissions:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
