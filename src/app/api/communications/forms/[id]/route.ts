import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getCommunicationsActor } from '@/lib/communications'
import { normalizeQuestions, normalizeResults } from '@/lib/communicationForms'
import { createR2PresignedUrl } from '@/lib/r2Presign'

const clean = (value: unknown) => String(value || '').trim()
const STATUSES = new Set(['draft', 'published', 'archived'])

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { actor, allowed, canAdministerForms } = await getCommunicationsActor()
    if (!actor?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed || !canAdministerForms || !actor.projectId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const title = clean(body?.title).slice(0, 160)
    const description = clean(body?.description).slice(0, 2000)
    const status = clean(body?.status)
    if (!title || !STATUSES.has(status)) return NextResponse.json({ error: 'Título o estado inválido.' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('pr_communication_forms')
      .update({ title, description, status, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('company_id', actor.companyId)
      .eq('project_id', actor.projectId)
      .select('id, title, description, status, updated_at')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Formulario no encontrado.' }, { status: 404 })
    return NextResponse.json({ form: data })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { actor, allowed, canAdministerForms } = await getCommunicationsActor()
    if (!actor?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed || !canAdministerForms || !actor.projectId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data: form, error: loadError } = await supabaseAdmin
      .from('pr_communication_forms')
      .select('id, questions, results')
      .eq('id', params.id)
      .eq('company_id', actor.companyId)
      .eq('project_id', actor.projectId)
      .maybeSingle()
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
    if (!form) return NextResponse.json({ error: 'Formulario no encontrado.' }, { status: 404 })
    const questions = normalizeQuestions(form.questions)
    const results = normalizeResults(form.results, new Set(questions.map((question) => question.id)))
    const { error } = await supabaseAdmin
      .from('pr_communication_forms')
      .delete()
      .eq('id', form.id)
      .eq('company_id', actor.companyId)
      .eq('project_id', actor.projectId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const bucket = process.env.R2_BUCKET_NAME
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (bucket && accountId && accessKeyId && secretAccessKey) {
      await Promise.allSettled(results.map((result) => {
        const signed = createR2PresignedUrl({ method: 'DELETE', bucket, accountId, key: result.file_key, accessKeyId, secretAccessKey, expiresInSeconds: 300 })
        return fetch(signed.url, { method: 'DELETE' })
      }))
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
