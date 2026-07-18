import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { formatCommunicationFormRut, normalizeQuestions, normalizeResults, selectCommunicationFormResult, validateCommunicationFormAnswers, validateCommunicationFormIdentity, validateCommunicationFormSignature } from '@/lib/communicationForms'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const loadInvitation = async (token: string) => {
  const { data: invitation, error } = await supabaseAdmin
    .from('pr_communication_form_invitations')
    .select('id, form_id, collaborator_id, recipient_name, status, answers, result_id, opened_at, submitted_at, expires_at')
    .eq('access_token', token)
    .maybeSingle()
  if (error || !invitation) return { invitation: null, form: null, collaborator: null, error }
  const { data: form, error: formError } = await supabaseAdmin
    .from('pr_communication_forms')
    .select('id, company_id, title, description, status, questions, results')
    .eq('id', invitation.form_id)
    .maybeSingle()
  const collaboratorResult = invitation.collaborator_id
    ? await supabaseAdmin
      .from('pr_collaborators')
      .select('first_name, last_name, document, position, shift_pattern')
      .eq('id', invitation.collaborator_id)
      .maybeSingle()
    : { data: null, error: null }
  return { invitation, form, collaborator: collaboratorResult.data || null, error: formError || collaboratorResult.error }
}

const loadOpenForm = async (token: string) => {
  const { data: form, error } = await supabaseAdmin
    .from('pr_communication_forms')
    .select('id, company_id, title, description, status, questions, results')
    .eq('id', token)
    .maybeSingle()
  return { form, error }
}

const loadCompanyBrand = async (companyId: string) => {
  const { data } = await supabaseAdmin
    .from('pr_companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .maybeSingle()
  return {
    name: String(data?.name || '').trim() || 'Empresa',
    logo_url: String(data?.logo_url || '').trim() || null,
  }
}

const formUnavailable = (form: { status?: string } | null) => !form || form.status !== 'published'
const invitationUnavailable = (invitation: { status?: string; expires_at?: string | null } | null, form: { status?: string } | null) => {
  if (formUnavailable(form) || !invitation || invitation.status === 'revoked') return 'Esta invitación no está disponible.'
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) return 'Esta invitación ha expirado.'
  return null
}

const normalizedForm = (form: { questions?: unknown; results?: unknown }) => {
  const questions = normalizeQuestions(form.questions)
  const results = normalizeResults(form.results, new Set(questions.map((question) => question.id)))
  return { questions, results }
}

