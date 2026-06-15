"use client"

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useTheme } from '@mui/material/styles'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  Chip,
  List,
  ListItem,
  Stack,
  MenuItem,
  Checkbox,
  Tooltip,
  FormControlLabel,
  RadioGroup,
  Radio,
  CircularProgress,
  Snackbar,
  Alert,
  Tabs,
  Tab
} from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { format, parseISO } from 'date-fns'
import { Download, FileSpreadsheet, Send, Trash2 } from 'lucide-react'
import { Sun, Cloud, CloudRain, Snowflake, Eye, Edit2, ImageUp, Clock3, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
// Activity details moved to Programa screen; avoid loading large lists here
// Use CSS grid via Box instead of MUI Grid to avoid typing/module issues
import UserHeader from '../../../components/layout/UserHeader'
import { supabase } from '../../../lib/supabaseClient'
import { colors } from '../../../theme/theme'
import { normalizeText } from '@/lib/normalize'

interface FieldReport {
  id: string
  area: string
  start_time: string
  end_time: string
  activities: any
  restrictions?: string
  personnel?: Array<{ role: string; name: string }>
  created_at: string
  date?: string
  supervisor?: string
  capataz?: string
  specialty?: string
  crew_id?: string | null
  crew_name?: string | null
  assignments?: any
  weather?: any
  turno?: string
  person_hours?: any
  equipment_entries?: any
  equipment_hours?: any
  material_entries?: any
  material_quantities?: any
  activity_observations?: any
  design_version?: string | null
  emitted_by_id?: string | null
  work_front_id?: string | null
  work_front?: string | null
  report_sequence_no?: number | null
  report_title?: string | null
  created_by?: string | null
}

interface ReportFrontOption {
  id?: string | null
  name: string
  code?: string | null
  type?: string | null
  sequence_mode?: string | null
  next_sequence_no?: number | null
  title_prefix?: string | null
}

let fieldReportsSummaryCache: FieldReport[] | null = null
let fieldReportsSummaryInFlight: Promise<FieldReport[]> | null = null
let collaboratorsSummaryCache: any[] | null = null
let collaboratorsSummaryInFlight: Promise<any[] | null> | null = null
const collaboratorsSummaryCacheByDate = new Map<string, any[]>()
const collaboratorsSummaryInFlightByDate = new Map<string, Promise<any[] | null>>()
let crewsSummaryCache: any[] | null = null
let crewsSummaryInFlight: Promise<any[] | null> | null = null
const dailyStatusByDateGlobalCache = new Map<string, any[]>()
const dailyStatusByDateGlobalInFlight = new Map<string, Promise<any[]>>()
const STANDARD_PERSON_HOURS = 10
const MAX_PERSON_HOURS_WITH_OVERTIME = 15
const STANDARD_MACHINE_HOURS = 10
const MAX_MACHINE_HOURS_WITH_OVERTIME = 15

const getEffectivePersonHourTotals = (baseHoursValue: any, manualExtraValue: any) => {
  const baseHours = Math.max(0, Number(baseHoursValue || 0) || 0)
  const manualExtraHours = Math.max(0, Number(manualExtraValue || 0) || 0)
  const autoExtraHours = Math.max(0, baseHours - STANDARD_PERSON_HOURS)
  const extraHours = Math.max(manualExtraHours, autoExtraHours)
  const standardHours = Math.min(baseHours, STANDARD_PERSON_HOURS)
  const totalHours = standardHours + extraHours
  return { standardHours, autoExtraHours, manualExtraHours, extraHours, totalHours }
}

const getMaxBaseHoursForManualExtra = (manualExtraValue: any) => {
  const manualExtraHours = Math.max(0, Number(manualExtraValue || 0) || 0)
  return manualExtraHours > MAX_PERSON_HOURS_WITH_OVERTIME - STANDARD_PERSON_HOURS
    ? Math.max(0, MAX_PERSON_HOURS_WITH_OVERTIME - manualExtraHours)
    : MAX_PERSON_HOURS_WITH_OVERTIME
}

const getMaxManualExtraForBaseHours = (baseHoursValue: any) => {
  const baseHours = Math.max(0, Number(baseHoursValue || 0) || 0)
  if (baseHours >= STANDARD_PERSON_HOURS) return MAX_PERSON_HOURS_WITH_OVERTIME - STANDARD_PERSON_HOURS
  return Math.max(0, MAX_PERSON_HOURS_WITH_OVERTIME - baseHours)
}

const fetchCollaboratorsSummaryOnce = async (asOfDate?: string) => {
  const dateKey = String(asOfDate || '').slice(0, 10)
  if (dateKey && collaboratorsSummaryCacheByDate.has(dateKey)) return collaboratorsSummaryCacheByDate.get(dateKey) || []
  if (dateKey && collaboratorsSummaryInFlightByDate.has(dateKey)) {
    const rows = await collaboratorsSummaryInFlightByDate.get(dateKey)
    return rows || []
  }
  if (!dateKey && collaboratorsSummaryCache) return collaboratorsSummaryCache
  const existingInFlight = dateKey ? collaboratorsSummaryInFlightByDate.get(dateKey) : collaboratorsSummaryInFlight
  if (!existingInFlight) {
    const nextInFlight = (async () => {
      const qs = dateKey ? `?summary=1&as_of_date=${encodeURIComponent(dateKey)}` : '?summary=1'
      const res = await fetch(`/api/collaborators${qs}`)
      if (!res.ok) return null
      const data = await res.json()
      const rows = Array.isArray(data) ? data : []
      if (dateKey) collaboratorsSummaryCacheByDate.set(dateKey, rows)
      else collaboratorsSummaryCache = rows
      return rows
    })()
    if (dateKey) collaboratorsSummaryInFlightByDate.set(dateKey, nextInFlight)
    else collaboratorsSummaryInFlight = nextInFlight
  }
  const rows = await (dateKey ? collaboratorsSummaryInFlightByDate.get(dateKey) : collaboratorsSummaryInFlight)
  if (!dateKey) collaboratorsSummaryInFlight = null
  if (dateKey) collaboratorsSummaryInFlightByDate.delete(dateKey)
  return rows
}

const fetchCrewsSummaryOnce = async () => {
  if (crewsSummaryCache && crewsSummaryCache.length > 0) return crewsSummaryCache
  if (!crewsSummaryInFlight) {
    crewsSummaryInFlight = (async () => {
      const res = await fetch('/api/crews?summary=1')
      if (!res.ok) return null
      const data = await res.json()
      const rows = Array.isArray(data) ? data : []
      crewsSummaryCache = rows
      return rows
    })()
  }
  const rows = await crewsSummaryInFlight
  crewsSummaryInFlight = null
  return rows
}

interface FieldReportVersion {
  id: string
  field_report_id: string
  version_no: number
  edited_by?: string | null
  previous_data?: any
  new_data?: any
  created_at?: string | null
}

interface ManagementEquipmentCatalogRow {
  id: string
  equipment_name: string
  patent?: string | null
  equipment_kind?: string | null
  is_operational?: boolean
}

const REPORT_DESIGN_VERSIONS = [
  { value: 'V1', label: 'Versión 1' },
  { value: 'V2', label: 'Versión 2' }
] as const

const WORK_FRONT_OPTIONS = [
  'CONTRATO BASE PISCINAS',
  'CONTRATO BASE CANALETAS',
  'USO DE RECURSOS NOC Nº001 CALAMINAS',
  'USO DE RECURSOS NOC Nº002 PISCINA AGUA SALADA',
  'USO DE RECURSOS NOC Nº006 TRABAJOS ELECTRICOS FASE 1',
  'USO DE RECURSOS NOC Nº007 VERTEDERO PISCINA ILS 2'
] as const

const ACTIVITY_TIME_CLASS_OPTIONS = [
  'Productivas',
  'Tiempo contributivo',
  'Tiempo no contributivo'
] as const

const ACTIVITY_TIME_REASON_OPTIONS: Record<string, string[]> = {
  Productivas: [
    'Avance ejecutado / medicion realizada'
  ],
  'Tiempo contributivo': [
    'Control de acceso / paleteros / señaleros / Portería',
    'Trabajos menores de apoyo',
    'Trabajos menores con maquinaria',
    'Instalación de Faena y Puntos de Trabajo (Construcción y/o mantenimiento)',
    'Charlas / Capacitaciones / Cursos / Reunión OBS',
    'Traslado de equipos / Escoltas',
    'Retiro de materiales sobrantes a botaderos',
    'Orden y aseo',
    'Planificación de los trabajos a realizar',
    'Mantención de Equipos'
  ],
  'Tiempo no contributivo': [
    'Desmovilización',
    'Espera Traslado Personal',
    'Falta de suministro, materiales y/o herramientas',
    'Documentos Seguridad / Falta documentación / Falta de cursos',
    'PUMA - Interferencias / Trabajos cruzados / Falta Permisos / Falta liberación de especialidad previa',
    'CLIENTE - Interferencias / Trabajos cruzados / Falta Permisos / Falta Liberacion de áreas',
    'Condiciones climatológicas adversas',
    'Tiempos muertos / Sin postura / Sin frente de trabajo'
  ]
}

const FIELD_REPORT_BASE_SEQUENCE_ANCHOR_DATE = '2026-05-31'
const FIELD_REPORT_BASE_SEQUENCE_ANCHOR_NO = 54
const FIELD_REPORT_NOC_SEQUENCE_SEEDS: Array<{ match: string[]; next: number }> = [
  { match: ['NOC', '001', 'CALAMIN'], next: 10 },
  { match: ['NOC', '002', 'PISCINA', 'AGUA', 'SALADA'], next: 23 },
  { match: ['NOC', '006', 'ELECTRIC'], next: 1 },
  { match: ['NOC', '007', 'VERTEDERO', 'ILS', '2'], next: 5 }
]

const normalizeFrontLabel = (value: any) => normalizeText(String(value || '')).toUpperCase()

const getUtcDayNumber = (date: string) => {
  const m = String(date || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000)
}

const getBaseContractSequenceNo = (date: string) => {
  const target = getUtcDayNumber(date)
  const anchor = getUtcDayNumber(FIELD_REPORT_BASE_SEQUENCE_ANCHOR_DATE)
  if (target == null || anchor == null) return null
  return FIELD_REPORT_BASE_SEQUENCE_ANCHOR_NO + (target - anchor)
}

const getNocSequenceSeed = (front: any) => {
  const normalized = normalizeFrontLabel(front)
  const found = FIELD_REPORT_NOC_SEQUENCE_SEEDS.find((item) => item.match.every((part) => normalized.includes(part)))
  return found?.next || null
}

const isBaseContractFront = (front: any) => {
  const normalized = normalizeFrontLabel(front)
  return normalized.includes('CONTRATO BASE') || normalized === 'PISCINAS' || normalized === 'CANALETAS'
}

const buildFieldReportTitle = (front: any, sequenceNo?: number | null) => {
  const raw = String(front || '').trim()
  const normalized = normalizeFrontLabel(raw)

  if (!raw) return 'REPORTE DE TERRENO'
  const baseTitle = (normalized.includes('NOC') || normalized.includes('USO DE RECURSOS'))
    ? `REPORTE ${raw.toUpperCase()}`
    : normalized.includes('PISCIN')
      ? 'REPORTE CONTRATO BASE PISCINAS'
      : normalized.includes('CANALET')
        ? 'REPORTE CONTRATO BASE CANALETAS'
        : `REPORTE ${raw.toUpperCase()}`
  const sequence = Number(sequenceNo || 0)
  return sequence > 0 ? `${baseTitle} N°${String(sequence).padStart(3, '0')}` : baseTitle
}

const resolveFieldReportSequenceNo = (params: {
  front: any
  date: string
  reports: any[]
  selectedReport?: any
}) => {
  const front = String(params.front || '').trim()
  const normalizedFront = normalizeFrontLabel(front)
  if (!normalizedFront) return null

  const selectedFront = normalizeFrontLabel(params.selectedReport?.work_front || '')
  const selectedSequence = Number(params.selectedReport?.report_sequence_no || 0)
  if (params.selectedReport?.id && selectedFront === normalizedFront && selectedSequence > 0) {
    return selectedSequence
  }

  if (isBaseContractFront(front)) {
    return getBaseContractSequenceNo(params.date)
  }

  const seed = getNocSequenceSeed(front) || 1
  const maxExisting = (params.reports || []).reduce((max, report: any) => {
    if (params.selectedReport?.id && String(report?.id || '') === String(params.selectedReport.id)) return max
    if (normalizeFrontLabel(report?.work_front || '') !== normalizedFront) return max
    const n = Number(report?.report_sequence_no || 0)
    return n > max ? n : max
  }, 0)
  return Math.max(seed, maxExisting + 1)
}

const GENERAL_EVENTS_QUESTIONS = [
  '¿Existio alguna detencion por seguridad?',
  '¿Ocurrio algún retraso con respecto a la programación?',
  '¿Existio algún impacto por falta de ingenieria?',
  '¿Existió algún impacto por falta de suministros?',
  '¿Hubo algún impacto climatico en el día?',
  '¿Alguna área no pudo ser trabajada?'
] as const

const MATERIAL_UNIT_OPTIONS = ['m', 'm2', 'm3', 'kg', 'u', 'l', 'gl', 'set', 'Estaca', 'Cuerpo', 'Otros'] as const
const UNIVERSAL_UNIT_OPTIONS = ['u', 'm', 'm2', 'm3', 'ml', 'l', 'kg', 'ton', 'hr', 'dia', 'set', 'gl', 'Estaca'] as const

type EvidenceFile = {
  key: string
  name: string
  type?: string
  size?: number
  uploaded_at?: string
}

type PendingEvidencePreview = {
  file: File
  previewUrl: string
}

const EVIDENCE_DEBUG = false
const FIELD_REPORTS_DEV_DEBUG = false

const isEvidenceStorageKey = (key: string) =>
  key.includes('/') && !/^image\//i.test(key)

const parseEvidenceFiles = (value: any): EvidenceFile[] => {
  const normalizeOne = (item: any): EvidenceFile | null => {
    if (!item || typeof item !== 'object') return null
    const key = String(item.key || item.file_key || item.path || item.r2_key || '').trim()
    if (!key || !isEvidenceStorageKey(key)) return null
    return {
      key,
      name: String(item.name || item.file_name || '').trim() || 'Imagen',
      type: item.type ? String(item.type) : undefined,
      size: Number.isFinite(Number(item.size)) ? Number(item.size) : undefined,
      uploaded_at: item.uploaded_at ? String(item.uploaded_at) : undefined
    }
  }

  let parsed = value
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = [] }
  }
  if (!Array.isArray(parsed)) {
    if (EVIDENCE_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][evidence] parseEvidenceFiles: value is not array', { rawType: typeof value, raw: value })
    }
    return []
  }
  const normalized = parsed.map(normalizeOne).filter(Boolean) as EvidenceFile[]
  if (EVIDENCE_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][evidence] parseEvidenceFiles: normalized', {
      inputCount: parsed.length,
      outputCount: normalized.length,
      keys: normalized.map((x) => x.key)
    })
  }
  return normalized
}

const detectFieldReportFront = (report: any): 'CANALETAS' | 'PISCINAS' | null => {
  const normalize = (v: any) =>
    String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim()
  const explicit = normalize(report?.work_front || report?.front || report?.report_front || '')
  if (explicit.includes('PISCIN')) return 'PISCINAS'
  if (explicit.includes('CANALET')) return 'CANALETAS'
  const area = normalize(report?.area || '')
  const crew = normalize(report?.crew_name || '')
  const txt = `${area} ${crew}`
  if (txt.includes('PISCIN')) return 'PISCINAS'
  if (txt.includes('CANALET')) return 'CANALETAS'
  return null
}

export default function FieldReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = String((session?.user as any)?.role || '').toLowerCase()
  const currentUserId = String((session?.user as any)?.id || '')
  const isUserRole = role === 'user'
  const isAdminRole = role === 'admin'
  const isDevRole = role === 'dev'
  const isViewerRole = role === 'viewer'
  const isDailyReportMode = false
  const isReadOnlyRole = isViewerRole || isDailyReportMode
  const [reports, setReports] = useState<FieldReport[]>([])
  const [fieldReportDetailsById, setFieldReportDetailsById] = useState<Record<string, any>>({})
  const [reportResponsibleFallbacks, setReportResponsibleFallbacks] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<FieldReportVersion[]>([])
  const [historyReportLabel, setHistoryReportLabel] = useState<string>('')
  const [expandedHistoryVersionId, setExpandedHistoryVersionId] = useState<string | null>(null)
  const [exportVersionDialogOpen, setExportVersionDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedReport, setSelectedReport] = useState<any>(null)
  const [reportHydrating, setReportHydrating] = useState(false)
  const [hydratedReportId, setHydratedReportId] = useState<string | null>(null)
  const [selectedReportHydrationStatus, setSelectedReportHydrationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedReportHydrationError, setSelectedReportHydrationError] = useState<string | null>(null)
  const [v2StateReady, setV2StateReady] = useState(false)
  const [v2StateReportId, setV2StateReportId] = useState<string | null>(null)
  const [openingReportId, setOpeningReportId] = useState<string | null>(null)
  const [draftUserChanged, setDraftUserChanged] = useState(false)
  const activeHydrationReportIdRef = useRef<string | null>(null)
  const pendingOpenAfterFormApplyRef = useRef<{ reportId: string; sessionId: number } | null>(null)
  const closeCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialDraftFingerprintRef = useRef<string | null>(null)
  const draftFingerprintCapturedRef = useRef(false)
  const userTouchedDraftRef = useRef(false)
  const heavySectionsRafRef = useRef<number | null>(null)
  const openSessionRef = useRef(0)
  const reportModalSessionRef = useRef(0)
  const openReportFallbackRef = useRef<any>(null)
  const [uploadedEvidencePreviewByKey, setUploadedEvidencePreviewByKey] = useState<Record<string, string>>({})

  // activity view moved to separate Programa screen

  // Form state
  const [area, setArea] = useState('')
  const [areaAssignmentMode, setAreaAssignmentMode] = useState<'global' | 'individual'>('individual')
  const [personAreaById, setPersonAreaById] = useState<Record<string, string>>({})
  const [areaOptions, setAreaOptions] = useState<string[]>([])
  const [contractName, setContractName] = useState<string>('')
  const [turnoCollaboratorIds, setTurnoCollaboratorIds] = useState<Set<string>>(new Set())
  const [collaboratorNameById, setCollaboratorNameById] = useState<Record<string, string>>({})
  const [collaboratorPhoneById, setCollaboratorPhoneById] = useState<Record<string, string>>({})
  const [collaboratorDocumentById, setCollaboratorDocumentById] = useState<Record<string, string>>({})
  const [collaboratorDocumentByNameNorm, setCollaboratorDocumentByNameNorm] = useState<Record<string, string>>({})
  const [collaboratorPhoneByNameNorm, setCollaboratorPhoneByNameNorm] = useState<Record<string, string>>({})
  const [otPresentWorkers, setOtPresentWorkers] = useState<Array<{ id: string; name: string; position: string }>>([])
  const [turnoPresentWorkers, setTurnoPresentWorkers] = useState<Array<{ id: string; name: string; position: string }>>([])
  const [turnoFieldBoss, setTurnoFieldBoss] = useState<{ id: string; name: string; phone: string } | null>(null)
  const [emittedById, setEmittedById] = useState<string>('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reportActivities, setReportActivities] = useState('')
  const [restrictions, setRestrictions] = useState('')
  const [personRole, setPersonRole] = useState('')
  const [personName, setPersonName] = useState('')
  const [personnel, setPersonnel] = useState<any[]>([])
  const [reportDesignVersion, setReportDesignVersion] = useState<'V1' | 'V2'>('V2')
  // Template header fields
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [supervisor, setSupervisor] = useState<string>('')
  const [capataz, setCapataz] = useState<string>('')
  const [specialty, setSpecialty] = useState<string>('')
  const [workFront, setWorkFront] = useState<string>('')
  const [reportFrontOptions, setReportFrontOptions] = useState<ReportFrontOption[]>([])
  const [weather, setWeather] = useState<{ sunny: boolean; cloudy: boolean; rain: boolean; snow: boolean }>({ sunny: false, cloudy: false, rain: false, snow: false })
  const [turno, setTurno] = useState<'Dia' | 'Noche'>('Dia')
  const [availableActivityDates, setAvailableActivityDates] = useState<string[]>([])
  const [loadingActivityDates, setLoadingActivityDates] = useState(false)
  const [availableCrewIdsForDate, setAvailableCrewIdsForDate] = useState<string[]>([])
  // Modal: search activities and assign to crews
  const [searchQuery, setSearchQuery] = useState('')
  const [activityResults, setActivityResults] = useState<any[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const searchTimeout = useRef<any>(null)
  const [crews, setCrews] = useState<any[]>([])
  const [selectedCrewFor, setSelectedCrewFor] = useState<Record<string, string>>({})
  const [programDialogOpen, setProgramDialogOpen] = useState(false)
  const [programActivities, setProgramActivities] = useState<any[]>([])
  const [loadingProgram, setLoadingProgram] = useState(false)
  const [reportCrewIds, setReportCrewIds] = useState<string[]>([])
  const [loadingCrewActivities, setLoadingCrewActivities] = useState(false)
  const crewActivitiesLoadSeqRef = useRef(0)
  const [activityInputs, setActivityInputs] = useState<Record<string, any>>({})
  type AssignedActivity = {
    lineNumber?: number | string
    item_number?: any
    activityId: string
    id?: any
    company_id?: any
    program_quantity?: any
    quantity?: any
    created_at?: any
    updated_at?: any
    description?: any
    execution_description?: any
    unit?: any
    discipline?: any
    observations?: any
    item_id?: any
    activity_detail_id?: any
    activity_detail_code?: any
    sub_id?: any
    area?: any
    work_front?: any
    activity_front?: any
    time_classification?: any
    time_reason?: any
    activity?: any
    package?: any
    source?: string
    crewId: string
    crewName: string
    evidence_files?: EvidenceFile[]
  }
  const [assignedActivities, setAssignedActivities] = useState<AssignedActivity[]>([])
  const assignedActivitiesRef = useRef<AssignedActivity[]>([])
  const [crewMembers, setCrewMembers] = useState<any[]>([])
  const [personHours, setPersonHours] = useState<Record<string, number[]>>({})
  const [personExtraHours, setPersonExtraHours] = useState<Record<string, number>>({})
  const [collaboratorMap, setCollaboratorMap] = useState<Record<string, { name: string; position: string; document?: string }>>({})
  const [personalReady, setPersonalReady] = useState(false)
  const [equipmentEntries, setEquipmentEntries] = useState<Array<{ code?: string; description?: string; activity_desc?: string; area?: string; extra_hours?: number | string }>>([])
  const [equipmentHours, setEquipmentHours] = useState<Record<string, number[]>>({})
  const [materialEntries, setMaterialEntries] = useState<Array<{ description?: string; unit?: string; area?: string }>>([])
  const [materialQuantities, setMaterialQuantities] = useState<Record<string, number[]>>({})
  const [managementEquipmentCatalog, setManagementEquipmentCatalog] = useState<ManagementEquipmentCatalogRow[]>([])
  const [activityObservations, setActivityObservations] = useState<Record<string, string>>({})
  const [generalEventsAnswers, setGeneralEventsAnswers] = useState<Array<'si' | 'no'>>(
    () => Array.from({ length: GENERAL_EVENTS_QUESTIONS.length }).map(() => 'no')
  )
  const [generalEventsComments, setGeneralEventsComments] = useState<string[]>(
    () => Array.from({ length: GENERAL_EVENTS_QUESTIONS.length }).map(() => '')
  )
  const [uploadingEvidence, setUploadingEvidence] = useState<Record<string, boolean>>({})
  const [pendingEvidenceFiles, setPendingEvidenceFiles] = useState<Record<string, PendingEvidencePreview[]>>({})
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false)
  const [evidenceDialogRowIndex, setEvidenceDialogRowIndex] = useState<number | null>(null)
  const [evidenceDragOver, setEvidenceDragOver] = useState(false)
  const [hourCellDialogOpen, setHourCellDialogOpen] = useState(false)
  const [hourCellPersonId, setHourCellPersonId] = useState<string>('')
  const [hourCellPersonName, setHourCellPersonName] = useState<string>('')
  const [hourCellActivityIndex, setHourCellActivityIndex] = useState<number>(0)
  const [hourCellDraft, setHourCellDraft] = useState<string>('0')
  const [hourApplyMode, setHourApplyMode] = useState<'single' | 'all' | 'selected'>('single')
  const [hourApplySelectedIds, setHourApplySelectedIds] = useState<string[]>([])
  const [equipHourCellDialogOpen, setEquipHourCellDialogOpen] = useState(false)
  const [equipHourCellEntryId, setEquipHourCellEntryId] = useState<string>('')
  const [equipHourCellActivityIndex, setEquipHourCellActivityIndex] = useState<number>(0)
  const [equipHourCellDraft, setEquipHourCellDraft] = useState<string>('0')
  const [materialQtyCellDialogOpen, setMaterialQtyCellDialogOpen] = useState(false)
  const [materialQtyCellEntryId, setMaterialQtyCellEntryId] = useState<string>('')
  const [materialQtyCellActivityIndex, setMaterialQtyCellActivityIndex] = useState<number>(0)
  const [materialQtyCellDraft, setMaterialQtyCellDraft] = useState<string>('0')
  const [confirmCloseReportOpen, setConfirmCloseReportOpen] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({ open: false, message: '', severity: 'info' })
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [dailyExcelPreviewOpen, setDailyExcelPreviewOpen] = useState(false)
  const [dailyExcelPreviewLoading, setDailyExcelPreviewLoading] = useState(false)
  const [dailyExcelPreviewDate, setDailyExcelPreviewDate] = useState('')
  const [dailyExcelPreviewReports, setDailyExcelPreviewReports] = useState<FieldReport[]>([])
  const [dailyExcelPreviewFrontTab, setDailyExcelPreviewFrontTab] = useState('')
  const [dailyExcelExportMode, setDailyExcelExportMode] = useState<'CURRENT' | 'BOTH'>('BOTH')
  const [dailyExcelExportOptionsOpen, setDailyExcelExportOptionsOpen] = useState(false)
  const [dailyExcelExporting, setDailyExcelExporting] = useState(false)
  const [dailyExcelExportProgressLabel, setDailyExcelExportProgressLabel] = useState('')
  const [dailyExcelExcludedImageKeys, setDailyExcelExcludedImageKeys] = useState<string[]>([])
  const [dailyExcelImageOrientationByKey, setDailyExcelImageOrientationByKey] = useState<Record<string, 'landscape' | 'portrait'>>({})
  const [pendingCrewsModalOpen, setPendingCrewsModalOpen] = useState(false)
  const [pendingCrewsModalDate, setPendingCrewsModalDate] = useState<string>('')
  const [pendingCrewContextDates, setPendingCrewContextDates] = useState<Set<string>>(new Set())
  const [notifyingCompletedDate, setNotifyingCompletedDate] = useState<string>('')
  const [reportsLoading, setReportsLoading] = useState(true)
  const [reportsLoadError, setReportsLoadError] = useState<string>('')
  const [exportDateFilter, setExportDateFilter] = useState<string>('')
  const [exportCrewFilter, setExportCrewFilter] = useState<string>('')
  const [exportFrontFilter, setExportFrontFilter] = useState<string>('')
  const [showMoreReportOptions, setShowMoreReportOptions] = useState<boolean>(false)
  const [v2TopScrollContentWidth, setV2TopScrollContentWidth] = useState<number>(0)
  const [v2ShowTopScroll, setV2ShowTopScroll] = useState<boolean>(false)
  const [collapsedDateGroups, setCollapsedDateGroups] = useState<Record<string, boolean>>({})
  const [dateDetailsLoadedByDate, setDateDetailsLoadedByDate] = useState<Record<string, boolean>>({})
  const [dateDetailsLoadingByDate, setDateDetailsLoadingByDate] = useState<Record<string, boolean>>({})
  const [heavyModalSectionsReady, setHeavyModalSectionsReady] = useState(false)
  const heavyModalReadyStartedRef = useRef<number | null>(null)
  const fieldReportPdfRef = useRef<HTMLDivElement | null>(null)
  const fieldReportPdfContentRef = useRef<HTMLDivElement | null>(null)
  const v2TopScrollRef = useRef<HTMLDivElement | null>(null)
  const v2MainScrollRef = useRef<HTMLDivElement | null>(null)
  const v2ScrollSyncingRef = useRef(false)
  const initialLoadExtraRequestsRef = useRef(0)
  const fetchReportsStartedAtRef = useRef<number | null>(null)
  const fetchReportsDoneAtRef = useRef<number | null>(null)
  const fetchReportsInFlightRef = useRef<Promise<FieldReport[]> | null>(null)
  const fetchReportsLoadedOnceRef = useRef(false)
  const dateDetailsInFlightRef = useRef<Map<string, Promise<FieldReport[]>>>(new Map())
  const collaboratorsCacheRef = useRef<any[] | null>(null)
  const collaboratorsInFlightRef = useRef<Promise<any[] | null> | null>(null)
  const crewsCacheRef = useRef<any[] | null>(null)
  const crewsInFlightRef = useRef<Promise<any[] | null> | null>(null)
  const dailyStatusByDateCacheRef = useRef<Map<string, any[]>>(new Map())
  const dailyStatusByDateInFlightRef = useRef<Map<string, Promise<any[]>>>(new Map())
  const crewFullCacheRef = useRef<Map<string, any>>(new Map())
  const crewFullInFlightRef = useRef<Map<string, Promise<any | null>>>(new Map())
  const pendingCrewContextInFlightRef = useRef<Map<string, Promise<void>>>(new Map())
  const activityRowsByCrewDateCacheRef = useRef<Map<string, any[]>>(new Map())
  const activityRowsByCrewDateInFlightRef = useRef<Map<string, Promise<any[]>>>(new Map())
  const fieldReportDetailCacheRef = useRef<Map<string, any>>(new Map())
  const fieldReportHoursSummaryByDateCacheRef = useRef<Map<string, any[]>>(new Map())
  const fieldReportHoursSummaryByDateInFlightRef = useRef<Map<string, Promise<any[]>>>(new Map())

  useEffect(() => {
    let cancelled = false
    const loadReportFronts = async () => {
      try {
        const res = await fetch('/api/report-fronts', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const rows = Array.isArray(data) ? data : (Array.isArray(data?.fronts) ? data.fronts : [])
        const options = rows
          .map((row: any) => ({
            id: row?.id ? String(row.id) : null,
            name: String(row?.name || '').trim(),
            code: row?.code ? String(row.code) : null,
            type: row?.type ? String(row.type) : null,
            sequence_mode: row?.sequence_mode ? String(row.sequence_mode) : null,
            next_sequence_no: Number(row?.next_sequence_no || 0) || null,
            title_prefix: row?.title_prefix ? String(row.title_prefix) : null,
          }))
          .filter((row: ReportFrontOption) => String(row.type || '').toLowerCase() !== 'ifa')
          .filter((row: ReportFrontOption) => row.name)
        if (!cancelled && options.length > 0) setReportFrontOptions(options)
      } catch {}
    }
    loadReportFronts()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // Crew composition may be edited in /users/crews while this page stays mounted.
    // Clear caches on modal open so members are always fetched fresh.
    crewsSummaryCache = null
    crewsSummaryInFlight = null
    crewsCacheRef.current = null
    crewFullCacheRef.current.clear()
    crewFullInFlightRef.current.clear()
  }, [open])

  useEffect(() => {
    const invalidateCrewCaches = () => {
      crewsSummaryCache = null
      crewsSummaryInFlight = null
      crewsCacheRef.current = null
      crewsInFlightRef.current = null
      crewFullCacheRef.current.clear()
      crewFullInFlightRef.current.clear()
    }
    const onFocus = () => invalidateCrewCaches()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') invalidateCrewCaches()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const dateKey = String(reportDate || '').slice(0, 10)
    if (!dateKey) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/management/equipment?date=${encodeURIComponent(dateKey)}&fallback=on_or_before`, { cache: 'no-store' })
        if (!res.ok) return
        const payload = await res.json()
        if (cancelled) return
        const rows = Array.isArray(payload?.rows) ? payload.rows : []
        const normalized = rows
          .map((row: any) => ({
            id: String(row?.id || `${row?.equipment_name || ''}-${row?.patent || ''}`),
            equipment_name: String(row?.equipment_name || '').trim(),
            patent: String(row?.patent || '').trim() || null,
            equipment_kind: String(row?.equipment_kind || '').trim() || null,
            is_operational: row?.is_operational !== false
          }))
          .filter((row: ManagementEquipmentCatalogRow) => row.equipment_name)
        setManagementEquipmentCatalog(normalized)
      } catch {
        // Keep manual fields available if catalog fetch fails.
      }
    })()
    return () => { cancelled = true }
  }, [open, reportDate])
  const modalOpenMetricsRef = useRef<{ id: string; startedAt: number; requests: number } | null>(null)
  const perfRequestCountByScopeRef = useRef<Record<string, number>>({})
  const perfModalOpenDetailFetchStartedAtRef = useRef<number | null>(null)
  const perfModalOpenDetailFetchDoneAtRef = useRef<number | null>(null)
  const perfModalOpenHydrationDoneAtRef = useRef<number | null>(null)
  const perfCloseStartedAtRef = useRef<number | null>(null)
  const perfSaveStartedAtRef = useRef<number | null>(null)
  const perfSavePayloadStartAtRef = useRef<number | null>(null)
  const perfSavePayloadEndAtRef = useRef<number | null>(null)
  const perfSaveApiStartAtRef = useRef<number | null>(null)
  const perfSaveApiEndAtRef = useRef<number | null>(null)
  const perfSaveRefreshStartAtRef = useRef<number | null>(null)
  const perfSaveRefreshEndAtRef = useRef<number | null>(null)
  const perfSaveCloseVisualAtRef = useRef<number | null>(null)
  const perfSavePendingSummaryRef = useRef<{
    startedAt: number
    payloadBuildMs: number
    apiMs: number
    visualCloseMs: number
    refreshMs: number
    triggeredFetchReports: boolean
  } | null>(null)

  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const isPerfDev = process.env.NODE_ENV !== 'production'
  const perfMark = useCallback((label: string) => {
    if (!isPerfDev) return
    try { performance.mark(label) } catch {}
  }, [isPerfDev])
  const perfMeasure = useCallback((name: string, startLabel: string, endLabel: string) => {
    if (!isPerfDev) return null
    try {
      performance.measure(name, startLabel, endLabel)
      const entries = performance.getEntriesByName(name)
      const last = entries[entries.length - 1]
      return last ? Math.round(last.duration) : null
    } catch {
      return null
    }
  }, [isPerfDev])
	  const perfCountRequest = useCallback((scope: string, url: string) => {
	    if (!isPerfDev) return
	    const key = String(scope || 'unknown')
	    perfRequestCountByScopeRef.current[key] = Number(perfRequestCountByScopeRef.current[key] || 0) + 1
	  }, [isPerfDev])
	  const perfPrintSummary = useCallback((scope: string, payload: Record<string, any>) => {
	    if (!isPerfDev) return
	  }, [isPerfDev])

  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setSnackbar({ open: true, message, severity })
  }

  const beginReportModalSession = () => {
    reportModalSessionRef.current += 1
    return reportModalSessionRef.current
  }

  const isCurrentReportModalSession = (sessionId: number) => reportModalSessionRef.current === sessionId

  const isReportHydrationPayloadReady = (report: any) => {
    if (!report || typeof report !== 'object') return false
    return (
      report.assignments !== undefined ||
      report.activities !== undefined ||
      report.personnel !== undefined ||
      report.person_hours !== undefined ||
      report.equipment_entries !== undefined ||
      report.equipment_hours !== undefined
    )
  }

  const resetReportModalStateForSwitch = useCallback((reportId: string) => {
    activeHydrationReportIdRef.current = reportId || null
    setAssignedActivities([])
    setPersonnel([])
    setPersonHours({})
    setPersonExtraHours({})
    setEquipmentEntries([])
    setEquipmentHours({})
    setMaterialEntries([])
    setMaterialQuantities({})
    setActivityObservations({})
    setPendingEvidenceFiles((prev) => {
      Object.values(prev || {}).flat().forEach((x) => {
        try { URL.revokeObjectURL((x as any).previewUrl) } catch {}
      })
      return {}
    })
    setHydratedReportId(null)
    setV2StateReportId(null)
    setV2StateReady(false)
    setSelectedReportHydrationStatus(reportId ? 'loading' : 'ready')
    setSelectedReportHydrationError(null)
    setReportHydrating(!!reportId)
    setHeavyModalSectionsReady(false)
  }, [])

  const rememberFieldReportDetail = useCallback((full: any) => {
    const id = String(full?.id || '').trim()
    if (!id) return
    fieldReportDetailCacheRef.current.set(id, full)
    setFieldReportDetailsById((prev) => (prev[id] === full ? prev : { ...prev, [id]: full }))
  }, [])

  const fetchReportDetail = useCallback(async (reportId: string) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeout = setTimeout(() => {
      try { controller?.abort() } catch {}
    }, 15000)
    try {
      perfCountRequest('modal-open', `/api/field-reports?id=${reportId}`)
      const fetchOptions: RequestInit = { cache: 'no-store' }
      if (controller) fetchOptions.signal = controller.signal
      const res = await fetch(`/api/field-reports?id=${encodeURIComponent(reportId)}`, fetchOptions)
      if (!res.ok) throw new Error(`No se pudo cargar detalle del reporte (${res.status})`)
      const full = await res.json()
      if (!full || !full.id) throw new Error('Detalle de reporte inválido')
      rememberFieldReportDetail(full)
      return full
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('No se pudo cargar el reporte completo. Intente nuevamente.')
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }, [perfCountRequest, rememberFieldReportDetail])

  const fetchFieldReportHoursSummaryByDate = useCallback(async (dateKey: string) => {
    const safeDate = String(dateKey || '').slice(0, 10)
    if (!safeDate) return []
    if (fieldReportHoursSummaryByDateCacheRef.current.has(safeDate)) {
      return fieldReportHoursSummaryByDateCacheRef.current.get(safeDate) || []
    }
    if (fieldReportHoursSummaryByDateInFlightRef.current.has(safeDate)) {
      return fieldReportHoursSummaryByDateInFlightRef.current.get(safeDate) || []
    }
    const promise = (async () => {
      perfCountRequest('modal-open', `/api/field-reports?hours_summary=1&date=${safeDate}`)
      const res = await fetch(`/api/field-reports?hours_summary=1&date=${encodeURIComponent(safeDate)}`)
      if (!res.ok) throw new Error(`No se pudo cargar resumen de horas por fecha (${res.status})`)
      const rows = await res.json()
      const list = Array.isArray(rows) ? rows : []
      fieldReportHoursSummaryByDateCacheRef.current.set(safeDate, list)
      return list
    })()
      .catch(() => [])
      .finally(() => {
        fieldReportHoursSummaryByDateInFlightRef.current.delete(safeDate)
      })
    fieldReportHoursSummaryByDateInFlightRef.current.set(safeDate, promise)
    return promise
  }, [perfCountRequest])

  useEffect(() => {
    if (!open || !reportDate) return
    let cancelled = false
    ;(async () => {
      const rows = await fetchFieldReportHoursSummaryByDate(reportDate)
      if (cancelled) return
      const detailPatch: Record<string, any> = {}
      rows.forEach((row: any) => {
        const rowId = String(row?.id || '').trim()
        if (!rowId) return
        detailPatch[rowId] = row
        fieldReportDetailCacheRef.current.set(rowId, row)
      })
      if (Object.keys(detailPatch).length > 0) {
        setFieldReportDetailsById((prev) => ({ ...prev, ...detailPatch }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, reportDate, fetchFieldReportHoursSummaryByDate])

  const closeReportModal = (originOrEvent?: 'manual' | 'save' | unknown) => {
    const origin: 'manual' | 'save' = (originOrEvent === 'save' || originOrEvent === 'manual') ? originOrEvent : 'manual'
    const isDev = process.env.NODE_ENV !== 'production'
    const startedAt = nowMs()
    const sessionId = openSessionRef.current
    perfCloseStartedAtRef.current = startedAt
    perfMark('fr-modal-close-start')
    if (isDev) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal] close start', {
        reportId: String(selectedReport?.id || ''),
        origin,
        willFetchReports: origin === 'save'
      })
    }
    beginReportModalSession()
    initialDraftFingerprintRef.current = null
    draftFingerprintCapturedRef.current = false
    userTouchedDraftRef.current = false
    setDraftUserChanged(false)
    setOpen(false)
    perfMark('fr-modal-close-set-open-false')
    pendingOpenAfterFormApplyRef.current = null
    setReportHydrating(false)
    setHydratedReportId(null)
    setSelectedReportHydrationStatus('idle')
    setSelectedReportHydrationError(null)
    setV2StateReady(false)
    setV2StateReportId(null)
    activeHydrationReportIdRef.current = null
    if (origin === 'manual') {
      setOpeningReportId(null)
      setSelectedReport(null)
      openReportFallbackRef.current = null
      if (isDev) {
        perfPrintSummary('modal-close', {
          reportId: String(selectedReport?.id || ''),
          visualCloseMs: Math.round(nowMs() - startedAt),
          deferredCleanupMs: 0,
          totalMs: Math.round(nowMs() - startedAt),
          triggeredFetchReports: false
        })
      }
      return
    }
    if (closeCleanupTimerRef.current) {
      clearTimeout(closeCleanupTimerRef.current)
      closeCleanupTimerRef.current = null
    }
    const defer = typeof window !== 'undefined' ? window.setTimeout : setTimeout
    const visualCloseMs = Math.round(nowMs() - startedAt)
    if (origin === 'save') perfSaveCloseVisualAtRef.current = nowMs()
    closeCleanupTimerRef.current = defer(() => {
      if (openSessionRef.current !== sessionId) return
      setSelectedReport(null)
      openReportFallbackRef.current = null
      perfMark('fr-modal-close-deferred-cleanup-done')
      if (isDev) {
        const endedAt = nowMs()
        const deferredCleanupMs = Math.round(endedAt - (origin === 'save' ? (perfSaveCloseVisualAtRef.current || startedAt) : startedAt))
        perfPrintSummary('modal-close', {
          reportId: String(selectedReport?.id || ''),
          visualCloseMs,
          deferredCleanupMs,
          totalMs: Math.round(endedAt - startedAt),
          triggeredFetchReports: origin === 'save'
        })
      }
    }, 0) as ReturnType<typeof setTimeout>
  }

  const openReport = async (r: any, mode: 'view' | 'edit') => {
    const safeMode = isReadOnlyRole ? 'view' : mode
    const isDev = process.env.NODE_ENV !== 'production'
    const newReportId = String(r?.id || '')
    initialDraftFingerprintRef.current = null
    draftFingerprintCapturedRef.current = false
    userTouchedDraftRef.current = false
    setDraftUserChanged(false)
    const sessionId = openSessionRef.current + 1
    openSessionRef.current = sessionId
    if (closeCleanupTimerRef.current) {
      clearTimeout(closeCleanupTimerRef.current)
      closeCleanupTimerRef.current = null
    }
    if (heavySectionsRafRef.current != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(heavySectionsRafRef.current)
      heavySectionsRafRef.current = null
    }
    const previousSelectedReportId = String(selectedReport?.id || '')
    const previousV2StateReportId = String(v2StateReportId || '')
    activeHydrationReportIdRef.current = newReportId || null
    if (isDev) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][flow]', { event: 'open-start', reportId: newReportId, sessionId })
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
        event: 'open-report',
        newReportId,
        previousSelectedReportId,
        previousV2StateReportId
      })
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
        event: 'reset-v2-state',
        newReportId
      })
    }
    perfRequestCountByScopeRef.current['modal-open'] = 0
    perfModalOpenDetailFetchStartedAtRef.current = null
    perfModalOpenDetailFetchDoneAtRef.current = null
    perfModalOpenHydrationDoneAtRef.current = null
    perfMark('fr-modal-open-click')
    modalOpenMetricsRef.current = {
      id: String(r?.id || ''),
      startedAt: nowMs(),
      requests: 0
    }
    if (isDev) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal] open start', {
        reportId: String(r?.id || ''),
        mode: safeMode
      })
    }
    setEditMode(safeMode === 'edit')
    if (r?.id) {
      setOpeningReportId(newReportId)
      setOpen(false)
      resetReportModalStateForSwitch(newReportId)
      openReportFallbackRef.current = r || null
      try {
        if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
            event: 'open',
            reportId: newReportId,
            usingStub: false
          })
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
            event: 'fetch-detail-start',
            reportId: newReportId
          })
        }
        perfModalOpenDetailFetchStartedAtRef.current = nowMs()
        perfMark('fr-modal-open-detail-fetch-start')
        const fullRaw = await fetchReportDetail(newReportId)
        perfModalOpenDetailFetchDoneAtRef.current = nowMs()
        perfMark('fr-modal-open-detail-fetch-done')
        if (String(activeHydrationReportIdRef.current || '') !== newReportId) return
        if (openSessionRef.current !== sessionId) return
        const fullDate = String(fullRaw?.date || fullRaw?.report_date || r?.date || r?.report_date || '').slice(0, 10)
        if (fullDate) {
          const summaryRows = await fetchFieldReportHoursSummaryByDate(fullDate)
          summaryRows.forEach((row: any) => {
            const rowId = String(row?.id || '').trim()
            if (!rowId || rowId === newReportId) return
            fieldReportDetailCacheRef.current.set(rowId, row)
            setFieldReportDetailsById((prev) => (prev[rowId] === row ? prev : { ...prev, [rowId]: row }))
          })
        }
        if (String(activeHydrationReportIdRef.current || '') !== newReportId) return
        if (openSessionRef.current !== sessionId) return
        if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
            event: 'fetch-detail-done',
            reportId: newReportId,
            ok: true
          })
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][flow]', {
            event: 'detail-loaded',
            reportId: newReportId,
            sessionId
          })
        }
        const full = { ...fullRaw, __fullLoaded: true }
        pendingOpenAfterFormApplyRef.current = { reportId: newReportId, sessionId }
        setSelectedReport(full)
        if (process.env.NODE_ENV !== 'production') {
          const totalHours = (() => {
            const raw = typeof full?.person_hours === 'string' ? (() => { try { return JSON.parse(full.person_hours) } catch { return {} } })() : (full?.person_hours || {})
            const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {}
            delete (obj as any).__extras
            return Object.values(obj).reduce((acc: number, value: any) => Array.isArray(value) ? acc + value.reduce((s: number, n: any) => s + (Number(n) || 0), 0) : acc, 0)
          })()
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][flow]', {
            event: 'form-applied',
            reportId: newReportId,
            sessionId,
            totalHours,
            personRowsCount: Array.isArray(full?.personnel) ? full.personnel.length : 0,
            activitiesCount: Array.isArray(full?.assignments) ? full.assignments.length : (Array.isArray(full?.activities) ? full.activities.length : 0)
          })
        }
        perfModalOpenHydrationDoneAtRef.current = nowMs()
        perfMark('fr-modal-open-hydration-done')
      } catch (err: any) {
        if (String(activeHydrationReportIdRef.current || '') !== newReportId || openSessionRef.current !== sessionId) return
        setSelectedReportHydrationStatus('error')
        setSelectedReportHydrationError(String(err?.message || 'No se pudo cargar el reporte completo.'))
        setReportHydrating(false)
        setHydratedReportId(null)
        setV2StateReportId(null)
        setV2StateReady(false)
        setOpen(false)
        showSnackbar('No se pudo cargar el reporte completo.', 'error')
      } finally {
        if (
          String(activeHydrationReportIdRef.current || '') === newReportId &&
          openSessionRef.current === sessionId &&
          !pendingOpenAfterFormApplyRef.current
        ) {
          setOpeningReportId(null)
        }
      }
      return
    }

    // nuevo reporte
    setOpeningReportId(null)
    resetReportModalStateForSwitch('')
    setSelectedReport(r || null)
    setV2StateReady(true)
    setSelectedReportHydrationStatus('ready')
    setSelectedReportHydrationError(null)
    setOpen(true)
    perfMark('fr-modal-open-set-open')
  }

  const openNewReport = () => {
    beginReportModalSession()
    initialDraftFingerprintRef.current = null
    draftFingerprintCapturedRef.current = false
    userTouchedDraftRef.current = false
    setDraftUserChanged(false)
    activeHydrationReportIdRef.current = null
    setEditMode(false)
    setSelectedReport(null)
    setSelectedReportHydrationStatus('ready')
    setSelectedReportHydrationError(null)
    setV2StateReady(true)
    setV2StateReportId(null)
    setReportDesignVersion('V2')
    setGeneralEventsAnswers(Array.from({ length: GENERAL_EVENTS_QUESTIONS.length }).map(() => 'no'))
    setGeneralEventsComments(Array.from({ length: GENERAL_EVENTS_QUESTIONS.length }).map(() => ''))
    setOpen(true)
  }

  const openHistory = async (report: any) => {
    if (!isAdminRole || !report?.id) return
    setHistoryLoading(true)
    setHistoryRows([])
    setExpandedHistoryVersionId(null)
    setHistoryReportLabel(String(report?.report_title || report?.area || report?.id || '').trim())
    setHistoryOpen(true)
    try {
      const res = await fetch(`/api/field-reports?history_report_id=${encodeURIComponent(String(report.id))}`)
      if (!res.ok) throw new Error('No se pudo cargar historial')
      const data = await res.json()
      setHistoryRows(Array.isArray(data) ? data : [])
    } catch {
      showSnackbar('Error al cargar historial de versiones', 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  const formatVersionPayload = (value: any) => {
    if (value == null) return 'No disponible'
    if (typeof value === 'string') {
      const raw = value.trim()
      if (!raw) return 'No disponible'
      try {
        return JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        return raw
      }
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const parseVersionPayloadObject = (value: any): Record<string, any> | null => {
    if (!value) return null
    if (typeof value === 'string') {
      const raw = value.trim()
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : null
      } catch {
        return null
      }
    }
    if (typeof value === 'object') return value as Record<string, any>
    return null
  }

  const openHistorySnapshotInViewer = (row: FieldReportVersion, snapshotType: 'previous' | 'new') => {
    const payload = snapshotType === 'previous' ? row?.previous_data : row?.new_data
    const parsed = parseVersionPayloadObject(payload)
    if (!parsed) {
      showSnackbar('La versión seleccionada no tiene datos para visualizar', 'info')
      return
    }

    beginReportModalSession()
    const reportLike = {
      ...parsed,
      id: `history-${row.id}-${snapshotType}`,
      __historyPreview: true
    }
    activeHydrationReportIdRef.current = String(reportLike.id || '')
    setEditMode(false)
    setSelectedReport(reportLike)
    setReportHydrating(false)
    setOpen(true)
    setHistoryOpen(false)
  }

  // delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reportToDelete, setReportToDelete] = useState<string | null>(null)

  const confirmDeleteReport = (id: string) => {
    if (isReadOnlyRole) return
    setReportToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (isReadOnlyRole) {
      setDeleteDialogOpen(false)
      return
    }
    if (!reportToDelete) return
    try {
      const res = await fetch('/api/field-reports', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportToDelete })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error deleting')
      }
      showSnackbar('Reporte eliminado', 'success')
      setDeleteDialogOpen(false)
      setReportToDelete(null)
      fetchReports({ force: true })
    } catch (e) {
      console.error('Error deleting report', e)
      showSnackbar('Error al eliminar el reporte', 'error')
    }
  }

  const updateActivityObservation = (activityId: string, value: string) => {
    setActivityObservations((prev) => ({ ...prev, [activityId]: value }))
  }

  const isLeaderPosition = (pos: any) => {
    const p = pos ? String(pos).toLowerCase() : ''
    return p.includes('supervisor') || p.includes('jefe') || p.includes('capataz') || p.includes('foreman') || p.includes('superintendente')
  }

  const isCapatazPosition = (pos: any) => {
    const p = pos ? String(pos).toLowerCase() : ''
    return p.includes('capataz') || p.includes('foreman') || p.includes('encargado')
  }

  const isSupervisorLikePosition = (pos: any) => {
    const p = pos ? String(pos).toLowerCase() : ''
    return p.includes('supervisor') || p.includes('jefe') || p.includes('superintendente') || p.includes('coordinador')
  }

  const filteredCrewMembers = useMemo(() => {
    return (crewMembers || []).filter((c) => !isLeaderPosition(c?.position))
  }, [crewMembers])

  const formatChileanRutIfValid = (value: any) => {
    const raw = String(value || '').trim().toUpperCase()
    if (!raw) return ''
    const clean = raw.replace(/[^0-9K]/gi, '').toUpperCase()
    if (clean.length < 8 || clean.length > 9) return raw
    const body = clean.slice(0, -1)
    const dv = clean.slice(-1)
    if (!/^\d+$/.test(body)) return raw
    let sum = 0
    let multiplier = 2
    for (let i = body.length - 1; i >= 0; i--) {
      sum += Number(body[i]) * multiplier
      multiplier = multiplier === 7 ? 2 : multiplier + 1
    }
    const mod = 11 - (sum % 11)
    const expectedDv = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod)
    if (expectedDv !== dv) return raw
    const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${formattedBody}-${dv}`
  }

  const personnelRows = useMemo(() => {
    const crewNumber = (name: string) => {
      const m = String(name || '').match(/(\d+)/)
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
    }

    const fromPersonnel = Array.isArray(personnel)
      ? personnel.map((p: any, idx: number) => ({
          personId: String(p?.id || p?.collaborator_id || p?.user_id || p?.name || `person-${idx}`),
          document: String(p?.document || '').trim(),
          position: p?.role || '',
          name: String(p?.name || '').trim(),
          crewName: p?.crewName || p?.crew_name || ''
        }))
      : []
    if (fromPersonnel.length > 0) return fromPersonnel

    if (crewMembers && crewMembers.length > 0) {
      const capatazMembers = (crewMembers || []).filter((m: any) => isCapatazPosition(m?.position))
      const nonLeaderMembers = (crewMembers || []).filter((m: any) => !isLeaderPosition(m?.position))
      const orderedMembers = [...capatazMembers, ...nonLeaderMembers]
      const uniqueMembers = Array.from(
        new Map(
          orderedMembers.map((m: any, idx: number) => [
            String(
              m?.id ||
              m?.collaborator_id ||
              m?.user_id ||
              `${m?.first_name || ''} ${m?.last_name || ''}`.trim() ||
              `${idx}`
            ),
            m
          ])
        ).values()
      ).filter((m: any) => !isSupervisorLikePosition(m?.position))

      return uniqueMembers.map((member: any, idx: number) => ({
        personId: String(
          member?.id ||
          member?.collaborator_id ||
          member?.user_id ||
          `${member?.first_name || ''} ${member?.last_name || ''}`.trim() ||
          `${idx}`
        ),
        document: String(member?.document || '').trim(),
        position: member?.position || '',
        name: `${member?.first_name || ''} ${member?.last_name || ''}`.trim(),
        crewName: member?.crewName || member?.crew_name || ''
      }))
    }

    const keys = Object.keys(personHours || {})
    if (isAdminRole && keys.length > 0) {
      const rows = keys.map((k, idx) => {
        const info = collaboratorMap[String(k)] || { name: '', position: '' }
        return {
          personId: String(k),
          document: String(info.document || '').trim(),
          position: info.position || '',
          name: info.name || '',
          crewName: ''
        }
      })
      rows.sort((a, b) => {
        const na = crewNumber(a.crewName)
        const nb = crewNumber(b.crewName)
        if (na !== nb) return na - nb
        return String(a.name || '').localeCompare(String(b.name || ''), 'es')
      })
      return rows
    }

    return []
  }, [filteredCrewMembers, personnel, personHours, isAdminRole, collaboratorMap, crewMembers])

  const personnelRowIdsSignature = useMemo(() => {
    return (personnelRows || [])
      .map((row: any, idx: number) => String(row?.personId || `person-${idx}`))
      .join('|')
  }, [personnelRows])

  const parseJsonMaybe = useCallback((value: any) => {
    if (typeof value !== 'string') return value
    try { return JSON.parse(value) } catch { return value }
  }, [])

  const normalizeWorkerKey = useCallback((row: any, fallbackKey?: string) => {
    const fromId = String(
      row?.personId ||
      row?.id ||
      row?.collaborator_id ||
      row?.user_id ||
      fallbackKey ||
      ''
    ).trim()
    if (fromId) return `id:${fromId}`
    const doc = String(row?.document || '').trim().toUpperCase()
    if (doc) return `doc:${doc}`
    const name = normalizeText(String(row?.name || row?.nombre || '').trim())
    if (name) return `name:${name}`
    return ''
  }, [])

  const draftDayHoursByWorkerKey = useMemo(() => {
    const map = new Map<string, number>()
    ;(personnelRows || []).forEach((row: any, idx: number) => {
      const personId = String(row?.personId || `person-${idx}`)
      const hours = Array.isArray(personHours?.[personId]) ? personHours[personId] : []
      const extra = Number(personExtraHours?.[personId] || 0) || 0
      const baseTotal = hours.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0)
      const total = getEffectivePersonHourTotals(baseTotal, extra).totalHours
      const key = normalizeWorkerKey(row, personId)
      if (!key) return
      map.set(key, (map.get(key) || 0) + total)
    })
    return map
  }, [personnelRows, personHours, personExtraHours, normalizeWorkerKey])

  const normalizeMachineKey = useCallback((entry: any) => {
    const patentRaw = String(entry?.code || entry?.patent || '').trim().toUpperCase()
    if (patentRaw) {
      const compact = patentRaw.replace(/[^A-Z0-9]/g, '')
      if (compact) return `pat:${compact}`
    }
    const nameRaw = normalizeText(String(entry?.description || entry?.equipment_name || '').trim())
    if (nameRaw) return `name:${nameRaw}`
    return ''
  }, [])

  const managementEquipmentByMachineKey = useMemo(() => {
    const map = new Map<string, ManagementEquipmentCatalogRow>()
    ;(managementEquipmentCatalog || []).forEach((item) => {
      const key = normalizeMachineKey({ description: item.equipment_name, code: item.patent })
      if (key) map.set(key, item)
    })
    return map
  }, [managementEquipmentCatalog, normalizeMachineKey])

  const isKnownNonOperationalEquipment = useCallback((entry: any) => {
    const key = normalizeMachineKey(entry)
    if (!key) return false
    const catalogRow = managementEquipmentByMachineKey.get(key)
    return catalogRow?.is_operational === false
  }, [managementEquipmentByMachineKey, normalizeMachineKey])

  const hasEquipmentUse = useCallback((entry: any, rowIdx: number) => {
    const entryId = `equip-${rowIdx}`
    const hours = Array.isArray(equipmentHours?.[entryId]) ? equipmentHours[entryId] : []
    const hm = hours.reduce((acc: number, value: any) => acc + (Number(value) || 0), 0)
    const extra = Math.max(0, Number(entry?.extra_hours ?? 0) || 0)
    return Boolean(
      String(entry?.description || '').trim() ||
      String(entry?.code || '').trim() ||
      hm > 0 ||
      extra > 0
    )
  }, [equipmentHours])

  const draftMachineDayHoursByKey = useMemo(() => {
    const map = new Map<string, number>()
    ;(equipmentEntries || []).forEach((entry: any, idx: number) => {
      const key = normalizeMachineKey(entry)
      if (!key) return
      const entryId = `equip-${idx}`
      const hours = Array.isArray(equipmentHours?.[entryId]) ? equipmentHours[entryId] : []
      const hm = hours.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0)
      const extra = Math.max(0, Number((entry as any)?.extra_hours ?? 0) || 0)
      map.set(key, (map.get(key) || 0) + hm + extra)
    })
    return map
  }, [equipmentEntries, equipmentHours, normalizeMachineKey])

  const machineHoursFromReport = useCallback((reportLike: any) => {
    const map = new Map<string, number>()
    const source = reportLike || {}
    const entriesRaw = parseJsonMaybe(source?.equipment_entries)
    const hoursRaw = parseJsonMaybe(source?.equipment_hours)
    const entries = Array.isArray(entriesRaw) ? entriesRaw : []
    const hoursObj = (hoursRaw && typeof hoursRaw === 'object' && !Array.isArray(hoursRaw))
      ? (hoursRaw as Record<string, any>)
      : {}
    entries.forEach((entry: any, idx: number) => {
      const key = normalizeMachineKey(entry)
      if (!key) return
      const entryId = `equip-${idx}`
      const hours = Array.isArray(hoursObj?.[entryId]) ? hoursObj[entryId] : []
      const hm = hours.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0)
      const extra = Math.max(0, Number((entry as any)?.extra_hours ?? 0) || 0)
      map.set(key, (map.get(key) || 0) + hm + extra)
    })
    return map
  }, [parseJsonMaybe, normalizeMachineKey])

  const crossReportMachineDayHoursByKey = useMemo(() => {
    const map = new Map<string, number>()
    const currentDate = String(reportDate || '').slice(0, 10)
    if (!currentDate) return map
    ;(Array.isArray(reports) ? reports : []).forEach((report: any) => {
      const reportDateKey = String(report?.date || report?.report_date || '').slice(0, 10)
      if (!reportDateKey || reportDateKey !== currentDate) return
      if (selectedReport?.id && String(report?.id || '') === String(selectedReport.id)) return
      const sourceReport = fieldReportDetailsById[String(report?.id || '')] || report
      const hoursMap = machineHoursFromReport(sourceReport)
      hoursMap.forEach((value, key) => {
        map.set(key, (map.get(key) || 0) + value)
      })
    })
    draftMachineDayHoursByKey.forEach((value, key) => {
      map.set(key, (map.get(key) || 0) + value)
    })
    return map
  }, [reports, reportDate, selectedReport?.id, fieldReportDetailsById, machineHoursFromReport, draftMachineDayHoursByKey])

  const machineReportCountByKey = useMemo(() => {
    const byMachine = new Map<string, Set<string>>()
    const add = (machineKey: string, reportKey: string) => {
      if (!machineKey || !reportKey) return
      if (!byMachine.has(machineKey)) byMachine.set(machineKey, new Set<string>())
      byMachine.get(machineKey)?.add(reportKey)
    }
    const currentDate = String(reportDate || '').slice(0, 10)
    ;(Array.isArray(reports) ? reports : []).forEach((report: any) => {
      const reportDateKey = String(report?.date || report?.report_date || '').slice(0, 10)
      if (!currentDate || reportDateKey !== currentDate) return
      if (selectedReport?.id && String(report?.id || '') === String(selectedReport.id)) return
      const sourceReport = fieldReportDetailsById[String(report?.id || '')] || report
      const entriesRaw = parseJsonMaybe(sourceReport?.equipment_entries)
      const entries = Array.isArray(entriesRaw) ? entriesRaw : []
      const reportKey = String(report?.id || '')
      entries.forEach((entry: any) => {
        const key = normalizeMachineKey(entry)
        if (!key) return
        add(key, reportKey)
      })
    })
    ;(Array.isArray(equipmentEntries) ? equipmentEntries : []).forEach((entry: any) => {
      const key = normalizeMachineKey(entry)
      if (!key) return
      add(key, `current:${String(selectedReport?.id || 'new')}`)
    })
    return new Map(Array.from(byMachine.entries()).map(([k, v]) => [k, v.size]))
  }, [reports, reportDate, fieldReportDetailsById, parseJsonMaybe, normalizeMachineKey, equipmentEntries, selectedReport?.id])

  const usedMachineKeysByOtherReports = useMemo(() => {
    const used = new Set<string>()
    const currentDate = String(reportDate || '').slice(0, 10)
    if (!currentDate) return used
    ;(Array.isArray(reports) ? reports : []).forEach((report: any) => {
      const reportDateKey = String(report?.date || report?.report_date || '').slice(0, 10)
      if (reportDateKey !== currentDate) return
      if (selectedReport?.id && String(report?.id || '') === String(selectedReport.id)) return
      const sourceReport = fieldReportDetailsById[String(report?.id || '')] || report
      const entriesRaw = parseJsonMaybe(sourceReport?.equipment_entries)
      const entries = Array.isArray(entriesRaw) ? entriesRaw : []
      entries.forEach((entry: any) => {
        const key = normalizeMachineKey(entry)
        if (key) used.add(key)
      })
    })
    return used
  }, [reports, reportDate, selectedReport?.id, fieldReportDetailsById, parseJsonMaybe, normalizeMachineKey])

  const crossReportDayHoursByWorkerKey = useMemo(() => {
    const map = new Map<string, number>()
    const currentDate = String(reportDate || '').slice(0, 10)
    if (!currentDate) return map

    ;(reports || []).forEach((report: any) => {
      const reportDateKey = String(report?.date || report?.report_date || '').slice(0, 10)
      if (!reportDateKey || reportDateKey !== currentDate) return
      if (selectedReport?.id && String(report?.id || '') === String(selectedReport.id)) return
      const sourceReport = fieldReportDetailsById[String(report?.id || '')] || report

      const personnelRaw = parseJsonMaybe(sourceReport?.personnel)
      const personHoursRaw = parseJsonMaybe(sourceReport?.person_hours)
      const personHoursObj = (personHoursRaw && typeof personHoursRaw === 'object' && !Array.isArray(personHoursRaw))
        ? { ...(personHoursRaw as Record<string, any>) }
        : {}
      const extrasRaw = (personHoursObj && typeof personHoursObj.__extras === 'object' && personHoursObj.__extras)
        ? (personHoursObj.__extras as Record<string, any>)
        : {}
      delete (personHoursObj as any).__extras

      const rows = Array.isArray(personnelRaw) ? personnelRaw : []
      const keyedRows = rows.length > 0
        ? rows.map((r: any, idx: number) => ({
            row: r,
            rowKey: String(r?.id || r?.collaborator_id || r?.user_id || `person-${idx}`)
          }))
        : Object.keys(personHoursObj || {}).map((k) => ({
            row: { personId: k, id: k, collaborator_id: k, user_id: k, name: collaboratorMap[String(k)]?.name || '' },
            rowKey: String(k)
          }))

      keyedRows.forEach(({ row, rowKey }) => {
        const hours = Array.isArray(personHoursObj?.[rowKey]) ? personHoursObj[rowKey] : []
        const extra = Number(extrasRaw?.[rowKey] || 0) || 0
        const baseTotal = hours.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0)
        const total = getEffectivePersonHourTotals(baseTotal, extra).totalHours
        const key = normalizeWorkerKey(row, rowKey)
        if (!key) return
        map.set(key, (map.get(key) || 0) + total)
      })
    })

    draftDayHoursByWorkerKey.forEach((value, key) => {
      map.set(key, (map.get(key) || 0) + value)
    })

    return map
  }, [reports, fieldReportDetailsById, reportDate, selectedReport?.id, parseJsonMaybe, normalizeWorkerKey, draftDayHoursByWorkerKey, collaboratorMap])

  const activityCount = assignedActivities ? assignedActivities.length : 0
  const FIELD_REPORTS_DEBUG = false

  useEffect(() => {
    if (selectedReportHydrationStatus === 'loading') return
    const ids = personnelRowIdsSignature ? personnelRowIdsSignature.split('|').filter(Boolean) : []
    const validIds = new Set(ids)
    setPersonAreaById((prev) => {
      const prevEntries = Object.entries(prev || {})
      if (prevEntries.length === 0) return prev
      if (validIds.size === 0) return {}
      const entries = prevEntries.filter(([id]) => validIds.has(String(id)))
      if (entries.length === prevEntries.length) return prev
      const next = Object.fromEntries(entries)
      return next
    })
  }, [personnelRowIdsSignature, selectedReportHydrationStatus])

  useEffect(() => {
    assignedActivitiesRef.current = assignedActivities || []
  }, [assignedActivities])

  const loadAssignedActivitiesForCrewDate = useCallback(async (crewId: string, date: string) => {
    if (!crewId || !date) {
      if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] skip loadAssignedActivitiesForCrewDate: missing crewId/date', { crewId, date })
      }
      return []
	    }
	    const cacheKey = `${String(crewId)}::${String(date)}`
	    const cachedRows = activityRowsByCrewDateCacheRef.current.get(cacheKey)
	    if (cachedRows) {
	      return cachedRows
	    }
	    const inFlight = activityRowsByCrewDateInFlightRef.current.get(cacheKey)
	    if (inFlight) {
	      return inFlight
	    }
	    const promise = (async () => {
      try {
      const fetchActivities = async (withDate: boolean) => {
        const url = withDate
          ? `/api/crews/${encodeURIComponent(String(crewId))}/activities?date=${encodeURIComponent(date)}`
          : `/api/crews/${encodeURIComponent(String(crewId))}/activities`
        perfCountRequest('modal-open', url)
        const res = await fetch(url)
        if (!res.ok) {
          console.warn('Could not load assigned activities', await res.text())
          return null
        }
        const json = await res.json()
        const list = Array.isArray(json?.activities) ? json.activities : []
        if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] fetch activities result', {
            crewId,
            date,
            withDate,
            url,
            count: list.length,
            sample: list.slice(0, 3).map((x: any) => ({
              id: x?.id,
              activity: x?.activity,
              item_id: x?.item_id,
              work_date: x?.work_date,
              assigned_at: x?.assigned_at
            }))
          })
        }
        return list
      }
      if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] start loadAssignedActivitiesForCrewDate', { crewId, date })
      }
      let activities = await fetchActivities(true)
      if (!activities) return []
      if (activities.length === 0) {
        // Fallback para V1: si no hay match por fecha, mostrar actividades existentes de la cuadrilla.
        const fallback = await fetchActivities(false)
        if (fallback) activities = fallback
      }
      if (activities.length === 0) {
        // Último fallback: usar la fecha más reciente con actividades de la cuadrilla.
        try {
          const datesRes = await fetch(`/api/crews/${encodeURIComponent(String(crewId))}/activities?dates=1`)
          perfCountRequest('modal-open', `/api/crews/${encodeURIComponent(String(crewId))}/activities?dates=1`)
          if (datesRes.ok) {
            const datesJson = await datesRes.json()
            const dates = Array.isArray(datesJson?.dates) ? datesJson.dates.map((d: any) => String(d)).filter(Boolean) : []
            const latestDate = dates.length > 0 ? dates[0] : ''
            if (latestDate) {
              const latestRes = await fetch(`/api/crews/${encodeURIComponent(String(crewId))}/activities?date=${encodeURIComponent(latestDate)}`)
              perfCountRequest('modal-open', `/api/crews/${encodeURIComponent(String(crewId))}/activities?date=${encodeURIComponent(latestDate)}`)
              if (latestRes.ok) {
                const latestJson = await latestRes.json()
                const latestActivities = Array.isArray(latestJson?.activities) ? latestJson.activities : []
                if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] fallback latest date', {
                    crewId,
                    requestedDate: date,
                    latestDate,
                    count: latestActivities.length
                  })
                }
                activities = latestActivities
              }
            }
          }
        } catch (err) {
          if (FIELD_REPORTS_DEBUG) {
            console.warn('[field-reports][V1] latest date fallback failed', { crewId, date, err })
          }
        }
      }
      const crew = crews.find((c) => String(c.id) === String(crewId))
      const mapped = activities.map((act: any, idx: number) => ({
        lineNumber: idx + 1,
        activityId: String(act.id),
        id: act.id,
        company_id: act.company_id || null,
        program_quantity: act.quantity ?? 0,
        quantity: 0,
        created_at: act.created_at || null,
        updated_at: act.updated_at || null,
        description: act.description ?? null,
        unit: act.unit ?? null,
        discipline: act.discipline ?? null,
        observations: act.user_detail ?? act.observations ?? null,
        item_id: act.item_id ?? null,
        activity_detail_id: null,
        activity_detail_code: null,
        sub_id: act.sub_id ?? null,
        area: act.area ?? null,
        activity: act.activity ?? null,
        package: act.package ?? null,
        crewId: String(crewId),
        crewName: crew?.name || '',
      }))
      if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] mapped activities', {
          crewId,
          date,
          mappedCount: mapped.length,
          mappedSample: mapped.slice(0, 3).map((x: { activityId: any; activity: any; item_id: any; crewName: any }) => ({
            activityId: x.activityId,
            activity: x.activity,
            item_id: x.item_id,
            crewName: x.crewName
          }))
        })
      }
        activityRowsByCrewDateCacheRef.current.set(cacheKey, mapped)
        return mapped
      } catch (e) {
        console.warn('Error fetching assigned activities', e)
        return []
      } finally {
        activityRowsByCrewDateInFlightRef.current.delete(cacheKey)
      }
    })()
    activityRowsByCrewDateInFlightRef.current.set(cacheKey, promise)
    try {
      const rows = await promise
      return rows
    } finally {
      activityRowsByCrewDateInFlightRef.current.delete(cacheKey)
    }
  }, [crews, FIELD_REPORTS_DEBUG])

  const loadAssignedActivitiesForCrewsDate = useCallback(async (crewIds: string[], date: string) => {
    if (!crewIds || crewIds.length === 0 || !date) {
      if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] clear assignedActivities: missing crewIds/date', { crewIds, date })
      }
      crewActivitiesLoadSeqRef.current += 1
      setLoadingCrewActivities(false)
      setAssignedActivities([])
      return
    }
    if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] loadAssignedActivitiesForCrewsDate', { crewIds, date })
    }
    const uniqueIds = Array.from(new Set(crewIds.map(String)))
    const loadSeq = crewActivitiesLoadSeqRef.current + 1
    crewActivitiesLoadSeqRef.current = loadSeq
    setLoadingCrewActivities(true)
    const mapActivitiesToAssignedRows = (activities: any[], crewId: string) => {
      const crew = crews.find((c) => String(c.id) === String(crewId))
      return (activities || []).map((act: any, idx: number) => ({
        lineNumber: idx + 1,
        activityId: String(act.id),
        id: act.id,
        company_id: act.company_id || null,
        program_quantity: act.quantity ?? 0,
        quantity: 0,
        created_at: act.created_at || null,
        updated_at: act.updated_at || null,
        description: act.description ?? null,
        unit: act.unit ?? null,
        discipline: act.discipline ?? null,
        observations: act.user_detail ?? act.observations ?? null,
        item_id: act.item_id ?? null,
        activity_detail_id: null,
        activity_detail_code: null,
        sub_id: act.sub_id ?? null,
        area: act.area ?? null,
        activity: act.activity ?? null,
        package: act.package ?? null,
        crewId: String(crewId),
        crewName: crew?.name || '',
      }))
    }

    try {
      let results: any[][] | null = null
      try {
        const bulkUrl = `/api/crews/activities/by-date?date=${encodeURIComponent(date)}&include=activities&crewIds=${encodeURIComponent(uniqueIds.join(','))}`
        perfCountRequest('modal-open', bulkUrl)
        const res = await fetch(bulkUrl)
        if (res.ok) {
          const data = await res.json()
          const activitiesByCrew = data?.activitiesByCrew && typeof data.activitiesByCrew === 'object'
            ? data.activitiesByCrew
            : {}
          results = uniqueIds.map((crewId) => {
            const rows = Array.isArray(activitiesByCrew[String(crewId)]) ? activitiesByCrew[String(crewId)] : []
            const mapped = mapActivitiesToAssignedRows(rows, crewId)
            activityRowsByCrewDateCacheRef.current.set(`${String(crewId)}::${String(date)}`, mapped)
            return mapped
          })
        }
      } catch (e) {
        console.warn('Bulk assigned activities load failed; falling back to per-crew requests', e)
      }
      if (!results) {
        results = await Promise.all(uniqueIds.map((id) => loadAssignedActivitiesForCrewDate(id, date)))
      }
      const flattened = results.flat()
      // re-number across all crews
      const withLines = flattened.map((a, idx) => ({ ...a, lineNumber: idx + 1 }))
      if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] setAssignedActivities', {
          crewIds: uniqueIds,
          date,
          resultGroups: results.map((r) => r.length),
          total: withLines.length
        })
      }
      if (crewActivitiesLoadSeqRef.current === loadSeq) {
        setAssignedActivities(withLines)
      }
    } finally {
      if (crewActivitiesLoadSeqRef.current === loadSeq) {
        setLoadingCrewActivities(false)
      }
    }
  }, [crews, loadAssignedActivitiesForCrewDate, FIELD_REPORTS_DEBUG])

  const activitySyncKey = useCallback((row: any) => `${String(row?.activityId || row?.id || '')}::${String(row?.crewId || row?.crew_id || '')}`, [])

  const mergeAssignedActivitiesWithLatest = useCallback((existingRows: AssignedActivity[], latestRows: AssignedActivity[]) => {
    const existing = Array.isArray(existingRows) ? existingRows : []
    const latest = Array.isArray(latestRows) ? latestRows : []
    const existingByKey = new Map(existing.map((r) => [activitySyncKey(r), r]))
    const latestKeys = new Set(latest.map((r) => activitySyncKey(r)).filter((k) => !k.startsWith('::')))
    const existingKeys = new Set(existing.map((r) => activitySyncKey(r)).filter((k) => !k.startsWith('::')))
    const toAppendCount = latest.filter((r) => {
      const k = activitySyncKey(r)
      const rowAny = r as any
      return !!String(rowAny?.activityId || rowAny?.id || '').trim() && !!String(rowAny?.crewId || rowAny?.crew_id || '').trim() && !existingKeys.has(k)
    }).length
    const removedCount = existing.filter((r) => {
      const k = activitySyncKey(r)
      const rowAny = r as any
      return !!String(rowAny?.activityId || rowAny?.id || '').trim() && !!String(rowAny?.crewId || rowAny?.crew_id || '').trim() && !latestKeys.has(k)
    }).length
    const updatedCount = latest.filter((r) => {
      const k = activitySyncKey(r)
      const prev = existingByKey.get(k)
      if (!prev) return false
      return [
        'activity',
        'description',
        'program_quantity',
        'unit',
        'discipline',
        'observations',
        'item_id',
        'sub_id',
        'area',
        'package'
      ].some((field) => String((prev as any)?.[field] ?? '') !== String((r as any)?.[field] ?? ''))
    }).length
    // Important: preserve latest crews order (display_order) as source of truth.
    const merged = latest.map((latestRow) => {
      const existingRow = existingByKey.get(activitySyncKey(latestRow))
      if (!existingRow) return latestRow
      return {
        ...latestRow,
        // Report-owned fields (must survive sync from crews)
        quantity: Number(existingRow?.quantity ?? latestRow?.quantity ?? 0) || 0,
        execution_description: existingRow?.execution_description ?? latestRow?.execution_description ?? '',
        time_classification: existingRow?.time_classification ?? latestRow?.time_classification ?? '',
        time_reason: existingRow?.time_reason ?? latestRow?.time_reason ?? '',
        activity_detail_id: (existingRow as any)?.activity_detail_id ?? (latestRow as any)?.activity_detail_id ?? '',
        activity_detail_code: (existingRow as any)?.activity_detail_code ?? (latestRow as any)?.activity_detail_code ?? '',
        evidence_files: Array.isArray((existingRow as any)?.evidence_files)
          ? (existingRow as any).evidence_files
          : (Array.isArray((latestRow as any)?.evidence_files) ? (latestRow as any).evidence_files : [])
      }
    }).map((row, idx) => ({
      ...row,
      lineNumber: idx + 1
    }))
    return { merged, appendedCount: toAppendCount, updatedCount, removedCount }
  }, [activitySyncKey])

  const syncCrewActivityUserDetails = useCallback(async (rows: AssignedActivity[], workDate: string) => {
    if (!Array.isArray(rows) || rows.length === 0 || !workDate) return

    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? workDate : ''
    if (!normalizedDate) return

    const updates = rows
      .filter((a) => a?.crewId && a?.activityId)
      .map((a) => ({
        crewId: String(a.crewId),
        activityId: String(a.activityId),
        workDate: normalizedDate,
        user_detail: a?.observations == null ? null : String(a.observations)
      }))

    if (updates.length === 0) return

    await Promise.allSettled(
      updates.map((u) =>
        fetch(`/api/crews/${encodeURIComponent(u.crewId)}/activities`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activityId: u.activityId,
            workDate: u.workDate,
            user_detail: u.user_detail
          })
        })
      )
    )
  }, [])

  // Helper para extraer resumen legible de actividades desde el reporte
  const getActivitiesSummary = (activities: any, assignments?: any): string => {
    const source = assignments ?? activities
    if (!source) return 'Sin actividades'
    
    // Si es un array
    if (Array.isArray(source)) {
      const names = source.map((a, idx) => 
        a?.activity || a?.descripcion || a?.description || a?.nombre || a?.name || `Actividad ${idx+1}`
      )
      return names.join(', ') || 'Sin actividades'
    }
    
    // Si es un string, puede ser JSON o texto plano
    if (typeof source === 'string') {
      try {
        const parsed = JSON.parse(source)
        return getActivitiesSummary(parsed) // recursión
      } catch {
        return source // es texto plano
      }
    }
    
    // Si es un objeto
    if (typeof source === 'object') {
      const maybeRows = (source as any)?.rows || (source as any)?.items || (source as any)?.data
      if (Array.isArray(maybeRows)) return getActivitiesSummary(maybeRows)
      return (source as any).activity || (source as any).descripcion || (source as any).description || (source as any).nombre || (source as any).name || 'Sin actividades'
    }
    
    return 'Sin actividades'
  }

  const getActivitySummaryLines = (activities: any, assignments?: any): string[] => {
    const source = assignments ?? activities
    if (!source) return ['Sin actividades']

    if (Array.isArray(source)) {
      const lines = source
        .map((a, idx) => {
          const activity = String(a?.activity || a?.nombre || a?.name || '').trim()
          const description = String(a?.description || a?.descripcion || '').trim()
          const fallback = String(a?.observations || a?.user_detail || '').trim()
          const text = activity && description
            ? `${activity} - ${description}`
            : (activity || description || fallback || `Actividad ${idx + 1}`)
          return text.trim()
        })
        .filter(Boolean)
      return lines.length > 0 ? lines : ['Sin actividades']
    }

    if (typeof source === 'string') {
      try {
        const parsed = JSON.parse(source)
        return getActivitySummaryLines(parsed)
      } catch {
        const text = source.trim()
        return text ? [text] : ['Sin actividades']
      }
    }

    if (typeof source === 'object') {
      const maybeRows = (source as any)?.rows || (source as any)?.items || (source as any)?.data
      if (Array.isArray(maybeRows)) return getActivitySummaryLines(maybeRows)
      const text = String(
        (source as any).activity ||
        (source as any).descripcion ||
        (source as any).description ||
        (source as any).nombre ||
        (source as any).name ||
        ''
      ).trim()
      return text ? [text] : ['Sin actividades']
    }

    return ['Sin actividades']
  }

  const getReportResponsibleLabel = (r: any): string => {
    const parts = getReportResponsibleParts(r)
    const labels: string[] = []
    if (parts.supervisor) labels.push(`Supervisor: ${parts.supervisor}`)
    if (parts.capataz) labels.push(`Capataz: ${parts.capataz}`)
    return labels.join(' | ')
  }

  const getReportResponsibleParts = (r: any): { supervisor: string; capataz: string } => {
    const fallback = String(reportResponsibleFallbacks[String(r?.id || '')] || '').trim()
    const splitNames = (value: any) =>
      String(value || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    const readIds = (...values: any[]): string[] => {
      const out: string[] = []
      values.forEach((value) => {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            const id = String(item || '').trim()
            if (id) out.push(id)
          })
          return
        }
        if (value == null || value === '') return
        if (typeof value === 'string') {
          const raw = value.trim()
          if (!raw) return
          if (raw.startsWith('[') || raw.startsWith('{')) {
            try {
              const parsed = JSON.parse(raw)
              if (Array.isArray(parsed)) {
                parsed.forEach((item) => {
                  const id = String(item || '').trim()
                  if (id) out.push(id)
                })
                return
              }
            } catch {}
          }
          raw
            .split(/[;,]/)
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .forEach((id) => out.push(id))
          return
        }
        const id = String(value || '').trim()
        if (id) out.push(id)
      })
      return out
    }
    const uniq = (values: string[]) => Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)))
    const namesFromIds = (ids: string[]) =>
      uniq(ids.map((id) => String(collaboratorNameById[String(id)] || '').trim()).filter(Boolean))
    const nameKey = (value: any) => normalizeText(String(value || '')).trim()
    const positionByNameKey = new Map<string, string>()
    Object.values(collaboratorMap || {}).forEach((person: any) => {
      const key = nameKey(person?.name)
      const position = String(person?.position || '').trim()
      if (key && position && !positionByNameKey.has(key)) positionByNameKey.set(key, position)
    })
    const formatWithPosition = (name: string, position?: string) => {
      const cleanName = String(name || '').trim()
      const cleanPosition = String(position || '').trim()
      if (!cleanName) return ''
      if (!cleanPosition) return cleanName
      return `${cleanName} - ${cleanPosition.toUpperCase()}`
    }
    const withPositionFromName = (names: string[]) =>
      uniq(
        names.map((name) => {
          const position = positionByNameKey.get(nameKey(name)) || ''
          return formatWithPosition(name, position)
        })
      )
    const withPositionFromIds = (ids: string[]) =>
      uniq(
        ids.map((id) => {
          const cleanId = String(id || '').trim()
          if (!cleanId) return ''
          const name = String(collaboratorNameById[cleanId] || '').trim()
          const position = String((collaboratorMap as any)?.[cleanId]?.position || '').trim()
          return formatWithPosition(name, position)
        }).filter(Boolean)
      )

    const supervisorPrimary = uniq(
      splitNames(r?.supervisor)
        .concat(splitNames(r?.supervisor_name))
        .concat(splitNames(r?.supervisor_display_name))
    )
    const capatazPrimary = uniq(
      splitNames(r?.capataz)
        .concat(splitNames(r?.capataz_name))
        .concat(splitNames(r?.foreman))
    )
    const supervisorByIdNames = namesFromIds(
      readIds(r?.supervisor_id, r?.supervisor_ids, r?.supervisors)
    )
    const capatazByIdNames = namesFromIds(
      readIds(r?.capataz_id, r?.capataz_ids, r?.foreman_id, r?.foreman_ids, r?.foremen)
    )
    const supervisorById = withPositionFromIds(
      readIds(r?.supervisor_id, r?.supervisor_ids, r?.supervisors)
    )
    const capatazById = withPositionFromIds(
      readIds(r?.capataz_id, r?.capataz_ids, r?.foreman_id, r?.foreman_ids, r?.foremen)
    )

    const fallbackSupervisor = (() => {
      if (!fallback) return []
      const match = fallback.match(/Supervisor:\s*([^|]+)/i)
      return match?.[1] ? splitNames(match[1]) : []
    })()
    const fallbackCapataz = (() => {
      if (!fallback) return []
      const match = fallback.match(/Capataz:\s*([^|]+)/i)
      return match?.[1] ? splitNames(match[1]) : []
    })()

    const dedupeByNameKeepBest = (values: string[]) => {
      const byName = new Map<string, string>()
      values.forEach((value) => {
        const clean = String(value || '').trim()
        if (!clean) return
        const namePart = clean.split(/\s-\s/, 1)[0]?.trim() || clean
        const key = normalizeText(namePart)
        if (!key) return
        const prev = byName.get(key)
        if (!prev || (prev === namePart && clean !== namePart)) {
          byName.set(key, clean)
        }
      })
      return Array.from(byName.values())
    }

    const supervisorName = dedupeByNameKeepBest([
      ...withPositionFromName(supervisorPrimary),
      ...withPositionFromName(supervisorByIdNames),
      ...supervisorById,
      ...fallbackSupervisor
    ]).join(', ')
    const capatazName = dedupeByNameKeepBest([
      ...withPositionFromName(capatazPrimary),
      ...withPositionFromName(capatazByIdNames),
      ...capatazById,
      ...fallbackCapataz
    ]).join(', ')

    return { supervisor: supervisorName, capataz: capatazName }
  }

  const getReportCrewLabel = (r: any): string => {
    const crewIds = Array.isArray(r?.crew_ids) ? r.crew_ids.map((id: any) => String(id)) : []
    if (crewIds.length > 0) {
      const names = crewIds
        .map((id: string) => crews.find((c) => String(c.id) === String(id))?.name)
        .filter(Boolean) as string[]
      if (names.length > 0) return names.join(', ')
    }
    if (r?.crew_name) return String(r.crew_name)
    if (r?.crew_id) {
      const name = crews.find((c) => String(c.id) === String(r.crew_id))?.name
      if (name) return name
    }
    return '-'
  }

  const getCrewSortParts = (value: any) => {
    const raw = String(value || '').trim()
    const normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
    const match = normalized.match(/^CUADRILLA\s*(\d+)\s+(.+)$/i)
    if (!match) return { base: normalized || 'ZZZ', number: Number.MAX_SAFE_INTEGER, raw: normalized }
    return {
      base: String(match[2] || '').trim(),
      number: Number(match[1] || 0) || 0,
      raw: normalized
    }
  }

  const compareReportsByCrewLabel = (a: any, b: any) => {
    const labelA = getReportCrewLabel(a)
    const labelB = getReportCrewLabel(b)
    const firstA = String(labelA || '').split(',')[0]?.trim() || ''
    const firstB = String(labelB || '').split(',')[0]?.trim() || ''
    const sortA = getCrewSortParts(firstA)
    const sortB = getCrewSortParts(firstB)
    const byBase = sortA.base.localeCompare(sortB.base, 'es', { numeric: true, sensitivity: 'base' })
    if (byBase !== 0) return byBase
    if (sortA.number !== sortB.number) return sortA.number - sortB.number
    const byRaw = sortA.raw.localeCompare(sortB.raw, 'es', { numeric: true, sensitivity: 'base' })
    if (byRaw !== 0) return byRaw
    return String(b?.created_at || '').localeCompare(String(a?.created_at || ''))
  }

  const exportCrewOptions = useMemo(() => {
    const map = new Map<string, string>()
    ;(reports || []).forEach((r: any) => {
      const ids = Array.isArray(r?.crew_ids)
        ? r.crew_ids.map((x: any) => String(x)).filter(Boolean)
        : []
      if (ids.length > 0) {
        ids.forEach((id: string) => {
          const nameFromCrewList = crews.find((c) => String(c.id) === id)?.name
          const fallbackName = ids.length === 1 ? (r?.crew_name || '') : ''
          const label = String(nameFromCrewList || fallbackName || id)
          if (!map.has(id)) map.set(id, label)
        })
        return
      }
      if (r?.crew_id) {
        const id = String(r.crew_id)
        const nameFromCrewList = crews.find((c) => String(c.id) === id)?.name
        const label = String(nameFromCrewList || r?.crew_name || id)
        if (!map.has(id)) map.set(id, label)
      }
    })
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))
  }, [reports, crews])

  const reportMatchesUserSpecialty = useCallback((reportSpecialty: any) => {
    if (!isUserRole) return true
    const userSpec = normalizeText(String((session?.user as any)?.specialty || ''))
    if (!userSpec) return true
    const raw = normalizeText(String(reportSpecialty || ''))
    if (!raw) return true
    const tokens = raw.split(/[,;/|]+/).map((x) => normalizeText(x)).filter(Boolean)
    if (tokens.includes(userSpec)) return true
    return raw.includes(userSpec) || userSpec.includes(raw)
  }, [isUserRole, session?.user])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  // Obtener reportes desde la API
	  const fetchReports = async (options?: { force?: boolean }) => {
	    const force = options?.force === true
	    if (force) {
	      fieldReportsSummaryCache = null
	      fieldReportsSummaryInFlight = null
	      fetchReportsLoadedOnceRef.current = false
	      dateDetailsInFlightRef.current.clear()
	      setDateDetailsLoadedByDate({})
	      setDateDetailsLoadingByDate({})
	    }
	    if (!force && fetchReportsLoadedOnceRef.current) {
	      return
	    }
	    if (!force && fieldReportsSummaryCache) {
	      setReportsLoading(false)
	      setReportsLoadError('')
	      setReports(fieldReportsSummaryCache)
	      fetchReportsLoadedOnceRef.current = true
	      fetchReportsDoneAtRef.current = nowMs()
	      return
	    }
	    setReportsLoading(true)
	    setReportsLoadError('')
	    const startedAt = nowMs()
	    fetchReportsStartedAtRef.current = startedAt
	    fetchReportsDoneAtRef.current = null
	    perfRequestCountByScopeRef.current['initial-load'] = 0
	    perfMark('fr-initial-fetch-start')
	    try {
	      initialLoadExtraRequestsRef.current = 0
	      if (!fetchReportsInFlightRef.current && !fieldReportsSummaryInFlight) {
	        perfCountRequest('initial-load', '/api/field-reports?summary=1&slim=1')
	        fieldReportsSummaryInFlight = (async () => {
	          const res = await fetch('/api/field-reports?summary=1&slim=1')
	          if (!res.ok) throw new Error(`No se pudieron cargar los reportes (${res.status})`)
	          const data = await res.json()
	          return Array.isArray(data) ? data : []
	        })()
	      }
	      fetchReportsInFlightRef.current = fetchReportsInFlightRef.current || fieldReportsSummaryInFlight
	      const data = await fetchReportsInFlightRef.current
	      perfMark('fr-initial-fetch-response')
	      fieldReportsSummaryCache = data || []
	      setReports(data || [])
	      fetchReportsLoadedOnceRef.current = true
	      fetchReportsDoneAtRef.current = nowMs()
	    } catch (e) {
	      setReports([])
	      setReportsLoadError(e instanceof Error ? e.message : 'No se pudieron cargar los reportes')
	      console.warn('No se pudieron obtener los reportes', e)
	      fetchReportsDoneAtRef.current = nowMs()
	    } finally {
	      fetchReportsInFlightRef.current = null
	      fieldReportsSummaryInFlight = null
	      setReportsLoading(false)
	    }
	  }

  const loadReportsForDate = useCallback(async (dateKey: string) => {
    const safeDate = String(dateKey || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) return []
    if (dateDetailsLoadedByDate[safeDate]) {
      return (reports || []).filter((r: any) => String(r?.date || '').slice(0, 10) === safeDate)
    }
    const existing = dateDetailsInFlightRef.current.get(safeDate)
    if (existing) return existing

    setDateDetailsLoadingByDate((prev) => ({ ...prev, [safeDate]: true }))
    const promise = (async () => {
      perfCountRequest('date-expand', `/api/field-reports?summary=1&date=${safeDate}&limit=200`)
      const res = await fetch(`/api/field-reports?summary=1&date=${encodeURIComponent(safeDate)}&limit=200`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`No se pudieron cargar reportes de ${safeDate}`)
      const data = await res.json()
      const rows = Array.isArray(data) ? data : []
      setReports((prev) => {
        const byId = new Map(rows.map((row: any) => [String(row?.id || ''), row]))
        let insertedDateRows = false
        const next = (prev || []).map((row: any) => {
          const rowDate = String(row?.date || '').slice(0, 10)
          const id = String(row?.id || '')
          if (rowDate !== safeDate) return row
          if (byId.has(id)) {
            const full = byId.get(id)
            byId.delete(id)
            return full
          }
          return row
        })
        if (byId.size > 0) {
          insertedDateRows = true
          next.push(...(Array.from(byId.values()) as FieldReport[]))
        }
        return insertedDateRows
          ? next.sort((a: any, b: any) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))
          : next
      })
      rows.forEach((row: any) => {
        if (row?.id && isReportHydrationPayloadReady(row)) rememberFieldReportDetail(row)
      })
      setDateDetailsLoadedByDate((prev) => ({ ...prev, [safeDate]: true }))
      return rows
    })()
      .catch((err) => {
        console.warn('No se pudieron cargar reportes por fecha', err)
        showSnackbar('No se pudo cargar el detalle de reportes para la fecha', 'warning')
        return []
      })
      .finally(() => {
        dateDetailsInFlightRef.current.delete(safeDate)
        setDateDetailsLoadingByDate((prev) => ({ ...prev, [safeDate]: false }))
      })

    dateDetailsInFlightRef.current.set(safeDate, promise)
    return promise
  }, [dateDetailsLoadedByDate, reports, perfCountRequest, rememberFieldReportDetail])

	  const loadCollaboratorsCached = useCallback(async () => {
      const dateKey = String(reportDate || '').slice(0, 10)
	    if (!dateKey && collaboratorsCacheRef.current) {
	      return collaboratorsCacheRef.current
	    }
	    if (!dateKey && collaboratorsSummaryCache) {
	      collaboratorsCacheRef.current = collaboratorsSummaryCache
	      return collaboratorsSummaryCache
	    }
	    if (!dateKey && collaboratorsInFlightRef.current) {
	      return collaboratorsInFlightRef.current
	    }
	    if (!dateKey && collaboratorsSummaryInFlight) {
	      collaboratorsInFlightRef.current = collaboratorsSummaryInFlight
	      const out = await collaboratorsInFlightRef.current
	      collaboratorsInFlightRef.current = null
	      return out
	    }
	    if (modalOpenMetricsRef.current) modalOpenMetricsRef.current.requests += 1
	    perfCountRequest('modal-open', dateKey ? `/api/collaborators?summary=1&as_of_date=${dateKey}` : '/api/collaborators?summary=1')
    const out = await fetchCollaboratorsSummaryOnce(dateKey)
    if (!dateKey && Array.isArray(out)) collaboratorsCacheRef.current = out
    return out
	  }, [reportDate])

	  const loadCrewsCached = useCallback(async () => {
	    if (crewsCacheRef.current && crewsCacheRef.current.length > 0) {
	      return crewsCacheRef.current
	    }
	    if (crewsSummaryCache && crewsSummaryCache.length > 0) {
	      crewsCacheRef.current = crewsSummaryCache
	      return crewsSummaryCache
	    }
	    if (crewsInFlightRef.current) {
	      return crewsInFlightRef.current
	    }
	    if (crewsSummaryInFlight) {
	      crewsInFlightRef.current = crewsSummaryInFlight
	      const out = await crewsInFlightRef.current
	      crewsInFlightRef.current = null
	      return out
	    }
	    if (modalOpenMetricsRef.current) modalOpenMetricsRef.current.requests += 1
	    perfCountRequest('modal-open', '/api/crews?summary=1')
    crewsInFlightRef.current = fetchCrewsSummaryOnce()
    const out = await crewsInFlightRef.current
    if (Array.isArray(out)) crewsCacheRef.current = out
    crewsInFlightRef.current = null
    return out
	  }, [])

  const mergeCollaboratorSummaryRows = useCallback((rows: any[]) => {
    const buildPersonName = (person: any) => {
      const full = `${String(person?.first_name || '').trim()} ${String(person?.last_name || '').trim()}`.replace(/\s+/g, ' ').trim()
      return full || String(person?.name || '').trim()
    }
    const collaboratorNameObj: Record<string, string> = {}
    const collaboratorMetaById: Record<string, { name: string; position: string; document?: string }> = {}
    ;(Array.isArray(rows) ? rows : []).forEach((person: any) => {
      const id = String(person?.id || '').trim()
      const name = buildPersonName(person)
      if (id && name) collaboratorNameObj[id] = name
      const userId = String(person?.user_id || '').trim()
      const collaboratorId = String(person?.collaborator_id || '').trim()
      const position = String(person?.position || person?.posicion || '').trim()
      const document = String(person?.document || '').trim()
      const meta = { name: name || id || userId || collaboratorId, position, document: document || undefined }
      if (id) collaboratorMetaById[id] = meta
      if (userId) collaboratorMetaById[userId] = meta
      if (collaboratorId) collaboratorMetaById[collaboratorId] = meta
    })
    setCollaboratorNameById((prev) => ({ ...prev, ...collaboratorNameObj }))
    setCollaboratorMap((prev) => ({ ...prev, ...collaboratorMetaById }))
  }, [])

  const ensurePendingCrewContextForDate = useCallback((dateKey: string) => {
    const safeDate = String(dateKey || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) return Promise.resolve()
    if (pendingCrewContextDates.has(safeDate)) return Promise.resolve()
    const existing = pendingCrewContextInFlightRef.current.get(safeDate)
    if (existing) return existing

    const promise = (async () => {
      const [crewRows, collaboratorRows] = await Promise.all([
        loadCrewsCached(),
        fetchCollaboratorsSummaryOnce(safeDate)
      ])
      if (Array.isArray(crewRows)) setCrews(crewRows)
      if (Array.isArray(collaboratorRows)) mergeCollaboratorSummaryRows(collaboratorRows)
      setPendingCrewContextDates((prev) => {
        if (prev.has(safeDate)) return prev
        const next = new Set(prev)
        next.add(safeDate)
        return next
      })
    })()
      .catch((err) => {
        console.warn('Could not load pending crew context', err)
      })
      .finally(() => {
        pendingCrewContextInFlightRef.current.delete(safeDate)
      })

    pendingCrewContextInFlightRef.current.set(safeDate, promise)
    return promise
  }, [loadCrewsCached, mergeCollaboratorSummaryRows, pendingCrewContextDates])

	  const loadCrewFullCached = useCallback(async (crewId: string, options?: { force?: boolean }) => {
	    const id = String(crewId || '').trim()
	    if (!id) return null
	    const force = !!options?.force
	    if (force) {
	      crewFullCacheRef.current.delete(id)
	      crewFullInFlightRef.current.delete(id)
	    }
	    if (!force && crewFullCacheRef.current.has(id)) {
	      return crewFullCacheRef.current.get(id) || null
	    }
	    const inFlight = crewFullInFlightRef.current.get(id)
	    if (!force && inFlight) {
	      return inFlight
	    }
	    if (modalOpenMetricsRef.current) modalOpenMetricsRef.current.requests += 1
	    perfCountRequest('modal-open', `/api/crews/${id}/full`)
	    const p = (async () => {
	      const url = force
	        ? `/api/crews/${encodeURIComponent(id)}/full?_=${Date.now()}`
	        : `/api/crews/${encodeURIComponent(id)}/full`
	      const res = await fetch(url, force ? { cache: 'no-store' } : undefined)
	      if (!res.ok) return null
	      const data = await res.json()
	      crewFullCacheRef.current.set(id, data)
      return data
    })()
    crewFullInFlightRef.current.set(id, p)
    try {
      return await p
    } finally {
      crewFullInFlightRef.current.delete(id)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [])

  useEffect(() => {
    if (!Array.isArray(reports) || reports.length === 0) {
      setReportResponsibleFallbacks((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      return
    }
    const expandedDateSet = new Set(
      Object.entries(collapsedDateGroups || {})
        .filter(([, collapsed]) => collapsed === false)
        .map(([date]) => String(date || '').slice(0, 10))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    )
    const modalDate = open ? String(selectedReport?.date || reportDate || '').slice(0, 10) : ''
    const shouldIncludeDate = (date: string) =>
      expandedDateSet.has(date) || (/^\d{4}-\d{2}-\d{2}$/.test(modalDate) && date === modalDate)
    const relevantReports = reports.filter((report: any) => {
      const dateKey = String(report?.date || report?.report_date || '').slice(0, 10)
      return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && shouldIncludeDate(dateKey)
    })
    if (relevantReports.length === 0) return
    const relevantDates = Array.from(new Set(
      relevantReports
        .map((report: any) => String(report?.date || report?.report_date || '').slice(0, 10))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    ))
    let cancelled = false
    const readIds = (...values: any[]) => values.flatMap((value) => {
      if (Array.isArray(value)) return value
      if (value == null || value === '') return []
      return [value]
    }).map((value) => String(value || '').trim()).filter(Boolean)
    const getCrewIdsForReport = (report: any) => Array.from(new Set(readIds(report?.crew_ids, report?.crew_id)))
    const buildPersonName = (person: any) => {
      const full = `${String(person?.first_name || '').trim()} ${String(person?.last_name || '').trim()}`.replace(/\s+/g, ' ').trim()
      return full || String(person?.name || '').trim()
    }
    ;(async () => {
      try {
        const [crewRows, collaboratorRowsByDate] = await Promise.all([
          loadCrewsCached(),
          Promise.all(relevantDates.map((date) => fetchCollaboratorsSummaryOnce(date)))
        ])
        const collaboratorRows = collaboratorRowsByDate.flatMap((rows) => Array.isArray(rows) ? rows : [])
        if (cancelled) return
        if (Array.isArray(crewRows)) setCrews(crewRows)
        mergeCollaboratorSummaryRows(collaboratorRows)
        const crewById = new Map<string, any>()
        ;(Array.isArray(crewRows) ? crewRows : []).forEach((crew: any) => {
          const id = String(crew?.id || '').trim()
          if (id) crewById.set(id, crew)
        })
        const collaboratorNameById = new Map<string, string>()
        const collaboratorMetaById: Record<string, { name: string; position: string; document?: string }> = {}
        ;(Array.isArray(collaboratorRows) ? collaboratorRows : []).forEach((person: any) => {
          const id = String(person?.id || '').trim()
          const name = buildPersonName(person)
          if (id && name) collaboratorNameById.set(id, name)
          const userId = String(person?.user_id || '').trim()
          const collaboratorId = String(person?.collaborator_id || '').trim()
          const position = String(person?.position || person?.posicion || '').trim()
          const document = String(person?.document || '').trim()
          const meta = { name: name || id || userId || collaboratorId, position, document: document || undefined }
          if (id) collaboratorMetaById[id] = meta
          if (userId) collaboratorMetaById[userId] = meta
          if (collaboratorId) collaboratorMetaById[collaboratorId] = meta
        })
        const collaboratorNameObj: Record<string, string> = {}
        collaboratorNameById.forEach((name, id) => { collaboratorNameObj[id] = name })
        setCollaboratorNameById((prev) => ({ ...prev, ...collaboratorNameObj }))
        setCollaboratorMap((prev) => ({ ...prev, ...collaboratorMetaById }))
        const next: Record<string, string> = {}
        relevantReports.forEach((report: any) => {
          const reportId = String(report?.id || '').trim()
          if (!reportId) return
          const supervisorNames: string[] = []
          const capatazNames: string[] = []
          const pushNameById = (id: string, target: string[]) => {
            const name = collaboratorNameById.get(String(id || '').trim())
            if (name && !target.includes(name)) target.push(name)
          }
          getCrewIdsForReport(report).forEach((crewId) => {
            const crew = crewById.get(crewId)
            if (!crew) return
            readIds(crew?.supervisors, crew?.supervisor).forEach((id) => {
              pushNameById(id, supervisorNames)
            })
            readIds(crew?.foremen, crew?.foreman).forEach((id) => {
              pushNameById(id, capatazNames)
            })
          })
          // Fallback directo desde el reporte (cuando summary trae ids y no texto)
          readIds(report?.supervisor_id, report?.supervisor_ids, report?.supervisors).forEach((id) => {
            pushNameById(id, supervisorNames)
          })
          readIds(report?.capataz_id, report?.capataz_ids, report?.foreman_id, report?.foreman_ids, report?.foremen).forEach((id) => {
            pushNameById(id, capatazNames)
          })
          const parts: string[] = []
          if (supervisorNames.length > 0) parts.push(`Supervisor: ${supervisorNames.join(', ')}`)
          if (capatazNames.length > 0) parts.push(`Capataz: ${capatazNames.join(', ')}`)
          if (parts.length > 0) next[reportId] = parts.join(' | ')
        })
        if (cancelled) return
        setReportResponsibleFallbacks((prev) => {
          const prevKeys = Object.keys(prev)
          const nextKeys = Object.keys(next)
          if (
            prevKeys.length === nextKeys.length &&
            nextKeys.every((key) => prev[key] === next[key])
          ) {
            return prev
          }
          return next
        })
      } catch {
        if (!cancelled) {
          setReportResponsibleFallbacks((prev) => (Object.keys(prev).length === 0 ? prev : {}))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reports, collapsedDateGroups, open, selectedReport?.date, reportDate, loadCrewsCached, mergeCollaboratorSummaryRows])

  // Real-time subscription: escuchar INSERT/UPDATE/DELETE en pr_field_reports
  useEffect(() => {
    if (!supabase || !session?.user?.companyId) return

    const companyFilter = `company_id=eq.${session.user.companyId}`
    const channel = supabase.channel('public:pr_field_reports')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pr_field_reports', filter: companyFilter }, (payload) => {
        const n = payload.new as unknown as FieldReport
        fieldReportsSummaryCache = null
        if (String((payload.new as any).company_id) === String(session.user.companyId)) {
          if (!reportMatchesUserSpecialty((payload.new as any).specialty)) return
          setReports((prev) => {
            if (prev.some((r) => r.id === n.id)) return prev
            return [n, ...prev]
          })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pr_field_reports', filter: companyFilter }, (payload) => {
        const n = payload.new as unknown as FieldReport
        fieldReportsSummaryCache = null
        setReports((prev) => {
          if (!reportMatchesUserSpecialty((payload.new as any).specialty)) {
            return prev.filter((r) => r.id !== n.id)
          }
          return prev.map(r => (r.id === n.id ? n : r))
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pr_field_reports', filter: companyFilter }, (payload) => {
        const old = payload.old
        fieldReportsSummaryCache = null
        setReports((prev) => prev.filter(r => r.id !== old.id))
      })
      .subscribe()

    return () => {
      try { channel.unsubscribe() } catch (e) {}
    }
  }, [session?.user?.companyId, reportMatchesUserSpecialty])

  // Real-time subscription: mantener cuadrillas pendientes actualizadas sin abrir/cerrar modal
  useEffect(() => {
    if (!supabase || !session?.user?.companyId) return
    if (!open && pendingCrewContextDates.size === 0) return
    let cancelled = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const refreshCrews = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(async () => {
        crewsSummaryCache = null
        crewsSummaryInFlight = null
        crewsCacheRef.current = null
        crewsInFlightRef.current = null
        crewFullCacheRef.current.clear()
        crewFullInFlightRef.current.clear()
        try {
          const rows = await loadCrewsCached()
          if (!cancelled && Array.isArray(rows)) setCrews(rows)
        } catch (e) {
          console.warn('Could not refresh crews after realtime event', e)
        }
      }, 250)
    }

    const companyFilter = `company_id=eq.${session.user.companyId}`
    const channel = supabase.channel('public:pr_crews')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pr_crews', filter: companyFilter }, refreshCrews)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pr_crews', filter: companyFilter }, refreshCrews)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pr_crews', filter: companyFilter }, refreshCrews)
      .subscribe()

    return () => {
      cancelled = true
      if (refreshTimer) clearTimeout(refreshTimer)
      try { channel.unsubscribe() } catch (e) {}
    }
  }, [session?.user?.companyId, loadCrewsCached, open, pendingCrewContextDates.size])

  useEffect(() => {
    if (!open || !selectedReport || !isAdminRole) return
    if (FIELD_REPORTS_DEV_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][admin] personal summary', {
        reportId: selectedReport.id,
        assignedActivitiesCount: Array.isArray(assignedActivities) ? assignedActivities.length : 0,
        crewMembersCount: Array.isArray(crewMembers) ? crewMembers.length : 0,
        personnelCount: Array.isArray(personnel) ? personnel.length : 0,
        personHoursKeys: Object.keys(personHours || {}).length,
      })
    }
  }, [open, selectedReport, isAdminRole, assignedActivities, crewMembers, personnel, personHours])

  // Cuando abrimos el modal con un reporte seleccionado, precargar los campos
  useEffect(() => {
    if (!open && !pendingOpenAfterFormApplyRef.current) return
    const sessionId = reportModalSessionRef.current
    if (!selectedReport) {
      // nuevo reporte: resetear campos
      setReportHydrating(false)
      setHydratedReportId(null)
      setSelectedReportHydrationStatus('ready')
      setSelectedReportHydrationError(null)
      setV2StateReady(true)
      setV2StateReportId(null)
      setReportDesignVersion('V2')
      setEmittedById('')
      setReportDate(new Date().toISOString().slice(0, 10))
      setSupervisor('')
      setCapataz('')
      setSpecialty('')
      setWorkFront('')
      setReportCrewIds([])
      setTurno('Dia')
      setArea('')
      setAreaAssignmentMode('global')
      setPersonAreaById({})
      setStartTime('')
      setEndTime('')
      setAssignedActivities([])
      setPersonnel([])
      setPersonHours({})
      setPersonExtraHours({})
      setEquipmentEntries([])
      setEquipmentHours({})
      setMaterialEntries([])
      setMaterialQuantities({})
      setActivityObservations({})
      setGeneralEventsAnswers(Array.from({ length: GENERAL_EVENTS_QUESTIONS.length }).map(() => 'no'))
      setGeneralEventsComments(Array.from({ length: GENERAL_EVENTS_QUESTIONS.length }).map(() => ''))
      setWeather({ sunny: false, cloudy: false, rain: false, snow: false })
      setPersonalReady(false)
      return
    }

    if (
      selectedReport?.id &&
      selectedReport?.__fullLoaded &&
      selectedReportHydrationStatus === 'ready' &&
      hydratedReportId === String(selectedReport.id) &&
      v2StateReportId === String(selectedReport.id) &&
      v2StateReady
    ) {
      return
    }

    const pendingOpen = pendingOpenAfterFormApplyRef.current
    const isApplyingBeforeOpen = Boolean(
      pendingOpen &&
      selectedReport?.id &&
      selectedReport?.__fullLoaded &&
      String(selectedReport.id) === pendingOpen.reportId
    )

    if (!isApplyingBeforeOpen) {
      setReportHydrating(true)
      setSelectedReportHydrationStatus('loading')
      setSelectedReportHydrationError(null)
      setV2StateReady(false)
      setV2StateReportId(null)
    }
    setPersonalReady(false)

    const normalizeJson = (val: any) => {
      if (typeof val !== 'string') return val
      try { return JSON.parse(val) } catch { return val }
    }

    const normalizeToArray = (val: any): any[] => {
      const parsed = normalizeJson(val)
      if (!parsed) return []
      if (Array.isArray(parsed)) return parsed
      if (typeof parsed === 'object') {
        const obj = parsed as Record<string, any>
        if (Array.isArray(obj.rows)) return obj.rows
        if (Array.isArray(obj.items)) return obj.items
        if (Array.isArray(obj.data)) return obj.data
        const values = Object.values(obj)
        const flatArrays = values.filter((v) => Array.isArray(v)).flat()
        if (flatArrays.length > 0) return flatArrays
        if (values.length > 0 && values.every((v) => v && typeof v === 'object' && !Array.isArray(v))) return values
      }
      return []
    }

    const getReportCrewIdsFromRecord = (r: any, assignmentsForRecord?: any[]) => {
      if (Array.isArray(r?.crew_ids) && r.crew_ids.length > 0) {
        return Array.from(new Set(r.crew_ids.map((id: any) => String(id)).filter(Boolean))) as string[]
      }
      if (Array.isArray(assignmentsForRecord) && assignmentsForRecord.length > 0) {
        return Array.from(new Set(assignmentsForRecord.map((a: any) => String(a.crewId || a.crew_id || '')).filter(Boolean))) as string[]
      }
      if (r?.crew_id) return [String(r.crew_id)]
      return []
    }

    const applyReportToForm = (r: any) => {
      if (process.env.NODE_ENV !== 'production') {
        const fullPersonHours = normalizeJson(r?.person_hours)
        const fullPersonHoursObj = (fullPersonHours && typeof fullPersonHours === 'object' && !Array.isArray(fullPersonHours))
          ? (fullPersonHours as Record<string, any>)
          : {}
        const fullPersonHoursNoExtras = { ...fullPersonHoursObj }
        delete (fullPersonHoursNoExtras as any).__extras
        const sourceTotalHours = Object.values(fullPersonHoursNoExtras).reduce((acc: number, value: any) => {
          if (!Array.isArray(value)) return acc
          return acc + value.reduce((sum: number, n: any) => sum + (Number(n) || 0), 0)
        }, 0)
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
          event: 'apply-report-to-form-start',
          reportId: String(r?.id || ''),
          sourceDirectRowsCount: Array.isArray(normalizeToArray(r?.v2_detail_direct_rows)) ? normalizeToArray(r?.v2_detail_direct_rows).length : 0,
          sourceTotalHours: sourceTotalHours
        })
      }
      setReportDesignVersion('V2')
      setEmittedById(String(r?.emitted_by_id || r?.emitido_por_id || r?.emittedById || '').trim())
      const assignments = normalizeToArray(r.assignments)
      const activities = normalizeToArray(r.activities)
      const personnel = normalizeJson(r.personnel)
      const personHours = normalizeJson(r.person_hours)
      const personHoursObj = (personHours && typeof personHours === 'object' && !Array.isArray(personHours))
        ? (personHours as Record<string, any>)
        : {}
      const extraRaw = (personHoursObj && typeof personHoursObj.__extras === 'object' && personHoursObj.__extras)
        ? (personHoursObj.__extras as Record<string, any>)
        : {}
      const cleanedHours = { ...personHoursObj }
      delete (cleanedHours as any).__extras
      const equipmentEntries = normalizeJson(r.equipment_entries)
      const equipmentHours = normalizeJson(r.equipment_hours)
      const materialEntries = normalizeJson((r as any).material_entries)
      const materialQuantities = normalizeJson((r as any).material_quantities)
      const activityObs = normalizeJson(r.activity_observations)
      const generalAnswersRaw = normalizeJson(r.general_events_answers)
      const generalCommentsRaw = normalizeJson(r.general_events_comments)

      setReportDate(r.date || new Date().toISOString().slice(0, 10))
      setSupervisor(r.supervisor || r.supervisor_name || r.supervisor_display_name || '')
      setCapataz(r.capataz || r.capataz_name || r.foreman || '')
      setSpecialty(r.specialty || r.especialidad || r.discipline || '')
      setWorkFront(String(r?.work_front || r?.report_front || r?.front || '').trim())
      const ids = getReportCrewIdsFromRecord(r, assignments)
      setReportCrewIds(ids)
      setTurno(r.turno || 'Dia')
      setArea(r.area || '')
      setStartTime(r.start_time || '')
      setEndTime(r.end_time || '')
      const rawRows = (assignments.length > 0 ? assignments : activities) || []
      let normalizedRows = rawRows.map((a: any) => {
        const programQty = toNonNegativeNumber(a?.program_quantity ?? a?.programQuantity ?? a?.quantity ?? 0)
        const qty = toNonNegativeNumber(a?.quantity ?? 0)
        const executionDescription = String(a?.execution_description ?? a?.executionDescription ?? '').trim()
        const normalizedQty = programQty > 0 && qty > programQty ? programQty : qty
        return {
          ...a,
          program_quantity: programQty,
          quantity: normalizedQty,
          execution_description: executionDescription,
          time_classification: String(a?.time_classification || a?.timeClassification || '').trim(),
          time_reason: String(a?.time_reason || a?.timeReason || '').trim()
        }
      })
      // Fallback para reportes que guardaron actividades como texto plano/JSON no tabular
      // y no tienen filas explícitas en assignments/activities.
      if (normalizedRows.length === 0) {
        const rawActivities = normalizeJson(r.activities)
        const activityText =
          typeof rawActivities === 'string'
            ? rawActivities.trim()
            : (rawActivities && typeof rawActivities === 'object' && !Array.isArray(rawActivities))
              ? String((rawActivities as any)?.description || (rawActivities as any)?.activity || '').trim()
              : ''
        if (activityText) {
          normalizedRows = [{
            lineNumber: 1,
            activityId: 'legacy-activity-1',
            id: 'legacy-activity-1',
            activity: activityText,
            description: activityText,
            execution_description: '',
            time_classification: '',
            time_reason: '',
            quantity: 0,
            program_quantity: 0,
            unit: '',
            discipline: '',
            observations: ''
          }]
        }
      }
      setAssignedActivities(normalizedRows)
      setPersonnel(personnel || [])
      const personnelArray = Array.isArray(personnel) ? personnel : []
      const nextPersonAreaById = personnelArray.reduce((acc: Record<string, string>, p: any, idx: number) => {
        const personId = String(p?.id || p?.collaborator_id || p?.user_id || p?.name || `person-${idx}`)
        const rowArea = String(p?.area || '').trim()
        if (rowArea) acc[personId] = rowArea
        return acc
      }, {})
      setPersonAreaById(nextPersonAreaById)
      const hasIndividualPersonnelArea = Object.values(nextPersonAreaById).some((value) => value && value !== String(r.area || ''))
      const hasIndividualEquipArea = Array.isArray(equipmentEntries)
        ? equipmentEntries.some((entry: any) => String(entry?.area || '').trim() && String(entry?.area || '').trim() !== String(r.area || ''))
        : false
      setAreaAssignmentMode(hasIndividualPersonnelArea || hasIndividualEquipArea ? 'individual' : 'global')
      setPersonHours(cleanedHours || {})
      setPersonExtraHours(
        Object.fromEntries(
          Object.entries(extraRaw || {}).map(([k, v]) => [String(k), Number(v) || 0])
        )
      )
      setEquipmentEntries(equipmentEntries || [])
      setEquipmentHours(equipmentHours || {})
      setMaterialEntries(Array.isArray(materialEntries) ? materialEntries : [{}, {}, {}])
      setMaterialQuantities((materialQuantities && typeof materialQuantities === 'object' && !Array.isArray(materialQuantities)) ? materialQuantities : {})
      setActivityObservations((typeof activityObs === 'object' && activityObs !== null) ? activityObs : {})
      const nextAnswers = Array.from({ length: GENERAL_EVENTS_QUESTIONS.length }).map((_, idx) => {
        const val = Array.isArray(generalAnswersRaw) ? generalAnswersRaw[idx] : null
        return String(val || '').toLowerCase() === 'si' ? 'si' : 'no'
      }) as Array<'si' | 'no'>
      const nextComments = Array.from({ length: GENERAL_EVENTS_QUESTIONS.length }).map((_, idx) => {
        const val = Array.isArray(generalCommentsRaw) ? generalCommentsRaw[idx] : ''
        return String(val || '')
      })
      setGeneralEventsAnswers(nextAnswers)
      setGeneralEventsComments(nextComments)
      setRestrictions(String(r?.restrictions || r?.observations || '').trim())
      setPersonalReady(ids.length === 0)
      const directRowsCount = Array.isArray(personnel) ? personnel.length : 0
      const activityRowsCount = normalizedRows.length
      const directHoursTotal = Object.values(cleanedHours || {}).reduce((acc: number, value: any) => {
        if (!Array.isArray(value)) return acc
        return acc + value.reduce((sum: number, n: any) => sum + (Number(n) || 0), 0)
      }, 0)
      const fullDirectRowsCount = Array.isArray(normalizeToArray(r?.v2_detail_direct_rows)) ? normalizeToArray(r?.v2_detail_direct_rows).length : 0
      const fullIndirectRowsCount = Array.isArray(normalizeToArray(r?.v2_detail_indirect_rows)) ? normalizeToArray(r?.v2_detail_indirect_rows).length : 0
      const fullHoursTotal = Object.values(cleanedHours || {}).reduce((acc: number, value: any) => {
        if (!Array.isArray(value)) return acc
        return acc + value.reduce((sum: number, n: any) => sum + (Number(n) || 0), 0)
      }, 0)
      if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
          event: 'apply-report-to-form-done',
          reportId: String(r?.id || ''),
          preparedDirectRowsCount: Number(directRowsCount || 0),
          preparedTotalHours: Number(directHoursTotal || 0)
        })
      }
      return {
        directRowsCount,
        indirectRowsCount: fullIndirectRowsCount,
        activityRowsCount,
        preparedTotalHours: directHoursTotal,
        fullDirectRowsCount,
        fullIndirectRowsCount,
        fullTotalHours: fullHoursTotal,
        hasAnyV2Hours: directHoursTotal > 0
      }
      // load weather field if present in the record (supports object or string)
      try {
        const w = r.weather || r.condition || r.condicion_climatica || r.clima || r.conditions
        const parseFlag = (v: any) => {
          if (v === true || v === 1) return true
          if (v === false || v === 0) return false
          const s = String(v ?? '').trim().toLowerCase()
          if (s === 'true' || s === '1') return true
          if (s === 'false' || s === '0' || s === '') return false
          return false
        }
        const pick = (obj: any, ...keys: string[]) => {
          for (const k of keys) {
            if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k]
          }
          return undefined
        }
        if (!w) {
          setWeather({ sunny: false, cloudy: false, rain: false, snow: false })
        } else if (typeof w === 'object') {
          const parsed = {
            sunny: parseFlag(pick(w, 'sunny', 'soleado', 'sol')),
            cloudy: parseFlag(pick(w, 'cloudy', 'nublado')),
            rain: parseFlag(pick(w, 'rain', 'lluvia')),
            snow: parseFlag(pick(w, 'snow', 'nieve'))
          }
          setWeather(parsed)
        } else if (typeof w === 'string') {
          try {
            const parsedObj = JSON.parse(w)
            if (parsedObj && typeof parsedObj === 'object') {
              const parsed = {
                sunny: parseFlag(pick(parsedObj, 'sunny', 'soleado', 'sol')),
                cloudy: parseFlag(pick(parsedObj, 'cloudy', 'nublado')),
                rain: parseFlag(pick(parsedObj, 'rain', 'lluvia')),
                snow: parseFlag(pick(parsedObj, 'snow', 'nieve'))
              }
              setWeather(parsed)
            } else {
              const s = String(w).toLowerCase()
              const parsed = {
                sunny: s.includes('solead') || s.includes('sunny'),
                cloudy: s.includes('nub') || s.includes('cloud'),
                rain: s.includes('lluv') || s.includes('rain'),
                snow: s.includes('nieve') || s.includes('snow')
              }
              setWeather(parsed)
            }
          } catch {
            const s = String(w).toLowerCase()
            const parsed = {
              sunny: s.includes('solead') || s.includes('sunny'),
              cloudy: s.includes('nub') || s.includes('cloud'),
              rain: s.includes('lluv') || s.includes('rain'),
              snow: s.includes('nieve') || s.includes('snow')
            }
            setWeather(parsed)
          }
        } else {
          setWeather({ sunny: false, cloudy: false, rain: false, snow: false })
        }
      } catch {
        setWeather({ sunny: false, cloudy: false, rain: false, snow: false })
      }
    }

    let cancelled = false
    const loadSelected = async () => {
      let r: any = selectedReport
      try {
        if (selectedReport?.__historyPreview === true) {
          r = { ...selectedReport, __fullLoaded: true }
        }
        if (selectedReport?.id && !selectedReport?.__fullLoaded && selectedReport?.__historyPreview !== true) {
          const activeReportId = String(activeHydrationReportIdRef.current || '')
          if (activeReportId && activeReportId !== String(selectedReport.id || '')) return
          if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
              event: 'fetch-detail-start',
              reportId: String(selectedReport.id || '')
            })
          }
          if (modalOpenMetricsRef.current) modalOpenMetricsRef.current.requests += 1
          perfModalOpenDetailFetchStartedAtRef.current = nowMs()
          perfMark('fr-modal-open-detail-fetch-start')
          perfCountRequest('modal-open', `/api/field-reports?id=${String(selectedReport.id)}`)
          const res = await fetch(`/api/field-reports?id=${encodeURIComponent(String(selectedReport.id))}`)
          if (res.ok) {
            const full = await res.json()
            if (!cancelled && isCurrentReportModalSession(sessionId) && full && full.id) r = { ...full, __fullLoaded: true }
            if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
                event: 'fetch-detail-done',
                reportId: String(selectedReport.id || ''),
                ok: true
              })
            }
          } else {
            if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
                event: 'fetch-detail-done',
                reportId: String(selectedReport.id || ''),
                ok: false,
                status: res.status
              })
            }
            throw new Error(`No se pudo cargar detalle del reporte (${res.status})`)
          }
          perfModalOpenDetailFetchDoneAtRef.current = nowMs()
          perfMark('fr-modal-open-detail-fetch-done')
        }
      } catch (err: any) {
        if (cancelled || !isCurrentReportModalSession(sessionId)) return
        setSelectedReportHydrationStatus('error')
        setSelectedReportHydrationError(String(err?.message || 'No se pudo hidratar el reporte'))
        setReportHydrating(false)
        setHydratedReportId(null)
        setV2StateReady(false)
        setV2StateReportId(null)
        if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
            event: 'hydration-error',
            reportId: String(selectedReport?.id || ''),
            message: String(err?.message || '')
          })
        }
        return
      }
      if (cancelled || !isCurrentReportModalSession(sessionId)) {
        return
      }
      if (selectedReport?.id && String(activeHydrationReportIdRef.current || '') !== String(selectedReport.id || '')) {
        if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
            event: 'blocked-stale-effect',
            effectName: 'loadSelected-before-apply',
            selectedReportId: String(selectedReport?.id || ''),
            v2StateReportId: String(v2StateReportId || ''),
            reason: 'active-hydration-report-changed'
          })
        }
        return
      }
      if (!isReportHydrationPayloadReady(r)) {
        r = openReportFallbackRef.current || r
      }
      if (selectedReport?.id && !r?.__fullLoaded) {
        setSelectedReportHydrationStatus('error')
        setSelectedReportHydrationError('No se pudo cargar el detalle completo del reporte.')
        setReportHydrating(false)
        setHydratedReportId(null)
        setV2StateReady(false)
        setV2StateReportId(null)
        return
      }
      if (r?.id && r?.__fullLoaded) {
        setSelectedReport(r)
        if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
            event: 'selected-report-replaced-full',
            reportId: String(r?.id || '')
          })
        }
      }
      const fullDirectCount = Array.isArray(normalizeToArray(r?.v2_detail_direct_rows)) ? normalizeToArray(r?.v2_detail_direct_rows).length : 0
      const fullIndirectCount = Array.isArray(normalizeToArray(r?.v2_detail_indirect_rows)) ? normalizeToArray(r?.v2_detail_indirect_rows).length : 0
      const fullPersonHours = normalizeJson(r?.person_hours)
      const fullPersonHoursObj = (fullPersonHours && typeof fullPersonHours === 'object' && !Array.isArray(fullPersonHours))
        ? (fullPersonHours as Record<string, any>)
        : {}
      const fullPersonHoursNoExtras = { ...fullPersonHoursObj }
      delete (fullPersonHoursNoExtras as any).__extras
      const fullTotalHours = Object.values(fullPersonHoursNoExtras).reduce((acc: number, value: any) => {
        if (!Array.isArray(value)) return acc
        return acc + value.reduce((sum: number, n: any) => sum + (Number(n) || 0), 0)
      }, 0)
      if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
          event: 'prepare-v2-start',
          reportId: String(r?.id || ''),
          fullDirectCount,
          fullIndirectCount,
          fullTotalHours
        })
      }
      const prepared = applyReportToForm(r)
      if (!isCurrentReportModalSession(sessionId)) return
      if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
          event: 'prepare-v2-done',
          reportId: String(r?.id || ''),
          preparedDirectCount: Number(prepared?.directRowsCount || 0),
          preparedIndirectCount: Number(prepared?.indirectRowsCount || 0),
          preparedTotalHours: Number(prepared?.preparedTotalHours || 0),
          v2StateReady: false
        })
      }
      const markReady = () => {
        if (!isCurrentReportModalSession(sessionId)) return
        if (String(activeHydrationReportIdRef.current || '') !== String(r?.id || '')) {
          if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
              event: 'blocked-stale-effect',
              effectName: 'markReady',
              selectedReportId: String(selectedReport?.id || ''),
              v2StateReportId: String(v2StateReportId || ''),
              reason: 'active-hydration-report-mismatch'
            })
          }
          return
        }
        const hasMismatch =
          (Number(fullDirectCount) > 0 && Number(prepared?.directRowsCount || 0) === 0) ||
          (Number(fullTotalHours) > 0 && Number(prepared?.preparedTotalHours || 0) === 0)
        if (process.env.NODE_ENV !== 'production' && hasMismatch) {
          console.warn('[field-reports][modal][hydration][v2-mismatch]', {
            reportId: String(r?.id || ''),
            fullDirectCount: Number(fullDirectCount || 0),
            preparedDirectCount: Number(prepared?.directRowsCount || 0),
            fullTotalHours: Number(fullTotalHours || 0),
            preparedTotalHours: Number(prepared?.preparedTotalHours || 0)
          })
        }
        setV2StateReady(true)
        setV2StateReportId(String(r?.id || 'new'))
        setHydratedReportId(String(r?.id || 'new'))
        setSelectedReportHydrationStatus('ready')
        setSelectedReportHydrationError(null)
        setReportHydrating(false)
        const pendingOpen = pendingOpenAfterFormApplyRef.current
        if (
          pendingOpen &&
          String(pendingOpen.reportId || '') === String(r?.id || '') &&
          openSessionRef.current === pendingOpen.sessionId
        ) {
          pendingOpenAfterFormApplyRef.current = null
          setHeavyModalSectionsReady(true)
          setOpen(true)
          perfMark('fr-modal-open-set-open')
          setOpeningReportId(null)
          if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
              event: 'ready',
              reportId: String(r?.id || 'new'),
              hydratedSelectedReportId: String(r?.id || 'new')
            })
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][flow]', {
              event: 'open-ready',
              reportId: String(r?.id || ''),
              sessionId: pendingOpen.sessionId,
              open: true,
              v2StateReady: true,
              v2StateReportId: String(r?.id || ''),
              hydratedReportId: String(r?.id || ''),
              status: 'ready'
            })
          }
        }
        perfModalOpenHydrationDoneAtRef.current = nowMs()
        perfMark('fr-modal-open-hydration-done')
        if (process.env.NODE_ENV !== 'production') {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][hydration]', {
            event: 'ready',
            reportId: String(r?.id || 'new'),
            hydratedSelectedReportId: String(r?.id || 'new'),
            v2StateReady: true
          })
        }
      }
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(markReady)
      } else {
        setTimeout(markReady, 0)
      }
      if (process.env.NODE_ENV !== 'production' && modalOpenMetricsRef.current) {
        const endedAt = nowMs()
        const detailFetchMs = (
          perfModalOpenDetailFetchStartedAtRef.current != null &&
          perfModalOpenDetailFetchDoneAtRef.current != null
        ) ? Math.round(perfModalOpenDetailFetchDoneAtRef.current - perfModalOpenDetailFetchStartedAtRef.current) : 0
        const hydrationMs = perfModalOpenHydrationDoneAtRef.current != null
          ? Math.round(perfModalOpenHydrationDoneAtRef.current - modalOpenMetricsRef.current.startedAt)
          : 0
        perfPrintSummary('modal-open', {
          phase: 'hydration-done',
          reportId: modalOpenMetricsRef.current.id,
          detailFetchMs,
          hydrationMs,
          requestCount: modalOpenMetricsRef.current.requests,
          totalMs: Math.round(endedAt - modalOpenMetricsRef.current.startedAt)
        })
      }
    }

    loadSelected()
    return () => { cancelled = true }
  }, [open, selectedReport, editMode, v2StateReportId, selectedReportHydrationStatus, hydratedReportId, v2StateReady])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    // load crews when modal opens
    ;(async () => {
      try {
        const rows = await loadCrewsCached()
        if (!cancelled && Array.isArray(rows)) setCrews(rows)
      } catch (e) {
        console.warn('Could not load crews', e)
      }
    })()
    return () => { cancelled = true }
  }, [open, loadCrewsCached])

  useEffect(() => {
    if (!pendingCrewsModalOpen || !pendingCrewsModalDate) return
    void ensurePendingCrewContextForDate(pendingCrewsModalDate)
  }, [pendingCrewsModalOpen, pendingCrewsModalDate, ensurePendingCrewContextForDate])

  useEffect(() => {
    if (!open || !isAdminRole || !selectedReport) return
    let cancelled = false
    if (!editMode && Array.isArray(personnel) && personnel.length > 0) {
      // Si el reporte ya trae personal persistido, evitamos recargar crew full al abrir.
      setPersonalReady(true)
      return
    }
    const ids = Array.isArray(reportCrewIds) && reportCrewIds.length > 0
      ? reportCrewIds
      : (Array.isArray(selectedReport.crew_ids) && selectedReport.crew_ids.length > 0
          ? selectedReport.crew_ids.map(String)
          : (selectedReport.crew_id ? [String(selectedReport.crew_id)] : []))
    if (!ids || ids.length === 0) return
    ;(async () => {
      try {
        const firstId = String(ids[0] || '')
	        const full = await loadCrewFullCached(firstId, { force: !!editMode })
        const collabs = Array.isArray(full?.collaborators) ? full.collaborators : []
        const crewName = full?.crew?.name || crews.find((c: any) => String(c?.id) === firstId)?.name || ''
        const results = [collabs.map((c: any) => ({ ...c, crewName }))]
        if (cancelled) return
        const merged = results.flat().filter(Boolean) as any[]
        // dedupe by collaborator id
        const byId = new Map<string, any>()
        merged.forEach((c) => {
          const cid = String(c?.id || '')
          if (!cid) return
          if (!byId.has(cid)) byId.set(cid, c)
        })
        // sort by crew number then name
        const crewNumber = (name: string) => {
          const m = String(name || '').match(/(\d+)/)
          return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
        }
        const sorted = Array.from(byId.values()).sort((a: any, b: any) => {
          const na = crewNumber(a?.crewName || '')
          const nb = crewNumber(b?.crewName || '')
          if (na !== nb) return na - nb
          const ca = String(a?.crewName || '')
          const cb = String(b?.crewName || '')
          if (ca !== cb) return ca.localeCompare(cb, 'es')
          const nameA = `${a?.first_name || ''} ${a?.last_name || ''}`.trim()
          const nameB = `${b?.first_name || ''} ${b?.last_name || ''}`.trim()
          return nameA.localeCompare(nameB, 'es')
        })
        setCrewMembers(sorted)
        setPersonalReady(true)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [open, isAdminRole, selectedReport, reportCrewIds, loadCrewFullCached, crews, personnel, editMode])

  useEffect(() => {
    if (!open || !selectedReport) return
    // Existing reports must keep persisted personnel/hours snapshot.
    // Syncing from current crew members here can overwrite hydrated hours.
	    if (!editMode && selectedReport?.id && selectedReport?.__fullLoaded && selectedReportHydrationStatus === 'ready') return
    if (!editMode && selectedReport?.id && selectedReport?.__fullLoaded && Array.isArray(personnel) && personnel.length > 0) {
      return
    }
    if (!Array.isArray(crewMembers) || crewMembers.length === 0) return

    const capatazMembers = (crewMembers || []).filter((m: any) => isCapatazPosition(m?.position))
    const nonLeaderMembers = (crewMembers || []).filter((m: any) => !isLeaderPosition(m?.position))
    const orderedMembers = [...capatazMembers, ...nonLeaderMembers]
    const uniqueMembers = Array.from(
      new Map(
        orderedMembers.map((m: any, idx: number) => [
          String(
            m?.id ||
            m?.collaborator_id ||
            m?.user_id ||
            `${m?.first_name || ''} ${m?.last_name || ''}`.trim() ||
            `${idx}`
          ),
          m
        ])
      ).values()
    ).filter((m: any) => !isSupervisorLikePosition(m?.position))

    if (uniqueMembers.length === 0) return

    const previousRows = Array.isArray(personnel) ? personnel : []
    const personKeys = (value: any, fallback = '') => Array.from(new Set([
      value?.id,
      value?.collaborator_id,
      value?.user_id,
      value?.document,
      value?.rut,
      value?.name,
      `${value?.first_name || ''} ${value?.last_name || ''}`.trim(),
      fallback
    ].map((key) => String(key || '').trim()).filter(Boolean)))
    const memberByKey = new Map<string, any>()
    uniqueMembers.forEach((member: any, idx: number) => {
      personKeys(member, `member-${idx}`).forEach((key) => {
        if (!memberByKey.has(key)) memberByKey.set(key, member)
      })
    })
    const previousKeys = new Set(previousRows.flatMap((row: any, idx: number) => personKeys(row, `previous-${idx}`)))
    const buildPersonnelRow = (member: any, previous: any, idx: number) => {
      const personId = String(
        member?.id ||
        member?.collaborator_id ||
        member?.user_id ||
        previous?.id ||
        previous?.collaborator_id ||
        previous?.user_id ||
        previous?.document ||
        `${member?.first_name || ''} ${member?.last_name || ''}`.trim() ||
        previous?.name ||
        `${idx}`
      )
      return {
        ...(previous || {}),
        id: personId,
        collaborator_id: personId,
        role: member?.position || previous?.role || '',
        name: `${member?.first_name || ''} ${member?.last_name || ''}`.trim() || previous?.name || '',
        document: String(member?.document || previous?.document || '').trim(),
        crewName: member?.crewName || member?.crew_name || previous?.crewName || previous?.crew_name || ''
      }
    }
    const existingInSavedOrder = previousRows
      .map((previous: any, idx: number) => {
        const member = personKeys(previous, `previous-${idx}`)
          .map((key) => memberByKey.get(key))
          .find(Boolean)
        if (!member) return null
        return buildPersonnelRow(member, previous, idx)
      })
      .filter(Boolean) as any[]
    const newMembers = uniqueMembers
      .filter((member: any, idx: number) => {
        const keys = personKeys(member, `member-${idx}`)
        return keys.length > 0 && keys.every((key) => !previousKeys.has(key))
      })
      .map((member: any, idx: number) => buildPersonnelRow(member, null, existingInSavedOrder.length + idx))
    const mergedPersonnel = previousRows.length > 0
      ? [...existingInSavedOrder, ...newMembers]
      : uniqueMembers.map((member: any, idx: number) => buildPersonnelRow(member, null, idx))

    const prevSignature = JSON.stringify(previousRows.map((p: any) => ({
      id: String(p?.id || p?.collaborator_id || p?.user_id || ''),
      role: String(p?.role || ''),
      name: String(p?.name || ''),
      document: String(p?.document || ''),
      crewName: String(p?.crewName || p?.crew_name || '')
    })))
    const nextSignature = JSON.stringify(mergedPersonnel.map((p: any) => ({
      id: String(p?.id || p?.collaborator_id || p?.user_id || ''),
      role: String(p?.role || ''),
      name: String(p?.name || ''),
      document: String(p?.document || ''),
      crewName: String(p?.crewName || p?.crew_name || '')
    })))
    if (prevSignature === nextSignature) return

    const validIds = new Set(mergedPersonnel.map((p: any) => String(p?.id || p?.collaborator_id || '')))
    setPersonHours((hoursPrev) => {
      const next: Record<string, number[]> = {}
      Object.entries(hoursPrev || {}).forEach(([key, val]) => {
        if (validIds.has(String(key))) next[String(key)] = Array.isArray(val) ? [...val] : []
      })
      return next
    })
    setPersonExtraHours((extraPrev) => {
      const next: Record<string, number> = {}
      Object.entries(extraPrev || {}).forEach(([key, val]) => {
        if (validIds.has(String(key))) next[String(key)] = Number(val) || 0
      })
      return next
    })
    setPersonnel(mergedPersonnel)

    if (FIELD_REPORTS_DEV_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][crew-members-sync]', {
        reportId: selectedReport?.id || null,
        reportDate,
        crewCount: Array.isArray(reportCrewIds) ? reportCrewIds.length : 0,
        previousPersonnelCount: previousRows.length,
        currentCrewMembersCount: crewMembers.length,
        mergedPersonnelCount: mergedPersonnel.length,
        preservedOrder: previousRows.length > 0
      })
    }
  }, [open, selectedReport, crewMembers, reportCrewIds, reportDate, personnel, editMode, selectedReportHydrationStatus])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const [areasRes, projectsRes] = await Promise.all([
          fetch('/api/activities/areas'),
          fetch('/api/session/projects')
        ])
        if (!cancelled && areasRes.ok) {
          const areasData = await areasRes.json()
          const cleaned = (Array.isArray(areasData) ? areasData : [])
            .map((x: any) => String(x || '').trim())
            .filter((x: string) => x.length > 0 && normalizeText(x) !== 'sin area')
          setAreaOptions(Array.from(new Set(cleaned)))
        }
        if (!cancelled && projectsRes.ok) {
          const projectsData = await projectsRes.json()
          const projects = Array.isArray(projectsData?.projects) ? projectsData.projects : []
          const sessionProjectId = String((session?.user as any)?.projectId || '').trim()
          const selected = projects.find((p: any) => String(p?.id || '') === sessionProjectId) || projects[0]
          setContractName(String(selected?.name || '').trim())
        }
      } catch (e) {
        console.warn('Could not load area/project metadata', e)
      }
    })()
    return () => { cancelled = true }
  }, [open, session?.user])

  useEffect(() => {
    if (!open || !reportDate) return
    let cancelled = false
    ;(async () => {
      try {
        let statusRows: any[] = []
        let eligibleStatusIds: string[] = []
	        const cachedStatus =
	          dailyStatusByDateCacheRef.current.get(reportDate) ||
	          dailyStatusByDateGlobalCache.get(reportDate)
	        if (cachedStatus) {
	          statusRows = cachedStatus
	        } else {
	          let inFlight =
	            dailyStatusByDateInFlightRef.current.get(reportDate) ||
	            dailyStatusByDateGlobalInFlight.get(reportDate)
	          if (!inFlight) {
	            if (modalOpenMetricsRef.current) modalOpenMetricsRef.current.requests += 1
            perfCountRequest('modal-open', `/api/collaborators/daily-status?date=${reportDate}`)
            inFlight = (async () => {
              const res = await fetch(`/api/collaborators/daily-status?date=${encodeURIComponent(reportDate)}`)
              if (!res.ok) return []
              const statusData = await res.json()
              const rows = Array.isArray(statusData?.rows)
                ? statusData.rows
                : (Array.isArray(statusData) ? statusData : [])
              return rows
	            })()
	            dailyStatusByDateInFlightRef.current.set(reportDate, inFlight)
	            dailyStatusByDateGlobalInFlight.set(reportDate, inFlight)
	          }
	          statusRows = await inFlight
          dailyStatusByDateInFlightRef.current.delete(reportDate)
          dailyStatusByDateGlobalInFlight.delete(reportDate)
          dailyStatusByDateCacheRef.current.set(reportDate, statusRows)
          dailyStatusByDateGlobalCache.set(reportDate, statusRows)
        }

        const ids = statusRows
          .filter((r: any) => {
            const status = normalizeText(String(r?.status || ''))
            const reason = normalizeText(String(r?.reason || ''))
            // Include Turno and Fuera de Obra (FO), plus legacy code 11
            return status === 'turno' || status === 'fuera de obra' || reason === '11' || reason === 'fo'
          })
          .map((r: any) => String(r?.collaborator_id || r?.id || '')).filter(Boolean)
        eligibleStatusIds = ids
        if (!cancelled) setTurnoCollaboratorIds(new Set(ids))

        const collabs = await loadCollaboratorsCached()
        if (!cancelled && Array.isArray(collabs)) {
          if (modalOpenMetricsRef.current) modalOpenMetricsRef.current.requests += 1
          const map: Record<string, string> = {}
          const phoneMap: Record<string, string> = {}
          const documentMap: Record<string, string> = {}
          const documentByNameNorm: Record<string, string> = {}
          const phoneByNameNorm: Record<string, string> = {}
          const rawMap: Record<string, { name: string; position: string; document?: string }> = {}
          const isOtWorker = (c: any) => {
            const normPos = normalizeText(String(c?.position || c?.posicion || ''))
            return (
              normPos === 'secretario tecnico' ||
              normPos === 'secretaria tecnica' ||
              (normPos.includes('secretari') && normPos.includes('tecnic')) ||
              normPos === 'ingeniero oficina tecnica' ||
              (normPos.includes('ingeniero') && normPos.includes('oficina') && normPos.includes('tecnica'))
            )
          }
          const isFieldBossWorker = (c: any) => {
            const normPos = normalizeText(String(c?.position || c?.posicion || ''))
            return (
              normPos.includes('jefe de terreno') ||
              normPos.includes('jefe terreno') ||
              normPos.includes('jefe_terreno') ||
              normPos.includes('terrain boss') ||
              normPos.includes('field boss')
            )
          }
          const turnoIds = new Set((eligibleStatusIds || []).map(String))
          const otList: Array<{ id: string; name: string; position: string }> = []
          const turnoListById = new Map<string, { id: string; name: string; position: string }>()
          const fieldBossCandidates: Array<{ id: string; name: string; phone: string }> = []
          ;(Array.isArray(collabs) ? collabs : []).forEach((c: any) => {
            const id = String(c?.id || '').trim()
            const uid = String(c?.user_id || '').trim()
            const cid = String(c?.collaborator_id || '').trim()
            if (!id && !uid && !cid) return
            const fullName = `${String(c?.first_name || '').trim()} ${String(c?.last_name || '').trim()}`.trim()
            if (fullName) {
              if (id) map[id] = fullName
              if (uid) map[uid] = fullName
              if (cid) map[cid] = fullName
            }
            const pos = String(c?.position || c?.posicion || '').trim()
            const doc = String(c?.document || '').trim()
            if (id) rawMap[id] = { name: fullName || id, position: pos, document: doc || undefined }
            if (uid) rawMap[uid] = { name: fullName || uid, position: pos, document: doc || undefined }
            if (cid) rawMap[cid] = { name: fullName || cid, position: pos, document: doc || undefined }
            const phone = String(c?.phone || '').trim()
            if (phone) {
              if (id) phoneMap[id] = phone
              if (uid) phoneMap[uid] = phone
              if (cid) phoneMap[cid] = phone
            }
            const document = String(c?.document || '').trim()
            if (document) {
              if (id) documentMap[id] = document
              if (uid) documentMap[uid] = document
              if (cid) documentMap[cid] = document
            }
            const normName = normalizeText(fullName)
            if (normName && document) documentByNameNorm[normName] = document
            if (normName && phone) phoneByNameNorm[normName] = phone
            const otMatch = isOtWorker(c)
            const hasStatusMatch =
              (id && turnoIds.has(id)) ||
              (uid && turnoIds.has(uid)) ||
              (cid && turnoIds.has(cid))
            if (hasStatusMatch) {
              const turnoId = id || uid || cid
              if (turnoId) {
                turnoListById.set(turnoId, {
                  id: turnoId,
                  name: fullName || turnoId,
                  position: String(c?.position || c?.posicion || '').trim()
                })
              }
            }
            if (otMatch && hasStatusMatch) {
              otList.push({
                id: id || uid || cid,
                name: fullName || id,
                position: String(c?.position || c?.posicion || '').trim()
              })
            }
            if (hasStatusMatch && isFieldBossWorker(c)) {
              const bossId = id || uid || cid
              if (bossId) {
                fieldBossCandidates.push({
                  id: bossId,
                  name: fullName || bossId,
                  phone: String(c?.phone || '').trim()
                })
              }
            }
          })

          // Fallback robusto: construir OT directo desde daily-status (evita filtros de /api/collaborators).
          ;(statusRows || []).forEach((row: any) => {
            const collab = row?.collaborator || null
            if (!collab) return
            const rid = String(row?.collaborator_id || collab?.id || '').trim()
            const ruid = String(collab?.user_id || '').trim()
            const fullName = `${String(collab?.first_name || '').trim()} ${String(collab?.last_name || '').trim()}`.trim()
            if (fullName) {
              if (rid) map[rid] = fullName
              if (ruid) map[ruid] = fullName
            }
            const phone = String(collab?.phone || '').trim()
            if (phone) {
              if (rid) phoneMap[rid] = phone
              if (ruid) phoneMap[ruid] = phone
            }
            const document = String(collab?.document || '').trim()
            if (document) {
              if (rid) documentMap[rid] = document
              if (ruid) documentMap[ruid] = document
            }
            const normName = normalizeText(fullName)
            if (normName && document) documentByNameNorm[normName] = document
            if (normName && phone) phoneByNameNorm[normName] = phone
            const turnoId = rid || ruid
            if (turnoId) {
              turnoListById.set(turnoId, {
                id: turnoId,
                name: fullName || turnoId,
                position: String(collab?.position || collab?.posicion || '').trim()
              })
            }
          })

          if (otList.length === 0) {
            ;(statusRows || []).forEach((row: any) => {
              const collab = row?.collaborator || null
              if (!collab) return
              if (!isOtWorker(collab)) return
              const cid = String(row?.collaborator_id || collab?.id || '').trim()
              if (!cid) return
              const name = `${String(collab?.first_name || '').trim()} ${String(collab?.last_name || '').trim()}`.trim() || cid
              if (!otList.some((x) => String(x.id) === cid)) {
                otList.push({
                  id: cid,
                  name,
                  position: String(collab?.position || '').trim()
                })
              }
            })
          }
          setCollaboratorNameById(map)
          setCollaboratorPhoneById(phoneMap)
          setCollaboratorDocumentById(documentMap)
          setCollaboratorDocumentByNameNorm(documentByNameNorm)
          setCollaboratorPhoneByNameNorm(phoneByNameNorm)
          setCollaboratorMap(rawMap)
          const sortedOt = otList.sort((a, b) => a.name.localeCompare(b.name, 'es'))
          const sortedTurno = Array.from(turnoListById.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
          const uniqueFieldBoss = Array.from(new Map(
            fieldBossCandidates
              .filter((x) => String(x.id || '').trim())
              .map((x) => [String(x.id), x])
          ).values())
          setOtPresentWorkers(sortedOt)
          setTurnoPresentWorkers(sortedTurno)
          if (uniqueFieldBoss.length === 1) {
            setTurnoFieldBoss(uniqueFieldBoss[0])
          } else {
            setTurnoFieldBoss(null)
          }
          setEmittedById((prev) => {
            const current = String(prev || '').trim()
            const saved = String(selectedReport?.emitted_by_id || selectedReport?.emitido_por_id || '').trim()
            const candidate = current || saved
            if (!candidate) return ''
            if (sortedOt.some((w) => String(w.id) === candidate)) return candidate
            return selectedReport?.id ? candidate : ''
          })
        }
      } catch (e) {
        console.warn('Could not load turno/collaborators for field boss', e)
        setTurnoFieldBoss(null)
      }
    })()
    return () => { cancelled = true }
  }, [open, reportDate, loadCollaboratorsCached, selectedReport?.id, selectedReport?.emitted_by_id, selectedReport?.emitido_por_id])

  useEffect(() => {
    if (!open) return
    if (!isUserRole) return
    const isNew = !selectedReport && !editMode
    if (!isNew) {
      setAvailableActivityDates([])
      setAvailableCrewIdsForDate([])
      return
    }
    ;(async () => {
      try {
        setLoadingActivityDates(true)
        const res = await fetch('/api/crews/activities/dates')
        if (!res.ok) {
          setAvailableActivityDates([])
          return
        }
        const data = await res.json()
        setAvailableActivityDates(Array.isArray(data?.dates) ? data.dates : [])
      } catch (e) {
        console.warn('Could not load activity dates', e)
        setAvailableActivityDates([])
      } finally {
        setLoadingActivityDates(false)
      }
    })()
  }, [open, isUserRole, selectedReport, editMode])

  useEffect(() => {
    if (!open) return
    if (!isUserRole) return
    const isNew = !selectedReport && !editMode
    if (!isNew) return
    if (!availableActivityDates || availableActivityDates.length === 0) return
    if (!availableActivityDates.includes(reportDate)) {
      setReportDate(availableActivityDates[0])
    }
  }, [open, isUserRole, selectedReport, editMode, availableActivityDates, reportDate])

  useEffect(() => {
    if (!open) return
    if (!isUserRole) return
    const isViewOnly = !editMode && !!selectedReport
    if (isViewOnly) return
    if (!reportDate) {
      setAvailableCrewIdsForDate([])
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`/api/crews/activities/by-date?date=${encodeURIComponent(reportDate)}`)
        if (!res.ok) {
          setAvailableCrewIdsForDate([])
          return
        }
        const data = await res.json()
        setAvailableCrewIdsForDate(Array.isArray(data?.crewIds) ? data.crewIds : [])
      } catch (e) {
        console.warn('Could not load crews for date', e)
        setAvailableCrewIdsForDate([])
      }
    })()
  }, [open, isUserRole, selectedReport, editMode, reportDate])

  const fetchActivities = async (q: string) => {
    if (!q || q.trim().length === 0) return setActivityResults([])
    try {
      setLoadingActivities(true)
      const res = await fetch(`/api/activities?q=${encodeURIComponent(q)}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        setActivityResults(data || [])
      }
    } catch (e) {
      console.warn('Error fetching activities', e)
    } finally {
      setLoadingActivities(false)
    }
  }

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [])

  const assignActivityToCrew = (act: any) => {
    const crewId = selectedCrewFor[String(act.id)]
    if (!crewId) return alert('Seleccione una cuadrilla primero')
    // Prevent duplicate assignment only for the same activity in the same crew.
    // The same activity can be declared by more than one crew in the same report.
    if (assignedActivities.some(a => String(a.activityId) === String(act.id) && String(a.crewId || '') === String(crewId))) return alert('Actividad ya asignada a esta cuadrilla')
    const crew = crews.find((c) => String(c.id) === String(crewId))
    const inputs = activityInputs[String(act.id)] || {}
    const lineNum = inputs.lineNumber ?? (assignedActivities.length + 1)
    const assigned = {
      lineNumber: lineNum,
      activityId: String(act.id),
      id: act.id,
      company_id: act.company_id || null,
      program_quantity: inputs.quantity ?? act.quantity ?? 0,
      quantity: 0,
      created_at: act.created_at || null,
      updated_at: act.updated_at || null,
      // Keep source description immutable (comes from client program)
      description: act.description ?? null,
      execution_description: '',
      time_classification: '',
      time_reason: '',
      unit: inputs.unit ?? act.unit ?? null,
      discipline: inputs.discipline ?? act.discipline ?? null,
      observations: inputs.observations ?? act.observations ?? null,
      item_id: inputs.item_id ?? act.item_id ?? null,
      sub_id: inputs.sub_id ?? act.sub_id ?? null,
      area: inputs.area ?? act.area ?? null,
      activity: act.activity ?? null,
      package: inputs.package ?? act.package ?? null,
      crewId: String(crewId),
      crewName: crew?.name || '',
    }
    setAssignedActivities((s) => [...s, assigned])
    // clear selection for that activity
    setSelectedCrewFor((m) => { const nm = { ...m }; delete nm[String(act.id)]; return nm })
    // clear inline inputs for that activity
    setActivityInputs((m) => { const nm = { ...m }; delete nm[String(act.id)]; return nm })
    // reset search input and results after assigning
    setSearchQuery('')
    setActivityResults([])
    setLoadingActivities(false)
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current)
      searchTimeout.current = null
    }
  }

  const fetchProgramActivities = async () => {
    try {
      setLoadingProgram(true)
      const res = await fetch('/api/activities?limit=200')
      if (res.ok) {
        const data = await res.json()
        setProgramActivities(data || [])
      }
    } catch (e) {
      console.warn('Could not load program activities', e)
    } finally {
      setLoadingProgram(false)
    }
  }

  const assignProgramActivityToCrew = (act: any) => {
    const key = `prog-${act.id}`
    const crewId = selectedCrewFor[key]
    if (!crewId) return alert('Seleccione una cuadrilla primero')
    if (assignedActivities.some(a => String(a.activityId) === String(act.id) && String(a.crewId || '') === String(crewId) && a.source === 'program')) return alert('Actividad del programa ya asignada a esta cuadrilla')
    const crew = crews.find((c) => String(c.id) === String(crewId))
    const assigned: AssignedActivity = {
      lineNumber: act.lineNumber || assignedActivities.length + 1,
      activityId: String(act.id),
      id: act.id,
      company_id: act.company_id || null,
      program_quantity: act.quantity ?? 0,
      quantity: 0,
      created_at: act.created_at || null,
      updated_at: act.updated_at || null,
      // Keep source description immutable (comes from client program)
      description: act.description || null,
      execution_description: '',
      time_classification: '',
      time_reason: '',
      unit: act.unit || null,
      discipline: act.discipline || null,
      observations: act.observations || null,
      item_id: act.item_id ?? null,
      sub_id: act.sub_id ?? null,
      area: act.area ?? null,
      activity: act.activity || null,
      package: act.package || null,
      crewId: String(crewId),
      crewName: crew?.name || '',
    }
    // mark source so duplicates can be checked
    // @ts-ignore
    assigned.source = 'program'
    setAssignedActivities((s) => [...s, assigned])
    setSelectedCrewFor((m) => { const nm = { ...m }; delete nm[key]; return nm })
  }

  const removeAssigned = (index: number) => {
    setAssignedActivities((s) => s.filter((_, i) => i !== index))
  }

  const updateAssignedField = (index: number, field: string, value: any) => {
    setAssignedActivities((s) => {
      const copy = [...s]
      // ensure index exists
      if (!copy[index]) return copy
      // @ts-ignore
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  const evidenceRowKey = (row: any, rowIndex: number) => `${row?.activityId || 'act'}-${row?.crewId || rowIndex}`

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

      // Keep original if optimization doesn't improve size materially.
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
    for (const file of files) {
      optimized.push(await optimizeImageFile(file))
    }
    return optimized
  }

  const queueEvidenceFiles = async (rowIndex: number, files: File[]) => {
    if (!files || files.length === 0) return false
    const row = assignedActivities[rowIndex]
    if (!row?.activityId) return false

    const rowKey = evidenceRowKey(row, rowIndex)
    const uploadedCount = parseEvidenceFiles(row.evidence_files).length
    const pendingCount = (pendingEvidenceFiles[rowKey] || []).length
    const remaining = Math.max(0, 5 - uploadedCount - pendingCount)
    if (remaining <= 0) {
      showSnackbar('Maximo 5 imagenes por actividad', 'warning')
      return false
    }
    const selected = files.slice(0, remaining)
    if (selected.length !== files.length) {
      showSnackbar('Solo se agregaran imagenes hasta completar un maximo de 5 por actividad', 'warning')
    }
    showSnackbar('Optimizando imagenes...', 'info')
    const allowed = await optimizeImageFiles(selected)
    const toAdd: PendingEvidencePreview[] = allowed.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file)
    }))
    setPendingEvidenceFiles((prev) => ({
      ...prev,
      [rowKey]: [...(prev[rowKey] || []), ...toAdd].slice(0, 5)
    }))
    showSnackbar('Imagenes agregadas. Se subiran al guardar el reporte', 'info')
    return true
  }

  const uploadEvidenceForRow = async (row: AssignedActivity, files: PendingEvidencePreview[], rowIndex: number): Promise<EvidenceFile[]> => {
    if (!files || files.length === 0 || !row?.activityId) return []
    const rowKey = evidenceRowKey(row, rowIndex)
    setUploadingEvidence((prev) => ({ ...prev, [rowKey]: true }))
    try {
      const uploaded: EvidenceFile[] = []
      for (const item of files) {
        const file = item.file
        const presignRes = await fetch('/api/field-reports/evidence/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            fileSize: file.size,
            activityId: row.activityId,
            crewId: row.crewId || null
          })
        })
        const presign = await presignRes.json()
        if (!presignRes.ok || !presign?.uploadUrl || !presign?.key) {
          throw new Error(presign?.error || 'No se pudo preparar la subida')
        }
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        })
        if (!putRes.ok) throw new Error(`Error subiendo ${file.name}`)
        uploaded.push({
          key: presign.key,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          uploaded_at: new Date().toISOString()
        })
      }
      return uploaded
    } finally {
      setUploadingEvidence((prev) => ({ ...prev, [rowKey]: false }))
    }
  }

  const openEvidenceDialog = (rowIndex: number) => {
    setEvidenceDialogRowIndex(rowIndex)
    setEvidenceDialogOpen(true)
    setEvidenceDragOver(false)
  }

  const closeEvidenceDialog = () => {
    setEvidenceDialogOpen(false)
    setEvidenceDialogRowIndex(null)
    setEvidenceDragOver(false)
  }

  const submitEvidenceFromList = async (list: FileList | null) => {
    if (evidenceDialogRowIndex == null || !list || list.length === 0) return
    await queueEvidenceFiles(evidenceDialogRowIndex, Array.from(list))
  }

  const removePendingEvidenceFromRow = (rowKey: string, pendingIndex: number) => {
    setPendingEvidenceFiles((prev) => {
      const current = prev[rowKey] || []
      const removed = current[pendingIndex]
      if (removed?.previewUrl) {
        try { URL.revokeObjectURL(removed.previewUrl) } catch {}
      }
      const next = current.filter((_, idx) => idx !== pendingIndex)
      if (next.length === 0) {
        const clone = { ...prev }
        delete clone[rowKey]
        return clone
      }
      return { ...prev, [rowKey]: next }
    })
  }

  const removeUploadedEvidenceFromRow = (rowIndex: number, uploadedIndex: number) => {
    setAssignedActivities((prev) => {
      if (!prev[rowIndex]) return prev
      const row = prev[rowIndex]
      const current = parseEvidenceFiles(row.evidence_files)
      const next = current.filter((_, idx) => idx !== uploadedIndex)
      const copy = [...prev]
      copy[rowIndex] = { ...row, evidence_files: next }
      return copy
    })
  }

  const ensureUploadedEvidencePreview = useCallback(async (files: EvidenceFile[]) => {
    const keys = (files || [])
      .map((f) => String(f?.key || '').trim())
      .filter(Boolean)
      .filter((k, idx, arr) => arr.indexOf(k) === idx)

    const missing = keys.filter((k) => !uploadedEvidencePreviewByKey[k])
    if (EVIDENCE_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][evidence] ensureUploadedEvidencePreview:start', {
        totalFiles: files.length,
        keys,
        cachedKeys: Object.keys(uploadedEvidencePreviewByKey).length,
        missing
      })
    }
    if (missing.length === 0) return

    const pairs = await Promise.all(missing.map(async (key) => {
      try {
        if (EVIDENCE_DEBUG) console.log('[field-reports][evidence] requesting signed view URL', { key })
        const res = await fetch(`/api/field-reports/evidence/view?key=${encodeURIComponent(key)}`)
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          if (EVIDENCE_DEBUG) console.log('[field-reports][evidence] signed URL request failed', { key, status: res.status, body: text })
          return [key, ''] as const
        }
        const json = await res.json()
        if (EVIDENCE_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][evidence] signed URL response', {
            key,
            hasUrl: Boolean(json?.url),
            expiresInSeconds: json?.expiresInSeconds
          })
        }
        return [key, String(json?.url || '')] as const
      } catch {
        if (EVIDENCE_DEBUG) console.log('[field-reports][evidence] signed URL request exception', { key })
        return [key, ''] as const
      }
    }))

    setUploadedEvidencePreviewByKey((prev) => {
      const next = { ...prev }
      pairs.forEach(([key, url]) => {
        if (url) next[key] = url
      })
      if (EVIDENCE_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][evidence] preview cache updated', {
          fetched: pairs.length,
          storedTotal: Object.keys(next).length,
          storedKeys: Object.keys(next)
        })
      }
      return next
    })
  }, [uploadedEvidencePreviewByKey])

  const getEvidenceViewUrl = useCallback(async (key: string): Promise<string> => {
    const cleanKey = String(key || '').trim()
    if (!cleanKey) return ''
    if (uploadedEvidencePreviewByKey[cleanKey]) return uploadedEvidencePreviewByKey[cleanKey]
    try {
      const res = await fetch(`/api/field-reports/evidence/view?key=${encodeURIComponent(cleanKey)}`)
      if (!res.ok) return ''
      const json = await res.json().catch(() => null)
      const url = String(json?.url || '')
      if (url) {
        setUploadedEvidencePreviewByKey((prev) => ({ ...prev, [cleanKey]: url }))
      }
      return url
    } catch {
      return ''
    }
  }, [uploadedEvidencePreviewByKey])

  const triggerDownloadFromUrl = (url: string, fileName: string, openInNewTab = false) => {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName || 'imagen'
    if (openInNewTab) {
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    }
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadEvidenceFile = useCallback(async (file: EvidenceFile) => {
    const key = String(file?.key || '').trim()
    if (!key) return
    const name = String(file?.name || 'imagen')
    const downloadUrl = `/api/field-reports/evidence/download?key=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}`
    // Misma pestaña + Content-Disposition desde backend => descarga directa sin abrir ventana.
    triggerDownloadFromUrl(downloadUrl, name, false)
  }, [])

  const downloadAllEvidenceFiles = useCallback(async (files: EvidenceFile[]) => {
    const list = Array.isArray(files) ? files : []
    if (list.length === 0) return
    showSnackbar(`Descargando ${list.length} imagen(es)...`, 'info')
    for (const file of list) {
      // Evita que el navegador bloquee múltiples descargas simultáneas.
      // eslint-disable-next-line no-await-in-loop
      await downloadEvidenceFile(file)
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }, [downloadEvidenceFile])

  useEffect(() => {
    if (!evidenceDialogOpen) return
    const idx = evidenceDialogRowIndex
    if (idx == null || !assignedActivities[idx]) return
    const row = assignedActivities[idx]
    const uploaded = parseEvidenceFiles(row.evidence_files)
    if (EVIDENCE_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][evidence] dialog open row summary', {
        rowIndex: idx,
        activityId: row.activityId,
        crewId: row.crewId,
        uploadedCount: uploaded.length,
        uploadedKeys: uploaded.map((x) => x.key)
      })
    }
    if (uploaded.length === 0) return
    ensureUploadedEvidencePreview(uploaded)
  }, [evidenceDialogOpen, evidenceDialogRowIndex, assignedActivities, ensureUploadedEvidencePreview])

  const toNonNegativeNumber = (value: any) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
  }

  const addPerson = () => {
    if (!personRole || !personName) return
    setPersonnel((p) => [...p, { role: personRole, name: personName }])
    setPersonRole('')
    setPersonName('')
  }

  const removePerson = (index: number) => {
    setPersonnel((p) => p.filter((_, i) => i !== index))
  }

  const updatePersonHour = (personId: string, actIndex: number, value: string) => {
    let exceededLimit = false
    setPersonHours((prev) => {
      const copy = { ...prev }
      const arr = copy[personId] ? [...copy[personId]] : new Array(activityCount).fill(0)
      // ensure array has enough slots for current activities
      while (arr.length < activityCount) arr.push(0)
      const num = Number(value)
      const requested = isNaN(num) ? 0 : Math.max(0, num)
      const otherHoursTotal = arr.reduce((sum, current, idx) => (
        idx === actIndex ? sum : sum + (Number(current) || 0)
      ), 0)
      const extraHours = Number(personExtraHours?.[personId] || 0) || 0
      const maxAllowedForBase = getMaxBaseHoursForManualExtra(extraHours)
      const maxAllowedForCell = Math.max(0, maxAllowedForBase - otherHoursTotal)
      const nextValue = requested > maxAllowedForCell ? maxAllowedForCell : requested
      if (requested > maxAllowedForCell) exceededLimit = true
      arr[actIndex] = nextValue
      copy[personId] = arr
      return copy
    })
    if (exceededLimit) showSnackbar('El máximo diario permitido por colaborador es 15 horas', 'warning')
  }

  const getPersonKey = (member: any, rowIdx: number) => {
    return String(
      member?.id ||
      member?.collaborator_id ||
      member?.user_id ||
      `${member?.first_name || ''} ${member?.last_name || ''}`.trim() ||
      `${rowIdx}`
    )
  }

  const getExistingPersonHours = (prev: Record<string, number[]>, member: any, rowIdx: number) => {
    const nameKey = `${member?.first_name || ''} ${member?.last_name || ''}`.trim()
    const legacyKey = `${member?.first_name || ''}-${rowIdx}`
    const candidates = [
      member?.id,
      member?.collaborator_id,
      member?.user_id,
      nameKey,
      legacyKey
    ].filter(Boolean).map(String)
    for (const key of candidates) {
      if (prev[key]) return prev[key]
    }
    return null
  }

  const openHourCellDialog = (personId: string, personName: string, actIndex: number, currentValue: number) => {
    setHourCellPersonId(String(personId))
    setHourCellPersonName(String(personName || '').trim())
    setHourCellActivityIndex(actIndex)
    setHourCellDraft(String(Number(currentValue || 0)))
    setHourApplyMode('single')
    setHourApplySelectedIds([])
    setHourCellDialogOpen(true)
  }

  const closeHourCellDialog = () => {
    setHourCellDialogOpen(false)
    setHourCellPersonId('')
    setHourCellPersonName('')
    setHourCellActivityIndex(0)
    setHourCellDraft('0')
    setHourApplyMode('single')
    setHourApplySelectedIds([])
  }

  const saveHourCellDialog = () => {
    const requested = Number(hourCellDraft)
    const normalized = Number.isFinite(requested) ? Math.max(0, requested) : 0
    const clampedByCell = normalized > MAX_PERSON_HOURS_WITH_OVERTIME ? MAX_PERSON_HOURS_WITH_OVERTIME : normalized
    const availableIds = (personnelRows || []).map((r: any) => String(r?.personId || '')).filter(Boolean)
    const targetIds = (() => {
      if (hourApplyMode === 'all') return availableIds
      if (hourApplyMode === 'selected') {
        const selected = hourApplySelectedIds.filter((id) => availableIds.includes(String(id)))
        return selected.length > 0 ? selected : [hourCellPersonId]
      }
      return [hourCellPersonId]
    })()

    if (hourCellActivityIndex < 0) {
      let anyAdjusted = false
      setPersonExtraHours((prev) => {
        const copy = { ...prev }
        targetIds.forEach((pid) => {
          const currentHours = Array.isArray(personHours?.[pid]) ? personHours[pid] : []
          const baseTotal = currentHours.reduce((sum: number, current: any) => sum + (Number(current) || 0), 0)
          const maxAllowedForExtra = getMaxManualExtraForBaseHours(baseTotal)
          const nextValue = clampedByCell > maxAllowedForExtra ? maxAllowedForExtra : clampedByCell
          if (nextValue !== clampedByCell) anyAdjusted = true
          copy[String(pid)] = nextValue
        })
        return copy
      })
      if (anyAdjusted) showSnackbar('Se ajustaron valores para mantener máximo total de 15 horas por colaborador', 'warning')
      closeHourCellDialog()
      return
    }

    let anyAdjusted = false
    setPersonHours((prev) => {
      const copy = { ...prev }
      targetIds.forEach((pid) => {
        const arr = copy[pid] ? [...copy[pid]] : new Array(activityCount).fill(0)
        while (arr.length < activityCount) arr.push(0)
        const otherHoursTotal = arr.reduce((sum, current, idx) => (
          idx === hourCellActivityIndex ? sum : sum + (Number(current) || 0)
        ), 0)
        const extraHours = Number(personExtraHours?.[pid] || 0) || 0
        const maxAllowedForBase = getMaxBaseHoursForManualExtra(extraHours)
        const maxAllowedForCell = Math.max(0, maxAllowedForBase - otherHoursTotal)
        const nextValue = clampedByCell > maxAllowedForCell ? maxAllowedForCell : clampedByCell
        if (nextValue !== clampedByCell) anyAdjusted = true
        arr[hourCellActivityIndex] = nextValue
        copy[pid] = arr
      })
      return copy
    })
    if (anyAdjusted) {
      showSnackbar('Se ajustaron valores para mantener máximo total de 15 horas por colaborador', 'warning')
    }
    closeHourCellDialog()
  }

  const updateEquipmentField = (index: number, field: string, value: string) => {
    setEquipmentEntries((prev) => {
      const copy = [...prev]
      while (copy.length <= index) copy.push({})
      const nextValue = field === 'code' ? String(value || '').toUpperCase() : value
      // @ts-ignore
      copy[index] = { ...copy[index], [field]: nextValue }
      return copy
    })
  }

  const addEquipmentRow = useCallback(() => {
    setEquipmentEntries((prev) => [...(prev || []), {}])
  }, [])

  const updateEquipmentHour = (entryId: string, actIndex: number, value: string) => {
    let exceededLimit = false
    setEquipmentHours((prev) => {
      const copy = { ...prev }
      const arr = copy[entryId] ? [...copy[entryId]] : new Array(activityCount).fill(0)
      while (arr.length < activityCount) arr.push(0)
      const num = Number(value)
      const requested = isNaN(num) ? 0 : Math.max(0, num)
      const rowIdx = Number(String(entryId).replace('equip-', ''))
      const entry = Array.isArray(equipmentEntries) && Number.isFinite(rowIdx) ? (equipmentEntries[rowIdx] || {}) : {}
      const machineKey = normalizeMachineKey(entry)
      const otherReportsTotal = machineKey
        ? Math.max(0, Number(crossReportMachineDayHoursByKey.get(machineKey) || 0) - Number(draftMachineDayHoursByKey.get(machineKey) || 0))
        : 0
      const extraHoursForEntry = Math.max(0, Number((entry as any)?.extra_hours ?? 0) || 0)
      const otherHoursTotal = arr.reduce((sum, current, idx) => (
        idx === actIndex ? sum : sum + (Number(current) || 0)
      ), 0)
      const maxAllowedForCell = Math.max(0, MAX_MACHINE_HOURS_WITH_OVERTIME - otherReportsTotal - extraHoursForEntry - otherHoursTotal)
      const nextValue = requested > maxAllowedForCell ? maxAllowedForCell : requested
      if (requested > maxAllowedForCell) exceededLimit = true
      arr[actIndex] = nextValue
      copy[entryId] = arr
      return copy
    })
    if (exceededLimit) showSnackbar('La máquina no puede superar 15 horas diarias entre reportes', 'warning')
  }

  const openEquipHourCellDialog = (entryId: string, actIndex: number, currentValue: number) => {
    setEquipHourCellEntryId(String(entryId))
    setEquipHourCellActivityIndex(actIndex)
    setEquipHourCellDraft(String(Number(currentValue || 0)))
    setEquipHourCellDialogOpen(true)
  }

  const closeEquipHourCellDialog = () => {
    setEquipHourCellDialogOpen(false)
    setEquipHourCellEntryId('')
    setEquipHourCellActivityIndex(0)
    setEquipHourCellDraft('0')
  }

  const saveEquipHourCellDialog = () => {
    updateEquipmentHour(equipHourCellEntryId, equipHourCellActivityIndex, equipHourCellDraft)
    closeEquipHourCellDialog()
  }

  const updateMaterialField = (index: number, field: 'description' | 'unit' | 'area', value: string) => {
    setMaterialEntries((prev) => {
      const copy = [...prev]
      while (copy.length <= index) copy.push({})
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  const addMaterialRow = useCallback(() => {
    setMaterialEntries((prev) => [...(prev || []), {}])
  }, [])

  const areaOptionsWithCurrent = useMemo(() => {
    const base = Array.isArray(areaOptions) ? [...areaOptions] : []
    base.push('Otros')
    const current = String(area || '').trim()
    if (current && !base.includes(current)) base.unshift(current)
    return Array.from(new Set(base.map((x) => String(x).trim()).filter(Boolean)))
  }, [areaOptions, area])
  const displayOrDash = (value: any) => {
    const text = String(value ?? '').trim()
    if (!text || text.toLowerCase() === 'undefined' || text.toLowerCase() === 'null') return '-'
    return text
  }

  const resolveAreaByMode = useCallback((specificArea?: string) => {
    const rowArea = String(specificArea || '').trim()
    return rowArea || String(area || '').trim()
  }, [area])

  const updatePersonAreaById = useCallback((personId: string, value: string) => {
    const key = String(personId || '').trim()
    if (!key) return
    setPersonAreaById((prev) => ({ ...prev, [key]: String(value || '') }))
  }, [])

  const updateMaterialQuantity = (entryId: string, actIndex: number, value: string) => {
    let exceededLimit = false
    setMaterialQuantities((prev) => {
      const copy = { ...prev }
      const arr = copy[entryId] ? [...copy[entryId]] : new Array(activityCount).fill(0)
      while (arr.length < activityCount) arr.push(0)
      const num = Number(value)
      const requested = isNaN(num) ? 0 : Math.max(0, num)
      const otherTotal = arr.reduce((sum, current, idx) => (
        idx === actIndex ? sum : sum + (Number(current) || 0)
      ), 0)
      const maxAllowed = Math.max(0, 10 - otherTotal)
      const next = requested > maxAllowed ? maxAllowed : requested
      if (requested > maxAllowed) exceededLimit = true
      arr[actIndex] = next
      copy[entryId] = arr
      return copy
    })
    if (exceededLimit) showSnackbar('El total por material no puede superar 10', 'warning')
  }

  const openMaterialQtyCellDialog = (entryId: string, actIndex: number, currentValue: number) => {
    setMaterialQtyCellEntryId(String(entryId))
    setMaterialQtyCellActivityIndex(actIndex)
    setMaterialQtyCellDraft(String(Number(currentValue || 0)))
    setMaterialQtyCellDialogOpen(true)
  }

  const closeMaterialQtyCellDialog = () => {
    setMaterialQtyCellDialogOpen(false)
    setMaterialQtyCellEntryId('')
    setMaterialQtyCellActivityIndex(0)
    setMaterialQtyCellDraft('0')
  }

  const saveMaterialQtyCellDialog = () => {
    updateMaterialQuantity(materialQtyCellEntryId, materialQtyCellActivityIndex, materialQtyCellDraft)
    closeMaterialQtyCellDialog()
  }

	useEffect(() => {
	  // initialize personHours entries for filtered crew members (preserve existing values)
	  if (selectedReportHydrationStatus === 'loading') {
      if (process.env.NODE_ENV !== 'production' && selectedReport?.id) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
          event: 'blocked-stale-effect',
          effectName: 'init-person-hours',
          selectedReportId: String(selectedReport.id),
          v2StateReportId: String(v2StateReportId || ''),
          reason: 'hydration-loading'
        })
      }
      return
	  }
	  if (!filteredCrewMembers || filteredCrewMembers.length === 0 || activityCount === 0) {
	    if (!selectedReport) {
	      setPersonHours((prev) => (Object.keys(prev || {}).length === 0 ? prev : {}))
	    }
	    return
	  }
	  setPersonHours((prev) => {
      const copy: Record<string, number[]> = { ...prev }
      let changed = false
      filteredCrewMembers.forEach((m, idx) => {
        const pid = getPersonKey(m, idx)
        if (!copy[pid]) {
          const existing = getExistingPersonHours(prev, m, idx)
          copy[pid] = existing ? [...existing] : new Array(activityCount).fill(0)
          changed = true
        }
        // if existing array is shorter/longer than activityCount, adjust preserving values
        else if (copy[pid].length !== activityCount) {
          const arr = [...copy[pid]]
          if (arr.length < activityCount) while (arr.length < activityCount) arr.push(0)
          else if (arr.length > activityCount) arr.length = activityCount
          copy[pid] = arr
          changed = true
        }
      })
	      return changed ? copy : prev
	    })
	  }, [filteredCrewMembers, activityCount, selectedReportHydrationStatus, selectedReport, v2StateReportId])

  const availableDateSet = useMemo(() => new Set(availableActivityDates || []), [availableActivityDates])
  const availableCrewIdSet = useMemo(() => new Set(availableCrewIdsForDate || []), [availableCrewIdsForDate])
  const formatPeopleLabel = useCallback((value: any) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const titleCase = (s: string) => s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w ? `${w.charAt(0).toUpperCase()}${w.slice(1)}` : ''))
      .join(' ')
    return raw
      .split(',')
      .map((part) => titleCase(part.trim()))
      .filter(Boolean)
      .join(', ')
  }, [])
  const formatSpecialtyLabel = useCallback((value: any) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    return raw
      .replace(/\bcaneria\b/gi, 'Cañería')
      .replace(/\bcanieria\b/gi, 'Cañería')
  }, [])
  const formatCrewNameLabel = useCallback((name: any) => {
    const raw = String(name || '').trim()
    if (!raw) return ''
    return raw
      .replace(/\bcaneria\b/gi, 'Cañería')
      .replace(/\bcanieria\b/gi, 'Cañería')
      .replace(/\belectricidad\b/gi, 'Eléctrico')
  }, [])
  const reportCrewNameLabel = useMemo(() => {
    if (!reportCrewIds || reportCrewIds.length === 0) {
      return selectedReport?.crew_name ? formatCrewNameLabel(selectedReport.crew_name) : ''
    }
    const names = reportCrewIds
      .map((id) => crews.find((c) => String(c.id) === String(id))?.name)
      .filter(Boolean)
      .map((n) => formatCrewNameLabel(n))
    return names.join(', ')
  }, [reportCrewIds, crews, selectedReport, formatCrewNameLabel])
  const crewsForDate = useMemo(() => {
    const isViewOnly = !editMode && !!selectedReport
    if (!isUserRole || isViewOnly) return crews
    if (!reportDate) return []
    if (availableCrewIdSet.size === 0) return []
    const crewNumber = (name: string) => {
      const m = String(name || '').match(/\b(\d+)\b/)
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
    }
    return crews
      .filter((c) => availableCrewIdSet.has(String(c.id)))
      .sort((a, b) => {
        const na = crewNumber(a?.name || '')
        const nb = crewNumber(b?.name || '')
        if (na !== nb) return na - nb
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'es')
      })
  }, [crews, isUserRole, selectedReport, editMode, reportDate, availableCrewIdSet])
  const reportDateValue = useMemo(() => (reportDate ? parseISO(reportDate) : null), [reportDate])
  const workFrontOptions = useMemo(() => {
    const fromCatalog = reportFrontOptions.map((front) => front.name).filter(Boolean)
    return fromCatalog.length > 0 ? fromCatalog : [...WORK_FRONT_OPTIONS]
  }, [reportFrontOptions])
  const selectedWorkFrontOption = useMemo(() => {
    const normalized = normalizeFrontLabel(workFront)
    if (!normalized) return null
    return reportFrontOptions.find((front) => normalizeFrontLabel(front.name) === normalized) || null
  }, [reportFrontOptions, workFront])
  const reportSequenceNo = useMemo(() => resolveFieldReportSequenceNo({
    front: workFront,
    date: reportDate,
    reports,
    selectedReport
  }), [workFront, reportDate, reports, selectedReport])
  const reportTitle = useMemo(
    () => buildFieldReportTitle(workFront || selectedReport?.work_front || area, reportSequenceNo),
    [workFront, selectedReport?.work_front, area, reportSequenceNo]
  )
  const shouldDisableReportDate = useCallback((date: Date | null) => {
    if (!date) return true
    const isNew = !selectedReport && !editMode
    if (!isNew) return false
    if (!isUserRole) return false
    if (availableDateSet.size === 0) return true
    const key = format(date, 'yyyy-MM-dd')
    return !availableDateSet.has(key)
  }, [selectedReport, editMode, isUserRole, availableDateSet])

  const effectiveCrewIdsForHeader = useMemo(() => {
    const ids = (reportCrewIds || []).map(String).filter(Boolean)
    if (ids.length > 0) return ids
    if (selectedReport?.crew_id) return [String(selectedReport.crew_id)]
    if (Array.isArray(selectedReport?.crew_ids)) return selectedReport.crew_ids.map(String).filter(Boolean)
    return []
  }, [reportCrewIds, selectedReport])
  const selectedCrewIdsForBoss = useMemo(() => {
    const ids = reportCrewIds
    if (ids.length > 0) return ids.filter(Boolean)
    if (selectedReport?.crew_id) return [String(selectedReport.crew_id)]
    if (Array.isArray(selectedReport?.crew_ids)) return selectedReport.crew_ids.map(String).filter(Boolean)
    return []
  }, [reportCrewIds, selectedReport])
  const usedCrewIdsByDate = useMemo(() => {
    const dateKey = String(reportDate || '').trim()
    if (!dateKey) return new Set<string>()
    const used = new Set<string>()
    ;(reports || []).forEach((r: any) => {
      if (String(r?.date || '').trim() !== dateKey) return
      if (selectedReport?.id && String(r?.id || '') === String(selectedReport.id)) return
      if (r?.crew_id) used.add(String(r.crew_id))
      if (Array.isArray(r?.crew_ids)) r.crew_ids.forEach((id: any) => used.add(String(id)))
    })
    return used
  }, [reports, reportDate, selectedReport?.id])
  const selectableCrewIdsForDate = useMemo(() => {
    return (crewsForDate || [])
      .map((c) => String(c.id))
      .filter((id) => !usedCrewIdsByDate.has(String(id)))
  }, [crewsForDate, usedCrewIdsByDate])
  const allSelectableCrewsSelected = useMemo(() => {
    if (selectableCrewIdsForDate.length === 0) return false
    if (reportCrewIds.length !== selectableCrewIdsForDate.length) return false
    const selectedSet = new Set((reportCrewIds || []).map(String))
    return selectableCrewIdsForDate.every((id) => selectedSet.has(String(id)))
  }, [reportCrewIds, selectableCrewIdsForDate])
  const isFieldBossPosition = useCallback((value: any) => {
    const pos = normalizeText(String(value || ''))
    return (
      pos.includes('jefe de terreno') ||
      pos.includes('jefe terreno') ||
      pos.includes('jefe_terreno') ||
      pos.includes('terrain boss') ||
      pos.includes('field boss')
    )
  }, [])
  const fieldBossName = useMemo(() => {
    const fromReport = String(
      selectedReport?.field_boss_name ||
      selectedReport?.field_boss ||
      selectedReport?.jefe_terreno_name ||
      selectedReport?.jefe_terreno ||
      selectedReport?.terrain_boss_name ||
      selectedReport?.site_boss_name ||
      selectedReport?.site_boss ||
      selectedReport?.site_responsible ||
      ''
    ).trim()
    if (fromReport && normalizeText(fromReport) !== 'multiples') return fromReport.toUpperCase()
    const ids = (selectedCrewIdsForBoss || []).map(String).filter(Boolean)
    const bossIds = Array.from(new Set(
      ids
        .map((id: string) => {
          const crew = (crews || []).find((c: any) => String(c?.id || '') === id)
          return String(crew?.field_boss_id || crew?.jefe_terreno_id || crew?.terrain_boss_id || '').trim()
        })
        .filter(Boolean)
    ))
    if (bossIds.length === 1) {
      const bossId = bossIds[0]
      const fromMap = String(collaboratorNameById[String(bossId)] || '').trim()
      if (fromMap) return fromMap.toUpperCase()
      const boss = (crewMembers || []).find((c: any) => String(c?.id || '') === bossId)
      if (boss) return `${boss?.first_name || ''} ${boss?.last_name || ''}`.trim().toUpperCase()
    }
    if (bossIds.length > 1) return 'MÚLTIPLES'
    if (turnoFieldBoss?.name) return String(turnoFieldBoss.name).toUpperCase()
    const getOtBosses = () => {
      const fromOt = (turnoPresentWorkers || [])
        .filter((w: any) => {
          return isFieldBossPosition(w?.position)
        })
        .map((w: any) => String(w?.name || '').trim())
        .filter(Boolean)
      return Array.from(new Set(fromOt))
    }
    const otBosses = getOtBosses()
    if (otBosses.length === 1) return otBosses[0].toUpperCase()
    if (ids.length === 0) {
      if (otBosses.length > 1) return 'MÚLTIPLES'
      return ''
    }
    if (bossIds.length === 0) {
      const fromCrew: string[] = Array.from(
        new Set<string>(
          ids
            .map((id: string) => {
              const crew = (crews || []).find((c: any) => String(c?.id || '') === id)
              return String(
                crew?.field_boss_name ||
                crew?.jefe_terreno_name ||
                crew?.terrain_boss_name ||
                crew?.site_boss_name ||
                crew?.site_responsible ||
                ''
              ).trim()
            })
            .filter((name: string): name is string => Boolean(name))
        )
      )
      if (fromCrew.length === 1) return fromCrew[0].toUpperCase()
      if (fromCrew.length > 1) return 'MÚLTIPLES'
      const fromMemberPosition = (crewMembers || [])
        .filter((c: any) => {
          return isFieldBossPosition(c?.position || c?.posicion)
        })
        .map((c: any) => `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || String(c?.name || '').trim())
        .filter(Boolean)
      const uniqueMemberBosses: string[] = Array.from(
        new Set<string>((fromMemberPosition || []).map((name) => String(name || '').trim()).filter((name) => Boolean(name)))
      )
      if (uniqueMemberBosses.length === 1) return uniqueMemberBosses[0].toUpperCase()
      if (uniqueMemberBosses.length > 1) return 'MÚLTIPLES'
      if (otBosses.length > 1) return 'MÚLTIPLES'
      return ''
    }
    const fromMemberPosition = (crewMembers || [])
      .filter((c: any) => {
        return isFieldBossPosition(c?.position || c?.posicion)
      })
      .map((c: any) => `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || String(c?.name || '').trim())
      .filter(Boolean)
    const uniqueMemberBosses: string[] = Array.from(
      new Set<string>((fromMemberPosition || []).map((name) => String(name || '').trim()).filter((name) => Boolean(name)))
    )
    if (uniqueMemberBosses.length === 1) return uniqueMemberBosses[0].toUpperCase()
    if (uniqueMemberBosses.length > 1) return 'MÚLTIPLES'
    if (otBosses.length > 1) return 'MÚLTIPLES'
    return ''
  }, [selectedCrewIdsForBoss, crews, crewMembers, collaboratorNameById, selectedReport, turnoPresentWorkers, isFieldBossPosition, turnoFieldBoss])
  const fieldBossPhone = useMemo(() => {
    const fromReport = String(
      selectedReport?.field_boss_phone ||
      selectedReport?.jefe_terreno_phone ||
      selectedReport?.terrain_boss_phone ||
      selectedReport?.site_boss_phone ||
      selectedReport?.site_responsible_phone ||
      ''
    ).trim()
    if (fromReport) return fromReport
    const ids = (selectedCrewIdsForBoss || []).map(String).filter(Boolean)
    const bossIds = Array.from(new Set(
      ids
        .map((id: string) => {
          const crew = (crews || []).find((c: any) => String(c?.id || '') === id)
          return String(crew?.field_boss_id || crew?.jefe_terreno_id || crew?.terrain_boss_id || '').trim()
        })
        .filter(Boolean)
    ))
    if (bossIds.length === 1) {
      const bossId = bossIds[0]
      const fromMap = String(collaboratorPhoneById[String(bossId)] || '').trim()
      if (fromMap) return fromMap
      const boss = (crewMembers || []).find((c: any) => String(c?.id || '') === bossId)
      if (boss) {
        return String(boss?.phone || boss?.telefono || boss?.mobile || boss?.cell || '').trim()
      }
    }
    if (turnoFieldBoss?.phone) return String(turnoFieldBoss.phone).trim()
    const fromOtBoss = (turnoPresentWorkers || []).find((w: any) => {
      return isFieldBossPosition(w?.position)
    })
    if (fromOtBoss?.id) {
      const phoneFromMap = String(collaboratorPhoneById[String(fromOtBoss.id)] || '').trim()
      if (phoneFromMap) return phoneFromMap
    }
    if (ids.length === 0) return ''
    if (bossIds.length !== 1) return ''
    const bossId = bossIds[0]
    const fromMap = String(collaboratorPhoneById[String(bossId)] || '').trim()
    if (fromMap) return fromMap
    const boss = (crewMembers || []).find((c: any) => String(c?.id || '') === bossId)
    if (boss) {
      return String(boss?.phone || boss?.telefono || boss?.mobile || boss?.cell || '').trim()
    }
    const fromMemberPosition = (crewMembers || []).find((c: any) => {
      return isFieldBossPosition(c?.position || c?.posicion)
    })
    return String(fromMemberPosition?.phone || fromMemberPosition?.telefono || fromMemberPosition?.mobile || fromMemberPosition?.cell || '').trim()
  }, [selectedCrewIdsForBoss, crews, collaboratorPhoneById, crewMembers, selectedReport, turnoPresentWorkers, isFieldBossPosition, turnoFieldBoss])

  const buildReportDraftFingerprint = useCallback(() => {
    const normalizeAssignments = (rows: any[]) => (Array.isArray(rows) ? rows : []).map((row: any) => ({
      activityId: String(row?.activityId || row?.id || ''),
      lineNumber: Number(row?.lineNumber ?? row?.item_number ?? 0) || 0,
      activity: String(row?.activity || ''),
      description: String(row?.description || ''),
      execution_description: String(row?.execution_description || ''),
      quantity: Number(row?.quantity ?? 0) || 0,
      program_quantity: Number(row?.program_quantity ?? 0) || 0,
      unit: String(row?.unit || ''),
      area: String(row?.area || ''),
      discipline: String(row?.discipline || ''),
      time_classification: String(row?.time_classification || ''),
      time_reason: String(row?.time_reason || '')
    }))
    const normalizePersonnel = (rows: any[]) => (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: String(row?.id || row?.collaborator_id || row?.user_id || row?.name || ''),
      name: String(row?.name || ''),
      role: String(row?.role || row?.position || ''),
      document: String(row?.document || ''),
      area: String(row?.area || '')
    }))
    const normalizeEquipment = (rows: any[]) => (Array.isArray(rows) ? rows : []).map((row: any) => ({
      code: String(row?.code || ''),
      description: String(row?.description || ''),
      activity_desc: String(row?.activity_desc || ''),
      area: String(row?.area || ''),
      extra_hours: Number(row?.extra_hours ?? 0) || 0
    }))
    const normalizeMaterials = (rows: any[]) => (Array.isArray(rows) ? rows : []).map((row: any) => ({
      description: String(row?.description || ''),
      unit: String(row?.unit || ''),
      area: String(row?.area || '')
    }))
    return JSON.stringify({
      editMode: !!editMode,
      reportId: String(selectedReport?.id || ''),
      reportDate: String(reportDate || ''),
      supervisor: String(supervisor || ''),
      capataz: String(capataz || ''),
      specialty: String(specialty || ''),
      workFront: String(workFront || ''),
      reportCrewIds: Array.isArray(reportCrewIds) ? reportCrewIds.map(String) : [],
      turno: String(turno || ''),
      area: String(area || ''),
      areaAssignmentMode: String(areaAssignmentMode || ''),
      personAreaById: personAreaById || {},
      startTime: String(startTime || ''),
      endTime: String(endTime || ''),
      restrictions: String(restrictions || ''),
      weather: weather || {},
      assignments: normalizeAssignments(assignedActivities || []),
      personnel: normalizePersonnel(personnel || []),
      personHours: personHours || {},
      personExtraHours: personExtraHours || {},
      equipmentEntries: normalizeEquipment(equipmentEntries || []),
      equipmentHours: equipmentHours || {},
      materialEntries: normalizeMaterials(materialEntries || []),
      materialQuantities: materialQuantities || {},
      activityObservations: activityObservations || {},
      generalEventsAnswers: generalEventsAnswers || [],
      generalEventsComments: generalEventsComments || [],
      emittedById: String(emittedById || ''),
      reportTitle: String(reportTitle || ''),
      reportSequenceNo: String(reportSequenceNo || ''),
      fieldBossName: String(fieldBossName || ''),
      fieldBossPhone: String(fieldBossPhone || '')
    })
  }, [
    editMode,
    selectedReport?.id,
    reportDate,
    supervisor,
    capataz,
    specialty,
    workFront,
    reportCrewIds,
    turno,
    area,
    areaAssignmentMode,
    personAreaById,
    startTime,
    endTime,
    restrictions,
    weather,
    assignedActivities,
    personnel,
    personHours,
    personExtraHours,
    equipmentEntries,
    equipmentHours,
    materialEntries,
    materialQuantities,
    activityObservations,
    generalEventsAnswers,
    generalEventsComments,
    emittedById,
    reportTitle,
    reportSequenceNo,
    fieldBossName,
    fieldBossPhone
  ])

  const markReportDraftChangedByUser = useCallback(() => {
    const isViewOnly = !editMode && !!selectedReport
    if (isViewOnly) return
    userTouchedDraftRef.current = true
    setDraftUserChanged(true)
  }, [editMode, selectedReport])

  const hasUnsavedReportChanges = useMemo(() => {
    if (!open) return false
    if (!draftUserChanged) return false
    const base = initialDraftFingerprintRef.current
    if (!base) return false
    return base !== buildReportDraftFingerprint()
  }, [open, draftUserChanged, buildReportDraftFingerprint])

  const requestCloseReportModal = useCallback(() => {
    const isViewOnly = !editMode && !!selectedReport
    if (isViewOnly) {
      closeReportModal('manual')
      return
    }
    if (!initialDraftFingerprintRef.current) {
      initialDraftFingerprintRef.current = buildReportDraftFingerprint()
      draftFingerprintCapturedRef.current = true
      closeReportModal('manual')
      return
    }
    if (!hasUnsavedReportChanges) {
      closeReportModal('manual')
      return
    }
    setConfirmCloseReportOpen(true)
  }, [editMode, selectedReport, buildReportDraftFingerprint, hasUnsavedReportChanges])

  useEffect(() => {
    if (!open) return
    if (draftFingerprintCapturedRef.current && draftUserChanged) return
    if (selectedReportHydrationStatus !== 'ready' || reportHydrating) return
    const defer = typeof window !== 'undefined' ? window.setTimeout : setTimeout
    const timer = defer(() => {
      if (userTouchedDraftRef.current || draftUserChanged) return
      initialDraftFingerprintRef.current = buildReportDraftFingerprint()
      draftFingerprintCapturedRef.current = true
    }, 0)
    return () => {
      clearTimeout(timer as ReturnType<typeof setTimeout>)
    }
  }, [open, draftUserChanged, selectedReportHydrationStatus, reportHydrating, buildReportDraftFingerprint])

  const resolvePhonesFromPeopleLabel = useCallback((label: string) => {
    const raw = String(label || '').trim()
    if (!raw) return ''
    const parts = raw
      .split(/\s*\/\s*|\s*;\s*|\s*,\s*|\s+y\s+/i)
      .map((p) => p.trim())
      .filter(Boolean)
    const phones = parts
      .map((name) => String(collaboratorPhoneByNameNorm[normalizeText(name)] || '').trim())
      .filter(Boolean)
    return Array.from(new Set(phones)).join(' / ')
  }, [collaboratorPhoneByNameNorm])
  const supervisorPhone = useMemo(() => resolvePhonesFromPeopleLabel(supervisor), [resolvePhonesFromPeopleLabel, supervisor])
  const capatazPhone = useMemo(() => resolvePhonesFromPeopleLabel(capataz), [resolvePhonesFromPeopleLabel, capataz])
  const emittedByWorker = useMemo(() => {
    const fromPresence = (otPresentWorkers || []).find((w) => String(w.id) === String(emittedById))
    if (fromPresence) return fromPresence
    const fallbackName = String(selectedReport?.emitted_by_name || '').trim()
    if (!fallbackName) return null
    return {
      id: String(emittedById || selectedReport?.emitted_by_id || ''),
      name: fallbackName,
      position: String(selectedReport?.emitted_by_position || '').trim()
    }
  }, [otPresentWorkers, emittedById, selectedReport?.emitted_by_name, selectedReport?.emitted_by_position, selectedReport?.emitted_by_id])
  const emittedByOptionMissing = useMemo(() => {
    const id = String(emittedById || '').trim()
    if (!id) return false
    return !(otPresentWorkers || []).some((w) => String(w.id || '') === id)
  }, [otPresentWorkers, emittedById])

  useEffect(() => {
    // populate header fields from the selected crew (single crew only). For multiple, show unique values.
    const isViewOnly = !editMode && !!selectedReport
    const selectedSupervisor = String(selectedReport?.supervisor || selectedReport?.supervisor_name || selectedReport?.supervisor_display_name || '').trim()
    const selectedCapataz = String(selectedReport?.capataz || selectedReport?.capataz_name || selectedReport?.foreman || '').trim()
    const uniq = (vals: string[]) => Array.from(new Set(vals.map((v) => String(v).trim()).filter(Boolean)))
    const toArrayLocal = (value: any) => {
      if (Array.isArray(value)) return value
      if (value == null || value === '') return []
      return [value]
    }
    const crewSupervisorValue = (crew: any) => uniq([
      ...toArrayLocal(crew?.supervisors),
      ...toArrayLocal(crew?.supervisor),
      crew?.supervisor_name,
      !isViewOnly ? crew?.leader : ''
    ]).join(', ')
    const crewCapatazValue = (crew: any) => uniq([
      ...toArrayLocal(crew?.foremen),
      ...toArrayLocal(crew?.capataz),
      ...toArrayLocal(crew?.foreman)
    ]).join(', ')
    const effectiveIds = effectiveCrewIdsForHeader
    if (!effectiveIds || effectiveIds.length === 0) return
    if (effectiveIds.length !== 1) {
      const ids = effectiveIds
      const crewNumber = (name: string) => {
        const m = String(name || '').match(/\b(\d+)\b/)
        return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
      }
      const selectedCrews = crews
        .filter((c) => ids.includes(String(c.id)))
        .sort((a, b) => {
          const na = crewNumber(a?.name || '')
          const nb = crewNumber(b?.name || '')
          if (na !== nb) return na - nb
          return String(a?.name || '').localeCompare(String(b?.name || ''), 'es')
        })
      const specialties = uniq(selectedCrews.map((c) => (c.specialty as string) ?? (c.especialidad as string) ?? (c.discipline as string) ?? '').filter(Boolean))
      if (specialties.length > 0) setSpecialty(specialties.join(', '))
      if (!selectedReport) setCrewMembers([])

      let cancelled = false
      ;(async () => {
        try {
          const fullByCrew = await Promise.all(
            ids.map(async (crewId: string) => {
              const id = String(crewId || '')
	              const full = await loadCrewFullCached(id, { force: !isViewOnly })
              const crewName = selectedCrews.find((c) => String(c.id) === id)?.name || ''
              const collabs = Array.isArray(full?.collaborators) ? full.collaborators : []
              return collabs.map((c: any) => ({ ...c, crewName }))
            })
          )
          const results = fullByCrew
          if (cancelled) return
          const collaborators = results.flat().filter(Boolean) as any[]
          // merge collaborators by id to avoid duplicates
          const byId = new Map<string, any>()
          collaborators.forEach((c: any) => {
            const cid = String(c?.id || '')
            if (!cid) return
            if (!byId.has(cid)) byId.set(cid, c)
          })
          const uniqueCollaborators = Array.from(byId.values()).sort((a: any, b: any) => {
            const na = crewNumber(a?.crewName || '')
            const nb = crewNumber(b?.crewName || '')
            if (na !== nb) return na - nb
            const ca = String(a?.crewName || '')
            const cb = String(b?.crewName || '')
            if (ca !== cb) return ca.localeCompare(cb, 'es')
            const nameA = `${a?.first_name || ''} ${a?.last_name || ''}`.trim()
            const nameB = `${b?.first_name || ''} ${b?.last_name || ''}`.trim()
            return nameA.localeCompare(nameB, 'es')
          })
          const normalize = (v: any) => (v ? String(v).toLowerCase() : '')
          const personName = (c: any) => (c && (c.first_name || c.last_name) ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : (c && c.name) || '')
          const supervisors = uniq(uniqueCollaborators
            .filter((c) => {
              const pos = normalize(c?.position)
              return pos.includes('supervisor') || pos.includes('jefe') || pos.includes('coordinador')
            })
            .map(personName)
            .filter(Boolean))
          const capataces = uniq(uniqueCollaborators
            .filter((c) => {
              const pos = normalize(c?.position)
              return pos.includes('capataz') || pos.includes('foreman') || pos.includes('encargado')
            })
            .map(personName)
            .filter(Boolean))
          setCrewMembers(uniqueCollaborators)
          if (!isViewOnly || !selectedSupervisor) {
            if (supervisors.length > 0) {
              setSupervisor(supervisors.join(', '))
            } else {
              const fallbackSup = uniq(selectedCrews.map(crewSupervisorValue).filter(Boolean))
              setSupervisor(fallbackSup.join(', '))
            }
          }
          if (!isViewOnly || !selectedCapataz) {
            if (capataces.length > 0) {
              setCapataz(capataces.join(', '))
            } else {
              const fallbackCap = uniq(selectedCrews.map(crewCapatazValue).filter(Boolean))
              setCapataz(fallbackCap.join(', '))
            }
          }
        } catch {
          if (cancelled) return
          if (!isViewOnly || !selectedSupervisor) {
            const fallbackSup = uniq(selectedCrews.map(crewSupervisorValue).filter(Boolean))
            setSupervisor(fallbackSup.join(', '))
          }
          if (!isViewOnly || !selectedCapataz) {
            const fallbackCap = uniq(selectedCrews.map(crewCapatazValue).filter(Boolean))
            setCapataz(fallbackCap.join(', '))
          }
        }
      })()

      return () => { cancelled = true }
    }
    const crewId = effectiveIds[0]

    ;(async () => {
      try {
        // Prefer the full crew endpoint which returns collaborators with details
	        const data = await loadCrewFullCached(String(crewId), { force: !isViewOnly })
        if (!data) {
          // fallback to local crews array
          const crew = crews.find((c) => String(c.id) === String(crewId))
          if (crew) {
            if (!isViewOnly || !selectedSupervisor) setSupervisor(crewSupervisorValue(crew))
            if (!isViewOnly || !selectedCapataz) setCapataz(crewCapatazValue(crew))
            setSpecialty((crew.specialty as string) ?? (crew.especialidad as string) ?? (crew.discipline as string) ?? '')
          }
          return
        }
        const crew = data?.crew
        const collaborators: any[] = data?.collaborators || []
        const crewName = (crew && crew.name) || ''
        setCrewMembers((collaborators || []).map((c: any) => ({ ...c, crewName })))

        const normalize = (v: any) => (v ? String(v).toLowerCase() : '')
        const byPosition = (posKeyword: string) => collaborators.find((c) => normalize(c.position).includes(posKeyword))

        const personName = (c: any) => (c && (c.first_name || c.last_name) ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : (c && c.name) || '')
        const supervisorNames = uniq(collaborators
          .filter((c) => {
            const pos = normalize(c?.position)
            return pos.includes('supervisor') || pos.includes('jefe') || pos.includes('coordinador')
          })
          .map(personName)
          .filter(Boolean))
        const capatazNames = uniq(collaborators
          .filter((c) => {
            const pos = normalize(c?.position)
            return pos.includes('capataz') || pos.includes('foreman') || pos.includes('encargado')
          })
          .map(personName)
          .filter(Boolean))

        const shouldSetSupervisor = (!isViewOnly || !selectedSupervisor || supervisorNames.length > 1)
        const shouldSetCapataz = (!isViewOnly || !selectedCapataz || capatazNames.length > 1)

        if (shouldSetSupervisor) {
          const crewSupervisor = crewSupervisorValue(crew)
          setSupervisor((supervisorNames.join(', ') || crewSupervisor || '').trim())
        }
        if (shouldSetCapataz) {
          setCapataz((capatazNames.join(', ') || crewCapatazValue(crew) || '').trim())
        }

        // La especialidad del reporte debe venir de la cuadrilla.
        // Antes se preferia supervisor, lo que podia dejar RIGGER como otra especialidad.
        const supCandidate = collaborators.find((c) => {
          const pos = normalize(c?.position)
          return pos.includes('supervisor') || pos.includes('jefe') || pos.includes('coordinador')
        }) || null
        const riggerCandidate = collaborators.find((c) => {
          const pos = normalize(c?.position)
          const spec = normalize(c?.specialty)
          return pos.includes('rigger') || spec.includes('rigger')
        }) || null
        const reportSpecialty = String(selectedReport?.specialty || selectedReport?.especialidad || selectedReport?.discipline || '').trim()

        const crewSpecialty = String(
          (crew && (crew.specialty || crew.especialidad || crew.discipline)) || ''
        ).trim()

        const specialtyVal = reportSpecialty || crewSpecialty

        if (!isViewOnly || !reportSpecialty) {
          setSpecialty(specialtyVal || '')
        }
      } catch (err) {
        console.warn('Could not load crew collaborators for header', err)
        // fallback to local crews
        const crew = crews.find((c) => String(c.id) === String(crewId))
        if (crew) {
          if (!isViewOnly || !selectedSupervisor) setSupervisor(crewSupervisorValue(crew))
          if (!isViewOnly || !selectedCapataz) setCapataz(crewCapatazValue(crew))
          const reportSpecialty = String(selectedReport?.specialty || selectedReport?.especialidad || selectedReport?.discipline || '').trim()
          const crewSpecialty = String((crew.specialty as string) ?? (crew.especialidad as string) ?? (crew.discipline as string) ?? '').trim()

          if (!isViewOnly || !reportSpecialty) {
            setSpecialty(reportSpecialty || crewSpecialty || '')
          }
          setCrewMembers((crew && (crew.members || crew.collaborators)) || [])
        }
      }
    })()
  }, [crews, effectiveCrewIdsForHeader, crewsForDate, editMode, selectedReport, loadCrewFullCached])

  useEffect(() => {
    if (!open) return
    if (!isUserRole) return
    if (selectedReportHydrationStatus === 'loading') {
      if (process.env.NODE_ENV !== 'production' && selectedReport?.id) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
          event: 'blocked-stale-effect',
          effectName: 'loadAssignedActivitiesForCrewsDate',
          selectedReportId: String(selectedReport.id),
          v2StateReportId: String(v2StateReportId || ''),
          reason: 'hydration-loading'
        })
      }
      return
    }
    const isViewOnly = !editMode && !!selectedReport
    if (isViewOnly) return
    // In edit mode with an existing report, keep report assignments as source of truth.
    // Reloading from crew/day here would overwrite persisted evidence_files.
    if (editMode && !!selectedReport) return
    if (!reportCrewIds || reportCrewIds.length === 0 || !reportDate) {
      setAssignedActivities([])
      return
    }
    const ids = reportCrewIds
    if (FIELD_REPORTS_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][V1] trigger load from effect', {
        open,
        editMode,
        isUserRole,
        reportDate,
        reportCrewIds,
        crewsForDateCount: crewsForDate.length,
        ids
      })
    }
    loadAssignedActivitiesForCrewsDate(ids, reportDate)
  }, [open, selectedReport, editMode, isUserRole, reportCrewIds, reportDate, crewsForDate, loadAssignedActivitiesForCrewsDate, FIELD_REPORTS_DEBUG, selectedReportHydrationStatus, v2StateReportId])

  useEffect(() => {
    if (!open) return
    if (!selectedReport) return
    if (selectedReportHydrationStatus === 'loading') {
      if (process.env.NODE_ENV !== 'production' && selectedReport?.id) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][modal][switch]', {
          event: 'blocked-stale-effect',
          effectName: 'sync-existing-report-activities',
          selectedReportId: String(selectedReport.id),
          v2StateReportId: String(v2StateReportId || ''),
          reason: 'hydration-loading'
        })
      }
      return
    }
    const isViewOnly = !editMode && !!selectedReport
    if (isViewOnly) return
    if (!reportCrewIds || reportCrewIds.length === 0 || !reportDate) return
    let cancelled = false
    ;(async () => {
      try {
        const uniqueIds = Array.from(new Set(reportCrewIds.map(String).filter(Boolean)))
        // Always refresh assignments snapshot from crews when editing/viewing a saved report
        // so add/remove/reorder done in /users/crews is reflected here.
        uniqueIds.forEach((id) => {
          activityRowsByCrewDateCacheRef.current.delete(`${String(id)}::${String(reportDate)}`)
        })
        const results = await Promise.all(uniqueIds.map((id) => loadAssignedActivitiesForCrewDate(id, reportDate)))
        const latestRows = results.flat().map((a, idx) => ({ ...a, lineNumber: idx + 1 }))
        if (cancelled) return
        const previousRows = assignedActivitiesRef.current || []
        const hasStoredActivitySnapshot = selectedReport?.assignments != null || selectedReport?.activities != null
        if (previousRows.length === 0 && hasStoredActivitySnapshot) {
          // El efecto que hidrata el reporte corre antes que este; esperamos al siguiente render
          // para no perder cantidades, descripciones ejecutadas o evidencias ya guardadas.
          return
        }
        if (previousRows.length > 0 && latestRows.length === 0) {
          if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][crew-activities-sync]', {
            reportId: selectedReport?.id || null,
            reportDate,
            reportCrewIds: uniqueIds,
            skipped: true,
            reason: 'latest-empty-preserve-saved-order',
            previousCount: previousRows.length
          })
          return
        }
        const { merged, appendedCount, updatedCount, removedCount } = mergeAssignedActivitiesWithLatest(previousRows, latestRows as AssignedActivity[])
        const oldIndexByKey = new Map(previousRows.map((row, idx) => [activitySyncKey(row), idx]))
        const remapHoursByActivity = (values: Record<string, number[]> | null | undefined) => {
          const next: Record<string, number[]> = {}
          Object.entries(values || {}).forEach(([rowId, hours]) => {
            const oldHours = Array.isArray(hours) ? hours : []
            next[rowId] = merged.map((activityRow) => {
              const oldIndex = oldIndexByKey.get(activitySyncKey(activityRow))
              return oldIndex == null ? 0 : (Number(oldHours[oldIndex] || 0) || 0)
            })
          })
          return next
        }

        if (appendedCount > 0 || updatedCount > 0 || removedCount > 0) {
          setPersonHours((current) => remapHoursByActivity(current))
          setEquipmentHours((current) => remapHoursByActivity(current))
          setMaterialQuantities((current) => remapHoursByActivity(current))
          if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][crew-activities-sync]', {
            reportId: selectedReport?.id || null,
            reportDate,
            reportCrewIds: uniqueIds,
            previousCount: previousRows.length,
            latestCount: latestRows.length,
            appendedCount,
            updatedCount,
            removedCount
          })
          const changes: string[] = []
          if (appendedCount > 0) changes.push(`${appendedCount} nueva(s)`)
          if (updatedCount > 0) changes.push(`${updatedCount} actualizada(s)`)
          if (removedCount > 0) changes.push(`${removedCount} eliminada(s)`)
          showSnackbar(`Actividades sincronizadas desde cuadrillas: ${changes.join(', ')}`, 'info')
          setAssignedActivities(merged)
        }
      } catch (e) {
        console.warn('No se pudo sincronizar actividades nuevas para reporte existente', e)
      }
    })()
    return () => { cancelled = true }
  }, [open, selectedReport, editMode, reportCrewIds, reportDate, assignedActivities.length, loadAssignedActivitiesForCrewDate, mergeAssignedActivitiesWithLatest, activitySyncKey, selectedReportHydrationStatus, v2StateReportId])

  useEffect(() => {
    if (!open) {
      const defer = typeof window !== 'undefined' ? window.setTimeout : setTimeout
      defer(() => {
        setPendingEvidenceFiles((prev) => {
          const all = Object.values(prev).flat()
          if (all.length === 0) return prev
          all.forEach((x) => {
            try { URL.revokeObjectURL(x.previewUrl) } catch {}
          })
          return {}
        })
        setEvidenceDialogOpen(false)
        setEvidenceDialogRowIndex(null)
        setEvidenceDragOver(false)
      }, 0)
    }
  }, [open])

  useEffect(() => {
    const isViewOnly = !editMode && !!selectedReport
    if (!open || !isUserRole || isViewOnly) return
    if (editMode && !!selectedReport) return
    if (!reportCrewIds || reportCrewIds.length === 0) return
    if (!reportDate) return
    if ((availableCrewIdsForDate || []).length === 0) return
    const filtered = reportCrewIds.filter((id) => availableCrewIdSet.has(String(id)))
    if (filtered.length !== reportCrewIds.length) {
      setReportCrewIds(filtered)
      setAssignedActivities([])
    }
  }, [open, isUserRole, selectedReport, editMode, reportCrewIds, reportDate, availableCrewIdsForDate, availableCrewIdSet, crewsForDate])

  // Shared styles for tables and section titles to keep uniform appearance
  const sectionTitleSx = { fontSize: '1rem', mb: 1, color: colors.blue1, textTransform: 'uppercase', letterSpacing: '0.02em', fontWeight: 700 }
  const tableContainerStyle: React.CSSProperties = { overflowX: 'auto', border: '1px solid #ddd' }
  const tableStyle: React.CSSProperties = { borderCollapse: 'collapse', width: '100%', minWidth: 900 }
  const thStyle: React.CSSProperties = { border: '1px solid #ccc', padding: '8px 10px', background: '#f5f5f5', fontWeight: 700, fontSize: 13, textAlign: 'center' }
  const tdStyle: React.CSSProperties = { border: '1px solid #eee', padding: '8px 10px', fontSize: 13, verticalAlign: 'middle' }
  const activityThStyle: React.CSSProperties = { ...thStyle, width: 90 }
  const activityTdStyle: React.CSSProperties = { ...tdStyle, textAlign: 'center' }
  const equipmentRowsCount = useMemo(() => Math.max(equipmentEntries?.length || 0, 1), [equipmentEntries])
  const materialRowsCount = useMemo(() => Math.max(materialEntries?.length || 0, 1), [materialEntries])
  const supportRowsCount = useMemo(() => Math.max(equipmentRowsCount, materialRowsCount), [equipmentRowsCount, materialRowsCount])

  useEffect(() => {
    // initialize equipmentHours entries for support rows when activities change
    const rows = equipmentRowsCount
    if (activityCount === 0) {
      setEquipmentHours({})
      return
    }
    setEquipmentHours((prev) => {
      const copy: Record<string, number[]> = { ...prev }
      for (let i = 0; i < rows; i++) {
        const id = `equip-${i}`
        if (!copy[id]) copy[id] = new Array(activityCount).fill(0)
        else if (copy[id].length !== activityCount) {
          const arr = [...copy[id]]
          if (arr.length < activityCount) while (arr.length < activityCount) arr.push(0)
          else if (arr.length > activityCount) arr.length = activityCount
          copy[id] = arr
        }
      }
      return copy
    })
  }, [activityCount, equipmentRowsCount])

  useEffect(() => {
    // keep at least one visible equipment row without coupling it to activity count
    setEquipmentEntries((prev) => {
      const copy = [...(prev || [])]
      if (activityCount === 0) return []
      if (copy.length === 0) copy.push({})
      return copy
    })
  }, [activityCount])

  useEffect(() => {
    // keep at least one visible material row
    setMaterialEntries((prev) => {
      const copy = [...(prev || [])]
      if (copy.length === 0) copy.push({})
      return copy
    })
  }, [])

  useEffect(() => {
    if (activityCount === 0) {
      setMaterialQuantities({})
      return
    }
    setMaterialQuantities((prev) => {
      const copy: Record<string, number[]> = { ...prev }
      const rows = materialRowsCount
      for (let i = 0; i < rows; i++) {
        const id = `material-${i}`
        if (!copy[id]) copy[id] = new Array(activityCount).fill(0)
        else if (copy[id].length !== activityCount) {
          const arr = [...copy[id]]
          if (arr.length < activityCount) while (arr.length < activityCount) arr.push(0)
          else if (arr.length > activityCount) arr.length = activityCount
          copy[id] = arr
        }
      }
      return copy
    })
  }, [activityCount, materialRowsCount])

  const handleSave = async () => {
    if (isReadOnlyRole) {
      showSnackbar('Este módulo es solo lectura', 'warning')
      return
    }
    if (!hasUnsavedReportChanges) {
      showSnackbar('No hay cambios para guardar', 'info')
      return
    }
    perfSaveStartedAtRef.current = nowMs()
    perfSavePayloadStartAtRef.current = null
    perfSavePayloadEndAtRef.current = null
    perfSaveApiStartAtRef.current = null
    perfSaveApiEndAtRef.current = null
    perfSaveRefreshStartAtRef.current = null
    perfSaveRefreshEndAtRef.current = null
    perfSaveCloseVisualAtRef.current = null
    perfSavePendingSummaryRef.current = null
    perfRequestCountByScopeRef.current['save'] = 0
    perfMark('fr-save-start')
    setSaving(true)
    try {
      if (selectableCrewIdsForDate.length === 0) {
        showSnackbar('No hay cuadrillas disponibles para esa fecha', 'warning')
        return
      }
      const invalidQty = (assignedActivities || []).some((a: any) => {
        const max = toNonNegativeNumber(a?.program_quantity ?? 0)
        const val = toNonNegativeNumber(a?.quantity ?? 0)
        // For quick/manual activities program quantity can be 0 or empty:
        // in that case, do not enforce the "executed <= program" cap.
        if (max <= 0) return false
        return val > max
      })
      if (invalidQty) {
        showSnackbar('Cantidad no puede ser mayor a Cantidad Programa', 'warning')
        return
      }
      const exceededMachine = Array.from(crossReportMachineDayHoursByKey.entries()).find(([, total]) => Number(total || 0) > MAX_MACHINE_HOURS_WITH_OVERTIME + 0.000001)
      if (exceededMachine) {
        showSnackbar('Hay maquinaria con más de 15 horas diarias entre reportes. Ajusta antes de guardar.', 'warning')
        return
      }
      const nonOperationalEquipment = (equipmentEntries || []).find((entry: any, rowIdx: number) =>
        isKnownNonOperationalEquipment(entry) && hasEquipmentUse(entry, rowIdx)
      )
      if (nonOperationalEquipment) {
        const nonOperationalAny = nonOperationalEquipment as any
        const name = String(nonOperationalAny?.description || nonOperationalAny?.equipment_name || 'equipo').trim()
        const patent = String(nonOperationalAny?.code || nonOperationalAny?.patent || '').trim()
        showSnackbar(`No puedes usar ${name.toUpperCase()}${patent ? ` (${patent.toUpperCase()})` : ''}: no está operativa en Maquinaria / Equipos.`, 'warning')
        return
      }
      let assignmentsForSave = [...(assignedActivities || [])].map((row: any) => ({
        ...row,
        // Persistir explícitamente columnas nuevas del bloque ACTIVIDADES
        time_classification: String(row?.time_classification ?? row?.timeClassification ?? '').trim(),
        time_reason: String(row?.time_reason ?? row?.timeReason ?? '').trim()
      }))
      const hasPendingEvidence = Object.values(pendingEvidenceFiles).some((arr) => Array.isArray(arr) && arr.length > 0)
      if (hasPendingEvidence) {
        for (let idx = 0; idx < assignmentsForSave.length; idx++) {
          const row = assignmentsForSave[idx]
          const rowKey = evidenceRowKey(row, idx)
          const pending = pendingEvidenceFiles[rowKey] || []
          if (pending.length === 0) continue
          const uploaded = await uploadEvidenceForRow(row, pending, idx)
          const current = parseEvidenceFiles(row.evidence_files)
          assignmentsForSave[idx] = {
            ...row,
            evidence_files: [...current, ...uploaded].slice(0, 5)
          }
        }
        setAssignedActivities(assignmentsForSave)
      }
      // derive collaborator UUIDs where possible (prefer IDs over duplicating names)
      const normalizePos = (v: any) => (v ? String(v).toLowerCase() : '')
      const supColl = (crewMembers || []).find((c: any) => normalizePos(c.position).includes('supervisor') || normalizePos(c.position).includes('jefe'))
      const capColl = (crewMembers || []).find((c: any) => normalizePos(c.position).includes('capataz') || normalizePos(c.position).includes('foreman'))
      const personnelIds = (filteredCrewMembers || []).map((m: any) => m && m.id).filter(Boolean)

      const uniqueCrewIds = Array.from(new Set((assignmentsForSave || []).map((a) => String(a.crewId)).filter(Boolean)))
      const uniqueCrewNames = Array.from(new Set((assignmentsForSave || []).map((a) => String(a.crewName)).filter(Boolean)))
      const selectedIds = reportCrewIds
      const crewIdsForSave = Array.from(new Set((uniqueCrewIds.length > 0 ? uniqueCrewIds : selectedIds).map(String).filter(Boolean)))
      const singleCrewId = crewIdsForSave.length === 1 ? crewIdsForSave[0] : null
      const crewNameValue = uniqueCrewNames.length === 1
        ? uniqueCrewNames[0]
        : (reportCrewNameLabel || null)
      const hasUsedCrewCollision = crewIdsForSave.some((id) => usedCrewIdsByDate.has(String(id)))
      if (hasUsedCrewCollision) {
        showSnackbar('Una cuadrilla ya tiene reporte en esa fecha.', 'warning')
        return
      }
      if (!String(workFront || '').trim()) {
        showSnackbar('Debes seleccionar un Frente antes de guardar.', 'warning')
        return
      }
      const mustRequireEmitter = reportDesignVersion === 'V2' || isUserRole
      const emittedIdForSave = String(emittedById || selectedReport?.emitted_by_id || selectedReport?.emitido_por_id || '').trim()
      if (mustRequireEmitter) {
        const savedEmitterId = String(selectedReport?.emitted_by_id || selectedReport?.emitido_por_id || '').trim()
        const validEmitter = emittedIdForSave && (
          (otPresentWorkers || []).some((w) => String(w.id || '') === emittedIdForSave) ||
          (!!selectedReport?.id && savedEmitterId === emittedIdForSave)
        )
        if (!validEmitter) {
          showSnackbar('Debes seleccionar un Secretario Técnico en "Emitido por" antes de guardar.', 'warning')
          return
        }
      }

      const personnelRowsForSave = (personnelRows || []).map((row: any, rowIdx: number) => {
        const personId = String(row?.personId || row?.id || row?.collaborator_id || row?.user_id || `person-${rowIdx}`)
        return {
          id: personId,
          collaborator_id: personId,
          role: row?.position || '',
          name: String(row?.name || '').trim(),
          document: String(row?.document || '').trim(),
          crewName: row?.crewName || '',
          area: resolveAreaByMode(personAreaById[personId] || row?.area || area) || null
        }
      })
      const fallbackPersonnelForSave = Array.isArray(personnel)
        ? personnel.map((p: any, idx: number) => {
            const personId = String(p?.id || p?.collaborator_id || p?.user_id || p?.name || `person-${idx}`)
            return {
              ...p,
              area: resolveAreaByMode(personAreaById[personId] || p?.area || area) || null
            }
          })
        : []
      const personnelForSave = personnelRowsForSave.length > 0 ? personnelRowsForSave : fallbackPersonnelForSave
      const equipmentEntriesForSave = (equipmentEntries || []).map((entry: any) => ({
        ...entry,
        extra_hours: Math.max(0, Number(entry?.extra_hours ?? 0) || 0),
        area: resolveAreaByMode(entry?.area || '') || null
      }))
      const materialEntriesForSave = (materialEntries || []).map((entry: any) => ({
        ...entry,
        area: resolveAreaByMode(entry?.area || '') || null
      }))

      perfSavePayloadStartAtRef.current = nowMs()
      perfMark('fr-save-payload-build-start')
      const payload = {
        design_version: reportDesignVersion,
        emitted_by_id: emittedIdForSave || null,
        date: reportDate,
        report_sequence_no: reportSequenceNo,
        report_title: reportTitle,
        field_boss_name: fieldBossName || null,
        field_boss_phone: fieldBossPhone || null,
        // keep human-readable names for convenience, but prefer the UUID refs below
        supervisor,
        capataz,
        specialty,
        work_front_id: selectedWorkFrontOption?.id || null,
        work_front: String(workFront || '').trim(),
        supervisor_id: supColl?.id ?? null,
        capataz_id: capColl?.id ?? null,
        crew_id: singleCrewId,
        crew_ids: crewIdsForSave.length > 0 ? crewIdsForSave : null,
        crew_name: crewNameValue,
        personnel_ids: personnelIds,
        weather,
        turno,
        area: area || (assignedActivities && assignedActivities.length > 0 ? (assignedActivities[0].area ?? null) : null),
        start_time: startTime,
        end_time: endTime,
        activities: assignmentsForSave && assignmentsForSave.length > 0 ? assignmentsForSave : reportActivities,
        assignments: assignmentsForSave,
        restrictions,
        personnel: personnelForSave,
        person_hours: { ...(personHours || {}), __extras: personExtraHours || {} },
        equipment_entries: equipmentEntriesForSave,
        equipment_hours: equipmentHours,
        material_entries: materialEntriesForSave,
        material_quantities: materialQuantities,
        activity_observations: activityObservations,
        general_events_answers: generalEventsAnswers,
        general_events_comments: generalEventsComments
      }
      perfSavePayloadEndAtRef.current = nowMs()
      perfMark('fr-save-payload-build-end')

      if (FIELD_REPORTS_DEV_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][save] payload summary', {
          method: editMode && selectedReport?.id ? 'PUT' : 'POST',
          reportId: String(selectedReport?.id || ''),
          crewIdsCount: Array.isArray(crewIdsForSave) ? crewIdsForSave.length : 0,
          assignmentsCount: Array.isArray(assignmentsForSave) ? assignmentsForSave.length : 0,
          personnelCount: Array.isArray(personnelForSave) ? personnelForSave.length : 0
        })
      }

      // Decide POST (new) or PUT (update)
      const method = editMode && selectedReport?.id ? 'PUT' : 'POST'
      const url = '/api/field-reports'
      const bodyToSend = editMode && selectedReport?.id ? { ...payload, id: selectedReport.id } : payload
      perfSaveApiStartAtRef.current = nowMs()
      perfMark('fr-save-api-start')
      perfCountRequest('save', url)
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyToSend)
      })
      perfSaveApiEndAtRef.current = nowMs()
      perfMark('fr-save-api-end')

      if (!response.ok) {
        const text = await response.text()
        let errorData: any = null
        try { errorData = JSON.parse(text) } catch {}
        if (response.status === 409) {
          showSnackbar('Una cuadrilla ya tiene reporte en esa fecha.', 'warning')
          return
        }
        console.error('❌ Error del servidor:', errorData || text)
        throw new Error((errorData && errorData.error) || text || 'Error al guardar')
      }

      const savedData = await response.json()
      const savedDateKey = String(savedData?.date || reportDate || '').slice(0, 10)
      if (savedDateKey) {
        fieldReportHoursSummaryByDateCacheRef.current.delete(savedDateKey)
        fieldReportHoursSummaryByDateInFlightRef.current.delete(savedDateKey)
      }
      if (savedData?.id) rememberFieldReportDetail(savedData)
      const omittedFields = Array.isArray(savedData?._omitted_fields) ? savedData._omitted_fields.map((x: any) => String(x)) : []
      if (FIELD_REPORTS_DEV_DEBUG) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[field-reports][save] completed', {
          method,
          reportId: String(savedData?.id || selectedReport?.id || ''),
          savedFieldsCount: Array.isArray(savedData?._saved_fields) ? savedData._saved_fields.length : undefined,
          omittedFields
        })
      }
      await syncCrewActivityUserDetails(assignmentsForSave, reportDate)
      if (omittedFields.includes('emitted_by_id')) {
        showSnackbar('El reporte se guardó, pero falta aplicar la migración de "Emitido por" en la base de datos.', 'warning')
        return
      }
      showSnackbar(method === 'PUT' ? 'Reporte actualizado correctamente' : 'Reporte creado correctamente', 'success')

      // UI optimista: cerrar y resetear
      closeReportModal('save')
      setArea('')
      setAreaAssignmentMode('global')
      setPersonAreaById({})
      setStartTime('')
      setEndTime('')
      setReportActivities('')
      setAssignedActivities([])
      Object.values(pendingEvidenceFiles).flat().forEach((x) => {
        try { URL.revokeObjectURL(x.previewUrl) } catch {}
      })
      setPendingEvidenceFiles({})
      setRestrictions('')
      setPersonnel([])
      setPersonHours({})
      setPersonExtraHours({})
      setEquipmentEntries([])
      setEquipmentHours({})
      setActivityObservations({})

      // Recargar lista de reportes
      perfSaveRefreshStartAtRef.current = nowMs()
      perfMark('fr-save-refresh-start')
      await fetchReports({ force: true })
      perfSaveRefreshEndAtRef.current = nowMs()
      perfMark('fr-save-refresh-end')
      const startedAt = perfSaveStartedAtRef.current || nowMs()
      const payloadBuildMs = (
        perfSavePayloadStartAtRef.current != null && perfSavePayloadEndAtRef.current != null
      ) ? Math.round(perfSavePayloadEndAtRef.current - perfSavePayloadStartAtRef.current) : 0
      const apiMs = (
        perfSaveApiStartAtRef.current != null && perfSaveApiEndAtRef.current != null
      ) ? Math.round(perfSaveApiEndAtRef.current - perfSaveApiStartAtRef.current) : 0
      const visualCloseMs = perfSaveCloseVisualAtRef.current != null
        ? Math.round(perfSaveCloseVisualAtRef.current - startedAt)
        : 0
      const refreshMs = (
        perfSaveRefreshStartAtRef.current != null && perfSaveRefreshEndAtRef.current != null
      ) ? Math.round(perfSaveRefreshEndAtRef.current - perfSaveRefreshStartAtRef.current) : 0
      perfSavePendingSummaryRef.current = {
        startedAt,
        payloadBuildMs,
        apiMs,
        visualCloseMs,
        refreshMs,
        triggeredFetchReports: true
      }
    } catch (err) {
      console.error('Error saving report', err)
      showSnackbar('Error al guardar el reporte', 'error')
    } finally {
      setSaving(false)
    }
  }

  const normalizeJsonExport = (val: any) => {
    if (typeof val !== 'string') return val
    try { return JSON.parse(val) } catch { return val }
  }

  const notifyFieldReportsDayCompleted = async (date: string, reportCount: number) => {
    const safeDate = String(date || '').slice(0, 10)
    if (!safeDate) return
    setNotifyingCompletedDate(safeDate)
    try {
      const response = await fetch('/api/internal-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'field_reports_day_completed',
          date: safeDate,
          report_count: Math.max(0, Number(reportCount || 0) || 0),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'No se pudo enviar la notificación interna')
      const inserted = Number(payload?.inserted_count || 0)
      showSnackbar(
        inserted > 0
          ? `Notificación interna enviada a ${inserted} usuario${inserted === 1 ? '' : 's'}.`
          : (payload?.message || 'No hay destinatarios para notificar.'),
        inserted > 0 ? 'success' : 'info'
      )
    } catch (err: any) {
      showSnackbar(err?.message || 'No se pudo enviar la notificación interna', 'error')
    } finally {
      setNotifyingCompletedDate('')
    }
  }

  const normalizeToArrayExport = (val: any): any[] => {
    const parsed = normalizeJsonExport(val)
    if (!parsed) return []
    if (Array.isArray(parsed)) return parsed
    if (typeof parsed === 'object') {
      const obj = parsed as Record<string, any>
      if (Array.isArray(obj.rows)) return obj.rows
      if (Array.isArray(obj.items)) return obj.items
      if (Array.isArray(obj.data)) return obj.data
      const values = Object.values(obj)
      if (values.length > 0 && values.every((v) => v && typeof v === 'object')) return values
    }
    return []
  }

  const buildDetailedReportRows = (data: {
    designVersion?: string
    reportTitle?: string
    contractName?: string
    date?: string
    area?: string
    supervisor?: string
    supervisorId?: any
    supervisorPhone?: string
    capataz?: string
    capatazId?: any
    capatazPhone?: string
    jefeTerreno?: string
    jefeTerrenoPhone?: string
    emittedByName?: string
    emittedByPosition?: string
    specialty?: string
    turno?: string
    weather?: any
    workFront?: string
    restrictions?: string
    crewLabel?: string
    assignments?: any[]
    personnelRows?: Array<{ personId: string; document?: string; position: string; name: string; crewName?: string; area?: string }>
    personHours?: Record<string, number[]>
    personExtraHours?: Record<string, number>
    equipmentEntries?: Array<{ code?: string; description?: string; activity_desc?: string; extra_hours?: number | string }>
    materialEntries?: Array<{ description?: string; unit?: string; area?: string }>
    equipmentHours?: Record<string, number[]>
    materialQuantities?: Record<string, number[]>
    activityObservations?: Record<string, string>
    generalEventsAnswers?: Array<'si' | 'no' | string>
    generalEventsComments?: string[]
    collaboratorLookup?: Record<string, { name: string; position: string }>
    crewByPersonId?: Record<string, string>
    crewMembers?: any[]
  }) => {
    const splitCrewLabels = (value: any): string[] => {
      if (!value) return []
      return String(value)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    }
    const firstCrewLabel = (labels: string[]): string => {
      for (const label of labels) {
        if (label && label.trim()) return label.trim()
      }
      return ''
    }
    const formatPersonNameWithCrew = (nameValue: any, crewValue: any) => {
      const raw = String(nameValue || '').trim()
      const m = raw.match(/^(.*?)(?:\s*\((.*)\))?$/)
      const baseName = String(m?.[1] || '').trim() || '-'
      const fromName = splitCrewLabels(m?.[2] || '')
      const fromCrew = splitCrewLabels(crewValue)
      // Rule: a worker belongs to only one crew, so keep a single label.
      const crew = firstCrewLabel(fromCrew) || firstCrewLabel(fromName)
      return crew ? `${baseName} (${crew})` : baseName
    }

    const rows: any[][] = []
    const assignments = data.assignments || []
    const activitiesLen = Math.max(assignments.length, 1)
    const personRowsInput = data.personnelRows || []
    const equipmentEntriesData = data.equipmentEntries || []
    const materialEntriesData = data.materialEntries || []
    const equipmentLen = Math.max(equipmentEntriesData.length, 1)
    const personHoursData = data.personHours || {}
    const equipmentHoursData = data.equipmentHours || {}
    const materialQuantitiesData = data.materialQuantities || {}
    const activityObsData = data.activityObservations || {}
    const collaboratorLookup = data.collaboratorLookup || {}
    const crewByPersonId = data.crewByPersonId || {}
    const crewMembersData = Array.isArray(data.crewMembers) ? data.crewMembers : []
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const roleMatch = (pos: any, role: 'supervisor' | 'capataz') => {
      const p = String(pos || '').toLowerCase()
      if (role === 'supervisor') return p.includes('supervisor') || p.includes('jefe') || p.includes('coordinador')
      return p.includes('capataz') || p.includes('foreman') || p.includes('encargado')
    }
    const namesFromRole = (role: 'supervisor' | 'capataz') => {
      const out: string[] = []
      const seen = new Set<string>()
      crewMembersData.forEach((m: any) => {
        if (!roleMatch(m?.position, role)) return
        const name = `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || String(m?.name || '')
        if (!name) return
        const key = name.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        out.push(name)
      })
      return out
    }
    const toArray = (v: any): string[] => {
      if (!v) return []
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
      return String(v).split(',').map((x) => x.trim()).filter(Boolean)
    }
    const resolvePeopleField = (value: any, ids?: any, role?: 'supervisor' | 'capataz') => {
      const parts = toArray(value)
      const mapped = parts.map((token) => {
        const key = token.trim()
        if (uuidLike.test(key) && collaboratorLookup[key]?.name) return collaboratorLookup[key].name
        return key
      })
      const idTokens = toArray(ids)
      idTokens.forEach((id) => {
        const name = collaboratorLookup[id]?.name
        if (name) mapped.push(name)
      })
      if (mapped.length === 0 && role) mapped.push(...namesFromRole(role))
      const uniq: string[] = []
      const seen = new Set<string>()
      mapped.forEach((m) => {
        if (!m) return
        const k = m.toLowerCase()
        if (seen.has(k)) return
        seen.add(k)
        uniq.push(m)
      })
      return uniq.join(', ') || '-'
    }

    const weatherVal = typeof data.weather === 'string' ? normalizeJsonExport(data.weather) : data.weather
    const weatherLabel = [
      weatherVal?.sunny ? 'Soleado' : null,
      weatherVal?.cloudy ? 'Nublado' : null,
      weatherVal?.rain ? 'Lluvia' : null,
      weatherVal?.snow ? 'Nieve' : null
    ].filter(Boolean).join(', ') || '-'
    const personHourKeys = Object.keys(personHoursData || {})

    const personRows = (() => {
      if (personRowsInput.length > 0) {
        return personRowsInput.map((p: any, idx: number) => ({
          ...p,
          // keep existing id; if missing, align by index with person_hours keys
          personId: String(p?.personId || personHourKeys[idx] || `person-${idx}`),
          position: String(p?.position || collaboratorLookup[String(p?.personId || personHourKeys[idx] || '')]?.position || ''),
          name: String(p?.name || collaboratorLookup[String(p?.personId || personHourKeys[idx] || '')]?.name || ''),
          crewName: String(p?.crewName || crewByPersonId[String(p?.personId || personHourKeys[idx] || '')] || '')
        }))
      }
      // fallback: if there are no personnel rows but we have HH data, build rows from those keys
      if (personHourKeys.length > 0) {
        return personHourKeys.map((key) => ({
          personId: String(key),
          position: collaboratorLookup[String(key)]?.position || '',
          name: collaboratorLookup[String(key)]?.name || String(key),
          crewName: crewByPersonId[String(key)] || ''
        }))
      }
      return []
    })()
    const workersLen = Math.max(personRows.length, 1)

    const totalCols = Math.max(8, 4 + activitiesLen)
    const isV2 = String(data.designVersion || '').toUpperCase() === 'V2'
    const titleRow = 0
    if (isV2) {
      const formatHeaderDate = (raw: any) => {
        const s = String(raw || '').trim()
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (!m) return s || '-'
        return `${m[3]} / ${m[2]} / ${m[1]}`
      }
      const fmt = (n: number) => n === 0 ? '0,0' : String(n).replace('.', ',')
      const title = String(data.reportTitle || 'REPORTE CONTRATO BASE').toUpperCase()
      const jefeTerrenoName = String(data.jefeTerreno || data.emittedByName || '-').toUpperCase()
      const v2ActivityCols = Math.max(12, activitiesLen)
      const v2ActivityStartCol = 4
      const v2ActivityEndCol = v2ActivityStartCol + v2ActivityCols - 1
      const v2ExtraHoursCol = v2ActivityEndCol + 1
      const v2TotalHoursCol = v2ActivityEndCol + 2
      const v2AreaCol = v2ActivityEndCol + 3
      const v2ActivitiesRows = v2ActivityCols
      const baseArea = String(data.area || '-').toUpperCase()
      const personExtras = data.personExtraHours || {}
      const v2Rows = personRows.length > 0 ? personRows : []

      rows.push([title])
      rows.push(['NOMBRE CONTRATO', '', String(data.contractName || '-').toUpperCase(), '', '', '', '', '', `Fecha: ${formatHeaderDate(data.date)}`])
      rows.push(['ÁREA', '', String(data.area || '-').toUpperCase()])
      rows.push(['JEFE DE TERRENO', '', jefeTerrenoName, '', '', '', '', '', 'CELULAR:', '', '', String(data.jefeTerrenoPhone || '-')])
      rows.push(['SUPERVISOR', '', resolvePeopleField(data.supervisor, data.supervisorId, 'supervisor').toUpperCase() || '-', '', '', '', '', '', 'CELULAR:', '', '', String(data.supervisorPhone || '-')])
      rows.push(['CAPATAZ', '', resolvePeopleField(data.capataz, data.capatazId, 'capataz').toUpperCase() || '-', '', '', '', '', '', 'CELULAR:', '', '', String(data.capatazPhone || '-')])
      rows.push([
        'DETALLE DEL PERSONAL EN OBRA',
        '',
        '',
        '',
        'EMITIDO POR:',
        '',
        '',
        String(data.emittedByName || '-').toUpperCase(),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'CARGO:',
        '',
        String(data.emittedByPosition || '-').toUpperCase()
      ])

      const sectorHeaderTopRow = rows.length
      rows.push(['CANT.', 'RUT', 'NOMBRE Y APELLIDO', 'Cargo', 'HORAS TRABAJADAS POR ACTIVIDAD', ...new Array(v2ActivityCols - 1).fill(''), 'Horas Extras', 'Total Horas', 'AREA TRABAJO'])
      const sectorHeaderActivitiesRow = rows.length
      rows.push(['', '', '', '', ...Array.from({ length: v2ActivityCols }).map((_, i) => i + 1), '', '', ''])

      const activityTotals = new Array(v2ActivityCols).fill(0)
      let extrasTotal = 0
      let grandTotal = 0
      v2Rows.forEach((rowP: any, idx: number) => {
        const personId = String(rowP?.personId || `person-${idx}`)
        const arr = [...(personHoursData[personId] || [])]
        while (arr.length < v2ActivityCols) arr.push(0)
        const activityHours = arr.slice(0, v2ActivityCols).map((v: any) => Number(v) || 0)
        const totalBase = activityHours.reduce((a, b) => a + b, 0)
        const { extraHours: extra, totalHours: total } = getEffectivePersonHourTotals(totalBase, personExtras[personId])
        activityHours.forEach((v, i) => { activityTotals[i] += v })
        extrasTotal += extra
        grandTotal += total

        rows.push([
          idx + 1,
          formatChileanRutIfValid(rowP?.document || '-'),
          String(rowP?.name || '-').toUpperCase(),
          String(rowP?.position || '-').toUpperCase(),
          ...activityHours.map((v) => (v === 0 ? '' : fmt(v))),
          fmt(extra),
          fmt(total),
          String(rowP?.area || baseArea || '-').toUpperCase()
        ])
      })

      rows.push([
        'TOTAL HORAS',
        '',
        '',
        '',
        ...activityTotals.map((v) => fmt(v)),
        fmt(extrasTotal),
        fmt(grandTotal),
        ''
      ])

      const maquinariaHeaderTopRow = rows.length
      rows.push(['N°', 'PATENTE', 'MAQUINARIA DE APOYO', '', 'HORAS TRABAJADAS POR ACTIVIDAD', ...new Array(v2ActivityCols - 1).fill(''), 'HM', 'HORAS EXTRA (UNIDAD)', 'AREA TRABAJO'])
      const maquinariaRows = Math.max(equipmentEntriesData.length || 0, 1)
      for (let i = 0; i < maquinariaRows; i++) {
        const entry = equipmentEntriesData[i] || {}
        const entryId = `equip-${i}`
        const h = [...(equipmentHoursData[entryId] || [])]
        while (h.length < v2ActivityCols) h.push(0)
        const hmTotal = h.slice(0, v2ActivityCols).reduce((a: number, b: any) => a + (Number(b) || 0), 0)
        const extraHours = Math.max(0, Number((entry as any)?.extra_hours ?? 0) || 0)
        const hasEquipmentData = Boolean(
          String(entry?.code || '').trim() ||
          String(entry?.description || '').trim() ||
          extraHours > 0 ||
          hmTotal > 0
        )
        rows.push([
          i + 1,
          String(entry?.code || '').toUpperCase(),
          String(entry?.description || '').toUpperCase(),
          '',
          ...h.slice(0, v2ActivityCols).map((v: any) => (Number(v) ? fmt(Number(v)) : '')),
          fmt(hmTotal),
          extraHours > 0 ? fmt(extraHours) : '',
          hasEquipmentData ? String((entry as any)?.area || baseArea || '-').toUpperCase() : ''
        ])
      }

      const materialesHeaderRow = rows.length
      rows.push(['N°', 'MATERIALES', '', '', 'CANTIDADES POR ACTIVIDAD', ...new Array(v2ActivityCols - 1).fill(''), 'CANTIDAD', 'UNIDAD', 'AREA TRABAJO'])
      const materialesRows = Math.max(materialEntriesData.length || 0, 1)
      for (let i = 0; i < materialesRows; i++) {
        const entry = materialEntriesData[i] || {}
        const entryId = `material-${i}`
        const quantities = [...(materialQuantitiesData[entryId] || [])]
        while (quantities.length < v2ActivityCols) quantities.push(0)
        const totalQty = quantities.slice(0, v2ActivityCols).reduce((acc: number, value: any) => acc + (Number(value) || 0), 0)
        const hasMaterialData = Boolean(
          String(entry?.description || '').trim() ||
          String(entry?.unit || '').trim() ||
          String((entry as any)?.area || '').trim() ||
          totalQty > 0
        )
        rows.push([
          i + 1,
          String(entry?.description || '').toUpperCase(),
          '',
          '',
          ...quantities.slice(0, v2ActivityCols).map((v: any) => (Number(v) ? fmt(Number(v)) : '')),
          totalQty > 0 ? fmt(totalQty) : '',
          String(entry?.unit || '').toUpperCase(),
          hasMaterialData ? String((entry as any)?.area || baseArea || '-').toUpperCase() : ''
        ])
      }

      const actividadesHeaderRow = rows.length
      rows.push([
        'N°',
        'ACTIVIDADES',
        '',
        'ID',
        'CANTIDAD EJECUTADA', '',
        'UNIDAD',
        '',
        'FRENTE', '', '',
        'TIPO', '', '',
        'DETALLE TIPO', '', '',
        'DESCRIPCION', ''
      ])
      for (let i = 0; i < v2ActivitiesRows; i++) {
        const asg = assignments[i] || {}
        const hasActivity = Boolean(assignments[i])
        const executionDescription = String(
          asg?.execution_description ||
          asg?.executionDescription ||
          asg?.observations ||
          asg?.observation ||
          ''
        ).trim().toUpperCase()
        rows.push([
          i + 1,
          String(`${asg?.activity ? `${asg.activity} ` : ''}${asg?.description || ''}`).trim().toUpperCase(),
          '',
          String(asg?.activity_detail_id || asg?.activity_detail_code || '').trim().toUpperCase(),
          Number(asg?.quantity || 0) > 0 ? fmt(Number(asg?.quantity || 0)) : '',
          '',
          String(asg?.unit || '').toUpperCase(),
          '',
          hasActivity ? String(asg?.work_front || asg?.activity_front || data.workFront || '').trim().toUpperCase() : '',
          '',
          '',
          String(asg?.time_classification || asg?.timeClassification || '').trim().toUpperCase(),
          '',
          '',
          String(asg?.time_reason || asg?.timeReason || '').trim().toUpperCase(),
          '',
          '',
          executionDescription,
          '',
        ])
      }

      const generalHeaderRow = rows.length
      const generalQuestionRows: number[] = []
      rows.push(['ACONTECIMIENTOS GENERALES', '', '', '', 'SI', 'NO', 'COMENTARIOS', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
      const answers = Array.isArray(data.generalEventsAnswers) ? data.generalEventsAnswers : []
      const comments = Array.isArray(data.generalEventsComments) ? data.generalEventsComments : []
      GENERAL_EVENTS_QUESTIONS.forEach((q, idx) => {
        const ans = String(answers[idx] || '').toLowerCase() === 'si' ? 'SI' : 'NO'
        generalQuestionRows.push(rows.length)
        rows.push([q, '', '', '', ans === 'SI' ? 'X' : '', ans === 'NO' ? 'X' : '', String(comments[idx] || ''), '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
      })
      const observationsRow = rows.length
      rows.push(['OBSERVACIONES', '', '', '', 'FIRMA', '', '', '', 'FIRMA', '', '', '', 'FIRMA', '', '', '', 'FIRMA', '', ''])
      const observationsValueRow = rows.length
      rows.push([String(data.restrictions || '').trim() || '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
      rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
      rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
      const firmasLabelRow = rows.length
      rows.push(['', '', '', '', 'SUPERVISOR', '', '', '', 'JEFE TERRENO', '', '', '', 'JEJ', '', '', '', 'ANTUCOYA', '', ''])

      const V2_MAX_COL = v2AreaCol
      rows.splice(0, rows.length, ...rows.map((row) => {
        const arr = Array.isArray(row) ? [...row] : []
        if (arr.length > V2_MAX_COL + 1) {
          const tail = arr.slice(V2_MAX_COL + 1).filter((v) => String(v ?? '').trim() !== '')
          if (tail.length > 0) {
            const base = String(arr[V2_MAX_COL] ?? '').trim()
            arr[V2_MAX_COL] = [base, ...tail.map((v) => String(v).trim())].filter(Boolean).join(' ')
          }
          arr.length = V2_MAX_COL + 1
        }
        while (arr.length < V2_MAX_COL + 1) arr.push('')
        return arr
      }))

      const v2Cols = new Array(V2_MAX_COL + 1).fill(null).map((_, idx) => {
        if (idx === 0) return { wch: 5 }
        if (idx === 1) return { wch: 20 }
        if (idx === 2) return { wch: 46 }
        if (idx === 3) return { wch: 38 }
        if (idx >= v2ActivityStartCol && idx <= v2ActivityEndCol) return { wch: 7 }
        if (idx === v2ExtraHoursCol) return { wch: 14 }
        if (idx === v2TotalHoursCol) return { wch: 14 }
        if (idx === v2AreaCol) return { wch: 35 }
        return { wch: 10 }
      })

      const v2Merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: V2_MAX_COL } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
        { s: { r: 1, c: 2 }, e: { r: 1, c: 7 } },
        { s: { r: 1, c: 8 }, e: { r: 1, c: V2_MAX_COL } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
        { s: { r: 2, c: 2 }, e: { r: 2, c: V2_MAX_COL } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } },
        { s: { r: 3, c: 2 }, e: { r: 3, c: 7 } },
        { s: { r: 3, c: 8 }, e: { r: 3, c: 10 } },
        { s: { r: 3, c: 11 }, e: { r: 3, c: V2_MAX_COL } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 1 } },
        { s: { r: 4, c: 2 }, e: { r: 4, c: 7 } },
        { s: { r: 4, c: 8 }, e: { r: 4, c: 10 } },
        { s: { r: 4, c: 11 }, e: { r: 4, c: V2_MAX_COL } },
        { s: { r: 5, c: 0 }, e: { r: 5, c: 1 } },
        { s: { r: 5, c: 2 }, e: { r: 5, c: 7 } },
        { s: { r: 5, c: 8 }, e: { r: 5, c: 10 } },
        { s: { r: 5, c: 11 }, e: { r: 5, c: V2_MAX_COL } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: 3 } },
        { s: { r: 6, c: 4 }, e: { r: 6, c: 6 } },
        { s: { r: 6, c: 7 }, e: { r: 6, c: 14 } },
        { s: { r: 6, c: 15 }, e: { r: 6, c: 16 } },
        { s: { r: 6, c: 17 }, e: { r: 6, c: V2_MAX_COL } },
        { s: { r: sectorHeaderTopRow, c: 0 }, e: { r: sectorHeaderActivitiesRow, c: 0 } },
        { s: { r: sectorHeaderTopRow, c: 1 }, e: { r: sectorHeaderActivitiesRow, c: 1 } },
        { s: { r: sectorHeaderTopRow, c: 2 }, e: { r: sectorHeaderActivitiesRow, c: 2 } },
        { s: { r: sectorHeaderTopRow, c: 3 }, e: { r: sectorHeaderActivitiesRow, c: 3 } },
        { s: { r: sectorHeaderTopRow, c: v2ActivityStartCol }, e: { r: sectorHeaderTopRow, c: v2ActivityEndCol } },
        { s: { r: sectorHeaderTopRow, c: v2ExtraHoursCol }, e: { r: sectorHeaderActivitiesRow, c: v2ExtraHoursCol } },
        { s: { r: sectorHeaderTopRow, c: v2TotalHoursCol }, e: { r: sectorHeaderActivitiesRow, c: v2TotalHoursCol } },
        { s: { r: sectorHeaderTopRow, c: v2AreaCol }, e: { r: sectorHeaderActivitiesRow, c: v2AreaCol } },
        { s: { r: maquinariaHeaderTopRow - 1, c: 0 }, e: { r: maquinariaHeaderTopRow - 1, c: 3 } },
        { s: { r: maquinariaHeaderTopRow, c: 2 }, e: { r: maquinariaHeaderTopRow, c: 3 } },
        { s: { r: maquinariaHeaderTopRow, c: v2ActivityStartCol }, e: { r: maquinariaHeaderTopRow, c: v2ActivityEndCol } },
        { s: { r: materialesHeaderRow, c: 1 }, e: { r: materialesHeaderRow, c: 3 } },
        { s: { r: materialesHeaderRow, c: v2ActivityStartCol }, e: { r: materialesHeaderRow, c: v2ActivityEndCol } },
        ...Array.from({ length: maquinariaRows }).map((_, i) => ({
          s: { r: maquinariaHeaderTopRow + 1 + i, c: 2 },
          e: { r: maquinariaHeaderTopRow + 1 + i, c: 3 }
        })),
        ...Array.from({ length: materialesRows }).map((_, i) => ({
          s: { r: materialesHeaderRow + 1 + i, c: 1 },
          e: { r: materialesHeaderRow + 1 + i, c: 3 }
        })),
        { s: { r: actividadesHeaderRow, c: 1 }, e: { r: actividadesHeaderRow, c: 2 } },
        { s: { r: actividadesHeaderRow, c: 4 }, e: { r: actividadesHeaderRow, c: 5 } },
        { s: { r: actividadesHeaderRow, c: 6 }, e: { r: actividadesHeaderRow, c: 7 } },
        { s: { r: actividadesHeaderRow, c: 8 }, e: { r: actividadesHeaderRow, c: 10 } },
        { s: { r: actividadesHeaderRow, c: 11 }, e: { r: actividadesHeaderRow, c: 13 } },
        { s: { r: actividadesHeaderRow, c: 14 }, e: { r: actividadesHeaderRow, c: 16 } },
        { s: { r: actividadesHeaderRow, c: 17 }, e: { r: actividadesHeaderRow, c: V2_MAX_COL } },
        ...Array.from({ length: v2ActivitiesRows }).map((_, i) => ({
          s: { r: actividadesHeaderRow + 1 + i, c: 1 },
          e: { r: actividadesHeaderRow + 1 + i, c: 2 }
        })),
        ...Array.from({ length: v2ActivitiesRows }).map((_, i) => ({
          s: { r: actividadesHeaderRow + 1 + i, c: 4 },
          e: { r: actividadesHeaderRow + 1 + i, c: 5 }
        })),
        ...Array.from({ length: v2ActivitiesRows }).map((_, i) => ({
          s: { r: actividadesHeaderRow + 1 + i, c: 6 },
          e: { r: actividadesHeaderRow + 1 + i, c: 7 }
        })),
        ...Array.from({ length: v2ActivitiesRows }).map((_, i) => ({
          s: { r: actividadesHeaderRow + 1 + i, c: 8 },
          e: { r: actividadesHeaderRow + 1 + i, c: 10 }
        })),
        ...Array.from({ length: v2ActivitiesRows }).map((_, i) => ({
          s: { r: actividadesHeaderRow + 1 + i, c: 11 },
          e: { r: actividadesHeaderRow + 1 + i, c: 13 }
        })),
        ...Array.from({ length: v2ActivitiesRows }).map((_, i) => ({
          s: { r: actividadesHeaderRow + 1 + i, c: 14 },
          e: { r: actividadesHeaderRow + 1 + i, c: 16 }
        })),
        ...Array.from({ length: v2ActivitiesRows }).map((_, i) => ({
          s: { r: actividadesHeaderRow + 1 + i, c: 17 },
          e: { r: actividadesHeaderRow + 1 + i, c: V2_MAX_COL }
        })),
        { s: { r: generalHeaderRow, c: 0 }, e: { r: generalHeaderRow, c: 3 } },
        { s: { r: generalHeaderRow, c: 6 }, e: { r: generalHeaderRow, c: V2_MAX_COL } },
        ...generalQuestionRows.flatMap((row) => [
          { s: { r: row, c: 0 }, e: { r: row, c: 3 } },
          { s: { r: row, c: 6 }, e: { r: row, c: V2_MAX_COL } }
        ]),
        { s: { r: observationsRow, c: 0 }, e: { r: observationsRow, c: 3 } },
        { s: { r: observationsRow, c: 4 }, e: { r: observationsRow, c: 7 } },
        { s: { r: observationsRow, c: 8 }, e: { r: observationsRow, c: 11 } },
        { s: { r: observationsRow, c: 12 }, e: { r: observationsRow, c: 15 } },
        { s: { r: observationsRow, c: 16 }, e: { r: observationsRow, c: V2_MAX_COL } },
        { s: { r: observationsValueRow, c: 0 }, e: { r: observationsValueRow + 2, c: 3 } },
        { s: { r: observationsValueRow, c: 4 }, e: { r: observationsValueRow + 2, c: 7 } },
        { s: { r: observationsValueRow, c: 8 }, e: { r: observationsValueRow + 2, c: 11 } },
        { s: { r: observationsValueRow, c: 12 }, e: { r: observationsValueRow + 2, c: 15 } },
        { s: { r: observationsValueRow, c: 16 }, e: { r: observationsValueRow + 2, c: V2_MAX_COL } },
        { s: { r: firmasLabelRow, c: 0 }, e: { r: firmasLabelRow, c: 3 } },
        { s: { r: firmasLabelRow, c: 4 }, e: { r: firmasLabelRow, c: 7 } },
        { s: { r: firmasLabelRow, c: 8 }, e: { r: firmasLabelRow, c: 11 } },
        { s: { r: firmasLabelRow, c: 12 }, e: { r: firmasLabelRow, c: 15 } },
        { s: { r: firmasLabelRow, c: 16 }, e: { r: firmasLabelRow, c: V2_MAX_COL } },
        // TOTAL HORAS label block (visible B:E after left padding).
        { s: { r: sectorHeaderActivitiesRow + 1 + v2Rows.length, c: 0 }, e: { r: sectorHeaderActivitiesRow + 1 + v2Rows.length, c: 3 } }
      ]

      const v2Heights = rows.map((_r, idx) => {
        if (idx === 0) return { hpx: 34 }
        if (idx <= 6) return { hpx: 26 }
        if (idx === observationsValueRow) return { hpx: 64 }
        if (idx === sectorHeaderTopRow || idx === sectorHeaderActivitiesRow) return { hpx: 24 }
        return { hpx: 24 }
      })

      const TOP_PADDING_ROWS = 1
      const LEFT_PADDING_COLS = 1
      const clippedMerges = v2Merges
        .map((m: any) => ({
          s: { r: m.s.r, c: Math.min(m.s.c, V2_MAX_COL) },
          e: { r: m.e.r, c: Math.min(m.e.c, V2_MAX_COL) }
        }))
        .filter((m: any) => m.s.c <= m.e.c)

      const mergeOverlaps = (a: any, b: any) => {
        const rowsOverlap = a.s.r <= b.e.r && b.s.r <= a.e.r
        const colsOverlap = a.s.c <= b.e.c && b.s.c <= a.e.c
        return rowsOverlap && colsOverlap
      }

      const normalizedMerges: any[] = []
      for (const m of clippedMerges) {
        const overlaps = normalizedMerges.some((kept) => mergeOverlaps(kept, m))
        if (!overlaps) normalizedMerges.push(m)
      }

      const shiftedRows = [
        ...new Array(TOP_PADDING_ROWS).fill(null).map(() => new Array(v2Cols.length + LEFT_PADDING_COLS).fill('')),
        ...rows.map((r) => [...new Array(LEFT_PADDING_COLS).fill(''), ...r])
      ]
      const shiftedMerges = normalizedMerges.map((m: any) => ({
        s: { r: m.s.r + TOP_PADDING_ROWS, c: m.s.c + LEFT_PADDING_COLS },
        e: { r: m.e.r + TOP_PADDING_ROWS, c: m.e.c + LEFT_PADDING_COLS }
      }))
      const shiftedCols = [...new Array(LEFT_PADDING_COLS).fill(null).map(() => ({ wch: 4 })), ...v2Cols]
      const shiftedHeights = [...new Array(TOP_PADDING_ROWS).fill(null).map(() => ({ hpx: 20 })), ...v2Heights]
      return { rows: shiftedRows, cols: shiftedCols, merges: shiftedMerges, rowHeights: shiftedHeights }
    } else {
      rows.push(['CONTROL DE PRODUCCION DE TERRENO'])
      rows.push([])
      rows.push(['Fecha', data.date || '-', 'Turno', data.turno || '-', 'Cuadrilla(s)', data.crewLabel || '-'])
      rows.push([
        'Supervisor',
        resolvePeopleField(data.supervisor, data.supervisorId, 'supervisor'),
        'Capataz',
        resolvePeopleField(data.capataz, data.capatazId, 'capataz'),
        'Especialidad',
        data.specialty || '-'
      ])
      rows.push(['Cond. Climática', weatherLabel])
      rows.push([])
    }

    const tasksTitleRow = rows.length
    rows.push(['TAREAS REALIZADAS'])
    rows.push(['N°', 'ID', 'Área', 'Paquete', 'Descripción de la actividad', 'Unidad', 'Cantidad', 'Observaciones'])
    for (let i = 0; i < activitiesLen; i++) {
      const asg = assignments[i]
      const id = asg ? (asg?.item_id ?? asg?.id ?? asg?.activityId ?? '-') : '-'
      const sub = asg?.sub_id ? ` (${asg.sub_id})` : ''
      rows.push([
        i + 1,
        `${id}${sub}`,
        asg?.area || '-',
        asg?.package || '-',
        `${asg?.activity ? `${asg.activity} - ` : ''}${asg?.description || '-'}`,
        asg?.unit || '-',
        asg?.quantity ?? '-',
        asg?.observations || '-'
      ])
    }
    rows.push([])

    const personalTitleRow = rows.length
    rows.push(['PERSONAL'])
    const personalHeaderRow = rows.length
    const personalHeader = ['N°', 'Cargo', 'Nombre Trabajador']
    // Reserve one extra column so "Nombre Trabajador" spans D:E (after global left padding).
    personalHeader.push('')
    for (let i = 0; i < activitiesLen; i++) personalHeader.push(`Act. ${i + 1} [HH]`)
    personalHeader.push('Total [HH]')
    rows.push(personalHeader)
    const firstPersonalDataRow = rows.length

    for (let rowIdx = 0; rowIdx < workersLen; rowIdx++) {
      const rowP = personRows[rowIdx]
      const personId = String(rowP?.personId || `person-${rowIdx}`)
      const hours = [...(personHoursData[personId] || new Array(activitiesLen).fill(0))]
      while (hours.length < activitiesLen) hours.push(0)
      const total = hours.reduce((s, v) => s + (Number(v) || 0), 0)
      rows.push([
        rowIdx + 1,
        rowP?.position || '',
        rowP ? formatPersonNameWithCrew(rowP?.name, rowP?.crewName) : '',
        '',
        ...hours.map((h) => Number(h) || 0),
        total
      ])
    }
    rows.push([])

    const equipmentTitleRow = rows.length
    rows.push(['EQUIPOS'])
    const equipHeader = ['N°', 'Código equipo', 'Descripción equipos', 'Descripción Actividad', 'HORAS EXTRA (UNIDAD)']
    for (let i = 0; i < activitiesLen; i++) equipHeader.push(`Act. ${i + 1} [HH]`)
    equipHeader.push('Total [HH]')
    rows.push(equipHeader)

    for (let rowIdx = 0; rowIdx < equipmentLen; rowIdx++) {
      const entryId = `equip-${rowIdx}`
      const entry = equipmentEntriesData[rowIdx] || {}
      const hours = [...(equipmentHoursData[entryId] || new Array(activitiesLen).fill(0))]
      while (hours.length < activitiesLen) hours.push(0)
      const total = hours.reduce((s, v) => s + (Number(v) || 0), 0)
      rows.push([
        rowIdx + 1,
        entry?.code || '',
        entry?.description || '',
        entry?.activity_desc || '',
        Number((entry as any)?.extra_hours ?? 0) || 0,
        ...hours.map((h) => Number(h) || 0),
        total
      ])
    }
    rows.push([])

    const observationsTitleRow = rows.length
    rows.push(['OBSERVACIONES - TEMAS DE PREOCUPACION O RESTRICCIONES A LAS TAREAS'])
    rows.push(['N°', 'Actividad', 'Observaciones / Restricciones'])
    for (let idx = 0; idx < activitiesLen; idx++) {
      const asg = assignments[idx]
      const aid = String(asg?.activityId || `act-${idx}`)
      rows.push([
        idx + 1,
        `${asg?.activity ? `${asg.activity} - ` : ''}${asg?.description || '-'}`,
        activityObsData[aid] || '-'
      ])
    }
    const cols = new Array(totalCols).fill(null).map((_, idx) => {
      if (idx === 0) return { wch: 6 }
      if (idx === 1) return { wch: 20 }
      if (idx === 2) return { wch: 24 }
      if (idx === 3) return { wch: 24 }
      if (idx === 4) return { wch: 48 }
      if (idx === 5) return { wch: 10 }
      if (idx === 6) return { wch: 12 }
      if (idx === 7) return { wch: 40 }
      return { wch: 12 }
    })

    const merges = [
      { s: { r: titleRow, c: 0 }, e: { r: titleRow, c: totalCols - 1 } },
      { s: { r: tasksTitleRow, c: 0 }, e: { r: tasksTitleRow, c: totalCols - 1 } },
      { s: { r: personalTitleRow, c: 0 }, e: { r: personalTitleRow, c: totalCols - 1 } },
      { s: { r: equipmentTitleRow, c: 0 }, e: { r: equipmentTitleRow, c: totalCols - 1 } },
      { s: { r: observationsTitleRow, c: 0 }, e: { r: observationsTitleRow, c: totalCols - 1 } }
    ]
    if (!isV2) {
      merges.push({ s: { r: 2, c: 5 }, e: { r: 2, c: Math.min(7, totalCols - 1) } })
      merges.push({ s: { r: 3, c: 5 }, e: { r: 3, c: Math.min(7, totalCols - 1) } })
    } else {
      merges.push({ s: { r: 1, c: 1 }, e: { r: 1, c: Math.min(2, totalCols - 1) } })
      merges.push({ s: { r: 1, c: 3 }, e: { r: 1, c: Math.min(8, totalCols - 1) } })
      merges.push({ s: { r: 2, c: 1 }, e: { r: 2, c: Math.min(2, totalCols - 1) } })
      merges.push({ s: { r: 2, c: 3 }, e: { r: 2, c: Math.min(8, totalCols - 1) } })
      merges.push({ s: { r: 3, c: 1 }, e: { r: 3, c: Math.min(2, totalCols - 1) } })
      merges.push({ s: { r: 3, c: 3 }, e: { r: 3, c: Math.min(8, totalCols - 1) } })
      merges.push({ s: { r: 4, c: 1 }, e: { r: 4, c: Math.min(2, totalCols - 1) } })
      merges.push({ s: { r: 4, c: 3 }, e: { r: 4, c: Math.min(8, totalCols - 1) } })
      merges.push({ s: { r: 5, c: 1 }, e: { r: 5, c: Math.min(2, totalCols - 1) } })
      merges.push({ s: { r: 5, c: 3 }, e: { r: 5, c: Math.min(8, totalCols - 1) } })
      merges.push({ s: { r: 1, c: 13 }, e: { r: 1, c: totalCols - 1 } })
      merges.push({ s: { r: 3, c: 14 }, e: { r: 3, c: totalCols - 1 } })
      merges.push({ s: { r: 4, c: 14 }, e: { r: 4, c: totalCols - 1 } })
      merges.push({ s: { r: 5, c: 14 }, e: { r: 5, c: totalCols - 1 } })
      merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: Math.min(2, totalCols - 1) } })
      merges.push({ s: { r: 6, c: 3 }, e: { r: 6, c: totalCols - 1 } })
    }
    // PERSONAL: merge "Nombre Trabajador" column with the next one (D:E in final sheet).
    merges.push({ s: { r: personalHeaderRow, c: 2 }, e: { r: personalHeaderRow, c: 3 } })
    for (let i = 0; i < workersLen; i++) {
      merges.push({ s: { r: firstPersonalDataRow + i, c: 2 }, e: { r: firstPersonalDataRow + i, c: 3 } })
    }

    const rowHeights = rows.map((_r, idx) => {
      if (idx === titleRow) return { hpx: 28 }
      if (idx === tasksTitleRow || idx === personalTitleRow || idx === equipmentTitleRow || idx === observationsTitleRow) return { hpx: 24 }
      return { hpx: 20 }
    })

    // Leave a global blank margin: first row and first column are intentionally empty.
    const TOP_PADDING_ROWS = 1
    const LEFT_PADDING_COLS = 1
    const shiftedRows = [
      ...new Array(TOP_PADDING_ROWS).fill(null).map(() => new Array(totalCols + LEFT_PADDING_COLS).fill('')),
      ...rows.map((r) => [...new Array(LEFT_PADDING_COLS).fill(''), ...r])
    ]
    const shiftedMerges = merges.map((m: any) => ({
      s: { r: m.s.r + TOP_PADDING_ROWS, c: m.s.c + LEFT_PADDING_COLS },
      e: { r: m.e.r + TOP_PADDING_ROWS, c: m.e.c + LEFT_PADDING_COLS }
    }))
    const shiftedCols = [...new Array(LEFT_PADDING_COLS).fill(null).map(() => ({ wch: 4 })), ...cols]
    const shiftedRowHeights = [...new Array(TOP_PADDING_ROWS).fill(null).map(() => ({ hpx: 20 })), ...rowHeights]

    return { rows: shiftedRows, cols: shiftedCols, merges: shiftedMerges, rowHeights: shiftedRowHeights }
  }

  const loadCollaboratorLookup = async (): Promise<Record<string, { name: string; position: string }>> => {
    try {
      const data = await fetchCollaboratorsSummaryOnce(reportDate)
      const map: Record<string, { name: string; position: string }> = {}
      ;(Array.isArray(data) ? data : []).forEach((c: any) => {
        const id = c?.id ? String(c.id) : ''
        if (!id) return
        map[id] = {
          name: `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || String(c?.name || id),
          position: String(c?.position || c?.posicion || '')
        }
      })
      return map
    } catch {
      return {}
    }
  }

  const buildCrewByPersonIdFromMembers = (members: any[]): Record<string, string> => {
    const out: Record<string, string> = {}
    ;(members || []).forEach((m: any) => {
      const id = m?.id ? String(m.id) : ''
      if (!id || out[id]) return
      out[id] = String(m?.crewName || m?.crew_name || '')
    })
    return out
  }

  const loadCrewByPersonIdForReport = async (report: any): Promise<Record<string, string>> => {
    const ids = Array.isArray(report?.crew_ids) && report.crew_ids.length > 0
      ? report.crew_ids.map(String)
      : (report?.crew_id ? [String(report.crew_id)] : [])
    if (ids.length === 0) return {}
    const out: Record<string, string> = {}
    const results = await Promise.all(ids.map(async (id: string) => {
      try {
        const res = await fetch(`/api/crews/${encodeURIComponent(id)}/full`)
        if (!res.ok) return null
        return await res.json()
      } catch {
        return null
      }
    }))
    results.forEach((data: any) => {
      const crewName = String(data?.crew?.name || '')
      const collabs = Array.isArray(data?.collaborators) ? data.collaborators : []
      collabs.forEach((c: any) => {
        const cid = c?.id ? String(c.id) : ''
        if (!cid || out[cid]) return
        out[cid] = crewName
      })
    })
    return out
  }

  const exportWithExcelJs = async (
    filename: string,
    sheets: Array<{ name: string; built: { rows: any[][]; cols: any[]; merges: any[]; rowHeights: any[] }; evidenceImages?: EvidenceFile[] }>
  ) => {
    let ExcelJS: any = null
    try {
      const mod = await import('exceljs')
      ExcelJS = (mod as any).default || mod
    } catch {
      return false
    }

    try {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Ingenit'
      workbook.created = new Date()
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] exportWithExcelJs start', { filename, sheets: sheets.length })
      const DETAIL_COL_START = 2 // B
      // V2 grows horizontally with the number of activities; style every generated column.
      const DETAIL_COL_END = 500
      const V2_EXPORT_FONT_SIZE = 13
      const V2_EXPORT_TITLE_FONT_SIZE = 15
      const DEBUG_COLS = new Set([2, 3, 4, 5, 18, 20]) // B,C,D,E,R,T
      const thinBlackBorder = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      } as const
      const applyNoFillBlackBordersToDetailRows = (
        worksheet: any,
        startRow: number,
        endRow: number,
        maxCol: number,
        debugEnabled?: boolean
      ) => {
        const lastCol = Math.min(DETAIL_COL_END, maxCol)
        for (let r = startRow; r <= endRow; r++) {
          for (let c = DETAIL_COL_START; c <= lastCol; c++) {
            const cell = worksheet.getCell(r, c)
            const shouldDebugCell = !!debugEnabled && DEBUG_COLS.has(c) && (r === startRow || r === endRow)
            const fillBefore = cell.fill
            const styleFillBefore = (cell as any).style?.fill
            // Clear fill in both style slots to avoid inherited/serialized gray backgrounds.
            cell.fill = undefined as any
            if ((cell as any).style && Object.prototype.hasOwnProperty.call((cell as any).style, 'fill')) {
              delete (cell as any).style.fill
            }
            cell.border = thinBlackBorder
            if (shouldDebugCell) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] final helper cell', {
                address: cell.address,
                r,
                c,
                value: cell.value,
                fillBefore,
                styleFillBefore,
                fillAfter: cell.fill,
                styleFillAfter: (cell as any).style?.fill
              })
            }
          }
        }
      }
      const normalizeCellText = (value: any): string => {
        const raw = value === null || value === undefined ? '' : String((value as any).text || value)
        return raw.replace(/\s+/g, ' ').trim().toUpperCase()
      }
      const getCellRawText = (value: any): string => {
        if (value === null || value === undefined) return ''
        if (typeof value === 'object') {
          if ('text' in value) return String((value as any).text || '')
          if ('richText' in value && Array.isArray((value as any).richText)) {
            return (value as any).richText.map((part: any) => String(part?.text || '')).join('')
          }
          if ('result' in value) return String((value as any).result || '')
        }
        return String(value)
      }
      const detectDetailRowsRange = (worksheet: any, rowCount: number, colCount: number) => {
        const fixedStartRow = 11
        const scanStartCol = 1 // A
        const toCol = Math.min(DETAIL_COL_END, colCount)
        let totalHoursRow = -1
        for (let r = fixedStartRow; r <= rowCount; r++) {
          for (let c = scanStartCol; c <= toCol; c++) {
            const text = normalizeCellText(worksheet.getCell(r, c).value)
            if (text === 'TOTAL HORAS') {
              totalHoursRow = r
              break
            }
          }
          if (totalHoursRow !== -1) break
        }
        if (totalHoursRow === -1) {
          console.error('[Excel V2 DEBUG] TOTAL HORAS not found from fixed start row', {
            fixedStartRow,
            rowCount,
            scanStartCol,
            toCol
          })
          return { startRow: -1, endRow: -1, totalHoursRow: -1 }
        }
        const startRow = fixedStartRow
        if (totalHoursRow - 1 < startRow) return { startRow: -1, endRow: -1, totalHoursRow }
        return { startRow, endRow: totalHoursRow - 1, totalHoursRow }
      }
      const detectActivitiesExecutedRowsRange = (worksheet: any, rowCount: number, colCount: number) => {
        const scanStartCol = 1 // A
        const toCol = Math.min(DETAIL_COL_END, colCount)
        let headerRow = -1
        let nextSectionRow = -1
        const headerNeedles = new Set([
          'BREVE DESCRIPCION ACTIVIDADES EJECUTADAS',
          'ACTIVIDADES'
        ])
        const nextSectionNeedle = 'ACONTECIMIENTOS GENERALES'

        for (let r = 1; r <= rowCount; r++) {
          for (let c = scanStartCol; c <= toCol; c++) {
            const text = normalizeCellText(worksheet.getCell(r, c).value)
            if (headerNeedles.has(text)) {
              headerRow = r
              break
            }
          }
          if (headerRow !== -1) break
        }
        // Fallback estructural: identifica la fila por sus encabezados vecinos.
        if (headerRow === -1) {
          for (let r = 1; r <= rowCount; r++) {
            let hasCantidad = false
            let hasUnidad = false
            let hasFrente = false
            let hasDescripcion = false
            for (let c = scanStartCol; c <= toCol; c++) {
              const text = normalizeCellText(worksheet.getCell(r, c).value)
              if (text === 'CANTIDAD EJECUTADA') hasCantidad = true
              if (text === 'UNIDAD') hasUnidad = true
              if (text === 'FRENTE') hasFrente = true
              if (text === 'DESCRIPCION') hasDescripcion = true
            }
            if (hasCantidad && hasUnidad && hasFrente && hasDescripcion) {
              headerRow = r
              break
            }
          }
        }
        if (headerRow === -1) return { headerRow: -1, startRow: -1, endRow: -1 }

        for (let r = headerRow + 1; r <= rowCount; r++) {
          for (let c = scanStartCol; c <= toCol; c++) {
            const text = normalizeCellText(worksheet.getCell(r, c).value)
            if (text === nextSectionNeedle) {
              nextSectionRow = r
              break
            }
          }
          if (nextSectionRow !== -1) break
        }
        if (nextSectionRow === -1) {
          nextSectionRow = rowCount + 1
        }
        const startRow = headerRow + 1
        const endRow = nextSectionRow - 1
        if (endRow < startRow) return { headerRow, startRow: -1, endRow: -1 }
        return { headerRow, startRow, endRow }
      }
      const detectGeneralQuestionsRowsRange = (worksheet: any, rowCount: number, colCount: number) => {
        const scanStartCol = 1 // A
        const toCol = Math.min(DETAIL_COL_END, colCount)
        let headerRow = -1
        let observationsRow = -1
        const headerNeedle = 'ACONTECIMIENTOS GENERALES'
        const observationsNeedle = 'OBSERVACIONES'

        for (let r = 1; r <= rowCount; r++) {
          for (let c = scanStartCol; c <= toCol; c++) {
            const text = normalizeCellText(worksheet.getCell(r, c).value)
            if (text === headerNeedle) {
              headerRow = r
              break
            }
          }
          if (headerRow !== -1) break
        }
        if (headerRow === -1) return { headerRow: -1, startRow: -1, endRow: -1 }

        for (let r = headerRow + 1; r <= rowCount; r++) {
          for (let c = scanStartCol; c <= toCol; c++) {
            const text = normalizeCellText(worksheet.getCell(r, c).value)
            if (text === observationsNeedle) {
              observationsRow = r
              break
            }
          }
          if (observationsRow !== -1) break
        }
        if (observationsRow === -1) return { headerRow, startRow: -1, endRow: -1 }
        const startRow = headerRow + 1
        const endRow = observationsRow - 1
        if (endRow < startRow) return { headerRow, startRow: -1, endRow: -1 }
        return { headerRow, startRow, endRow }
      }
      const detectObservationsValueRowsRange = (worksheet: any, rowCount: number, colCount: number) => {
        const scanStartCol = 1 // A
        const toCol = Math.min(DETAIL_COL_END, colCount)
        let observationsRow = -1
        const observationsNeedle = 'OBSERVACIONES'

        for (let r = 1; r <= rowCount; r++) {
          for (let c = scanStartCol; c <= toCol; c++) {
            const text = normalizeCellText(worksheet.getCell(r, c).value)
            if (text === observationsNeedle) {
              observationsRow = r
              break
            }
          }
          if (observationsRow !== -1) break
        }
        if (observationsRow === -1) return { startRow: -1, endRow: -1 }
        const startRow = observationsRow + 1
        const endRow = Math.min(observationsRow + 3, rowCount)
        if (endRow < startRow) return { startRow: -1, endRow: -1 }
        return { startRow, endRow }
      }

      const readBlobAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      const getImageSize = (dataUrl: string) => new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 })
        image.onerror = () => resolve({ width: 1, height: 1 })
        image.src = dataUrl
      })
      const fitImage = (sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number) => {
        const safeWidth = Math.max(1, sourceWidth)
        const safeHeight = Math.max(1, sourceHeight)
        const scale = Math.min(boxWidth / safeWidth, boxHeight / safeHeight)
        return {
          width: Math.max(1, Math.round(safeWidth * scale)),
          height: Math.max(1, Math.round(safeHeight * scale))
        }
      }
      const columnWidthToPx = (columnWidth: number) => Math.max(1, Math.round(columnWidth * 7.2))
      const rowHeightToPx = (rowHeight: number) => Math.max(1, Math.round(rowHeight * 96 / 72))
      const getColumnSpanPx = (worksheet: any, fromCol: number, toCol: number) => {
        let total = 0
        for (let col = fromCol; col <= toCol; col += 1) {
          total += columnWidthToPx(Number(worksheet.getColumn(col).width || 8.43))
        }
        return Math.max(1, total)
      }
      const getRowSpanPx = (worksheet: any, fromRow: number, toRow: number) => {
        let total = 0
        for (let r = fromRow; r <= toRow; r += 1) {
          total += rowHeightToPx(Number(worksheet.getRow(r).height || 15))
        }
        return Math.max(1, total)
      }
      const addPixelOffsetToColumn = (worksheet: any, startCol: number, offsetPx: number, maxCol: number) => {
        let col = startCol
        let remaining = Math.max(0, offsetPx)
        while (col < maxCol) {
          const width = columnWidthToPx(Number(worksheet.getColumn(col).width || 8.43))
          if (remaining <= width) break
          remaining -= width
          col += 1
        }
        const width = columnWidthToPx(Number(worksheet.getColumn(col).width || 8.43))
        return (col - 1) + Math.min(0.98, remaining / Math.max(1, width))
      }
      const addPixelOffsetToRow = (worksheet: any, startRow: number, offsetPx: number, maxRow: number) => {
        let row = startRow
        let remaining = Math.max(0, offsetPx)
        while (row < maxRow) {
          const height = rowHeightToPx(Number(worksheet.getRow(row).height || 15))
          if (remaining <= height) break
          remaining -= height
          row += 1
        }
        const height = rowHeightToPx(Number(worksheet.getRow(row).height || 15))
        return (row - 1) + Math.min(0.98, remaining / Math.max(1, height))
      }

      for (const s of sheets) {
        const ws = workbook.addWorksheet(s.name)
        ws.pageSetup = {
          margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
        }
        ws.columns = s.built.cols.map((c: any) => ({ width: Number(c?.wch || 12) }))

        s.built.rows.forEach((arr, rowIdx) => {
          const row = ws.getRow(rowIdx + 1)
          arr.forEach((value, colIdx) => {
            row.getCell(colIdx + 1).value = value ?? ''
          })
        })

        s.built.rowHeights.forEach((rh: any, rowIdx: number) => {
          if (rh?.hpx) ws.getRow(rowIdx + 1).height = Math.max(12, Number(rh.hpx) * 0.75)
        })

        s.built.merges.forEach((m: any) => {
          ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1)
        })

        const rowCount = s.built.rows.length
        const colCount = s.built.rows.reduce((mx, r) => Math.max(mx, Array.isArray(r) ? r.length : 0), 0)
        const firstRowValues = Array.isArray(s.built.rows[0]) ? s.built.rows[0] : []
        const secondRowValues = Array.isArray(s.built.rows[1]) ? s.built.rows[1] : []
        const isV2HeaderOnly = !String(JSON.stringify(s.built.rows)).includes('TAREAS REALIZADAS') &&
          firstRowValues.every((v) => !String(v || '').trim()) &&
          String(secondRowValues[1] || '').toUpperCase().includes('REPORTE')
        const isV2Detailed = String(JSON.stringify(s.built.rows)).includes('DETALLE DEL PERSONAL EN OBRA')
        const sectorTopRowIndex = isV2Detailed
          ? s.built.rows.findIndex((r: any) => Array.isArray(r) && r.some((v: any) => String(v || '').trim().toUpperCase() === 'HORAS TRABAJADAS POR ACTIVIDAD'))
          : -1
        const sectorActivitiesRowIndex = sectorTopRowIndex >= 0 ? sectorTopRowIndex + 1 : -1
        const totalHoursRowIndex = isV2Detailed
          ? s.built.rows.findIndex((r: any) => Array.isArray(r) && r.some((v: any) => String(v || '').trim().toUpperCase() === 'TOTAL HORAS'))
          : -1
        const detailRowsRange = isV2Detailed ? detectDetailRowsRange(ws, rowCount, colCount) : null
        const activitiesRowsRange = isV2Detailed ? detectActivitiesExecutedRowsRange(ws, rowCount, colCount) : null
        const generalQuestionsRowsRange = isV2Detailed ? detectGeneralQuestionsRowsRange(ws, rowCount, colCount) : null
        const observationsValueRowsRange = isV2Detailed ? detectObservationsValueRowsRange(ws, rowCount, colCount) : null
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] sheet context', { isV2Detailed, isV2HeaderOnly, rowCount, colCount, sheetName: s.name })
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] detailRowsRange', {
          startRow: detailRowsRange?.startRow,
          endRow: detailRowsRange?.endRow,
          totalHoursRow: (detailRowsRange as any)?.totalHoursRow,
          rowCount,
          colCount
        })
        if (isV2Detailed) {
          const collaboratorStartRow = detailRowsRange?.startRow ?? -1
          const totalHoursRow = (detailRowsRange as any)?.totalHoursRow ?? -1
          const collaboratorEndRow = detailRowsRange?.endRow ?? -1
          const activitiesHeaderRow = activitiesRowsRange?.headerRow ?? -1
          const activitiesStartRow = activitiesRowsRange?.startRow ?? -1
          const activitiesEndRow = activitiesRowsRange?.endRow ?? -1
          const generalQuestionsStartRow = generalQuestionsRowsRange?.startRow ?? -1
          const generalQuestionsEndRow = generalQuestionsRowsRange?.endRow ?? -1
          const collaboratorRowsCleaned = collaboratorStartRow > 0 && collaboratorEndRow >= collaboratorStartRow
            ? collaboratorEndRow - collaboratorStartRow + 1
            : 0
          const activitiesRowsCleaned = activitiesStartRow > 0 && activitiesEndRow >= activitiesStartRow
            ? activitiesEndRow - activitiesStartRow + 1
            : 0
          const generalQuestionsRowsCleaned = generalQuestionsStartRow > 0 && generalQuestionsEndRow >= generalQuestionsStartRow
            ? generalQuestionsEndRow - generalQuestionsStartRow + 1
            : 0
          const observationsStartRow = observationsValueRowsRange?.startRow ?? -1
          const observationsEndRow = observationsValueRowsRange?.endRow ?? -1
          const observationsRowsCleaned = observationsStartRow > 0 && observationsEndRow >= observationsStartRow
            ? observationsEndRow - observationsStartRow + 1
            : 0
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] dynamic ranges', {
            collaboratorStartRow,
            totalHoursRow,
            collaboratorEndRow,
            activitiesHeaderRow,
            activitiesStartRow,
            activitiesEndRow,
            generalQuestionsStartRow,
            generalQuestionsEndRow,
            observationsStartRow,
            observationsEndRow,
            collaboratorRowsCleaned,
            activitiesRowsCleaned,
            generalQuestionsRowsCleaned,
            observationsRowsCleaned
          })
        }
        if (isV2Detailed) {
          const cleanedRows = detailRowsRange && detailRowsRange.startRow > 0 && detailRowsRange.endRow >= detailRowsRange.startRow
            ? (detailRowsRange.endRow - detailRowsRange.startRow + 1)
            : 0
          console.log('[Excel V2] detailRowsRange', {
            startRow: detailRowsRange?.startRow ?? -1,
            endRow: detailRowsRange?.endRow ?? -1,
            totalHoursRow: (detailRowsRange as any)?.totalHoursRow ?? -1,
            cleanedRows
          })
        }

        for (let r = 1; r <= rowCount; r++) {
          for (let c = 1; c <= colCount; c++) {
            const cell = ws.getCell(r, c)
            if (isV2Detailed && (r === 1 || c === 1)) {
              // Keep top row and left column as visual breathing space (no thin inner border).
              cell.border = undefined as any
              cell.fill = undefined as any
              continue
            }
            const isDetailCollaboratorCell =
              isV2Detailed &&
              detailRowsRange &&
              detailRowsRange.startRow > 0 &&
              detailRowsRange.endRow >= detailRowsRange.startRow &&
              r >= detailRowsRange.startRow &&
              r <= detailRowsRange.endRow &&
              c >= 2 &&
              c <= Math.min(DETAIL_COL_END, colCount)

            if (isDetailCollaboratorCell) {
              const shouldDebugCell = DEBUG_COLS.has(c) && !!detailRowsRange && (r === detailRowsRange.startRow || r === detailRowsRange.endRow)
              if (shouldDebugCell) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] collaborator cell before clear', {
                  address: cell.address,
                  r,
                  c,
                  value: cell.value,
                  isDetailCollaboratorCell,
                  fillBefore: cell.fill,
                  styleFillBefore: (cell as any).style?.fill
                })
              }
              if ((cell as any).style && Object.prototype.hasOwnProperty.call((cell as any).style, 'fill')) {
                delete (cell as any).style.fill
              }
              cell.fill = undefined as any
              cell.border = thinBlackBorder
              cell.font = { name: 'Arial', size: V2_EXPORT_FONT_SIZE, bold: true, color: { argb: 'FF202124' } }
              cell.alignment = { vertical: 'middle', horizontal: c === 4 ? 'left' : 'center' }
              if (shouldDebugCell) {
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] collaborator cell after clear', {
                  address: cell.address,
                  r,
                  c,
                  value: cell.value,
                  fillAfter: cell.fill,
                  styleFillAfter: (cell as any).style?.fill,
                  border: cell.border
                })
              }
              continue
            }

            cell.border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            }
            const raw = cell.value
            const text = (raw === null || raw === undefined) ? '' : String((raw as any).text || raw).trim()
            if (!text) continue

            if (isV2HeaderOnly) {
              if (r === 1 || c === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
                continue
              }
              const isTitleBandCell = r === 2 && c >= 2
              const isHeaderValueBandCell = r >= 3 && r <= 7 && c >= 4 && c <= 9
              const isDateBandCell = r === 3 && c >= 10 && c <= 24
              const isAreaBandCell = r === 4 && c >= 4 && c <= 24
              const isPhoneValueBandCell = r >= 5 && r <= 7 && c >= 13 && c <= 24
              const isDetailValuesBandCell = r === 8 && ((c >= 9 && c <= 16) || (c >= 20 && c <= 24))
              const isDetailTitleCell = r === 8 && c >= 2 && c <= 5
              cell.font = { name: 'Arial', size: V2_EXPORT_FONT_SIZE, bold: true, color: { argb: 'FF202124' } }
              cell.alignment = {
                vertical: 'middle',
                horizontal: (r === 2 || text.startsWith('Fecha:') || isDetailTitleCell) ? 'center' : 'left'
              }
              cell.fill = (isTitleBandCell || isHeaderValueBandCell || isAreaBandCell || isPhoneValueBandCell || isDetailValuesBandCell)
                ? undefined
                : isDateBandCell
                  ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
                : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
              cell.border = {
                top: { style: 'thin', color: { argb: 'FF374151' } },
                left: { style: 'thin', color: { argb: 'FF374151' } },
                bottom: { style: 'thin', color: { argb: 'FF374151' } },
                right: { style: 'thin', color: { argb: 'FF374151' } }
              }
              continue
            }

            if (
              text === 'CONTROL DE PRODUCCION DE TERRENO' ||
              text === 'TAREAS REALIZADAS' ||
              text === 'PERSONAL' ||
              text === 'EQUIPOS' ||
              text === 'OBSERVACIONES - TEMAS DE PREOCUPACION O RESTRICCIONES A LAS TAREAS'
            ) {
              cell.font = {
                bold: true,
                size: text === 'CONTROL DE PRODUCCION DE TERRENO' ? V2_EXPORT_TITLE_FONT_SIZE : V2_EXPORT_FONT_SIZE
              }
              cell.alignment = { vertical: 'middle', horizontal: 'center' }
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF3F4F6' }
              }
            }

            if (text === 'HORAS TRABAJADAS POR ACTIVIDAD') {
              cell.alignment = { vertical: 'middle', horizontal: 'center' }
            }

            if (isV2Detailed && (
              text === 'N°' ||
              text === 'MATERIALES' ||
              text === 'CANTIDADES POR ACTIVIDAD' ||
              text === 'CANTIDAD' ||
              text === 'UNIDAD' ||
              text === 'AREA TRABAJO'
            )) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' }
            }

            if (text === 'TOTAL HORAS') {
              cell.alignment = { vertical: 'middle', horizontal: 'right' }
            }

            if (text === 'IMAGEN' || text === 'IMAGENES') {
              cell.alignment = { vertical: 'middle', horizontal: 'center' }
            }

            if (text.startsWith('EMITIDO POR:') || text === 'EMITIDO POR:' || text === 'CARGO:') {
              cell.alignment = { vertical: 'middle', horizontal: 'right' }
            }

            if (sectorActivitiesRowIndex >= 0 && r === sectorActivitiesRowIndex + 1 && c >= DETAIL_COL_START && c <= DETAIL_COL_END) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' }
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF3F4F6' }
              }
            }

            if (totalHoursRowIndex >= 0 && r === totalHoursRowIndex + 1) {
              if (String(text || '').toUpperCase() === 'TOTAL HORAS') {
                cell.alignment = { vertical: 'middle', horizontal: 'right' }
              }
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8FAFC' }
              }
            }

          }
        }
        const v2CenteredLabelTexts = new Set([
          'N°',
          'MATERIALES',
          'ACTIVIDADES',
          'ID',
          'CANTIDADES POR ACTIVIDAD',
          'CANTIDAD EJECUTADA',
          'CANTIDAD',
          'UNIDAD',
          'FRENTE',
          'TIPO',
          'DETALLE TIPO',
          'DESCRIPCION',
          'AREA TRABAJO'
        ])
        if (isV2Detailed) {
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          for (let r = 1; r <= rowCount; r++) {
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              const cell = ws.getCell(r, c)
              const normalized = normalizeCellText(cell.value)
              if (v2CenteredLabelTexts.has(normalized)) {
                const prevAlignment = cell.alignment as Record<string, any> | undefined
                cell.alignment = {
                  ...(prevAlignment || {}),
                  vertical: 'middle',
                  horizontal: 'center'
                }
              }
            }
          }
        }
        if (isV2Detailed) {
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          for (let r = 2; r <= rowCount; r++) {
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              const cell = ws.getCell(r, c)
              if (!String(getCellRawText(cell.value)).trim()) continue
              const previousFont = (cell.font || {}) as Record<string, any>
              cell.font = {
                ...previousFont,
                name: previousFont.name || 'Arial',
                size: Math.max(V2_EXPORT_FONT_SIZE, Number(previousFont.size || V2_EXPORT_FONT_SIZE))
              }
            }
          }
        }

        const frameTop = 1
        const frameLeft = 1
        const frameRight = isV2Detailed ? Math.min(DETAIL_COL_END, colCount) : colCount
        const frameBottom = Math.max(2, rowCount + 1)
        const frameStyle = { style: 'medium', color: { argb: 'FF000000' } }
        const reserveBreathingSpace = isV2Detailed || isV2HeaderOnly
        const actualFrameTop = reserveBreathingSpace ? 2 : frameTop
        const actualFrameLeft = reserveBreathingSpace ? 2 : frameLeft
        const actualFrameBottom = reserveBreathingSpace ? rowCount : frameBottom

        for (let c = actualFrameLeft; c <= frameRight; c++) {
          const topCell = ws.getCell(actualFrameTop, c)
          topCell.border = { ...(topCell.border || {}), top: frameStyle }
          const bottomCell = ws.getCell(actualFrameBottom, c)
          bottomCell.border = { ...(bottomCell.border || {}), bottom: frameStyle }
        }
        for (let r = actualFrameTop; r <= actualFrameBottom; r++) {
          const leftCell = ws.getCell(r, actualFrameLeft)
          leftCell.border = { ...(leftCell.border || {}), left: frameStyle }
          const rightCell = ws.getCell(r, frameRight)
          rightCell.border = { ...(rightCell.border || {}), right: frameStyle }
        }

        if (isV2Detailed) {
          if (detailRowsRange && detailRowsRange.startRow > 0 && detailRowsRange.endRow >= detailRowsRange.startRow) {
            const detailStartRow = detailRowsRange.startRow
            const detailEndRow = detailRowsRange.endRow
            applyNoFillBlackBordersToDetailRows(ws, detailStartRow, detailEndRow, colCount, true)
          }
          if (activitiesRowsRange && activitiesRowsRange.startRow > 0 && activitiesRowsRange.endRow >= activitiesRowsRange.startRow) {
            applyNoFillBlackBordersToDetailRows(ws, activitiesRowsRange.startRow, activitiesRowsRange.endRow, colCount, false)
          }
          if (generalQuestionsRowsRange && generalQuestionsRowsRange.startRow > 0 && generalQuestionsRowsRange.endRow >= generalQuestionsRowsRange.startRow) {
            applyNoFillBlackBordersToDetailRows(ws, generalQuestionsRowsRange.startRow, generalQuestionsRowsRange.endRow, colCount, false)
          }
          if (observationsValueRowsRange && observationsValueRowsRange.startRow > 0 && observationsValueRowsRange.endRow >= observationsValueRowsRange.startRow) {
            applyNoFillBlackBordersToDetailRows(ws, observationsValueRowsRange.startRow, observationsValueRowsRange.endRow, colCount, false)
          }
        }

        if (isV2Detailed) {
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          const dataBlockStarts = [
            detailRowsRange?.startRow ?? -1,
            activitiesRowsRange?.startRow ?? -1,
            generalQuestionsRowsRange?.startRow ?? -1,
            observationsValueRowsRange?.startRow ?? -1
          ].filter((row) => row > 0)
          const dataBlockEnds = [
            detailRowsRange?.endRow ?? -1,
            activitiesRowsRange?.endRow ?? -1,
            generalQuestionsRowsRange?.endRow ?? -1,
            observationsValueRowsRange?.endRow ?? -1
          ].filter((row) => row > 0)
          const firstDataRow = Math.min(...dataBlockStarts)
          const lastDataRow = Math.max(...dataBlockEnds)
          if (Number.isFinite(firstDataRow) && Number.isFinite(lastDataRow)) {
            for (let r = firstDataRow; r <= lastDataRow; r++) {
              for (let c = DETAIL_COL_START; c <= maxCol; c++) {
                const text = normalizeCellText(ws.getCell(r, c).value)
                const isSectionHeader = (
                  text === 'TOTAL HORAS' ||
                  text === 'N°' ||
                  text === 'PATENTE' ||
                  text === 'MAQUINARIA DE APOYO' ||
                  text === 'HORAS TRABAJADAS POR ACTIVIDAD' ||
                  text === 'HM' ||
                  text === 'UNIDAD' ||
                  text === 'AREA TRABAJO' ||
                  text === 'MATERIALES' ||
                  text === 'CANTIDADES POR ACTIVIDAD' ||
                  text === 'CANTIDAD' ||
                  text === 'ACTIVIDADES' ||
                  text === 'ID' ||
                  text === 'CANTIDAD EJECUTADA' ||
                  text === 'FRENTE' ||
                  text === 'TIPO' ||
                  text === 'DETALLE TIPO' ||
                  text === 'DESCRIPCION' ||
                  text === 'ACONTECIMIENTOS GENERALES' ||
                  text === 'SI' ||
                  text === 'NO' ||
                  text === 'COMENTARIOS' ||
                  text === 'OBSERVACIONES' ||
                  text === 'FIRMA' ||
                  text === 'SUPERVISOR' ||
                  text === 'JEFE TERRENO' ||
                  text === 'JEJ' ||
                  text === 'ANTUCOYA'
                )
                if (!isSectionHeader) {
                  const cell = ws.getCell(r, c)
                  cell.fill = undefined as any
                  cell.font = {
                    ...((cell.font || {}) as Record<string, any>),
                    bold: false
                  }
                  if ((cell as any).style && Object.prototype.hasOwnProperty.call((cell as any).style, 'fill')) {
                    delete (cell as any).style.fill
                  }
                }
              }
            }
          }
        }

        if (isV2Detailed && detailRowsRange && detailRowsRange.startRow > 0 && detailRowsRange.endRow >= detailRowsRange.startRow) {
          for (let r = detailRowsRange.startRow; r <= detailRowsRange.endRow; r++) {
            const cantCell = ws.getCell(r, 2)
            cantCell.border = {
              ...(cantCell.border || {}),
              left: frameStyle,
              right: { style: 'thin', color: { argb: 'FF000000' } }
            }
            cantCell.alignment = { vertical: 'middle', horizontal: 'center' }
          }

          const totalRow = (detailRowsRange as any)?.totalHoursRow
          if (totalRow && totalRow > 0) {
            ws.getCell(totalRow, 2).alignment = { vertical: 'middle', horizontal: 'right' }
            for (let c = 2; c <= 5; c++) {
              const cell = ws.getCell(totalRow, c)
              cell.border = {
                ...(cell.border || {}),
                left: c === 2 ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
              }
            }
          }
        }

        if (isV2Detailed && detailRowsRange && detailRowsRange.startRow > 0) {
          for (let r = detailRowsRange.startRow; r <= rowCount; r++) {
            const firstDataCell = ws.getCell(r, DETAIL_COL_START)
            const normalized = normalizeCellText(firstDataCell.value)
            if (normalized && normalized !== 'TOTAL HORAS' && normalized !== 'ACONTECIMIENTOS GENERALES' && normalized !== 'OBSERVACIONES') {
              const prevAlignment = firstDataCell.alignment as Record<string, any> | undefined
              firstDataCell.alignment = {
                ...(prevAlignment || {}),
                vertical: 'middle',
                horizontal: 'center'
              }
            }
          }
        }

        if (isV2Detailed && detailRowsRange && detailRowsRange.startRow > 0) {
          const hoursHeaderRow = Math.max(1, detailRowsRange.startRow - 2)
          const activityNumberRow = Math.max(1, detailRowsRange.startRow - 1)
          const totalRow = (detailRowsRange as any)?.totalHoursRow ?? -1
          const lastDetailRow = totalRow > 0 ? totalRow : detailRowsRange.endRow
          for (let r = hoursHeaderRow; r <= lastDetailRow; r++) {
            for (let c = 6; c <= Math.min(DETAIL_COL_END, colCount); c++) {
              const cell = ws.getCell(r, c)
              const prevAlignment = cell.alignment as Record<string, any> | undefined
              cell.alignment = {
                ...(prevAlignment || {}),
                vertical: 'middle',
                horizontal: 'center'
              }
            }
          }
          for (let c = 6; c <= Math.min(DETAIL_COL_END, colCount); c++) {
            ws.getCell(activityNumberRow, c).alignment = { vertical: 'middle', horizontal: 'center' }
          }
        }

        if (isV2Detailed && activitiesRowsRange && activitiesRowsRange.headerRow > 0 && activitiesRowsRange.endRow >= activitiesRowsRange.headerRow) {
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          const activityBlockStartRow = activitiesRowsRange.headerRow
          const activityBlockEndRow = activitiesRowsRange.endRow
          for (let r = activityBlockStartRow; r <= activityBlockEndRow; r++) {
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              const cell = ws.getCell(r, c)
              const isActivityTextCell = r > activityBlockStartRow && c >= 3 && c <= 5
              const prevAlignment = cell.alignment as Record<string, any> | undefined
              cell.alignment = {
                ...(prevAlignment || {}),
                vertical: 'middle',
                horizontal: isActivityTextCell ? 'left' : 'center'
              }
              cell.border = {
                ...(cell.border || {}),
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: c === DETAIL_COL_START ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                bottom: r === activityBlockEndRow ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                right: c === maxCol ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } }
              }
            }
          }
        }

        if (isV2Detailed) {
          let observationsHeaderRow = -1
          let signaturesLabelRow = -1
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          for (let r = 1; r <= rowCount; r++) {
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              const text = normalizeCellText(ws.getCell(r, c).value)
              if (text === 'OBSERVACIONES') observationsHeaderRow = r
              if (text === 'SUPERVISOR') signaturesLabelRow = r
            }
          }
          if (observationsHeaderRow > 0 && signaturesLabelRow >= observationsHeaderRow) {
            for (let r = observationsHeaderRow; r <= signaturesLabelRow; r++) {
              for (let c = DETAIL_COL_START; c <= maxCol; c++) {
                const cell = ws.getCell(r, c)
                const prevAlignment = cell.alignment as Record<string, any> | undefined
                cell.alignment = {
                  ...(prevAlignment || {}),
                  vertical: 'middle',
                  horizontal: 'center'
                }
                cell.border = {
                  ...(cell.border || {}),
                  top: r === observationsHeaderRow ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  left: c === DETAIL_COL_START ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  bottom: r === signaturesLabelRow ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  right: c === maxCol ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } }
                }
              }
            }
          }
        }

        if (isV2Detailed) {
          let generalHeaderRow = -1
          let observationsHeaderRow = -1
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          for (let r = 1; r <= rowCount; r++) {
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              const text = normalizeCellText(ws.getCell(r, c).value)
              if (text === 'ACONTECIMIENTOS GENERALES') generalHeaderRow = r
              if (text === 'OBSERVACIONES' && observationsHeaderRow < 0) observationsHeaderRow = r
            }
          }
          const generalEndRow = observationsHeaderRow > generalHeaderRow ? observationsHeaderRow - 1 : -1
          if (generalHeaderRow > 0 && generalEndRow >= generalHeaderRow) {
            for (let r = generalHeaderRow; r <= generalEndRow; r++) {
              for (let c = DETAIL_COL_START; c <= maxCol; c++) {
                const cell = ws.getCell(r, c)
                const isQuestionCol = c >= DETAIL_COL_START && c <= 5
                const prevAlignment = cell.alignment as Record<string, any> | undefined
                cell.alignment = {
                  ...(prevAlignment || {}),
                  vertical: 'middle',
                  horizontal: isQuestionCol ? 'left' : 'center'
                }
                cell.border = {
                  ...(cell.border || {}),
                  top: r === generalHeaderRow ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  left: c === DETAIL_COL_START ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  bottom: r === generalEndRow ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  right: c === maxCol ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } }
                }
              }
            }
          }
        }

        if (isV2Detailed) {
          let lowerBlockStartRow = -1
          let lowerBlockEndRow = -1
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          for (let r = 1; r <= rowCount; r++) {
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              const text = normalizeCellText(ws.getCell(r, c).value)
              if (text === 'ACTIVIDADES' && lowerBlockStartRow < 0) lowerBlockStartRow = r
              if (text === 'ANTUCOYA') lowerBlockEndRow = r
            }
          }
          if (lowerBlockStartRow > 0 && lowerBlockEndRow >= lowerBlockStartRow) {
            const topBorderRow = Math.max(1, lowerBlockStartRow - 1)
            for (let r = lowerBlockStartRow; r <= lowerBlockEndRow; r++) {
              for (let c = DETAIL_COL_START; c <= maxCol; c++) {
                const cell = ws.getCell(r, c)
                cell.border = {
                  top: r === lowerBlockStartRow ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  left: c === DETAIL_COL_START ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  bottom: r === lowerBlockEndRow ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } },
                  right: c === maxCol ? frameStyle : { style: 'thin', color: { argb: 'FF000000' } }
                }
              }
            }
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              const cell = ws.getCell(topBorderRow, c)
              cell.border = {
                ...(cell.border || {}),
                bottom: frameStyle
              }
            }
          }
        }

        if (isV2Detailed) {
          let machineryHeaderRow = -1
          let materialsHeaderRow = -1
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          for (let r = 1; r <= rowCount; r++) {
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              const text = normalizeCellText(ws.getCell(r, c).value)
              if (text === 'PATENTE') machineryHeaderRow = r
              if (text === 'MATERIALES' && materialsHeaderRow < 0) materialsHeaderRow = r
            }
          }
          const machineryEndRow = materialsHeaderRow > machineryHeaderRow ? materialsHeaderRow - 1 : -1
          if (machineryHeaderRow > 0 && machineryEndRow >= machineryHeaderRow) {
            for (let r = machineryHeaderRow; r <= machineryEndRow; r++) {
              for (let c = DETAIL_COL_START; c <= maxCol; c++) {
                const cell = ws.getCell(r, c)
                const prevAlignment = cell.alignment as Record<string, any> | undefined
                cell.alignment = {
                  ...(prevAlignment || {}),
                  vertical: 'middle',
                  horizontal: 'center'
                }
              }
            }
          }
        }

        if (isV2Detailed) {
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          for (let r = actualFrameTop; r <= actualFrameBottom; r++) {
            const leftCell = ws.getCell(r, DETAIL_COL_START)
            leftCell.border = {
              ...(leftCell.border || {}),
              left: frameStyle
            }
            const cell = ws.getCell(r, maxCol)
            cell.border = {
              ...(cell.border || {}),
              right: frameStyle
            }
          }
        }

        if (isV2Detailed) {
          for (let r = 1; r <= Math.min(12, rowCount); r++) {
            for (let c = 2; c <= Math.min(DETAIL_COL_END, colCount); c++) {
              const text = normalizeCellText(ws.getCell(r, c).value)
              if (text === 'EMITIDO POR:' || text === 'CARGO:') {
                ws.getCell(r, c).alignment = { vertical: 'middle', horizontal: 'right' }
              }
            }
          }
        }

        if (isV2Detailed) {
          const emittedByInfoRow = s.built.rows.findIndex((row: any[]) => (
            Array.isArray(row) &&
            row.some((value: any) => normalizeCellText(value) === 'EMITIDO POR:') &&
            row.some((value: any) => normalizeCellText(value) === 'CARGO:')
          )) + 1
          if (emittedByInfoRow > 0) {
            const clearValueCellFill = (columnNumber: number) => {
              const cell = ws.getCell(emittedByInfoRow, columnNumber)
              cell.fill = undefined as any
              if ((cell as any).style && Object.prototype.hasOwnProperty.call((cell as any).style, 'fill')) {
                delete (cell as any).style.fill
              }
              cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
            }
            clearValueCellFill(9) // Nombre emitido por
            clearValueCellFill(19) // Cargo
          }
        }

        if (isV2Detailed && detailRowsRange && detailRowsRange.startRow > 0 && detailRowsRange.endRow >= detailRowsRange.startRow) {
          const finalRows = [detailRowsRange.startRow, detailRowsRange.endRow]
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          for (const r of finalRows) {
            for (let c = DETAIL_COL_START; c <= maxCol; c++) {
              if (!DEBUG_COLS.has(c)) continue
              const cell = ws.getCell(r, c)
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] pre-writeBuffer cell', {
                address: cell.address,
                r,
                c,
                value: cell.value,
                fill: cell.fill,
                styleFill: (cell as any).style?.fill,
                border: cell.border
              })
            }
          }
        }

        if (isV2Detailed) {
          const maxCol = Math.min(DETAIL_COL_END, colCount)
          const mergedRanges = Array.isArray(s.built.merges) ? s.built.merges : []
          const getMergedRangeForCell = (rowNumber: number, columnNumber: number) => {
            const rowIndex = rowNumber - 1
            const columnIndex = columnNumber - 1
            return mergedRanges.find((merge: any) => (
              rowIndex >= Number(merge?.s?.r ?? -1) &&
              rowIndex <= Number(merge?.e?.r ?? -1) &&
              columnIndex >= Number(merge?.s?.c ?? -1) &&
              columnIndex <= Number(merge?.e?.c ?? -1)
            ))
          }
          const measureColWidth = (fromCol: number, toCol: number) => {
            let width = 0
            for (let c = fromCol; c <= toCol; c += 1) {
              width += Number(ws.getColumn(c).width || 8.43)
            }
            return Math.max(10, width)
          }
          const estimateHeight = (text: string, fromCol: number, toCol: number, minHeight = 18) => {
            const normalized = text.replace(/\t/g, '    ').trim()
            if (!normalized) return minHeight
            const charsPerLine = Math.max(12, Math.floor(measureColWidth(fromCol, toCol) * 1.05))
            const lines = normalized.split(/\r?\n/).reduce((total, line) => {
              const cleanLine = line.trim()
              return total + Math.max(1, Math.ceil(cleanLine.length / charsPerLine))
            }, 0)
            return Math.min(150, Math.max(minHeight, 6 + lines * 12.5))
          }
          const growRowHeight = (rowNumber: number, height: number) => {
            const row = ws.getRow(rowNumber)
            row.height = Math.max(Number(row.height || 0), height)
          }
          const applyReadableWrap = (
            startRow?: number,
            endRow?: number,
            colStart = DETAIL_COL_START,
            colEnd = maxCol,
            minHeight = 18,
            resolveSpanEnd?: (rowNumber: number, columnNumber: number) => number
          ) => {
            if (!startRow || !endRow || startRow < 1 || endRow < startRow) return
            for (let r = startRow; r <= endRow; r += 1) {
              let estimatedRowHeight = Number(ws.getRow(r).height || minHeight)
              for (let c = colStart; c <= colEnd; c += 1) {
                const cell = ws.getCell(r, c)
                const rawText = getCellRawText(cell.value)
                const normalized = rawText.trim()
                if (!normalized || normalized === '-') continue
                const isLongText = normalized.length > 18 || /\r?\n/.test(rawText)
                if (!isLongText) continue
                const prevAlignment = cell.alignment as Record<string, any> | undefined
                cell.alignment = {
                  ...(prevAlignment || {}),
                  vertical: 'middle',
                  wrapText: true,
                  shrinkToFit: false
                }
                const previousFont = (cell.font || {}) as Record<string, any>
                const currentSize = Number(previousFont.size || 11)
                cell.font = {
                  ...previousFont,
                  name: previousFont.name || 'Arial',
                  size: Math.max(V2_EXPORT_FONT_SIZE, currentSize)
                }
                const mergedRange = getMergedRangeForCell(r, c)
                const realMergedEndCol = mergedRange ? Number(mergedRange.e.c || 0) + 1 : c
                const mergedEndCol = resolveSpanEnd
                  ? Math.max(c, Math.min(colEnd, resolveSpanEnd(r, c)))
                  : Math.min(colEnd, realMergedEndCol)
                estimatedRowHeight = Math.max(
                  estimatedRowHeight,
                  estimateHeight(rawText, c, mergedEndCol, minHeight)
                )
              }
              growRowHeight(r, estimatedRowHeight)
            }
          }

          applyReadableWrap(detailRowsRange?.startRow, detailRowsRange?.endRow, DETAIL_COL_START, maxCol, 20)
          applyReadableWrap(activitiesRowsRange?.startRow, activitiesRowsRange?.endRow, DETAIL_COL_START, maxCol, 19)
          applyReadableWrap(generalQuestionsRowsRange?.startRow, generalQuestionsRowsRange?.endRow, DETAIL_COL_START, maxCol, 18)
          applyReadableWrap(observationsValueRowsRange?.startRow, observationsValueRowsRange?.endRow, DETAIL_COL_START, maxCol, 28)
        }

        // Inserta evidencias al final de la hoja (si vienen para este reporte).
        const sheetEvidence = Array.isArray(s.evidenceImages) ? s.evidenceImages : []
        if (sheetEvidence.length > 0) {
          const loadedImages = (await Promise.all(sheetEvidence.map(async (file) => {
            const key = String(file?.key || '').trim()
            if (!key) return null
            try {
              const url = `/api/field-reports/evidence/download?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file?.name || 'imagen')}`
              const res = await fetch(url)
              if (!res.ok) return null
              const blob = await res.blob()
              const dataUrl = await readBlobAsDataUrl(blob)
              const size = await getImageSize(dataUrl)
              const extension: 'png' | 'jpeg' = dataUrl.startsWith('data:image/png') ? 'png' : 'jpeg'
              return { dataUrl, extension, width: size.width, height: size.height }
            } catch {
              return null
            }
          }))).filter(Boolean) as Array<{ dataUrl: string; extension: 'png' | 'jpeg'; width: number; height: number }>

          if (loadedImages.length > 0) {
            const firstCol = 2
            const lastCol = Math.max(2, Math.min(DETAIL_COL_END, colCount || 20))
            const totalColsForImages = lastCol - firstCol + 1
            const columnsPerImage = 3
            const imagesPerRow = Math.max(1, Math.floor(totalColsForImages / columnsPerImage))
            const rowsPerBand = 8
            const paddingPx = 4
            let imageRowCursor = Math.max(rowCount + 2, ws.rowCount + 2)

            ws.mergeCells(imageRowCursor, firstCol, imageRowCursor, lastCol)
            const evidenceHeader = ws.getCell(imageRowCursor, firstCol)
            evidenceHeader.value = 'EVIDENCIA FOTOGRAFICA'
            evidenceHeader.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF163B82' } }
            evidenceHeader.alignment = { vertical: 'middle', horizontal: 'left' }
            ws.getRow(imageRowCursor).height = 20
            imageRowCursor += 1

            for (let i = 0; i < loadedImages.length; i += imagesPerRow) {
              const rowImages = loadedImages.slice(i, i + imagesPerRow)
              const bandStartRow = imageRowCursor
              const bandEndRow = imageRowCursor + rowsPerBand - 1
              for (let r = bandStartRow; r <= bandEndRow; r += 1) ws.getRow(r).height = 34

              rowImages.forEach((image, idx) => {
                const startCol = firstCol + idx * columnsPerImage
                const endCol = Math.min(lastCol, startCol + columnsPerImage - 1)
                ws.mergeCells(bandStartRow, startCol, bandEndRow, endCol)
                const imageId = workbook.addImage({ base64: image.dataUrl, extension: image.extension })
                const slotWidthPx = getColumnSpanPx(ws, startCol, endCol)
                const slotHeightPx = getRowSpanPx(ws, bandStartRow, bandEndRow)
                const fitted = fitImage(image.width, image.height, Math.max(1, slotWidthPx - paddingPx * 2), Math.max(1, slotHeightPx - paddingPx * 2))
                const offsetX = Math.max(paddingPx, (slotWidthPx - fitted.width) / 2)
                const offsetY = Math.max(paddingPx, (slotHeightPx - fitted.height) / 2)
                ws.addImage(imageId, {
                  tl: {
                    col: addPixelOffsetToColumn(ws, startCol, offsetX, endCol),
                    row: addPixelOffsetToRow(ws, bandStartRow, offsetY, bandEndRow)
                  },
                  ext: { width: fitted.width, height: fitted.height },
                  editAs: 'oneCell'
                })
              })

              imageRowCursor = bandEndRow + 1
            }
          }
        }
      }
if (FIELD_REPORTS_DEV_DEBUG) console.log('[Excel V2 DEBUG] about to writeBuffer', { filename })
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      return true
    } catch (e) {
      console.warn('ExcelJS export failed, fallback to XLSX', e)
      return false
    }
  }

  const handleExportExcel = async (forcedVersion?: 'V1' | 'V2') => {
    try {
      if (!selectedReport) return
      if (isAdminRole && !personalReady) {
        showSnackbar('Espere a que termine la carga del personal para exportar', 'info')
        return
      }
      const mod = await import('xlsx')
      const XLSX = (mod as any).default || mod
      const safeDate = reportDate || new Date().toISOString().slice(0, 10)
      const exportCollaboratorLookup = Object.keys(collaboratorMap || {}).length > 0
        ? collaboratorMap
        : await loadCollaboratorLookup()
      const exportCrewByPersonId = buildCrewByPersonIdFromMembers(crewMembers || [])
      const exportEmittedById = String(emittedById || selectedReport?.emitted_by_id || selectedReport?.emitido_por_id || '').trim()
      const exportEmittedByFromLookup = exportEmittedById ? exportCollaboratorLookup[exportEmittedById] : null
      const exportEmittedByName = String(
        emittedByWorker?.name ||
        selectedReport?.emitted_by_name ||
        exportEmittedByFromLookup?.name ||
        ''
      ).trim()
      const exportEmittedByPosition = String(
        emittedByWorker?.position ||
        selectedReport?.emitted_by_position ||
        exportEmittedByFromLookup?.position ||
        ''
      ).trim()

      const excelVersion: 'V1' | 'V2' = forcedVersion
        ? forcedVersion
        : (String(reportDesignVersion || 'V1').toUpperCase() === 'V2' ? 'V2' : 'V1')
      const rawExportTitle = String(
        selectedReport?.report_title ||
        selectedReport?.reportTitle ||
        reportTitle ||
        'REPORTE DE TERRENO'
      ).trim()
      const safeExportTitle = rawExportTitle
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'REPORTE DE TERRENO'
      const exportFileName = `${safeExportTitle}.xlsx`
      const built = buildDetailedReportRows({
        designVersion: excelVersion,
        reportTitle: selectedReport?.report_title || selectedReport?.reportTitle || '',
        contractName,
        date: safeDate,
        area,
        jefeTerreno: fieldBossName || selectedReport?.jefe_terreno_name || selectedReport?.jefe_terreno || selectedReport?.field_boss_name || selectedReport?.field_boss || selectedReport?.emitted_by_name || '',
        jefeTerrenoPhone: fieldBossPhone || selectedReport?.jefe_terreno_phone || selectedReport?.field_boss_phone || collaboratorPhoneById[String(selectedReport?.emitted_by_id || '')] || '',
        supervisor,
        supervisorId: selectedReport?.supervisor_id,
        supervisorPhone:
          supervisorPhone ||
          collaboratorPhoneById[String(selectedReport?.supervisor_id || '')] ||
          collaboratorPhoneByNameNorm[normalizeText(String(supervisor || selectedReport?.supervisor || ''))] ||
          selectedReport?.supervisor_phone ||
          '',
        capataz,
        capatazId: selectedReport?.capataz_id,
        capatazPhone:
          capatazPhone ||
          collaboratorPhoneById[String(selectedReport?.capataz_id || '')] ||
          collaboratorPhoneByNameNorm[normalizeText(String(capataz || selectedReport?.capataz || selectedReport?.foreman || ''))] ||
          selectedReport?.capataz_phone ||
          selectedReport?.foreman_phone ||
          '',
        emittedByName: exportEmittedByName,
        emittedByPosition: exportEmittedByPosition,
        specialty,
        turno,
        weather,
        workFront: workFront || selectedReport?.work_front || '',
        crewLabel: reportCrewNameLabel || '-',
        assignments: assignedActivities || [],
        personnelRows: personnelRows || [],
        personHours: personHours || {},
        personExtraHours: personExtraHours || {},
        equipmentEntries: equipmentEntries || [],
        materialEntries: materialEntries || [],
        equipmentHours: equipmentHours || {},
        materialQuantities: materialQuantities || {},
        activityObservations: activityObservations || {},
        generalEventsAnswers: generalEventsAnswers || [],
        generalEventsComments: generalEventsComments || [],
        restrictions: restrictions || '',
        collaboratorLookup: exportCollaboratorLookup,
        crewByPersonId: exportCrewByPersonId,
        crewMembers: crewMembers || []
      })

      const ws = XLSX.utils.aoa_to_sheet(built.rows)
      ws['!cols'] = built.cols
      ws['!merges'] = built.merges
      ws['!rows'] = built.rowHeights
      ws['!margins'] = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }

      const exportEvidenceImages = Array.from(
        new Map(
          (assignedActivities || [])
            .flatMap((a: any) => parseEvidenceFiles(a?.evidence_files))
            .map((f) => [String(f?.key || '').trim(), f] as const)
        ).values()
      ).filter((f) => String(f?.key || '').trim().length > 0)

      const excelJsDone = await exportWithExcelJs(
        exportFileName,
        [{ name: 'reporte', built, evidenceImages: exportEvidenceImages }]
      )
      if (excelJsDone) {
        showSnackbar('Excel exportado correctamente', 'success')
        closeReportModal('manual')
        return
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'reporte')
      XLSX.writeFile(wb, exportFileName)
      if (excelVersion === 'V2') {
        showSnackbar('Excel V2 exportado sin estilos avanzados (fallback activado)', 'warning')
      } else {
        showSnackbar('Excel exportado sin estilos (instala exceljs para bordes)', 'info')
      }
      closeReportModal('manual')
    } catch (e) {
      console.error('Error exporting excel', e)
      showSnackbar('Error al exportar Excel', 'error')
    }
  }

  const handleExportReportsListExcel = async (reportsToExport?: FieldReport[], customFileName?: string) => {
    try {
      const visibleReports = (reportsToExport && reportsToExport.length > 0) ? reportsToExport : (reports || [])
      if (!visibleReports || visibleReports.length === 0) {
        showSnackbar('No hay reportes para exportar', 'info')
        return false
      }
      const mod = await import('xlsx')
      const XLSX = (mod as any).default || mod

      const wb = XLSX.utils.book_new()
      const exportCollaboratorLookup = await loadCollaboratorLookup()
      const excelJsSheets: Array<{ name: string; built: { rows: any[][]; cols: any[]; merges: any[]; rowHeights: any[] } }> = []

      for (let i = 0; i < visibleReports.length; i++) {
        const r = visibleReports[i]
        let full: any = r
        try {
          if (r?.id) {
            const res = await fetch(`/api/field-reports?id=${encodeURIComponent(String(r.id))}`)
            if (res.ok) {
              const maybe = await res.json()
              if (maybe && maybe.id) full = maybe
            }
          }
        } catch {}

        const assignments = normalizeToArrayExport(full?.assignments)
        const activities = assignments.length > 0 ? assignments : normalizeToArrayExport(full?.activities)
        const personnelRaw = normalizeJsonExport(full?.personnel)
        const personHoursData = normalizeJsonExport(full?.person_hours) || {}
        const equipmentEntriesData = normalizeJsonExport(full?.equipment_entries) || []
        const materialEntriesData = normalizeJsonExport(full?.material_entries) || []
        const materialQuantitiesData = normalizeJsonExport(full?.material_quantities) || {}
        const equipmentHoursData = normalizeJsonExport(full?.equipment_hours) || {}
        const activityObsData = normalizeJsonExport(full?.activity_observations) || {}
        const generalAnswersData = normalizeJsonExport(full?.general_events_answers) || []
        const generalCommentsData = normalizeJsonExport(full?.general_events_comments) || []

        const persRows = Array.isArray(personnelRaw)
          ? personnelRaw.map((p: any, idx: number) => ({
              personId: String(p?.id || p?.collaborator_id || p?.user_id || p?.name || `person-${idx}`),
              document: String(p?.document || '').trim(),
              position: p?.role || '',
              name: String(p?.name || '').trim(),
              crewName: p?.crewName || p?.crew_name || '',
              area: String(p?.area || '').trim()
            }))
          : []

        const crewLabel = Array.isArray(full?.crew_ids) && full.crew_ids.length > 0
          ? (full?.crew_name || full.crew_ids.join(', '))
          : (full?.crew_name || (full?.crew_id ? String(full.crew_id) : '-'))
        const exportCrewByPersonId = await loadCrewByPersonIdForReport(full)

        const built = buildDetailedReportRows({
          designVersion: String(full?.design_version || 'V1'),
          reportTitle: full?.report_title || '',
          contractName,
          date: full?.date,
          area: full?.area || '',
          jefeTerreno: full?.jefe_terreno_name || full?.jefe_terreno || full?.field_boss_name || full?.field_boss || full?.terrain_boss_name || full?.site_boss_name || full?.site_boss || full?.emitted_by_name || '',
          jefeTerrenoPhone: full?.jefe_terreno_phone || full?.field_boss_phone || full?.terrain_boss_phone || full?.site_boss_phone || '',
          supervisor: full?.supervisor || '',
          supervisorId: full?.supervisor_id,
          supervisorPhone:
            full?.supervisor_phone ||
            collaboratorPhoneById[String(full?.supervisor_id || '')] ||
            collaboratorPhoneByNameNorm[normalizeText(String(full?.supervisor || full?.supervisor_name || ''))] ||
            '',
          capataz: full?.capataz || '',
          capatazId: full?.capataz_id,
          capatazPhone:
            full?.capataz_phone ||
            full?.foreman_phone ||
            collaboratorPhoneById[String(full?.capataz_id || full?.foreman_id || '')] ||
            collaboratorPhoneByNameNorm[normalizeText(String(full?.capataz || full?.foreman || full?.capataz_name || ''))] ||
            '',
          emittedByName: full?.emitted_by_name || '',
          emittedByPosition: full?.emitted_by_position || '',
          specialty: full?.specialty || '',
          turno: full?.turno || '',
          weather: full?.weather,
          workFront: full?.work_front || '',
          crewLabel,
          assignments: activities,
          personnelRows: persRows,
          personHours: personHoursData,
          personExtraHours: (personHoursData && typeof personHoursData.__extras === 'object' ? personHoursData.__extras : {}),
          equipmentEntries: equipmentEntriesData,
          materialEntries: materialEntriesData,
          equipmentHours: equipmentHoursData,
          materialQuantities: materialQuantitiesData,
          activityObservations: activityObsData,
          generalEventsAnswers: Array.isArray(generalAnswersData) ? generalAnswersData : [],
          generalEventsComments: Array.isArray(generalCommentsData) ? generalCommentsData : [],
          restrictions: String(full?.restrictions || '').trim(),
          collaboratorLookup: exportCollaboratorLookup,
          crewByPersonId: exportCrewByPersonId
        })

        const ws = XLSX.utils.aoa_to_sheet(built.rows)
        ws['!cols'] = built.cols
        ws['!merges'] = built.merges
        ws['!rows'] = built.rowHeights
        ws['!margins'] = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
        const sheetNameBase = `reporte_${i + 1}`
        const sheetName = sheetNameBase.length > 31 ? sheetNameBase.slice(0, 31) : sheetNameBase
        excelJsSheets.push({ name: sheetName, built })
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      }

      const excelJsDone = await exportWithExcelJs(
        customFileName || `reportes_terreno_detalle_${new Date().toISOString().slice(0, 10)}.xlsx`,
        excelJsSheets
      )
      if (excelJsDone) {
        return true
      }

      XLSX.writeFile(wb, customFileName || `reportes_terreno_detalle_${new Date().toISOString().slice(0, 10)}.xlsx`)
      return true
    } catch (e) {
      console.error('Error exporting reports list', e)
      showSnackbar('Error al exportar reportes', 'error')
      return false
    }
  }

  type DailyExcelActivityBlock = {
    activityLabel: string
    crewLabel: string
    sectionLabel?: string
    activityLines: Array<{ text: string; quantity: string; unit: string }>
    observation: string
  }

  type DailyExcelImage = EvidenceFile & {
    front: string
    activityText: string
  }

  type DailyExcelFrontGroup = {
    front: string
    rows: DailyExcelActivityBlock[]
    images: DailyExcelImage[]
  }

  const getFieldReportActivityDescription = useCallback((activity: any) => {
    const parts = [
      activity?.activity,
      activity?.description,
      activity?.execution_description,
      activity?.executionDescription,
      activity?.user_detail,
      activity?.detalle,
      activity?.work_description,
      activity?.name,
      activity?.title,
      activity?.task,
      typeof activity === 'string' ? activity : ''
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
    const unique: string[] = []
    parts.forEach((part) => {
      const normalized = normalizeText(part)
      if (!normalized) return
      if (unique.some((existing) => normalizeText(existing) === normalized || normalizeText(existing).includes(normalized) || normalized.includes(normalizeText(existing)))) return
      unique.push(part)
    })
    return unique.join(' - ')
  }, [])

  const getActivityObservationText = useCallback((report: any, activity: any, idx: number) => {
    const observationsRaw = normalizeJsonExport(report?.activity_observations)
    const activityId = String(activity?.activityId || activity?.activity_id || activity?.id || `activity-${idx}`)
    const candidates: string[] = []
    if (observationsRaw && typeof observationsRaw === 'object' && !Array.isArray(observationsRaw)) {
      candidates.push(String((observationsRaw as any)[activityId] || '').trim())
      candidates.push(String((observationsRaw as any)[String(idx)] || '').trim())
      candidates.push(String((observationsRaw as any)[String(idx + 1)] || '').trim())
    }
    candidates.push(String(activity?.observations || activity?.observation || activity?.restriction || activity?.restrictions || '').trim())
    return candidates.find(Boolean) || ''
  }, [])

  const getFieldReportActivityQuantityUnit = useCallback((activity: any) => {
    const rawQuantity =
      activity?.executed_quantity ??
      activity?.cantidad_ejecutada ??
      activity?.cantidadEjecutada ??
      activity?.quantity_executed ??
      activity?.quantityExecuted ??
      activity?.executedQuantity ??
      activity?.quantity ??
      ''
    const quantityNumber = typeof rawQuantity === 'number'
      ? rawQuantity
      : Number(String(rawQuantity ?? '').replace(/\./g, '').replace(',', '.'))
    const quantity = rawQuantity === '' || rawQuantity == null
      ? ''
      : (Number.isFinite(quantityNumber) ? String(rawQuantity) : String(rawQuantity).trim())
    const unit = String(activity?.unit || activity?.unidad || activity?.measurement_unit || activity?.measurementUnit || '').trim()
    return { quantity: String(quantity || '').trim(), unit }
  }, [])

  const hasPositiveFieldReportActivityQuantity = useCallback((activity: any) => {
    const { quantity } = getFieldReportActivityQuantityUnit(activity)
    const raw = String(quantity || '').trim()
    if (!raw) return false
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw
    const value = Number(normalized)
    return Number.isFinite(value) && value > 0
  }, [getFieldReportActivityQuantityUnit])

  const getDailyExcelContractForFront = useCallback((front: any) => {
    const normalized = normalizeText(String(front || '')).toUpperCase()
    if (normalized.includes('CANALET')) return 'ANT-GPRO-FOR-CANALETAS'
    if (normalized.includes('PISCIN')) return 'ANT-GPRO-FOR-PISCINAS'
    return String(contractName || 'ANT-GPRO-FOR-PISCINAS').toUpperCase()
  }, [contractName])

  const fetchFullReportForDailyExcel = useCallback(async (report: FieldReport) => {
    if (!report?.id) return report
    const readEvidence = (row: any) => {
      const candidates = [
        row?.evidence_files,
        row?.evidenceFiles,
        row?.evidence,
        row?.images,
        row?.photos,
        row?.attachments
      ]
      for (const candidate of candidates) {
        const files = parseEvidenceFiles(candidate)
        if (files.length > 0) return files
      }
      return []
    }
    const activityKey = (row: any, idx: number) => String(
      row?.activityId ||
      row?.activity_id ||
      row?.id ||
      row?.item_id ||
      row?.sub_id ||
      getFieldReportActivityDescription(row) ||
      `activity-${idx}`
    ).trim()
    const mergeRowsPreservingEvidence = (primaryRows: any[], fallbackRows: any[]) => {
      const fallbackByKey = new Map<string, any>()
      ;(fallbackRows || []).forEach((row, idx) => {
        fallbackByKey.set(activityKey(row, idx), row)
      })
      return (primaryRows || []).map((row, idx) => {
        const currentFiles = readEvidence(row)
        if (currentFiles.length > 0) return row
        const fallback = fallbackByKey.get(activityKey(row, idx))
        const fallbackFiles = readEvidence(fallback)
        return fallbackFiles.length > 0 ? { ...row, evidence_files: fallbackFiles } : row
      })
    }
    try {
      const res = await fetch(`/api/field-reports?id=${encodeURIComponent(String(report.id))}`)
      if (!res.ok) return report
      const payload = await res.json()
      if (!payload?.id) return report
      const payloadActivities = normalizeToArrayExport(payload?.activities)
      const payloadAssignments = normalizeToArrayExport(payload?.assignments)
      const reportActivities = normalizeToArrayExport((report as any)?.activities)
      const reportAssignments = normalizeToArrayExport((report as any)?.assignments)
      const payloadEvidence = readEvidence(payload)
      const reportEvidence = readEvidence(report)
      return {
        ...report,
        ...payload,
        activities: payloadActivities.length > 0
          ? mergeRowsPreservingEvidence(payloadActivities, reportActivities)
          : (report as any)?.activities,
        assignments: payloadAssignments.length > 0
          ? mergeRowsPreservingEvidence(payloadAssignments, reportAssignments)
          : (report as any)?.assignments,
        evidence_files: payloadEvidence.length > 0 ? payloadEvidence : reportEvidence,
        crew_name: payload?.crew_name || (report as any)?.crew_name,
        crew_ids: Array.isArray(payload?.crew_ids) && payload.crew_ids.length > 0 ? payload.crew_ids : (report as any)?.crew_ids,
        crew_id: payload?.crew_id || (report as any)?.crew_id,
      }
    } catch {
      return report
    }
  }, [getFieldReportActivityDescription])

  const buildDailyExcelModel = useCallback((date: string, sourceReports: FieldReport[]) => {
    const formatModelDate = (raw: string) => {
      const value = String(raw || '').slice(0, 10)
      const [year, month, day] = value.split('-')
      return year && month && day ? `${day}/${month}/${year}` : value
    }
    const safeDate = String(date || '').slice(0, 10)
    const formattedDate = formatModelDate(safeDate || new Date().toISOString().slice(0, 10))
    const firstSequence = (sourceReports || [])
      .map((report: any) => Number(report?.report_sequence_no || 0))
      .find((n) => Number.isFinite(n) && n > 0)
    const byFront = new Map<string, DailyExcelActivityBlock[]>()
    const imagesByFront = new Map<string, DailyExcelImage[]>()
    const crewNameById = new Map<string, string>()
    ;(crews || []).forEach((crew: any) => {
      const id = String(crew?.id || '').trim()
      const name = String(crew?.name || '').trim()
      if (id && name) crewNameById.set(id, name)
    })
    const cleanCrewLabel = (value: any) => {
      return String(value || '')
        .trim()
        .replace(/^cuadrilla\s+/i, '')
        .trim()
    }
    const resolveCrewLabelForReport = (report: any) => {
      const ids = Array.isArray(report?.crew_ids) && report.crew_ids.length > 0
        ? report.crew_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : (report?.crew_id ? [String(report.crew_id).trim()] : [])
      const names = ids
        .map((id: string) => crewNameById.get(id) || '')
        .filter(Boolean)
        .map(cleanCrewLabel)
      if (names.length > 0) return Array.from(new Set(names)).join(', ')
      return cleanCrewLabel(report?.crew_name || report?.crewName || report?.crew_label || '')
    }
    const resolveCrewLabelForActivity = (activity: any, fallback: string) => {
      const activityCrewId = String(
        activity?.crewId ||
        activity?.crew_id ||
        activity?.crewID ||
        activity?.assignedCrewId ||
        ''
      ).trim()
      if (activityCrewId) {
        const fromMap = crewNameById.get(activityCrewId)
        if (fromMap) return cleanCrewLabel(fromMap)
      }
      return cleanCrewLabel(activity?.crewName || activity?.crew_name || activity?.crew || fallback)
    }
    const getDailyExcelFrontLabel = (value: any, fallback = 'SIN FRENTE') => {
      const raw = String(value || fallback || '').trim()
      const normalized = normalizeText(raw).toUpperCase()
      if (normalized.includes('PISCIN')) return 'PISCINAS'
      if (normalized.includes('CANALET')) return 'CANALETAS'
      if (normalized.includes('INSTALACION') || normalized === 'IFA') return 'CANALETAS'
      return raw || fallback
    }
    const isDailyExcelIfaFront = (value: any) => {
      const normalized = normalizeText(String(value || '')).toUpperCase()
      return normalized.includes('INSTALACION') || normalized === 'IFA'
    }
    const pushImage = (front: string, image: EvidenceFile, activityText: string) => {
      const cleanFront = getDailyExcelFrontLabel(front || 'SIN FRENTE')
      const key = String(image?.key || '').trim()
      if (!key) return
      const current = imagesByFront.get(cleanFront) || []
      if (current.some((item) => item.key === key)) return
      current.push({ ...image, front: cleanFront, activityText })
      imagesByFront.set(cleanFront, current)
    }
    const getEvidenceFilesFromAnyShape = (value: any) => {
      const candidates = [
        value?.evidence_files,
        value?.evidenceFiles,
        value?.evidence,
        value?.images,
        value?.photos,
        value?.attachments
      ]
      for (const candidate of candidates) {
        const files = parseEvidenceFiles(candidate)
        if (files.length > 0) return files
      }
      return []
    }
    const activityIdentity = (row: any, idx: number) => {
      const stable = String(
        row?.activityId ||
        row?.activity_id ||
        row?.id ||
        row?.item_id ||
        row?.sub_id ||
        ''
      ).trim()
      if (stable) return stable
      const text = normalizeText(getFieldReportActivityDescription(row)).toUpperCase()
      const crew = String(row?.crewId || row?.crew_id || row?.crewName || row?.crew_name || '').trim()
      return text ? `${text}__${crew}` : `activity-${idx}`
    }
    const mergeActivityRows = (base: any, extra: any) => {
      if (!base) return extra
      if (!extra) return base
      const baseEvidence = getEvidenceFilesFromAnyShape(base)
      const extraEvidence = getEvidenceFilesFromAnyShape(extra)
      return {
        ...extra,
        ...base,
        evidence_files: baseEvidence.length > 0 ? baseEvidence : extraEvidence
      }
    }
    const getCombinedActivityRows = (report: any) => {
      const assignments = normalizeToArrayExport(report?.assignments)
      const activities = normalizeToArrayExport(report?.activities)
      const map = new Map<string, any>()
      ;[...assignments, ...activities].forEach((row, idx) => {
        const key = activityIdentity(row, idx)
        map.set(key, mergeActivityRows(map.get(key), row))
      })
      return Array.from(map.values())
    }

    ;(sourceReports || []).forEach((report: any) => {
      const rawReportFront = report?.work_front || report?.front || report?.report_front || detectFieldReportFront(report) || 'SIN FRENTE'
      const reportFront = getDailyExcelFrontLabel(rawReportFront)
      const activities = getCombinedActivityRows(report)
      const crewLabelFallback = resolveCrewLabelForReport(report)
      const isTopographyCrew = normalizeText(crewLabelFallback).includes('topograf')
      const reportObservation = String(report?.restrictions || report?.observations || '').trim()
      const personnelRowsForReport = normalizeToArrayExport(report?.personnel)
      const personHoursRaw = normalizeJsonExport(report?.person_hours)
      const personHoursObj = (personHoursRaw && typeof personHoursRaw === 'object' && !Array.isArray(personHoursRaw))
        ? { ...(personHoursRaw as Record<string, any>) }
        : {}
      delete (personHoursObj as any).__extras
      const topographerActivityIndexes = new Set<number>()
      const isIfaReport = isDailyExcelIfaFront(rawReportFront)
      getEvidenceFilesFromAnyShape(report).forEach((image) => {
        pushImage(reportFront, image, '')
      })

      personnelRowsForReport.forEach((person: any, personIdx: number) => {
        const positionText = normalizeText(String(
          person?.role ||
          person?.position ||
          person?.cargo ||
          person?.job_title ||
          person?.jobTitle ||
          ''
        ))
        if (!positionText.includes('topograf')) return

        const candidateIds = [
          person?.personId,
          person?.id,
          person?.collaborator_id,
          person?.collaboratorId,
          person?.user_id,
          person?.userId,
          person?.document,
          person?.rut,
          person?.name,
          `person-${personIdx}`
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)

        const hoursRow = candidateIds
          .map((id) => (personHoursObj as Record<string, any>)[id])
          .find((value) => Array.isArray(value)) as any[] | undefined

        if (!Array.isArray(hoursRow)) return
        hoursRow.forEach((value, activityIdx) => {
          if ((Number(value) || 0) > 0) topographerActivityIndexes.add(activityIdx)
        })
      })

	      const rowsByCrewFront = new Map<string, {
	        front: string
	        crewLabel: string
	        sectionLabel?: string
	        lines: Array<{ text: string; quantity: string; unit: string }>
	        observations: string[]
	      }>()

	      const pushLine = (front: string, crewLabel: string, line: string, observation?: string, quantity = '', unit = '', sectionLabel = '') => {
	        const cleanFront = getDailyExcelFrontLabel(front || reportFront || 'SIN FRENTE')
	        const cleanSection = String(sectionLabel || '').trim()
	        const cleanCrew = cleanSection ? '' : String(crewLabel || crewLabelFallback || '').trim()
	        const key = `${cleanFront}__${cleanSection || cleanCrew || 'SIN CUADRILLA'}`
	        const current = rowsByCrewFront.get(key) || { front: cleanFront, crewLabel: cleanCrew, sectionLabel: cleanSection, lines: [], observations: [] }
	        if (line) current.lines.push({ text: line, quantity, unit })
	        if (observation) current.observations.push(observation)
	        rowsByCrewFront.set(key, current)
	      }
      let topographyLineNo = 1
      let regularLineNo = 1
      let pushedActivityCount = 0

      if (activities.length > 0) {
        activities.forEach((activity: any, idx: number) => {
          const description = getFieldReportActivityDescription(activity)
	          if (!description) return
	          const rawActivityFront = activity?.work_front || activity?.activity_front || activity?.front || activity?.frente || rawReportFront
	          const front = getDailyExcelFrontLabel(rawActivityFront, reportFront)
	          getEvidenceFilesFromAnyShape(activity).forEach((image) => {
	            pushImage(front, image, description)
	          })
	          const hasPositiveQuantity = hasPositiveFieldReportActivityQuantity(activity)
	          const isIfaActivity = isIfaReport || isDailyExcelIfaFront(rawActivityFront)
	          const crewLabel = resolveCrewLabelForActivity(activity, crewLabelFallback)
	          const { quantity, unit } = hasPositiveQuantity
	            ? getFieldReportActivityQuantityUnit(activity)
	            : { quantity: '', unit: '' }
	          if (isIfaActivity) {
	            pushLine(front, '', `${regularLineNo}.- ${description}`, getActivityObservationText(report, activity, idx), quantity, unit, 'IFA')
	            regularLineNo += 1
	            pushedActivityCount += 1
	            return
	          }
	          if (topographerActivityIndexes.has(idx) || isTopographyCrew) {
	            pushLine(front, '', `${topographyLineNo}.- ${description}`, getActivityObservationText(report, activity, idx), quantity, unit, 'TOPOGRAFIA')
	            topographyLineNo += 1
	            pushedActivityCount += 1
	            return
	          }
	          pushLine(front, crewLabel, `${regularLineNo}.- ${description}`, getActivityObservationText(report, activity, idx), quantity, unit)
	          regularLineNo += 1
	          pushedActivityCount += 1
	        })
        if (pushedActivityCount === 0) {
          activities.forEach((activity: any) => {
            const description = getFieldReportActivityDescription(activity)
            if (!description) return
            const rawActivityFront = activity?.work_front || activity?.activity_front || activity?.front || activity?.frente || rawReportFront
            const front = getDailyExcelFrontLabel(rawActivityFront, reportFront)
            getEvidenceFilesFromAnyShape(activity).forEach((image) => {
              pushImage(front, image, description)
            })
            const crewLabel = resolveCrewLabelForActivity(activity, crewLabelFallback)
            pushLine(front, crewLabel, `${regularLineNo}.- ${description}`, getActivityObservationText(report, activity, regularLineNo - 1))
            regularLineNo += 1
          })
        }
      }

      rowsByCrewFront.forEach((value) => {
        const current = byFront.get(value.front) || []
	        current.push({
	          activityLabel: `Actividad ${current.length + 1}:`,
	          crewLabel: value.crewLabel,
	          sectionLabel: value.sectionLabel,
	          activityLines: value.lines.length > 0 ? value.lines : [{ text: '-', quantity: '', unit: '' }],
	          observation: value.observations.filter(Boolean).join(' / ') || reportObservation || ''
	        })
        byFront.set(value.front, current)
      })
    })

    return {
      title: firstSequence
        ? `DAILY REPORT N°${String(firstSequence).padStart(3, '0')}`
        : `DAILY REPORT ${formattedDate}`,
      contract: String(contractName || 'ANT-GPRO-FOR-PISCINAS').toUpperCase(),
      rev: `REV. 0 ${formattedDate}`,
      formattedDate,
      groups: Array.from(new Set([...Array.from(byFront.keys()), ...Array.from(imagesByFront.keys())]))
        .map((front) => ({
          front,
          rows: byFront.get(front) || [],
          images: imagesByFront.get(front) || []
        }))
    }
  }, [contractName, crews, getActivityObservationText, getFieldReportActivityDescription, getFieldReportActivityQuantityUnit, hasPositiveFieldReportActivityQuantity])

  const handleExportDailyDescriptionExcel = async (
    date: string,
    reportsForDate: FieldReport[],
    excludedImageKeys: string[] = [],
    frontFilter = '',
    options?: { silent?: boolean }
  ) => {
    try {
      if (!reportsForDate || reportsForDate.length === 0) {
        showSnackbar('No hay reportes para exportar en esta fecha', 'info')
        return
      }

      const mod = await import('exceljs')
      const ExcelJS = (mod as any).default || mod
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Ingenit'
      workbook.created = new Date()
      const worksheet = workbook.addWorksheet('daily_report')

      worksheet.columns = [
        { width: 4 },   // A: respiro
        { width: 16 },  // B: etiqueta
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
        { width: 12 }   // O
      ]

      const thin = { style: 'thin', color: { argb: 'FF000000' } }
      const medium = { style: 'medium', color: { argb: 'FF000000' } }
      const blueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163B82' } }
      const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD2FFD2' } }
      const titleFont = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF163B82' } }
      const blueFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      const bodyFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF163B82' } }
      const excludedImageKeySet = new Set((excludedImageKeys || []).map((key) => String(key || '').trim()).filter(Boolean))

      const getImageExtension = (file: EvidenceFile, dataUrl: string): 'png' | 'jpeg' => {
        const type = String(file?.type || '').toLowerCase()
        if (type.includes('png') || dataUrl.startsWith('data:image/png')) return 'png'
        return 'jpeg'
      }

      const readBlobAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })

      const getImageSize = (dataUrl: string) => new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 })
        image.onerror = () => resolve({ width: 1, height: 1 })
        image.src = dataUrl
      })

      const getImageSizeFromBlob = async (blob: Blob): Promise<{ width: number; height: number }> => {
        try {
          if (typeof createImageBitmap === 'function') {
            const bmp = await createImageBitmap(blob)
            const width = Math.max(1, Number((bmp as any).width || 1))
            const height = Math.max(1, Number((bmp as any).height || 1))
            try { (bmp as any).close?.() } catch {}
            if (width > 0 && height > 0) return { width, height }
          }
        } catch {}
        return { width: 1, height: 1 }
      }

      const normalizeImageForExcel = async (
        dataUrl: string,
        preferred: 'png' | 'jpeg',
        hintSize?: { width: number; height: number }
      ): Promise<{ dataUrl: string; extension: 'png' | 'jpeg'; width: number; height: number }> => {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('No se pudo normalizar imagen para Excel'))
          img.src = dataUrl
        })

        const width = Math.max(1, hintSize?.width || image.naturalWidth || image.width || 1)
        const height = Math.max(1, hintSize?.height || image.naturalHeight || image.height || 1)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          return { dataUrl, extension: preferred, width, height }
        }
        ctx.drawImage(image, 0, 0, width, height)
        const extension: 'png' | 'jpeg' = preferred === 'png' ? 'png' : 'jpeg'
        const mime = extension === 'png' ? 'image/png' : 'image/jpeg'
        const normalizedDataUrl = canvas.toDataURL(mime, extension === 'jpeg' ? 0.92 : undefined)
        return { dataUrl: normalizedDataUrl, extension, width, height }
      }

      const loadDailyExcelImage = async (file: EvidenceFile) => {
        const cleanKey = String(file?.key || '').trim()
        if (!cleanKey) return null
        try {
          const url = `/api/field-reports/evidence/download?key=${encodeURIComponent(cleanKey)}&name=${encodeURIComponent(file?.name || 'imagen')}`
          const res = await fetch(url)
          if (!res.ok) return null
          const blob = await res.blob()
          const rawDataUrl = await readBlobAsDataUrl(blob)
          const sourceSize = await getImageSizeFromBlob(blob)
          const normalized = await normalizeImageForExcel(rawDataUrl, 'png', sourceSize)
          const size = (sourceSize.width > 1 && sourceSize.height > 1)
            ? sourceSize
            : await getImageSize(normalized.dataUrl)
          return {
            dataUrl: normalized.dataUrl,
            extension: 'png' as const,
            width: size.width,
            height: size.height
          }
        } catch {
          return null
        }
      }

      const fitImage = (sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number) => {
        const safeWidth = Math.max(1, sourceWidth)
        const safeHeight = Math.max(1, sourceHeight)
        const scale = Math.min(boxWidth / safeWidth, boxHeight / safeHeight)
        return {
          width: Math.max(1, Math.round(safeWidth * scale)),
          height: Math.max(1, Math.round(safeHeight * scale))
        }
      }

      const columnWidthToPx = (columnWidth: number) => Math.max(1, Math.round(columnWidth * 7.2))
      const rowHeightToPx = (rowHeight: number) => Math.max(1, Math.round(rowHeight * 96 / 72))
      const getColumnWidthPx = (col: number) => columnWidthToPx(Number(worksheet.getColumn(col).width || 8.43))
      const getRowHeightPx = (rowNo: number) => rowHeightToPx(Number(worksheet.getRow(rowNo).height || 15))
      const getColumnSpanPx = (fromCol: number, toCol: number) => {
        let total = 0
        for (let col = fromCol; col <= toCol; col += 1) total += getColumnWidthPx(col)
        return Math.max(1, total)
      }
      const getRowSpanPx = (fromRow: number, toRow: number) => {
        let total = 0
        for (let r = fromRow; r <= toRow; r += 1) total += getRowHeightPx(r)
        return Math.max(1, total)
      }
      const addPixelOffsetToColumn = (startCol: number, offsetPx: number, maxCol = 15) => {
        let col = startCol
        let remaining = Math.max(0, offsetPx)
        while (col < maxCol) {
          const width = getColumnWidthPx(col)
          if (remaining <= width) break
          remaining -= width
          col += 1
        }
        return (col - 1) + Math.min(0.98, remaining / getColumnWidthPx(col))
      }
      const addPixelOffsetToRow = (startRow: number, offsetPx: number, maxRow: number) => {
        let targetRow = startRow
        let remaining = Math.max(0, offsetPx)
        while (targetRow < maxRow) {
          const height = getRowHeightPx(targetRow)
          if (remaining <= height) break
          remaining -= height
          targetRow += 1
        }
        return (targetRow - 1) + Math.min(0.98, remaining / getRowHeightPx(targetRow))
      }

      const setRangeBorder = (fromRow: number, toRow: number, fromCol = 2, toCol = 15) => {
        for (let r = fromRow; r <= toRow; r++) {
          for (let c = fromCol; c <= toCol; c++) {
            const cell = worksheet.getCell(r, c)
            cell.border = {
              top: r === fromRow ? medium : thin,
              bottom: r === toRow ? medium : thin,
              left: c === fromCol ? medium : thin,
              right: c === toCol ? medium : thin
            }
          }
        }
      }

      const addMergedRow = (row: number, value: string, fill?: any, font?: any, height = 20) => {
        worksheet.mergeCells(row, 2, row, 15)
        const cell = worksheet.getCell(row, 2)
        cell.value = value
        cell.fill = fill
        cell.font = font || bodyFont
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
        worksheet.getRow(row).height = height
      }

      const fullReports = await Promise.all(reportsForDate.map(fetchFullReportForDailyExcel))
      const safeDate = String(date || '').slice(0, 10)
      const baseModel = buildDailyExcelModel(safeDate, fullReports)
      const normalizedFrontFilter = normalizeText(frontFilter).toUpperCase()
      const model = normalizedFrontFilter
        ? {
            ...baseModel,
            groups: baseModel.groups.filter((group) => normalizeText(group.front).toUpperCase() === normalizedFrontFilter)
          }
        : baseModel
      if (model.groups.length === 0) {
        if (!options?.silent) showSnackbar('No hay datos para exportar en este frente', 'info')
        return false
      }
      const formattedDate = model.formattedDate

      worksheet.mergeCells(2, 2, 2, 15)
      worksheet.mergeCells(3, 2, 3, 15)
      worksheet.mergeCells(4, 2, 4, 15)
      worksheet.getCell(2, 2).value = model.title
      worksheet.getCell(3, 2).value = getDailyExcelContractForFront(model.groups[0]?.front || frontFilter || model.contract)
      worksheet.getCell(4, 2).value = model.rev
      ;[2, 3, 4].forEach((row) => {
        const cell = worksheet.getCell(row, 2)
        cell.font = titleFont
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        worksheet.getRow(row).height = 22
      })

      let row = 5
      addMergedRow(row, '1.- DESCRIPCIÓN DE TRABAJO EJECUTADO DIARIO', blueFill, blueFont, 18)
      row += 1

      for (const group of model.groups) {
        addMergedRow(row, `FRENTE DE TRABAJO: ${group.front}`, greenFill, bodyFont, 18)
        row += 1

        group.rows.forEach((block) => {
          const activityText = [
            block.sectionLabel || '',
            block.crewLabel ? `Cuadrilla ${block.crewLabel}` : '',
            ...block.activityLines.map((line) => {
              const meta = [line.quantity, line.unit].filter(Boolean).join(' ')
              return meta ? `${line.text} (${meta})` : line.text
            })
          ].filter(Boolean).join('\n') || '-'

          worksheet.mergeCells(row, 3, row, 15)
          worksheet.getCell(row, 2).value = block.activityLabel
          worksheet.getCell(row, 3).value = activityText
          worksheet.getRow(row).height = Math.max(70, 24 + activityText.split('\n').length * 15)
          worksheet.getCell(row, 2).font = bodyFont
          worksheet.getCell(row, 3).font = { name: 'Arial', size: 10, bold: false, color: { argb: 'FF163B82' } }
          worksheet.getCell(row, 2).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
          worksheet.getCell(row, 3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
          row += 1

          worksheet.mergeCells(row, 3, row, 15)
          worksheet.getCell(row, 2).value = 'Observación:'
          worksheet.getCell(row, 3).value = block.observation
          worksheet.getRow(row).height = Math.max(24, 18 + block.observation.length / 120 * 14)
          worksheet.getCell(row, 2).font = bodyFont
          worksheet.getCell(row, 3).font = { name: 'Arial', size: 10, color: { argb: 'FF163B82' } }
          worksheet.getCell(row, 2).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
          worksheet.getCell(row, 3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
          row += 1
        })

      }

      // Sector de responsable y firmas.
      worksheet.mergeCells(row, 2, row, 6)
      worksheet.mergeCells(row, 7, row, 10)
      worksheet.mergeCells(row, 11, row, 15)
      worksheet.getCell(row, 2).value = 'RESPONSABLE EMPRESA CONTRATISTA: PUGA MUJICA ASOCIADOS'
      worksheet.getCell(row, 7).value = 'CARGO:'
      worksheet.getCell(row, 11).value = 'FIRMA:'
      ;[2, 7, 11].forEach((col) => {
        const cell = worksheet.getCell(row, col)
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } }
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      })
      worksheet.getRow(row).height = 30
      row += 1

      const writeSignatureRows = () => {
        const signatureRows = [
          [
            `Confeccionado por: Juan Pablo Bernal Castro`,
            `Aprobado por: Ricardo Cardenas Jeraldo`,
            'Toma de conocimiento:'
          ],
          [
            'Cargo: Ingeniero Oficina Tecnica',
            'Cargo: Administrador de Contrato',
            'Cargo: ITO'
          ],
          [
            `Fecha: ${formattedDate}`,
            `Fecha: ${formattedDate}`,
            'Fecha:'
          ],
          [
            'Firma:',
            'Firma:',
            'Firma:'
          ]
        ]
        signatureRows.forEach((values) => {
          worksheet.mergeCells(row, 2, row, 6)
          worksheet.mergeCells(row, 7, row, 10)
          worksheet.mergeCells(row, 11, row, 15)
          worksheet.getCell(row, 2).value = values[0]
          worksheet.getCell(row, 7).value = values[1]
          worksheet.getCell(row, 11).value = values[2]
          ;[2, 7, 11].forEach((col) => {
            const cell = worksheet.getCell(row, col)
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } }
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
          })
          worksheet.getRow(row).height = 18
          row += 1
        })
      }

      // Evidencias antes de bloque "Confeccionado..."
      for (const group of model.groups) {
        const visibleImages = (group.images || []).filter((image) => !excludedImageKeySet.has(image.key))
        if (visibleImages.length === 0) continue

        addMergedRow(row, `EVIDENCIA FOTOGRÁFICA: ${group.front}`, greenFill, bodyFont, 18)
        row += 1

        const loadedImages = (await Promise.all(visibleImages.map(async (imageFile) => {
          const loaded = await loadDailyExcelImage(imageFile)
          return loaded ? { file: imageFile, ...loaded } : null
        }))).filter(Boolean) as Array<{
          file: DailyExcelImage
          dataUrl: string
          extension: 'png' | 'jpeg'
          width: number
          height: number
        }>
        if (loadedImages.length === 0) continue

        const firstCol = 2
        const lastCol = 15
        const totalCols = lastCol - firstCol + 1
        // Imágenes más grandes: máximo 3 por fila.
        const imagesPerRow = 3
        const bandRowsPerImageRow = 10
        const cellImagePaddingPx = 6

        for (let i = 0; i < loadedImages.length; i += imagesPerRow) {
          const rowImages = loadedImages.slice(i, i + imagesPerRow)
          const bandStartRow = row
          const titleRow = bandStartRow
          const imageStartRow = bandStartRow + 1
          const bandEndRow = row + bandRowsPerImageRow - 1

          worksheet.getRow(titleRow).height = 18
          for (let imageRow = imageStartRow; imageRow <= bandEndRow; imageRow += 1) {
            worksheet.getRow(imageRow).height = 28
          }

          // Repartir todo el ancho disponible en bloques mergeados (sin celdas sueltas).
          const slots: Array<{ startCol: number; endCol: number }> = []
          const imageCount = rowImages.length
          const baseSpan = Math.floor(totalCols / imageCount)
          const remainder = totalCols % imageCount
          let cursor = firstCol
          for (let idx = 0; idx < imageCount; idx += 1) {
            const span = baseSpan + (idx < remainder ? 1 : 0)
            const startCol = cursor
            const endCol = Math.min(lastCol, cursor + span - 1)
            slots.push({ startCol, endCol })
            cursor = endCol + 1
          }

          // Misma altura visual para todas las imágenes del bloque, sin distorsión.
          const slotWidthPxForBand = getColumnSpanPx(slots[0].startCol, slots[0].endCol)
          const slotHeightPxForBand = getRowSpanPx(imageStartRow, bandEndRow)
          const usableWidthPx = Math.max(1, slotWidthPxForBand - cellImagePaddingPx * 2)
          const usableHeightPx = Math.max(1, slotHeightPxForBand - cellImagePaddingPx * 2)
          const maxAspectInBand = Math.max(
            1,
            ...rowImages.map((img) => Math.max(1, Number(img.width || 1)) / Math.max(1, Number(img.height || 1)))
          )
          const commonImageHeightPx = Math.max(1, Math.min(usableHeightPx, Math.floor(usableWidthPx / maxAspectInBand)))

          rowImages.forEach((image, idx) => {
            const startCol = slots[idx].startCol
            const endCol = slots[idx].endCol

            worksheet.mergeCells(titleRow, startCol, titleRow, endCol)
            const titleCell = worksheet.getCell(titleRow, startCol)
            titleCell.value = ''
            titleCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF163B82' } }
            titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }

            worksheet.mergeCells(imageStartRow, startCol, bandEndRow, endCol)
            const cell = worksheet.getCell(imageStartRow, startCol)
            cell.value = ''
            cell.alignment = { vertical: 'middle', horizontal: 'center' }

            const imageId = workbook.addImage({
              base64: image.dataUrl,
              extension: image.extension
            })
            const slotWidthPx = getColumnSpanPx(startCol, endCol)
            const slotHeightPx = getRowSpanPx(imageStartRow, bandEndRow)
            const imageAspect = Math.max(1, Number(image.width || 1)) / Math.max(1, Number(image.height || 1))
            const fitted = {
              width: Math.max(1, Math.round(commonImageHeightPx * imageAspect)),
              height: commonImageHeightPx
            }
            const horizontalOffsetPx = Math.max(cellImagePaddingPx, (slotWidthPx - fitted.width) / 2)
            const verticalOffsetPx = Math.max(cellImagePaddingPx, (slotHeightPx - fitted.height) / 2)

            worksheet.addImage(imageId, {
              tl: {
                col: addPixelOffsetToColumn(startCol, horizontalOffsetPx, endCol),
                row: addPixelOffsetToRow(imageStartRow, verticalOffsetPx, bandEndRow)
              },
              ext: {
                width: fitted.width,
                height: fitted.height
              },
              editAs: 'oneCell'
            })
          })

          row = bandEndRow + 1
        }
      }

      writeSignatureRows()
      /*
      Legacy block retained for reference:
      signatureRows.forEach((values) => {
        worksheet.mergeCells(row, 2, row, 6)
        worksheet.mergeCells(row, 7, row, 10)
        worksheet.mergeCells(row, 11, row, 15)
        worksheet.getCell(row, 2).value = values[0]
        worksheet.getCell(row, 7).value = values[1]
        worksheet.getCell(row, 11).value = values[2]
        ;[2, 7, 11].forEach((col) => {
          const cell = worksheet.getCell(row, col)
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } }
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
        })
        worksheet.getRow(row).height = 18
        row += 1
      })
      */

      setRangeBorder(2, Math.max(row - 1, 5), 2, 15)
      worksheet.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const frontSuffix = frontFilter
        ? `_${normalizeText(frontFilter).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`
        : ''
      triggerDownloadFromUrl(url, `daily_report_${safeDate || new Date().toISOString().slice(0, 10)}${frontSuffix}.xlsx`, false)
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (!options?.silent) showSnackbar('Excel diario exportado correctamente', 'success')
      return true
    } catch (error) {
      console.error('Error exporting daily description excel', error)
      if (!options?.silent) showSnackbar('Error al exportar Excel diario', 'error')
      return false
    }
  }

  const handleExportDailyDescriptionExcelByFront = async (date: string, reportsForDate: FieldReport[], excludedImageKeys: string[] = []) => {
    if (!reportsForDate || reportsForDate.length === 0) {
      showSnackbar('No hay reportes para exportar en esta fecha', 'info')
      return
    }

    const model = buildDailyExcelModel(String(date || '').slice(0, 10), reportsForDate)
    const fronts = model.groups
      .map((group) => group.front)
      .filter((front) => {
        const normalized = normalizeText(front).toUpperCase()
        return normalized === 'PISCINAS' || normalized === 'CANALETAS'
      })
    if (fronts.length === 0) {
      showSnackbar('No hay frentes PISCINAS/CANALETAS para exportar', 'info')
      return
    }

    let exportedCount = 0
    for (const front of fronts) {
      const ok = await handleExportDailyDescriptionExcel(date, reportsForDate, excludedImageKeys, front, { silent: true })
      if (ok) exportedCount += 1
    }

    if (exportedCount > 0) {
      showSnackbar(`Excel global exportado por frente (${exportedCount} archivo${exportedCount === 1 ? '' : 's'})`, 'success')
    } else {
      showSnackbar('No se pudo exportar el Excel global por frente', 'error')
    }
  }

  const handleExportPdf = async () => {
    const root = fieldReportPdfContentRef.current || fieldReportPdfRef.current
    if (!root) {
      showSnackbar('No se pudo preparar la vista para PDF', 'error')
      return
    }
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ])
      if (typeof (document as any)?.fonts?.ready?.then === 'function') {
        await (document as any).fonts.ready
      }

      // Clone to an offscreen container and expand scrollable wrappers
      // so the capture includes full-width sections and rotated headers.
      const mount = document.createElement('div')
      mount.style.position = 'fixed'
      mount.style.left = '-100000px'
      mount.style.top = '0'
      mount.style.background = '#fff'
      mount.style.zIndex = '-1'
      const clone = root.cloneNode(true) as HTMLElement
      clone.style.width = `${Math.max(root.scrollWidth, root.clientWidth)}px`
      clone.style.maxWidth = 'none'
      clone.style.overflow = 'visible'
      clone.style.transform = 'none'
      mount.appendChild(clone)
      document.body.appendChild(mount)

      clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const cs = window.getComputedStyle(el)
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
          el.style.overflow = 'visible'
          el.style.maxHeight = 'none'
          el.style.height = 'auto'
        }
        // Keep original orientation styles to avoid layout breakage in complex tables.
      })

      const captureWidth = Math.max(clone.scrollWidth, clone.clientWidth)
      const captureHeight = Math.max(clone.scrollHeight, clone.clientHeight)

      const exportScale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 2))
      const canvas = await html2canvas(clone, {
        scale: exportScale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight
      })
      mount.remove()
      if (!canvas.width || !canvas.height) throw new Error('No se pudo capturar el contenido para PDF')
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a3', compress: true })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const marginX = 8
      const marginY = 10
      const renderWidth = pageWidth - marginX * 2
      const renderHeight = (canvas.height * renderWidth) / canvas.width
      const usablePageHeight = pageHeight - marginY * 2

      if (renderHeight <= usablePageHeight) {
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, 0, pageWidth, pageHeight, 'F')
        const y = marginY + (usablePageHeight - renderHeight) / 2
        pdf.addImage(imgData, 'PNG', marginX, y, renderWidth, renderHeight, undefined, 'SLOW')
      } else {
        const pxPerMm = canvas.width / renderWidth
        const pageSlicePx = Math.floor(usablePageHeight * pxPerMm)
        let offsetPx = 0
        let pageIndex = 0

        while (offsetPx < canvas.height) {
          const remaining = canvas.height - offsetPx
          const sliceHeightPx = Math.min(pageSlicePx, remaining)
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width = canvas.width
          sliceCanvas.height = sliceHeightPx
          const sliceCtx = sliceCanvas.getContext('2d')
          if (!sliceCtx) throw new Error('No se pudo generar segmento de PDF')
          sliceCtx.fillStyle = '#ffffff'
          sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
          sliceCtx.drawImage(
            canvas,
            0,
            offsetPx,
            canvas.width,
            sliceHeightPx,
            0,
            0,
            sliceCanvas.width,
            sliceCanvas.height
          )
          const sliceMmHeight = sliceHeightPx / pxPerMm
          if (pageIndex > 0) pdf.addPage()
          pdf.setFillColor(255, 255, 255)
          pdf.rect(0, 0, pageWidth, pageHeight, 'F')
          const sliceData = sliceCanvas.toDataURL('image/png')
          pdf.addImage(sliceData, 'PNG', marginX, marginY, renderWidth, sliceMmHeight, undefined, 'SLOW')
          offsetPx += sliceHeightPx
          pageIndex += 1
        }
      }

      const reportLabel = selectedReport?.id ? String(selectedReport.id).slice(0, 8) : String(reportDate || 'sin-fecha')
      const safeDate = String(reportDate || new Date().toISOString().slice(0, 10))
      pdf.save(`reporte-terreno-${reportLabel}-${safeDate}.pdf`)
      showSnackbar('PDF exportado correctamente', 'success')
    } catch (err: any) {
      showSnackbar(err?.message || 'Error exportando PDF', 'error')
    }
  }

  const isView = !editMode && !!selectedReport
  const syncV2TopScrollMetrics = useCallback(() => {
    const main = v2MainScrollRef.current
    if (!main) {
      setV2TopScrollContentWidth(0)
      setV2ShowTopScroll(false)
      return
    }
    const nextWidth = Math.ceil(main.scrollWidth)
    setV2TopScrollContentWidth(nextWidth)
    setV2ShowTopScroll(main.scrollWidth > main.clientWidth + 1)
  }, [])

  useEffect(() => {
    syncV2TopScrollMetrics()
    const main = v2MainScrollRef.current
    if (!main || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => syncV2TopScrollMetrics())
    ro.observe(main)
    return () => ro.disconnect()
  }, [syncV2TopScrollMetrics, reportDesignVersion, open, activityCount, supportRowsCount])

  const handleV2TopScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const main = v2MainScrollRef.current
    if (!main || v2ScrollSyncingRef.current) return
    v2ScrollSyncingRef.current = true
    main.scrollLeft = e.currentTarget.scrollLeft
    requestAnimationFrame(() => { v2ScrollSyncingRef.current = false })
  }, [])

  const handleV2MainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = v2TopScrollRef.current
    if (!top || v2ScrollSyncingRef.current) return
    v2ScrollSyncingRef.current = true
    top.scrollLeft = e.currentTarget.scrollLeft
    requestAnimationFrame(() => { v2ScrollSyncingRef.current = false })
  }, [])
  const bindV2MainScrollNode = useCallback((node: HTMLDivElement | null) => {
    fieldReportPdfContentRef.current = node
    v2MainScrollRef.current = node
  }, [])

  const V2_MIN_ACTIVITY_SLOTS = 12
  const v2ActivitySlotCount = Math.max(V2_MIN_ACTIVITY_SLOTS, activityCount)
  const V2_ACTIVITY_DETAIL_ROWS = v2ActivitySlotCount
  const v2ActivityIndexes = useMemo(() => Array.from({ length: v2ActivitySlotCount }, (_, i) => i), [v2ActivitySlotCount])
  const v2PostActivityIndexes = useMemo(() => [], [])
  const v2AllHourIndexes = useMemo(
    () => Array.from({ length: v2ActivitySlotCount }, (_, i) => i),
    [v2ActivitySlotCount]
  )
  const v2EquipmentRowIndexes = useMemo(() => Array.from({ length: equipmentRowsCount }, (_, i) => i), [equipmentRowsCount])
  const v2MaterialRowIndexes = useMemo(() => Array.from({ length: materialRowsCount }, (_, i) => i), [materialRowsCount])
  const v2ActivityDetailIndexes = useMemo(() => Array.from({ length: V2_ACTIVITY_DETAIL_ROWS }, (_, i) => i), [V2_ACTIVITY_DETAIL_ROWS])
  const v2ColWidths = useMemo(() => {
    const hourColPx = 32
    return [
      20, 25, 40, 40, 40, 40, 40, 40, 40, 40, 80,
      ...Array.from({ length: v2ActivitySlotCount }).map(() => hourColPx),
      40, 40, 100
    ]
  }, [v2ActivitySlotCount])

  const v2ActivitiesForTable = useMemo(
    () => (assignedActivities || []).slice(0, V2_ACTIVITY_DETAIL_ROWS),
    [assignedActivities]
  )
  const compactNumberFieldSx = {
    width: '100%',
    '& input[type=number]': {
      MozAppearance: 'textfield'
    },
    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
      WebkitAppearance: 'none',
      margin: 0
    },
    '& .MuiInputBase-input': {
      fontSize: 12,
      py: 0.4,
      px: 0.75,
      textAlign: 'center'
    }
  }
  const compactSelectFieldSx = {
    width: '100%',
    maxWidth: '100%',
    '& .MuiSelect-select': {
      fontSize: 12,
      py: 0.4,
      px: 0.75,
      textAlign: 'center',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      boxSizing: 'border-box'
    },
    '& .MuiSelect-icon': {
      fontSize: 14,
      right: 2
    },
    '& .MuiInputBase-root': {
      maxWidth: '100%',
      boxSizing: 'border-box'
    }
  }

  const workerCrewCountByKey = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (row: any, fallbackKey?: string) => {
      const key = normalizeWorkerKey(row, fallbackKey)
      if (!key) return
      const crew = String(
        row?.crewName ||
        row?.crew_name ||
        row?.crew ||
        row?.crewId ||
        row?.crew_id ||
        row?.current_crew_id ||
        ''
      ).trim()
      if (!crew) return
      if (!map.has(key)) map.set(key, new Set<string>())
      map.get(key)?.add(crew)
    }

    const currentDate = String(reportDate || '').slice(0, 10)
    ;(Array.isArray(reports) ? reports : []).forEach((report: any) => {
      const reportDateKey = String(report?.date || report?.report_date || '').slice(0, 10)
      if (!currentDate || reportDateKey !== currentDate) return
      const sourceReport = fieldReportDetailsById[String(report?.id || '')] || report
      const reportCrew = String(sourceReport?.crew_name || sourceReport?.crew_id || sourceReport?.crew_ids || report?.crew_name || report?.crew_id || report?.crew_ids || '').trim()
      const personnelRaw = parseJsonMaybe(sourceReport?.personnel)
      const personHoursRaw = parseJsonMaybe(sourceReport?.person_hours)
      const personHoursObj = (personHoursRaw && typeof personHoursRaw === 'object' && !Array.isArray(personHoursRaw))
        ? { ...(personHoursRaw as Record<string, any>) }
        : {}
      delete (personHoursObj as any).__extras
      const rows = Array.isArray(personnelRaw) && personnelRaw.length > 0
        ? personnelRaw
        : Object.keys(personHoursObj || {}).map((key) => ({
            personId: key,
            id: key,
            collaborator_id: key,
            user_id: key,
            name: collaboratorMap[String(key)]?.name || ''
          }))
      rows.forEach((row: any, idx: number) => {
        add(
          { ...row, crewName: row?.crewName || row?.crew_name || reportCrew },
          String(row?.id || row?.collaborator_id || row?.user_id || row?.personId || row?.name || `report-person-${idx}`)
        )
      })
    })
    ;(Array.isArray(personnel) ? personnel : []).forEach((row: any, idx: number) => {
      add(row, String(row?.id || row?.collaborator_id || row?.user_id || row?.name || `person-${idx}`))
    })
    ;(Array.isArray(crewMembers) ? crewMembers : []).forEach((row: any, idx: number) => {
      add(row, String(row?.id || row?.collaborator_id || row?.user_id || `${row?.first_name || ''} ${row?.last_name || ''}`.trim() || `member-${idx}`))
    })
    ;(Array.isArray(personnelRows) ? personnelRows : []).forEach((row: any, idx: number) => {
      add(row, String(row?.personId || `person-${idx}`))
    })

    return new Map(Array.from(map.entries()).map(([key, crews]) => [key, crews.size]))
  }, [reports, fieldReportDetailsById, reportDate, parseJsonMaybe, collaboratorMap, personnel, crewMembers, personnelRows, normalizeWorkerKey])

  const v2PersonnelRowsComputed = useMemo(() => {
    return (personnelRows || []).map((row: any, idx: number) => {
      const personId = String(row?.personId || `person-${idx}`)
      const hours = personHours[personId] || []
      const manualExtraHours = Number(personExtraHours[String(personId)] || 0) || 0
      const totalBase = v2ActivityIndexes.reduce((acc: number, i: number) => acc + (Number(hours[i] || 0) || 0), 0)
      const effectiveTotals = getEffectivePersonHourTotals(totalBase, manualExtraHours)
      const extraHours = effectiveTotals.extraHours
      const autoExtraHours = effectiveTotals.autoExtraHours
      const total = effectiveTotals.totalHours
      const workerKey = normalizeWorkerKey(row, personId)
      const totalAcrossDay = workerKey ? Number(crossReportDayHoursByWorkerKey.get(workerKey) || 0) : total
      const exceededDayLimit = totalAcrossDay > STANDARD_PERSON_HOURS + 0.000001
      const completedDayLimit = Math.abs(totalAcrossDay - STANDARD_PERSON_HOURS) < 0.000001
      const belowDayLimit = totalAcrossDay < STANDARD_PERSON_HOURS - 0.000001
      const belongsToMultipleCrews = workerKey ? Number(workerCrewCountByKey.get(workerKey) || 0) > 1 : false
      const rowNameNorm = normalizeText(String(row?.name || ''))
      const docRaw = String(
        row?.document ||
        collaboratorDocumentById[String(personId)] ||
        collaboratorDocumentByNameNorm[rowNameNorm] ||
        collaboratorMap[String(personId)]?.document ||
        ''
      ).trim()
      return {
        row,
        idx,
        personId,
        hours,
        extraHours,
        manualExtraHours,
        autoExtraHours,
        total,
        totalAcrossDay,
        exceededDayLimit,
        completedDayLimit,
        belowDayLimit,
        belongsToMultipleCrews,
        rut: formatChileanRutIfValid(docRaw) || '-'
      }
    })
  }, [
    personnelRows,
    personHours,
    personExtraHours,
    v2ActivityIndexes,
    normalizeWorkerKey,
    crossReportDayHoursByWorkerKey,
    workerCrewCountByKey,
    collaboratorDocumentById,
    collaboratorDocumentByNameNorm,
    collaboratorMap
  ])

  const v2TotalsComputed = useMemo(() => {
    const totalsByActivity = v2ActivityIndexes.map((actIdx) =>
      v2PersonnelRowsComputed.reduce((acc: number, item: any) => acc + (Number(item.hours[actIdx] || 0) || 0), 0)
    )
    const totalHorasExtrasGeneral = v2PersonnelRowsComputed.reduce((acc: number, item: any) => acc + (Number(item.extraHours) || 0), 0)
    const totalHorasGeneral = v2PersonnelRowsComputed.reduce((acc: number, item: any) => acc + (Number(item.total) || 0), 0)
    return { totalsByActivity, totalHorasExtrasGeneral, totalHorasGeneral }
  }, [v2ActivityIndexes, v2PersonnelRowsComputed])

  const v2EvidencePreviewCount = useMemo(() => {
    return v2ActivitiesForTable.reduce((acc: number, a: any) => acc + parseEvidenceFiles(a?.evidence_files).length, 0)
  }, [v2ActivitiesForTable])

  useEffect(() => {
    if (!open || reportHydrating || selectedReportHydrationStatus === 'loading' || !v2StateReady) {
      setHeavyModalSectionsReady(false)
      heavyModalReadyStartedRef.current = null
      return
    }
    heavyModalReadyStartedRef.current = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const run = () => {
      setHeavyModalSectionsReady(true)
      if (process.env.NODE_ENV !== 'production') {
        const endedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        const startedAt = heavyModalReadyStartedRef.current || endedAt
        const heavySectionsMs = Math.round(endedAt - startedAt)
        const openStartedAt = modalOpenMetricsRef.current?.startedAt || null
        const detailFetchMs = (
          perfModalOpenDetailFetchStartedAtRef.current != null &&
          perfModalOpenDetailFetchDoneAtRef.current != null
        ) ? Math.round(perfModalOpenDetailFetchDoneAtRef.current - perfModalOpenDetailFetchStartedAtRef.current) : 0
        const hydrationMs = (
          openStartedAt != null &&
          perfModalOpenHydrationDoneAtRef.current != null
        ) ? Math.round(perfModalOpenHydrationDoneAtRef.current - openStartedAt) : 0
        const totalMs = openStartedAt != null ? Math.round(endedAt - openStartedAt) : heavySectionsMs
        perfPrintSummary('modal-open', {
          phase: 'heavy-sections-ready',
          reportId: String(modalOpenMetricsRef.current?.id || selectedReport?.id || ''),
          detailFetchMs,
          hydrationMs,
          heavySectionsMs,
          totalMs,
          requestCount: Number(perfRequestCountByScopeRef.current['modal-open'] || 0),
          directRows: v2PersonnelRowsComputed.length,
          indirectRows: 0,
          activitiesRows: v2ActivitiesForTable.length,
          evidencePreviewCount: v2EvidencePreviewCount
        })
      }
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      const rafId = window.requestAnimationFrame(run)
      heavySectionsRafRef.current = rafId
      return () => {
        if (heavySectionsRafRef.current != null && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(heavySectionsRafRef.current)
        }
        heavySectionsRafRef.current = null
      }
    }
    const timeoutId = setTimeout(run, 0)
    return () => clearTimeout(timeoutId)
  }, [open, reportHydrating, selectedReportHydrationStatus, v2StateReady, v2PersonnelRowsComputed.length, v2ActivitiesForTable.length, v2EvidencePreviewCount])

  const reportsGroupedByReportDate = useMemo(() => {
    const groups = new Map<string, FieldReport[]>()
    ;(reports || []).forEach((r) => {
      const dateKey = String(r?.date || '').slice(0, 10)
      const key = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : 'sin-fecha'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    })
    ;(Array.isArray(crews) ? crews : []).forEach((crew: any) => {
      const dateKey = String(crew?.work_date || '').slice(0, 10) || String(crew?.created_at || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return
      if (!pendingCrewContextDates.has(dateKey)) return
      if (!groups.has(dateKey)) groups.set(dateKey, [])
    })
    return Array.from(groups.entries())
      .sort((a, b) => {
        if (a[0] === 'sin-fecha') return 1
        if (b[0] === 'sin-fecha') return -1
        return b[0].localeCompare(a[0])
      })
      .map(([date, items]) => ({
        date,
        label: date === 'sin-fecha' ? 'Sin fecha de reporte' : (() => {
          try { return format(parseISO(`${date}T00:00:00`), 'dd-MM-yyyy') } catch { return date }
        })(),
        items: items.sort(compareReportsByCrewLabel)
      }))
  }, [crews, reports, pendingCrewContextDates])

  const pendingCrewsByDate = useMemo(() => {
    const out = new Map<string, {
      pendingIds: string[]
      pendingNames: string[]
      totalForDate: number
      reportedForDate: number
      pendingCrews: Array<{ id: string; name: string; specialty: string; supervisor: string; capataz: string }>
    }>()
    const crewsByDate = new Map<string, Array<{ id: string; name: string; specialty: string; supervisor: string; capataz: string }>>()
    const readIds = (...values: any[]) => values.flatMap((value) => {
      if (Array.isArray(value)) return value
      if (value == null || value === '') return []
      return [value]
    }).map((value) => String(value || '').trim()).filter(Boolean)
    const resolveCollaboratorNames = (ids: string[]) => Array.from(new Set(
      ids
        .map((id) => String(collaboratorNameById[String(id)] || '').trim())
        .filter(Boolean)
    )).join(', ')
    const resolveMemberNamesByPosition = (ids: string[], role: 'supervisor' | 'capataz') => Array.from(new Set(
      ids
        .map((id) => {
          const meta = collaboratorMap[String(id)]
          const position = String(meta?.position || '').toLowerCase()
          const matches = role === 'supervisor'
            ? (position.includes('supervisor') || position.includes('jefe') || position.includes('coordinador'))
            : (position.includes('capataz') || position.includes('foreman') || position.includes('encargado'))
          return matches ? String(meta?.name || collaboratorNameById[String(id)] || '').trim() : ''
        })
        .filter(Boolean)
    )).join(', ')
    ;(Array.isArray(crews) ? crews : []).forEach((crew: any) => {
      const id = String(crew?.id || '').trim()
      if (!id) return
      const dateKey = String(crew?.work_date || '').slice(0, 10) || String(crew?.created_at || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return
      if (!pendingCrewContextDates.has(dateKey)) return
      const name = formatCrewNameLabel(crew?.name || id) || id
      const memberIds = readIds(crew?.members)
      const supervisor = String(crew?.supervisor_name || crew?.supervisor || '').trim() ||
        resolveCollaboratorNames(readIds(crew?.supervisors)) ||
        resolveMemberNamesByPosition(memberIds, 'supervisor')
      const capataz = String(crew?.foreman_name || crew?.capataz || crew?.foreman || '').trim() ||
        resolveCollaboratorNames(readIds(crew?.foremen)) ||
        resolveMemberNamesByPosition(memberIds, 'capataz')
      if (!crewsByDate.has(dateKey)) crewsByDate.set(dateKey, [])
      crewsByDate.get(dateKey)!.push({
        id,
        name,
        specialty: String(crew?.specialty || '').trim(),
        supervisor,
        capataz
      })
    })

    const reportCrewIdsByDate = new Map<string, Set<string>>()
    ;(Array.isArray(reports) ? reports : []).forEach((report: any) => {
      const dateKey = String(report?.date || report?.report_date || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return
      if (!reportCrewIdsByDate.has(dateKey)) reportCrewIdsByDate.set(dateKey, new Set<string>())
      const set = reportCrewIdsByDate.get(dateKey)!
      if (report?.crew_id) set.add(String(report.crew_id))
      if (Array.isArray(report?.crew_ids)) report.crew_ids.forEach((id: any) => set.add(String(id)))
    })

    crewsByDate.forEach((crewList, dateKey) => {
      const reportedSet = reportCrewIdsByDate.get(dateKey) || new Set<string>()
      const pending = crewList.filter((crew) => !reportedSet.has(String(crew.id)))
      out.set(dateKey, {
        pendingIds: pending.map((x) => x.id),
        pendingNames: pending.map((x) => x.name),
        pendingCrews: pending,
        totalForDate: crewList.length,
        reportedForDate: Math.min(reportedSet.size, crewList.length)
      })
    })

    return out
  }, [crews, reports, collaboratorMap, collaboratorNameById, formatCrewNameLabel, pendingCrewContextDates])

  const selectedReportIdForHydration = String(selectedReport?.id || '')
  const hydrationPendingForSelectedReport = Boolean(
    open &&
    !!selectedReport?.id &&
    (
      hydratedReportId !== selectedReportIdForHydration ||
      v2StateReportId !== selectedReportIdForHydration ||
      selectedReportHydrationStatus === 'loading' ||
      !v2StateReady
    )
  )
  const canRenderReportV2 = Boolean(
    open &&
    !!selectedReport?.id &&
    hydratedReportId === selectedReportIdForHydration &&
    v2StateReportId === selectedReportIdForHydration &&
    selectedReportHydrationStatus === 'ready' &&
    v2StateReady
  )
  const sameDateReportNavigation = useMemo(() => {
    const currentId = String(selectedReport?.id || '')
    const dateKey = String(selectedReport?.date || reportDate || '').slice(0, 10)
    if (!currentId || !dateKey) {
      return { items: [] as FieldReport[], currentIndex: -1, previous: null as FieldReport | null, next: null as FieldReport | null }
    }
    const items = (reports || [])
      .filter((r: any) => String(r?.date || '').slice(0, 10) === dateKey)
      .sort(compareReportsByCrewLabel)
    const currentIndex = items.findIndex((r: any) => String(r?.id || '') === currentId)
    return {
      items,
      currentIndex,
      previous: currentIndex > 0 ? items[currentIndex - 1] : null,
      next: currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : null
    }
  }, [reports, selectedReport?.id, selectedReport?.date, reportDate])

  const navigateSameDateReport = useCallback((direction: 'previous' | 'next') => {
    const target = direction === 'previous' ? sameDateReportNavigation.previous : sameDateReportNavigation.next
    if (!target || openingReportId) return
    void openReport(target, editMode ? 'edit' : 'view')
  }, [sameDateReportNavigation.previous, sameDateReportNavigation.next, openingReportId, editMode])

  const navigateSameDateReportById = useCallback((reportId: string) => {
    const targetId = String(reportId || '').trim()
    if (!targetId || openingReportId) return
    const target = sameDateReportNavigation.items.find((item: any) => String(item?.id || '') === targetId)
    if (!target) return
    if (String(target?.id || '') === String(selectedReport?.id || '')) return
    void openReport(target, editMode ? 'edit' : 'view')
  }, [sameDateReportNavigation.items, openingReportId, selectedReport?.id, editMode])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    if (fetchReportsStartedAtRef.current == null || fetchReportsDoneAtRef.current == null) return
    const now = nowMs()
    perfMark('fr-initial-list-render-ready')
    const fetchMs = perfMeasure('fr-initial-fetch-ms', 'fr-initial-fetch-start', 'fr-initial-fetch-response')
    const listRenderMs = Math.round(now - fetchReportsDoneAtRef.current)
    const totalMs = Math.round(now - fetchReportsStartedAtRef.current)
    perfPrintSummary('initial-load', {
      fetchMs,
      listRenderMs,
      totalMs,
      reportsCount: reports.length,
      requestCount: Number(perfRequestCountByScopeRef.current['initial-load'] || 0)
    })
    if (perfSavePendingSummaryRef.current) {
      const summary = perfSavePendingSummaryRef.current
      perfPrintSummary('save', {
        payloadBuildMs: summary.payloadBuildMs,
        apiMs: summary.apiMs,
        visualCloseMs: summary.visualCloseMs,
        refreshMs: summary.refreshMs,
        totalMs: Math.round(now - summary.startedAt),
        triggeredFetchReports: summary.triggeredFetchReports,
        requestCount: Number(perfRequestCountByScopeRef.current['save'] || 0)
      })
      perfSavePendingSummaryRef.current = null
    }
  }, [reportsGroupedByReportDate, reports.length])
  useEffect(() => {
    const defaultExpandedDate = String(
      reportsGroupedByReportDate.find((group) => group.date !== 'sin-fecha')?.date ||
      reportsGroupedByReportDate[0]?.date ||
      ''
    )
    setCollapsedDateGroups((prev) => {
      let changed = false
      const next = { ...prev }
      reportsGroupedByReportDate.forEach((group) => {
        if (typeof next[group.date] === 'undefined') {
          next[group.date] = group.date !== defaultExpandedDate
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [reportsGroupedByReportDate])

  useEffect(() => {
    reportsGroupedByReportDate.forEach((group) => {
      const dateKey = String(group?.date || '')
      if (!dateKey || dateKey === 'sin-fecha') return
      if (collapsedDateGroups[dateKey] !== false) return
      void loadReportsForDate(dateKey)
      void ensurePendingCrewContextForDate(dateKey)
    })
  }, [reportsGroupedByReportDate, collapsedDateGroups, loadReportsForDate, ensurePendingCrewContextForDate])

  const exportAvailableReportDates = useMemo(() => {
    const out = new Set<string>()
    ;(reports || []).forEach((r: any) => {
      const dateKey = String(r?.date || '').slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) out.add(dateKey)
      else if (r?.created_at) {
        const fromCreated = String(r.created_at).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(fromCreated)) out.add(fromCreated)
      }
    })
    return Array.from(out).sort((a, b) => a.localeCompare(b))
  }, [reports])
  const exportAvailableDateSet = useMemo(() => new Set(exportAvailableReportDates), [exportAvailableReportDates])
  const exportDateValue = useMemo(() => {
    if (!exportDateFilter) return null
    const d = parseISO(`${exportDateFilter}T00:00:00`)
    return isNaN(d.getTime()) ? null : d
  }, [exportDateFilter])
  const shouldDisableExportDate = useCallback((date: Date) => {
    const key = format(date, 'yyyy-MM-dd')
    return !exportAvailableDateSet.has(key)
  }, [exportAvailableDateSet])

  const handleExportFromModal = async () => {
    const isGlobalExcelAllowedFront = (front: string) => {
      const normalized = normalizeText(front).toUpperCase()
      return normalized === 'PISCINAS' || normalized === 'CANALETAS'
    }
    const filtered = (reports || []).filter((r: any) => {
      const matchDate = exportDateFilter ? String(r?.date || '').slice(0, 10) === exportDateFilter : true
      const reportCrewIds = Array.isArray(r?.crew_ids)
        ? r.crew_ids.map((x: any) => String(x))
        : (r?.crew_id ? [String(r.crew_id)] : [])
      const matchCrew = exportCrewFilter ? reportCrewIds.includes(String(exportCrewFilter)) : true
      const explicitFront = String(r?.work_front || '').trim()
      const legacyFront = detectFieldReportFront(r)
      const frontLabel = explicitFront || legacyFront || ''
      const matchFront = exportFrontFilter
        ? normalizeText(frontLabel).toUpperCase() === normalizeText(exportFrontFilter).toUpperCase()
        : true
      return matchDate && matchCrew && matchFront
    })

    if (!exportFrontFilter) {
      const canaletas = filtered.filter((r) => detectFieldReportFront(r) === 'CANALETAS')
      const piscinas = filtered.filter((r) => detectFieldReportFront(r) === 'PISCINAS')
      const safeDate = exportDateFilter || new Date().toISOString().slice(0, 10)
      let exportedCount = 0
      if (canaletas.length > 0) {
        const okCan = await handleExportReportsListExcel(
          canaletas,
          `reportes_terreno_canaletas_${safeDate}.xlsx`
        )
        if (okCan) exportedCount += 1
      }
      if (piscinas.length > 0) {
        const okPis = await handleExportReportsListExcel(
          piscinas,
          `reportes_terreno_piscinas_${safeDate}.xlsx`
        )
        if (okPis) exportedCount += 1
      }
      if (exportedCount === 0) {
        showSnackbar('No hay reportes con frente CANALETAS/PISCINAS para exportar', 'info')
        return
      }
      setExportDialogOpen(false)
      window.setTimeout(() => {
        showSnackbar('Exportación agrupada por frente completada', 'success')
      }, 250)
      return
    }

    if (exportFrontFilter && !isGlobalExcelAllowedFront(exportFrontFilter)) {
      showSnackbar('Este exportador solo genera PISCINAS y CANALETAS. NOC usa su propio exportador.', 'info')
      return
    }

    const ok = await handleExportReportsListExcel(
      filtered,
      `reportes_terreno_${normalizeText(exportFrontFilter).toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${exportDateFilter || new Date().toISOString().slice(0, 10)}.xlsx`
    )
    if (!ok) return
    setExportDialogOpen(false)
    window.setTimeout(() => {
      showSnackbar(`Exportación ${exportFrontFilter} lista`, 'success')
    }, 250)
  }

  const exportFrontHint = useMemo(() => {
    if (exportFrontFilter) return `Se exportarán solo reportes de ${exportFrontFilter}.`
    return 'Si eliges "Todos", se generarán dos archivos separados: CANALETAS y PISCINAS.'
  }, [exportFrontFilter])

  const openDailyExcelPreview = useCallback(async (date: string, items: FieldReport[]) => {
    setDailyExcelPreviewDate(String(date || ''))
    setDailyExcelPreviewReports([])
    setDailyExcelPreviewFrontTab('')
    setDailyExcelExportMode('BOTH')
    setDailyExcelExcludedImageKeys([])
    setDailyExcelImageOrientationByKey({})
    setDailyExcelPreviewOpen(true)
    setDailyExcelPreviewLoading(true)
    try {
      const fullReports = await Promise.all((Array.isArray(items) ? items : []).map(fetchFullReportForDailyExcel))
      setDailyExcelPreviewReports(fullReports as FieldReport[])
    } catch {
      setDailyExcelPreviewReports(Array.isArray(items) ? items : [])
      showSnackbar('No se pudo cargar todo el detalle; se mostrará la información disponible.', 'warning')
    } finally {
      setDailyExcelPreviewLoading(false)
    }
  }, [fetchFullReportForDailyExcel])

  const dailyExcelPreview = useMemo(() => {
    return buildDailyExcelModel(dailyExcelPreviewDate, dailyExcelPreviewReports)
  }, [buildDailyExcelModel, dailyExcelPreviewDate, dailyExcelPreviewReports])
  const dailyExcelPreviewSelectedFront = dailyExcelPreview.groups.some((group) => group.front === dailyExcelPreviewFrontTab)
    ? dailyExcelPreviewFrontTab
    : (dailyExcelPreview.groups[0]?.front || '')
  const dailyExcelPreviewVisibleGroups = dailyExcelPreviewSelectedFront
    ? dailyExcelPreview.groups.filter((group) => group.front === dailyExcelPreviewSelectedFront)
    : dailyExcelPreview.groups
  const dailyExcelExcludedImageKeySet = useMemo(
    () => new Set((dailyExcelExcludedImageKeys || []).map((key) => String(key || '').trim()).filter(Boolean)),
    [dailyExcelExcludedImageKeys]
  )

  useEffect(() => {
    if (!dailyExcelPreviewOpen || dailyExcelPreviewLoading) return
    const files = dailyExcelPreviewVisibleGroups.flatMap((group) => group.images || [])
    if (files.length === 0) return
    ensureUploadedEvidencePreview(files)
  }, [dailyExcelPreviewLoading, dailyExcelPreviewOpen, dailyExcelPreviewVisibleGroups, ensureUploadedEvidencePreview])

  const handleRunDailyExcelPreviewExport = useCallback(async () => {
    try {
      setDailyExcelExporting(true)
      if (dailyExcelExportMode === 'CURRENT') {
        const front = String(dailyExcelPreviewSelectedFront || '').trim()
        if (!front) {
          showSnackbar('Selecciona un frente para exportar', 'info')
          return
        }
        setDailyExcelExportProgressLabel(`Exportando ${front}...`)
        await handleExportDailyDescriptionExcel(
          dailyExcelPreviewDate,
          dailyExcelPreviewReports,
          dailyExcelExcludedImageKeys,
          front
        )
      } else {
        const fronts = dailyExcelPreview.groups
          .map((group) => String(group.front || '').trim())
          .filter((front) => {
            const normalized = normalizeText(front).toUpperCase()
            return normalized === 'PISCINAS' || normalized === 'CANALETAS'
          })
        if (fronts.length === 0) {
          showSnackbar('No hay frentes PISCINAS/CANALETAS para exportar', 'info')
          return
        }
        for (let idx = 0; idx < fronts.length; idx += 1) {
          const front = fronts[idx]
          setDailyExcelExportProgressLabel(`Exportando ${front} (${idx + 1}/${fronts.length})...`)
          await handleExportDailyDescriptionExcel(
            dailyExcelPreviewDate,
            dailyExcelPreviewReports,
            dailyExcelExcludedImageKeys,
            front,
            { silent: idx < fronts.length - 1 }
          )
        }
      }
      setDailyExcelExportOptionsOpen(false)
      setDailyExcelPreviewOpen(false)
      setExportDialogOpen(false)
    } finally {
      setDailyExcelExporting(false)
      setDailyExcelExportProgressLabel('')
    }
  }, [
    dailyExcelExportMode,
    dailyExcelPreviewSelectedFront,
    dailyExcelPreviewDate,
    dailyExcelPreviewReports,
    dailyExcelExcludedImageKeys,
    dailyExcelPreview.groups,
    handleExportDailyDescriptionExcel
  ])

  return (
    <Box sx={{ display: 'flex', minWidth: 0, width: '100%', overflowX: 'hidden' }}>
      <Box sx={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
        <UserHeader title="Reportes de Terreno" />
        {!isReadOnlyRole ? (
          <Tooltip title="Nuevo Reporte">
            <IconButton
              color="primary"
              onClick={openNewReport}
              sx={{
                position: 'fixed',
                top: { xs: 64, sm: 70 },
                right: { xs: 14, sm: 22 },
                zIndex: 1200,
                width: 52,
                height: 52,
                borderRadius: '50%',
                bgcolor: colors.blue1,
                color: '#ffffff',
                border: '2px solid #7dd3fc',
                boxShadow: '0 10px 24px rgba(0, 26, 51, 0.32)',
                transition: 'border-color 160ms ease, box-shadow 160ms ease',
                '&:hover': {
                  bgcolor: colors.blue1,
                  borderColor: '#bae6fd',
                  boxShadow: '0 10px 28px rgba(125, 211, 252, 0.55)',
                  '& .plus-icon': {
                    color: '#7dd3fc',
                    transform: 'scale(1.18)',
                  },
                },
                '&.Mui-disabled': {
                  bgcolor: '#93c5fd',
                  color: '#e0f2fe',
                  borderColor: '#bae6fd',
                },
              }}
            >
              <Plus
                className="plus-icon"
                size={22}
                style={{
                  color: colors.blue14,
                  transition: 'color 160ms ease, transform 160ms ease',
                }}
              />
            </IconButton>
          </Tooltip>
        ) : null}
        <Box component="main" sx={{ minWidth: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
          <Container
            maxWidth={false}
            disableGutters
            sx={{ py: { xs: 1, sm: 1.5, md: 2 }, width: '100%', maxWidth: '100% !important', minWidth: 0, overflowX: 'hidden', px: { xs: 0.75, sm: 1.25, md: 2 } }}
          >
            <Paper elevation={0} sx={{ p: 0, mb: 0, width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'visible', boxSizing: 'border-box', bgcolor: 'transparent', boxShadow: 'none' }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} />
              </Box>

              <Box sx={{ mt: 0 }}>
                {/* Activities removed here to avoid loading large program lists; use Programa screen instead. */}

                <Box sx={{ mt: { xs: 2.5, sm: 3.5 } }}>
                  {/* 'Reports' header removed to avoid duplication; keep only the upper 'Reportes' header */}
                  {reportsLoading ? (
                    <Box
                      sx={{
                        minHeight: 220,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: 1.25,
                        color: '#64748b'
                      }}
                    >
                      <CircularProgress size={26} />
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                        Cargando reportes...
                      </Typography>
                    </Box>
                  ) : reportsLoadError ? (
                    <Box
                      sx={{
                        minHeight: 220,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: 0.75,
                        textAlign: 'center',
                        color: '#991b1b'
                      }}
                    >
                      <Typography sx={{ fontSize: 15, fontWeight: 800 }}>
                        No se pudieron cargar los reportes
                      </Typography>
                      <Typography sx={{ fontSize: 13, color: '#64748b', maxWidth: 520 }}>
                        {reportsLoadError}
                      </Typography>
                    </Box>
                  ) : reports.length === 0 ? (
                    <Box
                      sx={{
                        minHeight: 220,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        color: '#64748b'
                      }}
                    >
                      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                        No hay reportes creados.
                      </Typography>
                    </Box>
                  ) : (
                    <List sx={{ p: 0, width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
                      {reportsGroupedByReportDate.map((group) => (
                        <Box key={group.date} sx={{ mb: 0, width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
                          <Box
                            onClick={() => {
                              const isCollapsed = collapsedDateGroups[group.date] !== false
                              const willExpand = isCollapsed
                              setCollapsedDateGroups((prev) => ({
                                ...prev,
                                [group.date]: !isCollapsed
                              }))
                              if (willExpand) {
                                void loadReportsForDate(group.date)
                                void ensurePendingCrewContextForDate(group.date)
                              }
                            }}
                            sx={{
                              px: 1.5,
                              py: 1,
                              borderRadius: 1.5,
                              bgcolor: '#0b5cab',
                              border: '1px solid #0a4c8f',
                              mb: 0.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: { xs: 'wrap', sm: 'nowrap' },
                              gap: 1,
                              width: '100%',
                              maxWidth: '100%',
                              minWidth: 0,
                              boxSizing: 'border-box',
                              cursor: 'pointer',
                              transition: 'transform 160ms ease, box-shadow 200ms ease, background-color 200ms ease',
                              boxShadow: '0 2px 6px rgba(11, 92, 171, 0.22)',
                              '&:hover': {
                                bgcolor: '#0a4f94',
                                boxShadow: '0 8px 18px rgba(11, 92, 171, 0.3)',
                                transform: 'translateY(-1px)'
                              }
                            }}
                          >
                            <Typography sx={{ fontWeight: 700, color: '#ffffff', fontSize: 16, lineHeight: 1.1, minWidth: 0, flex: '1 1 160px', overflowWrap: 'anywhere' }}>
                              {group.label}
                            </Typography>
                            {(() => {
                              const pendingInfo = pendingCrewsByDate.get(String(group.date || ''))
                              const pendingCount = Number(pendingInfo?.pendingIds.length || 0)
                              if (pendingCount < 1) return null
                              const tooltip = `Pendientes (${pendingCount}): ${(pendingInfo?.pendingNames || []).join(', ')}`
                              return (
                                <Tooltip title={tooltip}>
                                  <Button
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPendingCrewsModalDate(String(group.date || ''))
                                      setPendingCrewsModalOpen(true)
                                    }}
                                    sx={{
                                      ml: 1,
                                      px: 1,
                                      py: 0.15,
                                      borderRadius: 999,
                                      minWidth: 0,
                                      border: '1px solid #b91c1c',
                                      bgcolor: '#dc2626',
                                      color: '#ffffff',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      textTransform: 'none',
                                      whiteSpace: 'nowrap',
                                      '&:hover': {
                                        bgcolor: '#b91c1c',
                                        borderColor: '#991b1b'
                                      }
                                    }}
                                  >
                                    {`Pendientes: ${pendingCount}`}
                                  </Button>
                                </Tooltip>
                              )
                            })()}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', flexShrink: 0 }}>
                              {(isAdminRole || isUserRole) ? (
                                <>
                                  <Button
                                    size="small"
                                    variant="text"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void notifyFieldReportsDayCompleted(group.date, group.items.length)
                                    }}
                                    disabled={notifyingCompletedDate === String(group.date || '').slice(0, 10)}
                                    title="Notificar reportes completados"
                                    sx={{
                                      minWidth: 36,
                                      minHeight: 28,
                                      px: 0.75,
                                      py: 0.25,
                                      color: '#e0f2fe',
                                      fontWeight: 800,
                                      textTransform: 'none',
                                      border: 'none',
                                      bgcolor: 'transparent',
                                      '&:hover': {
                                        border: 'none',
                                        bgcolor: 'rgba(255, 255, 255, 0.14)'
                                      },
                                      '&.Mui-disabled': {
                                        color: 'rgba(224, 242, 254, 0.5)'
                                      }
                                    }}
                                  >
                                    {notifyingCompletedDate === String(group.date || '').slice(0, 10)
                                      ? <CircularProgress size={15} sx={{ color: 'currentColor' }} />
                                      : <Send size={16} />}
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="text"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      openDailyExcelPreview(group.date, group.items)
                                    }}
                                    title="Previsualizar Excel"
                                    sx={{
                                      minWidth: 36,
                                      minHeight: 28,
                                      px: 0.75,
                                      py: 0.25,
                                      color: '#e0f2fe',
                                      fontWeight: 800,
                                      textTransform: 'none',
                                      border: 'none',
                                      bgcolor: 'transparent',
                                      '&:hover': {
                                        border: 'none',
                                        bgcolor: 'rgba(255, 255, 255, 0.14)'
                                      }
                                    }}
                                  >
                                    <FileSpreadsheet size={17} />
                                  </Button>
                                </>
                              ) : null}
                              <Box
                                aria-label={collapsedDateGroups[group.date] ? 'Mostrar reportes' : 'Ocultar reportes'}
                                title={collapsedDateGroups[group.date] ? 'Mostrar reportes' : 'Ocultar reportes'}
                                sx={{
                                  width: 28,
                                  height: 28,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'rgba(255, 255, 255, 0.5)',
                                  flexShrink: 0
                                }}
                              >
                                {collapsedDateGroups[group.date]
                                  ? <ChevronDown size={26} strokeWidth={3} />
                                  : <ChevronUp size={26} strokeWidth={3} />}
                              </Box>
                            </Box>
                          </Box>
                          {!collapsedDateGroups[group.date] && dateDetailsLoadingByDate[group.date] ? (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                px: 1.5,
                                py: 1.5,
                                mb: 0.5,
                                border: '1px solid #dbe4f0',
                                borderRadius: 1.5,
                                bgcolor: '#ffffff',
                                color: '#64748b'
                              }}
                            >
                              <CircularProgress size={18} />
                              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                                Cargando reportes...
                              </Typography>
                            </Box>
                          ) : null}
                          {!collapsedDateGroups[group.date] && !dateDetailsLoadingByDate[group.date] && group.items.length === 0 ? (
                            <Box
                              sx={{
                                px: 1.5,
                                py: 1.25,
                                mb: 0.5,
                                border: '1px solid #dbe4f0',
                                borderRadius: 1.5,
                                bgcolor: '#ffffff',
                                color: '#64748b'
                              }}
                            >
                              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                                No hay reportes declarados para esta fecha.
                              </Typography>
                            </Box>
                          ) : null}
                          {!collapsedDateGroups[group.date] && !dateDetailsLoadingByDate[group.date] && group.items.map((r) => {
                            const hasTime = r.start_time && r.end_time
                            const activityLines = getActivitySummaryLines(r.activities, r.assignments)
                            const responsible = getReportResponsibleParts(r)
                            const capatazDisplay = String(responsible?.capataz || '').trim()
                            const supervisorDisplay = String(responsible?.supervisor || '').trim()
                            const splitNameRole = (value: string) => {
                              const text = String(value || '').trim()
                              if (!text) return { name: '', role: '' }
                              const idx = text.indexOf(' - ')
                              if (idx < 0) return { name: text, role: '' }
                              return {
                                name: text.slice(0, idx).trim(),
                                role: text.slice(idx + 3).trim()
                              }
                            }
                            const supervisorParts = splitNameRole(supervisorDisplay)
                            const capatazParts = splitNameRole(capatazDisplay)
                            const canDeleteReport =
                              !isReadOnlyRole &&
                              (
                                isAdminRole ||
                                isDevRole ||
                                (isUserRole && !!currentUserId && String(r?.created_by || '') === currentUserId)
                              )
                            return (
                              <ListItem
                                key={r.id}
                                alignItems="flex-start"
                                sx={{
                                  mb: 0.5,
                                  width: '100%',
                                  maxWidth: '100%',
                                  minWidth: 0,
                                  boxSizing: 'border-box',
                                  px: 1.5,
                                  py: 1.25,
                                  border: '1px solid #dbe4f0',
                                  borderRadius: 1.5,
                                  bgcolor: '#ffffff',
                                  transition: 'transform 160ms ease, box-shadow 200ms ease, border-color 200ms ease',
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                                  display: 'flex',
                                  flexDirection: { xs: 'column', md: 'row' },
                                  alignItems: 'flex-start',
                                  justifyContent: 'space-between',
                                  gap: 2,
                                  '&:hover': {
                                    transform: 'translateY(-1px)',
                                    borderColor: '#bfdbfe',
                                    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.12)'
                                  }
                                }}
                              >
                                <Box sx={{ minWidth: 0, flex: '1 1 0%', width: '100%', maxWidth: '100%' }}>
                                  <Box sx={{ mb: 0.5, minWidth: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
                                    <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 14, lineHeight: 1.2, textTransform: 'uppercase', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {r.area && r.area !== '' ? r.area : 'Sin área'}
                                    </Typography>
                                    <Typography
                                      sx={{
                                        color: '#94a3b8',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        flexShrink: 0,
                                        maxWidth: '45%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title={`Frente: ${String(r?.work_front || 'Sin frente')}`}
                                    >
                                      Frente: {String(r?.work_front || 'Sin frente')}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ mb: 0.5, minWidth: 0 }}>
                                    {activityLines.map((line, idx) => (
                                      <Typography
                                        key={`${r.id}-activity-summary-${idx}`}
                                        title={line}
                                        sx={{
                                          color: '#475569',
                                          fontSize: 12,
                                          lineHeight: 1.35,
                                          textTransform: 'uppercase',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          display: 'block',
                                          maxWidth: '100%'
                                        }}
                                      >
                                        {line}
                                      </Typography>
                                    ))}
                                  </Box>
                                  <Typography sx={{ color: '#334155', fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>
                                    {getReportCrewLabel(r)}
                                  </Typography>
                                  {hasTime && (
                                    <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                                      Horario: {r.start_time} — {r.end_time}
                                    </Typography>
                                  )}
                                </Box>

                                <Box
                                  sx={{
                                    width: { xs: '100%', md: 248 },
                                    minWidth: { xs: 0, md: 248 },
                                    flexShrink: 0,
                                    ml: { md: 'auto' },
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: { xs: 'stretch', md: 'flex-end' },
                                    gap: 2,
                                    alignSelf: 'stretch'
                                  }}
                                >
                                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', md: 'flex-end' }, gap: 0.15, width: '100%' }}>
                                      {supervisorDisplay ? (
                                        <Typography
                                          title={supervisorDisplay.toUpperCase()}
                                          sx={{
                                            color: '#64748b',
                                            fontWeight: 600,
                                            fontSize: 12,
                                            lineHeight: 1.25,
                                            textAlign: { xs: 'left', md: 'right' },
                                            whiteSpace: 'normal',
                                            wordBreak: 'break-word',
                                            width: '100%',
                                            textTransform: 'uppercase'
                                          }}
                                        >
                                          {supervisorParts.name}
                                          {supervisorParts.role ? (
                                            <Box component="span" sx={{ color: '#cbd5e1', fontWeight: 600 }}>
                                              {' '}{supervisorParts.role}
                                            </Box>
                                          ) : null}
                                        </Typography>
                                      ) : null}
                                      {capatazDisplay ? (
                                        <Typography
                                          title={capatazDisplay.toUpperCase()}
                                          sx={{
                                            color: '#64748b',
                                            fontWeight: 600,
                                            fontSize: 12,
                                            lineHeight: 1.25,
                                            textAlign: { xs: 'left', md: 'right' },
                                            whiteSpace: 'normal',
                                            wordBreak: 'break-word',
                                          width: '100%',
                                          textTransform: 'uppercase'
                                        }}
                                      >
                                        {capatazParts.name}
                                        {capatazParts.role ? (
                                          <Box component="span" sx={{ color: '#cbd5e1', fontWeight: 600 }}>
                                            {' '}{capatazParts.role}
                                          </Box>
                                        ) : null}
                                      </Typography>
                                      ) : null}
                                  </Box>

                                <Stack direction="row" spacing={1} sx={{ flexShrink: 0, mt: 'auto', flexWrap: 'wrap', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                                  <Tooltip title="Ver">
                                    <IconButton size="small" color="primary" onClick={() => openReport(r, 'view')}>
                                      <Eye size={16} />
                                    </IconButton>
                                  </Tooltip>
                                  {isAdminRole ? (
                                    <Tooltip title="Historial">
                                      <IconButton size="small" color="primary" onClick={() => openHistory(r)}>
                                        <Clock3 size={16} />
                                      </IconButton>
                                    </Tooltip>
                                  ) : null}
                                  {!isReadOnlyRole ? (
                                    <Tooltip title="Editar">
                                      <IconButton size="small" color="primary" onClick={() => openReport(r, 'edit')}>
                                        <Edit2 size={16} />
                                      </IconButton>
                                    </Tooltip>
                                  ) : null}
                                  {canDeleteReport ? (
                                    <Tooltip title="Eliminar">
                                      <IconButton size="small" color="error" onClick={() => confirmDeleteReport(r.id)}>
                                        <Trash2 size={16} />
                                      </IconButton>
                                    </Tooltip>
                                  ) : null}
                                </Stack>
                                </Box>
                              </ListItem>
                            )
                          })}
                        </Box>
                      ))}
                    </List>
                  )}
                </Box>
              </Box>
            </Paper>

            {/*
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Guía de datos requeridos</Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Cada reporte debe incluir: áreas de trabajo, horarios, actividades realizadas, restricciones encontradas y el personal participante (disciplina, cuadrilla, supervisor, capataz, colaboradores).
              </Typography>
            </Paper>
            */}
          </Container>
        </Box>

          {openingReportId ? (
            <Box
              sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 1299,
                bgcolor: 'rgba(15, 23, 42, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Box sx={{ bgcolor: '#fff', borderRadius: 1.5, px: 3, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, boxShadow: 3 }}>
                <CircularProgress size={24} />
                <Typography sx={{ fontWeight: 700, color: '#0f2d5c' }}>Cargando reporte...</Typography>
              </Box>
            </Box>
          ) : null}

          <Dialog
            open={open}
            disableEscapeKeyDown
            onClose={(_event, reason) => {
              if (reason === 'backdropClick' || reason === 'escapeKeyDown') return
              requestCloseReportModal()
            }}
          maxWidth={false}
          fullWidth={false}
          PaperProps={{ sx: { height: '95vh', width: '95vw', maxWidth: '95vw', mx: 'auto' } }}
        >
          <DialogTitle sx={{ px: 3, pt: 2, pb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Typography component="span" sx={{ fontSize: 20, fontWeight: 700 }}>
                {editMode ? 'Editar Reporte de Terreno' : ((selectedReport || reportHydrating) ? 'Ver Reporte de Terreno' : 'Nuevo Reporte de Terreno')}
              </Typography>
              {!editMode && selectedReport?.id && sameDateReportNavigation.currentIndex >= 0 && sameDateReportNavigation.items.length > 1 ? (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{
                    flexShrink: 0,
                    px: 1,
                    py: 0.5,
                    border: '1px solid #cbd5e1',
                    borderRadius: 999,
                    bgcolor: '#f8fafc'
                  }}
                >
                  <Tooltip title="Reporte anterior de la misma fecha">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => navigateSameDateReport('previous')}
                        disabled={!sameDateReportNavigation.previous || !!openingReportId}
                        sx={{ color: '#0f2d5c' }}
                      >
                        <ChevronLeft size={18} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <TextField
                    select
                    size="small"
                    value={String(selectedReport?.id || '')}
                    onChange={(e) => navigateSameDateReportById(String(e.target.value || ''))}
                    sx={{
                      minWidth: 170,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 999,
                        bgcolor: '#ffffff'
                      },
                      '& .MuiOutlinedInput-input': {
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: 13,
                        py: 0.6
                      }
                    }}
                    disabled={!!openingReportId}
                  >
                    {sameDateReportNavigation.items.map((item: any, idx: number) => {
                      const reportLabel = String(getReportCrewLabel(item) || '').trim() || `Reporte ${idx + 1}`
                      return (
                        <MenuItem key={`same-date-report-${String(item?.id || idx)}`} value={String(item?.id || '')}>
                          {reportLabel}
                        </MenuItem>
                      )
                    })}
                  </TextField>
                  <Tooltip title="Reporte siguiente de la misma fecha">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => navigateSameDateReport('next')}
                        disabled={!sameDateReportNavigation.next || !!openingReportId}
                        sx={{ color: '#0f2d5c' }}
                      >
                        <ChevronRight size={18} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              ) : null}
            </Box>
          </DialogTitle>
          <DialogContent
            onChangeCapture={markReportDraftChangedByUser}
            onInputCapture={markReportDraftChangedByUser}
            onClickCapture={markReportDraftChangedByUser}
            sx={{
              px: 3,
              pt: 1.25,
              pb: 3,
              fontSize: 13,
              ...(isView ? {
                '& td, & th, & span, & .MuiTypography-root, & .MuiInputBase-input, & .MuiSelect-select': {
                  textTransform: 'uppercase'
                }
              } : {})
            }}
          >
            {selectedReportHydrationStatus === 'error' ? (
              <Box
                sx={{
                  minHeight: '70vh',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 2,
                  color: '#0f2d5c'
                }}
              >
                <Typography sx={{ fontWeight: 700 }}>No se pudo cargar el reporte completo</Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedReportHydrationError || 'Ocurrió un error al hidratar el reporte.'}
                </Typography>
              </Box>
            ) : hydrationPendingForSelectedReport ? (
              <Box
                sx={{
                  minHeight: '70vh',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 2,
                  color: '#0f2d5c'
                }}
              >
                <Typography sx={{ fontWeight: 700 }}>No se pudo preparar el reporte. Cierre e intente nuevamente.</Typography>
                <Typography variant="body2" color="text.secondary">
                  Estado de hidratación inválido para el reporte seleccionado.
                </Typography>
                <Button variant="outlined" onClick={closeReportModal}>Cerrar</Button>
              </Box>
            ) : (
            <Box ref={fieldReportPdfRef}>
            {/* Template header fields (Fecha, Supervisor/Capataz, Especialidad, Cond. Climática, Turno) */}
            <Box
              sx={{
                mb: 1,
                mt: 1.25,
                pt: 0.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                width: '100%',
                maxWidth: '100%',
                overflow: 'visible',
                '& .MuiFormControl-root': {
                  position: 'relative',
                  zIndex: 1
                },
                '& .MuiInputLabel-root': {
                  zIndex: 2,
                  backgroundColor: '#fff',
                  px: 0.5
                }
              }}
            >
              {(() => {
                const isView = !editMode && !!selectedReport
                const isNew = !selectedReport && !editMode
                const isEditingExisting = editMode && !!selectedReport
                return (
                  <>
                    <Box
                      sx={{
                        display: { xs: 'grid', lg: 'flex' },
                        gridTemplateColumns: {
                          xs: '1fr',
                          sm: 'repeat(2, minmax(0, 1fr))'
                        },
                        flexWrap: { lg: 'wrap' },
                        gap: 1,
                        rowGap: 1,
                        alignItems: 'center',
                        justifyContent: { lg: 'center' },
                        alignContent: { lg: 'center' }
                      }}
                    >
                    <Box sx={{ width: { xs: '100%', lg: 180 }, minWidth: { xs: 0, lg: 180 }, flex: { lg: '0 1 180px' } }}>
                      <LocalizationProvider dateAdapter={AdapterDateFns}>
                        <DatePicker
                          label="Fecha"
                          value={reportDateValue}
                          onChange={(value) => {
                            if (!value || isNaN(value.getTime())) {
                              setReportDate('')
                              return
                            }
                            setReportDate(format(value, 'yyyy-MM-dd'))
                          }}
                          format="yyyy-MM-dd"
                          shouldDisableDate={shouldDisableReportDate}
                          disabled={isView}
                          slotProps={{
                            textField: {
                              size: 'small',
                              sx: { width: '100%', minWidth: 0 },
                              helperText: isUserRole && isNew && !loadingActivityDates && availableDateSet.size === 0
                                ? 'Sin actividades'
                                : undefined,
                            }
                          }}
                        />
                      </LocalizationProvider>
                    </Box>
                    {isUserRole && !isView && !isEditingExisting ? (
	                      <TextField
	                        select
	                        label="Cuadrilla"
	                        size="small"
	                        value={reportCrewIds[0] || ''}
	                        onChange={(e) => {
	                          const value = String(e.target.value || '')
	                          setLoadingCrewActivities(!!value)
	                          if (!value) setAssignedActivities([])
	                          setReportCrewIds(value ? [value] : [])
	                        }}
	                        sx={{ width: { xs: '100%', lg: 320 }, minWidth: { xs: 0, lg: 260 }, flex: { lg: '0 1 320px' } }}
	                        disabled={loadingCrewActivities || !reportDate || (isUserRole && isNew && availableCrewIdSet.size === 0)}
	                        InputProps={{
	                          endAdornment: loadingCrewActivities ? (
	                            <Box sx={{ display: 'flex', alignItems: 'center', mr: 3, pointerEvents: 'none' }}>
	                              <CircularProgress size={18} />
	                            </Box>
	                          ) : undefined
	                        }}
	                      >
	                        <MenuItem value="">Seleccione cuadrilla</MenuItem>
	                        {crewsForDate.map((c) => {
	                          const disabledByUsed = usedCrewIdsByDate.has(String(c.id))
	                          return (
	                          <MenuItem key={c.id} value={String(c.id)} disabled={disabledByUsed}>
	                            {formatCrewNameLabel(c.name)}{disabledByUsed ? ' (ya reportada)' : ''}
	                          </MenuItem>
	                        )})}
	                      </TextField>
	                    ) : (
	                      <TextField label="Cuadrilla" size="small" value={reportCrewNameLabel} disabled sx={{ width: { xs: '100%', lg: 320 }, minWidth: { xs: 0, lg: 260 }, flex: { lg: '0 1 320px' } }} />
	                    )}
	                    <TextField
                      select
                      label="Área"
                      size="small"
                      value={area}
                      onChange={(e) => setArea(String(e.target.value || ''))}
                      sx={{ width: { xs: '100%', lg: 300 }, minWidth: { xs: 0, lg: 240 }, flex: { lg: '0 1 300px' } }}
                      disabled={isView}
                    >
                      <MenuItem value="">Sin área</MenuItem>
                      {area && !(areaOptions || []).includes(area) ? (
                        <MenuItem value={area}>{area}</MenuItem>
                      ) : null}
                      {(areaOptions || []).map((a) => (
                        <MenuItem key={a} value={a}>{a}</MenuItem>
                      ))}
                    </TextField>
                    
                    <TextField
                      select
                      label="Frente"
                      size="small"
                      value={workFront}
                      onChange={(e) => setWorkFront(String(e.target.value || ''))}
                      sx={{ width: { xs: '100%', lg: 280 }, minWidth: { xs: 0, lg: 220 }, flex: { lg: '0 1 280px' } }}
                      disabled={isView}
                    >
                      <MenuItem value="">Sin frente</MenuItem>
                      {workFront && !workFrontOptions.includes(workFront) ? (
                        <MenuItem value={workFront}>{workFront}</MenuItem>
                      ) : null}
                      {workFrontOptions.map((opt) => (
                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                      ))}
                    </TextField>
                    <Tooltip title={displayOrDash(formatPeopleLabel(supervisor)) === '-' ? '' : displayOrDash(formatPeopleLabel(supervisor))} disableHoverListener={displayOrDash(formatPeopleLabel(supervisor)) === '-'}>
                      <TextField label="Supervisor" size="small" value={displayOrDash(formatPeopleLabel(supervisor))} disabled sx={{ width: { xs: '100%', lg: 240 }, minWidth: { xs: 0, lg: 200 }, flex: { lg: '0 1 240px' } }} />
                    </Tooltip>
                    <TextField label="Especialidad" size="small" value={String(formatSpecialtyLabel(specialty) || '').toUpperCase()} disabled sx={{ width: { xs: '100%', lg: 200 }, minWidth: { xs: 0, lg: 170 }, flex: { lg: '0 1 200px' } }} />
                    {(reportDesignVersion === 'V2' || isUserRole) ? (
                      <>
                        <TextField
                          select
                          label="Emitido por"
                          required
                          size="small"
                          value={emittedById}
                          onChange={(e) => setEmittedById(String(e.target.value || ''))}
                          sx={{
                            width: { xs: '100%', lg: 240 },
                            minWidth: { xs: 0, lg: 200 },
                            flex: { lg: '0 1 240px' },
                            '& .MuiSelect-select': { textTransform: 'uppercase' }
                          }}
                          disabled={isView}
                        >
                          <MenuItem value="">Seleccione Secretario Técnico</MenuItem>
                          {(otPresentWorkers || []).length === 0 ? (
                            <MenuItem value="">Sin Secretario Técnico en turno</MenuItem>
                          ) : null}
                          {emittedByOptionMissing ? (
                            <MenuItem value={emittedById}>
                              {String(emittedByWorker?.name || selectedReport?.emitted_by_name || 'Emitido guardado').toUpperCase()}
                            </MenuItem>
                          ) : null}
                          {(otPresentWorkers || []).map((w) => (
                            <MenuItem key={w.id} value={w.id}>{String(w.name || '').toUpperCase()}</MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Cargo"
                          size="small"
                          value={String(emittedByWorker?.position || '').toUpperCase()}
                          disabled
                          sx={{ width: { xs: '100%', lg: 200 }, minWidth: { xs: 0, lg: 170 }, flex: { lg: '0 1 200px' } }}
                        />
                      </>
                    ) : null}
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setShowMoreReportOptions((prev) => !prev)}
                      sx={{ height: 40, width: { xs: '100%', lg: 'auto' }, minWidth: { lg: 110 } }}
                    >
                      {showMoreReportOptions ? 'Menos' : 'Más'}
                    </Button>
                    {showMoreReportOptions ? (
                      <>
                        <TextField
                          select
                          size="small"
                          label="Área trabajo"
                          value={areaAssignmentMode}
                          onChange={(e) => setAreaAssignmentMode(String(e.target.value || 'global') as 'global' | 'individual')}
                          sx={{ width: { xs: '100%', lg: 190 }, minWidth: { xs: 0, lg: 170 }, flex: { lg: '0 1 190px' } }}
                          disabled={isView}
                        >
                          <MenuItem value="global">Global</MenuItem>
                          <MenuItem value="individual">Individual</MenuItem>
                        </TextField>
                        <TextField
                          select
                          size="small"
                          label="Turno"
                          value={turno}
                          onChange={(e) => setTurno(e.target.value as 'Dia' | 'Noche')}
                          sx={{ width: { xs: '100%', lg: 120 }, minWidth: { xs: 0, lg: 110 }, flex: { lg: '0 1 120px' } }}
                          disabled={isView}
                        >
                          <MenuItem value="Dia">Día</MenuItem>
                          <MenuItem value="Noche">Noche</MenuItem>
                        </TextField>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, alignSelf: 'center', width: { xs: '100%', lg: 'auto' }, minWidth: { xs: 0, lg: 280 }, flex: { lg: '0 1 280px' } }}>
                          <Typography variant="caption">Condición Climática:</Typography>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            {(() => {
                              const isViewLocal = isView
                              const hasCrewSelected = Array.isArray(reportCrewIds) && reportCrewIds.length > 0
                              const canToggleWeather = !isViewLocal && hasCrewSelected
                              const WeatherBtn = ({ active, onClick, label, children }: any) => {
                                const theme = useTheme()
                                const icon = React.isValidElement(children)
                                  ? React.cloneElement(children as React.ReactElement<any>, { stroke: active ? '#ffffff' : theme.palette.text.secondary, size: 22 })
                                  : children
                                return (
                                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: canToggleWeather ? 'pointer' : 'default', mx: 0.5, opacity: canToggleWeather || active ? 1 : 0.5 }} onClick={canToggleWeather ? onClick : undefined} role="button" aria-pressed={active}>
                                    <Box
                                      sx={{
                                        width: 45,
                                        height: 30,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 1,
                                        bgcolor: active ? theme.palette.primary.main : 'transparent',
                                        border: active ? `1px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`
                                      }}
                                    >
                                      {icon}
                                    </Box>
                                    <Typography variant="caption" sx={{ mt: 0, fontSize: 11, color: active ? theme.palette.primary.main : 'text.secondary' }}>{label}</Typography>
                                  </Box>
                                )
                              }

                              return (
                                <>
                                  <WeatherBtn active={weather.sunny} onClick={() => setWeather((w) => ({ ...w, sunny: !w.sunny }))} label="Soleado"><Sun /></WeatherBtn>
                                  <WeatherBtn active={weather.cloudy} onClick={() => setWeather((w) => ({ ...w, cloudy: !w.cloudy }))} label="Nublado"><Cloud /></WeatherBtn>
                                  <WeatherBtn active={weather.rain} onClick={() => setWeather((w) => ({ ...w, rain: !w.rain }))} label="Lluvia"><CloudRain /></WeatherBtn>
                                  <WeatherBtn active={weather.snow} onClick={() => setWeather((w) => ({ ...w, snow: !w.snow }))} label="Nieve"><Snowflake /></WeatherBtn>
                                </>
                              )
                            })()}
                          </Box>
                        {(!isView && !isEditingExisting && (!reportCrewIds || reportCrewIds.length === 0)) ? (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>Seleccione una cuadrilla</Typography>
                        ) : null}
                        </Box>
                        <TextField
                          select
                          label="Versión diseño"
                          size="small"
                          value={reportDesignVersion}
                          onChange={(e) => setReportDesignVersion((String(e.target.value).toUpperCase() === 'V2' ? 'V2' : 'V1'))}
                          sx={{ width: { xs: '100%', lg: 220 }, minWidth: { xs: 0, lg: 220 }, flex: { lg: '0 1 220px' } }}
                          disabled={isView}
                        >
                          {REPORT_DESIGN_VERSIONS.map((v) => (
                            <MenuItem key={v.value} value={v.value} disabled={v.value === 'V1'}>
                              {v.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </>
                    ) : null}
                    </Box>
                  </>
                )
              })()}
            </Box>
            {reportDesignVersion === 'V2' ? (
              (isView || editMode || (Array.isArray(reportCrewIds) && reportCrewIds.length > 0)) ? (
              <>
              {v2ShowTopScroll ? (
                <Box
                  ref={v2TopScrollRef}
                  onScroll={handleV2TopScroll}
                  sx={{
                    mt: 2,
                    mb: 0.5,
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    border: '1px solid #cbd5e1',
                    borderRadius: 1,
                    background: '#f8fafc',
                    position: 'sticky',
                    top: 0,
                    zIndex: 3
                  }}
                >
                  <Box sx={{ width: `${v2TopScrollContentWidth}px`, height: 1 }} />
                </Box>
              ) : null}
              <Box
	                ref={bindV2MainScrollNode}
		                onScroll={handleV2MainScroll}
		                sx={{ mt: v2ShowTopScroll ? 0 : 2, overflowX: 'auto', border: '1.1px solid #111827', position: 'relative', minHeight: loadingCrewActivities ? 320 : undefined }}
		              >
		                {loadingCrewActivities ? (
		                  <Box sx={{
		                    position: 'absolute',
		                    inset: 0,
		                    zIndex: 5,
		                    minHeight: 320,
		                    display: 'flex',
		                    flexDirection: 'column',
		                    alignItems: 'center',
		                    justifyContent: 'center',
		                    gap: 1.5,
		                    bgcolor: 'rgba(248, 250, 252, 0.88)',
		                    backdropFilter: 'blur(1px)'
		                  }}>
		                    <CircularProgress size={34} />
		                    <Typography sx={{ color: '#0f172a', fontWeight: 800 }}>
		                      Preparando actividades de la cuadrilla
	                    </Typography>
	                    <Typography variant="body2" sx={{ color: '#64748b' }}>
		                      Esto puede tardar en cargar las activiades.
		                    </Typography>
		                  </Box>
		                ) : null}
		                {(selectedReport?.id ? canRenderReportV2 : heavyModalSectionsReady) ? (
	                  (() => {
                  const v2HourColumnCount = v2AllHourIndexes.length
                  const totalCols = 14 + v2HourColumnCount
                  const dateParts = String(reportDate || '').split('-')
                  const year = dateParts[0] || ''
                  const month = dateParts[1] || ''
                  const day = dateParts[2] || ''
                  const emittedByName = String(emittedByWorker?.name || '-').trim() || '-'
                  const emittedByRole = String(emittedByWorker?.position || '').trim() || '-'
                  const supervisorPhoneDisplay = String(
                    supervisorPhone ||
                    selectedReport?.supervisor_phone ||
                    collaboratorPhoneById[String(selectedReport?.supervisor_id || '')] ||
                    ''
                  ).trim() || '-'
                  const capatazPhoneDisplay = String(
                    capatazPhone ||
                    selectedReport?.capataz_phone ||
                    selectedReport?.foreman_phone ||
                    collaboratorPhoneById[String(selectedReport?.capataz_id || '')] ||
                    ''
                  ).trim() || '-'
                  const hourColPx = 32
                  const activitiesForV2 = v2ActivitiesForTable
                  const totalsByActivity = v2TotalsComputed.totalsByActivity
                  const totalHorasExtrasGeneral = v2TotalsComputed.totalHorasExtrasGeneral
                  const totalHorasGeneral = v2TotalsComputed.totalHorasGeneral
                  const activityDescriptionColSpan = Math.max(2, totalCols - 24)
                  const generalEventsCommentsColSpan = Math.max(1, totalCols - 10)
                  const finalSignatureColSpan = Math.max(3, totalCols - 23)
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(1600, v2ColWidths.reduce((sum, value) => sum + Number(value || 0), 0)), fontSize: 12, tableLayout: 'fixed' }}>
                      <colgroup>
                        {v2ColWidths.map((w, idx) => (
                          <col key={`v2-col-${idx}`} style={{ width: w, minWidth: w }} />
                        ))}
                      </colgroup>
                      <tbody>
                        <tr>
                          <td colSpan={totalCols} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, padding: '6px 8px' }}>
                            {reportTitle}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={5} style={{ border: '1px solid #111827', fontWeight: 700, background: '#e5e7eb', padding: 4 }}>NOMBRE CONTRATO</td>
                          <td colSpan={13} style={{ border: '1px solid #111827', fontWeight: 700, padding: 4 }}>
                            {(contractName || 'CONTRATO EN DESARROLLO').toString().toUpperCase()}
                          </td>
                          <td colSpan={Math.max(1, totalCols - 18)} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#f3f4f6' }}>
                            Fecha: {day || '--'} / {month || '--'} / {year || '----'}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={5} style={{ border: '1px solid #111827', fontWeight: 700, background: '#e5e7eb', padding: 4 }}>ÁREA</td>
                          <td colSpan={Math.max(1, totalCols - 5)} style={{ border: '1px solid #111827', fontWeight: 700, padding: 4 }}>{(area || 'SIN ÁREA').toString().toUpperCase()}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} style={{ border: '1px solid #111827', fontWeight: 700, background: '#e5e7eb', padding: 4 }}>JEFE DE TERRENO</td>
                          <td colSpan={13} style={{ border: '1px solid #111827', fontWeight: 700, padding: 4 }}>
                            {(fieldBossName || '-').toString().toUpperCase()}
                          </td>
                          <td colSpan={2} style={{ border: '1px solid #111827', fontWeight: 700, background: '#e5e7eb', padding: 4 }}>CEL:</td>
                          <td colSpan={Math.max(1, totalCols - 20)} style={{ border: '1px solid #111827', padding: 4 }}>{fieldBossPhone || '-'}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} style={{ border: '1px solid #111827', fontWeight: 700, background: '#e5e7eb', padding: 4 }}>SUPERVISOR</td>
                          <td colSpan={13} style={{ border: '1px solid #111827', fontWeight: 700, padding: 4 }}>{displayOrDash(supervisor).toUpperCase()}</td>
                          <td colSpan={2} style={{ border: '1px solid #111827', fontWeight: 700, background: '#e5e7eb', padding: 4 }}>CEL:</td>
                          <td colSpan={Math.max(1, totalCols - 20)} style={{ border: '1px solid #111827', padding: 4 }}>{supervisorPhoneDisplay}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} style={{ border: '1px solid #111827', fontWeight: 700, background: '#e5e7eb', padding: 4 }}>CAPATAZ</td>
                          <td colSpan={13} style={{ border: '1px solid #111827', fontWeight: 700, padding: 4 }}>{String(capataz || '').toUpperCase()}</td>
                          <td colSpan={2} style={{ border: '1px solid #111827', fontWeight: 700, background: '#e5e7eb', padding: 4 }}>CEL:</td>
                          <td colSpan={Math.max(1, totalCols - 20)} style={{ border: '1px solid #111827', padding: 4 }}>{capatazPhoneDisplay}</td>
                        </tr>

                        <tr>
                          <td colSpan={11} style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb', padding: '4px 6px' }}>
                            DETALLE DEL PERSONAL EN OBRA
                          </td>
                          <td colSpan={Math.max(1, totalCols - 11)} style={{ border: '1px solid #111827', fontWeight: 700, background: '#f3f4f6', padding: '4px 6px' }}>
                            EMITIDO POR: {emittedByName.toUpperCase()} | CARGO: {emittedByRole.toUpperCase()}
                          </td>
                        </tr>
                        <tr>
                          <td rowSpan={2} style={{ border: '1px solid #111827', background: '#e5e7eb', fontWeight: 700, textAlign: 'center', width: 35 }}>CANT.</td>
                          <td rowSpan={2} colSpan={2} style={{ border: '1px solid #111827', background: '#e5e7eb', fontWeight: 700, textAlign: 'center', minWidth: 110 }}>RUT</td>
                          <td rowSpan={2} colSpan={5} style={{ border: '1px solid #111827', background: '#e5e7eb', fontWeight: 700, textAlign: 'center', minWidth: 260 }}>NOMBRE Y APELLIDO</td>
                          <td rowSpan={2} colSpan={3} style={{ border: '1px solid #111827', background: '#e5e7eb', fontWeight: 700, textAlign: 'center', minWidth: 170 }}>CARGO</td>
                          <td colSpan={v2HourColumnCount} style={{ border: '1px solid #111827', background: '#e5e7eb', fontWeight: 700, textAlign: 'center' }}>HORAS TRABAJADAS POR ACTIVIDAD</td>
                          <td rowSpan={2} style={{ border: '1px solid #111827', background: '#e5e7eb', fontWeight: 700, textAlign: 'center', minWidth: 200, width: 200 }}>Horas Extras</td>
                          <td rowSpan={2} style={{ border: '1px solid #111827', background: '#e5e7eb', fontWeight: 700, textAlign: 'center', minWidth: 240, width: 240 }}>Total Horas</td>
                          <td rowSpan={2} style={{ border: '1px solid #111827', background: '#e5e7eb', fontWeight: 700, textAlign: 'center', minWidth: 520, width: 520 }}>Área trabajo</td>
                        </tr>
                        <tr>
                          {v2AllHourIndexes.map((idx) => (
                            <td
                              key={`v2-act-head-${idx}`}
                              style={{
                                border: '1px solid #111827',
                                textAlign: 'center',
                                fontWeight: 700,
                                background: '#f3f4f6',
                                width: hourColPx,
                                minWidth: hourColPx,
                                maxWidth: hourColPx
                              }}
                            >
                              {idx + 1}
                            </td>
                          ))}
                        </tr>

                        {v2PersonnelRowsComputed.map((item: any) => {
                          const row = item.row
                          const idx = item.idx
                          const personId = item.personId
                          const hours = item.hours
                          const extraHours = item.extraHours
                          const total = item.total
                          const totalAcrossDay = item.totalAcrossDay
                          const belongsToMultipleCrews = item.belongsToMultipleCrews
                          const totalForStatus = Number(totalAcrossDay || 0)
                          const collaboratorTextColor = totalForStatus > STANDARD_PERSON_HOURS + 0.000001
                            ? '#b91c1c'
                            : Math.abs(totalForStatus - STANDARD_PERSON_HOURS) < 0.000001
                              ? '#15803d'
                              : '#f97316'
                          const collaboratorCellBg = belongsToMultipleCrews ? '#dbeafe' : undefined
                          const collaboratorTextTitle = belongsToMultipleCrews
                            ? `Colaborador en más de una cuadrilla. Total diario declarado en reportes del ${reportDate}: ${totalForStatus.toFixed(1)} h`
                            : `Total diario declarado en reportes del ${reportDate}: ${totalForStatus.toFixed(1)} h`
                          return (
                            <tr key={`v2-person-${personId}-${idx}`}>
                              <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                              <td colSpan={2} style={{ border: '1px solid #111827', textAlign: 'center' }}>
                                {item.rut}
                              </td>
                              <td
                                colSpan={5}
                                style={{
                                  border: '1px solid #111827',
                                  padding: '2px 4px',
                                  color: collaboratorTextColor,
                                  fontWeight: 700,
                                  background: collaboratorCellBg
                                }}
                                title={collaboratorTextTitle}
                              >
                                {(row?.name || '').toString().toUpperCase()}
                              </td>
                              <td colSpan={3} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px' }}>{(row?.position || '').toString().toUpperCase()}</td>
                              {v2ActivityIndexes.map((actIdx) => (
                                <td
                                  key={`v2-val-${personId}-${actIdx}`}
                                  style={{
                                    border: '1px solid #111827',
                                    textAlign: 'center',
                                    width: hourColPx,
                                    minWidth: hourColPx,
                                    maxWidth: hourColPx
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                                    <span>{Number(hours[actIdx] || 0) > 0 ? Number(hours[actIdx] || 0).toFixed(1).replace('.', ',') : ''}</span>
                                    {!isView && actIdx < activityCount ? (
                                      <IconButton
                                        size="small"
                                        onClick={() => openHourCellDialog(personId, row?.name || '', actIdx, Number(hours[actIdx] || 0))}
                                        sx={{ p: '2px', color: '#334155' }}
                                      >
                                        <Clock3 size={12} />
                                      </IconButton>
                                    ) : null}
                                  </Box>
                                </td>
                              ))}
                              {v2PostActivityIndexes.map((extraIdx) => (
                                <td
                                  key={`v2-post-act-${personId}-${extraIdx}`}
                                  style={{
                                    border: '1px solid #111827',
                                    textAlign: 'center',
                                    width: hourColPx,
                                    minWidth: hourColPx,
                                    maxWidth: hourColPx
                                  }}
                                />
                              ))}
                              <td style={{ border: '1px solid #111827', textAlign: 'center', minWidth: 200, width: 200 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                                  <span>{extraHours > 0 ? extraHours.toFixed(1).replace('.', ',') : '0,0'}</span>
                                  {!isView ? (
                                    <IconButton
                                      size="small"
                                      onClick={() => openHourCellDialog(personId, row?.name || '', -1, extraHours)}
                                      sx={{ p: '2px', color: '#334155' }}
                                    >
                                      <Clock3 size={12} />
                                    </IconButton>
                                  ) : null}
                                </Box>
                              </td>
                              <td
                                style={{
                                  border: '1px solid #111827',
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  minWidth: 108,
                                  width: 108,
                                  color: collaboratorTextColor,
                                  background: totalForStatus > STANDARD_PERSON_HOURS + 0.000001 ? '#fee2e2' : undefined
                                }}
                                title={collaboratorTextTitle}
                              >
                                {total.toFixed(1).replace('.', ',')}
                              </td>
                              <td style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px', minWidth: 520, width: 520 }}>
                                {!isView ? (
                                  <TextField
                                    select
                                    size="small"
                                    value={String(personAreaById[personId] || '')}
                                    onChange={(e) => updatePersonAreaById(personId, String(e.target.value || ''))}
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.5, textAlign: 'center' } }}
                                  >
                                    <MenuItem value="">-</MenuItem>
                                    {areaOptionsWithCurrent.map((opt) => (
                                      <MenuItem key={`person-area-${personId}-${opt}`} value={opt}>{opt}</MenuItem>
                                    ))}
                                  </TextField>
                                ) : (
                                  <span>{resolveAreaByMode(personAreaById[personId] || row?.area || area) || '-'}</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        <tr>
                          <td colSpan={11} style={{ border: '1px solid #111827', textAlign: 'right', fontWeight: 700, background: '#f3f4f6', padding: '4px 8px' }}>TOTAL HORAS</td>
                          {totalsByActivity.map((total, idx) => (
                            <td
                              key={`v2-total-act-${idx}`}
                              style={{
                                border: '1px solid #111827',
                                textAlign: 'center',
                                fontWeight: 700,
                                background: '#f9fafb',
                                width: hourColPx,
                                minWidth: hourColPx,
                                maxWidth: hourColPx
                              }}
                            >
                              {total > 0 ? total.toFixed(1).replace('.', ',') : '0,0'}
                            </td>
                          ))}
                          {v2PostActivityIndexes.map((idx) => (
                            <td
                              key={`v2-total-post-act-${idx}`}
                              style={{
                                border: '1px solid #111827',
                                textAlign: 'center',
                                fontWeight: 700,
                                background: '#f9fafb',
                                width: hourColPx,
                                minWidth: hourColPx,
                                maxWidth: hourColPx
                              }}
                            >
                              0,0
                            </td>
                          ))}
                          <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, minWidth: 200, width: 200 }}>
                            {totalHorasExtrasGeneral > 0 ? totalHorasExtrasGeneral.toFixed(1).replace('.', ',') : '0,0'}
                          </td>
                          <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 800, minWidth: 240, width: 240 }}>{totalHorasGeneral.toFixed(1).replace('.', ',')}</td>
                          <td style={{ border: '1px solid #111827', minWidth: 520, width: 520 }} />
                        </tr>

                        <tr>
                          <td style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb' }}>N°</td>
                          <td colSpan={2} style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb' }}>PATENTE</td>
                          <td colSpan={8} style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                              <span>MAQUINARIA DE APOYO</span>
                              {!isView ? (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={addEquipmentRow}
                                  startIcon={<Plus size={14} />}
                                  sx={{ py: 0.1, minHeight: 24, fontSize: 11, bgcolor: '#fff' }}
                                >
                                  Agregar equipo
                                </Button>
                              ) : null}
                            </Box>
                          </td>
                          <td colSpan={v2HourColumnCount} style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb' }}>HORAS TRABAJADAS POR ACTIVIDAD</td>
                          <td style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb', minWidth: 200, width: 200 }}>HM</td>
                          <td style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb', minWidth: 240, width: 240 }}>HORAS EXTRA</td>
                          <td style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb', minWidth: 520, width: 520 }}>Área trabajo</td>
                        </tr>
                        {v2EquipmentRowIndexes.map((machineIdx) => {
                          const entry = equipmentEntries?.[machineIdx]
                          const entryId = `equip-${machineIdx}`
                          const hours = equipmentHours[entryId] || []
                          const equipmentOptions = managementEquipmentCatalog
                            .filter((item) => item.is_operational !== false)
                            .map((item) => ({
                              value: `${String(item.equipment_name || '').trim()}|||${String(item.patent || '').trim()}`,
                              label: String(item.equipment_name || '').trim(),
                              patent: String(item.patent || '').trim(),
                              isOperational: item.is_operational !== false
                            }))
                            .filter((item) => item.label)
                          const currentName = String(entry?.description || '').trim()
                          const currentPatent = String(entry?.code || '').trim()
                          const currentSelectValue = currentName ? `${currentName}|||${currentPatent}` : ''
                          const hasCurrentInOptions = equipmentOptions.some((opt) => opt.value === currentSelectValue)
                          const currentIsKnownNonOperational = isKnownNonOperationalEquipment({ description: currentName, code: currentPatent })
                          const machineKey = normalizeMachineKey(entry || {})
                          const machineTotalAcrossDay = machineKey ? Number(crossReportMachineDayHoursByKey.get(machineKey) || 0) : 0
                          const machineInMultipleReports = machineKey ? Number(machineReportCountByKey.get(machineKey) || 0) > 1 : false
                          const machineTextColor = machineTotalAcrossDay > STANDARD_MACHINE_HOURS + 0.000001
                            ? '#b91c1c'
                            : Math.abs(machineTotalAcrossDay - STANDARD_MACHINE_HOURS) < 0.000001
                              ? '#15803d'
                              : '#0f172a'
                          const machineCellBg = machineInMultipleReports ? '#dbeafe' : undefined
                          const machineTitle = machineInMultipleReports
                            ? `Maquinaria usada en más de un reporte. Total diario declarado el ${reportDate}: ${machineTotalAcrossDay.toFixed(1)} h`
                            : `Total diario declarado el ${reportDate}: ${machineTotalAcrossDay.toFixed(1)} h`
                          const hm = v2ActivityIndexes.reduce((acc: number, i: number) => acc + (Number(hours[i] || 0) || 0), 0)
                          const hasMachineData = Boolean(
                            String(entry?.code || '').trim() ||
                            String(entry?.description || '').trim() ||
                            Number((entry as any)?.extra_hours || 0) > 0 ||
                            hm > 0
                          )
                          return (
                            <tr key={`v2-machine-${machineIdx}`}>
                              <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700 }}>{machineIdx + 1}</td>
                              <td colSpan={2} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px', color: machineTextColor, background: machineCellBg }} title={machineTitle}>
                                <span style={{ color: 'inherit', fontSize: 12, fontWeight: 500 }}>
                                  {(entry?.code || '').toString()}
                                </span>
                              </td>
                              <td colSpan={8} style={{ border: '1px solid #111827', padding: '2px 4px' }}>
                                {isView ? (
                                  <span style={{ display: 'block', color: '#111827', fontSize: 12, fontWeight: 500, padding: '4px 6px' }}>
                                    {(entry?.description || '').toString() || '-'}
                                  </span>
                                ) : (
                                  <TextField
                                    select
                                    size="small"
                                    value={currentSelectValue}
                                    onChange={(e) => {
                                      const raw = String(e.target.value || '')
                                      const [namePart, patentPart] = raw.split('|||')
                                      updateEquipmentField(machineIdx, 'description', String(namePart || '').trim())
                                      updateEquipmentField(machineIdx, 'code', String(patentPart || '').trim())
                                    }}
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.5 } }}
                                  >
                                    <MenuItem value=""><em>SELECCIONAR EQUIPO</em></MenuItem>
                                    {!hasCurrentInOptions && currentName ? (
                                      <MenuItem value={currentSelectValue} disabled={currentIsKnownNonOperational}>
                                        {currentName.toUpperCase()}{currentPatent ? ` (${currentPatent.toUpperCase()})` : ''}
                                        {currentIsKnownNonOperational ? ' (NO OPERATIVA)' : ''}
                                      </MenuItem>
                                    ) : null}
                                    {equipmentOptions.map((opt) => {
                                      const [optName, optPatent] = String(opt.value || '').split('|||')
                                      const optKey = normalizeMachineKey({ description: optName, code: optPatent })
                                      const optUsedByOther = Boolean(optKey && usedMachineKeysByOtherReports.has(optKey))
                                      const isCurrent = opt.value === currentSelectValue
                                      return (
                                      <MenuItem key={`equip-catalog-${machineIdx}-${opt.value}`} value={opt.value}>
                                        {opt.label.toUpperCase()}{opt.patent ? ` (${opt.patent.toUpperCase()})` : ''}
                                        {optUsedByOther && !isCurrent ? ' (USADO EN OTRO REPORTE)' : ''}
                                      </MenuItem>
                                    )})}
                                  </TextField>
                                )}
                              </td>
                              {v2ActivityIndexes.map((actIdx) => (
                                <td
                                  key={`v2-machine-${machineIdx}-${actIdx}`}
                                  style={{
                                    border: '1px solid #111827',
                                    textAlign: 'center',
                                    width: hourColPx,
                                    minWidth: hourColPx,
                                    maxWidth: hourColPx
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                                    <span>{Number(hours[actIdx] || 0) > 0 ? Number(hours[actIdx] || 0).toFixed(1).replace('.', ',') : ''}</span>
                                    {!isView && actIdx < activityCount ? (
                                      <IconButton
                                        size="small"
                                        onClick={() => openEquipHourCellDialog(entryId, actIdx, Number(hours[actIdx] || 0))}
                                        sx={{ p: '2px', color: '#334155' }}
                                      >
                                        <Clock3 size={12} />
                                      </IconButton>
                                    ) : null}
                                  </Box>
                                </td>
                              ))}
                              {v2PostActivityIndexes.map((extraIdx) => (
                                <td
                                  key={`v2-machine-post-${machineIdx}-${extraIdx}`}
                                  style={{
                                    border: '1px solid #111827',
                                    textAlign: 'center',
                                    width: hourColPx,
                                    minWidth: hourColPx,
                                    maxWidth: hourColPx
                                  }}
                                />
                              ))}
                              <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, minWidth: 200, width: 200, color: machineTextColor, background: machineTotalAcrossDay > STANDARD_MACHINE_HOURS + 0.000001 ? '#fee2e2' : undefined }} title={machineTitle}>{hm.toFixed(1).replace('.', ',')}</td>
                              <td style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px', minWidth: 240, width: 240 }}>
                                {isView ? (
                                  <span>{(Number((entry as any)?.extra_hours || 0) || 0).toFixed(1).replace('.', ',')}</span>
                                ) : (
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={String((entry as any)?.extra_hours ?? '')}
                                    onChange={(e) => {
                                      const raw = String(e.target.value || '').replace(',', '.')
                                      if (raw === '') {
                                        updateEquipmentField(machineIdx, 'extra_hours', '')
                                        return
                                      }
                                      const next = Number(raw)
                                      if (Number.isNaN(next)) return
                                      const machineKey = normalizeMachineKey(entry || {})
                                      const otherReportsTotal = machineKey
                                        ? Math.max(0, Number(crossReportMachineDayHoursByKey.get(machineKey) || 0) - Number(draftMachineDayHoursByKey.get(machineKey) || 0))
                                        : 0
                                      const ownHoursByActivity = v2ActivityIndexes.reduce((acc: number, i: number) => acc + (Number(hours[i] || 0) || 0), 0)
                                      const maxAllowed = Math.max(0, MAX_MACHINE_HOURS_WITH_OVERTIME - otherReportsTotal - ownHoursByActivity)
                                      const clamped = Math.max(0, Math.min(next, maxAllowed))
                                      if (clamped !== next) showSnackbar('La máquina no puede superar 15 horas diarias entre reportes', 'warning')
                                      updateEquipmentField(machineIdx, 'extra_hours', String(clamped))
                                    }}
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.5, textAlign: 'center' } }}
                                    inputProps={{ min: 0, step: '0.5', inputMode: 'decimal' }}
                                  />
                                )}
                              </td>
                              <td style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px', minWidth: 520, width: 520 }}>
                                {hasMachineData && !isView ? (
                                  <TextField
                                    select
                                    size="small"
                                    value={String(entry?.area || '')}
                                    onChange={(e) => updateEquipmentField(machineIdx, 'area', String(e.target.value || ''))}
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.5, textAlign: 'center' } }}
                                  >
                                    <MenuItem value="">-</MenuItem>
                                    {areaOptionsWithCurrent.map((opt) => (
                                      <MenuItem key={`equip-area-${machineIdx}-${opt}`} value={opt}>{opt}</MenuItem>
                                    ))}
                                  </TextField>
                                ) : hasMachineData ? (
                                  <span>{resolveAreaByMode(entry?.area || area) || '-'}</span>
                                ) : (
                                  <span />
                                )}
                              </td>
                            </tr>
                          )
                        })}

                        <tr>
                          <td style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb' }}>N°</td>
                          <td colSpan={10} style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                              <span>MATERIALES</span>
                              {!isView ? (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={addMaterialRow}
                                  startIcon={<Plus size={14} />}
                                  sx={{ py: 0.1, minHeight: 24, fontSize: 11, bgcolor: '#fff' }}
                                >
                                  Agregar material
                                </Button>
                              ) : null}
                            </Box>
                          </td>
                          <td colSpan={v2HourColumnCount} style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb' }}>CANTIDADES POR ACTIVIDAD</td>
                          <td style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb', minWidth: 200, width: 200 }}>CANTIDAD</td>
                          <td style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb', minWidth: 240, width: 240 }}>UNIDAD</td>
                          <td style={{ border: '1px solid #111827', fontWeight: 700, textAlign: 'center', background: '#e5e7eb', minWidth: 520, width: 520 }}>Área trabajo</td>
                        </tr>
                        {v2MaterialRowIndexes.map((matIdx) => (
                          <tr key={`v2-material-${matIdx}`}>
                            {(() => {
                              const entryId = `material-${matIdx}`
                              const entry = materialEntries?.[matIdx] || {}
                              const qtyByActivity = materialQuantities[entryId] || []
                              const totalQty = v2ActivityIndexes.reduce((acc: number, i: number) => acc + (Number(qtyByActivity[i] || 0) || 0), 0)
                              const hasMaterialData = Boolean(
                                String(entry?.description || '').trim() ||
                                String(entry?.unit || '').trim() ||
                                totalQty > 0
                              )
                              return (
                                <>
                            <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700 }}>{matIdx + 1}</td>
                            <td colSpan={10} style={{ border: '1px solid #111827', padding: '2px 4px' }}>
                              <TextField
                                size="small"
                                value={(entry?.description || '').toString()}
                                onChange={(e) => updateMaterialField(matIdx, 'description', e.target.value)}
                                disabled={isView}
                                sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.5 } }}
                              />
                            </td>
                            {v2ActivityIndexes.map((actIdx) => (
                              <td
                                key={`v2-mat-${matIdx}-${actIdx}`}
                                style={{
                                  border: '1px solid #111827',
                                  textAlign: 'center',
                                  width: hourColPx,
                                  minWidth: hourColPx,
                                  maxWidth: hourColPx
                                }}
                              >
                                <TextField
                                  size="small"
                                  type="number"
                                  value={Number(qtyByActivity[actIdx] || 0) || 0}
                                  disabled={isView || actIdx >= activityCount}
                                  onChange={(e) => {
                                    const n = toNonNegativeNumber(e.target.value)
                                    updateMaterialQuantity(entryId, actIdx, String(n || 0))
                                  }}
                                  inputProps={{ min: 0, step: 'any' }}
                                  sx={compactNumberFieldSx}
                                />
                              </td>
                            ))}
                            {v2PostActivityIndexes.map((extraIdx) => (
                              <td
                                key={`v2-mat-post-${matIdx}-${extraIdx}`}
                                style={{
                                  border: '1px solid #111827',
                                  textAlign: 'center',
                                  width: hourColPx,
                                  minWidth: hourColPx,
                                  maxWidth: hourColPx
                                }}
                              />
                            ))}
                            <td style={{ border: '1px solid #111827', textAlign: 'center', minWidth: 200, width: 200 }}>{totalQty > 0 ? totalQty.toFixed(1).replace('.', ',') : ''}</td>
                            <td style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px', minWidth: 240, width: 240 }}>
                              {isView ? (
                                <span>{(entry?.unit || '').toString() || '-'}</span>
                              ) : (
                                <TextField
                                  select
                                  size="small"
                                  value={(entry?.unit || '').toString()}
                                  onChange={(e) => updateMaterialField(matIdx, 'unit', String(e.target.value || ''))}
                                  sx={compactSelectFieldSx}
                                >
                                  <MenuItem value="">-</MenuItem>
                                  {MATERIAL_UNIT_OPTIONS.map((u) => (
                                    <MenuItem key={`material-unit-${u}`} value={u}>{u}</MenuItem>
                                  ))}
                                </TextField>
                              )}
                            </td>
                            <td style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px', minWidth: 520, width: 520 }}>
                              {hasMaterialData && !isView ? (
                                <TextField
                                  select
                                  size="small"
                                  value={(entry?.area || '').toString()}
                                  onChange={(e) => updateMaterialField(matIdx, 'area', String(e.target.value || ''))}
                                  sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.5, textAlign: 'center' } }}
                                >
                                  <MenuItem value="">-</MenuItem>
                                  {areaOptionsWithCurrent.map((opt) => (
                                    <MenuItem key={`material-area-${matIdx}-${opt}`} value={opt}>{opt}</MenuItem>
                                  ))}
                                </TextField>
                              ) : hasMaterialData ? (
                                <span>{resolveAreaByMode(entry?.area || area) || '-'}</span>
                              ) : (
                                <span />
                              )}
                            </td>
                                </>
                              )
                            })()}
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={1} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb', padding: '4px 6px' }}>
                            N°
                          </td>
                          <td colSpan={9} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb', padding: '4px 6px' }}>
                            ACTIVIDADES
                          </td>
                          <td colSpan={1} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb', whiteSpace: 'nowrap', fontSize: 11 }}>ID</td>
                          <td colSpan={1} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb', whiteSpace: 'nowrap', fontSize: 11 }}>IMAGEN</td>
                          <td colSpan={2} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>CANTIDAD EJECUTADA</td>
                          <td colSpan={1} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>UNIDAD</td>
                          <td colSpan={2} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>FRENTE</td>
                          <td colSpan={3} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>TIPO</td>
                          <td colSpan={4} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>DETALLE TIPO</td>
                          <td colSpan={activityDescriptionColSpan} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>DESCRIPCION</td>
                        </tr>
                        {v2ActivityDetailIndexes.map((rowIdx) => {
                          const a = activitiesForV2[rowIdx]
                          const activityText = (a?.activity || a?.description || '').toString()
                          const activityDetailId = String(a?.activity_detail_id || a?.activity_detail_code || '').trim()
                          const qty = a?.quantity ?? ''
                          const unit = (a?.unit || '').toString()
                          const executionDescription = (a?.execution_description || '').toString()
                          const activityFront = (a?.activity_front || a?.work_front || workFront || '').toString()
                          const timeClassification = (a?.time_classification || '').toString()
                          const timeReason = (a?.time_reason || '').toString()
                          const timeReasonOptions = ACTIVITY_TIME_REASON_OPTIONS[timeClassification] || []
                          const files = parseEvidenceFiles(a?.evidence_files)
                          return (
                            <tr key={`v2-brief-${rowIdx}`}>
                              <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700 }}>{rowIdx + 1}</td>
                              <td colSpan={9} style={{ border: '1px solid #111827', padding: '2px 4px', fontWeight: rowIdx < 12 ? 600 : 400 }}>
                                {activityText}
                              </td>
                              <td colSpan={1} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px' }}>
                                {a ? (isView ? (
                                  <span>{activityDetailId || '-'}</span>
                                ) : (
                                  <TextField
                                    size="small"
                                    value={activityDetailId}
                                    onChange={(e) => {
                                      const nextId = String(e.target.value || '').toUpperCase()
                                      updateAssignedField(rowIdx, 'activity_detail_id', nextId)
                                    }}
                                    placeholder="ID"
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 11, py: 0.35, textAlign: 'center' } }}
                                  />
                                )) : null}
                              </td>
                              <td colSpan={1} style={{ border: '1px solid #111827', textAlign: 'center', whiteSpace: 'nowrap', width: 56, minWidth: 56, maxWidth: 56, padding: '2px' }}>
                                {a ? (
                                  <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                                    <IconButton
                                      size="small"
                                      onClick={() => openEvidenceDialog(rowIdx)}
                                      sx={{ border: '1px solid #1565c0', borderRadius: 1, p: '4px' }}
                                    >
                                      <ImageUp size={14} color="#1565c0" />
                                    </IconButton>
                                    {files.length > 0 ? (
                                      <Box
                                        sx={{
                                          position: 'absolute',
                                          top: -6,
                                          right: -6,
                                          minWidth: 16,
                                          height: 16,
                                          px: 0.25,
                                          borderRadius: 999,
                                          bgcolor: '#d32f2f',
                                          color: '#fff',
                                          fontSize: 9,
                                          fontWeight: 700,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          border: '1px solid #fff'
                                        }}
                                      >
                                        {files.length}
                                      </Box>
                                    ) : null}
                                  </Box>
                                ) : null}
                              </td>
                              <td colSpan={activityDescriptionColSpan} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px' }}>
                                {a ? (
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={qty}
                                    disabled={isView}
                                    onChange={(e) => updateAssignedField(rowIdx, 'quantity', toNonNegativeNumber(e.target.value))}
                                    sx={compactNumberFieldSx}
                                    inputProps={{ min: 0, step: 'any' }}
                                  />
                                ) : null}
                              </td>
                              <td colSpan={1} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px' }}>
                                {a ? (isView ? (
                                  <span>{unit || '-'}</span>
                                ) : (
                                  <TextField
                                    select
                                    size="small"
                                    value={unit}
                                    onChange={(e) => updateAssignedField(rowIdx, 'unit', String(e.target.value || ''))}
                                    sx={compactSelectFieldSx}
                                  >
                                    <MenuItem value="">-</MenuItem>
                                    {UNIVERSAL_UNIT_OPTIONS.map((u) => (
                                      <MenuItem key={`asg-unit-${u}`} value={u}>{u}</MenuItem>
                                    ))}
                                  </TextField>
                                )) : null}
                              </td>
                              <td colSpan={2} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px' }}>
                                {a ? (
                                  <TextField
                                    select
                                    size="small"
                                    value={activityFront}
                                    disabled={isView}
                                    onChange={(e) => {
                                      const nextFront = String(e.target.value || '')
                                      updateAssignedField(rowIdx, 'activity_front', nextFront)
                                      updateAssignedField(rowIdx, 'work_front', nextFront)
                                    }}
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.4, textAlign: 'center' } }}
                                  >
                                    <MenuItem value="">-</MenuItem>
                                    {activityFront && !workFrontOptions.includes(activityFront) ? (
                                      <MenuItem value={activityFront}>{activityFront}</MenuItem>
                                    ) : null}
                                    {workFrontOptions.map((opt) => (
                                      <MenuItem key={`asg-front-${rowIdx}-${opt}`} value={opt}>{opt}</MenuItem>
                                    ))}
                                  </TextField>
                                ) : null}
                              </td>
                              <td colSpan={3} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px' }}>
                                {a ? (
                                  <TextField
                                    select
                                    size="small"
                                    value={timeClassification}
                                    disabled={isView}
                                    onChange={(e) => {
                                      const nextType = String(e.target.value || '')
                                      updateAssignedField(rowIdx, 'time_classification', nextType)
                                      updateAssignedField(rowIdx, 'time_reason', '')
                                    }}
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.4, textAlign: 'center' } }}
                                  >
                                    <MenuItem value="">-</MenuItem>
                                    {ACTIVITY_TIME_CLASS_OPTIONS.map((opt) => (
                                      <MenuItem key={`asg-time-class-${rowIdx}-${opt}`} value={opt}>{opt}</MenuItem>
                                    ))}
                                  </TextField>
                                ) : null}
                              </td>
                              <td colSpan={4} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px' }}>
                                {a ? (
                                  <TextField
                                    select
                                    size="small"
                                    value={timeReason}
                                    disabled={isView || !timeClassification}
                                    onChange={(e) => updateAssignedField(rowIdx, 'time_reason', String(e.target.value || ''))}
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.4, textAlign: 'center' } }}
                                  >
                                    <MenuItem value="">-</MenuItem>
                                    {timeReasonOptions.map((opt) => (
                                      <MenuItem key={`asg-time-reason-${rowIdx}-${opt}`} value={opt}>{opt}</MenuItem>
                                    ))}
                                  </TextField>
                                ) : null}
                              </td>
                              <td colSpan={2} style={{ border: '1px solid #111827', textAlign: 'center', padding: '2px 4px' }}>
                                {a ? (
                                  <TextField
                                    size="small"
                                    value={executionDescription}
                                    disabled={isView}
                                    onChange={(e) => updateAssignedField(rowIdx, 'execution_description', e.target.value)}
                                    placeholder="Descripcion"
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.4 } }}
                                  />
                                ) : null}
                              </td>
                            </tr>
                          )
                        })}
                        <tr>
                          <td colSpan={8} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>ACONTECIMIENTOS GENERALES</td>
                          <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb', width: 72, minWidth: 72, maxWidth: 72 }}>SI</td>
                          <td style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb', width: 72, minWidth: 72, maxWidth: 72 }}>NO</td>
                          <td colSpan={generalEventsCommentsColSpan} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>COMENTARIOS</td>
                        </tr>
                        {GENERAL_EVENTS_QUESTIONS.map((question, idx) => (
                          <tr key={`v2-event-${idx}`}>
                            <td colSpan={8} style={{ border: '1px solid #111827', padding: '4px 6px', fontWeight: 600 }}>{question}</td>
                            <td style={{ border: '1px solid #111827', textAlign: 'center', width: 72, minWidth: 72, maxWidth: 72 }}>
                              <Radio
                                size="small"
                                checked={generalEventsAnswers[idx] === 'si'}
                                onChange={() => setGeneralEventsAnswers((prev) => prev.map((v, i) => (i === idx ? 'si' : v)))}
                                disabled={isView}
                              />
                            </td>
                            <td style={{ border: '1px solid #111827', textAlign: 'center', width: 72, minWidth: 72, maxWidth: 72 }}>
                              <Radio
                                size="small"
                                checked={generalEventsAnswers[idx] === 'no'}
                                onChange={() => setGeneralEventsAnswers((prev) => prev.map((v, i) => (i === idx ? 'no' : v)))}
                                disabled={isView}
                              />
                            </td>
                            <td colSpan={generalEventsCommentsColSpan} style={{ border: '1px solid #111827', padding: '2px 4px' }}>
                              <TextField
                                size="small"
                                value={generalEventsComments[idx] || ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setGeneralEventsComments((prev) => prev.map((x, i) => (i === idx ? v : x)))
                                }}
                                placeholder="Comentario"
                                disabled={isView}
                                sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 12, py: 0.6 } }}
                              />
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={11} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>OBSERVACIONES</td>
                          <td colSpan={4} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>FIRMA</td>
                          <td colSpan={4} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>FIRMA</td>
                          <td colSpan={4} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>FIRMA</td>
                          <td colSpan={finalSignatureColSpan} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#e5e7eb' }}>FIRMA</td>
                        </tr>
                        <tr>
                          <td colSpan={11} style={{ border: '1px solid #111827', padding: '6px 8px', textAlign: 'center', minHeight: 52 }}>
                            <TextField
                              size="small"
                              value={restrictions || ''}
                              onChange={(e) => setRestrictions(e.target.value)}
                              placeholder="Sin observaciones"
                              disabled={isView}
                              multiline
                              minRows={2}
                              sx={{ width: '75%', '& .MuiInputBase-input': { fontSize: 12, py: 0.6 } }}
                            />
                          </td>
                          <td colSpan={4} style={{ border: '1px solid #111827' }} />
                          <td colSpan={4} style={{ border: '1px solid #111827' }} />
                          <td colSpan={4} style={{ border: '1px solid #111827' }} />
                          <td colSpan={finalSignatureColSpan} style={{ border: '1px solid #111827' }} />
                        </tr>
                        <tr>
                          <td colSpan={11} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#f3f4f6' }} />
                          <td colSpan={4} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#f3f4f6' }}>SUPERVISOR</td>
                          <td colSpan={4} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#f3f4f6' }}>JEFE TERRENO</td>
                          <td colSpan={4} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#f3f4f6' }}>JEJ</td>
                          <td colSpan={finalSignatureColSpan} style={{ border: '1px solid #111827', textAlign: 'center', fontWeight: 700, background: '#f3f4f6' }}>ANTUCOYA</td>
                        </tr>
                      </tbody>
                    </table>
                  )
                })()
                ) : (
                  <Box sx={{ minHeight: '45vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">No se pudo preparar el reporte. Cierre e intente nuevamente.</Typography>
                    <Button variant="outlined" size="small" onClick={closeReportModal}>Cerrar</Button>
                  </Box>
                )}
              </Box>
              </>
              ) : (
                <Box sx={{ mt: 2, p: 2, border: '1px solid #e2e8f0', borderRadius: 1, bgcolor: '#f8fafc' }}>
                  <Typography variant="body2" sx={{ color: colors.gray4 }}>
                    Seleccione una cuadrilla para habilitar la estructura.
                  </Typography>
                </Box>
              )
            ) : null}
            <Box sx={{ display: reportDesignVersion === 'V2' ? 'none' : 'block' }}>
            {!(isView || editMode || (Array.isArray(reportCrewIds) && reportCrewIds.length > 0)) ? (
              <Box sx={{ mt: 2, p: 2, border: '1px solid #e2e8f0', borderRadius: 1, bgcolor: '#f8fafc' }}>
                <Typography variant="body2" sx={{ color: colors.gray4 }}>
                  Seleccione una cuadrilla para habilitar la estructura.
                </Typography>
              </Box>
            ) : (
            <>
            {/* Buscador de actividades (solo admin/otros roles no-user) */}
            {!isUserRole && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2">Buscar actividades y asignar a cuadrillas</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1, mb: 1 }}>
                  <TextField
                    size="small"
                    label="Buscar actividad"
                    value={searchQuery}
                    onChange={(e) => {
                      const v = e.target.value
                      setSearchQuery(v)
                      if (searchTimeout.current) clearTimeout(searchTimeout.current)
                      if (!v || !v.trim()) {
                        setActivityResults([])
                        setLoadingActivities(false)
                        return
                      }
                      searchTimeout.current = window.setTimeout(() => fetchActivities(v), 300)
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button size="small" variant="outlined" onClick={() => { if (searchTimeout.current) clearTimeout(searchTimeout.current); fetchActivities(searchQuery) }}>Buscar</Button>
                </Stack>

                <List>
                  {activityResults.map((a) => {
                    const inputs = activityInputs[String(a.id)] || {}
                    return (
                      <ListItem key={a.id} sx={{ alignItems: 'flex-start', py: 1 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '220px 140px 1fr 120px 100px 140px' }, gap: 1, width: '100%', alignItems: 'center' }}>
                          <TextField size="small" label="Item ID" value={inputs.item_id ?? a.item_id ?? ''} onChange={(e) => setActivityInputs(prev => ({ ...prev, [String(a.id)]: { ...(prev[String(a.id)] || {}), item_id: e.target.value } }))} />
                          <TextField size="small" label="Sub-ID" value={inputs.sub_id ?? a.sub_id ?? ''} onChange={(e) => setActivityInputs(prev => ({ ...prev, [String(a.id)]: { ...(prev[String(a.id)] || {}), sub_id: e.target.value } }))} />
                          <Box>
                            <Typography variant="body1" sx={{ fontWeight: 700 }}>{a.activity}</Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>{a.area || ''} {a.package ? `— Paq. ${a.package}` : ''}</Typography>
                          </Box>
                          <TextField size="small" label="Cantidad" value={inputs.quantity ?? a.quantity ?? ''} onChange={(e) => setActivityInputs(prev => ({ ...prev, [String(a.id)]: { ...(prev[String(a.id)] || {}), quantity: e.target.value } }))} sx={{ width: 100 }} />
                          <TextField size="small" label="Unidad" value={inputs.unit ?? a.unit ?? ''} onChange={(e) => setActivityInputs(prev => ({ ...prev, [String(a.id)]: { ...(prev[String(a.id)] || {}), unit: e.target.value } }))} sx={{ width: 100 }} />
                          <TextField size="small" label="Disciplina" value={inputs.discipline ?? a.discipline ?? ''} onChange={(e) => setActivityInputs(prev => ({ ...prev, [String(a.id)]: { ...(prev[String(a.id)] || {}), discipline: e.target.value } }))} sx={{ width: 140 }} />
                          <TextField size="small" label="Descripción (Programa)" value={a.description ?? ''} sx={{ gridColumn: '1 / -1' }} disabled />
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <TextField select size="small" value={selectedCrewFor[String(a.id)] || ''} onChange={(e) => setSelectedCrewFor((m) => ({ ...m, [String(a.id)]: e.target.value }))} sx={{ minWidth: 220 }}>
                              <MenuItem value="">Seleccione cuadrilla</MenuItem>
                              {crews.map((c) => (<MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>))}
                            </TextField>
                            <Button size="small" variant="contained" onClick={() => assignActivityToCrew(a)}>Asignar</Button>
                          </Box>
                        </Box>
                      </ListItem>
                    )
                  })}
                </List>
              </Box>
            )}

              <Box sx={{ mt: 1 }}>
                <Typography align="center" sx={sectionTitleSx}>Tareas realizadas</Typography>
                <Box sx={{ border: '1px solid #ddd', mt: 1 }}>
                  {(() => {
                    const showActionsCol = !isView && !isUserRole
                    const gridTemplate = showActionsCol
                      ? '1.2fr 0.85fr 0.75fr 0.75fr 1.7fr 1.6fr 0.65fr 0.85fr 0.8fr 0.85fr 0.45fr'
                      : '1.2fr 0.85fr 0.75fr 0.75fr 1.7fr 1.6fr 0.65fr 0.85fr 0.8fr 0.85fr'

                    return (
                      <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pt: 1 }}> 
                    <Box />
                    <Box>
                      {!isUserRole && (
                        <Button size="small" variant="outlined" onClick={async () => { setProgramDialogOpen(true); await fetchProgramActivities() }}>Agregar desde Programa</Button>
                      )}
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: gridTemplate,
                      alignItems: 'center',
                      width: '100%',
                      bgcolor: '#f5f5f5',
                      pl: 2,
                      pr: 0,
                      py: 0.75,
                      fontSize: 13,
                      fontWeight: 700,
                      columnGap: 0.75,
                      boxSizing: 'border-box'
                    }}
                  >
                    <Box>Actividad</Box>
                    <Box sx={{ textAlign: 'center' }}>ID</Box>
                    <Box>Área</Box>
                    <Box sx={{ textAlign: 'center' }}>Paquete</Box>
                    <Box>Descripción de la actividad</Box>
                    <Box>Descripción adicional</Box>
                    <Box sx={{ textAlign: 'center' }}>Unidad</Box>
                    <Box sx={{ textAlign: 'center' }}>Cantidad Programa</Box>
                    <Box sx={{ textAlign: 'center' }}>Cantidad</Box>
                    <Box sx={{ textAlign: 'center' }}>Imagenes</Box>
                    {showActionsCol ? <Box /> : null}
                  </Box>
                  {assignedActivities.map((asg, i) => (
                    <Box
                      key={`${asg.activityId}-${asg.crewId}-${i}`}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: gridTemplate,
                        alignItems: 'center',
                        width: '100%',
                        pl: 2,
                        pr: 0,
                        py: 1,
                        borderTop: '1px solid #eee',
                        mb: 1,
                        columnGap: 0.75,
                        fontSize: 13,
                        boxSizing: 'border-box'
                      }}
                    >
                      <Box>
                        {`Actividad ${i + 1}`}
                        {(() => {
                          const rawId = String(asg.activityId || '').trim()
                          if (!rawId) return null
                          const shortId = rawId.split('-')[0] || rawId
                          return <span style={{ marginLeft: 6, color: '#94a3b8' }}>{`(${shortId})`}</span>
                        })()}
                      </Box>
                      <Box sx={{ textAlign: 'center' }}>
                        {(() => {
                          const id = asg.item_id ?? asg.id ?? asg.activityId
                          const sub = asg.sub_id
                          return (
                            <>
                              {id || '-'}
                              {sub ? <span style={{ marginLeft: 6, color: '#94a3b8' }}>{`(${sub})`}</span> : null}
                            </>
                          )
                        })()}
                      </Box>
                      <Box>
                        {asg.source === 'program' || isView ? (
                          asg.area || '-'
                        ) : (
                          <TextField
                            size="small"
                            value={asg.area ?? ''}
                            onChange={(e) => updateAssignedField(i, 'area', e.target.value)}
                            sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 13, padding: '6px 8px' } }}
                            disabled={isView}
                          />
                        )}
                      </Box>
                      <Box sx={{ textAlign: 'center' }}>
                        {asg.source === 'program' || isView ? (
                          asg.package || '-'
                        ) : (
                          <TextField
                            size="small"
                            value={asg.package ?? ''}
                            onChange={(e) => updateAssignedField(i, 'package', e.target.value)}
                            sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 13, padding: '6px 8px', textAlign: 'center' } }}
                            disabled={isView}
                          />
                        )}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        {asg.source === 'program' || isView ? (
                          <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(asg.activity ? `${asg.activity} - ` : '') + (asg.description || '-')}
                          </Box>
                        ) : (
                          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                            <TextField
                              size="small"
                              value={asg.activity ?? ''}
                              onChange={(e) => updateAssignedField(i, 'activity', e.target.value)}
                              placeholder="Actividad"
                              sx={{ '& .MuiInputBase-input': { fontSize: 12, padding: '6px 8px' } }}
                              disabled={isView}
                            />
                            <TextField
                              size="small"
                              value={asg.description ?? ''}
                              onChange={(e) => updateAssignedField(i, 'description', e.target.value)}
                              placeholder="Descripción"
                              sx={{ '& .MuiInputBase-input': { fontSize: 12, padding: '6px 8px' } }}
                              disabled={isView}
                            />
                          </Box>
                        )}
                      </Box>
                      <Box>
                        <TextField
                          size="small"
                          value={asg.observations ?? ''}
                          onChange={(e) => updateAssignedField(i, 'observations', e.target.value)}
                          sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 13, padding: '6px 8px' } }}
                          disabled={isView}
                        />
                      </Box>
                      <Box sx={{ textAlign: 'center' }}>
                        {asg.source === 'program' || isView ? (
                          (asg.unit ?? '-') || '-'
                        ) : (
                          <TextField
                            size="small"
                            value={asg.unit ?? ''}
                            onChange={(e) => updateAssignedField(i, 'unit', e.target.value)}
                            sx={compactSelectFieldSx}
                            disabled={isView}
                          />
                        )}
                      </Box>
                      <Box sx={{ textAlign: 'center' }}>
                        {asg.source === 'program' || isView ? (
                          toNonNegativeNumber(asg.program_quantity ?? 0)
                        ) : (
                          <TextField
                            size="small"
                            type="number"
                            value={asg.program_quantity ?? 0}
                            onChange={(e) => updateAssignedField(i, 'program_quantity', toNonNegativeNumber(e.target.value))}
                            inputProps={{ min: 0, step: 'any' }}
                            sx={compactNumberFieldSx}
                            disabled={isView}
                          />
                        )}
                      </Box>
                      <Box>
                        <TextField
                          size="small"
                          type="number"
                          value={asg.quantity ?? 0}
                          onChange={(e) => {
                            const max = toNonNegativeNumber(asg.program_quantity ?? 0)
                            const next = toNonNegativeNumber(e.target.value)
                            updateAssignedField(i, 'quantity', max > 0 && next > max ? max : next)
                          }}
                          inputProps={{ min: 0, step: 'any' }}
                          sx={compactNumberFieldSx}
                          disabled={isView}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        {(() => {
                          const files = parseEvidenceFiles(asg.evidence_files)
                          const rowKey = evidenceRowKey(asg, i)
                          const pending = pendingEvidenceFiles[rowKey] || []
                          const count = files.length + pending.length
                          const names = [
                            ...files.map((f) => f?.name).filter(Boolean),
                            ...pending.map((x) => x?.file?.name).filter(Boolean)
                          ]
                          const rowBusy = !!uploadingEvidence[`${asg.activityId}-${asg.crewId || i}`]
                          return (
                            <Tooltip
                              title={names.length > 0 ? names.join('\n') : 'Sin imagenes'}
                              placement="top"
                              arrow
                            >
                              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                                <IconButton
                                  size="small"
                                  onClick={() => !isView && openEvidenceDialog(i)}
                                  disabled={isView || rowBusy}
                                  sx={{ border: '1px solid #1565c0', width: 34, height: 34, borderRadius: 1.5 }}
                                >
                                  <ImageUp size={16} color="#1565c0" />
                                </IconButton>
                                {count > 0 ? (
                                  <Box
                                    sx={{
                                      position: 'absolute',
                                      top: -8,
                                      right: -8,
                                      minWidth: 20,
                                      height: 20,
                                      px: 0.5,
                                      borderRadius: 999,
                                      bgcolor: '#d32f2f',
                                      color: '#fff',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      border: '1px solid #fff'
                                    }}
                                  >
                                    {count}
                                  </Box>
                                ) : null}
                              </Box>
                            </Tooltip>
                          )
                        })()}
                      </Box>
                      {showActionsCol ? (
                        <Box>
                          <Button size="small" color="error" onClick={() => removeAssigned(i)}>Eliminar</Button>
                        </Box>
                      ) : null}
                    </Box>
                  ))}
                      </>
                    )
                  })()}
                  {/* No empty filler rows — show only assignedActivities */}
                </Box>
              </Box>
              {/* Personal: integrantes de la cuadrilla (colaboradores) - mostrar sólo si hay actividades */}
              {activityCount > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography align="center" sx={sectionTitleSx}>PERSONAL</Typography>
                  <Box sx={{ overflowX: 'auto', border: '1px solid #ddd' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: 40 }}>N°</th>
                          <th style={{ ...thStyle, minWidth: 120 }}>Cargo</th>
                          <th style={{ ...thStyle, minWidth: 260 }}>Nombre Trabajador</th>
                          {Array.from({ length: activityCount }).map((_, idx) => (
                            <th key={idx} style={activityThStyle}>{`Act. ${idx + 1} [HH]`}</th>
                          ))}
                          <th style={{ ...thStyle, width: 90 }}>Total [HH]</th>
                        </tr>
                      </thead>
                      <tbody>
                        {personnelRows && personnelRows.length > 0 ? (
                          personnelRows.map((row, rowIdx) => {
                            const personId = String(row.personId || `person-${rowIdx}`)
                            const hours = personHours[personId] || new Array(activityCount).fill(0)
                            if (hours.length < activityCount) while (hours.length < activityCount) hours.push(0)
                            const total = hours.reduce((s, v) => s + (Number(v) || 0), 0)
                            const workerKey = normalizeWorkerKey(row, personId)
                            const totalAcrossDay = workerKey ? Number(crossReportDayHoursByWorkerKey.get(workerKey) || 0) : total
                            const totalForStatus = Number(totalAcrossDay || 0)
                            const exceededDayLimit = totalForStatus > STANDARD_PERSON_HOURS + 0.000001
                            const completedDayLimit = Math.abs(totalForStatus - STANDARD_PERSON_HOURS) < 0.000001
                            const belongsToMultipleCrews = workerKey ? Number(workerCrewCountByKey.get(workerKey) || 0) > 1 : false
                            const workerTextColor = exceededDayLimit
                              ? '#b91c1c'
                              : completedDayLimit
                                ? '#15803d'
                                : '#f97316'
                            const workerCellBg = belongsToMultipleCrews ? '#dbeafe' : undefined
                            const workerTitle = belongsToMultipleCrews
                              ? `Colaborador en más de una cuadrilla. Total diario declarado en reportes del ${reportDate}: ${totalForStatus.toFixed(1)} h`
                              : `Total diario declarado en reportes del ${reportDate}: ${totalForStatus.toFixed(1)} h`
                            return (
                              <tr key={personId}>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>{rowIdx + 1}</td>
                                <td style={tdStyle}>{row?.position || ''}</td>
                                <td
                                  style={{
                                    ...tdStyle,
                                    color: workerTextColor,
                                    fontWeight: 700,
                                    background: workerCellBg
                                  }}
                                  title={workerTitle}
                                >
                                  {(() => {
                                    const name = row?.name || ''
                                    const crewLabel = row?.crewName || ''
                                    return (
                                      <>
                                        {name}
                                        {crewLabel ? (
                                          <span style={{ marginLeft: 6, color: '#94a3b8' }}>{`(${crewLabel})`}</span>
                                        ) : null}
                                      </>
                                    )
                                  })()}
                                </td>
                                {Array.from({ length: activityCount }).map((__, actIdx) => (
                                  <td key={actIdx} style={activityTdStyle}>
                                    <TextField
                                      size="small"
                                      value={hours[actIdx] ?? ''}
                                      onChange={(e) => updatePersonHour(personId, actIdx, e.target.value)}
                                      disabled={isView}
                                      sx={{
                                        width: 70,
                                        '& .MuiInputBase-input': { fontSize: 13, padding: '6px 8px', textAlign: 'center' }
                                      }}
                                    />
                                  </td>
                                ))}
                                <td
                                  style={{
                                    ...tdStyle,
                                    textAlign: 'center',
                                    fontWeight: 700,
                                    color: workerTextColor,
                                    background: exceededDayLimit ? '#fee2e2' : undefined
                                  }}
                                  title={workerTitle}
                                >
                                  {total}
                                </td>
                              </tr>
                            )
                          })
                        ) : null}
                      </tbody>
                    </table>
                  </Box>
                </Box>
              )}
              {/* EQUIPOS: maquinaria usada en las actividades (solo si hay actividades) */}
              {activityCount > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography align="center" sx={sectionTitleSx}>EQUIPOS</Typography>
                  <Box sx={{ overflowX: 'auto', border: '1px solid #ddd' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1000 }}>
                      <thead>
                        <tr style={{ background: '#f5f5f5', fontWeight: 700 }}>
                          <th style={{ border: '1px solid #ccc', padding: '6px 8px', width: 40 }}>N°</th>
                          <th style={{ border: '1px solid #ccc', padding: '6px 8px', minWidth: 140 }}>Código equipo</th>
                          <th style={{ border: '1px solid #ccc', padding: '6px 8px', minWidth: 260 }}>Descripción equipos</th>
                          <th style={{ border: '1px solid #ccc', padding: '6px 8px', minWidth: 300 }}>Descripción Actividad</th>
                          {Array.from({ length: activityCount }).map((_, idx) => (
                            <th key={idx} style={activityThStyle}>{`Act. ${idx + 1} [HH]`}</th>
                          ))}
                          <th style={{ border: '1px solid #ccc', padding: '6px 8px', width: 90, textAlign: 'center' }}>Total [HH]</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: supportRowsCount }).map((_, rowIdx) => {
                          const entryId = `equip-${rowIdx}`
                          const entry = equipmentEntries && equipmentEntries[rowIdx]
                          const equipmentOptions = managementEquipmentCatalog
                            .filter((item) => item.is_operational !== false)
                            .map((item) => ({
                              value: `${String(item.equipment_name || '').trim()}|||${String(item.patent || '').trim()}`,
                              label: String(item.equipment_name || '').trim(),
                              patent: String(item.patent || '').trim(),
                              isOperational: item.is_operational !== false
                            }))
                            .filter((item) => item.label)
                          const currentName = String(entry?.description || '').trim()
                          const currentPatent = String(entry?.code || '').trim()
                          const currentSelectValue = currentName ? `${currentName}|||${currentPatent}` : ''
                          const hasCurrentInOptions = equipmentOptions.some((opt) => opt.value === currentSelectValue)
                          const currentIsKnownNonOperational = isKnownNonOperationalEquipment({ description: currentName, code: currentPatent })
                          const machineKey = normalizeMachineKey(entry || {})
                          const machineTotalAcrossDay = machineKey ? Number(crossReportMachineDayHoursByKey.get(machineKey) || 0) : 0
                          const machineInMultipleReports = machineKey ? Number(machineReportCountByKey.get(machineKey) || 0) > 1 : false
                          const machineTextColor = machineTotalAcrossDay > STANDARD_MACHINE_HOURS + 0.000001
                            ? '#b91c1c'
                            : Math.abs(machineTotalAcrossDay - STANDARD_MACHINE_HOURS) < 0.000001
                              ? '#15803d'
                              : '#0f172a'
                          const machineCellBg = machineInMultipleReports ? '#dbeafe' : undefined
                          const machineTitle = machineInMultipleReports
                            ? `Maquinaria usada en más de un reporte. Total diario declarado el ${reportDate}: ${machineTotalAcrossDay.toFixed(1)} h`
                            : `Total diario declarado el ${reportDate}: ${machineTotalAcrossDay.toFixed(1)} h`
                          const hours = equipmentHours[entryId] || new Array(activityCount).fill(0)
                          if (hours.length < activityCount) while (hours.length < activityCount) hours.push(0)
                          const total = hours.reduce((s, v) => s + (Number(v) || 0), 0)
                          return (
                            <tr key={entryId}>
                              <td style={{ border: '1px solid #eee', padding: '6px 8px', textAlign: 'center' }}>{rowIdx + 1}</td>
                              <td style={{ border: '1px solid #eee', padding: '6px 8px', color: machineTextColor, background: machineCellBg }} title={machineTitle}>
                                <span style={{ color: 'inherit', fontSize: 13, fontWeight: 500 }}>
                                  {(entry?.code || '').toString()}
                                </span>
                              </td>
                              <td style={{ border: '1px solid #eee', padding: '6px 8px' }}>
                                {isView ? (
                                  <span style={{ display: 'block', color: '#111827', fontSize: 13, fontWeight: 500, padding: '4px 6px' }}>
                                    {(entry?.description || '').toString() || '-'}
                                  </span>
                                ) : (
                                  <TextField
                                    select
                                    size="small"
                                    value={currentSelectValue}
                                    onChange={(e) => {
                                      const raw = String(e.target.value || '')
                                      const [namePart, patentPart] = raw.split('|||')
                                      updateEquipmentField(rowIdx, 'description', String(namePart || '').trim())
                                      updateEquipmentField(rowIdx, 'code', String(patentPart || '').trim())
                                    }}
                                    sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 13, padding: '6px 8px' } }}
                                  >
                                    <MenuItem value=""><em>SELECCIONAR EQUIPO</em></MenuItem>
                                    {!hasCurrentInOptions && currentName ? (
                                      <MenuItem value={currentSelectValue} disabled={currentIsKnownNonOperational}>
                                        {currentName.toUpperCase()}{currentPatent ? ` (${currentPatent.toUpperCase()})` : ''}
                                        {currentIsKnownNonOperational ? ' (NO OPERATIVA)' : ''}
                                      </MenuItem>
                                    ) : null}
                                    {equipmentOptions.map((opt) => {
                                      const [optName, optPatent] = String(opt.value || '').split('|||')
                                      const optKey = normalizeMachineKey({ description: optName, code: optPatent })
                                      const optUsedByOther = Boolean(optKey && usedMachineKeysByOtherReports.has(optKey))
                                      const isCurrent = opt.value === currentSelectValue
                                      return (
                                      <MenuItem key={`equip-catalog-grid-${rowIdx}-${opt.value}`} value={opt.value}>
                                        {opt.label.toUpperCase()}{opt.patent ? ` (${opt.patent.toUpperCase()})` : ''}
                                        {optUsedByOther && !isCurrent ? ' (USADO EN OTRO REPORTE)' : ''}
                                      </MenuItem>
                                    )})}
                                  </TextField>
                                )}
                              </td>
                              <td style={{ border: '1px solid #eee', padding: '6px 8px' }}>
                                <TextField size="small" value={entry?.activity_desc || ''} onChange={(e) => updateEquipmentField(rowIdx, 'activity_desc', e.target.value)} sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 13, padding: '6px 8px' } }} disabled={isView} />
                              </td>
                                {Array.from({ length: activityCount }).map((__, actIdx) => (
                                  <td key={actIdx} style={{ border: '1px solid #eee', padding: '4px 6px', textAlign: 'center' }}>
                                  <TextField size="small" value={hours[actIdx] ?? ''} onChange={(e) => updateEquipmentHour(entryId, actIdx, e.target.value)} sx={{ width: 70, '& .MuiInputBase-input': { fontSize: 13, padding: '6px 8px', textAlign: 'center' } }} disabled={isView} />
                                  </td>
                                ))}
                              <td style={{ border: '1px solid #eee', padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: machineTextColor, background: machineTotalAcrossDay > STANDARD_MACHINE_HOURS + 0.000001 ? '#fee2e2' : undefined }} title={machineTitle}>{total}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </Box>
                </Box>
              )}
              {/* OBSERVACIONES - Temas de preocupación o restricciones a las tareas (dinámico por actividad) */}
              {activityCount > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography align="center" sx={sectionTitleSx}>OBSERVACIONES - TEMAS DE PREOCUPACIÓN O RESTRICCIONES A LAS TAREAS</Typography>
                  <Box style={tableContainerStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: 40 }}>N°</th>
                          <th style={{ ...thStyle, minWidth: 160, textAlign: 'left' }}>Actividad</th>
                          <th style={{ ...thStyle }}>Observaciones / Restricciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignedActivities && assignedActivities.length > 0 ? (
                          assignedActivities.map((asg, idx) => {
                            const aid = String(asg.activityId || `act-${idx}`)
                            const value = activityObservations[aid] || ''
                            return (
                              <tr key={aid}>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>{idx + 1}</td>
                                <td style={tdStyle}>{(asg.activity ? `${asg.activity} — ` : '') + (asg.description || '-')}</td>
                                <td style={tdStyle}>
                                  <TextField size="small" multiline minRows={2} value={value} onChange={(e) => updateActivityObservation(aid, e.target.value)} sx={{ width: '100%' }} disabled={isView} />
                                </td>
                              </tr>
                            )
                          })
                        ) : null}
                      </tbody>
                    </table>
                  </Box>
                </Box>
              )}
            </>
            )}
            </Box>
            {/* Lower form section removed per request (Área de trabajo, Inicio, Término, Actividades realizadas, Restricciones, Personal participante) */}
            </Box>
            )}
            </DialogContent>

            <DialogActions>
              {isView ? <Button variant="outlined" onClick={handleExportPdf} disabled>Exportar PDF</Button> : null}
              {isView ? <Button variant="outlined" onClick={() => setExportVersionDialogOpen(true)}>Exportar Excel</Button> : null}
              <Button variant={isView ? 'outlined' : 'text'} onClick={requestCloseReportModal}>{isView ? 'Cerrar' : 'Cancelar'}</Button>
              {!isView && !isReadOnlyRole ? <Button variant="contained" onClick={handleSave} disabled={saving || !hasUnsavedReportChanges || (!editMode && !!selectedReport)}>Guardar</Button> : null}
            </DialogActions>
          </Dialog>

          <Dialog open={pendingCrewsModalOpen} onClose={() => setPendingCrewsModalOpen(false)} fullWidth maxWidth="md">
            <DialogTitle>
              Cuadrillas pendientes por declarar {pendingCrewsModalDate ? `(${pendingCrewsModalDate})` : ''}
            </DialogTitle>
            <DialogContent>
              {(() => {
                const info = pendingCrewsByDate.get(String(pendingCrewsModalDate || ''))
                const rows = info?.pendingCrews || []
                if (rows.length === 0) {
                  return <Typography sx={{ color: '#64748b' }}>No hay cuadrillas pendientes para esta fecha.</Typography>
                }
                return (
                  <Box sx={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                      <thead>
                        <tr>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px', background: '#f8fafc', textAlign: 'left' }}>Cuadrilla</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px', background: '#f8fafc', textAlign: 'left' }}>Especialidad</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px', background: '#f8fafc', textAlign: 'left' }}>Supervisor</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px', background: '#f8fafc', textAlign: 'left' }}>Capataz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((crew) => (
                          <tr key={`pending-crew-${crew.id}`}>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>{String(crew.name || '').toUpperCase() || '-'}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>{String(crew.specialty || '-').toUpperCase()}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>{String(crew.supervisor || '-').toUpperCase()}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>{String(crew.capataz || '-').toUpperCase()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                )
              })()}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPendingCrewsModalOpen(false)}>Cerrar</Button>
            </DialogActions>
          </Dialog>

          <Dialog open={confirmCloseReportOpen} onClose={() => setConfirmCloseReportOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>¿Cerrar sin guardar?</DialogTitle>
            <DialogContent>
              <Typography sx={{ color: '#475569', fontSize: 14 }}>
                Si cierras ahora, perderás los cambios realizados en este reporte.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button variant="outlined" onClick={() => setConfirmCloseReportOpen(false)}>Volver</Button>
              <Button
                color="error"
                variant="contained"
                onClick={() => {
                  setConfirmCloseReportOpen(false)
                  closeReportModal('manual')
                }}
              >
                Cerrar y perder cambios
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={exportVersionDialogOpen} onClose={() => setExportVersionDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Exportar archivo Excel</DialogTitle>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button variant="outlined" onClick={() => setExportVersionDialogOpen(false)}>Cancelar</Button>
              <Button
                variant="outlined"
                disabled
                onClick={async () => {
                  setExportVersionDialogOpen(false)
                  await handleExportExcel('V1')
                }}
              >
                V1
              </Button>
              <Button
                variant="contained"
                onClick={async () => {
                  setExportVersionDialogOpen(false)
                  await handleExportExcel('V2')
                }}
              >
                V2
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={hourCellDialogOpen}
            onClose={(_event, reason) => {
              if (reason === 'backdropClick') return
              closeHourCellDialog()
            }}
            fullWidth
            maxWidth="xs"
            PaperProps={{
              sx: {
                borderRadius: 3,
                border: '1px solid #dbe3ee',
                boxShadow: '0 18px 45px rgba(15, 45, 92, 0.16)'
              }
            }}
          >
            <DialogTitle sx={{ pb: 1, color: '#0f2d5c', fontWeight: 800 }}>
              {hourCellActivityIndex < 0 ? 'Horas Extras' : `Hora Actividad ${hourCellActivityIndex + 1}`}
              {hourCellPersonName ? ` - ${hourCellPersonName}` : ''}
            </DialogTitle>
            <DialogContent sx={{ pt: 0.75 }}>
              <Box sx={{ pt: 1 }}>
                <Box
                  sx={{
                    border: '1px solid #dbe3ee',
                    borderRadius: 2,
                    p: 1.5,
                    bgcolor: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#475569', fontWeight: 700 }}>
                    {hourCellActivityIndex < 0 ? 'Horas Extras' : `Actividad ${hourCellActivityIndex + 1}`}
                  </Typography>
                <TextField
                  type="number"
                  size="small"
                  label="Horas"
                  value={hourCellDraft}
                  onChange={(e) => {
                    const raw = String(e.target.value || '').replace(',', '.')
                    if (raw === '') {
                      setHourCellDraft('')
                      return
                    }
                    const next = Number(raw)
                    if (Number.isNaN(next)) return
                    const clamped = Math.min(MAX_PERSON_HOURS_WITH_OVERTIME, Math.max(0, next))
                    setHourCellDraft(String(clamped))
                  }}
                  inputProps={{ min: 0, max: MAX_PERSON_HOURS_WITH_OVERTIME, step: '0.5', inputMode: 'decimal' }}
                  sx={{
                    width: 128,
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#ffffff',
                      borderRadius: 1.5
                    },
                    '& input': {
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 22,
                      py: 0.8
                    }
                  }}
                />
                </Box>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 1 }}>
                  Jornada completa: 10 h. Máximo con horas extras: 15 h.
                </Typography>
                <Box sx={{ mt: 1.75, p: 1.25, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#ffffff' }}>
                  <Typography variant="caption" sx={{ color: '#334155', fontWeight: 700, display: 'block', mb: 0.5 }}>Aplicar a</Typography>
                  <RadioGroup
                    value={hourApplyMode}
                    onChange={(e) => setHourApplyMode(String(e.target.value) as 'single' | 'all' | 'selected')}
                  >
                    <FormControlLabel value="single" control={<Radio size="small" />} label="Solo este colaborador" sx={{ my: 0.15 }} />
                    <FormControlLabel value="all" control={<Radio size="small" />} label="Replicar a todos los colaboradores" sx={{ my: 0.15 }} />
                    <FormControlLabel value="selected" control={<Radio size="small" />} label="Elegir colaboradores" sx={{ my: 0.15 }} />
                  </RadioGroup>
                </Box>
                {hourApplyMode === 'selected' ? (
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="Colaboradores"
                    SelectProps={{
                      multiple: true,
                      renderValue: (selected) => {
                        const ids = Array.isArray(selected) ? selected.map(String) : [String(selected)]
                        const names = ids
                          .map((id) => (personnelRows || []).find((r: any) => String(r?.personId || '') === String(id))?.name)
                          .filter(Boolean)
                        return names.join(', ')
                      }
                    }}
                    value={hourApplySelectedIds}
                    onChange={(e) => {
                      const value = e.target.value
                      const ids = Array.isArray(value) ? value.map(String) : [String(value)]
                      setHourApplySelectedIds(ids.filter(Boolean))
                    }}
                    sx={{ mt: 1.25 }}
                  >
                    {(personnelRows || []).map((row: any) => (
                      <MenuItem key={`hour-target-${row.personId}`} value={String(row.personId)}>
                        <Checkbox checked={hourApplySelectedIds.includes(String(row.personId))} size="small" />
                        {String(row?.name || row?.personId || '').trim() || String(row?.personId || '')}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.75 }}>
              <Button onClick={closeHourCellDialog}>Cancelar</Button>
              <Button variant="contained" onClick={saveHourCellDialog}>Aplicar</Button>
            </DialogActions>
          </Dialog>

	          <Dialog
	            open={equipHourCellDialogOpen}
	            onClose={(_event, reason) => {
	              if (reason === 'backdropClick') return
	              closeEquipHourCellDialog()
	            }}
	            fullWidth
	            maxWidth="xs"
	            PaperProps={{
	              sx: {
	                borderRadius: 3,
	                border: '1px solid #dbe3ee',
	                boxShadow: '0 18px 45px rgba(15, 45, 92, 0.16)'
	              }
	            }}
	          >
	            <DialogTitle sx={{ pb: 1, color: '#0f2d5c', fontWeight: 800 }}>
	              Hora Maquinaria - Actividad {equipHourCellActivityIndex + 1}
	            </DialogTitle>
	            <DialogContent sx={{ pt: 0.75 }}>
	              <Box sx={{ pt: 1 }}>
	                <Box
	                  sx={{
	                    border: '1px solid #dbe3ee',
	                    borderRadius: 2,
	                    p: 1.5,
	                    bgcolor: '#f8fafc',
	                    display: 'flex',
	                    flexDirection: 'column',
	                    alignItems: 'center',
	                    gap: 1
	                  }}
	                >
	                  <Typography variant="caption" sx={{ color: '#475569', fontWeight: 700 }}>
	                    Actividad {equipHourCellActivityIndex + 1}
	                  </Typography>
	                  <TextField
	                    type="number"
	                    size="small"
	                    label="Horas"
	                    value={equipHourCellDraft}
	                    onChange={(e) => {
	                      const raw = String(e.target.value || '').replace(',', '.')
	                      if (raw === '') {
	                        setEquipHourCellDraft('')
	                        return
	                      }
	                      const next = Number(raw)
	                      if (Number.isNaN(next)) return
	                      const clamped = Math.min(MAX_MACHINE_HOURS_WITH_OVERTIME, Math.max(0, next))
	                      setEquipHourCellDraft(String(clamped))
	                    }}
	                    inputProps={{ min: 0, max: MAX_MACHINE_HOURS_WITH_OVERTIME, step: '0.5', inputMode: 'decimal' }}
	                    sx={{
	                      width: 128,
	                      '& .MuiOutlinedInput-root': {
	                        bgcolor: '#ffffff',
	                        borderRadius: 1.5
	                      },
	                      '& input': {
	                        textAlign: 'center',
	                        fontWeight: 700,
	                        fontSize: 22,
	                        py: 0.8
	                      }
	                    }}
	                  />
	                </Box>
	                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 1 }}>
	                  Jornada maquinaria: 10 h. Máximo con horas extra: 15 h.
	                </Typography>
	              </Box>
	            </DialogContent>
	            <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.75 }}>
	              <Button onClick={closeEquipHourCellDialog}>Cancelar</Button>
	              <Button variant="contained" onClick={saveEquipHourCellDialog}>Aplicar</Button>
	            </DialogActions>
	          </Dialog>

	          <Dialog open={materialQtyCellDialogOpen} onClose={closeMaterialQtyCellDialog} fullWidth maxWidth="xs">
	            <DialogTitle>Cantidad Material - Actividad {materialQtyCellActivityIndex + 1}</DialogTitle>
            <DialogContent>
              <Box sx={{ pt: 1 }}>
                <TextField
                  type="number"
                  size="small"
                  label={`Act. ${materialQtyCellActivityIndex + 1}`}
                  value={materialQtyCellDraft}
                  onChange={(e) => setMaterialQtyCellDraft(e.target.value)}
                  inputProps={{ min: 0, max: 10, step: 'any' }}
                  sx={compactNumberFieldSx}
                  fullWidth
                />
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 1 }}>
                  Maximo por actividad: 10. Total por material: 10.
                </Typography>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeMaterialQtyCellDialog}>Cancelar</Button>
              <Button variant="contained" onClick={saveMaterialQtyCellDialog}>Aplicar</Button>
	            </DialogActions>
	          </Dialog>

	          <Dialog open={dailyExcelPreviewOpen} onClose={() => setDailyExcelPreviewOpen(false)} fullWidth maxWidth={false} PaperProps={{ sx: { width: '95vw', maxWidth: '1500px' } }}>
	            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
	              <Typography component="span" sx={{ fontWeight: 800 }}>
	                Vista previa Excel diario
	              </Typography>
	              <Typography component="span" sx={{ color: '#64748b', fontSize: 13 }}>
	                {dailyExcelPreview.formattedDate}
	              </Typography>
	            </DialogTitle>
	            <DialogContent dividers sx={{ bgcolor: '#f1f5f9', p: { xs: 1.5, md: 2 } }}>
	              {dailyExcelPreviewLoading ? (
	                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ py: 6 }}>
	                  <CircularProgress size={24} />
	                  <Typography sx={{ fontWeight: 700, color: '#0f2d5c' }}>
	                    Cargando datos completos de la fecha...
	                  </Typography>
	                </Stack>
	              ) : (
	              <Box sx={{ overflow: 'auto' }}>
	                <Box
	                  sx={{
	                    minWidth: 1120,
	                    bgcolor: '#ffffff',
	                    p: '18px 18px 18px 34px',
	                    fontFamily: 'Arial, sans-serif',
	                    color: '#163B82'
	                  }}
	                >
	                  <Box sx={{ border: '2px solid #000', ml: 2 }}>
	                    <Box sx={{ py: 0.75, textAlign: 'center', fontWeight: 900, color: '#163B82' }}>
	                      <Box>{dailyExcelPreview.title}</Box>
	                      <Box sx={{ mt: 0.5 }}>{getDailyExcelContractForFront(dailyExcelPreviewSelectedFront || dailyExcelPreview.groups[0]?.front || dailyExcelPreview.contract)}</Box>
	                      <Box sx={{ mt: 0.5 }}>{dailyExcelPreview.rev}</Box>
	                    </Box>
	                    <Box sx={{ bgcolor: '#163B82', color: '#ffffff', fontWeight: 900, px: 0.5, py: 0.25, borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
	                      1.- DESCRIPCIÓN DE TRABAJO EJECUTADO DIARIO
	                    </Box>
	                    {dailyExcelPreview.groups.length > 1 ? (
	                      <Box sx={{ borderBottom: '2px solid #000', bgcolor: '#f8fafc' }}>
	                        <Tabs
	                          value={dailyExcelPreviewSelectedFront}
	                          onChange={(_, value) => setDailyExcelPreviewFrontTab(String(value || ''))}
	                          variant="scrollable"
	                          scrollButtons="auto"
	                          sx={{
	                            minHeight: 34,
	                            '& .MuiTab-root': {
	                              minHeight: 34,
	                              py: 0.5,
	                              color: '#163B82',
	                              fontWeight: 900,
	                              textTransform: 'uppercase'
	                            },
	                            '& .Mui-selected': {
	                              bgcolor: '#d2ffd2'
	                            },
	                            '& .MuiTabs-indicator': {
	                              bgcolor: '#163B82',
	                              height: 3
	                            }
	                          }}
	                        >
	                          {dailyExcelPreview.groups.map((group) => (
	                            <Tab key={group.front} value={group.front} label={group.front} />
	                          ))}
	                        </Tabs>
	                      </Box>
	                    ) : null}
	                    {dailyExcelPreview.groups.length === 0 ? (
	                      <Box sx={{ p: 2, color: '#64748b' }}>No hay datos para previsualizar.</Box>
	                    ) : dailyExcelPreviewVisibleGroups.map((group) => (
	                      <Box key={group.front}>
	                        <Box sx={{ bgcolor: '#d2ffd2', fontWeight: 900, px: 0.5, py: 0.25, borderBottom: '2px solid #000' }}>
	                          FRENTE DE TRABAJO: {group.front}
	                        </Box>
	                        {group.rows.map((item, idx) => (
	                          <Box key={`${group.front}-${idx}`}>
	                            <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid #000', minHeight: 92 }}>
	                              <Box sx={{ borderRight: '1px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
	                                {item.activityLabel}
	                              </Box>
	                              <Box sx={{ p: 0.75, whiteSpace: 'pre-wrap', fontWeight: 400, lineHeight: 1.45 }}>
	                                {item.sectionLabel ? <Box sx={{ fontWeight: 900 }}>{item.sectionLabel}</Box> : null}
	                                {item.crewLabel ? <Box sx={{ fontWeight: 900 }}>Cuadrilla {item.crewLabel}</Box> : null}
	                                {item.activityLines.some((line) => line.quantity || line.unit) ? (
	                                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 90px', gap: 1, mt: 0.5 }}>
	                                    <Box sx={{ fontWeight: 900, color: '#0f2d5c' }}>Actividad</Box>
	                                    <Box sx={{ fontWeight: 900, color: '#0f2d5c', textAlign: 'center' }}>Cant.</Box>
	                                    <Box sx={{ fontWeight: 900, color: '#0f2d5c', textAlign: 'center' }}>Unidad</Box>
	                                    {(item.activityLines.length > 0 ? item.activityLines : [{ text: '-', quantity: '', unit: '' }]).map((line, lineIdx) => (
	                                      <React.Fragment key={`${line.text}-${lineIdx}`}>
	                                        <Box sx={{ fontWeight: 400 }}>{line.text}</Box>
	                                        <Box sx={{ textAlign: 'center', fontWeight: 400 }}>{line.quantity || '-'}</Box>
	                                        <Box sx={{ textAlign: 'center', fontWeight: 400 }}>{line.unit || '-'}</Box>
	                                      </React.Fragment>
	                                    ))}
	                                  </Box>
	                                ) : (
	                                  (item.activityLines.length > 0 ? item.activityLines : [{ text: '-', quantity: '', unit: '' }]).map((line, lineIdx) => (
	                                    <Box key={`${line.text}-${lineIdx}`} sx={{ fontWeight: 400 }}>{line.text}</Box>
	                                  ))
	                                )}
	                              </Box>
	                            </Box>
	                            <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '2px solid #000', minHeight: 32 }}>
	                              <Box sx={{ borderRight: '1px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
	                                Observación:
	                              </Box>
	                              <Box sx={{ p: 0.75, color: '#163B82' }}>{item.observation}</Box>
	                            </Box>
	                          </Box>
	                        ))}
		                      </Box>
		                    ))}
		                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 0.95fr 1.15fr', borderBottom: '2px solid #000' }}>
		                      <Box sx={{ p: 0.75, borderRight: '1px solid #000', color: '#000', fontWeight: 800 }}>RESPONSABLE EMPRESA CONTRATISTA: PUGA MUJICA ASOCIADOS</Box>
		                      <Box sx={{ p: 0.75, borderRight: '1px solid #000', color: '#000', fontWeight: 800 }}>CARGO:</Box>
		                      <Box sx={{ p: 0.75, color: '#000', fontWeight: 800 }}>FIRMA:</Box>
		                    </Box>
		                    {dailyExcelPreviewVisibleGroups.map((group) => (
		                      (group.images || []).length > 0 ? (
		                        <Box key={`images-${group.front}`} sx={{ borderBottom: '2px solid #000' }}>
		                          <Box sx={{ bgcolor: '#d2ffd2', fontWeight: 900, px: 0.5, py: 0.25, borderBottom: '2px solid #000' }}>
		                            EVIDENCIA FOTOGRÁFICA: {group.front}
		                          </Box>
		                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)', lg: 'repeat(8, 1fr)' }, gap: 0.5, p: 0.5 }}>
		                            {(group.images || []).map((image) => {
		                              const excluded = dailyExcelExcludedImageKeySet.has(image.key)
		                              const previewUrl = uploadedEvidencePreviewByKey[image.key] || ''
		                              const orientation = dailyExcelImageOrientationByKey[image.key]
		                              return (
		                                <Box
		                                  key={image.key}
		                                  sx={{
		                                    border: excluded ? '1px dashed #94a3b8' : '1px solid #000',
		                                    bgcolor: excluded ? '#f1f5f9' : '#ffffff',
		                                    opacity: excluded ? 0.45 : 1,
		                                    position: 'relative',
		                                    height: orientation === 'portrait' ? 150 : 128,
		                                    gridColumn: {
		                                      xs: orientation === 'landscape' ? 'span 2' : 'span 1',
		                                      sm: orientation === 'landscape' ? 'span 2' : 'span 1',
		                                      lg: orientation === 'landscape' ? 'span 2' : 'span 1'
		                                    },
		                                    overflow: 'hidden'
		                                  }}
		                                >
		                                  <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc', overflow: 'hidden' }}>
		                                    {previewUrl ? (
		                                      <Box
		                                        component="img"
		                                        src={previewUrl}
		                                        alt={image.name || 'Imagen evidencia'}
		                                        onLoad={(event: React.SyntheticEvent<HTMLImageElement>) => {
		                                          const img = event.currentTarget
		                                          const nextOrientation = (img.naturalWidth || img.width) >= (img.naturalHeight || img.height) ? 'landscape' : 'portrait'
		                                          setDailyExcelImageOrientationByKey((prev) => (
		                                            prev[image.key] === nextOrientation ? prev : { ...prev, [image.key]: nextOrientation }
		                                          ))
		                                        }}
		                                        sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
		                                      />
		                                    ) : (
		                                      <CircularProgress size={18} />
		                                    )}
		                                  </Box>
		                                  <IconButton
		                                    size="small"
		                                    color={excluded ? 'primary' : 'error'}
		                                    title={excluded ? 'Restaurar imagen' : 'Quitar imagen'}
		                                    onClick={() => {
		                                      setDailyExcelExcludedImageKeys((prev) => {
		                                        const current = new Set(prev || [])
		                                        if (current.has(image.key)) current.delete(image.key)
		                                        else current.add(image.key)
		                                        return Array.from(current)
		                                      })
		                                    }}
		                                    sx={{
		                                      position: 'absolute',
		                                      top: 6,
		                                      right: 6,
		                                      bgcolor: 'rgba(255,255,255,0.9)',
		                                      border: '1px solid rgba(15, 23, 42, 0.15)',
		                                      '&:hover': { bgcolor: '#ffffff' }
		                                    }}
		                                  >
		                                    {excluded ? <Plus size={16} /> : <Trash2 size={16} />}
		                                  </IconButton>
		                                </Box>
		                              )
		                            })}
		                          </Box>
		                        </Box>
		                      ) : null
		                    ))}
	                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', color: '#000' }}>
	                      {[
	                        ['Confeccionado por: Juan Pablo Bernal Castro', 'Cargo: Ingeniero Oficina Tecnica', `Fecha: ${dailyExcelPreview.formattedDate}`, 'Firma:'],
	                        ['Aprobado por: Ricardo Cardenas Jeraldo', 'Cargo: Administrador de Contrato', `Fecha: ${dailyExcelPreview.formattedDate}`, 'Firma:'],
	                        ['Toma de conocimiento:', 'Cargo: ITO', 'Fecha:', 'Firma:']
	                      ].map((block, idx) => (
	                        <Box key={idx} sx={{ borderRight: idx < 2 ? '1px solid #000' : 'none' }}>
	                          {block.map((line) => (
	                            <Box key={line} sx={{ px: 0.5, py: 0.2, borderBottom: '1px solid #000', fontWeight: 700 }}>{line}</Box>
	                          ))}
	                        </Box>
	                      ))}
	                    </Box>
	                  </Box>
	                </Box>
	              </Box>
	              )}
	            </DialogContent>
	            <DialogActions>
	              <Button onClick={() => setDailyExcelPreviewOpen(false)}>Cerrar</Button>
	              <Button
	                variant="contained"
	                startIcon={<FileSpreadsheet size={16} />}
	                disabled={dailyExcelPreviewLoading || dailyExcelPreviewReports.length === 0}
	                onClick={() => setDailyExcelExportOptionsOpen(true)}
	              >
	                Exportar Excel
	              </Button>
	            </DialogActions>
	          </Dialog>

            <Dialog open={dailyExcelExportOptionsOpen} onClose={() => !dailyExcelExporting && setDailyExcelExportOptionsOpen(false)} fullWidth maxWidth="xs">
              <DialogTitle>Opciones de Exportación Excel</DialogTitle>
              <DialogContent>
                <Stack spacing={1.5} sx={{ pt: 1 }}>
                  <FormControl size="small" fullWidth disabled={dailyExcelExporting}>
                    <InputLabel id="daily-excel-export-mode-label">Frente a exportar</InputLabel>
                    <Select
                      labelId="daily-excel-export-mode-label"
                      label="Frente a exportar"
                      value={dailyExcelExportMode}
                      onChange={(e) => setDailyExcelExportMode(String(e.target.value) as 'CURRENT' | 'BOTH')}
                    >
                      <MenuItem value="CURRENT">Frente actual ({dailyExcelPreviewSelectedFront || '-'})</MenuItem>
                      <MenuItem value="BOTH">Ambos frentes</MenuItem>
                    </Select>
                  </FormControl>
                  {dailyExcelExporting ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: '#163B82' }}>
                      <CircularProgress size={18} />
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                        {dailyExcelExportProgressLabel || 'Exportando Excel...'}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: 12, color: '#64748b' }}>
                      Si hay varias imágenes, la exportación puede tardar unos segundos.
                    </Typography>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDailyExcelExportOptionsOpen(false)} disabled={dailyExcelExporting}>Cancelar</Button>
                <Button variant="contained" onClick={handleRunDailyExcelPreviewExport} disabled={dailyExcelExporting}>
                  {dailyExcelExporting ? 'Exportando...' : 'Exportar Excel'}
                </Button>
              </DialogActions>
            </Dialog>

	          <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} fullWidth maxWidth="sm">
            <DialogTitle>Exportador Reportes</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1 }}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Fecha del reporte"
                    value={exportDateValue}
                    onChange={(value) => {
                      if (!value || isNaN(value.getTime())) {
                        setExportDateFilter('')
                        return
                      }
                      setExportDateFilter(format(value, 'yyyy-MM-dd'))
                    }}
                    format="yyyy-MM-dd"
                    shouldDisableDate={shouldDisableExportDate}
                    slotProps={{
                      textField: {
                        size: 'small',
                        fullWidth: true,
                        helperText: exportAvailableReportDates.length === 0 ? 'No hay fechas disponibles' : undefined,
                        inputProps: { readOnly: true }
                      }
                    }}
                  />
                </LocalizationProvider>
                <TextField
                  select
                  label="Cuadrilla"
                  value={exportCrewFilter}
                  onChange={(e) => setExportCrewFilter(String(e.target.value || ''))}
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">Todas las cuadrillas</MenuItem>
                  {exportCrewOptions.map((opt) => (
                    <MenuItem key={opt.id} value={opt.id}>{formatCrewNameLabel(opt.name)}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Frente"
                  value={exportFrontFilter}
                  onChange={(e) => setExportFrontFilter(String(e.target.value || ''))}
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">Todos los frentes</MenuItem>
                  {exportFrontFilter && !workFrontOptions.includes(exportFrontFilter) ? (
                    <MenuItem value={exportFrontFilter}>{exportFrontFilter}</MenuItem>
                  ) : null}
                  {workFrontOptions.map((opt) => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </TextField>
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  Puede filtrar por fecha, cuadrilla y frente. {exportFrontHint}
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={handleExportFromModal}>Exportar</Button>
            </DialogActions>
          </Dialog>

          <Dialog open={evidenceDialogOpen} onClose={closeEvidenceDialog} fullWidth maxWidth="sm">
            <DialogTitle>Imagenes de respaldo</DialogTitle>
            <DialogContent>
              {(() => {
                const idx = evidenceDialogRowIndex
                if (idx == null || !assignedActivities[idx]) return null
                const row = assignedActivities[idx]
                const rowKey = evidenceRowKey(row, idx)
                const uploaded = parseEvidenceFiles(row.evidence_files)
                const pending = pendingEvidenceFiles[rowKey] || []
                return (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Imagenes ya registradas ({uploaded.length})
                      </Typography>
                      {uploaded.length > 0 ? (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Download size={14} />}
                          onClick={() => downloadAllEvidenceFiles(uploaded)}
                        >
                          Descargar todas
                        </Button>
                      ) : null}
                    </Box>
                    {uploaded.length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                        {uploaded.map((f, i) => (
                          <Box
                            key={`${f.key}-${i}`}
                            sx={{
                              width: 180,
                              border: '1px solid #cbd5e1',
                              borderRadius: 1,
                              p: 0.75,
                              bgcolor: '#f8fafc'
                            }}
                          >
                            {uploadedEvidencePreviewByKey[f.key] ? (
                              <Box
                                component="img"
                                src={uploadedEvidencePreviewByKey[f.key]}
                                alt={f.name || `Imagen ${i + 1}`}
                                sx={{
                                  width: '100%',
                                  height: 120,
                                  objectFit: 'cover',
                                  borderRadius: 1,
                                  border: '1px solid #cbd5e1',
                                  mb: 0.5
                                }}
                              />
                            ) : null}
                            <Typography
                              variant="caption"
                              sx={{
                                display: 'block',
                                color: '#334155',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {f.name || `Imagen ${i + 1}`}
                            </Typography>
                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.25, flexWrap: 'wrap' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={async () => {
                                  const url = await getEvidenceViewUrl(f.key)
                                  if (!url) {
                                    showSnackbar('No se pudo abrir la imagen', 'error')
                                    return
                                  }
                                  window.open(url, '_blank', 'noopener,noreferrer')
                                }}
                                sx={{ minWidth: 'auto', px: 0.75 }}
                              >
                                Ver
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Download size={14} />}
                                onClick={() => downloadEvidenceFile(f)}
                                sx={{ minWidth: 'auto', px: 0.75 }}
                              >
                                Descargar
                              </Button>
                            </Stack>
                            {!isView && (
                              <Button
                                size="small"
                                color="error"
                                startIcon={<Trash2 size={14} />}
                                onClick={() => removeUploadedEvidenceFromRow(idx, i)}
                                sx={{ mt: 0.25, minWidth: 'auto', px: 0.75 }}
                              >
                                Eliminar
                              </Button>
                            )}
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 1 }}>
                        Sin imagenes registradas
                      </Typography>
                    )}

                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                      Imagenes agregadas (pendientes de guardar) ({pending.length})
                    </Typography>
                    {pending.length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {pending.map((item, i) => (
                          <Box key={`${item.file.name}-${i}`} sx={{ width: 86 }}>
                            <Box
                              component="img"
                              src={item.previewUrl}
                              alt={item.file.name || `Pendiente ${i + 1}`}
                              sx={{
                                width: 86,
                                height: 64,
                                objectFit: 'cover',
                                borderRadius: 1,
                                border: '1px solid #f59e0b'
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                display: 'block',
                                mt: 0.25,
                                color: '#64748b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {item.file.name || `Pendiente ${i + 1}`}
                            </Typography>
                            {!isView && (
                              <Button
                                size="small"
                                color="error"
                                startIcon={<Trash2 size={14} />}
                                onClick={() => removePendingEvidenceFromRow(rowKey, i)}
                                sx={{ mt: 0.25, minWidth: 'auto', px: 0.75 }}
                              >
                                Eliminar
                              </Button>
                            )}
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                        Sin imagenes pendientes
                      </Typography>
                    )}
                  </Box>
                )
              })()}
              <Box
                onDragOver={(e) => {
                  e.preventDefault()
                  setEvidenceDragOver(true)
                }}
                onDragLeave={() => setEvidenceDragOver(false)}
                onDrop={async (e) => {
                  e.preventDefault()
                  setEvidenceDragOver(false)
                  await submitEvidenceFromList(e.dataTransfer.files)
                }}
                sx={{
                  border: `2px dashed ${evidenceDragOver ? '#1565c0' : '#cbd5e1'}`,
                  borderRadius: 2,
                  p: 3,
                  textAlign: 'center',
                  bgcolor: evidenceDragOver ? '#eff6ff' : '#fafafa'
                }}
              >
                <Typography sx={{ mb: 1, fontWeight: 600 }}>
                  Arrastra y suelta imagenes aqui
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
                  Maximo 5 imagenes por actividad
                </Typography>
                <Button component="label" variant="outlined">
                  Seleccionar imagenes
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => submitEvidenceFromList(e.target.files)}
                  />
                </Button>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeEvidenceDialog}>Cancelar</Button>
              <Button variant="contained" onClick={closeEvidenceDialog}>OK</Button>
            </DialogActions>
          </Dialog>

          <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} fullWidth maxWidth="md">
            <DialogTitle>Historial de Versiones</DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ color: '#64748b', mb: 1.5 }}>
                {historyReportLabel || 'Reporte'}
              </Typography>
              {historyLoading ? (
                <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={26} />
                </Box>
              ) : historyRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Sin versiones guardadas.</Typography>
              ) : (
                <List sx={{ p: 0 }}>
                  {historyRows.map((row) => {
                    const created = row?.created_at ? new Date(row.created_at) : null
                    const createdLabel = created && !isNaN(created.getTime())
                      ? created.toLocaleString('es-CL')
                      : '-'
                    const isExpanded = expandedHistoryVersionId === row.id
                    return (
                      <ListItem
                        key={row.id}
                        sx={{
                          mb: 1,
                          border: '1px solid #dbe4f0',
                          borderRadius: 1.5,
                          display: 'block'
                        }}
                      >
                        <Typography sx={{ fontWeight: 700 }}>
                          Versión {row.version_no} - {createdLabel}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 1 }}>
                          Editor: {row.edited_by || '-'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#334155', display: 'block' }}>
                          Estado anterior: {row.previous_data ? 'Disponible' : 'No disponible'} | Estado nuevo: {row.new_data ? 'Disponible' : 'No disponible'}
                        </Typography>
                        <Box sx={{ mt: 1.25 }}>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setExpandedHistoryVersionId((prev) => (prev === row.id ? null : row.id))}
                            >
                              {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={!row.previous_data}
                              onClick={() => openHistorySnapshotInViewer(row, 'previous')}
                            >
                              Ver estado anterior
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={!row.new_data}
                              onClick={() => openHistorySnapshotInViewer(row, 'new')}
                            >
                              Ver estado nuevo
                            </Button>
                          </Stack>
                        </Box>
                        {isExpanded && (
                          <Box sx={{ mt: 1.5, display: 'grid', gap: 1.25 }}>
                            <Box>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', display: 'block', mb: 0.5 }}>
                                Estado anterior (JSON)
                              </Typography>
                              <Box
                                component="pre"
                                sx={{
                                  m: 0,
                                  p: 1.25,
                                  bgcolor: '#0b1020',
                                  color: '#e2e8f0',
                                  borderRadius: 1,
                                  fontSize: 12,
                                  lineHeight: 1.45,
                                  overflow: 'auto',
                                  maxHeight: 240,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word'
                                }}
                              >
                                {formatVersionPayload(row.previous_data)}
                              </Box>
                            </Box>
                            <Box>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', display: 'block', mb: 0.5 }}>
                                Estado nuevo (JSON)
                              </Typography>
                              <Box
                                component="pre"
                                sx={{
                                  m: 0,
                                  p: 1.25,
                                  bgcolor: '#0b1020',
                                  color: '#e2e8f0',
                                  borderRadius: 1,
                                  fontSize: 12,
                                  lineHeight: 1.45,
                                  overflow: 'auto',
                                  maxHeight: 240,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word'
                                }}
                              >
                                {formatVersionPayload(row.new_data)}
                              </Box>
                            </Box>
                          </Box>
                        )}
                      </ListItem>
                    )
                  })}
                </List>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setHistoryOpen(false)}>Cerrar</Button>
            </DialogActions>
          </Dialog>

          <Dialog open={programDialogOpen} onClose={() => setProgramDialogOpen(false)} fullWidth maxWidth="lg">
            <DialogTitle>Seleccionar actividad desde Programa</DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ mb: 2 }}>Seleccione una o varias actividades del programa y asígnelas a una cuadrilla.</Typography>
              <Box sx={{ maxHeight: '60vh', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>ID</th>
                      <th style={thStyle}>Actividad</th>
                      <th style={thStyle}>Área</th>
                      <th style={thStyle}>Paquete</th>
                      <th style={thStyle}>Cantidad</th>
                      <th style={thStyle}>Unidad</th>
                      <th style={thStyle}>Asignar a</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {programActivities.map((p) => (
                      <tr key={p.id}>
                        <td style={tdStyle}>{p.item_id || p.id}</td>
                        <td style={tdStyle}>{p.activity}</td>
                        <td style={tdStyle}>{p.area || ''}</td>
                        <td style={tdStyle}>{p.package || ''}</td>
                        <td style={tdStyle}>{p.quantity ?? ''}</td>
                        <td style={tdStyle}>{p.unit || ''}</td>
                        <td style={tdStyle}>
                          <TextField select size="small" value={selectedCrewFor[`prog-${p.id}`] || ''} onChange={(e) => setSelectedCrewFor((m) => ({ ...m, [`prog-${p.id}`]: e.target.value }))} sx={{ minWidth: 220 }}>
                            <MenuItem value="">Seleccione cuadrilla</MenuItem>
                            {crews.map((c) => (<MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>))}
                          </TextField>
                        </td>
                        <td style={tdStyle}>
                          <Button size="small" variant="contained" onClick={() => assignProgramActivityToCrew(p)}>Asignar</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setProgramDialogOpen(false)}>Cerrar</Button>
            </DialogActions>
          </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
          <DialogTitle>Eliminar reporte</DialogTitle>
          <DialogContent sx={{ px: 4, py: 3 }}>
            <Typography sx={{ mb: 0 }}>Esta acción es irreversible. ¿Desea eliminar el reporte seleccionado?</Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button color="error" variant="contained" onClick={handleConfirmDelete}>Eliminar</Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>

        {/* view/edit modal removed; we reuse the main `open` dialog for view/edit */}

        {/* Activity details moved to Programa screen */}
      </Box>
    </Box>
  )
}
