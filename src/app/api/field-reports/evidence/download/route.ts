import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import { createR2PresignedUrl } from '@/lib/r2Presign'

const sanitizeFileName = (value: string) =>
  String(value || 'imagen')
    .replace(/["'<>:\\|?*\u0000-\u001F]/g, '_')
    .trim() || 'imagen'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const key = String(req.nextUrl.searchParams.get('key') || '').trim()
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

    const bucket = process.env.R2_BUCKET_NAME
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
      const missing = [
        !bucket ? 'R2_BUCKET_NAME' : '',
        !accountId ? 'R2_ACCOUNT_ID' : '',
        !accessKeyId ? 'R2_ACCESS_KEY_ID' : '',
        !secretAccessKey ? 'R2_SECRET_ACCESS_KEY' : ''
      ].filter(Boolean)
      return NextResponse.json(
        { error: 'R2 environment variables are missing', missing },
        { status: 500 }
      )
    }

    const companyId = String(session.user.companyId)
    const expectedPrefix = `field-reports/${companyId}/`
    if (!key.startsWith(expectedPrefix)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const presigned = createR2PresignedUrl({
      method: 'GET',
      bucket,
      accountId,
      key,
      accessKeyId,
      secretAccessKey,
      expiresInSeconds: 600
    })

    const r2Res = await fetch(presigned.url, { cache: 'no-store' })
    if (!r2Res.ok) {
      const text = await r2Res.text().catch(() => '')
      return NextResponse.json({ error: 'Failed to fetch file from storage', status: r2Res.status, detail: text }, { status: 502 })
    }

    const requestedName = String(req.nextUrl.searchParams.get('name') || '').trim()
    const keyName = key.split('/').pop() || 'imagen'
    const fileName = sanitizeFileName(requestedName || keyName)
    const contentType = r2Res.headers.get('content-type') || 'application/octet-stream'

    return new NextResponse(r2Res.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