const resultPayload = (result: { id: string; title: string; description: string; file_name: string; content_type: string }, token: string) => ({
  id: result.id,
  title: result.title,
  description: result.description,
  file_name: result.file_name,
  content_type: result.content_type,
  file_url: `/api/public/communication-forms/${token}/file`,
})

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!UUID_RE.test(params.token || '')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const invitationResult = await loadInvitation(params.token)
    if (invitationResult.error) return NextResponse.json({ error: invitationResult.error.message }, { status: 500 })
    if (!invitationResult.invitation) {
      const openResult = await loadOpenForm(params.token)
      if (openResult.error) return NextResponse.json({ error: openResult.error.message }, { status: 500 })
      if (formUnavailable(openResult.form)) return NextResponse.json({ error: 'Este formulario no está disponible.' }, { status: 404 })
      const { questions } = normalizedForm(openResult.form!)
      const company = await loadCompanyBrand(openResult.form!.company_id)
      return NextResponse.json({
        company,
        form: { id: openResult.form!.id, title: openResult.form!.title, description: openResult.form!.description, questions },
        invitation: { recipient_name: '', status: 'pending', submitted_at: null },
        identity: { first_names: '', last_names: '', rut: '', position: '', shift: '' },
        result: null,
      })
    }

    const { invitation, form, collaborator } = invitationResult
    const unavailableMessage = invitationUnavailable(invitation, form)
    if (unavailableMessage) return NextResponse.json({ error: unavailableMessage }, { status: 404 })
    const { questions, results } = normalizedForm(form!)
    const company = await loadCompanyBrand(form!.company_id)
    const completed = invitation.status === 'completed'
    const result = completed ? results.find((candidate) => candidate.id === invitation.result_id) || null : null
    if (!completed && !invitation.opened_at) {
      await supabaseAdmin
        .from('pr_communication_form_invitations')
        .update({ status: 'opened', opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', invitation.id)
    }
    return NextResponse.json({
      company,
      form: { id: form!.id, title: form!.title, description: form!.description, questions },
      invitation: { recipient_name: invitation.recipient_name, status: completed ? 'completed' : 'pending', submitted_at: invitation.submitted_at },
      identity: {
        first_names: String(collaborator?.first_name || '').trim().toLocaleUpperCase('es-CL'),
        last_names: String(collaborator?.last_name || '').trim().toLocaleUpperCase('es-CL'),
        rut: formatCommunicationFormRut(collaborator?.document),
        position: String(collaborator?.position || '').trim().toLocaleUpperCase('es-CL'),
        shift: String(collaborator?.shift_pattern || '').trim().toLocaleUpperCase('es-CL'),
      },
      result: result ? resultPayload(result, params.token) : null,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!UUID_RE.test(params.token || '')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const invitationResult = await loadInvitation(params.token)
    if (invitationResult.error) return NextResponse.json({ error: invitationResult.error.message }, { status: 500 })
    const openResult = invitationResult.invitation ? null : await loadOpenForm(params.token)
    if (openResult?.error) return NextResponse.json({ error: openResult.error.message }, { status: 500 })
    const form = invitationResult.form || openResult?.form || null
    if (formUnavailable(form)) return NextResponse.json({ error: 'Este formulario no está disponible.' }, { status: 404 })
    if (invitationResult.invitation) {
      const unavailableMessage = invitationUnavailable(invitationResult.invitation, form)
      if (unavailableMessage) return NextResponse.json({ error: unavailableMessage }, { status: 404 })
      if (invitationResult.invitation.status === 'completed') return NextResponse.json({ error: 'Este formulario ya fue respondido.' }, { status: 409 })
    }

    const { questions, results } = normalizedForm(form!)
    const body = await req.json().catch(() => ({}))
    let identity
    let answers: Record<string, string | string[]>
    let signature: string
    try {
      identity = validateCommunicationFormIdentity(body?.identity)
      answers = validateCommunicationFormAnswers(questions, body?.answers)
      signature = validateCommunicationFormSignature(body?.signature)
    } catch (validationError) {
      return NextResponse.json({ error: validationError instanceof Error ? validationError.message : String(validationError) }, { status: 400 })
    }
    const result = selectCommunicationFormResult(results, answers)
    if (!result) return NextResponse.json({ error: 'El formulario no tiene un resultado configurado.' }, { status: 500 })
    const now = new Date().toISOString()

    if (!invitationResult.invitation) {
      const { data: existingResponse, error: existingError } = await supabaseAdmin
        .from('pr_communication_form_invitations')
        .select('id')
        .eq('form_id', form!.id)
        .contains('answers', { __identity: { rut: identity.rut } })
        .limit(1)
        .maybeSingle()
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
      if (existingResponse) return NextResponse.json({ error: 'Ya existe una respuesta asociada a este RUT.' }, { status: 409 })
      const compactRut = identity.rut.replace(/[^0-9K]/g, '')
      const rutBody = compactRut.slice(0, -1)
      const rutVerifier = compactRut.slice(-1)
      const documentCandidates = Array.from(new Set([identity.rut, `${rutBody}-${rutVerifier}`, compactRut]))
      const { data: collaborator } = await supabaseAdmin
        .from('pr_collaborators')
        .select('id, email, phone')
        .eq('company_id', form!.company_id)
        .in('document', documentCandidates)
        .limit(1)
        .maybeSingle()
      if (collaborator?.id) {
        const { data: assignedInvitation, error: assignedError } = await supabaseAdmin
          .from('pr_communication_form_invitations')
          .select('id, access_token, status, answers')
          .eq('form_id', form!.id)
          .eq('collaborator_id', collaborator.id)
          .maybeSingle()
        if (assignedError) return NextResponse.json({ error: assignedError.message }, { status: 500 })
        if (assignedInvitation?.status === 'completed') return NextResponse.json({ error: 'Ya existe una respuesta para este colaborador.' }, { status: 409 })
        if (assignedInvitation) {
          const { error: assignedUpdateError } = await supabaseAdmin
            .from('pr_communication_form_invitations')
            .update({
              status: 'completed',
              answers: { ...assignedInvitation.answers, ...answers, __identity: identity, __expected: true, __signature: signature },
              result_id: result.id,
              opened_at: now,
              submitted_at: now,
              updated_at: now,
            })
            .eq('id', assignedInvitation.id)
          if (assignedUpdateError) return NextResponse.json({ error: assignedUpdateError.message }, { status: 500 })
          return NextResponse.json({
            ok: true,
            response_token: assignedInvitation.access_token,
            invitation: { recipient_name: `${identity.first_names} ${identity.last_names}`.trim(), status: 'completed' },
            result: resultPayload(result, assignedInvitation.access_token),
          })
        }
      }
      const { data: response, error: insertError } = await supabaseAdmin
        .from('pr_communication_form_invitations')
        .insert({
          form_id: form!.id,
          collaborator_id: collaborator?.id || null,
          recipient_name: `${identity.first_names} ${identity.last_names}`.trim(),
          recipient_email: String(collaborator?.email || '').trim().toLowerCase() || null,
          recipient_phone: String(collaborator?.phone || '').trim() || null,
          status: 'completed',
          answers: { ...answers, __identity: identity, __signature: signature },
          result_id: result.id,
          opened_at: now,
          submitted_at: now,
          updated_at: now,
        })
        .select('access_token')
        .single()
      if (insertError || !response) {
        if (insertError?.code === '23505') return NextResponse.json({ error: 'Ya existe una respuesta para este colaborador.' }, { status: 409 })
        return NextResponse.json({ error: insertError?.message || 'No fue posible guardar la respuesta.' }, { status: 500 })
      }
      return NextResponse.json({
        ok: true,
        response_token: response.access_token,
        invitation: { recipient_name: `${identity.first_names} ${identity.last_names}`.trim(), status: 'completed' },
        result: resultPayload(result, response.access_token),
      })
    }

    const { error: updateError } = await supabaseAdmin
      .from('pr_communication_form_invitations')
      .update({ status: 'completed', answers: { ...invitationResult.invitation.answers, ...answers, __identity: identity, __signature: signature }, result_id: result.id, submitted_at: now, updated_at: now })
      .eq('id', invitationResult.invitation.id)
      .neq('status', 'completed')
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ ok: true, result: resultPayload(result, params.token) })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
