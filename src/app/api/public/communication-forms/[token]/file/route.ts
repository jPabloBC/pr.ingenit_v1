import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createR2PresignedUrl } from '@/lib/r2Presign'
import { normalizeQuestions, normalizeResults } from '@/lib/communicationForms'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!UUID_RE.test(params.token || '')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: invitation, error } = await supabaseAdmin
      .from('pr_communication_form_invitations')
      .select('form_id, status, result_id, expires_at')
      .eq('access_token', params.token)
      .maybeSingle()
    if (error || !invitation || invitation.status !== 'completed' || !invitation.result_id) return NextResponse.json({ error: 'Resultado no disponible.' }, { status: 404 })
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'La invitación ha expirado.' }, { status: 410 })
    const { data: form, error: formError } = await supabaseAdmin
      .from('pr_communication_forms')
      .select('status, questions, results')
      .eq('id', invitation.form_id)
      .maybeSingle()
    if (formError || !form || form.status !== 'published') return NextResponse.json({ error: 'Resultado no disponible.' }, { status: 404 })
    const questions = normalizeQuestions(form.questions)
    const results = normalizeResults(form.results, new Set(questions.map((question) => question.id)))
    const result = results.find((candidate) => candidate.id === invitation.result_id)
    if (!result) return NextResponse.json({ error: 'Resultado no disponible.' }, { status: 404 })
    const bucket = process.env.R2_BUCKET_NAME
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 500 })
    const signed = createR2PresignedUrl({ method: 'GET', bucket, accountId, key: result.file_key, accessKeyId, secretAccessKey, expiresInSeconds: 300 })
    const download = await fetch(signed.url, { cache: 'no-store' })
    if (!download.ok || !download.body) return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 404 })
    const inline = result.content_type === 'application/pdf' || result.content_type.startsWith('video/') || result.content_type.startsWith('audio/')
    return new NextResponse(download.body, {
      headers: {
        'Content-Type': result.content_type,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${result.file_name.replace(/["\r\n]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 500 })
  }
}
