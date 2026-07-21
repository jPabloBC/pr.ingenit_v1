import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUppercaseDisplayText } from '@/lib/normalize'

export const dynamic = 'force-dynamic'

type GroupSummary = {
  label: string
  hh: number
  hhExtras: number
  dailyReportDirectHh?: number
  peopleRows: number
  reports: number
}

type HhMatrixRow = {
  key: string
  specialty: string
  position: string
  front: string
  peopleRows: number
  reports: number
  hh: number
  hhExtras: number
  dailyReportHh: number
  byDate: Record<string, number>
  byWeek: Record<string, number>
}

const FIELD_REPORT_MANAGEMENT_HH_SELECT = [
  'id',
  'company_id',
  'date',
  'created_at',
  'report_sequence_no',
  'report_title',
  'work_front',
  'area',
  'crew_id',
  'crew_ids',
  'crew_name',
  'specialty',
  'start_time',
  'end_time',
  'personnel',
  'person_hours',
  'assignments',
].join(', ')

const DAILY_REPORT_MANAGEMENT_HH_SELECT = [
  'id',
  'company_id',
  'report_date',
  'report_no',
  'work_front',
  'notes',
  'v2_form_snapshot',
  'v2_runtime_snapshot',
  'hh_day',
  's4_prev_indirect_hh',
  's4_prev_direct_hh',
  's4_curr_indirect_hh',
  's4_curr_direct_hh',
  'created_at',
  'updated_at',
].join(', ')

const HH_MATRIX_WEEK_ONE_START = '2026-04-06'
const CURRENT_WORKDAY_START_DATE = '2026-06-16'

const parseJsonMaybe = (value: any) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const normalizeText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const normalizeLabel = (value: any) => normalizeUppercaseDisplayText(String(value || '').trim().toUpperCase())

const toNumber = (value: any) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  let normalized = raw.replace(/\s+/g, '')
  if (normalized.includes(',') && normalized.includes('.')) {
    const lastComma = normalized.lastIndexOf(',')
    const lastDot = normalized.lastIndexOf('.')
    if (lastComma > lastDot) normalized = normalized.replace(/\./g, '').replace(',', '.')
    else normalized = normalized.replace(/,/g, '')
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.')
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const parseDateKeyToLocalDate = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const dateToKey = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const addDaysToDateKey = (value: string, days: number) => {
  const date = parseDateKeyToLocalDate(value)
  if (!date) return ''
  date.setDate(date.getDate() + days)
  return dateToKey(date)
}

const getWeekRangeFromDateKey = (value: string) => {
  const date = parseDateKeyToLocalDate(value)
  if (!date) return { start: '', end: '' }
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + mondayOffset)
  const start = dateToKey(date)
  const end = addDaysToDateKey(start, 6)
  return { start, end }
}

const getDateKeyDiffDays = (from: string, to: string) => {
  const fromDate = parseDateKeyToLocalDate(from)
  const toDate = parseDateKeyToLocalDate(to)
  if (!fromDate || !toDate) return 0
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000)
}

const getHhMatrixWeekNumberForDate = (date: string) => {
  const diffDays = getDateKeyDiffDays(HH_MATRIX_WEEK_ONE_START, date)
  return Math.max(1, Math.floor(diffDays / 7) + 1)
}

const getHhMatrixWeekStartForDate = (date: string) => {
  const weekNo = getHhMatrixWeekNumberForDate(date)
  return addDaysToDateKey(HH_MATRIX_WEEK_ONE_START, (weekNo - 1) * 7)
}

const buildProjectWeeksBetween = (start: string, end: string) => {
  if (!start || !end || start > end) return []
  const weeks: Array<{ key: string; label: string; start: string; end: string }> = []
  let cursor = getHhMatrixWeekStartForDate(start) || start
  while (cursor && cursor <= end && weeks.length < 30) {
    const weekStart = cursor
    const candidateEnd = addDaysToDateKey(weekStart, 6)
    const weekEnd = candidateEnd && candidateEnd < end ? candidateEnd : end
    const weekNo = getHhMatrixWeekNumberForDate(weekStart)
    weeks.push({
      key: `week-${weekNo}`,
      label: `Semana ${weekNo}`,
      start: weekStart,
      end: weekEnd,
    })
    cursor = addDaysToDateKey(weekEnd, 1)
  }
  return weeks
}

const getSequentialWeekKeyForDate = (
  date: string,
  weeks: Array<{ key: string; start: string; end: string }>
) => weeks.find((week) => date >= week.start && date <= week.end)?.key || ''

const listDateKeysBetween = (start: string, end: string) => {
  if (!start || !end || start > end) return []
  const out: string[] = []
  let cursor = start
  while (cursor && cursor <= end && out.length < 120) {
    out.push(cursor)
    cursor = addDaysToDateKey(cursor, 1)
  }
  return out
}

const isIndirectPosition = (position: any) => {
  const text = normalizeLabel(position)
  if (!text) return false
  return [
    'ADMINISTR',
    'ALARIFE',
    'ASESOR',
    'ASISTENTE',
    'BODEG',
    'CHOFER',
    'CONDUCTOR',
    'CONTROL DOCUMENT',
    'COORDINADOR',
    'ENCARGADO',
    'JEFE',
    'MANTENCION',
    'MECANICO',
    'ELECTRICO MANTENCION',
    'OPERADOR',
    'PANOL',
    'PREVENC',
    'SECRETARIO',
    'SUPERVIS',
    'TOPOGRAF',
  ].some((needle) => text.includes(needle))
}

const isDirectWorkerRow = (row: any) => {
  const positionText = normalizeLabel(row?.position || row?.role || row?.cargo || '')
  if (positionText.includes('NIVELADOR')) return false

  const workerType = normalizeText(row?.worker_type || row?.workerType || row?.type || '')
  if (workerType) {
    if (workerType.includes('indirect')) return false
    if (workerType.includes('directo no operacional')) return false
    if (workerType.includes('direct')) return true
  }
  return !isIndirectPosition(positionText)
}

const inferSpecialtyFromPosition = (position: any) => {
  const text = normalizeText(position)
  if (!text) return ''
  if (text.includes('rigger')) return 'RIGGER'
  if (text.includes('electric')) return 'ELECTRICO'
  if (text.includes('caner') || text.includes('hdpe') || text.includes('tuber')) return 'CAÑERIA'
  if (text.includes('mecanic')) return 'MECANICO'
  if (
    text.includes('civil') ||
    text.includes('maestro') ||
    text.includes('jornal') ||
    text.includes('ayudante') ||
    text.includes('carpinter') ||
    text.includes('enfierr') ||
    text.includes('hormigon') ||
    text.includes('albanil')
  ) {
    return 'OBRAS CIVILES'
  }
  return ''
}

const getReportSpecialty = (report: any) =>
  normalizeLabel(report?.specialty || report?.especialidad || report?.discipline || 'SIN ESPECIALIDAD')

const normalizeManagementFrontLabel = (value: any) =>
  normalizeLabel(value).replace(/^CUADRILLA\s+\d+\s+/, '').trim()

const normalizeDailyReportFrontForManagement = (value: any) => {
  const front = normalizeManagementFrontLabel(value)
  if (front.includes('NOC') || front.includes('USO DE RECURSOS') || front.includes('EJECUCION')) return front || 'SIN FRENTE'
  if (front.includes('CANALETAS')) return 'CONTRATO BASE CANALETAS'
  if (front.includes('PISCINAS')) return 'CONTRATO BASE PISCINAS'
  return front || 'SIN FRENTE'
}

const getNocFrontLookupKey = (value: any) => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
  const nocNumbers = Array.from(normalized.matchAll(/NOC(?:[^0-9A-Z]*N)?[^0-9A-Z]*([0-9O]{1,5})/g))
    .map((match) => String(match?.[1] || '').replace(/O/g, '0').replace(/\D/g, ''))
    .map((num) => Number(num))
    .filter((num) => Number.isFinite(num) && num > 0)
    .map((num) => String(num).padStart(3, '0'))
  const uniqueNumbers = Array.from(new Set(nocNumbers))
  return uniqueNumbers.length > 0
    ? `NOC:${uniqueNumbers.join('+')}`
    : ''
}

const getDailyReportFrontGroupKey = (value: any) => {
  const label = normalizeLabel(value)
  return getNocFrontLookupKey(label) || label || 'SIN FRENTE'
}

