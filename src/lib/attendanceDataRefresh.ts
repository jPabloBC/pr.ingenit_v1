export const ATTENDANCE_DATA_REFRESH_EVENT = 'ingenit:attendance-data-updated'
export const ATTENDANCE_DATA_REFRESH_STORAGE_KEY = 'ingenit:attendance-data-updated-at'

export const getAttendanceDataRevision = () => {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(ATTENDANCE_DATA_REFRESH_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export const notifyAttendanceDataUpdated = () => {
  if (typeof window === 'undefined') return
  const revision = `${Date.now()}`
  try {
    window.localStorage.setItem(ATTENDANCE_DATA_REFRESH_STORAGE_KEY, revision)
  } catch {
    // The event still refreshes the current browser tab when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(ATTENDANCE_DATA_REFRESH_EVENT, { detail: revision }))
}
