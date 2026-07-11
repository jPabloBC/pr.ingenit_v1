import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createClient } from '@supabase/supabase-js'
import { authOptions } from '../../../lib/auth'

const DEFAULT_REPORT_FRONTS = [
  {
    id: null,
    code: 'BASE-PISCINAS',
    name: 'CONTRATO BASE PISCINAS',
    title_prefix: 'REPORTE CONTRATO BASE PISCINAS',
    type: 'base',
    sequence_mode: 'date_anchor',
    next_sequence_no: null,
    date_anchor: '2026-05-31',
    date_anchor_sequence_no: 54,
    is_active: true,
    sort_order: 10,
    include_in_daily_activities: false,
  },
  {
    id: null,
    code: 'BASE-CANALETAS',
    name: 'CONTRATO BASE CANALETAS',
    title_prefix: 'REPORTE CONTRATO BASE CANALETAS',
    type: 'base',
    sequence_mode: 'date_anchor',
    next_sequence_no: null,
    date_anchor: '2026-05-31',
    date_anchor_sequence_no: 54,
    is_active: true,
    sort_order: 20,
    include_in_daily_activities: false,
  },
  {
    id: null,
    code: 'NOC-001-CALAMINAS',
    name: 'USO DE RECURSOS NOC Nº001 CALAMINAS',
    title_prefix: 'REPORTE USO DE RECURSOS NOC Nº001 CALAMINAS',
    type: 'udr',
    sequence_mode: 'incremental',
    next_sequence_no: 10,
    date_anchor: null,
    date_anchor_sequence_no: null,
    is_active: true,
    sort_order: 40,
    include_in_daily_activities: false,
  },
  {
    id: null,
    code: 'NOC-002-PISCINA-AGUA-SALADA',
    name: 'USO DE RECURSOS NOC Nº002 PISCINA AGUA SALADA',
    title_prefix: 'REPORTE USO DE RECURSOS NOC Nº002 PISCINA AGUA SALADA',
    type: 'udr',
    sequence_mode: 'incremental',
    next_sequence_no: 23,
    date_anchor: null,
    date_anchor_sequence_no: null,
    is_active: true,
    sort_order: 50,
    include_in_daily_activities: false,
  },
  {
    id: null,
    code: 'NOC-006-TRABAJOS-ELECTRICOS-FASE-1',
    name: 'USO DE RECURSOS NOC Nº006 TRABAJOS ELECTRICOS FASE 1',
    title_prefix: 'REPORTE USO DE RECURSOS NOC Nº006 TRABAJOS ELECTRICOS FASE 1',
    type: 'udr',
    sequence_mode: 'incremental',
    next_sequence_no: 1,
    date_anchor: null,
    date_anchor_sequence_no: null,
    is_active: true,
    sort_order: 60,
    include_in_daily_activities: false,
  },
  {
    id: null,
    code: 'NOC-007-VERTEDERO-PISCINA-ILS-2',
    name: 'USO DE RECURSOS NOC Nº007 VERTEDERO PISCINA ILS 2',
    title_prefix: 'REPORTE USO DE RECURSOS NOC Nº007 VERTEDERO PISCINA ILS 2',
    type: 'udr',
    sequence_mode: 'incremental',
    next_sequence_no: 5,
    date_anchor: null,
    date_anchor_sequence_no: null,
    is_active: true,
    sort_order: 70,
    include_in_daily_activities: false,
  },
]

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase admin environment variables')
  return createClient(url, key)
}

const normalizeCode = (value: any) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const fallbackResponse = () => NextResponse.json({ fronts: DEFAULT_REPORT_FRONTS, source: 'fallback' })