const pickPreferredDailyReportFrontLabel = (current: any, next: any) => {
  const currentLabel = normalizeLabel(current)
  const nextLabel = normalizeLabel(next)
  if (!currentLabel || currentLabel.startsWith('NOC:')) return nextLabel || currentLabel || 'SIN FRENTE'
  if (!nextLabel) return currentLabel

  const currentIsAbbrev = /\bUDR\b/.test(currentLabel)
  const nextIsExpanded = nextLabel.includes('USO DE RECURSOS')
  if (currentIsAbbrev && nextIsExpanded) return nextLabel

  const currentIsExpanded = currentLabel.includes('USO DE RECURSOS')
  const nextIsAbbrev = /\bUDR\b/.test(nextLabel)
  if (currentIsExpanded && nextIsAbbrev) return currentLabel

  return nextLabel.length > currentLabel.length ? nextLabel : currentLabel
}

const getFrontLookupKeys = (front: any) => {
  const label = normalizeDailyReportFrontForManagement(front)
  const keys = [label]
  const nocKey = getNocFrontLookupKey(label)
  if (nocKey && !keys.includes(nocKey)) keys.push(nocKey)
  return keys.filter(Boolean)
}

const normalizeDailyReportDirectSpecialtyForManagement = (row: any) => {
  const raw = normalizeLabel(row?.specialty || row?.discipline || row?.disciplina || '')
  const position = row?.position || row?.cargo || row?.role || ''
  const inferred = inferSpecialtyFromPosition(position)
  if (raw.includes('RIGGER')) return 'RIGGER'
  if (raw.includes('ELECTRIC')) return 'ELECTRICO'
  if (raw.includes('CANER') || raw.includes('CAÑER') || raw.includes('HDPE')) return 'CAÑERIA'
  if (raw.includes('ESTRUCT')) return 'ESTRUCTURA'
  if (raw.includes('MECAN')) return 'MECANICO'
  if (raw.includes('OBRA') || raw.includes('CIVIL')) return 'OBRAS CIVILES'
  return inferred || raw || 'PERSONAL DIRECTO'
}

const pickDailyReportSnapshot = (record: any) => {
  const candidates = [
    parseJsonMaybe(record?.notes),
    parseJsonMaybe(record?.v2_form_snapshot),
    parseJsonMaybe(record?.v2_runtime_snapshot),
  ]
  return candidates.reduce((acc, candidate) => (
    candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? { ...acc, ...candidate }
      : acc
  ), {})
}

const parseDailyReportDynamicFrontColumns = (value: any): Array<{ key: string; label: string }> => {
  const raw = (() => {
    const parsed = parseJsonMaybe(value)
    return Array.isArray(parsed) ? parsed : []
  })()
  return raw
    .map((column: any) => ({
      key: String(column?.key || column?.label || '').trim(),
      label: normalizeLabel(column?.label || column?.key || ''),
    }))
    .filter((column) => column.key && column.label)
}

const parseDailyReportDynamicFrontColumnsByBlock = (
  value: any
): Record<'CANALETAS' | 'PISCINAS', Array<{ key: string; label: string }>> | null => {
  const raw = parseJsonMaybe(value)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return {
    CANALETAS: parseDailyReportDynamicFrontColumns(raw.CANALETAS),
    PISCINAS: parseDailyReportDynamicFrontColumns(raw.PISCINAS),
  }
}

const getDailyReportBlockFront = (value: any): 'CANALETAS' | 'PISCINAS' | null => {
  const front = normalizeLabel(value)
  if (front === 'CANALETAS' || front === 'CONTRATO BASE CANALETAS') return 'CANALETAS'
  if (front === 'PISCINAS' || front === 'CONTRATO BASE PISCINAS') return 'PISCINAS'
  return null
}

const getDailyReportDynamicColumnsForRecord = (record: any, snapshot: any) => {
  const columnsByBlock = parseDailyReportDynamicFrontColumnsByBlock(snapshot?.v2_dynamic_front_columns_by_block)
  const blockFront = getDailyReportBlockFront(record?.work_front || snapshot?.work_front)
  if (columnsByBlock && blockFront) return columnsByBlock[blockFront] || []
  const allColumns = parseDailyReportDynamicFrontColumns(snapshot?.v2_dynamic_front_columns)
  if (!columnsByBlock) return allColumns
  return [...columnsByBlock.CANALETAS, ...columnsByBlock.PISCINAS]
}

const getAllDailyReportDynamicColumns = (snapshot: any) => {
  const allColumns = parseDailyReportDynamicFrontColumns(snapshot?.v2_dynamic_front_columns)
  if (allColumns.length > 0) return allColumns
  const columnsByBlock = parseDailyReportDynamicFrontColumnsByBlock(snapshot?.v2_dynamic_front_columns_by_block)
  return columnsByBlock ? [...columnsByBlock.CANALETAS, ...columnsByBlock.PISCINAS] : []
}

const getDailyReportLegacyNocFrontDescriptor = (
  snapshot: any,
  allDynamicColumns: Array<{ key: string; label: string }>
) => {
  const legacyLabel = normalizeLabel(
    snapshot?.v2_noc_front_column_label ||
    snapshot?.noc_front_column_label ||
    snapshot?.nocFrontColumnLabel ||
    ''
  )
  const legacyKey = getNocFrontLookupKey(legacyLabel)
  if (legacyKey) return { key: legacyKey, label: legacyLabel }

  const dynamicWithNoc = allDynamicColumns.find((column) => getNocFrontLookupKey(column.label))
  if (dynamicWithNoc && allDynamicColumns.length === 1) {
    return {
      key: getNocFrontLookupKey(dynamicWithNoc.label) || normalizeLabel(dynamicWithNoc.label),
      label: normalizeLabel(dynamicWithNoc.label),
    }
  }

  const fallbackLabel = legacyLabel || normalizeLabel(allDynamicColumns[0]?.label || '')
  return {
    key: getNocFrontLookupKey(fallbackLabel) || fallbackLabel,
    label: fallbackLabel,
  }
}

const getDailyReportDirectSnapshotRows = (record: any) => {
  const snapshot = pickDailyReportSnapshot(record) as any
  const rawRows = Array.isArray(snapshot?.v2_detail_direct_rows)
    ? snapshot.v2_detail_direct_rows
    : (Array.isArray(snapshot?.detail_direct_rows) ? snapshot.detail_direct_rows : [])
  const fallbackWorkdayHours = toNumber(snapshot?.person_workday_hours || snapshot?.workday_hours || 11) || 11
  const baseFront = normalizeDailyReportFrontForManagement(record?.work_front || snapshot?.work_front)
  const dynamicColumns = getDailyReportDynamicColumnsForRecord(record, snapshot)
  const legacyNocFront = getDailyReportLegacyNocFrontDescriptor(snapshot, getAllDailyReportDynamicColumns(snapshot))

  return rawRows
    .flatMap((row: any) => {
      const specialty = normalizeDailyReportDirectSpecialtyForManagement(row)
      const position = normalizeLabel(row?.position || row?.cargo || row?.role || 'SIN CARGO')
      const hhTurnoDia = toNumber(row?.hhTurnoDia || row?.hh_turno_dia || fallbackWorkdayHours) || fallbackWorkdayHours
      const dotacion = toNumber(row?.dotacionTotalObra ?? row?.dotacion_total_obra)
      const splitDotacion = toNumber(row?.instalacionFaena ?? row?.front1) + toNumber(row?.frente ?? row?.mainFront ?? row?.front2)
      const hhTotal = toNumber(row?.hhTotalObra ?? row?.hh_total_obra)
      const baseHh = hhTotal > 0 ? hhTotal : ((dotacion > 0 ? dotacion : splitDotacion) * hhTurnoDia)
      const dynamicFrontValues = Array.isArray(row?.dynamicFrontValues)
        ? row.dynamicFrontValues.map((value: any) => toNumber(value))
        : []
      const dynamicRows = dynamicColumns
        .map((column, idx) => {
          const dotacion = toNumber(dynamicFrontValues[idx])
          return {
            frontKey: getNocFrontLookupKey(column.label) || normalizeLabel(column.label),
            frontLabel: normalizeLabel(column.label),
            specialty: specialty || 'PERSONAL DIRECTO',
            position,
            hh: dotacion > 0 ? dotacion * hhTurnoDia : 0,
          }
        })
        .filter((item) => item.frontKey && item.hh > 0)
      const legacyNocDotacion = dynamicRows.length === 0 ? toNumber(row?.nocFront) : 0
      const legacyNocHh = legacyNocDotacion > 0 ? legacyNocDotacion * hhTurnoDia : 0
      return [
        { frontKey: baseFront, frontLabel: baseFront, specialty: specialty || 'PERSONAL DIRECTO', position, hh: baseHh },
        ...dynamicRows,
        {
          frontKey: legacyNocFront.key,
          frontLabel: legacyNocFront.label,
          specialty: specialty || 'PERSONAL DIRECTO',
          position,
          hh: legacyNocHh
        },
      ]
    })
    .filter((row: { frontKey: string; specialty: string; position: string; hh: number }) => row.frontKey && row.hh > 0)
}

