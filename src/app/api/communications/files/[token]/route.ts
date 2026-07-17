import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createR2PresignedUrl } from '@/lib/r2Presign'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!UUID_RE.test(String(params.token || ''))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: campaign, error } = await supabaseAdmin
      .from('pr_communication_campaigns')
      .select('attachment_r2_key, attachment_expires_at')
      .eq('attachment_access_token', params.token)
      .maybeSingle()
    if (error || !campaign?.attachment_r2_key || !campaign.attachment_expires_at || new Date(campaign.attachment_expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'El enlace ya no está disponible.' }, { status: 404 })
    const bucket = process.env.R2_BUCKET_NAME
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 500 })
    const signed = createR2PresignedUrl({ method: 'GET', bucket, accountId, key: campaign.attachment_r2_key, accessKeyId, secretAccessKey, expiresInSeconds: 300 })
    const download = await fetch(signed.url, { cache: 'no-store' })
    if (!download.ok || !download.body) return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 404 })
    return new NextResponse(download.body, {
      headers: {
        'Content-Type': download.headers.get('content-type') || 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 500 })
  }
}
