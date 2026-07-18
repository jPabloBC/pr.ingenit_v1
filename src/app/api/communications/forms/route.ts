import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getCommunicationsActor } from '@/lib/communications'
import { normalizeQuestions, normalizeResults } from '@/lib/communicationForms'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()
const MAX_EXPECTED_COLLABORATORS = 300

export async function GET() {
  try {
    const { actor, allowed, canManageForms, canAdministerForms } = await getCommunicationsActor()
    if (!actor?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed || !canManageForms || !actor.projectId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    let formsQuery = supabaseAdmin
      .from('pr_communication_forms')
      .select('id, title, description, status, questions, results, created_at, updated_at')
      .eq('company_id', actor.companyId)
      .eq('project_id', actor.projectId)
      .order('created_at', { ascending: false })
    if (!canAdministerForms) formsQuery = formsQuery.eq('created_by', actor.userId)
    const { data: forms, error } = await formsQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const formIds = (forms || []).map((form) => form.id)
    const invitationsResult = formIds.length
      ? await supabaseAdmin
        .from('pr_communication_form_invitations')
        .select('id, form_id, collaborator_id, access_token, recipient_name, recipient_email, recipient_phone, status, answers, result_id, opened_at, submitted_at, expires_at')
        .in('form_id', formIds)
        .order('recipient_name', { ascending: true })
      : { data: [], error: null }
    if (invitationsResult.error) return NextResponse.json({ error: invitationsResult.error.message }, { status: 500 })
    const invitationCollaboratorIds = Array.from(new Set((invitationsResult.data || []).map((invitation) => clean(invitation.collaborator_id)).filter(Boolean)))
    const profilesResult = invitationCollaboratorIds.length ? await supabaseAdmin
      .from('pr_collaborators')
      .select('id, first_name, last_name, document, position, specialty, shift_pattern')
      .eq('company_id', actor.companyId)
      .in('id', invitationCollaboratorIds) : { data: [], error: null }
    if (profilesResult.error) return NextResponse.json({ error: profilesResult.error.message }, { status: 500 })
    const profilesById = new Map((profilesResult.data || []).map((profile) => [String(profile.id), profile]))
    const payload = (forms || []).map((form) => {
      const invitations = (invitationsResult.data || []).filter((invitation) => invitation.form_id === form.id)
      return {
        ...form,
        public_url: `/forms/${form.id}`,
        summary: {
          total: invitations.length,
          pending: invitations.filter((invitation) => invitation.status === 'pending' || invitation.status === 'opened').length,
          completed: invitations.filter((invitation) => invitation.status === 'completed').length,
          revoked: invitations.filter((invitation) => invitation.status === 'revoked').length,
          expected: invitations.filter((invitation) => invitation.answers?.__expected === true).length,
          expected_completed: invitations.filter((invitation) => invitation.answers?.__expected === true && invitation.status === 'completed').length,
          expected_pending: invitations.filter((invitation) => invitation.answers?.__expected === true && invitation.status !== 'completed' && invitation.status !== 'revoked').length,
          additional: invitations.filter((invitation) => invitation.answers?.__expected !== true && invitation.status === 'completed').length,
        },
        invitations: invitations.map((invitation) => ({
          ...invitation,
          expected_profile: invitation.answers?.__expected_profile || profilesById.get(String(invitation.collaborator_id || '')) || null,
          public_url: `/forms/${invitation.access_token}`,
        })),
      }
    })
    return NextResponse.json({ forms: payload, capabilities: { can_create: canManageForms, can_edit: canAdministerForms, can_delete: canAdministerForms, can_view_tracking: true } })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { actor, allowed, canManageForms } = await getCommunicationsActor()
    if (!actor?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed || !canManageForms) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!actor.projectId) return NextResponse.json({ error: 'Debes seleccionar un proyecto.' }, { status: 400 })
    const body = await req.json().catch(() => ({}))
    const title = clean(body?.title).slice(0, 160)
    const description = clean(body?.description).slice(0, 2000)
    const questions = normalizeQuestions(body?.questions)
    const questionIds = new Set(questions.map((question) => question.id))
    const results = normalizeResults(body?.results, questionIds)
    const collaboratorIds = Array.from(new Set((Array.isArray(body?.collaborator_ids) ? body.collaborator_ids : []).map(clean).filter(Boolean)))
    if (!title || results.length === 0) {
      return NextResponse.json({ error: 'Completa el título y los resultados.' }, { status: 400 })
    }
    if (questionIds.size !== questions.length || new Set(results.map((result) => result.id)).size !== results.length) {
      return NextResponse.json({ error: 'Las preguntas y resultados deben tener identificadores únicos.' }, { status: 400 })
    }
    if (results.filter((result) => result.is_default).length !== 1 || results.some((result) => !result.is_default && result.conditions.length === 0)) {
      return NextResponse.json({ error: 'Debe existir un único resultado predeterminado y cada resultado alternativo necesita una condición.' }, { status: 400 })
    }
    const questionsById = new Map(questions.map((question) => [question.id, question]))
    const hasInvalidCondition = results.some((result) => result.conditions.some((condition) => {
      const question = questionsById.get(condition.question_id)
      if (!question) return true
      if (question.type === 'multiple_choice' ? condition.operator !== 'includes' : condition.operator !== 'equals') return true
      return question.type !== 'text' && !question.options.includes(condition.value)
    }))
    if (hasInvalidCondition) return NextResponse.json({ error: 'Una condición no coincide con la pregunta u opción configurada.' }, { status: 400 })
    if (results.some((result) => !result.file_key.startsWith(`communication-forms/${actor.companyId}/${actor.projectId}/`))) {
      return NextResponse.json({ error: 'Uno de los archivos no pertenece al proyecto actual.' }, { status: 403 })
    }
    if (collaboratorIds.length > MAX_EXPECTED_COLLABORATORS) return NextResponse.json({ error: `Máximo ${MAX_EXPECTED_COLLABORATORS} colaboradores esperados.` }, { status: 400 })
    const collaboratorsResult = collaboratorIds.length ? await supabaseAdmin
      .from('pr_collaborators')
      .select('id, first_name, last_name, document, position, specialty, shift_pattern, email, phone')
      .eq('company_id', actor.companyId)
      .eq('is_active', true)
      .in('id', collaboratorIds) : { data: [], error: null }
    if (collaboratorsResult.error) return NextResponse.json({ error: collaboratorsResult.error.message }, { status: 500 })
    if ((collaboratorsResult.data || []).length !== collaboratorIds.length) return NextResponse.json({ error: 'Uno o más colaboradores esperados no están activos o no pertenecen a la empresa.' }, { status: 400 })
    const { data: form, error: formError } = await supabaseAdmin
      .from('pr_communication_forms')
      .insert({ company_id: actor.companyId, project_id: actor.projectId, title, description, status: 'published', questions, results, created_by: actor.userId || null })
      .select('id, title')
      .single()
    if (formError || !form) return NextResponse.json({ error: formError?.message || 'No fue posible crear el formulario.' }, { status: 500 })
    if ((collaboratorsResult.data || []).length) {
      const expectedRows = (collaboratorsResult.data || []).map((collaborator) => ({
        form_id: form.id,
        collaborator_id: collaborator.id,
        recipient_name: `${clean(collaborator.first_name)} ${clean(collaborator.last_name)}`.replace(/\s+/g, ' ').trim() || 'Colaborador',
        recipient_email: clean(collaborator.email).toLowerCase() || null,
        recipient_phone: clean(collaborator.phone) || null,
        status: 'pending',
        answers: {
          __expected: true,
          __expected_profile: {
            first_name: clean(collaborator.first_name),
            last_name: clean(collaborator.last_name),
            document: clean(collaborator.document),
            position: clean(collaborator.position),
            specialty: clean(collaborator.specialty),
            shift_pattern: clean(collaborator.shift_pattern),
          },
        },
      }))
      const { error: expectedError } = await supabaseAdmin.from('pr_communication_form_invitations').insert(expectedRows)
      if (expectedError) {
        await supabaseAdmin.from('pr_communication_forms').delete().eq('id', form.id)
        return NextResponse.json({ error: expectedError.message }, { status: 500 })
      }
    }
    return NextResponse.json({
      form,
      public_url: `/forms/${form.id}`,
      expected_count: collaboratorIds.length,
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