const getLatestDailyReports = (dailyReports: any[]) => {
  const latestByDateFrontReport = new Map<string, any>()
  dailyReports.forEach((record: any, idx: number) => {
    const snapshot = pickDailyReportSnapshot(record) as any
    const date = String(record?.report_date || '').slice(0, 10)
    const front = normalizeDailyReportFrontForManagement(record?.work_front || snapshot?.work_front)
    if (!date || !front) return
    const reportNo = Number(record?.report_no || snapshot?.report_no || 0) || idx
    const key = `${date}__${front}__${reportNo}`
    const current = latestByDateFrontReport.get(key)
    const currentStamp = Date.parse(String(current?.updated_at || current?.created_at || '')) || 0
    const nextStamp = Date.parse(String(record?.updated_at || record?.created_at || '')) || 0
    if (!current || nextStamp >= currentStamp) latestByDateFrontReport.set(key, record)
  })
  return Array.from(latestByDateFrontReport.values())
}

const getDailyReportIndirectSnapshotRows = (record: any) => {
  const snapshot = pickDailyReportSnapshot(record) as any
  const rawRows = Array.isArray(snapshot?.v2_detail_indirect_rows)
    ? snapshot.v2_detail_indirect_rows
    : (Array.isArray(snapshot?.detail_indirect_rows) ? snapshot.detail_indirect_rows : [])
  const fallbackWorkdayHours = toNumber(snapshot?.person_workday_hours || snapshot?.workday_hours || 11) || 11
  const baseFront = normalizeDailyReportFrontForManagement(record?.work_front || snapshot?.work_front)
  const dynamicColumns = getDailyReportDynamicColumnsForRecord(record, snapshot)
  const legacyNocFront = getDailyReportLegacyNocFrontDescriptor(snapshot, getAllDailyReportDynamicColumns(snapshot))

  return rawRows
    .flatMap((row: any) => {
      const hhTurnoDia = toNumber(row?.hhTurnoDia || row?.hh_turno_dia || fallbackWorkdayHours) || fallbackWorkdayHours
      const dotacion = toNumber(row?.dotacionTotalObra ?? row?.dotacion_total_obra)
      const splitDotacion = toNumber(row?.instalacionFaena ?? row?.front1) + toNumber(row?.frente ?? row?.mainFront ?? row?.front2)
      const hhTotal = toNumber(row?.hhTotalObra ?? row?.hh_total_obra)
      const baseHh = hhTotal > 0 ? hhTotal : ((dotacion > 0 ? dotacion : splitDotacion) * hhTurnoDia)
      const dynamicFrontValues = Array.isArray(row?.dynamicFrontValues)
        ? row.dynamicFrontValues.map((value: any) => toNumber(value))
        : []
      const dynamicRows = dynamicColumns
        .map((column, idx) => {
          const dotacion = toNumber(dynamicFrontValues[idx])
          return {
            frontKey: getNocFrontLookupKey(column.label) || normalizeLabel(column.label),
            frontLabel: normalizeLabel(column.label),
            hh: dotacion > 0 ? dotacion * hhTurnoDia : 0,
          }
        })
        .filter((item) => item.frontKey && item.hh > 0)
      const legacyNocDotacion = dynamicRows.length === 0 ? toNumber(row?.nocFront) : 0
      const legacyNocHh = legacyNocDotacion > 0 ? legacyNocDotacion * hhTurnoDia : 0
      return [
        { frontKey: baseFront, frontLabel: baseFront, hh: baseHh },
        ...dynamicRows,
        {
          frontKey: legacyNocFront.key,
          frontLabel: legacyNocFront.label,
          hh: legacyNocHh
        },
      ]
    })
    .filter((row: { frontKey: string; hh: number }) => row.frontKey && row.hh > 0)
}

const getDirectRowSpecialty = (row: any, report: any) => {
  const explicit = normalizeLabel(row?.specialty || row?.especialidad || row?.discipline || row?.disciplina || '')
  if (explicit) return explicit

  const position = row?.position || row?.role || row?.cargo || ''
  const inferred = inferSpecialtyFromPosition(position)
  const reportSpecialty = getReportSpecialty(report)

  if (inferred) return inferred
  if (reportSpecialty === 'RIGGER') return 'OBRAS CIVILES'
  return reportSpecialty || 'SIN ESPECIALIDAD'
}

const getPersonName = (row: any) => {
  const first = String(row?.first_name || row?.firstName || '').trim()
  const last = String(row?.last_name || row?.lastName || '').trim()
  const full = `${first} ${last}`.replace(/\s+/g, ' ').trim()
  if (full) return full.toUpperCase()
  return String(row?.name || row?.full_name || row?.worker_name || '').trim().toUpperCase() || 'SIN NOMBRE'
}

const normalizePersonDocument = (value: any) =>
  String(value || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '')

