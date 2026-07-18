type WhatsAppBridgeRecipient = { id: string; phone: string }
type WhatsAppBridgeResult = { id: string; status: 'sent' | 'failed'; provider_message_id?: string | null; error?: string }

const bridgeUrl = () => String(process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/$/, '')
const bridgeToken = () => String(process.env.WHATSAPP_BRIDGE_TOKEN || '')
const bridgeBatchSize = () => {
  const configured = Number(process.env.WHATSAPP_BATCH_SIZE || 10)
  return Number.isFinite(configured) ? Math.min(Math.max(Math.trunc(configured), 1), 50) : 10
}

const chunksOf = <T,>(values: T[], size: number) => {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

export const isWhatsAppBridgeConfigured = () => Boolean(bridgeUrl() && bridgeToken())

export const sendWhatsAppBridgeMessages = async (input: {
  message: string
  recipients: WhatsAppBridgeRecipient[]
  attachmentUrl?: string | null
  attachmentName?: string | null
}) => {
  if (!isWhatsAppBridgeConfigured()) return { configured: false, results: [] as WhatsAppBridgeResult[] }
  const results: WhatsAppBridgeResult[] = []
  const batches = chunksOf(input.recipients, bridgeBatchSize())

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]
    try {
      const response = await fetch(`${bridgeUrl()}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridgeToken()}` },
        body: JSON.stringify({
          message: input.message,
          recipients: batch,
          attachment_url: input.attachmentUrl || undefined,
          attachment_name: input.attachmentName || undefined,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(120_000),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(data?.error || 'El servicio de WhatsApp no respondió correctamente.'))

      const batchIds = new Set(batch.map((recipient) => recipient.id))
      const returned = (Array.isArray(data?.results) ? data.results : [])
        .filter((result: WhatsAppBridgeResult) => batchIds.has(String(result?.id || '')) && (result?.status === 'sent' || result?.status === 'failed')) as WhatsAppBridgeResult[]
      const returnedIds = new Set(returned.map((result) => result.id))
      results.push(...returned)
      results.push(...batch.filter((recipient) => !returnedIds.has(recipient.id)).map((recipient) => ({
        id: recipient.id,
        status: 'failed' as const,
        error: 'El bridge no devolvió resultado para este destinatario.',
      })))
    } catch (error) {
      if (batchIndex === 0) throw error
      const errorMessage = error instanceof Error ? error.message : String(error)
      const pendingRecipients = batches.slice(batchIndex).flat()
      results.push(...pendingRecipients.map((recipient) => ({ id: recipient.id, status: 'failed' as const, error: errorMessage })))
      break
    }
  }

  return { configured: true, results }
}
