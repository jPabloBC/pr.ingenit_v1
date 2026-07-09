import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireApiAccess } from '@/lib/apiAccess'

const normalizeText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const getTodayInChile = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

const isPresentDailyStatus = (row: any) => {
  const status = normalizeText(row?.status)
  const reason = normalizeText(row?.reason)
  return status === 'turno' || status === 'presente' || reason === '11' || reason === 'turno' || reason === 'presente'
}

const isRestDailyStatus = (row: any) => {
  const status = normalizeText(row?.status)
  return status === 'descanso'
}

const isFailureDailyStatus = (row: any) => {
  const status = normalizeText(row?.status)
  return status === 'falla'
}

const isOtherDailyStatus = (row: any) => {
  const status = normalizeText(row?.status)
  if (!status) return false
  return !isPresentDailyStatus(row) && !isRestDailyStatus(row) && !isFailureDailyStatus(row)
}

export async function GET() {
  try {
    const access = await requireApiAccess({ resource: 'dashboard' })
    if (!access.ok) return access.response

    const session = access.session

    const userRole = session?.user?.role
    const companyId = access.actor.companyId

    if (!companyId) {
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
    const terminatedCollaborators = (collaborators || []).filter((c: any) => c.is_active === false).length

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
    const today = getTodayInChile()
    const collaboratorIds = (collaborators || []).map((c: any) => c.id).filter(Boolean)
    const activeCollaboratorIds = (collaborators || [])
      .filter((c: any) => c.is_active === true)
      .map((c: any) => c.id)
      .filter(Boolean)

    let presentToday = 0
    let restToday = 0
    let failureToday = 0
    let otherToday = 0
    if (activeCollaboratorIds.length > 0) {
      let dailyStatusQuery = supabaseAdmin
        .from('pr_collaborator_daily_status')
        .select('collaborator_id, status, reason')
        .eq('work_date', today)
        .in('collaborator_id', activeCollaboratorIds)

      if (companyId) {
        dailyStatusQuery = dailyStatusQuery.eq('company_id', companyId)
      }

      const { data: dailyStatusRows, error: dailyStatusError } = await dailyStatusQuery

      if (!dailyStatusError) {
        const rows = dailyStatusRows || []
        presentToday = rows.filter(isPresentDailyStatus).length
        restToday = rows.filter(isRestDailyStatus).length
        failureToday = rows.filter(isFailureDailyStatus).length
        otherToday = rows.filter(isOtherDailyStatus).length
      } else {
        const { data: attendance } = await supabaseAdmin
          .from('pr_attendance')
          .select('collaborator_id, status')
          .eq('date', today)
          .in('collaborator_id', activeCollaboratorIds)

        presentToday = attendance?.filter((att: any) => {
          const status = normalizeText(att?.status)
          return status === 'present' || status === 'presente' || status === 'turno'
        }).length || 0
      }
    }

    const absentToday = Math.max(0, activeCollaborators - presentToday)

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
      terminatedCollaborators,
      presentToday,
      absentToday,
      restToday,
      failureToday,
      otherToday,
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
