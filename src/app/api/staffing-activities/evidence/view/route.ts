import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveCurrentActor } from '@/lib/currentActor'
import { createR2PresignedUrl } from '@/lib/r2Presign'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const actor = await resolveCurrentActor(session)
    const companyId = clean(actor?.companyId || session?.user?.companyId)
    if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

    const key = clean(req.nextUrl.searchParams.get('key'))
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

    const expectedPrefix = `staffing-activities/${companyId}/`
    if (!key.startsWith(expectedPrefix)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

    const download = createR2PresignedUrl({
      method: 'GET',
      bucket,
      accountId,
      key,
      accessKeyId,
      secretAccessKey,
      expiresInSeconds: 600,
    })

    return NextResponse.json({ url: download.url, expiresInSeconds: download.expiresInSeconds })
  } catch (err) {
    console.error('Error GET /api/staffing-activities/evidence/view', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
