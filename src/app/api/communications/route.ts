import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getCommunicationsActor } from '@/lib/communications'
import { createR2PresignedUrl } from '@/lib/r2Presign'
import { sendNotificationMail } from '@/lib/notificationMailer'
import { sendWhatsAppBridgeMessages } from '@/lib/whatsappBridge'
import { todayYmd } from '@/lib/staffing/availableCollaborators'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_RECIPIENTS = 300
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const clean = (value: unknown) => String(value || '').trim()
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
const normalPhone = (value: unknown) => clean(value).replace(/[^0-9]/g, '')
const attendanceStatus = (status: unknown, reason: unknown) => {
  const currentStatus = clean(status)
  const currentReason = clean(reason).toLocaleLowerCase('es-CL')
  if (!currentStatus) {
    if (currentReason === '11' || currentReason.includes('turno') || currentReason.includes('presente')) return 'Turno'
    if (currentReason === 'd' || currentReason.includes('descanso')) return 'Descanso'
    if (currentReason === 'fo' || currentReason.includes('fuera de obra')) return 'Fuera de Obra'
    if (currentReason === 'ac' || currentReason.includes('acreditacion')) return 'Acreditacion'
    if (currentReason === 'p' || currentReason.includes('permiso')) return 'Permiso'
    if (currentReason === 'l' || currentReason.includes('licencia')) return 'Licencia'
    if (currentReason === 'f' || currentReason.includes('falla')) return 'Falla'
    if (currentReason === 'vac' || currentReason.includes('vacacion')) return 'Vacaciones'
    if (currentReason === 'fin' || currentReason.includes('finiquit')) return 'Finiquitado'
  }
  if (currentStatus === 'Otro' && (currentReason === 'fo' || currentReason.includes('fuera de obra'))) return 'Fuera de Obra'
  return currentStatus || 'Sin registro'
}

const attachmentDownload = async (key: string) => {
  const bucket = process.env.R2_BUCKET_NAME
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) throw new Error('R2 no está configurado.')
  const signed = createR2PresignedUrl({ method: 'GET', bucket, accountId, key, accessKeyId, secretAccessKey, expiresInSeconds: 300 })
  const response = await fetch(signed.url, { cache: 'no-store' })
  if (!response.ok) throw new Error('No fue posible leer el PDF adjunto.')
  return Buffer.from(await response.arrayBuffer())
}

