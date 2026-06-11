import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export async function GET() {
  try {
    const session = await getServerSession(authOptions) as any

    const userRole = session?.user?.role
    const isDev = userRole === 'dev'
    const companyId = session?.user?.companyId

    if (!isDev && !companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const userSpecialty = session.user.specialty

    // Determinar si el usuario es admin (ve todo sin filtros)
    const isAdmin = ['admin', 'hr_manager', 'supervisor', 'dev'].includes(userRole)

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
    const collaboratorIds = (collaborators || []).map((c: any) => c.id).filter(Boolean)

    // Obtener estadísticas del mes actual
    const currentDate = new Date()
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    // Calcular asistencia promedio del mes (filtrado por colaboradores)
    let monthlyAttendance: any[] = []
    if (collaboratorIds.length > 0) {
      const { data: attendance } = await supabaseAdmin
        .from('pr_attendance')
        .select('collaborator_id, status, date')
        .in('collaborator_id', collaboratorIds)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])

      monthlyAttendance = attendance || []
    }

    // Calcular estadísticas
    const totalDays = Math.ceil((endOfMonth.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24))
    const presentDays = monthlyAttendance.filter(att => att.status === 'present').length || 0
    const totalPossibleDays = monthlyAttendance.length || 1

    // Los colaboradores ya están filtrados por is_active=true
    const activeCollaboratorCount = collaboratorIds.length

    const averageAttendance = activeCollaboratorCount > 0 ? (presentDays / (activeCollaboratorCount * totalDays)) * 100 : 0

    // Intentar calcular horas extra promedio si existe la columna correspondiente (filtrado)
    let averageOvertime = 0
    if (collaboratorIds.length > 0) {
      try {
        const { data: overtimeRecords, error: overtimeError } = await supabaseAdmin
          .from('pr_attendance')
          .select('overtime_hours')
          .in('collaborator_id', collaboratorIds)
          .gte('date', startOfMonth.toISOString().split('T')[0])
          .lte('date', endOfMonth.toISOString().split('T')[0])

        if (!overtimeError && overtimeRecords && overtimeRecords.length > 0) {
          const totalOvertime = overtimeRecords.reduce((sum: number, r: any) => sum + (Number(r.overtime_hours) || 0), 0)
          averageOvertime = Math.round((totalOvertime / (overtimeRecords.length || 1)) * 10) / 10
        }
      } catch {
        // ignore overtime errors
      }
    }

    // Contar incidentes del mes si existe la tabla `pr_incidents`
    let incidents = 0
    try {
      let incidentsQuery = supabaseAdmin
        .from('pr_incidents')
        .select('id')
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])
      if (companyId) {
        incidentsQuery = incidentsQuery.eq('company_id', companyId)
      }
      const { data: incidentRecords, error: incidentsError } = await incidentsQuery

      if (!incidentsError && incidentRecords) {
        incidents = incidentRecords.length
      }
    } catch {
      // table may not exist
    }

    // Calcular EPP en uso (filtrado por colaboradores)
    let eppUsageRate = 0
    if (collaboratorIds.length > 0) {
      try {
        // Obtener EPP asignados a estos colaboradores
        const { data: assignedEPP, error: assignedEPPError } = await supabaseAdmin
          .from('pr_epp_assignments')
          .select('epp_id')
          .in('collaborator_id', collaboratorIds)
          .eq('status', 'active')

        if (!assignedEPPError && assignedEPP && assignedEPP.length > 0) {
          const eppIds = assignedEPP.map((a: any) => a.epp_id).filter(Boolean)

          // Obtener total de EPP para estos colaboradores
          let totalEppQuery = supabaseAdmin
            .from('pr_epp')
            .select('id')
          if (companyId) {
            totalEppQuery = totalEppQuery.eq('company_id', companyId)
          }
          const { data: totalEPP, error: totalEPPError } = await totalEppQuery

          if (!totalEPPError && totalEPP && totalEPP.length > 0) {
            eppUsageRate = ((eppIds.length || 0) / totalEPP.length) * 100
          }
        }
      } catch {
        // ignore EPP errors
      }
    }

    const monthlyStats = {
      averageAttendance: Math.round(averageAttendance * 10) / 10,
      averageOvertime,
      incidents,
      eppUsageRate: Math.round(eppUsageRate)
    }

    return NextResponse.json(monthlyStats)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
