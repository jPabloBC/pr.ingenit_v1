import { NextRequest, NextResponse } from 'next/server'
import { getCommunicationsActor } from '@/lib/communications'
import { createR2PresignedUrl } from '@/lib/r2Presign'
import { COMMUNICATION_FORM_CONTENT_TYPES, COMMUNICATION_FORM_MAX_FILE_BYTES, resolveCommunicationFormContentType } from '@/lib/communicationForms'

const safeName = (value: string) => value.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(-160)

export async function POST(req: NextRequest) {
  try {
    const { actor, allowed, canManageForms } = await getCommunicationsActor()
    if (!actor?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed || !canManageForms || !actor.projectId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const fileName = safeName(String(body?.fileName || ''))
    const contentType = resolveCommunicationFormContentType(fileName, body?.contentType)
    const fileSize = Number(body?.fileSize || 0)
    if (!fileName || !COMMUNICATION_FORM_CONTENT_TYPES.has(contentType)) return NextResponse.json({ error: 'Formato no permitido.' }, { status: 400 })
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > COMMUNICATION_FORM_MAX_FILE_BYTES) return NextResponse.json({ error: 'El archivo debe pesar como máximo 100 MB.' }, { status: 400 })
    const bucket = process.env.R2_BUCKET_NAME
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return NextResponse.json({ error: 'R2 no está configurado.' }, { status: 500 })
    const key = `communication-forms/${actor.companyId}/${actor.projectId}/${Date.now()}-${fileName}`
    const upload = createR2PresignedUrl({ method: 'PUT', bucket, accountId, key, accessKeyId, secretAccessKey, expiresInSeconds: 900, contentType })
    return NextResponse.json({ upload_url: upload.url, key, expires_in_seconds: upload.expiresInSeconds })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
