import nodemailer from 'nodemailer'

let notificationTransporter: any | null = null

const getEnv = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return undefined
}

const envNames = {
  host: ['NOTIFICATION_SMTP_HOST', 'PUGAMUJICA_SMTP_HOST', 'SMTP_HOST'],
  port: ['NOTIFICATION_SMTP_PORT', 'PUGAMUJICA_SMTP_PORT', 'SMTP_PORT'],
  secure: ['NOTIFICATION_SMTP_SECURE', 'PUGAMUJICA_SMTP_SECURE', 'SMTP_SECURE'],
  user: ['NOTIFICATION_SMTP_USER', 'PUGAMUJICA_SMTP_USER', 'SMTP_USER'],
  pass: ['NOTIFICATION_SMTP_PASS', 'PUGAMUJICA_SMTP_PASS', 'SMTP_PASS'],
  from: ['NOTIFICATION_SMTP_FROM', 'PUGAMUJICA_SMTP_FROM', 'SMTP_FROM'],
}

async function createNotificationTransporter() {
  if (notificationTransporter) return notificationTransporter

  const host = getEnv(...envNames.host)
  const port = Number(getEnv(...envNames.port) || 0)
  const secureEnv = getEnv(...envNames.secure)
  const user = getEnv(...envNames.user)
  const pass = getEnv(...envNames.pass)

  if (!host || !port || !user || !pass) {
    throw new Error('Notification SMTP not configured. Set SMTP_* environment variables.')
  }

  const tx = nodemailer.createTransport({
    host,
    port,
    secure: secureEnv ? secureEnv === 'true' : port === 465,
    auth: { user, pass },
  })

  await tx.verify()
  notificationTransporter = tx
  return notificationTransporter
}

export async function sendNotificationMail(opts: {
  to: string
  subject: string
  html: string
  text?: string
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string; encoding?: string }>
}) {
  const tx = await createNotificationTransporter()
  const from = getEnv(...envNames.from) || getEnv(...envNames.user)

  return tx.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  })
}
