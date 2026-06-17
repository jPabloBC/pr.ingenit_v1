const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const uniqueCleanIds = (ids: string[]) =>
  Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)))

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

export const isTurnoDailyStatus = (row: { status?: unknown; reason?: unknown }) =>
  normalize(row?.status) === 'turno' || normalize(row?.reason) === '11'

export type AvailableCollaboratorsParams = {
  supabaseAdmin: any
  companyId: string
  workDate: string
}

export type StaffingCollaboratorValidation = {
  validIds: string[]
  missingIds: string[]
  notInTurnoIds: string[]
  collaborators: any[]
}

export async function fetchTurnoCollaboratorIds(params: AvailableCollaboratorsParams) {
  const { data, error } = await params.supabaseAdmin
    .from('pr_collaborator_daily_status')
    .select('collaborator_id, status, reason')
    .eq('company_id', params.companyId)
    .eq('work_date', params.workDate)

  if (error) throw error

  return uniqueCleanIds(
    (data || [])
      .filter((row: any) => isTurnoDailyStatus(row))
      .map((row: any) => String(row?.collaborator_id || ''))
  )
}

export async function fetchAvailableCollaborators(params: AvailableCollaboratorsParams) {
  const turnoIds = await fetchTurnoCollaboratorIds(params)
  if (!turnoIds.length) return []

  const rows: any[] = []
  for (const ids of chunk(turnoIds, 75)) {
    const { data, error } = await params.supabaseAdmin
      .from('pr_collaborators')
      .select('id, company_id, first_name, last_name, document, position, specialty, worker_type, is_active, phone, email')
      .eq('company_id', params.companyId)
      .in('id', ids)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (error) throw error
    rows.push(...(data || []))
  }

  return rows
}

export async function validateCollaboratorsInTurno(
  params: AvailableCollaboratorsParams & { collaboratorIds: string[] }
): Promise<StaffingCollaboratorValidation> {
  const requestedIds = uniqueCleanIds(params.collaboratorIds)
  if (!requestedIds.length) {
    return { validIds: [], missingIds: [], notInTurnoIds: [], collaborators: [] }
  }

  const collaborators: any[] = []
  for (const ids of chunk(requestedIds, 75)) {
    const { data, error } = await params.supabaseAdmin
      .from('pr_collaborators')
      .select('id, company_id, first_name, last_name, document, position, specialty, worker_type, is_active')
      .eq('company_id', params.companyId)
      .in('id', ids)

    if (error) throw error
    collaborators.push(...(data || []))
  }

  const companyIds = new Set(collaborators.map((row: any) => String(row?.id || '').trim()).filter(Boolean))
  const turnoIds = new Set(await fetchTurnoCollaboratorIds(params))
  const missingIds = requestedIds.filter((id) => !companyIds.has(id))
  const notInTurnoIds = requestedIds.filter((id) => companyIds.has(id) && !turnoIds.has(id))
  const validIds = requestedIds.filter((id) => companyIds.has(id) && turnoIds.has(id))

  return { validIds, missingIds, notInTurnoIds, collaborators }
}
