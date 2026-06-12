import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import { createR2PresignedUrl } from '@/lib/r2Presign'

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

    const download = createR2PresignedUrl({
      method: 'GET',
      bucket,
      accountId,
      key,
      accessKeyId,
      secretAccessKey,
      expiresInSeconds: 600
    })

    return NextResponse.json({ url: download.url, expiresInSeconds: download.expiresInSeconds })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
