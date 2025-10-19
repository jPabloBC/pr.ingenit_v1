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
    const alerts = []

    // Verificar EPP próximos a vencer (próximos 7 días)
    const sevenDaysFromNow = new Date()
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    
    const { data: expiringEPP, error: eppError } = await supabase
      .from('pr_epp')
      .select('id, name, expiry_date')
      .eq('company_id', companyId)
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

    // Verificar nóminas pendientes
    const { data: pendingPayroll, error: payrollError } = await supabase
      .from('pr_payroll')
      .select('id, month, year, status')
      .eq('company_id', companyId)
      .eq('status', 'pending')

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

    // Verificar empleados inactivos
    const { data: inactiveUsers, error: usersError } = await supabase
      .from('pr_users')
      .select('id, name, status')
      .eq('company_id', companyId)
      .eq('is_active', false)

    if (!usersError && inactiveUsers && inactiveUsers.length > 0) {
      alerts.push({
        id: 'inactive_users',
        type: 'info',
        title: 'Usuarios inactivos',
        message: `${inactiveUsers.length} usuarios marcados como inactivos`,
        priority: 'low'
      })
    }

    return NextResponse.json(alerts)
  } catch (error) {
    console.error('Error in dashboard alerts:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}



