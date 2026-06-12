export function resetPasswordEmail({ name, resetUrl }: { name?: string; resetUrl: string }) {
  const appName = process.env.APP_NAME || 'IngenIT'
  const subject = `${appName} - Restablece tu contraseña`

  const safeName = name ? `Hola ${name},` : 'Hola,'

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>${subject}</title>
    </head>
    <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:0;background:#f6f9fc;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:20px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(16,24,40,.08);">
              <tr>
                <td style="padding:24px 32px">
                  <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">${appName}</h1>
                  <p style="margin:0 0 16px;color:#475569">${safeName}</p>
                  <p style="margin:0 0 20px;color:#475569">Solicitaste restablecer tu contraseña. Haz clic en el botón de abajo para continuar. El enlace expirará en 1 hora.</p>
                  <p style="text-align:center;margin:24px 0">
                    <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Restablecer contraseña</a>
                  </p>
                  <p style="margin:0 0 12px;color:#94a3b8;font-size:13px">Si el botón no funciona, pega este enlace en tu navegador:</p>
                  <p style="word-break:break-all;color:#0f172a;font-size:13px">${resetUrl}</p>
                  <hr style="border:none;border-top:1px solid #eef2f7;margin:24px 0" />
                  <p style="color:#94a3b8;font-size:12px;margin:0">Si no solicitaste este cambio, puedes ignorar este correo.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = `${name ? `Hola ${name},\n\n` : 'Hola,\n\n'}Solicitaste restablecer tu contraseña. Abre este enlace para continuar: ${resetUrl}\n\nSi no solicitaste esto, ignora este mensaje.`

  return { subject, html, text }
}
