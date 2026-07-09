import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sanitizeHtmlForPdf } from '@/lib/sanitizeHtml'

function requireRole(role: string) {
  return role === 'admin' || role === 'dev' || role === 'user'
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (!requireRole(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const html = sanitizeHtmlForPdf(String(body?.html || '').trim())
    const title = String(body?.title || 'reporte')
    if (!html) return NextResponse.json({ error: 'html es requerido' }, { status: 400 })

    const playwright = await import('playwright')
    let browser: any = null
    try {
      browser = await playwright.chromium.launch({
        headless: true,
        channel: 'chrome'
      })
    } catch {
      browser = await playwright.chromium.launch({ headless: true })
    }

    const page = await browser.newPage({
      viewport: { width: 2000, height: 2600 }
    })
    await page.route('**/*', async (route: any) => {
      const request = route.request()
      const url = request.url()
      const type = request.resourceType()
      if (url === 'about:blank' || url.startsWith('data:') || url.startsWith('blob:')) {
        return route.continue()
      }
      if (type === 'document') return route.continue()
      return route.abort()
    })
    await page.setJavaScriptEnabled(false)
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.emulateMedia({ media: 'screen' })

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format: 'A3',
      landscape: false,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' }
    })

    await page.close()
    await browser.close()

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err || 'Error generando PDF') }, { status: 500 })
  }
}
