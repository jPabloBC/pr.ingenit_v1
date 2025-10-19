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

    // Obtener estadísticas del mes actual
    const currentDate = new Date()
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    // Calcular asistencia promedio del mes
    const { data: monthlyAttendance, error: attendanceError } = await supabase
      .from('pr_attendance')
      .select('user_id, status, date')
      .eq('company_id', companyId)
      .gte('date', startOfMonth.toISOString().split('T')[0])
      .lte('date', endOfMonth.toISOString().split('T')[0])

    if (attendanceError) {
      console.error('Error fetching monthly attendance:', attendanceError)
    }

    // Calcular estadísticas
    const totalDays = Math.ceil((endOfMonth.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24))
    const presentDays = monthlyAttendance?.filter(att => att.status === 'present').length || 0
    const totalPossibleDays = monthlyAttendance?.length || 1
    const attendanceRate = totalPossibleDays > 0 ? (presentDays / totalPossibleDays) * 100 : 0

    // Obtener colaboradores activos para calcular promedio (excluyendo usuarios administrativos)
    const { data: activeCollaborators, error: collaboratorsError } = await supabase
      .from('pr_users')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .not('role', 'in', '(admin,hr_manager,supervisor)')

    if (collaboratorsError) {
      console.error('Error fetching active collaborators:', collaboratorsError)
    }

    const activeCollaboratorCount = activeCollaborators?.length || 1
    const averageAttendance = activeCollaboratorCount > 0 ? (presentDays / (activeCollaboratorCount * totalDays)) * 100 : 0

    // Simular horas extra (por ahora)
    const averageOvertime = 2.4

    // Contar incidentes del mes (simulado)
    const incidents = 3

    // Calcular EPP en uso
    const { data: totalEPP, error: totalEPPError } = await supabase
      .from('pr_epp')
      .select('id')
      .eq('company_id', companyId)

    const { data: assignedEPP, error: assignedEPPError } = await supabase
      .from('pr_epp_assignments')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'active')

    const eppUsageRate = totalEPP && totalEPP.length > 0 
      ? ((assignedEPP?.length || 0) / totalEPP.length) * 100 
      : 0

    const monthlyStats = {
      averageAttendance: Math.round(averageAttendance * 10) / 10,
      averageOvertime,
      incidents,
      eppUsageRate: Math.round(eppUsageRate)
    }

    return NextResponse.json(monthlyStats)
  } catch (error) {
    console.error('Error in dashboard monthly stats:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
