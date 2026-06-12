import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const normalizeDate = (value: any) => String(value || '').slice(0, 10)

const getActor = async (session: any) => {
  const userId = String(session?.user?.id || '').trim()
  const email = String(session?.user?.email || '').trim().toLowerCase()
  let query = supabaseAdmin
    .from('pr_users')
    .select('id, email, role, company_id, name, first_name, last_name')
    .limit(1)

  if (userId) query = query.eq('id', userId)
  else if (email) query = query.eq('email', email)
  else return null

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null
  return data
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await getActor(session)
    const companyId = String(actor?.company_id || session?.user?.companyId || '').trim()
    const userId = String(actor?.id || session?.user?.id || '').trim()
    if (!companyId || !userId) return NextResponse.json({ notifications: [], unread_count: 0 })

    const unreadOnly = req.nextUrl.searchParams.get('unread') === '1'
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || 20) || 20, 1), 50)

    let listQuery = supabaseAdmin
      .from('pr_internal_notifications')
      .select('id, type, title, body, link_url, metadata, read_at, created_at, sender_user_id')
      .eq('company_id', companyId)
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (unreadOnly) listQuery = listQuery.is('read_at', null)

    const [{ data, error }, { count, error: countError }] = await Promise.all([
      listQuery,
      supabaseAdmin
        .from('pr_internal_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('recipient_user_id', userId)
        .is('read_at', null),
    ])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
    return NextResponse.json({ notifications: data || [], unread_count: count || 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await getActor(session)
    const senderUserId = String(actor?.id || session?.user?.id || '').trim()
    const companyId = String(actor?.company_id || session?.user?.companyId || '').trim()
    if (!companyId || !senderUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const type = String(body?.type || '').trim()
    if (type !== 'field_reports_day_completed') {
      return NextResponse.json({ error: 'Tipo de notificación no soportado' }, { status: 400 })
    }

    const date = normalizeDate(body?.date)
    if (!date) return NextResponse.json({ error: 'date es obligatorio' }, { status: 400 })
    const reportCount = Math.max(0, Math.trunc(Number(body?.report_count || 0) || 0))
    const projectId = String((session?.user as any)?.projectId || '').trim()
    const senderName = String(
      actor?.name ||
      `${String(actor?.first_name || '').trim()} ${String(actor?.last_name || '').trim()}`.trim() ||
      session?.user?.name ||
      session?.user?.email ||
      'Usuario'
    ).trim()

    let recipientsQuery = supabaseAdmin
      .from('pr_users')
      .select('id, role')
      .eq('company_id', companyId)
      .in('role', ['admin', 'user'])
      .neq('id', senderUserId)
    const { data: users, error: usersError } = await recipientsQuery
    if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

    const adminRecipientIds = (users || [])
      .filter((u: any) => String(u?.role || '').trim().toLowerCase() === 'admin')
      .map((u: any) => String(u.id || '').trim())
      .filter(Boolean)
    let recipientIds = (users || []).map((u: any) => String(u.id || '')).filter(Boolean)
    if (projectId && recipientIds.length > 0) {
      const regularRecipientIds = recipientIds.filter((id) => !adminRecipientIds.includes(id))
      const { data: permissions, error: permError } = await supabaseAdmin
        .from('pr_project_user_permissions')
        .select('user_id')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .eq('resource_key', 'field-reports')
        .eq('can_view', true)
        .in('user_id', regularRecipientIds.length > 0 ? regularRecipientIds : ['00000000-0000-0000-0000-000000000000'])
      if (permError) return NextResponse.json({ error: permError.message }, { status: 500 })
      const allowed = new Set((permissions || []).map((row: any) => String(row.user_id || '')).filter(Boolean))
      recipientIds = Array.from(new Set([...adminRecipientIds, ...regularRecipientIds.filter((id) => allowed.has(id))]))
    }

    const idempotencyBase = `field_reports_day_completed:${companyId}:${projectId || '-'}:${date}`
    const rows = recipientIds.map((recipientUserId) => ({
      company_id: companyId,
      project_id: projectId || null,
      recipient_user_id: recipientUserId,
      sender_user_id: senderUserId,
      type,
      title: `Reportes de terreno completados - ${date}`,
      body: `${senderName} informó que los reportes de terreno del ${date} están completos${reportCount > 0 ? ` (${reportCount} reporte${reportCount === 1 ? '' : 's'})` : ''}.`,
      link_url: `/users/field-reports?date=${encodeURIComponent(date)}`,
      metadata: { date, report_count: reportCount },
      idempotency_key: `${idempotencyBase}:${recipientUserId}`,
    }))

    if (rows.length === 0) {
      return NextResponse.json({ inserted_count: 0, message: 'No hay destinatarios con acceso a reportes.' })
    }

    const { data, error } = await supabaseAdmin
      .from('pr_internal_notifications')
      .upsert(rows, { onConflict: 'company_id,idempotency_key' })
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ inserted_count: data?.length || 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await getActor(session)
    const companyId = String(actor?.company_id || session?.user?.companyId || '').trim()
    const userId = String(actor?.id || session?.user?.id || '').trim()
    if (!companyId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const ids = Array.isArray(body?.ids) ? body.ids.map((id: any) => String(id || '').trim()).filter(Boolean) : []
    const markAll = Boolean(body?.mark_all)
    let query = supabaseAdmin
      .from('pr_internal_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('recipient_user_id', userId)
      .is('read_at', null)
      .select('id')
    if (!markAll) {
      if (ids.length === 0) return NextResponse.json({ updated_count: 0 })
      query = query.in('id', ids)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated_count: data?.length || 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
