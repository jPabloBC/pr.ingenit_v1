import nodemailer from 'nodemailer'

let transporter: any | null = null

async function createTransporter() {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !port || !user || !pass) {
    const msg = 'SMTP not configured. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in your environment to enable email sending.'
    console.error('Mailer:', msg)
    throw new Error(msg)
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  })

  try {
    // Verify SMTP connection immediately so failures surface in dev logs
    await transporter.verify()
    console.info('Mailer: SMTP transporter verified')
  } catch (err) {
    console.error('Mailer: SMTP transporter verification failed', err)
    throw err
  }

  return transporter
}

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }) {
  const tx = await createTransporter()
  const info = await tx.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com',
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html
  })

  // Log send result so developers can see SMTP response in terminal
  try {
    console.info('Mailer: message sent', { messageId: info?.messageId, response: info?.response })
  } catch (e) {}

  return { info, previewUrl: null }
}
