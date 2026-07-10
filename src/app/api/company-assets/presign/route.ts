import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createR2PresignedUrl } from '@/lib/r2Presign'

const sanitizeFileName = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(-120)

const sanitizeKeyPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = String(session?.user?.role || '').toLowerCase()
    if (!(role === 'admin' || role === 'dev')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const fileName = String(body?.fileName || '').trim()
    const contentType = String(body?.contentType || 'application/octet-stream').trim().slice(0, 128)
    const fileSize = Number(body?.fileSize || 0)
    const assetType = sanitizeKeyPart(String(body?.assetType || 'general'))
    const usageContext = sanitizeKeyPart(String(body?.usageContext || 'general'))

    if (!fileName) return NextResponse.json({ error: 'Missing fileName' }, { status: 400 })
    if (!assetType) return NextResponse.json({ error: 'Missing assetType' }, { status: 400 })
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Solo se permiten imagenes' }, { status: 400 })
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Tamano invalido. Maximo 10MB por imagen' }, { status: 400 })
    }

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
      return NextResponse.json({ error: 'R2 environment variables are missing', missing }, { status: 500 })
    }

    const companyId = String(session.user.companyId)
    const safeName = sanitizeFileName(fileName) || `company-asset-${Date.now()}`
    const key = [
      'company-assets',
      companyId,
      assetType,
      usageContext || 'general',
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
      bucket,
      expiresInSeconds: upload.expiresInSeconds
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
