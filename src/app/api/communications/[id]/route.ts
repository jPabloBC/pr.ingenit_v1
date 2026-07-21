import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getCommunicationsActor } from '@/lib/communications'

const clean = (value: unknown) => String(value || '').trim()
const phoneDigits = (value: unknown) => clean(value).replace(/[^0-9]/g, '')

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { actor, allowed, canSend } = await getCommunicationsActor()
    if (!actor?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed || !canSend) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data: campaign, error } = await supabaseAdmin
      .from('pr_communication_campaigns')
      .select('id, title, message, attachment_name, attachment_access_token, attachment_expires_at, created_at')
      .eq('id', params.id)
      .eq('company_id', actor.companyId)
      .eq('project_id', actor.projectId || '00000000-0000-0000-0000-000000000000')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: deliveries, error: deliveriesError } = await supabaseAdmin
      .from('pr_communication_deliveries')
      .select('id, channel, recipient_name, recipient_email, recipient_phone, status, error_message, sent_at')
      .eq('campaign_id', campaign.id)
      .order('recipient_name', { ascending: true })
    if (deliveriesError) return NextResponse.json({ error: deliveriesError.message }, { status: 500 })
    const origin = req.nextUrl.origin
    const attachmentUrl = campaign.attachment_access_token && campaign.attachment_expires_at && new Date(campaign.attachment_expires_at).getTime() > Date.now()
      ? `${origin}/api/communications/files/${campaign.attachment_access_token}`
      : null
    const whatsappDeliveries = (deliveries || []).map((delivery: any) => {
      if (delivery.channel !== 'whatsapp') return delivery
      const phone = phoneDigits(delivery.recipient_phone)
      const text = [`*${campaign.title}*\n${campaign.message}`, attachmentUrl ? `PDF: ${attachmentUrl}` : ''].filter(Boolean).join('\n\n')
      return { ...delivery, whatsapp_url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null, attachment_url: attachmentUrl }
    })
    return NextResponse.json({ campaign: { ...campaign, attachment_url: attachmentUrl }, deliveries: whatsappDeliveries })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