export async function GET() {
  try {
    const { actor, allowed, canSend, canManageForms } = await getCommunicationsActor()
    if (!actor?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const currentAttendanceDate = todayYmd()
    const [collaboratorsResult, campaignsResult, attendanceResult] = await Promise.all([
      (canSend || canManageForms) ? supabaseAdmin
        .from('pr_collaborators')
        .select('id, first_name, last_name, document, position, specialty, worker_type, shift_pattern, phone, email')
        .eq('company_id', actor.companyId)
        .eq('is_active', true)
        .order('position', { ascending: true })
        .order('last_name', { ascending: true }) : Promise.resolve({ data: [], error: null }),
      canSend ? supabaseAdmin
        .from('pr_communication_campaigns')
        .select('id, title, message, channels, recipient_filter, attachment_name, attachment_content_type, attachment_size_bytes, attachment_access_token, attachment_expires_at, created_at, created_by')
        .eq('company_id', actor.companyId)
        .eq('project_id', actor.projectId || '00000000-0000-0000-0000-000000000000')
        .order('created_at', { ascending: false })
        .limit(30) : Promise.resolve({ data: [], error: null }),
      (canSend || canManageForms) ? supabaseAdmin
        .from('pr_collaborator_daily_status')
        .select('collaborator_id, status, reason')
        .eq('company_id', actor.companyId)
        .eq('work_date', currentAttendanceDate) : Promise.resolve({ data: [], error: null }),
    ])
    if (collaboratorsResult.error) return NextResponse.json({ error: collaboratorsResult.error.message }, { status: 500 })
    if (campaignsResult.error) return NextResponse.json({ error: campaignsResult.error.message }, { status: 500 })
    if (attendanceResult.error) console.warn('No fue posible cargar la asistencia actual para Comunicaciones:', attendanceResult.error.message)

    const attendanceByCollaboratorId = new Map((attendanceResult.data || []).map((row: any) => [
      String(row.collaborator_id),
      attendanceStatus(row.status, row.reason),
    ]))

    const collaborators = (collaboratorsResult.data || []).map((row: any) => ({
      id: row.id,
      name: `${clean(row.first_name)} ${clean(row.last_name)}`.replace(/\s+/g, ' ').trim(),
      document: clean(row.document),
      position: clean(row.position),
      specialty: clean(row.specialty),
      workerType: clean(row.worker_type),
      attendanceStatus: attendanceByCollaboratorId.get(String(row.id)) || 'Sin registro',
      shift: clean(row.shift_pattern),
      phone: clean(row.phone),
      email: clean(row.email).toLowerCase(),
    }))
    const positions = Array.from(new Set(collaborators.map((row) => row.position).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
    return NextResponse.json({ collaborators, positions, campaigns: campaignsResult.data || [], attendance_date: currentAttendanceDate, capabilities: { can_send: canSend, can_manage_forms: canManageForms } })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { actor, allowed, canSend } = await getCommunicationsActor()
    if (!actor?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed || !canSend) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!actor.projectId) return NextResponse.json({ error: 'Debes seleccionar un proyecto.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const title = clean(body?.title).slice(0, 160)
    const message = clean(body?.message).slice(0, 4000)
    const channels = Array.from(new Set<string>((Array.isArray(body?.channels) ? body.channels : []).map((value: unknown) => clean(value).toLowerCase()).filter((value: string) => value === 'email' || value === 'whatsapp')))
    const collaboratorIds = Array.from(new Set((Array.isArray(body?.collaborator_ids) ? body.collaborator_ids : []).map(clean).filter(Boolean)))
    if (!title || !message || !channels.length || !collaboratorIds.length) {
      return NextResponse.json({ error: 'Completa asunto, mensaje, canal y destinatarios.' }, { status: 400 })
    }
    if (collaboratorIds.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `La campaña admite un máximo de ${MAX_RECIPIENTS} destinatarios.` }, { status: 400 })
    }

    const attachmentInput = body?.attachment && typeof body.attachment === 'object' ? body.attachment : null
    const attachment = attachmentInput ? {
      key: clean(attachmentInput.key),
      name: clean(attachmentInput.name).slice(0, 180),
      contentType: clean(attachmentInput.content_type || attachmentInput.contentType),
      size: Number(attachmentInput.size || attachmentInput.file_size || 0),
    } : null
    if (attachment && (!attachment.key || !attachment.name || attachment.contentType !== 'application/pdf' || !Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > MAX_ATTACHMENT_BYTES)) {
      return NextResponse.json({ error: 'El adjunto debe ser un PDF válido de hasta 10 MB.' }, { status: 400 })
    }
    if (attachment && !attachment.key.startsWith(`communications/${actor.companyId}/${actor.projectId}/`)) {
      return NextResponse.json({ error: 'El adjunto no pertenece al proyecto actual.' }, { status: 403 })
    }

    const { data: collaborators, error: collaboratorsError } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id, first_name, last_name, position, phone, email')
      .eq('company_id', actor.companyId)
      .eq('is_active', true)
      .in('id', collaboratorIds)
    if (collaboratorsError) return NextResponse.json({ error: collaboratorsError.message }, { status: 500 })
    if (!collaborators?.length) return NextResponse.json({ error: 'No se encontraron destinatarios activos.' }, { status: 400 })

    const recipientFilter = { positions: Array.from(new Set((collaborators || []).map((row: any) => clean(row.position)).filter(Boolean))) }
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('pr_communication_campaigns')
      .insert({
        company_id: actor.companyId,
        project_id: actor.projectId,
        title,
        message,
        channels,
        recipient_filter: recipientFilter,
        attachment_r2_key: attachment?.key || null,
        attachment_name: attachment?.name || null,
        attachment_content_type: attachment?.contentType || null,
        attachment_size_bytes: attachment?.size || null,
        attachment_expires_at: attachment ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
        created_by: actor.userId || null,
      })
      .select('id, attachment_access_token, attachment_expires_at')
      .single()
    if (campaignError || !campaign) return NextResponse.json({ error: campaignError?.message || 'No fue posible crear la campaña.' }, { status: 500 })

    const deliveries = (collaborators || []).flatMap((row: any) => {
      const name = `${clean(row.first_name)} ${clean(row.last_name)}`.replace(/\s+/g, ' ').trim() || 'Colaborador'
      return channels.map((channel) => ({
        campaign_id: campaign.id,
        collaborator_id: row.id,
        channel,
        recipient_name: name,
        recipient_email: clean(row.email).toLowerCase() || null,
        recipient_phone: clean(row.phone) || null,
        status: 'prepared',
      }))
    })
    const { data: insertedDeliveries, error: deliveriesError } = await supabaseAdmin
      .from('pr_communication_deliveries')
      .insert(deliveries)
      .select('id, channel, recipient_email, recipient_phone')
    if (deliveriesError) return NextResponse.json({ error: deliveriesError.message }, { status: 500 })

    let emailSent = 0
    let emailFailed = 0
    if (channels.includes('email')) {
      let attachmentContent: Buffer | null = null
      if (attachment?.key) attachmentContent = await attachmentDownload(attachment.key)
      const emailDeliveries = (insertedDeliveries || []).filter((delivery: any) => delivery.channel === 'email' && EMAIL_RE.test(clean(delivery.recipient_email)))
      const results = await Promise.allSettled(emailDeliveries.map(async (delivery: any) => {
        const html = `<p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>`
        const result = await sendNotificationMail({
          to: clean(delivery.recipient_email),
          subject: title,
          html,
          text: message,
          attachments: attachmentContent && attachment ? [{ filename: attachment.name, content: attachmentContent, contentType: attachment.contentType }] : undefined,
        })
        await supabaseAdmin.from('pr_communication_deliveries').update({ status: 'sent', provider_message_id: clean(result?.messageId) || null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', delivery.id)
      }))
      emailSent = results.filter((result) => result.status === 'fulfilled').length
      emailFailed = results.filter((result) => result.status === 'rejected').length
      const failedIds = emailDeliveries.filter((_, index) => results[index]?.status === 'rejected').map((delivery: any) => delivery.id)
      if (failedIds.length) await supabaseAdmin.from('pr_communication_deliveries').update({ status: 'failed', error_message: 'No fue posible enviar el correo.', updated_at: new Date().toISOString() }).in('id', failedIds)
    }

    let whatsappSent = 0
    let whatsappFailed = 0
    let whatsappAutomated = false
    if (channels.includes('whatsapp')) {
      const allWhatsappDeliveries = (insertedDeliveries || []).filter((delivery: any) => delivery.channel === 'whatsapp')
      const whatsappDeliveries = allWhatsappDeliveries.filter((delivery: any) => normalPhone(delivery.recipient_phone))
      const invalidPhoneDeliveries = allWhatsappDeliveries.filter((delivery: any) => !normalPhone(delivery.recipient_phone))
      whatsappFailed = invalidPhoneDeliveries.length
      if (invalidPhoneDeliveries.length) {
        await supabaseAdmin
          .from('pr_communication_deliveries')
          .update({ status: 'failed', error_message: 'El destinatario no tiene un teléfono válido.', updated_at: new Date().toISOString() })
          .in('id', invalidPhoneDeliveries.map((delivery: any) => delivery.id))
      }
      const whatsappMessage = `*${title}*\n\n${message}`
      const attachmentUrl = attachment?.key && campaign.attachment_access_token
        ? `${req.nextUrl.origin}/api/communications/files/${campaign.attachment_access_token}`
        : null
      try {
        const bridge = await sendWhatsAppBridgeMessages({
          message: whatsappMessage,
          recipients: whatsappDeliveries.map((delivery: any) => ({ id: delivery.id, phone: normalPhone(delivery.recipient_phone) })),
          attachmentUrl,
          attachmentName: attachment?.name,
        })
        if (bridge.configured) {
          whatsappAutomated = true
          const now = new Date().toISOString()
          const sent = bridge.results.filter((result) => result.status === 'sent')
          const failed = bridge.results.filter((result) => result.status === 'failed')
          whatsappSent = sent.length
          whatsappFailed += failed.length
          await Promise.all([
            ...sent.map((result) => supabaseAdmin.from('pr_communication_deliveries').update({ status: 'sent', provider_message_id: clean(result.provider_message_id), sent_at: now, updated_at: now }).eq('id', result.id)),
            ...failed.map((result) => supabaseAdmin.from('pr_communication_deliveries').update({ status: 'failed', error_message: clean(result.error) || 'No fue posible enviar WhatsApp.', updated_at: now }).eq('id', result.id)),
          ])
        }
      } catch (error) {
        whatsappFailed += whatsappDeliveries.length
        const errorMessage = clean(error instanceof Error ? error.message : String(error)).slice(0, 500)
        if (whatsappDeliveries.length) await supabaseAdmin.from('pr_communication_deliveries').update({ status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString() }).in('id', whatsappDeliveries.map((delivery: any) => delivery.id))
      }
    }

    return NextResponse.json({
      campaign_id: campaign.id,
      attachment_token: campaign.attachment_access_token,
      attachment_expires_at: campaign.attachment_expires_at,
      recipients: collaborators.length,
      email_sent: emailSent,
      email_failed: emailFailed,
      whatsapp_sent: whatsappSent,
      whatsapp_failed: whatsappFailed,
      whatsapp_automated: whatsappAutomated,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
