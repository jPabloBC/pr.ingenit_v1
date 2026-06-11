'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Popover,
  Select,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableSortLabel,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { CalendarMonth, Download, Search, Refresh, PushPin } from '@mui/icons-material'
import { DateCalendar } from '@mui/x-date-pickers'
import UserHeader from '../../../components/layout/UserHeader'
import { colors } from '../../../theme/theme'

type CollaboratorOption = {
  id: string
  first_name?: string
  last_name?: string
  document?: string
  position?: string
  specialty?: string
  worker_type?: string
  is_active?: boolean
  gender?: string
}

type DailyStatusRow = {
  id?: string
  collaborator_id: string
  work_date: string
  status: string
  reason?: string | null
  collaborator?: CollaboratorOption | null
}

type AttendanceMatrixRow = {
  collaborator_id: string
  collaborator: CollaboratorOption | null
  statusesByDate: Record<string, string>
  reasonsByDate: Record<string, string>
}

type SortDirection = 'asc' | 'desc'
type DailySortField = 'document' | 'name' | 'position' | 'specialty' | 'worker_type' | 'is_active' | 'status'
type HistorySortField = 'document' | 'name' | 'position' | 'specialty' | 'worker_type' | 'is_active'

const STATUS_OPTIONS = [
  'Turno',
  'Descanso',
  'Fuera de Obra',
  'Licencia',
  'Falla',
  'Vacaciones',
  'Permiso',
  'Teletrabajo',
  'Acreditacion',
  'Finiquitado',
  'Otro',
]

const statusToReasonCode = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'turno') return '11'
  if (normalized === 'descanso') return 'D'
  if (normalized === 'fuera de obra') return 'FO'
  if (normalized === 'licencia') return 'L'
  if (normalized === 'falla') return 'F'
  if (normalized === 'vacaciones') return 'VAC'
  if (normalized === 'permiso') return 'P'
  if (normalized === 'teletrabajo') return 'TL'
  if (normalized === 'acreditacion') return 'AC'
  if (normalized === 'finiquitado') return 'FIN'
  return null
}

const formatAttendanceStatus = (status?: string, reason?: string | null) => {
  const s = String(status || '').trim()
  const r = String(reason || '').trim().toLowerCase()
  if (!s) {
    if (r === '11' || r.includes('turno') || r.includes('presente')) return 'Turno'
    if (r === 'd' || r.includes('descanso')) return 'Descanso'
    if (r === 'fo' || r.includes('fuera de obra')) return 'Fuera de Obra'
    if (r === 'ac' || r.includes('acreditacion')) return 'Acreditacion'
    if (r === 'p' || r.includes('permiso')) return 'Permiso'
    if (r === 'l' || r.includes('licencia')) return 'Licencia'
    if (r === 'f' || r.includes('falla')) return 'Falla'
    if (r === 'vac' || r.includes('vacacion')) return 'Vacaciones'
    if (r === 'fin' || r.includes('finiquit')) return 'Finiquitado'
  }
  if (s === 'Otro' && (r.includes('fuera de obra') || r.includes('fo'))) return 'Fuera de Obra'
  return s
}

