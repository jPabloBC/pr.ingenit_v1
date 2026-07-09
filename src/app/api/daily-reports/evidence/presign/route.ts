import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createR2PresignedUrl } from '@/lib/r2Presign'
import { isSafeImageContentType } from '@/lib/sanitizeHtml'

const sanitizeFileName = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(-120)

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = String(session?.user?.role || '').toLowerCase()
    if (!(role === 'admin' || role === 'dev')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const fileName = String(body?.fileName || '').trim()
    const contentType = String(body?.contentType || 'application/octet-stream').trim().slice(0, 128)
    const fileSize = Number(body?.fileSize || 0)
    const lineKey = String(body?.lineKey || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!fileName || !lineKey) return NextResponse.json({ error: 'Missing fileName or lineKey' }, { status: 400 })
    if (!isSafeImageContentType(contentType)) return NextResponse.json({ error: 'Formato de imagen no permitido' }, { status: 400 })
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Tamano invalido. Maximo 10MB por imagen' }, { status: 400 })
    }

    const bucket = process.env.R2_BUCKET_NAME
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
      return NextResponse.json({ error: 'R2 environment variables are missing' }, { status: 500 })
    }

    const companyId = String(session.user.companyId)
    const safeName = sanitizeFileName(fileName) || `evidence-${Date.now()}`
    const key = [
      'field-reports',
      companyId,
      'daily-reports',
      lineKey,
      `${Date.now()}-${safeName}`
    ].join('/')

    const upload = createR2PresignedUrl({
      method: 'PUT',
      bucket,
      accountId,
      key,
      accessKeyId,
      secretAccessKey,
      expiresInSeconds: 900,
      contentType
    })

    return NextResponse.json({
      uploadUrl: upload.url,
      key,
      expiresInSeconds: upload.expiresInSeconds
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