const getPersonKey = (row: any, idx: number) => {
  const strongId = String(row?.personId || row?.id || row?.collaborator_id || row?.user_id || '').trim()
  if (strongId) return strongId

  const doc = normalizePersonDocument(row?.document || row?.rut || row?.dni)
  if (doc) return `DOC:${doc}`

  const name = String(getPersonName(row) || '').trim().toUpperCase().replace(/\s+/g, ' ')
  const position = String(row?.position || row?.role || row?.cargo || '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (name) return `NAME:${name}|POS:${position || '-'}`

  return `person-${idx}`
}

const getPersonHourCandidateKeys = (row: any, idx: number) => {
  const keys: string[] = []
  const add = (value: any) => {
    const key = String(value || '').trim()
    if (key && !keys.includes(key)) keys.push(key)
  }

  add(getPersonKey(row, idx))
  add(row?.personId)
  add(row?.id)
  add(row?.collaborator_id)
  add(row?.user_id)
  add(`person-${idx}`)

  const doc = normalizePersonDocument(row?.document || row?.rut || row?.dni)
  if (doc) add(`DOC:${doc}`)

  const name = getPersonName(row)
  const position = String(row?.position || row?.role || row?.cargo || '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (name && name !== 'SIN NOMBRE') add(`NAME:${name}|POS:${position || '-'}`)

  return keys
}

const getPersonHoursForRow = (personHours: Record<string, any>, row: any, idx: number) => {
  const keys = getPersonHourCandidateKeys(row, idx)
  for (const key of keys) {
    if (Array.isArray(personHours?.[key])) return personHours[key]
  }
  return []
}

const getPersonExtraHoursForRow = (extras: Record<string, any>, row: any, idx: number) => {
  const keys = getPersonHourCandidateKeys(row, idx)
  for (const key of keys) {
    if (extras?.[key] !== undefined && extras?.[key] !== null) return toNumber(extras[key])
  }
  return 0
}

const getExplicitAssignmentFrontLabel = (row: any) =>
  normalizeLabel(row?.activity_front || row?.work_front || row?.front || row?.frente || '')

const isBaseFrontLabel = (front: string) =>
  front === 'CANALETAS' ||
  front === 'PISCINAS' ||
  front.includes('CONTRATO BASE CANALETAS') ||
  front.includes('CONTRATO BASE PISCINAS')

const getFrontLabelFromCrewName = (report: any) => {
  const front = normalizeManagementFrontLabel(report?.crew_name || '')
  if (!front || isBaseFrontLabel(front)) return ''
  return front.includes('NOC') || front.includes('USO DE RECURSOS') || front.includes('EJECUCION')
    ? front
    : ''
}

const getReportLevelFrontLabel = (report: any) => {
  const explicit = normalizeLabel(
    report?.work_front ||
    report?.front ||
    report?.frente ||
    report?.front_name ||
    report?.report_title ||
    report?.contract_name ||
    report?.contract ||
    ''
  )
  const crewFront = getFrontLabelFromCrewName(report)
  if (explicit && isBaseFrontLabel(explicit) && crewFront) return crewFront
  return explicit
}

const getFrontLabelForRow = (row: any, report: any) => {
  return normalizeLabel(
    row?.activity_front ||
    row?.work_front ||
    row?.front ||
    row?.frente ||
    getReportLevelFrontLabel(report) ||
    'SIN FRENTE'
  )
}

const getFrontLabelForAssignmentHour = (row: any, report: any, strictBaseFront: string) => {
  const assignmentFront = getExplicitAssignmentFrontLabel(row)
  if (assignmentFront && (!strictBaseFront || !isBaseFrontLabel(assignmentFront))) return assignmentFront
  if (strictBaseFront) return strictBaseFront
  return getFrontLabelForRow(null, report)
}

const getPersonLookupNamePositionKey = (name: any, position: any) => {
  const cleanName = normalizeText(name).replace(/\s+/g, ' ')
  if (!cleanName) return ''
  const cleanPosition = normalizeText(position).replace(/\s+/g, ' ')
  return `${cleanName}|${cleanPosition || '-'}`
}

const buildCollaboratorIndexes = (collaborators: any[]) => {
  const byAnyKey = new Map<string, any>()
  const byDocument = new Map<string, any>()
  const byNamePosition = new Map<string, any>()

  collaborators.forEach((row: any) => {
    ;[
      String(row?.id || '').trim(),
      String(row?.user_id || '').trim(),
      String(row?.collaborator_id || '').trim(),
    ].filter(Boolean).forEach((key) => {
      if (!byAnyKey.has(key)) byAnyKey.set(key, row)
    })

    const doc = normalizePersonDocument(row?.document || row?.rut || row?.dni)
    if (doc && !byDocument.has(doc)) byDocument.set(doc, row)

    const namePositionKey = getPersonLookupNamePositionKey(getPersonName(row), row?.position)
    if (namePositionKey && !byNamePosition.has(namePositionKey)) byNamePosition.set(namePositionKey, row)
  })

  return { byAnyKey, byDocument, byNamePosition }
}

const enrichPersonnelRows = (reports: any[], collaboratorIndexes: ReturnType<typeof buildCollaboratorIndexes>) =>
  reports.map((report: any) => {
    const rows = parseJsonMaybe(report?.personnel)
    if (!Array.isArray(rows)) return report
    const enrichedRows = rows.map((person: any, idx: number) => {
      const keys = [
        person?.personId,
        person?.id,
        person?.collaborator_id,
        person?.user_id,
      ].map((value) => String(value || '').trim()).filter(Boolean)
      const byId = keys.map((key) => collaboratorIndexes.byAnyKey.get(key)).find(Boolean)
      const doc = normalizePersonDocument(person?.document || person?.rut || person?.dni)
      const byDoc = doc ? collaboratorIndexes.byDocument.get(doc) : null
      const namePositionKey = getPersonLookupNamePositionKey(getPersonName(person), person?.position || person?.role || person?.cargo)
      const byName = namePositionKey ? collaboratorIndexes.byNamePosition.get(namePositionKey) : null
      const match = byId || byDoc || byName
      if (!match) return person
      return {
        ...person,
        id: person?.id || match.id,
        personId: person?.personId || match.id,
        collaborator_id: person?.collaborator_id || match.id,
        first_name: person?.first_name || match.first_name,
        last_name: person?.last_name || match.last_name,
        document: person?.document || match.document,
        position: person?.position || person?.role || person?.cargo || match.position,
        specialty: person?.specialty || person?.especialidad || match.specialty,
        worker_type: person?.worker_type || person?.workerType || person?.type || match.worker_type,
        __idx: idx,
      }
    })
    return { ...report, personnel: enrichedRows }
  })

const getReportDirectRows = (report: any) => {
  const personnel = parseJsonMaybe(report?.personnel)
  const personHoursRaw = parseJsonMaybe(report?.person_hours)
  const personHours = personHoursRaw && typeof personHoursRaw === 'object' && !Array.isArray(personHoursRaw)
    ? { ...personHoursRaw }
    : {}
  const extras = personHours.__extras && typeof personHours.__extras === 'object' ? personHours.__extras : {}
  delete personHours.__extras

  const rows = Array.isArray(personnel) ? personnel : []
  const directRows: Array<{ personKey: string; specialty: string; position: string; hh: number; hhExtras: number; name: string; document: string }> = []

  rows.forEach((row: any, idx: number) => {
    const position = row?.position || row?.role || row?.cargo || ''
    if (!isDirectWorkerRow(row)) return

    const key = getPersonKey(row, idx)
    const hours = getPersonHoursForRow(personHours, row, idx)
    const extra = getPersonExtraHoursForRow(extras, row, idx)
    const hh = hours.reduce((acc: number, value: any) => acc + toNumber(value), 0)
    const total = hh + extra
    if (total <= 0) return

    directRows.push({
      personKey: key,
      specialty: getDirectRowSpecialty(row, report),
      position: normalizeLabel(position || 'SIN CARGO'),
      hh,
      hhExtras: extra,
      name: getPersonName(row),
      document: normalizeLabel(row?.document || row?.rut || row?.dni || ''),
    })
  })

  return directRows
}

const getReportDirectFrontRows = (report: any) => {
  const personnel = parseJsonMaybe(report?.personnel)
  const personHoursRaw = parseJsonMaybe(report?.person_hours)
  const personHours = personHoursRaw && typeof personHoursRaw === 'object' && !Array.isArray(personHoursRaw)
    ? { ...personHoursRaw }
    : {}
  const extras = personHours.__extras && typeof personHours.__extras === 'object' ? personHours.__extras : {}
  delete personHours.__extras

  const assignments = parseJsonMaybe(report?.assignments)
  const assignmentRows = Array.isArray(assignments) ? assignments : []
  const reportFrontNormalized = getFrontLabelForRow(null, report)
  const isBaseCanaletas = reportFrontNormalized.includes('CONTRATO BASE CANALETAS') || reportFrontNormalized === 'CANALETAS'
  const isBasePiscinas = reportFrontNormalized.includes('CONTRATO BASE PISCINAS') || reportFrontNormalized === 'PISCINAS'
  const strictBaseFront = isBaseCanaletas ? 'CONTRATO BASE CANALETAS' : (isBasePiscinas ? 'CONTRATO BASE PISCINAS' : '')
  const rows = Array.isArray(personnel) ? personnel : []
  const out: Array<{ front: string; specialty: string; hh: number; hhExtras: number; personKey: string; directCount: number }> = []

  rows.forEach((row: any, idx: number) => {
    if (!isDirectWorkerRow(row)) return

    const key = getPersonKey(row, idx)
    const specialty = getDirectRowSpecialty(row, report)
    const hours = getPersonHoursForRow(personHours, row, idx)
    const extra = getPersonExtraHoursForRow(extras, row, idx)

    let hhTotal = 0
    const hhByFront = new Map<string, number>()
    hours.forEach((value: any, hourIdx: number) => {
      const parsed = toNumber(value)
      if (parsed <= 0) return
      hhTotal += parsed
      const front = getFrontLabelForAssignmentHour(assignmentRows[hourIdx], report, strictBaseFront)
      hhByFront.set(front, Number(hhByFront.get(front) || 0) + parsed)
    })

    if (hhTotal <= 0 && extra <= 0) return

    if (hhTotal > 0) {
      const rankedFronts = Array.from(hhByFront.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return a[0].localeCompare(b[0], 'es')
      })
      const primaryFront = rankedFronts[0]?.[0] || ''
      hhByFront.forEach((frontHh, front) => {
        const ratio = frontHh / hhTotal
        out.push({
          front,
          specialty,
          hh: frontHh,
          hhExtras: extra > 0 ? extra * ratio : 0,
          personKey: key,
          directCount: front === primaryFront ? 1 : 0,
        })
      })
      return
    }

    const fallbackFront = strictBaseFront || getFrontLabelForRow(null, report)
    out.push({ front: fallbackFront, specialty, hh: 0, hhExtras: extra, personKey: key, directCount: 1 })
  })

  return out
}

const upsertGroup = (
  map: Map<string, GroupSummary>,
  label: string,
  hh: number,
  hhExtras = 0,
  reports = 1,
  peopleRows = 1
) => {
  const key = label || 'SIN CLASIFICAR'
  const current = map.get(key) || { label: key, hh: 0, hhExtras: 0, peopleRows: 0, reports: 0 }
  current.hh += Number(hh || 0)
  current.hhExtras += Number(hhExtras || 0)
  current.peopleRows += Number(peopleRows || 0)
  current.reports += reports
  map.set(key, current)
}

const sortGroups = (groups: GroupSummary[]) =>
  groups.sort((a, b) => {
    const totalB = Number(b.hh || 0) + Number(b.hhExtras || 0)
    const totalA = Number(a.hh || 0) + Number(a.hhExtras || 0)
    if (totalB !== totalA) return totalB - totalA
    return a.label.localeCompare(b.label, 'es')
  })

const normalizeCandidateSpecialty = (val: any) => {
  if (val == null) return ''
  if (Array.isArray(val)) return normalizeText(val.join(', '))
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return normalizeText(parsed.join(', '))
    } catch {}
    return normalizeText(val)
  }
  try { return normalizeText(String(val)) } catch { return '' }
}

