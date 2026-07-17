"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import { DateCalendar, LocalizationProvider } from "@mui/x-date-pickers"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { es } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Cloud, CloudRain, Eye, History, Pencil, Plus, RefreshCw, Snowflake, Sun, Trash2, Wind } from "lucide-react"
import UserHeader from "../../../components/layout/UserHeader"
import { colors } from "../../../theme/theme"
import {
  getCurrentWorkdayMetadata,
  resolveCalculationVersion,
  resolvePersonWorkdayHours,
  resolveMachineWorkdayHours,
  resolveHalfDayHours,
  resolvePersonDotationFromHours,
  resolveMachineDotationFromHours,
  isLegacyCalculation,
  isCurrentCalculation
} from "@/lib/workdayConfig"

const DAILY_REPORT_BASE_SEQUENCE_ANCHOR_DATE = "2026-05-09"
const DAILY_REPORT_BASE_SEQUENCE_ANCHOR_NO = 32
const PROJECT_WEEK_ANCHOR_START = "2026-06-15"
const PROJECT_WEEK_ANCHOR_NUMBER = 11
const DAILY_REPORT_INITIAL_CACHE_TTL_MS = 30000

type ClientFetchCacheEntry = {
  expiresAt: number
  promise?: Promise<any>
  value?: any
}

const dailyReportClientFetchCache = new Map<string, ClientFetchCacheEntry>()

const fetchJsonCached = async (url: string, options?: RequestInit, ttlMs = DAILY_REPORT_INITIAL_CACHE_TTL_MS, force = false) => {
  const method = String(options?.method || "GET").toUpperCase()
  const cacheKey = `${method}:${url}`
  const now = Date.now()
  const current = dailyReportClientFetchCache.get(cacheKey)
  if (!force && current) {
    if (current.value !== undefined && current.expiresAt > now) return current.value
    if (current.promise) return current.promise
  }

  const promise = fetch(url, options).then(async (res) => {
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const error = new Error(String((json as any)?.error || `Error ${res.status}`))
      ;(error as any).payload = json
      throw error
    }
    dailyReportClientFetchCache.set(cacheKey, {
      value: json,
      expiresAt: Date.now() + ttlMs
    })
    return json
  }).catch((error) => {
    dailyReportClientFetchCache.delete(cacheKey)
    throw error
  })

  dailyReportClientFetchCache.set(cacheKey, {
    promise,
    expiresAt: now + ttlMs
  })
  return promise
}

type WeekRange = { start: string; end: string }

const WORKDAY_METADATA_KEYS = [
  "calculationVersion",
  "personWorkdayHours",
  "machineWorkdayHours",
  "halfDayHours",
  "maxPersonHoursWithOvertime",
  "maxMachineHoursWithOvertime"
]

const parsePlainObject = (value: any): Record<string, any> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : null
  } catch {
    return null
  }
}

const parseJsonArray = (value: any): any[] => {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const hasExplicitWorkdayMetadata = (source: any): boolean => {
  const obj = parsePlainObject(source)
  if (!obj) return false
  if (WORKDAY_METADATA_KEYS.some((key) => obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "")) return true
  return ["notes", "v2_form_snapshot", "v2_runtime_snapshot"].some((key) => hasExplicitWorkdayMetadata(obj[key]))
}

const getFieldReportWorkdaySource = (report: any) => {
  if (hasExplicitWorkdayMetadata(report)) return report
  const personnelWithMetadata = parseJsonArray(report?.personnel).find((row) => hasExplicitWorkdayMetadata(row))
  if (personnelWithMetadata) return personnelWithMetadata
  const equipmentWithMetadata = parseJsonArray(report?.equipment_entries).find((row) => hasExplicitWorkdayMetadata(row))
  if (equipmentWithMetadata) return equipmentWithMetadata
  return report
}

const buildWorkdayMetadataForSource = (source: any) => ({
  calculationVersion: resolveCalculationVersion(source),
  personWorkdayHours: resolvePersonWorkdayHours(source),
  machineWorkdayHours: resolveMachineWorkdayHours(source),
  halfDayHours: resolveHalfDayHours(source),
  maxPersonHoursWithOvertime: Number((source as any)?.maxPersonHoursWithOvertime || getCurrentWorkdayMetadata().maxPersonHoursWithOvertime),
  maxMachineHoursWithOvertime: Number((source as any)?.maxMachineHoursWithOvertime || getCurrentWorkdayMetadata().maxMachineHoursWithOvertime)
})

const getUtcDayNumber = (date: string) => {
  const m = String(date || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000)
}

const getDailyReportNoFromDate = (date: string) => {
  const target = getUtcDayNumber(date)
  const anchor = getUtcDayNumber(DAILY_REPORT_BASE_SEQUENCE_ANCHOR_DATE)
  if (target == null || anchor == null) return null
  return DAILY_REPORT_BASE_SEQUENCE_ANCHOR_NO + (target - anchor)
}

type DailyReportRecord = {
  id: string
  report_no: number
  revision?: string
  report_date: string
  equipment_snapshot_date?: string | null
  contractor_name?: string | null
  contractor_logo_url?: string | null
  client_name?: string | null
  client_logo_url?: string | null
  project_name?: string | null
  contract_title?: string | null
  contract_number?: string | null
  work_calendar?: string | null
  hh_day?: number | null
  hh_productive?: number | null
  weather_label?: string | null
  source_field_report_ids?: string[]
  notes?: Record<string, any> | null
  created_by?: string | null
  v2_form_snapshot?: Record<string, any> | null
  v2_runtime_snapshot?: Record<string, any> | null
  raw_payload?: Record<string, any> | null
  s4_prev_indirect_dot?: number | null
  s4_prev_indirect_hh?: number | null
  s4_prev_direct_dot?: number | null
  s4_prev_direct_hh?: number | null
  s4_prev_total_dot?: number | null
  s4_prev_total_hh?: number | null
  s4_prev_total_equip?: number | null
  s4_prev_total_hm?: number | null
  s4_curr_indirect_dot?: number | null
  s4_curr_indirect_hh?: number | null
  s4_curr_direct_dot?: number | null
  s4_curr_direct_hh?: number | null
  s4_curr_total_dot?: number | null
  s4_curr_total_hh?: number | null
  s4_curr_total_equip?: number | null
  s4_curr_total_hm?: number | null
}

type DailyReportVersion = {
  id: string
  daily_report_id: string
  version_no: number
  edited_by?: string | null
  previous_data?: Record<string, any> | null
  new_data?: Record<string, any> | null
  created_at?: string | null
}

type DailyReportDeletionAudit = {
  id: string
  daily_report_id: string
  report_no?: number | null
  report_date?: string | null
  work_front?: string | null
  deleted_by?: string | null
  deleted_by_email?: string | null
  deleted_by_role?: string | null
  deleted_at?: string | null
  delete_reason?: string | null
  delete_source?: string | null
  report_snapshot?: Record<string, any> | null
  related_snapshot?: Record<string, any> | null
}

const decimalFormValue = (value: unknown) => {
  const n = Number(String(value ?? "").replace(",", "."))
  if (!Number.isFinite(n) || n <= 0) return "0"
  const normalized = Number(n.toFixed(2))
  const hasDecimals = Math.abs(normalized % 1) > 0.0001
  return hasDecimals ? normalized.toFixed(2).replace(".", ",") : String(normalized)
}

const oneDecimalFormValue = (value: unknown) => {
  const n = Number(String(value ?? "").replace(",", "."))
  if (!Number.isFinite(n) || n <= 0) return "0"
  const normalized = Number(n.toFixed(1))
  const hasDecimals = Math.abs(normalized % 1) > 0.0001
  return hasDecimals ? normalized.toFixed(1).replace(".", ",") : String(Math.round(normalized))
}

type CollaboratorLite = {
  id?: string
  first_name?: string | null
  last_name?: string | null
  specialty?: string | null
  position?: string | null
  worker_type?: string | null
  condition?: string | null
  is_active?: boolean | null
  hire_date?: string | null
  exception_condition?: string | null
  current_crew_id?: string | null
  signature_url?: string | null
  photo_url?: string | null
}

type DailyStatusLite = {
  id?: string
  collaborator_id: string
  work_date: string
  status: string
  reason?: string | null
  collaborator?: {
    id?: string
    first_name?: string | null
    last_name?: string | null
    document?: string | null
    position?: string | null
    worker_type?: string | null
    is_active?: boolean
  } | null
}

type DailyForm = {
  report_no: string
  revision: string
  report_date: string
  contractor_name: string
  contractor_logo_url: string
  client_name: string
  client_logo_url: string
  project_name: string
  contract_title: string
  contract_number: string
  work_calendar: string
  hh_day: string
  hh_productive: string
  weather_label: string
  source_field_report_ids: string[]
  obs_contractor: string
  obs_client: string
  report_format_code: string
  project_account: string
  site_responsible: string
  work_front: "CANALETAS" | "PISCINAS"
  weather_v2: string
  summary_indirect_dotation: string
  summary_indirect_hh: string
  summary_direct_dotation: string
  summary_direct_hh: string
  summary_total_dotation: string
  summary_total_hh: string
  equip_major_qty: string
  equip_major_hm: string
  equip_minor_qty: string
  equip_minor_hm: string
  equip_total_qty: string
  equip_total_hm: string
  comments_v2: string
  prepared_by_name: string
  prepared_by_role: string
  prepared_by_date: string
  approved_by_name: string
  approved_by_role: string
  approved_by_date: string
  validated_by_name: string
  validated_by_role: string
  validated_by_date: string
  prepared_by_signature_url: string
  approved_by_signature_url: string
  v2_front_distribution_overrides?: Record<string, number[]>
  v2_equipment_front_distribution_overrides?: Record<string, number[]>
  [key: string]: any
}
type EditSourceMode = "snapshot" | "field_reports"
type EvidenceFileLite = {
  key: string
  name?: string
  type?: string
  size?: number
  uploaded_at?: string
}
const isEvidenceStorageKey = (key: string) =>
  key.includes("/") && !/^image\//i.test(key)
type FrontBaseline = {
  work_front: "CANALETAS" | "PISCINAS"
  as_of_report_no: number
  as_of_date: string
  prev_indirect_dot: number
  prev_indirect_hh: number
  prev_direct_dot: number
  prev_direct_hh: number
  prev_total_dot: number
  prev_total_hh: number
  prev_major_equip: number
  prev_major_hm: number
  prev_minor_equip: number
  prev_minor_hm: number
  prev_total_equip: number
  prev_total_hm: number
}
type FrontHistoryRow = {
  work_front: "CANALETAS" | "PISCINAS"
  report_no: number
  report_date: string
  indirect_hh_accum: number
  direct_hh_accum: number
  total_hh_accum: number
  major_equip_accum: number
  minor_equip_accum: number
  total_equip_accum: number
  major_hm_accum: number
  minor_hm_accum: number
}

const todayKey = () => new Date().toISOString().slice(0, 10)
const parseYmdToDate = (value: string) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
const compareYmd = (a: string, b: string) => {
  const left = String(a || "").slice(0, 10)
  const right = String(b || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(left) || !/^\d{4}-\d{2}-\d{2}$/.test(right)) return 0
  return left.localeCompare(right)
}
const formatDateDisplay = (value: string) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return "Seleccionar fecha"
  return `${m[3]}-${m[2]}-${m[1]}`
}
const dateToYmd = (date: Date | null) => {
  if (!date) return ""
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
const addDaysToYmd = (value: string, days: number) => {
  const date = parseYmdToDate(value)
  if (!date) return ""
  date.setDate(date.getDate() + days)
  return dateToYmd(date)
}
const getWeekRangeFromYmd = (value: string): WeekRange => {
  const date = parseYmdToDate(value)
  if (!date) return { start: "", end: "" }
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + mondayOffset)
  const start = dateToYmd(date)
  return { start, end: addDaysToYmd(start, 6) }
}
const getProjectWeekNumber = (value: string) => {
  const weekStart = getWeekRangeFromYmd(value).start
  const target = getUtcDayNumber(weekStart)
  const anchor = getUtcDayNumber(PROJECT_WEEK_ANCHOR_START)
  if (target == null || anchor == null) return PROJECT_WEEK_ANCHOR_NUMBER
  return PROJECT_WEEK_ANCHOR_NUMBER + Math.floor((target - anchor) / 7)
}
const formatDateDisplaySlash = (value: string) => {
  const m = String(value || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return value
  return `${m[3]}/${m[2]}/${m[1]}`
}
const buildWeekRangesFromDates = (dates: string[]) => {
  const byStart = new Map<string, WeekRange>()
  dates
    .map((date) => String(date || "").slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .forEach((date) => {
      const range = getWeekRangeFromYmd(date)
      if (range.start) byStart.set(range.start, range)
    })
  return Array.from(byStart.values()).sort((a, b) => b.start.localeCompare(a.start))
}

const allocateIntegerByWeights = (total: number, weights: Record<string, number>) => {
  const safeTotal = Math.max(0, Math.floor(Number(total || 0)))
  const keys = Object.keys(weights || {})
  const positive = keys.filter((k) => Number(weights[k] || 0) > 0)
  const out: Record<string, number> = {}
  keys.forEach((k) => { out[k] = 0 })
  if (safeTotal <= 0 || positive.length === 0) return out
  const sum = positive.reduce((acc, k) => acc + Number(weights[k] || 0), 0)
  if (!(sum > 0)) return out

  const baseByKey = new Map<string, number>()
  const remainderByKey = new Map<string, number>()
  let assigned = 0
  positive.forEach((k) => {
    const exact = (safeTotal * Number(weights[k] || 0)) / sum
    const base = Math.floor(exact)
    baseByKey.set(k, base)
    remainderByKey.set(k, exact - base)
    assigned += base
  })
  let pending = Math.max(0, safeTotal - assigned)
  const ordered = [...positive].sort((a, b) => {
    const remDiff = Number(remainderByKey.get(b) || 0) - Number(remainderByKey.get(a) || 0)
    if (Math.abs(remDiff) > 1e-9) return remDiff
    return a.localeCompare(b, "es", { sensitivity: "base" })
  })
  for (let i = 0; i < ordered.length && pending > 0; i += 1) {
    const k = ordered[i]
    baseByKey.set(k, Number(baseByKey.get(k) || 0) + 1)
    pending -= 1
    if (i === ordered.length - 1 && pending > 0) i = -1
  }
  positive.forEach((k) => { out[k] = Number(baseByKey.get(k) || 0) })
  return out
}

function ReportDateCalendarSelector({
  value,
  onChange,
  options,
  navigationOptions,
  disabled = false
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
  navigationOptions?: string[]
  disabled?: boolean
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const selectableDates = useMemo(
    () => Array.from(new Set(
      (options || [])
        .map((date) => String(date || "").slice(0, 10))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    )),
    [options]
  )
  const navigationDates = useMemo(() => {
    const dates = (navigationOptions?.length ? navigationOptions : selectableDates)
      .map((date) => String(date || "").slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    return Array.from(new Set(dates)).sort((a, b) => a.localeCompare(b))
  }, [navigationOptions, selectableDates])
  const allowedSet = useMemo(() => new Set(selectableDates), [selectableDates])
  const selectedDate = parseYmdToDate(value)
  const firstNavigationDate = navigationDates.length ? parseYmdToDate(navigationDates[0]) : null
  const lastNavigationDate = navigationDates.length ? parseYmdToDate(navigationDates[navigationDates.length - 1]) : null
  const referenceDate = selectedDate || parseYmdToDate(selectableDates[0] || navigationDates[navigationDates.length - 1] || "")
  const calendarAnchorDate = referenceDate || new Date()
  const minDate = firstNavigationDate
    ? new Date(firstNavigationDate.getFullYear() - 1, firstNavigationDate.getMonth(), 1)
    : new Date(calendarAnchorDate.getFullYear() - 1, 0, 1)
  const maxDate = lastNavigationDate
    ? new Date(lastNavigationDate.getFullYear() + 1, lastNavigationDate.getMonth() + 1, 0)
    : new Date(calendarAnchorDate.getFullYear() + 1, 11, 31)

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        disabled={disabled}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          minWidth: 220,
          justifyContent: "center",
          px: 1.2,
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.1,
          textAlign: "center"
        }}
      >
        {formatDateDisplay(value)}
      </Button>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
          <DateCalendar
            key={value || "empty"}
            defaultValue={selectedDate}
            referenceDate={referenceDate || undefined}
            minDate={minDate}
            maxDate={maxDate}
            onChange={(next) => {
              const ymd = dateToYmd(next as Date | null)
              if (!ymd || !allowedSet.has(ymd)) return
              onChange(ymd)
              setAnchorEl(null)
            }}
            shouldDisableDate={(day) => !allowedSet.has(dateToYmd(day as Date))}
          />
        </LocalizationProvider>
      </Popover>
    </>
  )
}

const mergeFieldReportActivityRowsForFrontCalc = (assignments: any[], activities: any[]) => {
  const assignmentRows = Array.isArray(assignments) ? assignments : []
  const activityRows = Array.isArray(activities) ? activities : []
  const maxRows = Math.max(assignmentRows.length, activityRows.length)
  const frontKeys = ["activity_front", "work_front", "front", "frente", "area", "work_area", "sector"]

  return Array.from({ length: maxRows }, (_unused, idx) => {
    const assignment = assignmentRows[idx]
    const activity = activityRows[idx]
    if (assignment && activity) {
      const merged = { ...activity, ...assignment }
      frontKeys.forEach((key) => {
        const current = merged?.[key]
        const fallback = activity?.[key]
        if ((current == null || String(current).trim() === "") && fallback != null) {
          merged[key] = fallback
        }
      })
      return merged
    }
    return assignment || activity
  }).filter(Boolean)
}

type DynamicFrontColumn = {
  key: string
  label: string
  sourceReportIds: string[]
}

type DynamicFrontColumnsByBlock = {
  CANALETAS: DynamicFrontColumn[]
  PISCINAS: DynamicFrontColumn[]
}

const normalizeDynamicFrontKey = (value: any) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()

const BASE_DYNAMIC_FRONT_KEYS = new Set([
  "INSTALACION FAENA",
  "PISCINAS",
  "CANALETAS",
  "CONTRATO BASE PISCINAS",
  "CONTRATO BASE CANALETAS"
])

const isBaseDynamicFrontLabel = (value: any) => {
  const key = normalizeDynamicFrontKey(value)
  return !key || BASE_DYNAMIC_FRONT_KEYS.has(key)
}

const cleanDynamicFrontLabel = (value: any) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()

const hasDynamicFrontSignal = (value: any) => {
  const normalized = normalizeDynamicFrontKey(value)
  if (!normalized || BASE_DYNAMIC_FRONT_KEYS.has(normalized)) return false
  return (
    normalized.includes("USO DE RECURSOS") ||
    normalized.includes("UDR") ||
    /(?:^|\s)NOC\s+N?[º°]?\s*\d+/i.test(normalized)
  )
}

const buildKnownDynamicFrontMap = (reportFrontNames: any[] = []) => {
  const out = new Map<string, string>()
  ;(reportFrontNames || []).forEach((name: any) => {
    const label = cleanDynamicFrontLabel(name)
    const key = normalizeDynamicFrontKey(label)
    if (!label || isBaseDynamicFrontLabel(label)) return
    if (!out.has(key)) out.set(key, label)
  })
  return out
}

const resolveDynamicFrontLabel = (value: any, knownFronts: Map<string, string>) => {
  const label = cleanDynamicFrontLabel(value)
  const key = normalizeDynamicFrontKey(label)
  if (!label || isBaseDynamicFrontLabel(label)) return ""
  const exact = knownFronts.get(key)
  if (exact) return exact
  return hasDynamicFrontSignal(label) ? label : ""
}

const collectDynamicFrontColumns = (
  fieldReports: any[] = [],
  reportFrontNames: any[] = []
): DynamicFrontColumn[] => {
  const knownFronts = buildKnownDynamicFrontMap(reportFrontNames)
  const columns = new Map<string, DynamicFrontColumn>()

  ;(fieldReports || []).forEach((report: any) => {
    const reportId = String(report?.id || "").trim()
    const workFront = cleanDynamicFrontLabel(report?.work_front)
    const workFrontId = String(report?.work_front_id || "").trim()
    let label = resolveDynamicFrontLabel(workFront, knownFronts)
    let key = label ? `name:${normalizeDynamicFrontKey(label)}` : ""

    if (!label) {
      const fallbackValues = [
        report?.report_title,
        report?.crew_name,
        report?.area,
        report?.work_area
      ]
      for (const fallback of fallbackValues) {
        const candidate = resolveDynamicFrontLabel(fallback, knownFronts)
        if (!candidate) continue
        label = candidate
        key = `name:${normalizeDynamicFrontKey(label)}`
        break
      }
    }

    if (!label && workFrontId && workFront && !isBaseDynamicFrontLabel(workFront)) {
      label = workFront
      key = `id:${workFrontId}`
    }

    if (!label || !key) return
    const current = columns.get(key) || { key, label, sourceReportIds: [] }
    if (reportId && !current.sourceReportIds.includes(reportId)) current.sourceReportIds.push(reportId)
    columns.set(key, current)
  })

  return Array.from(columns.values())
}

const splitDynamicFrontColumnsByBlock = (columns: DynamicFrontColumn[]): DynamicFrontColumnsByBlock => {
  const fallbackSplit = (items: DynamicFrontColumn[]): DynamicFrontColumnsByBlock => {
    const firstCount = Math.ceil((items || []).length / 2)
    return {
      CANALETAS: (items || []).slice(0, firstCount),
      PISCINAS: (items || []).slice(firstCount)
    }
  }
  const inferColumnFront = (column: DynamicFrontColumn): "CANALETAS" | "PISCINAS" | null => {
    const label = normalizeDynamicFrontKey(`${column?.label || ""} ${column?.key || ""}`)
    const nocMatches = Array.from(label.matchAll(/NOC\s+N?[º°]?\s*0*(\d+)/g))
    const nocNumber = Number(nocMatches[0]?.[1] || 0)
    if (Number.isFinite(nocNumber) && nocNumber > 0) return nocNumber % 2 === 0 ? "PISCINAS" : "CANALETAS"
    if (label.includes("PISCIN")) return "PISCINAS"
    if (label.includes("CANALET")) return "CANALETAS"
    return null
  }
  const assigned: DynamicFrontColumnsByBlock = { CANALETAS: [], PISCINAS: [] }
  const unassigned: DynamicFrontColumn[] = []
  ;(columns || []).forEach((column) => {
    const front = inferColumnFront(column)
    if (front) assigned[front].push(column)
    else unassigned.push(column)
  })
  if (assigned.CANALETAS.length > 0 || assigned.PISCINAS.length > 0) {
    const fallback = fallbackSplit(unassigned)
    return {
      CANALETAS: [...assigned.CANALETAS, ...fallback.CANALETAS],
      PISCINAS: [...assigned.PISCINAS, ...fallback.PISCINAS]
    }
  }
  return fallbackSplit(columns || [])
}

const parseDynamicFrontColumns = (value: any): DynamicFrontColumn[] => {
  const raw = (() => {
    if (Array.isArray(value)) return value
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  })()
  return raw
    .map((column: any) => {
      const label = cleanDynamicFrontLabel(column?.label)
      const key = cleanDynamicFrontLabel(column?.key) || `name:${normalizeDynamicFrontKey(label)}`
      const sourceReportIds = Array.isArray(column?.sourceReportIds)
        ? column.sourceReportIds.map((id: any) => String(id || "").trim()).filter(Boolean)
        : []
      return label && key ? { key, label, sourceReportIds } : null
    })
    .filter(Boolean) as DynamicFrontColumn[]
}

const parseDynamicFrontColumnsByBlock = (value: any): DynamicFrontColumnsByBlock | null => {
  const raw = (() => {
    if (value && typeof value === "object" && !Array.isArray(value)) return value
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return null
  })()
  if (!raw) return null
  return {
    CANALETAS: parseDynamicFrontColumns(raw.CANALETAS),
    PISCINAS: parseDynamicFrontColumns(raw.PISCINAS)
  }
}

const emptyForm = (date = todayKey()): DailyForm => ({
  report_no: "",
  revision: "0",
  report_date: date,
  equipment_snapshot_date: "",
  contractor_name: "",
  contractor_logo_url: "",
  client_name: "",
  client_logo_url: "",
  project_name: "",
  contract_title: "",
  contract_number: "",
  work_calendar: "",
  hh_day: "0",
  hh_productive: "0",
  weather_label: "",
  source_field_report_ids: [],
  obs_contractor: "",
  obs_client: "",
  report_format_code: "ANT-GPRO-FOR-CANALETAS",
  project_account: "",
  site_responsible: "",
  work_front: "CANALETAS",
  weather_v2: "",
  summary_indirect_dotation: "0",
  summary_indirect_hh: "0",
  summary_direct_dotation: "0",
  summary_direct_hh: "0",
  summary_total_dotation: "0",
  summary_total_hh: "0",
  equip_major_qty: "0",
  equip_major_hm: "0",
  equip_minor_qty: "0",
  equip_minor_hm: "0",
  equip_total_qty: "0",
  equip_total_hm: "0",
  comments_v2: "",
  prepared_by_name: "",
  prepared_by_role: "",
  prepared_by_date: date,
  approved_by_name: "",
  approved_by_role: "",
  approved_by_date: date,
  validated_by_name: "",
  validated_by_role: "",
  validated_by_date: date,
  prepared_by_signature_url: "",
  approved_by_signature_url: "",
  ...getCurrentWorkdayMetadata()
})

// Baseline manual para iniciar acumulados cuando aún no existen reportes previos en BD.
// Ajustable hasta que el histórico completo quede cargado en la tabla real.
const FRONT_INITIAL_BASELINE: Record<"CANALETAS" | "PISCINAS", {
  indirectHh: number
  directHh: number
  majorHm: number
  minorHm: number
  indirectDot?: number
  directDot?: number
  majorQty?: number
  minorQty?: number
}> = {
  CANALETAS: {
    indirectHh: 0,
    directHh: 0,
    majorHm: 0,
    minorHm: 0
  },
  PISCINAS: {
    indirectHh: 0,
    directHh: 0,
    majorHm: 0,
    minorHm: 0,
    indirectDot: 0,
    directDot: 0
  }
}

const normalizeRecordToForm = (r: Partial<DailyReportRecord>): DailyForm => {
  const notesObj =
    r?.notes && typeof r.notes === "object"
      ? (r.notes as Record<string, any>)
      : {}
  const formSnapshot =
    r?.v2_form_snapshot && typeof r.v2_form_snapshot === "object"
      ? (r.v2_form_snapshot as Record<string, any>)
      : {}
  const runtimeSnapshot =
    r?.v2_runtime_snapshot && typeof r.v2_runtime_snapshot === "object"
      ? (r.v2_runtime_snapshot as Record<string, any>)
      : {}
  const toNum = (value: unknown) => {
    const raw = String(value ?? "").trim()
    if (!raw) return 0
    const normalized = raw.replace(",", ".")
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const workdayMetadata = hasExplicitWorkdayMetadata(r) ? buildWorkdayMetadataForSource(r) : null
  const personWorkdayHours = resolvePersonWorkdayHours(workdayMetadata || r)
  const parseArrayLike = (value: any): any[] => {
    if (Array.isArray(value)) return value
    if (value && typeof value === "object") return Object.values(value)
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed
        if (parsed && typeof parsed === "object") return Object.values(parsed)
      } catch {}
    }
    return []
  }
  const normalizePersistedRow = (row: any) => ({
    ...(row && typeof row === "object" ? row : {}),
    __persistedDailySnapshot: true
  })
  const scorePersistedRows = (rows: any[]) => {
    if (!Array.isArray(rows) || rows.length === 0) return -1
    let quality = 0
    rows.forEach((row) => {
      const obj = row && typeof row === "object" ? row : {}
      const hasInstalacion = obj.instalacionFaena != null && String(obj.instalacionFaena).trim() !== ""
      const hasFrente = obj.frente != null && String(obj.frente).trim() !== ""
      const hasDot = obj.dotacionTotalObra != null && String(obj.dotacionTotalObra).trim() !== ""
      const hasHh = obj.hhTotalObra != null && String(obj.hhTotalObra).trim() !== ""
      if (hasInstalacion) quality += 2
      if (hasFrente) quality += 2
      if (hasDot) quality += 1
      if (hasHh) quality += 1
    })
    return rows.length * 100 + quality
  }
  const pickBestPersistedRows = (...candidates: any[][]) => {
    let best: any[] = []
    let bestScore = -1
    candidates.forEach((candidate) => {
      const rows = Array.isArray(candidate) ? candidate : []
      const score = scorePersistedRows(rows)
      if (score > bestScore) {
        best = rows
        bestScore = score
      }
    })
    return best.map(normalizePersistedRow)
  }
  const pickDetailRows = (key: string) => {
    const fromNotes = parseArrayLike((notesObj as any)?.[key])
    const fromForm = parseArrayLike((formSnapshot as any)?.[key])
    const fromRuntime = parseArrayLike((runtimeSnapshot as any)?.[key])
    if (key === "v2_detail_indirect_rows" || key === "v2_detail_direct_rows") {
      return pickBestPersistedRows(fromRuntime, fromForm, fromNotes)
    }
    if (fromRuntime.length > 0) return fromRuntime
    if (fromForm.length > 0) return fromForm
    return fromNotes
  }
  const pickComputed = (noteVal: unknown, snapshotVal: unknown, runtimeVal?: unknown) => {
    const runtimeStr = String(runtimeVal ?? "").trim()
    const noteStr = String(noteVal ?? "").trim()
    const snapStr = String(snapshotVal ?? "").trim()
    if (runtimeStr) return runtimeVal
    if (!noteStr && snapStr) return snapshotVal
    if (!snapStr) return noteVal
    const noteNum = toNum(noteVal)
    const snapNum = toNum(snapshotVal)
    if (noteNum === 0 && snapNum > 0) return snapshotVal
    return snapshotVal
  }
  const indirectDotRaw = pickComputed(notesObj.summary_indirect_dotation, formSnapshot.summary_indirect_dotation, runtimeSnapshot.summary_indirect_dotation)
  const directDotRaw = pickComputed(notesObj.summary_direct_dotation, formSnapshot.summary_direct_dotation, runtimeSnapshot.summary_direct_dotation)
  const indirectHhRaw = pickComputed(notesObj.summary_indirect_hh, formSnapshot.summary_indirect_hh, runtimeSnapshot.summary_indirect_hh)
  const directHhRaw = pickComputed(notesObj.summary_direct_hh, formSnapshot.summary_direct_hh, runtimeSnapshot.summary_direct_hh)
  const totalDotRaw = pickComputed(notesObj.summary_total_dotation, formSnapshot.summary_total_dotation, runtimeSnapshot.summary_total_dotation)
  const totalHhRaw = pickComputed(notesObj.summary_total_hh, formSnapshot.summary_total_hh, runtimeSnapshot.summary_total_hh)
  const pickSnapshotScalar = (key: string, fallback = "") => {
    const runtimeVal = (runtimeSnapshot as any)?.[key]
    if (runtimeVal != null && String(runtimeVal).trim() !== "") return String(runtimeVal)
    const formVal = (formSnapshot as any)?.[key]
    if (formVal != null && String(formVal).trim() !== "") return String(formVal)
    const notesVal = (notesObj as any)?.[key]
    if (notesVal != null && String(notesVal).trim() !== "") return String(notesVal)
    return fallback
  }

  const indirectDot = toNum(indirectDotRaw)
  const directDot = toNum(directDotRaw)
  const indirectHh = indirectHhRaw != null && String(indirectHhRaw).trim() !== "" ? toNum(indirectHhRaw) : indirectDot * personWorkdayHours
  const directHh = directHhRaw != null && String(directHhRaw).trim() !== "" ? toNum(directHhRaw) : directDot * personWorkdayHours
  const totalDot =
    totalDotRaw != null && String(totalDotRaw).trim() !== ""
      ? toNum(totalDotRaw)
      : (indirectDot + directDot)
  const totalHh =
    totalHhRaw != null && String(totalHhRaw).trim() !== ""
      ? toNum(totalHhRaw)
      : (indirectHh + directHh)

  const detailIndirectRows = pickDetailRows("v2_detail_indirect_rows")
  const detailDirectRows = pickDetailRows("v2_detail_direct_rows")
  const detailMajorRows = pickDetailRows("v2_detail_major_equipment_rows")
  const detailMinorRows = pickDetailRows("v2_detail_minor_equipment_rows")
  const detailRowVisibleDot = (row: any) => {
    const splitDot = toNum(row?.instalacionFaena) + toNum(row?.frente)
    if (splitDot > 0) return splitDot
    return toNum(row?.dotacionTotalObra)
  }
  const detailIndirectDot = detailIndirectRows.reduce((acc, row) => acc + detailRowVisibleDot(row), 0)
  const detailDirectDot = detailDirectRows.reduce((acc, row) => acc + detailRowVisibleDot(row), 0)
  const detailIndirectHh = detailIndirectDot * personWorkdayHours
  const detailDirectHh = detailDirectDot * personWorkdayHours
  const detailEquipmentQty = (row: any) => {
    const directTotal = toNum((row as any)?.totalEqMaq ?? (row as any)?.totalEqObra)
    if (directTotal > 0) return directTotal
    return toNum((row as any)?.instalacionFaena ?? (row as any)?.front1) +
      toNum((row as any)?.mainFront ?? (row as any)?.front2) +
      toNum((row as any)?.nocFront)
  }
  const detailMajorQty = detailMajorRows.reduce((acc, row) => acc + detailEquipmentQty(row), 0)
  const detailMinorQty = detailMinorRows.reduce((acc, row) => acc + detailEquipmentQty(row), 0)
  const detailMajorHm = detailMajorRows.reduce((acc, row) => acc + toNum((row as any)?.hmTotal), 0)
  const detailMinorHm = detailMinorRows.reduce((acc, row) => acc + toNum((row as any)?.hmTotal), 0)

  const preferDetailDailyValue = (persisted: number, detail: number) => {
    if (detail <= 0) return persisted
    // Sector 2 is daily only. If a broken snapshot saved Sector 4 accumulated
    // values here, the persisted value diverges from detail rows; trust details.
    return Math.abs(persisted - detail) > 0.01 ? detail : persisted
  }
  const safeIndirectDot = preferDetailDailyValue(indirectDot, detailIndirectDot)
  const safeDirectDot = preferDetailDailyValue(directDot, detailDirectDot)
  const safeIndirectHh = preferDetailDailyValue(indirectHh, detailIndirectHh)
  const safeDirectHh = preferDetailDailyValue(directHh, detailDirectHh)
  const detailTotalDot = safeIndirectDot + safeDirectDot
  const detailTotalHh = safeIndirectHh + safeDirectHh
  const safeTotalDot = preferDetailDailyValue(totalDot, detailTotalDot)
  const safeTotalHh = preferDetailDailyValue(totalHh, detailTotalHh)
  const equipMajorQtyRaw = toNum(pickComputed(notesObj.equip_major_qty, formSnapshot.equip_major_qty, runtimeSnapshot.equip_major_qty))
  const equipMinorQtyRaw = toNum(pickComputed(notesObj.equip_minor_qty, formSnapshot.equip_minor_qty, runtimeSnapshot.equip_minor_qty))
  const equipMajorHmRaw = toNum(pickComputed(notesObj.equip_major_hm, formSnapshot.equip_major_hm, runtimeSnapshot.equip_major_hm))
  const equipMinorHmRaw = toNum(pickComputed(notesObj.equip_minor_hm, formSnapshot.equip_minor_hm, runtimeSnapshot.equip_minor_hm))
  const equipTotalQtyRaw = toNum(pickComputed(notesObj.equip_total_qty, formSnapshot.equip_total_qty, runtimeSnapshot.equip_total_qty))
  const equipTotalHmRaw = toNum(pickComputed(notesObj.equip_total_hm, formSnapshot.equip_total_hm, runtimeSnapshot.equip_total_hm))
  const safeEquipMajorQty = preferDetailDailyValue(equipMajorQtyRaw, detailMajorQty)
  const safeEquipMinorQty = preferDetailDailyValue(equipMinorQtyRaw, detailMinorQty)
  const safeEquipMajorHm = preferDetailDailyValue(equipMajorHmRaw, detailMajorHm)
  const safeEquipMinorHm = preferDetailDailyValue(equipMinorHmRaw, detailMinorHm)
  const safeEquipTotalQty = preferDetailDailyValue(equipTotalQtyRaw, safeEquipMajorQty + safeEquipMinorQty)
  const safeEquipTotalHm = preferDetailDailyValue(equipTotalHmRaw, safeEquipMajorHm + safeEquipMinorHm)
  if (String((r as any)?.id || "").trim()) {
  }

  return {
    ...(r?.notes && typeof r.notes === "object" ? r.notes : {}),
    ...(r?.v2_form_snapshot && typeof r.v2_form_snapshot === "object" ? r.v2_form_snapshot : {}),
    ...(r?.v2_runtime_snapshot && typeof r.v2_runtime_snapshot === "object" ? r.v2_runtime_snapshot : {}),
    ...(workdayMetadata ? workdayMetadata : {}),
    v2_detail_indirect_rows: detailIndirectRows,
    v2_detail_direct_rows: detailDirectRows,
    report_no: r?.report_no != null ? String(r.report_no) : "",
    revision: String(r?.revision ?? "0"),
    report_date: String(r?.report_date || todayKey()),
    equipment_snapshot_date: String((r as any)?.equipment_snapshot_date || ""),
    contractor_name: String(r?.contractor_name || ""),
    contractor_logo_url: String(r?.contractor_logo_url || ""),
    client_name: String(r?.client_name || ""),
    client_logo_url: String(r?.client_logo_url || ""),
    project_name: String(r?.project_name || ""),
    contract_title: String(r?.contract_title || ""),
    contract_number: String(r?.contract_number || ""),
    work_calendar: String(r?.work_calendar || ""),
    hh_day: String(r?.hh_day ?? "0"),
    hh_productive: String(r?.hh_productive ?? "0"),
    weather_label: String(r?.weather_label || ""),
    source_field_report_ids: Array.isArray(r?.source_field_report_ids) ? r.source_field_report_ids.map(String) : [],
    obs_contractor: pickSnapshotScalar("obs_contractor", ""),
    obs_client: pickSnapshotScalar("obs_client", ""),
    report_format_code: pickSnapshotScalar("report_format_code", String((r as any)?.report_format_code || "ANT-GPRO-FOR-CANALETAS")),
    project_account: pickSnapshotScalar("project_account", ""),
    site_responsible: pickSnapshotScalar("site_responsible", ""),
    work_front: pickSnapshotScalar("work_front", String((r as any)?.work_front || "CANALETAS")).toUpperCase() === "PISCINAS" ? "PISCINAS" : "CANALETAS",
    weather_v2: pickSnapshotScalar("weather_v2", ""),
    summary_indirect_dotation: String(safeIndirectDot),
    summary_indirect_hh: String(safeIndirectHh),
    summary_direct_dotation: String(safeDirectDot),
    summary_direct_hh: String(safeDirectHh),
    summary_total_dotation: String(safeTotalDot),
    summary_total_hh: String(safeTotalHh),
    equip_major_qty: String(safeEquipMajorQty),
    equip_major_hm: String(safeEquipMajorHm),
    equip_minor_qty: String(safeEquipMinorQty),
    equip_minor_hm: String(safeEquipMinorHm),
    equip_total_qty: String(safeEquipTotalQty),
    equip_total_hm: String(safeEquipTotalHm),
    comments_v2: pickSnapshotScalar("comments_v2", ""),
    prepared_by_name: pickSnapshotScalar("prepared_by_name", "").toUpperCase(),
    prepared_by_role: pickSnapshotScalar("prepared_by_role", "").toUpperCase(),
    prepared_by_date: pickSnapshotScalar("prepared_by_date", String(r?.report_date || todayKey())),
    approved_by_name: pickSnapshotScalar("approved_by_name", "").toUpperCase(),
    approved_by_role: pickSnapshotScalar("approved_by_role", "").toUpperCase(),
    approved_by_date: pickSnapshotScalar("approved_by_date", String(r?.report_date || todayKey())),
    validated_by_name: pickSnapshotScalar("validated_by_name", "").toUpperCase(),
    validated_by_role: pickSnapshotScalar("validated_by_role", "").toUpperCase(),
    validated_by_date: pickSnapshotScalar("validated_by_date", String(r?.report_date || todayKey())),
    prepared_by_signature_url: pickSnapshotScalar("prepared_by_signature_url", ""),
    approved_by_signature_url: pickSnapshotScalar("approved_by_signature_url", "")
  }
}

const getSavedIndirectHoursSettings = (record?: Partial<DailyReportRecord> | null) => {
  const notes = record?.notes && typeof record.notes === "object" ? record.notes as Record<string, any> : {}
  const runtime = record?.v2_runtime_snapshot && typeof record.v2_runtime_snapshot === "object" ? record.v2_runtime_snapshot as Record<string, any> : {}
  const formSnap = record?.v2_form_snapshot && typeof record.v2_form_snapshot === "object" ? record.v2_form_snapshot as Record<string, any> : {}
  const rawOverrides =
    runtime.indirect_hours_overrides ??
    formSnap.indirect_hours_overrides ??
    notes.indirect_hours_overrides ??
    {}
  const overrides: Record<string, number> = {}
  if (rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)) {
    Object.entries(rawOverrides as Record<string, any>).forEach(([workerId, value]) => {
      const id = String(workerId || "").trim()
      const n = Number(value)
      if (id && Number.isFinite(n)) overrides[id] = n
    })
  }
  const rawScope = String(
    runtime.indirect_hours_front_apply_scope ??
    formSnap.indirect_hours_front_apply_scope ??
    notes.indirect_hours_front_apply_scope ??
    ""
  )
  const frontApplyScope: "EXISTING_FRONTS" | "CURRENT_FRONT_ONLY" =
    rawScope === "CURRENT_FRONT_ONLY" ? "CURRENT_FRONT_ONLY" : "EXISTING_FRONTS"
  const rawFrontOverrides =
    runtime.indirect_hours_front_overrides ??
    formSnap.indirect_hours_front_overrides ??
    notes.indirect_hours_front_overrides ??
    {}
  const frontOverrides: Record<string, "CANALETAS" | "PISCINAS" | "BOTH"> = {}
  if (rawFrontOverrides && typeof rawFrontOverrides === "object" && !Array.isArray(rawFrontOverrides)) {
    Object.entries(rawFrontOverrides as Record<string, any>).forEach(([workerId, value]) => {
      const id = String(workerId || "").trim()
      const mode = String(value || "").toUpperCase()
      if (!id) return
      if (mode === "CANALETAS" || mode === "PISCINAS" || mode === "BOTH") {
        frontOverrides[id] = mode
      }
    })
  }
  return { overrides, frontApplyScope, frontOverrides }
}

const getPersistedV2RowsFromForm = (form: Partial<DailyForm>, key: "v2_detail_indirect_rows" | "v2_detail_direct_rows") => {
  const direct = (form as any)?.[key]
  if (Array.isArray(direct)) return direct
  const notes = (form as any)?.notes && typeof (form as any).notes === "object" ? (form as any).notes : {}
  const formSnap = (form as any)?.v2_form_snapshot && typeof (form as any).v2_form_snapshot === "object" ? (form as any).v2_form_snapshot : {}
  const runtime = (form as any)?.v2_runtime_snapshot && typeof (form as any).v2_runtime_snapshot === "object" ? (form as any).v2_runtime_snapshot : {}
  const fromNotes = notes?.[key]
  const fromForm = formSnap?.[key]
  const fromRuntime = runtime?.[key]
  if (Array.isArray(fromNotes)) return fromNotes
  if (Array.isArray(fromForm)) return fromForm
  if (Array.isArray(fromRuntime)) return fromRuntime
  return []
}

const getPersistedRowsGenericFromForm = (form: Partial<DailyForm>, key: string) => {
  const direct = (form as any)?.[key]
  if (Array.isArray(direct)) return direct
  const notes = (form as any)?.notes && typeof (form as any).notes === "object" ? (form as any).notes : {}
  const formSnap = (form as any)?.v2_form_snapshot && typeof (form as any).v2_form_snapshot === "object" ? (form as any).v2_form_snapshot : {}
  const runtime = (form as any)?.v2_runtime_snapshot && typeof (form as any).v2_runtime_snapshot === "object" ? (form as any).v2_runtime_snapshot : {}
  if (Array.isArray(notes?.[key])) return notes[key]
  if (Array.isArray(formSnap?.[key])) return formSnap[key]
  if (Array.isArray(runtime?.[key])) return runtime[key]
  return []
}

const hydratePersistedV2Rows = (rows: any[]) =>
  rows.map((row) => ({
    ...(row || {}),
    hhTurnoDia: Number((row || {})?.hhTurnoDia || 0),
    __persistedDailySnapshot: true
  }))

const hasUsablePersistedV2Rows = (rows: any[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return false
  const total = rows.reduce((acc, row) => {
    const n = (value: unknown) => {
      if (value == null || String(value).trim() === "") return 0
      const parsed = Number(String(value).replace(",", "."))
      return Number.isFinite(parsed) ? parsed : 0
    }
    return acc +
      n(row?.instalacionFaena) +
      n(row?.frente) +
      n(row?.dotacionTotalObra) +
      n(row?.hhTotalObra)
  }, 0)
  return total > 0
}

const sumV2RowsDotation = (rows: any[]) => {
  if (!Array.isArray(rows)) return 0
  return rows.reduce((acc, row) => {
    const n = (value: unknown) => {
      if (value == null || String(value).trim() === "") return 0
      const parsed = Number(String(value).replace(",", "."))
      return Number.isFinite(parsed) ? parsed : 0
    }
    const baseSplit = n(row?.instalacionFaena) + n(row?.frente)
    if (baseSplit > 0) return acc + baseSplit
    return acc + n(row?.dotacionTotalObra)
  }, 0)
}

const toV2Number = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  const normalized = raw.replace(/\s+/g, "").replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const isBrokenV2FrontSplitRow = (row: any) => {
  const dot = toV2Number(row?.dotacionTotalObra)
  const inst = toV2Number(row?.instalacionFaena)
  const frente = toV2Number(row?.frente)
  const nocFront = toV2Number(row?.nocFront)
  return dot > 0 && (inst + frente + nocFront) <= 0
}


const isHiredByReportDate = (collab: Pick<CollaboratorLite, "hire_date"> | null | undefined, reportDate: unknown) => {
  const hireDate = String(collab?.hire_date || "").trim().slice(0, 10)
  const targetDate = String(reportDate || "").trim().slice(0, 10)
  if (!hireDate || !targetDate) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return true
  return hireDate <= targetDate
}

const formatDailyReportPositionLabel = (value: unknown) => {
  const raw = String(value || "")
  return raw.replace(/\bCANERIA\b/g, "CAÑERIA")
}

const stableIndirectHoursSettingsKey = (
  overrides: Record<string, number>,
  scope: "EXISTING_FRONTS" | "CURRENT_FRONT_ONLY",
  frontOverrides: Record<string, "CANALETAS" | "PISCINAS" | "BOTH">
) => {
  const sortedOverrides = Object.fromEntries(
    Object.entries(overrides || {})
      .filter(([workerId, value]) => String(workerId || "").trim() && Number.isFinite(Number(value)))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([workerId, value]) => [workerId, Number(value)])
  )
  const sortedFrontOverrides = Object.fromEntries(
    Object.entries(frontOverrides || {})
      .filter(([workerId, mode]) => {
        const id = String(workerId || "").trim()
        const normalized = String(mode || "").toUpperCase()
        return !!id && (normalized === "CANALETAS" || normalized === "PISCINAS" || normalized === "BOTH")
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([workerId, mode]) => [workerId, String(mode).toUpperCase()])
  )
  return JSON.stringify({ overrides: sortedOverrides, scope, frontOverrides: sortedFrontOverrides })
}

const uniq = (values: string[]) => {
  const out: string[] = []
  const seen = new Set<string>()
  values.forEach((v) => {
    const val = String(v || "").trim()
    if (!val) return
    const k = val.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(val)
  })
  return out
}

const tableCellSx: React.CSSProperties = {
  border: "1px solid #111",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 8px",
  lineHeight: 1.1,
  whiteSpace: "nowrap"
}

const valueCellSx: React.CSSProperties = {
  ...tableCellSx,
  fontWeight: 400
}

const laborTitleCellSx: React.CSSProperties = {
  border: "1px solid #111",
  fontSize: 13,
  fontWeight: 700,
  textAlign: "center",
  padding: "8px 6px",
  background: "#f7f7f7"
}

const laborHeaderCellSx: React.CSSProperties = {
  border: "1px solid #111",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "center",
  padding: "6px 6px",
  background: "#efefef"
}

const laborBlueBandSx: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "center",
  padding: "7px 6px",
  background: "#082d75",
  color: "#fff"
}

const laborSubtotalCellSx: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "center",
  padding: "7px 6px",
  background: "#082d75",
  color: "#bfdbfe"
}

const laborTotalCellSx: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "center",
  padding: "7px 6px",
  background: "#082d75",
  color: "#bfdbfe"
}

const WEATHER_OPTIONS = [
  { key: "soleado", label: "Soleado", Icon: Sun },
  { key: "nublado", label: "Nublado", Icon: Cloud },
  { key: "lluvia", label: "Lluvia", Icon: CloudRain },
  { key: "nieve", label: "Nieve", Icon: Snowflake }
]

type ReportTemplateKey = "daily_v1" | "daily_v2"
const REPORT_TEMPLATE_OPTIONS: Array<{ value: ReportTemplateKey; label: string; disabled?: boolean }> = [
  { value: "daily_v1", label: "Versión 1", disabled: true },
  { value: "daily_v2", label: "Versión 2" }
]
const V2_LAYOUT_MIN_WIDTH = 2100
const CONTRACT_TITLE_FIXED = "Contratos de Construcción GPRO 2026_2027"
const CONTRACT_NUMBER_FIXED = "4644009834"
const normalizeDirectKeyToken = (value: any) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

const normalizeSpecialtyLabel = (specialty: any, discipline?: any, position?: any) => {
  const raw = normalizeDirectKeyToken(specialty)
  if (raw) return raw
  const disc = normalizeDirectKeyToken(discipline)
  if (disc) return disc
  const pos = normalizeDirectKeyToken(position)
  return pos || "GENERAL"
}

const buildDirectFrontKey = (discipline?: string, specialty?: string, position?: string) => {
  const disc = normalizeDirectKeyToken(discipline) || "-"
  const spec = normalizeSpecialtyLabel(specialty, discipline, position) || "-"
  const pos = normalizeDirectKeyToken(position) || "-"
  return `${disc}|||${spec}|||${pos}`
}

const inferTemplateFromRecord = (record: any): ReportTemplateKey => {
  const notes = record?.notes && typeof record.notes === "object" ? record.notes : {}
  const formSnapshot = record?.v2_form_snapshot && typeof record.v2_form_snapshot === "object" ? record.v2_form_snapshot : {}
  const runtimeSnapshot = record?.v2_runtime_snapshot && typeof record.v2_runtime_snapshot === "object" ? record.v2_runtime_snapshot : {}
  const explicit = String(
    notes?.report_template ??
    formSnapshot?.report_template ??
    runtimeSnapshot?.report_template ??
    ""
  ).trim().toLowerCase()
  if (explicit === "daily_v1" || explicit === "v1") return "daily_v1"
  if (explicit === "daily_v2" || explicit === "v2") return "daily_v2"

  const hasV2Payload =
    Array.isArray(notes?.v2_detail_indirect_rows) ||
    Array.isArray(notes?.v2_detail_direct_rows) ||
    Array.isArray(formSnapshot?.v2_detail_indirect_rows) ||
    Array.isArray(formSnapshot?.v2_detail_direct_rows) ||
    Array.isArray(runtimeSnapshot?.v2_detail_indirect_rows) ||
    Array.isArray(runtimeSnapshot?.v2_detail_direct_rows)
  if (hasV2Payload) return "daily_v2"

  // Compatibilidad: en este flujo el editor principal es V2.
  // Si no hay marca explícita, preferimos V2 para evitar abrir registros en V1 vacía.
  return "daily_v2"
}

const normalizeAttendanceStatus = (status?: string, reason?: string | null) => {
  const s = String(status || "").trim()
  const r = String(reason || "").trim().toLowerCase()
  if (!s) {
    if (r === "11" || r === "10" || r.includes("turno") || r.includes("presente")) return "Turno"
    if (r === "d" || r.includes("descanso")) return "Descanso"
    if (r === "fo" || r.includes("fuera de obra")) return "Fuera de Obra"
    if (r === "ac" || r.includes("acreditacion")) return "Acreditacion"
    if (r === "p" || r.includes("permiso")) return "Permiso"
    if (r === "l" || r.includes("licencia")) return "Licencia"
    if (r === "fin" || r.includes("finiquit")) return "Finiquitado"
  }
  if (s === "Otro" && (r.includes("fuera de obra") || r.includes("fo"))) return "Fuera de Obra"
  if (s === "Otro" && (r.includes("acreditacion") || r === "ac")) return "Acreditacion"
  return s
}

const attendanceCodeFromStatus = (status?: string) => {
  const normalized = String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
  if (!normalized) return ""
  if (normalized === "turno") return "11"
  if (normalized === "descanso") return "D"
  if (normalized === "fuera de obra") return "FO"
  if (normalized === "licencia") return "L"
  if (normalized === "vacaciones") return "F"
  if (normalized === "permiso") return "P"
  if (normalized === "teletrabajo") return "TL"
  if (normalized === "acreditacion") return "AC"
  if (normalized === "finiquitado") return "FIN"
  return ""
}

const normalizeTextLite = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

const normalizeApprovedByNameForReport = (value: unknown) => {
  const normalized = String(value || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
  return normalized === "HECTOR RICARDO CARDENAS JERALDO"
    ? "RICARDO CARDENAS JERALDO"
    : normalized
}

const formatDateV2 = (date: string) => {
  if (!date) return "-"
  const [y, m, d] = String(date).split("-")
  if (!y || !m || !d) return date
  return `${d}-${m}-${y.slice(-2)}`
}

const formatExportDateDots = (date: string) => {
  const [y, m, d] = String(date || "").slice(0, 10).split("-")
  if (!y || !m || !d) return String(date || "")
  return `${d}.${m}.${y}`
}

const TEMP_EQUIPMENT_AND_VEHICLES_ROWS = [
  {
    equipmentDescription: "MAN LIFT - JLG 800AJ",
    kmHrs: "",
    quantity: 0,
    dmOperando: 0,
    hmOperando: 0,
    hmMaintStandby: 0,
    workFronts: "Apoyo en todas las areas",
    vehicleDescription: "GRUPO ELECTROGENO 20 KVA",
    vehicleOperative: 0,
    vehicleOutOfService: 0
  },
  {
    equipmentDescription: "CAMION RAMPLA",
    kmHrs: "",
    quantity: 0,
    dmOperando: 0,
    hmOperando: 0,
    hmMaintStandby: 0,
    workFronts: "Apoyo en todas las areas",
    vehicleDescription: "GRUPO ELECTROGENO 60 KVA",
    vehicleOperative: 0,
    vehicleOutOfService: 0
  }
]

type MinorEquipmentRow = {
  name: string
  hmTurnoDia: number
  totalEquipos: number
  operacion: number
  disponibles: number
  acredMant: number
  panne: number
  oficinaFuera: number
  front1: number
  front2: number
  nocFront?: number
  dynamicFrontValues?: number[]
  totalEqObra: number
  hmTotal: number
}

type MajorEquipmentRow = {
  name: string
  hmTurnoDia: number
  totalEquipos: number
  operacion: number
  disponibles: number
  acredMant: number
  panne: number
  ofCentral: number
  instalacionFaena: number
  mainFront: number
  nocFront?: number
  dynamicFrontValues?: number[]
}

const normalizeFrontSplit = (
  frontA: number,
  frontB: number,
  totalPhysical: number
) => {
  const a = Math.max(0, Number(frontA || 0))
  const b = Math.max(0, Number(frontB || 0))
  const total = Math.max(0, Number(totalPhysical || 0))
  const sum = a + b
  if (sum <= 0) return { frontA: 0, frontB: 0 }
  if (total <= 0) return { frontA: 0, frontB: 0 }
  if (sum <= total) return { frontA: a, frontB: b }
  const ratio = total / sum
  return { frontA: a * ratio, frontB: b * ratio }
}

const parseQty = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  let normalized = raw.replace(/\s+/g, "")
  if (normalized.includes(",") && normalized.includes(".")) {
    const lastComma = normalized.lastIndexOf(",")
    const lastDot = normalized.lastIndexOf(".")
    if (lastComma > lastDot) normalized = normalized.replace(/\./g, "").replace(",", ".")
    else normalized = normalized.replace(/,/g, "")
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".")
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

type ManagementEquipmentSnapshotRow = {
  id?: string
  report_date?: string
  equipment_kind: "MAYOR" | "MENOR"
  equipment_name: string
  patent?: string | null
  quantity?: number | null
  canaletas_qty?: number | null
  piscinas_qty?: number | null
  is_operational?: boolean
  in_maintenance?: boolean
  in_accreditation?: boolean
  in_breakdown?: boolean
  include_in_daily_report?: boolean
  entry_date?: string | null
  return_date?: string | null
  mileage_km?: number | null
  notes?: string | null
}

const parseWeatherLabels = (value: string) => {
  const tokens = String(value || "")
    .split(/[;,]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  const selected = new Set<string>()
  WEATHER_OPTIONS.forEach((opt) => {
    if (tokens.some((t) => t === opt.key || t.includes(opt.key) || opt.label.toLowerCase().includes(t))) {
      selected.add(opt.label)
    }
  })
  return selected
}

function HeaderPreview({ form }: { form: DailyForm }) {
  const dateFmt = (() => {
    if (!form.report_date) return "-"
    const [y, m, d] = form.report_date.split("-")
    return [d, m, y?.slice(2)].filter(Boolean).join("-")
  })()

  const logoBox = (url?: string, fallback = "LOGO") => (
    <Box sx={{ width: 140, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={fallback} style={{ maxHeight: 32, maxWidth: 136, objectFit: "contain" }} />
      ) : (
        <Typography sx={{ fontSize: 11, color: "#666" }}>{fallback}</Typography>
      )}
    </Box>
  )

  return (
    <Box sx={{ overflowX: "auto", border: "1px solid #111" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
        <tbody>
          <tr>
            <td style={{ ...tableCellSx, width: 180 }}>{logoBox(form.client_logo_url, "Cliente")}</td>
            <td style={{ ...tableCellSx, textAlign: "center", fontWeight: 700, fontSize: 20 }} colSpan={6}>
              INFORME DIARIO DE CONTRATISTAS
            </td>
            <td style={{ ...tableCellSx, width: 180 }}>{logoBox(form.contractor_logo_url, "Contratista")}</td>
          </tr>
          <tr>
            <td style={tableCellSx}>REPORTE N°</td>
            <td style={{ ...valueCellSx, textAlign: "center", color: "#d00", fontWeight: 700 }} colSpan={3}>
              {form.report_no || "-"}
            </td>
            <td style={{ ...tableCellSx, textAlign: "center" }}>Rev. {form.revision || "0"}</td>
            <td style={tableCellSx}>Fecha:</td>
            <td style={{ ...valueCellSx, textAlign: "center" }} colSpan={2}>{dateFmt}</td>
          </tr>
          <tr>
            <td style={tableCellSx}>CONTRATISTA</td>
            <td style={{ ...valueCellSx, textAlign: "center" }} colSpan={3}>{form.contractor_name || "-"}</td>
            <td style={{ ...tableCellSx, textAlign: "center" }}>CLIENTE</td>
            <td style={{ ...valueCellSx, textAlign: "center" }} colSpan={3}>{form.client_name || "-"}</td>
          </tr>
          <tr>
            <td style={tableCellSx}>CONTRATO:</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 600 }} colSpan={3}>{form.contract_title || "-"}</td>
            <td style={{ ...tableCellSx, textAlign: "center" }}>PROYECTO</td>
            <td style={{ ...valueCellSx, textAlign: "center" }} colSpan={3}>{form.project_name || "-"}</td>
          </tr>
          <tr>
            <td style={tableCellSx}>N° DE CONTRATO</td>
            <td style={{ ...valueCellSx, textAlign: "center" }} colSpan={3}>{form.contract_number || "-"}</td>
            <td style={{ ...tableCellSx, textAlign: "center" }}>HH DIA</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{form.hh_day || "0"}</td>
            <td style={{ ...tableCellSx, textAlign: "center" }}>HH PRODUCTIVAS</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{form.hh_productive || "0"}</td>
          </tr>
          <tr>
            <td style={tableCellSx}>CALENDARIO DE TRABAJO</td>
            <td style={{ ...valueCellSx, textAlign: "center" }} colSpan={3}>{form.work_calendar || "-"}</td>
            <td style={{ ...tableCellSx, textAlign: "center" }}>COND. CLIMATICA</td>
            <td style={{ ...valueCellSx, textAlign: "center" }} colSpan={3}>{form.weather_label || "-"}</td>
          </tr>
        </tbody>
      </table>
    </Box>
  )
}

function HeaderEditorFirstRows({
  form,
  onChange,
  calendarOptions,
  reportDateOptions = [],
  reportDateNavigationOptions = [],
  disableReportDateEdit = false
}: {
  form: DailyForm
  onChange: (key: keyof DailyForm, value: any) => void
  calendarOptions: string[]
  reportDateOptions?: string[]
  reportDateNavigationOptions?: string[]
  disableReportDateEdit?: boolean
}) {
  const logoCell = (side: "client" | "contractor") => {
    const url = side === "client" ? form.client_logo_url : form.contractor_logo_url
    const key: keyof DailyForm = side === "client" ? "client_logo_url" : "contractor_logo_url"
    const fallback = side === "client" ? "Logo cliente" : "Logo empresa"
    return (
      <Box sx={{ display: "grid", gap: 0.7, py: 0.4 }}>
        <Box sx={{ width: "100%", height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={fallback} style={{ maxHeight: 34, maxWidth: 180, objectFit: "contain" }} />
          ) : (
            <Typography sx={{ fontSize: 11, color: "#666" }}>{fallback}</Typography>
          )}
        </Box>
        <TextField
          size="small"
          value={url}
          onChange={(e) => onChange(key, e.target.value)}
          placeholder="URL logo"
          fullWidth
        />
      </Box>
    )
  }

  const selectedWeather = parseWeatherLabels(form.weather_label)
  const toggleWeather = (label: string) => {
    const next = new Set(selectedWeather)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    onChange("weather_label", Array.from(next).join(", "))
  }

  return (
    <Box sx={{ overflowX: "auto", border: "1px solid #111", borderBottom: 0, mb: 0 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 960 }}>
        <tbody>
          <tr>
            <td style={{ ...tableCellSx, width: 260 }}>{logoCell("client")}</td>
            <td style={{ ...tableCellSx, textAlign: "center", fontWeight: 700, fontSize: 18 }}>
              INFORME DIARIO DE CONTRATISTAS
            </td>
            <td style={{ ...tableCellSx, width: 260 }}>{logoCell("contractor")}</td>
          </tr>
          <tr>
            <td style={tableCellSx}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 90 }}>REPORTE N°</Typography>
                <TextField
                  size="small"
                  value={form.report_no}
                  onChange={(e) => onChange("report_no", e.target.value)}
                  sx={{ maxWidth: 130 }}
                />
              </Box>
            </td>
            <td style={tableCellSx}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Rev.</Typography>
                <TextField
                  size="small"
                  value={form.revision}
                  onChange={(e) => onChange("revision", e.target.value)}
                  sx={{ maxWidth: 90 }}
                />
              </Box>
            </td>
            <td style={tableCellSx}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 52 }}>Fecha:</Typography>
                <ReportDateCalendarSelector
                  value={form.report_date}
                  options={reportDateOptions}
                  navigationOptions={reportDateNavigationOptions}
                  disabled={disableReportDateEdit}
                  onChange={(next) => onChange("report_date", next)}
                />
              </Box>
            </td>
          </tr>
          <tr>
            <td style={tableCellSx} colSpan={3}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 110 }}>CONTRATISTA</Typography>
                  <TextField
                    size="small"
                    value={form.contractor_name}
                    onChange={(e) => onChange("contractor_name", e.target.value)}
                    inputProps={{ list: "dl-contractor" }}
                    fullWidth
                  />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 70 }}>CLIENTE</Typography>
                  <TextField
                    size="small"
                    value={form.client_name}
                    onChange={(e) => onChange("client_name", e.target.value)}
                    inputProps={{ list: "dl-client" }}
                    fullWidth
                  />
                </Box>
              </Box>
            </td>
          </tr>
          <tr>
            <td style={tableCellSx} colSpan={3}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 90 }}>CONTRATO</Typography>
                  <TextField
                    size="small"
                    value={form.contract_title}
                    onChange={(e) => onChange("contract_title", e.target.value)}
                    inputProps={{ list: "dl-contract-title" }}
                    fullWidth
                  />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 90 }}>PROYECTO</Typography>
                  <TextField
                    size="small"
                    value={form.project_name}
                    onChange={(e) => onChange("project_name", e.target.value)}
                    inputProps={{ list: "dl-project" }}
                    fullWidth
                  />
                </Box>
              </Box>
            </td>
          </tr>
          <tr>
            <td style={tableCellSx} colSpan={3}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1.2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 120 }}>N° DE CONTRATO</Typography>
                  <TextField
                    size="small"
                    value={form.contract_number}
                    onChange={(e) => onChange("contract_number", e.target.value)}
                    inputProps={{ list: "dl-contract-number" }}
                    fullWidth
                  />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 62 }}>HH DIA</Typography>
                  <TextField
                    size="small"
                    value={form.hh_day}
                    onChange={(e) => onChange("hh_day", e.target.value)}
                    fullWidth
                  />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 120 }}>HH PRODUCTIVAS</Typography>
                  <TextField
                    size="small"
                    value={form.hh_productive}
                    onChange={(e) => onChange("hh_productive", e.target.value)}
                    fullWidth
                  />
                </Box>
              </Box>
            </td>
          </tr>
          <tr>
            <td style={tableCellSx} colSpan={3}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 170 }}>CALENDARIO DE TRABAJO</Typography>
                  <TextField
                    size="small"
                    value={form.work_calendar}
                    onChange={(e) => onChange("work_calendar", e.target.value)}
                    inputProps={{ list: "dl-calendar" }}
                    fullWidth
                  />
                  <datalist id="dl-calendar">{calendarOptions.map((v) => <option key={v} value={v} />)}</datalist>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 170 }}>CONDICION CLIMATICA</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, flexWrap: "wrap" }}>
                    {WEATHER_OPTIONS.map(({ label, Icon }) => {
                      const active = selectedWeather.has(label)
                      return (
                        <Button
                          key={label}
                          size="small"
                          variant={active ? "contained" : "outlined"}
                          onClick={() => toggleWeather(label)}
                          sx={{ minWidth: 42, px: 1 }}
                          title={label}
                        >
                          <Icon size={16} />
                        </Button>
                      )
                    })}
                  </Box>
                </Box>
              </Box>
            </td>
          </tr>
        </tbody>
      </table>
    </Box>
  )
}

function HeaderEditorV2({
  form,
  onChange,
  personalSummaryDisplay,
  readOnly = false,
  reportDateOptions = [],
  reportDateNavigationOptions = [],
  disableReportDateEdit = false
}: {
  form: DailyForm
  onChange: (key: keyof DailyForm, value: any) => void
  personalSummaryDisplay?: {
    indirectDot: string
    indirectHh: string
    directDot: string
    directHh: string
    totalDot: string
    totalHh: string
  }
  readOnly?: boolean
  reportDateOptions?: string[]
  reportDateNavigationOptions?: string[]
  disableReportDateEdit?: boolean
}) {
  const centeredInputProps = { style: { textAlign: "center" as const } }
  const WEATHER_V2 = [
    { key: "Sol", Icon: Sun },
    { key: "Nieve", Icon: Snowflake },
    { key: "Lluvia", Icon: CloudRain },
    { key: "Tiempo Frío", Icon: Cloud },
    { key: "Viento", Icon: Wind }
  ] as const
  const selected = new Set(
    String(form.weather_v2 || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  )
  const toggleWeather = (label: string) => {
    if (readOnly) return
    const next = new Set(selected)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    onChange("weather_v2", Array.from(next).join(", "))
  }
  const staticValue = (value: unknown) => (
    <Box
      sx={{
        minHeight: 36,
        display: "flex",
        alignItems: "center",
        px: 1.4,
        py: 0.5,
        fontSize: 16,
        lineHeight: 1.25,
        color: "#1f2937",
        whiteSpace: "normal",
        wordBreak: "break-word"
      }}
    >
      {String(value || "-")}
    </Box>
  )
  const summaryDisplay = personalSummaryDisplay ?? {
    indirectDot: form.summary_indirect_dotation || "0",
    indirectHh: form.summary_indirect_hh || "0",
    directDot: form.summary_direct_dotation || "0",
    directHh: form.summary_direct_hh || "0",
    totalDot: form.summary_total_dotation || "0",
    totalHh: form.summary_total_hh || "0"
  }

  return (
    <Box sx={{ border: "1px solid #111", mt: 0.5 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: V2_LAYOUT_MIN_WIDTH }}>
        <tbody>
          <tr>
            <td style={{ ...tableCellSx, border: 0, padding: "4px 6px" }} colSpan={10}>
              <Box sx={{ textAlign: "center", color: "#1e3a8a", fontWeight: 800 }}>
                <Typography sx={{ fontSize: 24, lineHeight: 1.1, fontWeight: 800 }}>{`DAILY REPORT N°${form.report_no || "000"}`}</Typography>
                <Typography sx={{ fontSize: 20, lineHeight: 1.1, fontWeight: 800 }}>{form.report_format_code || "ANT-GPRO-FOR-CANALETAS"}</Typography>
                <Typography sx={{ fontSize: 16, lineHeight: 1.1, fontWeight: 800 }}>{`REV ${form.revision || "0"}      ${formatDateV2(form.report_date)}`}</Typography>
              </Box>
            </td>
          </tr>
          <tr>
            <td style={valueCellSx} colSpan={10}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
                  gap: 1.2,
                  alignItems: "stretch"
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gap: 0.5,
                    p: 1,
                    border: "1px solid #cbd5e1",
                    borderRadius: 1.2,
                    bgcolor: "#f8fafc"
                  }}
                >
                  <Typography sx={{ fontSize: 11, fontWeight: 700, textAlign: "center", color: "#334155" }}>Informe N°</Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={form.report_no}
                    disabled={readOnly}
                    onChange={(e) => onChange("report_no", e.target.value)}
                    sx={{
                      "& .MuiInputBase-input": {
                        textAlign: "center",
                        fontSize: 24,
                        fontWeight: 700,
                        lineHeight: 1.1,
                        py: 0.7
                      }
                    }}
                  />
                </Box>
                <Box
                  sx={{
                    display: "grid",
                    gap: 0.5,
                    p: 1,
                    border: "1px solid #cbd5e1",
                    borderRadius: 1.2,
                    bgcolor: "#f8fafc"
                  }}
                >
                  <Typography sx={{ fontSize: 11, fontWeight: 700, textAlign: "center", color: "#334155" }}>Rev</Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={form.revision}
                    disabled={readOnly}
                    onChange={(e) => onChange("revision", e.target.value)}
                    sx={{
                      "& .MuiInputBase-input": {
                        textAlign: "center",
                        fontSize: 24,
                        fontWeight: 700,
                        lineHeight: 1.1,
                        py: 0.7
                      }
                    }}
                  />
                </Box>
                <Box
                  sx={{
                    display: "grid",
                    gap: 0.5,
                    p: 1,
                    border: "1px solid #bfdbfe",
                    borderRadius: 1.2,
                    bgcolor: "#eff6ff"
                  }}
                >
                  <Typography sx={{ fontSize: 11, fontWeight: 700, textAlign: "center", color: "#1e3a8a" }}>Fecha asistencia</Typography>
                  <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
                    <ReportDateCalendarSelector
                      value={form.report_date}
                      options={reportDateOptions}
                      navigationOptions={reportDateNavigationOptions}
                      disabled={readOnly || disableReportDateEdit}
                      onChange={(next) => onChange("report_date", next)}
                    />
                  </Box>
                </Box>
              </Box>
            </td>
          </tr>
          <tr>
            <td style={{ ...laborBlueBandSx, textAlign: "left" }} colSpan={10}>1.- INFORMACIÓN GENERAL</td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx} colSpan={2}>Nombre del Contrato</td>
            <td style={valueCellSx} colSpan={4}>{staticValue(form.contract_title)}</td>
            <td style={laborHeaderCellSx} colSpan={4}>CUENTA PROYECTO</td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx} colSpan={2}>Nombre Empresa</td>
            <td style={valueCellSx} colSpan={4}>{staticValue(form.contractor_name)}</td>
            <td style={valueCellSx} colSpan={4} rowSpan={3}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 1, py: 1.2 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, gridColumn: "1 / -1", textAlign: "center", color: "#1e3a8a", mb: 1 }}>Condiciones Climáticas</Typography>
                {WEATHER_V2.map(({ key: label, Icon }) => {
                  const active = selected.has(label)
                  return (
                  <Box key={label} sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 0.55 }}>
                    <Button
                      size="small"
                      variant={active ? "contained" : "outlined"}
                      onClick={() => toggleWeather(label)}
                      disabled={readOnly}
                      sx={{
                        minWidth: 46,
                        width: 46,
                        height: 46,
                        p: 0,
                        borderRadius: 1.5
                      }}
                      title={label}
                    >
                      <Icon size={26} />
                    </Button>
                    <Typography sx={{ fontSize: 13, textAlign: "center", lineHeight: 1.1 }}>{label}</Typography>
                  </Box>
                )})}
              </Box>
            </td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx} colSpan={2}>N° Contrato</td>
            <td style={valueCellSx} colSpan={4}>{staticValue(form.contract_number)}</td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx} colSpan={2}>Responsable de Terreno</td>
            <td style={valueCellSx} colSpan={4}>{staticValue(form.site_responsible)}</td>
          </tr>

          <tr>
            <td style={{ ...laborBlueBandSx, textAlign: "left" }} colSpan={10}>2.- RESUMEN DE PERSONAL Y EQUIPOS</td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx} colSpan={6}>RESUMEN PERSONAL</td>
            <td style={laborHeaderCellSx} colSpan={4}>RESUMEN EQUIPOS Y VEHÍCULOS</td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx} colSpan={2}>Tipo</td>
            <td style={laborHeaderCellSx} colSpan={2}>Dotación</td>
            <td style={laborHeaderCellSx} colSpan={2}>HH</td>
            <td style={laborHeaderCellSx}>Tipo</td>
            <td style={laborHeaderCellSx}>Total</td>
            <td style={laborHeaderCellSx} colSpan={2}>HM</td>
          </tr>
          <tr>
            <td style={valueCellSx} colSpan={2}>INDIRECTO</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{summaryDisplay.indirectDot}</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{summaryDisplay.indirectHh}</td>
            <td style={valueCellSx}>MAYORES</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }}>{oneDecimalFormValue(form.equip_major_qty)}</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{form.equip_major_hm || "0"}</td>
          </tr>
          <tr>
            <td style={valueCellSx} colSpan={2}>DIRECTO</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{summaryDisplay.directDot}</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{summaryDisplay.directHh}</td>
            <td style={valueCellSx}>MENORES Y MOV.</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }}>{oneDecimalFormValue(form.equip_minor_qty)}</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{form.equip_minor_hm || "0"}</td>
          </tr>
          <tr>
            <td style={valueCellSx} colSpan={2}></td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{summaryDisplay.totalDot}</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{summaryDisplay.totalHh}</td>
            <td style={valueCellSx}></td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }}>{oneDecimalFormValue(form.equip_total_qty)}</td>
            <td style={{ ...valueCellSx, textAlign: "center", fontWeight: 700 }} colSpan={2}>{form.equip_total_hm || "0"}</td>
          </tr>
        </tbody>
      </table>
    </Box>
  )
}

function DetailPersonnelEquipmentV2({
  form,
  onChange,
  onComputedVisibleTotals,
  onComputedVisibleRows,
  onSyncOppositeFrontOverrides,
  indirectAttendanceRows,
  indirectOverrideFrontDotByPosition,
  directAttendanceRows,
  frontRoleDotation,
  mantencionFrontCounts,
  operatorFrontDotationByPosition,
  indirectManualSpecialFrontByPosition,
  supervisorFrontDotationByPosition,
  directFrontDotationByPosition,
  directIfaDotationByPosition,
  directNocDotationByPosition,
  directIfaDotationByPositionName,
  totalDirectFrontDotation,
  collaboratorsForTooltip = [],
  dailyStatusRowsForTooltip = [],
  hasNocFrontColumn = false,
  nocFrontColumnLabel,
  fieldReportsForDate = [],
  reportFrontNames = [],
  reportFrontTypesByName = {},
  nocFrontAssignment,
  getFrontCounterpartInfo,
  prevencionistaFrontDistribution = {
    totalTurno: 0,
    reportCounts: { canaletas: 0, piscinas: 0, nocCanaletas: 0, nocPiscinas: 0 },
    allocated: { canaletas: 0, piscinas: 0, nocCanaletas: 0, nocPiscinas: 0 }
  },
  usePersistedSnapshotValues = true,
  preferPersistedDynamicColumns = false,
  preferPersistedSnapshotData = false,
  readOnly = false
}: {
  form: DailyForm
  onChange: (key: keyof DailyForm, value: any) => void
  onSyncOppositeFrontOverrides?: (
    targetFront: "CANALETAS" | "PISCINAS",
    patch: Pick<Partial<DailyForm>, "v2_front_distribution_overrides" | "v2_equipment_front_distribution_overrides">
  ) => void
  onComputedVisibleTotals?: (totals: {
    indirectDot: number
    indirectHh: number
    directDot: number
    directHh: number
    totalDot: number
    totalHh: number
  }) => void
  onComputedVisibleRows?: (rows: {
    indirect: Array<any>
    direct: Array<any>
    majorEquipment: Array<any>
    minorEquipment: Array<any>
  }) => void
  indirectAttendanceRows: Array<{
    position: string
    hhTurnoDia: number
    contratados: number
    contratacionProceso: number
    apoyoOficina: number
    descansoCambioTurno: number
    permisoCovid: number
    renunciaVoluntaria: number
    terminoContrato: number
    enCurso3d: number
    capacitacionAcreditacion: number
    teletrabajo: number
    pruebaPractica: number
    ofertaComercial: number
    instalacionFaena?: number
    frente?: number
    dotacionTotalObra: number
    hhTotalObra: number
    __persistedDailySnapshot?: boolean
  }>
  indirectOverrideFrontDotByPosition?: Record<string, number>
  directAttendanceRows: Array<{
    discipline?: string
    specialty: string
    position: string
    hhTurnoDia: number
    contratados: number
    contratacionProceso: number
    apoyoOficina: number
    descansoCambioTurno: number
    permisoCovid: number
    renunciaVoluntaria: number
    terminoContrato: number
    enCurso3d: number
    capacitacionAcreditacion: number
    teletrabajo: number
    pruebaPractica: number
    ofertaComercial: number
    instalacionFaena?: number
    frente?: number
    dotacionTotalObra: number
    hhTotalObra: number
    __persistedDailySnapshot?: boolean
  }>
  frontRoleDotation?: {
    canaletas: Record<string, number>
    piscinas: Record<string, number>
    noc: Record<string, number>
  }
  mantencionFrontCounts?: {
    canaletas: Record<string, number>
    piscinas: Record<string, number>
    nocCanaletas?: Record<string, number>
    nocPiscinas?: Record<string, number>
    ifa: Record<string, number>
    excluded: Record<string, number>
  }
  operatorFrontDotationByPosition?: Record<string, {
    canaletas: number
    piscinas: number
    nocCanaletas: number
    nocPiscinas: number
    ifa: number
  }>
  indirectManualSpecialFrontByPosition?: Record<string, { canaletas: number; piscinas: number }>
  supervisorFrontDotationByPosition?: Record<string, { canaletas: number; piscinas: number; ifa: number; noc: number; nocCanaletas?: number; nocPiscinas?: number }>
  directFrontDotationByPosition?: Record<string, number>
  directIfaDotationByPosition?: Record<string, number>
  directNocDotationByPosition?: Record<string, number>
  directIfaDotationByPositionName?: Record<string, number>
  totalDirectFrontDotation?: number
  collaboratorsForTooltip?: CollaboratorLite[]
  dailyStatusRowsForTooltip?: DailyStatusLite[]
  hasNocFrontColumn?: boolean
  nocFrontColumnLabel?: string
  fieldReportsForDate?: any[]
  reportFrontNames?: string[]
  reportFrontTypesByName?: Record<string, string>
  nocFrontAssignment?: any
  getFrontCounterpartInfo?: (row: any, section: "indirect" | "direct") => {
    currentFront: "CANALETAS" | "PISCINAS"
    counterpartFront: "CANALETAS" | "PISCINAS"
    values: number[]
  } | null
  prevencionistaFrontDistribution?: {
    totalTurno: number
    reportCounts: { canaletas: number; piscinas: number; nocCanaletas: number; nocPiscinas: number }
    allocated: { canaletas: number; piscinas: number; nocCanaletas: number; nocPiscinas: number }
  }
  usePersistedSnapshotValues?: boolean
  preferPersistedDynamicColumns?: boolean
  preferPersistedSnapshotData?: boolean
  readOnly?: boolean
}) {
  const [managementEquipmentRows, setManagementEquipmentRows] = useState<ManagementEquipmentSnapshotRow[]>([])
  const [hasEquipmentSnapshotForDate, setHasEquipmentSnapshotForDate] = useState(true)
  const [equipmentSnapshotResolvedDate, setEquipmentSnapshotResolvedDate] = useState<string>("")
  const [frontDistributionDrafts, setFrontDistributionDrafts] = useState<Record<string, string>>({})
  const [equipmentFrontDrafts, setEquipmentFrontDrafts] = useState<Record<string, string>>({})
  const personWorkdayHours = resolvePersonWorkdayHours(form)
  const machineWorkdayHours = resolveMachineWorkdayHours(form)
  const halfDayHours = resolveHalfDayHours(form)
  const normalizePersonDotationUnit = (value: number) => {
    const nearestUnit = Math.round(value)
    if (nearestUnit > 0 && Math.abs(value - nearestUnit) <= 0.015) return nearestUnit
    return value
  }
  const personDotationFromHours = (hours: unknown, source?: any) =>
    normalizePersonDotationUnit(
      resolvePersonDotationFromHours(hours, hasExplicitWorkdayMetadata(source) ? source : form)
    )
  const centeredInputProps = { style: { textAlign: "center" as const } }
  const personalColumns = [
    "HH TURNO/DÍA",
    "CONTRATADOS",
    "CONTRATACIÓN EN PROCESO",
    "APOYO/OFICINA CENTRAL",
    "DESCANSO / CAMBIO DE TURNO",
    "FALLA-LIC./VAC. / PERMISO/COVID 19",
    "RENUNCIA VOLUNTARIA",
    "TÉRMINO CONTRATO",
    "EN CURSO 3D",
    "CAPACITACIÓN / ACREDITACIÓN",
    "TELETRABAJO",
    "PRUEBA PRÁCTICA",
    "OFERTA COMERCIAL"
  ]
  const mainFrontLabel = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
  const normalizeDynamicReportFrontLabel = (value: any) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim()
  const excludedDynamicReportFrontLabels = new Set([
    "INSTALACION FAENA",
    "PISCINAS",
    "CANALETAS",
    "CONTRATO BASE PISCINAS",
    "CONTRATO BASE CANALETAS"
  ])
  const stripDynamicReportCrewPrefix = (value: any) =>
    String(value || "")
      .replace(/^\s*CUADRILLA\s+\d+\s+/i, "")
      .replace(/\s+/g, " ")
      .trim()
  const reportFrontLabelByNormalized = useMemo(() => {
    const out = new Map<string, string>()
    ;(reportFrontNames || []).forEach((name: any) => {
      const label = String(name || "").replace(/\s+/g, " ").trim()
      const key = normalizeDynamicReportFrontLabel(label)
      if (!label || !key || excludedDynamicReportFrontLabels.has(key)) return
      if (!out.has(key)) out.set(key, label)
    })
    return out
  }, [reportFrontNames])
  const getDynamicReportNocKeys = (value: any) =>
    Array.from(
      normalizeDynamicReportFrontLabel(value).matchAll(/NOC\s+N?[º°]?\s*0*(\d+)/g)
    )
      .map((match) => match[1])
      .filter(Boolean)
      .map((num) => num.replace(/^0+/, "") || "0")
  const resolveKnownDynamicReportFrontLabel = (value: any) => {
    const label = String(value || "").replace(/\s+/g, " ").trim()
    const key = normalizeDynamicReportFrontLabel(label)
    if (!label || !key || excludedDynamicReportFrontLabels.has(key)) return ""
    const exact = reportFrontLabelByNormalized.get(key)
    if (exact) return exact
    const nocs = getDynamicReportNocKeys(label)
    if (!nocs.length) return ""
    const matches = (reportFrontNames || [])
      .map((name: any) => String(name || "").replace(/\s+/g, " ").trim())
      .filter((name: string) => {
        if (!name || excludedDynamicReportFrontLabels.has(normalizeDynamicReportFrontLabel(name))) return false
        const nameNocs = getDynamicReportNocKeys(name)
        return nocs.some((noc) => nameNocs.includes(noc))
      })
    return matches.length === 1 ? matches[0] : ""
  }
  const parseDynamicReportFrontArray = (value: any): any[] => {
    if (Array.isArray(value)) return value
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed
        if (parsed && typeof parsed === "object") return Object.values(parsed)
      } catch {}
    }
    if (value && typeof value === "object") return Object.values(value)
    return []
  }
  const sourceFieldReportIdsForDetail = useMemo(() => {
    const ids = Array.isArray((form as any)?.source_field_report_ids)
      ? (form as any).source_field_report_ids.map((id: any) => String(id || "").trim()).filter(Boolean)
      : []
    return new Set(ids)
  }, [form.source_field_report_ids])
  const fieldReportsForDetail = useMemo(() => {
    if (!sourceFieldReportIdsForDetail.size) return []
    return (fieldReportsForDate || []).filter((report: any) => sourceFieldReportIdsForDetail.has(String(report?.id || "").trim()))
  }, [fieldReportsForDate, sourceFieldReportIdsForDetail])
  const fieldReportsForDynamicColumns = useMemo(() => {
    return Array.isArray(fieldReportsForDate) ? fieldReportsForDate : []
  }, [fieldReportsForDate])
  const persistedDynamicFrontColumns = useMemo(() => {
    const notes: any = (form as any)?.notes && typeof (form as any).notes === "object" ? (form as any).notes : {}
    const formSnap: any = (form as any)?.v2_form_snapshot && typeof (form as any).v2_form_snapshot === "object" ? (form as any).v2_form_snapshot : {}
    const runtime: any = (form as any)?.v2_runtime_snapshot && typeof (form as any).v2_runtime_snapshot === "object" ? (form as any).v2_runtime_snapshot : {}
    return parseDynamicFrontColumns(
      (form as any)?.v2_dynamic_front_columns ??
      runtime?.v2_dynamic_front_columns ??
      formSnap?.v2_dynamic_front_columns ??
      notes?.v2_dynamic_front_columns
    )
  }, [form])
  const persistedDynamicFrontColumnsByBlock = useMemo(() => {
    const notes: any = (form as any)?.notes && typeof (form as any).notes === "object" ? (form as any).notes : {}
    const formSnap: any = (form as any)?.v2_form_snapshot && typeof (form as any).v2_form_snapshot === "object" ? (form as any).v2_form_snapshot : {}
    const runtime: any = (form as any)?.v2_runtime_snapshot && typeof (form as any).v2_runtime_snapshot === "object" ? (form as any).v2_runtime_snapshot : {}
    return parseDynamicFrontColumnsByBlock(
      (form as any)?.v2_dynamic_front_columns_by_block ??
      runtime?.v2_dynamic_front_columns_by_block ??
      formSnap?.v2_dynamic_front_columns_by_block ??
      notes?.v2_dynamic_front_columns_by_block
    )
  }, [form])
  const dynamicFrontColumns = useMemo(() => {
    const activeFront = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
    const persistedColumnsByBlock = persistedDynamicFrontColumnsByBlock || (
      persistedDynamicFrontColumns.length > 0 ? splitDynamicFrontColumnsByBlock(persistedDynamicFrontColumns) : null
    )
    const shouldPreferPersistedSnapshotData = Boolean(preferPersistedSnapshotData || (readOnly && usePersistedSnapshotValues))
    const shouldUsePersistedColumns = Boolean((preferPersistedDynamicColumns || shouldPreferPersistedSnapshotData) && persistedColumnsByBlock)
    const liveColumns = shouldUsePersistedColumns
      ? []
      : collectDynamicFrontColumns(fieldReportsForDynamicColumns || [], reportFrontNames || [])
    const columnsByBlock = shouldUsePersistedColumns
      ? persistedColumnsByBlock!
      : (liveColumns.length > 0
        ? splitDynamicFrontColumnsByBlock(liveColumns)
        : persistedColumnsByBlock || splitDynamicFrontColumnsByBlock(persistedDynamicFrontColumns))
    return columnsByBlock[activeFront] || []
  }, [fieldReportsForDynamicColumns, form.work_front, persistedDynamicFrontColumns, persistedDynamicFrontColumnsByBlock, preferPersistedDynamicColumns, preferPersistedSnapshotData, readOnly, reportFrontNames, usePersistedSnapshotValues])
  const allDynamicFrontColumns = useMemo(() => {
    const persistedColumnsByBlock = persistedDynamicFrontColumnsByBlock || (
      persistedDynamicFrontColumns.length > 0 ? splitDynamicFrontColumnsByBlock(persistedDynamicFrontColumns) : null
    )
    const shouldPreferPersistedSnapshotData = Boolean(preferPersistedSnapshotData || (readOnly && usePersistedSnapshotValues))
    const shouldUsePersistedColumns = Boolean((preferPersistedDynamicColumns || shouldPreferPersistedSnapshotData) && persistedColumnsByBlock)
    if (shouldUsePersistedColumns) {
      return [
        ...(persistedColumnsByBlock!.CANALETAS || []),
        ...(persistedColumnsByBlock!.PISCINAS || [])
      ]
    }
    const liveColumns = collectDynamicFrontColumns(fieldReportsForDynamicColumns || [], reportFrontNames || [])
    if (liveColumns.length > 0) return liveColumns
    if (persistedDynamicFrontColumns.length > 0) return persistedDynamicFrontColumns
    if (persistedDynamicFrontColumnsByBlock) {
      return [
        ...(persistedDynamicFrontColumnsByBlock.CANALETAS || []),
        ...(persistedDynamicFrontColumnsByBlock.PISCINAS || [])
      ]
    }
    return []
  }, [fieldReportsForDynamicColumns, persistedDynamicFrontColumns, persistedDynamicFrontColumnsByBlock, preferPersistedDynamicColumns, preferPersistedSnapshotData, readOnly, reportFrontNames, usePersistedSnapshotValues])
  const dynamicFrontColumnLabels = dynamicFrontColumns.map((column) => column.label)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const activeFront = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
      console.debug("[daily-report][dynamic-front-columns]", {
        total: allDynamicFrontColumns.length,
        labels: allDynamicFrontColumns.map((column) => column.label),
        activeFront,
        activeBlockLabels: dynamicFrontColumns.map((column) => column.label),
        fieldReportsUsed: fieldReportsForDynamicColumns.length
      })
    }
  }, [allDynamicFrontColumns, dynamicFrontColumns, fieldReportsForDynamicColumns.length, form.work_front])
  const hasStructuredDynamicFrontColumns = allDynamicFrontColumns.length > 0
  const dynamicDotacionFrontLabels = dynamicFrontColumnLabels.length > 0
    ? dynamicFrontColumnLabels
    : (!hasStructuredDynamicFrontColumns && hasNocFrontColumn ? [String(nocFrontColumnLabel || "UDR NOC").trim() || "UDR NOC"] : [])
  const resolvedNocFrontColumnLabel = dynamicDotacionFrontLabels[0] || String(nocFrontColumnLabel || "UDR NOC").trim() || "UDR NOC"
  const dotacionFrenteColumns = [
    "INSTALACIÓN FAENA",
    mainFrontLabel,
    ...dynamicDotacionFrontLabels
  ]
  const equiposColumns = [
    "HM TURNO/DÍA",
    "TOTAL EQUIPOS",
    "OPERACIÓN",
    "DISPONIBLES",
    "ACREDITACIÓN/MANTENCIÓN",
    "PANNE",
    "OF. CENTRAL / FUERA DE OBRA / ETC"
  ]
  const maquinariaFrenteColumns = [
    "INSTALACIÓN FAENA",
    mainFrontLabel,
    ...dynamicDotacionFrontLabels
  ]
  const isUdrDynamicColumn = (label: string) => {
    const normalized = String(label || "").toUpperCase()
    const catalogType = reportFrontTypesByName[normalizeDynamicFrontKey(label)]
    return (
      String(catalogType || "").trim().toLowerCase() === "udr" ||
      normalized.includes("UDR") ||
      normalized.includes("USO DE RECURSOS") ||
      normalized.includes("NOC N") ||
      /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(normalized)
    )
  }
  const nocDotacionIndexes = dotacionFrenteColumns
    .map((label, idx) => (isUdrDynamicColumn(label) ? idx : -1))
    .filter((idx) => idx >= 0)
  const nocMaquinariaIndexes = maquinariaFrenteColumns
    .map((label, idx) => (isUdrDynamicColumn(label) ? idx : -1))
    .filter((idx) => idx >= 0)
  // TEMP: tooltip disabled for performance diagnostics
  const frontCellTooltipDisabled = true
  const udrHeaderBg = "#fb923c"
  const nocSoftCellBg = "#fff3e6"
  const leftSectionCols = personalColumns.length + dotacionFrenteColumns.length + 3
  const rightSectionCols = equiposColumns.length + maquinariaFrenteColumns.length + 3
  const strictSnapshotView = Boolean(preferPersistedSnapshotData || (readOnly && usePersistedSnapshotValues))

  useEffect(() => {
    if (strictSnapshotView) {
      setManagementEquipmentRows([])
      setHasEquipmentSnapshotForDate(true)
      setEquipmentSnapshotResolvedDate("")
      return
    }
    let mounted = true
    const reportDate = String(form.report_date || "").slice(0, 10)
    const rawLockedSnapshotDate = String((form as any)?.equipment_snapshot_date || "").slice(0, 10)
    const lockedSnapshotDate = rawLockedSnapshotDate && reportDate && compareYmd(rawLockedSnapshotDate, reportDate) > 0
      ? ""
      : rawLockedSnapshotDate
    const snapshotDate = String(lockedSnapshotDate || reportDate || "").slice(0, 10)
    if (!snapshotDate) {
      setManagementEquipmentRows([])
      setHasEquipmentSnapshotForDate(false)
      return
    }
    const loadManagementEquipment = async () => {
      try {
        const fallbackParam = lockedSnapshotDate ? "" : "&fallback=on_or_before"
        const response = await fetch(`/api/management/equipment?date=${encodeURIComponent(snapshotDate)}${fallbackParam}`, { cache: "no-store" })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`)
        if (!mounted) return
        const availableDates = Array.isArray(payload?.available_dates)
          ? payload.available_dates.map((d: any) => String(d || "").slice(0, 10)).filter(Boolean)
          : []
        const resolvedDate = String(payload?.snapshot_date || "").slice(0, 10)
        setEquipmentSnapshotResolvedDate(resolvedDate)
        if (!lockedSnapshotDate && resolvedDate) {
          onChange("equipment_snapshot_date", resolvedDate)
        }
        const rows = Array.isArray(payload?.rows) ? payload.rows : []
        setHasEquipmentSnapshotForDate(rows.length > 0)
        const normalizedRows: ManagementEquipmentSnapshotRow[] = rows.map((row: any) => ({
          id: row?.id,
          report_date: String(row?.report_date || resolvedDate || snapshotDate || ""),
          equipment_kind: String(row?.equipment_kind || "").toUpperCase() === "MENOR" ? "MENOR" : "MAYOR",
          equipment_name: String(row?.equipment_name || "").trim(),
          patent: String(row?.patent || "").trim() || null,
          quantity: row?.quantity === null || row?.quantity === undefined || String(row?.quantity).trim() === "" ? 1 : parseQty(row?.quantity || 1),
          canaletas_qty: row?.canaletas_qty === null || row?.canaletas_qty === undefined || String(row?.canaletas_qty).trim() === "" ? 0 : parseQty(row?.canaletas_qty || 0),
          piscinas_qty: row?.piscinas_qty === null || row?.piscinas_qty === undefined || String(row?.piscinas_qty).trim() === "" ? 0 : parseQty(row?.piscinas_qty || 0),
          is_operational: Boolean(row?.is_operational),
          in_maintenance: Boolean(row?.in_maintenance),
          in_accreditation: Boolean(row?.in_accreditation),
          in_breakdown: Boolean(row?.in_breakdown),
          include_in_daily_report: row?.include_in_daily_report !== false,
          entry_date: String(row?.entry_date || "").slice(0, 10) || null,
          return_date: String(row?.return_date || "").slice(0, 10) || null,
          mileage_km: row?.mileage_km === null || row?.mileage_km === undefined || String(row?.mileage_km).trim() === "" ? null : Number(row?.mileage_km || 0),
          notes: String(row?.notes || "").trim() || null,
        }))
        setManagementEquipmentRows(normalizedRows)
      } catch {
        if (!mounted) return
        setManagementEquipmentRows([])
        setHasEquipmentSnapshotForDate(false)
        setEquipmentSnapshotResolvedDate("")
      }
    }
    void loadManagementEquipment()
    return () => {
      mounted = false
    }
  }, [form.report_date, (form as any)?.equipment_snapshot_date, strictSnapshotView])

  const headVertical: React.CSSProperties = {
    ...laborHeaderCellSx,
    width: 34,
    minWidth: 34,
    maxWidth: 34,
    height: 210,
    padding: 0,
    position: "relative",
    overflow: "hidden",
    verticalAlign: "middle",
    textAlign: "center"
  }
  const compactVerticalHead: React.CSSProperties = {
    ...headVertical,
    width: 24,
    minWidth: 24,
    maxWidth: 24
  }
  const verticalHeadText: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%) rotate(-90deg)",
    transformOrigin: "center center",
    whiteSpace: "nowrap",
    lineHeight: 1,
    display: "inline-block"
  }

  const renderCellInput = (value: string, field?: keyof DailyForm) => {
    if (!field || readOnly) return <Typography sx={{ fontSize: 12, textAlign: "center" }}>{value || "-"}</Typography>
    return (
      <TextField
        size="small"
        fullWidth
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        inputProps={centeredInputProps}
      />
    )
  }

  const numericCell = (value: number) => {
    const n = Number(value || 0)
    if (!Number.isFinite(n) || n <= 0) return "0"
    const normalized = Number(n.toFixed(2))
    const hasDecimals = Math.abs(normalized % 1) > 0.0001
    return hasDecimals ? normalized.toFixed(2).replace(".", ",") : String(Math.round(normalized))
  }
  const oneDecimalCell = (value: number, blankIfZero = false) => {
    const n = Number(value || 0)
    if (!Number.isFinite(n) || n <= 0) return "-"
    const normalized = Number(n.toFixed(1))
    const hasDecimals = Math.abs(normalized % 1) > 0.0001
    return hasDecimals ? normalized.toFixed(1).replace(".", ",") : String(Math.round(normalized))
  }
  const decimalCellString = (value: number) => {
    return oneDecimalFormValue(value)
  }
  const totalIndirect = indirectAttendanceRows.reduce(
    (acc, row) => ({
      hhTurnoDia: Math.max(acc.hhTurnoDia, row.hhTurnoDia),
      contratados: acc.contratados + row.contratados,
      contratacionProceso: acc.contratacionProceso + row.contratacionProceso,
      apoyoOficina: acc.apoyoOficina + row.apoyoOficina,
      descansoCambioTurno: acc.descansoCambioTurno + row.descansoCambioTurno,
      permisoCovid: acc.permisoCovid + row.permisoCovid,
      renunciaVoluntaria: acc.renunciaVoluntaria + row.renunciaVoluntaria,
      terminoContrato: acc.terminoContrato + row.terminoContrato,
      enCurso3d: acc.enCurso3d + row.enCurso3d,
      capacitacionAcreditacion: acc.capacitacionAcreditacion + row.capacitacionAcreditacion,
      teletrabajo: acc.teletrabajo + row.teletrabajo,
      pruebaPractica: acc.pruebaPractica + row.pruebaPractica,
      ofertaComercial: acc.ofertaComercial + row.ofertaComercial,
      dotacionTotalObra: acc.dotacionTotalObra + row.dotacionTotalObra,
      hhTotalObra: acc.hhTotalObra + row.hhTotalObra
    }),
    {
      hhTurnoDia: 0,
      contratados: 0,
      contratacionProceso: 0,
      apoyoOficina: 0,
      descansoCambioTurno: 0,
      permisoCovid: 0,
      renunciaVoluntaria: 0,
      terminoContrato: 0,
      enCurso3d: 0,
      capacitacionAcreditacion: 0,
      teletrabajo: 0,
      pruebaPractica: 0,
      ofertaComercial: 0,
      dotacionTotalObra: 0,
      hhTotalObra: 0
    }
  )
  const matrixRows = indirectAttendanceRows.length > 0
    ? indirectAttendanceRows
    : [{
        position: "SIN PERSONAL INDIRECTO",
        hhTurnoDia: 0,
        contratados: 0,
        contratacionProceso: 0,
        apoyoOficina: 0,
        descansoCambioTurno: 0,
        permisoCovid: 0,
        renunciaVoluntaria: 0,
        terminoContrato: 0,
        enCurso3d: 0,
        capacitacionAcreditacion: 0,
        teletrabajo: 0,
        pruebaPractica: 0,
        ofertaComercial: 0,
        dotacionTotalObra: 0,
        hhTotalObra: 0
      }]
  const defaultMajorEquipmentRows: MajorEquipmentRow[] = [
    { name: "Retroexcavadora PDGV-54", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
    { name: "Grua Horquilla RKRL-48", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0, mainFront: form.work_front === "CANALETAS" ? 1 : 0 },
    { name: "Camion Pluma RGJD-42", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0, mainFront: form.work_front === "CANALETAS" ? 1 : 0 },
    { name: "Camion Aljibe HSDC-63", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
    { name: "Camion Tolva TSJH-64", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
    { name: "Cargador Frontal VTCZ-83", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
    { name: "Excavadora TRSV-73", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
    { name: "Camion 3/4 VFHR-70", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
    { name: "Tracto Pluma TVFX-62", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 }
  ]
  const fieldReportEquipmentFrontUsageByKey = useMemo(() => {
    type Usage = { canaletas: number; piscinas: number; nocCanaletas: number; nocPiscinas: number; dynamicByColumn: Record<string, number> }
    const normalizeForKey = (value: any) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const equipmentKey = (entry: any) => {
      const patent = normalizeForKey(entry?.code || entry?.patent)
        .replace(/[^A-Z0-9]/g, "")
      if (patent) return `pat:${patent}`
      const name = normalizeForKey(entry?.description || entry?.equipment_name || entry?.name)
        .replace(/\s+/g, " ")
      return name ? `name:${name}` : ""
    }
    const parseArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      }
      return []
    }
    const parseObject = (value: any): Record<string, any> => {
      if (!value) return {}
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      return typeof value === "object" && !Array.isArray(value) ? value : {}
    }
    const resolveBaseFront = (frontLike: any): "CANALETAS" | "PISCINAS" | null => {
      const txt = normalizeForKey(frontLike)
      if (!txt) return null
      if (txt === "CANALETAS" || txt.includes("CONTRATO BASE CANALETAS") || txt.includes("CANALET")) return "CANALETAS"
      if (txt === "PISCINAS" || txt.includes("CONTRATO BASE PISCINAS") || txt.includes("PISCIN")) return "PISCINAS"
      return null
    }
    const isNocFrontText = (value: any) => {
      const txt = normalizeForKey(value)
      return txt.includes("USO DE RECURSOS NOC") || txt.includes("UDR NOC") || /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(txt)
    }
    const columnBySourceReportId = new Map<string, DynamicFrontColumn>()
    ;(dynamicFrontColumns || []).forEach((column) => {
      ;(column.sourceReportIds || []).forEach((id) => {
        const reportId = String(id || "").trim()
        if (reportId) columnBySourceReportId.set(reportId, column)
      })
    })
    const addUsage = (key: string, front: string | null, share: number) => {
      if (!key || !front || !(share > 0)) return
      const current = usageByKey.get(key) || { canaletas: 0, piscinas: 0, nocCanaletas: 0, nocPiscinas: 0, dynamicByColumn: {} }
      if (front === "CANALETAS") current.canaletas += share
      if (front === "PISCINAS") current.piscinas += share
      if (front === "NOC_CANALETAS") current.nocCanaletas += share
      if (front === "NOC_PISCINAS") current.nocPiscinas += share
      if (front.startsWith("DYNAMIC::")) {
        const columnKey = front.slice("DYNAMIC::".length)
        if (columnKey) current.dynamicByColumn[columnKey] = Number((current.dynamicByColumn[columnKey] || 0) + share)
      }
      usageByKey.set(key, current)
    }
    const usageByKey = new Map<string, Usage>()
    ;(fieldReportsForDate || []).forEach((report: any) => {
      const reportPersonWorkdayHours = resolvePersonWorkdayHours(getFieldReportWorkdaySource(report))
      const reportId = String(report?.id || "").trim()
      const reportFrontRaw = String(report?.work_front || report?.front || report?.frente || "").trim()
      const dynamicColumn = reportId ? columnBySourceReportId.get(reportId) : null
      const reportBaseFront = resolveBaseFront(reportFrontRaw)
      const reportNocFront = nocFrontAssignment?.byReportId?.has(reportId) || isNocFrontText(reportFrontRaw) || isNocFrontText(report?.report_title)
        ? (nocFrontAssignment?.byReportId?.get(reportId) || "CANALETAS")
        : null
      const reportFallbackFront = reportNocFront
        ? (reportNocFront === "PISCINAS" ? "NOC_PISCINAS" : "NOC_CANALETAS")
        : reportBaseFront
      const entries = parseArray(report?.equipment_entries)
      entries.forEach((entry: any, idx: number) => {
        const key = equipmentKey(entry)
        if (!key) return
        const entryFrontRaw = String(
          entry?.area ||
          entry?.work_front ||
          entry?.front ||
          entry?.frente ||
          entry?.activity_front ||
          ""
        ).trim()
        const entryBaseFront = resolveBaseFront(entryFrontRaw)
        const entryNocFront = isNocFrontText(entryFrontRaw)
          ? (reportNocFront || nocFrontAssignment?.byReportId?.get(reportId) || "CANALETAS")
          : null
        const entryFallbackFront = entryNocFront
          ? (entryNocFront === "PISCINAS" ? "NOC_PISCINAS" : "NOC_CANALETAS")
          : (entryBaseFront || reportFallbackFront)
        addUsage(key, dynamicColumn ? `DYNAMIC::${dynamicColumn.key}` : entryFallbackFront, 1)
      })
    })
    return usageByKey
  }, [fieldReportsForDate, nocFrontAssignment, dynamicFrontColumns])

  const applyFieldReportEquipmentUsage = React.useCallback((params: {
    equipmentKey: string
    totalPhysical: number
    canaletasQty: number
    piscinasQty: number
  }) => {
    const totalPhysical = Math.max(0, Number(params.totalPhysical || 0))
    const declared = normalizeFrontSplit(params.canaletasQty, params.piscinasQty, totalPhysical)
    const usage = fieldReportEquipmentFrontUsageByKey.get(params.equipmentKey)
    let canaletas = Math.max(declared.frontA, Number(usage?.canaletas || 0))
    let piscinas = Math.max(declared.frontB, Number(usage?.piscinas || 0))
    let nocCanaletas = Number(usage?.nocCanaletas || 0)
    let nocPiscinas = Number(usage?.nocPiscinas || 0)
    const dynamicValues = (dynamicFrontColumns || []).map((column) => Number(usage?.dynamicByColumn?.[column.key] || 0))
    const dynamicTotal = dynamicValues.reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0)
    const usedTotal = canaletas + piscinas + nocCanaletas + nocPiscinas + dynamicTotal
    if (totalPhysical > 0 && usedTotal > totalPhysical) {
      const ratio = totalPhysical / usedTotal
      canaletas *= ratio
      piscinas *= ratio
      nocCanaletas *= ratio
      nocPiscinas *= ratio
      dynamicValues.forEach((value, idx) => {
        dynamicValues[idx] = value * ratio
      })
    }
    const scaledDynamicTotal = dynamicValues.reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0)
    const remainingIfa = Math.max(0, totalPhysical - canaletas - piscinas - nocCanaletas - nocPiscinas - scaledDynamicTotal)
    return {
      instalacionFaena: remainingIfa / 2,
      mainFront: form.work_front === "PISCINAS" ? piscinas : canaletas,
      nocFront: form.work_front === "PISCINAS" ? nocPiscinas : nocCanaletas,
      dynamicFrontValues: dynamicValues.map((value) => roundEquipmentFrontValue(value))
    }
  }, [fieldReportEquipmentFrontUsageByKey, form.work_front, dynamicFrontColumns])

  type EquipmentFrontSection = "major" | "minor"
  const parseEquipmentFrontOverrides = (value: any): Record<string, number[]> => {
    if (!value) return {}
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number[]> : {}
      } catch {
        return {}
      }
    }
    return typeof value === "object" && !Array.isArray(value) ? value as Record<string, number[]> : {}
  }
  const normalizeEquipmentOverrideKeyPart = (value: any) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim()
      .replace(/\s+/g, " ") || "-"
  const getEquipmentFrontOverrideRowKey = (row: any, section: EquipmentFrontSection) =>
    `${section}::${normalizeEquipmentOverrideKeyPart(row?.name || "SIN EQUIPO")}`
  const roundEquipmentFrontValue = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return 0
    return Number(value.toFixed(2))
  }
  const getEquipmentFrontLimit = (row: any, fallbackValues?: number[]) => {
    const totalEquipos = parseQty(row?.totalEquipos)
    if (totalEquipos > 0) return totalEquipos
    return (fallbackValues || []).reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0)
  }
  const getBaseEquipmentFrontValues = (row: any, section: EquipmentFrontSection) =>
    maquinariaFrenteColumns.map((_, idx) => {
      if (idx >= 2) {
        const dynamicValues = Array.isArray(row?.dynamicFrontValues) ? row.dynamicFrontValues : null
        if (dynamicValues && idx - 2 < dynamicValues.length) return Number(dynamicValues[idx - 2] || 0)
        return dynamicFrontColumnLabels.length <= 1 ? Number(row?.nocFront || 0) : 0
      }
      if (section === "major") {
        if (idx === 0) return Number(row?.instalacionFaena || 0)
        if (idx === 1) return Number(row?.mainFront || 0)
      }
      if (idx === 0) return Number(row?.front1 || row?.instalacionFaena || 0)
      if (idx === 1) return Number(row?.front2 || row?.mainFront || 0)
      return 0
    })
  const rebalanceEquipmentFrontValues = (values: number[], limit: number, changedIdx: number) => {
    const safe = maquinariaFrenteColumns.map((_, idx) => roundEquipmentFrontValue(Number(values[idx] || 0)))
    const safeLimit = roundEquipmentFrontValue(limit)
    if (safeLimit <= 0) return safe.map(() => 0)
    if (changedIdx >= 0 && changedIdx < safe.length) safe[changedIdx] = Math.min(safe[changedIdx], safeLimit)
    let overflow = roundEquipmentFrontValue(safe.reduce((acc, value) => acc + value, 0) - safeLimit)
    for (let idx = safe.length - 1; idx >= 0 && overflow > 0.0001; idx -= 1) {
      if (idx === changedIdx) continue
      const discount = Math.min(safe[idx], overflow)
      safe[idx] = roundEquipmentFrontValue(safe[idx] - discount)
      overflow = roundEquipmentFrontValue(overflow - discount)
    }
    if (overflow > 0.0001 && changedIdx >= 0 && changedIdx < safe.length) {
      safe[changedIdx] = roundEquipmentFrontValue(safe[changedIdx] - overflow)
    }
    return safe
  }
  const buildOppositeEquipmentFrontValues = (activeValues: number[], limit: number, changedIdx: number) => {
    const safeLimit = Math.max(0, roundEquipmentFrontValue(limit))
    const activeSum = activeValues.reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0)
    const remaining = roundEquipmentFrontValue(safeLimit - activeSum)
    const out = maquinariaFrenteColumns.map(() => 0)
    if (remaining <= 0) return out
    const targetIdx = changedIdx >= 0 && changedIdx < out.length ? changedIdx : 1
    out[targetIdx] = remaining
    return out
  }
  const equipmentFrontOverrides = parseEquipmentFrontOverrides((form as any).v2_equipment_front_distribution_overrides)
  const getVisibleEquipmentFrontValues = (row: any, section: EquipmentFrontSection) => {
    const baseValues = getBaseEquipmentFrontValues(row, section)
    const overrideValues = equipmentFrontOverrides[getEquipmentFrontOverrideRowKey(row, section)]
    if (!Array.isArray(overrideValues)) return baseValues
    return maquinariaFrenteColumns.map((_, idx) => roundEquipmentFrontValue(Number(overrideValues[idx] ?? baseValues[idx] ?? 0)))
  }
  const applyEquipmentFrontOverrideToRow = <T extends Record<string, any>>(row: T, section: EquipmentFrontSection): T => {
    const isBreakdown = Number(row?.panne || 0) > 0
    const values = isBreakdown
      ? maquinariaFrenteColumns.map(() => 0)
      : getVisibleEquipmentFrontValues(row, section)
    const total = values.reduce((acc, value) => acc + Number(value || 0), 0)
    const hmTotal = total * Number(row?.hmTurnoDia || 0)
    const dynamicFrontValues = values.slice(2)
    const nocFront = dynamicFrontValues.reduce((acc, value) => acc + Number(value || 0), 0)
    if (section === "major") {
      return {
        ...row,
        instalacionFaena: values[0] || 0,
        mainFront: values[1] || 0,
        nocFront,
        dynamicFrontValues,
        totalEqMaq: total,
        hmTotal
      }
    }
    return {
      ...row,
      front1: values[0] || 0,
      front2: values[1] || 0,
      nocFront,
      dynamicFrontValues,
      totalEqObra: total,
      hmTotal
    }
  }
  const handleEquipmentFrontChange = (row: any, section: EquipmentFrontSection, idx: number, rawValue: string) => {
    const baseValues = getBaseEquipmentFrontValues(row, section)
    const currentValues = getVisibleEquipmentFrontValues(row, section)
    currentValues[idx] = parseQty(rawValue)
    const limit = getEquipmentFrontLimit(row, baseValues)
    const nextValues = rebalanceEquipmentFrontValues(currentValues, limit, idx)
    const rowKey = getEquipmentFrontOverrideRowKey(row, section)
    onChange("v2_equipment_front_distribution_overrides", {
      ...equipmentFrontOverrides,
      [rowKey]: nextValues
    })
    const currentFront: "CANALETAS" | "PISCINAS" = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
    const oppositeFront: "CANALETAS" | "PISCINAS" = currentFront === "CANALETAS" ? "PISCINAS" : "CANALETAS"
    onSyncOppositeFrontOverrides?.(oppositeFront, {
      v2_equipment_front_distribution_overrides: {
        [rowKey]: buildOppositeEquipmentFrontValues(nextValues, limit, idx)
      }
    })
  }
  const renderEquipmentFrontValue = (row: any, section: EquipmentFrontSection, idx: number, value: number) => {
    if (readOnly) return oneDecimalCell(value)
    const draftKey = `${getEquipmentFrontOverrideRowKey(row, section)}::${idx}`
    const draftValue = Object.prototype.hasOwnProperty.call(equipmentFrontDrafts, draftKey)
      ? equipmentFrontDrafts[draftKey]
      : value > 0
        ? oneDecimalCell(value)
        : ""
    return (
      <TextField
        size="small"
        value={draftValue}
        onChange={(event) => {
          const nextRaw = event.target.value
          setEquipmentFrontDrafts((prev) => ({ ...prev, [draftKey]: nextRaw }))
          handleEquipmentFrontChange(row, section, idx, nextRaw)
        }}
        onBlur={() => {
          setEquipmentFrontDrafts((prev) => {
            const next = { ...prev }
            delete next[draftKey]
            return next
          })
        }}
        inputProps={{
          inputMode: "decimal",
          style: { textAlign: "center", padding: "2px 1px", fontSize: 12 }
        }}
        sx={{
          width: 44,
          "& .MuiInputBase-root": { height: 24, fontSize: 12, background: "rgba(255,255,255,0.72)" },
          "& .MuiInputBase-input": { textAlign: "center" }
        }}
      />
    )
  }

  const persistedMajorEquipmentRows: MajorEquipmentRow[] = (Array.isArray((form as any)?.v2_detail_major_equipment_rows)
    ? (form as any).v2_detail_major_equipment_rows
    : []
  ).map((row: any) => ({
    name: String(row?.name || "").trim(),
    hmTurnoDia: Number(row?.hmTurnoDia || 0),
    totalEquipos: Number(row?.totalEquipos || 0),
    operacion: Number(row?.operacion || 0),
    disponibles: Number(row?.disponibles || 0),
    acredMant: Number(row?.acredMant || 0),
    panne: Number(row?.panne || 0),
    ofCentral: Number(row?.ofCentral || 0),
    instalacionFaena: Number(row?.instalacionFaena || 0),
    mainFront: Number(row?.mainFront || 0),
    nocFront: Number(row?.nocFront || 0),
    dynamicFrontValues: Array.isArray(row?.dynamicFrontValues)
      ? row.dynamicFrontValues.map((value: any) => Number(value || 0))
      : [],
    totalEqMaq: Number(row?.totalEqMaq || 0),
    hmTotal: Number(row?.hmTotal || 0)
  }))
  const isReturnedEquipmentForReport = (row: ManagementEquipmentSnapshotRow) => {
    const returnDate = String(row.return_date || "").slice(0, 10)
    const reportDate = String(form.report_date || "").slice(0, 10)
    return Boolean(returnDate && (!reportDate || returnDate <= reportDate))
  }
  const isNotYetEnteredEquipmentForReport = (row: ManagementEquipmentSnapshotRow) => {
    const entryDate = String(row.entry_date || "").slice(0, 10)
    const reportDate = String(form.report_date || "").slice(0, 10)
    return Boolean(entryDate && reportDate && entryDate > reportDate)
  }
  const mappedMajorEquipmentRows: MajorEquipmentRow[] = managementEquipmentRows
    .filter((row) => row.equipment_kind === "MAYOR" && row.include_in_daily_report !== false && !isNotYetEnteredEquipmentForReport(row) && !isReturnedEquipmentForReport(row))
    .map((row) => {
      const hasMaintOrAccred = Boolean(row.in_maintenance) || Boolean(row.in_accreditation)
      const operacion = row.is_operational ? 1 : 0
      const panne = row.in_breakdown ? 1 : 0
      const disponibles = !operacion && !hasMaintOrAccred && !panne ? 1 : 0
      const declaredQuantity = Math.max(0, parseQty(row.quantity || 0))
      const canaletasQty = Math.max(0, parseQty(row.canaletas_qty || 0))
      const piscinasQty = Math.max(0, parseQty(row.piscinas_qty || 0))
      const totalEquipos = Math.max(declaredQuantity, canaletasQty + piscinasQty)
      const equipmentKey = (() => {
        const patent = String(row.patent || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
        if (patent) return `pat:${patent}`
        const name = String(row.equipment_name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ")
        return name ? `name:${name}` : ""
      })()
      const split = applyFieldReportEquipmentUsage({
        equipmentKey,
        totalPhysical: panne ? 0 : totalEquipos,
        canaletasQty: panne ? 0 : canaletasQty,
        piscinasQty: panne ? 0 : piscinasQty
      })
      return {
        name: [String(row.equipment_name || "").trim(), String(row.patent || "").trim()].filter(Boolean).join(" ").trim() || String(row.equipment_name || "").trim(),
        hmTurnoDia: machineWorkdayHours,
        totalEquipos,
        operacion,
        disponibles,
        acredMant: hasMaintOrAccred ? 1 : 0,
        panne,
        ofCentral: 0,
        instalacionFaena: split.instalacionFaena,
        mainFront: split.mainFront,
        nocFront: split.nocFront,
        dynamicFrontValues: split.dynamicFrontValues
      }
    })
  const majorEquipmentRows = strictSnapshotView && persistedMajorEquipmentRows.length > 0
    ? persistedMajorEquipmentRows
    : mappedMajorEquipmentRows
  const majorEquipmentRowsWithTotals: Array<MajorEquipmentRow & { totalEqMaq?: number; hmTotal?: number }> = strictSnapshotView
    ? majorEquipmentRows
    : majorEquipmentRows.map((row) => {
      const rowDynamicFrontTotal = Array.isArray(row.dynamicFrontValues)
        ? row.dynamicFrontValues.reduce((acc, value) => acc + Number(value || 0), 0)
        : Number(row.nocFront || 0)
      const effectiveRowDynamicFrontTotal = rowDynamicFrontTotal > 0 ? rowDynamicFrontTotal : Number(row.nocFront || 0)
      const distributedByFront = Number(row.instalacionFaena || 0) + Number(row.mainFront || 0) + effectiveRowDynamicFrontTotal
      const declaredEquipmentQty = Math.max(0, Number(row.totalEquipos || 0))
      const totalEqMaqRaw = distributedByFront > 0 ? distributedByFront : declaredEquipmentQty
      const totalEqMaq = declaredEquipmentQty > 0 ? Math.min(totalEqMaqRaw, declaredEquipmentQty) : totalEqMaqRaw
      const hmTotal = totalEqMaq * Number(row.hmTurnoDia || 0)
      return applyEquipmentFrontOverrideToRow({ ...row, totalEqMaq, hmTotal }, "major")
    })
  const majorTotals = majorEquipmentRowsWithTotals.reduce(
    (acc, row) => ({
      hmTurnoDia: acc.hmTurnoDia + Number(row.hmTurnoDia || 0),
      totalEquipos: acc.totalEquipos + Number(row.totalEquipos || 0),
      operacion: acc.operacion + Number(row.operacion || 0),
      disponibles: acc.disponibles + Number(row.disponibles || 0),
      acredMant: acc.acredMant + Number(row.acredMant || 0),
      panne: acc.panne + Number(row.panne || 0),
      ofCentral: acc.ofCentral + Number(row.ofCentral || 0),
      instalacionFaena: acc.instalacionFaena + Number(row.instalacionFaena || 0),
      mainFront: acc.mainFront + Number(row.mainFront || 0),
      nocFront: Number((acc as any).nocFront || 0) + Number(row.nocFront || 0),
      dynamicFrontValues: maquinariaFrenteColumns.slice(2).map((_label, idx) =>
        Number((acc as any).dynamicFrontValues?.[idx] || 0) + Number(row.dynamicFrontValues?.[idx] || 0)
      ),
      totalEqMaq: acc.totalEqMaq + Number(row.totalEqMaq || 0),
      hmTotal: acc.hmTotal + Number(row.hmTotal || 0)
    }),
    {
      hmTurnoDia: 0,
      totalEquipos: 0,
      operacion: 0,
      disponibles: 0,
      acredMant: 0,
      panne: 0,
      ofCentral: 0,
      instalacionFaena: 0,
      mainFront: 0,
      nocFront: 0,
      dynamicFrontValues: [] as number[],
      totalEqMaq: 0,
      hmTotal: 0
    }
  )
  const directMatrixRows = directAttendanceRows
  const groupedDirectRows = directMatrixRows.reduce((acc, row) => {
    const key = String(row.discipline || row.specialty || "GENERAL").trim().toUpperCase() || "GENERAL"
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {} as Record<string, typeof directMatrixRows>)
  const orderedDirectSpecialties = Object.keys(groupedDirectRows).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
  const totalDirect = directMatrixRows.reduce(
    (acc, row) => ({
      hhTurnoDia: Math.max(acc.hhTurnoDia, row.hhTurnoDia),
      contratados: acc.contratados + row.contratados,
      contratacionProceso: acc.contratacionProceso + row.contratacionProceso,
      apoyoOficina: acc.apoyoOficina + row.apoyoOficina,
      descansoCambioTurno: acc.descansoCambioTurno + row.descansoCambioTurno,
      permisoCovid: acc.permisoCovid + row.permisoCovid,
      renunciaVoluntaria: acc.renunciaVoluntaria + row.renunciaVoluntaria,
      terminoContrato: acc.terminoContrato + row.terminoContrato,
      enCurso3d: acc.enCurso3d + row.enCurso3d,
      capacitacionAcreditacion: acc.capacitacionAcreditacion + row.capacitacionAcreditacion,
      teletrabajo: acc.teletrabajo + row.teletrabajo,
      pruebaPractica: acc.pruebaPractica + row.pruebaPractica,
      ofertaComercial: acc.ofertaComercial + row.ofertaComercial,
      dotacionTotalObra: acc.dotacionTotalObra + row.dotacionTotalObra,
      hhTotalObra: acc.hhTotalObra + row.hhTotalObra
    }),
    {
      hhTurnoDia: 0,
      contratados: 0,
      contratacionProceso: 0,
      apoyoOficina: 0,
      descansoCambioTurno: 0,
      permisoCovid: 0,
      renunciaVoluntaria: 0,
      terminoContrato: 0,
      enCurso3d: 0,
      capacitacionAcreditacion: 0,
      teletrabajo: 0,
      pruebaPractica: 0,
      ofertaComercial: 0,
      dotacionTotalObra: 0,
      hhTotalObra: 0
    }
  )
  const rightDetachedTotalSx: React.CSSProperties = {
    ...laborSubtotalCellSx,
    borderLeft: "1px solid #111"
  }
  const defaultMinorEqRows: MinorEquipmentRow[] = [
    { name: "Camioneta RSXY31", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Camioneta TGJK47", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Camioneta RRZT32", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Camioneta TGJK56", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Camioneta TYTL46", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "BUS PFXD84", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Rodillo RC", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Placa Comp 3500kg N°100341920599", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Placa Comp 5500kg N°11487266", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 2, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Placa Comp 5500kg N°11815737", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 2, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours },
    { name: "Container", hmTurnoDia: machineWorkdayHours, totalEquipos: 25, operacion: 0, disponibles: 25, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 6, front2: 4, totalEqObra: 11.5, hmTotal: 11.5 * machineWorkdayHours },
    { name: "BUS SHYW97", hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, oficinaFuera: 0, front1: 0.5, front2: 0, totalEqObra: 0.5, hmTotal: halfDayHours }
  ]
  const persistedMinorEqRows: MinorEquipmentRow[] = (Array.isArray((form as any)?.v2_detail_minor_equipment_rows)
    ? (form as any).v2_detail_minor_equipment_rows
    : []
  ).map((row: any) => ({
    name: String(row?.name || "").trim(),
    hmTurnoDia: Number(row?.hmTurnoDia || 0),
    totalEquipos: Number(row?.totalEquipos || 0),
    operacion: Number(row?.operacion || 0),
    disponibles: Number(row?.disponibles || 0),
    acredMant: Number(row?.acredMant || 0),
    panne: Number(row?.panne || 0),
    oficinaFuera: Number((row?.oficinaFuera ?? row?.ofCentral) || 0),
    front1: Number((row?.front1 ?? row?.instalacionFaena) || 0),
    front2: Number((row?.front2 ?? row?.mainFront) || 0),
    nocFront: Number(row?.nocFront || 0),
    dynamicFrontValues: Array.isArray(row?.dynamicFrontValues)
      ? row.dynamicFrontValues.map((value: any) => Number(value || 0))
      : [],
    totalEqObra: Number((row?.totalEqObra ?? row?.totalEqMaq) || 0),
    hmTotal: Number(row?.hmTotal || 0)
  }))
  const mappedMinorEqRows: MinorEquipmentRow[] = managementEquipmentRows
    .filter((row) => row.equipment_kind === "MENOR" && row.include_in_daily_report !== false && !isNotYetEnteredEquipmentForReport(row) && !isReturnedEquipmentForReport(row))
    .map((row) => {
      const hasMaintOrAccred = Boolean(row.in_maintenance) || Boolean(row.in_accreditation)
      const operacion = row.is_operational ? 1 : 0
      const panne = row.in_breakdown ? 1 : 0
      const disponibles = !operacion && !hasMaintOrAccred && !panne ? 1 : 0
      const hmTurnoDia = machineWorkdayHours
      const declaredQuantity = Math.max(0, parseQty(row.quantity || 0))
      const canaletasQty = Math.max(0, parseQty(row.canaletas_qty || 0))
      const piscinasQty = Math.max(0, parseQty(row.piscinas_qty || 0))
      const declaredEquipmentQty = Math.max(declaredQuantity, canaletasQty + piscinasQty)
      const equipmentKey = (() => {
        const patent = String(row.patent || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
        if (patent) return `pat:${patent}`
        const name = String(row.equipment_name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ")
        return name ? `name:${name}` : ""
      })()
      const split = applyFieldReportEquipmentUsage({
        equipmentKey,
        totalPhysical: panne ? 0 : declaredEquipmentQty,
        canaletasQty: panne ? 0 : canaletasQty,
        piscinasQty: panne ? 0 : piscinasQty
      })
      const dynamicFrontTotal = (split.dynamicFrontValues || []).reduce((acc, value) => acc + Number(value || 0), 0)
      const effectiveDynamicFrontTotal = dynamicFrontTotal > 0 ? dynamicFrontTotal : split.nocFront
      const totalEqObra = split.instalacionFaena + split.mainFront + effectiveDynamicFrontTotal
      return {
        name: [String(row.equipment_name || "").trim(), String(row.patent || "").trim()].filter(Boolean).join(" ").trim() || String(row.equipment_name || "").trim(),
        hmTurnoDia,
        totalEquipos: declaredEquipmentQty,
        operacion,
        disponibles,
        acredMant: hasMaintOrAccred ? 1 : 0,
        panne,
        oficinaFuera: 0,
        front1: split.instalacionFaena,
        front2: split.mainFront,
        nocFront: split.nocFront,
        dynamicFrontValues: split.dynamicFrontValues,
        totalEqObra,
        hmTotal: totalEqObra * hmTurnoDia,
      }
    })
  const minorEqRowsBase = strictSnapshotView && persistedMinorEqRows.length > 0
    ? persistedMinorEqRows
    : mappedMinorEqRows
  const minorEqRows = strictSnapshotView
    ? minorEqRowsBase
    : minorEqRowsBase.map((row) => applyEquipmentFrontOverrideToRow(row, "minor"))
  const minorTotals = minorEqRows.reduce(
    (acc, row) => ({
      hmTurnoDia: acc.hmTurnoDia + Number(row.hmTurnoDia || 0),
      totalEquipos: acc.totalEquipos + Number(row.totalEquipos || 0),
      operacion: acc.operacion + Number(row.operacion || 0),
      disponibles: acc.disponibles + Number(row.disponibles || 0),
      acredMant: acc.acredMant + Number(row.acredMant || 0),
      panne: acc.panne + Number(row.panne || 0),
      oficinaFuera: acc.oficinaFuera + Number(row.oficinaFuera || 0),
      front1: acc.front1 + Number(row.front1 || 0),
      front2: acc.front2 + Number(row.front2 || 0),
      nocFront: Number((acc as any).nocFront || 0) + Number(row.nocFront || 0),
      dynamicFrontValues: maquinariaFrenteColumns.slice(2).map((_label, idx) =>
        Number((acc as any).dynamicFrontValues?.[idx] || 0) + Number(row.dynamicFrontValues?.[idx] || 0)
      ),
      totalEqObra: acc.totalEqObra + Number(row.totalEqObra || 0),
      hmTotal: acc.hmTotal + Number(row.hmTotal || 0)
    }),
    {
      hmTurnoDia: 0,
      totalEquipos: 0,
      operacion: 0,
      disponibles: 0,
      acredMant: 0,
      panne: 0,
      oficinaFuera: 0,
      front1: 0,
      front2: 0,
      nocFront: 0,
      dynamicFrontValues: [] as number[],
      totalEqObra: 0,
      hmTotal: 0
    }
  )
  const totalOverall = {
    contratados: totalIndirect.contratados + totalDirect.contratados,
    contratacionProceso: totalIndirect.contratacionProceso + totalDirect.contratacionProceso,
    apoyoOficina: totalIndirect.apoyoOficina + totalDirect.apoyoOficina,
    descansoCambioTurno: totalIndirect.descansoCambioTurno + totalDirect.descansoCambioTurno,
    permisoCovid: totalIndirect.permisoCovid + totalDirect.permisoCovid,
    renunciaVoluntaria: totalIndirect.renunciaVoluntaria + totalDirect.renunciaVoluntaria,
    terminoContrato: totalIndirect.terminoContrato + totalDirect.terminoContrato,
    enCurso3d: totalIndirect.enCurso3d + totalDirect.enCurso3d,
    capacitacionAcreditacion: totalIndirect.capacitacionAcreditacion + totalDirect.capacitacionAcreditacion,
    teletrabajo: totalIndirect.teletrabajo + totalDirect.teletrabajo,
    pruebaPractica: totalIndirect.pruebaPractica + totalDirect.pruebaPractica,
    ofertaComercial: totalIndirect.ofertaComercial + totalDirect.ofertaComercial,
    dotacionTotalObra: totalIndirect.dotacionTotalObra + totalDirect.dotacionTotalObra,
    hhTotalObra: totalIndirect.hhTotalObra + totalDirect.hhTotalObra
  }
  const totalOverallEquipHm = Number(majorTotals.hmTotal || 0) + Number(minorTotals.hmTotal || 0)
  const totalOverallEquipQty = Number(majorTotals.totalEqMaq || 0) + Number(minorTotals.totalEqObra || 0)
  const totalOverallEquipHmTurnoDia = Number(majorTotals.hmTurnoDia || 0) + Number(minorTotals.hmTurnoDia || 0)
  const totalOverallEquipos = Number(majorTotals.totalEquipos || 0) + Number(minorTotals.totalEquipos || 0)
  const totalOverallEquipOperacion = Number(majorTotals.operacion || 0) + Number(minorTotals.operacion || 0)
  const totalOverallEquipDisponibles = Number(majorTotals.disponibles || 0) + Number(minorTotals.disponibles || 0)
  const totalOverallEquipAcredMant = Number(majorTotals.acredMant || 0) + Number(minorTotals.acredMant || 0)
  const totalOverallEquipPanne = Number(majorTotals.panne || 0) + Number(minorTotals.panne || 0)
  const totalOverallEquipOfCentral = Number(majorTotals.ofCentral || 0) + Number(minorTotals.oficinaFuera || 0)
  const totalOverallEquipFrontValues = maquinariaFrenteColumns.map((_, idx) => {
    const major = idx === 0
      ? Number(majorTotals.instalacionFaena || 0)
      : idx === 1
        ? Number(majorTotals.mainFront || 0)
        : Number((majorTotals as any).dynamicFrontValues?.[idx - 2] || 0)
    const minor = idx === 0
      ? Number(minorTotals.front1 || 0)
      : idx === 1
        ? Number(minorTotals.front2 || 0)
        : Number((minorTotals as any).dynamicFrontValues?.[idx - 2] || 0)
    return major + minor
  })

  useEffect(() => {
    if (readOnly) return
    const nextMajorQty = oneDecimalFormValue(Number(majorTotals.totalEqMaq || 0))
    const nextMajorHm = oneDecimalFormValue(Number(majorTotals.hmTotal || 0))
    const nextMinorQty = oneDecimalFormValue(Number(minorTotals.totalEqObra || 0))
    const nextMinorHm = oneDecimalFormValue(Number(minorTotals.hmTotal || 0))
    const nextTotalQty = oneDecimalFormValue(Number(totalOverallEquipQty || 0))
    const nextTotalHm = oneDecimalFormValue(Number(totalOverallEquipHm || 0))

    if (String(form.equip_major_qty || "0") !== nextMajorQty) onChange("equip_major_qty", nextMajorQty)
    if (String(form.equip_major_hm || "0") !== nextMajorHm) onChange("equip_major_hm", nextMajorHm)
    if (String(form.equip_minor_qty || "0") !== nextMinorQty) onChange("equip_minor_qty", nextMinorQty)
    if (String(form.equip_minor_hm || "0") !== nextMinorHm) onChange("equip_minor_hm", nextMinorHm)
    if (String(form.equip_total_qty || "0") !== nextTotalQty) onChange("equip_total_qty", nextTotalQty)
    if (String(form.equip_total_hm || "0") !== nextTotalHm) onChange("equip_total_hm", nextTotalHm)
  }, [
    readOnly,
    form.equip_major_qty,
    form.equip_major_hm,
    form.equip_minor_qty,
    form.equip_minor_hm,
    form.equip_total_qty,
    form.equip_total_hm,
    majorTotals.totalEqMaq,
    majorTotals.hmTotal,
    minorTotals.totalEqObra,
    minorTotals.hmTotal,
    totalOverallEquipQty,
    totalOverallEquipHm,
    onChange
  ])

  const totalRowSx: React.CSSProperties = {
    ...laborSubtotalCellSx,
    background: "#d7f8ce",
    color: "#0f2c7d",
    borderTop: "2px solid #111"
  }
  const renderMinorValue = (value: unknown, emptyAsDash = true) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return "-"
    if (Math.abs(n) < 0.000001) return "-"
    return oneDecimalCell(n)
  }
  const getInstalacionFaenaValue = (row: {
    contratados: number
    apoyoOficina: number
    descansoCambioTurno: number
    permisoCovid: number
    dotacionTotalObra?: number
  }) => {
    const baseDotRaw = Object.prototype.hasOwnProperty.call(row as any, "dotacionTotalObra")
      ? Math.max(0, Number(row.dotacionTotalObra || 0))
      : Math.max(
          0,
          Number(row.contratados || 0) -
            Number(row.apoyoOficina || 0) -
            Number(row.descansoCambioTurno || 0) -
            Number(row.permisoCovid || 0)
        )
    const value = baseDotRaw / 2
    return value > 0 ? value : 0
  }
  const getDotacionFrenteValues = (row: {
    position?: string
    contratados: number
    apoyoOficina: number
    descansoCambioTurno: number
    permisoCovid: number
    instalacionFaena?: number
    frente?: number
    dotacionTotalObra?: number
    __persistedDailySnapshot?: boolean
  }) => {
    const rowAny = row as any
    const debugReturn = (_branch: "A" | "B" | "C", values: [number, number, number]) => values
    const toMaybeNumber = (value: unknown) => {
      if (value == null || String(value).trim() === "") return null
      const parsed = Number(String(value).replace(",", "."))
      return Number.isFinite(parsed) ? parsed : null
    }
    const getDirectTurnoCap = () => {
      const contracted = Number(rowAny?.contratados || 0)
      const unavailable =
        Number(rowAny?.apoyoOficina || 0) +
        Number(rowAny?.descansoCambioTurno || 0) +
        Number(rowAny?.permisoCovid || 0) +
        Number(rowAny?.renunciaVoluntaria || 0) +
        Number(rowAny?.terminoContrato || 0) +
        Number(rowAny?.enCurso3d || 0) +
        Number(rowAny?.capacitacionAcreditacion || 0) +
        Number(rowAny?.teletrabajo || 0) +
        Number(rowAny?.pruebaPractica || 0) +
        Number(rowAny?.ofertaComercial || 0)
      const attendanceLimit = Math.max(0, contracted - unavailable)
      const explicitDot = toMaybeNumber(rowAny?.dotacionTotalObra)
      if (explicitDot != null) return Math.max(0, Number(explicitDot || 0) * 2)
      return Math.max(0, Number.isFinite(attendanceLimit) ? attendanceLimit : 0)
    }
    const normalizeDirectSplit = (ifaValue: number, frontValue: number, nocValue: number): [number, number, number] => {
      const limit = getDirectTurnoCap()
      const safeFront = Math.max(0, Number(frontValue || 0))
      const safeNoc = Math.max(0, Number(nocValue || 0))
      const fixed = safeFront + safeNoc
      const safeIfa = Math.max(0, Math.min(Number(ifaValue || 0), Math.max(0, limit - fixed)))
      if (limit > 0 && fixed > limit) {
        const cappedNoc = Math.min(safeNoc, limit)
        return [0, Number(Math.max(0, limit - cappedNoc).toFixed(2)), Number(cappedNoc.toFixed(2))]
      }
      return [Number(safeIfa.toFixed(2)), Number(safeFront.toFixed(2)), Number(safeNoc.toFixed(2))]
    }
    // Source of truth rule: if row comes from persisted V2 snapshot, never recalculate.
    if (rowAny?.__persistedDailySnapshot === true) {
      const persistedInstalacion = toMaybeNumber(rowAny?.instalacionFaena)
      const persistedFrente = toMaybeNumber(rowAny?.frente)
      const persistedNocFront = toMaybeNumber(rowAny?.nocFront)
      const persistedDotTotal = toMaybeNumber(rowAny?.dotacionTotalObra)
      const persistedHhTotal = toMaybeNumber(rowAny?.hhTotalObra)
      const fallbackDot = Number(persistedDotTotal || 0) > 0
        ? Number(persistedDotTotal || 0)
        : Number(persistedHhTotal || 0) > 0
          ? personDotationFromHours(persistedHhTotal, rowAny)
          : 0
      const safeInstalacion = Number(persistedInstalacion || 0)
      const safeFrente = Number(persistedFrente || 0)
      const safeNocFront = Number(persistedNocFront || 0)
      if ((safeInstalacion + safeFrente + safeNocFront) > 0) return debugReturn("A", [safeInstalacion, safeFrente, safeNocFront])
      return debugReturn("B", [0, Math.max(0, fallbackDot), 0])
    }
    const persistedInstalacion = toMaybeNumber(rowAny?.instalacionFaena)
    const persistedFrente = toMaybeNumber(rowAny?.frente)
    const persistedNocFront = toMaybeNumber(rowAny?.nocFront)
    const persistedDotTotal = toMaybeNumber(rowAny?.dotacionTotalObra)
    const persistedHhTotal = toMaybeNumber(rowAny?.hhTotalObra)
    const baseDotFromRow = Object.prototype.hasOwnProperty.call(rowAny, "dotacionTotalObra")
      ? Math.max(0, Number(rowAny?.dotacionTotalObra || 0))
      : Math.max(
          0,
          Number(rowAny?.contratados || 0) -
            Number(rowAny?.apoyoOficina || 0) -
            Number(rowAny?.descansoCambioTurno || 0) -
            Number(rowAny?.permisoCovid || 0)
        )
    const recoveredDotFromPersisted =
      Number(persistedDotTotal || 0) > 0
        ? Number(persistedDotTotal || 0)
        : Number(persistedHhTotal || 0) > 0
          ? personDotationFromHours(persistedHhTotal, rowAny)
          : Number(baseDotFromRow || 0)
    const hasBrokenPersistedFrontSplit =
      rowAny?.__persistedDailySnapshot === true &&
      Number((persistedInstalacion || 0) + (persistedFrente || 0)) === 0 &&
      Number(recoveredDotFromPersisted || 0) > 0
    const shouldUsePersistedFrontValues =
      usePersistedSnapshotValues &&
      rowAny?.__persistedDailySnapshot === true &&
      !hasBrokenPersistedFrontSplit &&
      (persistedInstalacion != null || persistedFrente != null)
    const isDirectRow =
      Object.prototype.hasOwnProperty.call(rowAny, "specialty") ||
      Object.prototype.hasOwnProperty.call(rowAny, "discipline")
    const pos = String((row as any)?.position || "").toUpperCase()
    const rowDisc = normalizeDirectKeyToken((row as any)?.discipline || (row as any)?.specialty || "GENERAL") || "GENERAL"
    const rowSpec = normalizeSpecialtyLabel((row as any)?.specialty, (row as any)?.discipline, row?.position) || "GENERAL"
    const directKey = buildDirectFrontKey(rowDisc, rowSpec, pos)
    if (isDirectRow) {
      if (hasBrokenPersistedFrontSplit) {
        return debugReturn("B", [0, Number(recoveredDotFromPersisted || 0), 0])
      }
      if (shouldUsePersistedFrontValues) return debugReturn("A", [Number(persistedInstalacion || 0), Number(persistedFrente || 0), Number(persistedNocFront || 0)])
      const directFrontValue = Number(directFrontDotationByPosition?.[directKey] || 0)
      const directIfaValueFromKey = Number(directIfaDotationByPosition?.[directKey] || 0)
      const directIfaValue = directIfaValueFromKey
      const directNocValue = Number(directNocDotationByPosition?.[directKey] || 0)
      return debugReturn("C", normalizeDirectSplit(directIfaValue, directFrontValue, directNocValue))
    }
    const isMainPiscinas = form.work_front === "PISCINAS"
    if (hasBrokenPersistedFrontSplit) {
      return debugReturn("B", [0, Number(recoveredDotFromPersisted || 0), 0])
    }
    const roleKey = pos.includes("TOPOGRAFO")
      ? "TOPOGRAFO"
      : pos.includes("ALARIFE")
        ? "ALARIFE"
        : pos.includes("NIVELADOR")
          ? "NIVELADOR"
        : pos.includes("RIGGER")
          ? "RIGGER"
          : pos.includes("PREVENCIONISTA")
            ? "PREVENCIONISTA"
            : pos.includes("MECANICO MANTENCION")
              ? "MECANICO MANTENCION"
              : pos.includes("ELECTRICO MANTENCION")
                ? "ELECTRICO MANTENCION"
	          : ""
    if (shouldUsePersistedFrontValues) return debugReturn("A", [Number(persistedInstalacion || 0), Number(persistedFrente || 0), 0])
    if (pos.includes("SUPERVISOR") || pos.includes("JEFE") || pos.includes("COORDINADOR")) {
      const supervisorFronts = supervisorFrontDotationByPosition?.[pos]
      const supervisorCanaletas = Number(supervisorFronts?.canaletas || 0)
      const supervisorPiscinas = Number(supervisorFronts?.piscinas || 0)
      const supervisorNocCanaletas = Number((supervisorFronts as any)?.nocCanaletas || 0)
      const supervisorNocPiscinas = Number((supervisorFronts as any)?.nocPiscinas || 0)
      const supervisorIfa = Number(supervisorFronts?.ifa || 0)
      const supervisorNoc = supervisorNocCanaletas + supervisorNocPiscinas + Number(supervisorFronts?.noc || 0)
      const hasSupervisorFrontRule = supervisorCanaletas > 0 || supervisorPiscinas > 0 || supervisorIfa > 0 || supervisorNoc > 0
      if (hasSupervisorFrontRule) {
        const baseDotRaw = Object.prototype.hasOwnProperty.call(rowAny, "dotacionTotalObra")
          ? Math.max(0, Number(row.dotacionTotalObra || 0))
          : Math.max(
              0,
              Number(row.contratados || 0) -
                Number(row.apoyoOficina || 0) -
                Number(row.descansoCambioTurno || 0) -
                Number(row.permisoCovid || 0)
            )
        // Considerar también NOC como "declarado" para no duplicar en IFA.
        const declaredBase = Math.max(0, supervisorCanaletas + supervisorPiscinas + supervisorIfa + supervisorNoc)
        const undeclaredRemainder = Math.max(0, baseDotRaw - declaredBase)
        const selectedSupervisorFront = isMainPiscinas ? supervisorPiscinas : supervisorCanaletas
        const selectedSupervisorNoc = isMainPiscinas ? supervisorNocPiscinas : supervisorNocCanaletas
        // Si hay supervisores en turno no declarados en reportes de terreno,
        // su remanente va a Instalación Faena dividido en ambos frentes.
        const instalacionFaenaValue = (supervisorIfa / 2) + (undeclaredRemainder / 2)
        return debugReturn("C", [instalacionFaenaValue, selectedSupervisorFront, selectedSupervisorNoc])
      }
    }
    if (roleKey) {
      const selectedFrontValue = Number(
        (isMainPiscinas
          ? frontRoleDotation?.piscinas?.[roleKey]
          : frontRoleDotation?.canaletas?.[roleKey]) || 0
      )
      const roleCanaletas = Number(frontRoleDotation?.canaletas?.[roleKey] || 0)
      const rolePiscinas = Number(frontRoleDotation?.piscinas?.[roleKey] || 0)
      const selectedNocValue = Number(frontRoleDotation?.noc?.[roleKey] || 0)
      const hasRoleDeclaredInFieldReports = (roleCanaletas + rolePiscinas + selectedNocValue) > 0
      const manualSpecialFront = Number(
        (isMainPiscinas
          ? indirectManualSpecialFrontByPosition?.[pos]?.piscinas
          : indirectManualSpecialFrontByPosition?.[pos]?.canaletas) || 0
      )
      if ((roleKey === "TOPOGRAFO" || roleKey === "ALARIFE" || roleKey === "NIVELADOR") && !hasRoleDeclaredInFieldReports) {
        const baseDotRaw = Object.prototype.hasOwnProperty.call(rowAny, "dotacionTotalObra")
          ? Math.max(0, Number(row.dotacionTotalObra || 0))
          : Math.max(
              0,
              Number(row.contratados || 0) -
                Number(row.apoyoOficina || 0) -
                Number(row.descansoCambioTurno || 0) -
                Number(row.permisoCovid || 0)
            )
        // Si no están declarados en reportes/frentes de terreno:
        // en Turno deben ir a Instalación Faena, divididos en ambos frentes.
        return debugReturn("C", [baseDotRaw / 2, 0, 0])
      }
      if (roleKey === "PREVENCIONISTA") {
        // PREVENCIONISTA se reparte por unidades enteras entre frentes activos del día.
        // Nunca sumar la fila base + NOC, porque eso sobredeclara vs "en turno".
        const selectedBaseFront = Number(
          (isMainPiscinas
            ? prevencionistaFrontDistribution?.allocated?.piscinas
            : prevencionistaFrontDistribution?.allocated?.canaletas) || 0
        )
        const selectedNocFront = Number(
          (isMainPiscinas
            ? prevencionistaFrontDistribution?.allocated?.nocPiscinas
            : prevencionistaFrontDistribution?.allocated?.nocCanaletas) || 0
        )
        if (false) console.debug("[daily-report][dotacion-frente][PREVENCIONISTA]", {
          reportDate: form.report_date,
          reportFormat: form.report_format_code,
          position: pos,
          totalTurno: prevencionistaFrontDistribution?.totalTurno || 0,
          allocated: prevencionistaFrontDistribution?.allocated || {},
          selectedBaseFront,
          selectedNocFront
        })
        return debugReturn("C", [0, selectedBaseFront, selectedNocFront])
      }
      if (roleKey === "MECANICO MANTENCION" || roleKey === "ELECTRICO MANTENCION") {
        const canHours = Number(mantencionFrontCounts?.canaletas?.[roleKey] || 0)
        const pisHours = Number(mantencionFrontCounts?.piscinas?.[roleKey] || 0)
        const nocCanHours = Number(mantencionFrontCounts?.nocCanaletas?.[roleKey] || 0)
        const nocPisHours = Number(mantencionFrontCounts?.nocPiscinas?.[roleKey] || 0)
        const ifaHours = Number(mantencionFrontCounts?.ifa?.[roleKey] || 0)
        const excludedHours = Number(mantencionFrontCounts?.excluded?.[roleKey] || 0)
        const totalBaseFrontHours = canHours + pisHours
        const totalNocHours = nocCanHours + nocPisHours
        const selectedFrontHours = isMainPiscinas ? pisHours : canHours
        const selectedNocHours = isMainPiscinas ? nocPisHours : nocCanHours
        const totalDeclaredHours = totalBaseFrontHours + totalNocHours + ifaHours + excludedHours
        const hasAnyExcludedPresence = excludedHours > 0
        const appearsOnlyInExcludedFront = excludedHours > 0 && totalBaseFrontHours <= 0 && totalNocHours <= 0
        const baseDotRaw = Object.prototype.hasOwnProperty.call(rowAny, "dotacionTotalObra")
          ? Math.max(0, Number(row.dotacionTotalObra || 0))
          : Math.max(
              0,
              Number(row.contratados || 0) -
                Number(row.apoyoOficina || 0) -
                Number(row.descansoCambioTurno || 0) -
                Number(row.permisoCovid || 0)
            )
        // Regla existente para mantención indirecta: se declara en el frente donde
        // aparece por reporte de terreno; si aparece solo en NOC/UDR, no entra a base.
        if (hasAnyExcludedPresence) {
          if (false) console.debug("[daily-report][mant-front-row]", {
            reportDate: form.report_date,
            workFront: form.work_front,
            position: pos,
            roleKey,
            excludedHours,
            canaletasHours: canHours,
            piscinasHours: pisHours,
            nocCanaletasHours: nocCanHours,
            nocPiscinasHours: nocPisHours,
            baseDotRaw,
            action: "excluded-presence-overrides-all-fronts"
          })
          return debugReturn("C", [0, 0, personDotationFromHours(excludedHours)])
        }
        if (appearsOnlyInExcludedFront) {
          if (false) console.debug("[daily-report][mant-front-row]", {
            reportDate: form.report_date,
            workFront: form.work_front,
            position: pos,
            roleKey,
            excludedHours,
            canaletasHours: canHours,
            piscinasHours: pisHours,
            nocCanaletasHours: nocCanHours,
            nocPiscinasHours: nocPisHours,
            baseDotRaw,
            action: "excluded-udr-noc"
          })
          return debugReturn("C", [0, 0, 0])
        }
        if (totalDeclaredHours > 0 && selectedFrontHours <= 0 && selectedNocHours <= 0 && ifaHours <= 0) {
          if (false) console.debug("[daily-report][mant-front-row]", {
            reportDate: form.report_date,
            workFront: form.work_front,
            position: pos,
            roleKey,
            excludedHours,
            canaletasHours: canHours,
            piscinasHours: pisHours,
            nocCanaletasHours: nocCanHours,
            nocPiscinasHours: nocPisHours,
            baseDotRaw,
            action: "hidden-in-this-front"
          })
          return debugReturn("C", [0, 0, 0])
        }
        if (selectedFrontHours > 0 || ifaHours > 0 || selectedNocHours > 0) {
          const fromFieldReportHours = selectedFrontHours
          const fromFieldReportDot = personDotationFromHours(fromFieldReportHours)
          const fromNocDot = personDotationFromHours(selectedNocHours)
          const fromIfaDot = personDotationFromHours(ifaHours) / 2
          if (false) console.debug("[daily-report][mant-front-row]", {
            reportDate: form.report_date,
            workFront: form.work_front,
            position: pos,
            roleKey,
            excludedHours,
            canaletasHours: canHours,
            piscinasHours: pisHours,
            nocCanaletasHours: nocCanHours,
            nocPiscinasHours: nocPisHours,
            ifaHours,
            fromFieldReportHours,
            shownFrontValue: fromFieldReportDot,
            shownNocValue: fromNocDot,
            shownIfaValue: fromIfaDot,
            action: "assigned-to-front-by-hours"
          })
          return debugReturn("C", [fromIfaDot, fromFieldReportDot + manualSpecialFront, fromNocDot])
        }
        const instalacionFaenaFallback = baseDotRaw / 2
        if (false) console.debug("[daily-report][mant-front-row]", {
          reportDate: form.report_date,
          workFront: form.work_front,
          position: pos,
          roleKey,
          excludedHours,
          canaletasHours: canHours,
          piscinasHours: pisHours,
          baseDotRaw,
          instalacionFaenaFallback,
          action: "fallback-instalacion-faena-split"
        })
        return debugReturn("C", [instalacionFaenaFallback, 0, selectedNocValue])
      }
      // Keep role contribution visible in the main front column (2nd col).
      return debugReturn("C", [0, selectedFrontValue + manualSpecialFront, selectedNocValue])
    }
    const operatorFronts = operatorFrontDotationByPosition?.[pos]
    if (operatorFronts) {
      const operatorCanaletas = Number(operatorFronts?.canaletas || 0)
      const operatorPiscinas = Number(operatorFronts?.piscinas || 0)
      const operatorNocCanaletas = Number(operatorFronts?.nocCanaletas || 0)
      const operatorNocPiscinas = Number(operatorFronts?.nocPiscinas || 0)
      const operatorIfa = Number(operatorFronts?.ifa || 0)
      const hasOperatorFieldReportFront =
        operatorCanaletas > 0 ||
        operatorPiscinas > 0 ||
        operatorNocCanaletas > 0 ||
        operatorNocPiscinas > 0 ||
        operatorIfa > 0
      if (hasOperatorFieldReportFront) {
        const baseDotRaw = Object.prototype.hasOwnProperty.call(rowAny, "dotacionTotalObra")
          ? Math.max(0, Number(row?.dotacionTotalObra || 0))
          : Math.max(
              0,
              Number(row?.contratados || 0) -
                Number(row?.apoyoOficina || 0) -
                Number(row?.descansoCambioTurno || 0) -
                Number(row?.permisoCovid || 0)
            )
        const rawDeclaredOperatorDot = operatorCanaletas + operatorPiscinas + operatorNocCanaletas + operatorNocPiscinas + operatorIfa
        const operatorScale = rawDeclaredOperatorDot > 0 && baseDotRaw > 0 && rawDeclaredOperatorDot > baseDotRaw
          ? baseDotRaw / rawDeclaredOperatorDot
          : 1
        const scaledOperatorCanaletas = operatorCanaletas * operatorScale
        const scaledOperatorPiscinas = operatorPiscinas * operatorScale
        const scaledOperatorNocCanaletas = operatorNocCanaletas * operatorScale
        const scaledOperatorNocPiscinas = operatorNocPiscinas * operatorScale
        const scaledOperatorIfa = operatorIfa * operatorScale
        const selectedOperatorFront = isMainPiscinas ? scaledOperatorPiscinas : scaledOperatorCanaletas
        const selectedOperatorNoc = isMainPiscinas ? scaledOperatorNocPiscinas : scaledOperatorNocCanaletas
        const declaredOperatorDot =
          scaledOperatorCanaletas +
          scaledOperatorPiscinas +
          scaledOperatorNocCanaletas +
          scaledOperatorNocPiscinas +
          scaledOperatorIfa
        const undeclaredOperatorDot = Math.max(0, baseDotRaw - declaredOperatorDot)
        const manualSpecialFront = Number(
          (isMainPiscinas
            ? indirectManualSpecialFrontByPosition?.[pos]?.piscinas
            : indirectManualSpecialFrontByPosition?.[pos]?.canaletas) || 0
        )
        return debugReturn("C", [(scaledOperatorIfa + undeclaredOperatorDot) / 2, selectedOperatorFront + manualSpecialFront, selectedOperatorNoc])
      }
    }
    const manualSpecialFront = Number(
      (isMainPiscinas
        ? indirectManualSpecialFrontByPosition?.[pos]?.piscinas
        : indirectManualSpecialFrontByPosition?.[pos]?.canaletas) || 0
    )
    const instalacionFaena = getInstalacionFaenaValue(row)
    const overrideDelta = Number(indirectOverrideFrontDotByPosition?.[pos] ?? 0)
    const finalInstalacionFaena = Math.max(0, instalacionFaena + overrideDelta)
    return debugReturn("C", [finalInstalacionFaena, manualSpecialFront, 0])
  }
  type FrontDistributionSection = "indirect" | "direct"
  const parseFrontDistributionOverrides = (value: any): Record<string, number[]> => {
    if (!value) return {}
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number[]> : {}
      } catch {
        return {}
      }
    }
    return typeof value === "object" && !Array.isArray(value) ? value as Record<string, number[]> : {}
  }
  const normalizeFrontOverrideKeyPart = (value: any) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim() || "-"
  const getFrontOverrideRowKey = (row: any, section: FrontDistributionSection) => {
    const position = normalizeFrontOverrideKeyPart(row?.position || "SIN CARGO")
    if (section === "direct") {
      const discipline = normalizeDirectKeyToken(row?.discipline || row?.specialty || "GENERAL") || "GENERAL"
      const specialty = normalizeSpecialtyLabel(row?.specialty, row?.discipline, row?.position) || "GENERAL"
      return `direct::${buildDirectFrontKey(discipline, specialty, position)}`
    }
    return `indirect::${position}`
  }
  const inferFrontDistributionSection = (row: any): FrontDistributionSection =>
    Object.prototype.hasOwnProperty.call(row as any, "specialty") ||
    Object.prototype.hasOwnProperty.call(row as any, "discipline")
      ? "direct"
      : "indirect"
  const directDynamicFrontDotationByRowKey = useMemo(() => {
    const out: Record<string, Record<string, number>> = {}
    const hoursByParticipantColumn = new Map<string, { rowKey: string; columnKey: string; hours: number; source: any }>()
    const unresolved: Array<{ reportId: string; columnKey: string; participantId: string; reason: string }> = []
    const columnBySourceReportId = new Map<string, DynamicFrontColumn>()
    ;(allDynamicFrontColumns || []).forEach((column) => {
      ;(column.sourceReportIds || []).forEach((id) => {
        const reportId = String(id || "").trim()
        if (reportId) columnBySourceReportId.set(reportId, column)
      })
    })

    const normalizeLabel = (value: any) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim()
    const parseArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return parsed
          if (parsed && typeof parsed === "object") return Object.values(parsed)
        } catch {}
      }
      if (value && typeof value === "object") return Object.values(value)
      return []
    }
    const parseObject = (value: any): Record<string, any> => {
      if (!value) return {}
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      return typeof value === "object" && !Array.isArray(value) ? value : {}
    }
    const collaboratorById = new Map<string, any>()
    ;(collaboratorsForTooltip || []).forEach((collaborator: any) => {
      const id = String(collaborator?.id || "").trim()
      if (id) collaboratorById.set(id, collaborator)
    })
    const collaboratorIdByName = new Map<string, string>()
    ;(collaboratorsForTooltip || []).forEach((collaborator: any) => {
      const id = String(collaborator?.id || "").trim()
      if (!id) return
      const fullName = normalizeLabel(`${String(collaborator?.first_name || "").trim()} ${String(collaborator?.last_name || "").trim()}`)
      if (fullName) collaboratorIdByName.set(fullName, id)
    })
    const resolveParticipantId = (value: any) => {
      const raw = String(value || "").trim()
      if (!raw) return ""
      if (collaboratorById.has(raw)) return raw
      return collaboratorIdByName.get(normalizeLabel(raw)) || raw
    }
    const turnParticipantIdentities = new Set<string>()
    ;(dailyStatusRowsForTooltip || []).forEach((daily: any) => {
      const status = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = String(daily?.status || "").trim().toUpperCase()
      if (!(status === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11" || statusCode === "10")) return
      const collaborator = daily?.collaborator || collaboratorById.get(String(daily?.collaborator_id || "").trim()) || {}
      const id = resolveParticipantId(collaborator?.id || daily?.collaborator_id)
      if (id) turnParticipantIdentities.add(id)
      const nameId = resolveParticipantId(`${String(collaborator?.first_name || "").trim()} ${String(collaborator?.last_name || "").trim()}`)
      if (nameId) turnParticipantIdentities.add(nameId)
    })
    const isParticipantInTurn = (identity: string) => turnParticipantIdentities.size === 0 || turnParticipantIdentities.has(identity)
    const getPersonName = (person: any) =>
      `${String(person?.first_name || person?.name || "").trim()} ${String(person?.last_name || "").trim()}`.trim()
    const inferDirectDisciplineLocal = (discipline: any, specialty: any, position: any) => {
      const normalize = (value: any) =>
        String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim()
      const specialtyText = normalize(specialty)
      const positionText = normalize(position)
      const joined = normalize(`${discipline || ""} ${specialty || ""} ${position || ""}`)
      if (specialtyText.includes("rigger") || positionText.includes("rigger")) return "RIGGER"
      if (joined.includes("civil") || joined.includes("obras civiles")) return "OBRA CIVILES"
      if (joined.includes("electric")) return "ELECTRICO"
      if (joined.includes("mecanic")) return "MECANICO"
      if (joined.includes("caner") || joined.includes("caner") || joined.includes("hdpe")) return "CAÑERIA"
      if (joined.includes("andam")) return "ANDAMIOS"
      if (joined.includes("estruct")) return "ESTRUCTURA"
      if (joined.includes("topogra")) return "TOPOGRAFIA"
      return normalizeDirectKeyToken(discipline || specialty || position || "GENERAL") || "GENERAL"
    }
    const getDirectRowKey = (person: any, collaborator: any) => {
      const position = String(person?.position || person?.role || collaborator?.position || "").trim()
      if (!position) return ""
      const personSpecialty = person?.specialty || person?.especialidad
      const personDiscipline = person?.discipline || person?.disciplina
      const collaboratorSpecialty = collaborator?.specialty || collaborator?.especialidad
      const collaboratorDiscipline = collaborator?.discipline || collaborator?.disciplina
      const roleText = normalizeLabel(`${position} ${personSpecialty || ""} ${collaboratorSpecialty || ""}`)
      const workerType = normalizeLabel(collaborator?.worker_type || person?.worker_type)
      const isDirect = workerType.includes("DIRECTO") || roleText.includes("CAPATAZ") || Boolean(personDiscipline || personSpecialty || collaboratorDiscipline || collaboratorSpecialty)
      if (!isDirect) return ""
      const specialty = normalizeSpecialtyLabel(personSpecialty || collaboratorSpecialty, personDiscipline || collaboratorDiscipline, position) || "GENERAL"
      const discipline = inferDirectDisciplineLocal(personDiscipline || collaboratorDiscipline, specialty, position)
      return getFrontOverrideRowKey({ discipline, specialty, position }, "direct")
    }
    const addHours = (rowKey: string, columnKey: string, participantId: string, hours: number, source?: any) => {
      if (!rowKey || !columnKey || !participantId || !(hours > 0)) return
      const key = participantId
      const current = hoursByParticipantColumn.get(key) || { rowKey, columnKey, hours: 0, source }
      if (current.columnKey !== columnKey) return
      current.hours += hours
      current.source = current.source || source
      hoursByParticipantColumn.set(key, current)
    }

    ;(fieldReportsForDynamicColumns || []).forEach((report: any) => {
      const reportId = String(report?.id || "").trim()
      const dynamicColumn = reportId ? columnBySourceReportId.get(reportId) : null
      if (!dynamicColumn) return
      const personnel = parseArray(report?.personnel)
      const personnelById = new Map<string, any>()
      personnel.forEach((person: any, idx: number) => {
        const rawId = String(person?.id || person?.collaborator_id || person?.user_id || person?.personId || "").trim()
        const id = resolveParticipantId(rawId || getPersonName(person)) || `${reportId}:person:${idx}`
        personnelById.set(id, person)
      })
      const reportParticipantIds = new Set<string>(personnelById.keys())
      if (reportParticipantIds.size === 0) {
        parseArray(report?.personnel_ids).forEach((rawId: any) => {
          const id = resolveParticipantId(rawId)
          if (id) reportParticipantIds.add(id)
        })
      }
      const personHours = parseObject(report?.person_hours)
      const extraHours = parseObject((personHours as any).__extras)
      const personHoursById: Record<string, any> = {}
      Object.entries(personHours || {}).forEach(([rawId, hours]) => {
        if (!rawId || rawId === "__extras") return
        const id = resolveParticipantId(rawId)
        if (id) personHoursById[id] = hours
      })
      const extraHoursById: Record<string, any> = {}
      Object.entries(extraHours || {}).forEach(([rawId, hours]) => {
        const id = resolveParticipantId(rawId)
        if (id) extraHoursById[id] = hours
      })
      Array.from(reportParticipantIds).forEach((id) => {
        if (!isParticipantInTurn(id)) return
        const person = personnelById.get(id) || {}
        const collaborator = collaboratorById.get(id) || {}
        const rowKey = getDirectRowKey(person, collaborator)
        const hours = Array.isArray(personHoursById[id]) ? personHoursById[id] : []
        const extra = Number((extraHoursById as any)?.[id] || 0)
        const hasHours = hours.some((rawHours: any) => Number(rawHours || 0) > 0) || extra > 0
        if (!rowKey) {
          if (hasHours) unresolved.push({ reportId, columnKey: dynamicColumn.key, participantId: id, reason: "direct-row-key-not-resolved" })
          return
        }
        hours.forEach((rawHours: any) => {
          const hh = Number(rawHours || 0)
          if (!(hh > 0)) return
          addHours(rowKey, dynamicColumn.key, id, hh, report)
        })
        if (extra > 0) {
          addHours(rowKey, dynamicColumn.key, id, extra, report)
        }
      })
    })

    hoursByParticipantColumn.forEach((item) => {
      if (!item.rowKey || !item.columnKey || !(item.hours > 0)) return
      out[item.rowKey] = out[item.rowKey] || {}
      const participantDotation = Math.min(1, personDotationFromHours(item.hours, item.source))
      out[item.rowKey][item.columnKey] = Number(((out[item.rowKey][item.columnKey] || 0) + participantDotation).toFixed(2))
    })

    if (process.env.NODE_ENV !== "production" && unresolved.length > 0) {
      console.warn("[daily-report][dynamic-front-direct-unresolved]", unresolved.slice(0, 20))
    }
    return out
  }, [fieldReportsForDynamicColumns, allDynamicFrontColumns, collaboratorsForTooltip, dailyStatusRowsForTooltip])
  const indirectDynamicFrontDotationByRowKey = useMemo(() => {
    const out: Record<string, Record<string, number>> = {}
    const hoursByParticipantColumn = new Map<string, { rowKey: string; columnKey: string; hours: number; source: any }>()
    const countedParticipantIdentities = new Set<string>()
    const addedSupervisorIdentities = new Set<string>()
    const unresolved: Array<{ reportId: string; columnKey: string; participantId: string; reason: string }> = []
    const supervisorDebug: Array<{ reportId: string; workFront: string; columnKey: string; detected: string; rowKey: string; value: number; skipped?: string }> = []
    const columnBySourceReportId = new Map<string, DynamicFrontColumn>()
    ;(allDynamicFrontColumns || []).forEach((column) => {
      ;(column.sourceReportIds || []).forEach((id) => {
        const reportId = String(id || "").trim()
        if (reportId) columnBySourceReportId.set(reportId, column)
      })
    })
    const normalizeLabel = (value: any) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim()
    const parseArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return parsed
          if (parsed && typeof parsed === "object") return Object.values(parsed)
        } catch {}
      }
      if (value && typeof value === "object") return Object.values(value)
      return []
    }
    const parseObject = (value: any): Record<string, any> => {
      if (!value) return {}
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      return typeof value === "object" && !Array.isArray(value) ? value : {}
    }
    const collaboratorById = new Map<string, any>()
    ;(collaboratorsForTooltip || []).forEach((collaborator: any) => {
      const id = String(collaborator?.id || "").trim()
      if (id) collaboratorById.set(id, collaborator)
    })
    const collaboratorIdByName = new Map<string, string>()
    ;(collaboratorsForTooltip || []).forEach((collaborator: any) => {
      const id = String(collaborator?.id || "").trim()
      if (!id) return
      const fullName = normalizeLabel(`${String(collaborator?.first_name || "").trim()} ${String(collaborator?.last_name || "").trim()}`)
      if (fullName) collaboratorIdByName.set(fullName, id)
    })
    const resolveParticipantId = (value: any) => {
      const raw = String(value || "").trim()
      if (!raw) return ""
      if (collaboratorById.has(raw)) return raw
      return collaboratorIdByName.get(normalizeLabel(raw)) || raw
    }
    const turnParticipantIdentities = new Set<string>()
    ;(dailyStatusRowsForTooltip || []).forEach((daily: any) => {
      const status = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = String(daily?.status || "").trim().toUpperCase()
      if (!(status === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11" || statusCode === "10")) return
      const collaborator = daily?.collaborator || collaboratorById.get(String(daily?.collaborator_id || "").trim()) || {}
      const id = resolveParticipantId(collaborator?.id || daily?.collaborator_id)
      if (id) turnParticipantIdentities.add(id)
      const nameId = resolveParticipantId(`${String(collaborator?.first_name || "").trim()} ${String(collaborator?.last_name || "").trim()}`)
      if (nameId) turnParticipantIdentities.add(nameId)
    })
    const isParticipantInTurn = (identity: string) => turnParticipantIdentities.size === 0 || turnParticipantIdentities.has(identity)
    const getPersonName = (person: any) =>
      `${String(person?.first_name || person?.name || "").trim()} ${String(person?.last_name || "").trim()}`.trim()
    const isSupervisorLike = (value: any) => {
      const normalized = normalizeLabel(value)
      return normalized.includes("SUPERVISOR") ||
        normalized.includes("SUPERVISION") ||
        normalized.includes("JEFE") ||
        normalized.includes("COORDINADOR") ||
        normalized.includes("ENCARGADO") ||
        normalized.includes("PROFESIONAL DE TERRENO")
    }
    const getIndirectRowKey = (person: any, collaborator: any) => {
      const position = String(person?.position || person?.role || collaborator?.position || "").trim()
      if (!position) return ""
      const workerType = normalizeLabel(collaborator?.worker_type || person?.worker_type)
      if (!workerType.includes("INDIRECTO")) return ""
      return getFrontOverrideRowKey({ position }, "indirect")
    }
    const getSupervisorRowKey = (value: any, fallbackPosition?: any) => {
      const raw = String(value && typeof value === "object"
        ? (value?.id || value?.collaborator_id || value?.user_id || value?.personId || getPersonName(value) || value?.name || value?.full_name || value?.label || "")
        : value || ""
      ).trim()
      const normalizedName = normalizeLabel(raw)
      const collaboratorId = collaboratorById.has(raw) ? raw : String(collaboratorIdByName.get(normalizedName || "") || "")
      const collaborator = collaboratorId ? collaboratorById.get(collaboratorId) : null
      const position = String(
        collaborator?.position ||
        fallbackPosition ||
        (isSupervisorLike(raw) ? raw : "") ||
        "SUPERVISOR"
      ).trim()
      if (!position) return ""
      return getFrontOverrideRowKey({ position }, "indirect")
    }
    const supervisorIdentity = (value: any) => {
      if (value && typeof value === "object") {
        const id = String(value?.id || value?.collaborator_id || value?.user_id || value?.personId || value?.value || "").trim()
        if (id) return resolveParticipantId(id)
        const name = getPersonName(value) || String(value?.name || value?.full_name || value?.label || "").trim()
        return normalizeLabel(name)
      }
      const raw = String(value || "").trim()
      return resolveParticipantId(raw) || normalizeLabel(raw)
    }
    const supervisorDisplay = (value: any) => {
      if (value && typeof value === "object") {
        return getPersonName(value) || String(value?.name || value?.full_name || value?.label || value?.value || "").trim()
      }
      return String(value || "").trim()
    }
    const splitNames = (value: any) =>
      String(value || "")
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter(Boolean)
    const toSupervisorItems = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (value == null) return []
      if (typeof value === "string") {
        const raw = value.trim()
        if (!raw) return []
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) return parsed
          if (parsed && typeof parsed === "object") return [parsed]
        } catch {}
        return splitNames(raw)
      }
      if (typeof value === "object") return [value]
      return [value]
    }
    const addHours = (rowKey: string, columnKey: string, participantId: string, hours: number, source?: any) => {
      if (!rowKey || !columnKey || !participantId || !(hours > 0)) return
      const key = participantId
      const current = hoursByParticipantColumn.get(key) || { rowKey, columnKey, hours: 0, source }
      if (current.columnKey !== columnKey) return
      current.hours += hours
      current.source = current.source || source
      hoursByParticipantColumn.set(key, current)
    }
    const addDotation = (rowKey: string, columnKey: string, value: number) => {
      if (!rowKey || !columnKey || !(value > 0)) return
      out[rowKey] = out[rowKey] || {}
      out[rowKey][columnKey] = Number(((out[rowKey][columnKey] || 0) + value).toFixed(2))
    }

    ;(fieldReportsForDynamicColumns || []).forEach((report: any) => {
      const reportId = String(report?.id || "").trim()
      const dynamicColumn = reportId ? columnBySourceReportId.get(reportId) : null
      if (!dynamicColumn) return
      const personnel = parseArray(report?.personnel)
      const personnelById = new Map<string, any>()
      personnel.forEach((person: any, idx: number) => {
        const rawId = String(person?.id || person?.collaborator_id || person?.user_id || person?.personId || "").trim()
        const id = resolveParticipantId(rawId || getPersonName(person)) || `${reportId}:person:${idx}`
        personnelById.set(id, person)
      })
      const reportParticipantIds = new Set<string>(personnelById.keys())
      if (reportParticipantIds.size === 0) {
        parseArray(report?.personnel_ids).forEach((rawId: any) => {
          const id = resolveParticipantId(rawId)
          if (id) reportParticipantIds.add(id)
        })
      }
      const personHours = parseObject(report?.person_hours)
      const extraHours = parseObject((personHours as any).__extras)
      const personHoursById: Record<string, any> = {}
      Object.entries(personHours || {}).forEach(([rawId, hours]) => {
        if (!rawId || rawId === "__extras") return
        const id = resolveParticipantId(rawId)
        if (id) personHoursById[id] = hours
      })
      const extraHoursById: Record<string, any> = {}
      Object.entries(extraHours || {}).forEach(([rawId, hours]) => {
        const id = resolveParticipantId(rawId)
        if (id) extraHoursById[id] = hours
      })
      Array.from(reportParticipantIds).forEach((id) => {
        if (!isParticipantInTurn(id) || addedSupervisorIdentities.has(id)) return
        const person = personnelById.get(id) || {}
        const collaborator = collaboratorById.get(id) || {}
        const hours = Array.isArray(personHoursById[id]) ? personHoursById[id] : []
        const extra = Number((extraHoursById as any)?.[id] || 0)
        const hasHours = hours.some((rawHours: any) => Number(rawHours || 0) > 0) || extra > 0
        if (!hasHours) return
        const rowKey = getIndirectRowKey(person, collaborator)
        if (!rowKey) {
          unresolved.push({ reportId, columnKey: dynamicColumn.key, participantId: id, reason: "indirect-row-key-not-resolved" })
          return
        }
        countedParticipantIdentities.add(id)
        hours.forEach((rawHours: any) => {
          const hh = Number(rawHours || 0)
          if (!(hh > 0)) return
          addHours(rowKey, dynamicColumn.key, id, hh, report)
        })
        if (extra > 0) addHours(rowKey, dynamicColumn.key, id, extra, report)
      })

      const supervisorSources: Array<{ value: any; fallbackPosition?: any; force?: boolean }> = [
        ...toSupervisorItems(report?.supervisor_id).map((value) => ({ value, fallbackPosition: "SUPERVISOR", force: true })),
        ...toSupervisorItems(report?.capataz_id).map((value) => ({ value, fallbackPosition: "CAPATAZ", force: false }))
      ]
      supervisorSources.forEach(({ value, fallbackPosition, force }) => {
        const display = supervisorDisplay(value)
        if (!display) return
        const identity = supervisorIdentity(value)
        const dedupeKey = identity || normalizeLabel(display)
        if (!identity || addedSupervisorIdentities.has(dedupeKey)) return
        if (!isParticipantInTurn(identity)) {
          supervisorDebug.push({ reportId, workFront: String(report?.work_front || ""), columnKey: dynamicColumn.key, detected: display, rowKey: "", value: 0, skipped: "not-in-attendance-turn" })
          return
        }
        if (countedParticipantIdentities.has(dedupeKey)) {
          supervisorDebug.push({ reportId, workFront: String(report?.work_front || ""), columnKey: dynamicColumn.key, detected: display, rowKey: "", value: 0, skipped: "already-counted-from-personnel" })
          return
        }
        const collaborator = collaboratorById.get(identity) || null
        const roleText = `${display} ${fallbackPosition || ""} ${collaborator?.position || ""} ${collaborator?.specialty || ""}`
        if (!force && !isSupervisorLike(roleText)) return
        const rowKey = getSupervisorRowKey(value, fallbackPosition)
        if (!rowKey) {
          unresolved.push({ reportId, columnKey: dynamicColumn.key, participantId: identity, reason: "supervisor-row-key-not-resolved" })
          supervisorDebug.push({ reportId, workFront: String(report?.work_front || ""), columnKey: dynamicColumn.key, detected: display, rowKey: "", value: 0, skipped: "row-key-not-resolved" })
          return
        }
        addDotation(rowKey, dynamicColumn.key, 1)
        addedSupervisorIdentities.add(dedupeKey)
        supervisorDebug.push({ reportId, workFront: String(report?.work_front || ""), columnKey: dynamicColumn.key, detected: display, rowKey, value: 1 })
      })
    })

    hoursByParticipantColumn.forEach((item) => {
      if (!item.rowKey || !item.columnKey || !(item.hours > 0)) return
      addDotation(item.rowKey, item.columnKey, Math.min(1, personDotationFromHours(item.hours, item.source)))
    })

    if (process.env.NODE_ENV !== "production" && unresolved.length > 0) {
      console.warn("[daily-report][dynamic-front-indirect-unresolved]", unresolved.slice(0, 20))
    }
    if (process.env.NODE_ENV !== "production" && supervisorDebug.length > 0) {
      console.debug("[daily-report][dynamic-front-supervisors]", supervisorDebug.slice(0, 30))
    }
    return out
  }, [fieldReportsForDynamicColumns, allDynamicFrontColumns, collaboratorsForTooltip, dailyStatusRowsForTooltip])
  const getRowTurnoLimit = (row: any, fallbackValues?: number[], section?: FrontDistributionSection) => {
    const explicitDot = Number(String(row?.dotacionTotalObra ?? "").replace(",", "."))
    const rowSection = section || inferFrontDistributionSection(row)
    const explicitTurnoLimit = rowSection === "direct" ? explicitDot * 2 : explicitDot
    const fallbackLimit = (fallbackValues || []).reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0)
    if (Object.prototype.hasOwnProperty.call(row || {}, "dotacionTotalObra") && Number.isFinite(explicitTurnoLimit)) {
      return roundFrontValue(explicitTurnoLimit)
    }
    return roundFrontValue(Math.max(0, fallbackLimit))
  }
  const roundFrontValue = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return 0
    return Number(value.toFixed(2))
  }
  const getFrontValueWeight = (idx: number) => idx === 0 ? 2 : 1
  const isFrontValueLimitedIndex = (idx: number) => idx >= 0 && idx < dotacionFrenteColumns.length
  const limitedFrontValueSum = (values: number[]) =>
    values.reduce((acc, value, idx) => (
      isFrontValueLimitedIndex(idx)
        ? acc + Number(value || 0) * getFrontValueWeight(idx)
        : acc
    ), 0)
  const rebalanceEditedFrontValues = (values: number[], limit: number, changedIdx: number) => {
    const safe = dotacionFrenteColumns.map((_, idx) => roundFrontValue(Number(values[idx] || 0)))
    const safeLimit = roundFrontValue(limit)
    if (safeLimit <= 0) return safe.map(() => 0)
    const effectiveSum = () => limitedFrontValueSum(safe)
    if (changedIdx >= 0 && changedIdx < safe.length && isFrontValueLimitedIndex(changedIdx)) {
      safe[changedIdx] = Math.min(safe[changedIdx], safeLimit / getFrontValueWeight(changedIdx))
    }
    let overflow = roundFrontValue(effectiveSum() - safeLimit)
    for (let idx = safe.length - 1; idx >= 0 && overflow > 0.0001; idx -= 1) {
      if (idx === changedIdx) continue
      if (!isFrontValueLimitedIndex(idx)) continue
      const weight = getFrontValueWeight(idx)
      const discount = Math.min(safe[idx], overflow / weight)
      safe[idx] = roundFrontValue(safe[idx] - discount)
      overflow = roundFrontValue(overflow - discount * weight)
    }
    if (overflow > 0.0001 && changedIdx >= 0 && changedIdx < safe.length && isFrontValueLimitedIndex(changedIdx)) {
      const weight = getFrontValueWeight(changedIdx)
      safe[changedIdx] = roundFrontValue(safe[changedIdx] - overflow / weight)
    }
    const sum = effectiveSum()
    if (sum > safeLimit + 0.0001) {
      const lastLimitedIdx = Math.max(...safe.map((_value, idx) => isFrontValueLimitedIndex(idx) ? idx : -1))
      if (lastLimitedIdx >= 0) {
        safe[lastLimitedIdx] = roundFrontValue(safe[lastLimitedIdx] - ((sum - safeLimit) / getFrontValueWeight(lastLimitedIdx)))
      }
    }
    return safe
  }
  const trimFrontValuesToLimit = (values: number[], limit: number) => {
    const safe = dotacionFrenteColumns.map((_, idx) => roundFrontValue(Number(values[idx] || 0)))
    let overflow = roundFrontValue(limitedFrontValueSum(safe) - Math.max(0, limit))
    const trimOrder = [0, 1, ...safe.slice(2).map((_value, idx) => idx + 2).reverse()]
    for (const idx of trimOrder) {
      if (overflow <= 0.0001) break
      if (!isFrontValueLimitedIndex(idx)) continue
      const weight = getFrontValueWeight(idx)
      const discount = Math.min(safe[idx], overflow / weight)
      safe[idx] = roundFrontValue(safe[idx] - discount)
      overflow = roundFrontValue(overflow - discount * weight)
    }
    return safe
  }
  const buildOppositeFrontValues = (activeValues: number[], limit: number) => {
    const safeLimit = Math.max(0, roundFrontValue(limit))
    const out = dotacionFrenteColumns.map(() => 0)
    out[0] = roundFrontValue(Math.min(Number(activeValues[0] || 0), safeLimit))
    const reservedByActiveFronts = roundFrontValue(
      Math.max(0, Number(activeValues[0] || 0) * 2) +
      Math.max(0, Number(activeValues[1] || 0)) +
      activeValues.slice(2).reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0)
    )
    out[1] = roundFrontValue(Math.max(0, safeLimit - reservedByActiveFronts))
    return trimFrontValuesToLimit(out, safeLimit)
  }
  const frontDistributionOverrides = parseFrontDistributionOverrides((form as any).v2_front_distribution_overrides)
  const getBaseFrontValues = (row: any) => {
    const values = getDotacionFrenteValues(row as any)
    const rowDynamicFrontValues = Array.isArray((row as any)?.dynamicFrontValues) ? (row as any).dynamicFrontValues : null
    const rowSection = inferFrontDistributionSection(row)
    const canUseLegacyNocFrontValue =
      !hasStructuredDynamicFrontColumns &&
      dynamicFrontColumnLabels.length <= 1 &&
      !rowDynamicFrontValues
    const baseValues = dotacionFrenteColumns.map((_, idx) => {
      if (idx >= 2 && strictSnapshotView && rowDynamicFrontValues && idx - 2 < rowDynamicFrontValues.length) {
        return Number(rowDynamicFrontValues[idx - 2] || 0)
      }
      if (idx >= 2 && !strictSnapshotView && rowSection === "direct") {
        const rowKey = getFrontOverrideRowKey(row, "direct")
        const dynamicColumn = dynamicFrontColumns[idx - 2]
        const directDynamicValue = dynamicColumn
          ? Number(directDynamicFrontDotationByRowKey[rowKey]?.[dynamicColumn.key] || 0)
          : 0
        if (directDynamicValue > 0) return directDynamicValue
      }
      if (idx >= 2 && !strictSnapshotView && rowSection === "indirect") {
        const rowKey = getFrontOverrideRowKey(row, "indirect")
        const dynamicColumn = dynamicFrontColumns[idx - 2]
        const indirectDynamicValue = dynamicColumn
          ? Number(indirectDynamicFrontDotationByRowKey[rowKey]?.[dynamicColumn.key] || 0)
          : 0
        if (indirectDynamicValue > 0) return indirectDynamicValue
      }
      if (
        idx >= 2 &&
        !hasStructuredDynamicFrontColumns &&
        rowDynamicFrontValues &&
        idx - 2 < rowDynamicFrontValues.length &&
        dynamicFrontColumnLabels.length <= 1
      ) {
        return Number(rowDynamicFrontValues[idx - 2] || 0)
      }
      if (idx >= 2 && hasStructuredDynamicFrontColumns && !strictSnapshotView) {
        return 0
      }
      if (idx >= 2 && canUseLegacyNocFrontValue && isUdrDynamicColumn(dotacionFrenteColumns[idx])) {
        return Number(values[2] || 0)
      }
      return Number(values[idx] || 0)
    })
    if (strictSnapshotView) return baseValues
    const rowKey = getFrontOverrideRowKey(row, rowSection)
    const dynamicValuesByColumn = rowSection === "direct"
      ? directDynamicFrontDotationByRowKey[rowKey]
      : indirectDynamicFrontDotationByRowKey[rowKey]
    const totalDynamicDotation = Object.values(dynamicValuesByColumn || {}).reduce(
      (acc, value) => acc + Math.max(0, Number(value || 0)),
      0
    )
    if (totalDynamicDotation <= 0) return baseValues
    const attendanceLimit = getRowTurnoLimit(row, baseValues, rowSection)
    const remainingForBase = Math.max(0, attendanceLimit - totalDynamicDotation)
    baseValues[0] = Math.min(Math.max(0, Number(baseValues[0] || 0)), remainingForBase / 2)
    const remainingAfterIfa = Math.max(0, remainingForBase - (baseValues[0] * getFrontValueWeight(0)))
    baseValues[1] = Math.min(Math.max(0, Number(baseValues[1] || 0)), remainingAfterIfa)
    return baseValues
  }
  const getVisibleFrontValues = (row: any, section: FrontDistributionSection) => {
    const baseValues = getBaseFrontValues(row)
    if (strictSnapshotView) return baseValues
    const overrideValues = frontDistributionOverrides[getFrontOverrideRowKey(row, section)]
    const values = !Array.isArray(overrideValues)
      ? baseValues
      : dotacionFrenteColumns.map((_, idx) => roundFrontValue(Number(overrideValues[idx] ?? baseValues[idx] ?? 0)))
    return trimFrontValuesToLimit(values, getRowTurnoLimit(row, baseValues, section))
  }
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const directSampleRows = (directMatrixRows || []).slice(0, 3).map((row: any) => {
        const rowKey = getFrontOverrideRowKey(row, "direct")
        return {
          rowKey,
          position: row?.position,
          valuesByColumn: (dynamicFrontColumns || []).map((column) => ({
            key: column.key,
            label: column.label,
            value: Number(directDynamicFrontDotationByRowKey[rowKey]?.[column.key] || 0)
          }))
        }
      })
      const indirectSampleRows = (matrixRows || []).slice(0, 3).map((row: any) => {
        const rowKey = getFrontOverrideRowKey(row, "indirect")
        return {
          rowKey,
          position: row?.position,
          valuesByColumn: (dynamicFrontColumns || []).map((column) => ({
            key: column.key,
            label: column.label,
            value: Number(indirectDynamicFrontDotationByRowKey[rowKey]?.[column.key] || 0)
          }))
        }
      })
      console.debug("[daily-report][dynamic-front-values]", {
        columns: (dynamicFrontColumns || []).map((column) => ({
          key: column.key,
          label: column.label,
          sourceReportIds: column.sourceReportIds
        })),
        directSampleRows,
        indirectSampleRows,
        legacyFallbackMayApply: dynamicFrontColumnLabels.length <= 1
      })
    }
  }, [directDynamicFrontDotationByRowKey, directMatrixRows, dynamicFrontColumns, dynamicFrontColumnLabels.length, indirectDynamicFrontDotationByRowKey, matrixRows])
  const parseFrontInputValue = (value: string) => {
    const normalized = String(value || "").replace(",", ".").trim()
    if (!normalized) return 0
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  const handleFrontDistributionChange = (row: any, section: FrontDistributionSection, idx: number, rawValue: string) => {
    const baseValues = getBaseFrontValues(row)
    const rowKey = getFrontOverrideRowKey(row, section)
    const currentValues = getVisibleFrontValues(row, section)
    const rowLimit = getRowTurnoLimit(row, baseValues, section)
    const parsedValue = parseFrontInputValue(rawValue)
    currentValues[idx] = idx === 0
      ? roundFrontValue(Math.min(parsedValue, rowLimit) / 2)
      : parsedValue
    const nextValues = rebalanceEditedFrontValues(currentValues, rowLimit, idx)
    const nextOverridePatch = {
      ...frontDistributionOverrides,
      [rowKey]: nextValues
    }
    onChange("v2_front_distribution_overrides", nextOverridePatch)
  }
  const renderFrontDistributionValue = (row: any, section: FrontDistributionSection, idx: number, value: number) => {
    if (readOnly) return value > 0 ? oneDecimalCell(value) : "-"
    const draftKey = `${getFrontOverrideRowKey(row, section)}::${idx}`
    const draftValue = Object.prototype.hasOwnProperty.call(frontDistributionDrafts, draftKey)
      ? frontDistributionDrafts[draftKey]
      : value > 0
        ? oneDecimalCell(value)
        : ""
    return (
      <TextField
        size="small"
        value={draftValue}
        onChange={(event) => {
          const nextRaw = event.target.value
          setFrontDistributionDrafts((prev) => ({ ...prev, [draftKey]: nextRaw }))
          handleFrontDistributionChange(row, section, idx, nextRaw)
        }}
        onBlur={() => {
          setFrontDistributionDrafts((prev) => {
            const next = { ...prev }
            delete next[draftKey]
            return next
          })
        }}
        inputProps={{
          inputMode: "decimal",
          style: { textAlign: "center", padding: "2px 1px", fontSize: 12 }
        }}
        sx={{
          width: 44,
          "& .MuiInputBase-root": { height: 24, fontSize: 12, background: "rgba(255,255,255,0.72)" },
          "& .MuiInputBase-input": { textAlign: "center" }
        }}
      />
    )
  }
  const sumBaseFrontValues = (values: number[]) =>
    Number(
      (
        Number(values?.[0] || 0) +
        Number(values?.[1] || 0)
      ).toFixed(2)
    )
  const snapshotNumber = (value: unknown) => {
    if (value == null || String(value).trim() === "") return 0
    const parsed = Number(String(value).replace(",", "."))
    return Number.isFinite(parsed) ? parsed : 0
  }
  const shouldUseSavedSnapshotTotal = (row: any) =>
    strictSnapshotView &&
    Object.prototype.hasOwnProperty.call(row as any, "dotacionTotalObra")
  const getVisibleDotTotal = (row: {
    position?: string
    contratados: number
    apoyoOficina: number
    descansoCambioTurno: number
    permisoCovid: number
    dotacionTotalObra?: number
    discipline?: string
    specialty?: string
  }) => {
    if (shouldUseSavedSnapshotTotal(row)) return snapshotNumber((row as any)?.dotacionTotalObra)
    const section = inferFrontDistributionSection(row)
    const vals = getVisibleFrontValues(row as any, section)
    return sumBaseFrontValues(vals)
  }
  const getVisibleHhTotal = (row: {
    position?: string
    contratados: number
    apoyoOficina: number
    descansoCambioTurno: number
    permisoCovid: number
    dotacionTotalObra?: number
    hhTotalObra?: number
    discipline?: string
    specialty?: string
  }) => {
    if (
      strictSnapshotView &&
      Object.prototype.hasOwnProperty.call(row as any, "hhTotalObra")
    ) {
      return snapshotNumber((row as any)?.hhTotalObra)
    }
    return getVisibleDotTotal(row) * personWorkdayHours
  }
  const visibleIndirectDotTotal = matrixRows.reduce((acc, r) => acc + getVisibleDotTotal(r as any), 0)
  const visibleDirectDotTotal = directMatrixRows.reduce((acc, r) => acc + getVisibleDotTotal(r as any), 0)
  const visibleIndirectHhTotal = matrixRows.reduce((acc, r) => acc + getVisibleHhTotal(r as any), 0)
  const visibleDirectHhTotal = directMatrixRows.reduce((acc, r) => acc + getVisibleHhTotal(r as any), 0)
  const visibleOverallDotTotal = visibleIndirectDotTotal + visibleDirectDotTotal
  const visibleOverallHhTotal = visibleIndirectHhTotal + visibleDirectHhTotal

  useEffect(() => {
    if (!onComputedVisibleTotals) return
    onComputedVisibleTotals({
      indirectDot: visibleIndirectDotTotal,
      indirectHh: visibleIndirectHhTotal,
      directDot: visibleDirectDotTotal,
      directHh: visibleDirectHhTotal,
      totalDot: visibleOverallDotTotal,
      totalHh: visibleOverallHhTotal
    })
  }, [
    onComputedVisibleTotals,
    visibleIndirectDotTotal,
    visibleIndirectHhTotal,
    visibleDirectDotTotal,
    visibleDirectHhTotal,
    visibleOverallDotTotal,
    visibleOverallHhTotal
  ])

  useEffect(() => {
    if (!onComputedVisibleRows) return
    const indirect = matrixRows.map((row) => {
      const vals = getVisibleFrontValues(row as any, "indirect")
      const visibleInstalacionFaena = Number(vals?.[0] || 0)
      const visibleFrente = Number(vals?.[1] || 0)
      const visibleNocFront = Number(vals?.[2] || 0)
      const visibleDynamicFrontValues = dotacionFrenteColumns.slice(2).map((_label, idx) => Number(vals?.[idx + 2] || 0))
      const visibleDotTotal = shouldUseSavedSnapshotTotal(row) ? snapshotNumber((row as any)?.dotacionTotalObra) : sumBaseFrontValues(vals)
      const visibleHhTotal = strictSnapshotView && Object.prototype.hasOwnProperty.call(row as any, "hhTotalObra")
        ? snapshotNumber((row as any)?.hhTotalObra)
        : visibleDotTotal * personWorkdayHours
      return {
        ...row,
        instalacionFaena: visibleInstalacionFaena,
        frente: visibleFrente,
        nocFront: visibleNocFront,
        dynamicFrontValues: visibleDynamicFrontValues,
        dotacionTotalObra: visibleDotTotal,
        hhTotalObra: visibleHhTotal
      }
    })
    const direct = directMatrixRows.map((row) => {
      const vals = getVisibleFrontValues(row as any, "direct")
      const visibleInstalacionFaena = Number(vals?.[0] || 0)
      const visibleFrente = Number(vals?.[1] || 0)
      const visibleNocFront = Number(vals?.[2] || 0)
      const visibleDynamicFrontValues = dotacionFrenteColumns.slice(2).map((_label, idx) => Number(vals?.[idx + 2] || 0))
      const visibleDotTotal = shouldUseSavedSnapshotTotal(row) ? snapshotNumber((row as any)?.dotacionTotalObra) : sumBaseFrontValues(vals)
      const visibleHhTotal = strictSnapshotView && Object.prototype.hasOwnProperty.call(row as any, "hhTotalObra")
        ? snapshotNumber((row as any)?.hhTotalObra)
        : visibleDotTotal * personWorkdayHours
      return {
        ...row,
        instalacionFaena: visibleInstalacionFaena,
        frente: visibleFrente,
        nocFront: visibleNocFront,
        dynamicFrontValues: visibleDynamicFrontValues,
        dotacionTotalObra: visibleDotTotal,
        hhTotalObra: visibleHhTotal
      }
    })
    onComputedVisibleRows({
      indirect,
      direct,
      majorEquipment: majorEquipmentRowsWithTotals,
      minorEquipment: minorEqRows
    })
  }, [onComputedVisibleRows, matrixRows, directMatrixRows, majorEquipmentRowsWithTotals, minorEqRows, form.work_front, usePersistedSnapshotValues, (form as any).v2_front_distribution_overrides, (form as any).v2_equipment_front_distribution_overrides])

  const sumFrontColumns = (rows: Array<any>, section: FrontDistributionSection) => {
    const sums = Array.from({ length: dotacionFrenteColumns.length }).map(() => 0)
    rows.forEach((r) => {
      const vals = getVisibleFrontValues(r as any, section)
      dotacionFrenteColumns.forEach((_label, idx) => {
        sums[idx] += Number(vals[idx] || 0)
      })
    })
    return sums
  }
  const totalIndirectFrontColumns = sumFrontColumns(matrixRows as any[], "indirect")
  const totalDirectFrontColumns = sumFrontColumns(directMatrixRows as any[], "direct")
  const totalOverallFrontColumns = dotacionFrenteColumns.map((_, idx) =>
    Number(totalIndirectFrontColumns[idx] || 0) + Number(totalDirectFrontColumns[idx] || 0)
  )
  const getVisibleMaqFrontValues = (row: any) =>
    maquinariaFrenteColumns.map((_, idx) => {
      if (idx === 0) return Number(row?.instalacionFaena || row?.front1 || 0)
      if (idx === 1) return Number(row?.mainFront || row?.front2 || 0)
      if (Array.isArray(row?.dynamicFrontValues) && idx - 2 < row.dynamicFrontValues.length) {
        return Number(row.dynamicFrontValues[idx - 2] || 0)
      }
      return dynamicFrontColumnLabels.length <= 1 ? Number(row?.nocFront || 0) : 0
    })
  const collaboratorTooltipByPositionFront = useMemo(() => {
    const normalize = (value: any) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const parseArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return parsed
          if (parsed && typeof parsed === "object") return Object.values(parsed)
        } catch {}
      }
      if (value && typeof value === "object") return Object.values(value)
      return []
    }
    const parseObject = (value: any): Record<string, any> => {
      if (!value) return {}
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      return typeof value === "object" && !Array.isArray(value) ? value : {}
    }
    const normalizeWorkerTypeLocal = (value: any) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    const inferDisciplineFromTextLocal = (value: any) => {
      const t = String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
      if (!t) return "GENERAL"
      if (t.includes("civil") || t.includes("obras civiles")) return "OBRA CIVILES"
      if (t.includes("electric")) return "ELECTRICO"
      if (t.includes("mecanic")) return "MECANICO"
      if (t.includes("caner") || t.includes("caner") || t.includes("hdpe")) return "CAÑERIA"
      if (t.includes("andam")) return "ANDAMIOS"
      if (t.includes("estruct")) return "ESTRUCTURA"
      if (t.includes("rigger")) return "RIGGER"
      if (t.includes("topogra")) return "TOPOGRAFIA"
      return "GENERAL"
    }
    const rowTooltipKey = (row: any) => {
      const pos = String(row?.position || "").trim()
      const isDirectRow =
        Object.prototype.hasOwnProperty.call(row || {}, "specialty") ||
        Object.prototype.hasOwnProperty.call(row || {}, "discipline")
      if (!isDirectRow) return normalize(pos)
      const disc = normalizeDirectKeyToken(row?.discipline || row?.specialty || "GENERAL") || "GENERAL"
      const spec = normalizeSpecialtyLabel(row?.specialty, row?.discipline, row?.position)
      return buildDirectFrontKey(disc, spec, pos)
    }
    const visibleRowKeys = new Set([...matrixRows, ...directMatrixRows].map((row: any) => rowTooltipKey(row)))
    const frontIndexFromResolved = (front: string | null) => {
      const activeFront = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
      if (front === "IFA") return 0
      if (front === activeFront) return 1
      if (front === `NOC_${activeFront}`) return 2
      return -1
    }
    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaboratorsForTooltip || []).forEach((c: any) => {
      const id = String(c?.id || "").trim()
      if (id) collaboratorById.set(id, c)
    })
    const collabIdByName = new Map<string, string>()
    ;(collaboratorsForTooltip || []).forEach((c: any) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      const fullName = normalize(`${String(c?.first_name || "").trim()} ${String(c?.last_name || "").trim()}`)
      if (fullName) collabIdByName.set(fullName, id)
    })
    const resolveParticipantId = (idOrName: any) => {
      const raw = String(idOrName || "").trim()
      if (!raw) return ""
      if (collaboratorById.has(raw)) return raw
      return collabIdByName.get(normalize(raw)) || raw
    }
    const personName = (idOrName: any, fallback?: any) => {
      const raw = resolveParticipantId(idOrName)
      const collab = raw ? collaboratorById.get(raw) : null
      const collabName = collab ? `${String(collab.first_name || "").trim()} ${String(collab.last_name || "").trim()}`.trim() : ""
      return collabName || String(fallback || raw || "Sin nombre").trim()
    }
    const contributorRowKey = (person: any, collab: any) => {
      const position = String(person?.position || person?.role || collab?.position || "").trim()
      if (!position) return ""
      const workerType = normalizeWorkerTypeLocal(collab?.worker_type || person?.worker_type)
      const isCapataz = normalize(position).includes("CAPATAZ")
      const isDirect = workerType === "directo" || isCapataz || (!workerType && Boolean(person?.discipline || person?.specialty))
      if (!isDirect) return normalize(position)
      const specialty = normalizeSpecialtyLabel(person?.specialty || collab?.specialty, person?.discipline || collab?.discipline, position)
      const isRigger = normalize(`${specialty} ${position}`).includes("RIGGER")
      const discipline = isRigger
        ? "RIGGER"
        : normalizeDirectKeyToken(person?.discipline || collab?.discipline || inferDisciplineFromTextLocal(specialty || position))
      return buildDirectFrontKey(discipline, specialty, position)
    }
    const normalizeFront = (value: any, reportId: string): "IFA" | "CANALETAS" | "PISCINAS" | "NOC_CANALETAS" | "NOC_PISCINAS" | null => {
      const assigned = nocFrontAssignment?.byReportId?.get(reportId)
      if (assigned === "PISCINAS") return "NOC_PISCINAS"
      if (assigned === "CANALETAS") return "NOC_CANALETAS"
      const text = normalize(value)
      if (!text) return null
      if (text.includes("INSTALACION") || text === "IFA") return "IFA"
      if (text.includes("PISCIN")) return "PISCINAS"
      if (text.includes("CANALET")) return "CANALETAS"
      if (text.includes("UDR") || text.includes("USO DE RECURSOS") || text.includes("NOC")) {
        const activeFront = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
        return activeFront === "PISCINAS" ? "NOC_PISCINAS" : "NOC_CANALETAS"
      }
      return null
    }
    const add = (map: Map<string, Set<string>>, rowKey: string, frontIdx: number, label: string) => {
      if (frontIdx < 0 || !label) return
      const key = `${rowKey}__${frontIdx}`
      const current = map.get(key) || new Set<string>()
      current.add(label)
      map.set(key, current)
    }
    const out = new Map<string, Set<string>>()
    ;(fieldReportsForDate || []).forEach((report: any) => {
      const reportId = String(report?.id || "").trim()
      const reportLabel = String(report?.report_title || report?.work_front || report?.crew_name || "Reporte terreno").trim()
      const personnel = parseArray(report?.personnel)
      const personnelById = new Map<string, any>()
      personnel.forEach((p: any, idx: number) => {
        const id = String(p?.id || p?.collaborator_id || p?.user_id || p?.personId || idx).trim()
        const fullName = `${String(p?.first_name || p?.name || "").trim()} ${String(p?.last_name || "").trim()}`.trim()
        const resolvedNameId = fullName ? resolveParticipantId(fullName) : ""
        if (id) personnelById.set(resolveParticipantId(id), p)
        if (resolvedNameId) personnelById.set(resolvedNameId, p)
      })
      const personHours = parseObject(report?.person_hours)
      const personHoursByParticipantId: Record<string, any> = {}
      Object.entries(personHours || {}).forEach(([rawKey, hours]) => {
        if (!rawKey || rawKey === "__extras") return
        const pid = resolveParticipantId(rawKey)
        if (pid) personHoursByParticipantId[pid] = hours
      })
      const activityRows = mergeFieldReportActivityRowsForFrontCalc(parseArray(report?.assignments), parseArray(report?.activities))
      const reportFront = normalizeFront(report?.work_front || report?.front || report?.frente || report?.area || report?.report_title, reportId)
      const rowFronts = activityRows.map((activity: any) => {
        const rawFront = activity?.activity_front || activity?.work_front || activity?.front || activity?.frente || activity?.area || activity?.work_area || activity?.sector
        return normalizeFront(rawFront, reportId) || reportFront
      })
      const participantIds = new Set<string>()
      Object.keys(personHours || {}).forEach((id) => {
        if (!id || id === "__extras") return
        const pid = resolveParticipantId(id)
        if (pid) participantIds.add(pid)
      })
      parseArray(report?.personnel_ids).forEach((id: any) => {
        const clean = resolveParticipantId(id)
        if (clean) participantIds.add(clean)
      })
      personnelById.forEach((_p, id) => participantIds.add(id))

      Array.from(participantIds).forEach((pid) => {
        const p = personnelById.get(pid) || {}
        const collab = collaboratorById.get(pid) as any
        const rowKey = contributorRowKey(p, collab)
        if (!rowKey || !visibleRowKeys.has(rowKey)) return
        const displayName = personName(pid, p?.name || `${p?.first_name || ""} ${p?.last_name || ""}`.trim())
        const hours = Array.isArray(personHoursByParticipantId?.[pid]) ? personHoursByParticipantId[pid] : []
        const positiveFronts = new Set<number>()
        hours.forEach((raw: any, idx: number) => {
          if (!(Number(raw || 0) > 0)) return
          positiveFronts.add(frontIndexFromResolved(rowFronts[idx]))
        })
        if (positiveFronts.size === 0) positiveFronts.add(frontIndexFromResolved(reportFront))
        const sourceRow = [...matrixRows, ...directMatrixRows].find((row: any) => rowTooltipKey(row) === rowKey)
        if (!sourceRow) return
        positiveFronts.forEach((frontIdx) => {
          const value = Number(getDotacionFrenteValues(sourceRow as any)[frontIdx] || 0)
          if (value > 0) add(out, rowKey, frontIdx, `${displayName} (${reportLabel})`)
        })
      })
    })
    ;(dailyStatusRowsForTooltip || []).forEach((daily: any) => {
      const collab = {
        ...(collaboratorById.get(String(daily?.collaborator_id || "").trim()) || {}),
        ...((daily?.collaborator || {}) as any)
      } as any
      const pid = String(collab?.id || daily?.collaborator_id || "").trim()
      if (!pid) return
      const status = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = String(daily?.status || "").trim().toUpperCase()
      if (!(status === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11")) return
      if (normalizeWorkerTypeLocal(collab?.worker_type) === "directo") return
      const rowKey = contributorRowKey({}, collab)
      if (!rowKey || !visibleRowKeys.has(rowKey)) return
      const sourceRow = matrixRows.find((row: any) => rowTooltipKey(row) === rowKey)
      if (!sourceRow) return
      const frontIdx = 0
      const value = Number(getDotacionFrenteValues(sourceRow as any)[frontIdx] || 0)
      if (value > 0) add(out, rowKey, frontIdx, personName(pid))
    })
    return out
  }, [fieldReportsForDate, collaboratorsForTooltip, dailyStatusRowsForTooltip, nocFrontAssignment, form.work_front, matrixRows, directMatrixRows])
  const getFrontCellNames = (row: any, frontIdx: number) => {
    const rowKey =
      Object.prototype.hasOwnProperty.call(row || {}, "specialty") ||
      Object.prototype.hasOwnProperty.call(row || {}, "discipline")
        ? buildDirectFrontKey(
            normalizeDirectKeyToken((row as any)?.discipline || (row as any)?.specialty || "GENERAL") || "GENERAL",
            normalizeSpecialtyLabel((row as any)?.specialty, (row as any)?.discipline, row?.position),
            row?.position
          )
        : String(row?.position || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim()
    const names = Array.from(collaboratorTooltipByPositionFront.get(`${rowKey}__${frontIdx}`) || [])
    return Array.from(new Set(names.map((name) => String(name || "").trim()).filter(Boolean)))
  }
  const getFrontCellTooltip = (row: any, section: FrontDistributionSection, frontIdx: number, rowLimit: number, currentValues: number[], columnLabel: string) => {
    const names = getFrontCellNames(row, frontIdx)
    const counterpartInfo = getFrontCounterpartInfo?.(row, section) || null
    const currentFront = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
    const currentValue = Number(currentValues?.[frontIdx] || 0)
    const isFixedDotacionColumn = frontIdx === 0 || frontIdx === 1
    const hasCounterpartColumn = Boolean(counterpartInfo && isFixedDotacionColumn && frontIdx < counterpartInfo.values.length)
    const counterpartValue = hasCounterpartColumn ? Number(counterpartInfo?.values?.[frontIdx] || 0) : 0
    const currentDistributed = (currentValues || []).reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0)
    const counterpartDistributed = counterpartInfo
      ? (counterpartInfo.values || []).reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0)
      : 0
    const distributed = Number((currentDistributed + counterpartDistributed).toFixed(2))
    const available = Number(Math.max(0, Number(rowLimit || 0) - distributed).toFixed(2))
    const excess = Number(Math.max(0, distributed - Number(rowLimit || 0)).toFixed(2))
    const normalizeTooltipText = (value: string) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase()
    const groupedNames = names.reduce<Array<{ source: string; names: string[] }>>((acc, rawName) => {
      const normalized = normalizeTooltipText(rawName)
      if (!normalized) return acc
      const match = normalized.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
      const personName = normalizeTooltipText(match?.[1] || normalized)
      const source = normalizeTooltipText(match?.[2] || "")
      if (!personName) return acc
      const existing = acc.find((group) => group.source === source)
      if (existing) {
        if (!existing.names.includes(personName)) existing.names.push(personName)
      } else {
        acc.push({ source, names: [personName] })
      }
      return acc
    }, [])
    return (
      <Box sx={{ maxWidth: "min(620px, calc(100vw - 32px))", p: 0.75 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75, lineHeight: 1.2 }}>
          Dotación de frente
        </Typography>
        <Typography variant="caption" sx={{ display: "block", color: "rgba(255,255,255,0.78)", lineHeight: 1.2, mb: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Columna: {normalizeTooltipText(columnLabel) || "-"}
        </Typography>
        <Box sx={{ mb: 1, borderTop: "1px solid rgba(255,255,255,0.18)", pt: 0.75 }}>
          {/* <Typography variant="caption" sx={{ display: "block", fontWeight: 700, color: "rgba(255,255,255,0.82)", mb: 0.35 }}>
            Declarado por
          </Typography> */}
          {groupedNames.length > 0 ? (
            <Box
              sx={{
                maxHeight: 220,
                overflowY: "auto",
                pr: 0.5
              }}
            >
              {groupedNames.map((group, groupIdx) => (
                <Box key={`${group.source || "sin-fuente"}-${groupIdx}`} sx={{ mb: groupIdx === groupedNames.length - 1 ? 0 : 0.85 }}>
                  {group.source ? (
                    <Typography variant="caption" sx={{ display: "block", fontWeight: 800, color: "rgba(255,255,255,0.92)", lineHeight: 1.2, mb: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {group.source}
                    </Typography>
                  ) : groupedNames.length > 1 ? (
                    <Typography variant="caption" sx={{ display: "block", fontWeight: 800, color: "rgba(255,255,255,0.72)", lineHeight: 1.2, mb: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      SIN FUENTE
                    </Typography>
                  ) : null}
                  <Box component="ul" sx={{ m: 0, pl: 1.8 }}>
                    {group.names.map((name) => (
                      <Typography component="li" variant="caption" key={`${group.source}-${name}`} sx={{ lineHeight: 1.25, mb: 0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {name}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="caption" sx={{ display: "block", color: "rgba(255,255,255,0.68)", lineHeight: 1.25 }}>
              Sin declarantes asociados
            </Typography>
          )}
        </Box>
        <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.18)", pt: 0.65 }}>
          <Typography variant="caption" sx={{ display: "block", fontWeight: 700, color: "rgba(255,255,255,0.82)", mb: 0.35 }}>
            Contraparte
          </Typography>
          {counterpartInfo ? (
            <Box sx={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 1.5, rowGap: 0.25, mb: 0.8 }}>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.72)" }}>Frente actual</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, textAlign: "right" }}>{currentFront}: {numericCell(currentValue)}</Typography>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.72)" }}>Contraparte</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, textAlign: "right", color: hasCounterpartColumn ? "inherit" : "rgba(255,255,255,0.68)" }}>
                {hasCounterpartColumn ? `${counterpartInfo.counterpartFront}: ${numericCell(counterpartValue)}` : "Columna no disponible en contraparte"}
              </Typography>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.72)" }}>Distribuido fila</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, textAlign: "right" }}>{numericCell(distributed)}</Typography>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.72)" }}>{excess > 0 ? "Exceso fila" : "Disponible fila"}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, textAlign: "right", color: excess > 0 ? "#fecaca" : "inherit" }}>
                {excess > 0 ? numericCell(excess) : numericCell(available)}
              </Typography>
            </Box>
          ) : (
            <Typography variant="caption" sx={{ display: "block", color: "rgba(255,255,255,0.68)", lineHeight: 1.25, mb: 0.8 }}>
              Sin datos contraparte
            </Typography>
          )}
          <Typography variant="caption" sx={{ display: "block", fontWeight: 700, color: "rgba(255,255,255,0.82)" }}>
            Máximo fila
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            {numericCell(rowLimit)}
          </Typography>
        </Box>
      </Box>
    )
  }
  const renderMinorCells = (row?: MinorEquipmentRow) => (
    <>
      <td style={{ ...valueCellSx, color: row?.name ? "#c2410c" : undefined, fontWeight: row?.name ? 600 : 400 }}>{String(row?.name || "-").toUpperCase()}</td>
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.hmTurnoDia, false) : "-"}</td>
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.totalEquipos, false) : "-"}</td>
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.operacion) : "-"}</td>
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.disponibles) : "-"}</td>
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.acredMant) : "-"}</td>
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.panne) : "-"}</td>
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.oficinaFuera) : "-"}</td>
      {maquinariaFrenteColumns.map((_, idx) => {
        const value = row ? Number(getVisibleMaqFrontValues(row)[idx] || 0) : 0
        return (
          <td
            key={`minor-front-${row?.name || "empty"}-${idx}`}
            style={{
              ...valueCellSx,
              textAlign: "center",
              ...(nocMaquinariaIndexes.includes(idx) ? { background: nocSoftCellBg } : {})
            }}
            title={row ? `Máximo fila: ${numericCell(getEquipmentFrontLimit(row, getBaseEquipmentFrontValues(row, "minor")))}` : undefined}
          >
            {row ? renderEquipmentFrontValue(row, "minor", idx, value) : "-"}
          </td>
        )
      })}
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.totalEqObra, false) : "-"}</td>
      <td style={{ ...valueCellSx, textAlign: "center" }}>{row ? renderMinorValue(row.hmTotal, false) : "-"}</td>
    </>
  )

  return (
    <Box sx={{ border: "1px solid #111", mt: 0 }}>
      {!hasEquipmentSnapshotForDate ? (
        <Alert severity="warning" sx={{ m: 1 }}>
          No existe snapshot de Maquinaria/Equipos para esta fecha. Este reporte no usará valores globales.
        </Alert>
      ) : null}
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: V2_LAYOUT_MIN_WIDTH }}>
        <tbody>
          <tr>
            <td style={{ ...laborBlueBandSx, textAlign: "left" }} colSpan={personalColumns.length + dotacionFrenteColumns.length + equiposColumns.length + maquinariaFrenteColumns.length + 7}>
              3.- DETALLE DE PERSONAL Y EQUIPOS
            </td>
          </tr>
          <tr>
            <td style={{ ...laborTitleCellSx, background: "#b7e6b9" }} rowSpan={2}>PERSONAL</td>
            {personalColumns.map((label) => (
              <td key={`p-${label}`} style={{ ...headVertical, background: "#b7e6b9" }} rowSpan={2}>
                <div style={verticalHeadText}>{label}</div>
              </td>
            ))}
            <td style={{ ...laborTitleCellSx, background: "#ecef98", borderBottom: "1px solid #111" }} colSpan={dotacionFrenteColumns.length}>DOTACIÓN POR FRENTE</td>
            <td style={{ ...headVertical, background: "#ecef98" }} rowSpan={2}>
              <div style={verticalHeadText}>DOTACIÓN TOTAL OBRA</div>
            </td>
            <td style={{ ...headVertical, background: "#ecef98" }} rowSpan={2}>
              <div style={verticalHeadText}>HH TOTAL OBRA</div>
            </td>
            <td style={{ ...laborTitleCellSx, background: "#b7e6b9" }} rowSpan={2}>EQUIPOS</td>
            {equiposColumns.map((label) => (
              <td
                key={`e-${label}`}
                style={{
                  ...(label === "HM TURNO/DÍA" || label === "TOTAL EQUIPOS" ? compactVerticalHead : headVertical),
                  background: "#b7e6b9"
                }}
                rowSpan={2}
              >
                <div style={verticalHeadText}>{label}</div>
              </td>
            ))}
            <td style={{ ...laborTitleCellSx, background: "#ecef98", borderBottom: "1px solid #111" }} colSpan={maquinariaFrenteColumns.length}>MAQUINARIA POR FRENTE</td>
            <td style={{ ...headVertical, background: "#ecef98" }} rowSpan={2}>
              <div style={verticalHeadText}>TOTAL EQUIPOS Y MAQUINARIA OBRA</div>
            </td>
            <td style={{ ...headVertical, background: "#ecef98" }} rowSpan={2}>
              <div style={verticalHeadText}>HM TOTAL OBRA</div>
            </td>
          </tr>
          <tr>
            {dotacionFrenteColumns.map((label) => (
              <td
                key={`df-${label}`}
                style={{
                  ...headVertical,
                  background: isUdrDynamicColumn(label) ? udrHeaderBg : "#ecef98"
                }}
              >
                <div style={verticalHeadText}>{label}</div>
              </td>
            ))}
            {maquinariaFrenteColumns.map((label) => (
              <td
                key={`mf-${label}`}
                style={{
                  ...headVertical,
                  background: isUdrDynamicColumn(label) ? udrHeaderBg : "#ecef98"
                }}
              >
                <div style={verticalHeadText}>{label}</div>
              </td>
            ))}
          </tr>

          <tr>
            <td style={{ ...laborBlueBandSx, textAlign: "left", background: "#f7ef06", color: "#0f2c7d" }} colSpan={leftSectionCols}>
              1.- PERSONAL INDIRECTO
            </td>
            <td style={{ ...laborBlueBandSx, textAlign: "left", background: "#f7ef06", color: "#0f2c7d" }} colSpan={rightSectionCols}>
              1.- EQUIPO MAYOR DE CONSTRUCCIÓN
            </td>
          </tr>
          {matrixRows.map((row, rowIndex) => (
            <tr key={`indirect-row-${rowIndex}-${row.position}`}>
              <td style={valueCellSx}>{formatDailyReportPositionLabel(row.position)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.hhTurnoDia)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.contratados)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.contratacionProceso)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.apoyoOficina)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.descansoCambioTurno)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.permisoCovid)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.renunciaVoluntaria)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.terminoContrato)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.enCurso3d)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.capacitacionAcreditacion)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.teletrabajo)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.pruebaPractica)}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.ofertaComercial)}</td>
              {getVisibleFrontValues(row, "indirect").map((frontValue, idx, frontValues) => (
                <td
                  key={`pfront-${rowIndex}-${idx}`}
                  style={{
                    ...valueCellSx,
                    textAlign: "center",
                    ...(nocDotacionIndexes.includes(idx) ? { background: nocSoftCellBg } : {})
                  }}
                >
                  <Tooltip
                    arrow
                    placement="top"
                    title={frontCellTooltipDisabled ? "" : getFrontCellTooltip(row, "indirect", idx, getRowTurnoLimit(row, getBaseFrontValues(row), "indirect"), frontValues, String(dotacionFrenteColumns[idx] || ""))}
                  >
                    <Box component="span" sx={{ display: "inline-flex", justifyContent: "center", width: "100%" }}>
                      {renderFrontDistributionValue(row, "indirect", idx, frontValue)}
                    </Box>
                  </Tooltip>
                </td>
              ))}
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(getVisibleDotTotal(row))}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(getVisibleHhTotal(row))}</td>

              {(() => {
                const eqRow = majorEquipmentRowsWithTotals[rowIndex]
                return (
                  <>
                    <td style={valueCellSx}>{String(eqRow?.name || "-").toUpperCase()}</td>
                    {equiposColumns.map((_, idx) => (
                      <td key={`eq-${rowIndex}-${idx}`} style={{ ...valueCellSx, textAlign: "center" }}>
                        {!eqRow
                          ? "-"
                          : idx === 0
                            ? oneDecimalCell(eqRow.hmTurnoDia)
                            : idx === 1
                              ? oneDecimalCell(eqRow.totalEquipos)
                              : idx === 2
                                ? oneDecimalCell(eqRow.operacion)
                                : idx === 3
                                  ? oneDecimalCell(eqRow.disponibles)
                                  : idx === 4
                                    ? oneDecimalCell(eqRow.acredMant)
                                    : idx === 5
                                      ? oneDecimalCell(eqRow.panne)
                                      : idx === 6
                                        ? oneDecimalCell(eqRow.ofCentral)
                                        : "-"}
                      </td>
                    ))}
                    {maquinariaFrenteColumns.map((_, idx) => (
                      <td
                        key={`mfront-${rowIndex}-${idx}`}
                        title={eqRow ? `Máximo fila: ${numericCell(getEquipmentFrontLimit(eqRow, getBaseEquipmentFrontValues(eqRow, "major")))}` : undefined}
                        style={{
                          ...valueCellSx,
                          textAlign: "center",
                          ...(nocMaquinariaIndexes.includes(idx) ? { background: nocSoftCellBg } : {})
                        }}
                      >
                        {!eqRow
                          ? "-"
                          : (() => {
                              const value = Number(getVisibleMaqFrontValues(eqRow)[idx] || 0)
                              return renderEquipmentFrontValue(eqRow, "major", idx, value)
                            })()}
                      </td>
                    ))}
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{eqRow ? oneDecimalCell(Number(eqRow.totalEqMaq || 0)) : "-"}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{eqRow ? oneDecimalCell(Number(eqRow.hmTotal || 0)) : "-"}</td>
                  </>
                )
              })()}
            </tr>
          ))}
          <tr>
            <td style={{ ...laborSubtotalCellSx, background: "#f7ef06", color: "#0f2c7d", textAlign: "left" }}>TOTAL INDIRECTO</td>
            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.contratados)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.contratacionProceso)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.apoyoOficina)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.descansoCambioTurno)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.permisoCovid)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.renunciaVoluntaria)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.terminoContrato)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.enCurso3d)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.capacitacionAcreditacion)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.teletrabajo)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.pruebaPractica)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalIndirect.ofertaComercial)}</td>
            {totalIndirectFrontColumns.map((frontValue, idx) => (
              <td key={`tot-pfront-${idx}`} style={laborSubtotalCellSx}>
                {oneDecimalCell(frontValue, true)}
              </td>
            ))}
            <td style={laborSubtotalCellSx}>{oneDecimalCell(visibleIndirectDotTotal)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(visibleIndirectHhTotal)}</td>
            <td style={{ ...laborSubtotalCellSx, textAlign: "left" }}>TOTAL E. MAYORES</td>
            {equiposColumns.map((_, idx) => (
              <td key={`tot-eq-${idx}`} style={laborSubtotalCellSx}>
                {idx === 0
                  ? oneDecimalCell(majorTotals.hmTurnoDia)
                  : idx === 1
                    ? oneDecimalCell(majorTotals.totalEquipos)
                    : idx === 2
                      ? oneDecimalCell(majorTotals.operacion)
                      : idx === 3
                        ? oneDecimalCell(majorTotals.disponibles)
                        : idx === 4
                          ? oneDecimalCell(majorTotals.acredMant)
                          : idx === 5
                            ? oneDecimalCell(majorTotals.panne)
                            : idx === 6
                              ? oneDecimalCell(majorTotals.ofCentral)
                              : ""}
              </td>
            ))}
            {maquinariaFrenteColumns.map((_, idx) => (
              <td key={`tot-mf-${idx}`} style={laborSubtotalCellSx}>
                {oneDecimalCell(Number(getVisibleMaqFrontValues(majorTotals)[idx] || 0))}
              </td>
            ))}
            <td style={laborSubtotalCellSx}>{oneDecimalCell(majorTotals.totalEqMaq)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(majorTotals.hmTotal)}</td>
          </tr>

          <tr>
            <td style={{ ...laborBlueBandSx, textAlign: "left", background: "#f7ef06", color: "#0f2c7d" }} colSpan={leftSectionCols}>
              2.- PERSONAL DIRECTO
            </td>
            <td style={{ ...laborBlueBandSx, textAlign: "left", background: "#f7ef06", color: "#0f2c7d" }} colSpan={rightSectionCols}>
              2.- EQUIPO MENOR DE CONSTRUCCIÓN Y MOVILIZACIÓN
            </td>
          </tr>

          {orderedDirectSpecialties.length === 0 ? (
            <tr>
              <td style={valueCellSx}>SIN PERSONAL DIRECTO</td>
              {personalColumns.map((_, idx) => (
                <td key={`direct-empty-${idx}`} style={{ ...valueCellSx, textAlign: "center" }}>0</td>
              ))}
              {dotacionFrenteColumns.map((_, idx) => (
                <td
                  key={`direct-empty-front-${idx}`}
                  style={{
                    ...valueCellSx,
                    textAlign: "center",
                    ...(nocDotacionIndexes.includes(idx) ? { background: nocSoftCellBg } : {})
                  }}
                >
                  -
                </td>
              ))}
              <td style={{ ...valueCellSx, textAlign: "center" }}>0</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>0</td>
              {renderMinorCells(minorEqRows[0])}
            </tr>
          ) : (
            (() => {
              let minorRowCursor = 0
              const takeMinorRow = () => {
                const row = minorEqRows[minorRowCursor]
                minorRowCursor += 1
                return row
              }
              return orderedDirectSpecialties.flatMap((specialty, sIdx) => {
              const rows = groupedDirectRows[specialty] || []
              const out: React.ReactNode[] = []
              const normalizedSpecialty = String(specialty || '').trim().toUpperCase()
              const shouldRenderSpecialtyRow = normalizedSpecialty !== '' && normalizedSpecialty !== 'GENERAL'
              if (shouldRenderSpecialtyRow) {
                out.push(
                  <tr key={`direct-specialty-${specialty}-${sIdx}`}>
                    <td style={{ ...valueCellSx, background: "#eef0c8", color: "#b45309", fontWeight: 700 }} colSpan={leftSectionCols}>
                      {`PERSONAL ${specialty.toUpperCase()}`}
                    </td>
                    {renderMinorCells(takeMinorRow())}
                  </tr>
                )
              }
              rows.forEach((row, rowIdx) => {
                out.push(
                  <tr key={`direct-row-${specialty}-${row.position}-${rowIdx}`}>
                    <td style={{ ...valueCellSx, color: "#c2410c", fontWeight: 600 }}>{formatDailyReportPositionLabel(row.position)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.hhTurnoDia)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.contratados)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.contratacionProceso)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.apoyoOficina)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.descansoCambioTurno)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.permisoCovid)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.renunciaVoluntaria)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.terminoContrato)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.enCurso3d)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.capacitacionAcreditacion)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.teletrabajo)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.pruebaPractica)}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(row.ofertaComercial)}</td>
                    {getVisibleFrontValues(row as any, "direct").map((frontValue, idx, frontValues) => (
                      <td
                        key={`direct-front-${specialty}-${rowIdx}-${idx}`}
                        style={{
                          ...valueCellSx,
                          textAlign: "center",
                          ...(nocDotacionIndexes.includes(idx) ? { background: nocSoftCellBg } : {})
                        }}
                      >
                        <Tooltip
                          arrow
                          placement="top"
                          title={frontCellTooltipDisabled ? "" : getFrontCellTooltip(row, "direct", idx, getRowTurnoLimit(row, getBaseFrontValues(row), "direct"), frontValues, String(dotacionFrenteColumns[idx] || ""))}
                        >
                          <Box component="span" sx={{ display: "inline-flex", justifyContent: "center", width: "100%" }}>
                            {renderFrontDistributionValue(row, "direct", idx, frontValue)}
                          </Box>
                        </Tooltip>
                      </td>
                    ))}
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(getVisibleDotTotal(row as any))}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{oneDecimalCell(getVisibleHhTotal(row as any))}</td>
                    {renderMinorCells(takeMinorRow())}
                  </tr>
                )
              })
              return out
              })
            })()
          )}

          <tr>
            <td style={{ ...laborSubtotalCellSx, background: "#f7c9a9", color: "#0f2c7d", textAlign: "left" }}>TOTAL DIRECTOS</td>
            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.contratados)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.contratacionProceso)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.apoyoOficina)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.descansoCambioTurno)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.permisoCovid)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.renunciaVoluntaria)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.terminoContrato)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.enCurso3d)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.capacitacionAcreditacion)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.teletrabajo)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.pruebaPractica)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(totalDirect.ofertaComercial)}</td>
            {totalDirectFrontColumns.map((frontValue, idx) => (
              <td key={`tot-direct-front-${idx}`} style={laborSubtotalCellSx}>
                {oneDecimalCell(frontValue, true)}
              </td>
            ))}
            <td style={laborSubtotalCellSx}>{oneDecimalCell(visibleDirectDotTotal)}</td>
            <td style={laborSubtotalCellSx}>{oneDecimalCell(visibleDirectHhTotal)}</td>
            <td style={{ ...rightDetachedTotalSx, background: "#f7c9a9", color: "#0f2c7d" }}>TOTAL E. MENORES</td>
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.hmTurnoDia)}</td>
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.totalEquipos)}</td>
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.operacion)}</td>
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.disponibles)}</td>
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.acredMant)}</td>
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.panne)}</td>
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.oficinaFuera)}</td>
            {maquinariaFrenteColumns.map((_, idx) => (
              <td key={`tot-minor-maq-${idx}`} style={rightDetachedTotalSx}>
                {oneDecimalCell(Number(getVisibleMaqFrontValues(minorTotals)[idx] || 0))}
              </td>
            ))}
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.totalEqObra)}</td>
            <td style={rightDetachedTotalSx}>{oneDecimalCell(minorTotals.hmTotal)}</td>
          </tr>

          <tr>
            <td style={{ ...valueCellSx, fontWeight: 700 }} colSpan={leftSectionCols}>SUBCONTRATOS</td>
            <td style={{ ...valueCellSx, borderLeft: "1px solid #111" }} colSpan={rightSectionCols}></td>
          </tr>
          <tr>
            <td style={{ ...laborSubtotalCellSx, textAlign: "left" }} colSpan={leftSectionCols}>TOTAL SUBCONTRATOS</td>
            <td style={{ ...laborSubtotalCellSx, borderLeft: "1px solid #111" }} colSpan={rightSectionCols}></td>
          </tr>
          <tr>
            <td style={{ ...totalRowSx, textAlign: "left" }}>TOTAL</td>
            <td style={totalRowSx}></td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.contratados)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.contratacionProceso)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.apoyoOficina)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.descansoCambioTurno)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.permisoCovid)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.renunciaVoluntaria)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.terminoContrato)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.enCurso3d)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.capacitacionAcreditacion)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.teletrabajo)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.pruebaPractica)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverall.ofertaComercial)}</td>
            {totalOverallFrontColumns.map((frontValue, idx) => (
              <td key={`tot-overall-front-${idx}`} style={totalRowSx}>
                {oneDecimalCell(frontValue, true)}
              </td>
            ))}
            <td style={totalRowSx}>{oneDecimalCell(visibleOverallDotTotal)}</td>
            <td style={totalRowSx}>{oneDecimalCell(visibleOverallHhTotal)}</td>
            <td style={{ ...totalRowSx, textAlign: "left", borderLeft: "1px solid #111" }}>TOTAL</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipHmTurnoDia)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipos)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipOperacion)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipDisponibles)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipAcredMant)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipPanne)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipOfCentral)}</td>
            {maquinariaFrenteColumns.map((_, idx) => (
              <td key={`tot-overall-maq-${idx}`} style={totalRowSx}>
                {oneDecimalCell(totalOverallEquipFrontValues[idx])}
              </td>
            ))}
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipQty)}</td>
            <td style={totalRowSx}>{oneDecimalCell(totalOverallEquipHm)}</td>
          </tr>
        </tbody>
      </table>
    </Box>
  )
}

function SummaryInformationToDateV2({
  form,
  onChange,
  metrics,
  signerOptions,
  readOnly = false
}: {
  form: DailyForm
  onChange: (key: keyof DailyForm, value: any) => void
  metrics: {
    previous: {
      indirectDot: number
      indirectHh: number
      directDot: number
      directHh: number
      majorQty: number
      majorHm: number
      minorQty: number
      minorHm: number
    }
    current: {
      indirectDot: number
      indirectHh: number
      directDot: number
      directHh: number
      majorQty: number
      majorHm: number
      minorQty: number
      minorHm: number
    }
  }
  signerOptions: {
    prepared: Array<{ name: string; role: string; signatureUrl?: string }>
    approved: Array<{ name: string; role: string; signatureUrl?: string }>
  }
  readOnly?: boolean
}) {
  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return "0"
    const hasDecimals = Math.abs(n % 1) > 0.0001
    return hasDecimals ? n.toFixed(2).replace(".", ",") : String(Math.round(n))
  }
  const totalPrevDot = metrics.previous.indirectDot + metrics.previous.directDot
  const totalPrevHh = metrics.previous.indirectHh + metrics.previous.directHh
  const totalCurrDot = metrics.current.indirectDot + metrics.current.directDot
  const totalCurrHh = metrics.current.indirectHh + metrics.current.directHh
  const equipQtyFromHm = (hm: number) => Number(resolveMachineDotationFromHours(hm, form).toFixed(2))
  const prevMajorEquipQty = equipQtyFromHm(metrics.previous.majorHm)
  const prevMinorEquipQty = equipQtyFromHm(metrics.previous.minorHm)
  const currMajorEquipQty = equipQtyFromHm(metrics.current.majorHm)
  const currMinorEquipQty = equipQtyFromHm(metrics.current.minorHm)
  const totalPrevEquipQty = prevMajorEquipQty + prevMinorEquipQty
  const totalPrevEquipHm = metrics.previous.majorHm + metrics.previous.minorHm
  const totalCurrEquipQty = currMajorEquipQty + currMinorEquipQty
  const totalCurrEquipHm = metrics.current.majorHm + metrics.current.minorHm

  const signCell = (
    title: string,
    nameKey: keyof DailyForm,
    roleKey: keyof DailyForm,
    options: Array<{ name: string; role: string; signatureUrl?: string }>,
    colSpan = 1
  ) => {
    const signatureKey: "prepared_by_signature_url" | "approved_by_signature_url" | null =
      nameKey === "prepared_by_name"
        ? "prepared_by_signature_url"
        : nameKey === "approved_by_name"
          ? "approved_by_signature_url"
          : null
    const signatureFromForm = signatureKey ? String(form[signatureKey] || "") : ""
    const formatSignerNameForDisplay = (rawName: string) =>
      nameKey === "approved_by_name"
        ? normalizeApprovedByNameForReport(rawName)
        : String(rawName || "")
            .toUpperCase()
            .trim()
            .replace(/\s+/g, " ")
    const currentNameValue = nameKey === "approved_by_name"
      ? normalizeApprovedByNameForReport(form[nameKey])
      : String(form[nameKey] || "")
    const hasCurrentInOptions = options.some((opt) => String(opt.name || "") === currentNameValue)
    const signatureFromOption = (() => {
      const matches = options.filter((opt) => String(opt.name || "") === currentNameValue)
      const preferred = matches.find((opt) => String(opt.signatureUrl || "").trim()) || matches[0]
      return String(preferred?.signatureUrl || "")
    })()
    const signatureUrl = readOnly ? signatureFromForm : (signatureFromForm || signatureFromOption)
    return (
    <td colSpan={colSpan} style={{ ...valueCellSx, verticalAlign: "top" }}>
      <Box sx={{ display: "grid", gap: 0.6 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{title.toUpperCase()}</Typography>
        <Box sx={{ display: "flex", gap: 0.8, alignItems: "center" }}>
          <Typography sx={{ fontSize: 12, minWidth: 56 }}>NOMBRE:</Typography>
          {readOnly ? (
            <TextField size="small" fullWidth disabled value={formatSignerNameForDisplay(String(form[nameKey] || ""))} />
          ) : (
            <FormControl size="small" fullWidth>
              <Select
                value={currentNameValue}
                renderValue={(value) => formatSignerNameForDisplay(String(value || ""))}
                onChange={(e) => {
                  const selectedName = String(e.target.value || "")
                  const matches = options.filter((opt) => opt.name === selectedName)
                  const match = matches.find((opt) => String(opt.signatureUrl || "").trim()) || matches[0]
                  onChange(nameKey, nameKey === "approved_by_name" ? normalizeApprovedByNameForReport(selectedName) : selectedName)
                  onChange(roleKey, String(match?.role || "").toUpperCase())
                  if (signatureKey) {
                    onChange(signatureKey, String(match?.signatureUrl || ""))
                  }
                }}
                displayEmpty
              >
                <MenuItem value=""><em>Seleccionar</em></MenuItem>
                {!hasCurrentInOptions && currentNameValue ? (
                  <MenuItem value={currentNameValue}>
                    {formatSignerNameForDisplay(currentNameValue)}
                  </MenuItem>
                ) : null}
                {options.map((opt) => (
                  <MenuItem key={`${opt.name}-${opt.role}`} value={opt.name}>
                    {formatSignerNameForDisplay(opt.name)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 0.8, alignItems: "center" }}>
          <Typography sx={{ fontSize: 12, minWidth: 56 }}>CARGO:</Typography>
          <TextField size="small" fullWidth disabled value={String(form[roleKey] || "").toUpperCase()} />
        </Box>
        <Box sx={{ display: "flex", gap: 0.8, alignItems: "center" }}>
          <Typography sx={{ fontSize: 12, minWidth: 56 }}>FECHA:</Typography>
          <TextField size="small" fullWidth disabled value={formatDateV2(form.report_date)} />
        </Box>
        <Box sx={{ display: "flex", gap: 0.8, alignItems: "center" }}>
          <Typography sx={{ fontSize: 12, minWidth: 56 }}>FIRMA:</Typography>
          <Box
            sx={{
              width: { xs: "100%", md: "56%" },
              maxWidth: 260,
              mx: "auto",
              height: 96,
              borderBottom: "1px dashed #94a3b8",
              position: "relative",
              overflow: "hidden"
            }}
          >
            {signatureUrl ? (
              // Signature preview is captured by PDF export as part of the report DOM.
              <img
                src={signatureUrl}
                alt="Firma"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center",
                  pointerEvents: "none"
                }}
              />
            ) : null}
          </Box>
        </Box>
        {!signatureUrl ? (
          <Typography data-pdf-hidden="true" sx={{ fontSize: 11, color: "#64748b", textAlign: "right" }}>
            Este colaborador no tiene firma cargada
          </Typography>
        ) : null}
      </Box>
    </td>
  )
  }

  const signMandanteCell = () => (
    <td colSpan={2} style={{ ...valueCellSx, verticalAlign: "top" }}>
      <Box sx={{ display: "grid", gap: 0.6 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>TOMA DE CONOCIMIENTO</Typography>
        <Box sx={{ display: "flex", gap: 0.8, alignItems: "center" }}>
          <Typography sx={{ fontSize: 12, minWidth: 56 }}>NOMBRE:</Typography>
          <Box sx={{ flex: 1, minHeight: 30, borderBottom: "1px dashed #94a3b8" }} />
        </Box>
        <Box sx={{ display: "flex", gap: 0.8, alignItems: "center" }}>
          <Typography sx={{ fontSize: 12, minWidth: 56 }}>CARGO:</Typography>
          <Box sx={{ flex: 1, minHeight: 30, borderBottom: "1px dashed #94a3b8" }} />
        </Box>
        <Box sx={{ display: "flex", gap: 0.8, alignItems: "center" }}>
          <Typography sx={{ fontSize: 12, minWidth: 56 }}>FECHA:</Typography>
          <Box sx={{ flex: 1, minHeight: 30, borderBottom: "1px dashed #94a3b8" }} />
        </Box>
        <Box sx={{ display: "flex", gap: 0.8, alignItems: "center" }}>
          <Typography sx={{ fontSize: 12, minWidth: 56 }}>FIRMA:</Typography>
          <Box sx={{ width: { xs: "100%", md: "56%" }, maxWidth: 260, mx: "auto", minHeight: 74, borderBottom: "1px dashed #94a3b8" }} />
        </Box>
      </Box>
    </td>
  )

  return (
    <Box sx={{ border: "1px solid #111", mt: 0 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: V2_LAYOUT_MIN_WIDTH }}>
        <tbody>
          <tr>
            <td style={{ ...laborBlueBandSx, textAlign: "left" }} colSpan={8}>4.- RESUMEN DE INFORMACIÓN A LA FECHA</td>
          </tr>

          <tr>
            <td style={{ ...laborHeaderCellSx, textAlign: "left" }} colSpan={4}>RESUMEN ACUM. ANTERIOR</td>
            <td style={laborHeaderCellSx}>DOT. TOTAL OBRA</td>
            <td style={laborHeaderCellSx}>HH TOTAL OBRA</td>
            <td style={laborHeaderCellSx}>TOTAL EQUIPOS</td>
            <td style={laborHeaderCellSx}>HM TOTAL OBRA</td>
          </tr>
          <tr>
            <td style={{ ...valueCellSx, fontWeight: 700, color: "#1e3a8a" }} colSpan={4}>INDIRECTO</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.previous.indirectDot)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.previous.indirectHh)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(prevMajorEquipQty)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.previous.majorHm)}</td>
          </tr>
          <tr>
            <td style={{ ...valueCellSx, fontWeight: 700, color: "#1e3a8a" }} colSpan={4}>DIRECTO</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.previous.directDot)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.previous.directHh)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(prevMinorEquipQty)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.previous.minorHm)}</td>
          </tr>
          <tr>
            <td style={{ ...laborSubtotalCellSx, textAlign: "left" }} colSpan={4}></td>
            <td style={laborSubtotalCellSx}>{fmt(totalPrevDot)}</td>
            <td style={laborSubtotalCellSx}>{fmt(totalPrevHh)}</td>
            <td style={laborSubtotalCellSx}>{fmt(totalPrevEquipQty)}</td>
            <td style={laborSubtotalCellSx}>{fmt(totalPrevEquipHm)}</td>
          </tr>

          <tr>
            <td style={{ ...laborHeaderCellSx, textAlign: "left" }} colSpan={4}>RESUMEN ACUM. ACTUAL</td>
            <td style={laborHeaderCellSx}></td>
            <td style={laborHeaderCellSx}></td>
            <td style={laborHeaderCellSx}></td>
            <td style={laborHeaderCellSx}></td>
          </tr>
          <tr>
            <td style={{ ...valueCellSx, fontWeight: 700, color: "#1e3a8a" }} colSpan={4}>INDIRECTO</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.current.indirectDot)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.current.indirectHh)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(currMajorEquipQty)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.current.majorHm)}</td>
          </tr>
          <tr>
            <td style={{ ...valueCellSx, fontWeight: 700, color: "#1e3a8a" }} colSpan={4}>DIRECTO</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.current.directDot)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.current.directHh)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(currMinorEquipQty)}</td>
            <td style={{ ...valueCellSx, textAlign: "center" }}>{fmt(metrics.current.minorHm)}</td>
          </tr>
          <tr>
            <td style={{ ...laborSubtotalCellSx, textAlign: "left" }} colSpan={4}></td>
            <td style={laborSubtotalCellSx}>{fmt(totalCurrDot)}</td>
            <td style={laborSubtotalCellSx}>{fmt(totalCurrHh)}</td>
            <td style={laborSubtotalCellSx}>{fmt(totalCurrEquipQty)}</td>
            <td style={laborSubtotalCellSx}>{fmt(totalCurrEquipHm)}</td>
          </tr>

          <tr>
            <td style={{ ...laborBlueBandSx, textAlign: "left" }} colSpan={8}>COMENTARIOS</td>
          </tr>
          <tr>
            <td style={{ ...valueCellSx, padding: 8 }} colSpan={8}>
              <TextField
                size="small"
                multiline
                minRows={5}
                fullWidth
                disabled={readOnly}
                value={form.comments_v2}
                onChange={(e) => onChange("comments_v2", e.target.value)}
                placeholder="1.- ...\n2.- ...\n3.- ..."
              />
            </td>
          </tr>

          <tr>
            {signCell("Confeccionado por", "prepared_by_name", "prepared_by_role", signerOptions.prepared, 3)}
            {signCell("Aprobado por", "approved_by_name", "approved_by_role", signerOptions.approved, 3)}
            {signMandanteCell()}
          </tr>
        </tbody>
      </table>
    </Box>
  )
}

const inferShiftLabel = (workCalendar: string) => {
  const text = String(workCalendar || "").toLowerCase()
  if (/(noche|nocturno|night)/.test(text)) return "Noche"
  if (/(dia|día|diurno|day)/.test(text)) return "Día"
  return "Día"
}

function WorkforceTemplateSectionDynamic({
  workCalendar,
  indirectRows,
  directNoOperationalRows,
  directRows,
  courseIndirectRows,
  courseDirectNoOperationalRows,
  courseDirectRows,
  downIndirectRows,
  downDirectNoOperationalRows,
  downDirectRows,
  policlinicoIndirectRows,
  policlinicoDirectNoOperationalRows,
  policlinicoDirectRows,
  teleworkIndirectRows,
  directSpecialtySections,
  readOnly = false,
  activityEvidenceByLineKey = {},
  evidenceViewUrls = {},
  onUploadActivityEvidence,
  onRemoveActivityEvidence,
  onOpenActivityEvidenceModal,
  prevencionistaFrontDistribution = {
    totalTurno: 0,
    reportCounts: { canaletas: 0, piscinas: 0, nocCanaletas: 0, nocPiscinas: 0 },
    allocated: { canaletas: 0, piscinas: 0, nocCanaletas: 0, nocPiscinas: 0 }
  }
}: {
  workCalendar: string
  indirectRows: Array<{ position: string; quantity: number; hh: number }>
  directNoOperationalRows: Array<{ position: string; quantity: number; hh: number }>
  directRows: Array<{
    specialty: string
    position: string
    quantity: number
    realOnSite: number
    hh12: number
    quantityProductive: number
    hh11: number
    showSpecialty: boolean
    specialtyRowSpan: number
  }>
  courseIndirectRows: Array<{ position: string; quantity: number; hh: number }>
  courseDirectNoOperationalRows: Array<{ position: string; quantity: number; hh: number }>
  courseDirectRows: Array<{
    specialty: string
    position: string
    quantity: number
    realOnSite: number
    hh12: number
    quantityProductive: number
    hh11: number
    showSpecialty: boolean
    specialtyRowSpan: number
  }>
  downIndirectRows: Array<{ position: string; quantity: number; hh: number }>
  downDirectNoOperationalRows: Array<{ position: string; quantity: number; hh: number }>
  downDirectRows: Array<{
    specialty: string
    position: string
    quantity: number
    realOnSite: number
    hh12: number
    quantityProductive: number
    hh11: number
    showSpecialty: boolean
    specialtyRowSpan: number
  }>
  policlinicoIndirectRows: Array<{ position: string; quantity: number; hh: number }>
  policlinicoDirectNoOperationalRows: Array<{ position: string; quantity: number; hh: number }>
  policlinicoDirectRows: Array<{
    specialty: string
    position: string
    quantity: number
    realOnSite: number
    hh12: number
    quantityProductive: number
    hh11: number
    showSpecialty: boolean
    specialtyRowSpan: number
  }>
  teleworkIndirectRows: Array<{ position: string; quantity: number; hh: number }>
  directSpecialtySections: Array<{
    specialty: string
    clientId: string
    supervisorsText: string
    activitiesSubtotal: number
    crewLines: Array<{
      crewKey: string
      crewName: string
      count: number
      activityNames: string[]
      itemRefs: Array<{ itemId: string; subId: string }>
      areas: string[]
      descriptions: string[]
    }>
  }>
  readOnly?: boolean
  activityEvidenceByLineKey?: Record<string, EvidenceFileLite[]>
  evidenceViewUrls?: Record<string, string>
  onUploadActivityEvidence?: (lineKey: string, files: FileList | null) => Promise<void> | void
  onRemoveActivityEvidence?: (lineKey: string, fileIdx: number) => void
  onOpenActivityEvidenceModal?: (lineKey: string, label: string) => void
  prevencionistaFrontDistribution?: {
    totalTurno: number
    reportCounts: { canaletas: number; piscinas: number; nocCanaletas: number; nocPiscinas: number }
    allocated: { canaletas: number; piscinas: number; nocCanaletas: number; nocPiscinas: number }
  }
}) {
  const shiftLabel = inferShiftLabel(workCalendar)
  const rowCount = Math.max(indirectRows.length, directNoOperationalRows.length, directRows.length, 1)
  const subtotalLabel = shiftLabel === "Noche" ? "SUB TOTAL NOCTURNO" : "SUB TOTAL DIURNO"

  const totalIndirectQty = indirectRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalIndirectHh = indirectRows.reduce((acc, row) => acc + row.hh, 0)
  const totalDirectNoOpQty = directNoOperationalRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalDirectNoOpHh = directNoOperationalRows.reduce((acc, row) => acc + row.hh, 0)
  const totalDirectQty = directRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalDirectRealOnSite = directRows.reduce((acc, row) => acc + row.realOnSite, 0)
  const totalDirectHh12 = directRows.reduce((acc, row) => acc + row.hh12, 0)
  const totalDirectQtyProductive = directRows.reduce((acc, row) => acc + row.quantityProductive, 0)
  const totalDirectHh11 = directRows.reduce((acc, row) => acc + row.hh11, 0)
  const numericOrBlank = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : "")
  const courseRowCount = Math.max(courseIndirectRows.length, courseDirectNoOperationalRows.length, courseDirectRows.length, 1)
  const totalCourseIndirectQty = courseIndirectRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalCourseIndirectHh = courseIndirectRows.reduce((acc, row) => acc + row.hh, 0)
  const totalCourseDirectNoOpQty = courseDirectNoOperationalRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalCourseDirectNoOpHh = courseDirectNoOperationalRows.reduce((acc, row) => acc + row.hh, 0)
  const totalCourseDirectQty = courseDirectRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalCourseDirectRealOnSite = courseDirectRows.reduce((acc, row) => acc + row.realOnSite, 0)
  const totalCourseDirectHh12 = courseDirectRows.reduce((acc, row) => acc + row.hh12, 0)
  const totalCourseDirectQtyProductive = courseDirectRows.reduce((acc, row) => acc + row.quantityProductive, 0)
  const totalCourseDirectHh11 = courseDirectRows.reduce((acc, row) => acc + row.hh11, 0)
  const downRowCount = Math.max(downIndirectRows.length, downDirectNoOperationalRows.length, downDirectRows.length, 1)
  const totalDownIndirectQty = downIndirectRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalDownIndirectHh = downIndirectRows.reduce((acc, row) => acc + row.hh, 0)
  const totalDownDirectNoOpQty = downDirectNoOperationalRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalDownDirectNoOpHh = downDirectNoOperationalRows.reduce((acc, row) => acc + row.hh, 0)
  const totalDownDirectQty = downDirectRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalDownDirectRealOnSite = downDirectRows.reduce((acc, row) => acc + row.realOnSite, 0)
  const totalDownDirectHh12 = downDirectRows.reduce((acc, row) => acc + row.hh12, 0)
  const totalDownDirectQtyProductive = downDirectRows.reduce((acc, row) => acc + row.quantityProductive, 0)
  const totalDownDirectHh11 = downDirectRows.reduce((acc, row) => acc + row.hh11, 0)
  const policlinicoRowCount = Math.max(policlinicoIndirectRows.length, policlinicoDirectNoOperationalRows.length, policlinicoDirectRows.length, 1)
  const totalPoliclinicoIndirectQty = policlinicoIndirectRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalPoliclinicoIndirectHh = policlinicoIndirectRows.reduce((acc, row) => acc + row.hh, 0)
  const totalPoliclinicoDirectNoOpQty = policlinicoDirectNoOperationalRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalPoliclinicoDirectNoOpHh = policlinicoDirectNoOperationalRows.reduce((acc, row) => acc + row.hh, 0)
  const totalPoliclinicoDirectQty = policlinicoDirectRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalPoliclinicoDirectRealOnSite = policlinicoDirectRows.reduce((acc, row) => acc + row.realOnSite, 0)
  const totalPoliclinicoDirectHh12 = policlinicoDirectRows.reduce((acc, row) => acc + row.hh12, 0)
  const totalPoliclinicoDirectQtyProductive = policlinicoDirectRows.reduce((acc, row) => acc + row.quantityProductive, 0)
  const totalPoliclinicoDirectHh11 = policlinicoDirectRows.reduce((acc, row) => acc + row.hh11, 0)
  const teleworkRowCount = Math.max(teleworkIndirectRows.length, 1)
  const totalTeleworkIndirectQty = teleworkIndirectRows.reduce((acc, row) => acc + row.quantity, 0)
  const totalTeleworkIndirectHh = teleworkIndirectRows.reduce((acc, row) => acc + row.hh, 0)
  const totalNoPresentIndirectQty = totalCourseIndirectQty + totalDownIndirectQty + totalPoliclinicoIndirectQty + totalTeleworkIndirectQty
  const totalNoPresentIndirectHh = totalCourseIndirectHh + totalDownIndirectHh + totalPoliclinicoIndirectHh + totalTeleworkIndirectHh
  const totalNoPresentDirectNoOpQty = totalCourseDirectNoOpQty + totalDownDirectNoOpQty + totalPoliclinicoDirectNoOpQty
  const totalNoPresentDirectNoOpHh = totalCourseDirectNoOpHh + totalDownDirectNoOpHh + totalPoliclinicoDirectNoOpHh
  const totalNoPresentDirectQty = totalCourseDirectQty + totalDownDirectQty + totalPoliclinicoDirectQty
  const totalNoPresentDirectRealOnSite = totalCourseDirectRealOnSite + totalDownDirectRealOnSite + totalPoliclinicoDirectRealOnSite
  const totalNoPresentDirectHh12 = totalCourseDirectHh12 + totalDownDirectHh12 + totalPoliclinicoDirectHh12
  const totalNoPresentDirectQtyProductive = totalCourseDirectQtyProductive + totalDownDirectQtyProductive + totalPoliclinicoDirectQtyProductive
  const totalNoPresentDirectHh11 = totalCourseDirectHh11 + totalDownDirectHh11 + totalPoliclinicoDirectHh11
  const equipmentTotalQuantity = TEMP_EQUIPMENT_AND_VEHICLES_ROWS.reduce((acc, row) => acc + Number(row.quantity || 0), 0)
  const equipmentTotalDmOperando = TEMP_EQUIPMENT_AND_VEHICLES_ROWS.reduce((acc, row) => acc + Number(row.dmOperando || 0), 0)
  const equipmentTotalHmOperando = TEMP_EQUIPMENT_AND_VEHICLES_ROWS.reduce((acc, row) => acc + Number(row.hmOperando || 0), 0)
  const equipmentTotalHmMaintStandby = TEMP_EQUIPMENT_AND_VEHICLES_ROWS.reduce((acc, row) => acc + Number(row.hmMaintStandby || 0), 0)
  const vehiclesTotalOperative = TEMP_EQUIPMENT_AND_VEHICLES_ROWS.reduce((acc, row) => acc + Number(row.vehicleOperative || 0), 0)
  const vehiclesTotalOutOfService = TEMP_EQUIPMENT_AND_VEHICLES_ROWS.reduce((acc, row) => acc + Number(row.vehicleOutOfService || 0), 0)
  return (
    <Box sx={{ overflowX: "auto", border: "1px solid #111", mt: 0 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1400 }}>
        <tbody>
          <tr>
            <td style={{ ...laborTitleCellSx, borderTop: 0 }} colSpan={13}>FUERZA LABORAL</td>
          </tr>
          <tr>
            <td style={laborTitleCellSx} colSpan={3}>HH INDIRECTO</td>
            <td style={laborTitleCellSx} colSpan={3}>HH DIRECTO NO OPERACIONAL</td>
            <td style={laborTitleCellSx} colSpan={7}>HH DIRECTO</td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx} rowSpan={2}>Posición</td>
            <td style={laborHeaderCellSx} colSpan={2}>Gastadas (Seguridad)</td>

            <td style={laborHeaderCellSx} rowSpan={2}>Posición</td>
            <td style={laborHeaderCellSx} colSpan={2}>Gastadas (Seguridad)</td>

            <td style={laborHeaderCellSx} rowSpan={2}>Especialidad</td>
            <td style={laborHeaderCellSx} rowSpan={2}>Posición</td>
            <td style={laborHeaderCellSx} rowSpan={2}>Cantidad Posición</td>
            <td style={laborHeaderCellSx} rowSpan={2}>Cantidad Real Terreno</td>
            <td style={laborHeaderCellSx} rowSpan={2}>Cantidad x 12</td>
            <td style={laborHeaderCellSx} rowSpan={2}>Cantidad Posición</td>
            <td style={laborHeaderCellSx} rowSpan={2}>Cantidad x 11</td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx}>HD</td>
            <td style={laborHeaderCellSx}>HH</td>

            <td style={laborHeaderCellSx}>HD</td>
            <td style={laborHeaderCellSx}>HH</td>
          </tr>
          <tr>
            <td style={laborBlueBandSx} colSpan={3}>{`En Proyecto Turno ${shiftLabel}`}</td>
            <td style={laborBlueBandSx} colSpan={3}>{`En Proyecto Turno ${shiftLabel}`}</td>
            <td style={laborBlueBandSx} colSpan={7}>{`En Proyecto Turno ${shiftLabel}`}</td>
          </tr>
          {Array.from({ length: rowCount }).map((_, index) => {
            const indirect = indirectRows[index]
            const directNoOp = directNoOperationalRows[index]
            const direct = directRows[index]
            return (
              <tr key={`labor-${index}`}>
                <td style={valueCellSx}>
                  {indirect?.position || (index === 0 && indirectRows.length === 0 ? "Sin personal indirecto" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.hh : ""}</td>

                <td style={valueCellSx}>
                  {directNoOp?.position || (index === 0 && directNoOperationalRows.length === 0 ? "Sin personal directo no operacional" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{directNoOp ? directNoOp.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{directNoOp ? directNoOp.hh : ""}</td>

                {direct ? (
                  <>
                    {direct.showSpecialty ? (
                      <td style={valueCellSx} rowSpan={direct.specialtyRowSpan}>
                        {direct.specialty}
                      </td>
                    ) : null}
                    <td style={valueCellSx}>{direct.position}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.quantity}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.realOnSite}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.hh12}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.quantityProductive}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.hh11}</td>
                  </>
                ) : (
                  <td style={valueCellSx} colSpan={7}>
                    {index === 0 && directRows.length === 0 ? "Sin personal directo" : ""}
                  </td>
                )}
              </tr>
            )
          })}
          <tr>
            <td style={laborSubtotalCellSx}>{subtotalLabel}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalIndirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalIndirectHh)}</td>

            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDirectNoOpQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDirectNoOpHh)}</td>

            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDirectRealOnSite)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDirectHh12)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDirectQtyProductive)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDirectHh11)}</td>
          </tr>
          <tr>
            <td style={laborTitleCellSx} colSpan={3}>PERSONAL INDIRECTO NO PRODUCTIVO PRESENTE EN CURSO</td>
            <td style={laborTitleCellSx} colSpan={3}>PERSONAL DIRECTO NO OPERACIONAL NO PRODUCTIVO PRESENTE EN CURSO</td>
            <td style={laborTitleCellSx} colSpan={7}>PERSONAL DIRECTO NO PRODUCTIVO PRESENTE EN CURSO</td>
          </tr>
          {Array.from({ length: courseRowCount }).map((_, index) => {
            const indirect = courseIndirectRows[index]
            const directNoOp = courseDirectNoOperationalRows[index]
            const direct = courseDirectRows[index]
            return (
              <tr key={`course-${index}`}>
                <td style={valueCellSx}>
                  {indirect?.position || (index === 0 && courseIndirectRows.length === 0 ? "Sin personal en curso" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.hh : ""}</td>

                <td style={valueCellSx}>
                  {directNoOp?.position || (index === 0 && courseDirectNoOperationalRows.length === 0 ? "Sin personal en curso" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{directNoOp ? directNoOp.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{directNoOp ? directNoOp.hh : ""}</td>

                {direct ? (
                  <>
                    {direct.showSpecialty ? (
                      <td style={valueCellSx} rowSpan={direct.specialtyRowSpan}>
                        {direct.specialty}
                      </td>
                    ) : null}
                    <td style={valueCellSx}>{direct.position}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.quantity}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.realOnSite}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.hh12}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.quantityProductive}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.hh11}</td>
                  </>
                ) : (
                  <td style={valueCellSx} colSpan={7}>
                    {index === 0 && courseDirectRows.length === 0 ? "Sin personal en curso" : ""}
                  </td>
                )}
              </tr>
            )
          })}
          <tr>
            <td style={laborSubtotalCellSx}>{subtotalLabel}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseIndirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseIndirectHh)}</td>

            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseDirectNoOpQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseDirectNoOpHh)}</td>

            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseDirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseDirectRealOnSite)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseDirectHh12)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseDirectQtyProductive)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalCourseDirectHh11)}</td>
          </tr>
          <tr>
            <td style={laborTitleCellSx} colSpan={3}>PERSONAL INDIRECTO NO PRODUCTIVO BAJADA</td>
            <td style={laborTitleCellSx} colSpan={3}>PERSONAL DIRECTO NO OPERACIONAL NO PRODUCTIVO BAJADA</td>
            <td style={laborTitleCellSx} colSpan={7}>PERSONAL DIRECTO NO PRODUCTIVO BAJADA</td>
          </tr>
          {Array.from({ length: downRowCount }).map((_, index) => {
            const indirect = downIndirectRows[index]
            const directNoOp = downDirectNoOperationalRows[index]
            const direct = downDirectRows[index]
            return (
              <tr key={`down-${index}`}>
                <td style={valueCellSx}>
                  {indirect?.position || (index === 0 && downIndirectRows.length === 0 ? "Sin personal en bajada" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.hh : ""}</td>

                <td style={valueCellSx}>
                  {directNoOp?.position || (index === 0 && downDirectNoOperationalRows.length === 0 ? "Sin personal en bajada" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{directNoOp ? directNoOp.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{directNoOp ? directNoOp.hh : ""}</td>

                {direct ? (
                  <>
                    {direct.showSpecialty ? (
                      <td style={valueCellSx} rowSpan={direct.specialtyRowSpan}>
                        {direct.specialty}
                      </td>
                    ) : null}
                    <td style={valueCellSx}>{direct.position}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.quantity}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.realOnSite}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.hh12}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.quantityProductive}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.hh11}</td>
                  </>
                ) : (
                  <td style={valueCellSx} colSpan={7}>
                    {index === 0 && downDirectRows.length === 0 ? "Sin personal en bajada" : ""}
                  </td>
                )}
              </tr>
            )
          })}
          <tr>
            <td style={laborSubtotalCellSx}>{subtotalLabel}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownIndirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownIndirectHh)}</td>

            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownDirectNoOpQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownDirectNoOpHh)}</td>

            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownDirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownDirectRealOnSite)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownDirectHh12)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownDirectQtyProductive)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalDownDirectHh11)}</td>
          </tr>
          <tr>
            <td style={laborTitleCellSx} colSpan={3}>PERSONAL INDIRECTO NO PRODUCTIVO EN POLICLINICO</td>
            <td style={laborTitleCellSx} colSpan={3}>PERSONAL DIRECTO NO OPERACIONAL NO PRODUCTIVO EN POLICLINICO</td>
            <td style={laborTitleCellSx} colSpan={7}>PERSONAL DIRECTO NO PRODUCTIVO EN POLICLINICO</td>
          </tr>
          {Array.from({ length: policlinicoRowCount }).map((_, index) => {
            const indirect = policlinicoIndirectRows[index]
            const directNoOp = policlinicoDirectNoOperationalRows[index]
            const direct = policlinicoDirectRows[index]
            return (
              <tr key={`policlinico-${index}`}>
                <td style={valueCellSx}>
                  {indirect?.position || (index === 0 && policlinicoIndirectRows.length === 0 ? "Sin personal en policlinico" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.hh : ""}</td>

                <td style={valueCellSx}>
                  {directNoOp?.position || (index === 0 && policlinicoDirectNoOperationalRows.length === 0 ? "Sin personal en policlinico" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{directNoOp ? directNoOp.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{directNoOp ? directNoOp.hh : ""}</td>

                {direct ? (
                  <>
                    {direct.showSpecialty ? (
                      <td style={valueCellSx} rowSpan={direct.specialtyRowSpan}>
                        {direct.specialty}
                      </td>
                    ) : null}
                    <td style={valueCellSx}>{direct.position}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.quantity}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.realOnSite}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.hh12}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.quantityProductive}</td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{direct.hh11}</td>
                  </>
                ) : (
                  <td style={valueCellSx} colSpan={7}>
                    {index === 0 && policlinicoDirectRows.length === 0 ? "Sin personal en policlinico" : ""}
                  </td>
                )}
              </tr>
            )
          })}
          <tr>
            <td style={laborSubtotalCellSx}>{subtotalLabel}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoIndirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoIndirectHh)}</td>

            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoDirectNoOpQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoDirectNoOpHh)}</td>

            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}></td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoDirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoDirectRealOnSite)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoDirectHh12)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoDirectQtyProductive)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalPoliclinicoDirectHh11)}</td>
          </tr>
          <tr>
            <td style={laborTitleCellSx} colSpan={3}>OFICINA CENTRAL - TELETRABAJO</td>
            <td style={laborTitleCellSx} colSpan={10}></td>
          </tr>
          <tr>
            <td style={laborBlueBandSx} colSpan={3}>{`En Proyecto Turno ${shiftLabel}`}</td>
            <td style={valueCellSx} colSpan={10}></td>
          </tr>
          {Array.from({ length: teleworkRowCount }).map((_, index) => {
            const indirect = teleworkIndirectRows[index]
            return (
              <tr key={`telework-${index}`}>
                <td style={valueCellSx}>
                  {indirect?.position || (index === 0 && teleworkIndirectRows.length === 0 ? "Sin personal en oficina central - teletrabajo" : "")}
                </td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.quantity : ""}</td>
                <td style={{ ...valueCellSx, textAlign: "center" }}>{indirect ? indirect.hh : ""}</td>
                <td style={valueCellSx} colSpan={10}></td>
              </tr>
            )
          })}
          <tr>
            <td style={laborSubtotalCellSx}>{subtotalLabel}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalTeleworkIndirectQty)}</td>
            <td style={laborSubtotalCellSx}>{numericOrBlank(totalTeleworkIndirectHh)}</td>
            <td style={laborSubtotalCellSx} colSpan={10}></td>
          </tr>
          <tr>
            <td style={laborTotalCellSx}>TOTAL PRESENTES INDIRECTO</td>
            <td style={laborTotalCellSx}>{totalIndirectQty}</td>
            <td style={laborTotalCellSx}>{totalIndirectHh}</td>

            <td style={laborTotalCellSx}>TOTAL PRESENTES DIRECTO NO OPERACIONAL</td>
            <td style={laborTotalCellSx}>{totalDirectNoOpQty}</td>
            <td style={laborTotalCellSx}>{totalDirectNoOpHh}</td>

            <td style={laborTotalCellSx} colSpan={2}>TOTAL PRESENTES DIRECTO</td>
            <td style={laborTotalCellSx}>{totalDirectQty}</td>
            <td style={laborTotalCellSx}>{totalDirectRealOnSite}</td>
            <td style={laborTotalCellSx}>{totalDirectHh12}</td>
            <td style={laborTotalCellSx}>{totalDirectQtyProductive}</td>
            <td style={laborTotalCellSx}>{totalDirectHh11}</td>
          </tr>
          <tr>
            <td style={laborTotalCellSx}>TOTAL NO PRESENTES (CAMPAMENTO, CURSOS, TL)</td>
            <td style={laborTotalCellSx}>{totalNoPresentIndirectQty}</td>
            <td style={laborTotalCellSx}>{totalNoPresentIndirectHh}</td>

            <td style={laborTotalCellSx}>TOTAL NO PRESENTES</td>
            <td style={laborTotalCellSx}>{totalNoPresentDirectNoOpQty}</td>
            <td style={laborTotalCellSx}>{totalNoPresentDirectNoOpHh}</td>

            <td style={laborTotalCellSx} colSpan={2}>TOTAL NO PRESENTES</td>
            <td style={laborTotalCellSx}>{totalNoPresentDirectQty}</td>
            <td style={laborTotalCellSx}>{totalNoPresentDirectRealOnSite}</td>
            <td style={laborTotalCellSx}>{totalNoPresentDirectHh12}</td>
            <td style={laborTotalCellSx}>{totalNoPresentDirectQtyProductive}</td>
            <td style={laborTotalCellSx}>{totalNoPresentDirectHh11}</td>
          </tr>
          <tr>
            <td style={laborBlueBandSx} colSpan={8}>EQUIPOS Y MAQUINARIAS</td>
            <td style={laborBlueBandSx} colSpan={5}>VEHICULOS MENORES Y SERVICIO</td>
          </tr>
          <tr>
            <td style={laborHeaderCellSx} colSpan={2}>Descripción (Agrupar por tipo/capacidad)</td>
            <td style={laborHeaderCellSx}>KM / HRS</td>
            <td style={laborHeaderCellSx}>Cantidad</td>
            <td style={laborHeaderCellSx}>DM Operando</td>
            <td style={laborHeaderCellSx}>HM Operando</td>
            <td style={laborHeaderCellSx}>HM Mantención / Panne / STAND-BY</td>
            <td style={laborHeaderCellSx}>Frentes de Trabajo</td>
            <td style={laborHeaderCellSx} colSpan={3}>Descripción</td>
            <td style={laborHeaderCellSx}>Operativos</td>
            <td style={laborHeaderCellSx}>Fuera de servicio</td>
          </tr>
          {TEMP_EQUIPMENT_AND_VEHICLES_ROWS.map((row, index) => (
            <tr key={`temp-eq-veh-${index}`}>
              <td style={valueCellSx} colSpan={2}>{row.equipmentDescription}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{row.kmHrs}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{row.quantity}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{row.dmOperando}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{row.hmOperando}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{row.hmMaintStandby}</td>
              <td style={valueCellSx}>{row.workFronts}</td>
              <td style={valueCellSx} colSpan={3}>{row.vehicleDescription}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{row.vehicleOperative}</td>
              <td style={{ ...valueCellSx, textAlign: "center" }}>{row.vehicleOutOfService}</td>
            </tr>
          ))}
          <tr>
            <td style={laborTotalCellSx} colSpan={2}>TOTAL</td>
            <td style={laborTotalCellSx}></td>
            <td style={laborTotalCellSx}>{equipmentTotalQuantity}</td>
            <td style={laborTotalCellSx}>{equipmentTotalDmOperando}</td>
            <td style={laborTotalCellSx}>{equipmentTotalHmOperando}</td>
            <td style={laborTotalCellSx}>{equipmentTotalHmMaintStandby}</td>
            <td style={laborTotalCellSx}></td>
            <td style={laborTotalCellSx} colSpan={3}>TOTAL</td>
            <td style={laborTotalCellSx}>{vehiclesTotalOperative}</td>
            <td style={laborTotalCellSx}>{vehiclesTotalOutOfService}</td>
          </tr>
          {directSpecialtySections.filter((section) => section.crewLines.length > 0).length === 0 ? (
            <tr>
              <td style={valueCellSx} colSpan={14}>Sin actividades de reportabilidad para la fecha seleccionada.</td>
            </tr>
          ) : (
            directSpecialtySections
              .filter((section) => section.crewLines.length > 0)
              .map((section, idx) => (
              <React.Fragment key={`direct-specialty-${idx}-${section.specialty}`}>
                <tr>
                  <td style={laborBlueBandSx} colSpan={2}>ESPECIALIDAD</td>
                  <td style={laborBlueBandSx} colSpan={2}>AREA</td>
                  <td style={laborBlueBandSx} colSpan={7}>DESCRIPCION ACTIVIDADES TURNO DIA</td>
                  <td style={laborBlueBandSx}>IMAGENES</td>
                  <td style={laborBlueBandSx}>TOTAL</td>
                  <td style={laborBlueBandSx}>{section.activitiesSubtotal}</td>
                </tr>
                <tr>
                  <td style={valueCellSx}>{section.specialty}</td>
                  <td style={{ ...valueCellSx, textAlign: "center" }}>{section.clientId}</td>
                  <td style={{ ...valueCellSx, fontWeight: 700 }} colSpan={2}>Supervisor:</td>
                  <td style={valueCellSx} colSpan={7}>{section.supervisorsText}</td>
                  <td style={valueCellSx}></td>
                  <td style={{ ...valueCellSx, fontWeight: 700 }}>Dotacion Directos:</td>
                  <td style={{ ...valueCellSx, textAlign: "center" }}>{section.activitiesSubtotal}</td>
                </tr>
                {section.crewLines.map((line, lineIdx) => (
                  <tr key={`crew-${idx}-${line.crewKey}-${lineIdx}`}>
                    <td style={valueCellSx}>
                      {line.activityNames.length > 0 ? line.activityNames.join(" | ") : "-"}
                      {line.crewName ? <span style={{ color: "#475569" }}>{` (${line.crewName})`}</span> : null}
                    </td>
                    <td style={valueCellSx}>
                      {line.itemRefs.length > 0 ? (
                        <span>
                          {line.itemRefs.map((ref, refIdx) => (
                            <span key={`itemref-${idx}-${lineIdx}-${refIdx}`}>
                              {ref.itemId || "-"}
                              {ref.subId ? <span style={{ marginLeft: 4, color: "#94a3b8" }}>{`(${ref.subId})`}</span> : null}
                              {refIdx < line.itemRefs.length - 1 ? <span>{", "}</span> : null}
                            </span>
                          ))}
                        </span>
                      ) : "-"}
                    </td>
                    <td style={valueCellSx} colSpan={2}>{line.areas.length > 0 ? line.areas.join(", ") : "-"}</td>
                    <td style={valueCellSx} colSpan={7}>
                      {line.descriptions.length > 0 ? line.descriptions.join(" | ") : "-"}
                    </td>
                    <td style={{ ...valueCellSx, minWidth: 220 }}>
                      {(() => {
                        const lineKey = `${section.specialty}__${line.crewKey}__${lineIdx}`
                        const files = Array.isArray(activityEvidenceByLineKey?.[lineKey]) ? activityEvidenceByLineKey[lineKey] : []
                        const label = line.activityNames.length > 0 ? line.activityNames.join(" | ") : `Actividad ${lineIdx + 1}`
                        return (
                          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => onOpenActivityEvidenceModal?.(lineKey, label)}
                              sx={{ textTransform: "none" }}
                            >
                              {files.length > 0 ? `Ver / editar (${files.length})` : (readOnly ? "Ver" : "Cargar")}
                            </Button>
                            {files.length === 0 ? (
                              <Typography sx={{ fontSize: 12, color: "#64748b" }}>Sin imágenes</Typography>
                            ) : (
                              <Typography sx={{ fontSize: 12, color: "#1d4ed8" }}>{files.length} archivo(s)</Typography>
                            )}
                          </Box>
                        )
                      })()}
                    </td>
                    <td style={valueCellSx}></td>
                    <td style={{ ...valueCellSx, textAlign: "center" }}>{line.count}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))
          )}
        </tbody>
      </table>
    </Box>
  )
}

export default function DailyReportPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = String((session?.user as any)?.role || "").toLowerCase()
  const currentUserId = String((session?.user as any)?.id || "")
  const isUserRole = role === "user"
  const isAdminRole = role === "admin"
  const isDevRole = role === "dev"
  const isViewerRole = role === "viewer"
  const canMutateDailyReport = isAdminRole || isDevRole || isUserRole
  const canExportDailyReport = canMutateDailyReport
  const canAccess = canMutateDailyReport || isViewerRole

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [records, setRecords] = useState<DailyReportRecord[]>([])
  const [dailyReportWeekRange, setDailyReportWeekRange] = useState<WeekRange | null>(null)
  const [fieldReportDates, setFieldReportDates] = useState<string[]>([])
  const [frontBaselines, setFrontBaselines] = useState<Partial<Record<"CANALETAS" | "PISCINAS", FrontBaseline>>>({})
  const [frontHistoryRows, setFrontHistoryRows] = useState<FrontHistoryRow[]>([])
  const [collaborators, setCollaborators] = useState<CollaboratorLite[]>([])
  const [dailyStatusRows, setDailyStatusRows] = useState<DailyStatusLite[]>([])
  const [fieldReportsForDate, setFieldReportsForDate] = useState<any[]>([])
  const [reportFrontNames, setReportFrontNames] = useState<string[]>([])
  const [reportFrontTypesByName, setReportFrontTypesByName] = useState<Record<string, string>>({})
  const collaboratorsLoadPromiseRef = useRef<Record<string, Promise<CollaboratorLite[]>>>({})
  const fieldReportsByDateCacheRef = useRef<Record<string, any[]>>({})
  const [evidenceViewUrls, setEvidenceViewUrls] = useState<Record<string, string>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<DailyReportVersion[]>([])
  const [historyDeletionRows, setHistoryDeletionRows] = useState<DailyReportDeletionAudit[]>([])
  const [historyReportLabel, setHistoryReportLabel] = useState("")
  const [historyViewMeta, setHistoryViewMeta] = useState<{ versionNo: number; createdAt?: string | null } | null>(null)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [reportTemplate, setReportTemplate] = useState<ReportTemplateKey>("daily_v2")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSourceMode, setEditSourceMode] = useState<EditSourceMode>("snapshot")
  const [editModeChoiceRecord, setEditModeChoiceRecord] = useState<DailyReportRecord | null>(null)
  const [viewRecord, setViewRecord] = useState<DailyReportRecord | null>(null)
  const [exporting, setExporting] = useState(false)
  const [activeActionRecordId, setActiveActionRecordId] = useState<string | null>(null)
  const dailyReportPdfRef = useRef<HTMLDivElement | null>(null)
  const [form, setForm] = useState<DailyForm>(emptyForm())
  const activePersonWorkdayHours = resolvePersonWorkdayHours(form)
  const activeMachineWorkdayHours = resolveMachineWorkdayHours(form)
  const activeHalfDayHours = resolveHalfDayHours(form)
  const [toast, setToast] = useState<{ open: boolean; msg: string; sev: "success" | "error" | "info" }>({ open: false, msg: "", sev: "info" })
  const sessionCompanyName = String((session?.user as any)?.companyName || "").trim()
  const lastBootstrappedDateRef = useRef<string>("")
  const [dailyActivityEvidenceByLineKey, setDailyActivityEvidenceByLineKey] = useState<Record<string, EvidenceFileLite[]>>({})
  const [activityEvidenceModalOpen, setActivityEvidenceModalOpen] = useState(false)
  const [activityEvidenceModalLineKey, setActivityEvidenceModalLineKey] = useState("")
  const [activityEvidenceModalLabel, setActivityEvidenceModalLabel] = useState("")
  const [indirectHoursOverrides, setIndirectHoursOverrides] = useState<Record<string, number>>({})
  const [indirectHoursOverridesDraft, setIndirectHoursOverridesDraft] = useState<Record<string, number>>({})
  const [indirectHoursFrontOverrides, setIndirectHoursFrontOverrides] = useState<Record<string, "CANALETAS" | "PISCINAS" | "BOTH">>({})
  const [indirectHoursFrontOverridesDraft, setIndirectHoursFrontOverridesDraft] = useState<Record<string, "CANALETAS" | "PISCINAS" | "BOTH">>({})
  const [isIndirectHoursModalOpen, setIsIndirectHoursModalOpen] = useState(false)
  const [isIndirectFrontModalOpen, setIsIndirectFrontModalOpen] = useState(false)
  const [indirectHoursSearch, setIndirectHoursSearch] = useState("")
  const [indirectFrontSearch, setIndirectFrontSearch] = useState("")
  const [indirectHoursApplyMode, setIndirectHoursApplyMode] = useState<"INDIVIDUAL" | "GRUPAL">("INDIVIDUAL")
  const [indirectHoursFrontApplyScope, setIndirectHoursFrontApplyScope] = useState<"EXISTING_FRONTS" | "CURRENT_FRONT_ONLY">("EXISTING_FRONTS")
  const [indirectGroupFrontMode, setIndirectGroupFrontMode] = useState<"CANALETAS" | "PISCINAS" | "BOTH">("BOTH")
  const [savedIndirectHoursSettingsKey, setSavedIndirectHoursSettingsKey] = useState(
    stableIndirectHoursSettingsKey({}, "EXISTING_FRONTS", {})
  )
  const [indirectGroupHoursInput, setIndirectGroupHoursInput] = useState("")
  const [frontSavedStatus, setFrontSavedStatus] = useState<Record<"CANALETAS" | "PISCINAS", boolean>>({
    CANALETAS: false,
    PISCINAS: false
  })
  const [frontRecordIds, setFrontRecordIds] = useState<Record<"CANALETAS" | "PISCINAS", string | null>>({
    CANALETAS: null,
    PISCINAS: null
  })
  const [editSessionSavedFronts, setEditSessionSavedFronts] = useState<Record<"CANALETAS" | "PISCINAS", boolean>>({
    CANALETAS: false,
    PISCINAS: false
  })
  const [editSessionOriginalByFront, setEditSessionOriginalByFront] = useState<Record<"CANALETAS" | "PISCINAS", DailyReportRecord | null>>({
    CANALETAS: null,
    PISCINAS: null
  })
  const [frontDraftForms, setFrontDraftForms] = useState<Record<"CANALETAS" | "PISCINAS", DailyForm | null>>({
    CANALETAS: null,
    PISCINAS: null
  })
  const [frontBaselineHashes, setFrontBaselineHashes] = useState<Record<"CANALETAS" | "PISCINAS", string | null>>({
    CANALETAS: null,
    PISCINAS: null
  })
  const editHydrationLockRef = useRef(false)
  const isViewingHistoryVersion = !!historyViewMeta
  const isEditSnapshotMode = Boolean(editingId && editSourceMode === "snapshot")
  const isEditReformulateMode = Boolean(editingId && editSourceMode === "field_reports")
  const indirectHoursSettingsMatchSaved = useMemo(
    () => stableIndirectHoursSettingsKey(indirectHoursOverrides, indirectHoursFrontApplyScope, indirectHoursFrontOverrides) === savedIndirectHoursSettingsKey,
    [indirectHoursOverrides, indirectHoursFrontApplyScope, indirectHoursFrontOverrides, savedIndirectHoursSettingsKey]
  )

  const showToast = (msg: string, sev: "success" | "error" | "info" = "info") => {
    setToast({ open: true, msg, sev })
  }
  const toFrontFormat = (front: "CANALETAS" | "PISCINAS") =>
    front === "PISCINAS" ? "ANT-GPRO-FOR-PISCINAS" : "ANT-GPRO-FOR-CANALETAS"
  const formHash = (f: DailyForm | null | undefined) => JSON.stringify(f || {})
  const frontFromForm = (f: DailyForm): "CANALETAS" | "PISCINAS" =>
    f.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
  const isFrontDirty = (front: "CANALETAS" | "PISCINAS") => {
    const draft = frontDraftForms[front]
    const baseline = frontBaselineHashes[front]
    if (!draft || !baseline) return false
    return formHash(draft) !== baseline
  }

  useEffect(() => {
    if (status === "loading") return
    if (!canAccess) router.push("/users/dashboard")
  }, [status, canAccess, router])

  const loadRecords = async (force = false) => {
    const [reportsJson, baselineJson, historyJson] = await Promise.all([
      fetchJsonCached("/api/daily-reports", undefined, DAILY_REPORT_INITIAL_CACHE_TTL_MS, force),
      fetchJsonCached("/api/daily-reports?baselines=1", undefined, DAILY_REPORT_INITIAL_CACHE_TTL_MS, force),
      fetchJsonCached("/api/daily-reports?front_history=1", undefined, DAILY_REPORT_INITIAL_CACHE_TTL_MS, force)
    ])
    const sortedRecords = (Array.isArray(reportsJson) ? [...reportsJson] : []).sort((a: DailyReportRecord, b: DailyReportRecord) => {
      const reportNoDiff = Number(b?.report_no || 0) - Number(a?.report_no || 0)
      if (reportNoDiff !== 0) return reportNoDiff

      const frontA = detectRecordFrontStrict(a) || getRecordFront(a)
      const frontB = detectRecordFrontStrict(b) || getRecordFront(b)
      const rank = (front: "CANALETAS" | "PISCINAS") => (front === "CANALETAS" ? 0 : 1)
      const frontDiff = rank(frontA) - rank(frontB)
      if (frontDiff !== 0) return frontDiff

      const dateA = String(a?.report_date || "")
      const dateB = String(b?.report_date || "")
      return dateB.localeCompare(dateA)
    })
    setRecords(sortedRecords)

    if (Array.isArray(baselineJson)) {
      const map: Partial<Record<"CANALETAS" | "PISCINAS", FrontBaseline>> = {}
      baselineJson.forEach((b: any) => {
        const front = String(b?.work_front || "").toUpperCase() === "PISCINAS" ? "PISCINAS" : "CANALETAS"
        map[front] = {
          work_front: front,
          as_of_report_no: Number(b?.as_of_report_no || 0),
          as_of_date: String(b?.as_of_date || ""),
          prev_indirect_dot: Number(b?.prev_indirect_dot || 0),
          prev_indirect_hh: Number(b?.prev_indirect_hh || 0),
          prev_direct_dot: Number(b?.prev_direct_dot || 0),
          prev_direct_hh: Number(b?.prev_direct_hh || 0),
          prev_total_dot: Number(b?.prev_total_dot || 0),
          prev_total_hh: Number(b?.prev_total_hh || 0),
          prev_major_equip: Number(b?.prev_major_equip || 0),
          prev_major_hm: Number(b?.prev_major_hm || 0),
          prev_minor_equip: Number(b?.prev_minor_equip || 0),
          prev_minor_hm: Number(b?.prev_minor_hm || 0),
          prev_total_equip: Number(b?.prev_total_equip || 0),
          prev_total_hm: Number(b?.prev_total_hm || 0)
        }
      })
      setFrontBaselines(map)
    }

    if (Array.isArray(historyJson)) {
      const rows: FrontHistoryRow[] = historyJson
        .map((r: any): FrontHistoryRow => ({
          work_front: (String(r?.work_front || "").toUpperCase() === "PISCINAS" ? "PISCINAS" : "CANALETAS") as "CANALETAS" | "PISCINAS",
          report_no: Number(r?.report_no || 0),
          report_date: String(r?.report_date || ""),
          indirect_hh_accum: Number(r?.indirect_hh_accum || 0),
          direct_hh_accum: Number(r?.direct_hh_accum || 0),
          total_hh_accum: Number(r?.total_hh_accum || 0),
          major_equip_accum: Number(r?.major_equip_accum || 0),
          minor_equip_accum: Number(r?.minor_equip_accum || 0),
          total_equip_accum: Number(r?.total_equip_accum || 0),
          major_hm_accum: Number(r?.major_hm_accum || 0),
          minor_hm_accum: Number(r?.minor_hm_accum || 0)
        }))
        .filter((r) => !!r.report_date && r.report_no > 0)
      setFrontHistoryRows(rows)
    }
  }

  const loadFieldReportDates = async () => {
    const json = await fetchJsonCached("/api/field-reports?dates=1", { cache: "no-store" })
    const rows: string[] = Array.isArray((json as any)?.dates) ? (json as any).dates : []
    const dates = Array.from(new Set<string>(
      rows
        .map((date: any) => String(date || "").slice(0, 10))
        .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    )).sort((a, b) => b.localeCompare(a))
    setFieldReportDates(dates)
  }

  const loadReportFrontNames = async () => {
    const json = await fetchJsonCached("/api/report-fronts", { cache: "no-store" }).catch(() => null)
    if (!json) return
    const fronts = Array.isArray((json as any)?.fronts) ? (json as any).fronts : []
    const names = fronts
      .map((front: any) => String(front?.name || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
    setReportFrontNames(Array.from(new Set(names)))
    const typesByName: Record<string, string> = {}
    fronts.forEach((front: any) => {
      const name = String(front?.name || "").replace(/\s+/g, " ").trim()
      if (!name) return
      typesByName[normalizeDynamicFrontKey(name)] = String(front?.type || "").trim().toLowerCase()
    })
    setReportFrontTypesByName(typesByName)
  }

  const loadCollaborators = async (force = false, asOfDate?: string) => {
    const date = String(asOfDate || form.report_date || "").slice(0, 10)
    const cacheKey = date || "current"
    if (force) delete collaboratorsLoadPromiseRef.current[cacheKey]
    if (!collaboratorsLoadPromiseRef.current[cacheKey]) {
      collaboratorsLoadPromiseRef.current[cacheKey] = (async () => {
        const qs = date ? `?summary=1&as_of_date=${encodeURIComponent(date)}` : "?summary=1"
        const res = await fetch(`/api/collaborators${qs}`)
        const json = await res.json()
        if (!res.ok) throw new Error(String(json?.error || "Error cargando colaboradores"))
        return Array.isArray(json) ? json : []
      })()
    }
    let rows: CollaboratorLite[] = []
    try {
      rows = await collaboratorsLoadPromiseRef.current[cacheKey]
    } catch (err) {
      delete collaboratorsLoadPromiseRef.current[cacheKey]
      throw err
    }
    setCollaborators(rows)
  }

  const fetchDailyReportDetail = async (id: string) => {
    const cleanId = String(id || "").trim()
    if (!cleanId) throw new Error("id de reporte requerido")
    const res = await fetch(`/api/daily-reports?id=${encodeURIComponent(cleanId)}`, { cache: "no-store" })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(String((json as any)?.error || "No se pudo cargar el detalle del reporte"))
    return json as DailyReportRecord
  }

  const bootstrapForDate = async (date: string) => {
    setBootstrapping(true)
    try {
      const json = await fetchJsonCached(`/api/daily-reports?bootstrap=1&date=${encodeURIComponent(date)}`, undefined, DAILY_REPORT_INITIAL_CACHE_TTL_MS)
      const defaults = json?.defaults || {}
      setForm((prev) => {
        const normalized = normalizeRecordToForm(defaults)
        const fromDefaults = Number(normalized?.report_no || 0)
        const fromDateRule = Number(getDailyReportNoFromDate(date) || 0)
        const finalReportNo = fromDateRule > 0
          ? fromDateRule
          : (fromDefaults > 0 ? fromDefaults : 29)
        if (false) console.debug("[daily-report][report-no-debug] bootstrap", {
          report_no_date_rule: fromDateRule,
          report_no_bootstrap_backend: fromDefaults,
          report_no_final: finalReportNo
        })
        return {
          ...prev,
          ...normalized,
          report_date: date,
          report_no: String(finalReportNo)
        }
      })
    } catch (err: any) {
      showToast(err?.message || "No se pudo autocompletar", "error")
    } finally {
      setBootstrapping(false)
    }
  }

  useEffect(() => {
    if (status !== "authenticated" || !canAccess) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await Promise.all([loadRecords(), loadCollaborators(), loadFieldReportDates(), loadReportFrontNames()])
      } catch (err: any) {
        if (!cancelled) showToast(err?.message || "Error cargando historial", "error")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [status, canAccess])

  useEffect(() => {
    if (!formOpen || !form.report_date) return
    let cancelled = false
    ;(async () => {
      try {
        const date = String(form.report_date || "").slice(0, 10)
        await loadCollaborators(false, date)
      } catch (err: any) {
        if (!cancelled) showToast(err?.message || "Error cargando cargos historicos", "error")
      }
    })()
    return () => { cancelled = true }
  }, [formOpen, form.report_date])

  useEffect(() => {
    // In "Ver", use persisted snapshot only; do not pull live field reports.
    if (!formOpen || !form.report_date) return
    let cancelled = false
    ;(async () => {
      try {
        const day = String(form.report_date).slice(0, 10)
        const cached = fieldReportsByDateCacheRef.current[day]
        if (cached) {
          if (!cancelled) setFieldReportsForDate(cached)
          return
        }
        const res = await fetch(`/api/field-reports?date=${encodeURIComponent(day)}&summary=1&include_calc=1&limit=50`)
        const json = await res.json()
        if (!res.ok) {
          if (!cancelled) setFieldReportsForDate([])
          return
        }
        const rows = Array.isArray(json) ? json : []
        fieldReportsByDateCacheRef.current[day] = rows
        if (!cancelled) setFieldReportsForDate(rows)
      } catch {
        if (!cancelled) setFieldReportsForDate([])
      }
    })()
    return () => { cancelled = true }
  }, [formOpen, form.report_date])

  const getTurnoFieldBossNames = useMemo(() => {
    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
    })

    const names = new Set<string>()
    ;(dailyStatusRows || []).forEach((row: any) => {
      const rowCollab = row?.collaborator || {}
      const collabId = String(rowCollab?.id || row?.collaborator_id || "").trim()
      const base = collabId ? collaboratorById.get(collabId) : null
      const merged = { ...(base || {}), ...(rowCollab || {}) } as any
      const position = normalizeTextLite(String(merged?.position || ""))
      const normalizedStatus = normalizeAttendanceStatus(row?.status, row?.reason)
      const reasonCode = String(row?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus)
      const isTurno = normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11"
      const isFieldBoss = position.includes("jefe") && position.includes("terreno")
      if (!isTurno || !isFieldBoss) return
      const fullName = `${String(merged?.first_name || "").trim()} ${String(merged?.last_name || "").trim()}`.trim()
      if (fullName) names.add(fullName.toUpperCase())
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
  }, [dailyStatusRows, collaborators])

  useEffect(() => {
    if (!formOpen || !!editingId) return
    if (reportTemplate !== "daily_v2") return

    const nextFormat = form.work_front === "PISCINAS"
      ? "ANT-GPRO-FOR-PISCINAS"
      : "ANT-GPRO-FOR-CANALETAS"
    const nextResponsible = getTurnoFieldBossNames.join(", ")

    setForm((prev) => {
      const next: DailyForm = {
        ...prev,
        report_format_code: nextFormat,
        contract_title: CONTRACT_TITLE_FIXED,
        contract_number: CONTRACT_NUMBER_FIXED,
        site_responsible: nextResponsible
      }
      if (
        prev.report_format_code === next.report_format_code &&
        prev.contract_title === next.contract_title &&
        prev.contract_number === next.contract_number &&
        prev.site_responsible === next.site_responsible
      ) return prev
      return next
    })
  }, [formOpen, editingId, reportTemplate, form.work_front, getTurnoFieldBossNames])

  useEffect(() => {
    if (!formOpen) return
    const front = frontFromForm(form)
    setFrontDraftForms((prev) => ({ ...prev, [front]: form }))
  }, [formOpen, form])

  useEffect(() => {
    // In "Ver", use persisted snapshot only; do not pull live attendance.
    if (!formOpen || !form.report_date) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/collaborators/daily-status?date=${encodeURIComponent(form.report_date)}`)
        const json = await res.json()
        if (!res.ok) {
          if (!cancelled) setDailyStatusRows([])
          return
        }
        const rows = Array.isArray(json?.rows) ? json.rows : []
        if (!cancelled) setDailyStatusRows(rows)
      } catch {
        if (!cancelled) setDailyStatusRows([])
      }
    })()
    return () => { cancelled = true }
  }, [formOpen, form.report_date])

  const options = useMemo(() => ({
    contractor: uniq(records.map((r) => String(r.contractor_name || ""))),
    client: uniq(records.map((r) => String(r.client_name || ""))),
    project: uniq(records.map((r) => String(r.project_name || ""))),
    contractTitle: uniq(records.map((r) => String(r.contract_title || ""))),
    contractNumber: uniq(records.map((r) => String(r.contract_number || ""))),
    calendar: uniq(records.map((r) => String(r.work_calendar || ""))),
    weather: uniq(records.map((r) => String(r.weather_label || "")))
  }), [records])
  const usedDailyDates = useMemo(
    () => new Set(records.map((r) => String(r.report_date || "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))),
    [records]
  )
  const reportDateNavigationDates = useMemo(() => {
    const createdDailyDates = records
      .map((r) => String(r.report_date || "").slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    return Array.from(new Set([...fieldReportDates, ...createdDailyDates])).sort((a, b) => b.localeCompare(a))
  }, [fieldReportDates, records])
  const availableReportDatesForCreate = useMemo(
    () => reportDateNavigationDates.filter((d) => !usedDailyDates.has(d)),
    [reportDateNavigationDates, usedDailyDates]
  )
  const reportDateOptionsForEditor = useMemo(() => {
    if (editingId) {
      const current = String(form.report_date || "").slice(0, 10)
      if (current && !availableReportDatesForCreate.includes(current)) {
        return [current, ...availableReportDatesForCreate]
      }
    }
    return availableReportDatesForCreate
  }, [editingId, form.report_date, availableReportDatesForCreate])

  const dailyReportWeeks = useMemo(() => {
    const dates = records
      .map((record) => String(record.report_date || "").slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    return buildWeekRangesFromDates(dates)
  }, [records])
  const currentCalendarWeekRange = useMemo(() => getWeekRangeFromYmd(todayKey()), [])
  const latestDailyReportWeek = useMemo(
    () => dailyReportWeeks.find((range) => range.start <= currentCalendarWeekRange.start) || dailyReportWeeks[0] || currentCalendarWeekRange,
    [currentCalendarWeekRange, dailyReportWeeks]
  )
  const dailyReportWeekOptions = useMemo(() => {
    const baseWeeks = dailyReportWeeks.length > 0 ? dailyReportWeeks : [currentCalendarWeekRange]
    if (!dailyReportWeekRange?.start) return baseWeeks
    const hasSelectedWeek = baseWeeks.some((range) => range.start === dailyReportWeekRange.start)
    if (hasSelectedWeek) return baseWeeks
    return [dailyReportWeekRange, ...baseWeeks].sort((a, b) => b.start.localeCompare(a.start))
  }, [currentCalendarWeekRange, dailyReportWeekRange, dailyReportWeeks])

  useEffect(() => {
    if (dailyReportWeeks.length === 0) {
      if (!dailyReportWeekRange) setDailyReportWeekRange(currentCalendarWeekRange)
      return
    }
    if (!dailyReportWeekRange) {
      setDailyReportWeekRange(latestDailyReportWeek)
      return
    }
    const stillExists = dailyReportWeeks.some((range) => range.start === dailyReportWeekRange.start)
    if (!stillExists) setDailyReportWeekRange(latestDailyReportWeek)
  }, [currentCalendarWeekRange, dailyReportWeekRange, dailyReportWeeks, latestDailyReportWeek])

  const selectedDailyReportWeekIndex = dailyReportWeekRange
    ? dailyReportWeeks.findIndex((range) => range.start === dailyReportWeekRange.start)
    : -1
  const previousDailyReportWeek = selectedDailyReportWeekIndex >= 0
    ? dailyReportWeeks[selectedDailyReportWeekIndex + 1] || null
    : null
  const nextDailyReportWeekCandidate = selectedDailyReportWeekIndex > 0
    ? dailyReportWeeks[selectedDailyReportWeekIndex - 1] || null
    : null
  const nextDailyReportWeek = nextDailyReportWeekCandidate && nextDailyReportWeekCandidate.start <= currentCalendarWeekRange.start
    ? nextDailyReportWeekCandidate
    : null
  const isViewingLatestDailyReportWeek = Boolean(
    dailyReportWeekRange &&
    latestDailyReportWeek &&
    dailyReportWeekRange.start === latestDailyReportWeek.start
  )
  const dailyReportWeekLabel = dailyReportWeekRange
    ? `Semana ${getProjectWeekNumber(dailyReportWeekRange.start)}: ${formatDateDisplaySlash(dailyReportWeekRange.start)} al ${formatDateDisplaySlash(dailyReportWeekRange.end)}`
    : "Semana de reporte diario"
  const visibleDailyRecords = useMemo(() => {
    if (!dailyReportWeekRange?.start || !dailyReportWeekRange?.end) return records
    return records.filter((record) => {
      const date = String(record.report_date || "").slice(0, 10)
      return date >= dailyReportWeekRange.start && date <= dailyReportWeekRange.end
    })
  }, [dailyReportWeekRange, records])

  const normalizeWorkerType = (value: string) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()

  const inferDisciplineFromText = (value: string) => {
    const t = normalizeTextLite(value)
    if (!t) return "GENERAL"
    if (t.includes("civil") || t.includes("obras civiles")) return "OBRA CIVILES"
    if (t.includes("electric")) return "ELECTRICO"
    if (t.includes("mecanic")) return "MECANICO"
    if (t.includes("caner") || t.includes("cañer") || t.includes("hdpe")) return "CAÑERIA"
    if (t.includes("andam")) return "ANDAMIOS"
    if (t.includes("estruct")) return "ESTRUCTURA"
    if (t.includes("rigger")) return "RIGGER"
    if (t.includes("topogra")) return "TOPOGRAFIA"
    return "GENERAL"
  }
  const inferDirectDiscipline = (params: {
    discipline?: any
    specialty?: any
    position?: any
  }) => {
    const specialtyText = normalizeTextLite(String(params.specialty || ""))
    const positionText = normalizeTextLite(String(params.position || ""))
    if (specialtyText.includes("rigger") || positionText.includes("rigger")) return "RIGGER"
    return inferDisciplineFromText(
      String(params.discipline || params.specialty || params.position || "GENERAL")
    )
  }

  const normalizeCondition = (value: string) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()

  const isVigenteOrActive = (collab?: CollaboratorLite | null) => {
    if (!collab) return false
    const cond = normalizeCondition(String(collab.condition || ""))
    return cond === "vigente"
  }

  const isCourseCondition = (value: string) => {
    const normalized = normalizeCondition(value)
    return normalized.includes("curso") || normalized.includes("capacitacion")
  }

  const isDownException = (value: string) => {
    const normalized = normalizeCondition(value)
    const isBajada = normalized.startsWith("bajada") || normalized.startsWith("baja")
    return (
      (isBajada && normalized.includes("policlinico")) ||
      (isBajada && (normalized.includes("contingencia familiar") || normalized.includes("contigencia familiar"))) ||
      (isBajada && (normalized.includes("otros") || normalized.includes("otro"))) ||
      // Compatibilidad con datos antiguos sin prefijo "Bajada"
      normalized.includes("baja por orden de policlinico") ||
      normalized === "contingencia familiar" ||
      normalized === "contigencia familiar"
    )
  }

  const isPoliclinicoException = (value: string) => {
    const normalized = normalizeCondition(value)
    const isBajada = normalized.startsWith("bajada") || normalized.startsWith("baja")
    if (isBajada) return false
    return normalized.includes("policlinico")
  }

  const isOfficeTeleworkException = (value: string) => {
    const normalized = normalizeCondition(value).replace(/[/-]/g, " ")
    return normalized.includes("oficina central") && normalized.includes("teletrabajo")
  }

  const isOfficeTeleworkCondition = (value: string) => {
    const normalized = normalizeCondition(value).replace(/[/-]/g, " ")
    return normalized.includes("oficina central") && normalized.includes("teletrabajo")
  }

  const buildRowsByWorkerType = (source: CollaboratorLite[], workerTypeMatcher: (normalized: string) => boolean) => {
    const byPosition = new Map<string, number>()
    source.forEach((c) => {
      const workerType = normalizeWorkerType(String(c.worker_type || ""))
      if (!workerTypeMatcher(workerType)) return
      const positionRaw = String(c.position || "").trim()
      const position = positionRaw || "Sin cargo"
      byPosition.set(position, (byPosition.get(position) || 0) + 1)
    })
    return Array.from(byPosition.entries())
      .map(([position, quantity]) => ({ position, quantity, hh: quantity * 12 }))
      .sort((a, b) => a.position.localeCompare(b.position, "es", { sensitivity: "base" }))
  }

  const buildDirectRows = (source: CollaboratorLite[]) => {
    const grouped = new Map<string, { specialty: string; position: string; quantity: number }>()
    source.forEach((c) => {
      const workerType = normalizeWorkerType(String(c.worker_type || ""))
      if (workerType !== "directo") return
      const specialty = String(c.specialty || "").trim() || "Sin especialidad"
      const position = String(c.position || "").trim() || "Sin cargo"
      const key = `${specialty}|||${position}`
      const current = grouped.get(key) || { specialty, position, quantity: 0 }
      current.quantity += 1
      grouped.set(key, current)
    })

    const sorted = Array.from(grouped.values()).sort((a, b) => {
      const bySpecialty = a.specialty.localeCompare(b.specialty, "es", { sensitivity: "base" })
      if (bySpecialty !== 0) return bySpecialty
      return a.position.localeCompare(b.position, "es", { sensitivity: "base" })
    })

    return sorted.map((row, idx, arr) => {
      const prevSpecialty = idx > 0 ? arr[idx - 1].specialty : null
      const showSpecialty = row.specialty !== prevSpecialty
      const specialtyRowSpan = showSpecialty
        ? arr.filter((x) => x.specialty === row.specialty).length
        : 0
      return {
        specialty: row.specialty,
        position: row.position,
        quantity: row.quantity,
        realOnSite: row.quantity,
        hh12: row.quantity * 12,
        quantityProductive: row.quantity,
        hh11: row.quantity * 11,
        showSpecialty,
        specialtyRowSpan
      }
    })
  }

  const courseCollaborators = useMemo(() => {
    return collaborators.filter((c) => isCourseCondition(String(c.exception_condition || "")))
  }, [collaborators])

  const downCollaborators = useMemo(() => {
    return collaborators.filter((c) => {
      const cond = normalizeCondition(String(c.condition || ""))
      return cond === "turno" && isDownException(String(c.exception_condition || ""))
    })
  }, [collaborators])

  const policlinicoCollaborators = useMemo(() => {
    return collaborators.filter((c) => {
      const cond = normalizeCondition(String(c.condition || ""))
      return cond === "turno" && isPoliclinicoException(String(c.exception_condition || ""))
    })
  }, [collaborators])

  const teleworkCollaborators = useMemo(() => {
    return collaborators.filter((c) => {
      const cond = normalizeCondition(String(c.condition || ""))
      return isOfficeTeleworkCondition(cond) || isOfficeTeleworkException(String(c.exception_condition || ""))
    })
  }, [collaborators])

  const indirectRows = useMemo(() => {
    return buildRowsByWorkerType(collaborators, (workerType) => workerType === "indirecto")
  }, [collaborators])

  const directNoOperationalRows = useMemo(() => {
    return buildRowsByWorkerType(collaborators, (workerType) => /directo\s*no\s*operacional/.test(workerType))
  }, [collaborators])

  const directRows = useMemo(() => {
    return buildDirectRows(collaborators)
  }, [collaborators])

  const courseIndirectRows = useMemo(() => {
    return buildRowsByWorkerType(courseCollaborators, (workerType) => workerType === "indirecto")
  }, [courseCollaborators])

  const courseDirectNoOperationalRows = useMemo(() => {
    return buildRowsByWorkerType(courseCollaborators, (workerType) => /directo\s*no\s*operacional/.test(workerType))
  }, [courseCollaborators])

  const courseDirectRows = useMemo(() => {
    return buildDirectRows(courseCollaborators)
  }, [courseCollaborators])

  const downIndirectRows = useMemo(() => {
    return buildRowsByWorkerType(downCollaborators, (workerType) => workerType === "indirecto")
  }, [downCollaborators])

  const downDirectNoOperationalRows = useMemo(() => {
    return buildRowsByWorkerType(downCollaborators, (workerType) => /directo\s*no\s*operacional/.test(workerType))
  }, [downCollaborators])

  const downDirectRows = useMemo(() => {
    return buildDirectRows(downCollaborators)
  }, [downCollaborators])

  const policlinicoIndirectRows = useMemo(() => {
    return buildRowsByWorkerType(policlinicoCollaborators, (workerType) => workerType === "indirecto")
  }, [policlinicoCollaborators])

  const policlinicoDirectNoOperationalRows = useMemo(() => {
    return buildRowsByWorkerType(policlinicoCollaborators, (workerType) => /directo\s*no\s*operacional/.test(workerType))
  }, [policlinicoCollaborators])

  const policlinicoDirectRows = useMemo(() => {
    return buildDirectRows(policlinicoCollaborators)
  }, [policlinicoCollaborators])

  const teleworkIndirectRows = useMemo(() => {
    return buildRowsByWorkerType(teleworkCollaborators, (workerType) => workerType === "indirecto")
  }, [teleworkCollaborators])

  const currentReportIndirectWorkers = useMemo(() => {
    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
    })

    const workersMap = new Map<string, {
      workerId: string
      fullName: string
      roleOrSpecialty: string
      statusLabel: string
      searchText: string
    }>()

    ;(dailyStatusRows || []).forEach((daily) => {
      const dailyCollab = ((daily as any)?.collaborator || {}) as CollaboratorLite
      const workerId = String((dailyCollab as any)?.id || (daily as any)?.collaborator_id || "").trim()
      if (!workerId) return
      const base = collaboratorById.get(workerId)
      const workerType = normalizeWorkerType(String(dailyCollab?.worker_type || base?.worker_type || ""))
      if (workerType !== "indirecto") return
      const normalizedStatus = normalizeAttendanceStatus((daily as any)?.status, (daily as any)?.reason)
      const reasonCode = String((daily as any)?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String((daily as any)?.status || "").trim().toUpperCase()
      const isTurno = normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11"
      if (!isTurno) return

      const firstName = String(dailyCollab?.first_name || base?.first_name || "").trim()
      const lastName = String(dailyCollab?.last_name || base?.last_name || "").trim()
      const fullName = (`${firstName} ${lastName}`.trim() || "SIN NOMBRE").toUpperCase()
      const dailyAny = dailyCollab as any
      const baseAny = (base || {}) as any
      const rowAny = daily as any
      const roleOrSpecialty = String(
        dailyAny?.position ||
        baseAny?.position ||
        dailyAny?.specialty ||
        baseAny?.specialty ||
        dailyAny?.cargo ||
        baseAny?.cargo ||
        dailyAny?.role ||
        rowAny?.role ||
        dailyAny?.speciality ||
        baseAny?.speciality ||
        ""
      ).trim().toUpperCase()
      const searchText = [
        fullName,
        String(dailyAny?.position || ""),
        String(baseAny?.position || ""),
        String(dailyAny?.specialty || ""),
        String(baseAny?.specialty || ""),
        String(dailyAny?.cargo || ""),
        String(baseAny?.cargo || ""),
        String(dailyAny?.role || ""),
        String(rowAny?.role || ""),
        String(dailyAny?.speciality || ""),
        String(baseAny?.speciality || ""),
        String(rowAny?.position || ""),
        String(rowAny?.specialty || ""),
        String(rowAny?.cargo || "")
      ].join(" ")

      workersMap.set(workerId, {
        workerId,
        fullName,
        roleOrSpecialty,
        statusLabel: String(normalizedStatus || "TURNO").toUpperCase(),
        searchText
      })
    })

    return Array.from(workersMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, "es", { sensitivity: "base" }))
  }, [dailyStatusRows, collaborators])

  const filteredIndirectWorkers = useMemo(() => {
    const q = normalizeTextLite(indirectHoursSearch)
    if (!q) return []
    return currentReportIndirectWorkers
      .filter((worker) => {
        const haystack = normalizeTextLite(worker.searchText)
        return haystack.includes(q)
      })
      .filter((worker) => indirectHoursOverridesDraft[worker.workerId] == null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "es", { sensitivity: "base" }))
  }, [currentReportIndirectWorkers, indirectHoursSearch, indirectHoursOverridesDraft])

  const appliedIndirectWorkers = useMemo(() => {
    return currentReportIndirectWorkers
      .filter((worker) => indirectHoursOverridesDraft[worker.workerId] != null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "es", { sensitivity: "base" }))
  }, [currentReportIndirectWorkers, indirectHoursOverridesDraft])

  const filteredIndirectFrontWorkers = useMemo(() => {
    const q = normalizeTextLite(indirectFrontSearch)
    if (!q) return []
    return currentReportIndirectWorkers
      .filter((worker) => normalizeTextLite(worker.searchText).includes(q))
      .filter((worker) => indirectHoursFrontOverridesDraft[worker.workerId] == null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "es", { sensitivity: "base" }))
  }, [currentReportIndirectWorkers, indirectFrontSearch, indirectHoursFrontOverridesDraft])

  const appliedIndirectFrontWorkers = useMemo(() => {
    return currentReportIndirectWorkers
      .filter((worker) => indirectHoursFrontOverridesDraft[worker.workerId] != null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "es", { sensitivity: "base" }))
  }, [currentReportIndirectWorkers, indirectHoursFrontOverridesDraft])

  const indirectOverrideFrontDotByPosition = useMemo(() => {
    if (Object.keys(indirectHoursOverrides).length === 0) return {}

    const normalize = (value: string) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const inferBaseFront = (frontLike: any): "CANALETAS" | "PISCINAS" | null => {
      const v = normalize(String(frontLike || ""))
      if (v === "CANALETAS" || v.includes("CONTRATO BASE CANALETAS")) return "CANALETAS"
      if (v === "PISCINAS" || v.includes("CONTRATO BASE PISCINAS")) return "PISCINAS"
      return null
    }

    const activeFronts = new Set<"CANALETAS" | "PISCINAS">()
    ;(fieldReportsForDate || []).forEach((report: any) => {
      const reportFront = inferBaseFront(report?.work_front || report?.front || report?.frente || "")
      if (reportFront) activeFronts.add(reportFront)
    })
    const validFrontCount = activeFronts.size > 0 ? activeFronts.size : 2
    const frontDivisor = indirectHoursFrontApplyScope === "CURRENT_FRONT_ONLY" ? 1 : validFrontCount

    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
    })

    const out: Record<string, number> = {}
    ;(dailyStatusRows || []).forEach((daily) => {
      const dailyCollab = ((daily as any)?.collaborator || {}) as CollaboratorLite
      const workerId = String((dailyCollab as any)?.id || (daily as any)?.collaborator_id || "").trim()
      if (!workerId) return

      const manualHours = indirectHoursOverrides[workerId]
      if (manualHours == null) return

      const base = collaboratorById.get(workerId)
      const workerType = normalizeWorkerType(String(dailyCollab?.worker_type || base?.worker_type || ""))
      if (workerType !== "indirecto") return

      const positionText = String(dailyCollab?.position || base?.position || "SIN CARGO")
      const pos = String(positionText || "").trim().toUpperCase() || "SIN CARGO"
      const roleNorm = normalize(pos)
      const isSpecialRole =
        roleNorm.includes("TOPOGRAFO") ||
        roleNorm.includes("ALARIFE") ||
        roleNorm.includes("NIVELADOR") ||
        roleNorm.includes("RIGGER") ||
        roleNorm.includes("PREVENCIONISTA") ||
        roleNorm.includes("MECANICO MANTENCION") ||
        roleNorm.includes("ELECTRICO MANTENCION")
      if (isSpecialRole) return

      const normalizedStatus = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String(daily?.status || "").trim().toUpperCase()
      const code = reasonCode || statusCode
      const isExcludedFromBase =
        code === "FO" ||
        normalizedStatus === "Fuera de Obra" ||
        reasonCode === "D" ||
        code === "L" ||
        code === "P" ||
        code === "F"
      if (isExcludedFromBase) return

      const basePerFront = 1 / validFrontCount
      const overridePerFront = resolvePersonDotationFromHours(manualHours, form) / frontDivisor
      const delta = overridePerFront - basePerFront
      out[pos] = Number(out[pos] || 0) + delta
    })

    return out
  }, [dailyStatusRows, collaborators, indirectHoursOverrides, fieldReportsForDate, indirectHoursFrontApplyScope])

  const indirectManualSpecialFrontByPosition = useMemo(() => {
    if (Object.keys(indirectHoursFrontOverrides).length === 0) return {}
    const normalize = (value: string) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
    })
    const out: Record<string, { canaletas: number; piscinas: number }> = {}
    ;(dailyStatusRows || []).forEach((daily) => {
      const dailyCollab = ((daily as any)?.collaborator || {}) as CollaboratorLite
      const workerId = String((dailyCollab as any)?.id || (daily as any)?.collaborator_id || "").trim()
      if (!workerId) return
      const manualFront = String(indirectHoursFrontOverrides[workerId] || "").toUpperCase()
      if (!(manualFront === "CANALETAS" || manualFront === "PISCINAS" || manualFront === "BOTH")) return
      const base = collaboratorById.get(workerId)
      const workerType = normalizeWorkerType(String(dailyCollab?.worker_type || base?.worker_type || ""))
      if (workerType !== "indirecto") return

      const pos = String(dailyCollab?.position || base?.position || "SIN CARGO").trim().toUpperCase() || "SIN CARGO"
      const roleNorm = normalize(pos)
      const mode = manualFront
      if (!out[pos]) out[pos] = { canaletas: 0, piscinas: 0 }
      if (mode === "CANALETAS") out[pos].canaletas += 1
      else if (mode === "PISCINAS") out[pos].piscinas += 1
      else {
        out[pos].canaletas += 0.5
        out[pos].piscinas += 0.5
      }
    })
    return out
  }, [dailyStatusRows, collaborators, indirectHoursFrontOverrides])

  const v2IndirectAttendanceRows = useMemo(() => {
    const persistedRows = getPersistedV2RowsFromForm(form, "v2_detail_indirect_rows")
    const shouldUsePersistedRows = (isViewingHistoryVersion || viewOpen || isEditSnapshotMode)
    if (shouldUsePersistedRows) {
      if (persistedRows.length === 0) return []
      if (editingId) {
        if (false) console.log("[daily-report][edit-persisted-rows][indirect]", {
          editingId,
          rows: persistedRows.length
        })
      }
      return hydratePersistedV2Rows(persistedRows)
    }

    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
    })

    const groups = new Map<string, {
      position: string
      hhTurnoDia: number
      contratados: number
      contratacionProceso: number
      apoyoOficina: number
      descansoCambioTurno: number
      permisoCovid: number
      renunciaVoluntaria: number
      terminoContrato: number
      enCurso3d: number
      capacitacionAcreditacion: number
      teletrabajo: number
      pruebaPractica: number
      ofertaComercial: number
      instalacionFaena: number
      frente: number
      dotacionTotalObra: number
      hhTotalObra: number
    }>()

    const ensureRow = (position: string) => {
      const key = String(position || "SIN CARGO").trim().toUpperCase() || "SIN CARGO"
      if (!groups.has(key)) {
        groups.set(key, {
          position: key,
          hhTurnoDia: activePersonWorkdayHours,
          contratados: 0,
          contratacionProceso: 0,
          apoyoOficina: 0,
          descansoCambioTurno: 0,
          permisoCovid: 0,
          renunciaVoluntaria: 0,
          terminoContrato: 0,
          enCurso3d: 0,
          capacitacionAcreditacion: 0,
          teletrabajo: 0,
          pruebaPractica: 0,
          ofertaComercial: 0,
          instalacionFaena: 0,
          frente: 0,
          dotacionTotalObra: 0,
          hhTotalObra: 0
        })
      }
      return groups.get(key)!
    }

    ;(collaborators || []).forEach((collab) => {
      const workerType = normalizeWorkerType(String(collab.worker_type || ""))
      if (workerType !== "indirecto") return
      const row = ensureRow(String(collab.position || "SIN CARGO"))
      const cond = normalizeCondition(String(collab.condition || ""))
      if (cond === "finiquitado") row.terminoContrato += 1
      else if (isHiredByReportDate(collab, form.report_date)) row.contratados += 1
    })

    dailyStatusRows.forEach((daily) => {
      const collab = ((daily as any)?.collaborator || {}) as CollaboratorLite
      const collabId = String((collab as any)?.id || (daily as any)?.collaborator_id || "").trim()
      const base = collabId ? (collaboratorById.get(collabId) || null) : null
      const workerType = normalizeWorkerType(String(collab.worker_type || base?.worker_type || ""))
      if (workerType !== "indirecto") return
      const row = ensureRow(String(collab.position || base?.position || "SIN CARGO"))

      const normalizedStatus = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String(daily?.status || "").trim().toUpperCase()
      const code = reasonCode || statusCode
      const isTurno = normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11" || statusCode === "10"

      if (isTurno) {
        const posText = String(collab.position || base?.position || "").toUpperCase()
        const isFrontDeclaredSpecialRole = posText.includes("RIGGER")
        // RIGGER se distribuye por frente según reportes de terreno.
        if (isFrontDeclaredSpecialRole) {
          // keep status counters (contratados/FO/etc.) but skip base dotation here
        } else
        if (posText.includes("PREVENCIONISTA")) {
          // PREVENCIONISTA se maneja en unidades enteras.
          row.dotacionTotalObra += 1
          row.hhTotalObra += activePersonWorkdayHours
        } else {
          row.dotacionTotalObra += 1
          row.hhTotalObra += activePersonWorkdayHours
        }
      }
      if (code === "FO" || normalizedStatus === "Fuera de Obra") row.apoyoOficina += 1
      if (reasonCode === "D") row.descansoCambioTurno += 1
      if (code === "L" || code === "P" || code === "F") row.permisoCovid += 1
      if (code === "3D") row.enCurso3d += 1
      if (code === "AC") row.capacitacionAcreditacion += 1
      if (code === "TL") row.teletrabajo += 1

      // Columnas sin cálculo por ahora: se mantienen en 0 según requerimiento.
    })

    return Array.from(groups.values()).sort((a, b) => a.position.localeCompare(b.position, "es", { sensitivity: "base" }))
  }, [dailyStatusRows, collaborators, editingId, form, isEditSnapshotMode, isViewingHistoryVersion, viewOpen])

  const v2DirectAttendanceRows = useMemo(() => {
    const persistedRows = getPersistedV2RowsFromForm(form, "v2_detail_direct_rows")
    const shouldUsePersistedRows = (isViewingHistoryVersion || viewOpen || isEditSnapshotMode)
    if (shouldUsePersistedRows) {
      if (persistedRows.length === 0) return []
      if (editingId) {
        if (false) console.log("[daily-report][edit-persisted-rows][direct]", {
          editingId,
          rows: persistedRows.length
        })
      }
      return hydratePersistedV2Rows(persistedRows)
    }

    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
    })

    const groups = new Map<string, {
      discipline: string
      specialty: string
      position: string
      hhTurnoDia: number
      contratados: number
      contratacionProceso: number
      apoyoOficina: number
      descansoCambioTurno: number
      permisoCovid: number
      renunciaVoluntaria: number
      terminoContrato: number
      enCurso3d: number
      capacitacionAcreditacion: number
      teletrabajo: number
      pruebaPractica: number
      ofertaComercial: number
      instalacionFaena: number
      frente: number
      dotacionTotalObra: number
      hhTotalObra: number
    }>()

    const ensureRow = (discipline: string, specialty: string, position: string) => {
      const disc = normalizeDirectKeyToken(discipline || specialty || "GENERAL") || "GENERAL"
      const spec = normalizeSpecialtyLabel(specialty, discipline, position) || "PERSONAL DIRECTO"
      const pos = normalizeDirectKeyToken(position || "SIN CARGO") || "SIN CARGO"
      const key = `${disc}|||${spec}|||${pos}`
      if (!groups.has(key)) {
        groups.set(key, {
          discipline: disc,
          specialty: spec,
          position: pos,
          hhTurnoDia: activePersonWorkdayHours,
          contratados: 0,
          contratacionProceso: 0,
          apoyoOficina: 0,
          descansoCambioTurno: 0,
          permisoCovid: 0,
          renunciaVoluntaria: 0,
          terminoContrato: 0,
          enCurso3d: 0,
          capacitacionAcreditacion: 0,
          teletrabajo: 0,
          pruebaPractica: 0,
          ofertaComercial: 0,
          instalacionFaena: 0,
          frente: 0,
          dotacionTotalObra: 0,
          hhTotalObra: 0
        })
      }
      return groups.get(key)!
    }

    ;(collaborators || []).forEach((collab) => {
      const workerType = normalizeWorkerType(String(collab.worker_type || ""))
      const posText = String(collab.position || "").toUpperCase()
      const isCapataz = posText.includes("CAPATAZ")
      if (workerType !== "directo" && !isCapataz) return
      const specialtyCandidate = normalizeSpecialtyLabel(collab.specialty, (collab as any).discipline || (collab as any).disciplina, collab.position)
      const positionCandidate = String(collab.position || "SIN CARGO")
      const disciplineCandidate = inferDirectDiscipline({
        discipline: (collab as any).discipline || (collab as any).disciplina,
        specialty: specialtyCandidate,
        position: positionCandidate
      })
      const row = ensureRow(
        disciplineCandidate,
        specialtyCandidate || disciplineCandidate,
        positionCandidate
      )
      const cond = normalizeCondition(String(collab.condition || ""))
      if (cond === "finiquitado") row.terminoContrato += 1
      else if (isHiredByReportDate(collab, form.report_date)) row.contratados += 1
    })

    dailyStatusRows.forEach((daily) => {
      const collab = ((daily as any)?.collaborator || {}) as CollaboratorLite
      const collabId = String((collab as any)?.id || (daily as any)?.collaborator_id || "").trim()
      const base = collabId ? (collaboratorById.get(collabId) || null) : null
      const workerType = normalizeWorkerType(String(collab.worker_type || base?.worker_type || ""))
      const posText = String(collab.position || base?.position || "").toUpperCase()
      const isCapataz = posText.includes("CAPATAZ")
      if (workerType !== "directo" && !isCapataz) return
      const specialtyCandidate = normalizeSpecialtyLabel(
        collab.specialty || base?.specialty,
        (collab as any).discipline || (collab as any).disciplina || (base as any)?.discipline || (base as any)?.disciplina,
        collab.position || base?.position
      )
      const positionCandidate =
        String(collab.position || base?.position || "SIN CARGO")
      const disciplineCandidate = inferDirectDiscipline({
        discipline: (collab as any).discipline || (collab as any).disciplina,
        specialty: specialtyCandidate,
        position: positionCandidate
      })
      const row = ensureRow(
        disciplineCandidate,
        specialtyCandidate || disciplineCandidate,
        positionCandidate
      )
      const normalizedStatus = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String(daily?.status || "").trim().toUpperCase()
      const code = reasonCode || statusCode
      const isTurno = normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11" || statusCode === "10"
      if (isTurno) {
        row.dotacionTotalObra += 0.5
        row.hhTotalObra += activeHalfDayHours
      }
      if (code === "FO" || normalizedStatus === "Fuera de Obra") row.apoyoOficina += 1
      if (reasonCode === "D") row.descansoCambioTurno += 1
      if (code === "L" || code === "P" || code === "F") row.permisoCovid += 1
      if (code === "3D") row.enCurso3d += 1
      if (code === "AC") row.capacitacionAcreditacion += 1
      if (code === "TL") row.teletrabajo += 1

      // Columnas sin cálculo por ahora: se mantienen en 0 según requerimiento.
    })

    return Array.from(groups.values()).sort((a, b) => {
      const byDisc = a.discipline.localeCompare(b.discipline, "es", { sensitivity: "base" })
      if (byDisc !== 0) return byDisc
      const bySpec = a.specialty.localeCompare(b.specialty, "es", { sensitivity: "base" })
      if (bySpec !== 0) return bySpec
      return a.position.localeCompare(b.position, "es", { sensitivity: "base" })
    })
  }, [dailyStatusRows, collaborators, form.report_date, editingId, form, activePersonWorkdayHours, activeHalfDayHours, isEditSnapshotMode, isViewingHistoryVersion, viewOpen])

  const v2RenderDebugRef = useRef<{
    indirectCount: number
    directCount: number
    indirectPersisted: number
    directPersisted: number
  } | null>(null)
  useEffect(() => {
    if (!formOpen && !viewOpen) return
    const indirectPersisted = (v2IndirectAttendanceRows || []).filter((row: any) => row?.__persistedDailySnapshot === true).length
    const directPersisted = (v2DirectAttendanceRows || []).filter((row: any) => row?.__persistedDailySnapshot === true).length
    const next = {
      indirectCount: (v2IndirectAttendanceRows || []).length,
      directCount: (v2DirectAttendanceRows || []).length,
      indirectPersisted,
      directPersisted
    }
    const prev = v2RenderDebugRef.current
    const changed = !prev ||
      prev.indirectCount !== next.indirectCount ||
      prev.directCount !== next.directCount ||
      prev.indirectPersisted !== next.indirectPersisted ||
      prev.directPersisted !== next.directPersisted
    if (changed) {
      v2RenderDebugRef.current = next
    }
  }, [formOpen, viewOpen, editingId, viewRecord, v2IndirectAttendanceRows, v2DirectAttendanceRows])

  const v2SummaryMetrics = useMemo(() => {
    const n = (value: unknown) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    const hhToDot = (hh: unknown) => Number(resolvePersonDotationFromHours(n(hh), form).toFixed(2))
    const currentFront: "CANALETAS" | "PISCINAS" =
      String(form.work_front || "").toUpperCase() === "PISCINAS" ? "PISCINAS" : "CANALETAS"
    const visibleDotFromV2Row = (row: any) => {
      const splitDot = n(row?.instalacionFaena) + n(row?.frente)
      if (splitDot > 0) return Number(splitDot.toFixed(2))
      return n(row?.dotacionTotalObra)
    }
    const dayIndirectDotFromRows = Number(v2IndirectAttendanceRows.reduce((acc, row) => acc + visibleDotFromV2Row(row), 0).toFixed(2))
    const dayDirectDotFromRows = Number(v2DirectAttendanceRows.reduce((acc, row) => acc + visibleDotFromV2Row(row), 0).toFixed(2))
    const dayIndirectHhFromRows = Number((dayIndirectDotFromRows * activePersonWorkdayHours).toFixed(2))
    const dayDirectHhFromRows = Number((dayDirectDotFromRows * activePersonWorkdayHours).toFixed(2))

    const currentDate = String(form.report_date || "")
    const currentReportNo = Number(form.report_no || 0)
    const baselineFromTable = frontBaselines[currentFront]
    const seed = FRONT_INITIAL_BASELINE[currentFront]
    const historyPrev = (frontHistoryRows || [])
      .filter((row) => {
        if (row.work_front !== currentFront) return false
        const rd = String(row.report_date || "")
        const rn = Number(row.report_no || 0)
        if (!currentDate) return true
        if (rd < currentDate) return true
        if (rd > currentDate) return false
        if (!Number.isFinite(currentReportNo) || currentReportNo <= 0) return false
        return rn < currentReportNo
      })
      .sort((a, b) => {
        const da = String(a?.report_date || "")
        const db = String(b?.report_date || "")
        if (da !== db) return da.localeCompare(db)
        return Number(a?.report_no || 0) - Number(b?.report_no || 0)
      })
      .at(-1)
    const seedIndirectHh = n(historyPrev?.indirect_hh_accum ?? baselineFromTable?.prev_indirect_hh ?? seed?.indirectHh ?? 0)
    const seedDirectHh = n(historyPrev?.direct_hh_accum ?? baselineFromTable?.prev_direct_hh ?? seed?.directHh ?? 0)
    const seedMajorQty = n(historyPrev?.major_equip_accum ?? baselineFromTable?.prev_major_equip ?? seed?.majorQty ?? 0)
    const seedMajorHm = n(historyPrev?.major_hm_accum ?? baselineFromTable?.prev_major_hm ?? seed?.majorHm ?? 0)
    const seedMinorQty = n(historyPrev?.minor_equip_accum ?? baselineFromTable?.prev_minor_equip ?? seed?.minorQty ?? 0)
    const seedMinorHm = n(historyPrev?.minor_hm_accum ?? baselineFromTable?.prev_minor_hm ?? seed?.minorHm ?? 0)
    const basePrevious = {
      indirectHh: seedIndirectHh,
      indirectDot: hhToDot(seedIndirectHh),
      directHh: seedDirectHh,
      directDot: hhToDot(seedDirectHh),
      majorQty: seedMajorQty,
      majorHm: seedMajorHm,
      minorQty: seedMinorQty,
      minorHm: seedMinorHm
    }
    const detectRecordFrontStrictForAccum = (record: DailyReportRecord): "CANALETAS" | "PISCINAS" | null => {
      const recAny = record as any
      const notes = recAny?.notes && typeof recAny.notes === "object" ? recAny.notes : {}
      const runtime = recAny?.v2_runtime_snapshot && typeof recAny.v2_runtime_snapshot === "object" ? recAny.v2_runtime_snapshot : {}
      const formSnap = recAny?.v2_form_snapshot && typeof recAny.v2_form_snapshot === "object" ? recAny.v2_form_snapshot : {}
      const candidates = [
        String(recAny?.work_front || ""),
        String(recAny?.front || ""),
        String(recAny?.frente || ""),
        String(recAny?.report_format_code || ""),
        String(notes?.work_front || ""),
        String(runtime?.work_front || ""),
        String(formSnap?.work_front || ""),
        String(notes?.report_format_code || ""),
        String(runtime?.report_format_code || ""),
        String(formSnap?.report_format_code || "")
      ].map((v) => v.toUpperCase())
      if (candidates.some((v) => v === "PISCINAS" || v.includes("PISCINAS"))) return "PISCINAS"
      if (candidates.some((v) => v === "CANALETAS" || v.includes("CANALETAS"))) return "CANALETAS"
      return null
    }
    const isBeforeCurrent = (record: DailyReportRecord) => {
      const rd = String(record?.report_date || "")
      const rn = Number(record?.report_no || 0)
      if (!currentDate) return true
      if (rd < currentDate) return true
      if (rd > currentDate) return false
      if (!Number.isFinite(currentReportNo) || currentReportNo <= 0) return false
      return rn < currentReportNo
    }
    let daily = {
      // In V2 the visible row split (Instalacion Faena + Frente) is the source of truth.
      indirectDot: dayIndirectDotFromRows || n(form.summary_indirect_dotation),
      indirectHh: dayIndirectHhFromRows || n(form.summary_indirect_hh),
      directDot: dayDirectDotFromRows || n(form.summary_direct_dotation),
      directHh: dayDirectHhFromRows || n(form.summary_direct_hh),
      totalDot: (dayIndirectDotFromRows + dayDirectDotFromRows) || n(form.summary_total_dotation) || (n(form.summary_indirect_dotation) + n(form.summary_direct_dotation)),
      totalHh: (dayIndirectHhFromRows + dayDirectHhFromRows) || n(form.summary_total_hh) || (n(form.summary_indirect_hh) + n(form.summary_direct_hh)),
      majorQty: n(form.equip_major_qty),
      majorHm: n(form.equip_major_hm),
      minorQty: n(form.equip_minor_qty),
      minorHm: n(form.equip_minor_hm),
      equipmentCount: n(form.equip_total_qty) || (n(form.equip_major_qty) + n(form.equip_minor_qty)),
      equipmentHm: n(form.equip_total_hm) || (n(form.equip_major_hm) + n(form.equip_minor_hm))
    }

    const previousCandidates = (records || []).map((record) => {
      const notes = (record?.notes && typeof record.notes === "object")
        ? (record.notes as Record<string, any>)
        : {}
      const detectedFrontStrict = detectRecordFrontStrictForAccum(record)
      const includedInAccumulation =
        !!record?.report_date &&
        (!editingId || String(record.id) !== String(editingId)) &&
        !!detectedFrontStrict &&
        detectedFrontStrict === currentFront &&
        isBeforeCurrent(record)
      return {
        id: String(record?.id || ""),
        report_no: Number(record?.report_no || 0),
        report_date: String(record?.report_date || ""),
        detectedFrontStrict,
        includedInAccumulation,
        summary_indirect_hh: Number(notes?.summary_indirect_hh || 0),
        summary_direct_hh: Number(notes?.summary_direct_hh || 0),
        equip_total_hm: Number(notes?.equip_total_hm || 0)
      }
    })

    const previousReportsSameFront = (records || [])
      .filter((record) => {
        if (!record?.report_date) return false
        if (editingId && String(record.id) === String(editingId)) return false
        const recordFront = detectRecordFrontStrictForAccum(record)
        if (!recordFront) return false
        if (recordFront !== currentFront) return false
        return isBeforeCurrent(record)
      })
      .sort((a, b) => {
        const da = String(a?.report_date || "")
        const db = String(b?.report_date || "")
        if (da !== db) return da.localeCompare(db)
        return Number(a?.report_no || 0) - Number(b?.report_no || 0)
      })
    const previousByDailyChain = historyPrev ? basePrevious : previousReportsSameFront.reduce((acc, record) => {
      const recAny = record as any
      const notes = (record?.notes && typeof record.notes === "object")
        ? (record.notes as Record<string, any>)
        : {}
      const indirectHhFromS4Delta = Math.max(0, n(recAny?.s4_curr_indirect_hh) - n(recAny?.s4_prev_indirect_hh))
      const directHhFromS4Delta = Math.max(0, n(recAny?.s4_curr_direct_hh) - n(recAny?.s4_prev_direct_hh))
      const prevDailyIndirectHh = n(notes.summary_indirect_hh) || indirectHhFromS4Delta
      const prevDailyDirectHh = n(notes.summary_direct_hh) || directHhFromS4Delta
      const prevDailyIndirectDot = n(notes.summary_indirect_dotation) || hhToDot(prevDailyIndirectHh)
      const prevDailyDirectDot = n(notes.summary_direct_dotation) || hhToDot(prevDailyDirectHh)
      const prevDailyMajorQty = n(notes.equip_major_qty)
      const prevDailyMajorHm = n(notes.equip_major_hm)
      const prevDailyMinorQty = n(notes.equip_minor_qty)
      const prevDailyMinorHm = n(notes.equip_minor_hm)
      return {
        indirectDot: acc.indirectDot + prevDailyIndirectDot,
        indirectHh: acc.indirectHh + prevDailyIndirectHh,
        directDot: acc.directDot + prevDailyDirectDot,
        directHh: acc.directHh + prevDailyDirectHh,
        majorQty: acc.majorQty + prevDailyMajorQty,
        majorHm: acc.majorHm + prevDailyMajorHm,
        minorQty: acc.minorQty + prevDailyMinorQty,
        minorHm: acc.minorHm + prevDailyMinorHm
      }
    }, basePrevious)

    const latestPreviousSameFront = previousReportsSameFront.at(-1)
    const latestPrevAny = latestPreviousSameFront as any
    const latestPrevNotes =
      latestPrevAny?.notes && typeof latestPrevAny.notes === "object"
        ? (latestPrevAny.notes as Record<string, any>)
        : {}
    const prevFromLatestS4 = latestPreviousSameFront
      ? {
          indirectDot: n(latestPrevAny?.s4_curr_indirect_dot ?? latestPrevNotes?.s4_curr_indirect_dot),
          indirectHh: n(latestPrevAny?.s4_curr_indirect_hh ?? latestPrevNotes?.s4_curr_indirect_hh),
          directDot: n(latestPrevAny?.s4_curr_direct_dot ?? latestPrevNotes?.s4_curr_direct_dot),
          directHh: n(latestPrevAny?.s4_curr_direct_hh ?? latestPrevNotes?.s4_curr_direct_hh),
          totalDot: n(latestPrevAny?.s4_curr_total_dot ?? latestPrevNotes?.s4_curr_total_dot),
          totalHh: n(latestPrevAny?.s4_curr_total_hh ?? latestPrevNotes?.s4_curr_total_hh),
          majorQty: n(latestPrevNotes?.s4_curr_major_equip),
          majorHm: n(latestPrevNotes?.s4_curr_major_hm),
          minorQty: n(latestPrevNotes?.s4_curr_minor_equip),
          minorHm: n(latestPrevNotes?.s4_curr_minor_hm),
          equipmentCount: n(latestPrevAny?.s4_curr_total_equip ?? latestPrevNotes?.s4_curr_total_equip),
          equipmentHm: n(latestPrevAny?.s4_curr_total_hm ?? latestPrevNotes?.s4_curr_total_hm)
        }
      : null

    let previous = {
      ...previousByDailyChain
    }

    const prevTotalHh = previous.indirectHh + previous.directHh

    let previousExtended = {
      ...previous,
      indirectDot: hhToDot(previous.indirectHh),
      directDot: hhToDot(previous.directHh),
      totalHh: prevTotalHh,
      totalDot: hhToDot(prevTotalHh),
      equipmentCount: previous.majorQty + previous.minorQty,
      equipmentHm: previous.majorHm + previous.minorHm
    }
    const currentIndirectHh = previous.indirectHh + daily.indirectHh
    const currentDirectHh = previous.directHh + daily.directHh
    const currentTotalHh = previousExtended.totalHh + daily.totalHh
    const current = {
      indirectHh: currentIndirectHh,
      directHh: currentDirectHh,
      totalHh: currentTotalHh,
      indirectDot: hhToDot(currentIndirectHh),
      directDot: hhToDot(currentDirectHh),
      totalDot: hhToDot(currentTotalHh),
      majorQty: previous.majorQty + daily.majorQty,
      majorHm: previous.majorHm + daily.majorHm,
      minorQty: previous.minorQty + daily.minorQty,
      minorHm: previous.minorHm + daily.minorHm,
      equipmentCount: previousExtended.equipmentCount + daily.equipmentCount,
      equipmentHm: previousExtended.equipmentHm + daily.equipmentHm
    }

    return {
      previous: previousExtended,
      daily,
      current
    }
  }, [
    v2IndirectAttendanceRows,
    v2DirectAttendanceRows,
    form.equip_major_qty,
    form.equip_major_hm,
    form.equip_minor_qty,
    form.equip_minor_hm,
    form.summary_indirect_dotation,
    form.summary_indirect_hh,
    form.summary_direct_dotation,
    form.summary_direct_hh,
    form.summary_total_dotation,
    form.summary_total_hh,
    form.equip_total_qty,
    form.equip_total_hm,
    form.report_date,
    form.report_no,
    form.report_format_code,
    form.work_front,
    records,
    frontBaselines,
    frontHistoryRows,
    editingId
  ])

  const signerOptionsByRole = useMemo(() => {
    const norm = (value: unknown) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    const hasToken = (text: string, token: string) => {
      const parts = text.replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean)
      return parts.includes(token)
    }
    const isPreparedRole = (position: string) => {
      const p = norm(position)
      return (
        p.includes("oficina tecnica") ||
        p.includes("ingeniero ot") ||
        hasToken(p, "ot")
      )
    }
    const isApprovedRole = (position: string) => {
      const p = norm(position)
      return (
        p.includes("administrador") ||
        p.includes("jefe de ot") ||
        p.includes("jefe ot") ||
        p.includes("jefe oficina tecnica") ||
        p.includes("jefe de calidad") ||
        p.includes("jefe calidad")
      )
    }
    const byNameRole = new Map<string, { name: string; role: string; signatureUrl?: string }>()
    ;(collaborators || []).forEach((c) => {
      const first = String(c.first_name || "").trim()
      const last = String(c.last_name || "").trim()
      const role = String(c.position || "").trim()
      const name = `${first} ${last}`.replace(/\s+/g, " ").trim()
      const signatureUrl = String(c.signature_url || "").trim()
      if (!name || !role) return
      const key = `${name.toLowerCase()}|||${role.toLowerCase()}`
      const current = byNameRole.get(key)
      if (!current) {
        byNameRole.set(key, { name, role, signatureUrl })
        return
      }
      // Priorizar el registro que sí tenga firma.
      if (!String(current.signatureUrl || "").trim() && signatureUrl) {
        byNameRole.set(key, { ...current, signatureUrl })
      }
    })
    const base = Array.from(byNameRole.values())
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      .map((x) => ({ name: x.name.toUpperCase(), role: x.role.toUpperCase(), signatureUrl: x.signatureUrl }))

    return {
      prepared: base.filter((x) => isPreparedRole(x.role)),
      approved: base.filter((x) => isApprovedRole(x.role))
    }
  }, [collaborators])

  useEffect(() => {
    if (viewOpen || isViewingHistoryVersion) return
    const normalizeName = (value: unknown) =>
      String(value || "")
        .toUpperCase()
        .trim()
        .replace(/\s+/g, " ")

    const findSignatureByName = (name: string) => {
      const target = normalizeName(name)
      if (!target) return ""
      const found = (collaborators || []).find((c) => {
        const first = String(c.first_name || "").trim()
        const last = String(c.last_name || "").trim()
        return normalizeName(`${first} ${last}`) === target
      })
      return String(found?.signature_url || "").trim()
    }

    setForm((prev) => {
      let changed = false
      const next: DailyForm = { ...prev }
      if (!String(prev.prepared_by_signature_url || "").trim() && String(prev.prepared_by_name || "").trim()) {
        const signature = findSignatureByName(String(prev.prepared_by_name || ""))
        if (signature) {
          next.prepared_by_signature_url = signature
          changed = true
        }
      }
      if (!String(prev.approved_by_signature_url || "").trim() && String(prev.approved_by_name || "").trim()) {
        const signature = findSignatureByName(String(prev.approved_by_name || ""))
        if (signature) {
          next.approved_by_signature_url = signature
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [collaborators, form.prepared_by_name, form.approved_by_name, viewOpen, isViewingHistoryVersion])

  const reportDateLatam = useMemo(() => {
    if (!form.report_date) return "-"
    const [y, m, d] = String(form.report_date).split("-")
    if (!y || !m || !d) return String(form.report_date)
    return `${d}-${m}-${y}`
  }, [form.report_date])

  const reportEvidenceItems = useMemo(() => {
    const parseArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return parsed
          return []
        } catch {
          return []
        }
      }
      return []
    }
    const getEvidenceFiles = (value: any) => {
      const candidates = [
        value?.evidence_files,
        value?.evidenceFiles,
        value?.evidence,
        value?.images,
        value?.photos,
        value?.attachments
      ]
      for (const candidate of candidates) {
        const files = parseArray(candidate)
        if (files.length > 0) return files
      }
      return []
    }
    const activityLabel = (row: any) =>
      String(
        row?.activity ||
        row?.description ||
        row?.execution_description ||
        row?.executionDescription ||
        row?.user_detail ||
        row?.detalle ||
        row?.name ||
        "Actividad"
      )
    const items: Array<{
      key: string
      name: string
      reportId: string
      activityName: string
      crewName: string
    }> = []
    const seen = new Set<string>()

    if (viewOpen || isViewingHistoryVersion) {
      parseArray((form as any)?.evidence_manifest).forEach((f: any, idx: number) => {
        const key = String(f?.key || "").trim()
        if (!key || !isEvidenceStorageKey(key) || seen.has(key)) return
        seen.add(key)
        items.push({
          key,
          name: String(f?.name || `imagen_${idx + 1}`),
          reportId: String(viewRecord?.id || editingId || "daily-report"),
          activityName: String(f?.activityName || f?.activity_name || "Actividad"),
          crewName: String(f?.crewName || f?.crew_name || "")
        })
      })
    }

    if (!viewOpen && !isViewingHistoryVersion) {
      fieldReportsForDate.forEach((report: any) => {
        getEvidenceFiles(report).forEach((f: any) => {
          const key = String(f?.key || "").trim()
          if (!key || !isEvidenceStorageKey(key) || seen.has(key)) return
          seen.add(key)
          items.push({
            key,
            name: String(f?.name || "imagen"),
            reportId: String(report?.id || ""),
            activityName: "Reporte de terreno",
            crewName: String(report?.crew_name || "")
          })
        })
        ;[...parseArray(report?.assignments), ...parseArray(report?.activities)].forEach((asg: any) => {
          const evidenceFiles = getEvidenceFiles(asg)
          evidenceFiles.forEach((f: any) => {
            const key = String(f?.key || "").trim()
            if (!key || !isEvidenceStorageKey(key) || seen.has(key)) return
            seen.add(key)
            items.push({
              key,
              name: String(f?.name || "imagen"),
              reportId: String(report?.id || ""),
              activityName: activityLabel(asg),
              crewName: String(asg?.crewName || asg?.crew_name || report?.crew_name || "")
            })
          })
        })
      })
    }
    Object.entries(dailyActivityEvidenceByLineKey || {}).forEach(([lineKey, files]) => {
      ;(Array.isArray(files) ? files : []).forEach((f: any, idx: number) => {
        const key = String(f?.key || "").trim()
        if (!key || seen.has(key)) return
        seen.add(key)
        items.push({
          key,
          name: String(f?.name || `imagen_${idx + 1}`),
          reportId: String(editingId || "daily-report"),
          activityName: `Linea ${lineKey}`,
          crewName: "Reporte Diario"
        })
      })
    })
    return items
  }, [fieldReportsForDate, dailyActivityEvidenceByLineKey, editingId, viewOpen, isViewingHistoryVersion, (form as any)?.evidence_manifest, viewRecord?.id])

  const nocFrontAssignment = useMemo(() => {
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const isNocFrontText = (value: any) => {
      const txt = normalize(value)
      if (!txt) return false
      if (txt.includes("USO DE RECURSOS NOC")) return true
      if (txt.includes("UDR NOC")) return true
      if (txt.includes("USO DE RECURSOS")) return true
      if (txt.includes("UDR")) return true
      return /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(txt)
    }
    const extractNocCodeLabel = (value: any) => {
      const raw = String(value || "").trim()
      if (!raw) return ""
      const normalized = raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
      const fullLabelMatch = normalized.match(/USO\s+DE\s+RECURSOS\s+NOC\s+N[º°]?\s*\d+.*$/i)
      if (fullLabelMatch) {
        const full = String(fullLabelMatch[0] || "")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^USO\s+DE\s+RECURSOS/i, "UDR")
        return full
      }
      const match = normalized.match(/NOC\s+N[º°]?\s*0*(\d+)/i)
      if (!match) return ""
      const num = String(match[1] || "").trim()
      if (!num) return ""
      return `UDR NOC Nº${num.padStart(3, "0")}`
    }
    const fallbackUdrLabel = (value: any, idx: number) => {
      const raw = String(value || "").replace(/\s+/g, " ").trim()
      if (!raw) return `UDR ${idx + 1}`
      return raw.replace(/^REPORTE\s+/i, "").replace(/^USO\s+DE\s+RECURSOS/i, "UDR").trim()
    }
    const extractNocOrdinal = (value: any) => {
      const raw = String(value || "").trim()
      if (!raw) return null
      const normalized = raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
      const match = normalized.match(/N[º°]?\s*0*(\d+)/i)
      if (!match) return null
      const num = Number(match[1] || 0)
      return Number.isFinite(num) && num > 0 ? num : null
    }

    const nocReports = (fieldReportsForDate || [])
      .filter((report: any) => {
        const explicitFront = report?.work_front || ""
        const areaText = report?.area || report?.work_area || ""
        const titleText = report?.report_title || report?.title || ""
        const crewText = report?.crew_name || report?.crewName || ""
        return isNocFrontText(explicitFront) || isNocFrontText(areaText) || isNocFrontText(titleText) || isNocFrontText(crewText)
      })
      .map((report: any, idx: number) => ({
        idx,
        id: String(report?.id || "").trim(),
        explicitFront: String(report?.work_front || "").trim(),
        label:
          String(report?.report_title || "").trim() ||
          String(report?.work_front || "").trim() ||
          String(report?.area || report?.work_area || "").trim() ||
          String(report?.crew_name || "").trim() ||
          `NOC ${idx + 1}`,
        reportNo: Number(report?.report_no || 0) || 0,
        createdAt: String(report?.created_at || "")
      }))
      .sort((a, b) => {
        if (a.reportNo !== b.reportNo) return a.reportNo - b.reportNo
        return a.createdAt.localeCompare(b.createdAt)
      })

    const byReportId = new Map<string, "CANALETAS" | "PISCINAS">()
    const namesByFront: Record<"CANALETAS" | "PISCINAS", string[]> = { CANALETAS: [], PISCINAS: [] }
    const codesByFront: Record<"CANALETAS" | "PISCINAS", string[]> = { CANALETAS: [], PISCINAS: [] }

    nocReports.forEach((report, idx) => {
      // Regla negocio: UDR impares (1, 3, 5...) => CANALETAS,
      // UDR pares (2, 4, 6...) => PISCINAS. Usar el ordinal real del NOC
      // cuando existe; el indice queda solo como fallback para reportes antiguos.
      const explicitOrdinal =
        extractNocOrdinal(report.explicitFront) ??
        extractNocOrdinal(report.label)
      const fallbackOrdinal = explicitOrdinal ?? (idx + 1)
      const assignedFront: "CANALETAS" | "PISCINAS" = fallbackOrdinal % 2 === 0 ? "PISCINAS" : "CANALETAS"
      if (report.id) byReportId.set(report.id, assignedFront)
      namesByFront[assignedFront].push(report.label)
      const explicitCode =
        extractNocCodeLabel(report.explicitFront) ||
        extractNocCodeLabel(report.label)
      codesByFront[assignedFront].push(explicitCode || fallbackUdrLabel(report.label, fallbackOrdinal))
    })

    return { byReportId, namesByFront, codesByFront }
  }, [fieldReportsForDate])

  const prevencionistaTurnoCount = useMemo(() => {
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
    })
    return (dailyStatusRows || []).reduce((acc, daily: any) => {
      const c = (daily?.collaborator || {}) as any
      const collabId = String(c?.id || daily?.collaborator_id || "").trim()
      const base = collabId ? (collaboratorById.get(collabId) || null) : null
      const roleText = normalize(`${String(c?.position || base?.position || "")} ${String(c?.specialty || base?.specialty || "")}`)
      if (!roleText.includes("PREVENCIONISTA")) return acc
      const normalizedStatus = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String(daily?.status || "").trim().toUpperCase()
      const isTurno = normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11"
      return acc + (isTurno ? 1 : 0)
    }, 0)
  }, [dailyStatusRows, collaborators])

  const prevencionistaFrontDistribution = useMemo(() => {
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const isPrevencionistaTurno = (daily: any, collaboratorById: Map<string, CollaboratorLite>) => {
      const c = (daily?.collaborator || {}) as any
      const collabId = String(c?.id || daily?.collaborator_id || "").trim()
      const base = collabId ? (collaboratorById.get(collabId) || null) : null
      const roleText = normalize(`${String(c?.position || base?.position || "")} ${String(c?.specialty || base?.specialty || "")}`)
      if (!roleText.includes("PREVENCIONISTA")) return false
      const normalizedStatus = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String(daily?.status || "").trim().toUpperCase()
      return normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11"
    }
    const resolveBaseFront = (frontLike: any): "CANALETAS" | "PISCINAS" | null => {
      const txt = normalize(frontLike)
      if (!txt) return null
      if (txt === "CANALETAS" || txt.includes("CONTRATO BASE CANALETAS") || txt.includes("CANALET")) return "CANALETAS"
      if (txt === "PISCINAS" || txt.includes("CONTRATO BASE PISCINAS") || txt.includes("PISCIN")) return "PISCINAS"
      return null
    }
    const toHoursArrayLocal = (value: any, size: number) => {
      const arr = Array.isArray(value) ? value : []
      return Array.from({ length: size }).map((_, idx) => Number(arr[idx] || 0) || 0)
    }
    const normalizeJsonArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      }
      return []
    }
    const normalizeJsonObject = (value: any): Record<string, any> => {
      if (!value) return {}
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {}
    }
    const normalizeIdArray = (value: any): string[] => {
      const list = normalizeJsonArray(value)
      return list.map((x: any) => String(x || "").trim()).filter(Boolean)
    }

    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (id) collaboratorById.set(id, c)
    })
    const collabIdByName = new Map<string, string>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      const fullName = `${String(c?.first_name || "").trim()} ${String(c?.last_name || "").trim()}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
      if (fullName) collabIdByName.set(fullName, id)
    })

    const prevencionistaTurnoIds = new Set<string>()
    ;(dailyStatusRows || []).forEach((daily: any) => {
      const c = (daily?.collaborator || {}) as any
      const collabId = String(c?.id || daily?.collaborator_id || "").trim()
      if (!collabId) return
      if (isPrevencionistaTurno(daily, collaboratorById)) prevencionistaTurnoIds.add(collabId)
    })

    const perPrevHours = new Map<string, {
      canaletas: number
      piscinas: number
      nocCanaletas: number
      nocPiscinas: number
    }>()
    ;(fieldReportsForDate || []).forEach((report: any) => {
      const reportId = String(report?.id || "").trim()
      const explicitFrontRaw = String(report?.work_front || report?.front || report?.frente || "").trim()
      const explicitFrontNorm = normalize(explicitFrontRaw)
      const reportBaseFront = resolveBaseFront(explicitFrontRaw)
      const reportNocFront = (
        nocFrontAssignment.byReportId.has(reportId) ||
        explicitFrontNorm.includes("USO DE RECURSOS NOC") ||
        explicitFrontNorm.includes("UDR NOC") ||
        /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(explicitFrontNorm)
      )
        ? (nocFrontAssignment.byReportId.get(reportId) || "CANALETAS")
        : null

      const assignments = normalizeJsonArray(report?.assignments)
      const activities = normalizeJsonArray(report?.activities)
      const activityRows = mergeFieldReportActivityRowsForFrontCalc(assignments, activities)
      const personHoursObj = normalizeJsonObject(report?.person_hours || {})

      const participants = new Set<string>()
      Object.keys(personHoursObj || {}).forEach((key) => {
        if (!key || key === "__extras") return
        participants.add(String(key).trim())
      })
      normalizeIdArray(report?.personnel_ids).forEach((x: any) => {
        const id = String(x || "").trim()
        if (id) participants.add(id)
      })
      normalizeJsonArray(report?.personnel).forEach((p: any) => {
        const pid = String(p?.id || p?.collaborator_id || "").trim()
        if (pid) {
          participants.add(pid)
          return
        }
        const fullName = `${String(p?.first_name || p?.name || "").trim()} ${String(p?.last_name || "").trim()}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .trim()
        const mapped = fullName ? collabIdByName.get(fullName) : ""
        if (mapped) participants.add(mapped)
      })

      const rowFronts = activityRows.map((a: any) => {
        if (reportNocFront) return reportNocFront === "PISCINAS" ? "NOC_PISCINAS" : "NOC_CANALETAS"
        if (reportBaseFront) return reportBaseFront
        const rowFrontRaw = String(
          a?.activity_front || a?.work_front || a?.front || a?.frente || a?.area || a?.work_area || a?.sector || ""
        ).trim()
        return resolveBaseFront(rowFrontRaw)
      })

      Array.from(participants).forEach((pidRaw) => {
        const pid = String(pidRaw || "").trim()
        if (!pid || !prevencionistaTurnoIds.has(pid)) return
        const personHours = toHoursArrayLocal(personHoursObj?.[pid], activityRows.length)
        if (!personHours.some((v) => v > 0)) return
        const acc = perPrevHours.get(pid) || {
          canaletas: 0,
          piscinas: 0,
          nocCanaletas: 0,
          nocPiscinas: 0
        }
        personHours.forEach((hh, idx) => {
          if (!(hh > 0)) return
          const f = rowFronts[idx]
          if (f === "CANALETAS") acc.canaletas += hh
          if (f === "PISCINAS") acc.piscinas += hh
          if (f === "NOC_CANALETAS") acc.nocCanaletas += hh
          if (f === "NOC_PISCINAS") acc.nocPiscinas += hh
        })
        perPrevHours.set(pid, acc)
      })
    })

    const allocated = {
      canaletas: 0,
      piscinas: 0,
      nocCanaletas: 0,
      nocPiscinas: 0
    }
    const reportCounts = {
      canaletas: 0,
      piscinas: 0,
      nocCanaletas: 0,
      nocPiscinas: 0
    }

    prevencionistaTurnoIds.forEach((pid) => {
      const h = perPrevHours.get(pid) || {
        canaletas: 0,
        piscinas: 0,
        nocCanaletas: 0,
        nocPiscinas: 0
      }
      const canTotal = Number(h.canaletas || 0) + Number(h.nocCanaletas || 0)
      const pisTotal = Number(h.piscinas || 0) + Number(h.nocPiscinas || 0)
      if (canTotal > 0 || pisTotal > 0) {
        // Frente principal por mayor HH del día.
        if (pisTotal > canTotal) {
          const basePis = Number(h.piscinas || 0)
          const nocPis = Number(h.nocPiscinas || 0)
          if (nocPis > basePis) {
            allocated.nocPiscinas += 1
            reportCounts.nocPiscinas += 1
          } else {
            allocated.piscinas += 1
            reportCounts.piscinas += 1
          }
        } else {
          const baseCan = Number(h.canaletas || 0)
          const nocCan = Number(h.nocCanaletas || 0)
          if (nocCan > baseCan) {
            allocated.nocCanaletas += 1
            reportCounts.nocCanaletas += 1
          } else {
            allocated.canaletas += 1
            reportCounts.canaletas += 1
          }
        }
        return
      }
      // Sin horas declaradas en terreno: fallback estable para no perder visibilidad.
      if (allocated.canaletas <= allocated.piscinas) {
        allocated.canaletas += 1
        reportCounts.canaletas += 1
      } else {
        allocated.piscinas += 1
        reportCounts.piscinas += 1
      }
    })

    return {
      totalTurno: prevencionistaTurnoCount,
      reportCounts,
      allocated: {
        canaletas: Number(allocated.canaletas || 0),
        piscinas: Number(allocated.piscinas || 0),
        nocCanaletas: Number(allocated.nocCanaletas || 0),
        nocPiscinas: Number(allocated.nocPiscinas || 0)
      }
    }
  }, [fieldReportsForDate, nocFrontAssignment, prevencionistaTurnoCount, collaborators, dailyStatusRows])

  const frontRoleDotation = useMemo(() => {
    const roles = ["TOPOGRAFO", "ALARIFE", "NIVELADOR", "RIGGER", "PREVENCIONISTA", "MECANICO MANTENCION", "ELECTRICO MANTENCION"] as const
    const present = {
      canaletas: new Set<string>(),
      piscinas: new Set<string>(),
      noc: new Set<string>()
    }
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()

    const inferFronts = (report: any) => {
      const fronts = new Set<"canaletas" | "piscinas" | "noc">()
      const explicitFront = normalize(report?.work_front || report?.front || report?.frente || "")
      if (
        nocFrontAssignment.byReportId.has(String(report?.id || "").trim()) ||
        explicitFront.includes("USO DE RECURSOS NOC") ||
        explicitFront.includes("UDR NOC") ||
        /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(explicitFront)
      ) {
        // Reporte NOC: debe reflejarse en la columna dinámica NOC
        // y también quedar anclado al frente base asignado.
        fronts.add("noc")
        const assigned = nocFrontAssignment.byReportId.get(String(report?.id || "").trim())
        fronts.add(assigned === "PISCINAS" ? "piscinas" : "canaletas")
      }
      if (explicitFront === "CANALETAS" || explicitFront.includes("CONTRATO BASE CANALETAS")) fronts.add("canaletas")
      if (explicitFront === "PISCINAS" || explicitFront.includes("CONTRATO BASE PISCINAS")) fronts.add("piscinas")
      const area = normalize(report?.area || "")
      if (area.includes("CANALET")) fronts.add("canaletas")
      if (area.includes("PISCIN")) fronts.add("piscinas")
      const crew = normalize(report?.crew_name || "")
      if (crew.includes("CANALET")) fronts.add("canaletas")
      if (crew.includes("PISCIN")) fronts.add("piscinas")
      const assignments = toArray(report?.assignments)
      assignments.forEach((a: any) => {
        const aArea = normalize(a?.area || "")
        if (aArea.includes("CANALET")) fronts.add("canaletas")
        if (aArea.includes("PISCIN")) fronts.add("piscinas")
      })
      if (fronts.size === 0) {
        // fallback conservador: usar frente seleccionado en el reporte diario
        fronts.add(form.work_front === "PISCINAS" ? "piscinas" : "canaletas")
      }
      return Array.from(fronts)
    }
    const inferExplicitFrontsOnly = (report: any) => {
      const fronts = new Set<"canaletas" | "piscinas" | "noc">()
      const explicitFront = normalize(report?.work_front || report?.front || report?.frente || "")
      if (
        nocFrontAssignment.byReportId.has(String(report?.id || "").trim()) ||
        explicitFront.includes("USO DE RECURSOS NOC") ||
        explicitFront.includes("UDR NOC") ||
        /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(explicitFront)
      ) {
        const assigned = nocFrontAssignment.byReportId.get(String(report?.id || "").trim())
        fronts.add(assigned === "PISCINAS" ? "piscinas" : "canaletas")
      }
      if (explicitFront === "CANALETAS" || explicitFront.includes("CONTRATO BASE CANALETAS")) fronts.add("canaletas")
      if (explicitFront === "PISCINAS" || explicitFront.includes("CONTRATO BASE PISCINAS")) fronts.add("piscinas")
      return Array.from(fronts)
    }

    const toArray = (val: any) => {
      if (Array.isArray(val)) return val
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      }
      return []
    }
    const toObject = (val: any): Record<string, any> => {
      if (val && typeof val === "object" && !Array.isArray(val)) return val
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      return {}
    }
    const resolveSpecialRole = (roleText: string): (typeof roles)[number] | null => {
      if (roleText.includes("TOPOGRAFO")) return "TOPOGRAFO"
      if (roleText.includes("ALARIFE")) return "ALARIFE"
      if (roleText.includes("NIVELADOR")) return "NIVELADOR"
      if (roleText.includes("RIGGER")) return "RIGGER"
      if (roleText.includes("PREVENCIONISTA")) return "PREVENCIONISTA"
      if (roleText.includes("MECANICO MANTENCION")) return "MECANICO MANTENCION"
      if (roleText.includes("ELECTRICO MANTENCION")) return "ELECTRICO MANTENCION"
      return null
    }

    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
    })

    const maintDebugReports: Array<any> = []
    ;(fieldReportsForDate || []).forEach((report: any) => {
      const fronts = inferFronts(report)
      const strictFronts = inferExplicitFrontsOnly(report)
      const reportDebug: any = {
        reportId: String(report?.id || ""),
        reportWorkFront: String(report?.work_front || report?.front || report?.frente || ""),
        inferredFronts: fronts,
        strictFronts,
        maintPersonnelHits: [] as any[],
        maintPersonnelIdHits: [] as any[]
      }
      const personnel = toArray(report?.personnel)
      personnel.forEach((p: any) => {
        const roleText = normalize(p?.role || p?.position || "")
        const role = resolveSpecialRole(roleText)
        if (!role) return
        const isStrictRole = role === "MECANICO MANTENCION" || role === "ELECTRICO MANTENCION"
        const frontsToUse = isStrictRole ? strictFronts : fronts
        if (isStrictRole) {
          reportDebug.maintPersonnelHits.push({
            role,
            roleText,
            collaboratorId: String(p?.id || p?.collaborator_id || ""),
            frontsToUse
          })
        }
        frontsToUse.forEach((f) => present[f].add(role))
      })
      const personHours = toObject(report?.person_hours)
      const personnelIdsWithHours = Object.entries(personHours)
        .filter(([pid, hours]) => {
          if (!pid || pid === "__extras") return false
          if (Array.isArray(hours)) return hours.some((value) => Number(value || 0) > 0)
          return Number(hours || 0) > 0
        })
        .map(([pid]) => String(pid || "").trim())
        .filter(Boolean)
      personnelIdsWithHours.forEach((pid: string) => {
        const c = collaboratorById.get(pid)
        if (!c) return
        const roleText = normalize(`${String(c?.position || "")} ${String(c?.specialty || "")}`)
        const role = resolveSpecialRole(roleText)
        if (!role) return
        const isStrictRole = role === "MECANICO MANTENCION" || role === "ELECTRICO MANTENCION"
        const frontsToUse = isStrictRole ? strictFronts : fronts
        if (isStrictRole) {
          reportDebug.maintPersonnelIdHits.push({
            role,
            collaboratorId: pid,
            collaboratorPosition: String(c?.position || ""),
            collaboratorSpecialty: String(c?.specialty || ""),
            frontsToUse
          })
        }
        frontsToUse.forEach((f) => present[f].add(role))
      })
      if (reportDebug.maintPersonnelHits.length || reportDebug.maintPersonnelIdHits.length) {
        maintDebugReports.push(reportDebug)
      }
    })

    const out = {
      canaletas: { TOPOGRAFO: 0, ALARIFE: 0, NIVELADOR: 0, RIGGER: 0, PREVENCIONISTA: 0, "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 },
      piscinas: { TOPOGRAFO: 0, ALARIFE: 0, NIVELADOR: 0, RIGGER: 0, PREVENCIONISTA: 0, "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 },
      noc: { TOPOGRAFO: 0, ALARIFE: 0, NIVELADOR: 0, RIGGER: 0, PREVENCIONISTA: 0, "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 }
    }
    roles.forEach((role) => {
      const inCan = present.canaletas.has(role)
      const inPis = present.piscinas.has(role)
      if (role === "PREVENCIONISTA") {
        // PREVENCIONISTA se calcula por fila (turno del día) en getDotacionFrenteValues.
        out.canaletas[role] = 0
        out.piscinas[role] = 0
        out.noc[role] = present.noc.has(role) ? 1 : 0
        return
      }
      if (present.noc.has(role)) out.noc[role] = 1
      if (inCan && inPis) {
        out.canaletas[role] = 0.5
        out.piscinas[role] = 0.5
      } else if (inCan) out.canaletas[role] = 1
      else if (inPis) out.piscinas[role] = 1
    })
    if (false) console.debug("[daily-report][frontRoleDotation]", {
      reportDate: form.report_date,
      reportFormat: form.report_format_code,
      workFront: form.work_front,
      prevTurnoCount: prevencionistaTurnoCount,
      prevencionistaDistribution: prevencionistaFrontDistribution,
      inferredByFieldReports: out,
      maintDebugReports
    })
    return out
  }, [fieldReportsForDate, collaborators, form.work_front, form.report_date, form.report_format_code, nocFrontAssignment, prevencionistaTurnoCount, prevencionistaFrontDistribution])

  const mantencionFrontCounts = useMemo(() => {
    const roles = ["MECANICO MANTENCION", "ELECTRICO MANTENCION"] as const
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const toArray = (val: any) => {
      if (Array.isArray(val)) return val
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      }
      return []
    }
    const toObject = (val: any): Record<string, any> => {
      if (!val) return {}
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val)
          return parsed && typeof parsed === "object" ? parsed : {}
        } catch {
          return {}
        }
      }
      return typeof val === "object" ? (val as Record<string, any>) : {}
    }
    const toHoursArray = (value: any, size: number) => {
      const arr = Array.isArray(value) ? value : []
      return Array.from({ length: size }).map((_, idx) => Number(arr[idx] || 0) || 0)
    }
    const inferStrictFront = (
      frontLike: any,
      reportId?: string
    ): "canaletas" | "piscinas" | "ifa" | null => {
      const explicit = normalize(frontLike)
      if (explicit === "CANALETAS" || explicit.includes("CANALET")) return "canaletas"
      if (explicit === "PISCINAS" || explicit.includes("PISCIN")) return "piscinas"
      if (
        nocFrontAssignment.byReportId.has(String(reportId || "").trim()) ||
        explicit.includes("USO DE RECURSOS NOC") ||
        explicit.includes("UDR NOC") ||
        /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(explicit)
      ) {
        const assigned = nocFrontAssignment.byReportId.get(String(reportId || "").trim())
        return assigned === "PISCINAS" ? "piscinas" : "canaletas"
      }
      if (
        explicit === "IFA" ||
        explicit.includes("AREA IFA") ||
        explicit.includes("INSTALACION FAENA") ||
        explicit.includes("INSTALACION DE FAENA")
      ) return "ifa"
      return null
    }
    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (id) collaboratorById.set(id, c)
    })
    const collabIdByName = new Map<string, string>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      const fullName = `${String(c?.first_name || "").trim()} ${String(c?.last_name || "").trim()}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
      if (fullName) collabIdByName.set(fullName, id)
    })
    const out = {
      canaletas: { "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 },
      piscinas: { "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 },
      nocCanaletas: { "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 },
      nocPiscinas: { "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 },
      ifa: { "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 },
      excluded: { "MECANICO MANTENCION": 0, "ELECTRICO MANTENCION": 0 }
    }

    ;(fieldReportsForDate || []).forEach((report: any) => {
      const reportPersonWorkdayHours = resolvePersonWorkdayHours(getFieldReportWorkdaySource(report))
      const reportId = String(report?.id || "").trim()
      const rawReportFront = String(report?.work_front || report?.front || report?.frente || "").trim()
      const normalizedReportFront = normalize(rawReportFront)
      const isNocReport = (
        nocFrontAssignment.byReportId.has(reportId) ||
        normalizedReportFront.includes("USO DE RECURSOS NOC") ||
        normalizedReportFront.includes("UDR NOC") ||
        /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(normalizedReportFront)
      )
      const hasExplicitReportFront = rawReportFront.length > 0
      const reportFront = inferStrictFront(rawReportFront, reportId)
      const reportFrontIsExcluded = hasExplicitReportFront && !reportFront
      const assignments = toArray(report?.assignments)
      const activityRows = mergeFieldReportActivityRowsForFrontCalc(assignments, toArray(report?.activities))
      const rowFronts = activityRows.map((a: any) => {
        const rawFront = String(a?.activity_front || a?.work_front || a?.front || a?.frente || a?.area || a?.work_area || a?.sector || "").trim()
        const hasExplicitFront = rawFront.length > 0
        const explicitFront = inferStrictFront(rawFront, reportId)
        // Para reportes NOC, todo el reporte queda anclado al frente asignado
        // (CANALETAS/PISCINAS) y nunca se reparte por frentes de actividad.
        if (isNocReport) return reportFront === "piscinas" ? "noc_piscinas" : "noc_canaletas"
        // Si la actividad declara un frente NOC/UDR, no debe caer al frente base del reporte.
        // El fallback al reporte solo aplica para actividades antiguas sin frente explícito.
        if (hasExplicitFront) return explicitFront || "excluded"
        return reportFront
      })
      const personHoursObj = toObject(report?.person_hours)
      const personHoursByParticipantId: Record<string, any> = {}
      Object.entries(personHoursObj || {}).forEach(([rawKey, hours]) => {
        if (!rawKey || rawKey === "__extras") return
        const directId = String(rawKey || "").trim()
        if (directId && collaboratorById.has(directId)) {
          personHoursByParticipantId[directId] = hours
          return
        }
        const mappedByName = collabIdByName.get(
          String(rawKey || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim()
        )
        if (mappedByName) personHoursByParticipantId[mappedByName] = hours
      })

      const roleByPid = new Map<string, string>()
      toArray(report?.personnel).forEach((p: any) => {
        let pid = String(p?.id || p?.collaborator_id || "").trim()
        if (!pid) {
          const fullName = `${String(p?.first_name || p?.name || "").trim()} ${String(p?.last_name || "").trim()}`
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim()
          pid = fullName ? String(collabIdByName.get(fullName) || "").trim() : ""
        }
        if (!pid) return
        roleByPid.set(
          pid,
          normalize(`${String(p?.role || "")} ${String(p?.position || "")} ${String(p?.specialty || "")}`)
        )
      })

      const participantIds = new Set<string>()
      Object.keys(personHoursObj || {}).forEach((pid) => {
        if (!pid || pid === "__extras") return
        const raw = String(pid).trim()
        if (!raw) return
        if (collaboratorById.has(raw)) {
          participantIds.add(raw)
          return
        }
        const mappedByName = collabIdByName.get(
          raw
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim()
        )
        if (mappedByName) participantIds.add(mappedByName)
      })
      toArray(report?.personnel_ids).forEach((x: any) => {
        const raw = String(x || "").trim()
        if (!raw) return
        if (collaboratorById.has(raw)) {
          participantIds.add(raw)
          return
        }
        const mappedByName = collabIdByName.get(
          raw
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim()
        )
        if (mappedByName) participantIds.add(mappedByName)
      })
      roleByPid.forEach((_role, pid) => participantIds.add(pid))

      const roleHitsInReport = new Set<(typeof roles)[number]>()
      toArray(report?.personnel).forEach((p: any) => {
        const roleText = normalize(p?.role || p?.position || "")
        roles.forEach((role) => {
          if (roleText.includes(role)) roleHitsInReport.add(role)
        })
      })
      toArray(report?.personnel_ids).forEach((x: any) => {
        const pid = String(x || "").trim()
        if (!pid) return
        const c = collaboratorById.get(pid)
        if (!c) return
        const roleText = normalize(`${String(c?.position || "")} ${String(c?.specialty || "")}`)
        roles.forEach((role) => {
          if (roleText.includes(role)) roleHitsInReport.add(role)
        })
      })
      const roleFrontHits = {
        "MECANICO MANTENCION": new Set<"canaletas" | "piscinas" | "noc_canaletas" | "noc_piscinas" | "ifa" | "excluded">(),
        "ELECTRICO MANTENCION": new Set<"canaletas" | "piscinas" | "noc_canaletas" | "noc_piscinas" | "ifa" | "excluded">()
      } as const

      participantIds.forEach((pid) => {
        const c = collaboratorById.get(pid)
        const roleText = normalize(
          roleByPid.get(pid) || `${String(c?.position || "")} ${String(c?.specialty || "")}`
        )
        if (!roleText) return

        const personHours = toHoursArray(personHoursByParticipantId?.[pid], activityRows.length)
        const hasAnyHours = personHours.some((h) => h > 0)
        let canHours = 0
        let pisHours = 0
        let nocCanHours = 0
        let nocPisHours = 0
        let ifaHours = 0
        let excludedHours = 0
        if (hasAnyHours) {
          personHours.forEach((hh, idx) => {
            if (!(hh > 0)) return
            const f = rowFronts[idx]
            if (f === "canaletas") canHours += hh
            if (f === "piscinas") pisHours += hh
            if (f === "noc_canaletas") nocCanHours += hh
            if (f === "noc_piscinas") nocPisHours += hh
            if (f === "ifa") ifaHours += hh
            if (f === "excluded") excludedHours += hh
          })
          const totalRoleHours = canHours + pisHours + nocCanHours + nocPisHours + ifaHours + excludedHours
          if (totalRoleHours > reportPersonWorkdayHours) {
            const factor = reportPersonWorkdayHours / totalRoleHours
            canHours *= factor
            pisHours *= factor
            nocCanHours *= factor
            nocPisHours *= factor
            ifaHours *= factor
            excludedHours *= factor
          }
        }

        roles.forEach((role) => {
          if (!roleText.includes(role)) return
          if (hasAnyHours) {
            if (canHours > 0) {
              out.canaletas[role] += canHours
              roleFrontHits[role].add("canaletas")
            }
            if (pisHours > 0) {
              out.piscinas[role] += pisHours
              roleFrontHits[role].add("piscinas")
            }
            if (nocCanHours > 0) {
              out.nocCanaletas[role] += nocCanHours
              roleFrontHits[role].add("noc_canaletas")
            }
            if (nocPisHours > 0) {
              out.nocPiscinas[role] += nocPisHours
              roleFrontHits[role].add("noc_piscinas")
            }
            if (ifaHours > 0) {
              out.ifa[role] += ifaHours
              roleFrontHits[role].add("ifa")
            }
            if (excludedHours > 0) {
              out.excluded[role] += excludedHours
              roleFrontHits[role].add("excluded")
            }
            return
          }
          if (reportFrontIsExcluded) {
            out.excluded[role] += 1
            roleFrontHits[role].add("excluded")
            return
          }
          // Compatibilidad: si el reporte no trae person_hours, usar frente de cabecera.
          if (reportFront === "canaletas") {
            out.canaletas[role] += 1
            roleFrontHits[role].add("canaletas")
          }
          if (reportFront === "piscinas") {
            out.piscinas[role] += 1
            roleFrontHits[role].add("piscinas")
          }
        })
      })

      // Fallback robusto:
      // Si en el reporte hay rol de mantención, pero no hubo match por persona/horas,
      // inferimos frente por actividad/reporte para evitar split 0,5/0,5 incorrecto.
      const reportFrontSet = new Set<"canaletas" | "piscinas" | "ifa" | "excluded">()
      rowFronts.forEach((f) => {
        if (f === "canaletas" || f === "piscinas" || f === "ifa" || f === "excluded") reportFrontSet.add(f)
      })
      if (reportFront === "canaletas") reportFrontSet.add("canaletas")
      if (reportFront === "piscinas") reportFrontSet.add("piscinas")
      if (reportFrontIsExcluded) reportFrontSet.add("excluded")

      roles.forEach((role) => {
        if (!roleHitsInReport.has(role)) return
        if (roleFrontHits[role].size > 0) return
        // En reportes NOC sin person_hours por participante, declarar mantención
        // solo en el frente NOC asignado al reporte.
        if (isNocReport) {
          if (reportFront === "canaletas") {
            out.nocCanaletas[role] += reportPersonWorkdayHours
            roleFrontHits[role].add("noc_canaletas")
          }
          if (reportFront === "piscinas") {
            out.nocPiscinas[role] += reportPersonWorkdayHours
            roleFrontHits[role].add("noc_piscinas")
          }
          return
        }
        if (reportFrontSet.has("canaletas")) out.canaletas[role] += 1
        if (reportFrontSet.has("piscinas")) out.piscinas[role] += 1
        if (reportFrontSet.has("ifa")) out.ifa[role] += 1
        if (reportFrontSet.has("excluded")) out.excluded[role] += 1
      })
    })

    if (false) console.debug("[daily-report][mant-front-counts]", {
      reportDate: form.report_date,
      workFront: form.work_front,
      counts: out
    })
    return out
  }, [fieldReportsForDate, collaborators, form.report_date, form.work_front, nocFrontAssignment])

  const operatorFrontDotationByPosition = useMemo(() => {
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const toArray = (val: any) => {
      if (Array.isArray(val)) return val
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      }
      return []
    }
    const toObject = (val: any): Record<string, any> => {
      if (!val) return {}
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      return typeof val === "object" && !Array.isArray(val) ? (val as Record<string, any>) : {}
    }
    const toHoursArray = (value: any, size: number) => {
      const arr = Array.isArray(value) ? value : []
      return Array.from({ length: size }).map((_, idx) => Number(arr[idx] || 0) || 0)
    }
    const inferFront = (frontLike: any, reportId?: string): "canaletas" | "piscinas" | "ifa" | null => {
      const explicit = normalize(frontLike)
      if (explicit === "CANALETAS" || explicit.includes("CANALET")) return "canaletas"
      if (explicit === "PISCINAS" || explicit.includes("PISCIN")) return "piscinas"
      if (
        nocFrontAssignment.byReportId.has(String(reportId || "").trim()) ||
        explicit.includes("USO DE RECURSOS NOC") ||
        explicit.includes("UDR NOC") ||
        /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(explicit)
      ) {
        const assigned = nocFrontAssignment.byReportId.get(String(reportId || "").trim())
        return assigned === "PISCINAS" ? "piscinas" : "canaletas"
      }
      if (
        explicit === "IFA" ||
        explicit.includes("AREA IFA") ||
        explicit.includes("INSTALACION FAENA") ||
        explicit.includes("INSTALACION DE FAENA")
      ) return "ifa"
      return null
    }

    const collaboratorById = new Map<string, CollaboratorLite>()
    const collabIdByName = new Map<string, string>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
      const fullName = `${String(c?.first_name || "").trim()} ${String(c?.last_name || "").trim()}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
      if (fullName) collabIdByName.set(fullName, id)
    })
    const resolveParticipantId = (raw: any) => {
      const value = String(raw || "").trim()
      if (!value) return ""
      if (collaboratorById.has(value)) return value
      return collabIdByName.get(
        value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .trim()
      ) || ""
    }
    const isIndirectOperator = (pid: string, reportRoleText?: string) => {
      const c = collaboratorById.get(pid)
      const workerType = normalizeWorkerType(String(c?.worker_type || ""))
      const roleText = normalize(`${String(reportRoleText || "")} ${String(c?.position || "")} ${String(c?.specialty || "")}`)
      return workerType === "indirecto" && roleText.includes("OPERADOR")
    }
    const operatorDebugRows: Array<any> = []
    type OperatorFrontHours = {
      position: string
      canaletas: number
      piscinas: number
      nocCanaletas: number
      nocPiscinas: number
      ifa: number
    }
    const addHours = (
      out: Map<string, OperatorFrontHours>,
      pid: string,
      position: string,
      front: "canaletas" | "piscinas" | "noc_canaletas" | "noc_piscinas" | "ifa" | null,
      hours: number
    ) => {
      if (!pid || !front || !(hours > 0)) return
      const current = out.get(pid) || {
        position: normalize(position || "SIN CARGO") || "SIN CARGO",
        canaletas: 0,
        piscinas: 0,
        nocCanaletas: 0,
        nocPiscinas: 0,
        ifa: 0
      }
      if (front === "canaletas") current.canaletas += hours
      if (front === "piscinas") current.piscinas += hours
      if (front === "noc_canaletas") current.nocCanaletas += hours
      if (front === "noc_piscinas") current.nocPiscinas += hours
      if (front === "ifa") current.ifa += hours
      out.set(pid, current)
    }

    const operatorHoursByPerson = new Map<string, OperatorFrontHours>()
    ;(fieldReportsForDate || []).forEach((report: any) => {
      const reportPersonWorkdayHours = resolvePersonWorkdayHours(getFieldReportWorkdaySource(report))
      const reportId = String(report?.id || "").trim()
      const rawReportFront = String(report?.work_front || report?.front || report?.frente || "").trim()
      const normalizedReportFront = normalize(rawReportFront)
      const isNocReport =
        nocFrontAssignment.byReportId.has(reportId) ||
        normalizedReportFront.includes("USO DE RECURSOS NOC") ||
        normalizedReportFront.includes("UDR NOC") ||
        /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(normalizedReportFront)
      const reportFront = inferFront(rawReportFront, reportId)
      const assignments = toArray(report?.assignments)
      const activityRows = mergeFieldReportActivityRowsForFrontCalc(assignments, toArray(report?.activities))
      const rowFronts = activityRows.map((a: any) => {
        if (isNocReport) return reportFront === "piscinas" ? "noc_piscinas" : "noc_canaletas"
        const rawFront = String(a?.activity_front || a?.work_front || a?.front || a?.frente || a?.area || a?.work_area || a?.sector || "").trim()
        if (!rawFront) return reportFront
        const explicitFront = inferFront(rawFront, reportId)
        return explicitFront
      })
      const personHoursObj = toObject(report?.person_hours)
      const personHoursByParticipantId: Record<string, any> = {}
      Object.entries(personHoursObj || {}).forEach(([rawKey, hours]) => {
        if (!rawKey || rawKey === "__extras") return
        const pid = resolveParticipantId(rawKey)
        if (pid) personHoursByParticipantId[pid] = hours
      })

      const reportRoleByPid = new Map<string, string>()
      toArray(report?.personnel).forEach((p: any) => {
        let pid = resolveParticipantId(p?.id || p?.collaborator_id)
        if (!pid) {
          const fullName = `${String(p?.first_name || p?.name || "").trim()} ${String(p?.last_name || "").trim()}`
          pid = resolveParticipantId(fullName)
        }
        if (!pid) return
        reportRoleByPid.set(pid, normalize(`${String(p?.role || "")} ${String(p?.position || "")} ${String(p?.specialty || "")}`))
      })

      const participantIds = new Set<string>()
      Object.keys(personHoursObj || {}).forEach((rawKey) => {
        if (!rawKey || rawKey === "__extras") return
        const pid = resolveParticipantId(rawKey)
        if (pid) participantIds.add(pid)
      })
      toArray(report?.personnel_ids).forEach((rawId: any) => {
        const pid = resolveParticipantId(rawId)
        if (pid) participantIds.add(pid)
      })
      reportRoleByPid.forEach((_role, pid) => participantIds.add(pid))

      participantIds.forEach((pid) => {
        const c = collaboratorById.get(pid)
        const reportRoleText = reportRoleByPid.get(pid) || ""
        const workerType = normalizeWorkerType(String(c?.worker_type || ""))
        const combinedRoleText = normalize(`${String(reportRoleText || "")} ${String(c?.position || "")} ${String(c?.specialty || "")}`)
        const detectedAsOperator = isIndirectOperator(pid, reportRoleText)
        const shouldDebugCandidate =
          detectedAsOperator ||
          combinedRoleText.includes("OPERADOR") ||
          combinedRoleText.includes("CHOFER") ||
          combinedRoleText.includes("CAMION") ||
          combinedRoleText.includes("TOLVA")
        if (!detectedAsOperator) {
          if (shouldDebugCandidate) {
            operatorDebugRows.push({
              reportId,
              reportFrontRaw: rawReportFront,
              reportFront,
              isNocReport,
              collaboratorId: pid,
              position: String(c?.position || ""),
              specialty: String(c?.specialty || ""),
              workerType,
              reportRoleText,
              combinedRoleText,
              detectedAsOperator,
              reason: "not-indirect-operator"
            })
          }
          return
        }
        const position = String(c?.position || "SIN CARGO")
        const personHours = toHoursArray(personHoursByParticipantId?.[pid], activityRows.length)
        const hasHours = personHours.some((hh) => hh > 0)
        const debugBase = {
          reportId,
          reportFrontRaw: rawReportFront,
          reportFront,
          isNocReport,
          collaboratorId: pid,
          position,
          specialty: String(c?.specialty || ""),
          workerType,
          reportRoleText,
          combinedRoleText,
          detectedAsOperator,
          activityFronts: rowFronts,
          personHours,
          hasHours
        }
        if (hasHours) {
          const added: Array<any> = []
          personHours.forEach((hh, idx) => {
            if (!(hh > 0)) return
            const front = rowFronts[idx]
            if (!front) {
              added.push({ idx, hh, front, skipped: "no-front" })
              return
            }
            addHours(operatorHoursByPerson, pid, position, front, hh)
            added.push({ idx, hh, front })
          })
          operatorDebugRows.push({ ...debugBase, added })
          return
        }
        if (isNocReport) {
          operatorDebugRows.push({ ...debugBase, added: [], skipped: "noc-report-without-person-hours" })
          return
        }
        addHours(operatorHoursByPerson, pid, position, reportFront, reportPersonWorkdayHours)
        operatorDebugRows.push({ ...debugBase, added: [{ hh: reportPersonWorkdayHours, front: reportFront, fallback: "report-front-no-hours" }] })
      })
    })
    const out: Record<string, { canaletas: number; piscinas: number; nocCanaletas: number; nocPiscinas: number; ifa: number }> = {}
    operatorHoursByPerson.forEach((hours) => {
      const totalHours =
        Number(hours.canaletas || 0) +
        Number(hours.piscinas || 0) +
        Number(hours.nocCanaletas || 0) +
        Number(hours.nocPiscinas || 0) +
        Number(hours.ifa || 0)
      if (!(totalHours > 0)) return
      const posKey = normalize(hours.position || "SIN CARGO") || "SIN CARGO"
      if (!out[posKey]) out[posKey] = { canaletas: 0, piscinas: 0, nocCanaletas: 0, nocPiscinas: 0, ifa: 0 }
      out[posKey].canaletas += Number(hours.canaletas || 0) / totalHours
      out[posKey].piscinas += Number(hours.piscinas || 0) / totalHours
      out[posKey].nocCanaletas += Number(hours.nocCanaletas || 0) / totalHours
      out[posKey].nocPiscinas += Number(hours.nocPiscinas || 0) / totalHours
      out[posKey].ifa += Number(hours.ifa || 0) / totalHours
    })
    if (process.env.NODE_ENV !== "production" && operatorDebugRows.length > 0) {
      console.debug("[daily-report][operator-front-debug]", {
        reportDate: form.report_date,
        workFront: form.work_front,
        sourceReports: (fieldReportsForDate || []).length,
        rows: operatorDebugRows,
        hoursByPerson: Array.from(operatorHoursByPerson.entries()).map(([collaboratorId, hours]) => ({ collaboratorId, ...hours })),
        dotationByPosition: out
      })
    }
    return out
  }, [fieldReportsForDate, collaborators, nocFrontAssignment])

  const supervisorFrontDotationByPosition = useMemo(() => {
    const DEBUG_SUPERVISOR_COUNT = process.env.NODE_ENV !== "production"
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const isSupervisorPosition = (value: any) => {
      const p = normalize(value)
      return p.includes("SUPERVISOR") || p.includes("JEFE") || p.includes("COORDINADOR")
    }
    const toArray = (val: any) => {
      if (Array.isArray(val)) return val
      if (val == null) return []
      if (typeof val === "string") {
        const raw = val.trim()
        if (!raw) return []
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) return parsed
          if (parsed && typeof parsed === "object") return Object.values(parsed)
        } catch {}
        return raw.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
      }
      if (typeof val === "object") return Object.values(val)
      return []
    }
    const splitNames = (value: any) =>
      String(value || "")
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter(Boolean)
    const inferBaseFront = (frontLike: any): "canaletas" | "piscinas" | null => {
      const label = normalize(frontLike)
      if (label === "CANALETAS" || label.includes("CONTRATO BASE CANALETAS")) return "canaletas"
      if (label === "PISCINAS" || label.includes("CONTRATO BASE PISCINAS")) return "piscinas"
      return null
    }
    const isIfaArea = (value: any) => {
      const label = normalize(value)
      return (
        label === "IFA" ||
        label.includes("AREA IFA") ||
        label.includes("INSTALACION FAENA") ||
        label.includes("INSTALACION DE FAENA")
      )
    }
    const collaboratorById = new Map<string, CollaboratorLite>()
    const collaboratorIdByName = new Map<string, string>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      collaboratorById.set(id, c)
      const fullName = normalize(`${String(c?.first_name || "").trim()} ${String(c?.last_name || "").trim()}`)
      if (fullName) collaboratorIdByName.set(fullName, id)
    })
    const turnoSupervisorByPosition = new Map<string, number>()
    ;(dailyStatusRows || []).forEach((daily: any) => {
      const c = (daily?.collaborator || {}) as any
      const collabId = String(c?.id || daily?.collaborator_id || "").trim()
      const base = collabId ? (collaboratorById.get(collabId) || null) : null
      const roleText = normalize(`${String(c?.position || base?.position || "")} ${String(c?.specialty || base?.specialty || "")}`)
      if (!isSupervisorPosition(roleText)) return
      const normalizedStatus = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String(daily?.status || "").trim().toUpperCase()
      const isTurno = normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11"
      if (!isTurno) return
      const pos = normalize(String(c?.position || base?.position || "SUPERVISOR")) || "SUPERVISOR"
      turnoSupervisorByPosition.set(pos, Number(turnoSupervisorByPosition.get(pos) || 0) + 1)
    })

    const supervisorPresence = new Map<string, {
      collaboratorId: string
      position: string
      fronts: Set<"canaletas" | "piscinas">
      nocFronts: Set<"canaletas" | "piscinas">
      ifa: boolean
      excluded: boolean
    }>()
    const addSupervisor = (
      rawIdOrName: any,
      reportFront: "canaletas" | "piscinas" | null,
      fromNoc: boolean,
      inIfa: boolean,
      excluded: boolean,
      fallbackPosition?: any,
      forceSupervisor?: boolean
    ) => {
      const raw = String(rawIdOrName || "").trim()
      if (!raw) return
      const normalizedName = normalize(raw)
      const collaboratorId = collaboratorById.has(raw) ? raw : String(collaboratorIdByName.get(normalizedName || "") || "")
      const collab = collaboratorId ? collaboratorById.get(collaboratorId) : null
      const position = normalize(collab?.position || fallbackPosition || collab?.specialty || "") || (forceSupervisor ? "SUPERVISOR" : "")
      const positionRoleText = normalize(
        `${String(collab?.position || "")} ${String(collab?.specialty || "")} ${String(fallbackPosition || "")}`
      )
      if (!forceSupervisor && !isSupervisorPosition(positionRoleText || position)) return
      const identity = collaboratorId || normalizedName
      if (!identity) return
      const current = supervisorPresence.get(identity) || {
        collaboratorId,
        position,
        fronts: new Set<"canaletas" | "piscinas">(),
        nocFronts: new Set<"canaletas" | "piscinas">(),
        ifa: false,
        excluded: false
      }
      current.collaboratorId = current.collaboratorId || collaboratorId
      current.position = current.position || position
      if (inIfa) current.ifa = true
      else if (reportFront) {
        if (fromNoc) current.nocFronts.add(reportFront)
        else current.fronts.add(reportFront)
      }
      else if (excluded) current.excluded = true
      supervisorPresence.set(identity, current)
    }

    ;(fieldReportsForDate || []).forEach((report: any) => {
      const reportId = String(report?.id || "").trim()
      const rawReportFront = String(report?.work_front || report?.front || report?.frente || "").trim()
      const normalizedReportFront = normalize(rawReportFront)
      const reportFrontFromNoc =
        (
          nocFrontAssignment.byReportId.has(reportId) ||
          normalizedReportFront.includes("USO DE RECURSOS NOC") ||
          normalizedReportFront.includes("UDR NOC") ||
          /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(normalizedReportFront)
        )
          ? (nocFrontAssignment.byReportId.get(reportId) === "PISCINAS" ? "piscinas" : "canaletas")
          : null
      const isNocReport = Boolean(reportFrontFromNoc)
      const reportFront = reportFrontFromNoc || inferBaseFront(rawReportFront)
      const reportHasExplicitFront = rawReportFront.length > 0
      const reportExcluded = reportHasExplicitFront && !reportFront
      const reportAreaIsIfa =
        isIfaArea(report?.area) ||
        isIfaArea(report?.work_area) ||
        isIfaArea(report?.sector)
      const activityAreaIsIfa = toArray(report?.activities).some((a: any) => isIfaArea(a?.area || a?.work_area || a?.sector))
      const reportIfa = reportAreaIsIfa || (!reportFront && activityAreaIsIfa)

      toArray(report?.supervisor_id).forEach((sid) => addSupervisor(sid, reportFront, isNocReport, reportIfa, reportExcluded, undefined, true))
      toArray(report?.supervisors).forEach((sid) => addSupervisor(sid, reportFront, isNocReport, reportIfa, reportExcluded, undefined, true))
      splitNames(report?.supervisor).forEach((name) => addSupervisor(name, reportFront, isNocReport, reportIfa, reportExcluded, undefined, true))
      toArray(report?.personnel_ids).forEach((pid) => addSupervisor(pid, reportFront, isNocReport, reportIfa, reportExcluded))
      toArray(report?.personnel).forEach((p: any) => {
        const pid = String(p?.id || p?.collaborator_id || "").trim()
        const fullName = `${String(p?.first_name || p?.name || "").trim()} ${String(p?.last_name || "").trim()}`.trim()
        const rawRef = pid || fullName
        addSupervisor(rawRef, reportFront, isNocReport, reportIfa, reportExcluded, p?.position || p?.role || p?.specialty)
      })
    })

    const out: Record<string, { canaletas: number; piscinas: number; ifa: number; noc: number; nocCanaletas: number; nocPiscinas: number }> = {}
    supervisorPresence.forEach((entry) => {
      const key = entry.position
      if (!key) return
      // Nunca declarar más supervisores que los "en turno" de ese cargo/posición.
      const turnoCap = Number(turnoSupervisorByPosition.get(key) || 0)
      if (turnoCap <= 0) return
      if (!out[key]) out[key] = { canaletas: 0, piscinas: 0, ifa: 0, noc: 0, nocCanaletas: 0, nocPiscinas: 0 }
      const currentAssigned =
        Number(out[key].canaletas || 0) +
        Number(out[key].piscinas || 0) +
        Number(out[key].ifa || 0) +
        Number(out[key].noc || 0)
      if (currentAssigned >= turnoCap) return
      if (entry.ifa) {
        out[key].ifa += 1
        return
      }
      if (entry.excluded) {
        out[key].noc += 1
        return
      }
      const hasNocCanaletas = entry.nocFronts.has("canaletas")
      const hasNocPiscinas = entry.nocFronts.has("piscinas")
      // Prioridad NOC: si existe NOC para el supervisor, no imputar base (canaletas/piscinas).
      if (hasNocCanaletas || hasNocPiscinas) {
        if (hasNocCanaletas && hasNocPiscinas) {
          out[key].nocCanaletas += 0.5
          out[key].nocPiscinas += 0.5
        } else if (hasNocCanaletas) out[key].nocCanaletas += 1
        else out[key].nocPiscinas += 1
        out[key].noc = out[key].nocCanaletas + out[key].nocPiscinas
        return
      }
      const hasCanaletas = entry.fronts.has("canaletas")
      const hasPiscinas = entry.fronts.has("piscinas")
      if (hasCanaletas && hasPiscinas) {
        out[key].canaletas += 0.5
        out[key].piscinas += 0.5
      } else if (hasCanaletas) out[key].canaletas += 1
      else if (hasPiscinas) out[key].piscinas += 1
    })

    if (DEBUG_SUPERVISOR_COUNT) {
      try {
        if (false) console.log("[daily-report][supervisor-debug]", {
          reportDate: form.report_date,
          selectedFront: form.work_front,
          detectedSupervisors: Array.from(supervisorPresence.entries()).map(([id, v]) => ({
            id,
            collaboratorId: v.collaboratorId,
            position: v.position,
            canaletas: v.fronts.has("canaletas"),
            piscinas: v.fronts.has("piscinas"),
            nocCanaletas: v.nocFronts.has("canaletas"),
            nocPiscinas: v.nocFronts.has("piscinas"),
            ifa: v.ifa,
            excluded: v.excluded
          })),
          turnoSupervisorByPosition: Object.fromEntries(turnoSupervisorByPosition.entries()),
          grouped: out
        })
      } catch {}
    }
    return out
  }, [fieldReportsForDate, collaborators, nocFrontAssignment, dailyStatusRows, form.report_date, form.work_front])

  const directDotationByPosition = useMemo(() => {
    const DEBUG_DIRECT_FRONT = false
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
    const selectedFront: "CANALETAS" | "PISCINAS" = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"

    const normalizeJsonArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return parsed
          if (parsed && typeof parsed === "object") return Object.values(parsed)
          return []
        } catch {
          return []
        }
      }
      if (value && typeof value === "object") return Object.values(value)
      return []
    }
    const normalizeJsonObject = (value: any): Record<string, any> => {
      if (!value) return {}
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, any>
        } catch {
          return {}
        }
        return {}
      }
      if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>
      return {}
    }
    const normalizeIdArray = (value: any): string[] => {
      if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean)
      if (value == null) return []
      if (typeof value === "string") {
        const raw = value.trim()
        if (!raw) return []
        if (raw.includes(",") || raw.includes(";")) {
          return raw.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
        }
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean)
        } catch {}
        return [raw]
      }
      return []
    }
    const resolveBaseFront = (frontLike: any): "CANALETAS" | "PISCINAS" | null => {
      const label = normalize(frontLike)
      if (!label) return null
      if (
        label.includes("USO DE RECURSOS NOC") ||
        label.includes("UDR NOC") ||
        /(?:^|\s)NOC\s+N[º°]?\s*\d+/i.test(label)
      ) return null
      if (label === "CANALETAS" || label.includes("CANALET")) return "CANALETAS"
      if (label === "PISCINAS" || label.includes("PISCIN")) return "PISCINAS"
      return null
    }
    const isIfaArea = (value: any) => {
      const label = normalize(value)
      return (
        label === "IFA" ||
        label.includes("AREA IFA") ||
        label.includes("INSTALACION FAENA") ||
        label.includes("INSTALACION DE FAENA")
      )
    }
    const toHoursArray = (value: any, size: number) => {
      const arr = Array.isArray(value) ? value : []
      const out = Array.from({ length: size }).map((_, idx) => Number(arr[idx] || 0) || 0)
      return out
    }

    const collaboratorById = new Map<string, CollaboratorLite>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (id) collaboratorById.set(id, c)
    })
    const collabIdByName = new Map<string, string>()
    ;(collaborators || []).forEach((c) => {
      const id = String(c?.id || "").trim()
      if (!id) return
      const fullName = `${String(c?.first_name || "").trim()} ${String(c?.last_name || "").trim()}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
      if (fullName) collabIdByName.set(fullName, id)
    })
    const resolveParticipantId = (value: any) => {
      const raw = String(value || "").trim()
      if (!raw) return ""
      if (collaboratorById.has(raw)) return raw
      const byName = collabIdByName.get(
        raw
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .trim()
      )
      return byName || raw
    }

    const turnoIds = new Set<string>()
    const dailyByCollaboratorId = new Map<string, any>()
    ;(dailyStatusRows || []).forEach((daily: any) => {
      const c = (daily?.collaborator || {}) as any
      const collabId = String(c?.id || daily?.collaborator_id || "").trim()
      if (!collabId) return
      dailyByCollaboratorId.set(collabId, daily)
      const normalizedStatus = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String(daily?.status || "").trim().toUpperCase()
      if (normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11") turnoIds.add(collabId)
    })

    type DirectFrontHours = {
      canaletas: number
      piscinas: number
      ifa: number
      nocCanaletas: number
      nocPiscinas: number
    }
    type DirectReportContribution = {
      reportId: string
      sequence: number
      totalHours: number
      hours: DirectFrontHours
    }
    const emptyDirectFrontHours = (): DirectFrontHours => ({
      canaletas: 0,
      piscinas: 0,
      ifa: 0,
      nocCanaletas: 0,
      nocPiscinas: 0
    })
    const addDirectReportContribution = (
      out: Map<string, DirectReportContribution[]>,
      pid: string,
      contribution: DirectReportContribution
    ) => {
      if (!pid || !(contribution.totalHours > 0)) return
      const rows = out.get(pid) || []
      rows.push(contribution)
      out.set(pid, rows)
    }
    const personReportContributions = new Map<string, DirectReportContribution[]>()
    const directIdsReportedInFieldReports = new Set<string>()
    const debugReports: Array<any> = []
    let directContributionSequence = 0
    const normalizeKnownDynamicFront = (value: any) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim()
    const excludedKnownDynamicFronts = new Set([
      "INSTALACION FAENA",
      "PISCINAS",
      "CANALETAS",
      "CONTRATO BASE PISCINAS",
      "CONTRATO BASE CANALETAS"
    ])
    const knownDynamicFrontNames = new Set(
      (reportFrontNames || [])
        .map((name: any) => normalizeKnownDynamicFront(name))
        .filter((name: string) => name && !excludedKnownDynamicFronts.has(name))
    )
    const stripCrewFrontPrefix = (value: any) =>
      String(value || "")
        .replace(/^\s*CUADRILLA\s+\d+\s+/i, "")
        .replace(/\s+/g, " ")
        .trim()
    const isKnownDynamicFront = (value: any) => {
      const normalized = normalizeKnownDynamicFront(value)
      return Boolean(normalized && knownDynamicFrontNames.has(normalized))
    }
    const dynamicBucketForBaseFront = (front: "CANALETAS" | "PISCINAS" | null | undefined) =>
      front === "PISCINAS" ? "NOC_PISCINAS" : "NOC_CANALETAS"

    ;(fieldReportsForDate || []).forEach((report: any) => {
      const reportId = String(report?.id || "")
      const assignments = normalizeJsonArray(report?.assignments)
      const activityRows = mergeFieldReportActivityRowsForFrontCalc(assignments, normalizeJsonArray(report?.activities))
      const reportFrontRaw = String(report?.work_front || "").trim()
      const reportIdForFront = String(report?.id || "").trim()
      const reportAssignedUdrFront = nocFrontAssignment.byReportId.get(reportIdForFront)
      const reportFrontHasExplicitValue = reportFrontRaw.length > 0
      const reportFrontResolved = resolveBaseFront(reportFrontRaw)
      const reportFrontFallback = reportAssignedUdrFront
        ? (reportAssignedUdrFront === "PISCINAS" ? "NOC_PISCINAS" : "NOC_CANALETAS")
        : (isIfaArea(reportFrontRaw) ? "IFA" : reportFrontResolved)
      const reportCrewDynamicFront = isKnownDynamicFront(stripCrewFrontPrefix(report?.crew_name))
      const reportDynamicBucket = dynamicBucketForBaseFront(reportAssignedUdrFront || reportFrontResolved || selectedFront)
      const personHoursObj = normalizeJsonObject(report?.person_hours || {})
      const personExtraHoursObj = normalizeJsonObject((personHoursObj as any).__extras || {})
      const personHoursByParticipantId: Record<string, any> = {}
      Object.entries(personHoursObj || {}).forEach(([rawKey, hours]) => {
        if (!rawKey || rawKey === "__extras") return
        const pid = resolveParticipantId(rawKey)
        if (pid) personHoursByParticipantId[pid] = hours
      })
      const personExtraHoursByParticipantId: Record<string, any> = {}
      Object.entries(personExtraHoursObj || {}).forEach(([rawKey, hours]) => {
        const pid = resolveParticipantId(rawKey)
        if (pid) personExtraHoursByParticipantId[pid] = hours
      })

      const participantIds = new Set<string>()
      Object.keys(personHoursObj || {}).forEach((k) => {
        if (!k || k === "__extras") return
        const id = resolveParticipantId(k)
        if (id) participantIds.add(id)
      })
      Object.keys(personExtraHoursObj || {}).forEach((k) => {
        const id = resolveParticipantId(k)
        if (id) participantIds.add(id)
      })
      normalizeIdArray(report?.personnel_ids).forEach((x: any) => {
        const id = resolveParticipantId(x)
        if (id) participantIds.add(id)
      })
      normalizeIdArray(report?.capataz_id).forEach((x: any) => {
        const id = resolveParticipantId(x)
        if (id) participantIds.add(id)
      })
      normalizeJsonArray(report?.personnel).forEach((p: any) => {
        const pid = String(p?.id || p?.collaborator_id || "").trim()
        if (pid) {
          participantIds.add(resolveParticipantId(pid))
          return
        }
        const fullName = `${String(p?.first_name || p?.name || "").trim()} ${String(p?.last_name || "").trim()}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .trim()
        const mapped = fullName ? collabIdByName.get(fullName) : ""
        if (mapped) participantIds.add(mapped)
      })

      const rowFronts = activityRows.map((a: any) => {
        const rawFront = String(a?.work_front || "").trim()
        const hasExplicitFront = rawFront.length > 0
        const activityFront = resolveBaseFront(rawFront)
        if (hasExplicitFront) {
          if (isKnownDynamicFront(rawFront)) return reportDynamicBucket
          if (reportCrewDynamicFront) return reportDynamicBucket
          if (activityFront) return activityFront
          if (isIfaArea(rawFront)) return "IFA"
        }
        // Si el reporte tiene frente explícito pero no es base (ej. NOC),
        // se distribuye dinámicamente y se declara en columna UDR/NOC.
        if (reportAssignedUdrFront) {
          return reportAssignedUdrFront === "PISCINAS" ? "NOC_PISCINAS" : "NOC_CANALETAS"
        }
        if (reportCrewDynamicFront) return reportDynamicBucket
        // Si el reporte de terreno ya viene con frente explícito válido (work_front),
        // ese frente manda para todo el reporte y evita mezclar CANALETAS/PISCINAS.
        if (reportFrontHasExplicitValue && reportFrontResolved) return reportFrontResolved
        if (reportFrontHasExplicitValue && !reportFrontResolved) {
          return isIfaArea(reportFrontRaw) ? "IFA" : null
        }

        if (hasExplicitFront) {
          return null
        }
        return reportFrontFallback
      })
      if (DEBUG_DIRECT_FRONT) {
        if (false) console.log("[daily-report][direct-front][row-fronts]", {
          reportId,
          reportWorkFront: String(report?.work_front || ""),
          reportFrontFallback,
          rows: activityRows.map((a: any, idx: number) => ({
            idx,
            activity_front: String(a?.activity_front || ""),
            work_front: String(a?.work_front || ""),
            area: String(a?.area || ""),
            work_area: String(a?.work_area || ""),
            sector: String(a?.sector || ""),
            resolvedFront: rowFronts[idx]
          }))
        })
      }

      const reportDebug: any = {
        reportId,
        activityRows: activityRows.length,
        participants: Array.from(participantIds),
        frontsInRows: rowFronts
      }

      Array.from(participantIds).forEach((pidRaw) => {
        const pid = resolveParticipantId(pidRaw)
        if (!pid) return
        const personHours = toHoursArray(personHoursByParticipantId?.[pid], activityRows.length)
        const extraHours = Math.max(0, Number((personExtraHoursByParticipantId as any)?.[pid] || 0) || 0)
        if (!personHours.some((v) => v > 0) && !(extraHours > 0)) return
        directIdsReportedInFieldReports.add(pid)
        const reportHours = emptyDirectFrontHours()
        personHours.forEach((hh, idx) => {
          if (!(hh > 0)) return
          const front = rowFronts[idx]
          if (front === "CANALETAS") reportHours.canaletas += hh
          if (front === "PISCINAS") reportHours.piscinas += hh
          if (front === "IFA") reportHours.ifa += hh
          if (front === "NOC_CANALETAS") reportHours.nocCanaletas += hh
          if (front === "NOC_PISCINAS") reportHours.nocPiscinas += hh
        })
        if (extraHours > 0) {
          const extraHoursFront = reportCrewDynamicFront ? reportDynamicBucket : reportFrontFallback
          if (extraHoursFront === "CANALETAS") reportHours.canaletas += extraHours
          if (extraHoursFront === "PISCINAS") reportHours.piscinas += extraHours
          if (extraHoursFront === "IFA") reportHours.ifa += extraHours
          if (extraHoursFront === "NOC_CANALETAS") reportHours.nocCanaletas += extraHours
          if (extraHoursFront === "NOC_PISCINAS") reportHours.nocPiscinas += extraHours
        }
        const totalReportHours =
          Number(reportHours.canaletas || 0) +
          Number(reportHours.piscinas || 0) +
          Number(reportHours.ifa || 0) +
          Number(reportHours.nocCanaletas || 0) +
          Number(reportHours.nocPiscinas || 0)
        addDirectReportContribution(personReportContributions, pid, {
          reportId,
          sequence: directContributionSequence++,
          totalHours: totalReportHours,
          hours: reportHours
        })
        if (DEBUG_DIRECT_FRONT) {
          if (false) console.log("[daily-report][direct-front][person-hours-agg]", {
            reportId,
            collaboratorId: pid,
            personHours,
            rowFronts,
            aggregated: reportHours
          })
        }
      })

      if (DEBUG_DIRECT_FRONT) debugReports.push(reportDebug)
    })

    // Directos en turno sin presencia en reportes de terreno:
    // se imputan a Instalación Faena y se dividen entre ambos frentes.
    turnoIds.forEach((pid) => {
      if (!pid || directIdsReportedInFieldReports.has(pid)) return
      const base = collaboratorById.get(pid)
      const daily = dailyByCollaboratorId.get(pid)
      const rowCollab = (daily?.collaborator || {}) as any
      const merged = { ...(base || {}), ...(rowCollab || {}) } as any
      if (!merged) return
      const workerType = normalizeWorkerType(String(merged.worker_type || ""))
      const posText = String(merged.position || "").toUpperCase()
      const isCapataz = posText.includes("CAPATAZ")
      if (workerType !== "directo" && !isCapataz) return
      const reportHours = emptyDirectFrontHours()
      reportHours.ifa = activePersonWorkdayHours
      addDirectReportContribution(personReportContributions, pid, {
        reportId: "__SIN_REPORTE_TERRENO__",
        sequence: directContributionSequence++,
        totalHours: activePersonWorkdayHours,
        hours: reportHours
      })
    })

    const outByFront: Record<"CANALETAS" | "PISCINAS", Record<string, number>> = {
      CANALETAS: {},
      PISCINAS: {}
    }
    const outIfa: Record<string, number> = {}
    const outNoc: Record<string, number> = {}
    const outNocByFront: Record<"CANALETAS" | "PISCINAS", Record<string, number>> = {
      CANALETAS: {},
      PISCINAS: {}
    }
    const outIfaByPosition: Record<string, number> = {}
    const perPersonDebug: Array<any> = []
    personReportContributions.forEach((rawContributions, pid) => {
      const base = collaboratorById.get(pid)
      const daily = dailyByCollaboratorId.get(pid)
      const rowCollab = (daily?.collaborator || {}) as any
      const merged = { ...(base || {}), ...(rowCollab || {}) } as any
      if (!merged) return
      const workerType = normalizeWorkerType(String(merged.worker_type || ""))
      const posText = String(merged.position || "").toUpperCase()
      const isCapataz = posText.includes("CAPATAZ")
      if (workerType !== "directo" && !isCapataz) return

      const cappedFrontHours = emptyDirectFrontHours()
      let remainingHours = activePersonWorkdayHours
      const contributions = [...rawContributions]
        .filter((entry) => entry.totalHours > 0)
        .sort((a, b) => {
          if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours
          return a.sequence - b.sequence
        })
      contributions.forEach((entry) => {
        if (remainingHours <= 0) return
        const appliedHours = Math.min(entry.totalHours, remainingHours)
        const factor = entry.totalHours > 0 ? appliedHours / entry.totalHours : 0
        cappedFrontHours.canaletas += Number(entry.hours.canaletas || 0) * factor
        cappedFrontHours.piscinas += Number(entry.hours.piscinas || 0) * factor
        cappedFrontHours.ifa += Number(entry.hours.ifa || 0) * factor
        cappedFrontHours.nocCanaletas += Number(entry.hours.nocCanaletas || 0) * factor
        cappedFrontHours.nocPiscinas += Number(entry.hours.nocPiscinas || 0) * factor
        remainingHours -= appliedHours
      })

      const can = Number(cappedFrontHours.canaletas || 0)
      const pis = Number(cappedFrontHours.piscinas || 0)
      const ifa = Number(cappedFrontHours.ifa || 0)
      const nocCanaletas = Number(cappedFrontHours.nocCanaletas || 0)
      const nocPiscinas = Number(cappedFrontHours.nocPiscinas || 0)
      const noc = selectedFront === "PISCINAS" ? nocPiscinas : nocCanaletas
      if (!(can > 0) && !(pis > 0) && !(ifa > 0) && !(nocCanaletas > 0) && !(nocPiscinas > 0)) return
      // Regla negocio: en el frente del reporte diario, se suman todas las horas
      // declaradas en sus actividades para ese frente (aunque sean varias actividades).
      const canaletasHours = Math.min(activePersonWorkdayHours, can)
      const piscinasHours = Math.min(activePersonWorkdayHours, pis)

      const specialtyCandidate = normalizeSpecialtyLabel(
        merged.specialty,
        merged.discipline || merged.disciplina,
        merged.position
      )
      const positionCandidate = String(merged.position || "SIN CARGO")
      const disciplineCandidate = inferDirectDiscipline({
        discipline: merged.discipline || merged.disciplina,
        specialty: specialtyCandidate,
        position: positionCandidate
      })
      const key = buildDirectFrontKey(disciplineCandidate, specialtyCandidate || disciplineCandidate, positionCandidate)
      const dotationForCanaletas = resolvePersonDotationFromHours(canaletasHours, form)
      const dotationForPiscinas = resolvePersonDotationFromHours(piscinasHours, form)
      const dotationForNocCanaletas = resolvePersonDotationFromHours(Math.min(activePersonWorkdayHours, nocCanaletas), form)
      const dotationForNocPiscinas = resolvePersonDotationFromHours(Math.min(activePersonWorkdayHours, nocPiscinas), form)
      const dotationForNoc = selectedFront === "PISCINAS" ? dotationForNocPiscinas : dotationForNocCanaletas
      // Regla negocio: IFA se declara en columna "INSTALACIÓN FAENA"
      // y se reparte mitad/mitad entre reportes CANALETAS y PISCINAS.
      const dotationForIfa = resolvePersonDotationFromHours(Math.min(activePersonWorkdayHours, ifa), form) / 2
      if (dotationForCanaletas > 0) outByFront.CANALETAS[key] = Number(outByFront.CANALETAS[key] || 0) + dotationForCanaletas
      if (dotationForPiscinas > 0) outByFront.PISCINAS[key] = Number(outByFront.PISCINAS[key] || 0) + dotationForPiscinas
      if (dotationForNocCanaletas > 0) outNocByFront.CANALETAS[key] = Number(outNocByFront.CANALETAS[key] || 0) + dotationForNocCanaletas
      if (dotationForNocPiscinas > 0) outNocByFront.PISCINAS[key] = Number(outNocByFront.PISCINAS[key] || 0) + dotationForNocPiscinas
      if (dotationForNoc > 0) outNoc[key] = Number(outNoc[key] || 0) + dotationForNoc
      if (dotationForIfa > 0) {
        outIfa[key] = Number(outIfa[key] || 0) + dotationForIfa
        const posKey = String(positionCandidate || "").trim().toUpperCase() || "SIN CARGO"
        outIfaByPosition[posKey] = Number(outIfaByPosition[posKey] || 0) + dotationForIfa
      }
      if (DEBUG_DIRECT_FRONT) {
        if (false) console.log("[daily-report][direct-front][row-contribution]", {
          collaboratorId: pid,
          positionCandidate,
          specialtyCandidate,
          disciplineCandidate,
          key,
          can,
          pis,
          ifa,
          nocCanaletas,
          nocPiscinas,
          selectedFront,
          rawContributions: contributions,
          canaletasHours,
          piscinasHours,
          dotationForCanaletas,
          dotationForPiscinas,
          dotationForNocCanaletas,
          dotationForNocPiscinas,
          dotationForIfa,
          outFrontValue: outByFront[selectedFront]?.[key] || 0,
          outIfaValue: outIfa[key] || 0,
          outIfaByPositionValue: outIfaByPosition[String(positionCandidate || "").trim().toUpperCase() || "SIN CARGO"] || 0
        })
      }

      if (DEBUG_DIRECT_FRONT) {
        perPersonDebug.push({
          collaboratorId: pid,
          position: positionCandidate,
          specialty: specialtyCandidate,
          canHours: can,
          pisHours: pis,
          ifaHours: ifa,
          nocCanaletasHours: nocCanaletas,
          nocPiscinasHours: nocPiscinas,
          totalBaseHours: can + pis + nocCanaletas + nocPiscinas + ifa,
          canaletasHours,
          piscinasHours,
          selectedRawHours: selectedFront === "CANALETAS" ? can : pis,
          scaledSelectedHours: selectedFront === "CANALETAS" ? canaletasHours : piscinasHours,
          dotationForFront: selectedFront === "CANALETAS" ? dotationForCanaletas : dotationForPiscinas,
          dotationForIfa
        })
      }
    })

    if (DEBUG_DIRECT_FRONT) {
      if (false) console.log("[daily-report][direct-front][summary]", {
        reportDate: form.report_date,
        selectedFront,
        totalFieldReportsDate: (fieldReportsForDate || []).length,
        reportsUsed: debugReports.length,
        participantsWithHours: Array.from(personReportContributions.keys()),
        byRowKey: outByFront[selectedFront],
        byFront: outByFront,
        ifaByRowKey: outIfa,
        nocByFront: outNocByFront,
        ifaByPosition: outIfaByPosition
      })
      if (false) console.log("[daily-report][direct-front][reports]", debugReports)
      if (false) console.log("[daily-report][direct-front][person-hours]", perPersonDebug)
    }

    return { front: outByFront[selectedFront], frontByFront: outByFront, ifa: outIfa, noc: outNoc, nocByFront: outNocByFront, ifaByPosition: outIfaByPosition }
  }, [fieldReportsForDate, collaborators, dailyStatusRows, form.report_date, form.work_front, nocFrontAssignment, reportFrontNames])

  const directFrontDotationByPosition = useMemo(
    () => directDotationByPosition.front,
    [directDotationByPosition]
  )

  const directFrontDotationByFront = useMemo(
    () => directDotationByPosition.frontByFront || { CANALETAS: {}, PISCINAS: {} },
    [directDotationByPosition]
  )

  const directIfaDotationByPosition = useMemo(
    () => directDotationByPosition.ifa,
    [directDotationByPosition]
  )

  const directNocDotationByPosition = useMemo(
    () => (directDotationByPosition as any).noc || {},
    [directDotationByPosition]
  )

  const directNocDotationByFront = useMemo(
    () => (directDotationByPosition as any).nocByFront || { CANALETAS: {}, PISCINAS: {} },
    [directDotationByPosition]
  )

  const directIfaDotationByPositionName = useMemo(
    () => directDotationByPosition.ifaByPosition,
    [directDotationByPosition]
  )

  const totalDirectFrontDotation = useMemo(
    () => Object.values(directFrontDotationByPosition || {}).reduce((acc, n) => acc + Number(n || 0), 0),
    [directFrontDotationByPosition]
  )

  const hasNocFrontColumn = useMemo(() => {
    const isStrictPersistedView = Boolean(viewOpen || isViewingHistoryVersion || isEditSnapshotMode)
    const activeFront: "CANALETAS" | "PISCINAS" = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
    const hasNocAssignedToActiveFront =
      (nocFrontAssignment.codesByFront[activeFront] || []).length > 0 ||
      (nocFrontAssignment.namesByFront[activeFront] || []).length > 0
    const hasPersistedNocRows =
      [...(v2IndirectAttendanceRows || []), ...(v2DirectAttendanceRows || [])]
        .some((row: any) => Number(row?.nocFront || 0) > 0)
    const hasPersistedNocFlag = (() => {
      const notes: any = (form as any)?.notes && typeof (form as any).notes === "object" ? (form as any).notes : {}
      const formSnap: any = (form as any)?.v2_form_snapshot && typeof (form as any).v2_form_snapshot === "object" ? (form as any).v2_form_snapshot : {}
      const runtime: any = (form as any)?.v2_runtime_snapshot && typeof (form as any).v2_runtime_snapshot === "object" ? (form as any).v2_runtime_snapshot : {}
      const raw =
        (form as any)?.v2_has_noc_front_column ??
        runtime?.v2_has_noc_front_column ??
        formSnap?.v2_has_noc_front_column ??
        notes?.v2_has_noc_front_column
      if (typeof raw === "boolean") return raw
      if (typeof raw === "number") return raw > 0
      const txt = String(raw ?? "").trim().toLowerCase()
      return txt === "1" || txt === "true" || txt === "si" || txt === "sí"
    })()
    const hasAnyNocSignal = hasNocAssignedToActiveFront || hasPersistedNocRows || hasPersistedNocFlag
    if (isStrictPersistedView) {
      // En Ver / Historial NO mezclar cálculos vivos entre frentes.
      // La columna dinámica NOC debe salir solo del snapshot guardado del frente abierto.
      return hasPersistedNocRows || hasPersistedNocFlag
    }
    if (!hasAnyNocSignal) return false

    const hasDirect = Object.values(directNocDotationByPosition || {}).some((v) => Number(v || 0) > 0)
    const hasIndirectSpecial = Object.values(frontRoleDotation?.noc || {}).some((v) => Number(v || 0) > 0)
    const hasMantExcluded =
      Number(mantencionFrontCounts?.excluded?.["MECANICO MANTENCION"] || 0) > 0 ||
      Number(mantencionFrontCounts?.excluded?.["ELECTRICO MANTENCION"] || 0) > 0
    const hasOperatorNoc = Object.values(operatorFrontDotationByPosition || {}).some((row: any) =>
      Number(row?.nocCanaletas || 0) > 0 || Number(row?.nocPiscinas || 0) > 0
    )
    return hasDirect || hasIndirectSpecial || hasMantExcluded || hasOperatorNoc || hasAnyNocSignal
  }, [directNocDotationByPosition, frontRoleDotation, mantencionFrontCounts, operatorFrontDotationByPosition, form, form.work_front, nocFrontAssignment, v2IndirectAttendanceRows, v2DirectAttendanceRows, viewOpen, isViewingHistoryVersion, isEditSnapshotMode])

  const nocFrontColumnLabel = useMemo(() => {
    const isStrictPersistedView = Boolean(viewOpen || isViewingHistoryVersion || isEditSnapshotMode)
    const notes: any = (form as any)?.notes && typeof (form as any).notes === "object" ? (form as any).notes : {}
    const formSnap: any = (form as any)?.v2_form_snapshot && typeof (form as any).v2_form_snapshot === "object" ? (form as any).v2_form_snapshot : {}
    const runtime: any = (form as any)?.v2_runtime_snapshot && typeof (form as any).v2_runtime_snapshot === "object" ? (form as any).v2_runtime_snapshot : {}
    const persistedLabel = String(
      (form as any)?.v2_noc_front_column_label ??
      runtime?.v2_noc_front_column_label ??
      formSnap?.v2_noc_front_column_label ??
      notes?.v2_noc_front_column_label ??
      ""
    ).trim()
    const hasMultipleNocLabels = (label: string) => {
      const normalized = String(label || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
      const matches = normalized.match(/NOC\s+N[º°]?\s*\d+/g) || []
      return matches.length > 1 || normalized.includes(" / ")
    }
    if (persistedLabel && !hasMultipleNocLabels(persistedLabel)) return persistedLabel

    const activeFront: "CANALETAS" | "PISCINAS" = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
    const cleanLongNocLabel = (text: string) => {
      const cleaned = String(text || "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^REPORTE\s+/i, "")
        .trim()
      const nocMatch = cleaned.match(/NOC\s+N[º°]?\s*0*\d+/i)
      if (!nocMatch || nocMatch.index == null) return ""
      const prefix = cleaned.slice(0, nocMatch.index).trim()
      const isShortOnly = /^UDR\s+NOC\s+N[º°]?\s*\d+$/i.test(cleaned) || /^NOC\s+N[º°]?\s*\d+$/i.test(cleaned)
      if (isShortOnly || !/[A-ZÁÉÍÓÚÑ]/i.test(prefix)) return ""
      return cleaned
    }
    const extractNocLabelFromText = (value: any) => {
      const raw = String(value || "").trim()
      if (!raw) return ""
      const normalized = raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
      const fullLabelMatch = normalized.match(/USO\s+DE\s+RECURSOS\s+NOC\s+N[º°]?\s*\d+.*$/i)
      if (fullLabelMatch) {
        return String(fullLabelMatch[0] || "")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^USO\s+DE\s+RECURSOS/i, "UDR")
      }
      const longLabel = cleanLongNocLabel(raw)
      if (longLabel) return longLabel
      const codeMatch = normalized.match(/NOC\s+N[º°]?\s*0*(\d+)/i)
      if (!codeMatch) return ""
      const num = String(codeMatch[1] || "").trim()
      if (!num) return ""
      return `UDR NOC Nº${num.padStart(3, "0")}`
    }
    const extractNocLabelFromReport = (report: any) => {
      if (!report || typeof report !== "object") return ""
      const direct =
        extractNocLabelFromText(report?.work_front || "") ||
        extractNocLabelFromText(report?.area || report?.work_area || "") ||
        extractNocLabelFromText(report?.report_title || "") ||
        extractNocLabelFromText(report?.crew_name || "")
      if (direct) return direct
      // Fallback dinámico: buscar un patrón NOC en el contenido completo del reporte fuente.
      try {
        const raw = JSON.stringify(report)
        const normalized = String(raw || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
        const longLabel = cleanLongNocLabel(raw.match(/(?:REPORTE\s+)?[A-ZÁÉÍÓÚÑ0-9][^"]*NOC\s+N[º°]?\s*\d+[^"]*/i)?.[0] || "")
        if (longLabel) return longLabel
        const fullLabelMatch = normalized.match(/USO\s+DE\s+RECURSOS\s+NOC\s+N[º°]?\s*\d+[^\"]*/i)
        if (fullLabelMatch) {
          return String(fullLabelMatch[0] || "")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^USO\s+DE\s+RECURSOS/i, "UDR")
        }
        const codeMatch = normalized.match(/NOC\s+N[º°]?\s*0*(\d+)/i)
        if (!codeMatch) return ""
        const num = String(codeMatch[1] || "").trim()
        if (!num) return ""
        return `UDR NOC Nº${num.padStart(3, "0")}`
      } catch {
        return ""
      }
    }
    // Compatibilidad: reportes antiguos pueden no traer el label persistido.
    // En ese caso reconstruimos usando los source_field_report_ids guardados en el propio reporte.
    const sourceIds = Array.isArray((form as any)?.source_field_report_ids)
      ? (form as any).source_field_report_ids.map((x: any) => String(x || "").trim()).filter(Boolean)
      : []
    if (sourceIds.length > 0) {
      const reportsById = new Map<string, any>()
      ;(fieldReportsForDate || []).forEach((report: any) => {
        const id = String(report?.id || "").trim()
        if (id) reportsById.set(id, report)
      })
      const sourceNocReports = sourceIds
        .map((id: string) => {
          const report = reportsById.get(id)
          if (!report) return null
          const label = extractNocLabelFromReport(report)
          if (!label) return null
          const assignedFront = nocFrontAssignment.byReportId.get(id)
          return { id, label, assignedFront }
        })
        .filter(Boolean) as Array<{ id: string; label: string; assignedFront?: "CANALETAS" | "PISCINAS" }>
      const effectiveNocReports = sourceNocReports.length > 0
        ? sourceNocReports
        : Array.from(reportsById.entries())
            .map(([id, report]) => {
              const label = extractNocLabelFromReport(report)
              if (!label) return null
              const assignedFront = nocFrontAssignment.byReportId.get(id)
              return { id, label, assignedFront }
            })
            .filter(Boolean) as Array<{ id: string; label: string; assignedFront?: "CANALETAS" | "PISCINAS" }>
      // Fallback determinístico para reportes antiguos:
      // 1er NOC fuente => CANALETAS, 2do NOC fuente => PISCINAS.
      const labels = effectiveNocReports
        .map((row, idx) => {
          if (row.assignedFront) return row.assignedFront === activeFront ? row.label : ""
          if (effectiveNocReports.length === 1) return row.label
          const assignedFront: "CANALETAS" | "PISCINAS" = idx === 0 ? "CANALETAS" : "PISCINAS"
          if (assignedFront !== activeFront) return ""
          return row.label
        })
        .filter(Boolean)
      if (labels.length > 0) return Array.from(new Set(labels)).join(" / ")
    }
    const codes = nocFrontAssignment.codesByFront[activeFront] || []
    if (!codes.length) return "UDR NOC"
    return codes.join(" / ")
  }, [form, form.work_front, nocFrontAssignment, fieldReportsForDate, viewOpen, isViewingHistoryVersion, isEditSnapshotMode, viewRecord])

  const normalizeDailyReportFrontHeader = (value: unknown) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim()

  const isExcludedDailyReportFrontHeader = (value: unknown) => {
    const normalized = normalizeDailyReportFrontHeader(value)
    return [
      "INSTALACION FAENA",
      "PISCINAS",
      "CANALETAS",
      "CONTRATO BASE PISCINAS",
      "CONTRATO BASE CANALETAS",
    ].includes(normalized)
  }

  const stripDailyReportCrewPrefix = (value: unknown) =>
    String(value ?? "")
      .replace(/^\s*CUADRILLA\s+\d+\s+/i, "")
      .replace(/\s+/g, " ")
      .trim()

  const getDailyReportNocKeys = (value: unknown) =>
    Array.from(
      normalizeDailyReportFrontHeader(value).matchAll(/NOC\s+N?[º°]?\s*0*(\d+)/g)
    )
      .map((match) => match[1])
      .filter(Boolean)
      .map((num) => num.replace(/^0+/, "") || "0")

  const reportFrontNameByNormalized = useMemo(() => {
    const grouped = new Map<string, string[]>()
    ;(reportFrontNames || []).forEach((name: unknown) => {
      const label = String(name ?? "").replace(/\s+/g, " ").trim()
      const key = normalizeDailyReportFrontHeader(label)
      if (!label || !key) return
      grouped.set(key, [...(grouped.get(key) || []), label])
    })
    const unique = new Map<string, string>()
    grouped.forEach((names, key) => {
      const distinct = Array.from(new Set(names))
      if (distinct.length === 1) unique.set(key, distinct[0])
    })
    return unique
  }, [reportFrontNames])

  const resolvedDailyReportDynamicFrontLabel = useMemo(() => {
    const strictPersistedLabel = String(nocFrontColumnLabel || "").replace(/\s+/g, " ").trim()
    if ((viewOpen || isViewingHistoryVersion || isEditSnapshotMode) && strictPersistedLabel) {
      return strictPersistedLabel
    }

    const activeBaseCandidates = new Map<string, string>()
    const canaletasBaseCandidates = new Map<string, string>()
    const dynamicWorkFrontCandidates = new Map<string, string>()
    const allRealCandidates = new Map<string, string>()
    const activeFront = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
    const activeBaseFront = activeFront === "PISCINAS" ? "CONTRATO BASE PISCINAS" : "CONTRATO BASE CANALETAS"
    const hintNocs = getDailyReportNocKeys(nocFrontColumnLabel)

    const addCandidate = (bucket: Map<string, string>, value: unknown) => {
      const label = String(value ?? "").replace(/\s+/g, " ").trim()
      if (!label || isExcludedDailyReportFrontHeader(label)) return

      const key = normalizeDailyReportFrontHeader(label)
      if (!key || bucket.has(key)) return

      bucket.set(key, label)
    }
    const addRealCandidate = (value: unknown) => addCandidate(allRealCandidates, value)

    const resolveCrewFrontName = (value: unknown) => {
      const candidate = stripDailyReportCrewPrefix(value)
      if (!candidate || isExcludedDailyReportFrontHeader(candidate)) return ""
      const exact = reportFrontNameByNormalized.get(normalizeDailyReportFrontHeader(candidate))
      if (exact) return exact
      const candidateNocs = getDailyReportNocKeys(candidate)
      if (!candidateNocs.length) return ""
      const matches = (reportFrontNames || [])
        .map((name: unknown) => String(name ?? "").replace(/\s+/g, " ").trim())
        .filter((name) => {
          if (!name || isExcludedDailyReportFrontHeader(name)) return false
          const nameNocs = getDailyReportNocKeys(name)
          return candidateNocs.some((noc) => nameNocs.includes(noc))
        })
      return matches.length === 1 ? matches[0] : ""
    }
    const resolveWorkFrontName = (value: unknown) => {
      const label = String(value ?? "").replace(/\s+/g, " ").trim()
      if (!label || isExcludedDailyReportFrontHeader(label)) return ""
      const exact = reportFrontNameByNormalized.get(normalizeDailyReportFrontHeader(label))
      if (exact) return exact
      const labelNocs = getDailyReportNocKeys(label)
      if (!labelNocs.length) return label
      const matches = (reportFrontNames || [])
        .map((name: unknown) => String(name ?? "").replace(/\s+/g, " ").trim())
        .filter((name) => {
          if (!name || isExcludedDailyReportFrontHeader(name)) return false
          const nameNocs = getDailyReportNocKeys(name)
          return labelNocs.some((noc) => nameNocs.includes(noc))
        })
      return matches.length === 1 ? matches[0] : label
    }

    const chooseByHint = (labels: string[]) => {
      if (!hintNocs.length) return ""
      const matches = labels.filter((label) => {
        const labelNocs = getDailyReportNocKeys(label)
        return hintNocs.some((noc) => labelNocs.includes(noc))
      })
      return matches.length === 1 ? matches[0] : ""
    }
    const joinLabels = (labels: string[]) => Array.from(new Set(
      labels
        .map((label) => String(label || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )).join(" / ")

    const isSameFrontLabel = (left: unknown, right: unknown) =>
      normalizeDailyReportFrontHeader(left) === normalizeDailyReportFrontHeader(right)

    ;(fieldReportsForDate || []).forEach((report: any) => {
      const workFront = String(report?.work_front ?? "").replace(/\s+/g, " ").trim()
      const normalizedWorkFront = normalizeDailyReportFrontHeader(workFront)
      const isActiveBaseReport = normalizedWorkFront === activeFront || normalizedWorkFront === activeBaseFront
      const isCanaletasBaseReport = normalizedWorkFront === "CANALETAS" || normalizedWorkFront === "CONTRATO BASE CANALETAS"
      const resolvedCrewFront = resolveCrewFrontName(report?.crew_name)

      addRealCandidate(resolvedCrewFront)

      if (isActiveBaseReport) {
        addCandidate(activeBaseCandidates, resolvedCrewFront)
      }

      if (isCanaletasBaseReport) {
        addCandidate(canaletasBaseCandidates, resolvedCrewFront)
      }

      const resolvedWorkFront = resolveWorkFrontName(workFront)
      if (resolvedWorkFront) {
        addRealCandidate(resolvedWorkFront)
      }

      if (!isActiveBaseReport && resolvedWorkFront) {
        addCandidate(dynamicWorkFrontCandidates, resolvedWorkFront)
      }
    })

    const activeBaseLabels = Array.from(activeBaseCandidates.values())
    const dynamicWorkFrontLabels = Array.from(dynamicWorkFrontCandidates.values())
    const canaletasBaseLabels = Array.from(canaletasBaseCandidates.values())
    const canaletasResolvedLabel = chooseByHint(canaletasBaseLabels) || (canaletasBaseLabels.length === 1 ? canaletasBaseLabels[0] : "")

    const activeBaseByHint = chooseByHint(activeBaseLabels)
    let selected = activeBaseByHint || (activeBaseLabels.length >= 1 ? joinLabels(activeBaseLabels) : "")

    if (activeFront === "PISCINAS" && selected && canaletasResolvedLabel && isSameFrontLabel(selected, canaletasResolvedLabel)) {
      const alternateDynamicLabels = dynamicWorkFrontLabels.filter((label) => !isSameFrontLabel(label, canaletasResolvedLabel))
      const alternateByHint = chooseByHint(alternateDynamicLabels)
      if (alternateByHint) return alternateByHint
      if (alternateDynamicLabels.length >= 1) return joinLabels(alternateDynamicLabels)
      return ""
    }

    if (selected) return selected

    const dynamicLabels = activeFront === "PISCINAS" && canaletasResolvedLabel
      ? dynamicWorkFrontLabels.filter((label) => !isSameFrontLabel(label, canaletasResolvedLabel))
      : dynamicWorkFrontLabels
    const dynamicByHint = chooseByHint(dynamicLabels)
    if (dynamicByHint) return dynamicByHint

    if (dynamicLabels.length >= 1) return joinLabels(dynamicLabels)

    return ""
  }, [fieldReportsForDate, form.work_front, nocFrontColumnLabel, reportFrontNameByNormalized, reportFrontNames, viewOpen, isViewingHistoryVersion, isEditSnapshotMode])

  const getV2DotacionFrenteValues = (row: {
    position?: string
    contratados?: number
    apoyoOficina?: number
    descansoCambioTurno?: number
    permisoCovid?: number
    dotacionTotalObra?: number
    discipline?: string
    specialty?: string
  }, targetFront: "CANALETAS" | "PISCINAS" = (form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS")) => {
    const rowAny = row as any
    const debugReturn = (_branch: "A" | "B" | "C", values: [number, number, number]) => values
    const toMaybeNumber = (value: unknown) => {
      if (value == null || String(value).trim() === "") return null
      const parsed = Number(String(value).replace(",", "."))
      return Number.isFinite(parsed) ? parsed : null
    }
    const getDirectTurnoCap = () => {
      const contracted = Number(rowAny?.contratados || 0)
      const unavailable =
        Number(rowAny?.apoyoOficina || 0) +
        Number(rowAny?.descansoCambioTurno || 0) +
        Number(rowAny?.permisoCovid || 0) +
        Number(rowAny?.renunciaVoluntaria || 0) +
        Number(rowAny?.terminoContrato || 0) +
        Number(rowAny?.enCurso3d || 0) +
        Number(rowAny?.capacitacionAcreditacion || 0) +
        Number(rowAny?.teletrabajo || 0) +
        Number(rowAny?.pruebaPractica || 0) +
        Number(rowAny?.ofertaComercial || 0)
      const attendanceLimit = Math.max(0, contracted - unavailable)
      const explicitDot = toMaybeNumber(rowAny?.dotacionTotalObra)
      if (explicitDot != null) return Math.max(0, Number(explicitDot || 0) * 2)
      return Math.max(0, Number.isFinite(attendanceLimit) ? attendanceLimit : 0)
    }
    const normalizeDirectSplit = (ifaValue: number, frontValue: number, nocValue: number): [number, number, number] => {
      const limit = getDirectTurnoCap()
      const safeFront = Math.max(0, Number(frontValue || 0))
      const safeNoc = Math.max(0, Number(nocValue || 0))
      const fixed = safeFront + safeNoc
      const safeIfa = Math.max(0, Math.min(Number(ifaValue || 0), Math.max(0, limit - fixed)))
      if (limit > 0 && fixed > limit) {
        const cappedNoc = Math.min(safeNoc, limit)
        return [0, Number(Math.max(0, limit - cappedNoc).toFixed(2)), Number(cappedNoc.toFixed(2))]
      }
      return [Number(safeIfa.toFixed(2)), Number(safeFront.toFixed(2)), Number(safeNoc.toFixed(2))]
    }
    // Source of truth rule: if row comes from persisted V2 snapshot, never recalculate.
    if (rowAny?.__persistedDailySnapshot === true) {
      const persistedInstalacion = toMaybeNumber(rowAny?.instalacionFaena)
      const persistedFrente = toMaybeNumber(rowAny?.frente)
      const persistedNocFront = toMaybeNumber(rowAny?.nocFront)
      const persistedDotTotal = toMaybeNumber(rowAny?.dotacionTotalObra)
      const persistedHhTotal = toMaybeNumber(rowAny?.hhTotalObra)
      const fallbackDot = Number(persistedDotTotal || 0) > 0
        ? Number(persistedDotTotal || 0)
        : Number(persistedHhTotal || 0) > 0
          ? resolvePersonDotationFromHours(persistedHhTotal, form)
          : 0
      const safeInstalacion = Number(persistedInstalacion || 0)
      const safeFrente = Number(persistedFrente || 0)
      const safeNocFront = Number(persistedNocFront || 0)
      if ((safeInstalacion + safeFrente + safeNocFront) > 0) return debugReturn("A", [safeInstalacion, safeFrente, safeNocFront])
      return debugReturn("B", [0, Math.max(0, fallbackDot), 0])
    }
    const persistedInstalacion = toMaybeNumber(rowAny?.instalacionFaena)
    const persistedFrente = toMaybeNumber(rowAny?.frente)
    const persistedNocFront = toMaybeNumber(rowAny?.nocFront)
    const hasPersistedFrontValues = rowAny?.__persistedDailySnapshot === true && (persistedInstalacion != null || persistedFrente != null)
    const persistedDotTotal = toMaybeNumber(rowAny?.dotacionTotalObra)
    const hasBrokenPersistedFrontSplit =
      rowAny?.__persistedDailySnapshot === true &&
      Number((persistedInstalacion || 0) + (persistedFrente || 0)) === 0 &&
      Number(persistedDotTotal || 0) > 0
    const isViewingExistingRecord = Boolean(viewOpen && viewRecord)
    const shouldUsePersistedFrontValues =
      hasPersistedFrontValues &&
      !hasBrokenPersistedFrontSplit &&
      (Boolean(editingId) || isViewingHistoryVersion || isViewingExistingRecord || indirectHoursSettingsMatchSaved)
    const isDirectRow =
      Object.prototype.hasOwnProperty.call(rowAny, "specialty") ||
      Object.prototype.hasOwnProperty.call(rowAny, "discipline")
    const pos = String(row?.position || "").toUpperCase()

    if (isDirectRow) {
      if (shouldUsePersistedFrontValues) {
        return debugReturn("A", [Number(persistedInstalacion || 0), Number(persistedFrente || 0), Number(persistedNocFront || 0)])
      }
      const rowDisc = normalizeDirectKeyToken(rowAny?.discipline || rowAny?.specialty || "GENERAL") || "GENERAL"
      const rowSpec = normalizeSpecialtyLabel(rowAny?.specialty, rowAny?.discipline, row?.position) || "GENERAL"
      const directKey = buildDirectFrontKey(rowDisc, rowSpec, pos)
      const directIfaByKey = Number(directIfaDotationByPosition?.[directKey] || 0)
      const directFrontMap = directFrontDotationByFront?.[targetFront] || {}
      const directNocMap = directNocDotationByFront?.[targetFront] || {}
      return debugReturn("C", normalizeDirectSplit(
        directIfaByKey,
        Number(directFrontMap?.[directKey] || 0),
        Number(directNocMap?.[directKey] || 0)
      ))
    }

    const isMainPiscinas = targetFront === "PISCINAS"
    const roleKey = pos.includes("TOPOGRAFO")
      ? "TOPOGRAFO"
      : pos.includes("ALARIFE")
        ? "ALARIFE"
        : pos.includes("NIVELADOR")
          ? "NIVELADOR"
        : pos.includes("RIGGER")
          ? "RIGGER"
          : pos.includes("PREVENCIONISTA")
            ? "PREVENCIONISTA"
            : pos.includes("MECANICO MANTENCION")
              ? "MECANICO MANTENCION"
              : pos.includes("ELECTRICO MANTENCION")
                ? "ELECTRICO MANTENCION"
                : ""

    const overrideDelta = Number(indirectOverrideFrontDotByPosition?.[pos] ?? 0)
    if (shouldUsePersistedFrontValues) {
      return debugReturn("A", [Number(persistedInstalacion || 0), Number(persistedFrente || 0), Number(persistedNocFront || 0)])
    }

    if (pos.includes("SUPERVISOR") || pos.includes("JEFE") || pos.includes("COORDINADOR")) {
      const supervisorFronts = supervisorFrontDotationByPosition?.[pos]
      const supervisorCanaletas = Number(supervisorFronts?.canaletas || 0)
      const supervisorPiscinas = Number(supervisorFronts?.piscinas || 0)
      const supervisorNocCanaletas = Number((supervisorFronts as any)?.nocCanaletas || 0)
      const supervisorNocPiscinas = Number((supervisorFronts as any)?.nocPiscinas || 0)
      const supervisorIfa = Number(supervisorFronts?.ifa || 0)
      const supervisorNoc = supervisorNocCanaletas + supervisorNocPiscinas + Number(supervisorFronts?.noc || 0)
      const hasSupervisorFrontRule = supervisorCanaletas > 0 || supervisorPiscinas > 0 || supervisorIfa > 0 || supervisorNoc > 0
      if (hasSupervisorFrontRule) {
        const selectedSupervisorNoc = isMainPiscinas ? supervisorNocPiscinas : supervisorNocCanaletas
        if (supervisorIfa > 0) return debugReturn("C", [supervisorIfa / 2, 0, selectedSupervisorNoc])
        const selectedSupervisorFront = isMainPiscinas ? supervisorPiscinas : supervisorCanaletas
        return debugReturn("C", [0, selectedSupervisorFront, selectedSupervisorNoc])
      }
    }

    if (roleKey) {
      const selectedFrontValue = Number(
        (isMainPiscinas
          ? frontRoleDotation?.piscinas?.[roleKey]
          : frontRoleDotation?.canaletas?.[roleKey]) || 0
      )
      const manualSpecialFront = Number(
        (isMainPiscinas
          ? indirectManualSpecialFrontByPosition?.[pos]?.piscinas
          : indirectManualSpecialFrontByPosition?.[pos]?.canaletas) || 0
      )
      if (roleKey === "PREVENCIONISTA") {
        const selectedBaseFront = Number(
          (isMainPiscinas
            ? prevencionistaFrontDistribution?.allocated?.piscinas
            : prevencionistaFrontDistribution?.allocated?.canaletas) || 0
        )
        const selectedNocFront = Number(
          (isMainPiscinas
            ? prevencionistaFrontDistribution?.allocated?.nocPiscinas
            : prevencionistaFrontDistribution?.allocated?.nocCanaletas) || 0
        )
        return debugReturn("C", [0, Math.max(0, selectedBaseFront + manualSpecialFront), selectedNocFront])
      }
      if (roleKey === "MECANICO MANTENCION" || roleKey === "ELECTRICO MANTENCION") {
        const canHours = Number(mantencionFrontCounts?.canaletas?.[roleKey] || 0)
        const pisHours = Number(mantencionFrontCounts?.piscinas?.[roleKey] || 0)
        const nocCanHours = Number(mantencionFrontCounts?.nocCanaletas?.[roleKey] || 0)
        const nocPisHours = Number(mantencionFrontCounts?.nocPiscinas?.[roleKey] || 0)
        const ifaHours = Number(mantencionFrontCounts?.ifa?.[roleKey] || 0)
        const excludedHours = Number(mantencionFrontCounts?.excluded?.[roleKey] || 0)
        const totalBaseFrontHours = canHours + pisHours
        const totalNocHours = nocCanHours + nocPisHours
        const totalDeclaredHours = totalBaseFrontHours + totalNocHours + ifaHours + excludedHours
        const selectedFrontHours = isMainPiscinas ? pisHours : canHours
        const selectedNocHours = isMainPiscinas ? nocPisHours : nocCanHours
        const baseDotRaw = Object.prototype.hasOwnProperty.call(rowAny, "dotacionTotalObra")
          ? Math.max(0, Number(row?.dotacionTotalObra || 0))
          : Math.max(
              0,
              Number(row?.contratados || 0) -
                Number(row?.apoyoOficina || 0) -
                Number(row?.descansoCambioTurno || 0) -
                Number(row?.permisoCovid || 0)
            )
        if (excludedHours > 0) return debugReturn("C", [0, 0, resolvePersonDotationFromHours(excludedHours, form)])
        // Si hay horas declaradas en reportes de terreno, solo mostrar en los frentes
        // donde realmente estuvo presente (incluye NOC por frente).
        if (totalDeclaredHours > 0 && selectedFrontHours <= 0 && selectedNocHours <= 0 && ifaHours <= 0) {
          return debugReturn("C", [0, 0, 0])
        }
        if (selectedFrontHours > 0 || ifaHours > 0 || selectedNocHours > 0) {
          return debugReturn("C", [
            resolvePersonDotationFromHours(ifaHours, form) / 2,
            resolvePersonDotationFromHours(selectedFrontHours, form) + manualSpecialFront,
            resolvePersonDotationFromHours(selectedNocHours, form)
          ])
        }
        // Solo si no aparece en ningun reporte de terreno: dividir 50/50
        // entre frentes principales del reporte diario.
        return debugReturn("C", [baseDotRaw / 2, manualSpecialFront, 0])
      }
      return debugReturn("C", [0, selectedFrontValue + manualSpecialFront, Number(frontRoleDotation?.noc?.[roleKey] || 0)])
    }
    const operatorFronts = operatorFrontDotationByPosition?.[pos]
    if (operatorFronts) {
      const operatorCanaletas = Number(operatorFronts?.canaletas || 0)
      const operatorPiscinas = Number(operatorFronts?.piscinas || 0)
      const operatorNocCanaletas = Number(operatorFronts?.nocCanaletas || 0)
      const operatorNocPiscinas = Number(operatorFronts?.nocPiscinas || 0)
      const operatorIfa = Number(operatorFronts?.ifa || 0)
      const hasOperatorFieldReportFront =
        operatorCanaletas > 0 ||
        operatorPiscinas > 0 ||
        operatorNocCanaletas > 0 ||
        operatorNocPiscinas > 0 ||
        operatorIfa > 0
      if (hasOperatorFieldReportFront) {
        const selectedOperatorFront = isMainPiscinas ? operatorPiscinas : operatorCanaletas
        const selectedOperatorNoc = isMainPiscinas ? operatorNocPiscinas : operatorNocCanaletas
        const declaredOperatorDot = operatorCanaletas + operatorPiscinas + operatorNocCanaletas + operatorNocPiscinas + operatorIfa
        const baseDotRaw = Object.prototype.hasOwnProperty.call(rowAny, "dotacionTotalObra")
          ? Math.max(0, Number(row?.dotacionTotalObra || 0))
          : Math.max(
              0,
              Number(row?.contratados || 0) -
                Number(row?.apoyoOficina || 0) -
                Number(row?.descansoCambioTurno || 0) -
                Number(row?.permisoCovid || 0)
            )
        const undeclaredOperatorDot = Math.max(0, baseDotRaw - declaredOperatorDot)
        const manualSpecialFront = Number(
          (isMainPiscinas
            ? indirectManualSpecialFrontByPosition?.[pos]?.piscinas
            : indirectManualSpecialFrontByPosition?.[pos]?.canaletas) || 0
        )
        return debugReturn("C", [(operatorIfa + undeclaredOperatorDot) / 2, selectedOperatorFront + manualSpecialFront, selectedOperatorNoc])
      }
    }

    const baseDotRaw = Object.prototype.hasOwnProperty.call(rowAny, "dotacionTotalObra")
      ? Math.max(0, Number(row?.dotacionTotalObra || 0))
      : Math.max(
          0,
          Number(row?.contratados || 0) -
            Number(row?.apoyoOficina || 0) -
            Number(row?.descansoCambioTurno || 0) -
            Number(row?.permisoCovid || 0)
        )
    const instalacionFaena = baseDotRaw / 2
    const manualSpecialFront = Number(
      (isMainPiscinas
        ? indirectManualSpecialFrontByPosition?.[pos]?.piscinas
        : indirectManualSpecialFrontByPosition?.[pos]?.canaletas) || 0
    )
    return debugReturn("C", [Math.max(0, instalacionFaena + overrideDelta), manualSpecialFront, 0])
  }

  const getFrontCounterpartInfo = React.useCallback((row: any, section: "indirect" | "direct") => {
    if (viewOpen || isViewingHistoryVersion) return null
    const currentFront: "CANALETAS" | "PISCINAS" = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
    const counterpartFront: "CANALETAS" | "PISCINAS" = currentFront === "PISCINAS" ? "CANALETAS" : "PISCINAS"
    const hasLiveSources =
      Array.isArray(fieldReportsForDate) && fieldReportsForDate.length > 0 ||
      Array.isArray(dailyStatusRows) && dailyStatusRows.length > 0 ||
      Boolean(frontDraftForms[counterpartFront])
    if (!hasLiveSources) return null
    const normalizeKeyPart = (value: any) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim() || "-"
    const rowKey = (() => {
      const position = normalizeKeyPart(row?.position || "SIN CARGO")
      if (section === "direct") {
        const discipline = normalizeDirectKeyToken(row?.discipline || row?.specialty || "GENERAL") || "GENERAL"
        const specialty = normalizeSpecialtyLabel(row?.specialty, row?.discipline, row?.position) || "GENERAL"
        return `direct::${buildDirectFrontKey(discipline, specialty, position)}`
      }
      return `indirect::${position}`
    })()
    const parseOverrides = (value: any): Record<string, number[]> => {
      if (!value) return {}
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number[]> : {}
        } catch {
          return {}
        }
      }
      return typeof value === "object" && !Array.isArray(value) ? value as Record<string, number[]> : {}
    }
    const baseValues = getV2DotacionFrenteValues(row, counterpartFront)
    const draftOverrides = parseOverrides((frontDraftForms[counterpartFront] as any)?.v2_front_distribution_overrides)
    const overrideValues = draftOverrides[rowKey]
    const values = Array.from({ length: Math.max(baseValues.length, Array.isArray(overrideValues) ? overrideValues.length : 0, 3) }).map((_, idx) => {
      const raw = Array.isArray(overrideValues) ? overrideValues[idx] : undefined
      const fallback = baseValues[idx]
      const parsed = Number(raw ?? fallback ?? 0)
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
    })
    return {
      currentFront,
      counterpartFront,
      values
    }
  }, [
    viewOpen,
    isViewingHistoryVersion,
    form.work_front,
    fieldReportsForDate,
    dailyStatusRows,
    frontDraftForms,
    getV2DotacionFrenteValues
  ])

  const normalizeV2SummaryNumber = (value: number) => {
    const n = Number(value || 0)
    if (!Number.isFinite(n)) return 0
    return Number(n.toFixed(2))
  }

  const formatV2SummaryNumber = (value: number) => {
    const n = normalizeV2SummaryNumber(value)
    return Number.isInteger(n) ? String(n) : String(n)
  }

  const [detailVisibleTotals, setDetailVisibleTotals] = useState<{
    indirectDot: number
    indirectHh: number
    directDot: number
    directHh: number
    totalDot: number
    totalHh: number
  } | null>(null)
  const [detailVisibleRows, setDetailVisibleRows] = useState<{
    indirect: Array<any>
    direct: Array<any>
    majorEquipment: Array<any>
    minorEquipment: Array<any>
  } | null>(null)

  const handleComputedVisibleTotals = React.useCallback((totals: {
    indirectDot: number
    indirectHh: number
    directDot: number
    directHh: number
    totalDot: number
    totalHh: number
  }) => {
    setDetailVisibleTotals((prev) => {
      if (
        prev &&
        Math.abs(prev.indirectDot - totals.indirectDot) < 0.0001 &&
        Math.abs(prev.indirectHh - totals.indirectHh) < 0.0001 &&
        Math.abs(prev.directDot - totals.directDot) < 0.0001 &&
        Math.abs(prev.directHh - totals.directHh) < 0.0001 &&
        Math.abs(prev.totalDot - totals.totalDot) < 0.0001 &&
        Math.abs(prev.totalHh - totals.totalHh) < 0.0001
      ) return prev
      return totals
    })
  }, [])

  const handleComputedVisibleRows = React.useCallback((rows: {
    indirect: Array<any>
    direct: Array<any>
    majorEquipment: Array<any>
    minorEquipment: Array<any>
  }) => {
    setDetailVisibleRows(rows)
  }, [])

  const v2IndirectDotRounded = useMemo(() => {
    if (detailVisibleTotals) return normalizeV2SummaryNumber(detailVisibleTotals.indirectDot)
    const sum = v2IndirectAttendanceRows.reduce((acc, row: any) => {
      const frontValues = getV2DotacionFrenteValues(row)
      return acc + Number(frontValues?.[0] || 0) + Number(frontValues?.[1] || 0)
    }, 0)
    return normalizeV2SummaryNumber(sum)
  }, [detailVisibleTotals, v2IndirectAttendanceRows, form.work_front, frontRoleDotation, indirectOverrideFrontDotByPosition, operatorFrontDotationByPosition])

  const v2IndirectHhRounded = useMemo(() => {
    if (detailVisibleTotals) return normalizeV2SummaryNumber(detailVisibleTotals.indirectHh)
    const sum = v2IndirectAttendanceRows.reduce((acc, row: any) => {
      const frontValues = getV2DotacionFrenteValues(row)
      const visibleDot = Number(frontValues?.[0] || 0) + Number(frontValues?.[1] || 0)
      return acc + visibleDot * activePersonWorkdayHours
    }, 0)
    return normalizeV2SummaryNumber(sum)
  }, [detailVisibleTotals, v2IndirectAttendanceRows, form.work_front, frontRoleDotation, indirectOverrideFrontDotByPosition, operatorFrontDotationByPosition])
  const hasRecalcSources = useMemo(() => {
    return (
      (Array.isArray(form.source_field_report_ids) && form.source_field_report_ids.length > 0) ||
      (Array.isArray(fieldReportsForDate) && fieldReportsForDate.length > 0) ||
      (Array.isArray(dailyStatusRows) && dailyStatusRows.length > 0)
    )
  }, [form.source_field_report_ids, fieldReportsForDate, dailyStatusRows])
  const liveRecalcReady = useMemo(() => {
    return (
      Array.isArray(fieldReportsForDate) &&
      fieldReportsForDate.length > 0 &&
      Array.isArray(dailyStatusRows) &&
      dailyStatusRows.length > 0 &&
      Array.isArray(collaborators) &&
      collaborators.length > 0
    )
  }, [fieldReportsForDate, dailyStatusRows, collaborators])

  const shouldAutoRecalcV2Form = formOpen && !viewOpen && !isViewingHistoryVersion

  useEffect(() => {
    if (!shouldAutoRecalcV2Form) return
    if (reportTemplate !== "daily_v2") return
    const nextValue = formatV2SummaryNumber(v2IndirectDotRounded)
    setForm((prev) => {
      const shouldBlockInEdit = !!editingId && !liveRecalcReady
      if (shouldBlockInEdit) return prev
      return prev.summary_indirect_dotation === nextValue ? prev : { ...prev, summary_indirect_dotation: nextValue }
    })
  }, [shouldAutoRecalcV2Form, reportTemplate, v2IndirectDotRounded, editingId, liveRecalcReady, hasRecalcSources])

  useEffect(() => {
    if (!shouldAutoRecalcV2Form) return
    if (reportTemplate !== "daily_v2") return
    const nextValue = formatV2SummaryNumber(v2IndirectHhRounded)
    setForm((prev) => {
      const shouldBlockInEdit = !!editingId && !liveRecalcReady
      if (shouldBlockInEdit) return prev
      return prev.summary_indirect_hh === nextValue ? prev : { ...prev, summary_indirect_hh: nextValue }
    })
  }, [shouldAutoRecalcV2Form, reportTemplate, v2IndirectHhRounded, editingId, liveRecalcReady, hasRecalcSources])

  const v2DirectDotRounded = useMemo(
    () => detailVisibleTotals
      ? normalizeV2SummaryNumber(detailVisibleTotals.directDot)
      : normalizeV2SummaryNumber(v2DirectAttendanceRows.reduce((acc, row: any) => {
        const frontValues = getV2DotacionFrenteValues(row)
        return acc + Number(frontValues?.[0] || 0) + Number(frontValues?.[1] || 0)
      }, 0)),
    [detailVisibleTotals, v2DirectAttendanceRows, directFrontDotationByPosition]
  )
  const v2DirectHhRounded = useMemo(
    () => detailVisibleTotals
      ? normalizeV2SummaryNumber(detailVisibleTotals.directHh)
      : normalizeV2SummaryNumber(v2DirectAttendanceRows.reduce((acc, row: any) => {
        const frontValues = getV2DotacionFrenteValues(row)
        const visibleDot = Number(frontValues?.[0] || 0) + Number(frontValues?.[1] || 0)
        return acc + visibleDot * activePersonWorkdayHours
      }, 0)),
    [detailVisibleTotals, v2DirectAttendanceRows, directFrontDotationByPosition]
  )

  useEffect(() => {
    if (!shouldAutoRecalcV2Form) return
    if (reportTemplate !== "daily_v2") return
    const nextValue = formatV2SummaryNumber(v2DirectDotRounded)
    setForm((prev) => {
      const shouldBlockInEdit = !!editingId && !liveRecalcReady
      if (shouldBlockInEdit) return prev
      return prev.summary_direct_dotation === nextValue ? prev : { ...prev, summary_direct_dotation: nextValue }
    })
  }, [shouldAutoRecalcV2Form, reportTemplate, v2DirectDotRounded, editingId, liveRecalcReady, hasRecalcSources])

  useEffect(() => {
    if (!shouldAutoRecalcV2Form) return
    if (reportTemplate !== "daily_v2") return
    const nextValue = formatV2SummaryNumber(v2DirectHhRounded)
    setForm((prev) => {
      const shouldBlockInEdit = !!editingId && !liveRecalcReady
      if (shouldBlockInEdit) return prev
      return prev.summary_direct_hh === nextValue ? prev : { ...prev, summary_direct_hh: nextValue }
    })
  }, [shouldAutoRecalcV2Form, reportTemplate, v2DirectHhRounded, editingId, liveRecalcReady, hasRecalcSources])

  useEffect(() => {
    if (!shouldAutoRecalcV2Form) return
    if (reportTemplate !== "daily_v2") return
    const totalDot = normalizeV2SummaryNumber(Number(v2IndirectDotRounded || 0) + Number(v2DirectDotRounded || 0))
    const totalHh = normalizeV2SummaryNumber(Number(v2IndirectHhRounded || 0) + Number(v2DirectHhRounded || 0))
    setForm((prev) => {
      const nextDot = formatV2SummaryNumber(totalDot)
      const nextHh = formatV2SummaryNumber(totalHh)
      const shouldBlockInEdit = !!editingId && !liveRecalcReady
      if (shouldBlockInEdit) return prev
      if (prev.summary_total_dotation === nextDot && prev.summary_total_hh === nextHh) return prev
      return { ...prev, summary_total_dotation: nextDot, summary_total_hh: nextHh }
    })
  }, [shouldAutoRecalcV2Form, reportTemplate, v2IndirectDotRounded, v2IndirectHhRounded, v2DirectDotRounded, v2DirectHhRounded, editingId, liveRecalcReady, hasRecalcSources])

  const formatSummaryDisplayValue = (value: unknown) => {
    const parsed = Number(String(value ?? "").replace(",", "."))
    if (!Number.isFinite(parsed)) return String(value ?? "0")
    const normalized = Number(parsed.toFixed(2))
    return Number.isInteger(normalized) ? String(normalized) : String(normalized).replace(".", ",")
  }

  const usePersistedSnapshotValuesInView = Boolean(viewOpen || isViewingHistoryVersion)
  const personalSummaryDisplay = reportTemplate === "daily_v2"
    ? usePersistedSnapshotValuesInView
      ? {
          indirectDot: form.summary_indirect_dotation || "0",
          indirectHh: form.summary_indirect_hh || "0",
          directDot: form.summary_direct_dotation || "0",
          directHh: form.summary_direct_hh || "0",
          totalDot: form.summary_total_dotation || "0",
          totalHh: form.summary_total_hh || "0"
        }
      : {
          indirectDot: formatSummaryDisplayValue(v2IndirectDotRounded),
          indirectHh: formatSummaryDisplayValue(v2IndirectHhRounded),
          directDot: formatSummaryDisplayValue(v2DirectDotRounded),
          directHh: formatSummaryDisplayValue(v2DirectHhRounded),
          totalDot: formatSummaryDisplayValue(normalizeV2SummaryNumber(Number(v2IndirectDotRounded || 0) + Number(v2DirectDotRounded || 0))),
          totalHh: formatSummaryDisplayValue(normalizeV2SummaryNumber(Number(v2IndirectHhRounded || 0) + Number(v2DirectHhRounded || 0)))
        }
    : {
        indirectDot: form.summary_indirect_dotation || "0",
        indirectHh: form.summary_indirect_hh || "0",
        directDot: form.summary_direct_dotation || "0",
        directHh: form.summary_direct_hh || "0",
        totalDot: form.summary_total_dotation || "0",
        totalHh: form.summary_total_hh || "0"
      }

  const effectiveV2SummaryMetrics = useMemo(() => {
    const daily = {
      ...v2SummaryMetrics.daily,
      indirectDot: Number(v2IndirectDotRounded || 0),
      indirectHh: Number(v2IndirectHhRounded || 0),
      directDot: Number(v2DirectDotRounded || 0),
      directHh: Number(v2DirectHhRounded || 0),
      totalDot: normalizeV2SummaryNumber(Number(v2IndirectDotRounded || 0) + Number(v2DirectDotRounded || 0)),
      totalHh: normalizeV2SummaryNumber(Number(v2IndirectHhRounded || 0) + Number(v2DirectHhRounded || 0))
    }
    const currentIndirectHh = Number(v2SummaryMetrics.previous.indirectHh || 0) + daily.indirectHh
    const currentDirectHh = Number(v2SummaryMetrics.previous.directHh || 0) + daily.directHh
    const currentTotalHh = Number(v2SummaryMetrics.previous.totalHh || 0) + daily.totalHh
    const current = {
      ...v2SummaryMetrics.current,
      indirectHh: currentIndirectHh,
      directHh: currentDirectHh,
      totalHh: currentTotalHh,
      indirectDot: normalizeV2SummaryNumber(resolvePersonDotationFromHours(currentIndirectHh, form)),
      directDot: normalizeV2SummaryNumber(resolvePersonDotationFromHours(currentDirectHh, form)),
      totalDot: normalizeV2SummaryNumber(resolvePersonDotationFromHours(currentTotalHh, form))
    }
    return { ...v2SummaryMetrics, daily, current }
  }, [
    v2SummaryMetrics,
    v2IndirectDotRounded,
    v2IndirectHhRounded,
    v2DirectDotRounded,
    v2DirectHhRounded
  ])

  const persistedV2SummaryMetricsForView = useMemo(() => {
    const n = (value: unknown) => {
      const parsed = Number(String(value ?? "").trim().replace(",", "."))
      return Number.isFinite(parsed) ? parsed : 0
    }
    const dotFromHh = (dotValue: unknown, hhValue: unknown) => {
      const dot = n(dotValue)
      if (dot > 0) return dot
      const hh = n(hhValue)
      return hh > 0 ? Number(resolvePersonDotationFromHours(hh, form).toFixed(2)) : 0
    }
    const previous = {
      indirectDot: dotFromHh((form as any).s4_prev_indirect_dot, (form as any).s4_prev_indirect_hh),
      indirectHh: n((form as any).s4_prev_indirect_hh),
      directDot: dotFromHh((form as any).s4_prev_direct_dot, (form as any).s4_prev_direct_hh),
      directHh: n((form as any).s4_prev_direct_hh),
      majorQty: n((form as any).s4_prev_major_equip),
      majorHm: n((form as any).s4_prev_major_hm),
      minorQty: n((form as any).s4_prev_minor_equip),
      minorHm: n((form as any).s4_prev_minor_hm)
    }
    const current = {
      indirectDot: dotFromHh((form as any).s4_curr_indirect_dot, (form as any).s4_curr_indirect_hh),
      indirectHh: n((form as any).s4_curr_indirect_hh),
      directDot: dotFromHh((form as any).s4_curr_direct_dot, (form as any).s4_curr_direct_hh),
      directHh: n((form as any).s4_curr_direct_hh),
      majorQty: n((form as any).s4_curr_major_equip),
      majorHm: n((form as any).s4_curr_major_hm),
      minorQty: n((form as any).s4_curr_minor_equip),
      minorHm: n((form as any).s4_curr_minor_hm)
    }
    return { previous, current }
  }, [form])

  const v2SummaryMetricsForViewRender = usePersistedSnapshotValuesInView
    ? persistedV2SummaryMetricsForView
    : effectiveV2SummaryMetrics

  useEffect(() => {
    if (!shouldAutoRecalcV2Form) return
    if (reportTemplate !== "daily_v2") return
    const parseFormNumber = (value: unknown) => Number(String(value ?? "0").replace(",", "."))
    const majorQty = parseFormNumber(form.equip_major_qty)
    const minorQty = parseFormNumber(form.equip_minor_qty)
    const majorHm = parseFormNumber(form.equip_major_hm)
    const minorHm = parseFormNumber(form.equip_minor_hm)
    const totalQty = (Number.isFinite(majorQty) ? majorQty : 0) + (Number.isFinite(minorQty) ? minorQty : 0)
    const totalHm = (Number.isFinite(majorHm) ? majorHm : 0) + (Number.isFinite(minorHm) ? minorHm : 0)
    setForm((prev) => {
      const nextQty = oneDecimalFormValue(totalQty)
      const nextHm = oneDecimalFormValue(totalHm)
      const shouldBlockInEdit = !!editingId
      if (shouldBlockInEdit) return prev
      if (prev.equip_total_qty === nextQty && prev.equip_total_hm === nextHm) return prev
      return { ...prev, equip_total_qty: nextQty, equip_total_hm: nextHm }
    })
  }, [shouldAutoRecalcV2Form, reportTemplate, form.equip_major_qty, form.equip_minor_qty, form.equip_major_hm, form.equip_minor_hm, editingId, hasRecalcSources])

  useEffect(() => {
    if ((!formOpen && !viewOpen) || reportEvidenceItems.length === 0) return
    const missingKeys = reportEvidenceItems
      .map((x) => x.key)
      .filter((key) => !evidenceViewUrls[key])
    if (missingKeys.length === 0) return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(missingKeys.map(async (key) => {
        try {
          const res = await fetch(`/api/field-reports/evidence/view?key=${encodeURIComponent(key)}`)
          const json = await res.json()
          if (!res.ok || !json?.url) return [key, ""]
          return [key, String(json.url)]
        } catch {
          return [key, ""]
        }
      }))
      if (cancelled) return
      setEvidenceViewUrls((prev) => {
        const next = { ...prev }
        entries.forEach(([key, url]) => {
          if (!next[key]) next[key] = String(url || "")
        })
        return next
      })
    })()
    return () => { cancelled = true }
  }, [formOpen, viewOpen, reportEvidenceItems, evidenceViewUrls])

  const directSpecialtySections = useMemo(() => {
    const normalize = (v: string) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    const isSupervisor = (position: string) => {
      const p = normalize(position)
      return p.includes("supervisor") || p.includes("jefe") || p.includes("coordinador")
    }
    const normalizeJsonArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return parsed
          if (parsed && typeof parsed === "object") return Object.values(parsed)
          return []
        } catch {
          return []
        }
      }
      if (value && typeof value === "object") return Object.values(value)
      return []
    }
    const normalizeJsonObject = (value: any): Record<string, any> => {
      if (value && typeof value === "object" && !Array.isArray(value)) return value
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      return {}
    }
    const normalizeIdArray = (value: any): string[] => {
      if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean)
      if (value == null) return []
      if (typeof value === "string") {
        const raw = value.trim()
        if (!raw) return []
        if (raw.includes(",") || raw.includes(";")) {
          return raw.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
        }
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean)
        } catch {}
        return [raw]
      }
      return []
    }
    const splitNames = (value: any) =>
      String(value || "")
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter(Boolean)

    const collaboratorById = new Map<string, CollaboratorLite>(
      (collaborators || [])
        .filter((c: any) => c?.id)
        .map((c: any) => [String(c.id), c])
    )

    const clientId = "ID"
    const bySpecialty = new Map<string, {
      specialty: string
      supervisors: Set<string>
      crews: Map<string, {
        crewKey: string
        crewName: string
        count: number
        activityNames: Set<string>
        itemRefs: Set<string>
        areas: Set<string>
        descriptions: Set<string>
      }>
    }>()
    const directIdsReportedInFieldReports = new Set<string>()

    fieldReportsForDate.forEach((report: any) => {
      const specialty = String(report?.specialty || "").trim() || "Sin especialidad"
      const assignmentsRaw = normalizeJsonArray(report?.assignments)
      const activitiesRaw = assignmentsRaw.length > 0 ? assignmentsRaw : normalizeJsonArray(report?.activities)
      if (activitiesRaw.length === 0) return

      const current = bySpecialty.get(specialty) || {
        specialty,
        supervisors: new Set<string>(),
        crews: new Map<string, {
          crewKey: string
          crewName: string
          count: number
          activityNames: Set<string>
          itemRefs: Set<string>
          areas: Set<string>
          descriptions: Set<string>
        }>()
      }
      splitNames(report?.supervisor).forEach((name) => current.supervisors.add(name))
      normalizeIdArray(report?.supervisor_id).forEach((sid) => {
        const c = collaboratorById.get(sid)
        const fullName = c ? `${String(c.first_name || "").trim()} ${String(c.last_name || "").trim()}`.trim() : ""
        if (fullName) current.supervisors.add(fullName)
      })

      const personnelRaw = normalizeJsonArray(report?.personnel)
      const personHours = normalizeJsonObject(report?.person_hours)
      const personnelIds = normalizeIdArray(report?.personnel_ids)
      const capatazIds = normalizeIdArray(report?.capataz_id)
      const roleByPersonId = new Map<string, string>()
      personnelRaw.forEach((p: any, pidx: number) => {
        const key = String(p?.id || p?.collaborator_id || p?.user_id || p?.personId || pidx)
        roleByPersonId.set(key, normalize(String(p?.role || p?.position || "")))
        const role = normalize(String(p?.role || p?.position || ""))
        if (isSupervisor(role)) {
          const name = String(p?.name || `${p?.first_name || ""} ${p?.last_name || ""}`).trim()
          if (name) current.supervisors.add(name)
        }
      })

      const baseParticipantIds = new Set<string>()
      personnelIds.forEach((id) => baseParticipantIds.add(id))
      capatazIds.forEach((id) => baseParticipantIds.add(id))
      Object.keys(personHours || {}).forEach((id) => {
        const arr = (personHours || {})[id]
        if (Array.isArray(arr) ? arr.some((v: any) => Number(v || 0) > 0) : true) {
          baseParticipantIds.add(String(id))
        }
      })
      personnelRaw.forEach((p: any, pidx: number) => {
        const stableId = String(p?.id || p?.collaborator_id || p?.user_id || p?.personId || "")
        if (stableId) baseParticipantIds.add(stableId)
      })

      const reportCrewKeys = (() => {
        const fromCrewIds = normalizeIdArray(report?.crew_ids)
        const singleCrew = String(report?.crew_id || "").trim()
        const keys = new Set<string>()
        fromCrewIds.forEach((id) => keys.add(id))
        if (singleCrew) keys.add(singleCrew)
        if (keys.size === 0) keys.add(`report:${String(report?.id || Math.random())}`)
        return Array.from(keys)
      })()
      const reportCrewNames = splitNames(report?.crew_name)
      const crewNameByKey = new Map<string, string>()
      reportCrewKeys.forEach((crewKey, crewIdx) => {
        const displayName = reportCrewNames[crewIdx] || reportCrewNames[0] || ""
        if (displayName) crewNameByKey.set(crewKey, displayName)
      })
      activitiesRaw.forEach((asg: any) => {
        const cid = String(asg?.crewId ?? asg?.crew_id ?? "").trim()
        const cname = String(asg?.crewName ?? asg?.crew_name ?? "").trim()
        if (cid && cname && !crewNameByKey.has(cid)) crewNameByKey.set(cid, cname)
      })
      const crewNameToKey = new Map<string, string>()
      Array.from(crewNameByKey.entries()).forEach(([k, n]) => {
        const norm = normalize(n)
        if (norm && !crewNameToKey.has(norm)) crewNameToKey.set(norm, k)
      })

      const reportParticipantIds = new Set<string>()
      baseParticipantIds.forEach((pid) => {
        const coll = collaboratorById.get(pid)
        const pos = normalize(String(coll?.position || roleByPersonId.get(pid) || ""))
        if (isSupervisor(pos)) return
        reportParticipantIds.add(pid)
        directIdsReportedInFieldReports.add(pid)
      })
      const personnelById = new Map<string, any>()
      personnelRaw.forEach((p: any, pidx: number) => {
        const key = String(p?.id || p?.collaborator_id || p?.user_id || p?.personId || pidx)
        if (key && !personnelById.has(key)) personnelById.set(key, p)
      })
      const countByCrewKey = new Map<string, number>()
      const resolveCrewKeyForPerson = (pid: string): string | null => {
        const coll = collaboratorById.get(pid) as any
        const collCrewId = String(coll?.current_crew_id || "").trim()
        if (collCrewId && reportCrewKeys.includes(collCrewId)) return collCrewId

        const p = personnelById.get(pid)
        const pCrewId = String(p?.crew_id || p?.crewId || "").trim()
        if (pCrewId && reportCrewKeys.includes(pCrewId)) return pCrewId
        const pCrewName = String(p?.crewName || p?.crew_name || "").trim()
        if (pCrewName) {
          const byName = crewNameToKey.get(normalize(pCrewName))
          if (byName && reportCrewKeys.includes(byName)) return byName
        }
        if (reportCrewKeys.length === 1) return reportCrewKeys[0]
        return null
      }
      reportParticipantIds.forEach((pid) => {
        const crewKey = resolveCrewKeyForPerson(pid)
        if (!crewKey) return
        countByCrewKey.set(crewKey, (countByCrewKey.get(crewKey) || 0) + 1)
      })

      reportCrewKeys.forEach((crewKey, crewIdx) => {
        const displayName = crewNameByKey.get(crewKey) || reportCrewNames[crewIdx] || reportCrewNames[0] || `Cuadrilla ${crewIdx + 1}`
        const prev = current.crews.get(crewKey)
        if (!prev) {
          current.crews.set(crewKey, {
            crewKey,
            crewName: displayName,
            count: countByCrewKey.get(crewKey) || 0,
            activityNames: new Set<string>(),
            itemRefs: new Set<string>(),
            areas: new Set<string>(),
            descriptions: new Set<string>()
          })
        } else {
          prev.count = Math.max(prev.count, countByCrewKey.get(crewKey) || 0)
          if (displayName && (!prev.crewName || prev.crewName.startsWith("Cuadrilla "))) prev.crewName = displayName
        }
      })

      activitiesRaw.forEach((asg: any, idx: number) => {
        const activityName =
          String(
            asg?.activity ||
            asg?.description ||
            asg?.item_id ||
            asg?.itemId ||
            asg?.name ||
            ""
          ).trim()
        if (!activityName) return
        const itemId = String(asg?.item_id ?? asg?.itemId ?? "").trim()
        const subId = String(asg?.sub_id ?? asg?.subId ?? "").trim()
        const areaName = String(asg?.area ?? report?.area ?? "").trim()
        const reportDescriptionText =
          typeof report?.description === "string"
            ? String(report.description).trim()
            : ""
        const descriptionText =
          String(
            asg?.description ||
            reportDescriptionText ||
            ""
          ).trim() || "-"
        const asgCrewId = String(asg?.crewId ?? asg?.crew_id ?? "").trim()
        const asgCrewName = String(asg?.crewName ?? asg?.crew_name ?? "").trim()
        const targetCrewKeys = (() => {
          const out = new Set<string>()
          if (asgCrewId && reportCrewKeys.includes(asgCrewId)) out.add(asgCrewId)
          if (asgCrewName) {
            const byName = crewNameToKey.get(normalize(asgCrewName))
            if (byName && reportCrewKeys.includes(byName)) out.add(byName)
          }
          if (out.size === 0 && reportCrewKeys.length === 1) out.add(reportCrewKeys[0])
          return Array.from(out)
        })()
        targetCrewKeys.forEach((crewKey) => {
          const displayName = crewNameByKey.get(crewKey) || asgCrewName || "Cuadrilla"
          const line = current.crews.get(crewKey) || {
            crewKey,
            crewName: displayName,
            count: countByCrewKey.get(crewKey) || 0,
            activityNames: new Set<string>(),
            itemRefs: new Set<string>(),
            areas: new Set<string>(),
            descriptions: new Set<string>()
          }
          line.count = Math.max(line.count, countByCrewKey.get(crewKey) || 0)
          if (displayName && (!line.crewName || line.crewName.startsWith("Cuadrilla "))) line.crewName = displayName
          if (activityName) line.activityNames.add(activityName)
          if (itemId || subId) line.itemRefs.add(`${itemId}__${subId}`)
          if (areaName) line.areas.add(areaName)
          if (descriptionText && descriptionText !== "-") line.descriptions.add(descriptionText)
          current.crews.set(crewKey, line)
        })
      })

      bySpecialty.set(specialty, current)
    })

    // Hacer visibles en el desglose los directos en turno sin presencia
    // en reportes de terreno: quedan bajo línea "Sin cuadrilla".
    dailyStatusRows.forEach((daily: any) => {
      const collab = ((daily as any)?.collaborator || {}) as CollaboratorLite
      const collabId = String((collab as any)?.id || (daily as any)?.collaborator_id || "").trim()
      if (!collabId || directIdsReportedInFieldReports.has(collabId)) return
      const base = collaboratorById.get(collabId) || null
      const workerType = normalizeWorkerType(String(collab.worker_type || base?.worker_type || ""))
      const posText = String(collab.position || base?.position || "").toUpperCase()
      const isCapataz = posText.includes("CAPATAZ")
      if (workerType !== "directo" && !isCapataz) return
      const normalizedStatus = normalizeAttendanceStatus(daily?.status, daily?.reason)
      const reasonCode = String(daily?.reason || "").trim().toUpperCase()
      const statusCode = attendanceCodeFromStatus(normalizedStatus) || String(daily?.status || "").trim().toUpperCase()
      const isTurno = normalizedStatus === "Turno" || reasonCode === "11" || reasonCode === "10" || statusCode === "11" || statusCode === "10"
      if (!isTurno) return

      const specialty = String(collab.specialty || base?.specialty || "Personal directo").trim() || "Personal directo"
      const current = bySpecialty.get(specialty) || {
        specialty,
        supervisors: new Set<string>(),
        crews: new Map<string, {
          crewKey: string
          crewName: string
          count: number
          activityNames: Set<string>
          itemRefs: Set<string>
          areas: Set<string>
          descriptions: Set<string>
        }>()
      }
      const crewKey = "__SIN_CUADRILLA__"
      const line = current.crews.get(crewKey) || {
        crewKey,
        crewName: "Sin cuadrilla",
        count: 0,
        activityNames: new Set<string>(),
        itemRefs: new Set<string>(),
        areas: new Set<string>(),
        descriptions: new Set<string>()
      }
      line.count += 1
      line.activityNames.add("Sin actividad reportada")
      line.descriptions.add("Directo en turno sin reporte de terreno")
      current.crews.set(crewKey, line)
      bySpecialty.set(specialty, current)
    })

    return Array.from(bySpecialty.values())
      .filter((x) => x.crews.size > 0)
      .sort((a, b) => a.specialty.localeCompare(b.specialty, "es", { sensitivity: "base" }))
      .map((x) => {
        const crewLines = Array.from(x.crews.values())
          .sort((a, b) => a.crewName.localeCompare(b.crewName, "es", { sensitivity: "base" }))
          .map((line) => ({
            crewKey: line.crewKey,
            crewName: line.crewName || "Cuadrilla",
            count: line.count,
            activityNames: Array.from(line.activityNames).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
            itemRefs: Array.from(line.itemRefs)
              .map((raw) => {
                const [itemId = "", subId = ""] = raw.split("__")
                return { itemId, subId }
              })
              .sort((a, b) => `${a.itemId}-${a.subId}`.localeCompare(`${b.itemId}-${b.subId}`, "es", { sensitivity: "base" })),
            areas: Array.from(line.areas).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
            descriptions: Array.from(line.descriptions).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
          }))
        return {
          specialty: x.specialty,
          clientId,
          supervisorsText: Array.from(x.supervisors).join(", ") || "-",
          activitiesSubtotal: crewLines.reduce((acc, n) => acc + n.count, 0),
          crewLines
        }
      })
  }, [fieldReportsForDate, form.client_name, collaborators, dailyStatusRows])

  const handleChange = (key: keyof DailyForm, value: any) => {
    setForm((prev) => {
      if (key === "report_date") {
        return { ...prev, [key]: value, equipment_snapshot_date: "" }
      }
      return { ...prev, [key]: value }
    })
  }
  const mergeOverrideMap = (current: any, patch: any) => {
    const parse = (value: any): Record<string, number[]> => {
      if (!value) return {}
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number[]> : {}
        } catch {
          return {}
        }
      }
      return typeof value === "object" && !Array.isArray(value) ? value as Record<string, number[]> : {}
    }
    return { ...parse(current), ...parse(patch) }
  }
  const syncOppositeFrontOverrides = (
    targetFront: "CANALETAS" | "PISCINAS",
    patch: Pick<Partial<DailyForm>, "v2_front_distribution_overrides" | "v2_equipment_front_distribution_overrides">
  ) => {
    setFrontDraftForms((prev) => {
      const targetDraft = prev[targetFront] || ({
        ...form,
        work_front: targetFront,
        report_format_code: toFrontFormat(targetFront)
      } as DailyForm)
      return {
        ...prev,
        [targetFront]: {
          ...targetDraft,
          ...(patch.v2_front_distribution_overrides
            ? {
                v2_front_distribution_overrides: mergeOverrideMap(
                  (targetDraft as any).v2_front_distribution_overrides,
                  patch.v2_front_distribution_overrides
                )
              }
            : {}),
          ...(patch.v2_equipment_front_distribution_overrides
            ? {
                v2_equipment_front_distribution_overrides: mergeOverrideMap(
                  (targetDraft as any).v2_equipment_front_distribution_overrides,
                  patch.v2_equipment_front_distribution_overrides
                )
              }
            : {})
        }
      }
    })
    setFrontSavedStatus((prev) => ({ ...prev, [targetFront]: false }))
  }

  const openNew = async () => {
    if (!canMutateDailyReport) return
    const initialDate = availableReportDatesForCreate[0] || ""
    if (!initialDate) {
      showToast("No hay fechas disponibles desde Reportes de Terreno para crear un reporte diario.", "error")
      return
    }
    editHydrationLockRef.current = false
    const date = initialDate
    setHistoryViewMeta(null)
    setEditingId(null)
    setEditSourceMode("field_reports")
    setReportTemplate("daily_v2")
    const base = emptyForm(date)
    setForm(base)
    setIndirectHoursOverrides({})
    setIndirectHoursOverridesDraft({})
    setIndirectHoursFrontApplyScope("EXISTING_FRONTS")
    setIndirectHoursFrontOverrides({})
    setIndirectHoursFrontOverridesDraft({})
    setSavedIndirectHoursSettingsKey(stableIndirectHoursSettingsKey({}, "EXISTING_FRONTS", {}))
    setFrontSavedStatus({ CANALETAS: false, PISCINAS: false })
    setFrontRecordIds({ CANALETAS: null, PISCINAS: null })
    setEditSessionSavedFronts({ CANALETAS: false, PISCINAS: false })
    setEditSessionOriginalByFront({ CANALETAS: null, PISCINAS: null })
    setFrontDraftForms({ CANALETAS: base, PISCINAS: null })
    setFrontBaselineHashes({ CANALETAS: formHash(base), PISCINAS: null })
    setDailyActivityEvidenceByLineKey({})
    setFormOpen(true)
    lastBootstrappedDateRef.current = date
    await Promise.all([bootstrapForDate(date), loadCollaborators(true)])
  }

  useEffect(() => {
    // When creating a new report, changing the report date must refresh
    // the preloaded defaults/existencias tied to that date.
    if (!formOpen) return
    if (editHydrationLockRef.current) return
    if (editingId) return
    const date = String(form.report_date || "").trim()
    if (!date) return
    if (lastBootstrappedDateRef.current === date) return
    lastBootstrappedDateRef.current = date
    void bootstrapForDate(date)
  }, [formOpen, editingId, form.report_date])

  const hydrateVisibleFormFromRecord = (record: DailyReportRecord): DailyForm => {
    const normalized = normalizeRecordToForm(record)
    const toNum = (value: unknown) => {
      if (value == null || String(value).trim() === "") return 0
      const parsed = Number(String(value).replace(",", "."))
      return Number.isFinite(parsed) ? parsed : 0
    }
    const persistedIndirectRows = getPersistedV2RowsFromForm(normalized, "v2_detail_indirect_rows")
    const persistedDirectRows = getPersistedV2RowsFromForm(normalized, "v2_detail_direct_rows")
    const persistedMajorRows = getPersistedRowsGenericFromForm(normalized, "v2_detail_major_equipment_rows")
    const persistedMinorRows = getPersistedRowsGenericFromForm(normalized, "v2_detail_minor_equipment_rows")
    const visibleDotFromPersistedRow = (row: any) => {
      const splitDot = toNum((row as any)?.instalacionFaena) + toNum((row as any)?.frente)
      if (splitDot > 0) return splitDot
      return toNum((row as any)?.dotacionTotalObra)
    }
    const indirectDotFromRows = persistedIndirectRows.reduce((acc, row) => acc + visibleDotFromPersistedRow(row), 0)
    const directDotFromRows = persistedDirectRows.reduce((acc, row) => acc + visibleDotFromPersistedRow(row), 0)
    const recordPersonWorkdayHours = resolvePersonWorkdayHours(record)
    const indirectHhFromRows = indirectDotFromRows * recordPersonWorkdayHours
    const directHhFromRows = directDotFromRows * recordPersonWorkdayHours
    const equipmentQtyFromRow = (row: any) => {
      const directTotal = toNum((row as any)?.totalEqMaq ?? (row as any)?.totalEqObra)
      if (directTotal > 0) return directTotal
      return toNum((row as any)?.instalacionFaena ?? (row as any)?.front1) +
        toNum((row as any)?.mainFront ?? (row as any)?.front2) +
        toNum((row as any)?.nocFront)
    }
    const majorQtyFromRows = persistedMajorRows.reduce((acc, row) => acc + equipmentQtyFromRow(row), 0)
    const minorQtyFromRows = persistedMinorRows.reduce((acc, row) => acc + equipmentQtyFromRow(row), 0)
    const majorHmFromRows = persistedMajorRows.reduce((acc, row) => acc + toNum((row as any)?.hmTotal), 0)
    const minorHmFromRows = persistedMinorRows.reduce((acc, row) => acc + toNum((row as any)?.hmTotal), 0)
    const preferDetailDailyValue = (persisted: string, detail: number) => {
      const persistedNum = toNum(persisted)
      if (detail <= 0) return persisted
      return Math.abs(persistedNum - detail) > 0.01 ? String(detail) : persisted
    }
    return {
      ...normalized,
      summary_indirect_dotation: preferDetailDailyValue(normalized.summary_indirect_dotation, indirectDotFromRows),
      summary_direct_dotation: preferDetailDailyValue(normalized.summary_direct_dotation, directDotFromRows),
      summary_indirect_hh: preferDetailDailyValue(normalized.summary_indirect_hh, indirectHhFromRows),
      summary_direct_hh: preferDetailDailyValue(normalized.summary_direct_hh, directHhFromRows),
      summary_total_dotation: preferDetailDailyValue(normalized.summary_total_dotation, indirectDotFromRows + directDotFromRows),
      summary_total_hh: preferDetailDailyValue(normalized.summary_total_hh, indirectHhFromRows + directHhFromRows),
      equip_major_qty: preferDetailDailyValue(normalized.equip_major_qty, majorQtyFromRows),
      equip_minor_qty: preferDetailDailyValue(normalized.equip_minor_qty, minorQtyFromRows),
      equip_major_hm: preferDetailDailyValue(normalized.equip_major_hm, majorHmFromRows),
      equip_minor_hm: preferDetailDailyValue(normalized.equip_minor_hm, minorHmFromRows),
      equip_total_qty: preferDetailDailyValue(normalized.equip_total_qty, majorQtyFromRows + minorQtyFromRows),
      equip_total_hm: preferDetailDailyValue(normalized.equip_total_hm, majorHmFromRows + minorHmFromRows)
    }
  }

  const hydrateStrictViewFormFromRecord = (record: DailyReportRecord): DailyForm => {
    const normalized = normalizeRecordToForm(record)
    const notesObj =
      record?.notes && typeof record.notes === "object"
        ? (record.notes as Record<string, any>)
        : {}
    const formSnapshot =
      record?.v2_form_snapshot && typeof record.v2_form_snapshot === "object"
        ? (record.v2_form_snapshot as Record<string, any>)
        : {}
    const runtimeSnapshot =
      record?.v2_runtime_snapshot && typeof record.v2_runtime_snapshot === "object"
        ? (record.v2_runtime_snapshot as Record<string, any>)
        : {}
    const parseArrayLike = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (value && typeof value === "object") return Object.values(value)
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return parsed
          if (parsed && typeof parsed === "object") return Object.values(parsed)
        } catch {}
      }
      return []
    }
    const pickScalar = (key: string, fallback: string) => {
      const raw = (runtimeSnapshot as any)?.[key] ?? (formSnapshot as any)?.[key] ?? (notesObj as any)?.[key]
      if (raw == null || String(raw).trim() === "") return fallback
      return String(raw)
    }
    const pickDetailRows = (key: "v2_detail_indirect_rows" | "v2_detail_direct_rows" | "v2_detail_major_equipment_rows" | "v2_detail_minor_equipment_rows") => {
      const fromRuntime = parseArrayLike((runtimeSnapshot as any)?.[key])
      const fromForm = parseArrayLike((formSnapshot as any)?.[key])
      const fromNotes = parseArrayLike((notesObj as any)?.[key])
      const rows = fromRuntime.length > 0 ? fromRuntime : (fromForm.length > 0 ? fromForm : fromNotes)
      if (key === "v2_detail_indirect_rows" || key === "v2_detail_direct_rows") return hydratePersistedV2Rows(rows)
      return rows
    }
    const v2DetailIndirectRows = pickDetailRows("v2_detail_indirect_rows")
    const v2DetailDirectRows = pickDetailRows("v2_detail_direct_rows")
    const v2DetailMajorEquipmentRows = pickDetailRows("v2_detail_major_equipment_rows")
    const v2DetailMinorEquipmentRows = pickDetailRows("v2_detail_minor_equipment_rows")
    return {
      ...normalized,
      summary_indirect_dotation: pickScalar("summary_indirect_dotation", normalized.summary_indirect_dotation || "0"),
      summary_indirect_hh: pickScalar("summary_indirect_hh", normalized.summary_indirect_hh || "0"),
      summary_direct_dotation: pickScalar("summary_direct_dotation", normalized.summary_direct_dotation || "0"),
      summary_direct_hh: pickScalar("summary_direct_hh", normalized.summary_direct_hh || "0"),
      summary_total_dotation: pickScalar("summary_total_dotation", normalized.summary_total_dotation || "0"),
      summary_total_hh: pickScalar("summary_total_hh", normalized.summary_total_hh || "0"),
      equip_major_qty: pickScalar("equip_major_qty", normalized.equip_major_qty || "0"),
      equip_major_hm: pickScalar("equip_major_hm", normalized.equip_major_hm || "0"),
      equip_minor_qty: pickScalar("equip_minor_qty", normalized.equip_minor_qty || "0"),
      equip_minor_hm: pickScalar("equip_minor_hm", normalized.equip_minor_hm || "0"),
      equip_total_qty: pickScalar("equip_total_qty", normalized.equip_total_qty || "0"),
      equip_total_hm: pickScalar("equip_total_hm", normalized.equip_total_hm || "0"),
      v2_has_noc_front_column: pickScalar("v2_has_noc_front_column", String((normalized as any).v2_has_noc_front_column ?? "")),
      v2_noc_front_column_label: pickScalar("v2_noc_front_column_label", String((normalized as any).v2_noc_front_column_label ?? "")),
      v2_detail_indirect_rows: v2DetailIndirectRows,
      v2_detail_direct_rows: v2DetailDirectRows,
      v2_detail_major_equipment_rows: v2DetailMajorEquipmentRows,
      v2_detail_minor_equipment_rows: v2DetailMinorEquipmentRows
    }
  }

  const openEdit = async (recordSummary: DailyReportRecord, sourceMode: EditSourceMode = "snapshot") => {
    if (!canMutateDailyReport) return
    editHydrationLockRef.current = true
    setHistoryViewMeta(null)
    setDetailVisibleTotals(null)
    setDetailVisibleRows(null)
    setActiveActionRecordId(String(recordSummary.id || ""))
    try {
    await loadCollaborators(true)
    const record = await fetchDailyReportDetail(String(recordSummary.id || ""))
    const inferredTemplate = inferTemplateFromRecord(record)
    setReportTemplate(inferredTemplate)
    setEditingId(record.id)
    setEditSourceMode(sourceMode)
    let liveSourceIdsForEdit: string[] = []
    if (sourceMode === "field_reports") {
      const day = String(record.report_date || "").slice(0, 10)
      if (day) {
        const res = await fetch(`/api/field-reports?date=${encodeURIComponent(day)}&summary=1&include_calc=1&limit=50`, { cache: "no-store" })
        const json = await res.json().catch(() => [])
        if (!res.ok) throw new Error(String((json as any)?.error || "No se pudieron cargar los reportes de terreno."))
        const rows = Array.isArray(json) ? json : []
        fieldReportsByDateCacheRef.current[day] = rows
        setFieldReportsForDate(rows)
        liveSourceIdsForEdit = sourceFieldReportIdsFromRows(rows)
      }
    }
    const normalized = normalizeRecordToForm(record)
    const toNum = (value: unknown) => {
      if (value == null || String(value).trim() === "") return 0
      const parsed = Number(String(value).replace(",", "."))
      return Number.isFinite(parsed) ? parsed : 0
    }
    const persistedIndirectRows = getPersistedV2RowsFromForm(normalized, "v2_detail_indirect_rows")
    const persistedDirectRows = getPersistedV2RowsFromForm(normalized, "v2_detail_direct_rows")
    const persistedMajorRows = getPersistedRowsGenericFromForm(normalized, "v2_detail_major_equipment_rows")
    const persistedMinorRows = getPersistedRowsGenericFromForm(normalized, "v2_detail_minor_equipment_rows")
    const visibleDotFromPersistedRow = (row: any) => {
      const splitDot = toNum((row as any)?.instalacionFaena) + toNum((row as any)?.frente)
      if (splitDot > 0) return splitDot
      return toNum((row as any)?.dotacionTotalObra)
    }
    const indirectDotFromRows = persistedIndirectRows.reduce((acc, row) => acc + visibleDotFromPersistedRow(row), 0)
    const directDotFromRows = persistedDirectRows.reduce((acc, row) => acc + visibleDotFromPersistedRow(row), 0)
    const recordPersonWorkdayHours = resolvePersonWorkdayHours(record)
    const indirectHhFromRows = indirectDotFromRows * recordPersonWorkdayHours
    const directHhFromRows = directDotFromRows * recordPersonWorkdayHours
    const majorQtyFromRows = persistedMajorRows.reduce((acc, row) => acc + toNum((row as any)?.totalEqMaq), 0)
    const minorQtyFromRows = persistedMinorRows.reduce((acc, row) => acc + toNum((row as any)?.totalEqMaq), 0)
    const majorHmFromRows = persistedMajorRows.reduce((acc, row) => acc + toNum((row as any)?.hmTotal), 0)
    const minorHmFromRows = persistedMinorRows.reduce((acc, row) => acc + toNum((row as any)?.hmTotal), 0)
    const preferDetailDailyValue = (persisted: string, detail: number) => {
      const persistedNum = toNum(persisted)
      if (detail <= 0) return persisted
      return Math.abs(persistedNum - detail) > 0.01 ? String(detail) : persisted
    }
    const normalizedSafeBase: DailyForm = hydrateVisibleFormFromRecord(record)
    const applyEditSourceModeToDraft = (draft: DailyForm): DailyForm =>
      sourceMode === "field_reports"
        ? {
            ...draft,
            source_field_report_ids: liveSourceIdsForEdit.length > 0 ? liveSourceIdsForEdit : draft.source_field_report_ids,
            v2_front_distribution_overrides: {},
            v2_equipment_front_distribution_overrides: {}
          }
        : draft
    const normalizedSafe: DailyForm = applyEditSourceModeToDraft(normalizedSafeBase)
    if (false) console.log("[daily-report][edit-open-source]", {
      recordId: record.id,
      inferredTemplate,
      hasNotes: !!(record as any)?.notes,
      hasFormSnapshot: !!(record as any)?.v2_form_snapshot,
      hasRuntimeSnapshot: !!(record as any)?.v2_runtime_snapshot,
      sourceFieldReportIds: Array.isArray(record?.source_field_report_ids) ? (record?.source_field_report_ids?.length || 0) : 0
    })
    const currentFront = frontFromForm(normalized)
    const oppositeFront: "CANALETAS" | "PISCINAS" = currentFront === "CANALETAS" ? "PISCINAS" : "CANALETAS"
    const oppositeRecord = records.find((r) => {
      if (String(r.report_date || "") !== String(record.report_date || "")) return false
      if (Number(r.report_no || 0) !== Number(record.report_no || 0)) return false
      return detectRecordFrontStrict(r) === oppositeFront
    })
    const oppositeDetail = oppositeRecord?.id ? await fetchDailyReportDetail(String(oppositeRecord.id)) : null
    setFrontSavedStatus({
      [currentFront]: true,
      [oppositeFront]: !!oppositeRecord
    } as Record<"CANALETAS" | "PISCINAS", boolean>)
    setFrontRecordIds({
      [currentFront]: record.id,
      [oppositeFront]: oppositeRecord?.id || null
    } as Record<"CANALETAS" | "PISCINAS", string | null>)
    setEditSessionSavedFronts({ CANALETAS: false, PISCINAS: false })
    setEditSessionOriginalByFront({
      [currentFront]: record,
      [oppositeFront]: (oppositeDetail as DailyReportRecord | null) || null
    } as Record<"CANALETAS" | "PISCINAS", DailyReportRecord | null>)
    setFrontDraftForms({
      [currentFront]: normalizedSafe,
      [oppositeFront]: oppositeDetail ? applyEditSourceModeToDraft(normalizeRecordToForm(oppositeDetail)) : null
    } as Record<"CANALETAS" | "PISCINAS", DailyForm | null>)
    setFrontBaselineHashes({
      [currentFront]: formHash(normalizedSafe),
      [oppositeFront]: oppositeDetail ? formHash(normalizeRecordToForm(oppositeDetail)) : null
    } as Record<"CANALETAS" | "PISCINAS", string | null>)
    if (false) console.log("[daily-report][hydrate-existing-report]", {
      mode: "edit",
      recordId: record.id,
      recordFront: detectRecordFrontStrict(record) || getRecordFront(record),
      hydratedFront: normalized.work_front,
      reportNo: normalized.report_no,
      sourceFieldReportIds: normalized.source_field_report_ids || [],
      hh: {
        day: normalized.hh_day,
        productive: normalized.hh_productive
      },
      summary: {
        indirectDot: normalized.summary_indirect_dotation,
        indirectHh: normalized.summary_indirect_hh,
        directDot: normalized.summary_direct_dotation,
        directHh: normalized.summary_direct_hh,
        totalDot: normalized.summary_total_dotation,
        totalHh: normalized.summary_total_hh
      },
      equip: {
        majorQty: normalized.equip_major_qty,
        majorHm: normalized.equip_major_hm,
        minorQty: normalized.equip_minor_qty,
        minorHm: normalized.equip_minor_hm,
        totalQty: normalized.equip_total_qty,
        totalHm: normalized.equip_total_hm
      }
    })
    if (false) console.log("[daily-report][edit-visible-hydration]", {
      recordId: record.id,
      persistedRows: {
        indirect: persistedIndirectRows.length,
        direct: persistedDirectRows.length,
        major: persistedMajorRows.length,
        minor: persistedMinorRows.length
      },
      hydratedSummary: {
        indirectDot: normalizedSafe.summary_indirect_dotation,
        directDot: normalizedSafe.summary_direct_dotation,
        totalDot: normalizedSafe.summary_total_dotation,
        indirectHh: normalizedSafe.summary_indirect_hh,
        directHh: normalizedSafe.summary_direct_hh,
        totalHh: normalizedSafe.summary_total_hh
      },
      hydratedEquip: {
        majorQty: normalizedSafe.equip_major_qty,
        minorQty: normalizedSafe.equip_minor_qty,
        totalQty: normalizedSafe.equip_total_qty,
        majorHm: normalizedSafe.equip_major_hm,
        minorHm: normalizedSafe.equip_minor_hm,
        totalHm: normalizedSafe.equip_total_hm
      }
    })
    setForm(normalizedSafe)
    const indirectSettings = getSavedIndirectHoursSettings(record)
    setIndirectHoursOverrides(indirectSettings.overrides)
    setIndirectHoursOverridesDraft(indirectSettings.overrides)
    setIndirectHoursFrontOverrides(indirectSettings.frontOverrides)
    setIndirectHoursFrontOverridesDraft(indirectSettings.frontOverrides)
    setIndirectHoursFrontApplyScope(indirectSettings.frontApplyScope)
    setSavedIndirectHoursSettingsKey(stableIndirectHoursSettingsKey(indirectSettings.overrides, indirectSettings.frontApplyScope, indirectSettings.frontOverrides))
    const notes = (record as any)?.notes && typeof (record as any).notes === "object" ? (record as any).notes : {}
    const evidenceByLine = (notes?.daily_activity_images && typeof notes.daily_activity_images === "object")
      ? notes.daily_activity_images
      : {}
    setDailyActivityEvidenceByLineKey(evidenceByLine as Record<string, EvidenceFileLite[]>)
    setFormOpen(true)
    editHydrationLockRef.current = false
    } catch (err: any) {
      editHydrationLockRef.current = false
      showToast(err?.message || "No se pudo abrir el reporte", "error")
    } finally {
      setActiveActionRecordId(null)
    }
  }

  const sourceFieldReportIdsFromRows = (rows: any[]) =>
    Array.from(new Set(
      (rows || [])
        .map((report: any) => String(report?.id || "").trim())
        .filter(Boolean)
    ))

  const getRecordFront = (record?: DailyReportRecord | null): "CANALETAS" | "PISCINAS" => {
    if (!record) return "CANALETAS"
    const notes = (record as any)?.notes && typeof (record as any)?.notes === "object" ? (record as any).notes : {}
    const topFront = String((record as any)?.work_front || "").toUpperCase()
    if (topFront === "PISCINAS") return "PISCINAS"
    if (topFront === "CANALETAS") return "CANALETAS"
    const noteFront = String(notes?.work_front || "").toUpperCase()
    if (noteFront === "PISCINAS") return "PISCINAS"
    const noteFormat = String(notes?.report_format_code || "").toUpperCase()
    if (noteFormat.includes("PISCINAS")) return "PISCINAS"
    const normalized = normalizeRecordToForm(record)
    return normalized.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
  }

  const detectRecordFrontStrict = (record?: DailyReportRecord | null): "CANALETAS" | "PISCINAS" | null => {
    if (!record) return null
    const recAny = record as any
    const notes = recAny?.notes && typeof recAny.notes === "object" ? recAny.notes : {}
    const runtime = recAny?.v2_runtime_snapshot && typeof recAny.v2_runtime_snapshot === "object" ? recAny.v2_runtime_snapshot : {}
    const formSnap = recAny?.v2_form_snapshot && typeof recAny.v2_form_snapshot === "object" ? recAny.v2_form_snapshot : {}
    const candidates = [
      String(recAny?.work_front || ""),
      String(recAny?.report_format_code || ""),
      String(notes?.work_front || ""),
      String(runtime?.work_front || ""),
      String(formSnap?.work_front || ""),
      String(notes?.report_format_code || ""),
      String(runtime?.report_format_code || ""),
      String(formSnap?.report_format_code || "")
    ].map((v) => v.toUpperCase())
    if (candidates.some((v) => v === "PISCINAS" || v.includes("PISCINAS"))) return "PISCINAS"
    if (candidates.some((v) => v === "CANALETAS" || v.includes("CANALETAS"))) return "CANALETAS"
    return null
  }

  const deleteActionRecordIdByDate = useMemo(() => {
    const byDate = new Map<string, string>()
    records.forEach((record) => {
      const dateKey = String(record?.report_date || "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || byDate.has(dateKey)) return
      byDate.set(dateKey, String(record?.id || ""))
    })
    return byDate
  }, [records])

  const reportCountByDate = useMemo(() => {
    const counts = new Map<string, number>()
    records.forEach((record) => {
      const dateKey = String(record?.report_date || "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1)
    })
    return counts
  }, [records])

  const normalizeIdentityText = (value: unknown) => String(value || "").trim().toLowerCase()
  const identityFieldMatches = (left: unknown, right: unknown) => {
    const l = normalizeIdentityText(left)
    const r = normalizeIdentityText(right)
    if (!l || !r) return true
    return l === r
  }
  const matchesLogicalIdentity = (record: DailyReportRecord | undefined | null, identity: {
    report_date: string
    report_no: number
    project_name?: string
    contract_number?: string
    contract_title?: string
    contractor_name?: string
    client_name?: string
    company_id?: string
  }) => {
    if (!record) return false
    const sameDate = String(record.report_date || "") === String(identity.report_date || "")
    const sameNo = Number(record.report_no || 0) === Number(identity.report_no || 0)
    if (!sameDate || !sameNo) return false
    const recCompanyId = normalizeIdentityText((record as any)?.company_id || (record as any)?.notes?.company_id)
    const targetCompanyId = normalizeIdentityText(identity.company_id)
    if (targetCompanyId && recCompanyId) return recCompanyId === targetCompanyId

    return (
      identityFieldMatches(record.project_name, identity.project_name) &&
      identityFieldMatches(record.contract_number, identity.contract_number) &&
      identityFieldMatches(record.contract_title, identity.contract_title) &&
      identityFieldMatches(record.contractor_name, identity.contractor_name) &&
      identityFieldMatches(record.client_name, identity.client_name)
    )
  }

  const hydrateFrontInSession = async (targetFront: "CANALETAS" | "PISCINAS") => {
    const current = form
    const currentFront = frontFromForm(current)
    const oppositeFront: "CANALETAS" | "PISCINAS" = targetFront === "CANALETAS" ? "PISCINAS" : "CANALETAS"
    const liveSourceIdsForSession = sourceFieldReportIdsFromRows(fieldReportsForDate || [])
    const normalizeDraftForCurrentEditMode = (draft: DailyForm): DailyForm =>
      isEditReformulateMode
        ? {
            ...draft,
            source_field_report_ids: liveSourceIdsForSession.length > 0 ? liveSourceIdsForSession : draft.source_field_report_ids,
            v2_front_distribution_overrides: {},
            v2_equipment_front_distribution_overrides: {}
          }
        : draft
    const currentDirty = isFrontDirty(currentFront)
    if (currentDirty) {
      const ok = window.confirm(`Hay cambios sin guardar en ${currentFront}. ¿Deseas cambiar de frente igualmente?`)
      if (!ok) return
    }
    setFrontDraftForms((prev) => ({ ...prev, [currentFront]: normalizeDraftForCurrentEditMode(current) }))
    const draftTarget = frontDraftForms[targetFront]
    if (draftTarget) {
      const nextDraft = normalizeDraftForCurrentEditMode(draftTarget)
      setForm(nextDraft)
      setFrontDraftForms((prev) => ({ ...prev, [targetFront]: nextDraft }))
      if (false) console.debug("[daily-report][front-switch-session]", {
        targetFront,
        source: "draft-cache",
        frontSavedStatus,
        recordId: frontRecordIds[targetFront] || null
      })
      return
    }
    const identity = {
      report_date: String(current.report_date || ""),
      report_no: Number(current.report_no || 0),
      project_name: String(current.project_name || ""),
      contract_number: String(current.contract_number || ""),
      contract_title: String(current.contract_title || ""),
      contractor_name: String(current.contractor_name || ""),
      client_name: String(current.client_name || ""),
      company_id: ""
    }
    const found = records.find((r) => matchesLogicalIdentity(r, identity) && detectRecordFrontStrict(r) === targetFront)
    if (found) {
      let detail: DailyReportRecord = found
      try {
        detail = found.id ? await fetchDailyReportDetail(String(found.id)) : found
      } catch (err: any) {
        showToast(err?.message || `No se pudo cargar el detalle de ${targetFront}`, "error")
        return
      }
      const hydrated = normalizeDraftForCurrentEditMode(normalizeRecordToForm(detail))
      const indirectSettings = getSavedIndirectHoursSettings(detail)
      setForm(hydrated)
      setIndirectHoursOverrides(indirectSettings.overrides)
      setIndirectHoursOverridesDraft(indirectSettings.overrides)
      setIndirectHoursFrontOverrides(indirectSettings.frontOverrides)
      setIndirectHoursFrontOverridesDraft(indirectSettings.frontOverrides)
      setIndirectHoursFrontApplyScope(indirectSettings.frontApplyScope)
      setSavedIndirectHoursSettingsKey(stableIndirectHoursSettingsKey(indirectSettings.overrides, indirectSettings.frontApplyScope, indirectSettings.frontOverrides))
      setFrontRecordIds((prev) => ({ ...prev, [targetFront]: detail.id }))
      setFrontSavedStatus((prev) => ({ ...prev, [targetFront]: true }))
      setFrontDraftForms((prev) => ({ ...prev, [targetFront]: hydrated, [oppositeFront]: prev[oppositeFront] }))
      setFrontBaselineHashes((prev) => ({ ...prev, [targetFront]: formHash(hydrated) }))
      if (false) console.debug("[daily-report][front-switch-session]", {
        targetFront,
        source: "saved-record-detail",
        frontSavedStatus: { ...frontSavedStatus, [targetFront]: true },
        recordId: detail.id
      })
      return
    }
    const sourceIdsForTarget = liveSourceIdsForSession
    const base = {
      ...current,
      work_front: targetFront,
      report_format_code: toFrontFormat(targetFront),
      source_field_report_ids: sourceIdsForTarget
    } as DailyForm
    setForm(base)
    setFrontDraftForms((prev) => ({ ...prev, [targetFront]: base }))
    setFrontSavedStatus((prev) => ({ ...prev, [targetFront]: false }))
    setFrontBaselineHashes((prev) => ({ ...prev, [targetFront]: formHash(base) }))
    if (false) console.debug("[daily-report][front-switch-session]", {
      targetFront,
      source: "clean-create-state",
      frontSavedStatus: { ...frontSavedStatus, [targetFront]: false },
      recordId: null
    })
  }

  const uploadDailyActivityEvidence = async (lineKey: string, list: FileList | null) => {
    const files = Array.from(list || [])
    if (!lineKey || files.length === 0) return
    const uploaded: EvidenceFileLite[] = []
    for (const file of files) {
      if (!String(file.type || "").startsWith("image/")) continue
      const presignRes = await fetch("/api/daily-reports/evidence/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size,
          lineKey
        })
      })
      const presign = await presignRes.json()
      if (!presignRes.ok || !presign?.uploadUrl || !presign?.key) continue
      const putRes = await fetch(String(presign.uploadUrl), {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file
      })
      if (!putRes.ok) continue
      uploaded.push({
        key: String(presign.key),
        name: String(file.name || "imagen"),
        type: String(file.type || "application/octet-stream"),
        size: Number(file.size || 0),
        uploaded_at: new Date().toISOString()
      })
    }
    if (uploaded.length === 0) return
    setDailyActivityEvidenceByLineKey((prev) => ({
      ...prev,
      [lineKey]: [...(prev[lineKey] || []), ...uploaded].slice(0, 10)
    }))
    showToast("Imágenes cargadas para la actividad", "success")
  }

  const removeDailyActivityEvidence = (lineKey: string, fileIdx: number) => {
    setDailyActivityEvidenceByLineKey((prev) => {
      const arr = Array.isArray(prev[lineKey]) ? [...prev[lineKey]] : []
      if (fileIdx < 0 || fileIdx >= arr.length) return prev
      arr.splice(fileIdx, 1)
      return { ...prev, [lineKey]: arr }
    })
  }
  const openActivityEvidenceModal = (lineKey: string, label: string) => {
    setActivityEvidenceModalLineKey(String(lineKey || ""))
    setActivityEvidenceModalLabel(String(label || "Actividad"))
    setActivityEvidenceModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const frontToFormat = (front: "CANALETAS" | "PISCINAS") =>
        front === "PISCINAS" ? "ANT-GPRO-FOR-PISCINAS" : "ANT-GPRO-FOR-CANALETAS"
      const currentFront: "CANALETAS" | "PISCINAS" = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
      const visibleFront: "CANALETAS" | "PISCINAS" = currentFront
      const approvedByNameForSave = normalizeApprovedByNameForReport(form.approved_by_name)
      if (false) console.log("[daily-report][audit-report-identity]", {
        editingId,
        reportDate: form.report_date,
        reportNo: form.report_no,
        workFront: form.work_front,
        visibleFront
      })
      const oppositeFront: "CANALETAS" | "PISCINAS" = currentFront === "CANALETAS" ? "PISCINAS" : "CANALETAS"
      const parsedReportNo = Number(form.report_no || 0)
      const expectedByDate = Number(getDailyReportNoFromDate(form.report_date || "") || 0)
      const expectedMinForNew = expectedByDate > 0 ? expectedByDate : 29
      if (!Number.isFinite(parsedReportNo) || parsedReportNo <= 0) {
        throw new Error("El número de reporte diario no es válido.")
      }
      const shouldPersistWorkdayMetadata = !editingId || hasExplicitWorkdayMetadata(form)
      const workdayMetadataForSave = shouldPersistWorkdayMetadata
        ? buildWorkdayMetadataForSource(hasExplicitWorkdayMetadata(form) ? form : getCurrentWorkdayMetadata())
        : null
      const personWorkdayHoursForSave = resolvePersonWorkdayHours(workdayMetadataForSave || form)
      const machineWorkdayHoursForSave = resolveMachineWorkdayHours(workdayMetadataForSave || form)
      const baseVisibleSummarySnapshot = {
        summary_indirect_dotation: String(Number(effectiveV2SummaryMetrics.daily.indirectDot || 0)),
        summary_indirect_hh: String(Number(effectiveV2SummaryMetrics.daily.indirectHh || 0)),
        summary_direct_dotation: String(Number(effectiveV2SummaryMetrics.daily.directDot || 0)),
        summary_direct_hh: String(Number(effectiveV2SummaryMetrics.daily.directHh || 0)),
        summary_total_dotation: String(Number(effectiveV2SummaryMetrics.daily.totalDot || 0)),
        summary_total_hh: String(Number(effectiveV2SummaryMetrics.daily.totalHh || 0)),
        equip_major_qty: oneDecimalFormValue(effectiveV2SummaryMetrics.current.majorQty || 0),
        equip_major_hm: oneDecimalFormValue(effectiveV2SummaryMetrics.current.majorHm || 0),
        equip_minor_qty: oneDecimalFormValue(effectiveV2SummaryMetrics.current.minorQty || 0),
        equip_minor_hm: oneDecimalFormValue(effectiveV2SummaryMetrics.current.minorHm || 0),
        equip_total_qty: oneDecimalFormValue(effectiveV2SummaryMetrics.current.equipmentCount || 0),
        equip_total_hm: oneDecimalFormValue(effectiveV2SummaryMetrics.current.equipmentHm || 0)
      }
      const toSnapshotNumber = (value: unknown) => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0
        const raw = String(value ?? "").trim()
        if (!raw) return 0
        let normalized = raw.replace(/\s+/g, "")
        if (normalized.includes(",") && normalized.includes(".")) {
          const lastComma = normalized.lastIndexOf(",")
          const lastDot = normalized.lastIndexOf(".")
          if (lastComma > lastDot) {
            normalized = normalized.replace(/\./g, "").replace(",", ".")
          } else {
            normalized = normalized.replace(/,/g, "")
          }
        } else if (normalized.includes(",")) {
          normalized = normalized.replace(",", ".")
        }
        const parsed = Number(normalized)
        return Number.isFinite(parsed) ? parsed : 0
      }
      const buildV2DetailRowSnapshot = (
        row: any,
        overrides?: Partial<{
          instalacionFaena: number
          frente: number
          nocFront: number
          dynamicFrontValues: number[]
          dotacionTotalObra: number
          hhTotalObra: number
        }>
      ) => ({
        discipline: String(row?.discipline || "").trim(),
        specialty: String(row?.specialty || "").trim(),
        position: String(row?.position || "SIN CARGO").trim() || "SIN CARGO",
        hhTurnoDia: toSnapshotNumber(row?.hhTurnoDia) || personWorkdayHoursForSave,
        contratados: toSnapshotNumber(row?.contratados),
        contratacionProceso: toSnapshotNumber(row?.contratacionProceso),
        apoyoOficina: toSnapshotNumber(row?.apoyoOficina),
        descansoCambioTurno: toSnapshotNumber(row?.descansoCambioTurno),
        permisoCovid: toSnapshotNumber(row?.permisoCovid),
        renunciaVoluntaria: toSnapshotNumber(row?.renunciaVoluntaria),
        terminoContrato: toSnapshotNumber(row?.terminoContrato),
        enCurso3d: toSnapshotNumber(row?.enCurso3d),
        capacitacionAcreditacion: toSnapshotNumber(row?.capacitacionAcreditacion),
        teletrabajo: toSnapshotNumber(row?.teletrabajo),
        pruebaPractica: toSnapshotNumber(row?.pruebaPractica),
        ofertaComercial: toSnapshotNumber(row?.ofertaComercial),
        instalacionFaena: toSnapshotNumber(overrides?.instalacionFaena ?? row?.instalacionFaena),
        frente: toSnapshotNumber(overrides?.frente ?? row?.frente),
        nocFront: toSnapshotNumber(overrides?.nocFront ?? row?.nocFront),
        dynamicFrontValues: Array.isArray(overrides?.dynamicFrontValues ?? row?.dynamicFrontValues)
          ? (overrides?.dynamicFrontValues ?? row?.dynamicFrontValues).map((value: any) => toSnapshotNumber(value))
          : [],
        dotacionTotalObra: toSnapshotNumber(overrides?.dotacionTotalObra ?? row?.dotacionTotalObra),
        hhTotalObra: toSnapshotNumber(overrides?.hhTotalObra ?? row?.hhTotalObra)
      })
      const buildV2EquipmentRowSnapshot = (row: any) => {
      const instalacionFaena = toSnapshotNumber(row?.instalacionFaena ?? row?.front1)
      const mainFront = toSnapshotNumber(row?.mainFront ?? row?.front2)
      const nocFront = toSnapshotNumber(row?.nocFront)
      const dynamicFrontValues = Array.isArray(row?.dynamicFrontValues)
        ? row.dynamicFrontValues.map((value: any) => toSnapshotNumber(value))
        : []
      const dynamicFrontTotal = dynamicFrontValues.length > 0
        ? dynamicFrontValues.reduce((acc: number, value: number) => acc + Number(value || 0), 0)
        : nocFront
      const totalEqMaq = toSnapshotNumber(row?.totalEqMaq ?? row?.totalEqObra ?? (instalacionFaena + mainFront + dynamicFrontTotal))
        const hmTurnoDia = toSnapshotNumber(row?.hmTurnoDia) || machineWorkdayHoursForSave
        return {
          name: String(row?.name || "").trim(),
          hmTurnoDia,
          totalEquipos: toSnapshotNumber(row?.totalEquipos),
          operacion: toSnapshotNumber(row?.operacion),
          disponibles: toSnapshotNumber(row?.disponibles),
          acredMant: toSnapshotNumber(row?.acredMant),
          panne: toSnapshotNumber(row?.panne),
          ofCentral: toSnapshotNumber(row?.ofCentral ?? row?.oficinaFuera),
          instalacionFaena,
          mainFront,
          nocFront,
          dynamicFrontValues,
          totalEqMaq,
          hmTotal: toSnapshotNumber(row?.hmTotal ?? (totalEqMaq * hmTurnoDia))
        }
      }
      const buildV2DetailSnapshotForFront = (targetFront: "CANALETAS" | "PISCINAS") => {
        const usingVisibleRowsForCurrentFront =
          targetFront === currentFront &&
          Array.isArray(detailVisibleRows?.indirect) &&
          detailVisibleRows.indirect.length > 0 &&
          Array.isArray(detailVisibleRows?.direct) &&
          detailVisibleRows.direct.length > 0 &&
          Array.isArray(detailVisibleRows?.majorEquipment) &&
          detailVisibleRows.majorEquipment.length > 0 &&
          Array.isArray(detailVisibleRows?.minorEquipment) &&
          detailVisibleRows.minorEquipment.length > 0

        if (targetFront === currentFront && !usingVisibleRowsForCurrentFront) {
          throw new Error("No se pudo congelar el detalle visible del frente actual. Espera un segundo y vuelve a guardar.")
        }

        const indirectSourceRows = usingVisibleRowsForCurrentFront
          ? (detailVisibleRows?.indirect || [])
          : (v2IndirectAttendanceRows || [])
        const directSourceRows = usingVisibleRowsForCurrentFront
          ? (detailVisibleRows?.direct || [])
          : (v2DirectAttendanceRows || [])
        const majorEquipmentSourceRows = usingVisibleRowsForCurrentFront
          ? (detailVisibleRows?.majorEquipment || [])
          : getPersistedRowsGenericFromForm(form, "v2_detail_major_equipment_rows")
        const minorEquipmentSourceRows = usingVisibleRowsForCurrentFront
          ? (detailVisibleRows?.minorEquipment || [])
          : getPersistedRowsGenericFromForm(form, "v2_detail_minor_equipment_rows")

        return {
          v2_detail_indirect_rows: indirectSourceRows.map((row) => {
            if (usingVisibleRowsForCurrentFront) {
              return buildV2DetailRowSnapshot(row, {
                instalacionFaena: Number((row as any)?.instalacionFaena || 0),
                frente: Number((row as any)?.frente || 0),
                nocFront: Number((row as any)?.nocFront || 0),
                dynamicFrontValues: Array.isArray((row as any)?.dynamicFrontValues) ? (row as any).dynamicFrontValues.map(Number) : [],
                dotacionTotalObra: Number((row as any)?.dotacionTotalObra || 0),
                hhTotalObra: Number((row as any)?.hhTotalObra || 0)
              })
            }
            const frontValues = getV2DotacionFrenteValues(row as any, targetFront)
            const visibleInstalacionFaena = Number(frontValues?.[0] || 0)
            const visibleFrente = Number(frontValues?.[1] || 0)
            const visibleNocFront = Number(frontValues?.[2] || 0)
            const visibleDynamicFrontValues = frontValues.slice(2).map((value: any) => Number(value || 0))
            const visibleDotTotal = visibleInstalacionFaena + visibleFrente
            const visibleHhTotal = visibleDotTotal * personWorkdayHoursForSave
            return buildV2DetailRowSnapshot(row, {
              instalacionFaena: visibleInstalacionFaena,
              frente: visibleFrente,
              nocFront: visibleNocFront,
              dynamicFrontValues: visibleDynamicFrontValues,
              dotacionTotalObra: visibleDotTotal,
              hhTotalObra: visibleHhTotal
            })
          }),
          v2_detail_direct_rows: directSourceRows.map((row) => {
            if (usingVisibleRowsForCurrentFront) {
              return buildV2DetailRowSnapshot(row, {
                instalacionFaena: Number((row as any)?.instalacionFaena || 0),
                frente: Number((row as any)?.frente || 0),
                nocFront: Number((row as any)?.nocFront || 0),
                dynamicFrontValues: Array.isArray((row as any)?.dynamicFrontValues) ? (row as any).dynamicFrontValues.map(Number) : [],
                dotacionTotalObra: Number((row as any)?.dotacionTotalObra || 0),
                hhTotalObra: Number((row as any)?.hhTotalObra || 0)
              })
            }
            const frontValues = getV2DotacionFrenteValues(row as any, targetFront)
            const visibleInstalacionFaena = Number(frontValues?.[0] || 0)
            const visibleFrente = Number(frontValues?.[1] || 0)
            const visibleNocFront = Number(frontValues?.[2] || 0)
            const visibleDynamicFrontValues = frontValues.slice(2).map((value: any) => Number(value || 0))
            const visibleDotTotal = visibleInstalacionFaena + visibleFrente
            const visibleHhTotal = visibleDotTotal * personWorkdayHoursForSave
            return buildV2DetailRowSnapshot(row, {
              instalacionFaena: visibleInstalacionFaena,
              frente: visibleFrente,
              nocFront: visibleNocFront,
              dynamicFrontValues: visibleDynamicFrontValues,
              dotacionTotalObra: visibleDotTotal,
              hhTotalObra: visibleHhTotal
            })
          }),
          v2_detail_major_equipment_rows: majorEquipmentSourceRows.map((row) => buildV2EquipmentRowSnapshot(row)),
          v2_detail_minor_equipment_rows: minorEquipmentSourceRows.map((row) => buildV2EquipmentRowSnapshot(row))
        }
      }
      const v2DetailSnapshot = buildV2DetailSnapshotForFront(currentFront)
      const buildSummaryFromDetailSnapshot = (snapshot: typeof v2DetailSnapshot) => {
        const indirectDot = Number(sumV2RowsDotation(snapshot.v2_detail_indirect_rows).toFixed(2))
        const directDot = Number(sumV2RowsDotation(snapshot.v2_detail_direct_rows).toFixed(2))
        const indirectHh = Number((indirectDot * personWorkdayHoursForSave).toFixed(2))
        const directHh = Number((directDot * personWorkdayHoursForSave).toFixed(2))
        const totalDot = Number((indirectDot + directDot).toFixed(2))
        const totalHh = Number((indirectHh + directHh).toFixed(2))
        const equipmentQtyFromRow = (row: any) => {
          const directTotal = toSnapshotNumber(row?.totalEqMaq ?? row?.totalEqObra)
          if (directTotal > 0) return directTotal
          return toSnapshotNumber(row?.instalacionFaena ?? row?.front1) +
            toSnapshotNumber(row?.mainFront ?? row?.front2) +
            toSnapshotNumber(row?.nocFront)
        }
        const majorQty = Number(snapshot.v2_detail_major_equipment_rows.reduce((acc, row) => acc + equipmentQtyFromRow(row), 0).toFixed(2))
        const minorQty = Number(snapshot.v2_detail_minor_equipment_rows.reduce((acc, row) => acc + equipmentQtyFromRow(row), 0).toFixed(2))
        const majorHm = Number(snapshot.v2_detail_major_equipment_rows.reduce((acc, row) => acc + toSnapshotNumber(row?.hmTotal), 0).toFixed(2))
        const minorHm = Number(snapshot.v2_detail_minor_equipment_rows.reduce((acc, row) => acc + toSnapshotNumber(row?.hmTotal), 0).toFixed(2))
        return {
          summary_indirect_dotation: String(indirectDot),
          summary_indirect_hh: String(indirectHh),
          summary_direct_dotation: String(directDot),
          summary_direct_hh: String(directHh),
          summary_total_dotation: String(totalDot),
          summary_total_hh: String(totalHh),
          equip_major_qty: oneDecimalFormValue(majorQty),
          equip_major_hm: oneDecimalFormValue(majorHm),
          equip_minor_qty: oneDecimalFormValue(minorQty),
          equip_minor_hm: oneDecimalFormValue(minorHm),
          equip_total_qty: oneDecimalFormValue(majorQty + minorQty),
          equip_total_hm: oneDecimalFormValue(majorHm + minorHm)
        }
      }
      const visibleSummaryFromRows = buildSummaryFromDetailSnapshot(v2DetailSnapshot)
      const visibleSummarySnapshot = (() => {
        if (
          currentFront === visibleFront &&
          detailVisibleTotals &&
          Number.isFinite(detailVisibleTotals.indirectDot) &&
          Number.isFinite(detailVisibleTotals.indirectHh) &&
          Number.isFinite(detailVisibleTotals.directDot) &&
          Number.isFinite(detailVisibleTotals.directHh) &&
          Number.isFinite(detailVisibleTotals.totalDot) &&
          Number.isFinite(detailVisibleTotals.totalHh)
        ) {
          return {
            ...baseVisibleSummarySnapshot,
            ...visibleSummaryFromRows,
            summary_indirect_dotation: String(Number(detailVisibleTotals.indirectDot.toFixed(2))),
            summary_indirect_hh: String(Number(detailVisibleTotals.indirectHh.toFixed(2))),
            summary_direct_dotation: String(Number(detailVisibleTotals.directDot.toFixed(2))),
            summary_direct_hh: String(Number(detailVisibleTotals.directHh.toFixed(2))),
            summary_total_dotation: String(Number(detailVisibleTotals.totalDot.toFixed(2))),
            summary_total_hh: String(Number(detailVisibleTotals.totalHh.toFixed(2)))
          }
        }
        return {
          ...baseVisibleSummarySnapshot,
          ...visibleSummaryFromRows
        }
      })()
      const roundS4Hm = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2))
      const s4PrevMajorHm = roundS4Hm(Number(v2SummaryMetrics.previous.majorHm || 0))
      const s4PrevMinorHm = roundS4Hm(Number(v2SummaryMetrics.previous.minorHm || 0))
      const s4PrevTotalHm = roundS4Hm(Number(v2SummaryMetrics.previous.equipmentHm || 0) || (s4PrevMajorHm + s4PrevMinorHm))
      const s4DailyMajorHm = roundS4Hm(toSnapshotNumber(visibleSummarySnapshot.equip_major_hm))
      const s4DailyMinorHm = roundS4Hm(toSnapshotNumber(visibleSummarySnapshot.equip_minor_hm))
      const s4CurrMajorHm = roundS4Hm(s4PrevMajorHm + s4DailyMajorHm)
      const s4CurrMinorHm = roundS4Hm(s4PrevMinorHm + s4DailyMinorHm)
      const s4CurrTotalHm = roundS4Hm(s4PrevTotalHm + s4DailyMajorHm + s4DailyMinorHm)
      const sector4Snapshot = {
        s4_prev_indirect_dot: Number(v2SummaryMetrics.previous.indirectDot || 0),
        s4_prev_indirect_hh: Number(v2SummaryMetrics.previous.indirectHh || 0),
        s4_prev_direct_dot: Number(v2SummaryMetrics.previous.directDot || 0),
        s4_prev_direct_hh: Number(v2SummaryMetrics.previous.directHh || 0),
        s4_prev_total_dot: Number(v2SummaryMetrics.previous.totalDot || 0),
        s4_prev_total_hh: Number(v2SummaryMetrics.previous.totalHh || 0),
        s4_prev_major_equip: Number(resolveMachineDotationFromHours(s4PrevMajorHm, workdayMetadataForSave || form).toFixed(2)),
        s4_prev_major_hm: s4PrevMajorHm,
        s4_prev_minor_equip: Number(resolveMachineDotationFromHours(s4PrevMinorHm, workdayMetadataForSave || form).toFixed(2)),
        s4_prev_minor_hm: s4PrevMinorHm,
        s4_prev_total_equip: Number(resolveMachineDotationFromHours(s4PrevTotalHm, workdayMetadataForSave || form).toFixed(2)),
        s4_prev_total_hm: s4PrevTotalHm,
        s4_curr_indirect_dot: Number(effectiveV2SummaryMetrics.current.indirectDot || 0),
        s4_curr_indirect_hh: Number(effectiveV2SummaryMetrics.current.indirectHh || 0),
        s4_curr_direct_dot: Number(effectiveV2SummaryMetrics.current.directDot || 0),
        s4_curr_direct_hh: Number(effectiveV2SummaryMetrics.current.directHh || 0),
        s4_curr_total_dot: Number(effectiveV2SummaryMetrics.current.totalDot || 0),
        s4_curr_total_hh: Number(effectiveV2SummaryMetrics.current.totalHh || 0),
        s4_curr_major_equip: Number(resolveMachineDotationFromHours(s4CurrMajorHm, workdayMetadataForSave || form).toFixed(2)),
        s4_curr_major_hm: s4CurrMajorHm,
        s4_curr_minor_equip: Number(resolveMachineDotationFromHours(s4CurrMinorHm, workdayMetadataForSave || form).toFixed(2)),
        s4_curr_minor_hm: s4CurrMinorHm,
        s4_curr_total_equip: Number(resolveMachineDotationFromHours(s4CurrTotalHm, workdayMetadataForSave || form).toFixed(2)),
        s4_curr_total_hm: s4CurrTotalHm
      }
      const brokenRowsCount =
        v2DetailSnapshot.v2_detail_indirect_rows.filter(isBrokenV2FrontSplitRow).length +
        v2DetailSnapshot.v2_detail_direct_rows.filter(isBrokenV2FrontSplitRow).length
      if (brokenRowsCount > 0) {
        throw new Error("No se puede guardar el reporte: existen filas V2 con dotación total pero sin distribución en Instalación Faena/CANALETAS. Revise el cálculo de frentes antes de guardar.")
      }

      const baseFormSnapshotCurrent = {
        ...form,
        ...(workdayMetadataForSave ? workdayMetadataForSave : {}),
        approved_by_name: approvedByNameForSave,
        ...visibleSummarySnapshot,
        ...v2DetailSnapshot,
        report_template: reportTemplate,
        daily_activity_images: dailyActivityEvidenceByLineKey
      }
      const buildCommonHeader = (front: "CANALETAS" | "PISCINAS", formatCode: string) => ({
        report_no: Number(form.report_no || 0),
        revision: form.revision || "0",
        report_date: form.report_date,
        contractor_name: form.contractor_name,
        contractor_logo_url: form.contractor_logo_url,
        client_name: form.client_name,
        client_logo_url: form.client_logo_url,
        project_name: form.project_name,
        contract_title: form.contract_title,
        contract_number: form.contract_number,
        work_calendar: form.work_calendar,
        hh_day: Number(form.hh_day || 0),
        hh_productive: Number(form.hh_productive || 0),
        weather_label: form.weather_label,
        notes: {
          report_template: reportTemplate,
          project_account: form.project_account || "",
          site_responsible: form.site_responsible || "",
          prepared_by_name: form.prepared_by_name || "",
          prepared_by_role: form.prepared_by_role || "",
          prepared_by_date: form.prepared_by_date || "",
          approved_by_name: approvedByNameForSave || "",
          approved_by_role: form.approved_by_role || "",
          approved_by_date: form.approved_by_date || "",
          validated_by_name: form.validated_by_name || "",
          validated_by_role: form.validated_by_role || "",
          validated_by_date: form.validated_by_date || "",
          prepared_by_signature_url: form.prepared_by_signature_url || "",
          approved_by_signature_url: form.approved_by_signature_url || "",
          work_front: front,
          report_format_code: formatCode
        } as Record<string, any>
      })

      const currentFormat = frontToFormat(currentFront)
      const frozenEquipmentSnapshotDate = String((form as any)?.equipment_snapshot_date || form.report_date || "").slice(0, 10)
      const fieldReportsForDynamicColumnsSave = Array.isArray(fieldReportsForDate) ? fieldReportsForDate : []
      const liveSourceFieldReportIds = sourceFieldReportIdsFromRows(fieldReportsForDynamicColumnsSave)
      const savedSourceFieldReportIds =
        Array.isArray(form.source_field_report_ids)
          ? Array.from(new Set(form.source_field_report_ids.map((x) => String(x || "").trim()).filter(Boolean)))
          : []
      const persistedSourceFieldReportIds =
        (!editingId || isEditReformulateMode) && liveSourceFieldReportIds.length > 0
          ? liveSourceFieldReportIds
          : savedSourceFieldReportIds
      const snapshotNotes = (form as any)?.notes && typeof (form as any).notes === "object" ? (form as any).notes : {}
      const snapshotForm = (form as any)?.v2_form_snapshot && typeof (form as any).v2_form_snapshot === "object" ? (form as any).v2_form_snapshot : {}
      const snapshotRuntime = (form as any)?.v2_runtime_snapshot && typeof (form as any).v2_runtime_snapshot === "object" ? (form as any).v2_runtime_snapshot : {}
      const persistedDynamicColumnsForSave = parseDynamicFrontColumns(
        (form as any)?.v2_dynamic_front_columns ??
        snapshotRuntime?.v2_dynamic_front_columns ??
        snapshotForm?.v2_dynamic_front_columns ??
        snapshotNotes?.v2_dynamic_front_columns
      )
      const persistedDynamicColumnsByBlockForSave = parseDynamicFrontColumnsByBlock(
        (form as any)?.v2_dynamic_front_columns_by_block ??
        snapshotRuntime?.v2_dynamic_front_columns_by_block ??
        snapshotForm?.v2_dynamic_front_columns_by_block ??
        snapshotNotes?.v2_dynamic_front_columns_by_block
      )
      const shouldPreserveSnapshotDynamicColumns = Boolean(
        isEditSnapshotMode &&
        (persistedDynamicColumnsForSave.length > 0 || persistedDynamicColumnsByBlockForSave)
      )
      const liveDynamicFrontColumnsForSave = shouldPreserveSnapshotDynamicColumns
        ? []
        : collectDynamicFrontColumns(fieldReportsForDynamicColumnsSave, reportFrontNames)
      const dynamicFrontColumnsForSave = shouldPreserveSnapshotDynamicColumns
        ? (persistedDynamicColumnsForSave.length > 0
          ? persistedDynamicColumnsForSave
          : [
              ...(persistedDynamicColumnsByBlockForSave?.CANALETAS || []),
              ...(persistedDynamicColumnsByBlockForSave?.PISCINAS || [])
            ])
        : liveDynamicFrontColumnsForSave
      const dynamicFrontColumnsByBlockForSave = shouldPreserveSnapshotDynamicColumns
        ? (persistedDynamicColumnsByBlockForSave || splitDynamicFrontColumnsByBlock(dynamicFrontColumnsForSave))
        : splitDynamicFrontColumnsByBlock(dynamicFrontColumnsForSave)
      const activeDynamicFrontColumnsForSave = dynamicFrontColumnsByBlockForSave[currentFront] || []
      const hasStructuredDynamicFrontColumnsForSave = dynamicFrontColumnsForSave.length > 0
      const persistedHasNocFrontColumn =
        activeDynamicFrontColumnsForSave.length > 0 ||
        (!hasStructuredDynamicFrontColumnsForSave && (
          Boolean(hasNocFrontColumn) ||
          v2DetailSnapshot.v2_detail_indirect_rows.some((row: any) => Number(row?.nocFront || 0) > 0) ||
          v2DetailSnapshot.v2_detail_direct_rows.some((row: any) => Number(row?.nocFront || 0) > 0)
        ))
      const assignmentCodesForFront = (nocFrontAssignment.codesByFront[currentFront] || [])
        .map((code) => String(code || "").trim())
        .filter(Boolean)
      const assignmentLabelForFront = assignmentCodesForFront.join(" / ").trim()
      const extractNocLabelFromTextForSave = (value: any) => {
        const raw = String(value || "").trim()
        if (!raw) return ""
        const normalized = raw
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
        const fullLabelMatch = normalized.match(/USO\s+DE\s+RECURSOS\s+NOC\s+N[º°]?\s*\d+.*$/i)
        if (fullLabelMatch) {
          return String(fullLabelMatch[0] || "")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^USO\s+DE\s+RECURSOS/i, "UDR")
        }
        const codeMatch = normalized.match(/NOC\s+N[º°]?\s*0*(\d+)/i)
        if (!codeMatch) return ""
        const num = String(codeMatch[1] || "").trim()
        if (!num) return ""
        return `UDR NOC Nº${num.padStart(3, "0")}`
      }
      const extractNocLabelFromReportForSave = (report: any) => {
        if (!report || typeof report !== "object") return ""
        const direct =
          extractNocLabelFromTextForSave(report?.work_front || "") ||
          extractNocLabelFromTextForSave(report?.report_title || "") ||
          extractNocLabelFromTextForSave(report?.area || report?.work_area || "") ||
          extractNocLabelFromTextForSave(report?.crew_name || "")
        if (direct) return direct
        try {
          const normalized = JSON.stringify(report)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
          const fullLabelMatch = normalized.match(/USO\s+DE\s+RECURSOS\s+NOC\s+N[º°]?\s*\d+[^\"]*/i)
          if (fullLabelMatch) {
            return String(fullLabelMatch[0] || "")
              .replace(/\s+/g, " ")
              .trim()
              .replace(/^USO\s+DE\s+RECURSOS/i, "UDR")
          }
          const codeMatch = normalized.match(/NOC\s+N[º°]?\s*0*(\d+)/i)
          const num = String(codeMatch?.[1] || "").trim()
          return num ? `UDR NOC Nº${num.padStart(3, "0")}` : ""
        } catch {
          return ""
        }
      }
      const sourceNocLabelForFront = (() => {
        const byId = new Map<string, any>()
        ;(fieldReportsForDate || []).forEach((r: any) => {
          const id = String(r?.id || "").trim()
          if (id) byId.set(id, r)
        })
        const labelsFromSources = persistedSourceFieldReportIds
          .map((id) => {
            const sourceId = String(id || "").trim()
            const assignedFront = nocFrontAssignment.byReportId.get(sourceId)
            if (assignedFront && assignedFront !== currentFront) return ""
            const report = byId.get(sourceId)
            if (!report) return ""
            return extractNocLabelFromReportForSave(report)
          })
          .filter(Boolean)
        if (labelsFromSources.length > 0) return Array.from(new Set(labelsFromSources)).join(" / ").trim()

        const labelsFromDate = Array.from(byId.values())
          .map((report) => {
            const reportId = String(report?.id || "").trim()
            const assignedFront = nocFrontAssignment.byReportId.get(reportId)
            if (assignedFront && assignedFront !== currentFront) return ""
            return extractNocLabelFromReportForSave(report)
          })
          .filter(Boolean)
        const uniqueLabelsFromDate = Array.from(new Set(labelsFromDate))
        if (uniqueLabelsFromDate.length === 1) return uniqueLabelsFromDate[0]
        return ""
      })()
      const persistedNocFrontColumnLabel = String(
        sourceNocLabelForFront ||
        assignmentLabelForFront ||
        nocFrontColumnLabel ||
        "UDR NOC"
      ).trim() || "UDR NOC"
      const currentPayloadBase = {
        ...(editingId ? { id: editingId } : {}),
        ...buildCommonHeader(currentFront, currentFormat),
        equipment_snapshot_date: frozenEquipmentSnapshotDate || null,
        ...sector4Snapshot,
        source_field_report_ids: persistedSourceFieldReportIds,
        v2_form_snapshot: {
          ...(workdayMetadataForSave ? workdayMetadataForSave : {}),
          ...baseFormSnapshotCurrent,
          work_front: currentFront,
          report_format_code: currentFormat,
          source_field_report_ids: persistedSourceFieldReportIds,
          v2_dynamic_front_columns: dynamicFrontColumnsForSave,
          v2_dynamic_front_columns_by_block: dynamicFrontColumnsByBlockForSave,
          v2_has_noc_front_column: persistedHasNocFrontColumn,
          v2_noc_front_column_label: persistedNocFrontColumnLabel,
          indirect_hours_overrides: indirectHoursOverrides,
          indirect_hours_front_apply_scope: indirectHoursFrontApplyScope,
          indirect_hours_front_overrides: indirectHoursFrontOverrides
        },
        v2_runtime_snapshot: {
          ...(workdayMetadataForSave ? workdayMetadataForSave : {}),
          report_template: reportTemplate,
          report_format_code: currentFormat,
          work_front: currentFront,
          source_field_report_ids: persistedSourceFieldReportIds,
          v2_dynamic_front_columns: dynamicFrontColumnsForSave,
          v2_dynamic_front_columns_by_block: dynamicFrontColumnsByBlockForSave,
          v2_has_noc_front_column: persistedHasNocFrontColumn,
          v2_noc_front_column_label: persistedNocFrontColumnLabel,
          indirect_hours_overrides: indirectHoursOverrides,
          indirect_hours_front_apply_scope: indirectHoursFrontApplyScope,
          indirect_hours_front_overrides: indirectHoursFrontOverrides
        },
        notes: {
          ...(workdayMetadataForSave ? workdayMetadataForSave : {}),
          ...buildCommonHeader(currentFront, currentFormat).notes,
          obs_contractor: form.obs_contractor || "",
          obs_client: form.obs_client || "",
          weather_v2: form.weather_v2 || "",
          summary_indirect_dotation: visibleSummarySnapshot.summary_indirect_dotation,
          summary_indirect_hh: visibleSummarySnapshot.summary_indirect_hh,
          summary_direct_dotation: visibleSummarySnapshot.summary_direct_dotation,
          summary_direct_hh: visibleSummarySnapshot.summary_direct_hh,
          summary_total_dotation: visibleSummarySnapshot.summary_total_dotation,
          summary_total_hh: visibleSummarySnapshot.summary_total_hh,
          equip_major_qty: visibleSummarySnapshot.equip_major_qty,
          equip_major_hm: visibleSummarySnapshot.equip_major_hm,
          equip_minor_qty: visibleSummarySnapshot.equip_minor_qty,
          equip_minor_hm: visibleSummarySnapshot.equip_minor_hm,
          equip_total_qty: visibleSummarySnapshot.equip_total_qty,
          equip_total_hm: visibleSummarySnapshot.equip_total_hm,
          comments_v2: form.comments_v2 || "",
          source_field_report_ids: persistedSourceFieldReportIds,
          v2_dynamic_front_columns: dynamicFrontColumnsForSave,
          v2_dynamic_front_columns_by_block: dynamicFrontColumnsByBlockForSave,
          v2_has_noc_front_column: persistedHasNocFrontColumn,
          v2_noc_front_column_label: persistedNocFrontColumnLabel,
          indirect_hours_overrides: indirectHoursOverrides,
          indirect_hours_front_apply_scope: indirectHoursFrontApplyScope,
          indirect_hours_front_overrides: indirectHoursFrontOverrides,
          ...sector4Snapshot,
          ...v2DetailSnapshot,
          daily_activity_images: dailyActivityEvidenceByLineKey
        }
      }

      // Discover existing pair from backend state (authoritative source)
      const latestRes = await fetch("/api/daily-reports?validation=1", { cache: "no-store" })
      const latestJson = await latestRes.json().catch(() => [])
      if (!latestRes.ok) throw new Error(String((latestJson as any)?.error || "Error consultando reportes existentes"))
      const sourceRecords: DailyReportRecord[] = Array.isArray(latestJson) ? (latestJson as DailyReportRecord[]) : []
      const identity = {
        report_date: String(currentPayloadBase.report_date || ""),
        report_no: Number(currentPayloadBase.report_no || 0),
        project_name: String(currentPayloadBase.project_name || ""),
        contract_number: String(currentPayloadBase.contract_number || ""),
        contract_title: String(currentPayloadBase.contract_title || ""),
        contractor_name: String(currentPayloadBase.contractor_name || ""),
        client_name: String(currentPayloadBase.client_name || ""),
        company_id: ""
      }
      const candidates = sourceRecords.filter((r) => matchesLogicalIdentity(r, identity))
      const sameDateNo = sourceRecords.filter((r) =>
        String(r?.report_date || "") === String(identity.report_date || "") &&
        Number(r?.report_no || 0) === Number(identity.report_no || 0)
      )
      const existingCanaletas = sameDateNo.find((r) => detectRecordFrontStrict(r) === "CANALETAS")
      const existingPiscinas = sameDateNo.find((r) => detectRecordFrontStrict(r) === "PISCINAS")
      const existingCurrent = currentFront === "CANALETAS" ? existingCanaletas : existingPiscinas
      const existingOtherFront = currentFront === "CANALETAS" ? existingPiscinas : existingCanaletas
      if (existingCurrent) {
        const existingCurrentDetail = await fetchDailyReportDetail(String(existingCurrent.id))
        const previousIndirectRows = getPersistedV2RowsFromForm(normalizeRecordToForm(existingCurrentDetail), "v2_detail_indirect_rows")
        const previousDirectRows = getPersistedV2RowsFromForm(normalizeRecordToForm(existingCurrentDetail), "v2_detail_direct_rows")
        const previousDot = sumV2RowsDotation(previousIndirectRows) + sumV2RowsDotation(previousDirectRows)
        const nextDot =
          sumV2RowsDotation(v2DetailSnapshot.v2_detail_indirect_rows) +
          sumV2RowsDotation(v2DetailSnapshot.v2_detail_direct_rows)
        if (previousDot > 0 && nextDot <= 0) {
          console.error("[daily-report][save-block-zero-snapshot]", {
            reportId: existingCurrent.id,
            currentFront,
            previousDot,
            nextDot,
            reportDate: form.report_date,
            reportNo: form.report_no
          })
          throw new Error("Se bloqueó el guardado porque el snapshot V2 calculado quedó en cero y el reporte guardado tenía datos. Revisa asistencia/snapshot antes de guardar.")
        }
      }
      const existingSameNoOtherFront = !!existingOtherFront
      const existingSameNoSameFront = !!existingCurrent
      const isCompletingPair = !editingId && !existingSameNoSameFront && existingSameNoOtherFront
      const validationAllowed = !!editingId || parsedReportNo >= expectedMinForNew || isCompletingPair
      if (false) console.debug("[daily-report][report-no-validation]", {
        visibleFront: currentFront,
        report_no: parsedReportNo,
        expectedReportNoByDate: expectedMinForNew,
        existingSameNoOtherFront,
        existingSameNoSameFront,
        isCompletingPair,
        validationAllowed
      })
      if (!validationAllowed) {
        throw new Error(`El número de reporte (${parsedReportNo}) no coincide con el correlativo esperado (${expectedMinForNew}).`)
      }
      const duplicateSameFrontDifferentId = !!existingCurrent && (!editingId || String(existingCurrent.id) !== String(editingId))
      const editId = String(frontRecordIds[currentFront] || editingId || "").trim()
      const visiblePayload = {
        ...(existingCurrent ? { id: existingCurrent.id } : {}),
        ...currentPayloadBase,
        ...(editId ? { id: editId } : {})
      } as any

      const saveFront = async (frontPayload: any, method: "POST" | "PUT") => {
        const res = await fetch("/api/daily-reports", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(frontPayload)
        })
        const body = await res.json().catch(() => ({}))
        return { ok: res.ok, status: res.status, body }
      }

      const actionVisible: "PUT" | "POST" = editId ? "PUT" : (visiblePayload?.id ? "PUT" : "POST")
      if (false) console.debug("[daily-report][duplicate-check-by-front]", {
        visibleFront: currentFront,
        report_date: identity.report_date,
        report_no: identity.report_no,
        currentEditingId: editingId || null,
        candidatos_encontrados: {
          logicalIdentity: candidates.map((r) => ({ id: r.id, front: detectRecordFrontStrict(r) || getRecordFront(r), report_no: r.report_no, report_date: r.report_date })),
          sameDateNo: sameDateNo.map((r) => ({ id: r.id, front: detectRecordFrontStrict(r) || getRecordFront(r), report_no: r.report_no, report_date: r.report_date }))
        },
        duplicado_mismo_frente: duplicateSameFrontDifferentId,
        existe_otro_frente_mismo_numero: !!existingOtherFront,
        action: actionVisible
      })
      const resultVisible = await saveFront(visiblePayload, actionVisible)
      if (!resultVisible.ok) {
        throw new Error(String(resultVisible?.body?.error || `Error guardando ${currentFront} (${resultVisible.status})`))
      }
      const visibleVersioning = (resultVisible?.body && typeof resultVisible.body === "object")
        ? (resultVisible.body as any)?._versioning
        : null

      if (false) console.debug("[daily-report][save-fronts]", {
        visibleFront: currentFront,
        action: actionVisible,
        savedFrontId: String(resultVisible?.body?.id || visiblePayload?.id || ""),
        oppositeFront,
        oppositeWasCreated: false,
        oppositeWasSynced: false,
        syncedOtherFrontId: "",
        modalRemainsOpen: true,
        savedFrontStatus: { [currentFront]: true },
        hh_day: Number(currentPayloadBase.hh_day || 0),
        hh_productive: Number(currentPayloadBase.hh_productive || 0),
        source_field_report_ids: currentPayloadBase.source_field_report_ids || [],
        summary: visibleSummarySnapshot,
        equip: {
          major_qty: visibleSummarySnapshot.equip_major_qty,
          major_hm: visibleSummarySnapshot.equip_major_hm,
          minor_qty: visibleSummarySnapshot.equip_minor_qty,
          minor_hm: visibleSummarySnapshot.equip_minor_hm,
          total_qty: visibleSummarySnapshot.equip_total_qty,
          total_hm: visibleSummarySnapshot.equip_total_hm
        }
      })

      await loadRecords(true)
      const savedFrontId = String(resultVisible?.body?.id || visiblePayload?.id || "")
      setFrontSavedStatus((prev) => ({ ...prev, [currentFront]: true }))
      setFrontRecordIds((prev) => ({
        ...prev,
        [currentFront]: savedFrontId || prev[currentFront]
      }))
      if (editingId) {
        setEditSessionSavedFronts((prev) => ({
          ...prev,
          [currentFront]: true
        }))
      }
      setFrontBaselineHashes((prev) => ({ ...prev, [currentFront]: formHash(form) }))
      setFrontDraftForms((prev) => ({
        ...prev,
        [currentFront]: form
      }))
      setSavedIndirectHoursSettingsKey(stableIndirectHoursSettingsKey(indirectHoursOverrides, indirectHoursFrontApplyScope, indirectHoursFrontOverrides))
      showToast(editingId ? `${currentFront} guardado. Guarda el otro frente para finalizar la edición enlazada.` : `${currentFront} guardado.`, "success")
      if (actionVisible === "PUT" && visibleVersioning && visibleVersioning.saved === false) {
        const reason = String(visibleVersioning?.reason || "desconocida")
        showToast(`Advertencia: se guardó el reporte, pero no se creó versión de historial (${reason}).`, "info")
      }
    } catch (err: any) {
      showToast(err?.message || "Error guardando", "error")
    } finally {
      setSaving(false)
    }
  }


  const openHistory = async (record: DailyReportRecord) => {
    if (!isAdminRole) return
    setHistoryReportLabel(`Reporte ${record.report_no || "-"} - ${record.report_date || "-"}`)
    setHistoryRows([])
    setHistoryDeletionRows([])
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/daily-reports?history_report_id=${encodeURIComponent(String(record.id))}`, { cache: "no-store" })
      const json = await res.json().catch(() => [])
      if (!res.ok) throw new Error(String((json as any)?.error || "No se pudo cargar el historial"))
      setHistoryRows(Array.isArray(json) ? json : [])
      setHistoryDeletionRows([])
    } catch (err: any) {
      showToast(err?.message || "No se pudo cargar el historial", "error")
      setHistoryRows([])
      setHistoryDeletionRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const openHistoryByDate = async (record: DailyReportRecord) => {
    if (!isAdminRole) return
    const dateKey = String(record?.report_date || "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      showToast("No se pudo determinar la fecha del historial.", "error")
      return
    }
    setHistoryReportLabel(`Fecha ${formatDateDisplay(dateKey)} - ambos frentes`)
    setHistoryRows([])
    setHistoryDeletionRows([])
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/daily-reports?history_report_date=${encodeURIComponent(dateKey)}`, { cache: "no-store" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String((json as any)?.error || "No se pudo cargar el historial por fecha"))
      setHistoryRows(Array.isArray((json as any)?.versions) ? (json as any).versions : [])
      setHistoryDeletionRows(Array.isArray((json as any)?.deletions) ? (json as any).deletions : [])
    } catch (err: any) {
      showToast(err?.message || "No se pudo cargar el historial por fecha", "error")
      setHistoryRows([])
      setHistoryDeletionRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const openHistoryVersionReadOnly = (row: DailyReportVersion) => {
    const snapshot = (row.new_data && Object.keys(row.new_data).length > 0 ? row.new_data : row.previous_data) as DailyReportRecord | null
    if (!snapshot) {
      showToast("La versión seleccionada no tiene snapshot disponible", "error")
      return
    }

    const normalized = hydrateStrictViewFormFromRecord(snapshot as DailyReportRecord)
    setReportTemplate(inferTemplateFromRecord(snapshot))
    setEditingId(null)
    setEditSourceMode("snapshot")
    setForm(normalized)
    const indirectSettings = getSavedIndirectHoursSettings(snapshot)
    setIndirectHoursOverrides(indirectSettings.overrides)
    setIndirectHoursOverridesDraft(indirectSettings.overrides)
    setIndirectHoursFrontOverrides(indirectSettings.frontOverrides)
    setIndirectHoursFrontOverridesDraft(indirectSettings.frontOverrides)
    setIndirectHoursFrontApplyScope(indirectSettings.frontApplyScope)
    setSavedIndirectHoursSettingsKey(stableIndirectHoursSettingsKey(indirectSettings.overrides, indirectSettings.frontApplyScope, indirectSettings.frontOverrides))
    const notes = (snapshot as any)?.notes && typeof (snapshot as any).notes === "object" ? (snapshot as any).notes : {}
    const evidenceByLine = (notes?.daily_activity_images && typeof notes.daily_activity_images === "object")
      ? notes.daily_activity_images
      : {}
    setDailyActivityEvidenceByLineKey(evidenceByLine as Record<string, EvidenceFileLite[]>)
    setViewRecord({
      ...(snapshot as DailyReportRecord),
      id: String((snapshot as any)?.id || row.daily_report_id || row.id)
    })
    setHistoryViewMeta({ versionNo: row.version_no, createdAt: row.created_at || null })
    setHistoryOpen(false)
    setViewOpen(true)
  }

  const restoreHistoryVersion = async (row: DailyReportVersion) => {
    const snapshot = (row.new_data && Object.keys(row.new_data).length > 0 ? row.new_data : row.previous_data) as Record<string, any> | null
    if (!snapshot) {
      showToast("La versión seleccionada no tiene snapshot disponible", "error")
      return
    }
    const targetId = String(row.daily_report_id || snapshot?.id || "").trim()
    if (!targetId) {
      showToast("No se pudo identificar el reporte a restaurar", "error")
      return
    }
    const ok = window.confirm(`Restaurar la versión ${row.version_no}? Esto reemplazará el reporte actual de ese frente.`)
    if (!ok) return

    setRestoringVersionId(row.id)
    try {
      const payload = {
        ...snapshot,
        id: targetId
      }
      delete (payload as any)._versioning
      const res = await fetch("/api/daily-reports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(String((json as any)?.error || "No se pudo restaurar la versión"))
      showToast(`Versión ${row.version_no} restaurada`, "success")
      setHistoryOpen(false)
      setViewOpen(false)
      setHistoryViewMeta(null)
      await loadRecords(true)
    } catch (err: any) {
      showToast(err?.message || "No se pudo restaurar la versión", "error")
    } finally {
      setRestoringVersionId(null)
    }
  }

  const closeViewDialog = () => {
    setViewOpen(false)
    setViewRecord(null)
    setHistoryViewMeta(null)
  }

  const handleExportExcel = async (
    recordId: string,
    templateOverride?: "daily_v1" | "daily_v2",
    exportTarget: "daily" | "combined" = "daily"
  ) => {
    if (!canExportDailyReport) return
    if (!recordId || exporting) return
    setActiveActionRecordId(recordId)
    setExporting(true)
    try {
      const selected = records.find((r) => r.id === recordId)
      const template = templateOverride || (selected ? inferTemplateFromRecord(selected) : "daily_v1")
      const toSnapshotNumber = (value: unknown) => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0
        const raw = String(value ?? "").trim()
        if (!raw) return 0
        const normalized = raw.replace(/\s+/g, "").replace(",", ".")
        const parsed = Number(normalized)
        return Number.isFinite(parsed) ? parsed : 0
      }
      const buildDetailRowSnapshot = (
        row: any,
        overrides?: Partial<{ instalacionFaena: number; frente: number; nocFront: number; dotacionTotalObra: number; hhTotalObra: number }>
      ) => ({
        discipline: String(row?.discipline || "").trim(),
        specialty: String(row?.specialty || "").trim(),
        position: String(row?.position || "SIN CARGO").trim() || "SIN CARGO",
        hhTurnoDia: toSnapshotNumber(row?.hhTurnoDia) || resolvePersonWorkdayHours(form),
        contratados: toSnapshotNumber(row?.contratados),
        contratacionProceso: toSnapshotNumber(row?.contratacionProceso),
        apoyoOficina: toSnapshotNumber(row?.apoyoOficina),
        descansoCambioTurno: toSnapshotNumber(row?.descansoCambioTurno),
        permisoCovid: toSnapshotNumber(row?.permisoCovid),
        renunciaVoluntaria: toSnapshotNumber(row?.renunciaVoluntaria),
        terminoContrato: toSnapshotNumber(row?.terminoContrato),
        enCurso3d: toSnapshotNumber(row?.enCurso3d),
        capacitacionAcreditacion: toSnapshotNumber(row?.capacitacionAcreditacion),
        teletrabajo: toSnapshotNumber(row?.teletrabajo),
        pruebaPractica: toSnapshotNumber(row?.pruebaPractica),
        ofertaComercial: toSnapshotNumber(row?.ofertaComercial),
        instalacionFaena: toSnapshotNumber(overrides?.instalacionFaena ?? row?.instalacionFaena),
        frente: toSnapshotNumber(overrides?.frente ?? row?.frente),
        nocFront: toSnapshotNumber(overrides?.nocFront ?? row?.nocFront),
        dotacionTotalObra: toSnapshotNumber(overrides?.dotacionTotalObra ?? row?.dotacionTotalObra),
        hhTotalObra: toSnapshotNumber(overrides?.hhTotalObra ?? row?.hhTotalObra)
      })
      const buildLiveV2Override = () => {
        const persistedNotes = (viewRecord as any)?.notes && typeof (viewRecord as any).notes === "object" ? (viewRecord as any).notes : {}
        const persistedRuntime = (viewRecord as any)?.v2_runtime_snapshot && typeof (viewRecord as any).v2_runtime_snapshot === "object" ? (viewRecord as any).v2_runtime_snapshot : {}
        const persistedFormSnap = (viewRecord as any)?.v2_form_snapshot && typeof (viewRecord as any).v2_form_snapshot === "object" ? (viewRecord as any).v2_form_snapshot : {}
        const pickS4 = (key: string, fallback: number) => {
          const direct = Number((viewRecord as any)?.[key])
          if (Number.isFinite(direct)) return direct
          const n1 = Number(persistedNotes?.[key])
          if (Number.isFinite(n1)) return n1
          const n2 = Number(persistedRuntime?.[key])
          if (Number.isFinite(n2)) return n2
          const n3 = Number(persistedFormSnap?.[key])
          if (Number.isFinite(n3)) return n3
          return fallback
        }
        const s4PrevMajorHm = pickS4("s4_prev_major_hm", Number(v2SummaryMetrics.previous.majorHm || 0))
        const s4PrevMinorHm = pickS4("s4_prev_minor_hm", Number(v2SummaryMetrics.previous.minorHm || 0))
        const s4PrevTotalHm = pickS4("s4_prev_total_hm", Number(v2SummaryMetrics.previous.equipmentHm || 0))
        const s4CurrMajorHm = pickS4("s4_curr_major_hm", Number(effectiveV2SummaryMetrics.current.majorHm || 0))
        const s4CurrMinorHm = pickS4("s4_curr_minor_hm", Number(effectiveV2SummaryMetrics.current.minorHm || 0))
        const s4CurrTotalHm = pickS4("s4_curr_total_hm", Number(effectiveV2SummaryMetrics.current.equipmentHm || 0))
        const s4Snapshot = {
          s4_prev_indirect_dot: pickS4("s4_prev_indirect_dot", Number(v2SummaryMetrics.previous.indirectDot || 0)),
          s4_prev_indirect_hh: pickS4("s4_prev_indirect_hh", Number(v2SummaryMetrics.previous.indirectHh || 0)),
          s4_prev_direct_dot: pickS4("s4_prev_direct_dot", Number(v2SummaryMetrics.previous.directDot || 0)),
          s4_prev_direct_hh: pickS4("s4_prev_direct_hh", Number(v2SummaryMetrics.previous.directHh || 0)),
          s4_prev_total_dot: pickS4("s4_prev_total_dot", Number(v2SummaryMetrics.previous.totalDot || 0)),
          s4_prev_total_hh: pickS4("s4_prev_total_hh", Number(v2SummaryMetrics.previous.totalHh || 0)),
          s4_prev_major_equip: Number(resolveMachineDotationFromHours(s4PrevMajorHm, form).toFixed(2)),
          s4_prev_major_hm: s4PrevMajorHm,
          s4_prev_minor_equip: Number(resolveMachineDotationFromHours(s4PrevMinorHm, form).toFixed(2)),
          s4_prev_minor_hm: s4PrevMinorHm,
          s4_prev_total_equip: Number(resolveMachineDotationFromHours(s4PrevTotalHm, form).toFixed(2)),
          s4_prev_total_hm: s4PrevTotalHm,
          s4_curr_indirect_dot: pickS4("s4_curr_indirect_dot", Number(effectiveV2SummaryMetrics.current.indirectDot || 0)),
          s4_curr_indirect_hh: pickS4("s4_curr_indirect_hh", Number(effectiveV2SummaryMetrics.current.indirectHh || 0)),
          s4_curr_direct_dot: pickS4("s4_curr_direct_dot", Number(effectiveV2SummaryMetrics.current.directDot || 0)),
          s4_curr_direct_hh: pickS4("s4_curr_direct_hh", Number(effectiveV2SummaryMetrics.current.directHh || 0)),
          s4_curr_total_dot: pickS4("s4_curr_total_dot", Number(effectiveV2SummaryMetrics.current.totalDot || 0)),
          s4_curr_total_hh: pickS4("s4_curr_total_hh", Number(effectiveV2SummaryMetrics.current.totalHh || 0)),
          s4_curr_major_equip: Number(resolveMachineDotationFromHours(s4CurrMajorHm, form).toFixed(2)),
          s4_curr_major_hm: s4CurrMajorHm,
          s4_curr_minor_equip: Number(resolveMachineDotationFromHours(s4CurrMinorHm, form).toFixed(2)),
          s4_curr_minor_hm: s4CurrMinorHm,
          s4_curr_total_equip: Number(resolveMachineDotationFromHours(s4CurrTotalHm, form).toFixed(2)),
          s4_curr_total_hm: s4CurrTotalHm
        }
        const buildV2EquipmentRowSnapshot = (row: any) => {
          const hmTurnoDia = toSnapshotNumber(row?.hmTurnoDia)
          const instalacionFaena = toSnapshotNumber(row?.instalacionFaena)
          const mainFront = toSnapshotNumber(row?.mainFront)
          const nocFront = toSnapshotNumber(row?.nocFront)
          const dynamicFrontValues = Array.isArray(row?.dynamicFrontValues)
            ? row.dynamicFrontValues.map((value: any) => toSnapshotNumber(value))
            : []
          const dynamicFrontTotal = dynamicFrontValues.length > 0
            ? dynamicFrontValues.reduce((acc: number, value: number) => acc + Number(value || 0), 0)
            : nocFront
          const totalEqMaq = toSnapshotNumber(row?.totalEqMaq ?? (instalacionFaena + mainFront + dynamicFrontTotal))
          return {
            name: String(row?.name || "").trim(),
            hmTurnoDia,
            totalEquipos: toSnapshotNumber(row?.totalEquipos),
            operacion: toSnapshotNumber(row?.operacion),
            disponibles: toSnapshotNumber(row?.disponibles),
            acredMant: toSnapshotNumber(row?.acredMant),
            panne: toSnapshotNumber(row?.panne),
            ofCentral: toSnapshotNumber(row?.ofCentral),
            instalacionFaena,
            mainFront,
            nocFront,
            dynamicFrontValues,
            totalEqMaq,
            hmTotal: toSnapshotNumber(row?.hmTotal ?? (totalEqMaq * hmTurnoDia))
          }
        }
        const persistedMajorEquipmentRowsForExport = getPersistedRowsGenericFromForm(form, "v2_detail_major_equipment_rows")
        const persistedMinorEquipmentRowsForExport = getPersistedRowsGenericFromForm(form, "v2_detail_minor_equipment_rows")
        if (viewOpen && (persistedMajorEquipmentRowsForExport.length === 0 || persistedMinorEquipmentRowsForExport.length === 0)) {
          throw new Error("Este reporte no tiene snapshot guardado de maquinaria/equipos. Abre Editar y guarda una vez para congelarlo.")
        }
        const fallbackMajorEquipmentRowsSnapshot = [
          { name: "Retroexcavadora PDGV-54", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Grua Horquilla RKRL-48", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0, mainFront: form.work_front === "CANALETAS" ? 1 : 0 },
          { name: "Camion Pluma RGJD-42", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0, mainFront: form.work_front === "CANALETAS" ? 1 : 0 },
          { name: "Camion Aljibe HSDC-63", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Camion Tolva TSJH-64", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Cargador Frontal VTCZ-83", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Excavadora TRSV-73", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Camion 3/4 VFHR-70", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Tracto Pluma TVFX-62", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 }
        ].map((row) => buildV2EquipmentRowSnapshot(row))
        const fallbackMinorEquipmentRowsSnapshot = [
          { name: "Camioneta RSXY31", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Camioneta TGJK47", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Camioneta RRZT32", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Camioneta TGJK56", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Camioneta TYTL46", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "BUS PFXD84", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Rodillo RC", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Placa Comp 3500kg N°100341920599", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Placa Comp 5500kg N°11487266", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 2, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Placa Comp 5500kg N°11815737", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 2, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
          { name: "Container", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 25, operacion: 0, disponibles: 25, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 6, mainFront: 4 },
          { name: "BUS SHYW97", hmTurnoDia: activeMachineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 }
        ].map((row) => buildV2EquipmentRowSnapshot(row))
        const v2MajorEquipmentRowsSnapshot =
          viewOpen && persistedMajorEquipmentRowsForExport.length > 0
            ? persistedMajorEquipmentRowsForExport.map((row) => buildV2EquipmentRowSnapshot(row))
            : fallbackMajorEquipmentRowsSnapshot
        const v2MinorEquipmentRowsSnapshot =
          viewOpen && persistedMinorEquipmentRowsForExport.length > 0
            ? persistedMinorEquipmentRowsForExport.map((row) => buildV2EquipmentRowSnapshot(row))
            : fallbackMinorEquipmentRowsSnapshot
        const visibleMajorEquipmentRowsSnapshot = v2MajorEquipmentRowsSnapshot.filter((row) => String(row?.name || '').trim())
        const visibleMinorEquipmentRowsSnapshot = v2MinorEquipmentRowsSnapshot.filter((row) => String(row?.name || '').trim())
        const persistedIndirectRows = getPersistedV2RowsFromForm(form, "v2_detail_indirect_rows")
        const persistedDirectRows = getPersistedV2RowsFromForm(form, "v2_detail_direct_rows")
        const usePersistedRowsForViewExport =
          !!viewOpen &&
          hasUsablePersistedV2Rows(persistedIndirectRows) &&
          hasUsablePersistedV2Rows(persistedDirectRows)
        const indirectSourceRows = usePersistedRowsForViewExport ? persistedIndirectRows : (v2IndirectAttendanceRows || [])
        const directSourceRows = usePersistedRowsForViewExport ? persistedDirectRows : (v2DirectAttendanceRows || [])
        const v2DetailIndirectRows = indirectSourceRows.map((row: any) => {
          if (usePersistedRowsForViewExport) return buildDetailRowSnapshot(row)
          const frontValues = getV2DotacionFrenteValues(row as any)
          const visibleInstalacionFaena = Number(frontValues?.[0] || 0)
          const visibleFrente = Number(frontValues?.[1] || 0)
          const visibleNocFront = Number(frontValues?.[2] || 0)
          const visibleDotTotal = visibleInstalacionFaena + visibleFrente
          const visibleHhTotal = visibleDotTotal * activePersonWorkdayHours
          return buildDetailRowSnapshot(row, {
            instalacionFaena: visibleInstalacionFaena,
            frente: visibleFrente,
            nocFront: visibleNocFront,
            dotacionTotalObra: visibleDotTotal,
            hhTotalObra: visibleHhTotal
          })
        })
        const v2DetailDirectRows = directSourceRows.map((row: any) => {
          if (usePersistedRowsForViewExport) return buildDetailRowSnapshot(row)
          const frontValues = getV2DotacionFrenteValues(row as any)
          const visibleInstalacionFaena = Number(frontValues?.[0] || 0)
          const visibleFrente = Number(frontValues?.[1] || 0)
          const visibleNocFront = Number(frontValues?.[2] || 0)
          const visibleDotTotal = visibleInstalacionFaena + visibleFrente
          const visibleHhTotal = visibleDotTotal * activePersonWorkdayHours
          return buildDetailRowSnapshot(row, {
            instalacionFaena: visibleInstalacionFaena,
            frente: visibleFrente,
            nocFront: visibleNocFront,
            dotacionTotalObra: visibleDotTotal,
            hhTotalObra: visibleHhTotal
          })
        })
        const sumDot = (rows: any[]) =>
          Number((rows || []).reduce((acc, row) => acc + Number(row?.dotacionTotalObra || 0), 0).toFixed(2))
        const sumHh = (rows: any[]) =>
          Number((rows || []).reduce((acc, row) => {
            const hh = Number(row?.hhTotalObra || 0)
            if (Number.isFinite(hh) && hh > 0) return acc + hh
            return acc + (Number(row?.dotacionTotalObra || 0) * activePersonWorkdayHours)
          }, 0).toFixed(2))
        const indirectDot = sumDot(v2DetailIndirectRows)
        const directDot = sumDot(v2DetailDirectRows)
        const indirectHh = sumHh(v2DetailIndirectRows)
        const directHh = sumHh(v2DetailDirectRows)
        const visibleExportSummarySnapshot = {
          summary_indirect_dotation: String(indirectDot),
          summary_indirect_hh: String(indirectHh),
          summary_direct_dotation: String(directDot),
          summary_direct_hh: String(directHh),
          summary_total_dotation: String(Number((indirectDot + directDot).toFixed(2))),
          summary_total_hh: String(Number((indirectHh + directHh).toFixed(2)))
        }
        const signerSnapshot = {
          prepared_by_name: form.prepared_by_name || "",
          prepared_by_role: form.prepared_by_role || "",
          prepared_by_date: form.prepared_by_date || form.report_date || selected?.report_date || "",
          approved_by_name: form.approved_by_name || "",
          approved_by_role: form.approved_by_role || "",
          approved_by_date: form.approved_by_date || form.report_date || selected?.report_date || "",
          validated_by_name: form.validated_by_name || "",
          validated_by_role: form.validated_by_role || "",
          validated_by_date: form.validated_by_date || form.report_date || selected?.report_date || "",
          prepared_by_signature_url: form.prepared_by_signature_url || "",
          approved_by_signature_url: form.approved_by_signature_url || ""
        }
        const hasNocInExportRows = [...v2DetailIndirectRows, ...v2DetailDirectRows]
          .some((row: any) => Number(row?.nocFront || 0) > 0)
        const overrideDynamicFrontColumns = parseDynamicFrontColumns(
          (form as any)?.v2_dynamic_front_columns ??
          (viewRecord as any)?.v2_dynamic_front_columns ??
          persistedRuntime?.v2_dynamic_front_columns ??
          persistedFormSnap?.v2_dynamic_front_columns ??
          persistedNotes?.v2_dynamic_front_columns
        )
        const overrideDynamicFrontColumnsByBlock =
          parseDynamicFrontColumnsByBlock(
            (form as any)?.v2_dynamic_front_columns_by_block ??
            (viewRecord as any)?.v2_dynamic_front_columns_by_block ??
            persistedRuntime?.v2_dynamic_front_columns_by_block ??
            persistedFormSnap?.v2_dynamic_front_columns_by_block ??
            persistedNotes?.v2_dynamic_front_columns_by_block
          ) ||
          (overrideDynamicFrontColumns.length > 0 ? splitDynamicFrontColumnsByBlock(overrideDynamicFrontColumns) : null)
        const overrideActiveFront = form.work_front === "PISCINAS" ? "PISCINAS" : "CANALETAS"
        const overrideActiveDynamicFrontColumns = overrideDynamicFrontColumnsByBlock?.[overrideActiveFront] || []
        const hasStructuredDynamicFrontColumnsForOverride =
          overrideDynamicFrontColumns.length > 0 ||
          Boolean(
            (overrideDynamicFrontColumnsByBlock?.CANALETAS?.length || 0) +
            (overrideDynamicFrontColumnsByBlock?.PISCINAS?.length || 0)
          )
        const exportHasNocFrontColumn = viewOpen
          ? (
              overrideActiveDynamicFrontColumns.length > 0 ||
              (!hasStructuredDynamicFrontColumnsForOverride && Boolean(hasNocFrontColumn))
            )
          : (
              overrideActiveDynamicFrontColumns.length > 0 ||
              (!hasStructuredDynamicFrontColumnsForOverride && Boolean(hasNocFrontColumn && hasNocInExportRows))
            )
        if (false) console.log("[daily-report][excel-v2][live-indirect-overrides]", {
          activeOverrides: Object.keys(indirectHoursOverrides || {}).length,
          sample: v2DetailIndirectRows.slice(0, 8).map((row: any) => ({
            position: row.position,
            instalacionFaena: row.instalacionFaena,
            frente: row.frente,
            dotacionTotalObra: row.dotacionTotalObra,
            hhTotalObra: row.hhTotalObra
          }))
        })
        return {
          id: recordId,
          ...s4Snapshot,
          report_no: form.report_no || selected?.report_no,
          revision: form.revision || selected?.revision,
          report_date: form.report_date || selected?.report_date,
          contractor_name: form.contractor_name || selected?.contractor_name,
          contractor_logo_url: form.contractor_logo_url || selected?.contractor_logo_url,
          client_name: form.client_name || selected?.client_name,
          client_logo_url: form.client_logo_url || selected?.client_logo_url,
          project_name: form.project_name || selected?.project_name,
          contract_title: form.contract_title || selected?.contract_title,
          contract_number: form.contract_number || selected?.contract_number,
          work_calendar: form.work_calendar || selected?.work_calendar,
          weather_label: form.weather_label || selected?.weather_label,
          source_field_report_ids: form.source_field_report_ids || selected?.source_field_report_ids || [],
          v2_dynamic_front_columns: overrideDynamicFrontColumns,
          v2_dynamic_front_columns_by_block: overrideDynamicFrontColumnsByBlock || undefined,
          notes: {
            report_template: "daily_v2",
            work_front: form.work_front,
            report_format_code: form.report_format_code,
            v2_has_noc_front_column: exportHasNocFrontColumn,
            v2_noc_front_column_label: nocFrontColumnLabel || "UDR NOC",
            v2_dynamic_front_columns: overrideDynamicFrontColumns,
            v2_dynamic_front_columns_by_block: overrideDynamicFrontColumnsByBlock || undefined,
            indirect_hours_overrides: indirectHoursOverrides,
            indirect_hours_front_apply_scope: indirectHoursFrontApplyScope,
            indirect_hours_front_overrides: indirectHoursFrontOverrides,
            ...signerSnapshot,
            ...visibleExportSummarySnapshot,
            equip_major_qty: form.equip_major_qty,
            equip_major_hm: form.equip_major_hm,
            equip_minor_qty: form.equip_minor_qty,
            equip_minor_hm: form.equip_minor_hm,
            equip_total_qty: form.equip_total_qty,
            equip_total_hm: form.equip_total_hm,
            ...s4Snapshot,
            v2_detail_indirect_rows: v2DetailIndirectRows,
            v2_detail_direct_rows: v2DetailDirectRows,
            v2_detail_major_equipment_rows: visibleMajorEquipmentRowsSnapshot,
            v2_detail_minor_equipment_rows: visibleMinorEquipmentRowsSnapshot
          },
          v2_runtime_snapshot: {
            report_template: "daily_v2",
            work_front: form.work_front,
            report_format_code: form.report_format_code,
            v2_has_noc_front_column: exportHasNocFrontColumn,
            v2_noc_front_column_label: nocFrontColumnLabel || "UDR NOC",
            v2_dynamic_front_columns: overrideDynamicFrontColumns,
            v2_dynamic_front_columns_by_block: overrideDynamicFrontColumnsByBlock || undefined,
            source_field_report_ids: form.source_field_report_ids || selected?.source_field_report_ids || [],
            ...s4Snapshot,
            ...visibleExportSummarySnapshot,
            ...signerSnapshot,
            indirect_hours_overrides: indirectHoursOverrides,
            indirect_hours_front_apply_scope: indirectHoursFrontApplyScope,
            indirect_hours_front_overrides: indirectHoursFrontOverrides,
            v2_detail_indirect_rows: v2DetailIndirectRows,
            v2_detail_direct_rows: v2DetailDirectRows,
            v2_detail_major_equipment_rows: visibleMajorEquipmentRowsSnapshot,
            v2_detail_minor_equipment_rows: visibleMinorEquipmentRowsSnapshot
          },
          v2_form_snapshot: {
            work_front: form.work_front,
            report_format_code: form.report_format_code,
            v2_has_noc_front_column: exportHasNocFrontColumn,
            v2_noc_front_column_label: nocFrontColumnLabel || "UDR NOC",
            v2_dynamic_front_columns: overrideDynamicFrontColumns,
            v2_dynamic_front_columns_by_block: overrideDynamicFrontColumnsByBlock || undefined,
            ...s4Snapshot,
            ...visibleExportSummarySnapshot,
            ...signerSnapshot,
            indirect_hours_overrides: indirectHoursOverrides,
            indirect_hours_front_apply_scope: indirectHoursFrontApplyScope,
            indirect_hours_front_overrides: indirectHoursFrontOverrides,
            v2_detail_indirect_rows: v2DetailIndirectRows,
            v2_detail_direct_rows: v2DetailDirectRows,
            v2_detail_major_equipment_rows: visibleMajorEquipmentRowsSnapshot,
            v2_detail_minor_equipment_rows: visibleMinorEquipmentRowsSnapshot
          }
        }
      }
      const validateLiveV2Override = (override: any) => {
        const indirectRows = Array.isArray(override?.notes?.v2_detail_indirect_rows) ? override.notes.v2_detail_indirect_rows : []
        const directRows = Array.isArray(override?.notes?.v2_detail_direct_rows) ? override.notes.v2_detail_direct_rows : []
        const majorRows = Array.isArray(override?.notes?.v2_detail_major_equipment_rows) ? override.notes.v2_detail_major_equipment_rows : []
        const minorRows = Array.isArray(override?.notes?.v2_detail_minor_equipment_rows) ? override.notes.v2_detail_minor_equipment_rows : []

        if (indirectRows.length === 0) throw new Error("Validación previa: no hay filas visibles de personal indirecto.")
        if (directRows.length === 0) throw new Error("Validación previa: no hay filas visibles de personal directo.")
        if (majorRows.length === 0) throw new Error("Validación previa: no hay filas visibles de equipo mayor.")
        if (minorRows.length === 0) throw new Error("Validación previa: no hay filas visibles de equipo menor.")
      }
      const exportEndpoint = exportTarget === "combined"
        ? "/api/daily-reports/export-combined"
        : "/api/daily-reports/export"
      const exportUrl = `${exportEndpoint}?id=${encodeURIComponent(recordId)}&debug=1&template=${encodeURIComponent(template)}${template === "daily_v2" ? "&strict_visible=1" : ""}`
      const res = template === "daily_v2"
        ? await (() => {
            const override = buildLiveV2Override()
            validateLiveV2Override(override)
            return fetch(exportUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reportOverride: override })
            })
          })()
        : await fetch(exportUrl)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(String(json?.error || "No se pudo exportar"))
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const sourceForFileName = viewRecord || selected || form
      const reportNoForFile = String((sourceForFileName as any)?.report_no || form.report_no || selected?.report_no || "0")
      const reportDateForFile = String((sourceForFileName as any)?.report_date || form.report_date || selected?.report_date || todayKey())
      const revisionForFile = String((sourceForFileName as any)?.revision || form.revision || selected?.revision || "0")
      const frontRawForFile = String(
        (sourceForFileName as any)?.work_front ||
        (sourceForFileName as any)?.notes?.work_front ||
        form.work_front ||
        ""
      ).toUpperCase()
      const frontForFile = frontRawForFile === "PISCINAS" ? "PISCINAS" : "CANALETAS"
      const formatPrefix = frontForFile === "PISCINAS" ? "ANT-GPRO-FOR-PISCINAS" : "ANT-GPRO-FOR CANALETAS"
      const fileName = `${formatPrefix} ${reportNoForFile} Daily Report ${formatExportDateDots(reportDateForFile)} Rev ${revisionForFile}.xlsx`
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast("Excel exportado correctamente", "success")
    } catch (err: any) {
      showToast(err?.message || "Error exportando Excel", "error")
    } finally {
      setExporting(false)
      setActiveActionRecordId(null)
    }
  }

  const handleExportExcelV2FromView = async () => {
    if (!viewRecord?.id) {
      showToast("No hay reporte abierto para exportar", "error")
      return
    }
    await handleExportExcel(String(viewRecord.id), "daily_v2")
  }

  const handleExportCombinedExcelV2FromView = async () => {
    if (!viewRecord?.id) {
      showToast("No hay reporte abierto para exportar", "error")
      return
    }
    await handleExportExcel(String(viewRecord.id), "daily_v2", "combined")
  }

  const openView = async (recordSummary: DailyReportRecord) => {
    if (exporting) return
    setActiveActionRecordId(String(recordSummary.id || ""))
    try {
      const record = await fetchDailyReportDetail(String(recordSummary.id || ""))
      setEditingId(null)
      setEditSourceMode("snapshot")
      setHistoryViewMeta(null)
      setReportTemplate(inferTemplateFromRecord(record))
      const normalized = hydrateStrictViewFormFromRecord(record)
      setForm(normalized)
      const indirectSettings = getSavedIndirectHoursSettings(record)
      setIndirectHoursOverrides(indirectSettings.overrides)
      setIndirectHoursOverridesDraft(indirectSettings.overrides)
      setIndirectHoursFrontOverrides(indirectSettings.frontOverrides)
      setIndirectHoursFrontOverridesDraft(indirectSettings.frontOverrides)
      setIndirectHoursFrontApplyScope(indirectSettings.frontApplyScope)
      setSavedIndirectHoursSettingsKey(stableIndirectHoursSettingsKey(indirectSettings.overrides, indirectSettings.frontApplyScope, indirectSettings.frontOverrides))
      const notes = (record as any)?.notes && typeof (record as any).notes === "object" ? (record as any).notes : {}
      const evidenceByLine = (notes?.daily_activity_images && typeof notes.daily_activity_images === "object")
        ? notes.daily_activity_images
        : {}
      setDailyActivityEvidenceByLineKey(evidenceByLine as Record<string, EvidenceFileLite[]>)
      setViewRecord(record)
      setViewOpen(true)
    } catch (err: any) {
      setViewOpen(false)
      setViewRecord(null)
      showToast(err?.message || "No se pudo abrir el reporte", "error")
    } finally {
      setActiveActionRecordId(null)
    }
  }

  const handleDeleteReportsByDate = async (record: DailyReportRecord) => {
    if (!canMutateDailyReport) return
    if (exporting || saving) return
    const dateKey = String(record?.report_date || "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      showToast("No se pudo determinar la fecha del reporte.", "error")
      return
    }

    const linkedRecords = records.filter((row) => String(row?.report_date || "").slice(0, 10) === dateKey)
    const fronts = Array.from(new Set(linkedRecords.map((row) => detectRecordFrontStrict(row) || getRecordFront(row)))).filter(Boolean)
    const frontsLabel = fronts.length > 0 ? fronts.join(" y ") : "los frentes enlazados"
    const countLabel = linkedRecords.length === 1 ? "1 reporte" : `${linkedRecords.length} reportes`
    const shouldDelete = window.confirm(
      `Se eliminarán ${countLabel} de la fecha ${formatDateDisplay(dateKey)} (${frontsLabel}). ¿Deseas continuar?`
    )
    if (!shouldDelete) return

    const deleteReason = window.prompt(
      "Motivo de eliminación para auditoría:",
      `Eliminación por fecha ${formatDateDisplay(dateKey)}`
    )
    if (deleteReason === null) return

    setSaving(true)
    setActiveActionRecordId(String(record.id || ""))
    try {
      const params = new URLSearchParams({
        delete_scope: "date",
        report_date: dateKey,
        delete_source: "daily_report_date_action",
        delete_reason: String(deleteReason || `Eliminación por fecha ${formatDateDisplay(dateKey)}`)
      })
      const res = await fetch(`/api/daily-reports?${params.toString()}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String((json as any)?.error || "No se pudieron eliminar los reportes de la fecha"))
      await loadRecords(true)
      showToast(`Se eliminaron ${Number((json as any)?.deleted_count || linkedRecords.length)} reportes de ${formatDateDisplay(dateKey)} con respaldo de auditoría.`, "success")
    } catch (err: any) {
      showToast(err?.message || "No se pudieron eliminar los reportes.", "error")
    } finally {
      setSaving(false)
      setActiveActionRecordId(null)
    }
  }

  const bothFrontsSaved = frontSavedStatus.CANALETAS && frontSavedStatus.PISCINAS
  const editBothFrontsSaved = editSessionSavedFronts.CANALETAS && editSessionSavedFronts.PISCINAS
  const closeFormModal = async () => {
    // En modo edición nunca se debe eliminar registros al cancelar.
    if (editingId) {
      const editedFrontEntries = ([
        ["CANALETAS", frontRecordIds.CANALETAS, editSessionSavedFronts.CANALETAS, editSessionOriginalByFront.CANALETAS],
        ["PISCINAS", frontRecordIds.PISCINAS, editSessionSavedFronts.PISCINAS, editSessionOriginalByFront.PISCINAS]
      ] as const).filter(([, id, saved, original]) => Boolean(id) && Boolean(saved) && Boolean(original))
      if (editedFrontEntries.length > 0) {
        const labels = editedFrontEntries.map(([front]) => front).join(" y ")
        const shouldRestore = window.confirm(`Se restaurará la versión anterior del frente ${labels}. ¿Deseas continuar?`)
        if (!shouldRestore) return
        setSaving(true)
        try {
          for (const [, id, , original] of editedFrontEntries) {
            const payload = { ...(original as any), id: String(id) }
            delete (payload as any)._versioning
            const res = await fetch("/api/daily-reports", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(String((json as any)?.error || `No se pudo restaurar el frente ${id}`))
          }
          await loadRecords(true)
          showToast("Se restauró la versión anterior del reporte editado.", "success")
        } catch (err: any) {
          showToast(err?.message || "No se pudo restaurar la versión anterior.", "error")
          return
        } finally {
          setSaving(false)
        }
      }
      setFormOpen(false)
      return
    }

    const savedFrontEntries = ([
      ["CANALETAS", frontRecordIds.CANALETAS, frontSavedStatus.CANALETAS],
      ["PISCINAS", frontRecordIds.PISCINAS, frontSavedStatus.PISCINAS]
    ] as const).filter(([, id, saved]) => Boolean(id) && Boolean(saved))

    if (savedFrontEntries.length === 0) {
      setFormOpen(false)
      return
    }

    const savedFrontLabels = savedFrontEntries.map(([front]) => front).join(" y ")
    const shouldDelete = window.confirm(`Se eliminará lo guardado del frente ${savedFrontLabels}. ¿Deseas continuar?`)
    if (!shouldDelete) return
    const deleteReason = window.prompt(
      "Motivo de eliminación para auditoría:",
      "Cancelación de reporte diario parcialmente guardado"
    )
    if (deleteReason === null) return

    setSaving(true)
    try {
      for (const [, id] of savedFrontEntries) {
        const params = new URLSearchParams({
          id: String(id),
          delete_source: "daily_report_modal_cancel",
          delete_reason: String(deleteReason || "Cancelación de reporte diario parcialmente guardado")
        })
        const res = await fetch(`/api/daily-reports?${params.toString()}`, { method: "DELETE" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String((json as any)?.error || `No se pudo eliminar el reporte ${id}`))
        }
      }
      await loadRecords(true)
      showToast("Se eliminó lo guardado del reporte diario.", "success")
      setFormOpen(false)
    } catch (err: any) {
      showToast(err?.message || "No se pudo eliminar lo guardado.", "error")
    } finally {
      setSaving(false)
    }
  }

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <Box sx={{ display: "flex", minHeight: "70vh", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!canAccess) return null

  return (
    <Box sx={{ display: "flex" }}>
      <Box sx={{ flex: 1 }}>
        <UserHeader title="Reporte diario" />
        <Stack
          direction="row"
          spacing={1}
          sx={{
            position: "fixed",
            top: { xs: 64, sm: 70 },
            right: { xs: 14, sm: 22 },
            zIndex: 1200
          }}
        >
          <Tooltip title="Actualizar lista">
            <IconButton
              color="primary"
              onClick={() => void loadRecords(true)}
              sx={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                bgcolor: colors.blue6,
                color: colors.white,
                boxShadow: "0 8px 22px rgba(29, 78, 216, 0.35)",
                border: `1px solid ${colors.blue4}`,
                "&:hover": { bgcolor: colors.blue4 }
              }}
            >
              <RefreshCw size={20} />
            </IconButton>
          </Tooltip>
          {canMutateDailyReport ? (
            <Tooltip title="Nuevo Reporte Diario">
              <IconButton
                color="primary"
                onClick={openNew}
                sx={{
                  position: "fixed",
                  top: { xs: 64, sm: 70 },
                  right: { xs: 14, sm: 22 },
                  zIndex: 1200,
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  bgcolor: colors.blue1,
                  color: colors.white,
                  border: `2px solid ${colors.blue14}`,
                  boxShadow: "0 10px 24px rgba(0, 26, 51, 0.32)",
                  transition: "border-color 160ms ease, box-shadow 160ms ease",
                  "&:hover": {
                    bgcolor: colors.blue1,
                    borderColor: colors.blue15,
                    boxShadow: "0 10px 28px rgba(125, 211, 252, 0.55)",
                    "& .plus-icon": {
                      color: colors.blue14,
                      transform: "scale(1.18)",
                    },
                  },
                  "&.Mui-disabled": {
                    bgcolor: colors.blue14,
                    color: colors.blue15,
                    borderColor: colors.blue15,
                  },
                }}
              >
                <Plus
                  className="plus-icon"
                  size={25}
                  style={{
                    color: colors.blue14,
                    transition: "color 160ms ease, transform 160ms ease",
                  }}
                />
              </IconButton>
            </Tooltip>
          ) : null}
        </Stack>
        <Box component="main" sx={{ py: { xs: 3.5, sm: 4 }, px: { xs: 1, sm: 1.5, md: 2 } }}>
          <Paper
            variant="outlined"
            sx={{
              mb: { xs: 1.5, sm: 2 },
              mx: "auto",
              px: { xs: 1, sm: 1.25 },
              py: 1,
              width: { xs: "100%", lg: "70%" },
              maxWidth: 1400,
              borderColor: colors.blue15,
              borderRadius: 1.5,
              bgcolor: colors.white
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                flexWrap: { xs: "wrap", md: "nowrap" }
              }}
            >
              <Button
                variant="outlined"
                size="small"
                disabled={!previousDailyReportWeek}
                onClick={() => previousDailyReportWeek && setDailyReportWeekRange(previousDailyReportWeek)}
                startIcon={<ChevronLeft size={16} />}
                sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}
              >
                Semana anterior
              </Button>
              <Typography
                sx={{
                  flex: "1 1 auto",
                  minWidth: { xs: "100%", md: 260 },
                  textAlign: "center",
                  fontSize: { xs: 14, sm: 16 },
                  fontWeight: 500,
                  color: colors.gray4,
                  order: { xs: -1, md: 0 }
                }}
              >
                {dailyReportWeekLabel}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: { xs: "space-between", md: "flex-end" }, gap: 1, flex: { xs: "1 1 100%", md: "0 0 auto" } }}>
                <TextField
                  select
                  size="small"
                  value={dailyReportWeekRange?.start || ""}
                  disabled={dailyReportWeekOptions.length === 0}
                  SelectProps={{
                    renderValue: (value) => {
                      const selected = dailyReportWeekOptions.find((range) => range.start === value)
                      return selected ? `Semana ${getProjectWeekNumber(selected.start)}` : "Semana"
                    }
                  }}
                  onChange={(event) => {
                    const selected = dailyReportWeekOptions.find((range) => range.start === event.target.value)
                    if (selected) setDailyReportWeekRange(selected)
                  }}
                  sx={{
                    width: { xs: "100%", sm: 142, md: 142 },
                    minWidth: { xs: "100%", sm: 142, md: 142 },
                    flex: { xs: "1 1 100%", sm: "0 0 142px" },
                    "& .MuiInputBase-root": { height: 32 },
                    "& .MuiSelect-select": {
                      py: 0.55,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }
                  }}
                >
                  {dailyReportWeekOptions.map((range) => (
                    <MenuItem key={`daily-report-week-${range.start}`} value={range.start}>
                      {`Semana ${getProjectWeekNumber(range.start)} (${formatDateDisplaySlash(range.start)} - ${formatDateDisplaySlash(range.end)})`}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  size="small"
                  disabled={isViewingLatestDailyReportWeek}
                  onClick={() => setDailyReportWeekRange(latestDailyReportWeek)}
                  sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}
                >
                  Última semana
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!nextDailyReportWeek}
                  onClick={() => nextDailyReportWeek && setDailyReportWeekRange(nextDailyReportWeek)}
                  endIcon={<ChevronRight size={16} />}
                  sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}
                >
                  Semana siguiente
                </Button>
              </Box>
            </Box>
          </Paper>
          <Box sx={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, border: `1px solid ${colors.blue13}` }}>
                  <colgroup>
                    <col style={{ width: "1%" }} />
                    <col style={{ width: "1%" }} />
                    <col />
                    <col />
                    <col />
                    <col style={{ width: "1%" }} />
                    <col style={{ width: "1%" }} />
                    <col style={{ width: "1%" }} />
                    <col style={{ width: "1%" }} />
                    {canMutateDailyReport ? <col style={{ width: "1%" }} /> : null}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>Reporte N°</th>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>Fecha</th>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}` }}>Contratista</th>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}` }}>Frente</th>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}` }}>Proyecto</th>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>HH Dir.</th>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>HH Ind.</th>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>HH Total</th>
                      <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>Ver</th>
                      {canMutateDailyReport ? (
                        <th style={{ ...laborBlueBandSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>Acciones</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDailyRecords.map((r, idx) => {
                      const rowFront = detectRecordFrontStrict(r) || getRecordFront(r)
                      const reportBlockChanged = idx > 0 && Number(visibleDailyRecords[idx - 1]?.report_no || 0) !== Number(r?.report_no || 0)
                      const rowBg = rowFront === "PISCINAS"
                        ? colors.blue15
                        : colors.gray10
                      const asNum = (v: unknown) => {
                        const n = Number(v)
                        return Number.isFinite(n) ? n : 0
                      }
                      const formatHhCell = (value: unknown) => {
                        const n = Number(value)
                        if (!Number.isFinite(n)) return "0"
                        const rounded = Number(n.toFixed(2))
                        return Number.isInteger(rounded)
                          ? String(rounded)
                          : String(rounded).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
                      }
                      const notesObj = (r?.notes && typeof r.notes === "object") ? (r.notes as Record<string, any>) : {}
                      const hhDirFromNotes = asNum(notesObj?.summary_direct_hh)
                      const hhIndFromNotes = asNum(notesObj?.summary_indirect_hh)
                      const hhDirFromS4 = Math.max(0, asNum(r?.s4_curr_direct_hh) - asNum(r?.s4_prev_direct_hh))
                      const hhIndFromS4 = Math.max(0, asNum(r?.s4_curr_indirect_hh) - asNum(r?.s4_prev_indirect_hh))
                      const hhDir = hhDirFromNotes > 0 ? hhDirFromNotes : hhDirFromS4
                      const hhInd = hhIndFromNotes > 0 ? hhIndFromNotes : hhIndFromS4
                      const hhTotal = hhDir + hhInd > 0 ? (hhDir + hhInd) : asNum(r?.hh_day)
                      const reportDateKey = String(r?.report_date || "").slice(0, 10)
                      const linkedRecordsForDate = records.filter((row) => String(row?.report_date || "").slice(0, 10) === reportDateKey)
                      const canDeleteDateReports =
                        isAdminRole ||
                        isDevRole ||
                        (isUserRole && linkedRecordsForDate.length > 0 && linkedRecordsForDate.every((row) => String(row?.created_by || "") === currentUserId))
                      const showDateActions = canMutateDailyReport && deleteActionRecordIdByDate.get(reportDateKey) === String(r?.id || "")
                      const dateActionsRowSpan = reportCountByDate.get(reportDateKey) || 1
                      return (
                      <tr key={r.id} style={{ background: rowBg, borderTop: reportBlockChanged ? `3px solid ${colors.white}` : undefined }}>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap", fontWeight: 700 }}>{r.report_no}</td>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>{r.report_date || "-"}</td>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}` }}>{r.contractor_name || "-"}</td>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}` }}>
                          {rowFront || "-"}
                        </td>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}` }}>{r.project_name || "-"}</td>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap", fontWeight: 600 }}>{formatHhCell(hhDir)}</td>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap", fontWeight: 600 }}>{formatHhCell(hhInd)}</td>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap", fontWeight: 700 }}>{formatHhCell(hhTotal)}</td>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}`, textAlign: "center", whiteSpace: "nowrap" }}>
                          <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                            <Tooltip title="Ver">
                              <span>
                                <IconButton
	                                  size="small"
	                                  color="primary"
	                                  onClick={() => openView(r)}
	                                >
                                  <Eye size={16} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        </td>
                        {showDateActions ? (
                          <td
                            rowSpan={dateActionsRowSpan}
                            style={{
                              ...valueCellSx,
                              border: `1px solid ${colors.blue13}`,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              verticalAlign: "middle",
                              background: colors.gray10
                            }}
                          >
                            <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                              <Tooltip title="Editar fecha">
                                <span>
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    disabled={saving || exporting || activeActionRecordId === String(r.id || "")}
                                    onClick={() => {
                                      if (exporting || saving) return
                                      setEditModeChoiceRecord(r)
                                    }}
                                  >
                                    <Pencil size={16} />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              {isAdminRole ? (
                                <Tooltip title="Historial fecha">
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      disabled={saving || exporting || activeActionRecordId === String(r.id || "")}
                                      onClick={() => openHistoryByDate(r)}
                                    >
                                      <History size={16} />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              ) : null}
                              {canDeleteDateReports ? (
                                <Tooltip title="Eliminar fecha">
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      disabled={saving || exporting || activeActionRecordId === String(r.id || "")}
                                      onClick={() => handleDeleteReportsByDate(r)}
                                    >
                                      <Trash2 size={16} />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              ) : null}
                            </Stack>
                          </td>
                        ) : null}
                      </tr>
                    )})}
                    {visibleDailyRecords.length === 0 ? (
                      <tr>
                        <td style={{ ...valueCellSx, border: `1px solid ${colors.blue13}`, textAlign: "center" }} colSpan={canMutateDailyReport ? 10 : 9}>No hay informes diarios guardados para esta semana.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
          </Box>
        </Box>
      </Box>

      <Dialog
        open={!!editModeChoiceRecord}
        onClose={() => setEditModeChoiceRecord(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Editar Reporte Diario</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: colors.gray4, fontSize: 14 }}>
            Elige el origen de edición.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEditModeChoiceRecord(null)}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const record = editModeChoiceRecord
              setEditModeChoiceRecord(null)
              if (record) void openEdit(record, "snapshot")
            }}
          >
            Guardado
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const record = editModeChoiceRecord
              setEditModeChoiceRecord(null)
              if (record) void openEdit(record, "field_reports")
            }}
          >
            Reformular
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={formOpen}
        onClose={closeFormModal}
        maxWidth={false}
        fullWidth={false}
        PaperProps={{
          sx: {
            width: "95vw",
            maxWidth: "95vw",
            height: "auto",
            maxHeight: "95vh",
            m: 0
          }
        }}
      >
        <DialogTitle sx={{ pt: 2.4, pb: 1.8, pr: 2, overflow: "visible" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
            <Typography sx={{ fontSize: 24, fontWeight: 600, color: colors.gray1, whiteSpace: "nowrap" }}>
              {editingId ? "Editar Reporte Diario" : "Nuevo Reporte Diario"}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, overflowX: "auto", overflowY: "visible", pb: 0.25, pt: 0.6 }}>
              <Box sx={{ width: 320, minWidth: 320, pt: 0.2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="daily-report-template-modal-label">Diseño del reporte</InputLabel>
                  <Select
                    labelId="daily-report-template-modal-label"
                    label="Diseño del reporte"
                    value={reportTemplate}
                    disabled={!!editingId}
                    onChange={(e) => setReportTemplate(String(e.target.value) as ReportTemplateKey)}
                  >
                    {REPORT_TEMPLATE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value} disabled={!!opt.disabled}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Box sx={{ width: 220, minWidth: 220, pt: 0.2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="daily-report-work-front-label">Frente</InputLabel>
                  <Select
                    labelId="daily-report-work-front-label"
                    label="Frente"
                    value={form.work_front}
                    onChange={(e) => hydrateFrontInSession(String(e.target.value || "CANALETAS") === "PISCINAS" ? "PISCINAS" : "CANALETAS")}
                  >
                    <MenuItem value="CANALETAS">CANALETAS</MenuItem>
                    <MenuItem value="PISCINAS">PISCINAS</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Button
                variant="contained"
                disableElevation
                disableRipple
                color="inherit"
                sx={{
                  minWidth: 132,
                  whiteSpace: "nowrap",
                  textTransform: "none",
                  fontWeight: 600,
                  color: "#fff",
                  backgroundImage: `${editingId
                    ? "linear-gradient(135deg, #334155 0%, #475569 55%, #64748b 100%)"
                    : (form.work_front === "PISCINAS"
                      ? (frontSavedStatus.PISCINAS
                        ? "linear-gradient(135deg, #166534 0%, #15803d 55%, #16a34a 100%)"
                        : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 55%, #b91c1c 100%)")
                      : (frontSavedStatus.CANALETAS
                        ? "linear-gradient(135deg, #166534 0%, #15803d 55%, #16a34a 100%)"
                        : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 55%, #b91c1c 100%)"))} !important`,
                  "&:hover": {
                    backgroundImage: `${editingId
                      ? "linear-gradient(135deg, #334155 0%, #475569 55%, #64748b 100%)"
                      : (form.work_front === "PISCINAS"
                        ? (frontSavedStatus.PISCINAS
                          ? "linear-gradient(135deg, #166534 0%, #15803d 55%, #16a34a 100%)"
                          : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 55%, #b91c1c 100%)")
                        : (frontSavedStatus.CANALETAS
                          ? "linear-gradient(135deg, #166534 0%, #15803d 55%, #16a34a 100%)"
                          : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 55%, #b91c1c 100%)"))} !important`
                  }
                }}
              >
                {editingId
                  ? "Edición"
                  : ((form.work_front === "PISCINAS" ? frontSavedStatus.PISCINAS : frontSavedStatus.CANALETAS) ? "Guardado" : "No guardado")}
              </Button>
              <Button
                variant="outlined"
                disabled
                sx={{ whiteSpace: "nowrap" }}
              >
                HH Indirectos
              </Button>
              <Button
                variant="outlined"
                disabled
                sx={{ whiteSpace: "nowrap" }}
              >
                Asignación Manual
              </Button>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            {reportTemplate === "daily_v1" ? (
              <>
                <HeaderEditorFirstRows
                  form={form}
                  onChange={handleChange}
                  calendarOptions={options.calendar}
                  reportDateOptions={reportDateOptionsForEditor}
                  reportDateNavigationOptions={reportDateNavigationDates}
                  disableReportDateEdit={!editingId && reportDateOptionsForEditor.length === 0}
                />
                <WorkforceTemplateSectionDynamic
                  workCalendar={form.work_calendar}
                  indirectRows={indirectRows}
                  directNoOperationalRows={directNoOperationalRows}
                  directRows={directRows}
                  courseIndirectRows={courseIndirectRows}
                  courseDirectNoOperationalRows={courseDirectNoOperationalRows}
                  courseDirectRows={courseDirectRows}
                  downIndirectRows={downIndirectRows}
                  downDirectNoOperationalRows={downDirectNoOperationalRows}
                  downDirectRows={downDirectRows}
                  policlinicoIndirectRows={policlinicoIndirectRows}
                  policlinicoDirectNoOperationalRows={policlinicoDirectNoOperationalRows}
                  policlinicoDirectRows={policlinicoDirectRows}
                  teleworkIndirectRows={teleworkIndirectRows}
                  directSpecialtySections={directSpecialtySections}
                  readOnly={false}
                  activityEvidenceByLineKey={dailyActivityEvidenceByLineKey}
                  evidenceViewUrls={evidenceViewUrls}
                  onUploadActivityEvidence={uploadDailyActivityEvidence}
                  onRemoveActivityEvidence={removeDailyActivityEvidence}
                  onOpenActivityEvidenceModal={openActivityEvidenceModal}
                  prevencionistaFrontDistribution={prevencionistaFrontDistribution}
                />

                <Box sx={{ border: "1px solid #111", mt: 0 }}>
                <Box sx={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
                    <thead>
                      <tr>
                        <th style={{ ...laborBlueBandSx, width: "50%" }}>
                          {`OBSERVACIONES${(form.contractor_name || sessionCompanyName) ? ` - ${form.contractor_name || sessionCompanyName}` : ""}`}
                        </th>
                        <th style={{ ...laborBlueBandSx, width: "50%" }}>
                          {`OBSERVACIONES${form.client_name ? ` - ${form.client_name}` : ""}`}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ ...valueCellSx, verticalAlign: "top", padding: 8 }}>
                          <TextField
                            fullWidth
                            multiline
                            minRows={6}
                            placeholder="Observaciones para empresa..."
                            value={form.obs_contractor}
                            onChange={(e) => handleChange("obs_contractor", e.target.value)}
                          />
                        </td>
                        <td style={{ ...valueCellSx, verticalAlign: "top", padding: 8 }}>
                          <TextField
                            fullWidth
                            multiline
                            minRows={6}
                            placeholder="Observaciones para cliente..."
                            value={form.obs_client}
                            onChange={(e) => handleChange("obs_client", e.target.value)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Box>

            <Box sx={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ ...laborBlueBandSx, width: "100%" }}>
                      REGISTRO FOTOGRAFICO DE ACTIVIDADES
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...valueCellSx, padding: 10 }}>
                      {reportEvidenceItems.length === 0 ? (
                        <Typography variant="body2" sx={{ color: "#64748b" }}>
                          Sin imagenes cargadas para la fecha seleccionada.
                        </Typography>
                      ) : (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                          {reportEvidenceItems.map((item) => {
                            const url = evidenceViewUrls[item.key] || ""
                            return (
                              <Box
                                key={item.key}
                                title={`${item.activityName}${item.crewName ? ` - ${item.crewName}` : ""}`}
                                sx={{
                                  width: 220,
                                  border: "1px solid #cbd5e1",
                                  borderRadius: 1,
                                  overflow: "hidden",
                                  bgcolor: "#fff"
                                }}
                              >
                                {url ? (
                                  <a href={url} target="_blank" rel="noreferrer">
                                    <img
                                      src={url}
                                      alt={item.name}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        height: 140,
                                        objectFit: "cover",
                                        background: "#f8fafc"
                                      }}
                                    />
                                  </a>
                                ) : (
                                  <Box sx={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
                                    Cargando...
                                  </Box>
                                )}
                                <Box sx={{ px: 0.8, py: 0.5, fontSize: 11, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {item.activityName || "-"}
                                </Box>
                              </Box>
                            )
                          })}
                        </Box>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Box>

            <Box sx={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ ...laborBlueBandSx, width: "33.33%" }}>
                      Administrador de contrato
                    </th>
                    <th style={{ ...laborBlueBandSx, width: "33.33%" }}>
                      {form.client_name || "Cliente"}
                    </th>
                    <th style={{ ...laborBlueBandSx, width: "33.33%" }}>
                      Representante agente (Superintendente o Gerente)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...valueCellSx, height: 34 }}><strong>Nombre:</strong></td>
                    <td style={{ ...valueCellSx, height: 34 }}><strong>Nombre:</strong></td>
                    <td style={{ ...valueCellSx, height: 34 }}><strong>Nombre:</strong></td>
                  </tr>
                  <tr>
                    <td style={{ ...valueCellSx, height: 90 }}><strong>Firma:</strong></td>
                    <td style={{ ...valueCellSx, height: 90 }}><strong>Firma:</strong></td>
                    <td style={{ ...valueCellSx, height: 90 }}><strong>Firma:</strong></td>
                  </tr>
                  <tr>
                    <td style={{ ...valueCellSx, height: 34 }}><strong>Fecha:</strong> {reportDateLatam}</td>
                    <td style={{ ...valueCellSx, height: 34 }}><strong>Fecha:</strong></td>
                    <td style={{ ...valueCellSx, height: 34 }}><strong>Fecha:</strong></td>
                  </tr>
                </tbody>
              </table>
            </Box>
            </Box>

                <Box sx={{ display: "grid", gap: 1.2, gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr))" } }}>
              </Box>
              </>
            ) : (
              <>
                <Box sx={{ overflowX: "auto" }}>
                  <Box sx={{ minWidth: V2_LAYOUT_MIN_WIDTH }}>
                    <HeaderEditorV2
                      form={form}
                      onChange={handleChange}
                      personalSummaryDisplay={personalSummaryDisplay}
                      reportDateOptions={reportDateOptionsForEditor}
                      reportDateNavigationOptions={reportDateNavigationDates}
                      disableReportDateEdit={!editingId && reportDateOptionsForEditor.length === 0}
                    />
                    <DetailPersonnelEquipmentV2
                      key={`detail-v2-${editingId || "new"}-${form.work_front}-${editSourceMode}`}
                      form={form}
                      onChange={handleChange}
                      onComputedVisibleTotals={handleComputedVisibleTotals}
                      onComputedVisibleRows={handleComputedVisibleRows}
                      onSyncOppositeFrontOverrides={syncOppositeFrontOverrides}
                      indirectAttendanceRows={v2IndirectAttendanceRows}
                      indirectOverrideFrontDotByPosition={indirectOverrideFrontDotByPosition}
                      directAttendanceRows={v2DirectAttendanceRows}
                      frontRoleDotation={frontRoleDotation}
                      mantencionFrontCounts={mantencionFrontCounts}
                      operatorFrontDotationByPosition={operatorFrontDotationByPosition}
                      indirectManualSpecialFrontByPosition={indirectManualSpecialFrontByPosition}
                      supervisorFrontDotationByPosition={supervisorFrontDotationByPosition}
                      directFrontDotationByPosition={directFrontDotationByPosition}
                      directIfaDotationByPosition={directIfaDotationByPosition}
                      directNocDotationByPosition={directNocDotationByPosition}
                      directIfaDotationByPositionName={directIfaDotationByPositionName}
                      totalDirectFrontDotation={totalDirectFrontDotation}
                      collaboratorsForTooltip={collaborators}
                      dailyStatusRowsForTooltip={dailyStatusRows}
                      hasNocFrontColumn={hasNocFrontColumn}
                      nocFrontColumnLabel={resolvedDailyReportDynamicFrontLabel}
                      fieldReportsForDate={fieldReportsForDate}
                      reportFrontNames={reportFrontNames}
                      reportFrontTypesByName={reportFrontTypesByName}
                      nocFrontAssignment={nocFrontAssignment}
                      getFrontCounterpartInfo={getFrontCounterpartInfo}
                      prevencionistaFrontDistribution={prevencionistaFrontDistribution}
                      usePersistedSnapshotValues={Boolean(isViewingHistoryVersion || viewOpen || isEditSnapshotMode || (!editingId && indirectHoursSettingsMatchSaved))}
                      preferPersistedDynamicColumns={isEditSnapshotMode}
                      preferPersistedSnapshotData={isEditSnapshotMode}
                    />
                    <SummaryInformationToDateV2
                      form={form}
                      onChange={handleChange}
                      metrics={effectiveV2SummaryMetrics}
                      signerOptions={signerOptionsByRole}
                    />
                  </Box>
                </Box>
              </>
            )}
          </Box>

          <datalist id="dl-contractor">{options.contractor.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-client">{options.client.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-project">{options.project.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-contract-title">{options.contractTitle.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-contract-number">{options.contractNumber.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-weather">{options.weather.map((v) => <option key={v} value={v} />)}</datalist>

        </DialogContent>
        <DialogActions>
          {editingId ? (
            !editBothFrontsSaved ? (
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || bootstrapping || (form.work_front === "PISCINAS" ? editSessionSavedFronts.PISCINAS : editSessionSavedFronts.CANALETAS)}
              >
                {saving
                  ? "Guardando..."
                  : ((form.work_front === "PISCINAS" ? editSessionSavedFronts.PISCINAS : editSessionSavedFronts.CANALETAS)
                    ? "Frente guardado"
                    : "Guardar edición")}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() => setFormOpen(false)}
                disabled={saving || bootstrapping}
              >
                Finalizar / Cerrar
              </Button>
            )
          ) : !bothFrontsSaved ? (
            <Button variant="contained" onClick={handleSave} disabled={saving || bootstrapping}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={() => setFormOpen(false)}
              disabled={saving || bootstrapping}
            >
              Finalizar / Cerrar
            </Button>
          )}
          <Button variant="outlined" onClick={closeFormModal}>Cancelar</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isIndirectHoursModalOpen}
        onClose={() => setIsIndirectHoursModalOpen(false)}
        maxWidth={false}
        fullWidth={false}
        PaperProps={{
          sx: {
            width: "92vw",
            maxWidth: "92vw"
          }
        }}
      >
        <DialogTitle>Ajustar horas indirectos</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: indirectHoursApplyMode === "GRUPAL"
                  ? "minmax(360px,1fr) 200px 220px 180px 1fr"
                  : "minmax(420px,1fr) 220px 260px"
              },
              gap: 1,
              mt: 1,
              mb: 1
            }}
          >
            <TextField
              size="small"
              label="Buscar por nombre o cargo"
              value={indirectHoursSearch}
              onChange={(e) => setIndirectHoursSearch(e.target.value)}
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel id="indirect-hours-apply-mode-label">Modo</InputLabel>
              <Select
                labelId="indirect-hours-apply-mode-label"
                label="Modo"
                value={indirectHoursApplyMode}
                onChange={(e) => setIndirectHoursApplyMode(String(e.target.value) as "INDIVIDUAL" | "GRUPAL")}
              >
                <MenuItem value="INDIVIDUAL">Individual</MenuItem>
                <MenuItem value="GRUPAL">Grupal</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="indirect-hours-front-scope-label">Aplicar en</InputLabel>
              <Select
                labelId="indirect-hours-front-scope-label"
                label="Aplicar en"
                value={indirectHoursFrontApplyScope}
                onChange={(e) => setIndirectHoursFrontApplyScope(String(e.target.value) as "EXISTING_FRONTS" | "CURRENT_FRONT_ONLY")}
              >
                <MenuItem value="EXISTING_FRONTS">Frentes existentes</MenuItem>
                <MenuItem value="CURRENT_FRONT_ONLY">Solo frente actual</MenuItem>
              </Select>
            </FormControl>
            {indirectHoursApplyMode === "GRUPAL" ? (
              <TextField
                size="small"
                type="number"
                label="Horas grupales"
                value={indirectGroupHoursInput}
                inputProps={{ min: 0, step: "0.5" }}
                onChange={(e) => setIndirectGroupHoursInput(e.target.value)}
              />
            ) : null}
            {indirectHoursApplyMode === "GRUPAL" ? (
              <Button
                variant="outlined"
                onClick={() => {
                  const raw = String(indirectGroupHoursInput || "").trim()
                  if (!raw) return
                  const parsed = Number(raw)
                  if (!Number.isFinite(parsed)) return
                  setIndirectHoursOverridesDraft((prev) => {
                    const next = { ...prev }
                    filteredIndirectWorkers.forEach((worker) => {
                      next[worker.workerId] = parsed
                    })
                    return next
                  })
                }}
              >
                Aplicar a filtrados
              </Button>
            ) : null}
          </Box>
          <Typography sx={{ color: colors.gray4, mt: 1, mb: 1 }}>
            Ajustes activos: {Object.keys(indirectHoursOverridesDraft).length}
          </Typography>
          <Box sx={{ border: `1px solid ${colors.blue13}`, borderRadius: 1.5, mb: 1.2, overflow: "hidden", bgcolor: colors.white }}>
            <Box sx={{ px: 1.2, py: 0.8, borderBottom: `1px solid ${colors.gray9}`, bgcolor: colors.gray10 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Ajustes asignados con horas</Typography>
            </Box>
            {appliedIndirectWorkers.length === 0 ? (
              <Box sx={{ px: 1.2, py: 1.2 }}>
                <Typography sx={{ fontSize: 12, color: colors.gray4 }}>Sin ajustes asignados.</Typography>
              </Box>
            ) : (
              <Box sx={{ px: 1, py: 1, display: "flex", flexWrap: "wrap", gap: 0.8, maxHeight: 180, overflowY: "auto", justifyContent: "center" }}>
                {appliedIndirectWorkers.map((worker) => (
                  <Box
                    key={`applied-${worker.workerId}`}
                    sx={{
                      border: `1px solid ${colors.blue13}`,
                      borderRadius: 999,
                      px: 1,
                      py: 0.45,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.7,
                      bgcolor: colors.gray10
                    }}
                  >
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>
                      {String(worker.workerId || "").split("-")[0] || worker.workerId}
                    </Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.gray1 }}>
                      {worker.fullName}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: colors.gray4 }}>
                      {worker.roleOrSpecialty || "-"}
                    </Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.blue4 }}>
                      {String(indirectHoursOverridesDraft[worker.workerId] ?? "0")}h
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "160px 1fr 1fr 120px 170px auto" },
              gap: 0.8,
              px: 1,
              py: 0.8,
              border: `1px solid ${colors.blue13}`,
              borderRadius: 1.5,
              bgcolor: colors.gray10,
              mb: 0.8
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>ID</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>NOMBRE</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>CARGO</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>ESTADO</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>HORAS</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3, textAlign: "center" }}>ACCIÓN</Typography>
          </Box>
          <Box sx={{ display: "grid", gap: 1 }}>
            {!String(indirectHoursSearch || "").trim() ? (
              <Typography sx={{ color: colors.gray4, fontSize: 14 }}>
                Escribe en el buscador para mostrar coincidencias y agregar horas.
              </Typography>
            ) : filteredIndirectWorkers.length === 0 ? (
              <Typography sx={{ color: colors.gray4, fontSize: 14 }}>
                Sin coincidencias disponibles (o ya asignadas).
              </Typography>
            ) : (
              filteredIndirectWorkers.map((worker) => {
                const currentValue = indirectHoursOverridesDraft[worker.workerId]
                return (
                  <Box
                    key={worker.workerId}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "160px 1fr 1fr 120px 170px auto" },
                      gap: 0.8,
                      alignItems: "center",
                      border: `1px solid ${colors.blue13}`,
                      borderRadius: 1.5,
                      p: 1,
                      bgcolor: currentValue == null ? colors.white : colors.blue15
                    }}
                  >
                    <Typography sx={{ fontSize: 11, color: colors.gray4, fontWeight: 600 }}>
                      {String(worker.workerId || "").split("-")[0] || worker.workerId}
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{worker.fullName}</Typography>
                    <Typography sx={{ fontSize: 12, color: colors.gray4 }}>{worker.roleOrSpecialty || "-"}</Typography>
                    <Typography sx={{ fontSize: 11, color: colors.blue4, fontWeight: 600 }}>{worker.statusLabel}</Typography>
                    <TextField
                      size="small"
                      type="number"
                      label="Horas reales"
                      value={currentValue ?? ""}
                      inputProps={{ min: 0, step: "0.5" }}
                      onChange={(e) => {
                        const raw = String(e.target.value || "").trim()
                        setIndirectHoursOverridesDraft((prev) => {
                          if (!raw) {
                            const next = { ...prev }
                            delete next[worker.workerId]
                            return next
                          }
                          const parsed = Number(raw)
                          if (!Number.isFinite(parsed)) return prev
                          return { ...prev, [worker.workerId]: parsed }
                        })
                      }}
                    />
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setIndirectHoursOverridesDraft((prev) => {
                          const next = { ...prev }
                          delete next[worker.workerId]
                          return next
                        })
                      }}
                    >
                      Limpiar
                    </Button>
                  </Box>
                )
              })
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsIndirectHoursModalOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              setIndirectHoursOverrides(indirectHoursOverridesDraft)
              setIsIndirectHoursModalOpen(false)
            }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isIndirectFrontModalOpen}
        onClose={() => setIsIndirectFrontModalOpen(false)}
        maxWidth={false}
        fullWidth={false}
        PaperProps={{
          sx: {
            width: "92vw",
            maxWidth: "92vw"
          }
        }}
      >
        <DialogTitle>Asignación manual por frente (unidad)</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, mb: 1 }}>
            <TextField
              size="small"
              label="Buscar por nombre o cargo"
              value={indirectFrontSearch}
              onChange={(e) => setIndirectFrontSearch(e.target.value)}
              fullWidth
            />
          </Box>
          <Typography sx={{ color: colors.gray4, mt: 1, mb: 1 }}>
            Asignaciones activas: {Object.keys(indirectHoursFrontOverridesDraft).length}
          </Typography>
          <Box sx={{ border: `1px solid ${colors.blue13}`, borderRadius: 1.5, mb: 1.2, overflow: "hidden", bgcolor: colors.white }}>
            <Box sx={{ px: 1.2, py: 0.8, borderBottom: `1px solid ${colors.gray9}`, bgcolor: colors.gray10 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Asignados</Typography>
            </Box>
            {appliedIndirectFrontWorkers.length === 0 ? (
              <Box sx={{ px: 1.2, py: 1.2 }}>
                <Typography sx={{ fontSize: 12, color: colors.gray4 }}>Sin asignaciones.</Typography>
              </Box>
            ) : (
              <Box sx={{ px: 1, py: 1, display: "grid", gap: 0.8, maxHeight: 260, overflowY: "auto" }}>
                {appliedIndirectFrontWorkers.map((worker) => (
                  <Box
                    key={`front-applied-${worker.workerId}`}
                    sx={{
                      border: `1px solid ${colors.blue13}`,
                      borderRadius: 1.5,
                      px: 1,
                      py: 0.7,
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 220px auto" },
                      gap: 0.8,
                      alignItems: "center",
                      bgcolor: colors.gray10
                    }}
                  >
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.gray1 }}>{worker.fullName}</Typography>
                    <Typography sx={{ fontSize: 11, color: colors.gray4 }}>{worker.roleOrSpecialty || "-"}</Typography>
                    <FormControl size="small" fullWidth>
                      <InputLabel id={`front-applied-select-${worker.workerId}`}>Frente</InputLabel>
                      <Select
                        labelId={`front-applied-select-${worker.workerId}`}
                        label="Frente"
                        value={indirectHoursFrontOverridesDraft[worker.workerId] || "BOTH"}
                        onChange={(e) => {
                          const val = String(e.target.value) as "CANALETAS" | "PISCINAS" | "BOTH"
                          setIndirectHoursFrontOverridesDraft((prev) => ({ ...prev, [worker.workerId]: val }))
                        }}
                      >
                        <MenuItem value="BOTH">Ambos (50/50)</MenuItem>
                        <MenuItem value="CANALETAS">Solo CANALETAS</MenuItem>
                        <MenuItem value="PISCINAS">Solo PISCINAS</MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() =>
                        setIndirectHoursFrontOverridesDraft((prev) => {
                          const next = { ...prev }
                          delete next[worker.workerId]
                          return next
                        })
                      }
                    >
                      Quitar
                    </Button>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "160px 1fr 1fr 200px auto" }, gap: 0.8, px: 1, py: 0.8, border: `1px solid ${colors.blue13}`, borderRadius: 1.5, bgcolor: colors.gray10, mb: 0.8 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>ID</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>NOMBRE</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>CARGO</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3 }}>FRENTE MANUAL</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray3, textAlign: "center" }}>ACCIÓN</Typography>
          </Box>
          <Box sx={{ display: "grid", gap: 1 }}>
            {!String(indirectFrontSearch || "").trim() ? (
              <Typography sx={{ color: colors.gray4, fontSize: 14 }}>Escribe en el buscador para asignar frente manual por unidad.</Typography>
            ) : filteredIndirectFrontWorkers.length === 0 ? (
              <Typography sx={{ color: colors.gray4, fontSize: 14 }}>Sin coincidencias disponibles (o ya asignadas).</Typography>
            ) : (
              filteredIndirectFrontWorkers.map((worker) => (
                <Box key={`front-${worker.workerId}`} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "160px 1fr 1fr 200px auto" }, gap: 0.8, alignItems: "center", border: `1px solid ${colors.blue13}`, borderRadius: 1.5, p: 1, bgcolor: colors.white }}>
                  <Typography sx={{ fontSize: 11, color: colors.gray4, fontWeight: 600 }}>{String(worker.workerId || "").split("-")[0] || worker.workerId}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{worker.fullName}</Typography>
                  <Typography sx={{ fontSize: 12, color: colors.gray4 }}>{worker.roleOrSpecialty || "-"}</Typography>
                    <FormControl size="small" fullWidth>
                      <InputLabel id={`front-only-${worker.workerId}`}>Frente</InputLabel>
                      <Select
                        labelId={`front-only-${worker.workerId}`}
                        label="Frente"
                        value={indirectHoursFrontOverridesDraft[worker.workerId] || ""}
                        onChange={(e) => {
                          const val = String(e.target.value)
                          setIndirectHoursFrontOverridesDraft((prev) => {
                            const next = { ...prev }
                            if (val === "CANALETAS" || val === "PISCINAS" || val === "BOTH") {
                              next[worker.workerId] = val
                            } else {
                              delete next[worker.workerId]
                            }
                            return next
                          })
                        }}
                      >
                        <MenuItem value="">Sin asignar</MenuItem>
                        <MenuItem value="BOTH">Ambos (50/50)</MenuItem>
                        <MenuItem value="CANALETAS">Solo CANALETAS</MenuItem>
                        <MenuItem value="PISCINAS">Solo PISCINAS</MenuItem>
                      </Select>
                    </FormControl>
                  <Button
                    variant="outlined"
                    onClick={() =>
                      setIndirectHoursFrontOverridesDraft((prev) => {
                        const next = { ...prev }
                        delete next[worker.workerId]
                        return next
                      })
                    }
                  >
                    Limpiar
                  </Button>
                </Box>
              ))
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsIndirectFrontModalOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              setIndirectHoursFrontOverrides(indirectHoursFrontOverridesDraft)
              setIsIndirectFrontModalOpen(false)
            }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={viewOpen}
        onClose={closeViewDialog}
        maxWidth={false}
        fullWidth={false}
        PaperProps={{
          sx: {
            width: "95vw",
            maxWidth: "95vw",
            height: "auto",
            maxHeight: "95vh",
            m: 0
          }
        }}
      >
        <DialogTitle>
          {isViewingHistoryVersion
            ? `Ver Reporte Diario - Versión ${historyViewMeta?.versionNo || "-"}`
            : "Ver Reporte Diario"}
        </DialogTitle>
        <DialogContent>
          {viewRecord ? (
            <Box ref={dailyReportPdfRef} sx={{ mt: 1 }}>
              {reportTemplate === "daily_v1" ? (
                <>
                  <HeaderPreview form={form} />
                  <WorkforceTemplateSectionDynamic
                    workCalendar={form.work_calendar}
                    indirectRows={indirectRows}
                    directNoOperationalRows={directNoOperationalRows}
                    directRows={directRows}
                    courseIndirectRows={courseIndirectRows}
                    courseDirectNoOperationalRows={courseDirectNoOperationalRows}
                    courseDirectRows={courseDirectRows}
                    downIndirectRows={downIndirectRows}
                    downDirectNoOperationalRows={downDirectNoOperationalRows}
                    downDirectRows={downDirectRows}
                    policlinicoIndirectRows={policlinicoIndirectRows}
                    policlinicoDirectNoOperationalRows={policlinicoDirectNoOperationalRows}
                    policlinicoDirectRows={policlinicoDirectRows}
                    teleworkIndirectRows={teleworkIndirectRows}
                    directSpecialtySections={directSpecialtySections}
                    readOnly
                    activityEvidenceByLineKey={dailyActivityEvidenceByLineKey}
                    evidenceViewUrls={evidenceViewUrls}
                    onOpenActivityEvidenceModal={openActivityEvidenceModal}
                    prevencionistaFrontDistribution={prevencionistaFrontDistribution}
                  />

                  <Box sx={{ border: "1px solid #111", mt: 0 }}>
                    <Box sx={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
                        <thead>
                          <tr>
                            <th style={{ ...laborBlueBandSx, width: "50%" }}>
                              {`OBSERVACIONES${(form.contractor_name || sessionCompanyName) ? ` - ${form.contractor_name || sessionCompanyName}` : ""}`}
                            </th>
                            <th style={{ ...laborBlueBandSx, width: "50%" }}>
                              {`OBSERVACIONES${form.client_name ? ` - ${form.client_name}` : ""}`}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ ...valueCellSx, verticalAlign: "top", padding: 8 }}>
                              <Box sx={{ minHeight: 120, whiteSpace: "pre-wrap" }}>{form.obs_contractor || "-"}</Box>
                            </td>
                            <td style={{ ...valueCellSx, verticalAlign: "top", padding: 8 }}>
                              <Box sx={{ minHeight: 120, whiteSpace: "pre-wrap" }}>{form.obs_client || "-"}</Box>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </Box>

                <Box sx={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
                    <thead>
                      <tr>
                        <th style={{ ...laborBlueBandSx, width: "100%" }}>
                          REGISTRO FOTOGRAFICO DE ACTIVIDADES
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ ...valueCellSx, padding: 10 }}>
                          {reportEvidenceItems.length === 0 ? (
                            <Typography variant="body2" sx={{ color: "#64748b" }}>
                              Sin imagenes cargadas para la fecha seleccionada.
                            </Typography>
                          ) : (
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                              {reportEvidenceItems.map((item) => {
                                const url = evidenceViewUrls[item.key] || ""
                                return (
                                  <Box
                                    key={`view-${item.key}`}
                                    title={`${item.activityName}${item.crewName ? ` - ${item.crewName}` : ""}`}
                                    sx={{
                                      width: 220,
                                      border: "1px solid #cbd5e1",
                                      borderRadius: 1,
                                      overflow: "hidden",
                                      bgcolor: "#fff"
                                    }}
                                  >
                                    {url ? (
                                      <a href={url} target="_blank" rel="noreferrer">
                                        <img
                                          src={url}
                                          alt={item.name}
                                          style={{
                                            display: "block",
                                            width: "100%",
                                            height: 140,
                                            objectFit: "cover",
                                            background: "#f8fafc"
                                          }}
                                        />
                                      </a>
                                    ) : (
                                      <Box sx={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
                                        Cargando...
                                      </Box>
                                    )}
                                    <Box sx={{ px: 0.8, py: 0.5, fontSize: 11, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {item.activityName || "-"}
                                    </Box>
                                  </Box>
                                )
                              })}
                            </Box>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Box>

                <Box sx={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
                    <thead>
                      <tr>
                        <th style={{ ...laborBlueBandSx, width: "33.33%" }}>
                          Administrador de contrato
                        </th>
                        <th style={{ ...laborBlueBandSx, width: "33.33%" }}>
                          {form.client_name || "Cliente"}
                        </th>
                        <th style={{ ...laborBlueBandSx, width: "33.33%" }}>
                          Representante agente (Superintendente o Gerente)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ ...valueCellSx, height: 34 }}><strong>Nombre:</strong></td>
                        <td style={{ ...valueCellSx, height: 34 }}><strong>Nombre:</strong></td>
                        <td style={{ ...valueCellSx, height: 34 }}><strong>Nombre:</strong></td>
                      </tr>
                      <tr>
                        <td style={{ ...valueCellSx, height: 90 }}><strong>Firma:</strong></td>
                        <td style={{ ...valueCellSx, height: 90 }}><strong>Firma:</strong></td>
                        <td style={{ ...valueCellSx, height: 90 }}><strong>Firma:</strong></td>
                      </tr>
                      <tr>
                        <td style={{ ...valueCellSx, height: 34 }}><strong>Fecha:</strong> {reportDateLatam}</td>
                        <td style={{ ...valueCellSx, height: 34 }}><strong>Fecha:</strong></td>
                        <td style={{ ...valueCellSx, height: 34 }}><strong>Fecha:</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </Box>
                  </Box>
                </>
              ) : (
                <>
                  <Box sx={{ overflowX: "auto" }}>
                    <Box sx={{ minWidth: V2_LAYOUT_MIN_WIDTH }}>
                      <HeaderEditorV2
                        form={form}
                        onChange={handleChange}
                        personalSummaryDisplay={personalSummaryDisplay}
                        readOnly
                        reportDateOptions={reportDateOptionsForEditor}
                        reportDateNavigationOptions={reportDateNavigationDates}
                      />
                      <DetailPersonnelEquipmentV2
                        form={form}
                        onChange={handleChange}
                        onComputedVisibleTotals={handleComputedVisibleTotals}
                        onComputedVisibleRows={handleComputedVisibleRows}
                        onSyncOppositeFrontOverrides={syncOppositeFrontOverrides}
                        indirectAttendanceRows={v2IndirectAttendanceRows}
                        indirectOverrideFrontDotByPosition={indirectOverrideFrontDotByPosition}
                        directAttendanceRows={v2DirectAttendanceRows}
                        frontRoleDotation={frontRoleDotation}
                        mantencionFrontCounts={mantencionFrontCounts}
                        operatorFrontDotationByPosition={operatorFrontDotationByPosition}
                        indirectManualSpecialFrontByPosition={indirectManualSpecialFrontByPosition}
                        supervisorFrontDotationByPosition={supervisorFrontDotationByPosition}
                        directFrontDotationByPosition={directFrontDotationByPosition}
                        directIfaDotationByPosition={directIfaDotationByPosition}
                        directNocDotationByPosition={directNocDotationByPosition}
                        directIfaDotationByPositionName={directIfaDotationByPositionName}
                        totalDirectFrontDotation={totalDirectFrontDotation}
                        collaboratorsForTooltip={collaborators}
                        dailyStatusRowsForTooltip={dailyStatusRows}
                        hasNocFrontColumn={hasNocFrontColumn}
                        nocFrontColumnLabel={resolvedDailyReportDynamicFrontLabel}
                        fieldReportsForDate={fieldReportsForDate}
                        reportFrontNames={reportFrontNames}
                        reportFrontTypesByName={reportFrontTypesByName}
                        nocFrontAssignment={nocFrontAssignment}
                        getFrontCounterpartInfo={getFrontCounterpartInfo}
                        prevencionistaFrontDistribution={prevencionistaFrontDistribution}
                        usePersistedSnapshotValues={Boolean(editingId) || isViewingHistoryVersion || viewOpen || indirectHoursSettingsMatchSaved}
                        readOnly
                      />
                      <SummaryInformationToDateV2
                        form={form}
                        onChange={handleChange}
                        metrics={v2SummaryMetricsForViewRender}
                        signerOptions={signerOptionsByRole}
                        readOnly
                      />
                    </Box>
                  </Box>
                </>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          {isViewingHistoryVersion ? (
            <Typography sx={{ mr: "auto", fontSize: 13, color: colors.gray4, fontWeight: 600 }}>
              Versión histórica solo lectura
              {historyViewMeta?.createdAt ? ` · ${new Date(historyViewMeta.createdAt).toLocaleString("es-CL")}` : ""}
            </Typography>
          ) : !canExportDailyReport ? (
            <Box sx={{ mr: "auto" }} />
          ) : (
            <>
              <Box sx={{ mr: "auto" }} />
              <Button variant="outlined" onClick={handleExportExcelV2FromView} disabled={exporting}>
                Exportar Excel V2
              </Button>
              <Button variant="outlined" onClick={handleExportCombinedExcelV2FromView} disabled={exporting}>
                Exportar Excel consolidado
              </Button>
              <Button variant="outlined" disabled>Exportar a PDF</Button>
            </>
          )}
          <Button onClick={closeViewDialog}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={activityEvidenceModalOpen}
        onClose={() => setActivityEvidenceModalOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{`Imágenes de actividad: ${activityEvidenceModalLabel || "-"}`}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {!viewOpen ? (
              <Box
                onDragOver={(e) => {
                  e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const files = e.dataTransfer?.files || null
                  void uploadDailyActivityEvidence(activityEvidenceModalLineKey, files)
                }}
                sx={{
                  border: `2px dashed ${colors.blue14}`,
                  borderRadius: 2,
                  p: 2,
                  textAlign: "center",
                  bgcolor: colors.gray10,
                  mb: 2
                }}
              >
                <Typography sx={{ fontSize: 13, color: colors.blue4, mb: 1 }}>
                  Arrastrar y soltar imágenes aquí
                </Typography>
                <Button variant="outlined" size="small" component="label" sx={{ textTransform: "none" }}>
                  Seleccionar archivos
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      void uploadDailyActivityEvidence(activityEvidenceModalLineKey, e.target.files)
                      e.currentTarget.value = ""
                    }}
                  />
                </Button>
              </Box>
            ) : null}
            {(() => {
              const files = Array.isArray(dailyActivityEvidenceByLineKey[activityEvidenceModalLineKey])
                ? dailyActivityEvidenceByLineKey[activityEvidenceModalLineKey]
                : []
              if (files.length === 0) {
                return <Typography sx={{ fontSize: 13, color: colors.gray4 }}>Sin imágenes cargadas.</Typography>
              }
              return (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr 1fr" }, gap: 1 }}>
                  {files.map((f, idx) => {
                    const key = String(f?.key || "")
                    const url = evidenceViewUrls[key] || ""
                    return (
                      <Box key={`${key}-${idx}`} sx={{ border: `1px solid ${colors.blue15}`, borderRadius: 1.5, p: 1, bgcolor: colors.white }}>
                        <Box sx={{ width: "100%", height: 110, borderRadius: 1, overflow: "hidden", bgcolor: colors.gray10, mb: 0.75, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {url ? (
                            <img src={url} alt={String(f?.name || `imagen_${idx + 1}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <Typography sx={{ fontSize: 12, color: colors.gray4 }}>Cargando...</Typography>
                          )}
                        </Box>
                        <Typography sx={{ fontSize: 12, color: colors.gray3, mb: 0.5 }} noWrap title={String(f?.name || `imagen_${idx + 1}`)}>
                          {String(f?.name || `imagen_${idx + 1}`)}
                        </Typography>
                        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 0.5 }}>
                          <Button size="small" variant="text" onClick={() => url && window.open(url, "_blank")}>Abrir</Button>
                          {!viewOpen ? (
                            <Button size="small" color="error" onClick={() => removeDailyActivityEvidence(activityEvidenceModalLineKey, idx)}>Eliminar</Button>
                          ) : null}
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              )
            })()}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActivityEvidenceModalOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Historial</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: 13, color: colors.gray4, mb: 2 }}>
            {historyReportLabel || "Reporte diario"}
          </Typography>
          {historyLoading ? (
            <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Stack spacing={2}>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: colors.blue1, mb: 1 }}>
                  Versiones
                </Typography>
                {historyRows.length === 0 ? (
                  <Typography sx={{ fontSize: 14, color: colors.gray4 }}>
                    Sin versiones guardadas para esta fecha.
                  </Typography>
                ) : (
                  <Stack spacing={1.2}>
                    {historyRows.map((row) => {
                      const createdLabel = row.created_at ? new Date(row.created_at).toLocaleString("es-CL") : "-"
                      const prev = row.previous_data || {}
                      const next = row.new_data || {}
                      return (
                        <Paper key={row.id} variant="outlined" sx={{ p: 1.5 }}>
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                            <Typography sx={{ fontWeight: 600, color: colors.blue1 }}>
                              Versión {row.version_no} - {createdLabel}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => openHistoryVersionReadOnly(row)}
                              >
                                Ver
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                disabled={restoringVersionId === row.id}
                                onClick={() => restoreHistoryVersion(row)}
                              >
                                {restoringVersionId === row.id ? "Restaurando..." : "Restaurar"}
                              </Button>
                            </Stack>
                          </Stack>
                          <Typography sx={{ fontSize: 12, color: colors.gray4, mt: 0.5 }}>
                            Frente: {String((next as any)?.work_front || (next as any)?.notes?.work_front || "-")} · Reporte N° {String((next as any)?.report_no || "-")}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: colors.gray4 }}>
                            Resumen anterior HH: {String((prev as any)?.notes?.summary_total_hh ?? (prev as any)?.hh_day ?? "-")} · Resumen nuevo HH: {String((next as any)?.notes?.summary_total_hh ?? (next as any)?.hh_day ?? "-")}
                          </Typography>
                        </Paper>
                      )
                    })}
                  </Stack>
                )}
              </Box>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#991b1b", mb: 1 }}>
                  Eliminados
                </Typography>
                {historyDeletionRows.length === 0 ? (
                  <Typography sx={{ fontSize: 14, color: colors.gray4 }}>
                    Sin eliminaciones registradas para esta fecha.
                  </Typography>
                ) : (
                  <Stack spacing={1.2}>
                    {historyDeletionRows.map((row) => {
                      const deletedLabel = row.deleted_at ? new Date(row.deleted_at).toLocaleString("es-CL") : "-"
                      const snap = row.report_snapshot || {}
                      return (
                        <Paper key={row.id} variant="outlined" sx={{ p: 1.5, borderColor: "#fecaca", bgcolor: "#fff7f7" }}>
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                            <Typography sx={{ fontWeight: 600, color: "#991b1b" }}>
                              Eliminado - {deletedLabel}
                            </Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => openHistoryVersionReadOnly({
                                id: row.id,
                                daily_report_id: row.daily_report_id,
                                version_no: 0,
                                edited_by: row.deleted_by || null,
                                previous_data: row.report_snapshot || {},
                                new_data: row.report_snapshot || {},
                                created_at: row.deleted_at || null
                              })}
                            >
                              Ver respaldo
                            </Button>
                          </Stack>
                          <Typography sx={{ fontSize: 12, color: colors.gray4, mt: 0.5 }}>
                            Frente: {String(row.work_front || (snap as any)?.work_front || (snap as any)?.notes?.work_front || "-")} · Reporte N° {String(row.report_no || (snap as any)?.report_no || "-")}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: colors.gray4 }}>
                            Usuario: {String(row.deleted_by_email || "-")} · Rol: {String(row.deleted_by_role || "-")}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: colors.gray4 }}>
                            Motivo: {String(row.delete_reason || "-")}
                          </Typography>
                        </Paper>
                      )
                    })}
                  </Stack>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert severity={toast.sev} onClose={() => setToast((p) => ({ ...p, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}
