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

    // Obtener colaboradores de pr_collaborators (incluyendo is_active)
    let collaboratorsQuery = supabaseAdmin
      .from('pr_collaborators')
      .select('id, user_id, specialty, is_active')
    if (companyId) {
      collaboratorsQuery = collaboratorsQuery.eq('company_id', companyId)
    }

    // Si NO es admin y tiene specialty, filtrar por specialty
    if (!isAdmin && userSpecialty) {
      collaboratorsQuery = collaboratorsQuery.eq('specialty', userSpecialty)
    }

    const { data: collaborators, error: collaboratorsError } = await collaboratorsQuery

    if (collaboratorsError) {
      return NextResponse.json({ error: 'Error al obtener colaboradores' }, { status: 500 })
    }

    const totalCollaborators = collaborators?.length || 0

    // Contar colaboradores activos directamente de pr_collaborators
    const activeCollaborators = (collaborators || []).filter((c: any) => c.is_active === true).length

    // Para admin: calcular desglose por disciplina
    let specialtyBreakdown: { specialty: string; total: number; active: number }[] = []
    if (isAdmin && collaborators) {
      const specialtyMap = new Map<string, { total: number; active: number }>()

      collaborators.forEach((c: any) => {
        const spec = c.specialty || 'Sin asignar'
        const current = specialtyMap.get(spec) || { total: 0, active: 0 }
        current.total += 1
        if (c.is_active === true) {
          current.active += 1
        }
        specialtyMap.set(spec, current)
      })

      specialtyBreakdown = Array.from(specialtyMap.entries())
        .map(([specialty, counts]) => ({
          specialty,
          total: counts.total,
          active: counts.active
        }))
        .sort((a, b) => b.total - a.total) // Ordenar por total descendente
    }

    // Obtener asistencia de hoy (filtrada por colaboradores permitidos)
    const today = new Date().toISOString().split('T')[0]
    const collaboratorIds = (collaborators || []).map((c: any) => c.id).filter(Boolean)

    let presentToday = 0
    if (collaboratorIds.length > 0) {
      const { data: attendance } = await supabaseAdmin
        .from('pr_attendance')
        .select('collaborator_id, status')
        .eq('date', today)
        .in('collaborator_id', collaboratorIds)

      presentToday = attendance?.filter(att => att.status === 'present').length || 0
    }

    const absentToday = activeCollaborators - presentToday

    // Obtener EPP vencidos
    // Para filtrar por specialty, necesitamos ver EPP asignados a colaboradores filtrados
    let expiredEPP = 0

    if (collaboratorIds.length > 0) {
      try {
        // Intentar obtener EPP asignados a estos colaboradores
        const { data: eppAssignments, error: eppAssignError } = await supabaseAdmin
          .from('pr_epp_assignments')
          .select('epp_id')
          .in('collaborator_id', collaboratorIds)
          .eq('status', 'active')

        if (!eppAssignError && eppAssignments && eppAssignments.length > 0) {
          const eppIds = eppAssignments.map((a: any) => a.epp_id).filter(Boolean)

          const { data: epp, error: eppError } = await supabaseAdmin
            .from('pr_epp')
            .select('id, expiry_date')
            .in('id', eppIds)
            .lt('expiry_date', new Date().toISOString())

          if (!eppError) {
            expiredEPP = epp?.length || 0
          }
        }
      } catch {
        // ignore EPP errors
      }
    }

    // Obtener nóminas pendientes (simulado por ahora)
    let payrollQuery = supabaseAdmin
      .from('pr_payroll')
      .select('id, status')
      .eq('status', 'pending')
    if (companyId) {
      payrollQuery = payrollQuery.eq('company_id', companyId)
    }
    const { data: payroll } = await payrollQuery

    const pendingPayroll = payroll?.length || 0

    const stats: any = {
      totalCollaborators,
      activeCollaborators,
      presentToday,
      absentToday,
      expiredEPP,
      pendingPayroll
    }

    // Incluir desglose por disciplina solo para admin
    if (isAdmin && specialtyBreakdown.length > 0) {
      stats.specialtyBreakdown = specialtyBreakdown
    }

    // Debug log server-side
    return NextResponse.json(stats)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
