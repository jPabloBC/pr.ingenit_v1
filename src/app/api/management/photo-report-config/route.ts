import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createClient } from '@supabase/supabase-js'
import { authOptions } from '../../../../lib/auth'

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase admin environment variables')
  return createClient(url, key)
}

const normalizeDate = (value: any) => String(value || '').slice(0, 10)
const normalizeReportNo = (value: any) => String(value || '000').trim() || '000'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ config: null }, { status: 200 })

    const periodStart = normalizeDate(req.nextUrl.searchParams.get('period_start'))
    const periodEnd = normalizeDate(req.nextUrl.searchParams.get('period_end'))

    const supabaseAdmin = getSupabaseAdmin()
    if (!periodStart || !periodEnd) {
      const { data, error } = await supabaseAdmin
        .from('pr_photo_report_configs')
        .select('id, report_no, period_start, period_end, updated_at, updated_by_email')
        .eq('company_id', session.user.companyId)
        .order('updated_at', { ascending: false })
        .limit(100)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ configs: data || [] })
    }

    const reportNo = normalizeReportNo(req.nextUrl.searchParams.get('report_no'))
    const { data, error } = await supabaseAdmin
      .from('pr_photo_report_configs')
      .select('*')
      .eq('company_id', session.user.companyId)
      .eq('report_no', reportNo)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ config: data || null })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const reportNo = normalizeReportNo(body?.report_no)
    const periodStart = normalizeDate(body?.period_start)
    const periodEnd = normalizeDate(body?.period_end)
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: 'period_start y period_end son obligatorios' }, { status: 400 })
    }

    const hiddenImageKeys = body?.hidden_image_keys && typeof body.hidden_image_keys === 'object'
      ? body.hidden_image_keys
      : {}
    const exportRangeStart = Math.max(1, Math.trunc(Number(body?.export_range_start || 1)))
    const exportRangeEnd = Math.max(exportRangeStart, Math.trunc(Number(body?.export_range_end || exportRangeStart)))

    const payload = {
      company_id: session.user.companyId,
      report_no: reportNo,
      period_start: periodStart,
      period_end: periodEnd,
      hidden_image_keys: hiddenImageKeys,
      export_range_start: exportRangeStart,
      export_range_end: exportRangeEnd,
      updated_by_user_id: session.user.id || null,
      updated_by_email: session.user.email || null,
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pr_photo_report_configs')
      .upsert(payload, { onConflict: 'company_id,report_no,period_start,period_end' })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ config: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