const formatDateLabel = (isoDate?: string) => {
  const value = String(isoDate || '').trim()
  if (!value) return ''
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

const parseYmdToDate = (value?: string | null) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const formatFullName = (collab?: { first_name?: string; last_name?: string } | null) => {
  const first = String(collab?.first_name || '').trim()
  const last = String(collab?.last_name || '').trim()
  return `${last} ${first}`.trim() || 'SIN NOMBRE'
}

const isValidChileanRut = (raw: string) => {
  if (!raw) return false
  const clean = raw.replace(/[^0-9kK]/g, '')
  if (clean.length < 8 || clean.length > 9) return false
  const rut = clean.slice(0, -1)
  const dv = clean.slice(-1).toUpperCase()
  if (rut.length < 7 || rut.length > 8) return false
  if (!/^[0-9]+$/.test(rut) || !/^[0-9K]$/.test(dv)) return false

  let sum = 0
  let multiplier = 2
  for (let i = rut.length - 1; i >= 0; i--) {
    sum += Number(rut[i]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const remainder = sum % 11
  const expectedDv = remainder === 0 ? '0' : remainder === 1 ? 'K' : String(11 - remainder)
  return dv === expectedDv
}

const formatRutForDisplay = (raw?: string) => {
  if (!raw) return ''
  const clean = raw.replace(/[^0-9kK]/g, '')
  if (!isValidChileanRut(clean)) return raw
  const rut = clean.slice(0, -1)
  const dv = clean.slice(-1).toUpperCase()
  return `${rut.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

const formatDocument = (value?: string) => {
  const doc = String(value || '').trim()
  if (!doc) return 'SIN DOCUMENTO'
  const formattedRut = formatRutForDisplay(doc)
  return String(formattedRut || doc).toUpperCase()
}

const documentSearchVariants = (value?: string) => {
  const formatted = formatDocument(value).toLowerCase()
  const raw = String(value || '').trim().toLowerCase()
  return [
    formatted,
    formatted.replace(/\./g, ''),
    formatted.replace(/[^0-9k]/g, ''),
    raw,
    raw.replace(/\./g, ''),
    raw.replace(/[^0-9k]/g, ''),
  ]
}

const searchQueryVariants = (value: string) => {
  const q = value.trim().toLowerCase()
  return [q, q.replace(/\./g, ''), q.replace(/[^0-9k]/g, '')].filter(Boolean)
}

const formatDocumentForExcel = (value?: string) => {
  const doc = String(value || '').trim()
  if (!doc) return ''
  const clean = doc.replace(/[^0-9kK]/g, '')
  if (clean.length >= 2) {
    return `${clean.slice(0, -1)}-${clean.slice(-1).toUpperCase()}`
  }
  return doc.replace(/\./g, '').toUpperCase()
}

const toDateInput = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const buildDateRange = (from: string, to: string) => {
  if (!from || !to) return [] as string[]
  let start = new Date(`${from}T00:00:00`)
  let end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  if (start > end) {
    const tmp = start
    start = end
    end = tmp
  }
  const out: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toDateInput(d))
  }
  return out
}

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

let attendanceCollaboratorsCache: CollaboratorOption[] | null = null
let attendanceCollaboratorsInFlight: Promise<CollaboratorOption[]> | null = null
const attendanceDailyRowsCache = new Map<string, DailyStatusRow[]>()
const attendanceDailyRowsInFlight = new Map<string, Promise<DailyStatusRow[]>>()
let attendanceAvailableDatesCache: string[] | null = null
let attendanceAvailableDatesInFlight: Promise<string[]> | null = null

export default function AttendancePage() {
  const [tab, setTab] = useState<'daily' | 'history'>('daily')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [savingDaily, setSavingDaily] = useState(false)
  const [error, setError] = useState('')

  const [collaboratorOptions, setCollaboratorOptions] = useState<CollaboratorOption[]>([])

  const today = useMemo(() => new Date(), [])
  const defaultFrom = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 13)
    return toDateInput(d)
  }, [today])
  const defaultTo = useMemo(() => toDateInput(today), [today])

  const [dailyDate, setDailyDate] = useState(defaultTo)
  const [dailyAvailableDates, setDailyAvailableDates] = useState<string[]>([])
  const [dailyDatesLoading, setDailyDatesLoading] = useState(true)
  const [dailyDateAnchorEl, setDailyDateAnchorEl] = useState<HTMLElement | null>(null)
  const [dailyRows, setDailyRows] = useState<DailyStatusRow[]>([])
  const [dailySelectedCollaborator, setDailySelectedCollaborator] = useState<string>('all')
  const [dailySelectedAttendance, setDailySelectedAttendance] = useState<string>('all')
  const [dailySelectedWorkerType, setDailySelectedWorkerType] = useState<string>('all')
  const [dailySearch, setDailySearch] = useState('')
  const [dailySortField, setDailySortField] = useState<DailySortField>('name')
  const [dailySortDirection, setDailySortDirection] = useState<SortDirection>('asc')
  const [dailyDraftStatusByCollaborator, setDailyDraftStatusByCollaborator] = useState<Record<string, string>>({})

  const [historyRowsRaw, setHistoryRowsRaw] = useState<DailyStatusRow[]>([])
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [historyAutoRange, setHistoryAutoRange] = useState(true)
  const [historySelectedCollaborator, setHistorySelectedCollaborator] = useState<string>('all')
  const [historySelectedStatus, setHistorySelectedStatus] = useState<string>('all')
  const [historySelectedWorkerType, setHistorySelectedWorkerType] = useState<string>('all')
  const [historySearch, setHistorySearch] = useState('')
  const [historySortField, setHistorySortField] = useState<HistorySortField>('name')
  const [historySortDirection, setHistorySortDirection] = useState<SortDirection>('asc')

  const historyBaseColumns = [
    { key: 'document', label: 'Documento', width: 130 },
    { key: 'name', label: 'Colaborador', width: 220 },
    { key: 'position', label: 'Cargo', width: 170 },
    { key: 'specialty', label: 'Especialidad', width: 170 },
    { key: 'worker_type', label: 'Tipo Trabajador', width: 150 },
    { key: 'is_active', label: 'Vigencia', width: 110 },
  ] as const
  const [pinnedHistoryColumns, setPinnedHistoryColumns] = useState<string[]>([
    'document',
    'name',
    'position',
    'specialty',
    'worker_type',
    'is_active',
  ])

  const isPinnedHistoryColumn = (key: string) => pinnedHistoryColumns.includes(key)
  const togglePinnedHistoryColumn = (key: string) => {
    setPinnedHistoryColumns((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    )
  }

  const stickyLeftByKey = useMemo(() => {
    let left = 0
    const out: Record<string, number> = {}
    historyBaseColumns.forEach((col) => {
      if (!isPinnedHistoryColumn(col.key)) return
      out[col.key] = left
      left += col.width
    })
    return out
  }, [historyBaseColumns, pinnedHistoryColumns])

  const getStickyCellSx = (key: string, isHeader = false) => ({
    width: `${historyBaseColumns.find((c) => c.key === key)?.width || 120}px`,
    ...(isPinnedHistoryColumn(key)
      ? {
          position: 'sticky' as const,
          left: `${stickyLeftByKey[key] || 0}px`,
          zIndex: isHeader ? 6 : 4,
          backgroundColor: isHeader ? colors.blue15 : '#fff',
          boxShadow: '1px 0 0 rgba(15,23,42,0.08)',
        }
      : {}),
    minWidth: `${historyBaseColumns.find((c) => c.key === key)?.width || 120}px`,
    maxWidth: `${historyBaseColumns.find((c) => c.key === key)?.width || 120}px`,
    boxSizing: 'border-box' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  })

  const workerTypeOptions = useMemo(() => {
    const values = collaboratorOptions
      .map((option) => String(option.worker_type || '').trim())
      .filter(Boolean)
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [collaboratorOptions])
  const formatWorkerTypeLabel = (value: string) => {
    const raw = String(value || '').trim().toLowerCase()
    if (!raw) return ''
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }

  const collaboratorById = useMemo(() => {
    const map = new Map<string, CollaboratorOption>()
    collaboratorOptions.forEach((option) => {
      if (!option.id) return
      map.set(String(option.id), option)
    })
    return map
  }, [collaboratorOptions])

  const dailyAvailableDateSet = useMemo(() => new Set(dailyAvailableDates), [dailyAvailableDates])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tabParam = String(params.get('tab') || '').toLowerCase()
    if (tabParam === 'historica' || tabParam === 'history') setTab('history')
  }, [])

  const loadCollaborators = async () => {
    try {
      if (!attendanceCollaboratorsInFlight) {
        attendanceCollaboratorsInFlight = (async () => {
          if (attendanceCollaboratorsCache) return attendanceCollaboratorsCache
          const response = await fetch('/api/collaborators?summary=1')
          if (!response.ok) return []
          const data = await response.json()
          const options: CollaboratorOption[] = (Array.isArray(data) ? data : [])
            .map((item: any) => ({
              id: String(item?.id || ''),
              first_name: item?.first_name,
              last_name: item?.last_name,
              document: item?.document,
              position: item?.position,
              specialty: item?.specialty ?? item?.especialidad,
              worker_type: item?.worker_type,
              is_active: item?.is_active,
              gender: item?.gender ?? item?.genero ?? item?.sex ?? item?.sexo,
            }))
            .filter((item) => item.id)
            .sort((a, b) => formatFullName(a).localeCompare(formatFullName(b), 'es', { sensitivity: 'base' }))
          attendanceCollaboratorsCache = options
          return options
        })().finally(() => {
          attendanceCollaboratorsInFlight = null
        })
      }
      const options = await attendanceCollaboratorsInFlight
      setCollaboratorOptions(options)
    } catch {
      // ignore collaborator list errors
    }
  }

  const loadDailyAvailableDates = async () => {
    setDailyDatesLoading(true)
    try {
      if (!attendanceAvailableDatesInFlight) {
        attendanceAvailableDatesInFlight = (async () => {
          if (attendanceAvailableDatesCache) return attendanceAvailableDatesCache

          const response = await fetch('/api/collaborators/daily-status?dates=1')
          const payload = await response.json().catch(() => ({}))

          if (!response.ok) return []

          const dates = (Array.isArray(payload?.dates) ? payload.dates : [])
            .map((date: any) => String(date || '').slice(0, 10))
            .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date))

          attendanceAvailableDatesCache = dates
          return dates
        })().finally(() => {
          attendanceAvailableDatesInFlight = null
        })
      }

      const dates = attendanceAvailableDatesCache || await attendanceAvailableDatesInFlight || []

      setDailyAvailableDates(dates)
      if (dates.length > 0 && !dates.includes(dailyDate)) {
        setDailyDate(dates[0])
      }
    } catch {
      setDailyAvailableDates([])
    } finally {
      setDailyDatesLoading(false)
    }
  }

  const loadDaily = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('date', dailyDate)
      params.set('lean', '1')
      if (dailySelectedCollaborator !== 'all') params.set('collaborator_id', dailySelectedCollaborator)
      if (dailySelectedAttendance !== 'all') params.set('status', dailySelectedAttendance)

      const query = params.toString()

      if (!attendanceDailyRowsInFlight.has(query)) {
        attendanceDailyRowsInFlight.set(query, (async () => {
          const response = await fetch(`/api/collaborators/daily-status?${query}`)
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) {
            throw new Error(String(payload?.error || 'No se pudo cargar asistencia diaria'))
          }
          const rows = Array.isArray(payload?.rows) ? payload.rows : []
          attendanceDailyRowsCache.set(query, rows)
          return rows
        })().finally(() => {
          attendanceDailyRowsInFlight.delete(query)
        }))
      }

      const cachedRows = attendanceDailyRowsCache.get(query)
      const rows = cachedRows || await attendanceDailyRowsInFlight.get(query) || []
      setDailyRows(rows)
    } catch (err) {
      setDailyRows([])
      setError(String(err || 'Error cargando asistencia diaria'))
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('date_from', dateFrom)
      params.set('date_to', dateTo)
      params.set('include_bounds', '1')
      if (historySelectedCollaborator !== 'all') params.set('collaborator_id', historySelectedCollaborator)
      if (historySelectedStatus !== 'all') params.set('status', historySelectedStatus)

      const response = await fetch(`/api/collaborators/daily-status?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setHistoryRowsRaw([])
        setError(String(payload?.error || 'No se pudo cargar asistencia historica'))
        return
      }
      const minDate = String(payload?.min_work_date || '').trim()
      const maxDate = String(payload?.max_work_date || '').trim()
      if (historyAutoRange && minDate && maxDate && (dateFrom !== minDate || dateTo !== maxDate)) {
        setDateFrom(minDate)
        setDateTo(maxDate)

        const autoParams = new URLSearchParams()
        autoParams.set('date_from', minDate)
        autoParams.set('date_to', maxDate)
        autoParams.set('include_bounds', '1')
        if (historySelectedCollaborator !== 'all') autoParams.set('collaborator_id', historySelectedCollaborator)
        if (historySelectedStatus !== 'all') autoParams.set('status', historySelectedStatus)

        const autoResponse = await fetch(`/api/collaborators/daily-status?${autoParams.toString()}`)
        const autoPayload = await autoResponse.json().catch(() => ({}))
        if (!autoResponse.ok) {
          setHistoryRowsRaw([])
          setError(String(autoPayload?.error || 'No se pudo cargar asistencia historica'))
          return
        }
        setHistoryRowsRaw(Array.isArray(autoPayload?.rows) ? autoPayload.rows : [])
        return
      }

      setHistoryRowsRaw(Array.isArray(payload?.rows) ? payload.rows : [])
    } catch (err) {
      setHistoryRowsRaw([])
      setError(String(err || 'Error cargando asistencia historica'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCollaborators()
    loadDailyAvailableDates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tab !== 'daily') return
    if (dailyDatesLoading) return
    if (dailyAvailableDates.length > 0 && !dailyAvailableDateSet.has(dailyDate)) return
    loadDaily()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dailyDate, dailySelectedCollaborator, dailySelectedAttendance, dailyDatesLoading, dailyAvailableDates])

  useEffect(() => {
    setDailyDraftStatusByCollaborator({})
  }, [dailyDate])

  useEffect(() => {
    if (tab !== 'history') return
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dateFrom, dateTo, historySelectedCollaborator, historySelectedStatus, historyAutoRange])

  const dailyMatrixRows = useMemo(() => {
    const byCollaborator = new Map<string, DailyStatusRow>()
    dailyRows.forEach((row) => {
      const key = String(row?.collaborator_id || '').trim()
      if (!key) return
      byCollaborator.set(key, row)
    })

    const base = dailySelectedCollaborator === 'all'
      ? collaboratorOptions
      : collaboratorOptions.filter((c) => c.id === dailySelectedCollaborator)

    const rows = base.map((collab) => {
      const found = byCollaborator.get(collab.id)
      const foundCollab = (found?.collaborator || {}) as CollaboratorOption
      return {
        collaborator_id: collab.id,
        work_date: dailyDate,
        status: String(found?.status || ''),
        reason: found?.reason || '',
        collaborator: {
          ...collab,
          ...foundCollab,
          specialty: foundCollab.specialty ?? collab.specialty,
          worker_type: foundCollab.worker_type ?? collab.worker_type,
          position: foundCollab.position ?? collab.position,
          document: foundCollab.document ?? collab.document,
        },
      } as DailyStatusRow
    })

    const q = dailySearch.trim().toLowerCase()
    const qVariants = searchQueryVariants(dailySearch)
    return rows.filter((row) => {
      const displayStatus = formatAttendanceStatus(String(row.status || ''), String(row.reason || ''))
      const employmentState = row.collaborator?.is_active === false ? 'Finiquitado' : 'Vigente'
      const workerType = String(row.collaborator?.worker_type || '').trim()
      if (dailySelectedAttendance !== 'all' && displayStatus !== dailySelectedAttendance) return false
      if (dailySelectedWorkerType !== 'all' && workerType !== dailySelectedWorkerType) return false
      if (!q) return true
      const documentVariants = documentSearchVariants(row.collaborator?.document)
      const fullName = formatFullName(row.collaborator).toLowerCase()
      const position = String(row.collaborator?.position || '').toLowerCase()
      const workerTypeSearch = workerType.toLowerCase()
      const specialty = String(row.collaborator?.specialty || '').toLowerCase()
      const status = displayStatus.toLowerCase()
      const reason = String(row.reason || '').toLowerCase()
      return (
        documentVariants.some((document) => qVariants.some((query) => document.includes(query))) ||
        fullName.includes(q) ||
        position.includes(q) ||
        specialty.includes(q) ||
        workerTypeSearch.includes(q) ||
        employmentState.toLowerCase().includes(q) ||
        status.includes(q) ||
        reason.includes(q)
      )
    }).sort((a, b) => {
      const statusA = formatAttendanceStatus(String(a.status || ''), String(a.reason || ''))
      const statusB = formatAttendanceStatus(String(b.status || ''), String(b.reason || ''))
      const dir = dailySortDirection === 'asc' ? 1 : -1
      const getValue = (row: DailyStatusRow) => {
        if (dailySortField === 'document') return formatDocument(row.collaborator?.document)
        if (dailySortField === 'name') return formatFullName(row.collaborator)
        if (dailySortField === 'position') return String(row.collaborator?.position || '')
        if (dailySortField === 'specialty') return String(row.collaborator?.specialty || '')
        if (dailySortField === 'worker_type') return String(row.collaborator?.worker_type || '')
        if (dailySortField === 'is_active') return row.collaborator?.is_active === false ? 'finiquitado' : 'vigente'
        return row === a ? statusA : statusB
      }
      return String(getValue(a)).localeCompare(String(getValue(b)), 'es', { sensitivity: 'base' }) * dir
    })
  }, [dailyRows, collaboratorOptions, dailySelectedCollaborator, dailySelectedAttendance, dailySelectedWorkerType, dailySearch, dailyDate, dailySortField, dailySortDirection])

  const historyMatrixRows = useMemo<AttendanceMatrixRow[]>(() => {
    const byCollaborator = new Map<string, AttendanceMatrixRow>()

    historyRowsRaw.forEach((row) => {
      const collaboratorId = String(row.collaborator_id || '').trim()
      const workDate = String(row.work_date || '').trim()
      if (!collaboratorId || !workDate) return
      const baseCollab = (collaboratorById.get(collaboratorId) || {}) as CollaboratorOption
      const rowCollab = (row.collaborator || {}) as CollaboratorOption
      const mergedCollab: CollaboratorOption = {
        ...baseCollab,
        ...rowCollab,
        specialty: rowCollab.specialty ?? baseCollab.specialty,
        worker_type: rowCollab.worker_type ?? baseCollab.worker_type,
        position: rowCollab.position ?? baseCollab.position,
        document: rowCollab.document ?? baseCollab.document,
      }

      const existing = byCollaborator.get(collaboratorId)
      if (!existing) {
        byCollaborator.set(collaboratorId, {
          collaborator_id: collaboratorId,
          collaborator: mergedCollab,
          statusesByDate: { [workDate]: String(row.status || '') },
          reasonsByDate: { [workDate]: String(row.reason || '') },
        })
        return
      }

      if (!existing.collaborator) existing.collaborator = mergedCollab
      else {
        existing.collaborator = {
          ...(existing.collaborator as CollaboratorOption),
          ...mergedCollab,
          specialty: mergedCollab.specialty ?? (existing.collaborator as CollaboratorOption).specialty,
        }
      }
      existing.statusesByDate[workDate] = String(row.status || '')
      existing.reasonsByDate[workDate] = String(row.reason || '')
    })

    return Array.from(byCollaborator.values()).sort((a, b) =>
      formatFullName(a.collaborator).localeCompare(formatFullName(b.collaborator), 'es', { sensitivity: 'base' })
    )
  }, [historyRowsRaw, collaboratorById])

  const historyDateColumns = useMemo(() => {
    const range = buildDateRange(dateFrom, dateTo)
    if (range.length > 0) return range
    const fromRows = Array.from(new Set(historyRowsRaw.map((row) => String(row.work_date || '').trim()).filter(Boolean)))
    return fromRows.sort((a, b) => a.localeCompare(b))
  }, [dateFrom, dateTo, historyRowsRaw])

  const filteredHistoryRows = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    const qVariants = searchQueryVariants(historySearch)
    return historyMatrixRows.filter((row) => {
      if (historySelectedCollaborator !== 'all' && String(row.collaborator_id) !== historySelectedCollaborator) return false
      const workerType = String(row.collaborator?.worker_type || '').trim()
      if (historySelectedWorkerType !== 'all' && workerType !== historySelectedWorkerType) return false
      if (historySelectedStatus !== 'all') {
        const hasSelectedStatus = Object.keys(row.statusesByDate).some((date) =>
          formatAttendanceStatus(row.statusesByDate[date], row.reasonsByDate[date]) === historySelectedStatus
        )
        if (!hasSelectedStatus) return false
      }
      if (!q) return true
      const documentVariants = documentSearchVariants(row.collaborator?.document)
      const fullName = formatFullName(row.collaborator).toLowerCase()
      const position = String(row.collaborator?.position || '').toLowerCase()
      const workerTypeSearch = workerType.toLowerCase()
      const specialty = String(row.collaborator?.specialty || '').toLowerCase()
      const statusValues = Object.values(row.statusesByDate).join(' ').toLowerCase()
      const reasonValues = Object.values(row.reasonsByDate).join(' ').toLowerCase()
      const dates = Object.keys(row.statusesByDate).join(' ').toLowerCase()
      const displayStatuses = Object.keys(row.statusesByDate)
        .map((date) => formatAttendanceStatus(row.statusesByDate[date], row.reasonsByDate[date]))
        .join(' ')
        .toLowerCase()
      return (
        documentVariants.some((document) => qVariants.some((query) => document.includes(query))) ||
        fullName.includes(q) ||
        position.includes(q) ||
        specialty.includes(q) ||
        workerTypeSearch.includes(q) ||
        statusValues.includes(q) ||
        displayStatuses.includes(q) ||
        reasonValues.includes(q) ||
        dates.includes(q)
      )
    }).sort((a, b) => {
      const dir = historySortDirection === 'asc' ? 1 : -1
      const getValue = (row: AttendanceMatrixRow) => {
        if (historySortField === 'document') return formatDocument(row.collaborator?.document)
        if (historySortField === 'name') return formatFullName(row.collaborator)
        if (historySortField === 'position') return String(row.collaborator?.position || '')
        if (historySortField === 'specialty') return String(row.collaborator?.specialty || '')
        if (historySortField === 'worker_type') return String(row.collaborator?.worker_type || '')
        return row.collaborator?.is_active === false ? 'no vigente' : 'vigente'
      }
      return String(getValue(a)).localeCompare(String(getValue(b)), 'es', { sensitivity: 'base' }) * dir
    })
  }, [historyMatrixRows, historySearch, historySelectedStatus, historySelectedCollaborator, historySelectedWorkerType, historySortField, historySortDirection])

  const handleDailySort = (field: DailySortField) => {
    if (dailySortField === field) {
      setDailySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setDailySortField(field)
    setDailySortDirection('asc')
  }

  const handleHistorySort = (field: HistorySortField) => {
    if (historySortField === field) {
      setHistorySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setHistorySortField(field)
    setHistorySortDirection('asc')
  }

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const ExcelJSModule = await import('exceljs')
      const ExcelJS = (ExcelJSModule as any).default || ExcelJSModule
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Ingenit'
      workbook.created = new Date()
      const worksheet = workbook.addWorksheet('Asistencia')

      const dates = tab === 'daily' ? [dailyDate] : historyDateColumns
      const rows = tab === 'daily'
        ? dailyMatrixRows.map((row) => ({
          collaborator_id: row.collaborator_id,
          collaborator: row.collaborator,
          statusesByDate: { [dailyDate]: String(dailyDraftStatusByCollaborator[row.collaborator_id] || formatAttendanceStatus(row.status, row.reason) || '') },
          reasonsByDate: { [dailyDate]: String(row.reason || '') },
        } as AttendanceMatrixRow))
        : filteredHistoryRows
      const startRow = 2
      const startCol = 2 // B. Column A and row 1 are reserved as visual breathing space.
      const staticHeaders = ['CODIGO', 'CAT', 'RUT', 'PATERNO', 'MATERNO', 'NOMBRE', 'NOMBRE', 'GÉNERO', 'CARGO ACREDITACION']
      const totalCols = staticHeaders.length + dates.length
      const lastCol = startCol + totalCols - 1
      const tableHeaderRow = startRow + 6
      const firstDataRow = tableHeaderRow + 1

      const setCell = (row: number, col: number, value: any) => {
        worksheet.getCell(row, col).value = value ?? ''
        return worksheet.getCell(row, col)
      }
      const thinBorder = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      }
      const mediumBorder = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right: { style: 'medium', color: { argb: 'FF000000' } },
      }
      const blueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
      const grayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } }
      const statusFill = (code: string) => {
        const normalized = String(code || '').trim().toUpperCase()
        if (normalized === '11') return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } }
        if (normalized === 'D') return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        if (normalized === 'FO') return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4B183' } }
        if (normalized === 'P') return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }
        if (normalized === 'FIN' || normalized === 'F') return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }
        if (normalized === 'L' || normalized === 'AC' || normalized === 'TL') return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } }
        return undefined
      }
      const weekdayLabel = (date: string) => {
        const d = new Date(`${date}T00:00:00`)
        if (Number.isNaN(d.getTime())) return ''
        return ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'][d.getDay()]
      }
      const shortDateLabel = (date: string) => {
        const [year, month, day] = String(date || '').split('-')
        if (!year || !month || !day) return date
        const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        return `${day}-${monthLabels[Math.max(0, Math.min(11, Number(month) - 1))] || month}`
      }
      const splitLastNames = (lastName?: string) => {
        const parts = String(lastName || '').trim().split(/\s+/).filter(Boolean)
        return {
          paterno: parts[0] || '',
          materno: parts.slice(1).join(' '),
        }
      }
      const splitFirstNames = (firstName?: string) => {
        const parts = String(firstName || '').trim().split(/\s+/).filter(Boolean)
        return {
          first: parts[0] || '',
          second: parts.slice(1).join(' '),
        }
      }
      const statusCodeForExport = (status?: string, reason?: string) => {
        const display = formatAttendanceStatus(status, reason)
        return statusToReasonCode(display) || String(reason || status || '').trim().toUpperCase()
      }
      const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen del logo'))
        reader.readAsDataURL(blob)
      })
      const getImageSize = (dataUrl: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
        image.onerror = () => reject(new Error('No se pudo medir el logo de asistencia'))
        image.src = dataUrl
      })
      const fitImage = (sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number) => {
        const width = Math.max(1, Number(sourceWidth) || maxWidth)
        const height = Math.max(1, Number(sourceHeight) || maxHeight)
        const scale = Math.min(maxWidth / width, maxHeight / height)
        return {
          width: Math.round(width * scale),
          height: Math.round(height * scale),
        }
      }
      const loadLogoImageId = async () => {
        const response = await fetch('/api/attendance/logo', { cache: 'no-store' })
        if (!response.ok) throw new Error('No se pudo cargar el logo de asistencia')
        const blob = await response.blob()
        const dataUrl = await blobToDataUrl(blob)
        if (!dataUrl.startsWith('data:image/')) throw new Error('El logo de asistencia no es una imagen valida')
        const size = await getImageSize(dataUrl)
        return {
          imageId: workbook.addImage({
            base64: dataUrl,
            extension: 'png',
          }),
          size,
        }
      }

      worksheet.getColumn(1).width = 4
      const widths = [14, 8, 14, 18, 18, 18, 18, 14, 36]
      widths.forEach((width, idx) => {
        worksheet.getColumn(startCol + idx).width = width
      })
      dates.forEach((_date, idx) => {
        worksheet.getColumn(startCol + staticHeaders.length + idx).width = 7
      })
      worksheet.getRow(1).height = 18

      worksheet.mergeCells(startRow, startCol, startRow, lastCol)
      setCell(startRow, startCol, '')
      const titleCell = worksheet.getCell(startRow, startCol)
      titleCell.font = { bold: true, size: 12, color: { argb: 'FF1F4E79' } }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.getRow(startRow).height = 48
      const logo = await loadLogoImageId()
      const logoSize = fitImage(logo.size.width, logo.size.height, 170, 44)
      // ExcelJS uses zero-based anchors: col 1 / row 1 is B2.
      worksheet.addImage(logo.imageId, {
        tl: { col: 1, row: 1 },
        ext: logoSize,
        editAs: 'oneCell',
      })

      const metaRows = [
        ['N°Contrato', 'Ctto. 4540008749'],
        ['Cliente:', 'Minera Antucoya'],
        ['N° Obra', 'P-4291 Contrato de Construcción GPRO 2025_2026'],
        ['Asunto', 'Control de Asistencia'],
      ]
      metaRows.forEach((meta, idx) => {
        const rowNo = startRow + 1 + idx
        setCell(rowNo, startCol, meta[0])
        setCell(rowNo, startCol + 1, meta[1])
        worksheet.mergeCells(rowNo, startCol + 1, rowNo, startCol + 4)
        for (let col = startCol; col <= lastCol; col++) {
          const cell = worksheet.getCell(rowNo, col)
          cell.border = thinBorder
          cell.font = { bold: col <= startCol + 1 }
          cell.alignment = { horizontal: col === startCol ? 'center' : 'left', vertical: 'middle' }
        }
      })

      staticHeaders.forEach((header, idx) => {
        const cell = setCell(tableHeaderRow, startCol + idx, header)
        cell.fill = blueFill
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = thinBorder
      })
      dates.forEach((date, idx) => {
        const col = startCol + staticHeaders.length + idx
        const cell = setCell(tableHeaderRow, col, `${weekdayLabel(date)}\n${shortDateLabel(date)}`)
        cell.fill = grayFill
        cell.font = { bold: true, color: { argb: 'FF1F2937' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: true }
        cell.border = thinBorder
      })
      worksheet.getRow(tableHeaderRow).height = 44

      rows.forEach((row, rowIdx) => {
        const rowNo = firstDataRow + rowIdx
        const baseCollab = (collaboratorById.get(String(row.collaborator_id || '')) || {}) as CollaboratorOption
        const rowCollab = (row.collaborator || {}) as CollaboratorOption
        const collab = {
          ...baseCollab,
          ...rowCollab,
          gender: rowCollab.gender ?? baseCollab.gender,
          is_active: rowCollab.is_active ?? baseCollab.is_active,
        } as CollaboratorOption
        const last = splitLastNames(collab.last_name)
        const first = splitFirstNames(collab.first_name)
        const isTerminated = collab.is_active === false
        const rowFontColor = isTerminated ? 'FFFF0000' : 'FF000000'
        const baseValues = [
          `4291-${String(rowIdx + 1000).padStart(4, '0')}`,
          String(collab.worker_type || '').toUpperCase(),
          formatDocumentForExcel(collab.document),
          last.paterno.toUpperCase(),
          last.materno.toUpperCase(),
          first.first.toUpperCase(),
          first.second.toUpperCase(),
          String(collab.gender || '').toUpperCase(),
          String(collab.position || '').toUpperCase(),
        ]
        baseValues.forEach((value, idx) => {
          const cell = setCell(rowNo, startCol + idx, value)
          cell.border = thinBorder
          cell.font = { size: 10, color: { argb: rowFontColor } }
          cell.alignment = { horizontal: idx === 8 ? 'left' : 'center', vertical: 'middle' }
        })
        dates.forEach((date, idx) => {
          const code = statusCodeForExport(row.statusesByDate[date], row.reasonsByDate[date])
          const cell = setCell(rowNo, startCol + staticHeaders.length + idx, code)
          cell.border = thinBorder
          cell.font = { size: 10, bold: true, color: { argb: rowFontColor } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          const fill = isTerminated ? undefined : statusFill(code)
          if (fill) cell.fill = fill
        })
      })

      const bottomRow = Math.max(firstDataRow, firstDataRow + rows.length - 1)
      for (let row = startRow; row <= bottomRow; row++) {
        for (let col = startCol; col <= lastCol; col++) {
          const cell = worksheet.getCell(row, col)
          const current = cell.border || thinBorder
          cell.border = {
            top: row === startRow ? mediumBorder.top : current.top,
            left: col === startCol ? mediumBorder.left : current.left,
            bottom: row === bottomRow ? mediumBorder.bottom : current.bottom,
            right: col === lastCol ? mediumBorder.right : current.right,
          }
        }
      }

      worksheet.views = [{ state: 'frozen', xSplit: startCol + staticHeaders.length - 1, ySplit: tableHeaderRow }]
      const buffer = await workbook.xlsx.writeBuffer()
      const filename = tab === 'daily'
        ? `asistencia_${dailyDate}.xlsx`
        : `asistencia_${dateFrom}_${dateTo}.xlsx`
      downloadBlob(filename, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    } catch (err) {
      setError(String(err || 'No se pudo exportar asistencia a Excel'))
    } finally {
      setExporting(false)
    }
  }

  const handleDailyStatusChange = (collaboratorId: string, nextStatus: string) => {
    setDailyDraftStatusByCollaborator((prev) => ({
      ...prev,
      [collaboratorId]: nextStatus,
    }))
  }

  const dailyPendingEntries = useMemo(() => {
    return Object.entries(dailyDraftStatusByCollaborator)
      .filter(([collaborator_id]) => collaborator_id)
      .map(([collaborator_id, status]) => ({
        collaborator_id,
        status: String(status).trim(),
        reason: statusToReasonCode(String(status).trim()),
      }))
  }, [dailyDraftStatusByCollaborator])

  const handleSaveDailyAttendance = async () => {
    if (dailyPendingEntries.length === 0) return
    setSavingDaily(true)
    setError('')
    try {
      const response = await fetch('/api/collaborators/daily-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dailyDate,
          entries: dailyPendingEntries,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(String(payload?.error || 'No se pudo guardar asistencia diaria'))
        return
      }
      setDailyDraftStatusByCollaborator({})
      await loadDaily()
    } catch (err) {
      setError(String(err || 'Error guardando asistencia diaria'))
    } finally {
      setSavingDaily(false)
    }
  }

  const minDailyAvailableDate = dailyAvailableDates.length > 0 ? dailyAvailableDates[dailyAvailableDates.length - 1] : ''
  const maxDailyAvailableDate = dailyAvailableDates.length > 0 ? dailyAvailableDates[0] : ''

  return (
    <Box sx={{ display: 'flex', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      <Box sx={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
        <UserHeader title="Asistencia" />
        <Container
          maxWidth={false}
          sx={{
            pt: { xs: 1, md: 1.25 },
            pb: 2,
            px: { xs: 1, sm: 1.5, md: 2 },
            minWidth: 0,
            width: '100%',
            maxWidth: '100%',
            overflowX: 'hidden',
          }}
        >
          <Card
            sx={{
              mb: 1.25,
              position: 'sticky',
              top: 4,
              zIndex: 8,
              boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
              overflowX: 'hidden',
            }}
          >
            <CardContent sx={{ p: { xs: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1.5, md: 2 } } }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5, minHeight: 38 }}>
                <Tab value="daily" label="Diaria" />
                <Tab value="history" label="Historica" />
              </Tabs>

              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'nowrap',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  pt: 1,
                  pb: 0.75,
                  WebkitOverflowScrolling: 'touch',
                  '& > .MuiTextField-root, & > .MuiFormControl-root': {
                    flex: { xs: '0 0 160px', md: '0 0 168px' },
                  },
                  '& > .attendance-search-field': {
                    flex: { xs: '0 0 240px', md: '1 1 300px' },
                    minWidth: { md: 220 },
                  },
                  '& > .attendance-action': {
                    flex: '0 0 auto',
                  },
                }}
              >
                {tab === 'daily' ? (
                  <>
                    <Box sx={{ flex: { xs: '0 0 160px', md: '0 0 168px' } }}>
                      <TextField
                        label="Fecha"
                        value={
                          dailyDatesLoading
                            ? 'Cargando...'
                            : dailyDate
                              ? formatDateLabel(dailyDate)
                              : 'Sin fechas'
                        }
                        disabled={dailyDatesLoading || dailyAvailableDates.length === 0}
                        onClick={(e) => setDailyDateAnchorEl(e.currentTarget)}
                        size="small"
                        fullWidth
                        InputProps={{
                          readOnly: true,
                          endAdornment: (
                            <InputAdornment position="end">
                              <CalendarMonth sx={{ fontSize: 21, color: 'rgba(0, 0, 0, 0.72)' }} />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          '& .MuiInputBase-root': {
                            cursor: dailyDatesLoading || dailyAvailableDates.length === 0 ? 'default' : 'pointer',
                          },
                          '& .MuiInputBase-input': {
                            cursor: dailyDatesLoading || dailyAvailableDates.length === 0 ? 'default' : 'pointer',
                          },
                        }}
                      />
                      <Popover
                        open={Boolean(dailyDateAnchorEl)}
                        anchorEl={dailyDateAnchorEl}
                        onClose={() => setDailyDateAnchorEl(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                      >
                        <DateCalendar
                          value={parseYmdToDate(dailyDate)}
                          minDate={parseYmdToDate(minDailyAvailableDate) || undefined}
                          maxDate={parseYmdToDate(maxDailyAvailableDate) || undefined}
                          onChange={(next) => {
                            if (!next) return
                            const ymd = toDateInput(next as Date)
                            if (!ymd || !dailyAvailableDateSet.has(ymd)) return
                            setDailyDate(ymd)
                            setDailyDateAnchorEl(null)
                          }}
                          shouldDisableDate={(day) => !dailyAvailableDateSet.has(toDateInput(day as Date))}
                        />
                      </Popover>
                    </Box>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Tipo trabajador</InputLabel>
                      <Select
                        value={dailySelectedWorkerType}
                        label="Tipo trabajador"
                        onChange={(e) => setDailySelectedWorkerType(String(e.target.value || 'all'))}
                      >
                        <MenuItem value="all">Todos</MenuItem>
                        {workerTypeOptions.map((workerType) => (
                          <MenuItem key={workerType} value={workerType}>{formatWorkerTypeLabel(workerType)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Asistencia</InputLabel>
                      <Select
                        value={dailySelectedAttendance}
                        label="Asistencia"
                        onChange={(e) => setDailySelectedAttendance(String(e.target.value || 'all'))}
                      >
                        <MenuItem value="all">Todos</MenuItem>
                        {STATUS_OPTIONS.map((statusOption) => (
                          <MenuItem key={statusOption} value={statusOption}>{statusOption}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      className="attendance-search-field"
                      label="Buscar"
                      placeholder="Documento, colaborador, cargo, tipo, estado, asistencia"
                      value={dailySearch}
                      onChange={(e) => setDailySearch(e.target.value)}
                      size="small"
                      fullWidth
                    />
                  </>
                ) : (
                  <>
                    <TextField
                      label="Desde"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value)
                        setHistoryAutoRange(false)
                      }}
                      InputLabelProps={{ shrink: true }}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Hasta"
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value)
                        setHistoryAutoRange(false)
                      }}
                      InputLabelProps={{ shrink: true }}
                      size="small"
                      fullWidth
                    />
                    <FormControl size="small" fullWidth>
                      <InputLabel>Tipo trabajador</InputLabel>
                      <Select
                        value={historySelectedWorkerType}
                        label="Tipo trabajador"
                        onChange={(e) => setHistorySelectedWorkerType(String(e.target.value || 'all'))}
                      >
                        <MenuItem value="all">Todos</MenuItem>
                        {workerTypeOptions.map((workerType) => (
                          <MenuItem key={workerType} value={workerType}>{formatWorkerTypeLabel(workerType)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Asistencia</InputLabel>
                      <Select
                        value={historySelectedStatus}
                        label="Asistencia"
                        onChange={(e) => setHistorySelectedStatus(String(e.target.value || 'all'))}
                      >
                        <MenuItem value="all">Todos</MenuItem>
                        {STATUS_OPTIONS.map((statusOption) => (
                          <MenuItem key={statusOption} value={statusOption}>{statusOption}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      className="attendance-search-field"
                      label="Buscar"
                      placeholder="Documento, colaborador, cargo, tipo, estado, asistencia"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      size="small"
                      fullWidth
                    />
                  </>
                )}
                <Button
                  className="attendance-action"
                  variant="contained"
                  startIcon={<Search />}
                  onClick={() => (tab === 'daily' ? loadDaily() : loadHistory())}
                >
                  Buscar
                </Button>
                <Button
                  className="attendance-action"
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={() => {
                    if (tab === 'daily') {
                      setDailyDate(defaultTo)
                      setDailySelectedCollaborator('all')
                      setDailySelectedAttendance('all')
                      setDailySelectedWorkerType('all')
                      setDailySearch('')
                    } else {
                      setDateFrom(defaultFrom)
                      setDateTo(defaultTo)
                      setHistoryAutoRange(true)
                      setHistorySelectedCollaborator('all')
                      setHistorySelectedStatus('all')
                      setHistorySelectedWorkerType('all')
                      setHistorySearch('')
                    }
                  }}
                >
                  Limpiar filtros
                </Button>
                <Tooltip title="Exportar Excel" arrow>
                  <span className="attendance-action">
                    <IconButton
                      onClick={handleExportExcel}
                      aria-label="Exportar Excel"
                      disabled={
                        exporting ||
                        (tab === 'daily' ? dailyMatrixRows.length === 0 : filteredHistoryRows.length === 0)
                      }
                      sx={{
                        width: 40,
                        height: 36,
                        border: `1px solid ${colors.blue6}`,
                        borderRadius: 1,
                        color: colors.blue6,
                        transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease',
                        '&:hover': {
                          bgcolor: '#eef6ff',
                          borderColor: colors.blue8,
                          color: colors.blue8,
                        },
                        '&.Mui-disabled': {
                          borderColor: '#cbd5e1',
                          color: '#94a3b8',
                        },
                      }}
                    >
                      <Download fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                {tab === 'daily' && (
                  <Button
                    className="attendance-action"
                    variant="contained"
                    color="success"
                    onClick={handleSaveDailyAttendance}
                    disabled={savingDaily || dailyPendingEntries.length === 0}
                  >
                    {savingDaily ? 'Guardando...' : `Guardar cambios (${dailyPendingEntries.length})`}
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>

          <Paper elevation={2} sx={{ p: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : error ? (
              <Box sx={{ p: 2 }}>
                <Typography color="error">{error}</Typography>
              </Box>
            ) : tab === 'daily' ? (
              <>
                <Box sx={{ p: 2, pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Colaboradores encontrados: {dailyMatrixRows.length}
                  </Typography>
                </Box>
                <TableContainer sx={{ maxHeight: '72vh' }}>
                  <Table
                    stickyHeader
                    size="small"
                    sx={{
                      '& .MuiTableCell-root': {
                        py: 0.55,
                        fontSize: 13,
                        lineHeight: 1.2,
                      },
                      '& .MuiTableCell-head': {
                        py: 0.65,
                        fontSize: 13,
                        fontWeight: 700,
                      },
                      '& .MuiTableRow-root': {
                        height: 42,
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <TableSortLabel active={dailySortField === 'document'} direction={dailySortDirection} onClick={() => handleDailySort('document')}>Documento</TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel active={dailySortField === 'name'} direction={dailySortDirection} onClick={() => handleDailySort('name')}>Colaborador</TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel active={dailySortField === 'position'} direction={dailySortDirection} onClick={() => handleDailySort('position')}>Cargo</TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel active={dailySortField === 'specialty'} direction={dailySortDirection} onClick={() => handleDailySort('specialty')}>Especialidad</TableSortLabel>
                        </TableCell>
                        <TableCell align="center">
                          <TableSortLabel active={dailySortField === 'worker_type'} direction={dailySortDirection} onClick={() => handleDailySort('worker_type')}>Tipo Trabajador</TableSortLabel>
                        </TableCell>
                        <TableCell align="center">
                          <TableSortLabel active={dailySortField === 'is_active'} direction={dailySortDirection} onClick={() => handleDailySort('is_active')}>Estado</TableSortLabel>
                        </TableCell>
                        <TableCell align="center">
                          <TableSortLabel active={dailySortField === 'status'} direction={dailySortDirection} onClick={() => handleDailySort('status')}>Asistencia</TableSortLabel>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dailyMatrixRows.map((row) => (
                        <TableRow key={row.collaborator_id} hover sx={{ height: 42 }}>
                          <TableCell>{formatDocument(row.collaborator?.document)}</TableCell>
                          <TableCell>{String(formatFullName(row.collaborator)).toUpperCase()}</TableCell>
                          <TableCell>{String(row.collaborator?.position || '').toUpperCase()}</TableCell>
                          <TableCell>{String(row.collaborator?.specialty || '').toUpperCase()}</TableCell>
                          <TableCell align="center">{String(row.collaborator?.worker_type || '').toUpperCase()}</TableCell>
                          <TableCell align="center">{(row.collaborator?.is_active === false ? 'Finiquitado' : 'Vigente').toUpperCase()}</TableCell>
                          <TableCell align="center" sx={{ minWidth: 176, py: 0.45 }}>
                            <FormControl size="small" fullWidth>
                              <Select
                                value={String(dailyDraftStatusByCollaborator[row.collaborator_id] || formatAttendanceStatus(row.status, row.reason) || '')}
                                onChange={(e) => handleDailyStatusChange(row.collaborator_id, String(e.target.value || ''))}
                                displayEmpty
                                sx={{
                                  height: 34,
                                  '& .MuiSelect-select': {
                                    py: 0.55,
                                    fontSize: 13,
                                  },
                                }}
                              >
                                <MenuItem value="">
                                  <em>Sin estado</em>
                                </MenuItem>
                                {STATUS_OPTIONS.map((statusOption) => (
                                  <MenuItem key={`${row.collaborator_id}-${statusOption}`} value={statusOption}>
                                    {statusOption}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            ) : (
              <>
                <Box sx={{ p: 2, pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Colaboradores encontrados: {filteredHistoryRows.length}
                  </Typography>
                </Box>
                <Box sx={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
                <TableContainer
                  sx={{
                    width: '100%',
                    maxWidth: '100%',
                    maxHeight: '72vh',
                    overflowX: 'auto',
                    overflowY: 'auto',
                  }}
                >
                  <Table
                    stickyHeader
                    size="small"
                    sx={{
                      minWidth: `${950 + historyDateColumns.length * 120}px`,
                      tableLayout: 'auto',
                      '& th, & td': {
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow sx={{ backgroundColor: colors.blue15 }}>
                        <TableCell sx={{ fontWeight: 600, color: colors.blue1, ...getStickyCellSx('document', true) }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, width: '100%' }}>
                            <IconButton
                              size="small"
                              onClick={() => togglePinnedHistoryColumn('document')}
                              sx={{ color: isPinnedHistoryColumn('document') ? colors.blue6 : colors.gray6, mr: 0.5 }}
                            >
                              <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                            </IconButton>
                            <TableSortLabel active={historySortField === 'document'} direction={historySortDirection} onClick={() => handleHistorySort('document')}>Documento</TableSortLabel>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, color: colors.blue1, ...getStickyCellSx('name', true) }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, width: '100%' }}>
                            <IconButton
                              size="small"
                              onClick={() => togglePinnedHistoryColumn('name')}
                              sx={{ color: isPinnedHistoryColumn('name') ? colors.blue6 : colors.gray6, mr: 0.5 }}
                            >
                              <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                            </IconButton>
                            <TableSortLabel active={historySortField === 'name'} direction={historySortDirection} onClick={() => handleHistorySort('name')}>Colaborador</TableSortLabel>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, color: colors.blue1, ...getStickyCellSx('position', true) }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, width: '100%' }}>
                            <IconButton
                              size="small"
                              onClick={() => togglePinnedHistoryColumn('position')}
                              sx={{ color: isPinnedHistoryColumn('position') ? colors.blue6 : colors.gray6, mr: 0.5 }}
                            >
                              <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                            </IconButton>
                            <TableSortLabel active={historySortField === 'position'} direction={historySortDirection} onClick={() => handleHistorySort('position')}>Cargo</TableSortLabel>
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: colors.blue1, ...getStickyCellSx('worker_type', true) }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, width: '100%' }}>
                            <IconButton
                              size="small"
                              onClick={() => togglePinnedHistoryColumn('worker_type')}
                              sx={{ color: isPinnedHistoryColumn('worker_type') ? colors.blue6 : colors.gray6, mr: 0.5 }}
                            >
                              <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                            </IconButton>
                            <TableSortLabel active={historySortField === 'worker_type'} direction={historySortDirection} onClick={() => handleHistorySort('worker_type')}>Tipo Trabajador</TableSortLabel>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, color: colors.blue1, ...getStickyCellSx('specialty', true) }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, width: '100%' }}>
                            <IconButton
                              size="small"
                              onClick={() => togglePinnedHistoryColumn('specialty')}
                              sx={{ color: isPinnedHistoryColumn('specialty') ? colors.blue6 : colors.gray6, mr: 0.5 }}
                            >
                              <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                            </IconButton>
                            <TableSortLabel active={historySortField === 'specialty'} direction={historySortDirection} onClick={() => handleHistorySort('specialty')}>Especialidad</TableSortLabel>
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: colors.blue1, ...getStickyCellSx('is_active', true) }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, width: '100%' }}>
                            <IconButton
                              size="small"
                              onClick={() => togglePinnedHistoryColumn('is_active')}
                              sx={{ color: isPinnedHistoryColumn('is_active') ? colors.blue6 : colors.gray6, mr: 0.5 }}
                            >
                              <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                            </IconButton>
                            <TableSortLabel active={historySortField === 'is_active'} direction={historySortDirection} onClick={() => handleHistorySort('is_active')}>Vigencia</TableSortLabel>
                          </Box>
                        </TableCell>
                        {historyDateColumns.map((date) => (
                          <TableCell
                            key={`col-${date}`}
                            align="center"
                            sx={{ minWidth: 120, maxWidth: 120, fontWeight: 600, color: colors.blue1 }}
                          >
                            {formatDateLabel(date)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredHistoryRows.map((row) => (
                        <TableRow key={row.collaborator_id} hover>
                          <TableCell sx={getStickyCellSx('document')}>
                            <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                              {formatDocument(row.collaborator?.document)}
                            </Typography>
                          </TableCell>
                          <TableCell sx={getStickyCellSx('name')}>
                            <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                              {String(formatFullName(row.collaborator)).toUpperCase()}
                            </Typography>
                          </TableCell>
                          <TableCell sx={getStickyCellSx('position')}>
                            <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem' }}>
                              {String(row.collaborator?.position || '').toUpperCase()}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" sx={getStickyCellSx('worker_type')}>
                            <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem' }}>
                              {String(row.collaborator?.worker_type || '').toUpperCase()}
                            </Typography>
                          </TableCell>
                          <TableCell sx={getStickyCellSx('specialty')}>
                            <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem' }}>
                              {String(row.collaborator?.specialty || '').toUpperCase()}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" sx={getStickyCellSx('is_active')}>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              {(row.collaborator?.is_active === false ? 'No vigente' : 'Vigente').toUpperCase()}
                            </Typography>
                          </TableCell>
                          {historyDateColumns.map((date) => {
                            const status = String(row.statusesByDate[date] || '')
                            const reason = String(row.reasonsByDate[date] || '')
                            const displayStatus = formatAttendanceStatus(status, reason)
                            return (
                              <TableCell
                                key={`${row.collaborator_id}-${date}`}
                                align="center"
                                title={reason || status}
                                sx={{ minWidth: 120, maxWidth: 120 }}
                              >
                                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                  {displayStatus || '-'}
                                </Typography>
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                </Box>
              </>
            )}
          </Paper>
        </Container>
      </Box>
    </Box>
  )
}
