import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

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
    const today = getTodayInChile()
    const activeCollaboratorIds = (collaborators || [])
      .filter((c: any) => c.is_active === true)
      .map((c: any) => c.id)
      .filter(Boolean)

    let presentToday = 0
    let restToday = 0
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
        const dailyRows = dailyStatusRows || []
        presentToday = dailyRows.filter(isPresentDailyStatus).length
        restToday = dailyRows.filter((row: any) => normalizeText(row?.status) === 'descanso').length
        otherToday = dailyRows.filter((row: any) => {
          const status = normalizeText(row?.status)
          return Boolean(status) && status !== 'descanso' && !isPresentDailyStatus(row)
        }).length
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

    const finiquitados = (collaborators || []).filter((collaborator: any) => collaborator.is_active === false).length

    const stats: any = {
      totalCollaborators,
      activeCollaborators,
      presentToday,
      restToday,
      otherToday,
      finiquitados
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
