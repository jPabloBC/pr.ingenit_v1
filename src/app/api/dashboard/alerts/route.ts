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

    // Obtener colaboradores filtrados por specialty (incluyendo is_active)
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

    const { data: collaborators } = await collaboratorsQuery
    const collaboratorIds = (collaborators || []).map((c: any) => c.id).filter(Boolean)

    // Separar colaboradores activos e inactivos
    const activeCollaboratorIds = (collaborators || []).filter((c: any) => c.is_active === true).map((c: any) => c.id)
    const inactiveCollaborators = (collaborators || []).filter((c: any) => c.is_active === false)

    const alerts = []

    // Verificar EPP próximos a vencer (próximos 7 días) para colaboradores activos
    if (activeCollaboratorIds.length > 0) {
      const sevenDaysFromNow = new Date()
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

      try {
        // Obtener EPP asignados a estos colaboradores activos
        const { data: eppAssignments, error: eppAssignError } = await supabaseAdmin
          .from('pr_epp_assignments')
          .select('epp_id')
          .in('collaborator_id', activeCollaboratorIds)
          .eq('status', 'active')

        if (!eppAssignError && eppAssignments && eppAssignments.length > 0) {
          const eppIds = eppAssignments.map((a: any) => a.epp_id).filter(Boolean)

          const { data: expiringEPP, error: eppError } = await supabaseAdmin
            .from('pr_epp')
            .select('id, name, expiry_date')
            .in('id', eppIds)
            .lte('expiry_date', sevenDaysFromNow.toISOString())
            .gte('expiry_date', new Date().toISOString())

          if (!eppError && expiringEPP && expiringEPP.length > 0) {
            alerts.push({
              id: 'epp_expiring',
              type: 'warning',
              title: 'EPP próximos a vencer',
              message: `${expiringEPP.length} elementos requieren renovación esta semana`,
              priority: 'high'
            })
          }
        }
      } catch {
        // ignore EPP errors
      }
    }

    // Verificar nóminas pendientes
    let payrollQuery = supabaseAdmin
      .from('pr_payroll')
      .select('id, month, year, status')
      .eq('status', 'pending')
    if (companyId) {
      payrollQuery = payrollQuery.eq('company_id', companyId)
    }
    const { data: pendingPayroll, error: payrollError } = await payrollQuery

    if (!payrollError && pendingPayroll && pendingPayroll.length > 0) {
      const latestPayroll = pendingPayroll[0]
      alerts.push({
        id: 'payroll_pending',
        type: 'info',
        title: 'Nómina pendiente',
        message: `Planilla de ${latestPayroll.month}/${latestPayroll.year} pendiente de aprobación`,
        priority: 'medium'
      })
    }

    // Verificar colaboradores inactivos (filtrados por specialty)
    if (inactiveCollaborators.length > 0) {
      alerts.push({
        id: 'inactive_users',
        type: 'info',
        title: 'Colaboradores inactivos',
        message: `${inactiveCollaborators.length} colaboradores marcados como inactivos`,
        priority: 'low'
      })
    }

    return NextResponse.json(alerts)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

