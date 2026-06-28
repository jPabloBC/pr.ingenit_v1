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
  Dialog,
  DialogContent,
  DialogTitle,
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
import { PickersDay } from '@mui/x-date-pickers/PickersDay'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import RefreshIcon from '@mui/icons-material/Refresh'
import SaveIcon from '@mui/icons-material/Save'
import SendIcon from '@mui/icons-material/Send'
import { Trash2 } from 'lucide-react'
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
  activity_description: string
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

type StaffingEvidenceViewerItem = StaffingEvidenceFile & {
  activityLabel?: string
  url?: string
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
  activity_description: '',
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
  const [attendanceSourceDate, setAttendanceSourceDate] = useState<string | null>(null)
  const [loadingAvailableDates, setLoadingAvailableDates] = useState(false)
  const [loadingFronts, setLoadingFronts] = useState(false)
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [highlightMissingActivityIds, setHighlightMissingActivityIds] = useState<string[]>([])
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [activeActivityIndex, setActiveActivityIndex] = useState<number | null>(null)
  const [activitySuggestionQuery, setActivitySuggestionQuery] = useState('')
  const [activitySuggestions, setActivitySuggestions] = useState<string[]>([])
  const [loadingActivitySuggestions, setLoadingActivitySuggestions] = useState(false)
  const [uploadingActivityImages, setUploadingActivityImages] = useState<Record<number, boolean>>({})
  const [evidenceViewerOpen, setEvidenceViewerOpen] = useState(false)
  const [evidenceViewerLoading, setEvidenceViewerLoading] = useState(false)
  const [evidenceViewerIndex, setEvidenceViewerIndex] = useState(0)
  const [evidenceViewerItems, setEvidenceViewerItems] = useState<StaffingEvidenceViewerItem[]>([])
  const [editingActivityRef, setEditingActivityRef] = useState<{ id: string; sessionId: string } | null>(null)
  const [collaboratorSearch, setCollaboratorSearch] = useState('')
  const [activeMobilePanel, setActiveMobilePanel] = useState<'crew' | 'activity' | 'history'>('crew')
  const currentUserId = String((session?.user as any)?.id || '').trim()

  const selectedFront = useMemo(
    () => fronts.find((front, index) => frontKey(front, index) === frontValue) || null,
    [frontValue, fronts]
  )

  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates])

  const selectedDateValue = useMemo(() => parseYmdToDate(date), [date])

  const hasAvailableDates = availableDates.length > 0

  const today = todayYmd()
  const isPastSelectedDate = Boolean(date && date < today)
  const isTodaySelectedDate = Boolean(date && date === today)
  const canCreateForDate = Boolean(date && availableDateSet.has(date) && isTodaySelectedDate)

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
            .filter((item: string) => item >= todayYmd())
        )).sort((a: string, b: string) => a.localeCompare(b))
        : []
      setAttendanceSourceDate(String(json?.attendance_source_date || '').trim().slice(0, 10) || null)
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
      setAttendanceSourceDate(null)
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
            .filter((item: string) => item >= todayYmd())
        )).sort((a: string, b: string) => a.localeCompare(b))
        : []
      setAttendanceSourceDate(String(json?.attendance_source_date || '').trim().slice(0, 10) || null)
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
      setAttendanceSourceDate(null)
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
    if (format(value, 'yyyy-MM-dd') !== todayYmd()) return true
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
    if (normalizedStatus === 'reopened') return 'Borrador'
    if (normalizedStatus === 'submitted') return 'Enviado'
    if (normalizedStatus === 'closed') return 'Cerrado'
    return String(status || '-')
  }

  const activitySendValidationMessage = (activity: Partial<ActivityForm> | any) => {
    const activityName = String(activity?.activity || '').trim()
    const activityDescription = String(activity?.activity_description || '').trim()
    const activityType = activityTypeFromValue(activity)
    const startTime = String(activity?.activity_start_time || '').trim()
    const endTime = String(activity?.activity_end_time || '').trim()
    const quantity = String(activity?.quantity ?? activity?.metadata?.quantity ?? '').trim()
    const unit = String(activity?.unit ?? activity?.metadata?.unit ?? '').trim()
    const images = activityImagesFromValue(activity)

    if (!activityName) return 'Ingresa la actividad.'
    if (!activityDescription) return 'Ingresa la descripción de la actividad.'
    if (!activityType) return 'Selecciona el tipo de actividad.'
    if (!startTime) return 'Ingresa la hora inicio.'
    if (!endTime) return 'Ingresa la hora fin.'
    if (activityType === 'operational' && (!quantity || !unit)) {
      return 'Las actividades operacionales requieren cantidad y unidad.'
    }
    if (activityType === 'operational' && images.length === 0) {
      return 'Las actividades operacionales requieren evidencia.'
    }
    return ''
  }

  const activityFormFromValue = (value: any): ActivityForm => {
    const type = activityTypeFromValue(value)
    return {
      activity: String(value?.activity || '').trim(),
      activity_description: String(value?.activity_description || '').trim(),
      activity_type: type,
      activity_start_time: String(value?.activity_start_time || '').slice(0, 5),
      activity_end_time: String(value?.activity_end_time || '').slice(0, 5),
      activity_observations: String((value?.observations ?? value?.activity_observations) || '').trim(),
      restrictions: String(value?.restrictions || '').trim(),
      quantity: type === 'operational' ? String(value?.quantity ?? value?.metadata?.quantity ?? '').trim() : '',
      unit: type === 'operational' ? String(value?.unit ?? value?.metadata?.unit ?? '').trim() : '',
      images: activityImagesFromValue(value),
    }
  }

  const editableActivitiesCount = sessions.reduce((count, session) => (
    count + (Array.isArray(session.activities) ? session.activities.length : 0)
  ), 0)

  const optimizeImageFile = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file
    try {
      const srcUrl = URL.createObjectURL(file)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = srcUrl
      })

      const maxDimension = 1920
      const ratio = Math.min(1, maxDimension / Math.max(img.width, img.height))
      const width = Math.max(1, Math.round(img.width * ratio))
      const height = Math.max(1, Math.round(img.height * ratio))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(srcUrl)
        return file
      }
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(srcUrl)

      const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
      const quality = outputType === 'image/webp' ? 0.9 : 0.88
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, quality))
      if (!blob) return file
      if (blob.size >= file.size * 0.98) return file

      const baseName = file.name.replace(/\.[a-zA-Z0-9]+$/, '')
      const ext = outputType === 'image/webp' ? '.webp' : '.jpg'
      return new File([blob], `${baseName}${ext}`, { type: outputType, lastModified: Date.now() })
    } catch {
      return file
    }
  }

  const optimizeImageFiles = async (files: File[]) => {
    const optimized: File[] = []
    for (const file of files) optimized.push(await optimizeImageFile(file))
    return optimized
  }

  const uploadActivityImages = async (index: number, fileList: FileList | null) => {
    const files = Array.from(fileList || []).filter((file) => String(file.type || '').startsWith('image/'))
    if (!files.length) return
    if (activities[index]?.activity_type !== 'operational') return
    const currentCount = Array.isArray(activities[index]?.images) ? activities[index].images.length : 0
    const remaining = Math.max(0, 5 - currentCount)
    if (remaining <= 0) {
      setNotice({ severity: 'error', message: 'Maximo 5 imagenes por actividad operacional.' })
      return
    }
    const selectedFiles = files.slice(0, remaining)
    if (selectedFiles.length !== files.length) {
      setNotice({ severity: 'info', message: 'Solo se agregaran imagenes hasta completar un maximo de 5 por actividad operacional.' })
    }

    setUploadingActivityImages((prev) => ({ ...prev, [index]: true }))
    try {
      const optimizedFiles = await optimizeImageFiles(selectedFiles)
      const uploaded: StaffingEvidenceFile[] = []
      for (const file of optimizedFiles) {
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
            ? { ...activity, images: [...(activity.images || []), ...uploaded].slice(0, 5) }
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

  const openStaffingEvidenceGallery = async (items: StaffingEvidenceViewerItem[], initialKey: string) => {
    const cleanItems = items
      .map((item) => ({ ...item, key: String(item?.key || '').trim() }))
      .filter((item) => item.key)
    const cleanKey = String(initialKey || cleanItems[0]?.key || '').trim()
    if (!cleanItems.length || !cleanKey) return

    const initialIndex = Math.max(0, cleanItems.findIndex((item) => item.key === cleanKey))
    setEvidenceViewerOpen(true)
    setEvidenceViewerLoading(true)
    setEvidenceViewerIndex(initialIndex >= 0 ? initialIndex : 0)
    setEvidenceViewerItems(cleanItems)

    try {
      const loadedItems = await Promise.all(cleanItems.map(async (item) => {
        const res = await fetch(`/api/staffing-activities/evidence/view?key=${encodeURIComponent(item.key)}`, { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.url) throw new Error(json?.error || 'No se pudo abrir la imagen')
        return { ...item, url: String(json.url) }
      }))
      setEvidenceViewerItems(loadedItems)
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error abriendo imagen' })
      setEvidenceViewerOpen(false)
    } finally {
      setEvidenceViewerLoading(false)
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
    if (isPastSelectedDate) return setNotice({ severity: 'error', message: 'No se puede crear dotación para fechas pasadas.' })
    if (!isTodaySelectedDate) return setNotice({ severity: 'error', message: 'La dotación solo se puede crear para la fecha actual.' })
    if (!canCreateForDate) return setNotice({ severity: 'error', message: 'No existe asistencia de hoy ni del día anterior para usar como base de dotación.' })
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
      activity_description: activity.activity_description.trim(),
      activity_start_time: activity.activity_start_time || null,
      activity_end_time: activity.activity_end_time || null,
      observations: activity.activity_observations.trim() || null,
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
    if (!cleanActivity.activity) return setNotice({ severity: 'error', message: 'Ingresa la actividad.' })

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

      setNotice({ severity: 'success', message: 'Descripción de actividad actualizada.' })
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

      setNotice({ severity: 'success', message: 'Descripción de actividad registrada.' })

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
        activity_description: activity.activity_description.trim(),
        activity_start_time: activity.activity_start_time || null,
        activity_end_time: activity.activity_end_time || null,
        observations: activity.activity_observations.trim() || null,
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
    <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 0.35, minWidth: 0, overflow: 'hidden' }}>
      {uniqueStrings(ids).map((id) => (
        <Chip
          key={id}
          label={collaboratorLabel(id)}
          size="small"
          sx={{
            maxWidth: { xs: 92, md: 180 },
            height: { xs: 20, md: 24 },
            '& .MuiChip-label': {
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              px: { xs: 0.75, md: 1 },
              fontSize: { xs: 10, md: 12 },
            },
          }}
        />
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

  const deleteActivity = async (staffingSession: StaffingSession, activity: any) => {
    const activityId = String(activity?.id || '').trim()
    if (!activityId) {
      setNotice({ severity: 'error', message: 'No se pudo identificar la actividad.' })
      return
    }

    const activityLabel = String(activity?.activity || activity?.activity_description || 'esta actividad').trim()
    const confirmed = window.confirm(
      `Eliminar actividad: ${activityLabel}\n\nRiesgo: esta acción es permanente y eliminará la actividad, sus datos asociados y sus evidencias registradas. No podrás recuperarla desde esta pantalla.\n\nAceptar y continuar?`
    )
    if (!confirmed) return

    try {
      setDeletingActivityId(activityId)
      const res = await fetch(`/api/staffing-activities/${encodeURIComponent(staffingSession.id)}/activities`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_id: activityId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar la actividad')

      if (editingActivityRef?.id === activityId) resetActivityForm()
      setNotice({ severity: 'success', message: 'Actividad eliminada.' })
      await loadSessions(date)
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error eliminando actividad' })
    } finally {
      setDeletingActivityId(null)
    }
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

  const canCloseStaffingSession = (session: StaffingSession) => {
    const status = String(session.status || '').toLowerCase()
    const isCreator = Boolean(currentUserId && String(session.created_by || '').trim() === currentUserId)
    const isDraft = status === 'draft'
    const hasGeneratedCrew = Boolean(session.generated_crew_id)
    return isCreator && isDraft && !hasGeneratedCrew
  }

  const canDeleteStaffingSession = (session: StaffingSession) => {
    const isToday = String(session.work_date || date || '').slice(0, 10) === todayYmd()
    return canCloseStaffingSession(session) && isToday
  }

  const activityHasRequiredData = (activity: any) => {
    return activitySendValidationMessage(activity) === ''
  }

  const completeActivitiesCount = sessions.reduce((count, staffingSession) => (
    count + (Array.isArray(staffingSession.activities)
      ? staffingSession.activities.filter((activity: any) => activityHasRequiredData(activity)).length
      : 0)
  ), 0)
  const pendingActivitiesCount = Math.max(editableActivitiesCount - completeActivitiesCount, 0)

  const activityMissingFields = (activity: any) => {
    const activityType = activityTypeFromValue(activity)
    const missing: string[] = []

    if (!String(activity?.activity || '').trim()) missing.push('actividad')
    if (!String(activity?.activity_description || '').trim()) missing.push('descripcion')
    if (!activityType) missing.push('tipo')
    if (!String(activity?.activity_start_time || '').trim()) missing.push('inicio')
    if (!String(activity?.activity_end_time || '').trim()) missing.push('fin')
    if (activityType === 'operational') {
      if (!String(activity?.quantity ?? activity?.metadata?.quantity ?? '').trim()) missing.push('cantidad')
      if (!String(activity?.unit ?? activity?.metadata?.unit ?? '').trim()) missing.push('unidad')
      if (activityImagesFromValue(activity).length === 0) missing.push('evidencia')
    }
    return missing
  }

  const missingFieldSx = (active: boolean) => active
    ? {
        color: '#b45309',
        textDecoration: 'underline',
        textDecorationColor: '#f59e0b',
        textDecorationThickness: '2px',
        textUnderlineOffset: '3px',
      }
    : undefined

  const missingFieldLabel = (field: string) => ({
    tipo: 'tipo',
    evidencia: 'evidencia',
  }[field] || field)

  const sessionActivitiesAreReadyToSend = (session: StaffingSession) => {
    const sessionActivities = Array.isArray(session.activities) ? session.activities : []
    return (
      sessionActivities.length > 0 &&
      sessionActivities.every((activity: any) => activityHasRequiredData(activity))
    )
  }

  const closableSessions = sessions.filter(canCloseStaffingSession)
  const readyToSendSessions = closableSessions.filter(sessionActivitiesAreReadyToSend)
  const deletableSessions = sessions.filter(canDeleteStaffingSession)
  const generalSessionStatusLabel = Array.from(
    new Set(sessions.map((session) => sessionStatusLabel(session.status)).filter(Boolean))
  ).join(' / ') || '-'
  const hasSubmittedSessions = sessions.some((session) => String(session.status || '').toLowerCase() === 'submitted')
  const sendJourneyButtonLabel = !closableSessions.length && hasSubmittedSessions ? 'Jornada enviada' : 'Enviar jornada'
  const activityHistoryRows = sessions.flatMap((session) => {
    const sessionActivities = Array.isArray(session.activities) ? session.activities : []
    return sessionActivities.map((activity: any, activityIndex: number) => ({
      session,
      activity,
      activityIndex,
    }))
  })
  const sessionsWithIncompleteActivities = closableSessions.filter((session) => {
    const sessionActivities = Array.isArray(session.activities) ? session.activities : []
    return sessionActivities.length === 0 || sessionActivities.some((activity: any) => !activityHasRequiredData(activity))
  })
  const sendJourneyDisabledReason = !closableSessions.length
    ? 'No hay jornadas en borrador disponibles para enviar.'
    : sessionsWithIncompleteActivities.length
      ? 'Completa los datos requeridos de todas las actividades antes de enviar.'
      : ''
  const hasSendWarnings = Boolean(sendJourneyDisabledReason && closableSessions.length)

  const closeAvailableSessions = async () => {
    if (readyToSendSessions.length === 0) {
      const missingIds = activityHistoryRows
        .filter(({ session, activity }) => canCloseStaffingSession(session) && activityMissingFields(activity).length > 0)
        .map(({ activity }) => String(activity?.id || '').trim())
        .filter(Boolean)

      setHighlightMissingActivityIds(missingIds)
      setNotice({
        severity: 'info',
        message: sendJourneyDisabledReason || 'Completa los datos requeridos antes de enviar la jornada.',
      })
      return
    }

    setHighlightMissingActivityIds([])
    const closureNotes = window.prompt('Notas de cierre de jornada (opcional):') ?? null
    try {
      setClosingId('__bulk__')
      await Promise.all(readyToSendSessions.map(async (session) => {
        const res = await fetch(`/api/staffing-activities/${encodeURIComponent(session.id)}/close`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ closure_notes: closureNotes }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'No se pudo cerrar la jornada')
      }))
      setNotice({ severity: 'success', message: readyToSendSessions.length === 1 ? 'Jornada enviada.' : 'Jornadas enviadas.' })
      await Promise.all([loadSessions(date), loadCollaborators(date)])
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error enviando jornada' })
    } finally {
      setClosingId(null)
    }
  }

  const deleteAvailableDrafts = async () => {
    if (deletableSessions.length === 0) return
    const message = deletableSessions.length === 1
      ? 'Eliminar este borrador de cuadrilla del día?'
      : `Eliminar ${deletableSessions.length} borradores de cuadrilla del día?`
    if (!window.confirm(message)) return
    try {
      setDeletingId('__bulk__')
      await Promise.all(deletableSessions.map(async (session) => {
        const res = await fetch(`/api/staffing-activities/${encodeURIComponent(session.id)}`, { method: 'DELETE' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar el borrador')
      }))
      setNotice({ severity: 'success', message: deletableSessions.length === 1 ? 'Borrador eliminado.' : 'Borradores eliminados.' })
      await Promise.all([loadSessions(date), loadCollaborators(date)])
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error eliminando borrador' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <UserHeader title="Dotación y actividades" />
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          py: 1,
          width: '100%',
          maxWidth: '100%',
          px: { xs: 0.75, md: 1.5 },
        }}
      >
        <Stack spacing={0.5}>
          <Paper
            sx={{
              display: { xs: 'block', md: 'none' },
              p: 0.75,
              borderRadius: 1,
              border: '1px solid #e2e8f0',
              boxShadow: 'none',
              position: 'sticky',
              top: 0,
              zIndex: 5,
              bgcolor: '#fff',
            }}
          >
            <Stack spacing={0.5}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 0.5,
                  width: '100%',
                }}
              >
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
                        minWidth: 0,
                        width: '100%',
                        height: 40,
                        px: 0.2,
                        py: 0.2,
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
                      <Box sx={{ textAlign: 'center', width: '100%', minWidth: 0 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 850, lineHeight: 1.05 }} noWrap>{item.label}</Typography>
                        <Typography sx={{ fontSize: 10.25, opacity: selected ? 0.9 : 0.65, lineHeight: 1.05, mt: 0.35 }} noWrap>{item.value}</Typography>
                      </Box>
                    </Button>
                  )
                })}
              </Box>
              <Stack
                direction="row"
                spacing={0.75}
                justifyContent="center"
                sx={{
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 500,
                  px: 0.25,
                  textAlign: 'center',
                  flexWrap: 'wrap',
                  rowGap: 0.25,
                }}
              >
                <Box>{date || 'Sin fecha'}</Box>
                <Box>Completas {completeActivitiesCount}</Box>
                <Box>Pendientes {pendingActivitiesCount}</Box>
              </Stack>
            </Stack>
          </Paper>

          <Paper sx={{ display: mobilePanelDisplay('crew'), p: { xs: 0.75, md: 0.75 }, borderRadius: 1, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Typography variant="h6" sx={{ fontWeight: 500, color: '#0f172a', mb: { xs: 0.9, md: 0.5 } }}>Cuadrilla del día</Typography>
            {!loadingAvailableDates && !hasAvailableDates ? (
              <Alert severity="info" sx={{ mb: 1 }}>
                No hay fechas con colaboradores en turno para el mes visible. No es posible crear cuadrillas hasta seleccionar una fecha disponible.
              </Alert>
            ) : null}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '180px 1fr 1fr 1fr auto' },
                gap: { xs: 1.25, md: 0.75 },
                alignItems: 'center',
                '& .MuiInputBase-root': {
                  minHeight: 40,
                  height: 40,
                  alignItems: 'center',
                },
                '& .MuiInputBase-input': {
                  py: 0,
                  height: 40,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 15,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  '&::placeholder': {
                    fontSize: 15,
                    opacity: 0.75,
                  },
                },
                '& .MuiSelect-select': {
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: '0 !important',
                  height: '40px !important',
                  py: '0 !important',
                  boxSizing: 'border-box',
                  fontSize: 15,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
                '& .MuiInputLabel-root': {
                  lineHeight: 1.1,
                  fontSize: { xs: 14.5, md: 13.5 },
                },
              }}
            >
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
                  slots={{
                    day: (props) => {
                      const dayValue = props.day instanceof Date && !Number.isNaN(props.day.getTime())
                        ? format(props.day, 'yyyy-MM-dd')
                        : ''
                      const usesPreviousAttendance = dayValue === todayYmd() && Boolean(attendanceSourceDate && attendanceSourceDate !== todayYmd())
                      return (
                        <PickersDay
                          {...props}
                          sx={{
                            ...(usesPreviousAttendance
                              ? {
                                bgcolor: '#fef3c7',
                                border: '1px solid #f59e0b',
                                color: '#92400e',
                                fontWeight: 700,
                                '&:hover': {
                                  bgcolor: '#fde68a',
                                },
                                '&.Mui-selected': {
                                  bgcolor: '#f59e0b',
                                  color: '#fff',
                                  '&:hover': {
                                    bgcolor: '#d97706',
                                  },
                                },
                              }
                              : {}),
                          }}
                        />
                      )
                    },
                  }}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: 'small',
                      helperText: !loadingAvailableDates && !hasAvailableDates ? 'Sin fechas disponibles' : undefined,
                      sx: {
                        '& .MuiInputBase-input': {
                          textAlign: { xs: 'center', md: 'left' },
                        },
                      },
                    },
                  }}
                />
              </LocalizationProvider>
              <FormControl fullWidth size="small" disabled={loadingFronts || !canCreateForDate}>
                <InputLabel id="front-select-label">Frente / Área de trabajo</InputLabel>
                <Select
                  labelId="front-select-label"
                  label="Frente / Área de trabajo"
                  value={frontValue}
                  onChange={(event) => setFrontValue(String(event.target.value))}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxWidth: { xs: 'calc(100vw - 24px)', md: 420 },
                        '& .MuiMenu-list': { py: 0.25 },
                      },
                    },
                  }}
                >
                  {fronts.map((front, index) => (
                    <MenuItem
                      key={frontKey(front, index)}
                      value={frontKey(front, index)}
                      sx={{
                        minHeight: { xs: 30, md: 38 },
                        py: { xs: 0.25, md: 0.5 },
                        px: { xs: 1, md: 1.25 },
                        maxWidth: '100%',
                      }}
                    >
                      <Typography
                        noWrap
                        sx={{
                          minWidth: 0,
                          maxWidth: '100%',
                          fontSize: { xs: 11, md: 13 },
                          lineHeight: 1.2,
                          color: '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {front.name || front.code || 'Frente sin nombre'}{front.is_active === false ? ' (inactivo)' : ''}
                      </Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small" disabled={!canCreateForDate}>
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
                    <MenuItem key={collaborator.id} value={collaborator.id} sx={{ minHeight: { xs: 38, md: 48 }, py: { xs: 0.4, md: 0.75 }, px: { xs: 1, md: 1.5 } }}>
                      <Checkbox size="small" checked={supervisorIds.includes(collaborator.id)} sx={{ mr: 0.75, p: 0.25 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 850, color: '#0f172a', fontSize: { xs: 11.5, md: 14 }, lineHeight: 1.15 }}>
                          {fullNameUpper(collaborator)}
                        </Typography>
                        <Typography noWrap sx={{ color: '#64748b', fontSize: { xs: 9.5, md: 12 }, lineHeight: 1.15 }}>
                          {collaboratorSubtitle(collaborator)}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small" disabled={!canCreateForDate}>
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
                    <MenuItem key={collaborator.id} value={collaborator.id} sx={{ minHeight: { xs: 38, md: 48 }, py: { xs: 0.4, md: 0.75 }, px: { xs: 1, md: 1.5 } }}>
                      <Checkbox size="small" checked={foremanIds.includes(collaborator.id)} sx={{ mr: 0.75, p: 0.25 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 850, color: '#0f172a', fontSize: { xs: 11.5, md: 14 }, lineHeight: 1.15 }}>
                          {fullNameUpper(collaborator)}
                        </Typography>
                        <Typography noWrap sx={{ color: '#64748b', fontSize: { xs: 9.5, md: 12 }, lineHeight: 1.15 }}>
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
                sx={{ textTransform: 'none', fontWeight: 800, minHeight: 40, px: 1.5 }}
              >
                Actualizar
              </Button>
            </Box>
            <Divider sx={{ my: 0.5 }} />

            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.5 }}>
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
                    minHeight: 40,
                    height: 40,
                    alignItems: 'center',
                  },
                  '& .MuiInputBase-input': {
                    py: 0,
                    height: 40,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 15,
                    lineHeight: 1.2,
                    '&::placeholder': {
                      fontSize: 15,
                      opacity: 0.75,
                    },
                  },
                }}
              />
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' },
                gap: 0.75,
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
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5, minHeight: 24, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 500, color: '#0f172a', minWidth: 0, maxWidth: '100%' }}>
                    Colaboradores{' '}
                    <Box component="span" sx={{ color: '#64748b', fontWeight: 500, fontSize: { xs: 12, md: 14 } }}>
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
                    <Typography sx={{ py: 3, color: '#64748b', textAlign: 'center', fontSize: 12.5 }}>
                      No hay colaboradores disponibles para la fecha.
                    </Typography>
                  ) : null}
                  {filteredSelectableMembers.map((collaborator) => {
                    const checked = memberIds.includes(collaborator.id)
                    const position = collaboratorPositionUpper(collaborator)
                    const document = formatChileRut(collaborator.document)
                    return (
                      <ListItemButton
                        key={collaborator.id}
                        disabled={!canCreateForDate}
                        onClick={() => toggleMember(collaborator.id)}
                        sx={{
                          px: { xs: 0.75, md: 1 },
                          py: { xs: 0.45, md: 0.75 },
                          minHeight: { xs: 42, md: 56 },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: { xs: 28, md: 38 } }}>
                          <Checkbox edge="start" size="small" checked={checked} tabIndex={-1} disableRipple />
                        </ListItemIcon>
                        <ListItemText
                          primary={fullNameUpper(collaborator)}
                          secondary={
                            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 0.5 }}>
                              <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {position}
                              </Box>
                              {document ? (
                                <Box component="span" sx={{ flexShrink: 0 }}>
                                  · {document}
                                </Box>
                              ) : null}
                            </Box>
                          }
                          sx={{ my: 0, minWidth: 0 }}
                          primaryTypographyProps={{
                            fontWeight: 800,
                            color: '#0f172a',
                            fontSize: { xs: 12, md: 14 },
                            lineHeight: 1.15,
                            noWrap: true,
                          }}
                          secondaryTypographyProps={{
                            component: 'div',
                            color: '#64748b',
                            fontSize: { xs: 10.5, md: 12.5 },
                            lineHeight: 1.15,
                            minWidth: 0,
                          }}
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
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  onClick={() => void saveCrewDraft()}
                  disabled={saving || !canCreateForDate}
                  sx={{
                    display: { xs: 'inline-flex', md: 'none' },
                    mb: 0.75,
                    minHeight: 40,
                    textTransform: 'none',
                    fontWeight: 500,
                    bgcolor: colors.blue3,
                    '&:hover': { bgcolor: colors.blue2 },
                  }}
                >
                  Crear cuadrilla
                </Button>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5, minHeight: 24, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 500, color: '#0f172a', minWidth: 0, maxWidth: '100%' }}>
                    Mi cuadrilla{' '}
                    <Box component="span" sx={{ color: '#64748b', fontWeight: 500, fontSize: { xs: 12, md: 14 } }}>
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
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5, minHeight: 24, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 500, color: '#0f172a', minWidth: 0, maxWidth: '100%' }}>
                    Asignados en otras cuadrillas{' '}
                    <Box component="span" sx={{ color: '#64748b', fontWeight: 500, fontSize: { xs: 12, md: 14 } }}>
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
                    <Typography sx={{ py: 3, color: '#64748b', textAlign: 'center', fontSize: { xs: 13, md: 16 } }}>No hay asignaciones de otros usuarios.</Typography>
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
            <Stack direction="row" justifyContent="flex-end" sx={{ display: { xs: 'none', md: 'flex' }, mt: 1 }}>
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

          <Paper
            sx={{
              display: mobilePanelDisplay('activity'),
              p: { xs: 0.75, md: 0.75 },
              borderRadius: 1,
              border: '1px solid #e2e8f0',
              boxShadow: 'none',
              '& .MuiInputBase-input': {
                fontSize: 15,
                lineHeight: 1.2,
                '&::placeholder': {
                  fontSize: 15,
                  opacity: 0.75,
                },
              },
              '& .MuiSelect-select': {
                fontSize: 15,
              },
              '& .MuiInputLabel-root': {
                fontSize: { xs: 14.5, md: 13.5 },
                lineHeight: 1.1,
              },
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 500, color: '#0f172a', fontSize: { xs: 16, md: 20 }, lineHeight: 1.15 }}>
                  Registrar descripción de actividad
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: { xs: 12.5, md: 13 }, lineHeight: 1.45 }}>
                  {editingActivityRef ? 'Editando una descripción existente.' : 'Registra descripciones concretas para una cuadrilla abierta del día.'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                {editingActivityRef ? (
                  <Button onClick={resetActivityForm} sx={{ textTransform: 'none', fontWeight: 800 }}>Cancelar edición</Button>
                ) : null}
                <Button startIcon={<AddIcon />} onClick={addActivity} disabled={!canRegisterActivities || Boolean(editingActivityRef)} sx={{ textTransform: 'none', fontWeight: 800 }}>Agregar</Button>
              </Stack>
            </Stack>
            <FormControl fullWidth size="small" disabled={!canCreateForDate || openStaffingSessions.length === 0} sx={{ mb: 0.75 }}>
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
              <Alert severity="info" sx={{ mb: 1 }}>
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
                        required
                      />
                    )}
                    disabled={!canRegisterActivities}
                    sx={{ gridColumn: { xs: '1', md: '1 / 3' } }}
                  />

                  <TextField
                    label="Descripción de actividad"
                    value={activity.activity_description}
                    onChange={(event) => updateActivity(index, { activity_description: event.target.value })}
                    size="small"
                    disabled={!canRegisterActivities}
                    sx={{ gridColumn: { xs: '1', md: '3 / -1' } }}
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

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 1,
                      gridColumn: { xs: '1', md: '4 / 6' },
                    }}
                  >
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
                  </Box>

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
                      <Trash2 size={16} />
                    </IconButton>

                  </Stack>

                  {(activity.images || []).map((image, imageIndex) => (
                    <Chip
                      key={`${image.key}-${imageIndex}`}
                      label={image.name || `Imagen ${imageIndex + 1}`}
                      size="small"
                      onClick={() => void openStaffingEvidenceGallery(
                        (activity.images || []).map((item) => ({ ...item, activityLabel: activity.activity || `Actividad ${index + 1}` })),
                        image.key
                      )}
                      onDelete={() => removeActivityImage(index, imageIndex)}
                      sx={{ gridColumn: { xs: '1', md: '1 / -1' }, maxWidth: 240 }}
                    />
                  ))}

                  <TextField
                    label="Observaciones"
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

          <Paper sx={{ display: mobilePanelDisplay('history'), p: { xs: 0.75, md: 0.75 }, borderRadius: 1, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" spacing={0.75} sx={{ mb: 0.75 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 500, color: '#0f172a', fontSize: { xs: 18, md: 20 }, lineHeight: 1.15 }}>Actividades</Typography>
                <Typography sx={{ color: '#64748b', fontSize: { xs: 12.5, md: 13 }, lineHeight: 1.45 }}>
                  {editableActivitiesCount} actividades para {date} · Estado: {generalSessionStatusLabel}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-end' }} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                {loadingSessions ? <CircularProgress size={22} /> : null}
                <Tooltip title={sendJourneyDisabledReason || 'Enviar cierre de jornada'}>
                  <span>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={closingId === '__bulk__' ? <CircularProgress size={16} color="inherit" /> : <SendIcon fontSize="small" />}
                      disabled={!closableSessions.length || Boolean(closingId)}
                      onClick={() => void closeAvailableSessions()}
                      sx={{
                        width: { xs: '100%', sm: 'auto' },
                        minHeight: { xs: 36, sm: 30 },
                        textTransform: 'none',
                        bgcolor: hasSendWarnings ? '#f8fafc' : colors.blue2,
                        color: hasSendWarnings ? '#94a3b8' : '#fff',
                        border: hasSendWarnings ? '1px solid #e2e8f0' : '1px solid transparent',
                        boxShadow: 'none',
                        '& .MuiButton-startIcon': {
                          color: hasSendWarnings ? '#94a3b8' : 'inherit',
                        },
                        '&:hover': {
                          bgcolor: hasSendWarnings ? '#f1f5f9' : colors.blue1,
                          boxShadow: 'none',
                        },
                        '&.Mui-disabled': {
                          bgcolor: '#f3f4f6',
                          color: '#94a3b8',
                          border: '1px solid transparent',
                          boxShadow: 'none',
                        },
                      }}
                    >
                      {sendJourneyButtonLabel}
                    </Button>
                  </span>
                </Tooltip>
                {deletableSessions.length > 0 ? (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={deletingId === '__bulk__' ? <CircularProgress size={16} color="inherit" /> : <Trash2 size={16} />}
                    disabled={Boolean(deletingId)}
                    onClick={() => void deleteAvailableDrafts()}
                    sx={{ textTransform: 'none' }}
                  >
                    Eliminar borrador
                  </Button>
                ) : null}
              </Stack>
            </Stack>
            <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' } }}>
              {activityHistoryRows.length === 0 ? (
                <Typography sx={{ color: '#64748b', py: 3, textAlign: 'center', fontSize: { xs: 13, md: 16 } }}>No hay actividades para la fecha.</Typography>
              ) : null}
              {activityHistoryRows.map(({ session, activity, activityIndex }, rowIndex) => {
                const status = String(session.status || '').toLowerCase()
                const isCreator = Boolean(currentUserId && String(session.created_by || '').trim() === currentUserId)
                const canEditSessionActivities = isCreator && ['draft', 'reopened'].includes(status)
                const activityStatus = activityStatusFromValue(activity)
                const activityType = activityTypeFromValue(activity)
                const canEditActivity = canEditSessionActivities && activityStatus !== 'closed'
                const canDeleteActivity = canEditActivity
                const activityId = String(activity?.id || '').trim()
                const activityUnit = String(activity?.unit ?? activity?.metadata?.unit ?? '').trim()
                const activityQuantity = String(activity?.quantity ?? activity?.metadata?.quantity ?? '').trim()
                const activityStartTime = activity?.activity_start_time ? String(activity.activity_start_time).slice(0, 5) : '-'
                const activityEndTime = activity?.activity_end_time ? String(activity.activity_end_time).slice(0, 5) : '-'
                const activityImages = activityImagesFromValue(activity)
                const sessionEvidenceItems: StaffingEvidenceViewerItem[] = (Array.isArray(session.activities) ? session.activities : [])
                  .flatMap((sessionActivity: any, sessionActivityIndex: number) => {
                    const activityLabel = String(sessionActivity?.activity || `Actividad ${sessionActivityIndex + 1}`).trim()
                    return activityImagesFromValue(sessionActivity).map((image) => ({ ...image, activityLabel }))
                  })
                const missingFields = activityMissingFields(activity)
                const highlightMissing = Boolean(activityId && highlightMissingActivityIds.includes(activityId))

                return (
                  <Box
                    key={`${session.id}-${String(activity?.id || activityIndex)}`}
                    sx={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 1,
                      p: 1.25,
                      bgcolor: highlightMissing ? '#fffbeb' : '#fff',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                      <Box sx={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', gap: 1, minWidth: 0, flex: 1 }}>
                        <Typography sx={{ color: colors.blue2, fontWeight: 800, fontSize: 13 }}>
                          Nº{rowIndex + 1}
                        </Typography>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 850, color: '#0f172a', ...missingFieldSx(highlightMissing && missingFields.includes('actividad')) }} noWrap>
                            {activity?.activity || `Actividad ${activityIndex + 1}`}
                          </Typography>
                          <Typography sx={{ color: '#64748b', fontSize: 12, ...missingFieldSx(highlightMissing && missingFields.includes('descripcion')) }} noWrap>
                            {activity?.activity_description || '-'}
                          </Typography>
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.5, mt: 0.5 }}>
                            {[
                              ['Inicio', activityStartTime, 'inicio'],
                              ['Fin', activityEndTime, 'fin'],
                              ['Cantidad', activityType === 'operational' ? activityQuantity || '-' : '-', 'cantidad'],
                              ['Unidad', activityType === 'operational' ? activityUnit || '-' : '-', 'unidad'],
                            ].map(([label, value, field]) => (
                              <Typography key={label} sx={{ color: '#64748b', fontSize: 12, ...missingFieldSx(highlightMissing && missingFields.includes(String(field))) }} noWrap>
                                <Box component="span" sx={{ fontWeight: 700 }}>{label}:</Box> {value}
                              </Typography>
                            ))}
                          </Box>
                          {highlightMissing && missingFields.some((field) => ['tipo', 'evidencia'].includes(field)) ? (
                            <Typography sx={{ color: '#b45309', fontSize: 12, mt: 0.5 }}>
                              Falta: {missingFields.filter((field) => ['tipo', 'evidencia'].includes(field)).map(missingFieldLabel).join(', ')}
                            </Typography>
                          ) : null}
                        </Box>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
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
                        <Tooltip title={canDeleteActivity ? 'Eliminar actividad' : 'No editable'}>
                          <span>
                            <IconButton
                              aria-label="Eliminar actividad"
                              size="small"
                              color="error"
                              disabled={!canDeleteActivity || !activityId || deletingActivityId === activityId}
                              onClick={() => void deleteActivity(session, activity)}
                            >
                              {deletingActivityId === activityId ? <CircularProgress size={18} /> : <Trash2 size={16} />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    {activityImages.length > 0 ? (
                      <Button
                        size="small"
                        onClick={() => void openStaffingEvidenceGallery(sessionEvidenceItems, activityImages[0].key)}
                        sx={{ mt: 0.75, minWidth: 0, p: 0, textTransform: 'none', fontSize: 12 }}
                      >
                        Ver imagen ({activityImages.length})
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
                    <TableCell sx={{ width: 72 }}>Nº</TableCell>
                    <TableCell>Actividades</TableCell>
                    <TableCell align="center">Inicio / Fin</TableCell>
                    <TableCell align="center">Cantidad</TableCell>
                    <TableCell align="center">Unidad</TableCell>
                    <TableCell align="center">Imágenes</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activityHistoryRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ color: '#64748b', py: 4 }}>No hay actividades para la fecha.</TableCell>
                    </TableRow>
                  ) : null}
                  {activityHistoryRows.map(({ session, activity, activityIndex }, rowIndex) => {
                    const status = String(session.status || '').toLowerCase()
                    const isCreator = Boolean(currentUserId && String(session.created_by || '').trim() === currentUserId)
                    const activityImages = activityImagesFromValue(activity)
                    const sessionEvidenceItems: StaffingEvidenceViewerItem[] = (Array.isArray(session.activities) ? session.activities : [])
                      .flatMap((sessionActivity: any, sessionActivityIndex: number) => {
                        const activityLabel = String(sessionActivity?.activity || `Actividad ${sessionActivityIndex + 1}`).trim()
                        return activityImagesFromValue(sessionActivity).map((image) => ({ ...image, activityLabel }))
                      })
                    const canEditSessionActivities = isCreator && ['draft', 'reopened'].includes(status)
                    const activityStatus = activityStatusFromValue(activity)
                    const activityType = activityTypeFromValue(activity)
                    const canEditActivity = canEditSessionActivities && activityStatus !== 'closed'
                    const canDeleteActivity = canEditActivity
                    const activityId = String(activity?.id || '').trim()
                    const activityUnit = String(activity?.unit ?? activity?.metadata?.unit ?? '').trim()
                    const activityQuantity = String(activity?.quantity ?? activity?.metadata?.quantity ?? '').trim()
                    const activityStartTime = activity?.activity_start_time ? String(activity.activity_start_time).slice(0, 5) : '-'
                    const activityEndTime = activity?.activity_end_time ? String(activity.activity_end_time).slice(0, 5) : '-'
                    const activityTimeRange = `${activityStartTime === '-' ? '--:--' : activityStartTime} - ${activityEndTime === '-' ? '--:--' : activityEndTime}`
                    const missingFields = activityMissingFields(activity)
                    const highlightMissing = Boolean(activityId && highlightMissingActivityIds.includes(activityId))
                    return (
                      <TableRow key={`${session.id}-${String(activity?.id || activityIndex)}`} hover sx={{ bgcolor: highlightMissing ? '#fffbeb' : undefined }}>
                        <TableCell sx={{ width: 72, fontWeight: 700 }}>{rowIndex + 1}</TableCell>
                        <TableCell>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a', ...missingFieldSx(highlightMissing && missingFields.includes('actividad')) }}>
                              {activity?.activity || `Actividad ${activityIndex + 1}`}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: '#64748b', ...missingFieldSx(highlightMissing && missingFields.includes('descripcion')) }}>
                              {activity?.activity_description || '-'}
                            </Typography>
                            {highlightMissing && missingFields.some((field) => ['tipo', 'evidencia'].includes(field)) ? (
                              <Typography sx={{ color: '#b45309', fontSize: 12 }}>
                                Falta: {missingFields.filter((field) => ['tipo', 'evidencia'].includes(field)).map(missingFieldLabel).join(', ')}
                              </Typography>
                            ) : null}
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={missingFieldSx(highlightMissing && (missingFields.includes('inicio') || missingFields.includes('fin')))}>{activityTimeRange}</TableCell>
                        <TableCell align="center" sx={missingFieldSx(highlightMissing && missingFields.includes('cantidad'))}>{activityType === 'operational' ? activityQuantity || '-' : '-'}</TableCell>
                        <TableCell align="center" sx={missingFieldSx(highlightMissing && missingFields.includes('unidad'))}>{activityType === 'operational' ? activityUnit || '-' : '-'}</TableCell>
                        <TableCell align="center" sx={missingFieldSx(highlightMissing && missingFields.includes('evidencia'))}>
                          {activityImages.length > 0 ? (
                            <Button
                              size="small"
                              onClick={() => void openStaffingEvidenceGallery(sessionEvidenceItems, activityImages[0].key)}
                              sx={{ minWidth: 0, p: 0, textTransform: 'none', fontSize: 12 }}
                            >
                              Ver ({activityImages.length})
                            </Button>
                          ) : '-'}
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title={canEditActivity ? 'Editar actividad' : 'No editable'}>
                              <span>
                                <IconButton
                                  aria-label="Editar actividad"
                                  disabled={!canEditActivity}
                                  onClick={() => beginEditActivity(session, activity)}
                                >
                                  <EditIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={canDeleteActivity ? 'Eliminar actividad' : 'No editable'}>
                              <span>
                                <IconButton
                                  aria-label="Eliminar actividad"
                                  color="error"
                                  disabled={!canDeleteActivity || !activityId || deletingActivityId === activityId}
                                  onClick={() => void deleteActivity(session, activity)}
                                >
                                  {deletingActivityId === activityId ? <CircularProgress size={18} /> : <Trash2 size={16} />}
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
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
      <Dialog
        open={evidenceViewerOpen}
        onClose={() => setEvidenceViewerOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { bgcolor: '#0f172a', color: '#fff' } }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            py: 1,
            pr: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 600, fontSize: { xs: 14, md: 16 } }}>
              {evidenceViewerItems[evidenceViewerIndex]?.activityLabel || 'Evidencia'}
            </Typography>
            <Typography sx={{ color: '#cbd5e1', fontSize: 12 }}>
              {evidenceViewerItems.length > 0 ? `${evidenceViewerIndex + 1} de ${evidenceViewerItems.length}` : 'Sin imagenes'}
            </Typography>
          </Box>
          <IconButton aria-label="Cerrar visor" onClick={() => setEvidenceViewerOpen(false)} sx={{ color: '#fff' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 1, md: 2 }, position: 'relative' }}>
          <Box
            sx={{
              minHeight: { xs: '58vh', md: '68vh' },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#020617',
              borderRadius: 1,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {evidenceViewerLoading ? (
              <CircularProgress sx={{ color: '#fff' }} />
            ) : evidenceViewerItems[evidenceViewerIndex]?.url ? (
              <Box
                component="img"
                src={evidenceViewerItems[evidenceViewerIndex].url}
                alt={evidenceViewerItems[evidenceViewerIndex]?.name || 'Evidencia'}
                sx={{
                  maxWidth: '100%',
                  maxHeight: { xs: '58vh', md: '68vh' },
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            ) : (
              <Typography sx={{ color: '#cbd5e1' }}>No se pudo cargar la imagen.</Typography>
            )}

            {evidenceViewerItems.length > 1 ? (
              <>
                <IconButton
                  aria-label="Imagen anterior"
                  onClick={() => setEvidenceViewerIndex((prev) => (prev - 1 + evidenceViewerItems.length) % evidenceViewerItems.length)}
                  sx={{
                    position: 'absolute',
                    left: { xs: 6, md: 12 },
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#fff',
                    bgcolor: 'rgba(15, 23, 42, 0.62)',
                    '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.82)' },
                  }}
                >
                  <ArrowBackIosNewIcon fontSize="small" />
                </IconButton>
                <IconButton
                  aria-label="Imagen siguiente"
                  onClick={() => setEvidenceViewerIndex((prev) => (prev + 1) % evidenceViewerItems.length)}
                  sx={{
                    position: 'absolute',
                    right: { xs: 6, md: 12 },
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#fff',
                    bgcolor: 'rgba(15, 23, 42, 0.62)',
                    '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.82)' },
                  }}
                >
                  <ArrowForwardIosIcon fontSize="small" />
                </IconButton>
              </>
            ) : null}
          </Box>
        </DialogContent>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice(null)}>
        {notice ? <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.message}</Alert> : undefined}
      </Snackbar>
    </>
  )
}
