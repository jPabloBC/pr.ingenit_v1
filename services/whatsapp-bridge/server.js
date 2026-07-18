import http from 'node:http'
import process from 'node:process'
import whatsapp from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'

const { Client, LocalAuth, MessageMedia } = whatsapp

const port = Number(process.env.PORT || 3101)
const token = String(process.env.WHATSAPP_BRIDGE_TOKEN || '')
const authPath = String(process.env.WHATSAPP_AUTH_PATH || '.wwebjs_auth')
const allowedMediaOrigin = String(process.env.WHATSAPP_ALLOWED_MEDIA_ORIGIN || '')
const maxRecipients = Math.min(Math.max(Number(process.env.WHATSAPP_MAX_RECIPIENTS || 10), 1), 50)
const headless = process.env.WHATSAPP_HEADLESS !== 'false'

if (!token) throw new Error('WHATSAPP_BRIDGE_TOKEN is required.')

let latestQr = null
let ready = false
let startingError = null

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'pr-ingenit', dataPath: authPath }),
  puppeteer: {
    headless,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
})

client.on('authenticated', () => console.info('WhatsApp autenticado.'))
client.on('loading_screen', (percent, message) => console.info(`Cargando WhatsApp Web: ${percent}%${message ? ` (${message})` : ''}`))
client.on('change_state', (state) => console.info(`Estado de WhatsApp Web: ${state}`))

client.on('qr', (qr) => {
  latestQr = qr
  ready = false
  console.info('Escanea este QR con el WhatsApp remitente:')
  qrcode.generate(qr, { small: true })
})

client.on('ready', () => {
  latestQr = null
  ready = true
  startingError = null
  console.info('WhatsApp bridge listo.')
})

client.on('auth_failure', (message) => {
  ready = false
  startingError = `Authentication failed: ${message}`
  console.error(startingError)
})

client.on('disconnected', (reason) => {
  ready = false
  console.warn(`WhatsApp disconnected: ${reason}`)
})

console.info(`Inicializando WhatsApp Web (${headless ? 'oculto' : 'visible'})...`)
client.initialize().catch((error) => {
  startingError = error instanceof Error ? error.message : String(error)
  console.error(error)
})

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const authorized = (req) => req.headers.authorization === `Bearer ${token}`

const readBody = async (req) => new Promise((resolve, reject) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > 100_000) reject(new Error('Payload too large.'))
  })
  req.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}) } catch { reject(new Error('Invalid JSON.')) }
  })
  req.on('error', reject)
})

const normalizePhone = (value) => String(value || '').replace(/\D/g, '')
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const isTransientWhatsAppError = (error) => /detached frame|execution context was destroyed|target closed|navigation/i.test(
  error instanceof Error ? error.message : String(error),
)

const sendMessageWithRetry = async (chatId, content, options) => {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await client.sendMessage(chatId, content, options)
    } catch (error) {
      lastError = error
      if (attempt === 2 || !isTransientWhatsAppError(error)) throw error
      console.warn(`WhatsApp Web se recargó; reintentando envío (${attempt}/2)...`)
      await wait(2_000)
    }
  }
  throw lastError
}

const mediaFromUrl = async (mediaUrl, filename) => {
  if (!mediaUrl) return null
  const parsed = new URL(mediaUrl)
  if (!allowedMediaOrigin || parsed.origin !== allowedMediaOrigin) throw new Error('Unapproved attachment origin.')
  const response = await fetch(parsed, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('Could not download the attachment.')
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/pdf')) throw new Error('Only PDF attachments are allowed.')
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length === 0 || data.length > 10 * 1024 * 1024) throw new Error('Invalid attachment size.')
  return new MessageMedia('application/pdf', data.toString('base64'), filename || 'documento.pdf')
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true })
  if (!authorized(req)) return sendJson(res, 401, { error: 'Unauthorized' })
  if (req.method === 'GET' && url.pathname === '/v1/status') return sendJson(res, 200, { ready, qr_available: Boolean(latestQr), max_recipients: maxRecipients, error: startingError })
  if (req.method !== 'POST' || url.pathname !== '/v1/messages') return sendJson(res, 404, { error: 'Not found' })
  if (!ready) return sendJson(res, 503, { error: 'WhatsApp is not ready. Scan the QR on the bridge host first.' })

  try {
    const body = await readBody(req)
    const message = String(body.message || '').trim().slice(0, 4_000)
    const recipients = Array.isArray(body.recipients) ? body.recipients : []
    if (!message || !recipients.length) return sendJson(res, 400, { error: 'Message and recipients are required.' })
    if (recipients.length > maxRecipients) return sendJson(res, 400, { error: `A maximum of ${maxRecipients} recipients is allowed per batch.` })
    const media = await mediaFromUrl(body.attachment_url, body.attachment_name)
    const results = []
    for (const recipient of recipients) {
      const phone = normalizePhone(recipient.phone)
      if (!phone) {
        results.push({ id: recipient.id, status: 'failed', error: 'Invalid phone number.' })
        continue
      }
      try {
        const sent = await sendMessageWithRetry(`${phone}@c.us`, media || message, media ? { caption: message } : undefined)
        const providerMessageId = typeof sent?.id?._serialized === 'string' ? sent.id._serialized : null
        results.push({ id: recipient.id, status: 'sent', provider_message_id: providerMessageId })
        console.info(`WhatsApp enviado a ${phone}.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`No se pudo registrar el envio a ${phone}: ${message}`)
        results.push({ id: recipient.id, status: 'failed', error: message })
      }
    }
    return sendJson(res, 200, { results })
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(port, () => console.info(`WhatsApp bridge listening on ${port}.`))

const shutdown = async () => {
  server.close()
  await client.destroy().catch(() => undefined)
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
