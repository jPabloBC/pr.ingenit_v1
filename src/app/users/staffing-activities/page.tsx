"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import RefreshIcon from '@mui/icons-material/Refresh'
import SaveIcon from '@mui/icons-material/Save'
import UserHeader from '@/components/layout/UserHeader'
import { colors } from '@/theme/theme'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Collaborator = {
  id: string
  first_name?: string | null
  last_name?: string | null
  document?: string | null
  position?: string | null
  posicion?: string | null
  position_label?: string | null
  specialty?: string | null
  worker_type?: string | null
}

type ReportFront = {
  id: string | null
  code?: string | null
  name?: string | null
  is_active?: boolean | null
}

type ActivityForm = {
  activity: string
  activity_type: '' | 'operational' | 'administrative'
  activity_start_time: string
  activity_end_time: string
  activity_observations: string
  restrictions: string
  quantity: string
  unit: string
  images: StaffingEvidenceFile[]
}

type StaffingEvidenceFile = {
  key: string
  name: string
  type: string
  size: number
  uploaded_at: string
}

type AssignedStaffingCollaborator = {
  collaborator_id: string
  session_id: string
  role?: string | null
  work_front_name?: string | null
  created_by?: string | null
  is_own_session?: boolean | null
  first_name?: string | null
  last_name?: string | null
  document?: string | null
  position?: string | null
  posicion?: string | null
  position_label?: string | null
  specialty?: string | null
  worker_type?: string | null
  reporter_name?: string | null
  reporter_position?: string | null
  reporter_email?: string | null
}

type StaffingSession = Record<string, any> & {
  id: string
  status?: string | null
  work_front_name?: string | null
  supervisor_id?: string | null
  supervisor_ids?: string[] | null
  foreman_id?: string | null
  foreman_ids?: string[] | null
  generated_crew_id?: string | null
  created_by?: string | null
  work_date?: string | null
  workers?: any[]
  activities?: any[]
}

const todayYmd = () => format(new Date(), 'yyyy-MM-dd')

const monthStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1)

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

const parseYmdToDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

const emptyActivity = (): ActivityForm => ({
  activity: '',
  activity_type: '',
  activity_start_time: '',
  activity_end_time: '',
  activity_observations: '',
  restrictions: '',
  quantity: '',
  unit: '',
  images: [],
})