const splitSpecialtyTokens = (raw: any): string[] => {
  const normalized = normalizeCandidateSpecialty(raw)
  if (!normalized) return []
  return normalized.split(/[,;/|]+/).map((x) => normalizeText(x)).filter(Boolean)
}

const specialtyMatches = (reportSpecialty: any, userSpecialty: string) => {
  const userNorm = normalizeCandidateSpecialty(userSpecialty)
  if (!userNorm) return false
  const reportNorm = normalizeCandidateSpecialty(reportSpecialty)
  if (!reportNorm) return false
  const reportTokens = splitSpecialtyTokens(reportSpecialty)
  if (reportTokens.includes(userNorm)) return true
  return reportNorm.includes(userNorm) || userNorm.includes(reportNorm)
}

const resolveUserSpecialty = async (companyId: string, session: any) => {
  const fromSession = normalizeCandidateSpecialty(session?.user?.specialty)
  if (fromSession) return fromSession
  const userId = session?.user?.id
  if (!userId || !companyId) return ''

  try {
    const { data } = await supabaseAdmin
      .from('pr_collaborators')
      .select('specialty, especialidad')
      .eq('user_id', String(userId))
      .eq('company_id', companyId)
      .maybeSingle()
    return normalizeCandidateSpecialty((data as any)?.specialty || (data as any)?.especialidad)
  } catch {
    return ''
  }
}

const fetchAllReportsForRange = async (companyId: string, dateFrom: string, dateTo: string) => {
  const rows: any[] = []
  const pageSize = 1000
  let offset = 0
  while (offset < 5000) {
    const { data, error } = await supabaseAdmin
      .from('pr_field_reports')
      .select(FIELD_REPORT_MANAGEMENT_HH_SELECT)
      .eq('company_id', companyId)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    const chunk = Array.isArray(data) ? data : []
    rows.push(...chunk)
    if (chunk.length < pageSize) break
    offset += pageSize
  }
  return rows
}

const fetchDailyReportsForRange = async (companyId: string, dateFrom: string, dateTo: string) => {
  const rows: any[] = []
  const pageSize = 1000
  let offset = 0
  while (offset < 5000) {
    const { data, error } = await supabaseAdmin
      .from('pr_daily_reports')
      .select(DAILY_REPORT_MANAGEMENT_HH_SELECT)
      .eq('company_id', companyId)
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) {
      if (isMissingTableError(error)) return []
      throw error
    }
    const chunk = Array.isArray(data) ? data : []
    rows.push(...chunk)
    if (chunk.length < pageSize) break
    offset += pageSize
  }
  return rows
}

const fetchCollaborators = async (companyId: string) => {
  const { data, error } = await supabaseAdmin
    .from('pr_collaborators')
    .select('id, user_id, first_name, last_name, document, position, specialty, worker_type')
    .eq('company_id', companyId)
  if (error) throw error
  return Array.isArray(data) ? data : []
}

const isMissingTableError = (error: any) =>
  String(error?.code || '') === '42P01' ||
  String(error?.message || '').toLowerCase().includes('does not exist')

const fetchRoleHistoryForRows = async (companyId: string, rows: any[]) => {
  const collaboratorIds = Array.from(new Set(rows.map((row: any) => String(row?.collaborator_id || '').trim()).filter(Boolean)))
  const minDate = rows
    .map((row: any) => String(row?.work_date || '').slice(0, 10))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))[0]
  const maxDate = rows
    .map((row: any) => String(row?.work_date || '').slice(0, 10))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0]
  if (!companyId || collaboratorIds.length === 0 || !minDate || !maxDate) return []

  const rowsOut: any[] = []
  for (let index = 0; index < collaboratorIds.length; index += 500) {
    const chunk = collaboratorIds.slice(index, index + 500)
    const { data, error } = await supabaseAdmin
      .from('pr_collaborator_role_history')
      .select('collaborator_id, position, specialty, worker_type, valid_from, valid_to')
      .eq('company_id', companyId)
      .in('collaborator_id', chunk)
      .lte('valid_from', maxDate)
      .or(`valid_to.is.null,valid_to.gte.${minDate}`)

    if (error) {
      if (isMissingTableError(error)) return []
      throw error
    }
    rowsOut.push(...(Array.isArray(data) ? data : []))
  }
  return rowsOut
}

const pickRoleForDate = (historyRows: any[], collaboratorId: string, workDate: string) => {
  const date = String(workDate || '').slice(0, 10)
  return (historyRows || [])
    .filter((row: any) => {
      if (String(row?.collaborator_id || '') !== String(collaboratorId || '')) return false
      const from = String(row?.valid_from || '').slice(0, 10)
      const to = row?.valid_to ? String(row.valid_to).slice(0, 10) : ''
      return from <= date && (!to || to >= date)
    })
    .sort((a: any, b: any) => String(b?.valid_from || '').localeCompare(String(a?.valid_from || '')))[0] || null
}

const fetchIndirectTurnoByDateAndPosition = async (companyId: string, dateFrom: string, dateTo: string) => {
  const statusRows: any[] = []
  const pageSize = 1000
  let offset = 0
  while (offset < 200000) {
    const { data, error } = await supabaseAdmin
      .from('pr_collaborator_daily_status')
      .select('collaborator_id, work_date, status, reason')
      .eq('company_id', companyId)
      .gte('work_date', dateFrom)
      .lte('work_date', dateTo)
      .or('status.eq.Turno,reason.eq.11')
      .range(offset, offset + pageSize - 1)
    if (error) {
      if (String(error?.code || '') === '42P01') return new Map<string, Map<string, GroupSummary>>()
      throw error
    }
    const chunk = Array.isArray(data) ? data : []
    statusRows.push(...chunk)
    if (chunk.length < pageSize) break
    offset += pageSize
  }

  const turnoRows = statusRows
  const collaboratorIds = Array.from(new Set(turnoRows.map((row) => String(row?.collaborator_id || '').trim()).filter(Boolean)))
  if (collaboratorIds.length === 0) return new Map<string, Map<string, GroupSummary>>()

  const collabs: any[] = []
  for (let index = 0; index < collaboratorIds.length; index += 500) {
    const chunk = collaboratorIds.slice(index, index + 500)
    const { data, error: collabError } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id, position, worker_type')
      .eq('company_id', companyId)
      .in('id', chunk)
    if (collabError) throw collabError
    collabs.push(...(Array.isArray(data) ? data : []))
  }

  const collabsById = new Map<string, any>()
  collabs.forEach((collab: any) => collabsById.set(String(collab?.id || ''), collab))

  let roleHistoryRows: any[] = []
  try {
    roleHistoryRows = await fetchRoleHistoryForRows(companyId, turnoRows)
  } catch (historyError) {
    console.warn('Could not load collaborator role history for HH summary:', historyError)
  }

  const out = new Map<string, Map<string, GroupSummary>>()
  turnoRows.forEach((row) => {
    const workDate = String(row?.work_date || '').slice(0, 10)
    const current = collabsById.get(String(row?.collaborator_id || ''))
    const historical = pickRoleForDate(roleHistoryRows, String(row?.collaborator_id || ''), workDate)
    const collaborator = historical
      ? {
          ...current,
          position: historical.position ?? current?.position,
          worker_type: historical.worker_type ?? current?.worker_type,
        }
      : current
    if (!workDate || normalizeText(collaborator?.worker_type) !== 'indirecto') return
    const position = normalizeLabel(collaborator?.position || 'SIN CARGO')
    const byPosition = out.get(workDate) || new Map<string, GroupSummary>()
    const turnoHours = workDate >= CURRENT_WORKDAY_START_DATE ? 11 : 10
    upsertGroup(byPosition, position, turnoHours, 0)
    out.set(workDate, byPosition)
  })

  return out
}

