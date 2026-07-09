import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireApiAccess } from '@/lib/apiAccess'

export const dynamic = 'force-dynamic'

const cleanText = (value: unknown) => {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
  return raw || null
}

const normalizeDate = (value: unknown) => String(value || '').trim().slice(0, 10)

const isMissingTableError = (error: any) =>
  String(error?.code || '') === '42P01' ||
  String(error?.message || '').toLowerCase().includes('does not exist')

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiAccess({ resource: 'collaborators' })
    if (!access.ok) return access.response

    const session = access.session
    const role = String(session.user.role || '').trim().toLowerCase()
    const sessionCompanyId = String(access.actor.companyId || '').trim()
    if (!sessionCompanyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const collaboratorId = String(body?.collaborator_id || '').trim()
    const validFrom = normalizeDate(body?.valid_from)
    const validTo = normalizeDate(body?.valid_to)
    const position = cleanText(body?.position)
    const specialty = cleanText(body?.specialty)
    const workerType = cleanText(body?.worker_type)?.toLowerCase() || null

    if (!collaboratorId) return NextResponse.json({ error: 'Falta colaborador' }, { status: 400 })
    if (!validFrom) return NextResponse.json({ error: 'Falta fecha desde' }, { status: 400 })
    if (validTo && validTo < validFrom) return NextResponse.json({ error: 'Fecha hasta no puede ser menor que fecha desde' }, { status: 400 })
    if (!position && !specialty && !workerType) return NextResponse.json({ error: 'Debes indicar cargo, especialidad o tipo' }, { status: 400 })

    let collabQuery = supabaseAdmin
      .from('pr_collaborators')
      .select('id, company_id')
      .eq('id', collaboratorId)
      .single()
    const { data: collab, error: collabError } = await collabQuery
    if (collabError || !collab) return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 })

    const companyId = String(collab.company_id || '')
    if (companyId !== sessionCompanyId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { data, error } = await supabaseAdmin
      .from('pr_collaborator_role_history')
      .insert({
        company_id: companyId,
        collaborator_id: collaboratorId,
        position,
        specialty,
        worker_type: workerType,
        valid_from: validFrom,
        valid_to: validTo || null,
        created_by: String(session.user.id || '').trim() || null,
      })
      .select()
      .single()

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: 'Falta crear tabla pr_collaborator_role_history' }, { status: 501 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, row: data })
  } catch (err) {
    console.error('Error POST /api/collaborators/role-history', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
