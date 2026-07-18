"use client"

import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  Card,
  CardContent,
  Autocomplete,
  Alert,
  Backdrop,
  LinearProgress,
  Menu,
  MenuItem,
  Avatar,
  InputAdornment,
  Popover,
  Tooltip
} from '@mui/material'
import {
  Add,
  Edit,
  Upload,
  Search,
  FilterList,
  Person,
  Business,
  Warning,
  PushPin,
  ViewList,
  ViewModule,
  EventNote,
  CalendarMonth,
  Visibility,
  VisibilityOff
} from '@mui/icons-material'
import { DateCalendar } from '@mui/x-date-pickers'
import { PickersDay, PickersDayProps } from '@mui/x-date-pickers/PickersDay'
import { Trash2 } from 'lucide-react'
import { colors } from '../../../theme/theme'
import { getSuggestedPositions, findSimilarPositions, isStandardPosition, validateCustomPosition, addCustomPosition } from '../../../lib/positionStandards'
import { IndustryType } from '../../../types'
import CountryPhoneInput from '../../../components/CountryPhoneInput'
import UserHeader from '../../../components/layout/UserHeader'
import { AppFloatingActionButton } from '@/components/ui/AppFloatingActionButton'
import { AttendanceView } from '../../../components/attendance/AttendanceView'
import { normalizeText, normalizeUppercaseDisplayText } from '../../../lib/normalize'
import { notifyAttendanceDataUpdated } from '../../../lib/attendanceDataRefresh'

interface Collaborator {
  id: string
  user_id?: string
  company_id?: string
  email?: string
  first_name?: string
  last_name?: string
  document?: string
  phone?: string
  address?: string
  country?: string
  region?: string
  commune?: string
  position?: string
  condition?: string
  exception_condition?: string
  worker_type?: string
  contract?: string
  shift_pattern?: string
  salary?: number
  birth_date?: string
  hire_date?: string
  emergency_contact?: string
  upper_clothing_size?: string
  lower_clothing_size?: string
  shoe_size?: string
  gender?: string
  nationality?: string
  marital_status?: string
  specialty?: string
  photo_url?: string
  signature_url?: string
  epp_details?: any
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

interface CollaboratorDailyStatus {
  id?: string
  collaborator_id: string
  work_date: string
  status: string
  reason?: string | null
}

const COLLABORATORS_DEBUG = process.env.NEXT_PUBLIC_COLLABORATORS_DEBUG === 'true'
let collaboratorsPageCache: Collaborator[] | null = null
let collaboratorsPageInFlight: Promise<Collaborator[]> | null = null
const collaboratorsDailyStatusCache = new Map<string, CollaboratorDailyStatus[]>()
const collaboratorsDailyStatusInFlight = new Map<string, Promise<CollaboratorDailyStatus[]>>()

type TableSortField =
  | 'name'
  | 'document'
  | 'email'
  | 'phone'
  | 'position'
  | 'condition'
  | 'specialty'
  | 'gender'
  | 'nationality'
  | 'marital_status'
  | 'worker_type'
  | 'contract'
  | 'salary'
  | 'is_active'

type PinColumnKey =
  | 'avatar'
  | 'name'
  | 'document'
  | 'email'
  | 'phone'
  | 'position'
  | 'condition'
  | 'specialty'
  | 'gender'
  | 'nationality'
  | 'marital_status'
  | 'worker_type'
  | 'contract'
  | 'salary'
  | 'is_active'
  | 'actions'

type ImportPrimaryAction = 'attendance_daily' | 'attendance_fix' | 'profile_update' | 'new_collaborators'

export default function CollaboratorsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const currentRole = String((session?.user as any)?.role || '').trim().toLowerCase()
  const showAttendanceForUser = currentRole === 'user'

  // Función helper para capitalizar texto
    const capitalizeText = (text?: string) => {
      return (text || '').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
    }

  // Helpers para validar y formatear RUT chileno
  const isValidChileanRut = (raw: string) => {
    if (!raw) return false
    const clean = raw.replace(/[^0-9kK]/g, '')
    // RUT moderno: 7-8 dígitos + DV => total 8-9 caracteres
    if (clean.length < 8 || clean.length > 9) return false
    const rut = clean.slice(0, -1)
    const dv = clean.slice(-1).toUpperCase()
    if (rut.length < 7 || rut.length > 8) return false
    if (!/^[0-9]+$/.test(rut) || !/^[0-9K]$/.test(dv)) return false

    let suma = 0
    let multiplicador = 2
    for (let i = rut.length - 1; i >= 0; i--) {
      suma += parseInt(rut[i]) * multiplicador
      multiplicador = multiplicador === 7 ? 2 : multiplicador + 1
    }
    const resto = suma % 11
    const dvCalculado = resto === 0 ? '0' : resto === 1 ? 'K' : (11 - resto).toString()
    return dv === dvCalculado
  }

  const formatRutForDisplay = (raw?: string) => {
    if (!raw) return ''
    const clean = raw.replace(/[^0-9kK]/g, '')
    if (!isValidChileanRut(clean)) return raw || ''
    const rut = clean.slice(0, -1)
    const dv = clean.slice(-1).toUpperCase()
    const formatted = rut.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv
    return formatted
  }
  const formatDocumentForDisplay = (raw?: string) => {
    if (!raw) return 'SIN DOCUMENTO'
    const formattedRut = formatRutForDisplay(raw)
    const finalValue = String(formattedRut || raw).trim()
    return finalValue ? finalValue.toUpperCase() : 'SIN DOCUMENTO'
  }

