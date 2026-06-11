import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export async function GET() {
  try {
    const session = (await getServerSession(authOptions)) as any

    const userRole = session?.user?.role
    const isDev = userRole === 'dev'
    const companyId = session?.user?.companyId

    if (!isDev && !companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const userSpecialty = session.user.specialty

    // Determinar si el usuario es admin (ve todo sin filtros)
    const isAdmin = ['admin', 'hr_manager', 'supervisor', 'dev'].includes(userRole)

    // Intentar obtener departamentos reales y contar colaboradores por departamento
    try {
      let departmentsQuery = supabaseAdmin
        .from('pr_departments')
        .select('id, name')
      if (companyId) {
        departmentsQuery = departmentsQuery.eq('company_id', companyId)
      }
      const { data: departments, error: departmentsError } = await departmentsQuery

      if (!departmentsError && departments && departments.length > 0) {
        // Obtener colaboradores filtrados por specialty (solo activos)
        let collaboratorsQuery = supabaseAdmin
          .from('pr_collaborators')
          .select('id, user_id, specialty, is_active')
          .eq('is_active', true)
        if (companyId) {
          collaboratorsQuery = collaboratorsQuery.eq('company_id', companyId)
        }

        // Si NO es admin y tiene specialty, filtrar por specialty
        if (!isAdmin && userSpecialty) {
          collaboratorsQuery = collaboratorsQuery.eq('specialty', userSpecialty)
        }

        const { data: collaborators } = await collaboratorsQuery

        // Obtener pr_users para obtener department_id
        const collaboratorUserIds = (collaborators || []).map((c: any) => c.user_id).filter(Boolean)
        const counts: Record<string, number> = {}

        if (collaboratorUserIds.length > 0) {
          const { data: users } = await supabaseAdmin
            .from('pr_users')
            .select('id, department_id')
            .in('id', collaboratorUserIds)

          const usersList = (users || []) as any[]
          usersList.forEach(u => {
            if (u && u.department_id) {
              counts[u.department_id] = (counts[u.department_id] || 0) + 1
            }
          })
        }

        const realDepartmentStats = departments.map(dept => ({
          id: dept.id,
          name: dept.name,
          collaboratorCount: counts[dept.id] || 0
        }))

        return NextResponse.json(realDepartmentStats)
      }
    } catch {
      // table may not exist
    }

    // Si no hay tabla de departamentos, retornar array vacío (mejor que datos ficticios)
    return NextResponse.json([])
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
