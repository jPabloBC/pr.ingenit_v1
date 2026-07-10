type InternalNotificationEmailInput = {
  title: string
  body: string
  actionUrl: string
  logoDataUrl?: string | null
}

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export function internalNotificationEmail({ title, body, actionUrl, logoDataUrl }: InternalNotificationEmailInput) {
  const appName = process.env.APP_NAME || 'IngenIT'
  const safeTitle = escapeHtml(title)
  const safeBody = escapeHtml(body)
  const safeUrl = escapeHtml(actionUrl)
  const safeLogoDataUrl = logoDataUrl && logoDataUrl.startsWith('data:image/') ? logoDataUrl : ''
  const subject = `${appName} - ${title}`

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>${safeTitle}</title>
    </head>
    <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:0;background:#f6f9fc;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:20px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(16,24,40,.08);">
              <tr>
                <td style="padding:24px 32px">
                  <h1 style="margin:0 0 12px;font-size:20px;color:#334155;font-weight:600">${safeTitle}</h1>
                  <p style="margin:0 0 20px;color:#475569;line-height:1.5">${safeBody}</p>
                  <p style="text-align:center;margin:24px 0">
                    <a href="${safeUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Ver en plataforma</a>
                  </p>
                  <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;text-align:center">Si el botón no funciona, pega este enlace en tu navegador:</p>
                  <p style="word-break:break-all;color:#0f172a;font-size:13px;text-align:center">${safeUrl}</p>
                  ${safeLogoDataUrl ? `<div style="border-top:1px solid #e2e8f0;margin:24px 0 0;padding-top:18px;text-align:center"><img src="${safeLogoDataUrl}" alt="${escapeHtml(appName)}" style="display:inline-block;max-width:220px;max-height:72px;width:auto;height:auto;border:0" /></div>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = `${title}\n\n${body}\n\nVer en plataforma: ${actionUrl}`

  return { subject, html, text }
}