  // Función helper para extraer código de país y número del teléfono
  const parsePhoneNumber = (phone: string) => {
    if (!phone) return { country: 'CL', number: '' }
    
    // Buscar el código de país más largo que coincida
    const countryCodes = [
      { code: '+56', country: 'CL' }, // Chile
      { code: '+54', country: 'AR' }, // Argentina
      { code: '+51', country: 'PE' }, // Perú
      { code: '+57', country: 'CO' }, // Colombia
      { code: '+52', country: 'MX' }, // México
      { code: '+1', country: 'US' },  // Estados Unidos
      { code: '+55', country: 'BR' }, // Brasil
      { code: '+34', country: 'ES' }, // España
      { code: '+49', country: 'DE' }, // Alemania
      { code: '+33', country: 'FR' }, // Francia
    ]
    
    // Ordenar por longitud de código (más largo primero)
    countryCodes.sort((a, b) => b.code.length - a.code.length)
    
    for (const country of countryCodes) {
      if (phone.startsWith(country.code)) {
        return {
          country: country.country,
          number: phone.substring(country.code.length)
        }
      }
    }
    
    // Si no encuentra código de país, asumir Chile
    return { country: 'CL', number: phone }
  }
  const COUNTRY_DIAL_CODE: Record<string, string> = {
    CL: '+56',
    AR: '+54',
    PE: '+51',
    CO: '+57',
    MX: '+52',
    US: '+1',
    BR: '+55',
    ES: '+34',
    DE: '+49',
    FR: '+33'
  }
  const normalizePhoneForStorage = (rawPhone: string, country: string = 'CL') => {
    const raw = String(rawPhone || '').trim()
    if (!raw) return ''
    if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`
    const digits = raw.replace(/[^0-9]/g, '')
    if (!digits) return ''
    const dial = COUNTRY_DIAL_CODE[country] || '+56'
    const dialDigits = dial.replace('+', '')
    if (digits.startsWith(dialDigits)) return `+${digits}`
    return `${dial}${digits}`
  }
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importInstructionsOpen, setImportInstructionsOpen] = useState(false)
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importRows, setImportRows] = useState<string[][]>([])
  const [importHeaderStartCell, setImportHeaderStartCell] = useState<string>('A1')
  const importHeaderStartCellDraftRef = useRef<string>('A1')
  const [importRawRows, setImportRawRows] = useState<string[][]>([])
  const [importSheetNames, setImportSheetNames] = useState<string[]>([])
  const [selectedImportSheet, setSelectedImportSheet] = useState<string>('')
  const [importWorkbook, setImportWorkbook] = useState<any | null>(null)
  const [mapping, setMapping] = useState<Record<string,string>>({})
  // Columns present in `pr_collaborators` (source of truth for mapping)
  const collaboratorColumns = [
    'is_active','created_at','updated_at','salary','hire_date','birth_date','company_id','user_id','epp_details','last_activity','is_online','id','worker_type','contract','shift_pattern','condition','exception_condition','gender','nationality','marital_status','photo_url','signature_url','password_hash','specialty','document','first_name','last_name','email','phone','country','region','commune','address','position','emergency_contact','shoe_size','upper_clothing_size','lower_clothing_size'
  ]
  const collaboratorColumnDescriptions: Record<string,string> = {
    first_name: 'Nombres del colaborador (ej: Juan)',
    last_name: 'Apellidos (ej: Pérez Gómez)',
    document: 'Documento de identidad (RUT/DNI/CI) sin guiones o con formato',
    email: 'Correo electrónico (ej: juan@email.com)',
    phone: 'Teléfono con código de país (ej: +56912345678)',
    address: 'Dirección física (calle, ciudad)',
    position: 'Cargo o posición dentro de la compañía (ej: Capataz cañería)',
    specialty: 'Especialidad o área principal (ej: Cañería, Electricidad)',
    worker_type: 'Tipo de trabajador (Directo, Indirecto, Contratista, etc.)',
    contract: 'Tipo de contrato (ej: Indefinido, Plazo fijo, Por obra)',
    shift_pattern: 'Turno o jornada (ej: A, B, 5x2, 8x6)',
    condition: 'Condición del colaborador (Turno, Descanso, Acreditacion, Oficina Central - Teletrabajo)',
    exception_condition: 'Condición de excepción del colaborador (opcional; puede quedar en blanco)',
    salary: 'Salario en moneda local (sin símbolos)',
    birth_date: 'Fecha de nacimiento',
    hire_date: 'Fecha de ingreso o contratación',
    emergency_contact: 'Teléfono o contacto de emergencia',
    upper_clothing_size: 'Talla de ropa superior (S, M, L, XL)',
    lower_clothing_size: 'Talla de ropa inferior',
    shoe_size: 'Talla de zapatos (ej: 42)',
    gender: 'Género (opcional)',
    nationality: 'Nacionalidad (ej: CL, Chile, Perú)',
    marital_status: 'Estado civil (Soltero, Casado, Divorciado, Viudo)',
    country: 'País (ISO2 o nombre, ej: CL)',
    region: 'Región / Estado / Provincia',
    commune: 'Comuna / Ciudad',
    photo_url: 'URL de foto (opcional)',
    signature_url: 'URL de firma (opcional)',
    epp_details: 'Detalles de EPP entregado (texto libre)',
    is_active: 'Vigencia del colaborador (Vigente/Finiquitado) — opcional',
    password_hash: 'Hash de contraseña (normalmente vacío en import)',
    company_id: 'ID de la compañía (opcional, se usará companyId de sesión si falta)'
  }
  const collaboratorColumnLabels: Record<string, string> = {
    first_name: 'Nombres',
    last_name: 'Apellidos',
    document: 'Documento',
    email: 'Correo',
    phone: 'Teléfono',
    address: 'Dirección',
    position: 'Cargo',
    specialty: 'Especialidad',
    worker_type: 'Tipo de trabajador',
    contract: 'Contrato',
    shift_pattern: 'Turno / Jornada',
    condition: 'Condición',
    exception_condition: 'Excepción',
    salary: 'Salario',
    birth_date: 'Fecha de nacimiento',
    hire_date: 'Fecha de ingreso',
    emergency_contact: 'Contacto de emergencia',
    upper_clothing_size: 'Talla superior',
    lower_clothing_size: 'Talla inferior',
    shoe_size: 'Talla calzado',
    gender: 'Género',
    nationality: 'Nacionalidad',
    marital_status: 'Estado civil',
    country: 'País',
    region: 'Región',
    commune: 'Comuna',
    photo_url: 'URL foto',
    signature_url: 'URL firma',
    epp_details: 'Detalle EPP',
    is_active: 'Vigencia',
    password_hash: 'Hash contraseña',
    company_id: 'ID compañía',
    user_id: 'ID usuario',
  }
  const getColumnLabel = (field?: string) => {
    if (!field) return ''
    return collaboratorColumnLabels[field] || field
  }
  const requiredImportFields = ['first_name','last_name','document','email']
  const suggestedImportFields = ['position','specialty','worker_type','contract','shift_pattern','condition','exception_condition','phone','hire_date','birth_date','salary','address','emergency_contact','nationality','marital_status']
  const profileUpdateHiddenFields = ['id', 'company_id', 'user_id', 'created_at', 'updated_at', 'last_activity', 'is_online', 'password_hash']
  const newCollaboratorImportFields = [
    'document',
    'first_name',
    'last_name',
    'email',
    'phone',
    'country',
    'region',
    'commune',
    'address',
    'position',
    'specialty',
    'worker_type',
    'contract',
    'shift_pattern',
    'condition',
    'exception_condition',
    'is_active',
    'hire_date',
    'birth_date',
    'gender',
    'nationality',
    'marital_status',
    'salary',
    'emergency_contact',
    'shoe_size',
    'upper_clothing_size',
    'lower_clothing_size',
    'epp_details',
  ]
      // Note: dynamic import of `xlsx` is used inside the file handler to avoid SSR/bundling/type errors
  const [importing, setImporting] = useState<boolean>(false)
  const [importParsing, setImportParsing] = useState<boolean>(false)
  const [importParsingMessage, setImportParsingMessage] = useState<string>('')
  const [importParsingProgress, setImportParsingProgress] = useState<number>(0)
  const [importStatusMessage, setImportStatusMessage] = useState<string>('')
  const [importProgress, setImportProgress] = useState<number>(0)
  const [importNotice, setImportNotice] = useState<{ severity: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null)
  const [importOperation, setImportOperation] = useState<
    'attendance_overwrite' |
    'attendance_new_only' |
    'attendance_specific_date' |
    'attendance_specific_dates' |
    'attendance_specific_date_then_new' |
    'attendance_specific_workers' |
    'full_overwrite_all' |
    'profile_specific_columns'
  >('attendance_new_only')
  const [attendanceOnlyMode, setAttendanceOnlyMode] = useState<boolean>(true)
  const [attendanceWriteMode, setAttendanceWriteMode] = useState<'insert_only' | 'upsert'>('insert_only')
  const [attendanceStartDate, setAttendanceStartDate] = useState<string>('')
  const [attendanceEndDate, setAttendanceEndDate] = useState<string>('')
  const [attendanceSelectedDates, setAttendanceSelectedDates] = useState<string[]>([])
  const [attendanceStartColumnIndex, setAttendanceStartColumnIndex] = useState<number>(-1)
  const [attendanceTargetDocuments, setAttendanceTargetDocuments] = useState<string[]>([])
  const [importPrimaryAction, setImportPrimaryAction] = useState<ImportPrimaryAction>('attendance_daily')
  const [showImportAdvancedOptions, setShowImportAdvancedOptions] = useState(false)
  const [showImportMappingEditor, setShowImportMappingEditor] = useState(false)
  const [importConfigurationCollapsed, setImportConfigurationCollapsed] = useState(false)
  const [showImportPreviewTables, setShowImportPreviewTables] = useState(false)
  const [showImportAttendancePreview, setShowImportAttendancePreview] = useState(false)
  const [importHeaderApplying, setImportHeaderApplying] = useState(false)
  const [importSheetSelectOpen, setImportSheetSelectOpen] = useState(false)
  const [attendanceCorrectionMode, setAttendanceCorrectionMode] = useState<'single' | 'range' | 'multi' | null>(null)
  const [attendanceCalendarAnchorEl, setAttendanceCalendarAnchorEl] = useState<HTMLElement | null>(null)
  const [attendanceCalendarMode, setAttendanceCalendarMode] = useState<'single' | 'range' | 'multi'>('single')
  const [pendingImportPrimaryAction, setPendingImportPrimaryAction] = useState<ImportPrimaryAction | null>(null)
  const [attendanceDailyImportScope, setAttendanceDailyImportScope] = useState<'next' | 'all'>('next')
  const [importAttendanceBounds, setImportAttendanceBounds] = useState<{ min: string | null; max: string | null; loading: boolean }>({
    min: null,
    max: null,
    loading: false,
  })
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const waitForUiPaint = () => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
  })
  const sheetToAbsoluteRows = (sheet: any, XLSX: any): string[][] => {
    let absoluteRange: any = 0
    const ref = String(sheet?.['!ref'] || '')
    if (ref) {
      try {
        const decoded = XLSX.utils.decode_range(ref)
        absoluteRange = { s: { r: 0, c: 0 }, e: decoded.e }
      } catch {
        absoluteRange = 0
      }
    }
    const aoa = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: true,
      defval: '',
      range: absoluteRange,
    }) as any[]
    return aoa.map((r: any[]) => (Array.isArray(r) ? r : []).map((c: any) => c === undefined || c === null ? '' : String(c)))
  }
  const selectImportPrimaryAction = (action: 'attendance_daily' | 'attendance_fix' | 'profile_update' | 'new_collaborators') => {
    setImportPrimaryAction(action)
    setImportConfigurationCollapsed(false)
    if (action === 'attendance_daily') {
      setImportOperation('attendance_new_only')
      setAttendanceWriteMode('insert_only')
      setAttendanceDailyImportScope('next')
      setShowImportAdvancedOptions(false)
      return
    }
    if (action === 'attendance_fix') {
      setImportOperation('attendance_specific_date')
      setAttendanceWriteMode('upsert')
      setAttendanceCorrectionMode(null)
      setShowImportAdvancedOptions(true)
      return
    }
    if (action === 'profile_update') {
      setImportOperation('profile_specific_columns')
      setShowImportAdvancedOptions(true)
      setShowImportMappingEditor(true)
      return
    }
    setImportOperation('full_overwrite_all')
    setAttendanceWriteMode('upsert')
    setShowImportAdvancedOptions(true)
    setShowImportMappingEditor(true)
  }
  const handleImportSheetChange = async (nextSheet: string) => {
    setImportSheetSelectOpen(false)
    setSelectedImportSheet(nextSheet)
    if (!importWorkbook || !nextSheet) return
    try {
      setImportParsing(true)
      setImportParsingMessage(`Cambiando a hoja "${nextSheet}"...`)
      setImportParsingProgress(15)
      await waitForUiPaint()
      setImportParsingMessage(`Leyendo datos de "${nextSheet}"...`)
      setImportParsingProgress(35)
      const mod = await import('xlsx')
      const XLSX = (mod && (mod.default || mod)) as any
      const sheet = importWorkbook.Sheets[nextSheet]
      if (!sheet) return
      const rawRows = sheetToAbsoluteRows(sheet, XLSX)
      setImportRawRows(rawRows)
      setImportParsingMessage(`Detectando cabecera y columnas en "${nextSheet}"...`)
      setImportParsingProgress(60)
      await waitForUiPaint()
      const parsed = buildRowsFromStartCell(rawRows, 0, 0)
      const rows = parsed.rows
      if (!rows || rows.length === 0) return
      setImportParsingMessage(`Preparando vista previa de "${nextSheet}"...`)
      setImportParsingProgress(85)
      await waitForUiPaint()
      const headers = rows[0].map(h => formatExcelSerialAsDateHeader(h))
      const dataRows = rows.slice(1).filter(r => r.some(cell => cell && String(cell).trim() !== ''))
      setImportHeaders(headers)
      setImportRows(dataRows)
      setImportHeaderStartCell(parsed.headerCell)
      importHeaderStartCellDraftRef.current = parsed.headerCell
      setMapping(autoMatchHeader(headers))
      setImportParsingProgress(100)
      await waitForUiPaint()
    } catch (err) {
      console.error('Error reading selected sheet', err)
      alert('No se pudo leer la hoja seleccionada')
    } finally {
      setImportParsing(false)
      setImportParsingMessage('')
      setImportParsingProgress(0)
    }
  }
  const resetImportState = () => {
    setImportDialogOpen(false)
    setImportHeaders([])
    setImportRows([])
    setImportRawRows([])
    setImportSheetNames([])
    setSelectedImportSheet('')
    setImportWorkbook(null)
    setMapping({})
    setImportHeaderStartCell('A1')
    importHeaderStartCellDraftRef.current = 'A1'
    setImportOperation('attendance_new_only')
    setAttendanceOnlyMode(true)
    setAttendanceWriteMode('insert_only')
    setAttendanceStartDate('')
    setAttendanceEndDate('')
    setAttendanceSelectedDates([])
    setAttendanceStartColumnIndex(-1)
    setAttendanceTargetDocuments([])
    setImportPrimaryAction('attendance_daily')
    setShowImportAdvancedOptions(false)
    setShowImportMappingEditor(false)
    setImportConfigurationCollapsed(false)
    setShowImportPreviewTables(false)
    setShowImportAttendancePreview(false)
    setImportHeaderApplying(false)
    setImportSheetSelectOpen(false)
    setAttendanceCorrectionMode(null)
    setAttendanceCalendarAnchorEl(null)
    setAttendanceCalendarMode('single')
    setPendingImportPrimaryAction(null)
    setAttendanceDailyImportScope('next')
    setImportAttendanceBounds({ min: null, max: null, loading: false })
    setImportParsing(false)
    setImportParsingMessage('')
    setImportParsingProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
    const [addressCountry, setAddressCountry] = useState<string>('')
    const [addressRegion, setAddressRegion] = useState<string>('')
    const [addressCommune, setAddressCommune] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [openEditDialog, setOpenEditDialog] = useState(false)
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [tableSortField, setTableSortField] = useState<TableSortField>('name')
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc')
  const [nameSortBy, setNameSortBy] = useState<'first_name' | 'last_name'>('last_name')
  const [nameSortMenuAnchor, setNameSortMenuAnchor] = useState<null | HTMLElement>(null)
  const [pinnedColumns, setPinnedColumns] = useState<PinColumnKey[]>(['avatar', 'name', 'document', 'email'])
  const [searchTerm, setSearchTerm] = useState('')
  const [workerTypeFilter, setWorkerTypeFilter] = useState<string>('all')
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'active' | 'terminated'>('all')
  const [activeStatusFilterAnchor, setActiveStatusFilterAnchor] = useState<null | HTMLElement>(null)
  const [dailyStatusDate, setDailyStatusDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [roleEffectiveDate, setRoleEffectiveDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [historyPosition, setHistoryPosition] = useState('')
  const [historySpecialty, setHistorySpecialty] = useState('')
  const [historyWorkerType, setHistoryWorkerType] = useState('')
  const [historyValidFrom, setHistoryValidFrom] = useState('')
  const [historyValidTo, setHistoryValidTo] = useState('')
  const [savingRoleHistory, setSavingRoleHistory] = useState(false)
  const [dailyStatusByCollaborator, setDailyStatusByCollaborator] = useState<Record<string, CollaboratorDailyStatus>>({})
  const [dailyStatusDialogOpen, setDailyStatusDialogOpen] = useState(false)
  const [dailyStatusCollaborator, setDailyStatusCollaborator] = useState<Collaborator | null>(null)
  const [dailyStatusValue, setDailyStatusValue] = useState<string>('')
  const [dailyStatusReason, setDailyStatusReason] = useState<string>('')
  const [savingDailyStatus, setSavingDailyStatus] = useState(false)
  const [companyIndustry, setCompanyIndustry] = useState<IndustryType | string>(IndustryType.OTHER)
  const [positionValue, setPositionValue] = useState('')
  const [positionOptions, setPositionOptions] = useState<string[]>([])
  const [positionWarning, setPositionWarning] = useState('')
  const [customPositions, setCustomPositions] = useState<string[]>([])
  const [companyPositionOptions, setCompanyPositionOptions] = useState<string[]>([])
  const [positionError, setPositionError] = useState('')
  const [industryLoaded, setIndustryLoaded] = useState(false)
  const [workerType, setWorkerType] = useState('')
  const [contract, setContract] = useState('')
  const [shiftPattern, setShiftPattern] = useState('')
  const [showWorkerType, setShowWorkerType] = useState(false)
  const [phoneValue, setPhoneValue] = useState<string>('')
  const [emergencyPhoneValue, setEmergencyPhoneValue] = useState<string>('')
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<string>('CL')
  const [selectedEmergencyCountry, setSelectedEmergencyCountry] = useState<string>('CL')
  const [companyCountry, setCompanyCountry] = useState<string>('CL') // Default Chile
  const [salaryValue, setSalaryValue] = useState<string>('')
  const [gender, setGender] = useState<string>('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [specialty, setSpecialty] = useState<string>('')
  const [specialtyOptions, setSpecialtyOptions] = useState<string[]>([])
  const [conditionChoice, setConditionChoice] = useState<string>('')
  const [exceptionChoice, setExceptionChoice] = useState<string>('')
  const [exceptionOther, setExceptionOther] = useState<string>('')
  const existingPositionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          collaborators
            .map((c) => normalizeText(String(c.position || '')))
            .filter(Boolean)
        )
      ),
    [collaborators]
  )
  const existingSpecialtyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          collaborators
            .map((c) => normalizeText(String(c.specialty || '')))
            .filter(Boolean)
        )
      ),
    [collaborators]
  )

  const CONDITION_OPTIONS = [
    'Turno',
    'Descanso',
    'Acreditacion',
    'Oficina Central - Teletrabajo'
  ]
  const DAILY_STATUS_OPTIONS = [
    'Turno',
    'Descanso',
    'Fuera de Obra',
    'Licencia',
    'Vacaciones',
    'Permiso',
    'Teletrabajo',
    'Acreditacion',
    'Finiquitado',
    'Otro'
  ]
  const EXCEPTION_OPTIONS_BASE = [
    'Cursos (Capacitacion)',
    'En Policlinico',
    'Bajada por Orden de Policlinico',
    'Bajada Contingencia familiar',
    'Bajada Otros',
    'Oficina Central - Teletrabajo',
    'Falla (sin justificacion)',
    'Permiso (con goce de sueldo)',
    'Permiso (sin goce de sueldo)'
  ]
  const EXCEPTION_OTHER_OPTION = 'Otros'
  const canonicalExceptionLabel = (raw: string) => {
    const value = String(raw || '').trim()
    if (!value) return ''
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
    if (normalized === 'policlinico' || normalized === 'en policlinico') return 'En Policlinico'
    if (normalized === 'baja por orden de policlinico' || normalized === 'bajada por orden de policlinico') return 'Bajada por Orden de Policlinico'
    if (normalized === 'bajada contingencia familiar' || normalized === 'bajada contigencia familiar') return 'Bajada Contingencia familiar'
    if (normalized === 'bajada otros' || normalized === 'bajada otro') return 'Bajada Otros'
    if (
      normalized === 'oficina central teletrabajo' ||
      normalized === 'oficina central - teletrabajo' ||
      normalized === 'oficina central/teletrabajo'
    ) return 'Oficina Central - Teletrabajo'
    return value
  }

  const exceptionOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const pushUnique = (raw: string) => {
      const value = canonicalExceptionLabel(raw)
      if (!value) return
      const key = value.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push(value)
    }
    EXCEPTION_OPTIONS_BASE.forEach(pushUnique)
    collaborators.forEach((c) => pushUnique(String(c.exception_condition || '')))
    if (exceptionChoice && exceptionChoice !== EXCEPTION_OTHER_OPTION) pushUnique(exceptionChoice)
    if (exceptionOther) pushUnique(exceptionOther)
    pushUnique(EXCEPTION_OTHER_OPTION)
    return out
  }, [collaborators, exceptionChoice, exceptionOther])

  const exceptionCondition = useMemo(() => {
    const selected = String(exceptionChoice || '').trim()
    if (!selected) return ''
    if (selected === EXCEPTION_OTHER_OPTION) return canonicalExceptionLabel(exceptionOther)
    return canonicalExceptionLabel(selected)
  }, [exceptionChoice, exceptionOther])

  const getEffectiveStatus = (collaborator: Collaborator) => {
    if (collaborator?.is_active === false) return 'Finiquitado'
    const daily = dailyStatusByCollaborator[collaborator.id]
    if (daily?.status) return daily.status
    return collaborator.condition || ''
  }

  const setConditionFromValue = (rawValue?: string | null) => {
    const value = String(rawValue || '').trim()
    const predefined = CONDITION_OPTIONS.find((opt) => opt.toLowerCase() === value.toLowerCase())
    setConditionChoice(predefined || '')
  }

  const setExceptionFromValue = (rawValue?: string | null) => {
    const value = canonicalExceptionLabel(String(rawValue || ''))
    if (!value) {
      setExceptionChoice('')
      setExceptionOther('')
      return
    }
    const predefined = EXCEPTION_OPTIONS_BASE.find((opt) => opt.toLowerCase() === value.toLowerCase())
    if (predefined) {
      setExceptionChoice(predefined)
      setExceptionOther('')
      return
    }
    setExceptionChoice(EXCEPTION_OTHER_OPTION)
    setExceptionOther(value)
  }

  // Resetea campos del formulario de creación de colaborador
  const resetCollaboratorForm = () => {
    try {
      const form = document.getElementById('collaborator-form') as HTMLFormElement | null
      if (form) form.reset()
    } catch (e) {
      console.warn('No se pudo resetear el formulario DOM:', e)
    }

    setPhoneValue('')
    setEmergencyPhoneValue('')
    setSelectedPhoneCountry('CL')
    setSelectedEmergencyCountry('CL')
    setSpecialty('')
    setConditionChoice('')
    setExceptionChoice('')
    setExceptionOther('')
    setPositionValue('')
    setWorkerType('')
    setContract('')
    setShiftPattern('')
    setSalaryValue('')
    setGender('')
    setPhotoFile(null)
    setSignatureFile(null)
    setAddressCountry('')
    setAddressRegion('')
    setAddressCommune('')
    setRoleEffectiveDate(new Date().toISOString().slice(0, 10))
    setHistoryPosition('')
    setHistorySpecialty('')
    setHistoryWorkerType('')
    setHistoryValidFrom('')
    setHistoryValidTo('')
  }

  const uploadCollaboratorAssetToR2 = async (
    collaboratorId: string,
    file: File,
    assetType: 'photo' | 'signature'
  ) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, GIF, WebP)')
    }
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error('El archivo es demasiado grande. Máximo 5MB permitido')
    }

    const presignRes = await fetch('/api/collaborators/assets/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collaboratorId,
        assetType,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size
      })
    })
    const presign = await presignRes.json().catch(() => null)
    if (!presignRes.ok || !presign?.uploadUrl || !presign?.key) {
      throw new Error(String(presign?.error || `No se pudo preparar la subida (${assetType})`))
    }

    const putRes = await fetch(String(presign.uploadUrl), {
      method: 'PUT',
      headers: {
        'Content-Type': file.type
      },
      body: file
    })
    if (!putRes.ok) {
      throw new Error(`No se pudo subir el archivo (${assetType}) a R2`)
    }

    return `/api/collaborators/assets/view?key=${encodeURIComponent(String(presign.key))}`
  }

  // Opciones de tallas de ropa (solo letras)
  const clothingSizes = [
    'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'
  ]

  // Opciones de género
  const genderOptions = [
    { value: 'M', label: 'Masculino' },
    { value: 'F', label: 'Femenino' },
    { value: 'O', label: 'Otro' }
  ]

  // Función para formatear moneda según el país
  const formatCurrency = (value: number, country: string) => {
    const currencyMap: Record<string, { currency: string; locale: string }> = {
      'CL': { currency: 'CLP', locale: 'es-CL' }, // Chile
      'AR': { currency: 'ARS', locale: 'es-AR' }, // Argentina
      'PE': { currency: 'PEN', locale: 'es-PE' }, // Perú
      'CO': { currency: 'COP', locale: 'es-CO' }, // Colombia
      'MX': { currency: 'MXN', locale: 'es-MX' }, // México
      'US': { currency: 'USD', locale: 'en-US' }, // Estados Unidos
      'BR': { currency: 'BRL', locale: 'pt-BR' }, // Brasil
      'ES': { currency: 'EUR', locale: 'es-ES' }, // España
      'DE': { currency: 'EUR', locale: 'de-DE' }, // Alemania
      'FR': { currency: 'EUR', locale: 'fr-FR' }, // Francia
    }

    const config = currencyMap[country] || currencyMap['CL'] // Fallback a Chile
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Función para formatear número con separadores de miles
  const formatNumber = (value: number, country: string) => {
    const localeMap: Record<string, string> = {
      'CL': 'es-CL', // Chile
      'AR': 'es-AR', // Argentina
      'PE': 'es-PE', // Perú
      'CO': 'es-CO', // Colombia
      'MX': 'es-MX', // México
      'US': 'en-US', // Estados Unidos
      'BR': 'pt-BR', // Brasil
      'ES': 'es-ES', // España
      'DE': 'de-DE', // Alemania
      'FR': 'fr-FR', // Francia
    }

    const locale = localeMap[country] || localeMap['CL']
    return new Intl.NumberFormat(locale).format(value)
  }

  // Función para manejar el envío del formulario
  const handleSubmitCollaborator = async (formData: FormData) => {
    let photoUrl = null
    let signatureUrl = null
    let collaboratorId = null

    // Obtener y limpiar documento (solo números/letras)
    const rawDocument = (formData.get('document') as string) || ''
    const cleanDocument = rawDocument.replace(/[^a-zA-Z0-9]/g, '')

    // Obtener primer apellido (puede ser el primer string antes de un espacio)
    const rawLastName = (formData.get('last_name') as string) || ''
    const firstSurname = rawLastName.split(' ')[0] || ''

    // Construir contraseña inicial: documento_limpio + '_' + primer apellido (sin espacios)
    const initialPassword = `${cleanDocument}_${firstSurname}`

    // Primero crear el colaborador sin foto
    const collaboratorData = {
      first_name: formData.get('first_name') as string,
      last_name: formData.get('last_name') as string,
      document: cleanDocument,
      email: formData.get('email') as string,
      phone: normalizePhoneForStorage(phoneValue, selectedPhoneCountry), // Teléfono completo con código de país
      address: formData.get('address') as string,
      country: addressCountry,
      region: addressRegion,
      commune: addressCommune,
      position: formData.get('position') as string,
      specialty: formData.get('specialty') as string,
      worker_type: showWorkerType ? workerType : null, // Solo para minería
      contract: contract || null,
      shift_pattern: shiftPattern || null,
      condition: conditionChoice || null,
      exception_condition: exceptionCondition || null,
      salary: parseFloat(salaryValue.replace(/[^\d]/g, '')) || 0,
      birth_date: formData.get('birth_date') as string,
      hire_date: formData.get('hire_date') as string,
      emergency_contact: normalizePhoneForStorage(emergencyPhoneValue, selectedEmergencyCountry), // Teléfono de emergencia con código de país
      upper_clothing_size: formData.get('upper_clothing_size') as string,
      lower_clothing_size: formData.get('lower_clothing_size') as string,
      shoe_size: formData.get('shoe_size') as string,
      gender: gender, // Campo de género
      photo_url: null, // Inicialmente sin foto
      signature_url: null, // Inicialmente sin firma
      epp_details: {},
      is_active: true,
      company_id: session?.user?.companyId,
      password: initialPassword // Enviar contraseña inicial al backend
    }

    if (COLLABORATORS_DEBUG) console.log('📱 Datos del colaborador:', collaboratorData)
    if (COLLABORATORS_DEBUG) console.log('📞 Teléfono completo:', collaboratorData.phone)
    if (COLLABORATORS_DEBUG) console.log('🌍 País detectado:', phoneValue?.substring(0, 3))
    
    try {
      if (COLLABORATORS_DEBUG) console.log('🚀 Enviando datos a la API...')
      const response = await fetch('/api/collaborators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(collaboratorData)
      })
      
      if (COLLABORATORS_DEBUG) console.log('📡 Respuesta de la API:', response.status, response.ok)
      
      if (response.ok) {
        const result = await response.json()
        if (COLLABORATORS_DEBUG) console.log('✅ Colaborador creado exitosamente:', result)
        collaboratorId = result.id
        
        // Ahora subir foto/firma si existe
        if (photoFile && collaboratorId) {
            try {
              if (COLLABORATORS_DEBUG) console.log('📸 Iniciando subida de foto...')
            if (COLLABORATORS_DEBUG) console.log('📁 Archivo:', photoFile.name, 'Tamaño:', photoFile.size, 'bytes')
            photoUrl = await uploadCollaboratorAssetToR2(String(collaboratorId), photoFile, 'photo')
            if (COLLABORATORS_DEBUG) console.log('🔗 URL pública generada:', photoUrl)
          } catch (error) {
            console.error('❌ Error procesando foto:', error)
            alert(`Error al procesar la foto: ${error instanceof Error ? error.message : 'Error desconocido'}. El colaborador fue creado sin foto.`)
          }
        }
        if (signatureFile && collaboratorId) {
          try {
            signatureUrl = await uploadCollaboratorAssetToR2(String(collaboratorId), signatureFile, 'signature')
            if (COLLABORATORS_DEBUG) console.log('✅ Firma subida exitosamente')
          } catch (error) {
            console.error('❌ Error procesando firma:', error)
            alert(`Error al procesar la firma: ${error instanceof Error ? error.message : 'Error desconocido'}. El colaborador fue creado sin firma.`)
          }
        }

        if ((photoUrl || signatureUrl) && collaboratorId) {
          const updateResponse = await fetch('/api/collaborators', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: collaboratorId,
              photo_url: photoUrl,
              signature_url: signatureUrl
            })
          })
          if (!updateResponse.ok) {
            console.warn('⚠️ Colaborador creado pero no se pudo actualizar URL de foto/firma')
          }
        }
        
        alert('Colaborador creado exitosamente')
        // Limpiar formulario y cerrar modal
        resetCollaboratorForm()
        setOpenDialog(false)
        // Refrescar lista de colaboradores y defaults de la compañía
        try {
          const resp = await fetch('/api/collaborators')
          if (resp.ok) {
            const data = await resp.json()
            setCollaborators(data)
          }
          if (session?.user?.companyId) await fetchCompanyData(session.user.companyId)
        } catch (e) {
          console.warn('No se pudo refrescar tras crear colaborador:', e)
          // Como fallback recargar la página
          window.location.reload()
        }
      } else {
        const error = await response.json()
        console.error('❌ Error al crear colaborador:', error)
        
        // Mostrar mensaje específico según el tipo de error
        let errorMessage = 'Error desconocido'
        
        if (error.code === 'COLLABORATOR_EXISTS') {
          errorMessage = `❌ Colaborador ya existe\n\n${error.details}\n\nPor favor usa un email diferente.`
        } else if (error.code === 'USER_EXISTS') {
          errorMessage = `❌ Usuario ya existe\n\n${error.details}\n\nPor favor usa un email diferente.`
        } else if (error.code === 'MISSING_SERVICE_KEY') {
          errorMessage = `❌ Configuración faltante\n\n${error.details}\n\nContacta al administrador del sistema.`
        } else if (error.details) {
          errorMessage = `❌ Error: ${error.error}\n\n${error.details}`
        } else {
          errorMessage = `❌ Error al crear colaborador: ${error.error || error.message || 'Error desconocido'}`
        }
        
        alert(errorMessage)
      }
    } catch (error) {
      console.error('❌ Error de red:', error)
      alert(`Error de conexión: ${error}`)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  // Cargar industria de la empresa y opciones de cargos
  useEffect(() => {
    const loadCompanyIndustry = async () => {
      if (session?.user?.companyId) {
        await fetchCompanyData(session.user.companyId)
      }
    }

    loadCompanyIndustry()
  }, [session?.user?.companyId])

  // Función para obtener y aplicar datos de la compañía (industry, country, defaults)
  const fetchCompanyData = async (companyId: string) => {
    try {
      if (COLLABORATORS_DEBUG) console.log('🔍 fetchCompanyData:', companyId)
      const response = await fetch(`/api/companies/${companyId}`)
      if (!response.ok) {
        console.warn('No se pudo obtener datos de la empresa:', response.status)
        return
      }
      const companyData = await response.json()
      const industry = companyData.industry || IndustryType.OTHER
      const country = companyData.country || 'CL'
      setCompanyIndustry(industry)
      setCompanyCountry(country)

      // default_specialties
      let companySpecialties: string[] = []
      if (companyData.default_specialties) {
        if (Array.isArray(companyData.default_specialties)) {
          companySpecialties = companyData.default_specialties.map((s: any) => normalizeText(String(s))).filter(Boolean)
        } else if (typeof companyData.default_specialties === 'string') {
          try {
            const parsed = JSON.parse(companyData.default_specialties)
            if (Array.isArray(parsed)) companySpecialties = parsed.map((s: any) => normalizeText(String(s))).filter(Boolean)
            else companySpecialties = String(parsed).split(',').map((s: string) => normalizeText(s)).filter(Boolean)
          } catch (e) {
            companySpecialties = companyData.default_specialties.split(',').map((s: string) => normalizeText(s)).filter(Boolean)
          }
        }
      }
      setSpecialtyOptions(Array.from(new Set([...companySpecialties, ...existingSpecialtyOptions])))

      // default_positions
      const standardPositions = getSuggestedPositions(industry)
      let companyPositionsLocal: string[] = []
      if (companyData.default_positions) {
        if (Array.isArray(companyData.default_positions)) {
          companyPositionsLocal = companyData.default_positions.map((s: any) => normalizeText(String(s))).filter(Boolean)
        } else if (typeof companyData.default_positions === 'string') {
          try {
            const parsed = JSON.parse(companyData.default_positions)
            if (Array.isArray(parsed)) companyPositionsLocal = parsed.map((s: any) => normalizeText(String(s))).filter(Boolean)
            else companyPositionsLocal = String(parsed).split(',').map((s: string) => normalizeText(s)).filter(Boolean)
          } catch (e) {
            companyPositionsLocal = companyData.default_positions.split(',').map((s: string) => normalizeText(s)).filter(Boolean)
          }
        }
      }
      setCompanyPositionOptions(companyPositionsLocal)
      const merged = Array.from(new Set([...
        standardPositions,
        ...companyPositionsLocal,
        ...existingPositionOptions,
        ...customPositions
      ]))
      setPositionOptions(merged)
      setShowWorkerType(industry === 'Minería')
      setIndustryLoaded(true)
    } catch (error) {
      console.error('❌ Error fetchCompanyData:', error)
    }
  }

  // Recalcula positionOptions a partir de fuentes actuales (estándar, company, custom)
  const recomputePositionOptions = () => {
    try {
      const standardPositions = getSuggestedPositions(companyIndustry)
      const merged = Array.from(new Set([...
        standardPositions,
        ...companyPositionOptions,
        ...existingPositionOptions,
        ...customPositions
      ]))
      setPositionOptions(merged)
    } catch (e) {
      console.warn('Error recomputePositionOptions', e)
    }
  }

  const recomputeSpecialtyOptions = () => {
    try {
      setSpecialtyOptions(prev => Array.from(new Set([...(prev || []), ...existingSpecialtyOptions])))
    } catch (e) {
      console.warn('Error recomputeSpecialtyOptions', e)
    }
  }

  useEffect(() => {
    if (existingSpecialtyOptions.length === 0) return
    setSpecialtyOptions(prev => Array.from(new Set([...(prev || []), ...existingSpecialtyOptions])))
  }, [existingSpecialtyOptions])

  // Actualizar opciones cuando cambien los cargos personalizados
  useEffect(() => {
    if (industryLoaded) {
      recomputePositionOptions()
    }
  }, [customPositions, companyIndustry, industryLoaded, companyPositionOptions, existingPositionOptions])

  useEffect(() => {
    const fetchCollaborators = async () => {
      const role = String((session?.user as any)?.role || '').trim().toLowerCase()
      if (!session?.user?.companyId && role !== 'dev') {
        setCollaborators([])
        setLoading(false)
        return
      }

      try {
        if (!collaboratorsPageInFlight) {
          collaboratorsPageInFlight = (async () => {
            if (collaboratorsPageCache) return collaboratorsPageCache

            const response = await fetch('/api/collaborators')
            if (!response.ok) {
              const err = await response.json().catch(() => ({}))
              console.error('Error fetching collaborators:', response.status, err)
              return []
            }

            const data = await response.json()
            const rows = Array.isArray(data) ? data : []
            collaboratorsPageCache = rows
            return rows
          })().finally(() => {
            collaboratorsPageInFlight = null
          })
        }

        const data = collaboratorsPageCache || await collaboratorsPageInFlight || []
        setCollaborators(data)
      } catch (error) {
        console.error('Error fetching collaborators:', error)
        setCollaborators([])
      } finally {
        setLoading(false)
      }
    }

    const role = String((session?.user as any)?.role || '').trim().toLowerCase()
    if (session?.user?.companyId || role === 'dev') {
      fetchCollaborators()
    }
  }, [session])

  useEffect(() => {
    let mounted = true

    const loadDailyStatus = async () => {
      const query = `date=${encodeURIComponent(dailyStatusDate)}&lean=1`

      try {
        if (!collaboratorsDailyStatusInFlight.has(query)) {
          collaboratorsDailyStatusInFlight.set(query, (async () => {
            const response = await fetch(`/api/collaborators/daily-status?${query}`)
            const payload = await response.json().catch(() => ({}))

            if (!response.ok) {
              if (response.status === 501) {
                console.warn('Daily status table missing. Run migration 20260427_create_pr_collaborator_daily_status.sql')
              } else {
                console.warn('Could not load daily status:', payload)
              }
              return []
            }

            const rows: CollaboratorDailyStatus[] = Array.isArray(payload?.rows) ? payload.rows : []
            collaboratorsDailyStatusCache.set(query, rows)
            return rows
          })().finally(() => {
            collaboratorsDailyStatusInFlight.delete(query)
          }))
        }

        const rows =
          collaboratorsDailyStatusCache.get(query) ||
          (await collaboratorsDailyStatusInFlight.get(query)) ||
          []

        const mapped: Record<string, CollaboratorDailyStatus> = {}
        rows.forEach((row: any) => {
          const collaboratorId = String(row?.collaborator_id || '').trim()
          if (!collaboratorId) return

          mapped[collaboratorId] = {
            id: row.id,
            collaborator_id: collaboratorId,
            work_date: String(row.work_date || dailyStatusDate),
            status: String(row.status || ''),
            reason: row.reason ?? null,
          }
        })

        if (mounted) setDailyStatusByCollaborator(mapped)
      } catch (err) {
        console.warn('Error loading daily status', err)
        if (mounted) setDailyStatusByCollaborator({})
      }
    }

    loadDailyStatus()

    return () => {
      mounted = false
    }
  }, [dailyStatusDate, session?.user?.companyId, session?.user?.id])

  const openDailyStatusDialog = (collaborator: Collaborator) => {
    setDailyStatusCollaborator(collaborator)
    const current = dailyStatusByCollaborator[collaborator.id]
    setDailyStatusValue(current?.status || '')
    setDailyStatusReason(String(current?.reason || ''))
    setDailyStatusDialogOpen(true)
  }

  const saveDailyStatus = async () => {
    if (!dailyStatusCollaborator?.id || !dailyStatusValue) {
      alert('Debes seleccionar un estado diario')
      return
    }
    try {
      setSavingDailyStatus(true)
      const response = await fetch('/api/collaborators/daily-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dailyStatusDate,
          collaborator_id: dailyStatusCollaborator.id,
          status: dailyStatusValue,
          reason: dailyStatusReason || null
        })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const msg = String(payload?.error || 'No se pudo guardar el estado diario')
        alert(msg)
        return
      }
      const savedRow = Array.isArray(payload?.rows) ? payload.rows[0] : null
      setDailyStatusByCollaborator((prev) => ({
        ...prev,
        [dailyStatusCollaborator.id]: {
          id: savedRow?.id,
          collaborator_id: dailyStatusCollaborator.id,
          work_date: String(savedRow?.work_date || dailyStatusDate),
          status: dailyStatusValue,
          reason: dailyStatusReason || null
        }
      }))
      setDailyStatusDialogOpen(false)
    } catch (err) {
      console.error('Error saving daily status', err)
      alert('Error guardando estado diario')
    } finally {
      setSavingDailyStatus(false)
    }
  }

  const handleAddCollaborator = () => {
    // Limpiar cualquier estado previo antes de abrir el modal de creación
    resetCollaboratorForm()
    setEditingCollaborator(null)
    if (session?.user?.companyId) fetchCompanyData(session.user.companyId).catch(err => console.warn(err))
    setOpenDialog(true)
  }

  const handleEditCollaborator = (collaborator: Collaborator) => {
    setEditingCollaborator(collaborator)
    setPhotoFile(null)
    setSignatureFile(null)
    
    // Parsear teléfonos para extraer código de país y número
    const phoneData = parsePhoneNumber(collaborator.phone || '')
    const emergencyPhoneData = parsePhoneNumber(collaborator.emergency_contact || '')
    
    // Establecer los valores de teléfono (solo el número, sin código de país)
    setPhoneValue(normalizePhoneForStorage(collaborator.phone || '', phoneData.country))
    setEmergencyPhoneValue(normalizePhoneForStorage(collaborator.emergency_contact || '', emergencyPhoneData.country))
    setSelectedPhoneCountry(phoneData.country)
    setSelectedEmergencyCountry(emergencyPhoneData.country)
    
    // Establecer otros valores
    setPositionValue(collaborator.position || '')
    setWorkerType(normalizeWorkerType(collaborator.worker_type))
    setContract(collaborator.contract || '')
    setShiftPattern(collaborator.shift_pattern || '')
    setConditionFromValue(collaborator.is_active === false ? 'Finiquitado' : (collaborator.condition || ''))
    setExceptionFromValue(collaborator.exception_condition || '')
    setSalaryValue(collaborator.salary ? formatNumber(collaborator.salary, companyCountry || 'CL') : '')
    setSpecialty(collaborator.specialty || '')
    setRoleEffectiveDate(new Date().toISOString().slice(0, 10))
    setHistoryPosition(collaborator.position || '')
    setHistorySpecialty(collaborator.specialty || '')
    setHistoryWorkerType(normalizeWorkerType(collaborator.worker_type))
    setHistoryValidFrom('')
    setHistoryValidTo('')
    setAddressCountry(collaborator.country || '')
    setAddressRegion(collaborator.region || '')
    setAddressCommune(collaborator.commune || '')
    setOpenEditDialog(true)
  }

  const handleUpdateCollaborator = async (formData: FormData) => {
    try {
      if (COLLABORATORS_DEBUG) console.log('🔄 Iniciando actualización de colaborador...')

      let photoUrl = editingCollaborator?.photo_url || null
      let signatureUrl = editingCollaborator?.signature_url || null
      
      // Si hay una nueva foto, subirla
      if (photoFile && editingCollaborator?.id) {
        try {
          if (COLLABORATORS_DEBUG) console.log('📸 Iniciando subida de nueva foto...')
          if (COLLABORATORS_DEBUG) console.log('📁 Archivo:', photoFile.name, 'Tamaño:', photoFile.size, 'bytes')
          photoUrl = await uploadCollaboratorAssetToR2(String(editingCollaborator.id), photoFile, 'photo')
          if (COLLABORATORS_DEBUG) console.log('🔗 URL pública generada:', photoUrl)
          
        } catch (error) {
          console.error('❌ Error procesando foto:', error)
          alert(`Error al procesar la foto: ${error instanceof Error ? error.message : 'Error desconocido'}. Continuando sin actualizar la foto...`)
        }
      }
      if (signatureFile && editingCollaborator?.id) {
        try {
          signatureUrl = await uploadCollaboratorAssetToR2(String(editingCollaborator.id), signatureFile, 'signature')
          if (COLLABORATORS_DEBUG) console.log('✅ Firma subida exitosamente')
        } catch (error) {
          console.error('❌ Error procesando firma:', error)
          alert(`Error al procesar la firma: ${error instanceof Error ? error.message : 'Error desconocido'}. Continuando sin actualizar la firma...`)
        }
      }
      
      // Limpiar documento para evitar guardar puntos/guión (mostrar puede ser formateado)
      const rawDocument = (formData.get('document') as string) || ''
      const cleanDocument = rawDocument.replace(/[^a-zA-Z0-9]/g, '')
      const normalizeDateInput = (value: FormDataEntryValue | null): string | null => {
        const parsed = String(value ?? '').trim()
        return parsed.length > 0 ? parsed : null
      }
      const normalizeSelectInput = (value: FormDataEntryValue | null): string | null => {
        const parsed = String(value ?? '').trim()
        return parsed.length > 0 ? parsed : null
      }

      const collaboratorData = {
        first_name: formData.get('first_name') as string,
        last_name: formData.get('last_name') as string,
        document: cleanDocument,
        email: formData.get('email') as string,
        phone: normalizePhoneForStorage(phoneValue, selectedPhoneCountry),
        address: formData.get('address') as string,
        country: addressCountry,
        region: addressRegion,
        commune: addressCommune,
        position: positionValue,
        specialty: specialty,
        worker_type: normalizeWorkerType(workerType),
        contract: contract || null,
        shift_pattern: shiftPattern || null,
        condition: conditionChoice || null,
        exception_condition: exceptionCondition || null,
        salary: salaryValue ? parseFloat(salaryValue.replace(/[^0-9]/g, '')) : null,
        birth_date: normalizeDateInput(formData.get('birth_date')),
        hire_date: normalizeDateInput(formData.get('hire_date')),
        emergency_contact: normalizePhoneForStorage(emergencyPhoneValue, selectedEmergencyCountry),
        upper_clothing_size: normalizeSelectInput(formData.get('upper_clothing_size')),
        lower_clothing_size: normalizeSelectInput(formData.get('lower_clothing_size')),
        shoe_size: normalizeSelectInput(formData.get('shoe_size')),
        gender: normalizeSelectInput(formData.get('gender')),
        photo_url: photoUrl,
        signature_url: signatureUrl,
        epp_details: {},
        role_effective_date: roleEffectiveDate || new Date().toISOString().slice(0, 10),
        is_active: (conditionChoice === 'Finiquitado')
          ? false
          : (editingCollaborator?.is_active ?? true),
        company_id: session?.user?.companyId
      }

      if (COLLABORATORS_DEBUG) console.log('📱 Datos del colaborador:', collaboratorData)

      const response = await fetch('/api/collaborators', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingCollaborator?.id,
          ...collaboratorData
        })
      })

      const result = await response.json()
      if (COLLABORATORS_DEBUG) console.log('📡 Respuesta de la API:', response.status, response.ok)

      if (response.ok) {
        if (COLLABORATORS_DEBUG) console.log('✅ Colaborador actualizado exitosamente:', result)
        const requestedFirstName = String(collaboratorData.first_name || '').trim()
        const requestedLastName = String(collaboratorData.last_name || '').trim()
        const persistedFirstName = String(result?.first_name || '').trim()
        const persistedLastName = String(result?.last_name || '').trim()
        if (
          (requestedFirstName && requestedFirstName !== persistedFirstName) ||
          (requestedLastName && requestedLastName !== persistedLastName)
        ) {
          console.warn('⚠️ Diferencia entre valor enviado y persistido en DB', {
            requestedFirstName,
            persistedFirstName,
            requestedLastName,
            persistedLastName
          })
        }
        alert('✅ Colaborador actualizado exitosamente')
        setOpenEditDialog(false)
        setEditingCollaborator(null)
        // Recargar la lista de colaboradores
        if (session?.user?.companyId) {
          const response = await fetch('/api/collaborators')
          if (response.ok) {
            const data = await response.json()
            setCollaborators(data)
          }
        }
      } else {
        console.error('❌ Error al actualizar colaborador:', result)
        alert(`❌ Error al actualizar colaborador: ${result.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('❌ Error de red:', error)
      alert(`❌ Error de red: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  const handleSaveRoleHistoryCorrection = async () => {
    if (!editingCollaborator?.id) return
    if (!historyValidFrom) {
      alert('Indica la fecha desde para la corrección histórica.')
      return
    }
    if (historyValidTo && historyValidTo < historyValidFrom) {
      alert('La fecha hasta no puede ser menor que la fecha desde.')
      return
    }
    if (!String(historyPosition || '').trim() && !String(historySpecialty || '').trim() && !String(historyWorkerType || '').trim()) {
      alert('Indica al menos cargo, especialidad o tipo para la corrección histórica.')
      return
    }
    setSavingRoleHistory(true)
    try {
      const response = await fetch('/api/collaborators/role-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collaborator_id: editingCollaborator.id,
          position: historyPosition,
          specialty: historySpecialty,
          worker_type: normalizeWorkerType(historyWorkerType),
          valid_from: historyValidFrom,
          valid_to: historyValidTo || null,
        })
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(String(result?.error || 'No se pudo guardar la corrección histórica'))
      alert('Corrección histórica guardada. Los reportes de ese rango usarán ese cargo.')
    } catch (error) {
      console.error('Error guardando corrección histórica:', error)
      alert(error instanceof Error ? error.message : 'Error guardando corrección histórica')
    } finally {
      setSavingRoleHistory(false)
    }
  }

  const handleDeactivateCollaborator = async (collaborator: Collaborator) => {
    if (!confirm(`¿Estás seguro de que quieres desactivar a ${capitalizeText(collaborator.first_name)} ${capitalizeText(collaborator.last_name)}?`)) {
      return
    }

    try {
      if (COLLABORATORS_DEBUG) console.log('🔄 Desactivando colaborador:', collaborator.id)
      
      const response = await fetch('/api/collaborators', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: collaborator.id,
          is_active: false,
          condition: 'Finiquitado'
        })
      })

      const result = await response.json()
      if (COLLABORATORS_DEBUG) console.log('📡 Respuesta de la API:', response.status, response.ok)

      if (response.ok) {
        if (COLLABORATORS_DEBUG) console.log('✅ Colaborador desactivado exitosamente')
        alert('✅ Colaborador desactivado exitosamente')
        // Recargar la lista de colaboradores
        if (session?.user?.companyId) {
          const response = await fetch('/api/collaborators')
          if (response.ok) {
            const data = await response.json()
            setCollaborators(data)
          }
        }
      } else {
        console.error('❌ Error al desactivar colaborador:', result)
        alert(`❌ Error al desactivar colaborador: ${result.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('❌ Error de red:', error)
      alert(`❌ Error de red: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  const handleActivateCollaborator = async (collaborator: Collaborator) => {
    if (!confirm(`¿Estás seguro de que quieres activar a ${capitalizeText(collaborator.first_name)} ${capitalizeText(collaborator.last_name)}?`)) {
      return
    }

    try {
      if (COLLABORATORS_DEBUG) console.log('🔄 Activando colaborador:', collaborator.id)

      const response = await fetch('/api/collaborators', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: collaborator.id,
          is_active: true,
          condition: ''
        })
      })

      const result = await response.json()
      if (COLLABORATORS_DEBUG) console.log('📡 Respuesta de la API:', response.status, response.ok)

      if (response.ok) {
        if (COLLABORATORS_DEBUG) console.log('✅ Colaborador activado exitosamente')
        alert('✅ Colaborador activado exitosamente')
        // Recargar la lista de colaboradores
        if (session?.user?.companyId) {
          const resp = await fetch('/api/collaborators')
          if (resp.ok) {
            const data = await resp.json()
            setCollaborators(data)
          }
        }
      } else {
        console.error('❌ Error al activar colaborador:', result)
        alert(`❌ Error al activar colaborador: ${result.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('❌ Error de red:', error)
      alert(`❌ Error de red: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  const handleUploadFile = () => {
    resetImportState()
    // Show instructions first, then let the user pick a file
    setImportInstructionsOpen(true)
  }

  const chooseImportActionAndFile = (action: ImportPrimaryAction) => {
    if (showAttendanceForUser && action !== 'attendance_daily' && action !== 'new_collaborators') return
    setPendingImportPrimaryAction(action)
    selectImportPrimaryAction(action)
    setImportInstructionsOpen(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const parseCSV = (text: string) => {
    const rows: string[][] = []
    let cur = ''
    let row: string[] = []
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"') {
        if (inQuotes && text[i+1] === '"') { cur += '"'; i++ } else { inQuotes = !inQuotes }
        continue
      }
      if (ch === ',' && !inQuotes) {
        row.push(cur); cur = ''
        continue
      }
      if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (cur !== '' || row.length > 0) {
          row.push(cur); rows.push(row); row = []; cur = ''
        }
        continue
      }
      cur += ch
    }
    if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row) }
    return rows
  }

  const columnNumberToLetter = (colNumber: number) => {
    let dividend = Math.max(1, colNumber)
    let colLetter = ''
    while (dividend > 0) {
      const modulo = (dividend - 1) % 26
      colLetter = String.fromCharCode(65 + modulo) + colLetter
      dividend = Math.floor((dividend - modulo) / 26)
    }
    return colLetter
  }

  const parseCellReference = (value: string): { rowIdx: number; colIdx: number } | null => {
    const m = String(value || '').trim().toUpperCase().match(/^([A-Z]+)(\d+)$/)
    if (!m) return null
    const letters = m[1]
    const rowNumber = Number(m[2])
    if (!Number.isFinite(rowNumber) || rowNumber < 1) return null

    let colNumber = 0
    for (let i = 0; i < letters.length; i += 1) {
      colNumber = colNumber * 26 + (letters.charCodeAt(i) - 64)
    }
    if (colNumber < 1) return null
    return { rowIdx: rowNumber - 1, colIdx: colNumber - 1 }
  }

  const buildRowsFromStartCell = (
    rawRows: string[][],
    rowIdx: number,
    colIdx: number
  ): { rows: string[][]; headerCell: string } => {
    if (!Array.isArray(rawRows) || rawRows.length === 0) return { rows: [], headerCell: 'A1' }
    const safeRow = Math.max(0, rowIdx)
    const safeCol = Math.max(0, colIdx)
    const rows = rawRows
      .slice(safeRow)
      .map((r) => (Array.isArray(r) ? r : []).slice(safeCol))
      .map((r) => r.map((c) => (c === undefined || c === null ? '' : String(c))))
    return { rows, headerCell: `${columnNumberToLetter(safeCol + 1)}${safeRow + 1}` }
  }

  const formatExcelSerialAsDateHeader = (value: unknown) => {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    if (!/^\d+(\.0+)?$/.test(raw)) return raw

    const serial = Math.round(Number(raw))
    // Rango razonable para fechas Excel modernas (aprox 1954-2064)
    if (!Number.isFinite(serial) || serial < 20000 || serial > 60000) return raw

    const excelEpoch = Date.UTC(1899, 11, 30)
    const utcMs = excelEpoch + serial * 86400000
    const date = new Date(utcMs)
    if (Number.isNaN(date.getTime())) return raw

    const dd = String(date.getUTCDate()).padStart(2, '0')
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
    const yyyy = date.getUTCFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  const parseHeaderDateToISO = (value: unknown): string | null => {
    const raw = String(value ?? '').trim()
    if (!raw) return null

    if (/^\d+(\.0+)?$/.test(raw)) {
      const serial = Math.round(Number(raw))
      if (Number.isFinite(serial) && serial >= 20000 && serial <= 60000) {
        const excelEpoch = Date.UTC(1899, 11, 30)
        const dt = new Date(excelEpoch + serial * 86400000)
        if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
      }
    }

    const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (ddmmyyyy) {
      const day = Number(ddmmyyyy[1])
      const month = Number(ddmmyyyy[2])
      const year = Number(ddmmyyyy[3])
      const dt = new Date(Date.UTC(year, month - 1, day))
      if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
    }

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

    // Supports headers like 01-Apr, 1-Apr-2026, 01-abr, 01-abril-2026, 07-ene
    const monthMap: Record<string, number> = {
      jan: 1, ene: 1, enero: 1,
      feb: 2, febrero: 2,
      mar: 3, marzo: 3,
      apr: 4, abr: 4, abril: 4,
      may: 5, mayo: 5,
      jun: 6, junio: 6,
      jul: 7, julio: 7,
      aug: 8, ago: 8, agosto: 8,
      sep: 9, sept: 9, septiembre: 9,
      oct: 10, octubre: 10,
      nov: 11, noviembre: 11,
      dec: 12, dic: 12, diciembre: 12,
    }
    const monthHeader = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/_/g, '-')
      .replace(/\s+/g, '-')
    const dayMonth = monthHeader.match(/^(\d{1,2})[-\/]([a-z]+)(?:[-\/](\d{2,4}))?$/)
    if (dayMonth) {
      const day = Number(dayMonth[1])
      const month = monthMap[dayMonth[2]]
      let year = dayMonth[3] ? Number(dayMonth[3]) : new Date().getFullYear()
      if (year < 100) year += 2000
      if (month && day >= 1 && day <= 31) {
        const dt = new Date(Date.UTC(year, month - 1, day))
        if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
      }
    }

    return null
  }

  const formatIsoDateToDisplay = (isoDate: string) => {
    const iso = String(isoDate || '').trim()
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return iso
    return `${m[3]}/${m[2]}/${m[1]}`
  }
  const parseIsoDateToLocalDate = (isoDate: string): Date | null => {
    const m = String(isoDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  const localDateToIsoDate = (date: Date | null): string => {
    if (!date || Number.isNaN(date.getTime())) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const addDaysToIsoDate = (isoDate: string, offsetDays: number): string | null => {
    const m = String(isoDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    if (Number.isNaN(dt.getTime())) return null
    dt.setUTCDate(dt.getUTCDate() + Number(offsetDays || 0))
    return dt.toISOString().slice(0, 10)
  }
  const mapAttendanceCodeToStatusPreview = (rawValue: unknown) => {
    const key = String(rawValue || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
    if (!key) return ''
    if (key === '11' || key === 'TURNO' || key === 'PRESENTE' || key === 'ENURNO') return 'Turno'
    if (key === 'D' || key === 'DESCANSO') return 'Descanso'
    if (key === 'FO' || key === 'FUERADEOBRA') return 'Fuera de Obra'
    if (key === 'AC' || key === 'ACRED' || key === 'ACREDITACION') return 'Acreditacion'
    if (key === 'P' || key === 'PERMISO') return 'Permiso'
    if (key === 'L' || key === 'LICENCIA') return 'Licencia'
    if (key === 'FIN' || key === 'FINIQUITADO' || key === 'FINIQUITADOR') return 'Finiquitado'
    return ''
  }

  const normalizeHeaderKey = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const headerMapKey = (header: string, idx: number) => `${idx}::${String(header || '')}`

  const autoMatchHeader = (headers: string[]) => {
    const normalizedContains = (source: string, candidate: string) => {
      const s = normalizeHeaderKey(source)
      const c = normalizeHeaderKey(candidate)
      if (!s || !c) return false
      return s === c || s.includes(c)
    }

    const containsAllTokens = (source: string, tokens: string[]) => {
      const s = ` ${normalizeHeaderKey(source)} `
      return tokens.every((token) => s.includes(` ${normalizeHeaderKey(token)} `))
    }

    const candidates: Record<string,string[]> = {
      first_name: ['first_name','firstname','primer nombre','segundo nombre','nombres','nombre','name','given name'],
      last_name: ['last_name','lastname','apellidos','apellido','ape paterno','ape materno','surname','family name'],
      document: ['document','documento','n documento','nro documento','num documento','rut','dni','cedula','ci','identificacion'],
      email: ['email','e-mail','correo','correo electronico','mail','email address'],
      phone: ['phone','telefono','tel','fono','celular','movil','mobile','telefono celular'],
      address: ['address','direccion','domicilio','residencia','calle','ubicacion'],
      position: ['position','cargo','puesto','rol','funcion','ocupacion','job title'],
      specialty: ['specialty','especialidad','disciplina','area'],
      worker_type: ['worker_type','tipo trabajador','tipo de trabajador','tipo trabajador rrll','worker type'],
      contract: ['contract','contrato','tipo contrato','tipo de contrato'],
      shift_pattern: ['shift_pattern','turno','jornada','rol turno','patron turno','patron de turno','regimen','sistema de turno'],
      condition: ['condition','condicion','estado','situacion','estado actual','status'],
      exception_condition: ['exception_condition','condicion excepcion','excepcion','motivo excepcion','detalle excepcion'],
      salary: ['salary','sueldo','salario','renta','remuneracion'],
      birth_date: ['birth_date','fecha nacimiento','nacimiento','f nac','fecha de nacimiento'],
      hire_date: ['hire_date','fecha contrato','fecha ingreso','ingreso','f ingreso','fecha de contratacion','fecha contratacion'],
      emergency_contact: ['emergency_contact','contacto emergencia','telefono emergencia','fono emergencia'],
      upper_clothing_size: ['upper_clothing_size','talla superior','talla polera','talla camisa','talla chaqueta'],
      lower_clothing_size: ['lower_clothing_size','talla inferior','talla pantalon'],
      shoe_size: ['shoe_size','talla calzado','talla zapato','n de zapato','n zapato'],
      gender: ['gender','sexo','genero'],
      photo_url: ['photo_url','foto','avatar','imagen','url foto'],
      signature_url: ['signature_url','firma','signature','url firma'],
      epp_details: ['epp_details','epp','equipo proteccion','equipo de proteccion','detalle epp'],
      is_active: ['is_active','activo','vigencia','vigente','estado laboral','habilitado'],
      password: ['password','contrasena','clave','pass']
    }
    const map: Record<string,string> = {}
    headers.forEach((h, idx) => {
      const key = headerMapKey(h, idx)
      const low = normalizeHeaderKey(h)
      let matched = ''

      // Explicit RRLL mappings requested by business.
      if (containsAllTokens(low, ['cargo', 'acreditacion'])) {
        map[key] = 'ignore'
        return
      }
      if (normalizedContains(low, 'clasificacion')) {
        map[key] = 'worker_type'
        return
      }
      if (normalizedContains(low, 'paterno')) {
        map[key] = 'last_name'
        return
      }
      if (normalizedContains(low, 'materno')) {
        map[key] = 'last_name'
        return
      }
      if (containsAllTokens(low, ['procedencia', 'lugar', 'origen'])) {
        map[key] = 'region'
        return
      }
      if (normalizedContains(low, 'ctto')) {
        map[key] = 'contract'
        return
      }
      if (normalizedContains(low, 'especialidad')) {
        map[key] = 'specialty'
        return
      }

      for (const key of Object.keys(candidates)) {
        const arr = candidates[key]
        if (arr.some((a) => normalizedContains(low, a))) { matched = key; break }
      }

      if (!matched) {
        if (containsAllTokens(low, ['fecha', 'nacimiento'])) matched = 'birth_date'
        else if (containsAllTokens(low, ['fecha', 'ingreso'])) matched = 'hire_date'
        else if (containsAllTokens(low, ['tipo', 'trabajador'])) matched = 'worker_type'
        else if (containsAllTokens(low, ['tipo', 'contrato'])) matched = 'contract'
        else if (containsAllTokens(low, ['contacto', 'emergencia'])) matched = 'emergency_contact'
        else if (containsAllTokens(low, ['talla', 'superior'])) matched = 'upper_clothing_size'
        else if (containsAllTokens(low, ['talla', 'inferior'])) matched = 'lower_clothing_size'
        else if (containsAllTokens(low, ['talla', 'calzado'])) matched = 'shoe_size'
      }
      map[key] = matched || 'ignore'
    })
    return map
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const f = e.target.files && e.target.files[0]
    if (!f) return
    // Allow selecting the same file again without refreshing the page.
    input.value = ''

    const applyRowsToImport = (rows: string[][], sourceSheet?: string, headerCell = 'A1') => {
      if (!rows || rows.length === 0) {
        alert('Archivo/hoja vacía o inválida')
        return
      }
      const headers = rows[0].map(h => formatExcelSerialAsDateHeader(h))
      const dataRows = rows.slice(1).filter(r => r.some(cell => cell && String(cell).trim() !== ''))
      setImportHeaders(headers)
      setImportRows(dataRows)
      setImportHeaderStartCell(headerCell)
      importHeaderStartCellDraftRef.current = headerCell
      setMapping(autoMatchHeader(headers))
      setImportDialogOpen(true)
      if (COLLABORATORS_DEBUG) console.log('Import: sheet=', sourceSheet || 'N/A')
      if (COLLABORATORS_DEBUG) console.log('Import: header start cell=', headerCell)
      if (COLLABORATORS_DEBUG) console.log('Import: headers=', headers)
      if (COLLABORATORS_DEBUG) console.log('Import: dataRows count=', dataRows.length, 'sample=', dataRows.slice(0,3))
    }

    const parseExcelSheet = async (wb: any, sheetName: string) => {
      const mod = await import('xlsx')
      const XLSX = (mod && (mod.default || mod)) as any
      const sheet = wb.Sheets[sheetName]
      if (!sheet) return { rows: [] as string[][], headerCell: 'A1', rawRows: [] as string[][] }
      const rawRows = sheetToAbsoluteRows(sheet, XLSX)
      const parsed = buildRowsFromStartCell(rawRows, 0, 0)
      return { rows: parsed.rows, headerCell: parsed.headerCell, rawRows }
    }

    setImportParsing(true)
    setImportParsingMessage('Leyendo archivo...')
    setImportParsingProgress(12)

    let rows: string[][] = []
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        setImportParsingMessage('Procesando hojas de Excel...')
        setImportParsingProgress(32)
        const mod = await import('xlsx')
        const XLSX = (mod && (mod.default || mod)) as any
        const ab = await f.arrayBuffer()
        const wb = XLSX.read(ab, { type: 'array' })
        setImportParsingProgress(58)
        const sheetNames: string[] = Array.isArray(wb.SheetNames) ? wb.SheetNames : []
        setImportWorkbook(wb)
        setImportSheetNames(sheetNames)
        const firstSheet = sheetNames[0] || ''
        setSelectedImportSheet(firstSheet)
        if (!firstSheet) return alert('El Excel no contiene hojas')
        const parsedSheet = await parseExcelSheet(wb, firstSheet)
        setImportParsingProgress(82)
        setImportRawRows(parsedSheet.rawRows)
        rows = parsedSheet.rows
        applyRowsToImport(rows, firstSheet, parsedSheet.headerCell)
      } else {
        setImportParsingMessage('Procesando archivo CSV...')
        setImportParsingProgress(38)
        setImportWorkbook(null)
        setImportSheetNames([])
        setSelectedImportSheet('')
        const text = await f.text()
        setImportParsingProgress(68)
        rows = parseCSV(text)
        setImportRawRows(rows)
        applyRowsToImport(rows, undefined, 'A1')
      }
      setImportParsingProgress(100)
      await waitForUiPaint()
    } catch (err) {
      console.error('Error reading import file', err)
      return alert('Error leyendo archivo de importación')
    } finally {
      setImportParsing(false)
      setImportParsingMessage('')
      setImportParsingProgress(0)
    }
  }

  function normalizeText(s: string) {
    if (!s) return ''
    // Preserve accents/ñ exactly as provided; only trim and normalize spacing.
    return String(s).replace(/\s+/g, ' ').trim()
  }
  const lowerText = (s?: any, fallback = '') => {
    if (s === undefined || s === null) return fallback
    const str = String(s).trim()
    return str === '' ? fallback : str.toLowerCase()
  }
  const upperText = (s?: any, fallback = '') => {
    if (s === undefined || s === null) return fallback
    const str = String(s).trim()
    return str === '' ? fallback : normalizeUppercaseDisplayText(str.toUpperCase())
  }
  const normalizeDocument = (s: string) => {
    if (!s) return ''
    return String(s).replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
  }
  const normalizeWorkerType = (value?: string | null) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const key = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    if (key === 'directo') return 'Directo'
    if (key === 'directo no operacional' || key === 'directo no-op') return 'Directo no Operacional'
    if (key === 'indirecto') return 'Indirecto'
    if (key === 'contratista') return 'Contratista'
    if (key === 'subcontratista') return 'Subcontratista'
    if (key === 'consultor') return 'Consultor'
    return raw
  }

  // Computed sets for mapping UI
  const multiMapAllowedFields = new Set(['first_name', 'last_name'])
  const attendanceDateHeaders = (importHeaders || []).filter((h) => Boolean(parseHeaderDateToISO(h)))
  const profileDataHeaderEntries = (importHeaders || [])
    .map((hdr, idx) => ({ hdr, idx }))
    .filter(({ hdr }) => !parseHeaderDateToISO(hdr))
  const mappedImportFields = Object.values(mapping || {}).filter(v => v && v !== 'ignore')
  const mappedFieldsSet = new Set<string>(mappedImportFields)
  const profileNonUpdateFields = new Set(['document', ...profileUpdateHiddenFields])
  const profileDocumentMapped = mappedFieldsSet.has('document')
  const profileUpdateMappedFields = Array.from(new Set(mappedImportFields.filter((field) => !profileNonUpdateFields.has(field))))
  const selectableCollaboratorColumns = importPrimaryAction === 'new_collaborators'
    ? newCollaboratorImportFields.filter((column) => collaboratorColumns.includes(column))
    : importOperation === 'profile_specific_columns'
      ? collaboratorColumns.filter((column) => !profileUpdateHiddenFields.includes(column))
      : collaboratorColumns
  const unmappedCollaboratorColumns = collaboratorColumns.filter(c => !mappedFieldsSet.has(c))
  const excelIgnoredHeaders = (importHeaders || []).filter((h, idx) => {
    if ((importOperation === 'profile_specific_columns' || importPrimaryAction === 'new_collaborators') && parseHeaderDateToISO(h)) return false
    return !(mapping?.[headerMapKey(h, idx)] && mapping[headerMapKey(h, idx)] !== 'ignore')
  })
  const missingRequiredFieldsFull = requiredImportFields.filter(req => !Object.values(mapping || {}).includes(req))
  const missingRequiredFieldsAttendance = ['document'].filter(req => !Object.values(mapping || {}).includes(req))
  const isAttendanceOperation =
    importOperation === 'attendance_overwrite' ||
    importOperation === 'attendance_new_only' ||
    importOperation === 'attendance_specific_date' ||
    importOperation === 'attendance_specific_dates' ||
    importOperation === 'attendance_specific_workers' ||
    importOperation === 'attendance_specific_date_then_new'
  const missingRequiredFields = isAttendanceOperation
    ? missingRequiredFieldsAttendance
    : importOperation === 'profile_specific_columns'
      ? []
      : missingRequiredFieldsFull
  const mappedHeadersCount = (importHeaders || []).filter((h, idx) => !!(mapping?.[headerMapKey(h, idx)] && mapping[headerMapKey(h, idx)] !== 'ignore')).length
  const mappingCounts = Object.values(mapping || {}).reduce((acc: Record<string, number>, field) => {
    if (!field || field === 'ignore') return acc
    acc[field] = (acc[field] || 0) + 1
    return acc
  }, {})
  const duplicateMappedFields = Object.entries(mappingCounts)
    .filter(([field, count]) => count > 1 && !multiMapAllowedFields.has(field))
    .map(([field]) => field)
  const attendanceHeadersFromStart = useMemo(() => {
    const startIdx = attendanceStartColumnIndex >= 0 ? attendanceStartColumnIndex : 0
    return (importHeaders || []).slice(startIdx)
  }, [attendanceStartColumnIndex, importHeaders])
  const hasParseableDatesFromStart = useMemo(() => {
    if (attendanceStartColumnIndex < 0) return attendanceDateHeaders.length > 0
    return attendanceHeadersFromStart.some((h) => Boolean(parseHeaderDateToISO(h)))
  }, [attendanceDateHeaders.length, attendanceHeadersFromStart, attendanceStartColumnIndex])
  const hasDocumentColumnBeforeAttendanceStart = useMemo(() => {
    const documentMappedIndexes = (importHeaders || [])
      .map((h, idx) => ({ h, idx }))
      .filter(({ h, idx }) => (mapping?.[headerMapKey(h, idx)] || '') === 'document')
      .map(({ idx }) => idx)
    if (documentMappedIndexes.length === 0) return false
    if (attendanceStartColumnIndex < 0) return true
    return documentMappedIndexes.some((idx) => idx < attendanceStartColumnIndex)
  }, [attendanceStartColumnIndex, importHeaders, mapping])
  const canImportAttendanceOnly =
    (attendanceDateHeaders.length > 0 || attendanceStartColumnIndex >= 0) &&
    missingRequiredFieldsAttendance.length === 0 &&
    (attendanceStartColumnIndex < 0 || hasParseableDatesFromStart || Boolean(attendanceStartDate)) &&
    hasDocumentColumnBeforeAttendanceStart
  const canImportProfileSpecificColumns = profileDocumentMapped && profileUpdateMappedFields.length > 0 && duplicateMappedFields.length === 0
  const canExecuteImportByMode =
    importPrimaryAction === 'new_collaborators'
      ? (missingRequiredFieldsFull.length === 0 && duplicateMappedFields.length === 0)
      : importPrimaryAction === 'attendance_fix' && !attendanceCorrectionMode
      ? false
      : importOperation === 'attendance_specific_date'
      ? canImportAttendanceOnly && Boolean(attendanceStartDate)
      : importOperation === 'attendance_specific_dates'
        ? canImportAttendanceOnly && attendanceSelectedDates.length > 0
      : importOperation === 'attendance_specific_date_then_new'
        ? canImportAttendanceOnly && Boolean(attendanceStartDate)
      : importOperation === 'attendance_overwrite'
        ? canImportAttendanceOnly && Boolean(attendanceStartDate) && Boolean(attendanceEndDate)
      : importOperation === 'attendance_specific_workers'
        ? canImportAttendanceOnly && attendanceTargetDocuments.length > 0
        : importOperation === 'full_overwrite_all'
          ? (missingRequiredFieldsFull.length === 0 && duplicateMappedFields.length === 0)
          : importOperation === 'profile_specific_columns'
            ? canImportProfileSpecificColumns
            : canImportAttendanceOnly
  const attendanceDateIsoOptions = useMemo(() => {
    const set = new Set<string>()
    for (const h of attendanceDateHeaders) {
      const iso = parseHeaderDateToISO(h)
      if (iso) set.add(iso)
    }
    return Array.from(set).sort()
  }, [attendanceDateHeaders])
  const attendanceDateIsoSet = useMemo(() => new Set(attendanceDateIsoOptions), [attendanceDateIsoOptions])
  const firstAttendanceCalendarDate = attendanceDateIsoOptions.length ? parseIsoDateToLocalDate(attendanceDateIsoOptions[0]) : null
  const lastAttendanceCalendarDate = attendanceDateIsoOptions.length ? parseIsoDateToLocalDate(attendanceDateIsoOptions[attendanceDateIsoOptions.length - 1]) : null
  const attendanceStartColumnOptions = useMemo(() => {
    return (importHeaders || []).map((header, idx) => ({
      idx,
      header: String(header || ''),
      parsedDate: parseHeaderDateToISO(header),
    }))
  }, [importHeaders])
  const attendanceDocumentOptions = useMemo(() => {
    const indexes = (importHeaders || [])
      .map((h, idx) => ({ h, idx }))
      .filter(({ h, idx }) => (mapping?.[headerMapKey(h, idx)] || '') === 'document')
      .map(({ idx }) => idx)
    if (indexes.length === 0) return [] as string[]
    const set = new Set<string>()
    for (const row of importRows || []) {
      for (const idx of indexes) {
        const raw = row[idx] !== undefined ? String(row[idx]) : ''
        const doc = normalizeDocument(raw)
        if (doc) set.add(doc)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }))
  }, [importHeaders, importRows, mapping])
  const attendancePreview = useMemo(() => {
    const documentIndexes = (importHeaders || [])
      .map((h, idx) => ({ h, idx }))
      .filter(({ h, idx }) => (mapping?.[headerMapKey(h, idx)] || '') === 'document')
      .map(({ idx }) => idx)

    const dateColumns: Array<{ idx: number; isoDate: string; header: string }> = []
    const seenDates = new Set<string>()
    ;(importHeaders || []).forEach((header, idx) => {
      const headerBasedDate = parseHeaderDateToISO(header)
      const hasForcedStartColumn = attendanceStartColumnIndex >= 0
      const forcedAttendanceByColumn = hasForcedStartColumn && idx >= attendanceStartColumnIndex
      const derivedDateFromStart =
        forcedAttendanceByColumn && attendanceStartDate
          ? addDaysToIsoDate(attendanceStartDate, idx - attendanceStartColumnIndex)
          : null
      const isoDate = headerBasedDate || derivedDateFromStart
      if (!isoDate || seenDates.has(isoDate)) return
      seenDates.add(isoDate)
      dateColumns.push({ idx, isoDate, header: String(header || '') })
    })

    const byDocument = new Map<string, Record<string, { code: string; status: string }>>()
    ;(importRows || []).slice(0, 40).forEach((row, rowIdx) => {
      const docCandidates = documentIndexes
        .map((idx) => normalizeDocument(row[idx] !== undefined ? String(row[idx]) : ''))
        .filter(Boolean)
      const document = docCandidates[0] || `FILA_${rowIdx + 1}`
      const current = byDocument.get(document) || {}
      dateColumns.forEach((col) => {
        const rawCode = String(row[col.idx] !== undefined ? row[col.idx] : '').trim().toUpperCase()
        if (!rawCode) return
        current[col.isoDate] = {
          code: rawCode,
          status: mapAttendanceCodeToStatusPreview(rawCode),
        }
      })
      byDocument.set(document, current)
    })

    const orderedDates = [...dateColumns].sort((a, b) => a.isoDate.localeCompare(b.isoDate))
    const rows = Array.from(byDocument.entries())
      .slice(0, 12)
      .map(([document, byDate]) => ({ document, byDate }))

    return { dates: orderedDates, rows }
  }, [attendanceStartColumnIndex, attendanceStartDate, importHeaders, importRows, mapping])
  const detectedImportDocuments = useMemo(() => {
    const indexes = (importHeaders || [])
      .map((h, idx) => ({ h, idx }))
      .filter(({ h, idx }) => (mapping?.[headerMapKey(h, idx)] || '') === 'document')
      .map(({ idx }) => idx)
    if (indexes.length === 0) return [] as string[]
    const set = new Set<string>()
    for (const row of importRows || []) {
      for (const idx of indexes) {
        const doc = normalizeDocument(row[idx] !== undefined ? String(row[idx]) : '')
        if (doc) set.add(doc)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }))
  }, [importHeaders, importRows, mapping])
  const detectedImportDocumentCount = detectedImportDocuments.length
  const newCollaboratorImportPreview = useMemo(() => {
    const existingDocuments = new Set(
      (collaborators || [])
        .map((collaborator) => normalizeDocument(collaborator.document || ''))
        .filter(Boolean)
    )
    let existing = 0
    let created = 0
    for (const document of detectedImportDocuments) {
      if (existingDocuments.has(document)) existing++
      else created++
    }
    return {
      total: detectedImportDocuments.length,
      created,
      existing,
      canPreview: detectedImportDocuments.length > 0,
    }
  }, [collaborators, detectedImportDocuments])
  const detectedHeaderSuggestion = useMemo(() => {
    if (!Array.isArray(importRawRows) || importRawRows.length === 0) return null

    let best: { cell: string; rowIdx: number; colIdx: number; firstHeader: string; score: number } | null = null
    const maxRows = Math.min(importRawRows.length, 40)
    const getHeaderCellScore = (cell: unknown) => {
      const normalized = normalizeHeaderKey(String(cell || ''))
      if (!normalized) return 0
      if (parseHeaderDateToISO(cell)) return 3
      if (normalized.includes('rut') || normalized.includes('document') || normalized.includes('codigo') || normalized === 'cod') return 5
      if (normalized.includes('nombre')) return 4
      if (normalized.includes('paterno') || normalized.includes('materno') || normalized.includes('apellido')) return 4
      if (normalized.includes('cargo') || normalized.includes('especialidad') || normalized.includes('contrato')) return 2
      if (normalized.includes('proyecto') || normalized.includes('cliente') || normalized.includes('obra') || normalized === 'cat') return 2
      return 0
    }

    for (let rowIdx = 0; rowIdx < maxRows; rowIdx += 1) {
      const row = importRawRows[rowIdx] || []
      const evidenceCells = row
        .map((cell, colIdx) => ({ cell: String(cell || '').trim(), colIdx, score: getHeaderCellScore(cell) }))
        .filter((item) => item.cell && item.score > 0)
      if (evidenceCells.length < 2) continue

      const firstHeaderColIdx = evidenceCells[0].colIdx
      const cells = row.slice(firstHeaderColIdx).map((cell) => String(cell || '').trim()).filter(Boolean)
      if (cells.length < 2) continue

      const score = evidenceCells.reduce((acc, item) => acc + item.score, 0)

      if (!best || score > best.score) {
        best = {
          cell: `${columnNumberToLetter(firstHeaderColIdx + 1)}${rowIdx + 1}`,
          rowIdx,
          colIdx: firstHeaderColIdx,
          firstHeader: cells[0],
          score,
        }
      }
    }

    return best && best.score > 0 ? best : null
  }, [importRawRows])
  const needsImportMappingReview =
    missingRequiredFields.length > 0 ||
    (isAttendanceOperation && attendanceDateHeaders.length === 0 && attendanceStartColumnIndex < 0) ||
    (isAttendanceOperation && !hasDocumentColumnBeforeAttendanceStart) ||
    duplicateMappedFields.length > 0
  const shouldShowImportOriginPanel =
    !importConfigurationCollapsed && (
      showImportAdvancedOptions ||
      needsImportMappingReview ||
      (importPrimaryAction === 'attendance_daily' && importSheetNames.length > 1)
    )
  const shouldShowFullImportMapper =
    !importConfigurationCollapsed && importPrimaryAction !== 'attendance_daily' && (showImportMappingEditor || needsImportMappingReview)
  const shouldShowAttendanceImportPreview =
    showImportAttendancePreview || (importPrimaryAction === 'attendance_daily' && !needsImportMappingReview)
  const importDialogTitle = {
    attendance_daily: 'Importar asistencia diaria',
    attendance_fix: 'Corregir asistencia',
    profile_update: 'Actualizar datos',
    new_collaborators: 'Importar nuevos colaboradores',
  }[importPrimaryAction]
  const allImportActionOptions: Array<{ key: ImportPrimaryAction; title: string; detail: string }> = [
    {
      key: 'attendance_daily',
      title: 'Importar asistencia diaria',
      detail: 'Carga la fecha actual o pendiente.',
    },
    {
      key: 'attendance_fix',
      title: 'Corregir asistencia',
      detail: 'Actualiza una fecha, varias o un rango.',
    },
    {
      key: 'profile_update',
      title: 'Actualizar datos',
      detail: 'Modifica columnas de colaboradores existentes.',
    },
    {
      key: 'new_collaborators',
      title: 'Nuevos colaboradores',
      detail: 'Importa trabajadores nuevos y actualiza la asistencia de los existentes.',
    },
  ]
  const importActionOptions = allImportActionOptions.filter((option) =>
    !showAttendanceForUser || option.key === 'attendance_daily' || option.key === 'new_collaborators'
  )
  const importConfigurationVisible = !importConfigurationCollapsed && (showImportAdvancedOptions || showImportMappingEditor || shouldShowImportOriginPanel || shouldShowFullImportMapper)
  const canToggleImportConfiguration = importDialogOpen && !importParsing && !importing
  const toggleImportConfiguration = () => {
    if (importConfigurationVisible) {
      setImportConfigurationCollapsed(true)
      return
    }
    setImportConfigurationCollapsed(false)
    setShowImportAdvancedOptions(true)
    setShowImportMappingEditor(importPrimaryAction !== 'attendance_daily')
  }
  const importValidationMessages = [
    missingRequiredFields.length > 0
      ? `Faltan campos requeridos mapeados: ${missingRequiredFields.map(getColumnLabel).join(', ')}.`
      : '',
    importOperation === 'profile_specific_columns' && !profileDocumentMapped
      ? 'Debes mapear Documento para identificar a los colaboradores existentes.'
      : '',
    importOperation === 'profile_specific_columns' && profileDocumentMapped && profileUpdateMappedFields.length === 0
      ? 'Debes mapear al menos una columna de datos a actualizar además de Documento.'
      : '',
    isAttendanceOperation && attendanceDateHeaders.length === 0 && attendanceStartColumnIndex < 0
      ? 'Para importar asistencia debes incluir al menos una columna de fecha o indicar `Primera columna de fecha`.'
      : '',
    (importOperation === 'attendance_specific_date' || importOperation === 'attendance_specific_date_then_new') &&
    !attendanceStartDate &&
    (importPrimaryAction !== 'attendance_fix' || attendanceCorrectionMode === 'single')
      ? 'Debes seleccionar una `Fecha específica a actualizar`.'
      : '',
    importOperation === 'attendance_overwrite' && attendanceCorrectionMode === 'range' && (!attendanceStartDate || !attendanceEndDate)
      ? 'Debes seleccionar fecha inicial y fecha final para actualizar el rango.'
      : '',
    importOperation === 'attendance_overwrite' && attendanceCorrectionMode === 'range' && attendanceStartDate && attendanceEndDate && attendanceStartDate > attendanceEndDate
      ? 'La fecha inicial del rango no puede ser posterior a la fecha final.'
      : '',
    importOperation === 'attendance_specific_dates' && attendanceCorrectionMode === 'multi' && attendanceSelectedDates.length === 0
      ? 'Debes seleccionar al menos una fecha a actualizar.'
      : '',
    importOperation === 'attendance_specific_workers' && attendanceTargetDocuments.length === 0
      ? 'Debes seleccionar al menos un trabajador en `Trabajadores a actualizar`.'
      : '',
    isAttendanceOperation && !hasDocumentColumnBeforeAttendanceStart
      ? 'La columna `document` debe quedar antes de la `Primera columna de fecha` para poder asignar asistencia al colaborador correcto.'
      : '',
    duplicateMappedFields.length > 0
      ? `Hay mapeos duplicados no permitidos: ${duplicateMappedFields.join(', ')}. Solo \`first_name\` y \`last_name\` permiten múltiples columnas.`
      : '',
  ].filter(Boolean)
  const importDateRangeLabel = attendanceDateIsoOptions.length > 0
    ? `${formatIsoDateToDisplay(attendanceDateIsoOptions[0])}${attendanceDateIsoOptions.length > 1 ? ` - ${formatIsoDateToDisplay(attendanceDateIsoOptions[attendanceDateIsoOptions.length - 1])}` : ''}`
    : 'Sin fechas detectadas'
  const nextExpectedImportDate = importAttendanceBounds.max ? addDaysToIsoDate(importAttendanceBounds.max, 1) : null
  const todayIsoDate = new Date().toLocaleDateString('en-CA')
  const attendanceCalendarReferenceDate = parseIsoDateToLocalDate(
    attendanceDateIsoOptions.includes(todayIsoDate)
      ? todayIsoDate
      : (attendanceDateIsoOptions.find((isoDate) => isoDate >= todayIsoDate) || attendanceDateIsoOptions[attendanceDateIsoOptions.length - 1] || '')
  )
  const pendingImportDates = useMemo(() => {
    if (attendanceWriteMode === 'insert_only' && importAttendanceBounds.max) {
      return attendanceDateIsoOptions.filter((isoDate) => isoDate > String(importAttendanceBounds.max))
    }
    return attendanceDateIsoOptions
  }, [attendanceDateIsoOptions, attendanceWriteMode, importAttendanceBounds.max])
  const newImportDates = useMemo(() => {
    return pendingImportDates.filter((isoDate) => isoDate <= todayIsoDate)
  }, [pendingImportDates, todayIsoDate])
  const futureImportDates = useMemo(() => {
    return pendingImportDates.filter((isoDate) => isoDate > todayIsoDate)
  }, [pendingImportDates, todayIsoDate])
  const excelIncludesToday = attendanceDateIsoOptions.includes(todayIsoDate)
  const todayAlreadyImported = Boolean(importAttendanceBounds.max && String(importAttendanceBounds.max) >= todayIsoDate)
  const suggestedSingleImportDate = (() => {
    if (nextExpectedImportDate && nextExpectedImportDate <= todayIsoDate && newImportDates.includes(nextExpectedImportDate)) return nextExpectedImportDate
    if (newImportDates.includes(todayIsoDate)) return todayIsoDate
    return newImportDates[0] || ''
  })()
  const importCandidateDates = useMemo(() => {
    if (!isAttendanceOperation) return []
    if (importOperation === 'attendance_specific_date' || importOperation === 'attendance_specific_date_then_new') {
      return attendanceStartDate ? [attendanceStartDate] : []
    }
    if (importOperation === 'attendance_specific_dates') {
      return [...attendanceSelectedDates].sort()
    }
    if (importOperation === 'attendance_overwrite') {
      if (!attendanceStartDate || !attendanceEndDate || attendanceStartDate > attendanceEndDate) return []
      return attendanceDateIsoOptions.filter((isoDate) => isoDate >= attendanceStartDate && isoDate <= attendanceEndDate)
    }
    if (attendanceDailyImportScope === 'next') return suggestedSingleImportDate ? [suggestedSingleImportDate] : []
    return newImportDates
  }, [attendanceDailyImportScope, attendanceDateIsoOptions, attendanceEndDate, attendanceSelectedDates, attendanceStartDate, importOperation, isAttendanceOperation, newImportDates, suggestedSingleImportDate])
  const importCandidateRangeLabel = importCandidateDates.length > 0
    ? `${formatIsoDateToDisplay(importCandidateDates[0])}${importCandidateDates.length > 1 ? ` - ${formatIsoDateToDisplay(importCandidateDates[importCandidateDates.length - 1])}` : ''}`
    : ''
  const importExecutionSummary = (() => {
    if (importPrimaryAction === 'new_collaborators') {
      if (missingRequiredFieldsFull.length > 0) return 'Mapea los campos requeridos para importar nuevos colaboradores.'
      if (newCollaboratorImportPreview.canPreview) {
        return `Se crearán ${newCollaboratorImportPreview.created} nuevo${newCollaboratorImportPreview.created === 1 ? '' : 's'} colaborador${newCollaboratorImportPreview.created === 1 ? '' : 'es'}${excelIncludesToday ? ` y se actualizará la asistencia del ${formatIsoDateToDisplay(todayIsoDate)} para ${newCollaboratorImportPreview.existing} existente${newCollaboratorImportPreview.existing === 1 ? '' : 's'}` : `. Los ${newCollaboratorImportPreview.existing} existente${newCollaboratorImportPreview.existing === 1 ? '' : 's'} no tendrán cambios de asistencia`}.`
      }
      return 'Se importarán solo colaboradores no existentes en el archivo.'
    }
    if (importOperation === 'profile_specific_columns') {
      if (!profileDocumentMapped) return 'Mapea document para identificar a los colaboradores existentes.'
      if (profileUpdateMappedFields.length === 0) return 'Mapea una o más columnas de ficha para actualizar.'
      return `Se actualizarán ${profileUpdateMappedFields.length} columna${profileUpdateMappedFields.length === 1 ? '' : 's'} de ficha por document.`
    }
    if (!isAttendanceOperation) return 'Se actualizarán datos de colaboradores según el modo seleccionado.'
    if (needsImportMappingReview) return 'Completa origen y mapeo para calcular qué fecha se importará.'
    if (importAttendanceBounds.loading) return 'Consultando última fecha importada...'
    if (importPrimaryAction === 'attendance_fix' && !attendanceCorrectionMode) return 'Elige si corregirás una fecha, un rango o fechas específicas.'
    if (importCandidateDates.length === 0) {
      if (importPrimaryAction === 'attendance_fix') {
        if (importOperation === 'attendance_overwrite') return 'Selecciona fecha inicial y fecha final para actualizar ese rango.'
        if (importOperation === 'attendance_specific_dates') return 'Selecciona las fechas específicas que necesitas actualizar.'
        return 'Selecciona la fecha que necesitas actualizar.'
      }
      if (attendanceDateIsoOptions.length === 0) return 'No hay fechas detectadas para importar.'
      if (excelIncludesToday && todayAlreadyImported) {
        return `La fecha actual ${formatIsoDateToDisplay(todayIsoDate)} ya existe en asistencia. No hay fechas nuevas para importar hasta hoy. Puedes actualizar esa fecha si necesitas corregir los datos cargados.`
      }
      if (futureImportDates.length > 0) {
        return `No hay fechas nuevas para importar hasta hoy (${formatIsoDateToDisplay(todayIsoDate)}). El Excel contiene ${futureImportDates.length} fecha${futureImportDates.length === 1 ? '' : 's'} futura${futureImportDates.length === 1 ? '' : 's'} que no se importarán en el flujo diario.`
      }
      if (attendanceWriteMode === 'insert_only' && importAttendanceBounds.max) {
        return `No hay fechas nuevas posteriores a ${formatIsoDateToDisplay(importAttendanceBounds.max)}.`
      }
      return 'No hay fechas seleccionadas para importar.'
    }
    if (importOperation === 'attendance_specific_date') return `Se actualizará la fecha ${formatIsoDateToDisplay(importCandidateDates[0])}.`
    if (importOperation === 'attendance_specific_dates') {
      if (importCandidateDates.length === 1) return `Se actualizará la fecha ${formatIsoDateToDisplay(importCandidateDates[0])}.`
      return `Se actualizarán ${importCandidateDates.length} fechas seleccionadas: ${importCandidateRangeLabel}.`
    }
    if (importOperation === 'attendance_specific_date_then_new') return `Se actualizará la fecha ${formatIsoDateToDisplay(importCandidateDates[0])} y luego se revisarán nuevos colaboradores.`
    if (importOperation === 'attendance_overwrite') {
      if (importCandidateDates.length === 1) return `Se actualizará la fecha ${formatIsoDateToDisplay(importCandidateDates[0])}.`
      return `Se actualizará el rango ${importCandidateRangeLabel}.`
    }
    if (importCandidateDates.length === 1) return `Se importará la fecha ${formatIsoDateToDisplay(importCandidateDates[0])}.`
    return `Se importarán ${importCandidateDates.length} fechas: ${importCandidateRangeLabel}.`
  })()

  useEffect(() => {
    if (!importDialogOpen || !isAttendanceOperation) return
    let cancelled = false
    setImportAttendanceBounds((prev) => ({ ...prev, loading: true }))

    ;(async () => {
      try {
        const response = await fetch('/api/collaborators/daily-status?bounds=1')
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok) {
          setImportAttendanceBounds({ min: null, max: null, loading: false })
          return
        }
        setImportAttendanceBounds({
          min: payload?.min_work_date ? String(payload.min_work_date).slice(0, 10) : null,
          max: payload?.max_work_date ? String(payload.max_work_date).slice(0, 10) : null,
          loading: false,
        })
      } catch {
        if (!cancelled) setImportAttendanceBounds({ min: null, max: null, loading: false })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [importDialogOpen, isAttendanceOperation])

  useEffect(() => {
    if (importPrimaryAction === 'attendance_daily' && attendanceDailyImportScope !== 'next') {
      setAttendanceDailyImportScope('next')
    }
  }, [attendanceDailyImportScope, importPrimaryAction])

  const resetMappingForHeaders = () => {
    const next: Record<string, string> = {}
    ;(importHeaders || []).forEach((h, idx) => { next[headerMapKey(h, idx)] = 'ignore' })
    setMapping(next)
  }

  const normalizeEmail = (s: string) => {
    if (!s) return ''
    return String(s).toLowerCase().trim()
  }

  const normalizePhone = (s: string) => {
    if (!s) return ''
    let raw = String(s)
    // keep + if present, otherwise strip non-digits
    raw = raw.replace(/\s+/g, '')
    if (raw.startsWith('+')) {
      // normalize to +<digits>
      const digits = raw.replace(/[^+0-9]/g, '')
      return digits.startsWith('+') ? digits : `+${digits}`
    }
    // strip non-digits
    let digits = raw.replace(/\D/g, '')
    // remove leading zeros
    digits = digits.replace(/^0+/, '')
    // ensure +56 as default country code
    if (!digits.startsWith('56')) digits = `56${digits}`
    return `+${digits}`
  }

  const normalizeCell = (field: string, value: any) => {
    if (value === undefined || value === null) return ''
    const v = String(value).trim()
    if (v === '') return ''
    if (field === 'document') return normalizeDocument(v)
    if (field === 'email') return normalizeEmail(v)
    if (field === 'phone' || field === 'mobile' || field === 'phone_number') return normalizePhone(v)
    if (field === 'shift_pattern' || field === 'contract') return v
    // default: text fields -> lowercase no diacritics
    return normalizeText(v)
  }

  const buildMappedPreview = () => {
    const headers = Array.from(new Set(
      (importHeaders || [])
        .map((h, idx) => mapping[headerMapKey(h, idx)] || 'ignore')
        .filter((f) => f && f !== 'ignore')
    ))

    const rows = (importRows || []).slice(0, 5).map((r) => {
      const obj: Record<string, string> = {}
      const concatFields = new Set(['first_name', 'last_name'])
      const firstNameParts: string[] = []
      const lastNameParts: Array<{ value: string; idx: number; rank: number }> = []
      const toPreviewValue = (field: string, value: string) => {
        if (!value) return ''
        if (field === 'email') return value.toLowerCase()
        return value.toUpperCase()
      }

      ;(importHeaders || []).forEach((h, idx) => {
        const field = mapping[headerMapKey(h, idx)] || 'ignore'
        if (field === 'ignore') return
        const raw = r[idx] !== undefined ? String(r[idx]) : ''
        const normalized = normalizeCell(field, raw)
        const previewValue = toPreviewValue(field, normalized)

        if (concatFields.has(field)) {
          if (previewValue) {
            if (field === 'first_name') {
              firstNameParts.push(previewValue)
            } else {
              const normalizedHeader = normalizeHeaderKey(h)
              const rank = normalizedHeader.includes('paterno') ? 0 : normalizedHeader.includes('materno') ? 1 : 2
              lastNameParts.push({ value: previewValue, idx, rank })
            }
          }
        } else {
          obj[field] = previewValue
        }
      })

      if (firstNameParts.length > 0) obj.first_name = firstNameParts.join(' ').trim()
      if (lastNameParts.length > 0) {
        const orderedLastNames = [...lastNameParts]
          .sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx))
          .map((part) => part.value)
        obj.last_name = orderedLastNames.join(' ').trim()
      }

      return obj
    })

    return { headers, rows }
  }

  const mappedPreview = buildMappedPreview()

  const handleExecuteImport = async (opts: {
    onDuplicate: string
    createAuth: boolean
    updateDefaults: boolean
    attendanceOnly?: boolean
    profileOnly?: boolean
    allowAttendanceForSkippedDuplicates?: boolean
    attendanceStartDate?: string
    attendanceEndDate?: string
    attendanceExactDate?: string
    attendanceExactDates?: string[]
    attendanceStartColumnIndex?: number
    targetDocuments?: string[]
    attendanceWriteMode?: 'insert_only' | 'upsert'
    keepDialogState?: boolean
    suppressNotice?: boolean
  }) => {
    const addNewAndAttendanceMode = Boolean(opts.allowAttendanceForSkippedDuplicates) && !opts.attendanceOnly && !opts.profileOnly
    const shouldFilterAttendanceDates = Boolean(opts.attendanceOnly || opts.attendanceExactDate || opts.attendanceExactDates?.length || opts.attendanceStartDate || opts.attendanceEndDate)
    setImporting(true)
    setImportProgress(2)
    setImportStatusMessage(
      opts.attendanceOnly
        ? 'Preparando actualización de asistencia...'
        : opts.profileOnly
          ? 'Preparando actualización de datos de colaboradores...'
          : addNewAndAttendanceMode
            ? 'Preparando inserción de nuevos + actualización de asistencia...'
          : 'Preparando datos para importación...'
    )
    setImportNotice({
      severity: 'info',
      message: opts.attendanceOnly
        ? 'Actualización de asistencia en proceso. Esto puede tardar algunos minutos según el tamaño del archivo.'
        : opts.profileOnly
          ? 'Actualización de datos en proceso. Se actualizarán solo columnas mapeadas de colaboradores existentes.'
          : addNewAndAttendanceMode
            ? 'Inserción de nuevos + actualización de asistencia en proceso. No se sobrescribirá ficha de colaboradores ya existentes.'
        : 'Importación en proceso. Esto puede tardar algunos minutos según el tamaño del archivo.'
    })
    try {
      if (COLLABORATORS_DEBUG) console.log('Execute import: importHeaders=', importHeaders)
      if (COLLABORATORS_DEBUG) console.log('Execute import: importRows count=', importRows.length)
      const mapped = importRows.map(r => {
        const obj: Record<string, any> = {}
        const attendanceByDate: Record<string, string> = {}
        const concatFields = new Set(['first_name', 'last_name'])
        const firstNameParts: string[] = []
        const lastNameParts: Array<{ value: string; idx: number; rank: number }> = []
        importHeaders.forEach((h, idx) => {
          const raw = r[idx] !== undefined ? String(r[idx]) : ''
          const headerBasedDate = parseHeaderDateToISO(h)
          const startCol = typeof opts.attendanceStartColumnIndex === 'number' ? opts.attendanceStartColumnIndex : -1
          const hasForcedStartColumn = opts.attendanceOnly && startCol >= 0
          const forcedAttendanceByColumn = hasForcedStartColumn && idx >= startCol
          const derivedDateFromStart =
            forcedAttendanceByColumn && opts.attendanceStartDate
              ? addDaysToIsoDate(opts.attendanceStartDate, idx - startCol)
              : null
          // Always prioritize real date headers from the file.
          // Start column/date is only a fallback for non-date headers.
          const isoDate = headerBasedDate || derivedDateFromStart
          if (isoDate) {
            const normalizedAttendance = String(raw || '').trim().toUpperCase()
            if (normalizedAttendance) attendanceByDate[isoDate] = normalizedAttendance
            return
          }

          const field = mapping[headerMapKey(h, idx)] || 'ignore'
          if (field !== 'ignore') {
            const normalized = normalizeCell(field, raw)
            if (concatFields.has(field)) {
              if (normalized) {
                if (field === 'first_name') {
                  firstNameParts.push(normalized)
                } else {
                  const normalizedHeader = normalizeHeaderKey(h)
                  const rank = normalizedHeader.includes('paterno') ? 0 : normalizedHeader.includes('materno') ? 1 : 2
                  lastNameParts.push({ value: normalized, idx, rank })
                }
              }
            } else {
              obj[field] = normalized
            }
          }
        })
        if (firstNameParts.length > 0) obj.first_name = firstNameParts.join(' ').trim()
        if (lastNameParts.length > 0) {
          const orderedLastNames = [...lastNameParts]
            .sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx))
            .map((part) => part.value)
          obj.last_name = orderedLastNames.join(' ').trim()
        }
        if (Object.keys(attendanceByDate).length > 0) obj.attendance_by_date = attendanceByDate
        return obj
      })
      // Deduplicate by document within the file.
      // Keep latest scalar fields but MERGE attendance_by_date to avoid losing dates across repeated rows.
      const byDocument = new Map<string, any>()
      const rowsWithoutDocument: any[] = []
      let localDupes = 0
      for (const obj of mapped) {
        const doc = String(obj.document || '').trim()
        if (!doc) {
          rowsWithoutDocument.push(obj)
          continue
        }
        if (byDocument.has(doc)) localDupes++
        const previous = byDocument.get(doc)
        if (!previous) {
          byDocument.set(doc, obj)
          continue
        }
        const prevAttendance = (previous.attendance_by_date && typeof previous.attendance_by_date === 'object')
          ? previous.attendance_by_date
          : {}
        const nextAttendance = (obj.attendance_by_date && typeof obj.attendance_by_date === 'object')
          ? obj.attendance_by_date
          : {}
        byDocument.set(doc, {
          ...previous,
          ...obj,
          attendance_by_date: {
            ...prevAttendance,
            ...nextAttendance,
          },
        })
      }
      const rowsToSend: any[] = [...rowsWithoutDocument, ...Array.from(byDocument.values())].map((row) => {
        if (!shouldFilterAttendanceDates) return row
        const attendanceMap = row?.attendance_by_date && typeof row.attendance_by_date === 'object'
          ? row.attendance_by_date
          : null
        if (!attendanceMap) return row

        const filteredAttendance = Object.entries(attendanceMap).reduce((acc: Record<string, string>, [date, value]) => {
          const isoDate = String(date || '').slice(0, 10)
          if (!isoDate) return acc
          if (opts.attendanceExactDates && opts.attendanceExactDates.length > 0 && !opts.attendanceExactDates.includes(isoDate)) return acc
          if (opts.attendanceExactDate && isoDate !== opts.attendanceExactDate) return acc
          if (!opts.attendanceExactDate && opts.attendanceStartDate && isoDate < opts.attendanceStartDate) return acc
          if (!opts.attendanceExactDate && opts.attendanceEndDate && isoDate > opts.attendanceEndDate) return acc
          if (!opts.attendanceExactDate && !opts.attendanceExactDates?.length && opts.attendanceWriteMode !== 'upsert' && isoDate > todayIsoDate) return acc
          acc[isoDate] = String(value || '')
          return acc
        }, {})

        return {
          ...row,
          attendance_by_date: filteredAttendance,
        }
      })
      if (opts.attendanceOnly) {
        const totalAttendanceCells = rowsToSend.reduce((acc, row) => {
          const map = row?.attendance_by_date && typeof row.attendance_by_date === 'object' ? row.attendance_by_date : {}
          return acc + Object.keys(map).length
        }, 0)
        if (totalAttendanceCells === 0) {
          throw new Error(
            'No se detectaron celdas de asistencia para importar. ' +
            'Mapea `document` y define columnas fecha. ' +
            'Si usas `Primera columna de fecha`, también define `Primera fecha a actualizar` cuando esas cabeceras no sean fechas reales.'
          )
        }
      }

      if (COLLABORATORS_DEBUG) console.log('Execute import: rowsToSend count=', rowsToSend.length, 'sample=', rowsToSend.slice(0,5))

      setImportStatusMessage('Conectando con servidor...')
      setImportProgress((prev) => Math.max(prev, 5))
      const res = await fetch('/api/collaborators/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToSend, options: opts, stream: true })
      })

      if (!res.ok) {
        let errorText = 'Error importando archivo'
        try {
          const errJson = await res.json()
          errorText = String(errJson?.error || errorText)
        } catch {}
        throw new Error(errorText)
      }

      const contentType = String(res.headers.get('content-type') || '').toLowerCase()
      let json: any = null

      if (res.body && contentType.includes('application/x-ndjson')) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            let event: any
            try {
              event = JSON.parse(trimmed)
            } catch {
              continue
            }

            if (event.type === 'progress') {
              if (typeof event.percent === 'number') setImportProgress(Math.max(0, Math.min(100, Math.round(event.percent))))
              if (event.message) setImportStatusMessage(String(event.message))
              continue
            }
            if (event.type === 'error') {
              const msg = String(event?.payload?.error || event?.message || 'Error en importación')
              throw new Error(msg)
            }
            if (event.type === 'done') {
              setImportProgress(100)
              setImportStatusMessage(String(event.message || 'Importación completada'))
              json = event.payload || null
            }
          }
        }
      } else {
        setImportStatusMessage('Procesando respuesta y actualizando vista...')
        json = await res.json()
      }

      if (!json) throw new Error('No se recibió resumen de importación')
      if (COLLABORATORS_DEBUG) console.log('Execute import: response=', json)
      if (Number(json.attendance_rows_written || 0) > 0 || Number(json.inserted || 0) > 0) {
        notifyAttendanceDataUpdated()
      }
      setImporting(false)
      if (!opts.keepDialogState) resetImportState()
      const detectedDates = Array.isArray(json.attendance_dates_detected) ? json.attendance_dates_detected : []
      const writtenDates = Array.isArray(json.attendance_dates_written) ? json.attendance_dates_written : []
      const detectedRange = detectedDates.length > 0 ? `${detectedDates[0]}..${detectedDates[detectedDates.length - 1]}` : 'N/A'
      const writtenRange = writtenDates.length > 0 ? `${writtenDates[0]}..${writtenDates[writtenDates.length - 1]}` : 'N/A'
      const diagnostics = (json && typeof json.diagnostics === 'object') ? json.diagnostics : {}
      const docsNotFound = Array.isArray(diagnostics.documents_not_found) ? diagnostics.documents_not_found : []
      const docsUpdated = Array.isArray(diagnostics.documents_attendance_updated) ? diagnostics.documents_attendance_updated : []
      const attendanceAttempted = Number(diagnostics.attendance_rows_attempted || 0)
      const attendanceSkippedNoStatus = Number(diagnostics.attendance_rows_skipped_no_status || 0)
      const errorSample = json?.error_sample && typeof json.error_sample === 'object' ? json.error_sample : null
      const docsNotFoundPreview = docsNotFound.slice(0, 12)
      const hasHardErrors = Number(json.errors?.length || 0) > 0
      const formatImportErrorReason = (sample: any) => {
        const reason = String(sample?.reason || '')
          .replace('Faltan campos requeridos (first_name/last_name/document)', 'Faltan campos requeridos: Nombres, Apellidos, Documento')
          .replaceAll('first_name', 'Nombres')
          .replaceAll('last_name', 'Apellidos')
          .replaceAll('document', 'Documento')
          .replaceAll('email', 'Correo')
        const details = sample?.details ? String(sample.details) : ''
        return details ? `${reason} (${details})` : reason
      }
      if (importPrimaryAction === 'new_collaborators' && !opts.attendanceOnly && !opts.profileOnly) {
        const insertedCount = Number(json.inserted || 0)
        const skippedCount = Number(json.skipped || 0)
        const errorsCount = Number(json.errors?.length || 0)
        const attendanceWrittenCount = Number(json.attendance_rows_written || 0)
        const message = insertedCount > 0
          ? `Importación exitosa\nSe importaron ${insertedCount} nuevo${insertedCount === 1 ? '' : 's'} colaborador${insertedCount === 1 ? '' : 'es'}.${attendanceWrittenCount > 0 ? ` Se cargó asistencia de hoy para ${attendanceWrittenCount} registro${attendanceWrittenCount === 1 ? '' : 's'}.` : ''} ${skippedCount > 0 ? `Se omitieron ${skippedCount} existente${skippedCount === 1 ? '' : 's'}.` : ''}${errorsCount > 0 ? `\nNo se pudieron procesar ${errorsCount} registro${errorsCount === 1 ? '' : 's'}.` : ''}`
          : errorsCount > 0
            ? `No se importaron colaboradores\nNo se pudieron procesar ${errorsCount} registro${errorsCount === 1 ? '' : 's'}.${errorSample ? `\nPrimer error: ${formatImportErrorReason(errorSample)}` : ''}`
            : `No se encontraron nuevos colaboradores\nNo se importó ningún colaborador nuevo. ${skippedCount > 0 ? `Se omitieron ${skippedCount} existente${skippedCount === 1 ? '' : 's'}.` : ''}`
        if (!opts.suppressNotice) {
          setImportNotice({
            severity: insertedCount > 0 && errorsCount === 0 ? 'success' : 'warning',
            message,
          })
        }
        const resp = await fetch('/api/collaborators')
        if (resp.ok) setCollaborators(await resp.json())
        setImportStatusMessage('')
        setImportProgress(0)
        return json
      }
      const successPrefix = opts.attendanceOnly
        ? (hasHardErrors ? 'Actualización de asistencia con errores' : 'Actualización de asistencia lista')
        : opts.profileOnly
          ? (hasHardErrors ? 'Actualización de datos con errores' : 'Actualización de datos lista')
          : addNewAndAttendanceMode
            ? (hasHardErrors ? 'Inserción + asistencia con errores' : 'Inserción + asistencia lista')
        : (hasHardErrors ? 'Importación con errores' : 'Importación lista')
      const successMessage =
        `${successPrefix}\n` +
        `Resultado: ${json.inserted || 0} insertados · ${json.updated || 0} actualizados · ${json.skipped || 0} omitidos · ${json.errors?.length || 0} errores\n` +
        `Asistencia: ${json.attendance_rows_detected || 0} detectadas (${detectedRange}) · ${json.attendance_rows_written || 0} escritas (${writtenRange})\n` +
        `Control: ${attendanceAttempted} intentadas · ${attendanceSkippedNoStatus} sin estatus · ${json.filtered_out || 0} filtradas · ${localDupes} duplicados unificados\n` +
        `Documentos: ${diagnostics.documents_attendance_updated_count || docsUpdated.length} con asistencia actualizada · ${diagnostics.documents_not_found_count || docsNotFound.length} no encontrados` +
        (errorSample ? `\nPrimer error: ${String(errorSample.reason || '')}${errorSample.details ? ` (${String(errorSample.details)})` : ''}` : '')
      const suspiciousNoWrites = attendanceAttempted > 0 && Number(json.attendance_rows_written || 0) === 0
      const diagnosticsMessage = docsNotFound.length > 0
        ? `${successMessage} No encontrados: ${docsNotFoundPreview.join(', ')}${docsNotFound.length > docsNotFoundPreview.length ? ` +${docsNotFound.length - docsNotFoundPreview.length}` : ''}.`
        : successMessage
      const codeCounts = diagnostics.attendance_code_counts && typeof diagnostics.attendance_code_counts === 'object'
        ? Object.entries(diagnostics.attendance_code_counts as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 8)
        : []
      const statusCounts = diagnostics.attendance_status_counts && typeof diagnostics.attendance_status_counts === 'object'
        ? Object.entries(diagnostics.attendance_status_counts as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 8)
        : []
      const countsDetail = [
        codeCounts.length > 0 ? `Códigos: ${codeCounts.map(([k, v]) => `${k}:${v}`).join(', ')}` : '',
        statusCounts.length > 0 ? `Estados: ${statusCounts.map(([k, v]) => `${k}:${v}`).join(', ')}` : '',
        errorSample ? `Primer error: ${String(errorSample.reason || '')}${errorSample.details ? ` (${String(errorSample.details)})` : ''}` : '',
      ].filter(Boolean).join('\n')
      const fullNotice = countsDetail ? `${diagnosticsMessage}\n${countsDetail}` : diagnosticsMessage
      if (!opts.suppressNotice) {
        setImportNotice({
          severity: suspiciousNoWrites || docsNotFound.length > 0 || hasHardErrors ? 'warning' : 'success',
          message: fullNotice
        })
      }
      const resp = await fetch('/api/collaborators')
      if (resp.ok) setCollaborators(await resp.json())
      setImportStatusMessage('')
      setImportProgress(0)
      return json
    } catch (e) {
      setImporting(false)
      setImportStatusMessage('')
      setImportProgress(0)
      const detail = e instanceof Error ? e.message : ''
      const errorMessage = opts.attendanceOnly
        ? `Error actualizando asistencia. ${detail || 'Revisa el formato y vuelve a intentar.'}`
        : opts.profileOnly
          ? `Error actualizando datos. ${detail || 'Revisa el formato y vuelve a intentar.'}`
          : addNewAndAttendanceMode
            ? `Error insertando nuevos + actualizando asistencia. ${detail || 'Revisa el formato y vuelve a intentar.'}`
        : `Error importando archivo. ${detail || 'Revisa el formato y vuelve a intentar.'}`
      setImportNotice({ severity: 'error', message: errorMessage })
      throw e
    }
  }

  const requestCloseImportDialog = () => {
    if (importing || importParsing) return
    const confirmClose = window.confirm('Si cierras esta ventana, se perderán los cambios de mapeo y se cancelará el proceso de importación. ¿Deseas continuar?')
    if (confirmClose) resetImportState()
  }

  useEffect(() => {
    setAttendanceOnlyMode(
      importOperation === 'attendance_overwrite' ||
      importOperation === 'attendance_new_only' ||
      importOperation === 'attendance_specific_date' ||
      importOperation === 'attendance_specific_dates' ||
      importOperation === 'attendance_specific_workers' ||
      importOperation === 'attendance_specific_date_then_new'
    )
    if (
      importOperation === 'attendance_overwrite' ||
      importOperation === 'attendance_specific_date' ||
      importOperation === 'attendance_specific_dates' ||
      importOperation === 'attendance_specific_date_then_new'
    ) {
      setAttendanceWriteMode('upsert')
    } else if (importOperation === 'attendance_new_only' || importOperation === 'attendance_specific_workers') {
      setAttendanceWriteMode('insert_only')
    }
  }, [importOperation])

  useEffect(() => {
    if (!importNotice) return
    const t = window.setTimeout(() => setImportNotice(null), 8000)
    return () => window.clearTimeout(t)
  }, [importNotice])

  const dedupedCollaborators = useMemo(() => {
    const byDocument = new Map<string, Collaborator>()
    const withoutDocument: Collaborator[] = []

    for (const collab of collaborators) {
      const doc = String(collab.document || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
      if (!doc) {
        withoutDocument.push(collab)
        continue
      }

      const current = byDocument.get(doc)
      if (!current) {
        byDocument.set(doc, collab)
        continue
      }

      const currentActive = Boolean(current.is_active)
      const nextActive = Boolean(collab.is_active)
      if (nextActive && !currentActive) {
        byDocument.set(doc, collab)
        continue
      }
      if (nextActive === currentActive) {
        const currentTime = new Date(String(current.updated_at || current.created_at || 0)).getTime()
        const nextTime = new Date(String(collab.updated_at || collab.created_at || 0)).getTime()
        if (nextTime > currentTime) byDocument.set(doc, collab)
      }
    }

    return [...withoutDocument, ...Array.from(byDocument.values())]
  }, [collaborators])

  const workerTypeOptions = useMemo(() => {
    const options = Array.from(
      new Set(
        dedupedCollaborators
          .map((c) => String(c.worker_type || '').trim())
          .filter(Boolean)
      )
    )
    return options.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [dedupedCollaborators])

  const filteredCollaborators = dedupedCollaborators.filter((collab) => {
    const q = searchTerm.trim().toLowerCase()
    const qCompact = q.replace(/[^0-9a-z]/gi, '')
    const fullName = `${collab.first_name || ''} ${collab.last_name || ''}`.toLowerCase()
    const email = (collab.email || '').toLowerCase()
    const position = (collab.position || '').toLowerCase()
    const document = String(collab.document || '').toLowerCase()
    const documentCompact = document.replace(/[^0-9a-z]/gi, '')
    const specialtyText = String(collab.specialty || '').toLowerCase()
    const workerTypeText = String(collab.worker_type || '').toLowerCase()
    const searchableText = [
      fullName,
      email,
      position,
      document,
      specialtyText,
      workerTypeText,
    ].join(' ')
    const matchesSearch = !q ||
      searchableText.includes(q) ||
      (!!qCompact && documentCompact.includes(qCompact))

    const currentWorkerType = String(collab.worker_type || '').trim()
    const matchesWorkerType = workerTypeFilter === 'all' || currentWorkerType === workerTypeFilter
    const matchesActiveStatus =
      activeStatusFilter === 'all' ||
      (activeStatusFilter === 'active' && collab.is_active !== false) ||
      (activeStatusFilter === 'terminated' && collab.is_active === false)

    return matchesSearch && matchesWorkerType && matchesActiveStatus
  })

  const getTableSortValue = (collab: Collaborator, field: TableSortField): string | number => {
    if (field === 'name') {
      const primary = nameSortBy === 'first_name' ? (collab.first_name || '') : (collab.last_name || '')
      const secondary = nameSortBy === 'first_name' ? (collab.last_name || '') : (collab.first_name || '')
      return `${primary} ${secondary}`.trim()
    }
    if (field === 'salary') return Number(collab.salary || 0)
    if (field === 'is_active') return collab.is_active ? 1 : 0
    if (field === 'document') return String(collab.document || '')
    if (field === 'email') return String(collab.email || '')
    if (field === 'phone') return String(collab.phone || '')
    if (field === 'position') return String(collab.position || '')
    if (field === 'condition') return String(collab.condition || '')
    if (field === 'specialty') return String(collab.specialty || '')
    if (field === 'gender') return String(collab.gender || '')
    if (field === 'nationality') return String(collab.nationality || '')
    if (field === 'marital_status') return String(collab.worker_type || '')
    if (field === 'worker_type') return String(collab.worker_type || '')
    if (field === 'contract') return String(collab.contract || '')
    return ''
  }

  const getDisplayName = (collab: Collaborator) => {
    const first = String(collab.first_name || '').trim()
    const last = String(collab.last_name || '').trim()
    if (nameSortBy === 'last_name') {
      return upperText(`${last} ${first}`, 'SIN NOMBRE')
    }
    return upperText(`${first} ${last}`, 'SIN NOMBRE')
  }

  const sortedCollaborators = useMemo(() => {
    const dir = tableSortDirection === 'asc' ? 1 : -1
    const items = [...filteredCollaborators]
    items.sort((a, b) => {
      if (tableSortField === 'name') {
        const aPrimary = String(nameSortBy === 'first_name' ? (a.first_name || '') : (a.last_name || '')).trim().toLowerCase()
        const bPrimary = String(nameSortBy === 'first_name' ? (b.first_name || '') : (b.last_name || '')).trim().toLowerCase()
        const primaryCmp = aPrimary.localeCompare(bPrimary, 'es', { sensitivity: 'base', numeric: true })
        if (primaryCmp !== 0) return primaryCmp * dir

        const aSecondary = String(nameSortBy === 'first_name' ? (a.last_name || '') : (a.first_name || '')).trim().toLowerCase()
        const bSecondary = String(nameSortBy === 'first_name' ? (b.last_name || '') : (b.first_name || '')).trim().toLowerCase()
        const secondaryCmp = aSecondary.localeCompare(bSecondary, 'es', { sensitivity: 'base', numeric: true })
        if (secondaryCmp !== 0) return secondaryCmp * dir

        return String(a.id || '').localeCompare(String(b.id || ''), 'es', { sensitivity: 'base', numeric: true }) * dir
      }

      const aVal = getTableSortValue(a, tableSortField)
      const bVal = getTableSortValue(b, tableSortField)

      if (typeof aVal === 'number' || typeof bVal === 'number') {
        const aNum = Number(aVal || 0)
        const bNum = Number(bVal || 0)
        if (aNum < bNum) return -1 * dir
        if (aNum > bNum) return 1 * dir
        return 0
      }

      const left = String(aVal || '').trim().toLowerCase()
      const right = String(bVal || '').trim().toLowerCase()
      return left.localeCompare(right, 'es', { sensitivity: 'base', numeric: true }) * dir
    })
    return items
  }, [filteredCollaborators, tableSortDirection, tableSortField, nameSortBy])

  const handleTableSort = (field: TableSortField) => {
    if (tableSortField === field) {
      setTableSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setTableSortField(field)
    setTableSortDirection('asc')
  }

  const openNameSortSelector = (event: React.MouseEvent<HTMLElement>) => {
    setNameSortMenuAnchor(event.currentTarget)
  }

  const closeNameSortSelector = () => {
    setNameSortMenuAnchor(null)
  }

  const showNationality = false
  const showSalary = false

  const pinColumnsConfig: Array<{ key: PinColumnKey; label: string; width: number }> = [
    { key: 'avatar', label: 'Foto', width: 56 },
    { key: 'name', label: 'Nombre Completo', width: 170 },
    { key: 'document', label: 'Documento', width: 100 },
    { key: 'email', label: 'Email', width: 150 },
    { key: 'phone', label: 'Teléfono', width: 120 },
    { key: 'position', label: 'Cargo', width: 120 },
    { key: 'condition', label: 'Condición', width: 120 },
    { key: 'specialty', label: 'Especialidad', width: 120 },
    { key: 'gender', label: 'Género', width: 110 },
    { key: 'nationality', label: 'Nacionalidad', width: 120 },
    { key: 'marital_status', label: 'Tipo Trabajador', width: 140 },
    { key: 'worker_type', label: 'Tipo', width: 100 },
    { key: 'contract', label: 'Contrato', width: 140 },
    { key: 'salary', label: 'Salario', width: 100 },
    { key: 'is_active', label: 'Vigencia', width: 100 },
    { key: 'actions', label: 'Acciones', width: 100 }
  ]
  const pinnedHeaderBg = colors.blue13
  const pinnedCellBg = '#F3F8FC'
  const pinnedDivider = '1px solid rgba(0, 43, 79, 0.18)'

  const isVisiblePinnedColumn = (key: PinColumnKey) => {
    if (key === 'worker_type') return false
    if (key === 'nationality') return showNationality
    if (key === 'salary') return showSalary
    return true
  }

  const isPinnedColumn = (key: PinColumnKey) =>
    isVisiblePinnedColumn(key) && pinnedColumns.includes(key)

  const getPinnedLeft = (key: PinColumnKey) => {
    let left = 0
    for (const col of pinColumnsConfig) {
      if (col.key === key) break
      if (isPinnedColumn(col.key)) left += col.width
    }
    return left
  }

  const getPinnedHeaderSx = (key: PinColumnKey) =>
    isPinnedColumn(key)
      ? {
          position: 'sticky' as const,
          left: getPinnedLeft(key),
          zIndex: 4,
          backgroundColor: pinnedHeaderBg,
          borderRight: pinnedDivider
        }
      : {}

  const getPinnedCellSx = (key: PinColumnKey) =>
    isPinnedColumn(key)
      ? {
          position: 'sticky' as const,
          left: getPinnedLeft(key),
          zIndex: 3,
          backgroundColor: pinnedCellBg,
          borderRight: pinnedDivider
        }
      : undefined

  const togglePinnedColumn = (key: PinColumnKey) => {
    setPinnedColumns((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      return pinColumnsConfig.map((c) => c.key).filter((k) => [...prev, key].includes(k))
    })
  }

  if (status === 'loading' || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  if (!session) {
    return null
  }

  return (
    <Box sx={{ display: 'flex', width: '100%', minWidth: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <UserHeader title={showAttendanceForUser ? 'Actualizar / Importar - Asistencia / Colaboradores' : 'Colaboradores'} />
        <Container
          maxWidth={false}
          disableGutters
          sx={{
            width: '100%',
            minWidth: 0,
            maxWidth: '100% !important',
            px: { xs: 2, sm: 3, md: 4 },
            pt: { xs: 2, sm: 2.5, md: 3 },
            pb: { xs: 2, sm: 2.5, md: 3 },
          }}
        >
          {importNotice && (
            <Alert
              severity={importNotice.severity}
              onClose={() => setImportNotice(null)}
              sx={{ mb: 2, whiteSpace: 'pre-line' }}
            >
              {importNotice.message}
            </Alert>
          )}

          {/* Estadísticas rápidas */}
          {!showAttendanceForUser && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 2.5 }}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Person sx={{ color: colors.blue6, mr: 2 }} />
                  <Box>
                    <Typography variant="h4" color="primary">
                      {collaborators.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Colaboradores
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Person sx={{ color: colors.gold3, mr: 2 }} />
                  <Box>
                    <Typography variant="h4" color="success.main">
                      {collaborators.filter(c => c.is_active).length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Vigentes
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Person sx={{ color: colors.gray6, mr: 2 }} />
                  <Box>
                    <Typography variant="h4" color="text.secondary">
                      {collaborators.filter(c => !c.is_active).length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Finiquitados
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Business sx={{ color: colors.blue6, mr: 2 }} />
                  <Box>
                    <Typography variant="h4" color="info.main">
                      {new Set(collaborators.map(c => c.position)).size}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Roles Diferentes
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>
          )}

          {/* Barra de herramientas */}
          {!showAttendanceForUser && (
          <Paper sx={{ p: 1.75, mb: 2.5 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
              <Box display="flex" alignItems="center" gap={2}>
                <TextField
                  size="small"
                  placeholder="Buscar por nombre, correo, RUT, especialidad o tipo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1, color: colors.gray6 }} />
                  }}
                  sx={{ minWidth: 250 }}
                />
                <TextField
                  select
                  size="small"
                  label="Tipo trabajador"
                  value={workerTypeFilter}
                  onChange={(e) => setWorkerTypeFilter(e.target.value)}
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="all">TODOS</MenuItem>
                  {workerTypeOptions.map((workerType) => (
                    <MenuItem key={workerType} value={workerType}>
                      {upperText(workerType, 'SIN ESPECIFICAR')}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  type="date"
                  label="Fecha estado diario"
                  value={dailyStatusDate}
                  onChange={(e) => setDailyStatusDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 190 }}
                />
                <Tooltip title="Filtrar vigencia">
                  <IconButton
                    color={activeStatusFilter === 'all' ? 'default' : 'primary'}
                    onClick={(event) => setActiveStatusFilterAnchor(event.currentTarget)}
                    aria-label="Filtrar vigencia"
                    aria-controls={activeStatusFilterAnchor ? 'active-status-filter-menu' : undefined}
                    aria-haspopup="true"
                    aria-expanded={activeStatusFilterAnchor ? 'true' : undefined}
                  >
                    <FilterList />
                  </IconButton>
                </Tooltip>
                <Menu
                  id="active-status-filter-menu"
                  anchorEl={activeStatusFilterAnchor}
                  open={Boolean(activeStatusFilterAnchor)}
                  onClose={() => setActiveStatusFilterAnchor(null)}
                >
                  <MenuItem
                    selected={activeStatusFilter === 'all'}
                    onClick={() => {
                      setActiveStatusFilter('all')
                      setActiveStatusFilterAnchor(null)
                    }}
                  >
                    Todos
                  </MenuItem>
                  <MenuItem
                    selected={activeStatusFilter === 'active'}
                    onClick={() => {
                      setActiveStatusFilter('active')
                      setActiveStatusFilterAnchor(null)
                    }}
                  >
                    Vigentes
                  </MenuItem>
                  <MenuItem
                    selected={activeStatusFilter === 'terminated'}
                    onClick={() => {
                      setActiveStatusFilter('terminated')
                      setActiveStatusFilterAnchor(null)
                    }}
                  >
                    Finiquitados
                  </MenuItem>
                </Menu>
              </Box>
              <Box display="flex" gap={1}>
                <Button
                  variant={viewMode === 'cards' ? 'contained' : 'outlined'}
                  startIcon={<ViewModule />}
                  onClick={() => setViewMode('cards')}
                  sx={{ textTransform: 'none' }}
                >
                  Tarjetas
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'contained' : 'outlined'}
                  startIcon={<ViewList />}
                  onClick={() => setViewMode('table')}
                  sx={{ textTransform: 'none' }}
                >
                  Tabla
                </Button>
                <Tooltip title="Cargar colaboradores" arrow>
                  <Button
                    variant="outlined"
                    onClick={handleUploadFile}
                    aria-label="Cargar colaboradores"
                    sx={{
                      minWidth: 44,
                      width: 44,
                      height: 36,
                      p: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease',
                      '&:hover': {
                        bgcolor: '#eef6ff',
                        borderColor: colors.blue6,
                        color: colors.blue8,
                      },
                    }}
                  >
                    <Upload fontSize="small" />
                  </Button>
                </Tooltip>
              </Box>
            </Box>
          </Paper>
          )}
              {/* Instructions dialog shown before opening file selector */}
              <Dialog
                open={importInstructionsOpen}
                onClose={() => setImportInstructionsOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                  sx: {
                    borderRadius: 1.5,
                    width: { xs: 'calc(100% - 40px)', sm: 'calc(100% - 140px)', md: 'calc(100% - 320px)' },
                    maxWidth: 720,
                  },
                }}
              >
                <DialogTitle sx={{ pb: 0.5, pt: 2.25, px: 2.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#0b2e59', lineHeight: 1.15 }}>
                    Importar datos
                  </Typography>
                </DialogTitle>
                <DialogContent sx={{ pt: '8px !important', pb: 1.5, px: 2.5 }}>
                  <Typography variant="body2" sx={{ color: '#64748b', lineHeight: 1.55 }}>
                    Elige qué necesitas hacer y luego selecciona el archivo Excel.
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.25, mt: 2 }}>
                    {importActionOptions.map((option) => {
                      const selected = pendingImportPrimaryAction === option.key
                      return (
                        <Button
                          key={option.key}
                          variant="outlined"
                          disabled={importParsing || importing}
                          onClick={() => chooseImportActionAndFile(option.key)}
                          sx={{
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            textAlign: 'left',
                            px: 1.5,
                            py: 0.75,
                            minHeight: 56,
                            textTransform: 'none',
                            borderColor: selected ? colors.blue6 : colors.gray8,
                            color: selected ? colors.white : colors.gray2,
                            backgroundColor: selected ? colors.blue6 : colors.gray10,
                            transition: 'background-color 140ms ease, border-color 140ms ease, color 140ms ease',
                            '&:hover': {
                              backgroundColor: colors.blue4,
                              borderColor: colors.blue4,
                              color: colors.blue13,
                              boxShadow: 'none',
                            },
                            '&:hover .import-action-detail': {
                              color: colors.blue13,
                            },
                            '&:active': {
                              backgroundColor: colors.blue2,
                              borderColor: colors.blue2,
                              color: colors.white,
                            },
                            '&:active .import-action-detail': {
                              color: colors.blue13,
                            },
                          }}
                        >
                          <Box sx={{ width: '100%' }}>
                            <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                              {option.title}
                            </Typography>
                            <Typography
                              className="import-action-detail"
                              variant="caption"
                              sx={{ display: 'block', mt: 0.5, color: selected ? colors.blue13 : colors.gray4, lineHeight: 1.2 }}
                            >
                              {option.detail}
                            </Typography>
                          </Box>
                        </Button>
                      )
                    })}
                  </Box>
                </DialogContent>
                <DialogActions sx={{ px: 2.5, pb: 2.25, pt: 0.5, gap: 1 }}>
                  <Button onClick={() => setImportInstructionsOpen(false)} disabled={importParsing || importing}>
                    Cancelar
                  </Button>
                </DialogActions>
              </Dialog>

              {/* Hidden file input for Import button (triggered via fileInputRef) */}
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelected}
              />
              {/* Import mapping / preview dialog */}
              <Dialog
                open={importDialogOpen}
                onClose={() => requestCloseImportDialog()}
                maxWidth="lg"
                fullWidth
              >
                <DialogTitle sx={{ pb: 1.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: colors.blue1 }}>
                      {importDialogTitle}
                    </Typography>
                    <Tooltip title={importConfigurationVisible ? 'Ocultar configuración' : 'Mostrar configuración'}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={toggleImportConfiguration}
                          disabled={!canToggleImportConfiguration}
                          aria-label={importConfigurationVisible ? 'Ocultar configuración' : 'Mostrar configuración'}
                          sx={{
                            border: '1px solid',
                            borderColor: 'divider',
                            color: colors.blue6,
                          }}
                        >
                          {importConfigurationVisible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </DialogTitle>
                <DialogContent sx={{ overflowX: 'hidden', maxHeight: '65vh', overflowY: 'auto', px: { xs: 2, md: 3 }, pt: '10px !important' }}>
                  {importParsing && (
                    <Paper
                      variant="outlined"
                      sx={{
                        mb: 2,
                        p: 1.5,
                        borderColor: 'rgba(25,118,210,0.28)',
                        backgroundColor: 'rgba(25,118,210,0.04)'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: colors.blue1 }}>
                          {importParsingMessage || 'Procesando hoja seleccionada...'}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.max(0, Math.min(100, importParsingProgress))}
                        sx={{ height: 6, borderRadius: 999 }}
                      />
                    </Paper>
                  )}
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1,
                      mb: 1,
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: 'rgba(25,118,210,0.03)',
                    }}
                  >
                    <Box sx={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, mr: 'auto', display: 'flex', alignItems: 'center' }}>
                        {importExecutionSummary}
                      </Typography>
                      {(importPrimaryAction === 'profile_update'
                        ? [
                            ['Archivo', `${detectedImportDocumentCount || '-'} trabajadores`],
                            ['Identificador', profileDocumentMapped ? 'document' : 'Sin document'],
                            ['Columnas', profileUpdateMappedFields.length > 0 ? profileUpdateMappedFields.map(getColumnLabel).join(', ') : 'Sin columnas'],
                          ]
                        : importPrimaryAction === 'new_collaborators'
                          ? [
                              ['Archivo', `${detectedImportDocumentCount || '-'} trabajadores`],
                              ['Identificador', mappedFieldsSet.has('document') ? 'Documento' : 'Sin documento'],
                              ['Nuevos', newCollaboratorImportPreview.canPreview ? String(newCollaboratorImportPreview.created) : '-'],
                              ['Existentes omitidos', newCollaboratorImportPreview.canPreview ? String(newCollaboratorImportPreview.existing) : '-'],
                            ]
                        : [
                            ['Archivo', `${detectedImportDocumentCount || '-'} trabajadores · ${attendanceDateHeaders.length} fechas`],
                            ['Rango Excel', importDateRangeLabel],
                            ['Última importada', importAttendanceBounds.loading ? 'Consultando...' : (importAttendanceBounds.max ? formatIsoDateToDisplay(importAttendanceBounds.max) : 'Sin registro')],
                          ]
                      ).map(([label, value]) => (
                        <Box key={label} sx={{ display: 'flex', gap: 0.75, alignItems: 'center', whiteSpace: 'nowrap' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                            {label}
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                            {value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                      {importCandidateDates.length === 0 && excelIncludesToday && todayAlreadyImported && (
                        <>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={importParsing || importing}
                          onClick={() => {
                            setImportOperation('attendance_specific_date')
                            setAttendanceWriteMode('upsert')
                            setAttendanceStartDate(todayIsoDate)
                            setAttendanceDailyImportScope('next')
                          }}
                        >
                          Actualizar fecha actual
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={importParsing || importing}
                          onClick={() => {
                            setImportOperation('attendance_overwrite')
                            setAttendanceWriteMode('upsert')
                            setAttendanceStartDate(todayIsoDate)
                            setAttendanceDailyImportScope('all')
                            setShowImportAdvancedOptions(true)
                          }}
                        >
                          Elegir fecha o rango
                        </Button>
                        </>
                      )}
                      {showImportAttendancePreview && importPrimaryAction !== 'attendance_daily' && (
                        <Button size="small" variant="text" onClick={() => setShowImportAttendancePreview(false)}>
                          Ocultar vista previa
                        </Button>
                      )}
                    </Box>
                  </Paper>

                  {shouldShowImportOriginPanel && (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1.25,
                        mb: 2,
                        '& .import-origin-control .MuiInputBase-root': {
                          minHeight: 32,
                          height: 32,
                        },
                        '& .import-origin-control .MuiInputBase-input': {
                          height: 32,
                          boxSizing: 'border-box',
                          py: 0,
                          display: 'flex',
                          alignItems: 'center',
                          lineHeight: '32px',
                        },
                        '& .import-origin-control .MuiSelect-select': {
                          minHeight: '0 !important',
                          height: 32,
                          boxSizing: 'border-box',
                          py: '0 !important',
                          display: 'flex',
                          alignItems: 'center',
                        },
                        '& .import-origin-action': {
                          minHeight: 32,
                          height: 32,
                          px: 1.25,
                          py: 0.25,
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="subtitle2" sx={{ minWidth: { xs: '100%', md: 'auto' }, mr: { md: 0.5 } }}>
                        Origen de datos
                      </Typography>
                      {importSheetNames.length > 1 && (
                        <FormControl className="import-origin-control" size="small" sx={{ minWidth: 180, width: { xs: '100%', sm: 260, md: 230 } }}>
                          <InputLabel>Hoja del Excel</InputLabel>
                          <Select
                            value={selectedImportSheet}
                            disabled={importParsing || importing}
                            label="Hoja del Excel"
                            open={importSheetSelectOpen}
                            onOpen={() => {
                              if (!importParsing && !importing) setImportSheetSelectOpen(true)
                            }}
                            onClose={() => setImportSheetSelectOpen(false)}
                            MenuProps={{
                              PaperProps: {
                                sx: {
                                  mt: 0.5,
                                  width: { xs: 'calc(100vw - 48px)', sm: 300 },
                                  maxWidth: 'calc(100vw - 48px)',
                                  maxHeight: 320,
                                }
                              }
                            }}
                            onChange={(e) => handleImportSheetChange(String(e.target.value || ''))}
                          >
                            {importSheetNames.map((sheetName) => (
                              <MenuItem key={sheetName} value={sheetName}>{sheetName}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                      <TextField
                        className="import-origin-control"
                        key={`header-start-cell-${importHeaderStartCell}`}
                        size="small"
                        label="Celda cabecera"
                        defaultValue=""
                        onChange={(e) => {
                          importHeaderStartCellDraftRef.current = String(e.target.value || '').toUpperCase()
                        }}
                        placeholder={importHeaderStartCell || 'A1'}
                        sx={{
                          minWidth: 150,
                          width: { xs: '100%', sm: 190, md: 170 },
                          '& .MuiInputBase-root': {
                            height: '40px !important',
                            minHeight: '40px !important',
                          },
                          '& .MuiInputBase-input': {
                            height: '40px !important',
                            lineHeight: '40px !important',
                          },
                          '& input': { textAlign: 'left', pl: 1.5 },
                        }}
                        disabled={importParsing || importing || importHeaderApplying}
                      />
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', ml: { xs: 0, md: 'auto' }, width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                        <Button
                          className="import-origin-action"
                          size="small"
                          variant="outlined"
                          disabled={importParsing || importing || importHeaderApplying}
                          onClick={async () => {
                            if (importHeaderApplying) return
                            setImportHeaderApplying(true)
                            setImportParsing(true)
                            setImportParsingMessage('Aplicando celda de cabecera...')
                            setImportParsingProgress(20)
                            try {
                              await waitForUiPaint()
                              const draftCell = String(importHeaderStartCellDraftRef.current || importHeaderStartCell || 'A1').trim().toUpperCase()
                              const parsedCell = parseCellReference(draftCell)
                              if (!parsedCell) {
                                alert('Formato inválido. Usa una celda como A1 o B10.')
                                return
                              }
                              if (!importRawRows || importRawRows.length === 0) {
                                alert('No hay datos cargados para recalcular desde una celda.')
                                return
                              }
                              setImportParsingMessage(`Recalculando desde ${draftCell}...`)
                              setImportParsingProgress(50)
                              await waitForUiPaint()
                              const recalculated = buildRowsFromStartCell(importRawRows, parsedCell.rowIdx, parsedCell.colIdx)
                              if (!recalculated.rows || recalculated.rows.length === 0) {
                                alert('La celda seleccionada no contiene datos para importar.')
                                return
                              }
                              setImportParsingMessage('Actualizando cabeceras, vista previa y mapeo...')
                              setImportParsingProgress(82)
                              await waitForUiPaint()
                              const headers = recalculated.rows[0].map((h) => formatExcelSerialAsDateHeader(h))
                              const dataRows = recalculated.rows.slice(1).filter((r) => r.some((cell) => cell && String(cell).trim() !== ''))
                              setImportHeaderStartCell(recalculated.headerCell)
                              importHeaderStartCellDraftRef.current = recalculated.headerCell
                              setImportHeaders(headers)
                              setImportRows(dataRows)
                              setMapping(autoMatchHeader(headers))
                              setImportParsingProgress(100)
                              await waitForUiPaint()
                            } finally {
                              setImportHeaderApplying(false)
                              setImportParsing(false)
                              setImportParsingMessage('')
                              setImportParsingProgress(0)
                            }
                          }}
                        >
                          {importHeaderApplying ? 'Aplicando...' : 'Aplicar celda'}
                        </Button>
                        {importPrimaryAction !== 'attendance_daily' && importPrimaryAction !== 'attendance_fix' && (
                          <>
                            <Button
                              className="import-origin-action"
                              size="small"
                              variant="outlined"
                              disabled={importParsing || importing || importHeaderApplying}
                              onClick={() => setMapping(autoMatchHeader(importHeaders || []))}
                            >
                              Auto-mapear
                            </Button>
                            <Button
                              className="import-origin-action"
                              size="small"
                              variant="outlined"
                              color="primary"
                              disabled={importParsing || importing || importHeaderApplying}
                              onClick={resetMappingForHeaders}
                            >
                              Limpiar mapeo
                            </Button>
                          </>
                        )}
                      </Box>
                      {detectedHeaderSuggestion && (
                        <Box
                          sx={{
                            px: 1,
                            py: 0.75,
                            borderRadius: 1,
                            backgroundColor: 'rgba(25,118,210,0.04)',
                            border: '1px solid',
                            borderColor: 'rgba(25,118,210,0.18)',
                            display: 'flex',
                            gap: 1,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            flex: '1 1 100%',
                            minWidth: { xs: '100%', md: 280 },
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {detectedHeaderSuggestion.cell === importHeaderStartCell ? (
                              <>
                                Usando cabeceras desde <strong>{importHeaderStartCell}</strong> · primera cabecera: <strong>{detectedHeaderSuggestion.firstHeader}</strong>
                              </>
                            ) : (
                              <>
                                Sugerencia disponible: cabeceras en <strong>{detectedHeaderSuggestion.cell}</strong> · actualmente usando <strong>{importHeaderStartCell}</strong>
                              </>
                            )}
                          </Typography>
                          {detectedHeaderSuggestion.cell !== importHeaderStartCell && (
                            <Button
                              className="import-origin-action"
                              size="small"
                              variant="outlined"
                              disabled={importParsing || importing || importHeaderApplying}
                              sx={{ ml: { xs: 0, sm: 'auto' } }}
                              onClick={async () => {
                                if (importHeaderApplying) return
                                setImportHeaderApplying(true)
                                setImportParsing(true)
                                setImportParsingMessage(`Aplicando sugerencia ${detectedHeaderSuggestion.cell}...`)
                                setImportParsingProgress(25)
                                try {
                                  await waitForUiPaint()
                                  const recalculated = buildRowsFromStartCell(importRawRows, detectedHeaderSuggestion.rowIdx, detectedHeaderSuggestion.colIdx)
                                  if (!recalculated.rows || recalculated.rows.length === 0) {
                                    alert('La sugerencia no contiene datos para importar.')
                                    return
                                  }
                                  setImportParsingMessage('Actualizando cabeceras, vista previa y mapeo...')
                                  setImportParsingProgress(80)
                                  await waitForUiPaint()
                                  const headers = recalculated.rows[0].map((h) => formatExcelSerialAsDateHeader(h))
                                  const dataRows = recalculated.rows.slice(1).filter((r) => r.some((cell) => cell && String(cell).trim() !== ''))
                                  setImportHeaderStartCell(recalculated.headerCell)
                                  importHeaderStartCellDraftRef.current = recalculated.headerCell
                                  setImportHeaders(headers)
                                  setImportRows(dataRows)
                                  setMapping(autoMatchHeader(headers))
                                  setImportParsingProgress(100)
                                  await waitForUiPaint()
                                } finally {
                                  setImportHeaderApplying(false)
                                  setImportParsing(false)
                                  setImportParsingMessage('')
                                  setImportParsingProgress(0)
                                }
                              }}
                            >
                              Usar sugerencia
                            </Button>
                          )}
                        </Box>
                      )}
                      </Box>
                      {needsImportMappingReview && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          Si la asistencia no parte en la primera fila útil, ajusta la celda donde empiezan las cabeceras y aplica nuevamente.
                        </Typography>
                      )}
                    </Paper>
                  )}

                  {/* If any required fields are not mapped, show a clear error */}
                  {!importConfigurationCollapsed && showImportAdvancedOptions && (
                  <Box sx={{ mb: 2, ...(importPrimaryAction === 'attendance_fix' ? { display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'flex-start' } : {}) }}>
                    {importPrimaryAction === 'attendance_fix' && (
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', flex: '0 0 auto', pt: 0.25 }}>
                        {[
                          ['single', 'attendance_specific_date', 'Fecha única'],
                          ['range', 'attendance_overwrite', 'Rango de fechas'],
                          ['multi', 'attendance_specific_dates', 'Fechas específicas'],
                        ].map(([correctionMode, mode, label]) => (
                          <Button
                            key={mode}
                            size="small"
                            variant={attendanceCorrectionMode === correctionMode ? 'contained' : 'outlined'}
                            disabled={importParsing || importing}
                            sx={{ minHeight: 40, px: 1.8 }}
                            onClick={() => {
                              setImportOperation(mode as any)
                              setAttendanceCorrectionMode(correctionMode as 'single' | 'range' | 'multi')
                              if (mode === 'attendance_specific_date') {
                                setAttendanceStartDate('')
                                setAttendanceEndDate('')
                                setAttendanceSelectedDates([])
                              }
                              if (mode === 'attendance_overwrite') {
                                setAttendanceStartDate('')
                                setAttendanceEndDate('')
                                setAttendanceSelectedDates([])
                              }
                              if (mode === 'attendance_specific_dates') {
                                setAttendanceStartDate('')
                                setAttendanceEndDate('')
                                setAttendanceSelectedDates([])
                              }
                            }}
                          >
                            {label}
                          </Button>
                        ))}
                      </Box>
                    )}
                    {importPrimaryAction === 'new_collaborators' ? (
                      <Alert severity="info" sx={{ mb: 1.5 }}>
                        {newCollaboratorImportPreview.canPreview
                          ? newCollaboratorImportPreview.created > 0
                            ? `Se crearán ${newCollaboratorImportPreview.created} trabajador${newCollaboratorImportPreview.created === 1 ? '' : 'es'} nuevo${newCollaboratorImportPreview.created === 1 ? '' : 's'}${excelIncludesToday ? ` y se actualizará la asistencia del ${formatIsoDateToDisplay(todayIsoDate)} para ${newCollaboratorImportPreview.existing} existente${newCollaboratorImportPreview.existing === 1 ? '' : 's'}` : '. El Excel no contiene asistencia de hoy'} según el Documento.`
                            : excelIncludesToday
                              ? `No se encontraron trabajadores nuevos. Se actualizará la asistencia del ${formatIsoDateToDisplay(todayIsoDate)} para ${newCollaboratorImportPreview.existing} existente${newCollaboratorImportPreview.existing === 1 ? '' : 's'} según el Documento.`
                              : `No se encontraron trabajadores nuevos. El Excel no contiene asistencia de hoy para actualizar a los ${newCollaboratorImportPreview.existing} existente${newCollaboratorImportPreview.existing === 1 ? '' : 's'}.`
                          : `Se crearán trabajadores no existentes según el Documento${excelIncludesToday ? ` y se actualizará la asistencia del ${formatIsoDateToDisplay(todayIsoDate)} para los existentes` : ''}.`}
                      </Alert>
                    ) : isAttendanceOperation ? null : importOperation === 'full_overwrite_all' ? (
                      <Alert severity="warning" sx={{ mb: 1.5 }}>
                        Se reescribirán datos y asistencia usando el mapeo del archivo.
                      </Alert>
                    ) : importOperation === 'profile_specific_columns' ? (
                      <Alert severity="info" sx={{ mb: 1.5 }}>
                        Selecciona las columnas de ficha que necesitas actualizar.
                      </Alert>
                    ) : (
                      <Alert severity="info" sx={{ mb: 1.5 }}>
                        Se actualizarán solo las columnas de datos que mapeaste.
                      </Alert>
                    )}
                    {isAttendanceOperation ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: importPrimaryAction === 'attendance_fix' ? 'minmax(240px, 360px)' : '1fr 1fr' }, gap: 1.5, ...(importPrimaryAction === 'attendance_fix' ? { flex: '0 1 360px', minWidth: { xs: '100%', md: 240 }, ml: { md: 'auto' } } : {}) }}>
                          {importPrimaryAction !== 'attendance_fix' && (
                          <TextField
                            select
                            size="small"
                            label="Primera columna de fecha (opcional)"
                            value={attendanceStartColumnIndex >= 0 ? String(attendanceStartColumnIndex) : ''}
                            onChange={(e) => setAttendanceStartColumnIndex(e.target.value === '' ? -1 : Number(e.target.value))}
                            helperText="Si el archivo no detecta bien fechas, selecciona desde qué columna comienza la asistencia."
                          >
                            <MenuItem value="">Auto-detectar columnas fecha</MenuItem>
                            {attendanceStartColumnOptions.map((col) => (
                              <MenuItem key={`attendance-start-col-${col.idx}`} value={String(col.idx)}>
                                {`#${col.idx + 1} — ${col.header}${col.parsedDate ? ` (${formatIsoDateToDisplay(col.parsedDate)})` : ''}`}
                              </MenuItem>
                            ))}
                          </TextField>
                          )}
                          {((importPrimaryAction === 'attendance_fix' && attendanceCorrectionMode === 'single') || (importPrimaryAction !== 'attendance_fix' && (importOperation === 'attendance_specific_date' || importOperation === 'attendance_specific_date_then_new'))) && (
                            <TextField
                              size="small"
                              label="Fecha a actualizar"
                              value={attendanceStartDate ? formatIsoDateToDisplay(attendanceStartDate) : ''}
                              onClick={(e) => {
                                setAttendanceCalendarMode('single')
                                setAttendanceCalendarAnchorEl(e.currentTarget)
                              }}
                              helperText="Se actualizará únicamente esta fecha."
                              InputProps={{
                                readOnly: true,
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <CalendarMonth sx={{ fontSize: 20, color: 'text.secondary' }} />
                                  </InputAdornment>
                                ),
                              }}
                              sx={{
                                maxWidth: { md: 360 },
                                '& .MuiInputBase-root, & .MuiInputBase-input': {
                                  cursor: attendanceDateIsoOptions.length === 0 ? 'default' : 'pointer',
                                },
                              }}
                              disabled={attendanceDateIsoOptions.length === 0 || importParsing || importing}
                            />
                          )}
                          {importOperation === 'attendance_overwrite' && (importPrimaryAction !== 'attendance_fix' || attendanceCorrectionMode === 'range') && (
                            <TextField
                              size="small"
                              label="Rango a actualizar"
                              value={
                                attendanceStartDate && attendanceEndDate
                                  ? `${formatIsoDateToDisplay(attendanceStartDate)} - ${formatIsoDateToDisplay(attendanceEndDate)}`
                                  : attendanceStartDate
                                    ? `${formatIsoDateToDisplay(attendanceStartDate)} -`
                                    : ''
                              }
                              onClick={(e) => {
                                setAttendanceCalendarMode('range')
                                setAttendanceCalendarAnchorEl(e.currentTarget)
                              }}
                              helperText="Elige fecha inicial y fecha final en el calendario."
                              InputProps={{
                                readOnly: true,
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <CalendarMonth sx={{ fontSize: 20, color: 'text.secondary' }} />
                                  </InputAdornment>
                                ),
                              }}
                              sx={{
                                gridColumn: { xs: '1 / -1', md: importPrimaryAction === 'attendance_fix' ? '1' : 'auto' },
                                maxWidth: { md: 360 },
                                '& .MuiInputBase-root, & .MuiInputBase-input': {
                                  cursor: attendanceDateIsoOptions.length === 0 ? 'default' : 'pointer',
                                },
                              }}
                              disabled={attendanceDateIsoOptions.length === 0 || importParsing || importing}
                            />
                          )}
                          {importOperation === 'attendance_specific_dates' && (importPrimaryAction !== 'attendance_fix' || attendanceCorrectionMode === 'multi') && (
                            <TextField
                              size="small"
                              label="Fechas a actualizar"
                              value={
                                attendanceSelectedDates.length === 0
                                  ? ''
                                  : attendanceSelectedDates.length <= 3
                                    ? [...attendanceSelectedDates].sort().map(formatIsoDateToDisplay).join(', ')
                                    : `${attendanceSelectedDates.length} fechas seleccionadas`
                              }
                              onClick={(e) => {
                                setAttendanceCalendarMode('multi')
                                setAttendanceCalendarAnchorEl(e.currentTarget)
                              }}
                              helperText="Puedes elegir fechas no continuas."
                              InputProps={{
                                readOnly: true,
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <CalendarMonth sx={{ fontSize: 20, color: 'text.secondary' }} />
                                  </InputAdornment>
                                ),
                              }}
                              sx={{
                                gridColumn: { xs: '1 / -1', md: importPrimaryAction === 'attendance_fix' ? '1' : '2 / -1' },
                                maxWidth: { md: 360 },
                                '& .MuiInputBase-root, & .MuiInputBase-input': {
                                  cursor: attendanceDateIsoOptions.length === 0 ? 'default' : 'pointer',
                                },
                              }}
                              disabled={attendanceDateIsoOptions.length === 0 || importParsing || importing}
                            />
                          )}
                          {importPrimaryAction !== 'attendance_fix' && (
                          <FormControl size="small" sx={{ gridColumn: { xs: '1 / -1', md: '1 / -1' } }}>
                            <InputLabel>{importOperation === 'attendance_specific_workers' ? 'Trabajadores a actualizar (requerido)' : 'Trabajadores a actualizar (opcional)'}</InputLabel>
                            <Select
                              multiple
                              label={importOperation === 'attendance_specific_workers' ? 'Trabajadores a actualizar (requerido)' : 'Trabajadores a actualizar (opcional)'}
                              value={attendanceTargetDocuments}
                              onChange={(e) => setAttendanceTargetDocuments((e.target.value as string[]) || [])}
                              renderValue={(selected) => {
                                const list = Array.isArray(selected) ? selected : []
                                if (list.length === 0) return 'Todos los trabajadores del archivo'
                                if (list.length <= 3) return list.join(', ')
                                return `${list.slice(0, 3).join(', ')} +${list.length - 3}`
                              }}
                            >
                              {attendanceDocumentOptions.map((doc) => (
                                <MenuItem key={`attendance-doc-${doc}`} value={doc}>{formatDocumentForDisplay(doc)}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          )}
                          <Popover
                            open={Boolean(attendanceCalendarAnchorEl)}
                            anchorEl={attendanceCalendarAnchorEl}
                            onClose={() => setAttendanceCalendarAnchorEl(null)}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                          >
                            <Box sx={{ p: 0.75, width: { xs: 300, sm: 320 }, maxWidth: 'calc(100vw - 24px)' }}>
                              <DateCalendar
                                value={null}
                                referenceDate={attendanceCalendarReferenceDate || undefined}
                                minDate={firstAttendanceCalendarDate || undefined}
                                maxDate={lastAttendanceCalendarDate || undefined}
                                shouldDisableDate={(day) => !attendanceDateIsoSet.has(localDateToIsoDate(day as Date))}
                                onChange={(next) => {
                                  const isoDate = localDateToIsoDate(next as Date | null)
                                  if (!isoDate || !attendanceDateIsoSet.has(isoDate)) return
                                  if (attendanceCalendarMode === 'single') {
                                    setAttendanceStartDate(isoDate)
                                    setAttendanceCalendarAnchorEl(null)
                                    return
                                  }
                                  if (attendanceCalendarMode === 'range') {
                                    if (!attendanceStartDate || attendanceEndDate) {
                                      setAttendanceStartDate(isoDate)
                                      setAttendanceEndDate('')
                                      return
                                    }
                                    if (isoDate < attendanceStartDate) {
                                      setAttendanceEndDate(attendanceStartDate)
                                      setAttendanceStartDate(isoDate)
                                    } else {
                                      setAttendanceEndDate(isoDate)
                                    }
                                    setAttendanceCalendarAnchorEl(null)
                                    return
                                  }
                                  setAttendanceSelectedDates((prev) => (
                                    prev.includes(isoDate)
                                      ? prev.filter((date) => date !== isoDate)
                                      : [...prev, isoDate].sort()
                                  ))
                                }}
                                slots={{
                                  day: (props: PickersDayProps) => {
                                    const isoDate = localDateToIsoDate(props.day as Date)
                                    const isSelected =
                                      attendanceCalendarMode === 'multi'
                                        ? attendanceSelectedDates.includes(isoDate)
                                        : attendanceCalendarMode === 'range'
                                          ? attendanceStartDate === isoDate || attendanceEndDate === isoDate
                                          : attendanceStartDate === isoDate
                                    const isInRange = Boolean(attendanceStartDate && attendanceEndDate && isoDate >= attendanceStartDate && isoDate <= attendanceEndDate)
                                    return (
                                      <PickersDay
                                        {...props}
                                        selected={isSelected}
                                        sx={{
                                          ...(isInRange && attendanceCalendarMode === 'range'
                                            ? { backgroundColor: 'rgba(25,118,210,0.14)' }
                                            : {}),
                                        }}
                                      />
                                    )
                                  }
                                }}
                                sx={{
                                  mx: 'auto',
                                  width: '100%',
                                  maxWidth: 304,
                                  '& .MuiPickersCalendarHeader-root': { px: 1, mb: 0.25 },
                                  '& .MuiDayCalendar-header': { mb: 0.15 },
                                  '& .MuiDayCalendar-weekContainer': { my: 0.1 },
                                  '& .MuiPickersSlideTransition-root': { minHeight: 210 },
                                }}
                              />
                              {attendanceCalendarMode === 'multi' && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, px: 1, pb: 1 }}>
                                  <Button size="small" onClick={() => setAttendanceSelectedDates([])}>
                                    Limpiar
                                  </Button>
                                  <Button size="small" variant="contained" onClick={() => setAttendanceCalendarAnchorEl(null)}>
                                    Listo
                                  </Button>
                                </Box>
                              )}
                            </Box>
                          </Popover>
                        </Box>
                    ) : null}
                  </Box>
                  )}
                  {importValidationMessages.length > 0 && (
                    <Alert severity={duplicateMappedFields.length > 0 && importValidationMessages.length === 1 ? 'warning' : 'error'} sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                        Revisa el mapeo antes de importar
                      </Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                        {importValidationMessages.map((message) => (
                          <Typography key={message} component="li" variant="body2">
                            {message}
                          </Typography>
                        ))}
                      </Box>
                    </Alert>
                  )}

                  {shouldShowFullImportMapper ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', md: 'row' },
                      gap: 2,
                      mb: 2,
                      alignItems: 'flex-start',
                      maxHeight: { xs: 'none', md: '52vh' },
                      minHeight: 0,
                    }}
                  >
                    {/* Left: Excel headers as cards */}
                    <Box
                      sx={{
                        flex: 1,
                        width: '100%',
                        maxHeight: { xs: 'none', md: '52vh' },
                        overflowY: { xs: 'visible', md: 'auto' },
                        pr: { md: 0.5 },
                      }}
                    >
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 1.25 }}>
                      {(importOperation === 'profile_specific_columns' || importPrimaryAction === 'new_collaborators'
                        ? profileDataHeaderEntries
                        : (importHeaders || []).map((hdr, idx) => ({ hdr, idx }))
                      ).map(({ hdr, idx }) => {
                        const currentHeaderKey = headerMapKey(hdr, idx)
                        const isAttendanceColumn =
                          isAttendanceOperation && (
                            Boolean(parseHeaderDateToISO(hdr)) ||
                            (attendanceStartColumnIndex >= 0 && idx >= attendanceStartColumnIndex)
                          )
                        const selected = mapping?.[currentHeaderKey] || ''
                        const missingRequired = missingRequiredFields.length > 0 && !selected
                        const isIgnored = !selected || selected === 'ignore'
                        const isInvalidDuplicate = !!selected && selected !== 'ignore' && duplicateMappedFields.includes(selected)
                        return (
                          <Paper key={`${idx}-${hdr}`} variant="outlined" sx={{ p: 1.25, borderColor: isAttendanceColumn ? 'info.main' : (isInvalidDuplicate ? 'warning.main' : (missingRequired ? 'error.main' : (isIgnored ? 'warning.main' : 'divider'))), minWidth: 200 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" gap={1}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>{hdr}</Typography>
                              <Box
                                component="span"
                                sx={{
                                  flexShrink: 0,
                                  px: 0.75,
                                  py: 0.15,
                                  borderRadius: 1,
                                  fontSize: '0.72rem',
                                  lineHeight: 1.4,
                                  color: isAttendanceColumn
                                    ? 'info.dark'
                                    : selected && selected !== 'ignore'
                                      ? 'success.dark'
                                      : 'text.secondary',
                                  backgroundColor: isAttendanceColumn
                                    ? 'rgba(2, 136, 209, 0.1)'
                                    : selected && selected !== 'ignore'
                                      ? 'rgba(46, 125, 50, 0.1)'
                                      : 'rgba(0, 0, 0, 0.06)',
                                }}
                              >
                                {isAttendanceColumn ? 'Asistencia (fecha)' : (selected ? getColumnLabel(selected) : 'Sin mapear')}
                              </Box>
                            </Box>

                            <Typography variant="caption" color="text.secondary">Ejemplos (primeras 3 filas)</Typography>
                            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5, mb: 0.75 }}>
                              {importRows && importRows.length > 0 ? importRows.slice(0, 3).map((row, rIdx) => (
                                <Typography key={rIdx} variant="body2" sx={{ backgroundColor: 'rgba(0,0,0,0.03)', px: 0.8, py: 0.25, borderRadius: 1, lineHeight: 1.35 }}>{Array.isArray(row) ? (row[idx] ?? '') : (row[hdr] ?? '')}</Typography>
                              )) : (
                                <Typography variant="body2" color="text.secondary">— Sin filas —</Typography>
                              )}
                            </Box>

                            <FormControl
                              fullWidth
                              size="small"
                              sx={{
                                '& .MuiInputBase-root': { minHeight: 36 },
                                '& .MuiSelect-select': {
                                  py: 0.75,
                                  fontWeight: selected && selected !== 'ignore' ? 600 : 400,
                                  color: selected && selected !== 'ignore' ? 'primary.main' : 'text.primary',
                                },
                              }}
                            >
                              <InputLabel>Mapear a</InputLabel>
                              <Select
                                value={isAttendanceColumn ? '' : selected}
                                label="Mapear a"
                                disabled={isAttendanceColumn}
                                displayEmpty
                                renderValue={(value) => value && value !== 'ignore' ? getColumnLabel(String(value)) : 'No mapear'}
                                onChange={(e) => setMapping((prev: any) => ({ ...(prev || {}), [currentHeaderKey]: e.target.value }))}
                                MenuProps={{
                                  PaperProps: {
                                    sx: {
                                      maxHeight: 360,
                                      '& .MuiMenuItem-root': {
                                        position: 'relative',
                                        alignItems: 'flex-start',
                                        minHeight: 44,
                                        py: 0.8,
                                        borderRadius: 1,
                                        mx: 0.75,
                                        my: 0.25,
                                        '&:hover': {
                                          backgroundColor: 'rgba(0, 95, 184, 0.08)',
                                        },
                                        '&.Mui-selected': {
                                          backgroundColor: 'rgba(0, 95, 184, 0.12)',
                                          '&::before': {
                                            content: '""',
                                            position: 'absolute',
                                            left: 0,
                                            top: 6,
                                            bottom: 6,
                                            width: 3,
                                            borderRadius: 3,
                                            backgroundColor: 'primary.main',
                                          },
                                          '&:hover': {
                                            backgroundColor: 'rgba(0, 95, 184, 0.16)',
                                          },
                                        },
                                      },
                                    },
                                  },
                                }}
                              >
                                <MenuItem value="">
                                  <Box>
                                    <Typography variant="body2">No mapear</Typography>
                                    <Typography variant="caption" color="text.secondary">Ignorar esta columna del Excel</Typography>
                                  </Box>
                                </MenuItem>
                                {selectableCollaboratorColumns.map(col => {
                                  const alreadyUsedByOther = !multiMapAllowedFields.has(col) &&
                                    Object.entries(mapping || {}).some(([otherKey, mapped]) => otherKey !== currentHeaderKey && mapped === col)
                                  return (
                                    <MenuItem key={col} value={col} disabled={alreadyUsedByOther}>
                                      <Box sx={{ display: 'flex', width: '100%', gap: 1, justifyContent: 'space-between' }}>
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.25 }}>
                                            {getColumnLabel(col)}
                                          </Typography>
                                          {collaboratorColumnDescriptions?.[col] && (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.25 }}>
                                              {collaboratorColumnDescriptions[col]}
                                            </Typography>
                                          )}
                                        </Box>
                                        {alreadyUsedByOther && (
                                          <Box
                                            component="span"
                                            sx={{
                                              flexShrink: 0,
                                              px: 0.75,
                                              py: 0.1,
                                              borderRadius: 1,
                                              fontSize: '0.7rem',
                                              lineHeight: 1.4,
                                              color: 'text.secondary',
                                              backgroundColor: 'rgba(0, 0, 0, 0.06)',
                                            }}
                                          >
                                            Ya usado
                                          </Box>
                                        )}
                                      </Box>
                                    </MenuItem>
                                  )
                                })}
                              </Select>
                            </FormControl>

                            {missingRequired && (
                              <Typography variant="caption" color="error">Campo requerido no mapeado</Typography>
                            )}
                            {isAttendanceColumn && (
                              <Typography variant="caption" color="info.main">Esta columna se usará para importar asistencia diaria.</Typography>
                            )}
                            {isInvalidDuplicate && (
                              <Typography variant="caption" color="warning.main">Este campo no admite múltiples columnas.</Typography>
                            )}
                          </Paper>
                        )
                      })}
                      </Box>
                    </Box>

                    {/* Right: collaborator fields status */}
                    <Box sx={{ width: { xs: '100%', md: '320px' }, maxHeight: { xs: 'none', md: '52vh' }, overflowY: { xs: 'visible', md: 'auto' }, borderRadius: 1, pr: { md: 0.5 } }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Campos de colaboradores</Typography>
                      <Box sx={{ display: 'grid', gap: 1 }}>
                        {selectableCollaboratorColumns.map(col => {
                          const mapped = mappedFieldsSet.has(col)
                          return (
                            <Paper key={col} variant="outlined" sx={{ p: 1, backgroundColor: mapped ? 'rgba(0,128,0,0.03)' : 'rgba(0,0,0,0.02)', borderColor: mapped ? 'success.main' : 'divider' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                                <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.25 }}>{getColumnLabel(col)}</Typography>
                                <Box
                                  component="span"
                                  sx={{
                                    flexShrink: 0,
                                    px: 0.75,
                                    py: 0.15,
                                    borderRadius: 1,
                                    fontSize: '0.72rem',
                                    lineHeight: 1.4,
                                    color: mapped ? 'success.dark' : 'text.secondary',
                                    backgroundColor: mapped ? 'rgba(46, 125, 50, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                                  }}
                                >
                                  {mapped ? 'Recibe datos' : 'Sin datos'}
                                </Box>
                              </Box>
                              {collaboratorColumnDescriptions?.[col] && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, lineHeight: 1.35 }}>
                                  {collaboratorColumnDescriptions[col]}
                                </Typography>
                              )}
                            </Paper>
                          )
                        })}
                      </Box>
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">Columnas del Excel que no serán importadas:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                          {excelIgnoredHeaders.length > 0 ? excelIgnoredHeaders.map(h => (
                            <Chip key={h} label={h} size="small" color="warning" />
                          )) : (
                            <Typography variant="caption" color="text.secondary">Ninguna</Typography>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                  ) : null}