const fullName = (collaborator: Partial<Collaborator> | null | undefined) =>
  [collaborator?.first_name, collaborator?.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ') || 'Sin nombre'

const fullNameUpper = (collaborator: Partial<Collaborator> | null | undefined) =>
  fullName(collaborator).toUpperCase()

const formatChileRut = (value: unknown) => {
  const raw = String(value || '')
    .replace(/\./g, '')
    .replace(/-/g, '')
    .replace(/\s/g, '')
    .toUpperCase()

  if (!raw || raw.length < 2) return ''

  const body = raw.slice(0, -1).replace(/\D/g, '')
  const dv = raw.slice(-1)

  if (!body || !/^[0-9K]$/.test(dv)) return String(value || '').trim()

  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formattedBody}-${dv}`
}

const collaboratorPositionUpper = (collaborator: Partial<Collaborator> | null | undefined) => {
  const position = String(
    collaborator?.position_label ||
    collaborator?.position ||
    collaborator?.posicion ||
    collaborator?.specialty ||
    ''
  ).trim()
  return position ? position.toUpperCase() : 'SIN CARGO'
}

const collaboratorSubtitle = (collaborator: Partial<Collaborator> | null | undefined) => {
  const position = collaboratorPositionUpper(collaborator)
  const document = formatChileRut(collaborator?.document)
  return [position, document].filter(Boolean).join(' · ')
}   

const normalizeRoleText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const collaboratorRoleText = (collaborator: Collaborator) =>
  [
    collaborator.position_label,
    collaborator.position,
    collaborator.posicion,
    collaborator.specialty,
    collaborator.worker_type,
    (collaborator as any).role,
  ]
    .map(normalizeRoleText)
    .filter(Boolean)
    .join(' ')

const isSupervisorCollaborator = (collaborator: Collaborator) =>
  collaboratorRoleText(collaborator).includes('supervisor')

const isForemanCollaborator = (collaborator: Collaborator) => {
  const roleText = collaboratorRoleText(collaborator)
  return roleText.includes('capataz') || roleText.includes('foreman')
}    

const isDirectWorker = (collaborator: Collaborator) => {
  const workerType = normalizeRoleText(collaborator.worker_type)
  const roleText = collaboratorRoleText(collaborator)
  if (!workerType) return false
  if (
    roleText.includes('indirecto') ||
    roleText.includes('indirect') ||
    roleText.includes('directo no operacional') ||
    roleText.includes('directo no operativo') ||
    roleText.includes('no operacional') ||
    roleText.includes('no operativo') ||
    roleText.includes('administrativo') ||
    roleText.includes('supervisor') ||
    roleText.includes('capataz') ||
    roleText.includes('foreman')
  ) {
    return false
  }
  return ['directo', 'direct', 'personal directo', 'directo operacional'].includes(workerType)
}

const normalizeStaffingRole = (value: unknown) => {
  const roleText = normalizeRoleText(value)
  if (roleText.includes('supervisor')) return 'supervisor'
  if (roleText.includes('capataz') || roleText.includes('foreman')) return 'foreman'
  if (roleText.includes('member') || roleText.includes('integrante') || roleText.includes('colaborador')) return 'member'
  return roleText
}

const toStringArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  const text = String(value || '').trim()
  return text ? [text] : []
}

const uniqueStrings = (values: string[]) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))

const frontKey = (front: ReportFront, index: number) =>
  String(front.id || front.code || front.name || `front-${index}`)

const shortId = (value: unknown) => {
  const text = String(value || '').trim()
  return text ? `${text.slice(0, 8)}...` : '-'
}

const activityUnitOptions = [
  { value: 'm', label: 'm' },
  { value: 'm2', label: 'm²' },
  { value: 'm3', label: 'm³' },
  { value: 'un', label: 'un' },
  { value: 'kg', label: 'kg' },
  { value: 'ton', label: 'ton' },
  { value: 'hr', label: 'hr' },
  { value: 'paño', label: 'paño' },
  { value: 'rollo', label: 'rollo' },
]

export default function StaffingActivitiesPage() {
  const { data: session } = useSession()
  const [date, setDate] = useState('')
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(new Date()))
  const [fronts, setFronts] = useState<ReportFront[]>([])
  const [frontValue, setFrontValue] = useState('')
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [assignedCollaborators, setAssignedCollaborators] = useState<AssignedStaffingCollaborator[]>([])
  const [availabilityCounts, setAvailabilityCounts] = useState({
    totalOnShift: 0,
    directOperationalOnShift: 0,
    availableDirectOperational: 0,
    assignedDirectOperational: 0,
  })
  const [supervisorIds, setSupervisorIds] = useState<string[]>([])
  const [foremanIds, setForemanIds] = useState<string[]>([])
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [activities, setActivities] = useState<ActivityForm[]>([emptyActivity()])
  const [selectedActivitySessionId, setSelectedActivitySessionId] = useState('')
  const [sessions, setSessions] = useState<StaffingSession[]>([])
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [loadingAvailableDates, setLoadingAvailableDates] = useState(false)
  const [loadingFronts, setLoadingFronts] = useState(false)
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [activeActivityIndex, setActiveActivityIndex] = useState<number | null>(null)
  const [activitySuggestionQuery, setActivitySuggestionQuery] = useState('')
  const [activitySuggestions, setActivitySuggestions] = useState<string[]>([])
  const [loadingActivitySuggestions, setLoadingActivitySuggestions] = useState(false)
  const [uploadingActivityImages, setUploadingActivityImages] = useState<Record<number, boolean>>({})
  const [editingActivityRef, setEditingActivityRef] = useState<{ id: string; sessionId: string } | null>(null)
  const [collaboratorSearch, setCollaboratorSearch] = useState('')
  const [activeMobilePanel, setActiveMobilePanel] = useState<'crew' | 'activity' | 'history'>('activity')
  const currentUserId = String((session?.user as any)?.id || '').trim()

  const selectedFront = useMemo(
    () => fronts.find((front, index) => frontKey(front, index) === frontValue) || null,
    [frontValue, fronts]
  )

  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates])

  const selectedDateValue = useMemo(() => parseYmdToDate(date), [date])

  const hasAvailableDates = availableDates.length > 0

  const canCreateForDate = Boolean(date && availableDateSet.has(date))

  const canRegisterActivities = Boolean(canCreateForDate && selectedActivitySessionId)

  const collaboratorsById = useMemo(() => {
    const map = new Map<string, Collaborator>()
    collaborators.forEach((collaborator) => map.set(String(collaborator.id), collaborator))
    return map
  }, [collaborators])

  const supervisorOptions = useMemo(
    () => collaborators.filter((collaborator) => isSupervisorCollaborator(collaborator) && !foremanIds.includes(collaborator.id)),
    [collaborators, foremanIds]
  )

  const foremanOptions = useMemo(
    () => collaborators.filter((collaborator) => isForemanCollaborator(collaborator) && !supervisorIds.includes(collaborator.id)),
    [collaborators, supervisorIds]
  )

  const selectableMembers = useMemo(
    () => collaborators.filter((collaborator) => (
      isDirectWorker(collaborator) &&
      !isSupervisorCollaborator(collaborator) &&
      !isForemanCollaborator(collaborator) &&
      !supervisorIds.includes(collaborator.id) &&
      !foremanIds.includes(collaborator.id)
    )),
    [collaborators, supervisorIds, foremanIds]
  )

  const openStaffingSessions = useMemo(
    () => sessions.filter((item) => ['draft', 'reopened'].includes(String(item?.status || '').toLowerCase())),
    [sessions]
  )

  const loadAvailableDates = async (targetMonth = visibleMonth, options: { selectInitial?: boolean } = {}) => {
    const monthDate = monthStart(targetMonth)
    try {
      setLoadingAvailableDates(true)
      setVisibleMonth(monthDate)
      const year = monthDate.getFullYear()
      const month = monthDate.getMonth() + 1
      const res = await fetch(`/api/staffing-activities/available-dates?year=${year}&month=${month}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar fechas disponibles')
      const rows: string[] = Array.isArray(json?.dates)
        ? Array.from(new Set<string>(
          json.dates
            .map((item: unknown) => String(item || '').slice(0, 10))
            .filter((item: string) => /^\d{4}-\d{2}-\d{2}$/.test(item))
        )).sort((a: string, b: string) => a.localeCompare(b))
        : []
      setAvailableDates(rows)
      if (options.selectInitial) {
        setDate((prev) => {
          if (prev && rows.includes(prev)) return prev
          const today = todayYmd()
          if (rows.includes(today)) return today
          return rows[rows.length - 1] || ''
        })
      }
      if (rows.length === 0 && options.selectInitial) resetForm()
    } catch (err) {
      setAvailableDates([])
      if (options.selectInitial) {
        setDate('')
        resetForm()
      }
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cargando fechas disponibles' })
    } finally {
      setLoadingAvailableDates(false)
    }
  }

  const refreshAvailableDates = async () => {
    try {
      setLoadingAvailableDates(true)
      const monthDate = monthStart(visibleMonth)
      const year = monthDate.getFullYear()
      const month = monthDate.getMonth() + 1
      const res = await fetch(`/api/staffing-activities/available-dates?year=${year}&month=${month}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar fechas disponibles')
      const rows: string[] = Array.isArray(json?.dates)
        ? Array.from(new Set<string>(
          json.dates
            .map((item: unknown) => String(item || '').slice(0, 10))
            .filter((item: string) => /^\d{4}-\d{2}-\d{2}$/.test(item))
        )).sort((a: string, b: string) => a.localeCompare(b))
        : []
      setAvailableDates(rows)
      setDate((prev) => {
        if (prev && rows.includes(prev)) return prev
        const today = todayYmd()
        if (sameMonth(monthDate, new Date()) && rows.includes(today)) return today
        return rows[rows.length - 1] || ''
      })
      if (rows.length === 0) resetForm()
    } catch (err) {
      setAvailableDates([])
      setDate('')
      resetForm()
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cargando fechas disponibles' })
    } finally {
      setLoadingAvailableDates(false)
    }
  }

  const loadFronts = async () => {
    try {
      setLoadingFronts(true)
      const res = await fetch('/api/report-fronts?include_inactive=1', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar los frentes')
      const rows = Array.isArray(json?.fronts) ? json.fronts : []
      setFronts(rows)
      setFrontValue((prev) => {
        if (!prev) return ''
        return rows.some((front: ReportFront, index: number) => frontKey(front, index) === prev) ? prev : ''
      })
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cargando frentes' })
    } finally {
      setLoadingFronts(false)
    }
  }

  const loadCollaborators = async (targetDate = date) => {
    if (!targetDate) {
      setCollaborators([])
      setAssignedCollaborators([])
      setAvailabilityCounts({
        totalOnShift: 0,
        directOperationalOnShift: 0,
        availableDirectOperational: 0,
        assignedDirectOperational: 0,
      })
      setSupervisorIds([])
      setForemanIds([])
      setMemberIds([])
      return
    }
    try {
      setLoadingCollaborators(true)
      const res = await fetch(`/api/staffing-activities/available-collaborators?date=${encodeURIComponent(targetDate)}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar colaboradores')
      const rows = Array.isArray(json?.collaborators) ? json.collaborators : []
      const assignedRows = Array.isArray(json?.assigned_collaborators) ? json.assigned_collaborators : []
      const validIds = new Set(rows.map((row: Collaborator) => String(row.id)))
      const localAvailableDirectOperational = rows.filter(isDirectWorker).length
      const localAssignedDirectOperational = assignedRows.filter((row: AssignedStaffingCollaborator) => isDirectWorker(row as unknown as Collaborator)).length
      setCollaborators(rows)
      setAssignedCollaborators(assignedRows)
      setAvailabilityCounts({
        totalOnShift: Number(json?.total_on_shift_count ?? json?.total_collaborators_count ?? rows.length + assignedRows.length),
        directOperationalOnShift: Number(json?.direct_operational_on_shift_count ?? localAvailableDirectOperational + localAssignedDirectOperational),
        availableDirectOperational: Number(json?.available_direct_operational_count ?? localAvailableDirectOperational),
        assignedDirectOperational: Number(json?.assigned_direct_operational_count ?? localAssignedDirectOperational),
      })
      setSupervisorIds((prev) => prev.filter((id) => validIds.has(id)))
      setForemanIds((prev) => prev.filter((id) => validIds.has(id)))
      setMemberIds((prev) => prev.filter((id) => validIds.has(id)))
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cargando colaboradores' })
    } finally {
      setLoadingCollaborators(false)
    }
  }

  const loadSessions = async (targetDate = date) => {
    if (!targetDate) {
      setSessions([])
      return
    }
    try {
      setLoadingSessions(true)
      const res = await fetch(`/api/staffing-activities?date=${encodeURIComponent(targetDate)}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar jornadas')
      const rows = Array.isArray(json?.sessions) ? json.sessions : []
      setSessions(rows)

      setSelectedActivitySessionId((prev) => {
        if (prev && rows.some((item: StaffingSession) => String(item.id) === prev)) return prev

        const ownOpenSession = rows.find((item: StaffingSession) => {
          const status = String(item?.status || '').toLowerCase()
          const createdBy = String(item?.created_by || '').trim()
          return currentUserId && createdBy === currentUserId && ['draft', 'reopened'].includes(status)
        })

        return ownOpenSession?.id ? String(ownOpenSession.id) : ''
      })
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cargando jornadas' })
    } finally {
      setLoadingSessions(false)
    }
  }

  useEffect(() => {
    void loadAvailableDates(monthStart(new Date()), { selectInitial: true })
    void loadFronts()
  }, [])

  useEffect(() => {
    void loadCollaborators(date)
    void loadSessions(date)
  }, [date])

  useEffect(() => {
    if (!selectedActivitySessionId) return
    if (!openStaffingSessions.some((item) => item.id === selectedActivitySessionId)) {
      setSelectedActivitySessionId('')
    }
  }, [openStaffingSessions, selectedActivitySessionId])

  useEffect(() => {
    const query = activitySuggestionQuery.trim()
    if (query.length < 2) {
      setActivitySuggestions([])
      setLoadingActivitySuggestions(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        setLoadingActivitySuggestions(true)
        const res = await fetch(`/api/staffing-activities/activity-suggestions?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar sugerencias')
        setActivitySuggestions(Array.isArray(json?.suggestions) ? json.suggestions.map(String) : [])
      } catch (err: any) {
        if (err?.name !== 'AbortError') setActivitySuggestions([])
      } finally {
        if (!controller.signal.aborted) setLoadingActivitySuggestions(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [activitySuggestionQuery])

  const shouldDisableDate = (value: Date | null) => {
    if (!value || Number.isNaN(value.getTime())) return true
    if (availableDateSet.size === 0) return true
    return !availableDateSet.has(format(value, 'yyyy-MM-dd'))
  }

  const updateSupervisors = (ids: string[]) => {
    const next = uniqueStrings(ids)
    const nextSet = new Set(next)
    setSupervisorIds(next)
    setForemanIds((prev) => prev.filter((foremanId) => !nextSet.has(foremanId)))
    setMemberIds((prev) => prev.filter((memberId) => !nextSet.has(memberId)))
  }

  const updateForemen = (ids: string[]) => {
    const supervisorSet = new Set(supervisorIds)
    const next = uniqueStrings(ids).filter((id) => !supervisorSet.has(id))
    const nextSet = new Set(next)
    setForemanIds(next)
    setMemberIds((prev) => prev.filter((memberId) => !nextSet.has(memberId)))
  }

  const toggleMember = (id: string) => {
    if (supervisorIds.includes(id) || foremanIds.includes(id)) return
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const updateActivity = (index: number, patch: Partial<ActivityForm>) => {
    setActivities((prev) => prev.map((activity, idx) => (idx === index ? { ...activity, ...patch } : activity)))
  }

  const updateActivityType = (index: number, activityType: ActivityForm['activity_type']) => {
    setActivities((prev) => prev.map((activity, idx) => (
      idx === index
        ? {
          ...activity,
          activity_type: activityType,
          quantity: activityType === 'administrative' ? '' : activity.quantity,
          unit: activityType === 'administrative' ? '' : activity.unit,
          images: activityType === 'administrative' ? [] : activity.images,
        }
        : activity
    )))
  }

  const activityImagesFromValue = (value: any): StaffingEvidenceFile[] => {
    const images = value?.metadata?.images ?? value?.images
    if (!Array.isArray(images)) return []
    return images
      .map((image: any) => ({
        key: String(image?.key || '').trim(),
        name: String(image?.name || 'imagen').trim() || 'imagen',
        type: String(image?.type || 'image/*').trim() || 'image/*',
        size: Number(image?.size || 0),
        uploaded_at: String(image?.uploaded_at || image?.uploadedAt || '').trim(),
      }))
      .filter((image) => image.key)
  }

  const activityTypeFromValue = (value: any): ActivityForm['activity_type'] => {
    const type = String(value?.metadata?.activity_type || value?.activity_type || '').trim().toLowerCase()
    if (type === 'operational') return 'operational'
    if (type === 'administrative') return 'administrative'
    return ''
  }

  const activityStatusFromValue = (value: any) =>
    String(value?.metadata?.status || '').trim().toLowerCase()

  const activityStatusLabel = (status: unknown) => {
    const normalizedStatus = String(status || '').trim().toLowerCase()
    if (normalizedStatus === 'draft') return 'Borrador'
    if (normalizedStatus === 'in_progress') return 'En progreso'
    if (normalizedStatus === 'closed') return 'Cerrada'
    return 'Sin estado'
  }

  const sessionStatusLabel = (status: unknown) => {
    const normalizedStatus = String(status || '').trim().toLowerCase()
    if (normalizedStatus === 'draft') return 'Borrador'
    if (normalizedStatus === 'reopened') return 'Reabierta'
    if (normalizedStatus === 'submitted') return 'Enviada'
    return String(status || '-')
  }

  const activityFormFromValue = (value: any): ActivityForm => {
    const type = activityTypeFromValue(value)
    return {
      activity: String(value?.activity || '').trim(),
      activity_type: type,
      activity_start_time: String(value?.activity_start_time || '').slice(0, 5),
      activity_end_time: String(value?.activity_end_time || '').slice(0, 5),
      activity_observations: String(value?.activity_observations || '').trim(),
      restrictions: String(value?.restrictions || '').trim(),
      quantity: type === 'operational' ? String(value?.quantity ?? value?.metadata?.quantity ?? '').trim() : '',
      unit: type === 'operational' ? String(value?.unit ?? value?.metadata?.unit ?? '').trim() : '',
      images: activityImagesFromValue(value),
    }
  }

  const editableActivitiesCount = sessions.reduce((count, session) => (
    count + (Array.isArray(session.activities) ? session.activities.length : 0)
  ), 0)

  const uploadActivityImages = async (index: number, fileList: FileList | null) => {
    const files = Array.from(fileList || []).filter((file) => String(file.type || '').startsWith('image/'))
    if (!files.length) return
    if (activities[index]?.activity_type !== 'operational') return

    setUploadingActivityImages((prev) => ({ ...prev, [index]: true }))
    try {
      const uploaded: StaffingEvidenceFile[] = []
      for (const file of files) {
        const presignRes = await fetch('/api/staffing-activities/evidence/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            fileSize: file.size,
            activityClientId: `activity-${index + 1}`,
            workDate: date || null,
          }),
        })
        const presign = await presignRes.json().catch(() => ({}))
        if (!presignRes.ok || !presign?.uploadUrl || !presign?.key) {
          throw new Error(presign?.error || 'No se pudo preparar la subida de imagen')
        }

        const putRes = await fetch(String(presign.uploadUrl), {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        })
        if (!putRes.ok) throw new Error(`No se pudo subir ${file.name}`)

        uploaded.push({
          key: String(presign.key),
          name: file.name || 'imagen',
          type: file.type || 'application/octet-stream',
          size: file.size,
          uploaded_at: new Date().toISOString(),
        })
      }

      if (uploaded.length) {
        setActivities((prev) => prev.map((activity, idx) => (
          idx === index
            ? { ...activity, images: [...(activity.images || []), ...uploaded].slice(0, 10) }
            : activity
        )))
      }
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error subiendo imagen' })
    } finally {
      setUploadingActivityImages((prev) => ({ ...prev, [index]: false }))
    }
  }

  const removeActivityImage = (activityIndex: number, imageIndex: number) => {
    setActivities((prev) => prev.map((activity, idx) => (
      idx === activityIndex
        ? { ...activity, images: (activity.images || []).filter((_, itemIndex) => itemIndex !== imageIndex) }
        : activity
    )))
  }

  const openStaffingEvidence = async (key: string) => {
    const cleanKey = String(key || '').trim()
    if (!cleanKey) return
    try {
      const res = await fetch(`/api/staffing-activities/evidence/view?key=${encodeURIComponent(cleanKey)}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.url) throw new Error(json?.error || 'No se pudo abrir la imagen')
      window.open(String(json.url), '_blank', 'noopener,noreferrer')
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error abriendo imagen' })
    }
  }

  const resetForm = () => {
    setSupervisorIds([])
    setForemanIds([])
    setMemberIds([])
    setActivities([emptyActivity()])
  }

  const resetCrewForm = () => {
    setFrontValue('')
    setSupervisorIds([])
    setForemanIds([])
    setMemberIds([])
  }

  const resetActivityForm = () => {
    setActivities([emptyActivity()])
    setActivitySuggestions([])
    setActivitySuggestionQuery('')
    setActiveActivityIndex(null)
    setEditingActivityRef(null)
  }

  const addActivity = () => setActivities((prev) => [...prev, emptyActivity()])

  const removeActivity = (index: number) => {
    setActivities((prev) => (prev.length === 1 ? [emptyActivity()] : prev.filter((_, idx) => idx !== index)))
  }

  const staffingRoleLabel = (role: unknown) => {
    const normalizedRole = normalizeStaffingRole(role)
    if (normalizedRole === 'supervisor') return 'Supervisor'
    if (normalizedRole === 'foreman') return 'Capataz'
    if (normalizedRole === 'member') return 'Colaborador'
    return String(role || '').trim() || 'Colaborador'
  }

  const assignedCollaboratorsMessage = (items: any[]) => {
    const details = (Array.isArray(items) ? items : [])
      .map((item) => {
        const collaboratorId = String(item?.collaborator_id || '').trim()
        const collaborator = collaboratorsById.get(collaboratorId)
        const name = collaborator ? fullName(collaborator) : shortId(collaboratorId)
        const role = staffingRoleLabel(item?.role)
        const front = String(item?.work_front_name || '').trim()
        return [name, role, front ? `frente ${front}` : ''].filter(Boolean).join(' - ')
      })
      .filter(Boolean)

    return details.length
      ? `Hay colaboradores ya asignados a otra cuadrilla del día: ${details.join('; ')}`
      : 'Hay colaboradores ya asignados a otra cuadrilla del día.'
  }

  const saveCrewDraft = async () => {
    if (!date) return setNotice({ severity: 'error', message: 'No hay fechas con colaboradores en turno.' })
    if (!canCreateForDate) return setNotice({ severity: 'error', message: 'Selecciona una fecha con colaboradores en turno.' })
    if (!selectedFront) return setNotice({ severity: 'error', message: 'Selecciona un frente o área de trabajo.' })
    if (supervisorIds.length === 0) return setNotice({ severity: 'error', message: 'Selecciona al menos un supervisor.' })
    if (foremanIds.length === 0) return setNotice({ severity: 'error', message: 'Selecciona al menos un capataz.' })
    if (memberIds.length === 0) return setNotice({ severity: 'error', message: 'Selecciona al menos un colaborador en turno.' })

    try {
      setSaving(true)
      const res = await fetch('/api/staffing-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date: date,
          work_front_id: selectedFront.id || null,
          work_front_name: selectedFront.name || selectedFront.code || null,
          supervisor_ids: supervisorIds,
          foreman_ids: foremanIds,
          members: memberIds,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok && json?.code === 'STAFFING_COLLABORATORS_ALREADY_ASSIGNED') {
        setNotice({
          severity: 'error',
          message: assignedCollaboratorsMessage(json?.assigned_collaborators),
        })
        return
      }
      if (!res.ok) throw new Error(json?.error || 'No se pudo crear la cuadrilla del día')
      const createdSessionId = String(json?.session?.id || '').trim()
      setNotice({ severity: 'success', message: 'Cuadrilla del día creada como borrador.' })
      resetCrewForm()
      await Promise.all([loadSessions(date), loadCollaborators(date)])
      if (createdSessionId) setSelectedActivitySessionId(createdSessionId)
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error creando cuadrilla' })
    } finally {
      setSaving(false)
    }
  }

  const saveSingleActivity = async (index: number) => {
    const activity = activities[index]

    if (!activity) return

    const cleanActivity = {
      activity: activity.activity.trim(),
      activity_start_time: activity.activity_start_time || null,
      activity_end_time: activity.activity_end_time || null,
      activity_observations: activity.activity_observations.trim() || null,
      restrictions: activity.restrictions.trim() || null,
      unit: activity.activity_type === 'operational' ? activity.unit.trim() || null : null,
      quantity: activity.activity_type === 'operational' ? activity.quantity.trim() || null : null,
      metadata: {
        activity_type: activity.activity_type,
        quantity: activity.activity_type === 'operational' ? activity.quantity.trim() || null : null,
        unit: activity.activity_type === 'operational' ? activity.unit.trim() || null : null,
        images: activity.activity_type === 'operational' && Array.isArray(activity.images) ? activity.images : [],
      },
    }

    if (!date) return setNotice({ severity: 'error', message: 'No hay fechas con colaboradores en turno.' })
    if (!canCreateForDate) return setNotice({ severity: 'error', message: 'Selecciona una fecha con colaboradores en turno.' })
    if (!selectedActivitySessionId) return setNotice({ severity: 'error', message: 'Selecciona una cuadrilla para registrar actividades.' })
    if (!cleanActivity.activity) return setNotice({ severity: 'error', message: 'Ingresa una actividad.' })
    if (!cleanActivity.metadata.activity_type) return setNotice({ severity: 'error', message: 'Selecciona el tipo de actividad.' })

    if (
      cleanActivity.metadata.activity_type === 'operational' &&
      (!cleanActivity.metadata.quantity || !cleanActivity.metadata.unit)
    ) {
      return setNotice({ severity: 'error', message: 'Las actividades operacionales requieren cantidad y unidad.' })
    }

    try {
      setSaving(true)

      if (editingActivityRef?.id && editingActivityRef.sessionId === selectedActivitySessionId) {
        const res = await fetch(`/api/staffing-activities/${encodeURIComponent(selectedActivitySessionId)}/activities`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity_id: editingActivityRef.id,
            ...cleanActivity,
          }),
        })

        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar la actividad')

        setNotice({ severity: 'success', message: 'Actividad actualizada.' })
        resetActivityForm()
        await loadSessions(date)
        return
      }

      const res = await fetch(`/api/staffing-activities/${encodeURIComponent(selectedActivitySessionId)}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities: [cleanActivity],
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo guardar la actividad')

      setNotice({ severity: 'success', message: 'Actividad registrada.' })

      setActivities((prev) => prev.map((item, itemIndex) => (
        itemIndex === index ? emptyActivity() : item
      )))

      await loadSessions(date)
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error guardando actividad' })
    } finally {
      setSaving(false)
    }
  }

  const saveActivities = async () => {
    const cleanActivities = activities
      .map((activity) => ({
        activity: activity.activity.trim(),
        activity_start_time: activity.activity_start_time || null,
        activity_end_time: activity.activity_end_time || null,
        activity_observations: activity.activity_observations.trim() || null,
        restrictions: activity.restrictions.trim() || null,
        metadata: {
          activity_type: activity.activity_type,
          quantity: activity.activity_type === 'operational' ? activity.quantity.trim() || null : null,
          unit: activity.activity_type === 'operational' ? activity.unit.trim() || null : null,
          images: activity.activity_type === 'operational' && Array.isArray(activity.images) ? activity.images : [],
        },
        unit: activity.activity_type === 'operational' ? activity.unit.trim() || null : null,
        quantity: activity.activity_type === 'operational' ? activity.quantity.trim() || null : null,
      }))
      .filter((activity) => activity.activity)

    if (!date) return setNotice({ severity: 'error', message: 'No hay fechas con colaboradores en turno.' })
    if (!canCreateForDate) return setNotice({ severity: 'error', message: 'Selecciona una fecha con colaboradores en turno.' })
    if (!selectedActivitySessionId) return setNotice({ severity: 'error', message: 'Selecciona una cuadrilla para registrar actividades.' })
    if (cleanActivities.length === 0) return setNotice({ severity: 'error', message: 'Ingresa al menos una actividad.' })
    if (cleanActivities.some((activity) => !activity.metadata.activity_type)) {
      return setNotice({ severity: 'error', message: 'Selecciona el tipo de actividad.' })
    }
    if (cleanActivities.some((activity) => activity.metadata.activity_type === 'operational' && (!activity.metadata.quantity || !activity.metadata.unit))) {
      return setNotice({ severity: 'error', message: 'Las actividades operacionales requieren cantidad y unidad.' })
    }

    try {
      setSaving(true)
      const res = await fetch(`/api/staffing-activities/${encodeURIComponent(selectedActivitySessionId)}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities: cleanActivities,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron guardar las actividades')
      setNotice({ severity: 'success', message: 'Actividades registradas.' })
      resetActivityForm()
      await loadSessions(date)
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error guardando actividades' })
    } finally {
      setSaving(false)
    }
  }

  const deleteDraft = async (sessionId: string) => {
    if (!window.confirm('Eliminar este borrador de cuadrilla del día?')) return
    try {
      setDeletingId(sessionId)
      const res = await fetch(`/api/staffing-activities/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar el borrador')
      setNotice({ severity: 'success', message: 'Borrador eliminado.' })
      await Promise.all([loadSessions(date), loadCollaborators(date)])
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error eliminando borrador' })
    } finally {
      setDeletingId(null)
    }
  }

  const closeDay = async (sessionId: string) => {
    const closureNotes = window.prompt('Notas de cierre de jornada (opcional):') ?? null
    try {
      setClosingId(sessionId)
      const res = await fetch(`/api/staffing-activities/${encodeURIComponent(sessionId)}/close`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closure_notes: closureNotes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo cerrar la jornada')
      setNotice({ severity: 'success', message: 'Jornada cerrada.' })
      await Promise.all([loadSessions(date), loadCollaborators(date)])
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cerrando jornada' })
    } finally {
      setClosingId(null)
    }
  }

  const collaboratorLabel = (id: unknown) => {
    const text = String(id || '').trim()
    if (!text) return '-'
    const collaborator = collaboratorsById.get(text)
    const assigned = assignedCollaborators.find((item) => item.collaborator_id === text)
    return collaborator ? fullName(collaborator) : assigned ? fullName(assigned) : shortId(text)
  }

  const assignedCollaboratorSubtitle = (item: AssignedStaffingCollaborator) => {
    const position = collaboratorPositionUpper(item)
    const document = formatChileRut(item.document)
    return [`${position}`, document].filter(Boolean).join(' · ')
  }

  const collaboratorLabels = (ids: string[]) => {
    const labels = uniqueStrings(ids).map((id) => collaboratorLabel(id)).filter((label) => label && label !== '-')
    return labels.length ? labels.join(', ') : '-'
  }

  const renderSelectedCollaborators = (ids: string[]) => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {uniqueStrings(ids).map((id) => (
        <Chip key={id} label={collaboratorLabel(id)} size="small" sx={{ maxWidth: 180 }} />
      ))}
    </Box>
  )

  const currentSelectedItems = [
    ...supervisorIds.map((id) => ({ id, role: 'supervisor' })),
    ...foremanIds.map((id) => ({ id, role: 'foreman' })),
    ...memberIds.map((id) => ({ id, role: 'member' })),
  ]

  const selectedOwnSession = openStaffingSessions.find((item) => item.id === selectedActivitySessionId && String(item.created_by || '') === currentUserId) || null

  const ownSessionAssignedCollaborators = selectedOwnSession
    ? assignedCollaborators.filter((item) => item.session_id === selectedOwnSession.id)
    : []

  const otherAssignedGroups = Array.from(
    assignedCollaborators
      .filter((item) => !item.is_own_session)
      .reduce((groups, item) => {
        const key = item.session_id || 'sin-session'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
        return groups
      }, new Map<string, AssignedStaffingCollaborator[]>())
      .entries()
  )

  const sessionRoleIds = (staffingSession: StaffingSession, role: 'supervisor' | 'foreman') => {
    const explicitIds = role === 'supervisor'
      ? toStringArray(staffingSession.supervisor_ids)
      : toStringArray(staffingSession.foreman_ids)
    if (explicitIds.length) return explicitIds

    const workerIds = Array.isArray(staffingSession.workers)
      ? staffingSession.workers
        .filter((worker: any) => normalizeStaffingRole(worker?.role) === role)
        .map((worker: any) => String(worker?.collaborator_id || '').trim())
        .filter(Boolean)
      : []
    if (workerIds.length) return uniqueStrings(workerIds)

    return role === 'supervisor'
      ? toStringArray(staffingSession.supervisor_id)
      : toStringArray(staffingSession.foreman_id)
  }

  const sessionActivityImages = (staffingSession: StaffingSession) => {
    if (!Array.isArray(staffingSession.activities)) return []
    return staffingSession.activities.flatMap((activity) => activityImagesFromValue(activity))
  }

  const beginEditActivity = (staffingSession: StaffingSession, activity: any) => {
    const sessionStatus = String(staffingSession.status || '').toLowerCase()
    const isCreator = Boolean(currentUserId && String(staffingSession.created_by || '').trim() === currentUserId)

    if (!isCreator || !['draft', 'reopened'].includes(sessionStatus)) {
      setNotice({ severity: 'error', message: 'Solo puedes editar actividades de una cuadrilla propia abierta.' })
      return
    }

    if (activityStatusFromValue(activity) === 'closed') {
      setNotice({ severity: 'error', message: 'No se puede editar una actividad cerrada.' })
      return
    }

    const activityId = String(activity?.id || '').trim()
    if (!activityId) {
      setNotice({ severity: 'error', message: 'No se encontró el ID de la actividad.' })
      return
    }

    setSelectedActivitySessionId(staffingSession.id)
    setActivities([activityFormFromValue(activity)])
    setEditingActivityRef({ id: activityId, sessionId: staffingSession.id })
    setNotice({ severity: 'info', message: 'Actividad cargada para edición.' })
  }

  const selectedCollaboratorFromId = (id: string): Partial<Collaborator> | null => {
    return collaboratorsById.get(id) || null
  }

  const ownCrewHeaderCount = currentSelectedItems.length > 0
    ? `${currentSelectedItems.length} seleccionados ahora`
    : selectedOwnSession
      ? `${ownSessionAssignedCollaborators.length} integrantes`
      : '0 integrantes'

  const roleOrder = (role: unknown) => {
    const normalized = normalizeStaffingRole(role)
    if (normalized === 'supervisor') return 1
    if (normalized === 'foreman') return 2
    return 3
  }

  const ownSessionCollaboratorsByHierarchy = [...ownSessionAssignedCollaborators]
    .sort((a, b) => {
      const roleDiff = roleOrder(a.role) - roleOrder(b.role)
      if (roleDiff !== 0) return roleDiff
      return fullName(a).localeCompare(fullName(b), 'es')
    })

  const sortAssignedByHierarchy = (items: AssignedStaffingCollaborator[]) =>
    [...items].sort((a, b) => {
      const roleDiff = roleOrder(a.role) - roleOrder(b.role)
      if (roleDiff !== 0) return roleDiff
      return fullName(a).localeCompare(fullName(b), 'es')
    })
  
  const collaboratorSearchText = (collaborator: Partial<Collaborator> | AssignedStaffingCollaborator | null | undefined) =>
    [
      fullName(collaborator),
      collaborator?.document,
      collaborator?.position,
      collaborator?.specialty,
      collaborator?.worker_type,
      (collaborator as AssignedStaffingCollaborator | undefined)?.work_front_name,
    ]
      .map(normalizeRoleText)
      .filter(Boolean)
      .join(' ')

  const collaboratorSearchTerm = normalizeRoleText(collaboratorSearch)

  const matchesCollaboratorSearch = (collaborator: Partial<Collaborator> | AssignedStaffingCollaborator | null | undefined) => {
    if (!collaboratorSearchTerm) return true
    return collaboratorSearchText(collaborator).includes(collaboratorSearchTerm)
  }

  const filteredSelectableMembers = selectableMembers.filter(matchesCollaboratorSearch)

  const filteredCurrentSelectedItems = currentSelectedItems.filter((item) =>
    matchesCollaboratorSearch(selectedCollaboratorFromId(item.id))
  )

  const filteredOwnSessionCollaboratorsByHierarchy = ownSessionCollaboratorsByHierarchy.filter(matchesCollaboratorSearch)

  const filteredOtherAssignedGroups = otherAssignedGroups
    .map(([sessionId, items]) => [
      sessionId,
      items.filter((item) => matchesCollaboratorSearch(item)),
    ] as [string, AssignedStaffingCollaborator[]])
    .filter(([, items]) => items.length > 0)

  const reporterLabel = (item: AssignedStaffingCollaborator | undefined) => {
    const name = String(item?.reporter_name || '').trim()
    const position = String(item?.reporter_position || '').trim()
    const email = String(item?.reporter_email || '').trim()

    if (name) {
      return [name.toUpperCase(), position ? position.toUpperCase() : '']
        .filter(Boolean)
        .join(' · ')
    }

    if (email) return email

    return shortId(item?.created_by)
  }

  const staffingSessionSupervisor = (staffingSession: StaffingSession) => {
    const supervisorId = sessionRoleIds(staffingSession, 'supervisor')[0]
    if (!supervisorId) return null

    return (
      collaboratorsById.get(supervisorId) ||
      assignedCollaborators.find((item) => item.collaborator_id === supervisorId) ||
      null
    )
  }

  const staffingSessionOption = (staffingSession: StaffingSession) => {
    const frontText = String(staffingSession.work_front_name || 'Sin frente').trim().toUpperCase()
    const supervisor = staffingSessionSupervisor(staffingSession)

    return {
      frontText,
      supervisorName: supervisor ? fullNameUpper(supervisor) : '',
      supervisorPosition: supervisor ? collaboratorPositionUpper(supervisor) : '',
    }
  }

  const staffingSessionLabel = (staffingSession: StaffingSession) => {
    const supervisorText = collaboratorLabels(sessionRoleIds(staffingSession, 'supervisor'))
    const frontText = String(staffingSession.work_front_name || 'Sin frente').trim()
    return `${frontText} · ${supervisorText}`
  }

  const mobilePanelDisplay = (panel: 'crew' | 'activity' | 'history') => ({
    xs: activeMobilePanel === panel ? 'block' : 'none',
    md: 'block',
  })

  const openActivitiesCount = sessions.reduce((count, staffingSession) => (
    count + (Array.isArray(staffingSession.activities)
      ? staffingSession.activities.filter((activity: any) => activityStatusFromValue(activity) !== 'closed').length
      : 0)
  ), 0)

  const closedActivitiesCount = Math.max(editableActivitiesCount - openActivitiesCount, 0)

  return (
    <>
      <UserHeader title="Dotación y actividades" />
      <Container
        maxWidth={false}
        sx={{
          py: 3,
          width: '100%',
          maxWidth: '100%',
          px: 0,
        }}
      >
        <Stack spacing={2.5}>
          <Paper
            sx={{
              display: { xs: 'block', md: 'none' },
              p: 1.25,
              borderRadius: 1,
              border: '1px solid #e2e8f0',
              boxShadow: 'none',
              position: 'sticky',
              top: 0,
              zIndex: 5,
              bgcolor: '#fff',
            }}
          >
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.25 }}>
                {[
                  { id: 'crew', label: 'Cuadrilla', value: ownCrewHeaderCount },
                  { id: 'activity', label: 'Registrar', value: selectedActivitySessionId ? 'Activa' : 'Sin cuadrilla' },
                  { id: 'history', label: 'Actividades', value: `${editableActivitiesCount}` },
                ].map((item) => {
                  const selected = activeMobilePanel === item.id
                  return (
                    <Button
                      key={item.id}
                      variant={selected ? 'contained' : 'outlined'}
                      onClick={() => setActiveMobilePanel(item.id as 'crew' | 'activity' | 'history')}
                      sx={{
                        minWidth: 112,
                        height: 52,
                        flexShrink: 0,
                        textTransform: 'none',
                        borderRadius: 1,
                        bgcolor: selected ? colors.blue3 : '#fff',
                        borderColor: selected ? colors.blue3 : '#cbd5e1',
                        color: selected ? '#fff' : '#0f172a',
                        '&:hover': {
                          bgcolor: selected ? colors.blue2 : '#f8fafc',
                          borderColor: colors.blue3,
                        },
                      }}
                    >
                      <Box sx={{ textAlign: 'left', width: '100%' }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 850, lineHeight: 1.15 }}>{item.label}</Typography>
                        <Typography sx={{ fontSize: 11, opacity: selected ? 0.9 : 0.65, lineHeight: 1.2 }} noWrap>{item.value}</Typography>
                      </Box>
                    </Button>
                  )
                })}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ color: '#64748b', fontSize: 12, px: 0.5 }}>
                <Box>{date || 'Sin fecha'}</Box>
                <Box>Abiertas {openActivitiesCount}</Box>
                <Box>Cerradas {closedActivitiesCount}</Box>
              </Stack>
            </Stack>
          </Paper>

          <Paper sx={{ display: mobilePanelDisplay('crew'), p: { xs: 2, md: 2.5 }, borderRadius: 1, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#0f172a', mb: 1.5 }}>Cuadrilla del día</Typography>
            {!loadingAvailableDates && !hasAvailableDates ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                No hay fechas con colaboradores en turno para el mes visible. No es posible crear cuadrillas hasta seleccionar una fecha disponible.
              </Alert>
            ) : null}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px 1fr 1fr 1fr auto' }, gap: 1.5, alignItems: 'center' }}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
                <DatePicker
                  label="Fecha"
                  value={selectedDateValue}
                  onChange={(value) => {
                    if (!value || Number.isNaN(value.getTime())) {
                      setDate('')
                      return
                    }
                    const nextDate = format(value, 'yyyy-MM-dd')
                    if (!availableDateSet.has(nextDate)) return
                    setDate(nextDate)
                  }}
                  format="dd-MM-yyyy"
                  shouldDisableDate={shouldDisableDate}
                  onMonthChange={(value) => {
                    if (!value || Number.isNaN(value.getTime())) return
                    void loadAvailableDates(value)
                  }}
                  onYearChange={(value) => {
                    if (!value || Number.isNaN(value.getTime())) return
                    void loadAvailableDates(new Date(value.getFullYear(), visibleMonth.getMonth(), 1))
                  }}
                  disabled={loadingAvailableDates}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      helperText: !loadingAvailableDates && !hasAvailableDates ? 'Sin fechas disponibles' : undefined,
                    },
                  }}
                />
              </LocalizationProvider>
              <FormControl fullWidth disabled={loadingFronts || !canCreateForDate}>
                <InputLabel id="front-select-label">Frente / Área de trabajo</InputLabel>
                <Select labelId="front-select-label" label="Frente / Área de trabajo" value={frontValue} onChange={(event) => setFrontValue(String(event.target.value))}>
                  {fronts.map((front, index) => (
                    <MenuItem key={frontKey(front, index)} value={frontKey(front, index)}>
                      {front.name || front.code || 'Frente sin nombre'}{front.is_active === false ? ' (inactivo)' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth disabled={!canCreateForDate}>
                <InputLabel id="supervisor-select-label">Supervisores</InputLabel>
                <Select
                  multiple
                  labelId="supervisor-select-label"
                  label="Supervisores"
                  value={supervisorIds}
                  onChange={(event) => updateSupervisors(toStringArray(event.target.value))}
                  renderValue={(selected) => renderSelectedCollaborators(toStringArray(selected))}
                >
                  {supervisorOptions.map((collaborator) => (
                    <MenuItem key={collaborator.id} value={collaborator.id}>
                      <Checkbox checked={supervisorIds.includes(collaborator.id)} sx={{ mr: 1 }} />
                      <Box>
                        <Typography sx={{ fontWeight: 850, color: '#0f172a', fontSize: 14 }}>
                          {fullNameUpper(collaborator)}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                          {collaboratorSubtitle(collaborator)}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth disabled={!canCreateForDate}>
                <InputLabel id="foreman-select-label">Capataces</InputLabel>
                <Select
                  multiple
                  labelId="foreman-select-label"
                  label="Capataces"
                  value={foremanIds}
                  onChange={(event) => updateForemen(toStringArray(event.target.value))}
                  renderValue={(selected) => renderSelectedCollaborators(toStringArray(selected))}
                >
                  {foremanOptions.map((collaborator) => (
                    <MenuItem key={collaborator.id} value={collaborator.id}>
                      <Checkbox checked={foremanIds.includes(collaborator.id)} sx={{ mr: 1 }} />
                      <Box>
                        <Typography sx={{ fontWeight: 850, color: '#0f172a', fontSize: 14 }}>
                          {fullNameUpper(collaborator)}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                          {collaboratorSubtitle(collaborator)}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  void refreshAvailableDates()
                  void loadCollaborators(date)
                  void loadSessions(date)
                }}
                disabled={loadingAvailableDates}
                sx={{ textTransform: 'none', fontWeight: 800, minHeight: 56 }}
              >
                Actualizar
              </Button>
            </Box>
            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
              <TextField
                size="small"
                value={collaboratorSearch}
                onChange={(event) => setCollaboratorSearch(event.target.value)}
                placeholder="Buscar colaborador, RUT, cargo..."
                sx={{
                  width: '100%',
                  maxWidth: 520,
                  '& .MuiInputBase-root': {
                    bgcolor: 'white',
                  },
                }}
              />
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' },
                gap: 1.5,
                alignItems: 'stretch',
              }}
            >
              <Box
                sx={{
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, minHeight: 28 }}>
                  <Typography sx={{ fontWeight: 850, color: '#0f172a' }}>
                    Colaboradores{' '}
                    <Box component="span" sx={{ color: '#64748b', fontWeight: 600 }}>
                      ({availabilityCounts.directOperationalOnShift} · disponibles {availabilityCounts.availableDirectOperational} · asignados {availabilityCounts.assignedDirectOperational})
                    </Box>
                  </Typography>
                  {loadingCollaborators ? <CircularProgress size={20} /> : null}
                </Stack>
                <List
                  dense
                  disablePadding
                  sx={{
                    flex: 1,
                    height: 320,
                    minHeight: 320,
                    maxHeight: 320,
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 1,
                  }}
                >
                  {filteredSelectableMembers.length === 0 && !loadingCollaborators ? (
                    <Typography sx={{ py: 3, color: '#64748b', textAlign: 'center' }}>No hay colaboradores disponibles para la fecha.</Typography>
                  ) : null}
                  {filteredSelectableMembers.map((collaborator) => {
                    const checked = memberIds.includes(collaborator.id)
                    return (
                      <ListItemButton key={collaborator.id} disabled={!canCreateForDate} onClick={() => toggleMember(collaborator.id)}>
                        <ListItemIcon sx={{ minWidth: 38 }}>
                          <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                        </ListItemIcon>
                        <ListItemText
                          primary={fullNameUpper(collaborator)}
                          secondary={collaboratorSubtitle(collaborator)}
                          primaryTypographyProps={{ fontWeight: 800, color: '#0f172a' }}
                          secondaryTypographyProps={{ color: '#64748b', fontSize: 12.5 }}
                        />
                      </ListItemButton>
                    )
                  })}
                </List>
              </Box>

              <Box
                sx={{
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, minHeight: 28 }}>
                  <Typography sx={{ fontWeight: 850, color: '#0f172a' }}>
                    Mi cuadrilla{' '}
                    <Box component="span" sx={{ color: '#64748b', fontWeight: 600 }}>
                      ({ownCrewHeaderCount})
                    </Box>
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    flex: 1,
                    height: 320,
                    minHeight: 320,
                    maxHeight: 320,
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 1,
                  }}
                >
                  {!selectedOwnSession ? (
                    <Box sx={{ px: 1.25, py: 1 }}>
                      <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: 13 }}>
                        Selección actual
                      </Typography>

                      {filteredCurrentSelectedItems.length === 0 ? (
                        <Typography sx={{ color: '#64748b', fontSize: 12.5, mt: 0.5 }}>
                          Aún no hay colaboradores seleccionados.
                        </Typography>
                      ) : (
                        <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                          {filteredCurrentSelectedItems.map((item) => {
                            const collaborator = selectedCollaboratorFromId(item.id)
                            return (
                              <Box key={`${item.role}-${item.id}`} sx={{ py: 0.75 }}>
                                <Typography sx={{ color: '#0f172a', fontWeight: 800, fontSize: 14 }}>
                                  {fullNameUpper(collaborator)}
                                </Typography>
                                <Typography sx={{ color: '#64748b', fontSize: 12.5 }}>
                                  {collaboratorSubtitle(collaborator)}
                                </Typography>
                              </Box>
                            )
                          })}
                        </Stack>
                      )}
                    </Box>
                  ) : (
                    <Box sx={{ px: 1.25, py: 1 }}>
                      <Typography
                        sx={{
                          display: 'block',
                          width: '100%',
                          bgcolor: colors.blue3,
                          color: colors.white,
                          fontWeight: 900,
                          fontSize: 15,
                          letterSpacing: 0.3,
                          px: 1.25,
                          py: 0.5,
                          borderRadius: 0.75,
                          mb: 1,
                        }}
                      >
                        {String(selectedOwnSession.work_front_name || 'Sin frente').toUpperCase()}
                      </Typography>

                      <Stack spacing={0.25}>
                        {filteredOwnSessionCollaboratorsByHierarchy.map((item) => (
                          <Box key={`${item.session_id}-${item.collaborator_id}`} sx={{ py: 0.75 }}>
                            <Typography sx={{ color: '#0f172a', fontWeight: 800, fontSize: 14 }}>
                              {fullNameUpper(item)}
                            </Typography>
                              <Typography sx={{ color: '#64748b', fontSize: 12.5 }}>
                                {collaboratorSubtitle(item)}
                              </Typography>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Box>
              </Box>

              <Box
                sx={{
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, minHeight: 28 }}>
                  <Typography sx={{ fontWeight: 850, color: '#0f172a' }}>
                    Asignados en otras cuadrillas{' '}
                    <Box component="span" sx={{ color: '#64748b', fontWeight: 600 }}>
                      ({assignedCollaborators.filter((item) => !item.is_own_session).length} colaboradores)
                    </Box>
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    flex: 1,
                    height: 320,
                    minHeight: 320,
                    maxHeight: 320,
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 1,
                  }}
                >
                  {filteredOtherAssignedGroups.length === 0 ? (
                    <Typography sx={{ py: 3, color: '#64748b', textAlign: 'center' }}>No hay asignaciones de otros usuarios.</Typography>
                  ) : null}
                  {filteredOtherAssignedGroups.map(([sessionId, items]) => {
                    const sortedItems = sortAssignedByHierarchy(items)

                    return (
                      <Box
                        key={sessionId}
                        sx={{
                          p: 1.25,
                          borderBottom: '1px solid #e2e8f0',
                          '&:last-of-type': { borderBottom: 0 },
                        }}
                      >
                        <Typography
                          sx={{
                            display: 'block',
                            width: '100%',
                            bgcolor: colors.blue3,
                            color: colors.white,
                            fontWeight: 900,
                            fontSize: 15,
                            letterSpacing: 0.3,
                            px: 1.25,
                            py: 0.5,
                            borderRadius: 0.75,
                            mb: 0.75,
                          }}
                        >
                          {String(items[0]?.work_front_name || 'Sin frente').toUpperCase()}
                        </Typography>

                        <Box sx={{ mb: 0.75 }}>
                          {(() => {
                            const [reporterName, reporterPosition] = String(reporterLabel(items[0]) || '')
                              .split('·')
                              .map((value) => value.trim())

                            return (
                              <Typography component="div" sx={{ color: '#64748b', fontSize: 12.5 }}>
                                <Box component="div">
                                  Reportador: {reporterName}
                                </Box>

                                {reporterPosition ? (
                                  <Box component="div" sx={{ pl: '72px', color: '#94a3b8' }}>
                                    {reporterPosition}
                                  </Box>
                                ) : null}
                              </Typography>
                            )
                          })()}
                        </Box>

                        <Stack spacing={0.25}>
                          {sortedItems.map((item) => (
                            <Box key={`${item.session_id}-${item.collaborator_id}`} sx={{ py: 0.75 }}>
                              <Typography sx={{ color: '#0f172a', fontWeight: 800, fontSize: 14 }}>
                                {fullNameUpper(item)}
                              </Typography>
                              <Typography sx={{ color: '#64748b', fontSize: 12.5 }}>
                                {assignedCollaboratorSubtitle(item)}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    )
                  })}
                </Box>
              </Box>
            </Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                onClick={() => void saveCrewDraft()}
                disabled={saving || !canCreateForDate}
                sx={{ textTransform: 'none', fontWeight: 400, bgcolor: colors.blue3, '&:hover': { bgcolor: colors.blue2 } }}
              >
                Crear cuadrilla
              </Button>
            </Stack>
          </Paper>

          <Paper sx={{ display: mobilePanelDisplay('activity'), p: { xs: 2, md: 2.5 }, borderRadius: 1, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#0f172a' }}>Registrar actividad</Typography>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>
                  {editingActivityRef ? 'Editando una actividad existente.' : 'Agrega actividades a una cuadrilla abierta del día.'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                {editingActivityRef ? (
                  <Button onClick={resetActivityForm} sx={{ textTransform: 'none', fontWeight: 800 }}>Cancelar edición</Button>
                ) : null}
                <Button startIcon={<AddIcon />} onClick={addActivity} disabled={!canRegisterActivities || Boolean(editingActivityRef)} sx={{ textTransform: 'none', fontWeight: 800 }}>Agregar</Button>
              </Stack>
            </Stack>
            <FormControl fullWidth size="small" disabled={!canCreateForDate || openStaffingSessions.length === 0} sx={{ mb: 1.5 }}>
              <InputLabel id="activity-session-select-label">Cuadrilla</InputLabel>
              <Select
                labelId="activity-session-select-label"
                label="Cuadrilla"
                value={selectedActivitySessionId}
                onChange={(event) => setSelectedActivitySessionId(String(event.target.value))}
                renderValue={(selected) => {
                  const staffingSession = openStaffingSessions.find((item) => item.id === selected)
                  if (!staffingSession) return ''

                  const option = staffingSessionOption(staffingSession)

                  return (
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
                      <Typography component="span" sx={{ color: '#0f172a', fontWeight: 500 }}>
                        {option.frontText}
                      </Typography>

                      {option.supervisorName ? (
                        <>
                          <Typography component="span" sx={{ color: '#0f172a' }}>
                            · {option.supervisorName}
                          </Typography>
                          <Typography component="span" sx={{ color: '#64748b' }}>
                            {option.supervisorPosition ? `(${option.supervisorPosition})` : ''}
                          </Typography>
                        </>
                      ) : null}
                    </Box>
                  )
                }}
              >
                {openStaffingSessions.map((staffingSession) => {
                  const option = staffingSessionOption(staffingSession)

                  return (
                    <MenuItem key={staffingSession.id} value={staffingSession.id}>
                      <Box>
                        <Typography sx={{ color: '#0f172a', fontWeight: 700 }}>
                          {option.frontText}
                        </Typography>
                        {option.supervisorName ? (
                          <Typography sx={{ color: '#64748b', fontSize: 13 }}>
                            {option.supervisorName}
                            {option.supervisorPosition ? ` · ${option.supervisorPosition}` : ''}
                          </Typography>
                        ) : null}
                      </Box>
                    </MenuItem>
                  )
                })}
              </Select>
            </FormControl>
            {canCreateForDate && openStaffingSessions.length === 0 ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Crea una cuadrilla abierta para poder registrar actividades.
              </Alert>
            ) : null}
            <Stack spacing={1.25}>
              {activities.map((activity, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      md: '180px 150px 130px 150px 150px minmax(0, 1fr) auto',
                    },
                    gap: 1,
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  <Autocomplete
                    freeSolo
                    options={activeActivityIndex === index ? activitySuggestions : []}
                    inputValue={activity.activity}
                    value={activity.activity}
                    loading={activeActivityIndex === index && loadingActivitySuggestions}
                    onFocus={() => {
                      setActiveActivityIndex(index)
                      setActivitySuggestionQuery(activity.activity)
                    }}
                    onInputChange={(_event, value) => {
                      setActiveActivityIndex(index)
                      setActivitySuggestionQuery(value)
                      updateActivity(index, { activity: value })
                    }}
                    onChange={(_event, value) => {
                      const nextValue = typeof value === 'string' ? value : ''
                      updateActivity(index, { activity: nextValue })
                      setActivitySuggestionQuery(nextValue)
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Actividad"
                        size="small"
                      />
                    )}
                    disabled={!canRegisterActivities}
                    sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}
                  />

                  <FormControl size="small" disabled={!canRegisterActivities}>
                    <InputLabel id={`activity-type-${index}`}>Tipo de actividad</InputLabel>
                    <Select
                      labelId={`activity-type-${index}`}
                      label="Tipo de actividad"
                      value={activity.activity_type}
                      onChange={(event) => updateActivityType(index, event.target.value as ActivityForm['activity_type'])}
                    >
                      <MenuItem value="administrative">Gestión / Documental</MenuItem>
                      <MenuItem value="operational">Operacional</MenuItem>
                    </Select>
                  </FormControl>

                  {activity.activity_type === 'operational' ? (
                    <>
                      <TextField
                        label="Cantidad"
                        type="number"
                        value={activity.quantity}
                        onChange={(event) => updateActivity(index, { quantity: event.target.value })}
                        size="small"
                        disabled={!canRegisterActivities}
                        inputProps={{ min: 0, step: 'any' }}
                        sx={{ width: '100%' }}
                      />

                      <FormControl size="small" disabled={!canRegisterActivities} sx={{ width: '100%' }}>
                        <InputLabel id={`activity-unit-${index}`}>Unidad</InputLabel>
                        <Select
                          labelId={`activity-unit-${index}`}
                          label="Unidad"
                          value={activity.unit}
                          onChange={(event) => updateActivity(index, { unit: String(event.target.value) })}
                        >
                          {activityUnitOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </>
                  ) : (
                    <>
                      <Box />
                      <Box />
                    </>
                  )}

                  <TextField
                    label="Hora inicio"
                    type="time"
                    value={activity.activity_start_time}
                    onChange={(event) => updateActivity(index, { activity_start_time: event.target.value })}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    disabled={!canRegisterActivities}
                  />

                  <TextField
                    label="Hora fin"
                    type="time"
                    value={activity.activity_end_time}
                    onChange={(event) => updateActivity(index, { activity_end_time: event.target.value })}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    disabled={!canRegisterActivities}
                  />

                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="flex-end"
                    alignItems="center"
                    sx={{
                      gridColumn: { xs: '1', md: '7 / -1' },
                      justifySelf: 'end',
                    }}
                  >
                    {activity.activity_type === 'operational' ? (
                      <Tooltip title="Adjuntar evidencia fotográfica">
                        <span>
                          <Button
                            component="label"
                            variant="outlined"
                            disabled={!canRegisterActivities || activity.activity.trim().length === 0 || Boolean(uploadingActivityImages[index])}
                            startIcon={uploadingActivityImages[index] ? <CircularProgress size={16} /> : <PhotoCameraIcon fontSize="small" />}
                            sx={{
                              height: 40,
                              minWidth: 132,
                              px: 1.5,
                              textTransform: 'none',
                              fontWeight: 400,
                              borderColor: '#cbd5e1',
                              color: '#334155',
                              bgcolor: '#f8fafc',
                              '&:hover': {
                                borderColor: colors.blue3,
                                bgcolor: '#eff6ff',
                                color: colors.blue3,
                              },
                              '&.Mui-disabled': {
                                bgcolor: '#f1f5f9',
                                color: '#94a3b8',
                                borderColor: '#e2e8f0',
                              },
                            }}
                          >
                            Evidencia
                            <input
                              hidden
                              multiple
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                void uploadActivityImages(index, event.target.files)
                                event.target.value = ''
                              }}
                            />
                          </Button>
                        </span>
                      </Tooltip>
                    ) : null}

                    <Button
                      variant="contained"
                      startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                      onClick={() => void saveSingleActivity(index)}
                      disabled={saving || !canRegisterActivities}
                      sx={{
                        height: 40,
                        minWidth: 140,
                        textTransform: 'none',
                        fontWeight: 400,
                        bgcolor: colors.blue3,
                        '&:hover': { bgcolor: colors.blue2 },
                      }}
                    >
                      {editingActivityRef && index === 0 ? 'Guardar cambios' : 'Guardar'}
                    </Button>

                    <IconButton
                      aria-label="Eliminar actividad"
                      disabled={!canRegisterActivities}
                      onClick={() => removeActivity(index)}
                      size="small"
                      sx={{
                        width: 40,
                        height: 40,
                        minWidth: 40,
                        border: '1px solid #e2e8f0',
                        borderRadius: 1,
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>

                  </Stack>

                  {(activity.images || []).map((image, imageIndex) => (
                    <Chip
                      key={`${image.key}-${imageIndex}`}
                      label={image.name || `Imagen ${imageIndex + 1}`}
                      size="small"
                      onClick={() => void openStaffingEvidence(image.key)}
                      onDelete={() => removeActivityImage(index, imageIndex)}
                      sx={{ gridColumn: { xs: '1', md: '1 / -1' }, maxWidth: 240 }}
                    />
                  ))}

                  <TextField
                    label="Observaciones / excepciones"
                    value={activity.activity_observations}
                    onChange={(event) => updateActivity(index, { activity_observations: event.target.value })}
                    size="small"
                    disabled={!canRegisterActivities}
                    sx={{ gridColumn: { xs: '1', md: '1 / 5' } }}
                  />

                  <TextField
                    label="Restricciones"
                    value={activity.restrictions}
                    onChange={(event) => updateActivity(index, { restrictions: event.target.value })}
                    size="small"
                    disabled={!canRegisterActivities}
                    sx={{ gridColumn: { xs: '1', md: '5 / -1' } }}
                  />
                </Box>
              ))}
            </Stack>
          </Paper>

          <Paper sx={{ display: mobilePanelDisplay('history'), p: { xs: 2, md: 2.5 }, borderRadius: 1, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#0f172a' }}>Actividades</Typography>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>{editableActivitiesCount} actividades para {date}</Typography>
              </Box>
              {loadingSessions ? <CircularProgress size={22} /> : null}
            </Stack>
            <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' } }}>
              {sessions.length === 0 ? (
                <Typography sx={{ color: '#64748b', py: 3, textAlign: 'center' }}>No hay jornadas para la fecha.</Typography>
              ) : null}
              {sessions.map((session) => {
                const status = String(session.status || '').toLowerCase()
                const isCreator = Boolean(currentUserId && String(session.created_by || '').trim() === currentUserId)
                const isDraft = status === 'draft'
                const hasGeneratedCrew = Boolean(session.generated_crew_id)
                const isToday = String(session.work_date || date || '').slice(0, 10) === todayYmd()
                const canClose = isCreator && isDraft && !hasGeneratedCrew
                const canDelete = canClose && isToday
                const sessionActivities = Array.isArray(session.activities) ? session.activities : []
                const canEditSessionActivities = isCreator && ['draft', 'reopened'].includes(status)
                const sessionImages = sessionActivityImages(session)

                return (
                  <Box
                    key={session.id}
                    sx={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 1,
                      p: 1.25,
                      bgcolor: '#fff',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900, color: '#0f172a', fontSize: 14 }} noWrap>
                          {session.work_front_name || 'Sin frente'}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                          {sessionStatusLabel(session.status)} · {Array.isArray(session.workers) ? session.workers.length : 0} colaboradores
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Cerrar jornada">
                          <span>
                            <IconButton aria-label="Cerrar jornada" size="small" disabled={!canClose || closingId === session.id} onClick={() => void closeDay(session.id)}>
                              {closingId === session.id ? <CircularProgress size={18} /> : <DoneAllIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Eliminar borrador">
                          <span>
                            <IconButton aria-label="Eliminar borrador" size="small" disabled={!canDelete || deletingId === session.id} onClick={() => void deleteDraft(session.id)}>
                              {deletingId === session.id ? <CircularProgress size={18} /> : <DeleteOutlineIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    <Stack spacing={0.75} sx={{ mt: 1 }}>
                      {sessionActivities.length === 0 ? (
                        <Typography sx={{ fontSize: 13, color: '#64748b' }}>Sin actividades registradas.</Typography>
                      ) : null}
                      {sessionActivities.map((activity: any, activityIndex: number) => {
                        const activityStatus = activityStatusFromValue(activity)
                        const activityType = activityTypeFromValue(activity)
                        const canEditActivity = canEditSessionActivities && activityStatus !== 'closed'
                        const activityUnit = String(activity?.unit ?? activity?.metadata?.unit ?? '').trim()
                        const activityQuantity = String(activity?.quantity ?? activity?.metadata?.quantity ?? '').trim()

                        return (
                          <Box
                            key={String(activity?.id || activityIndex)}
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              gap: 1,
                              alignItems: 'center',
                              borderTop: '1px solid #f1f5f9',
                              pt: 0.75,
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontSize: 13.5, fontWeight: 850, color: '#0f172a' }} noWrap>
                                {activity?.activity || `Actividad ${activityIndex + 1}`}
                              </Typography>
                              <Typography sx={{ color: '#64748b', fontSize: 12 }} noWrap>
                                {[
                                  activityStatusLabel(activityStatus),
                                  activity?.activity_start_time ? String(activity.activity_start_time).slice(0, 5) : null,
                                  activity?.activity_end_time ? String(activity.activity_end_time).slice(0, 5) : null,
                                  activityType === 'operational' && activityQuantity && activityUnit ? `${activityQuantity} ${activityUnit}` : null,
                                ].filter(Boolean).join(' · ')}
                              </Typography>
                            </Box>
                            <Tooltip title={canEditActivity ? 'Editar actividad' : 'No editable'}>
                              <span>
                                <IconButton
                                  aria-label="Editar actividad"
                                  size="small"
                                  disabled={!canEditActivity}
                                  onClick={() => beginEditActivity(session, activity)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        )
                      })}
                    </Stack>

                    {sessionImages.length > 0 ? (
                      <Button
                        size="small"
                        onClick={() => void openStaffingEvidence(sessionImages[0].key)}
                        sx={{ mt: 0.75, minWidth: 0, p: 0, textTransform: 'none', fontSize: 12 }}
                      >
                        Ver imagen ({sessionImages.length})
                      </Button>
                    ) : null}
                  </Box>
                )
              })}
            </Stack>

            <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Frente</TableCell>
                    <TableCell>Supervisor</TableCell>
                    <TableCell>Capataz</TableCell>
                    <TableCell align="right">Colaboradores</TableCell>
                    <TableCell align="right">Actividades</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ color: '#64748b', py: 4 }}>No hay jornadas para la fecha.</TableCell>
                    </TableRow>
                  ) : null}
                  {sessions.map((session) => {
                    const status = String(session.status || '').toLowerCase()
                    const isCreator = Boolean(currentUserId && String(session.created_by || '').trim() === currentUserId)
                    const isDraft = status === 'draft'
                    const hasGeneratedCrew = Boolean(session.generated_crew_id)
                    const isToday = String(session.work_date || date || '').slice(0, 10) === todayYmd()
                    const canClose = isCreator && isDraft && !hasGeneratedCrew
                    const canDelete = canClose && isToday
                    const sessionSupervisorIds = sessionRoleIds(session, 'supervisor')
                    const sessionForemanIds = sessionRoleIds(session, 'foreman')
                    const sessionImages = sessionActivityImages(session)
                    const sessionActivities = Array.isArray(session.activities) ? session.activities : []
                    const canEditSessionActivities = isCreator && ['draft', 'reopened'].includes(status)
                    return (
                      <TableRow key={session.id} hover>
                        <TableCell sx={{ fontWeight: 800 }}>{session.work_front_name || '-'}</TableCell>
                        <TableCell>{collaboratorLabels(sessionSupervisorIds)}</TableCell>
                        <TableCell>{collaboratorLabels(sessionForemanIds)}</TableCell>
                        <TableCell align="right">{Array.isArray(session.workers) ? session.workers.length : 0}</TableCell>
                        <TableCell align="right">
                          <Stack spacing={0.25} alignItems="flex-end">
                            {sessionActivities.length === 0 ? (
                              <Typography sx={{ fontSize: 13, color: '#64748b' }}>Sin actividades</Typography>
                            ) : null}
                            {sessionActivities.map((activity: any, activityIndex: number) => {
                              const activityStatus = activityStatusFromValue(activity)
                              const activityType = activityTypeFromValue(activity)
                              const canEditActivity = canEditSessionActivities && activityStatus !== 'closed'
                              const activityUnit = String(activity?.unit ?? activity?.metadata?.unit ?? '').trim()
                              const activityQuantity = String(activity?.quantity ?? activity?.metadata?.quantity ?? '').trim()

                              return (
                                <Stack key={String(activity?.id || activityIndex)} direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end" sx={{ maxWidth: 360 }}>
                                  <Box sx={{ minWidth: 0, textAlign: 'right' }}>
                                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }} noWrap>
                                      {activity?.activity || `Actividad ${activityIndex + 1}`}
                                    </Typography>
                                    <Typography sx={{ fontSize: 12, color: '#64748b' }} noWrap>
                                      {[
                                        activityStatusLabel(activityStatus),
                                        activity?.activity_start_time ? String(activity.activity_start_time).slice(0, 5) : null,
                                        activity?.activity_end_time ? String(activity.activity_end_time).slice(0, 5) : null,
                                        activityType === 'operational' && activityQuantity && activityUnit ? `${activityQuantity} ${activityUnit}` : null,
                                      ].filter(Boolean).join(' · ')}
                                    </Typography>
                                  </Box>
                                  <Tooltip title={canEditActivity ? 'Editar actividad' : 'No editable'}>
                                    <span>
                                      <IconButton
                                        aria-label="Editar actividad"
                                        size="small"
                                        disabled={!canEditActivity}
                                        onClick={() => beginEditActivity(session, activity)}
                                      >
                                        <EditIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Stack>
                              )
                            })}
                            {sessionImages.length > 0 ? (
                              <Button
                                size="small"
                                onClick={() => void openStaffingEvidence(sessionImages[0].key)}
                                sx={{ minWidth: 0, p: 0, textTransform: 'none', fontSize: 12 }}
                              >
                                Ver imagen ({sessionImages.length})
                              </Button>
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell>{sessionStatusLabel(session.status)}</TableCell>
                        <TableCell align="right">
                          <IconButton aria-label="Cerrar jornada" disabled={!canClose || closingId === session.id} onClick={() => void closeDay(session.id)}>
                            {closingId === session.id ? <CircularProgress size={18} /> : <DoneAllIcon />}
                          </IconButton>
                          <IconButton aria-label="Eliminar borrador" disabled={!canDelete || deletingId === session.id} onClick={() => void deleteDraft(session.id)}>
                            {deletingId === session.id ? <CircularProgress size={18} /> : <DeleteOutlineIcon />}
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      </Container>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice(null)}>
        {notice ? <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.message}</Alert> : undefined}
      </Snackbar>
    </>
  )
}
