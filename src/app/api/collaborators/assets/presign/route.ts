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
    if (!(role === 'admin' || role === 'dev' || role === 'user')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const fileName = String(body?.fileName || '').trim()
    const contentType = String(body?.contentType || 'application/octet-stream').trim().slice(0, 128)
    const fileSize = Number(body?.fileSize || 0)
    const collaboratorId = String(body?.collaboratorId || '').trim()
    const assetType = String(body?.assetType || '').trim().toLowerCase()

    if (!fileName || !collaboratorId) {
      return NextResponse.json({ error: 'Missing fileName or collaboratorId' }, { status: 400 })
    }
    if (!(assetType === 'photo' || assetType === 'signature')) {
      return NextResponse.json({ error: 'Invalid assetType' }, { status: 400 })
    }
    if (!isSafeImageContentType(contentType)) return NextResponse.json({ error: 'Formato de imagen no permitido' }, { status: 400 })
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Tamano invalido. Maximo 5MB por imagen' }, { status: 400 })
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
    const safeName = sanitizeFileName(fileName) || `asset-${Date.now()}`
    const key = [
      'collaborators',
      companyId,
      collaboratorId,
      assetType,
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
