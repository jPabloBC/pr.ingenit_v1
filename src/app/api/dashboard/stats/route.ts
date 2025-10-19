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

    // Obtener colaboradores (excluyendo usuarios administrativos)
    const { data: collaborators, error: collaboratorsError } = await supabase
      .from('pr_users')
      .select('id, status, is_active, role')
      .eq('company_id', companyId)
      .not('role', 'in', '(admin,hr_manager,supervisor)')

    if (collaboratorsError) {
      console.error('Error fetching collaborators:', collaboratorsError)
      return NextResponse.json({ error: 'Error al obtener colaboradores' }, { status: 500 })
    }

    const totalCollaborators = collaborators?.length || 0
    const activeCollaborators = collaborators?.filter(collab => collab.is_active).length || 0

    // Obtener asistencia de hoy
    const today = new Date().toISOString().split('T')[0]
    const { data: attendance, error: attendanceError } = await supabase
      .from('pr_attendance')
      .select('user_id, status')
      .eq('date', today)

    if (attendanceError) {
      console.error('Error fetching attendance:', attendanceError)
    }

    const presentToday = attendance?.filter(att => att.status === 'present').length || 0
    const absentToday = activeCollaborators - presentToday

    // Obtener EPP vencidos (simulado por ahora)
    const { data: epp, error: eppError } = await supabase
      .from('pr_epp')
      .select('id, expiry_date')
      .eq('company_id', companyId)
      .lt('expiry_date', new Date().toISOString())

    if (eppError) {
      console.error('Error fetching EPP:', eppError)
    }

    const expiredEPP = epp?.length || 0

    // Obtener nóminas pendientes (simulado por ahora)
    const { data: payroll, error: payrollError } = await supabase
      .from('pr_payroll')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('status', 'pending')

    if (payrollError) {
      console.error('Error fetching payroll:', payrollError)
    }

    const pendingPayroll = payroll?.length || 0

    const stats = {
      totalCollaborators,
      activeCollaborators,
      presentToday,
      absentToday,
      expiredEPP,
      pendingPayroll
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error in dashboard stats:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
