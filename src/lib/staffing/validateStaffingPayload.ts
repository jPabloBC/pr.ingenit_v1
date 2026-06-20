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
  activity_start_time: string | null
  activity_end_time: string | null
  activity_observations: string | null
  restrictions: string | null
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
  supervisor_id: string | null
  foreman_id: string | null
  supervisor_ids: string[]
  foreman_ids: string[]
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

const normalizeRole = (value: unknown) => {
  const role = clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (!role) return null
  if (role.includes('supervisor')) return 'supervisor'
  if (role.includes('foreman') || role.includes('capataz')) return 'foreman'
  if (role.includes('member') || role.includes('integrante') || role.includes('colaborador')) return 'member'
  return role
}

const rolePriority = (role: string | null) => {
  if (role === 'supervisor') return 3
  if (role === 'foreman') return 2
  if (role === 'member') return 1
  return 0
}

const asObject = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, any>
}

const normalizeTime = (value: unknown) => {
  const text = clean(value)
  if (!text) return null
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    throw new Error(`Hora inválida: ${text}`)
  }
  const [hour, minute, second = 0] = text.split(':').map(Number)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new Error(`Hora inválida: ${text}`)
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
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
  const byId = new Map<string, StaffingWorkerInput>()
  workers.forEach((worker) => {
    const id = clean(worker.collaborator_id)
    if (!id) return
    const normalizedWorker = { ...worker, collaborator_id: id, role: normalizeRole(worker.role) }
    const current = byId.get(id)
    if (!current || rolePriority(normalizedWorker.role) > rolePriority(current.role)) {
      byId.set(id, normalizedWorker)
    }
  })
  return Array.from(byId.values())
}

const normalizeWorker = (value: any, defaultRole: string | null = null): StaffingWorkerInput | null => {
  const collaboratorId = collaboratorIdFromValue(value)
  if (!collaboratorId) return null
  return {
    collaborator_id: collaboratorId,
    role: normalizeRole(typeof value === 'string' ? defaultRole : value?.role ?? defaultRole),
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
    activity_start_time: normalizeTime(value?.activity_start_time ?? value?.activityStartTime),
    activity_end_time: normalizeTime(value?.activity_end_time ?? value?.activityEndTime),
    activity_observations: nullableText(value?.activity_observations ?? value?.activityObservations ?? value?.observations),
    restrictions: nullableText(value?.restrictions),
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
    ...normalizeWorkerList(body?.capataz_ids, 'foreman'),
    ...normalizeWorkerList(body?.capataz, 'foreman'),
    ...normalizeWorkerList(body?.supervisors, 'supervisor'),
    ...normalizeWorkerList(body?.supervisor_ids, 'supervisor'),
    ...normalizeWorkerList([body?.foreman_id ?? body?.foremanId ?? body?.capataz_id ?? body?.capatazId ?? collaboratorIdFromValue(body?.foreman ?? body?.capataz)].filter(Boolean), 'foreman'),
    ...normalizeWorkerList([body?.supervisor_id ?? body?.supervisorId ?? collaboratorIdFromValue(body?.supervisor)].filter(Boolean), 'supervisor'),
  ])

  const supervisorIds = workers
    .filter((worker) => worker.role === 'supervisor')
    .map((worker) => worker.collaborator_id)
  const foremanIds = workers
    .filter((worker) => worker.role === 'foreman')
    .map((worker) => worker.collaborator_id)

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
    supervisor_id: supervisorIds[0] || null,
    foreman_id: foremanIds[0] || null,
    supervisor_ids: supervisorIds,
    foreman_ids: foremanIds,
    workers,
    activities,
    metadata: asObject(body?.metadata),
  }
}
