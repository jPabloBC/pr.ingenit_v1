import { supabaseAdmin } from '@/lib/supabaseAdmin'

const formatDateForDisplay = (date: string) => {
  const [year, month, day] = String(date || '').slice(0, 10).split('-')
  return year && month && day ? `${day}-${month}-${year}` : date
}

const getSenderName = (session: any) => String(
  session?.user?.name ||
  session?.user?.email ||
  'Usuario'
).trim()

const buildUniqueKey = (prefix: string) =>
  `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`

const loadNotificationRecipients = async ({
  companyId,
  projectId,
  senderUserId,
}: {
  companyId: string
  projectId?: string | null
  senderUserId?: string | null
}) => {
  const { data: users, error } = await supabaseAdmin
    .from('pr_users')
    .select('id, role')
    .eq('company_id', companyId)
    .in('role', ['admin', 'user'])

  if (error) throw error

  const userRows = Array.isArray(users) ? users : []
  const adminIds = userRows
    .filter((user: any) => String(user?.role || '').trim().toLowerCase() === 'admin')
    .map((user: any) => String(user?.id || '').trim())
    .filter(Boolean)
  const regularIds = userRows
    .filter((user: any) => String(user?.role || '').trim().toLowerCase() !== 'admin')
    .map((user: any) => String(user?.id || '').trim())
    .filter(Boolean)

  if (!projectId || regularIds.length === 0) {
    return Array.from(new Set([...adminIds, ...regularIds, senderUserId || ''].filter(Boolean)))
  }

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from('pr_project_users')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .in('user_id', regularIds)

  if (assignmentError) throw assignmentError

  const assigned = new Set((assignments || []).map((row: any) => String(row?.user_id || '').trim()).filter(Boolean))
  return Array.from(new Set([
    ...adminIds,
    ...regularIds.filter((id) => assigned.has(id)),
    senderUserId || '',
  ].filter(Boolean)))
}

export const createCollaboratorsImportNotification = async ({
  session,
  insertedCount,
  attendanceRowsWritten,
  attendanceDates,
}: {
  session: any
  insertedCount: number
  attendanceRowsWritten: number
  attendanceDates: string[]
}) => {
  const companyId = String(session?.user?.companyId || '').trim()
  const senderUserId = String(session?.user?.id || '').trim()
  const projectId = String(session?.user?.projectId || '').trim()
  if (!companyId || !senderUserId) return false
  if (insertedCount <= 0 && attendanceRowsWritten <= 0) return false

  const recipients = await loadNotificationRecipients({ companyId, projectId, senderUserId })
  if (recipients.length === 0) return false

  const senderName = getSenderName(session)
  const dateValues = Array.from(new Set((attendanceDates || []).map((date) => String(date || '').slice(0, 10)).filter(Boolean))).sort()
  const dateLabel = dateValues.length === 1
    ? formatDateForDisplay(dateValues[0])
    : dateValues.length > 1
      ? `${formatDateForDisplay(dateValues[0])} - ${formatDateForDisplay(dateValues[dateValues.length - 1])}`
      : ''

  const hasAttendance = attendanceRowsWritten > 0
  const hasNewCollaborators = insertedCount > 0
  const title = hasAttendance && hasNewCollaborators
    ? 'Colaboradores y asistencia actualizados'
    : hasAttendance
      ? `Asistencia actualizada${dateLabel ? ` - ${dateLabel}` : ''}`
      : 'Nuevos colaboradores importados'
  const body = hasAttendance && hasNewCollaborators
    ? `${senderName} actualizó asistencia y agregó ${insertedCount} nuevo${insertedCount === 1 ? '' : 's'} colaborador${insertedCount === 1 ? '' : 'es'}.`
    : hasAttendance
      ? `${senderName} actualizó asistencia${dateLabel ? ` del ${dateLabel}` : ''}.`
      : `${senderName} agregó ${insertedCount} nuevo${insertedCount === 1 ? '' : 's'} colaborador${insertedCount === 1 ? '' : 'es'}.`
  const type = hasAttendance ? 'collaborators_attendance_updated' : 'collaborators_import_completed'
  const keyBase = buildUniqueKey(`${type}:${companyId}:${projectId || '-'}`)

  const rows = recipients.map((recipientUserId) => ({
    company_id: companyId,
    project_id: projectId || null,
    recipient_user_id: recipientUserId,
    sender_user_id: senderUserId,
    type,
    title,
    body,
    link_url: '/users/collaborators',
    metadata: {
      inserted_count: insertedCount,
      attendance_rows_written: attendanceRowsWritten,
      attendance_dates: dateValues,
    },
    idempotency_key: `${keyBase}:${recipientUserId}`,
  }))

  const { error } = await supabaseAdmin
    .from('pr_internal_notifications')
    .insert(rows)

  if (error) throw error
  return true
}

export const createDailyStatusNotification = async ({
  session,
  date,
  updatedCount,
}: {
  session: any
  date: string
  updatedCount: number
}) => createCollaboratorsImportNotification({
  session,
  insertedCount: 0,
  attendanceRowsWritten: Math.max(0, updatedCount),
  attendanceDates: date ? [date] : [],
})