const buildDailyReportDirectSnapshotMaps = (dailyReports: any[]) => {
  const byFront = new Map<string, number>()
  const byFrontSpecialty = new Map<string, Map<string, number>>()
  getLatestDailyReports(dailyReports).forEach((record: any) => {
    const date = String(record?.report_date || '').slice(0, 10)
    if (!date) return

    getDailyReportDirectSnapshotRows(record).forEach((row: { frontKey: string; specialty: string; hh: number }) => {
      const frontKey = `${date}__${row.frontKey}`
      const specialtyMap = byFrontSpecialty.get(frontKey) || new Map<string, number>()
      byFront.set(frontKey, Number(byFront.get(frontKey) || 0) + row.hh)
      specialtyMap.set(row.specialty, Number(specialtyMap.get(row.specialty) || 0) + row.hh)
      byFrontSpecialty.set(frontKey, specialtyMap)
    })
  })

  return { byFront, byFrontSpecialty }
}

const getDailyReportDirectHhForFront = (
  snapshots: ReturnType<typeof buildDailyReportDirectSnapshotMaps>,
  date: string,
  front: string,
  specialty?: string
) => {
  const keys = getFrontLookupKeys(front).map((key) => `${date}__${key}`)
  return keys.reduce((acc, key) => {
    if (specialty) return acc + Number(snapshots.byFrontSpecialty.get(key)?.get(specialty) || 0)
    return acc + Number(snapshots.byFront.get(key) || 0)
  }, 0)
}

const pickDailyReportSummaryHh = (record: any) => {
  const snapshot = pickDailyReportSnapshot(record) as any
  const directFromSummary = toNumber(snapshot?.summary_direct_hh)
  const indirectFromSummary = toNumber(snapshot?.summary_indirect_hh)
  const directFromS4 = Math.max(0, toNumber(record?.s4_curr_direct_hh) - toNumber(record?.s4_prev_direct_hh))
  const indirectFromS4 = Math.max(0, toNumber(record?.s4_curr_indirect_hh) - toNumber(record?.s4_prev_indirect_hh))
  const directHh = directFromSummary > 0 ? directFromSummary : directFromS4
  const indirectHh = indirectFromSummary > 0 ? indirectFromSummary : indirectFromS4
  const totalHh = directHh + indirectHh > 0 ? directHh + indirectHh : toNumber(record?.hh_day)
  return { directHh, indirectHh, totalHh }
}

const buildDailyReportWeeklySummary = (dailyReports: any[]) => {
  const latestReports = getLatestDailyReports(dailyReports)

  const byFront = new Map<string, {
    front: string
    direct_hh: number
    indirect_hh: number
    total_hh: number
    reports: Set<string>
  }>()
  let directHh = 0
  let indirectHh = 0
  let totalHh = 0

  const upsertFront = (frontRaw: any, values: { directHh?: number; indirectHh?: number }, reportId: string) => {
    const frontLabel = normalizeDailyReportFrontForManagement(frontRaw) || 'SIN FRENTE'
    const frontKey = getDailyReportFrontGroupKey(frontLabel)
    const current = byFront.get(frontKey) || {
      front: frontLabel,
      direct_hh: 0,
      indirect_hh: 0,
      total_hh: 0,
      reports: new Set<string>(),
    }
    current.front = pickPreferredDailyReportFrontLabel(current.front, frontLabel)
    current.direct_hh += Number(values.directHh || 0)
    current.indirect_hh += Number(values.indirectHh || 0)
    current.total_hh = current.direct_hh + current.indirect_hh
    if (reportId) current.reports.add(reportId)
    byFront.set(frontKey, current)
  }

  latestReports.forEach((record: any) => {
    const snapshot = pickDailyReportSnapshot(record) as any
    const reportId = String(record?.id || `${record?.report_date || ''}-${record?.report_no || ''}`)
    const baseFront = normalizeDailyReportFrontForManagement(record?.work_front || snapshot?.work_front)
    const summary = pickDailyReportSummaryHh(record)
    const directRows = getDailyReportDirectSnapshotRows(record)
    const indirectRows = getDailyReportIndirectSnapshotRows(record)
    const directRowsTotal = directRows.reduce((acc: number, row: any) => acc + Number(row?.hh || 0), 0)
    const indirectRowsTotal = indirectRows.reduce((acc: number, row: any) => acc + Number(row?.hh || 0), 0)
    const effectiveDirect = directRowsTotal > 0 ? directRowsTotal : summary.directHh
    const effectiveIndirect = indirectRowsTotal > 0 ? indirectRowsTotal : summary.indirectHh

    directHh += effectiveDirect
    indirectHh += effectiveIndirect
    totalHh += effectiveDirect + effectiveIndirect

    if (directRowsTotal > 0) {
      directRows.forEach((row: any) => upsertFront(row.frontLabel || row.frontKey, { directHh: Number(row.hh || 0) }, reportId))
    } else if (summary.directHh > 0) {
      upsertFront(baseFront, { directHh: summary.directHh }, reportId)
    }

    if (indirectRowsTotal > 0) {
      indirectRows.forEach((row: any) => upsertFront(row.frontLabel || row.frontKey, { indirectHh: Number(row.hh || 0) }, reportId))
    } else if (summary.indirectHh > 0) {
      upsertFront(baseFront, { indirectHh: summary.indirectHh }, reportId)
    }
  })

  return {
    direct_hh: directHh,
    indirect_hh: indirectHh,
    total_hh: totalHh,
    report_count: latestReports.length,
    by_front: Array.from(byFront.values())
      .map((front) => ({
        front: front.front,
        direct_hh: front.direct_hh,
        indirect_hh: front.indirect_hh,
        total_hh: front.total_hh,
        reports: front.reports.size,
      }))
      .sort((a, b) => b.total_hh - a.total_hh || a.front.localeCompare(b.front, 'es')),
  }
}

const buildDailyReportDailySummaryMap = (dailyReports: any[]) => {
  const byDate = new Map<string, {
    direct_hh: number
    indirect_hh: number
    total_hh: number
    report_count: number
  }>()

  getLatestDailyReports(dailyReports).forEach((record: any) => {
    const date = String(record?.report_date || '').slice(0, 10)
    if (!date) return

    const summary = pickDailyReportSummaryHh(record)
    const directRowsTotal = getDailyReportDirectSnapshotRows(record)
      .reduce((acc: number, row: any) => acc + Number(row?.hh || 0), 0)
    const indirectRowsTotal = getDailyReportIndirectSnapshotRows(record)
      .reduce((acc: number, row: any) => acc + Number(row?.hh || 0), 0)
    const directHh = directRowsTotal > 0 ? directRowsTotal : summary.directHh
    const indirectHh = indirectRowsTotal > 0 ? indirectRowsTotal : summary.indirectHh
    const current = byDate.get(date) || {
      direct_hh: 0,
      indirect_hh: 0,
      total_hh: 0,
      report_count: 0,
    }

    current.direct_hh += directHh
    current.indirect_hh += indirectHh
    current.total_hh = current.direct_hh + current.indirect_hh
    current.report_count += 1
    byDate.set(date, current)
  })

  return byDate
}