                  {!importConfigurationCollapsed && (showImportAdvancedOptions || showImportMappingEditor) && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                      <Button size="small" variant="text" onClick={() => setShowImportPreviewTables((prev) => !prev)}>
                        {showImportPreviewTables ? 'Ocultar vistas técnicas' : 'Mostrar vistas técnicas'}
                      </Button>
                    </Box>
                  )}

                  {showImportPreviewTables && (
                  <>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Vista previa original</Typography>
                  <Box sx={{ width: '100%', overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Table size="small" sx={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                    <TableHead>
                      <TableRow>
                        {importHeaders.map(h => (
                          <TableCell
                            key={h}
                            sx={{
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                              wordBreak: 'normal',
                              backgroundColor: 'rgba(0,0,0,0.03)',
                              border: '1px solid',
                              borderColor: 'divider',
                              padding: '6px 8px',
                              minWidth: 140
                            }}
                          >
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {importRows.slice(0,5).map((r, i) => (
                        <TableRow key={i}>
                          {importHeaders.map((h, idx) => (
                            <TableCell
                              key={h + String(i)}
                              sx={{
                                fontSize: '0.8rem',
                                whiteSpace: 'nowrap',
                                wordBreak: 'normal',
                                border: '1px solid',
                                borderColor: 'divider',
                                padding: '6px 8px',
                                minWidth: 140,
                                maxWidth: 280,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={String(r[idx] || '')}
                            >
                              {r[idx] || ''}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </Box>

                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                    Vista previa mapeada
                  </Typography>
                  {mappedPreview.headers.length === 0 ? (
                    <Alert severity="info" sx={{ mb: 1 }}>
                      Aun no hay columnas mapeadas para mostrar el resultado de importacion.
                    </Alert>
                  ) : (
                    <Box sx={{ width: '100%', overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                      <Table size="small" sx={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                        <TableHead>
                          <TableRow>
                            {mappedPreview.headers.map((field) => (
                              <TableCell
                                key={`mapped-${field}`}
                                sx={{
                                  fontSize: '0.8rem',
                                  whiteSpace: 'nowrap',
                                  wordBreak: 'normal',
                                  backgroundColor: 'rgba(25,118,210,0.08)',
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  padding: '6px 8px',
                                  minWidth: 160
                                }}
                              >
                                {getColumnLabel(field)} ({field})
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {mappedPreview.rows.map((row, i) => (
                            <TableRow key={`mapped-row-${i}`}>
                              {mappedPreview.headers.map((field) => (
                                <TableCell
                                  key={`mapped-${field}-${i}`}
                                  sx={{
                                    fontSize: '0.8rem',
                                    whiteSpace: 'nowrap',
                                    wordBreak: 'normal',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    padding: '6px 8px',
                                    minWidth: 160,
                                    maxWidth: 320,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}
                                  title={String(row[field] || '')}
                                >
                                  {row[field] || ''}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  )}
                  </>
                  )}

                  {shouldShowAttendanceImportPreview && (
                    <>
                      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                        Vista previa asistencia
                      </Typography>
                      {attendancePreview.dates.length === 0 ? (
                        <Alert severity="info" sx={{ mb: 1 }}>
                          No hay columnas de fecha detectadas para generar la vista previa de asistencia.
                        </Alert>
                      ) : attendancePreview.rows.length === 0 ? (
                        <Alert severity="info" sx={{ mb: 1 }}>
                          No hay filas con documento/asistencia para mostrar.
                        </Alert>
                      ) : (
                        <Box sx={{ width: '100%', overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                          <Table size="small" sx={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ fontSize: '0.8rem', fontWeight: 700, backgroundColor: 'rgba(25,118,210,0.08)', border: '1px solid', borderColor: 'divider', minWidth: 160 }}>
                                  Documento
                                </TableCell>
                                {attendancePreview.dates.map((dateCol) => {
                                  const isImportColumn = importCandidateDates.includes(dateCol.isoDate)
                                  return (
                                    <TableCell
                                      key={`attendance-preview-header-${dateCol.isoDate}`}
                                      sx={{
                                        fontSize: '0.8rem',
                                        whiteSpace: 'nowrap',
                                        backgroundColor: isImportColumn ? colors.blue13 : 'rgba(25,118,210,0.08)',
                                        color: isImportColumn ? colors.blue1 : 'inherit',
                                        fontWeight: isImportColumn ? 700 : 500,
                                        border: '1px solid',
                                        borderColor: isImportColumn ? colors.blue8 : 'divider',
                                        minWidth: 120
                                      }}
                                    >
                                      {formatIsoDateToDisplay(dateCol.isoDate)}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {attendancePreview.rows.map((row) => (
                                <TableRow key={`attendance-preview-row-${row.document}`}>
                                  <TableCell sx={{ fontSize: '0.8rem', border: '1px solid', borderColor: 'divider', fontWeight: 600 }}>
                                    {formatDocumentForDisplay(row.document)}
                                  </TableCell>
                                  {attendancePreview.dates.map((dateCol) => {
                                    const value = row.byDate[dateCol.isoDate]
                                    const label = value?.status ? `${value.code} (${value.status})` : (value?.code || '')
                                    const isImportColumn = importCandidateDates.includes(dateCol.isoDate)
                                    return (
                                      <TableCell
                                        key={`attendance-preview-cell-${row.document}-${dateCol.isoDate}`}
                                        sx={{
                                          fontSize: '0.78rem',
                                          border: '1px solid',
                                          borderColor: isImportColumn ? colors.blue8 : 'divider',
                                          backgroundColor: isImportColumn ? 'rgba(51,147,255,0.10)' : 'transparent',
                                          minWidth: 120
                                        }}
                                        title={label}
                                      >
                                        {label || '-'}
                                      </TableCell>
                                    )
                                  })}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      )}
                    </>
                  )}

                </DialogContent>
                <DialogActions>
                  <Button onClick={requestCloseImportDialog} disabled={importing || importParsing}>Cancelar</Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={async () => {
                      if (importPrimaryAction === 'new_collaborators') {
                        handleExecuteImport({
                          onDuplicate: 'skip',
                          createAuth: false,
                          updateDefaults: false,
                          attendanceOnly: false,
                          profileOnly: false,
                          allowAttendanceForSkippedDuplicates: true,
                          attendanceWriteMode: 'upsert',
                          attendanceExactDate: excelIncludesToday ? todayIsoDate : undefined,
                        })
                        return
                      }
                      if (importOperation === 'attendance_specific_date_then_new') {
                        try {
                          await handleExecuteImport({
                            onDuplicate: 'overwrite',
                            createAuth: false,
                            updateDefaults: false,
                            attendanceOnly: true,
                            attendanceWriteMode: 'upsert',
                            attendanceStartDate: attendanceStartDate || undefined,
                            attendanceExactDate: attendanceStartDate || undefined,
                            attendanceStartColumnIndex: attendanceStartColumnIndex >= 0 ? attendanceStartColumnIndex : undefined,
                            targetDocuments: attendanceTargetDocuments,
                            keepDialogState: true,
                            suppressNotice: true,
                          })
                          await handleExecuteImport({
                            onDuplicate: 'skip',
                            createAuth: false,
                            updateDefaults: false,
                            attendanceOnly: false,
                            profileOnly: false,
                            allowAttendanceForSkippedDuplicates: false,
                          })
                        } catch {
                          // Errors are handled inside handleExecuteImport
                        }
                        return
                      }
                      if (importOperation === 'full_overwrite_all') {
                        handleExecuteImport({
                          onDuplicate: 'overwrite',
                          createAuth: false,
                          updateDefaults: false,
                          attendanceOnly: false,
                          profileOnly: false,
                          attendanceWriteMode: 'upsert',
                          attendanceStartDate: attendanceStartDate || undefined,
                          attendanceStartColumnIndex: attendanceStartColumnIndex >= 0 ? attendanceStartColumnIndex : undefined,
                          targetDocuments: attendanceTargetDocuments,
                        })
                        return
                      }
                      if (importOperation === 'profile_specific_columns') {
                        handleExecuteImport({
                          onDuplicate: 'overwrite',
                          createAuth: false,
                          updateDefaults: false,
                          attendanceOnly: false,
                          profileOnly: true,
                        })
                        return
                      }
                      handleExecuteImport({
                        onDuplicate: 'overwrite',
                        createAuth: false,
                        updateDefaults: false,
                        attendanceOnly: true,
                        attendanceWriteMode,
                        attendanceStartDate: importPrimaryAction === 'attendance_fix'
                          ? (attendanceStartDate || undefined)
                          : attendanceDailyImportScope === 'next'
                            ? (suggestedSingleImportDate || undefined)
                            : (attendanceStartDate || undefined),
                        attendanceEndDate: importOperation === 'attendance_overwrite'
                          ? (attendanceEndDate || undefined)
                          : undefined,
                        attendanceExactDate: importOperation === 'attendance_specific_date'
                          ? (attendanceStartDate || undefined)
                          : importPrimaryAction !== 'attendance_fix' && attendanceDailyImportScope === 'next'
                            ? (suggestedSingleImportDate || undefined)
                          : undefined,
                        attendanceExactDates: importOperation === 'attendance_specific_dates'
                          ? importCandidateDates
                          : undefined,
                        attendanceStartColumnIndex: attendanceStartColumnIndex >= 0 ? attendanceStartColumnIndex : undefined,
                        targetDocuments: attendanceTargetDocuments,
                      })
                    }}
                    disabled={importing || importParsing || !canExecuteImportByMode || (importPrimaryAction !== 'new_collaborators' && isAttendanceOperation && !needsImportMappingReview && importCandidateDates.length === 0)}
                  >
                    Ejecutar
                  </Button>
                </DialogActions>
              </Dialog>

          <Backdrop
            open={importing}
            sx={{
              color: '#fff',
              zIndex: (theme) => theme.zIndex.modal + 10,
              backgroundColor: 'rgba(8, 23, 40, 0.68)'
            }}
          >
            <Box sx={{ textAlign: 'center', px: 3 }}>
              <CircularProgress color="inherit" />
              <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
                Importación en proceso
              </Typography>
              <Box sx={{ mt: 1.5, width: { xs: 260, sm: 360 } }}>
                <LinearProgress
                  variant="determinate"
                  value={Math.max(0, Math.min(100, importProgress))}
                  sx={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.25)' }}
                />
                <Typography variant="caption" sx={{ display: 'block', mt: 0.75, opacity: 0.92 }}>
                  {Math.max(0, Math.min(100, Math.round(importProgress)))}%
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {importStatusMessage || (importOperation === 'profile_specific_columns'
                  ? 'Actualizando datos de colaboradores. No cierres esta ventana.'
                  : 'Escribiendo colaboradores y asistencia. No cierres esta ventana.')}
              </Typography>
            </Box>
          </Backdrop>

          {/* Vista principal */}
          {showAttendanceForUser ? (
            <Box
              sx={{
                mt: 1,
                '& > .MuiBox-root > .MuiBox-root > :first-of-type': {
                  display: 'none',
                },
                '& .MuiContainer-root': {
                  px: '0 !important',
                  pt: '0 !important',
                  pb: '0 !important',
                },
              }}
            >
              <AttendanceView
                renderImportAction={() => (
                  <Tooltip title="Cargar colaboradores" arrow>
                    <span className="attendance-action attendance-compact-action">
                      <IconButton
                        onClick={handleUploadFile}
                        aria-label="Cargar colaboradores"
                        sx={{
                          width: 38,
                          height: 34,
                          border: `1px solid ${colors.blue6}`,
                          borderRadius: 1,
                          color: colors.blue6,
                          transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease',
                          '&:hover': {
                            bgcolor: '#eef6ff',
                            borderColor: colors.blue8,
                            color: colors.blue8,
                          },
                        }}
                      >
                        <Upload fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              />
            </Box>
          ) : viewMode === 'cards' ? (
            <Box
              sx={{
                width: '100%',
                display: 'grid',
                gap: { xs: 1.5, md: 1.25, xl: 1.5 },
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(4, minmax(0, 1fr))',
                  lg: 'repeat(5, minmax(0, 1fr))'
                }
              }}
            >
            {filteredCollaborators.map((collaborator) => (
              <Paper 
                key={collaborator.id} 
                elevation={2}
                sx={{ 
                  minWidth: 0,
                  p: { xs: 1.5, md: 1.25, xl: 1.5 },
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 2,
                  border: `1px solid ${colors.gray1}`,
                  '&:hover': {
                    borderColor: colors.blue6,
                    boxShadow: `0 4px 12px ${colors.blue15}`
                  }
                }}
              >
                {/* Header con avatar y nombre */}
                <Box display="flex" alignItems="center" mb={{ xs: 1.5, md: 1.25 }}>
                  <Avatar 
                    src={collaborator.photo_url} 
                    sx={{ width: { xs: 48, sm: 54, md: 44, lg: 48, xl: 54 }, height: { xs: 48, sm: 54, md: 44, lg: 48, xl: 54 }, mr: { xs: 1.5, md: 1 }, bgcolor: colors.blue6, fontSize: { xs: '1rem', sm: '1.15rem', md: '1rem', xl: '1.2rem' } }}
                    imgProps={{ style: { objectFit: 'cover' } }}
                  >
                            {`${(collaborator.first_name || '').trim().charAt(0)}${(collaborator.last_name || '').trim().charAt(0)}`.toUpperCase() || '?'}
                  </Avatar>
                  <Box flex={1} minWidth={0}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 600,
                        color: colors.blue1,
                        mb: { xs: 0.5, md: 0.25 },
                        fontSize: { xs: '1rem', md: '0.78rem', lg: '0.82rem', xl: '0.9rem' },
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.15,
                        minHeight: '2.3em',
                      }}
                    >
                      {upperText(`${collaborator.first_name || ''} ${collaborator.last_name || ''}`, 'SIN NOMBRE')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.gray6, fontSize: { md: '0.76rem', xl: '0.82rem' }, lineHeight: 1.2 }}>
                      {formatDocumentForDisplay(collaborator.document)}
                    </Typography>
                  </Box>
                  <Chip 
                    label={collaborator.is_active ? 'Vigente' : 'Finiquitado'}
                    size="small"
                    sx={{
                      backgroundColor: collaborator.is_active ? colors.blue15 : colors.gray8,
                      color: collaborator.is_active ? colors.blue6 : colors.gray4,
                      fontSize: { xs: '0.7rem', md: '0.64rem', xl: '0.7rem' },
                      height: { xs: 20, md: 18, xl: 20 },
                      px: { md: 0.25 }
                    }}
                  />
                </Box>

                {/* Información del colaborador */}
                <Box
                  mb={{ xs: 2, md: 1.25 }}
                  sx={{
                    display: 'grid',
                    rowGap: { xs: 0.65, md: 0.5, xl: 0.6 },
                    '& .collaborator-data-row': {
                      color: colors.gray6,
                      fontSize: { md: '0.72rem', lg: '0.74rem', xl: '0.8rem' },
                      lineHeight: 1.35,
                      overflowWrap: 'anywhere'
                    }
                  }}
                >
                  <Typography variant="body2" className="collaborator-data-row">
                    📧 {lowerText(collaborator.email, 'sin correo')}
                  </Typography>
                  <Typography variant="body2" className="collaborator-data-row">
                    📞 {upperText(collaborator.phone, 'SIN TELÉFONO')}
                  </Typography>
                  {showNationality && (
                    <Typography variant="body2" className="collaborator-data-row">
                      🌐 {upperText(collaborator.nationality, 'SIN ESPECIFICAR')}
                    </Typography>
                  )}
                  <Typography variant="body2" className="collaborator-data-row">
                    👷 {upperText(collaborator.worker_type, 'SIN ESPECIFICAR')}
                  </Typography>
                  <Typography variant="body2" className="collaborator-data-row">
                    💼 {upperText(collaborator.position, 'SIN CARGO')}
                  </Typography>
                  <Typography variant="body2" className="collaborator-data-row">
                    🏷️ {upperText(getEffectiveStatus(collaborator), 'SIN CONDICIÓN')}
                  </Typography>
                  <Typography variant="body2" className="collaborator-data-row">
                    📄 {upperText(collaborator.contract, 'SIN CONTRATO')}
                  </Typography>
                  <Typography variant="body2" className="collaborator-data-row">
                    🏠 {upperText(collaborator.address, 'SIN DIRECCIÓN')}
                  </Typography>
                  {showSalary && collaborator.salary && (
                    <Typography variant="body2" className="collaborator-data-row">
                      💰 {formatCurrency(collaborator.salary, companyCountry)}
                    </Typography>
                  )}
                  <Typography variant="body2" className="collaborator-data-row">
                    📅 Ingreso: {collaborator.hire_date ? new Date(collaborator.hire_date).toLocaleDateString('es-CL') : 'Sin fecha'}
                  </Typography>
                  <Typography variant="body2" className="collaborator-data-row">
                    👕 Superior: {collaborator.upper_clothing_size || 'Sin especificar'}
                  </Typography>
                  <Typography variant="body2" className="collaborator-data-row">
                    👖 Inferior: {collaborator.lower_clothing_size || 'Sin especificar'}
                  </Typography>
                  <Typography variant="body2" className="collaborator-data-row">
                    👟 Zapatos: {collaborator.shoe_size || 'Sin especificar'}
                  </Typography>
                </Box>

                {/* Botones de acción */}
                <Box
                  display="flex"
                  gap={1}
                  justifyContent="flex-end"
                  flexWrap="wrap"
                  mt="auto"
                  pt={1}
                  sx={{
                    gap: { xs: 1, md: 0.6, xl: 0.8 },
                    '& .MuiButton-root': {
                      minWidth: 0,
                      flex: { xs: '1 1 120px', md: '1 1 86px', xl: '1 1 110px' },
                      px: { md: 0.5, xl: 0.75 },
                      py: { md: 0.35, xl: 0.45 },
                      fontSize: { md: '0.66rem', lg: '0.68rem', xl: '0.75rem' },
                      lineHeight: 1.2,
                      '& .MuiButton-startIcon': {
                        mr: { md: 0.35, xl: 0.5 },
                        '& svg': {
                          fontSize: { md: 16, xl: 18 }
                        }
                      }
                    }
                  }}
                >
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EventNote />}
                    sx={{
                      textTransform: 'none',
                      borderColor: colors.blue4,
                      color: colors.blue4,
                      '&:hover': {
                        borderColor: colors.blue6,
                        backgroundColor: colors.blue15
                      }
                    }}
                    onClick={() => openDailyStatusDialog(collaborator)}
                  >
                    Estado día
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Edit />}
                    sx={{
                      textTransform: 'none',
                      borderColor: colors.blue6,
                      color: colors.blue6,
                      '&:hover': {
                        borderColor: colors.blue4,
                        backgroundColor: colors.blue15
                      }
                    }}
                    onClick={() => handleEditCollaborator(collaborator)}
                  >
                    Editar
                  </Button>
                  {collaborator.is_active ? (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Trash2 size={16} />}
                      sx={{
                        textTransform: 'none',
                        borderColor: colors.gray4,
                        color: colors.gray4,
                        '&:hover': {
                          borderColor: colors.gray2,
                          backgroundColor: colors.gray9
                        }
                      }}
                      onClick={() => handleDeactivateCollaborator(collaborator)}
                    >
                      Desactivar
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Add />}
                      sx={{
                        textTransform: 'none',
                        borderColor: colors.blue4,
                        color: colors.blue4,
                        '&:hover': {
                          borderColor: colors.blue6,
                          backgroundColor: colors.blue15
                        }
                      }}
                      onClick={() => handleActivateCollaborator(collaborator)}
                    >
                      Activar
                    </Button>
                  )}
                </Box>
              </Paper>
            ))}
            </Box>
          ) : (
            /* Tabla compacta tipo Excel */
            <TableContainer
              component={Paper}
              sx={{
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto',
                overflowY: 'hidden'
              }}
            >
              <Table
                size="small"
                sx={{
                  minWidth: 1400,
                  tableLayout: 'auto',
                  '& th, & td': {
                    whiteSpace: 'nowrap'
                  }
                }}
              >
                <TableHead>
                  <TableRow sx={{ backgroundColor: colors.blue15 }}>
                    <TableCell
                      sx={{
                        width: 56,
                        minWidth: 56,
                        p: 1,
                        ...getPinnedHeaderSx('avatar')
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => togglePinnedColumn('avatar')}
                        sx={{ color: isPinnedColumn('avatar') ? colors.blue6 : colors.gray6 }}
                      >
                        <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                      </IconButton>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        color: colors.blue1,
                        minWidth: 170,
                        ...getPinnedHeaderSx('name')
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => togglePinnedColumn('name')}
                          sx={{ color: isPinnedColumn('name') ? colors.blue6 : colors.gray6 }}
                        >
                          <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                        </IconButton>
                        <Box
                          sx={{
                            cursor: 'pointer',
                            px: 0.5,
                            py: 0.25,
                            color: colors.blue1,
                            '&:hover': {
                              color: colors.blue6
                            }
                          }}
                          onClick={openNameSortSelector}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                            Nombre Completo ({nameSortBy === 'first_name' ? 'Nombre' : 'Apellido'})
                          </Typography>
                        </Box>
                        <TableSortLabel
                          active={tableSortField === 'name'}
                          direction={tableSortField === 'name' ? tableSortDirection : 'asc'}
                          onClick={() => handleTableSort('name')}
                          sx={{
                            '&:hover': {
                              color: colors.blue6
                            }
                          }}
                        >
                          A-Z
                        </TableSortLabel>
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        color: colors.blue1,
                        minWidth: 100,
                        ...getPinnedHeaderSx('document')
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconButton
                          size="small"
                          onClick={() => togglePinnedColumn('document')}
                          sx={{ color: isPinnedColumn('document') ? colors.blue6 : colors.gray6, mr: 0.5 }}
                        >
                          <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                        </IconButton>
                        <TableSortLabel active={tableSortField === 'document'} direction={tableSortField === 'document' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('document')}>
                          Documento
                        </TableSortLabel>
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        color: colors.blue1,
                        minWidth: 150,
                        ...getPinnedHeaderSx('email')
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => togglePinnedColumn('email')}
                        sx={{ color: isPinnedColumn('email') ? colors.blue6 : colors.gray6, mr: 0.5 }}
                      >
                        <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                      </IconButton>
                      <TableSortLabel active={tableSortField === 'email'} direction={tableSortField === 'email' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('email')}>
                        Email
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 120, ...getPinnedHeaderSx('phone') }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconButton size="small" onClick={() => togglePinnedColumn('phone')} sx={{ color: isPinnedColumn('phone') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                          <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                        </IconButton>
                        <TableSortLabel active={tableSortField === 'phone'} direction={tableSortField === 'phone' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('phone')}>
                          Teléfono
                        </TableSortLabel>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 120, ...getPinnedHeaderSx('position') }}>
                      <IconButton size="small" onClick={() => togglePinnedColumn('position')} sx={{ color: isPinnedColumn('position') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                        <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                      </IconButton>
                      <TableSortLabel active={tableSortField === 'position'} direction={tableSortField === 'position' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('position')}>
                        Cargo
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 120, ...getPinnedHeaderSx('condition') }}>
                      <IconButton size="small" onClick={() => togglePinnedColumn('condition')} sx={{ color: isPinnedColumn('condition') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                        <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                      </IconButton>
                      <TableSortLabel active={tableSortField === 'condition'} direction={tableSortField === 'condition' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('condition')}>
                        Condición
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 120, ...getPinnedHeaderSx('specialty') }}>
                      <IconButton size="small" onClick={() => togglePinnedColumn('specialty')} sx={{ color: isPinnedColumn('specialty') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                        <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                      </IconButton>
                      <TableSortLabel active={tableSortField === 'specialty'} direction={tableSortField === 'specialty' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('specialty')}>
                        Especialidad
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 110, ...getPinnedHeaderSx('gender') }}>
                      <IconButton size="small" onClick={() => togglePinnedColumn('gender')} sx={{ color: isPinnedColumn('gender') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                        <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                      </IconButton>
                      <TableSortLabel active={tableSortField === 'gender'} direction={tableSortField === 'gender' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('gender')}>
                        Género
                      </TableSortLabel>
                    </TableCell>
                    {showNationality && (
                      <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 120, ...getPinnedHeaderSx('nationality') }}>
                        <IconButton size="small" onClick={() => togglePinnedColumn('nationality')} sx={{ color: isPinnedColumn('nationality') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                          <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                        </IconButton>
                        <TableSortLabel active={tableSortField === 'nationality'} direction={tableSortField === 'nationality' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('nationality')}>
                          Nacionalidad
                        </TableSortLabel>
                      </TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 140, ...getPinnedHeaderSx('marital_status') }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconButton size="small" onClick={() => togglePinnedColumn('marital_status')} sx={{ color: isPinnedColumn('marital_status') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                          <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                        </IconButton>
                        <TableSortLabel active={tableSortField === 'marital_status'} direction={tableSortField === 'marital_status' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('marital_status')}>
                          Tipo Trabajador
                        </TableSortLabel>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 140, ...getPinnedHeaderSx('contract') }}>
                      <IconButton size="small" onClick={() => togglePinnedColumn('contract')} sx={{ color: isPinnedColumn('contract') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                        <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                      </IconButton>
                      <TableSortLabel active={tableSortField === 'contract'} direction={tableSortField === 'contract' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('contract')}>
                        Contrato
                      </TableSortLabel>
                    </TableCell>
                    {showSalary && (
                      <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 100, ...getPinnedHeaderSx('salary') }}>
                        <IconButton size="small" onClick={() => togglePinnedColumn('salary')} sx={{ color: isPinnedColumn('salary') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                          <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                        </IconButton>
                        <TableSortLabel active={tableSortField === 'salary'} direction={tableSortField === 'salary' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('salary')}>
                          Salario
                        </TableSortLabel>
                      </TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 100, ...getPinnedHeaderSx('is_active') }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconButton size="small" onClick={() => togglePinnedColumn('is_active')} sx={{ color: isPinnedColumn('is_active') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                          <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                        </IconButton>
                        <TableSortLabel active={tableSortField === 'is_active'} direction={tableSortField === 'is_active' ? tableSortDirection : 'asc'} onClick={() => handleTableSort('is_active')}>
                          Vigencia
                        </TableSortLabel>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 100, ...getPinnedHeaderSx('actions') }}>
                      <IconButton size="small" onClick={() => togglePinnedColumn('actions')} sx={{ color: isPinnedColumn('actions') ? colors.blue6 : colors.gray6, mr: 0.5 }}>
                        <PushPin fontSize="inherit" sx={{ transform: 'rotate(-35deg)' }} />
                      </IconButton>
                      Acciones
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedCollaborators.map((collaborator) => (
                    <TableRow key={collaborator.id} hover>
                      <TableCell sx={getPinnedCellSx('avatar')}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Avatar
                          src={collaborator.photo_url}
                          sx={{ width: { xs: 28, sm: 32, md: 40 }, height: { xs: 28, sm: 32, md: 40 }, bgcolor: colors.blue6, fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.9rem' } }}
                          imgProps={{ style: { objectFit: 'cover' } }}
                        >
                          {`${(collaborator.first_name || '').trim().charAt(0)}${(collaborator.last_name || '').trim().charAt(0)}`.toUpperCase() || '?'}
                        </Avatar>
                        </Box>
                      </TableCell>
                      <TableCell sx={getPinnedCellSx('name')}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {getDisplayName(collaborator)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...getPinnedCellSx('document'), textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {formatDocumentForDisplay(collaborator.document)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={getPinnedCellSx('email')}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {lowerText(collaborator.email, 'sin correo')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...getPinnedCellSx('phone'), textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {upperText(collaborator.phone, 'SIN TELÉFONO')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={getPinnedCellSx('position')}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {upperText(collaborator.position, 'SIN CARGO')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={getPinnedCellSx('condition')}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {upperText(getEffectiveStatus(collaborator), 'SIN CONDICIÓN')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={getPinnedCellSx('specialty')}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {upperText(collaborator.specialty, 'SIN ESPECIALIDAD')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...getPinnedCellSx('gender'), textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {upperText(collaborator.gender, 'SIN ESPECIFICAR')}
                        </Typography>
                      </TableCell>
                      {showNationality && (
                        <TableCell sx={getPinnedCellSx('nationality')}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {upperText(collaborator.nationality, 'SIN ESPECIFICAR')}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell sx={{ ...getPinnedCellSx('marital_status'), textAlign: 'center' }}>
                        {collaborator.worker_type ? (
                          <Chip
                            label={upperText(collaborator.worker_type, 'SIN ESPECIFICAR')}
                            size="small"
                            sx={{
                              backgroundColor:
                                collaborator.worker_type === 'Directo' ? colors.blue15 :
                                collaborator.worker_type === 'Indirecto' ? colors.blue13 :
                                collaborator.worker_type === 'Contratista' ? colors.gold7 :
                                collaborator.worker_type === 'Subcontratista' ? colors.gray9 :
                                colors.gray8,
                              color:
                                collaborator.worker_type === 'Directo' ? colors.blue6 :
                                collaborator.worker_type === 'Indirecto' ? colors.blue4 :
                                collaborator.worker_type === 'Contratista' ? colors.gold3 :
                                collaborator.worker_type === 'Subcontratista' ? colors.gray4 :
                                colors.gray6,
                              fontSize: '0.65rem',
                              height: 18
                            }}
                          />
                        ) : (
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.gray6 }}>
                            Sin especificar
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={getPinnedCellSx('contract')}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {upperText(collaborator.contract, 'SIN CONTRATO')}
                        </Typography>
                      </TableCell>
                      {showSalary && (
                        <TableCell sx={getPinnedCellSx('salary')}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {collaborator.salary ? formatCurrency(collaborator.salary, companyCountry) : 'Sin especificar'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell sx={{ ...getPinnedCellSx('is_active'), textAlign: 'center' }}>
                        <Chip 
                          label={collaborator.is_active ? 'Vigente' : 'Finiquitado'}
                          size="small"
                          sx={{
                            backgroundColor: collaborator.is_active ? colors.blue15 : colors.gray8,
                            color: collaborator.is_active ? colors.blue6 : colors.gray4,
                            fontSize: '0.65rem',
                            height: 18
                          }}
                        />
                      </TableCell>
                      <TableCell sx={getPinnedCellSx('actions')}>
                        <Box display="flex" gap={0.5}>
                          <IconButton 
                            size="small" 
                            sx={{ 
                              color: colors.blue4,
                              '&:hover': { backgroundColor: colors.blue15 }
                            }}
                            onClick={() => openDailyStatusDialog(collaborator)}
                          >
                            <EventNote fontSize="small" />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            sx={{ 
                              color: colors.blue6,
                              '&:hover': { backgroundColor: colors.blue15 }
                            }}
                            onClick={() => handleEditCollaborator(collaborator)}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                          {collaborator.is_active ? (
                            <IconButton 
                              size="small" 
                              sx={{ 
                                color: colors.gray4,
                                '&:hover': { backgroundColor: colors.gray9 }
                              }}
                              onClick={() => handleDeactivateCollaborator(collaborator)}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          ) : (
                            <IconButton 
                              size="small" 
                              sx={{ 
                                color: colors.blue4,
                                '&:hover': { backgroundColor: colors.blue15 }
                              }}
                              onClick={() => handleActivateCollaborator(collaborator)}
                            >
                              <Add fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Menu
            anchorEl={nameSortMenuAnchor}
            open={Boolean(nameSortMenuAnchor)}
            onClose={closeNameSortSelector}
          >
            <MenuItem
              onClick={() => {
                setNameSortBy('last_name')
                setTableSortField('name')
                closeNameSortSelector()
              }}
            >
              Apellido
            </MenuItem>
            <MenuItem
              onClick={() => {
                setNameSortBy('first_name')
                setTableSortField('name')
                closeNameSortSelector()
              }}
            >
              Nombre
            </MenuItem>
          </Menu>

          {/* FAB para agregar colaborador */}
          {!showAttendanceForUser && <AppFloatingActionButton ariaLabel="Agregar colaborador" tooltip="Agregar colaborador" offset="tabs" onClick={handleAddCollaborator} />}

          {/* Dialog para agregar/editar colaborador */}
          <Dialog open={openDialog} onClose={() => { resetCollaboratorForm(); setEditingCollaborator(null); setOpenDialog(false); }} maxWidth="md" fullWidth>
            <DialogTitle sx={{ 
              background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
              color: colors.white,
              fontWeight: 600,
              fontSize: '1.2rem'
            }}>
              Nuevo Colaborador
            </DialogTitle>
            <DialogContent sx={{ p: 3 }}>
              <Box 
                id="collaborator-form"
                component="form"
                display="grid"
                gridTemplateColumns={{
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)'
                }}
                gap={2}
                sx={{ mt: 1 }}
              >
                {/* Información Personal */}
                <Box sx={{ gridColumn: { xs: '1 / -1', sm: '1 / -1', lg: '1 / -1' } }}>
                  <Typography variant="h6" sx={{ color: colors.blue1, mb: 1.5, fontWeight: 600, fontSize: '1.1rem' }}>
                    Información Personal
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Nombres *
                  </Typography>
                  <TextField 
                    name="first_name"
                    fullWidth 
                    variant="outlined" 
                    required 
                    size="small"
                    onChange={(e) => {
                      const formattedValue = (e.target.value as string)
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                      e.target.value = formattedValue;
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Apellidos *
                  </Typography>
                  <TextField 
                    name="last_name"
                    fullWidth 
                    variant="outlined" 
                    required 
                    size="small"
                    onChange={(e) => {
                      const formattedValue = (e.target.value as string)
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                      e.target.value = formattedValue;
                    }}
                  />
                </Box>
                {/* specialty moved to Laboral section */}
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    RUT / DNI / CI
                  </Typography>
                  <TextField 
                    name="document"
                    fullWidth 
                    variant="outlined" 
                    placeholder="12345678-9" 
                    size="small"
                    onChange={(e) => {
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^0-9kK]/g, '');
                      
                      // Solo formatear si es un RUT chileno válido y completo
                      if (cleanValue.length >= 8 && cleanValue.length <= 10) {
                        const rut = cleanValue.slice(0, -1);
                        const dv = cleanValue.slice(-1);
                        
                        // Verificar que el dígito verificador sea correcto
                        if (rut.length >= 7 && rut.length <= 9 && /^[0-9kK]$/.test(dv)) {
                          // Calcular dígito verificador correcto
                          let suma = 0;
                          let multiplicador = 2;
                          
                          for (let i = rut.length - 1; i >= 0; i--) {
                            suma += parseInt(rut[i]) * multiplicador;
                            multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
                          }
                          
                          const resto = suma % 11;
                          const dvCalculado = resto === 0 ? '0' : resto === 1 ? 'K' : (11 - resto).toString();
                          
                          // Solo formatear si el dígito verificador es correcto Y el RUT está completo
                          if (dv.toUpperCase() === dvCalculado && cleanValue.length === (rut.length + 1)) {
                            const formattedRut = rut.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv.toUpperCase();
                            e.target.value = formattedRut;
                          }
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^0-9kK]/g, '');
                      
                      // Verificar si el RUT es válido al salir del input
                      if (cleanValue.length >= 8 && cleanValue.length <= 10) {
                        const rut = cleanValue.slice(0, -1);
                        const dv = cleanValue.slice(-1);
                        
                        if (rut.length >= 7 && rut.length <= 9 && /^[0-9kK]$/.test(dv)) {
                          // Calcular dígito verificador correcto
                          let suma = 0;
                          let multiplicador = 2;
                          
                          for (let i = rut.length - 1; i >= 0; i--) {
                            suma += parseInt(rut[i]) * multiplicador;
                            multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
                          }
                          
                          const resto = suma % 11;
                          const dvCalculado = resto === 0 ? '0' : resto === 1 ? 'K' : (11 - resto).toString();
                          
                          // Si el RUT no es válido, revertir a formato sin puntos
                          if (dv.toUpperCase() !== dvCalculado) {
                            e.target.value = cleanValue;
                          }
                        }
                      }
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Email *
                  </Typography>
                  <TextField 
                    name="email" 
                    fullWidth 
                    type="email" 
                    variant="outlined" 
                    required 
                    size="small"
                    onChange={(e) => {
                      e.target.value = e.target.value.toLowerCase()
                    }}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Teléfono
                  </Typography>
                  <CountryPhoneInput
                    value={phoneValue}
                    onChange={(value) => setPhoneValue(value || '')}
                    placeholder="Ingresa el número de teléfono"
                    defaultCountry="CL"
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    País
                  </Typography>
                  <TextField
                    name="country"
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={addressCountry}
                    onChange={(e) => setAddressCountry(e.target.value)}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Región
                  </Typography>
                  <TextField
                    name="region"
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={addressRegion}
                    onChange={(e) => setAddressRegion(e.target.value)}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Comuna / Ciudad
                  </Typography>
                  <TextField
                    name="commune"
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={addressCommune}
                    onChange={(e) => setAddressCommune(e.target.value)}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Fecha de Nacimiento
                  </Typography>
                  <TextField name="birth_date" fullWidth type="date" variant="outlined" InputLabelProps={{ shrink: true }} size="small" />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Sexo
                  </Typography>
                  <TextField
                    name="gender"
                    fullWidth
                    select
                    variant="outlined"
                    size="small"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: colors.gray4 },
                        '&:hover fieldset': { borderColor: colors.blue6 },
                        '&.Mui-focused fieldset': { borderColor: colors.blue6 },
                      },
                    }}
                  >
                    {genderOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Foto del Colaborador
                  </Typography>
                  <input
                    type="file"
                    id="photo-upload"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setPhotoFile(file)
                      }
                    }}
                  />
                  <label htmlFor="photo-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      fullWidth
                      size="medium"
                      startIcon={<Add />}
                      sx={{
                        borderColor: colors.gray4,
                        color: colors.blue1,
                        borderRadius: 1,
                        minHeight: 36,
                        py: 1,
                        '&:hover': {
                          borderColor: colors.blue6,
                          backgroundColor: colors.blue1 + '10'
                        }
                      }}
                    >
                      {photoFile ? 'Cambiar Foto' : 'Seleccionar Foto'}
                    </Button>
                  </label>
                    {photoFile && (
                    <Typography variant="caption" sx={{ color: colors.blue6, mt: 1, display: 'block' }}>
                    ✓ {photoFile.name}
                    </Typography>
                  )}
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Firma del Colaborador
                  </Typography>
                  <input
                    type="file"
                    id="signature-upload"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setSignatureFile(file)
                    }}
                  />
                  <label htmlFor="signature-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      fullWidth
                      size="medium"
                      startIcon={<Add />}
                      sx={{
                        borderColor: colors.gray4,
                        color: colors.blue1,
                        borderRadius: 1,
                        minHeight: 36,
                        py: 1,
                        '&:hover': {
                          borderColor: colors.blue6,
                          backgroundColor: colors.blue1 + '10'
                        }
                      }}
                    >
                      {signatureFile ? 'Cambiar Firma' : 'Seleccionar Firma'}
                    </Button>
                  </label>
                  {signatureFile && (
                    <Typography variant="caption" sx={{ color: colors.blue6, mt: 1, display: 'block' }}>
                      ✓ {signatureFile.name}
                    </Typography>
                  )}
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Dirección
                  </Typography>
                  <TextField 
                    name="address"
                    fullWidth 
                    variant="outlined" 
                    size="small"
                    onChange={(e) => {
                      const formattedValue = (e.target.value as string)
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                      e.target.value = formattedValue;
                    }}
                  />
                </Box>

                {/* Información Laboral */}
                <Box sx={{ gridColumn: { xs: '1 / -1', sm: '1 / -1', lg: '1 / -1' }, mt: 1.5 }}>
                  <Typography variant="h6" sx={{ color: colors.blue1, mb: 1.5, fontWeight: 600, fontSize: '1.1rem' }}>
                    Información Laboral
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Especialidad
                  </Typography>
                  <Autocomplete
                    freeSolo
                    options={specialtyOptions}
                    onOpen={() => {
                      // asegurar que las opciones se recalculen antes de mostrar
                      recomputeSpecialtyOptions()
                    }}
                    openOnFocus
                    filterOptions={(options, { inputValue }) => {
                      if (!inputValue) return options
                      return options.filter(o => o.toLowerCase().includes(inputValue.toLowerCase()))
                    }}
                    value={specialty}
                    onChange={(event, newValue) => setSpecialty(newValue || '')}
                    onInputChange={(event, newInputValue) => setSpecialty(newInputValue)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="specialty"
                        fullWidth
                        variant="outlined"
                        size="small"
                      />
                    )}
                    sx={{ mb: 1 }}
                  />
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: colors.blue1 }}>
                      Cargo/Posición *
                    </Typography>
                    <Chip 
                      label={companyIndustry.toLowerCase()} 
                      size="small" 
                      sx={{ 
                        fontSize: '0.7rem',
                        height: 20,
                        backgroundColor: colors.blue15,
                        color: colors.blue6
                      }} 
                    />
                  </Box>
                  <Autocomplete
                    freeSolo
                    options={positionOptions}
                    value={positionValue}
                    loading={!industryLoaded}
                    loadingText="Cargando cargos según industria..."
                    openOnFocus
                    filterOptions={(options, { inputValue }) => {
                      if (!inputValue) return options
                      return options.filter(o => o.toLowerCase().includes(inputValue.toLowerCase()))
                    }}
                    onOpen={() => {
                      // asegurar que las opciones se recalculen antes de mostrar
                      recomputePositionOptions()
                    }}
                    autoHighlight
                    selectOnFocus
                    clearOnBlur
                    handleHomeEndKeys
                    ListboxProps={{
                      style: {
                        maxHeight: '300px'
                      }
                    }}
                    slotProps={{
                      popper: {
                        placement: 'bottom-start',
                        modifiers: [
                          {
                            name: 'preventOverflow',
                            enabled: true,
                            options: {
                              boundary: 'viewport'
                            }
                          }
                        ]
                      }
                    }}
                    onChange={(event, newValue) => {
                      setPositionValue(newValue || '')
                      setPositionWarning('')
                      setPositionError('')
                      
                      if (newValue) {
                        // Validar cargo personalizado
                        const validation = validateCustomPosition(newValue)
                        if (!validation.isValid) {
                          setPositionError(validation.message || 'Cargo inválido')
                          return
                        }
                        
                        // Si no es estándar, mostrar sugerencias
                        if (!isStandardPosition(newValue, companyIndustry)) {
                          const similarPositions = findSimilarPositions(newValue, companyIndustry)
                          if (similarPositions.length > 0) {
                            setPositionWarning(`¿Te refieres a: ${similarPositions.slice(0, 3).join(', ')}?`)
                          } else {
                            // Es un cargo completamente nuevo, agregarlo a la lista
                            if (!customPositions.includes(newValue)) {
                              setCustomPositions(prev => [...prev, newValue])
                              addCustomPosition(newValue, companyIndustry)
                            }
                          }
                        }
                      }
                    }}
                    onInputChange={(event, newInputValue) => {
                      setPositionValue(newInputValue)
                      setPositionWarning('')
                      setPositionError('')
                      
                      if (newInputValue) {
                        // Validar cargo personalizado
                        const validation = validateCustomPosition(newInputValue)
                        if (!validation.isValid) {
                          setPositionError(validation.message || 'Cargo inválido')
                          return
                        }
                        
                        // Si no es estándar, mostrar sugerencias
                        if (!isStandardPosition(newInputValue, companyIndustry)) {
                          const similarPositions = findSimilarPositions(newInputValue, companyIndustry)
                          if (similarPositions.length > 0) {
                            setPositionWarning(`¿Te refieres a: ${similarPositions.slice(0, 3).join(', ')}?`)
                          }
                        }
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="position"
                        fullWidth
                        variant="outlined"
                        required
                        size="small"
                        placeholder="Selecciona o escribe un cargo"
                      />
                    )}
                    renderOption={(props, option) => {
                      const { key, ...otherProps } = props
                      const isCustom = customPositions.includes(option)
                      return (
                        <Box component="li" key={key} {...otherProps}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {option}
                            </Typography>
                            <Typography variant="caption" sx={{ color: colors.blue7 }}>
                              {isCustom ? 'Cargo personalizado' : `Cargo estándar para ${companyIndustry.toLowerCase()}`}
                            </Typography>
                          </Box>
                        </Box>
                      )
                    }}
                  />
                  {positionError && (
                    <Alert 
                      severity="error" 
                      sx={{ 
                        mt: 1, 
                        fontSize: '0.8rem',
                        '& .MuiAlert-message': {
                          fontSize: '0.8rem'
                        }
                      }}
                    >
                      {positionError}
                    </Alert>
                  )}
                  {positionWarning && (
                    <Alert 
                      severity="warning" 
                      icon={<Warning />}
                      sx={{ 
                        mt: 1, 
                        fontSize: '0.8rem',
                        '& .MuiAlert-message': {
                          fontSize: '0.8rem'
                        }
                      }}
                    >
                      {positionWarning}
                    </Alert>
                  )}
                </Box>
                
                {/* Campo de Tipo de Trabajador - Solo para Minería */}
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Tipo de Trabajador
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={workerType}
                    onChange={(e) => setWorkerType(e.target.value)}
                    SelectProps={{
                      native: true,
                    }}
                  >
                    <option value="">Seleccionar tipo</option>
                    <option value="General">General</option>
                    <option value="No aplica">No aplica</option>
                    <option value="Directo">Directo</option>
                    <option value="Directo no Operacional">Directo no Operacional</option>
                    <option value="Indirecto">Indirecto</option>
                    <option value="Contratista">Contratista</option>
                    <option value="Subcontratista">Subcontratista</option>
                    <option value="Consultor">Consultor</option>
                  </TextField>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Condicion
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={conditionChoice}
                    onChange={(e) => setConditionChoice(e.target.value)}
                  >
                    <MenuItem value="">Sin condicion</MenuItem>
                    {CONDITION_OPTIONS.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Contrato
                  </Typography>
                  <TextField
                    fullWidth
                    variant="outlined"
                    size="small"
                    placeholder="Ej: INDEFINIDO, PLAZO FIJO, POR OBRA"
                    value={contract}
                    onChange={(e) => setContract(e.target.value)}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Turno / Jornada
                  </Typography>
                  <TextField
                    fullWidth
                    variant="outlined"
                    size="small"
                    placeholder="Ej: A, B, 5x2, 8x6"
                    value={shiftPattern}
                    onChange={(e) => setShiftPattern(e.target.value)}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Excepcion
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={exceptionChoice}
                    onChange={(e) => {
                      const value = e.target.value
                      setExceptionChoice(value)
                      if (value !== EXCEPTION_OTHER_OPTION) setExceptionOther('')
                    }}
                  >
                    <MenuItem value="">Sin excepcion</MenuItem>
                    {exceptionOptions.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </TextField>
                  {exceptionChoice === EXCEPTION_OTHER_OPTION && (
                    <TextField
                      fullWidth
                      variant="outlined"
                      size="small"
                      sx={{ mt: 1 }}
                      value={exceptionOther}
                      onChange={(e) => setExceptionOther(e.target.value)}
                      placeholder="Escribe la excepcion"
                    />
                  )}
                </Box>
                {/* Comentario de EPP */}
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Comentario de EPP (opcional)
                  </Typography>
                  <TextField
                    name="epp_details"
                    fullWidth
                    variant="outlined"
                    size="small"
                    placeholder="Ejemplo: Entregado casco y botas el 10/10/2025"
                    onChange={(e) => {
                      // Guardar como string, el backend puede convertirlo a JSON si lo requiere
                    }}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Salario
                  </Typography>
                  <TextField 
                    name="salary" 
                    fullWidth 
                    type="text" 
                    variant="outlined" 
                    placeholder="500.000" 
                    size="small"
                    value={salaryValue}
                    onChange={(e) => {
                      // Mantener formato con separadores en tiempo real
                      const numeric = (e.target.value || '').toString().replace(/[^0-9]/g, '')
                      if (numeric) {
                        const formatted = formatNumber(parseInt(numeric, 10), companyCountry)
                        setSalaryValue(formatted)
                      } else {
                        setSalaryValue('')
                      }
                    }}
                    onBlur={(e) => {
                      // Asegurar formato final al salir del campo
                      const numeric = salaryValue.replace(/[^0-9]/g, '')
                      const numericValue = parseFloat(numeric)
                      if (!isNaN(numericValue) && numericValue > 0) {
                        const formatted = formatNumber(numericValue, companyCountry)
                        setSalaryValue(formatted)
                      }
                    }}
                    InputProps={{
                      startAdornment: (
                        <Typography variant="body2" sx={{ color: colors.blue1, mr: 1, fontWeight: 500 }}>
                          {formatCurrency(0, companyCountry).replace('0', '')}
                        </Typography>
                      )
                    }}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Fecha de Ingreso *
                  </Typography>
                  <TextField name="hire_date" fullWidth type="date" variant="outlined" InputLabelProps={{ shrink: true }} required size="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Contacto de Emergencia
                  </Typography>
                  <CountryPhoneInput
                    value={emergencyPhoneValue}
                    onChange={setEmergencyPhoneValue}
                    placeholder="Teléfono de emergencia"
                  />
                </Box>

                {/* Información de EPP */}
                <Box sx={{ gridColumn: { xs: '1 / -1', sm: '1 / -1', lg: '1 / -1' }, mt: 1.5 }}>
                  <Typography variant="h6" sx={{ color: colors.blue1, mb: 1.5, fontWeight: 600, fontSize: '1.1rem' }}>
                    Información de EPP
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Ropa Superior
                  </Typography>
                  <TextField
                    name="upper_clothing_size"
                    fullWidth
                    select
                    variant="outlined"
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: colors.gray4 },
                        '&:hover fieldset': { borderColor: colors.blue6 },
                        '&.Mui-focused fieldset': { borderColor: colors.blue6 },
                      },
                    }}
                  >
                    {clothingSizes.map((size) => (
                      <MenuItem key={size} value={size}>
                        {size}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Ropa Inferior
                  </Typography>
                  <TextField
                    name="lower_clothing_size"
                    fullWidth
                    select
                    variant="outlined"
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: colors.gray4 },
                        '&:hover fieldset': { borderColor: colors.blue6 },
                        '&.Mui-focused fieldset': { borderColor: colors.blue6 },
                      },
                    }}
                  >
                    {clothingSizes.map((size) => (
                      <MenuItem key={size} value={size}>
                        {size}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Talla de Zapatos
                  </Typography>
                  <TextField name="shoe_size" fullWidth variant="outlined" placeholder="40, 41, 42" size="small" />
                </Box>
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
              <Button 
                onClick={() => {
                  resetCollaboratorForm()
                  setOpenDialog(false)
                }}
                variant="outlined"
                sx={{ textTransform: 'none', minWidth: 120 }}
              >
                Cancelar
              </Button>
              <Button 
                variant="contained"
                onClick={async () => {
                  if (COLLABORATORS_DEBUG) console.log('🔄 Iniciando guardado de colaborador...')
                  
                  // Obtener datos del formulario
                  const form = document.getElementById('collaborator-form') as HTMLFormElement
                  if (!form) {
                    console.error('❌ No se encontró el formulario')
                    alert('Error: No se encontró el formulario')
                    return
                  }
                  
                  const formData = new FormData(form)
                  if (COLLABORATORS_DEBUG) console.log('📋 Datos del formulario:', Object.fromEntries(formData.entries()))
                  
                  // Validar campos requeridos
                  const requiredFields = [
                    { field: 'first_name', label: 'Nombres' },
                    { field: 'last_name', label: 'Apellidos' },
                    { field: 'document', label: 'RUT/DNI/CI' },
                    { field: 'email', label: 'Email' }
                  ]
                  const missingFields = requiredFields.filter(({ field }) => !formData.get(field))
                  
                  if (missingFields.length > 0) {
                    const missingLabels = missingFields.map(({ label }) => label).join(', ')
                    console.error('❌ Campos requeridos faltantes:', missingFields.map(f => f.field))
                    alert(`❌ Campos requeridos faltantes:\n\n${missingLabels}\n\nPor favor completa estos campos antes de continuar.`)
                    return
                  }
                  
                  // Validar teléfono
                  if (!phoneValue || phoneValue.length < 8) {
                    console.error('❌ Teléfono inválido:', phoneValue)
                    alert('❌ Teléfono requerido\n\nPor favor ingresa un teléfono válido con código de país.')
                    return
                  }
                  
                  // Validar teléfono de emergencia (opcional pero si se ingresa debe ser válido)
                  if (emergencyPhoneValue && emergencyPhoneValue.length < 8) {
                    console.error('❌ Teléfono de emergencia inválido:', emergencyPhoneValue)
                    alert('❌ Teléfono de emergencia inválido\n\nPor favor ingresa un teléfono de emergencia válido o déjalo vacío.')
                    return
                  }
                  
                  // Validar tipo de trabajador si es minería
                  if (showWorkerType && !workerType) {
                    console.error('❌ Tipo de trabajador requerido para minería')
                    alert('❌ Tipo de trabajador requerido\n\nPara la industria minera, debes seleccionar el tipo de trabajador (Directo, Directo no Operacional, Indirecto, etc.).')
                    return
                  }
                  
                  // Validar salario (opcional pero si se ingresa debe ser válido)
                  if (salaryValue && (isNaN(parseFloat(salaryValue)) || parseFloat(salaryValue) < 0)) {
                    console.error('❌ Salario inválido:', salaryValue)
                    alert('❌ Salario inválido\n\nPor favor ingresa un salario válido (número positivo) o déjalo vacío.')
                    return
                  }
                  
                  if (COLLABORATORS_DEBUG) console.log('✅ Validaciones pasadas, enviando datos...')
                  await handleSubmitCollaborator(formData)
                }}
                sx={{
                  textTransform: 'none',
                  minWidth: 160,
                  background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
                  }
                }}
              >
                Guardar Colaborador
              </Button>
            </DialogActions>
          </Dialog>

          {/* Modal de edición de colaborador */}
          <Dialog 
            open={openEditDialog} 
            onClose={() => {
              setOpenEditDialog(false)
              setEditingCollaborator(null)
              resetCollaboratorForm()
            }}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle sx={{ 
              background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
              color: colors.white,
              fontWeight: 600,
              fontSize: '1.2rem'
            }}>
              Editar Colaborador
            </DialogTitle>
            <DialogContent sx={{ p: 3 }}>
              {editingCollaborator && (
                <Box 
                  id="edit-collaborator-form"
                  component="form"
                  display="grid"
                  gridTemplateColumns={{
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(3, 1fr)'
                  }}
                  gap={2}
                  sx={{ mt: 1 }}
                >
                  {/* Información Personal */}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Nombres *
                    </Typography>
                    <TextField 
                      name="first_name" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={capitalizeText(editingCollaborator.first_name)}
                      onChange={(e) => {
                        const formattedValue = (e.target.value as string)
                          .split(' ')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                          .join(' ');
                        e.target.value = formattedValue;
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Apellidos *
                    </Typography>
                    <TextField 
                      name="last_name" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={capitalizeText(editingCollaborator.last_name)}
                      onChange={(e) => {
                        const formattedValue = (e.target.value as string)
                          .split(' ')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                          .join(' ');
                        e.target.value = formattedValue;
                      }}
                    />
                  </Box>
                  {/* specialty moved to Laboral section (inserted below) */}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      RUT / DNI / CI *
                    </Typography>
                    <TextField 
                      name="document" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={formatRutForDisplay(editingCollaborator.document)}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Email *
                    </Typography>
                    <TextField 
                      name="email" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={editingCollaborator.email}
                      onChange={(e) => {
                        e.target.value = e.target.value.toLowerCase()
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Teléfono *
                    </Typography>
                    <CountryPhoneInput
                      value={phoneValue}
                      onChange={setPhoneValue}
                      defaultCountry={selectedPhoneCountry}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Contacto de Emergencia
                    </Typography>
                    <CountryPhoneInput
                      value={emergencyPhoneValue}
                      onChange={setEmergencyPhoneValue}
                      defaultCountry={selectedEmergencyCountry}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Dirección
                    </Typography>
                    <TextField 
                      name="address" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={capitalizeText(editingCollaborator.address || '')}
                      onChange={(e) => {
                        const formattedValue = (e.target.value as string)
                          .split(' ')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                          .join(' ');
                        e.target.value = formattedValue;
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Cargo/Posición *
                    </Typography>
                    <Autocomplete
                      freeSolo
                      options={positionOptions}
                      value={positionValue}
                      loading={!industryLoaded}
                      openOnFocus
                      autoHighlight
                      selectOnFocus
                      clearOnBlur
                      handleHomeEndKeys
                      onChange={(event, newValue) => {
                        setPositionValue(newValue || '')
                      }}
                      onInputChange={(event, newInputValue) => {
                        setPositionValue(newInputValue)
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          placeholder="Selecciona o escribe un cargo"
                        />
                      )}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Especialidad
                    </Typography>
                      <Autocomplete
                        freeSolo
                        options={specialtyOptions}
                        onOpen={() => {
                          recomputeSpecialtyOptions()
                        }}
                        openOnFocus
                        autoHighlight
                        selectOnFocus
                        handleHomeEndKeys
                        filterOptions={(options, { inputValue }) => {
                          const filtered = !inputValue
                            ? options
                            : options.filter(o => o.toLowerCase().includes(inputValue.toLowerCase()))
                          const trimmed = String(inputValue || '').trim()
                          if (trimmed && !options.some(o => o.toLowerCase() === trimmed.toLowerCase())) {
                            return [...filtered, trimmed]
                          }
                          return filtered
                        }}
                        value={specialty}
                        onChange={(event, newValue) => setSpecialty(newValue || '')}
                        onInputChange={(event, newInputValue) => setSpecialty(newInputValue)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            name="specialty"
                            fullWidth
                            variant="outlined"
                            size="small"
                            placeholder="Selecciona o escribe una especialidad"
                          />
                        )}
                      />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Tipo de Trabajador *
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      value={workerType}
                      onChange={(e) => setWorkerType(e.target.value)}
                    >
                      <MenuItem value="Directo">Directo</MenuItem>
                      <MenuItem value="Directo no Operacional">Directo no Operacional</MenuItem>
                      <MenuItem value="Indirecto">Indirecto</MenuItem>
                      <MenuItem value="Contratista">Contratista</MenuItem>
                      <MenuItem value="Subcontratista">Subcontratista</MenuItem>
                      <MenuItem value="Consultor">Consultor</MenuItem>
                    </TextField>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Cargo vigente desde
                    </Typography>
                    <TextField
                      type="date"
                      fullWidth
                      variant="outlined"
                      size="small"
                      value={roleEffectiveDate}
                      onChange={(e) => setRoleEffectiveDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    <Typography variant="caption" sx={{ color: colors.gray6 }}>
                      Los reportes anteriores a esta fecha conservarán el cargo anterior.
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Condicion
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      value={conditionChoice}
                      onChange={(e) => setConditionChoice(e.target.value)}
                    >
                      <MenuItem value="">Sin condicion</MenuItem>
                      <MenuItem value="Finiquitado">Finiquitado</MenuItem>
                      {CONDITION_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Typography variant="caption" sx={{ color: colors.gray6 }}>
                      Si seleccionas FINIQUITADO, la vigencia se actualizará automáticamente a FINIQUITADO.
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Contrato
                    </Typography>
                    <TextField
                      fullWidth
                      variant="outlined"
                      size="small"
                      placeholder="Ej: INDEFINIDO, PLAZO FIJO, POR OBRA"
                      value={contract}
                      onChange={(e) => setContract(e.target.value)}
                    />
                  </Box>
                  <Box sx={{ gridColumn: { xs: '1 / -1', sm: '1 / -1', md: '1 / -1' }, border: `1px solid ${colors.blue15}`, borderRadius: 1, p: 2, bgcolor: '#f8fbff' }}>
                    <Typography variant="subtitle2" sx={{ color: colors.blue1, fontWeight: 700, mb: 0.5 }}>
                      Corregir cargo para fechas anteriores
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.gray6, mb: 1.5 }}>
                      Esto no cambia el cargo actual. Solo aplica a reportes dentro del rango indicado.
                    </Typography>
                    <Box
                      display="grid"
                      gridTemplateColumns={{ xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }}
                      gap={1.2}
                    >
                      <TextField
                        label="Desde"
                        type="date"
                        size="small"
                        value={historyValidFrom}
                        onChange={(e) => setHistoryValidFrom(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        label="Hasta"
                        type="date"
                        size="small"
                        value={historyValidTo}
                        onChange={(e) => setHistoryValidTo(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                      <Autocomplete
                        freeSolo
                        options={positionOptions}
                        value={historyPosition}
                        onOpen={() => recomputePositionOptions()}
                        onChange={(event, newValue) => setHistoryPosition(newValue || '')}
                        onInputChange={(event, newInputValue) => setHistoryPosition(newInputValue)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Cargo"
                            size="small"
                          />
                        )}
                      />
                      <Autocomplete
                        freeSolo
                        options={specialtyOptions}
                        value={historySpecialty}
                        onOpen={() => recomputeSpecialtyOptions()}
                        onChange={(event, newValue) => setHistorySpecialty(newValue || '')}
                        onInputChange={(event, newInputValue) => setHistorySpecialty(newInputValue)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Especialidad"
                            size="small"
                          />
                        )}
                      />
                      <TextField
                        select
                        label="Tipo"
                        size="small"
                        value={historyWorkerType}
                        onChange={(e) => setHistoryWorkerType(e.target.value)}
                      >
                        <MenuItem value="">Sin cambio</MenuItem>
                        <MenuItem value="Directo">Directo</MenuItem>
                        <MenuItem value="Directo no Operacional">Directo no Operacional</MenuItem>
                        <MenuItem value="Indirecto">Indirecto</MenuItem>
                        <MenuItem value="Contratista">Contratista</MenuItem>
                        <MenuItem value="Subcontratista">Subcontratista</MenuItem>
                        <MenuItem value="Consultor">Consultor</MenuItem>
                      </TextField>
                    </Box>
                    <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="outlined"
                        onClick={handleSaveRoleHistoryCorrection}
                        disabled={savingRoleHistory}
                      >
                        {savingRoleHistory ? 'Guardando...' : 'Guardar corrección histórica'}
                      </Button>
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Turno / Jornada
                    </Typography>
                    <TextField
                      fullWidth
                      variant="outlined"
                      size="small"
                      placeholder="Ej: A, B, 5x2, 8x6"
                      value={shiftPattern}
                      onChange={(e) => setShiftPattern(e.target.value)}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Excepcion
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      value={exceptionChoice}
                      onChange={(e) => {
                        const value = e.target.value
                        setExceptionChoice(value)
                        if (value !== EXCEPTION_OTHER_OPTION) setExceptionOther('')
                      }}
                    >
                      <MenuItem value="">Sin excepcion</MenuItem>
                      {exceptionOptions.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </TextField>
                    {exceptionChoice === EXCEPTION_OTHER_OPTION && (
                      <TextField
                        fullWidth
                        variant="outlined"
                        size="small"
                        sx={{ mt: 1 }}
                        value={exceptionOther}
                        onChange={(e) => setExceptionOther(e.target.value)}
                        placeholder="Escribe la excepcion"
                      />
                    )}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Salario
                    </Typography>
                    <TextField 
                      name="salary" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      placeholder="Ej: 500000"
                      value={salaryValue}
                      onChange={(e) => {
                        const numeric = (e.target.value || '').toString().replace(/[^0-9]/g, '')
                        if (numeric) {
                          const formatted = formatNumber(parseInt(numeric, 10), companyCountry)
                          setSalaryValue(formatted)
                        } else {
                          setSalaryValue('')
                        }
                      }}
                      onBlur={() => {
                        const numeric = salaryValue.replace(/[^0-9]/g, '')
                        const numericValue = parseFloat(numeric)
                        if (!isNaN(numericValue) && numericValue > 0) {
                          const formatted = formatNumber(numericValue, companyCountry)
                          setSalaryValue(formatted)
                        }
                      }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography variant="body2" sx={{ color: colors.gray6 }}>
                              {companyCountry === 'CL' ? '$' : companyCountry === 'AR' ? '$' : companyCountry === 'PE' ? 'S/' : companyCountry === 'CO' ? '$' : companyCountry === 'MX' ? '$' : companyCountry === 'US' ? '$' : companyCountry === 'BR' ? 'R$' : companyCountry === 'ES' ? '€' : companyCountry === 'DE' ? '€' : companyCountry === 'FR' ? '€' : '$'}
                            </Typography>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Fecha de Nacimiento
                    </Typography>
                    <TextField 
                      name="birth_date" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      type="date"
                      defaultValue={editingCollaborator.birth_date}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Fecha de Ingreso
                    </Typography>
                    <TextField 
                      name="hire_date" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      type="date"
                      defaultValue={editingCollaborator.hire_date}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Ropa Superior
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      name="upper_clothing_size"
                      defaultValue={editingCollaborator.upper_clothing_size ?? ''}
                    >
                      {clothingSizes.map((size) => (
                        <MenuItem key={size} value={size}>
                          {size}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Ropa Inferior
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      name="lower_clothing_size"
                      defaultValue={editingCollaborator.lower_clothing_size ?? ''}
                    >
                      {clothingSizes.map((size) => (
                        <MenuItem key={size} value={size}>
                          {size}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Talla de Zapatos
                    </Typography>
                    <TextField 
                      name="shoe_size" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      placeholder="40, 41, 42"
                      defaultValue={editingCollaborator.shoe_size}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Sexo
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      name="gender"
                      defaultValue={editingCollaborator.gender ?? ''}
                    >
                      {genderOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Foto del Colaborador
                    </Typography>
                    <input
                      type="file"
                      id="edit-photo-upload"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setPhotoFile(file)
                        }
                      }}
                    />
                    <label htmlFor="edit-photo-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        fullWidth
                        size="small"
                        startIcon={<Add />}
                        sx={{
                          borderColor: colors.gray4,
                          color: colors.blue1,
                          '&:hover': {
                            borderColor: colors.blue6,
                            backgroundColor: colors.blue1 + '10'
                          }
                        }}
                      >
                        {photoFile ? 'Cambiar Foto' : 'Seleccionar Nueva Foto'}
                      </Button>
                    </label>
                    {photoFile && (
                      <Typography variant="caption" sx={{ color: colors.blue6, mt: 1, display: 'block' }}>
                        ✓ {photoFile.name}
                      </Typography>
                    )}
                    {editingCollaborator.photo_url && !photoFile && (
                      <Typography variant="caption" sx={{ color: colors.gray6, mt: 1, display: 'block' }}>
                        📷 Foto actual disponible
                      </Typography>
                    )}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Firma del Colaborador
                    </Typography>
                    <input
                      type="file"
                      id="edit-signature-upload"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setSignatureFile(file)
                      }}
                    />
                    <label htmlFor="edit-signature-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        fullWidth
                        size="small"
                        startIcon={<Add />}
                        sx={{
                          borderColor: colors.gray4,
                          color: colors.blue1,
                          '&:hover': {
                            borderColor: colors.blue6,
                            backgroundColor: colors.blue1 + '10'
                          }
                        }}
                      >
                        {signatureFile ? 'Cambiar Firma' : 'Seleccionar Nueva Firma'}
                      </Button>
                    </label>
                    {signatureFile && (
                      <Typography variant="caption" sx={{ color: colors.blue6, mt: 1, display: 'block' }}>
                        ✓ {signatureFile.name}
                      </Typography>
                    )}
                    {editingCollaborator.signature_url && !signatureFile && (
                      <Typography variant="caption" sx={{ color: colors.gray6, mt: 1, display: 'block' }}>
                        ✍️ Firma actual disponible
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
              <Button 
                onClick={() => {
                  setOpenEditDialog(false)
                  setEditingCollaborator(null)
                  resetCollaboratorForm()
                }}
                variant="outlined"
                sx={{ textTransform: 'none', minWidth: 120 }}
              >
                Cancelar
              </Button>
              <Button 
                variant="contained"
                onClick={async () => {
                  if (COLLABORATORS_DEBUG) console.log('🔄 Iniciando actualización de colaborador...')
                  
                  // Obtener datos del formulario
                  const form = document.getElementById('edit-collaborator-form') as HTMLFormElement
                  if (!form) {
                    console.error('❌ No se encontró el formulario')
                    alert('Error: No se encontró el formulario')
                    return
                  }
                  
                  const formData = new FormData(form)
                  if (COLLABORATORS_DEBUG) console.log('📋 Datos del formulario:', Object.fromEntries(formData.entries()))
                  
                  // Validar campos requeridos
                  const requiredFields = [
                    { field: 'first_name', label: 'Nombres' },
                    { field: 'last_name', label: 'Apellidos' },
                    { field: 'document', label: 'RUT/DNI/CI' },
                    { field: 'email', label: 'Email' }
                  ]
                  const missingFields = requiredFields.filter(({ field }) => !formData.get(field))
                  
                  if (missingFields.length > 0) {
                    const missingLabels = missingFields.map(({ label }) => label).join(', ')
                    console.error('❌ Campos requeridos faltantes:', missingFields.map(f => f.field))
                    alert(`❌ Campos requeridos faltantes:\n\n${missingLabels}\n\nPor favor completa estos campos antes de continuar.`)
                    return
                  }
                  
                  // Validar teléfono
                  if (!phoneValue || phoneValue.length < 8) {
                    console.error('❌ Teléfono inválido:', phoneValue)
                    alert('❌ Teléfono requerido\n\nPor favor ingresa un teléfono válido con código de país.')
                    return
                  }
                  
                  // Validar teléfono de emergencia (opcional pero si se ingresa debe ser válido)
                  if (emergencyPhoneValue && emergencyPhoneValue.length < 8) {
                    console.error('❌ Teléfono de emergencia inválido:', emergencyPhoneValue)
                    alert('❌ Teléfono de emergencia inválido\n\nPor favor ingresa un teléfono de emergencia válido o déjalo vacío.')
                    return
                  }
                  
                  // Validar tipo de trabajador si es minería
                  if (showWorkerType && !workerType) {
                    console.error('❌ Tipo de trabajador requerido para minería')
                    alert('❌ Tipo de trabajador requerido\n\nPara la industria minera, debes seleccionar el tipo de trabajador (Directo, Directo no Operacional, Indirecto, etc.).')
                    return
                  }
                  
                  // Validar salario (opcional pero si se ingresa debe ser válido)
                  if (salaryValue && (isNaN(parseFloat(salaryValue)) || parseFloat(salaryValue) < 0)) {
                    console.error('❌ Salario inválido:', salaryValue)
                    alert('❌ Salario inválido\n\nPor favor ingresa un salario válido (número positivo) o déjalo vacío.')
                    return
                  }
                  
                  if (COLLABORATORS_DEBUG) console.log('✅ Validaciones pasadas, enviando datos...')
                  await handleUpdateCollaborator(formData)
                }}
                sx={{
                  textTransform: 'none',
                  minWidth: 160,
                  background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
                  }
                }}
              >
                Actualizar Colaborador
              </Button>
            </DialogActions>
          </Dialog>
          <Dialog
            open={dailyStatusDialogOpen}
            onClose={() => setDailyStatusDialogOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle sx={{ color: colors.blue1, fontWeight: 700 }}>
              Estado diario del colaborador
            </DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
              <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
                <TextField
                  label="Colaborador"
                  value={dailyStatusCollaborator ? getDisplayName(dailyStatusCollaborator) : ''}
                  fullWidth
                  size="small"
                  InputProps={{ readOnly: true }}
                />
                <TextField
                  label="Fecha"
                  type="date"
                  value={dailyStatusDate}
                  onChange={(e) => setDailyStatusDate(e.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  select
                  label="Estado del día"
                  value={dailyStatusValue}
                  onChange={(e) => setDailyStatusValue(e.target.value)}
                  fullWidth
                  size="small"
                >
                  {DAILY_STATUS_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Motivo / Observación"
                  value={dailyStatusReason}
                  onChange={(e) => setDailyStatusReason(e.target.value)}
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                />
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => setDailyStatusDialogOpen(false)} variant="outlined" sx={{ textTransform: 'none' }}>
                Cancelar
              </Button>
              <Button
                onClick={saveDailyStatus}
                variant="contained"
                disabled={savingDailyStatus || !dailyStatusValue}
                sx={{ textTransform: 'none' }}
              >
                {savingDailyStatus ? 'Guardando...' : 'Guardar estado diario'}
              </Button>
            </DialogActions>
          </Dialog>
        </Container>
      </Box>
    </Box>
  )
}