const requireAdminSession = async () => {
  const session = (await getServerSession(authOptions as any)) as any
  if (!session?.user?.companyId) return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = String(session?.user?.role || '').toLowerCase()
  if (!['dev', 'admin'].includes(role)) return { session: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { session, error: null }
}

const requireWritableSession = async () => {
  const session = (await getServerSession(authOptions as any)) as any
  if (!session?.user?.companyId) return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = String(session?.user?.role || '').toLowerCase()
  if (role === 'viewer') return { session: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { session, error: null }
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ fronts: [] }, { status: 200 })
    const includeInactive = req.nextUrl.searchParams.get('include_inactive') === '1'

    const supabaseAdmin = getSupabaseAdmin()
    const baseSelect = 'id, code, name, title_prefix, type, sequence_mode, next_sequence_no, date_anchor, date_anchor_sequence_no, is_active, sort_order'
    const withDailyActivitiesSelect = `${baseSelect}, include_in_daily_activities`
    let query = supabaseAdmin
      .from('pr_report_fronts')
      .select(withDailyActivitiesSelect)
      .eq('company_id', session.user.companyId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (!includeInactive) query = query.eq('is_active', true).neq('type', 'ifa')
    let { data, error } = await query

    if (error && String(error.message || '').includes('include_in_daily_activities')) {
      let fallbackQuery = supabaseAdmin
        .from('pr_report_fronts')
        .select(baseSelect)
        .eq('company_id', session.user.companyId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (!includeInactive) fallbackQuery = fallbackQuery.eq('is_active', true).neq('type', 'ifa')
      const fallbackResult = await fallbackQuery
      data = Array.isArray(fallbackResult.data)
        ? fallbackResult.data.map((row: any) => ({ ...row, include_in_daily_activities: false }))
        : fallbackResult.data
      error = fallbackResult.error
    }

    if (error) return fallbackResponse()
    if (!data || data.length === 0) return fallbackResponse()
    return NextResponse.json({ fronts: data, source: 'table' })
  } catch {
    return fallbackResponse()
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session, error: authError } = await requireAdminSession()
    if (authError) return authError

    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Nombre de frente requerido' }, { status: 400 })

    const type = String(body?.type || 'udr').trim().toLowerCase()
    const sequenceMode = String(body?.sequence_mode || (type === 'base' ? 'date_anchor' : 'incremental')).trim().toLowerCase()
    const code = normalizeCode(body?.code || name)
    const titlePrefix = String(body?.title_prefix || `REPORTE ${name.toUpperCase()}`).trim()
    const nextSequenceNo = body?.next_sequence_no == null ? 1 : Math.max(1, Math.trunc(Number(body.next_sequence_no) || 1))

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pr_report_fronts')
      .insert({
        company_id: session.user.companyId,
        code,
        name,
        title_prefix: titlePrefix,
        type,
        sequence_mode: sequenceMode,
        next_sequence_no: sequenceMode === 'incremental' ? nextSequenceNo : null,
        date_anchor: body?.date_anchor || null,
        date_anchor_sequence_no: body?.date_anchor_sequence_no == null ? null : Math.trunc(Number(body.date_anchor_sequence_no) || 0),
        is_active: body?.is_active === undefined ? true : Boolean(body.is_active),
        include_in_daily_activities: Boolean(body?.include_in_daily_activities),
        sort_order: Math.trunc(Number(body?.sort_order || 999)),
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ front: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { session, error: authError } = await requireAdminSession()
    if (authError) return authError

    const body = await req.json().catch(() => ({}))
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ error: 'ID de frente requerido' }, { status: 400 })

    const name = String(body?.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Nombre de frente requerido' }, { status: 400 })

    const type = String(body?.type || 'udr').trim().toLowerCase()
    const sequenceMode = String(body?.sequence_mode || (type === 'base' ? 'date_anchor' : 'incremental')).trim().toLowerCase()
    const code = normalizeCode(body?.code || name)
    const titlePrefix = String(body?.title_prefix || `REPORTE ${name.toUpperCase()}`).trim()
    const nextSequenceNo = body?.next_sequence_no == null ? 1 : Math.max(1, Math.trunc(Number(body.next_sequence_no) || 1))

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pr_report_fronts')
      .update({
        code,
        name,
        title_prefix: titlePrefix,
        type,
        sequence_mode: sequenceMode,
        next_sequence_no: sequenceMode === 'incremental' ? nextSequenceNo : null,
        date_anchor: body?.date_anchor || null,
        date_anchor_sequence_no: body?.date_anchor_sequence_no == null ? null : Math.trunc(Number(body.date_anchor_sequence_no) || 0),
        is_active: body?.is_active === undefined ? true : Boolean(body.is_active),
        include_in_daily_activities: Boolean(body?.include_in_daily_activities),
        sort_order: Math.trunc(Number(body?.sort_order || 999)),
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', session.user.companyId)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ front: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { session, error: authError } = await requireWritableSession()
    if (authError) return authError

    const body = await req.json().catch(() => ({}))
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ error: 'ID de frente requerido' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pr_report_fronts')
      .update({
        include_in_daily_activities: Boolean(body?.include_in_daily_activities),
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', session.user.companyId)
      .eq('id', id)
      .neq('type', 'base')
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ front: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { session, error: authError } = await requireAdminSession()
    if (authError) return authError

    const id = String(req.nextUrl.searchParams.get('id') || '').trim()
    if (!id) return NextResponse.json({ error: 'ID de frente requerido' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pr_report_fronts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('company_id', session.user.companyId)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ front: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
