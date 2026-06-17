export type StaffingWorkerInput = {
  collaborator_id: string
  role: string | null
  is_override: boolean
  override_reason: string | null
  metadata: Record<string, any>
}

export type StaffingActivityInput = {
  program_activity_id: string | null
  activity: string
  area: string | null
  unit: string | null
  quantity: number | null
  user_detail: string | null
  display_order: number | null
  metadata: Record<string, any>
}

export type ValidatedStaffingPayload = {
  work_date: string
  project_id: string | null
  work_front_id: string | null
  work_front_name: string | null
  crew_name: string | null
  specialty: string | null
  field_boss_id: string | null
  workers: StaffingWorkerInput[]
  activities: StaffingActivityInput[]
  metadata: Record<string, any>
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const clean = (value: unknown) => String(value ?? '').trim()

const nullableText = (value: unknown) => {
  const text = clean(value)
  return text || null
}

const asObject = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, any>
}

const collaboratorIdFromValue = (value: any) =>
  clean(
    typeof value === 'string'
      ? value
      : value?.collaborator_id || value?.collaboratorId || value?.id
  )

export const isValidYmdDate = (value: unknown): value is string => {
  const date = clean(value)
  if (!DATE_RE.test(date)) return false
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

const uniqueByCollaboratorId = (workers: StaffingWorkerInput[]) => {
  const seen = new Set<string>()
  const out: StaffingWorkerInput[] = []
  workers.forEach((worker) => {
    const id = clean(worker.collaborator_id)
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push({ ...worker, collaborator_id: id })
  })
  return out
}

const normalizeWorker = (value: any, defaultRole: string | null = null): StaffingWorkerInput | null => {
  const collaboratorId = collaboratorIdFromValue(value)
  if (!collaboratorId) return null
  return {
    collaborator_id: collaboratorId,
    role: nullableText(typeof value === 'string' ? defaultRole : value?.role ?? defaultRole),
    is_override: Boolean(value?.is_override ?? value?.isOverride ?? false),
    override_reason: nullableText(value?.override_reason ?? value?.overrideReason),
    metadata: asObject(value?.metadata),
  }
}

const normalizeWorkerList = (source: unknown, defaultRole: string | null = null) => {
  if (!Array.isArray(source)) return []
  return source
    .map((worker: any) => normalizeWorker(worker, defaultRole))
    .filter(Boolean) as StaffingWorkerInput[]
}

const normalizeActivity = (value: any, index: number): StaffingActivityInput | null => {
  const activity = nullableText(value?.activity ?? value?.name ?? value?.title)
  if (!activity) return null

  const rawQuantity = value?.quantity
  const quantity =
    rawQuantity === undefined || rawQuantity === null || clean(rawQuantity) === ''
      ? null
      : Number(rawQuantity)

  if (quantity !== null && !Number.isFinite(quantity)) {
    throw new Error(`Cantidad inválida en actividad ${index + 1}`)
  }

  const rawOrder = value?.display_order ?? value?.displayOrder
  const displayOrder =
    rawOrder === undefined || rawOrder === null || clean(rawOrder) === ''
      ? index + 1
      : Math.trunc(Number(rawOrder))

  if (!Number.isFinite(displayOrder)) {
    throw new Error(`Orden inválido en actividad ${index + 1}`)
  }

  return {
    program_activity_id: nullableText(value?.program_activity_id ?? value?.programActivityId ?? value?.activity_id),
    activity,
    area: nullableText(value?.area),
    unit: nullableText(value?.unit),
    quantity,
    user_detail: nullableText(value?.user_detail ?? value?.userDetail ?? value?.detail),
    display_order: displayOrder,
    metadata: asObject(value?.metadata),
  }
}

export function validateStaffingPayload(body: any): ValidatedStaffingPayload {
  const workDate = clean(body?.work_date ?? body?.workDate ?? body?.date)
  if (!workDate) throw new Error('work_date requerido')
  if (!isValidYmdDate(workDate)) throw new Error('work_date debe usar formato YYYY-MM-DD')

  const activitiesSource = Array.isArray(body?.activities)
    ? body.activities
    : Array.isArray(body?.activity_logs)
      ? body.activity_logs
      : []

  const workers = uniqueByCollaboratorId([
    ...normalizeWorkerList(body?.workers),
    ...normalizeWorkerList(body?.collaborators),
    ...normalizeWorkerList(body?.collaborator_ids),
    ...normalizeWorkerList(body?.members, 'member'),
    ...normalizeWorkerList(body?.member_ids, 'member'),
    ...normalizeWorkerList(body?.foremen, 'foreman'),
    ...normalizeWorkerList(body?.foreman_ids, 'foreman'),
    ...normalizeWorkerList(body?.supervisors, 'supervisor'),
    ...normalizeWorkerList(body?.supervisor_ids, 'supervisor'),
  ])

  const activities = activitiesSource
    .map((activity: any, index: number) => normalizeActivity(activity, index))
    .filter(Boolean) as StaffingActivityInput[]

  return {
    work_date: workDate,
    project_id: nullableText(body?.project_id ?? body?.projectId),
    work_front_id: nullableText(body?.work_front_id ?? body?.workFrontId),
    work_front_name: nullableText(body?.work_front_name ?? body?.workFrontName),
    crew_name: nullableText(body?.crew_name ?? body?.crewName ?? body?.name),
    specialty: nullableText(body?.specialty),
    field_boss_id: nullableText(body?.field_boss_id ?? body?.fieldBossId ?? collaboratorIdFromValue(body?.field_boss ?? body?.fieldBoss)),
    workers,
    activities,
    metadata: asObject(body?.metadata),
  }
}
