type WhatsAppBridgeRecipient = { id: string; phone: string }
type WhatsAppBridgeResult = { id: string; status: 'sent' | 'failed'; provider_message_id?: string | null; error?: string }

const bridgeUrl = () => String(process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/$/, '')
const bridgeToken = () => String(process.env.WHATSAPP_BRIDGE_TOKEN || '')

export const isWhatsAppBridgeConfigured = () => Boolean(bridgeUrl() && bridgeToken())

export const sendWhatsAppBridgeMessages = async (input: {
  message: string
  recipients: WhatsAppBridgeRecipient[]
  attachmentUrl?: string | null
  attachmentName?: string | null
}) => {
  if (!isWhatsAppBridgeConfigured()) return { configured: false, results: [] as WhatsAppBridgeResult[] }
  const response = await fetch(`${bridgeUrl()}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridgeToken()}` },
    body: JSON.stringify({
      message: input.message,
      recipients: input.recipients.slice(0, 30),
      attachment_url: input.attachmentUrl || undefined,
      attachment_name: input.attachmentName || undefined,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(data?.error || 'El servicio de WhatsApp no respondió correctamente.'))
  return { configured: true, results: Array.isArray(data?.results) ? data.results as WhatsAppBridgeResult[] : [] }
}
