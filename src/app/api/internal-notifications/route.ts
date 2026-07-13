import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { internalNotificationEmail } from '@/lib/emailTemplates/internalNotification'
import { sendNotificationMail } from '@/lib/notificationMailer'
import { createR2PresignedUrl } from '@/lib/r2Presign'

export const dynamic = 'force-dynamic'

const normalizeDate = (value: any) => String(value || '').slice(0, 10)
const normalizeEmail = (value: any) => String(value || '').trim().toLowerCase()
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const EXCEL_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const formatDateForDisplay = (date: string) => {
  const [year, month, day] = String(date || '').slice(0, 10).split('-')
  return year && month && day ? `${day}-${month}-${year}` : date
}

const getCurrentDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const getPreviousDateKey = () => {
  const current = getCurrentDateKey()
  const [year, month, day] = current.split('-').map((value) => Number(value))
  const previous = new Date(Date.UTC(year, month - 1, day))
  previous.setUTCDate(previous.getUTCDate() - 1)
  return previous.toISOString().slice(0, 10)
}

const loadEmailLogoDataUrl = async (companyId: string) => {
  try {
    const { data: asset, error } = await supabaseAdmin
      .from('pr_company_assets')
      .select('r2_key, content_type')
      .eq('company_id', companyId)
      .eq('asset_type', 'email_logo')
      .eq('is_active', true)
      .eq('is_default', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !asset?.r2_key) return null

    const bucket = process.env.R2_BUCKET_NAME
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return null

    const signed = createR2PresignedUrl({
      method: 'GET',
      bucket,
      accountId,
      key: String(asset.r2_key),
      accessKeyId,
      secretAccessKey,
      expiresInSeconds: 300,
    })
    const response = await fetch(signed.url, { cache: 'no-store' })
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || String(asset.content_type || 'image/png')
    if (!contentType.startsWith('image/')) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString('base64')}`
  } catch (error) {
    console.error('Internal notifications: email logo could not be loaded', error)
    return null
  }
}

const getActor = async (session: any) => {
  const userId = String(session?.user?.id || '').trim()
  const email = String(session?.user?.email || '').trim().toLowerCase()
  let query = supabaseAdmin
    .from('pr_users')
    .select('id, email, role, company_id, first_name, last_name')
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

    const summaryOnly = req.nextUrl.searchParams.get('summary') === '1'
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
      summaryOnly ? Promise.resolve({ data: [], error: null }) : listQuery,
      supabaseAdmin
        .from('pr_internal_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('recipient_user_id', userId)
        .is('read_at', null),
    ])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

    const notifications = Array.isArray(data) ? data : []
    const senderIds = Array.from(new Set(
      notifications
        .map((notification: any) => String(notification?.sender_user_id || '').trim())
        .filter(Boolean)
    ))

    let senderNames = new Map<string, string>()
    if (senderIds.length > 0) {
      const { data: senders, error: sendersError } = await supabaseAdmin
        .from('pr_users')
        .select('id, first_name, last_name, email')
        .in('id', senderIds)

      if (sendersError) return NextResponse.json({ error: sendersError.message }, { status: 500 })

      const senderEntries = (senders || []).map((sender: any): [string, string] => {
        const name = `${String(sender?.first_name || '').trim()} ${String(sender?.last_name || '').trim()}`
          .replace(/\s+/g, ' ')
          .trim()
        return [String(sender?.id || '').trim(), name]
      }).filter(([id, name]) => Boolean(id && name))
      senderNames = new Map(senderEntries)
    }

    return NextResponse.json({
      notifications: notifications.map((notification: any) => ({
        ...notification,
        sender_name: senderNames.get(String(notification?.sender_user_id || '').trim()) || null,
      })),
      unread_count: count || 0,
    })
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
    const sendInternal = body?.send_internal !== false
    const sendEmail = body?.send_email !== false
    if (!body?.preview && !sendInternal && !sendEmail) {
      return NextResponse.json({ error: 'Debes seleccionar notificación interna, correo o ambos.' }, { status: 400 })
    }

    const date = normalizeDate(body?.date)
    if (!date) return NextResponse.json({ error: 'date es obligatorio' }, { status: 400 })
    if (date !== getPreviousDateKey()) {
      return NextResponse.json({ error: 'Solo se pueden notificar reportes de terreno del día anterior.' }, { status: 400 })
    }
    const reportCount = Math.max(0, Math.trunc(Number(body?.report_count || 0) || 0))
    const projectId = String((session?.user as any)?.projectId || '').trim()
    const requestedAttachment = body?.email_attachment && typeof body.email_attachment === 'object'
      ? body.email_attachment
      : null
    const emailAttachment = requestedAttachment && sendEmail
      ? {
        filename: String(requestedAttachment?.filename || `reportes-terreno-${date}.xlsx`)
          .replace(/[\\/:*?"<>|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120) || `reportes-terreno-${date}.xlsx`,
        contentBase64: String(requestedAttachment?.content_base64 || ''),
        contentType: String(requestedAttachment?.content_type || EXCEL_CONTENT_TYPE),
      }
      : null
    if (emailAttachment) {
      if (emailAttachment.contentType !== EXCEL_CONTENT_TYPE) {
        return NextResponse.json({ error: 'El adjunto debe ser un archivo Excel .xlsx.' }, { status: 400 })
      }
      if (!/^[A-Za-z0-9+/=]+$/.test(emailAttachment.contentBase64) || emailAttachment.contentBase64.length < 20) {
        return NextResponse.json({ error: 'El adjunto Excel no es válido.' }, { status: 400 })
      }
      const estimatedBytes = Math.ceil(emailAttachment.contentBase64.length * 0.75)
      if (estimatedBytes > 15 * 1024 * 1024) {
        return NextResponse.json({ error: 'El adjunto Excel supera el tamaño máximo permitido.' }, { status: 400 })
      }
    }
    const senderName = String(
      `${String(actor?.first_name || '').trim()} ${String(actor?.last_name || '').trim()}`.trim() ||
      session?.user?.name ||
      session?.user?.email ||
      'Usuario'
    ).trim()

    let recipientsQuery = supabaseAdmin
      .from('pr_users')
      .select('id, role, email, first_name, last_name')
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

    const usersById = new Map((users || []).map((user: any) => [String(user.id || ''), user]))
    const internalRecipients = recipientIds
      .map((recipientUserId) => {
        const user = usersById.get(recipientUserId)
        if (!user) return null
        const name = String(
          `${String(user?.first_name || '').trim()} ${String(user?.last_name || '').trim()}`.trim() ||
          user?.email ||
          'Usuario'
        ).trim()
        const email = String(user?.email || '').trim()
        return {
          id: recipientUserId,
          name,
          email,
          role: String(user?.role || '').trim(),
          receives_email: Boolean(email),
        }
      })
      .filter(Boolean)

    const requestedEmailRecipients: string[] | null = Array.isArray(body?.email_recipients)
      ? Array.from(new Set<string>(body.email_recipients.map(normalizeEmail).filter(isValidEmail)))
      : null

    if (requestedEmailRecipients && sendEmail) {
      const rowsToPersist = requestedEmailRecipients.map((email) => ({
        company_id: companyId,
        project_id: projectId || null,
        notification_type: type,
        email,
        label: null,
        is_active: true,
        created_by: senderUserId,
        updated_by: senderUserId,
        updated_at: new Date().toISOString(),
      }))
      let deleteRecipientsQuery = supabaseAdmin
        .from('pr_notification_email_recipients')
        .delete()
        .eq('company_id', companyId)
        .eq('notification_type', type)
      deleteRecipientsQuery = projectId ? deleteRecipientsQuery.eq('project_id', projectId) : deleteRecipientsQuery.is('project_id', null)
      const { error: deleteRecipientsError } = await deleteRecipientsQuery
      if (deleteRecipientsError) return NextResponse.json({ error: deleteRecipientsError.message }, { status: 500 })
      if (rowsToPersist.length > 0) {
        const { error: persistError } = await supabaseAdmin
          .from('pr_notification_email_recipients')
          .insert(rowsToPersist)
        if (persistError) return NextResponse.json({ error: persistError.message }, { status: 500 })
      }
    }

    let emailRecipientsQuery = supabaseAdmin
      .from('pr_notification_email_recipients')
      .select('id, email, label')
      .eq('company_id', companyId)
      .eq('notification_type', type)
      .eq('is_active', true)
      .order('email', { ascending: true })
    emailRecipientsQuery = projectId ? emailRecipientsQuery.eq('project_id', projectId) : emailRecipientsQuery.is('project_id', null)
    const { data: configuredEmailRecipients, error: configuredEmailRecipientsError } = await emailRecipientsQuery
    if (configuredEmailRecipientsError) return NextResponse.json({ error: configuredEmailRecipientsError.message }, { status: 500 })

    const configuredEmails: string[] = (configuredEmailRecipients || []).map((row: any) => normalizeEmail(row?.email))
    const emailRecipientValues: string[] = requestedEmailRecipients || configuredEmails
    const emailRecipients = emailRecipientValues
      .filter(isValidEmail)
      .map((email) => ({
        id: email,
        name: email,
        email,
        role: 'email',
        receives_email: true,
      }))

    const idempotencyBase = `field_reports_day_completed:${companyId}:${projectId || '-'}:${date}`
    const displayDate = formatDateForDisplay(date)
    const notificationTitle = `Reportes de terreno completados - ${displayDate}`
    const reportCountText = reportCount > 0 ? ` (${reportCount} reporte${reportCount === 1 ? '' : 's'})` : ''
    const notificationBody = `${senderName} informó que los reportes de terreno del ${displayDate} están completos${reportCountText}.`
    const notificationLinkUrl = `/users/field-reports?date=${encodeURIComponent(date)}`
    const rows = recipientIds.map((recipientUserId) => ({
      company_id: companyId,
      project_id: projectId || null,
      recipient_user_id: recipientUserId,
      sender_user_id: senderUserId,
      type,
      title: notificationTitle,
      body: notificationBody,
      link_url: notificationLinkUrl,
      metadata: { date, report_count: reportCount },
      idempotency_key: `${idempotencyBase}:${recipientUserId}`,
    }))

    if (body?.preview === true) {
      return NextResponse.json({
        preview: true,
        date,
        report_count: reportCount,
        recipient_count: internalRecipients.length,
        email_recipient_count: emailRecipients.length,
        recipients: internalRecipients,
        email_recipients: emailRecipients,
        message: emailRecipients.length > 0 ? null : 'No hay correos configurados para esta notificación.',
      })
    }

    const internalRows = sendInternal ? rows : []
    const idempotencyKeys = internalRows.map((row) => row.idempotency_key)
    const { data: existingRows, error: existingError } = internalRows.length > 0
      ? await supabaseAdmin
        .from('pr_internal_notifications')
        .select('idempotency_key')
        .eq('company_id', companyId)
        .in('idempotency_key', idempotencyKeys)
      : { data: [], error: null }
    if (existingError) return NextResponse.json({ error: (existingError as any).message }, { status: 500 })
    const existingKeys = new Set((existingRows || []).map((row: any) => String(row.idempotency_key || '')).filter(Boolean))

    const { data, error } = internalRows.length > 0
      ? await supabaseAdmin
        .from('pr_internal_notifications')
        .upsert(internalRows, { onConflict: 'company_id,idempotency_key' })
        .select('id')
      : { data: [], error: null }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const origin = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || (process.env.NODE_ENV === 'development' ? req.nextUrl.origin : 'https://pr.ingenit.cl')
    const shouldSendEmail = sendEmail && (internalRows.length === 0 || internalRows.some((row) => !existingKeys.has(row.idempotency_key)))
    const emailLogoDataUrl = shouldSendEmail ? await loadEmailLogoDataUrl(companyId) : null
    const emailResults = await Promise.allSettled(
      (shouldSendEmail ? emailRecipients : []).map((recipient) => {
        const actionUrl = new URL(notificationLinkUrl, origin).toString()
        const { subject, html, text } = internalNotificationEmail({ title: notificationTitle, body: notificationBody, actionUrl, logoDataUrl: emailLogoDataUrl })
        return sendNotificationMail({
          to: recipient.email,
          subject,
          html,
          text,
          attachments: emailAttachment
            ? [{
              filename: emailAttachment.filename.endsWith('.xlsx') ? emailAttachment.filename : `${emailAttachment.filename}.xlsx`,
              content: emailAttachment.contentBase64,
              encoding: 'base64',
              contentType: emailAttachment.contentType,
            }]
            : undefined,
        })
      })
    )
    const emailSentCount = emailResults.filter((result) => result.status === 'fulfilled' && result.value).length
    const emailFailedCount = emailResults.filter((result) => result.status === 'rejected').length
    if (emailFailedCount > 0) {
      console.error('Internal notifications: email delivery failed', {
        failed: emailFailedCount,
        total: emailRecipients.length,
      })
    }

    return NextResponse.json({ inserted_count: data?.length || 0, email_sent_count: emailSentCount, email_failed_count: emailFailedCount })
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