const buildSummary = (
  reports: any[],
  dateFrom: string,
  dateTo: string,
  indirectTurnoByDateAndPosition: Map<string, Map<string, GroupSummary>>,
  dailyReportDirectSnapshots: ReturnType<typeof buildDailyReportDirectSnapshotMaps>,
  dailyReportWeeklySummary = buildDailyReportWeeklySummary([]),
  dailyReports: any[] = []
) => {
  const matrixDates = listDateKeysBetween(dateFrom, dateTo)
  const matrixWeeks = buildProjectWeeksBetween(dateFrom, dateTo)
  const dailyReportSummaryByDate = buildDailyReportDailySummaryMap(dailyReports)
  const directHhByDaySpecialtyMap = new Map<string, { date: string; specialty: string; reports: number; peopleRows: number; hh: number; hhExtras: number }>()
  const peopleByDaySpecialty = new Map<string, Set<string>>()
  const rowsByMatrixKey = new Map<string, HhMatrixRow & { people: Set<string>; reportSet: Set<string> }>()
  const dayMap = new Map<string, {
    date: string
    hh: number
    hhExtras: number
    directPeople: Set<string>
    reports: Set<string>
    bySpecialty: Map<string, GroupSummary>
    byFront: Map<string, GroupSummary>
    byFrontSpecialty: Map<string, Map<string, GroupSummary>>
    frontPersonHH: Map<string, Map<string, number>>
    frontSpecialtyPeople: Map<string, Map<string, Set<string>>>
    byPosition: Map<string, GroupSummary>
    specialtyPeople: Map<string, Set<string>>
    positionPeople: Map<string, Set<string>>
    specialtyAudit: Map<string, { declaredRows: number; byPerson: Map<string, { personKey: string; name: string; document: string; reports: Set<string> }> }>
  }>()

  reports.forEach((report, reportIdx) => {
    const date = String(report?.date || report?.report_date || '').slice(0, 10)
    if (!date) return
    const reportId = String(report?.id || `report-${reportIdx}`)
    const directRows = getReportDirectRows(report)
    if (directRows.length === 0) return

    const reportedSpecialties = new Set<string>()
    const day = dayMap.get(date) || {
      date,
      hh: 0,
      hhExtras: 0,
      directPeople: new Set<string>(),
      reports: new Set<string>(),
      bySpecialty: new Map<string, GroupSummary>(),
      byFront: new Map<string, GroupSummary>(),
      byFrontSpecialty: new Map<string, Map<string, GroupSummary>>(),
      frontPersonHH: new Map<string, Map<string, number>>(),
      frontSpecialtyPeople: new Map<string, Map<string, Set<string>>>(),
      byPosition: new Map<string, GroupSummary>(),
      specialtyPeople: new Map<string, Set<string>>(),
      positionPeople: new Map<string, Set<string>>(),
      specialtyAudit: new Map(),
    }
    day.reports.add(reportId)

    directRows.forEach((row) => {
      if (row.hh <= 0 && row.hhExtras <= 0) return
      const personKey = String(row.personKey || '')
      const specialty = row.specialty || getReportSpecialty(report)
      const daySpecialtyKey = `${date}__${specialty}`
      const currentDirect = directHhByDaySpecialtyMap.get(daySpecialtyKey) || { date, specialty, reports: 0, peopleRows: 0, hh: 0, hhExtras: 0 }
      const reportKey = `${daySpecialtyKey}__${reportId}`
      if (!reportedSpecialties.has(reportKey)) {
        currentDirect.reports += 1
        reportedSpecialties.add(reportKey)
      }
      const peopleSet = peopleByDaySpecialty.get(daySpecialtyKey) || new Set<string>()
      if (personKey) peopleSet.add(personKey)
      peopleByDaySpecialty.set(daySpecialtyKey, peopleSet)
      currentDirect.peopleRows = peopleSet.size
      currentDirect.hh += row.hh
      currentDirect.hhExtras += row.hhExtras
      directHhByDaySpecialtyMap.set(daySpecialtyKey, currentDirect)

      day.hh += row.hh
      day.hhExtras += row.hhExtras
      day.directPeople.add(personKey)

      const specialtyPeopleSet = day.specialtyPeople.get(specialty) || new Set<string>()
      specialtyPeopleSet.add(personKey)
      day.specialtyPeople.set(specialty, specialtyPeopleSet)

      const positionPeopleSet = day.positionPeople.get(row.position) || new Set<string>()
      positionPeopleSet.add(personKey)
      day.positionPeople.set(row.position, positionPeopleSet)

      upsertGroup(day.bySpecialty, specialty, row.hh, row.hhExtras, 0)
      upsertGroup(day.byPosition, row.position, row.hh, row.hhExtras, 0)

      const specialtyGroup = day.bySpecialty.get(specialty)
      if (specialtyGroup) specialtyGroup.peopleRows = specialtyPeopleSet.size
      const positionGroup = day.byPosition.get(row.position)
      if (positionGroup) positionGroup.peopleRows = positionPeopleSet.size

      const audit = day.specialtyAudit.get(specialty) || { declaredRows: 0, byPerson: new Map() }
      audit.declaredRows += 1
      const personAudit = audit.byPerson.get(personKey) || {
        personKey,
        name: row.name || 'SIN NOMBRE',
        document: row.document || '-',
        reports: new Set<string>(),
      }
      personAudit.reports.add(reportId)
      audit.byPerson.set(personKey, personAudit)
      day.specialtyAudit.set(specialty, audit)
    })

    const directRowsByPerson = new Map(directRows.map((row) => [String(row.personKey), row]))
    getReportDirectFrontRows(report).forEach((row) => {
      const specialty = row.specialty || getReportSpecialty(report)
      upsertGroup(day.byFront, row.front, row.hh, row.hhExtras, 0, row.directCount)

      const bySpecialtyMap = day.byFrontSpecialty.get(row.front) || new Map<string, GroupSummary>()
      upsertGroup(bySpecialtyMap, specialty, row.hh, row.hhExtras, 0, row.directCount)
      day.byFrontSpecialty.set(row.front, bySpecialtyMap)

      const frontSpecPeopleMap = day.frontSpecialtyPeople.get(row.front) || new Map<string, Set<string>>()
      const frontSpecPeopleSet = frontSpecPeopleMap.get(specialty) || new Set<string>()
      if (row.personKey) frontSpecPeopleSet.add(String(row.personKey))
      frontSpecPeopleMap.set(specialty, frontSpecPeopleSet)
      day.frontSpecialtyPeople.set(row.front, frontSpecPeopleMap)

      const personKey = String(row.personKey || '').trim()
      if (personKey) {
        const personByFront = day.frontPersonHH.get(personKey) || new Map<string, number>()
        personByFront.set(row.front, Number(personByFront.get(row.front) || 0) + Number(row.hh || 0))
        day.frontPersonHH.set(personKey, personByFront)
      }

      const person = directRowsByPerson.get(String(row.personKey))
      const position = person?.position || 'SIN CARGO'
      const key = `${specialty}__${position}__${row.front || 'SIN FRENTE'}`
      const matrixRow = rowsByMatrixKey.get(key) || {
        key,
        specialty,
        position,
        front: row.front || 'SIN FRENTE',
        peopleRows: 0,
        reports: 0,
        hh: 0,
        hhExtras: 0,
        dailyReportHh: 0,
        byDate: {},
        byWeek: {},
        people: new Set<string>(),
        reportSet: new Set<string>(),
      }
      const totalHh = Number(row.hh || 0) + Number(row.hhExtras || 0)
      const weekKey = getSequentialWeekKeyForDate(date, matrixWeeks)
      matrixRow.hh += Number(row.hh || 0)
      matrixRow.hhExtras += Number(row.hhExtras || 0)
      matrixRow.byDate[date] = Number(matrixRow.byDate[date] || 0) + totalHh
      if (weekKey) matrixRow.byWeek[weekKey] = Number(matrixRow.byWeek[weekKey] || 0) + totalHh
      if (row.personKey) matrixRow.people.add(String(row.personKey))
      matrixRow.reportSet.add(reportId)
      matrixRow.peopleRows = matrixRow.people.size
      matrixRow.reports = matrixRow.reportSet.size
      rowsByMatrixKey.set(key, matrixRow)
    })

    dayMap.set(date, day)
  })

  getLatestDailyReports(dailyReports).forEach((report: any, reportIdx: number) => {
    const date = String(report?.report_date || '').slice(0, 10)
    if (!date) return

    getDailyReportDirectSnapshotRows(report).forEach((row: any) => {
      const specialty = normalizeLabel(row?.specialty || 'PERSONAL DIRECTO')
      const position = normalizeLabel(row?.position || 'SIN CARGO')
      const front = normalizeDailyReportFrontForManagement(row?.frontLabel || row?.frontKey)
      if (!front) return
      const key = `${specialty}__${position}__${front}`
      const matrixRow = rowsByMatrixKey.get(key) || {
        key,
        specialty,
        position,
        front,
        peopleRows: 0,
        reports: 0,
        hh: 0,
        hhExtras: 0,
        dailyReportHh: 0,
        byDate: {},
        byWeek: {},
        people: new Set<string>(),
        reportSet: new Set<string>(),
      }
      matrixRow.dailyReportHh += Number(row?.hh || 0)
      rowsByMatrixKey.set(key, matrixRow)
    })
  })

  const dashboardByDay = Array.from(dayMap.values()).map((day) => {
    const dailyReportSummary = dailyReportSummaryByDate.get(day.date)
    const sortedByFront = sortGroups(Array.from(day.byFront.values()))
    const directAssigneeByFront = new Map<string, number>()
    const primaryFrontByPerson = new Map<string, string>()
    Array.from(day.frontPersonHH.entries()).forEach(([personKey, frontsMap]) => {
      const ranked = Array.from(frontsMap.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return a[0].localeCompare(b[0], 'es')
      })
      const primaryFront = ranked[0]?.[0]
      if (!primaryFront) return
      primaryFrontByPerson.set(personKey, primaryFront)
      directAssigneeByFront.set(primaryFront, Number(directAssigneeByFront.get(primaryFront) || 0) + 1)
    })
    const indirectTurnoRows = Array.from((indirectTurnoByDateAndPosition.get(day.date) || new Map<string, GroupSummary>()).values())
    return {
      date: day.date,
      hh: day.hh,
      hhExtras: day.hhExtras,
      dailyReportDirectHh: Number(dailyReportSummary?.direct_hh || 0),
      dailyReportIndirectHh: Number(dailyReportSummary?.indirect_hh || 0),
      dailyReportHh: Number(dailyReportSummary?.total_hh || 0),
      dailyReportCount: Number(dailyReportSummary?.report_count || 0),
      peopleRows: day.directPeople.size,
      reports: day.reports.size,
      indirectTurnoTotal: indirectTurnoRows.reduce((acc, item) => acc + Number(item.peopleRows || 0), 0),
      indirectTurnoHhTotal: indirectTurnoRows.reduce((acc, item) => acc + Number(item.hh || 0), 0),
      bySpecialty: sortGroups(Array.from(day.bySpecialty.values())),
      byFront: sortedByFront.map((frontGroup) => {
        return {
          ...frontGroup,
          dailyReportDirectHh: getDailyReportDirectHhForFront(dailyReportDirectSnapshots, day.date, frontGroup.label),
          peopleRows: Number(directAssigneeByFront.get(frontGroup.label) || 0),
        }
      }),
      byFrontSpecialty: sortedByFront.map((frontGroup) => ({
        front: frontGroup.label,
        specialties: sortGroups(Array.from((day.byFrontSpecialty.get(frontGroup.label) || new Map<string, GroupSummary>()).values()))
          .map((specialtyGroup) => {
            const peopleSet = day.frontSpecialtyPeople.get(frontGroup.label)?.get(specialtyGroup.label) || new Set<string>()
            const counted = Array.from(peopleSet).filter((personKey) => primaryFrontByPerson.get(personKey) === frontGroup.label).length
            const dailySpecialtyHh = getDailyReportDirectHhForFront(dailyReportDirectSnapshots, day.date, frontGroup.label, specialtyGroup.label)
            return { ...specialtyGroup, dailyReportDirectHh: dailySpecialtyHh, peopleRows: counted }
          }),
      })),
      byPosition: sortGroups(Array.from(day.byPosition.values())),
      indirectTurnoByPosition: indirectTurnoRows.sort((a, b) => a.label.localeCompare(b.label, 'es')),
      specialtyAudit: Array.from(day.specialtyAudit.entries()).map(([specialty, audit]) => ({
        specialty,
        declaredRows: Number(audit.declaredRows || 0),
        uniquePeople: audit.byPerson.size,
        people: Array.from(audit.byPerson.values())
          .map((p) => ({
            personKey: p.personKey,
            name: p.name,
            document: p.document,
            reports: p.reports.size,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      })).sort((a, b) => a.specialty.localeCompare(b.specialty, 'es')),
    }
  }).sort((a, b) => b.date.localeCompare(a.date))

  const directHhByDaySpecialty = Array.from(directHhByDaySpecialtyMap.values()).sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return a.specialty.localeCompare(b.specialty, 'es')
  })

  const matrixRows = Array.from(rowsByMatrixKey.values())
    .map(({ people: _people, reportSet: _reportSet, ...row }) => row)
    .sort((a, b) => {
      if (a.specialty !== b.specialty) return a.specialty.localeCompare(b.specialty, 'es')
      if (a.position !== b.position) return a.position.localeCompare(b.position, 'es')
      return a.front.localeCompare(b.front, 'es')
    })

  const matrixTotalsByWeek: Record<string, number> = {}
  matrixRows.forEach((row) => {
    matrixWeeks.forEach((week) => {
      matrixTotalsByWeek[week.key] = Number(matrixTotalsByWeek[week.key] || 0) + Number(row.byWeek[week.key] || 0)
    })
  })

  return {
    date_from: dateFrom,
    date_to: dateTo,
    weeks: matrixWeeks,
    dates: matrixDates,
    direct_hh_by_day_specialty: directHhByDaySpecialty,
    dashboard_by_day: dashboardByDay,
    matrix_rows: matrixRows,
    matrix_totals_by_week: matrixTotalsByWeek,
    daily_report_weekly_summary: dailyReportWeeklySummary,
    total_hh_directas: directHhByDaySpecialty.reduce((acc, row) => acc + row.hh, 0),
    total_hh_extras_directas: directHhByDaySpecialty.reduce((acc, row) => acc + row.hhExtras, 0),
    directos_declarados: dashboardByDay.reduce((acc, row) => acc + row.peopleRows, 0),
    report_count: reports.length,
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const companyId = String(session.user.companyId)
    const role = String(session?.user?.role || '').toLowerCase()
    const params = request.nextUrl.searchParams
    let dateFrom = String(params.get('date_from') || '').slice(0, 10)
    let dateTo = String(params.get('date_to') || '').slice(0, 10)
    const hasExplicitRange = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || /^\d{4}-\d{2}-\d{2}$/.test(dateTo)

    if (hasExplicitRange) {
      if (!dateFrom) dateFrom = dateTo
      if (!dateTo) dateTo = dateFrom
      if (dateFrom > dateTo) {
        const tmp = dateFrom
        dateFrom = dateTo
        dateTo = tmp
      }
    } else {
      const { data, error } = await supabaseAdmin
        .from('pr_field_reports')
        .select('date')
        .eq('company_id', companyId)
        .order('date', { ascending: false })
        .limit(1)
      if (error) throw error
      const latestDate = String(data?.[0]?.date || '').slice(0, 10)
      const week = getWeekRangeFromDateKey(latestDate)
      dateFrom = week.start || latestDate
      dateTo = week.end || latestDate
    }

    if (!dateFrom || !dateTo) {
      return NextResponse.json({
        date_from: '',
        date_to: '',
        weeks: [],
        dates: [],
        direct_hh_by_day_specialty: [],
        dashboard_by_day: [],
        matrix_rows: [],
        matrix_totals_by_week: {},
        daily_report_weekly_summary: buildDailyReportWeeklySummary([]),
        total_hh_directas: 0,
        total_hh_extras_directas: 0,
        directos_declarados: 0,
        report_count: 0,
      })
    }

    const [rawReports, collaborators, indirectTurnoByDateAndPosition] = await Promise.all([
      fetchAllReportsForRange(companyId, dateFrom, dateTo),
      fetchCollaborators(companyId),
      fetchIndirectTurnoByDateAndPosition(companyId, dateFrom, dateTo),
    ])

    const userSpecialty = role === 'user' ? await resolveUserSpecialty(companyId, session) : ''
    const visibleReports = role === 'user' && userSpecialty
      ? rawReports.filter((report: any) => {
          const raw = normalizeCandidateSpecialty(report?.specialty)
          if (!raw) return true
          return specialtyMatches(report?.specialty, userSpecialty)
        })
      : rawReports

    const enrichedReports = enrichPersonnelRows(visibleReports, buildCollaboratorIndexes(collaborators))
    const dailyReports = await fetchDailyReportsForRange(companyId, dateFrom, dateTo)
    const dailyReportDirectSnapshots = buildDailyReportDirectSnapshotMaps(dailyReports)
    const dailyReportWeeklySummary = buildDailyReportWeeklySummary(dailyReports)
    return NextResponse.json(buildSummary(enrichedReports, dateFrom, dateTo, indirectTurnoByDateAndPosition, dailyReportDirectSnapshots, dailyReportWeeklySummary, dailyReports))
  } catch (err: any) {
    console.error('Error GET /api/management/hh-summary', err)
    return NextResponse.json({ error: err?.message || 'Unexpected server error' }, { status: 500 })
  }
}
