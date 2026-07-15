import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const canManage = (role: unknown) => ['admin', 'dev'].includes(String(role || '').toLowerCase())
const clean = (value: unknown) => String(value || '').trim().slice(0, 180)

export async function GET() {
  const session = await getServerSession(authOptions) as any
  const companyId = String(session?.user?.companyId || '')
  if (!companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('pr_transmittal_settings')
    .select('project_name, contract_number, next_register_number')
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || { project_name: '', contract_number: '', next_register_number: 1 })
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions) as any
  const companyId = String(session?.user?.companyId || '')
  if (!companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!canManage(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { data, error } = await supabaseAdmin
    .from('pr_transmittal_settings')
    .upsert({ company_id: companyId, project_name: clean(body?.projectName), contract_number: clean(body?.contractNumber), next_register_number: Math.max(1, Number.parseInt(String(body?.nextRegisterNumber || '1'), 10) || 1), updated_at: new Date().toISOString() }, { onConflict: 'company_id' })
    .select('project_name, contract_number, next_register_number')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions) as any
  const companyId = String(session?.user?.companyId || '')
  if (!companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const reportDate = String(body?.reportDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return NextResponse.json({ error: 'Fecha de reporte inválida' }, { status: 400 })

  const { data, error } = await supabaseAdmin.rpc('pr_issue_transmittal_register', {
    p_company_id: companyId,
    p_report_date: reportDate
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ registerNumber: Number(data) })
}
