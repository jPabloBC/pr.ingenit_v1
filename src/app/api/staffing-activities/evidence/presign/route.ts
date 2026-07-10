import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveCurrentActor } from '@/lib/currentActor'
import { createR2PresignedUrl } from '@/lib/r2Presign'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()

const sanitizeFileName = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(-120)

const sanitizePathPart = (value: unknown, fallback: string) => {
  const text = clean(value)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return text || fallback
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const actor = await resolveCurrentActor(session)
    const companyId = clean(actor?.companyId || session?.user?.companyId)
    if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

    const role = clean(actor?.role || session?.user?.role).toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const fileName = clean(body?.fileName ?? body?.filename)
    const contentType = clean(body?.contentType || 'application/octet-stream').slice(0, 128)
    const fileSize = Number(body?.fileSize ?? body?.size ?? 0)
    const activityClientId = sanitizePathPart(body?.activityClientId, 'general')
    const workDate = /^\d{4}-\d{2}-\d{2}$/.test(clean(body?.workDate)) ? clean(body?.workDate) : 'no-date'
    const normalizedContentType = contentType.toLowerCase()

    if (!fileName) return NextResponse.json({ error: 'Missing fileName' }, { status: 400 })
    if (!contentType.startsWith('image/')) return NextResponse.json({ error: 'Solo se permiten imagenes' }, { status: 400 })
    if (normalizedContentType.includes('svg')) {
      return NextResponse.json({ error: 'Formato de imagen no permitido' }, { status: 400 })
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

    const safeName = sanitizeFileName(fileName) || `staffing-evidence-${Date.now()}`
    const key = [
      'staffing-activities',
      companyId,
      workDate,
      activityClientId,
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
      contentType,
    })

    return NextResponse.json({
      uploadUrl: upload.url,
      key,
      expiresInSeconds: upload.expiresInSeconds,
    })
  } catch (err) {
    console.error('Error POST /api/staffing-activities/evidence/presign', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
