import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const companyId = session.user.companyId

    // Por ahora, retornar datos simulados hasta que se configure la tabla pr_departments
    // TODO: Implementar cuando la tabla pr_departments esté disponible
    const departmentStats = [
      { id: '1', name: 'Administración', collaboratorCount: 5 },
      { id: '2', name: 'Operaciones', collaboratorCount: 15 },
      { id: '3', name: 'Mantenimiento', collaboratorCount: 8 },
      { id: '4', name: 'Seguridad', collaboratorCount: 6 }
    ]

    // Intentar obtener departamentos reales si la tabla existe
    try {
      const { data: departments, error: departmentsError } = await supabase
        .from('pr_departments')
        .select('id, name')
        .eq('company_id', companyId)

      if (!departmentsError && departments) {
        // Si la tabla existe, usar datos reales
        const realDepartmentStats = departments.map(dept => ({
          id: dept.id,
          name: dept.name,
          collaboratorCount: 0 // Por ahora sin conteo
        }))
        return NextResponse.json(realDepartmentStats)
      }
    } catch (tableError) {
      console.log('Tabla pr_departments no disponible, usando datos simulados')
    }

    return NextResponse.json(departmentStats)
  } catch (error) {
    console.error('Error in dashboard departments:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
