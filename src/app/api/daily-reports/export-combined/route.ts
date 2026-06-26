import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import ExcelJS from 'exceljs'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createR2PresignedUrl } from '@/lib/r2Presign'
import { GET as exportDailyReportGet, POST as exportDailyReportPost } from '../export/route'
import {
  resolvePersonWorkdayHours,
  resolveMachineWorkdayHours
} from '@/lib/workdayConfig'

export const dynamic = 'force-dynamic'

const toNumber = (value: any) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const parsed = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeFront = (value: any) => {
  const raw = String(value || '').trim().toUpperCase()
  if (raw.includes('PISC')) return 'PISCINAS'
  if (raw.includes('CANA')) return 'CANALETAS'
  return raw || 'SIN FRENTE'
}

const weekFromReportNo = (reportNo: number) => {
  if (!reportNo) return null
  if (reportNo <= 5) return 1
  return Math.floor((reportNo - 6) / 7) + 2
}

const latamDate = (value: any) => {
  const raw = String(value || '').slice(0, 10)
  const [year, month, day] = raw.split('-')
  return year && month && day ? `${day}-${month}-${year}` : raw
}

const latamDateSlash = (value: any) => {
  const raw = String(value || '').slice(0, 10)
  const [year, month, day] = raw.split('-')
  return year && month && day ? `${day}/${month}/${year}` : raw
}

const splitLastNames = (value: any) => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  return { paterno: parts[0] || '', materno: parts.slice(1).join(' ') }
}

const splitFirstNames = (value: any) => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] || '', second: parts.slice(1).join(' ') }
}

const formatDocumentForExcel = (value: any) => {
  const raw = String(value || '').replace(/[^\dkK]/g, '').toUpperCase()
  if (raw.length <= 1) return raw
  const body = raw.slice(0, -1)
  const dv = raw.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

const attendanceCode = (status: any, reason: any) => {
  const explicit = String(reason || '').trim().toUpperCase()
  if (explicit) return explicit
  const normalized = String(status || '').trim().toLowerCase()
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
  return String(status || '').trim().toUpperCase()
}

const TEMP_ATTENDANCE_EXCEL_LOGO_URL = 'https://juupotamdjqzpxuqdtco.supabase.co/storage/v1/object/sign/pr_ingenit/puma/logotipo-PUMA.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hZjQ4NGRkOS0zZDMzLTRlYTMtYTZhZi03NTc3ZTk0ODI0ZDQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcl9pbmdlbml0L3B1bWEvbG9nb3RpcG8tUFVNQS5wbmciLCJpYXQiOjE3NzkxMjA0NDEsImV4cCI6MTgxMDY1NjQ0MX0.eh9RCVS6wYrk0zO0sihTN_tuN8czNdhEPoROS7uy6kE'

function getPngDimensions(buffer: Buffer) {
  if (buffer.length < 24) return null
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (!width || !height) return null
  return { width, height }
}

const fitImage = (sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number) => {
  const width = Math.max(1, Number(sourceWidth) || maxWidth)
  const height = Math.max(1, Number(sourceHeight) || maxHeight)
  const scale = Math.min(maxWidth / width, maxHeight / height)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

async function addAttendanceLogo(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet) {
  try {
    const response = await fetch(TEMP_ATTENDANCE_EXCEL_LOGO_URL, { cache: 'no-store' })
    if (!response.ok) return
    const arrayBuffer = await response.arrayBuffer()
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return
    const buffer = Buffer.from(arrayBuffer)
    const dimensions = getPngDimensions(buffer) || { width: 170, height: 44 }
    const imageId = workbook.addImage({
      base64: `data:image/png;base64,${buffer.toString('base64')}`,
      extension: 'png',
    })
    const logoSize = fitImage(dimensions.width, dimensions.height, 170, 44)
    worksheet.addImage(imageId, {
      tl: { col: 1, row: 1 },
      ext: logoSize,
      editAs: 'oneCell',
    })
  } catch {
    // Logo is decorative for the export; keep the workbook generation resilient.
  }
}

type HistoryRow = {
  id: string
  work_front: string
  report_no: number
  report_date: string
  week_no: number | null
  indirect_hh: number
  direct_hh: number
  daily_hh: number
  indirect_hh_accum: number
  direct_hh_accum: number
  total_hh_accum: number
  major_hm_daily: number
  major_hm_accum: number
  minor_hm_daily: number
  minor_hm_accum: number
  source: string
}

const parseJsonMaybe = (value: any) => {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const buildWorkdaySource = (record: any) => {
  const notes = parseJsonMaybe(record?.notes) || {}
  const formSnapshot = parseJsonMaybe(record?.v2_form_snapshot) || {}
  const runtimeSnapshot = parseJsonMaybe(record?.v2_runtime_snapshot) || {}
  return {
    ...record,
    notes,
    v2_form_snapshot: formSnapshot,
    v2_runtime_snapshot: runtimeSnapshot
  }
}

const parseJsonArray = (value: any): any[] => {
  if (Array.isArray(value)) return value
  if (!value) return []
  if (typeof value === 'object') return Object.values(value)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') return Object.values(parsed)
  } catch {}
  return []
}

const normalizeKeyText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const normalizeSectionText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()

function uppercaseCellText(cell: ExcelJS.Cell) {
  const value = cell.value
  if (typeof value === 'string') {
    cell.value = value.toUpperCase()
    return
  }
  if (value && typeof value === 'object' && 'richText' in value && Array.isArray((value as any).richText)) {
    cell.value = {
      ...(value as any),
      richText: (value as any).richText.map((part: any) => ({
        ...part,
        text: typeof part.text === 'string' ? part.text.toUpperCase() : part.text,
      })),
    }
  }
}

function uppercaseDailyEquipmentSections(worksheet: ExcelJS.Worksheet) {
  let activeFromCol = 0

  worksheet.eachRow((row) => {
    let rowText = ''
    let equipmentSectionCol = 0

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const normalized = normalizeSectionText(
        typeof cell.value === 'object' && cell.value && 'text' in cell.value
          ? (cell.value as any).text
          : cell.value
      )
      rowText += ` ${normalized}`
      if (
        normalized.includes('1.- EQUIPO MAYOR DE CONSTRUCCION') ||
        normalized.includes('2.- EQUIPO MENOR DE CONSTRUCCION Y MOVILIZACION')
      ) {
        equipmentSectionCol = colNumber
      }
    })

    if (equipmentSectionCol) activeFromCol = equipmentSectionCol
    if (!activeFromCol) return
    if (rowText.includes('SUBCONTRATOS') || rowText.includes('COMENTARIOS')) {
      activeFromCol = 0
      return
    }

    for (let col = activeFromCol; col <= worksheet.columnCount; col += 1) {
      uppercaseCellText(row.getCell(col))
    }
  })
}

const normalizeActivityText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const getActivityDescription = (activity: any) => {
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
    const normalized = normalizeActivityText(part)
    if (!normalized) return

    if (
      unique.some((existing) => {
        const existingNormalized = normalizeActivityText(existing)
        return (
          existingNormalized === normalized ||
          existingNormalized.includes(normalized) ||
          normalized.includes(existingNormalized)
        )
      })
    ) return

    unique.push(part)
  })

  return unique.join(' - ')
}

const getActivityQuantityUnit = (activity: any) => {
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

  const unit = String(
    activity?.unit ||
    activity?.unidad ||
    activity?.measurement_unit ||
    activity?.measurementUnit ||
    ''
  ).trim()

  return { quantity: String(quantity || '').trim(), unit }
}

const hasPositiveActivityQuantity = (activity: any) => {
  const { quantity } = getActivityQuantityUnit(activity)
  const raw = String(quantity || '').trim()
  if (!raw) return false

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw

  const value = Number(normalized)
  return Number.isFinite(value) && value > 0
}

const getActivityObservation = (report: any, row: any, idx: number) => {
  const direct = String(row?.observation || row?.observacion || row?.comments || row?.comment || '').trim()
  if (direct) return direct
  const observations = parseJsonMaybe(report?.activity_observations)
  if (Array.isArray(observations)) {
    const found = observations[idx] || observations.find((obs: any) => {
      const obsId = String(obs?.activity_id || obs?.activityId || obs?.id || '').trim()
      const rowId = String(row?.activity_id || row?.activityId || row?.id || '').trim()
      return obsId && rowId && obsId === rowId
    })
    const text = String(found?.observation || found?.observacion || found?.comment || found?.comments || '').trim()
    if (text) return text
  }
  return String(report?.restrictions || report?.observations || '').trim()
}

const evidenceFilesFrom = (value: any): Array<{ key: string; name?: string; type?: string }> => {
  const out: Array<{ key: string; name?: string; type?: string }> = []
  const walk = (node: any) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node === 'string') {
      try {
        walk(JSON.parse(node))
      } catch {
        const maybeKey = node.includes('/') ? node.trim() : ''
        if (maybeKey) out.push({ key: maybeKey })
      }
      return
    }
    if (typeof node === 'object') {
      const key = String(node.key || '').trim()
      const name = String(node.name || node.fileName || '').trim()
      const type = String(node.type || node.contentType || '').trim()
      if (key) out.push({ key, name, type })
    }
  }
  walk(value)
  const seen = new Set<string>()
  return out.filter((file) => {
    if (!file.key || seen.has(file.key)) return false
    seen.add(file.key)
    return true
  })
}

const resolveImageExtension = (name: string, key: string, contentType: string): 'png' | 'jpeg' | '' => {
  const fromType = String(contentType || '').toLowerCase()
  if (fromType.includes('png')) return 'png'
  if (fromType.includes('jpeg') || fromType.includes('jpg')) return 'jpeg'
  const raw = `${name} ${key}`.toLowerCase()
  if (raw.endsWith('.png')) return 'png'
  if (raw.endsWith('.jpg') || raw.endsWith('.jpeg')) return 'jpeg'
  return ''
}

function getJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = buffer[i + 1]
    const len = buffer.readUInt16BE(i + 2)
    const isSofMarker =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isSofMarker) {
      const height = buffer.readUInt16BE(i + 5)
      const width = buffer.readUInt16BE(i + 7)
      if (!width || !height) return null
      return { width, height }
    }
    if (len < 2) break
    i += 2 + len
  }
  return null
}

const inferDataUrlExtension = (value: string): 'png' | 'jpeg' | null => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw.startsWith('data:image/')) return null
  if (raw.startsWith('data:image/png')) return 'png'
  if (raw.startsWith('data:image/jpeg') || raw.startsWith('data:image/jpg')) return 'jpeg'
  return null
}

const resolveSignatureKey = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    const url = new URL(raw, 'http://local')
    const key = String(url.searchParams.get('key') || '').trim()
    if (key) return decodeURIComponent(key)
  } catch {}

  const keyMatch = raw.match(/[?&]key=([^&]+)/)
  if (keyMatch?.[1]) return decodeURIComponent(keyMatch[1])

  if (raw.startsWith('collaborators/') && raw.includes('/')) return raw

  return ''
}

async function loadSignatureImage(companyId: string, value: any) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const inlineExt = inferDataUrlExtension(raw)
  if (inlineExt) {
    const buffer = Buffer.from(raw.split(',')[1] || '', 'base64')
    const dimensions = inlineExt === 'png' ? getPngDimensions(buffer) : getJpegDimensions(buffer)

    return {
      dataUrl: raw,
      extension: inlineExt,
      width: dimensions?.width || 400,
      height: dimensions?.height || 160,
    }
  }

  const key = resolveSignatureKey(raw)
  const expectedPrefix = `collaborators/${companyId}/`

  const bucket = process.env.R2_BUCKET_NAME
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!key || !key.startsWith(expectedPrefix) || !bucket || !accountId || !accessKeyId || !secretAccessKey) {
    return null
  }

  try {
    const download = createR2PresignedUrl({
      method: 'GET',
      bucket,
      accountId,
      key,
      accessKeyId,
      secretAccessKey,
      expiresInSeconds: 600,
    })

    const response = await fetch(download.url, { cache: 'no-store' })
    if (!response.ok) return null

    const contentType = String(response.headers.get('content-type') || '')
    const extension = resolveImageExtension('', key, contentType)
    if (extension !== 'png' && extension !== 'jpeg') return null

    const arrayBuffer = await response.arrayBuffer()
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return null

    const buffer = Buffer.from(arrayBuffer)
    const dimensions = extension === 'png' ? getPngDimensions(buffer) : getJpegDimensions(buffer)
    const mime = extension === 'png' ? 'image/png' : 'image/jpeg'

    return {
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      extension,
      width: dimensions?.width || 400,
      height: dimensions?.height || 160,
    }
  } catch {
    return null
  }
}

async function loadActivityEvidenceImages(
  companyId: string,
  files: Array<{ key: string; name?: string; type?: string; label?: string }>
) {
  const bucket = process.env.R2_BUCKET_NAME
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return []

  const prefix = `field-reports/${companyId}/`
  const loaded = await Promise.all(files.map(async (file) => {
    try {
      const key = String(file.key || '').trim()
      if (!key || !key.startsWith(prefix)) return null
      const download = createR2PresignedUrl({
        method: 'GET',
        bucket,
        accountId,
        key,
        accessKeyId,
        secretAccessKey,
        expiresInSeconds: 600
      })
      const res = await fetch(download.url, { cache: 'no-store' })
      if (!res.ok) return null
      const contentType = String(res.headers.get('content-type') || file.type || '')
      const extension = resolveImageExtension(String(file.name || ''), key, contentType)
      if (!extension) return null
      const arr = await res.arrayBuffer()
      if (!arr || arr.byteLength === 0) return null
      const buffer = Buffer.from(arr)
      const dimensions = extension === 'png' ? getPngDimensions(buffer) : getJpegDimensions(buffer)
      const mime = extension === 'png' ? 'image/png' : 'image/jpeg'
      return {
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        extension,
        width: dimensions?.width || 800,
        height: dimensions?.height || 600,
        label: String(file.label || file.name || '').trim()
      }
    } catch {
      return null
    }
  }))
  return loaded.filter(Boolean) as Array<{ dataUrl: string; extension: 'png' | 'jpeg'; width: number; height: number; label: string }>
}

const buildDailyRowsFromAccumulated = (rows: HistoryRow[]) => {
  const byFront = new Map<string, HistoryRow[]>()
  rows.forEach((row) => {
    const frontRows = byFront.get(row.work_front) || []
    frontRows.push(row)
    byFront.set(row.work_front, frontRows)
  })

  byFront.forEach((frontRows) => {
    frontRows.sort((a, b) => a.report_no - b.report_no)
    frontRows.forEach((row, index) => {
      if (row.source === 'manual-historical') return
      const previous = frontRows[index - 1]
      if (!previous) return
      if (row.source === 'daily-report') {
        const indirectDaily = Math.max(0, row.indirect_hh)
        const directDaily = Math.max(0, row.direct_hh)
        row.indirect_hh = indirectDaily
        row.direct_hh = directDaily
        row.daily_hh = indirectDaily + directDaily
        row.indirect_hh_accum = previous.indirect_hh_accum + indirectDaily
        row.direct_hh_accum = previous.direct_hh_accum + directDaily
        row.total_hh_accum = row.indirect_hh_accum + row.direct_hh_accum
      } else {
        row.indirect_hh = Math.max(0, row.indirect_hh_accum - previous.indirect_hh_accum)
        row.direct_hh = Math.max(0, row.direct_hh_accum - previous.direct_hh_accum)
        row.daily_hh = Math.max(0, row.total_hh_accum - previous.total_hh_accum)
      }
      row.major_hm_daily = Math.max(0, row.major_hm_accum - previous.major_hm_accum)
      row.minor_hm_daily = Math.max(0, row.minor_hm_accum - previous.minor_hm_accum)
    })
  })

  return Array.from(byFront.values()).flat().sort((a, b) => {
    if (a.work_front !== b.work_front) return a.work_front.localeCompare(b.work_front, 'es')
    return a.report_no - b.report_no
  })
}

async function resolveReportContext(req: NextRequest, body?: any) {
  const session = (await getServerSession(authOptions as any)) as any
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  const companyId = String(session.user.companyId)
  const id = String(req.nextUrl.searchParams.get('id') || body?.reportOverride?.id || body?.id || '').trim()
  if (!id) throw new Error('id es requerido')
  const { data, error } = await supabaseAdmin
    .from('pr_daily_reports')
    .select('id, report_no, report_date, work_front, source_field_report_ids, notes, v2_form_snapshot, v2_runtime_snapshot')
    .eq('company_id', companyId)
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(String(error?.message || 'Reporte no encontrado'))
  const dbNotes = parseJsonMaybe(data.notes) || {}
  const formSnapshot = parseJsonMaybe((data as any).v2_form_snapshot) || {}
  const runtimeSnapshot = parseJsonMaybe((data as any).v2_runtime_snapshot) || {}
  const overrideNotes = body?.reportOverride?.notes || {}
  const overrideFormSnapshot = body?.reportOverride?.v2_form_snapshot || {}
  const overrideRuntimeSnapshot = body?.reportOverride?.v2_runtime_snapshot || {}

  const signatureSource = {
    ...dbNotes,
    ...formSnapshot,
    ...runtimeSnapshot,
    ...overrideNotes,
    ...overrideFormSnapshot,
    ...overrideRuntimeSnapshot,
    ...(body?.reportOverride || {}),
  }

  const pickSignatureText = (...keys: string[]) => {
    for (const key of keys) {
      const value = String(signatureSource?.[key] || '').trim()
      if (value) return value
    }
    return ''
  }
  return {
    companyId,
    reportId: id,
    reportNo: Number(data.report_no || body?.reportOverride?.report_no || 0),
    reportDate: String(body?.reportOverride?.report_date || data.report_date || '').slice(0, 10),
    workFront: normalizeFront(body?.reportOverride?.work_front || body?.reportOverride?.notes?.work_front || data.work_front),
    sourceFieldReportIds: Array.from(new Set([
      ...parseJsonArray(data.source_field_report_ids),
      ...parseJsonArray((parseJsonMaybe(data.notes) || {})?.source_field_report_ids),
      ...parseJsonArray(body?.reportOverride?.source_field_report_ids),
      ...parseJsonArray(body?.reportOverride?.notes?.source_field_report_ids)
    ].map((id) => String(id || '').trim()).filter(Boolean))),

    preparedByName: pickSignatureText('prepared_by_name'),
    preparedByRole: pickSignatureText('prepared_by_role'),
    preparedByDate: pickSignatureText('prepared_by_date') || String(body?.reportOverride?.report_date || data.report_date || '').slice(0, 10),
    preparedBySignatureUrl: pickSignatureText('prepared_by_signature_url'),

    approvedByName: pickSignatureText('approved_by_name'),
    approvedByRole: pickSignatureText('approved_by_role'),
    approvedByDate: pickSignatureText('approved_by_date') || String(body?.reportOverride?.report_date || data.report_date || '').slice(0, 10),
    approvedBySignatureUrl: pickSignatureText('approved_by_signature_url'),

    validatedByName: '',
    validatedByRole: '',
    validatedByDate: '',
    validatedBySignatureUrl: '',
  }
}

async function buildHistoricalHhRows(companyId: string, maxReportNo: number) {
  const [historyRes, baselinesRes, dailyReportsRes] = await Promise.all([
    supabaseAdmin
      .from('pr_daily_report_front_history')
      .select('id, work_front, report_no, report_date, week_no, indirect_hh, direct_hh, daily_hh, indirect_hh_accum, direct_hh_accum, total_hh_accum, major_hm_daily, major_hm_accum, minor_hm_daily, minor_hm_accum, source')
      .eq('company_id', companyId)
      .order('work_front', { ascending: true })
      .order('report_no', { ascending: true }),
    supabaseAdmin
      .from('pr_daily_report_front_baselines')
      .select('id, work_front, as_of_report_no, as_of_date, prev_indirect_hh, prev_direct_hh, prev_total_hh, prev_major_hm, prev_minor_hm, prev_total_hm, source')
      .eq('company_id', companyId),
    supabaseAdmin
      .from('pr_daily_reports')
      .select('id, report_no, report_date, work_front, s4_curr_indirect_hh, s4_curr_direct_hh, s4_curr_total_hh, s4_curr_total_hm, notes, v2_form_snapshot, v2_runtime_snapshot, created_at, updated_at')
      .eq('company_id', companyId)
      .gte('report_no', 29)
      .order('work_front', { ascending: true })
      .order('report_no', { ascending: true }),
  ])

  if (historyRes.error) throw new Error(historyRes.error.message)
  if (baselinesRes.error) throw new Error(baselinesRes.error.message)
  if (dailyReportsRes.error) throw new Error(dailyReportsRes.error.message)

  const combined = new Map<string, HistoryRow>()
  const putRow = (row: HistoryRow, replace = true) => {
    const key = `${row.work_front}__${row.report_no}`
    if (replace || !combined.has(key)) combined.set(key, row)
  }

  ;(historyRes.data || []).forEach((row: any) => {
    const reportNo = Number(row.report_no || 0)
    if (!reportNo) return
    putRow({
      id: String(row.id),
      work_front: normalizeFront(row.work_front),
      report_no: reportNo,
      report_date: String(row.report_date || ''),
      week_no: Number(row.week_no || 0) || weekFromReportNo(reportNo),
      indirect_hh: toNumber(row.indirect_hh),
      direct_hh: toNumber(row.direct_hh),
      daily_hh: toNumber(row.daily_hh),
      indirect_hh_accum: toNumber(row.indirect_hh_accum),
      direct_hh_accum: toNumber(row.direct_hh_accum),
      total_hh_accum: toNumber(row.total_hh_accum),
      major_hm_daily: toNumber(row.major_hm_daily),
      major_hm_accum: toNumber(row.major_hm_accum),
      minor_hm_daily: toNumber(row.minor_hm_daily),
      minor_hm_accum: toNumber(row.minor_hm_accum),
      source: String(row.source || 'manual-historical')
    })
  })

  ;(baselinesRes.data || []).forEach((row: any) => {
    const reportNo = Number(row.as_of_report_no || 0)
    if (reportNo !== 28) return
    const majorHm = toNumber(row.prev_major_hm)
    const totalHm = toNumber(row.prev_total_hm)
    putRow({
      id: `baseline-${String(row.id)}`,
      work_front: normalizeFront(row.work_front),
      report_no: reportNo,
      report_date: String(row.as_of_date || ''),
      week_no: weekFromReportNo(reportNo),
      indirect_hh: 0,
      direct_hh: 0,
      daily_hh: 0,
      indirect_hh_accum: toNumber(row.prev_indirect_hh),
      direct_hh_accum: toNumber(row.prev_direct_hh),
      total_hh_accum: toNumber(row.prev_total_hh),
      major_hm_daily: 0,
      major_hm_accum: majorHm,
      minor_hm_daily: 0,
      minor_hm_accum: toNumber(row.prev_minor_hm) || Math.max(0, totalHm - majorHm),
      source: 'front-baseline'
    }, false)
  })

  const latestDailyReportsByFrontReport = new Map<string, any>()
  ;(dailyReportsRes.data || []).forEach((row: any) => {
    const reportNo = Number(row.report_no || 0)
    if (reportNo < 29) return
    const front = normalizeFront(row.work_front)
    const key = `${front}__${reportNo}`
    const current = latestDailyReportsByFrontReport.get(key)
    const currentStamp = Date.parse(String(current?.updated_at || current?.created_at || '')) || 0
    const rowStamp = Date.parse(String(row.updated_at || row.created_at || '')) || 0
    if (!current || rowStamp >= currentStamp) latestDailyReportsByFrontReport.set(key, row)
  })

  ;(Array.from(latestDailyReportsByFrontReport.values()) || []).forEach((row: any) => {
    const reportNo = Number(row.report_no || 0)
    if (reportNo < 29) return
    const front = normalizeFront(row.work_front)
    const key = `${front}__${reportNo}`
    if (combined.has(key)) return
    const workdaySource = buildWorkdaySource(row)
    const notes = workdaySource.notes || {}
    const dailyIndirectDot = toNumber(notes?.summary_indirect_dotation)
    const dailyDirectDot = toNumber(notes?.summary_direct_dotation)
    const dailyTotalDot = toNumber(notes?.summary_total_dotation)
    const dailyIndirectHh = toNumber(notes?.summary_indirect_hh) || (dailyIndirectDot > 0 ? dailyIndirectDot * resolvePersonWorkdayHours(workdaySource) : 0)
    const dailyDirectHh = toNumber(notes?.summary_direct_hh) || (dailyDirectDot > 0 ? dailyDirectDot * resolvePersonWorkdayHours(workdaySource) : 0)
    const dailyTotalHh = toNumber(notes?.summary_total_hh) || (dailyTotalDot > 0 ? dailyTotalDot * resolvePersonWorkdayHours(workdaySource) : dailyIndirectHh + dailyDirectHh)
    const majorEquip = toNumber(notes?.s4_curr_major_equip || notes?.equip_major_qty)
    const minorEquip = toNumber(notes?.s4_curr_minor_equip || notes?.equip_minor_qty)
    const majorAccum = toNumber(notes?.s4_curr_major_hm) || (majorEquip > 0 ? majorEquip * resolveMachineWorkdayHours(workdaySource) : 0)
    const minorAccum = toNumber(notes?.s4_curr_minor_hm) || (minorEquip > 0 ? minorEquip * resolveMachineWorkdayHours(workdaySource) : 0)
    const totalHm = toNumber(row.s4_curr_total_hm ?? notes?.s4_curr_total_hm) || (majorAccum + minorAccum)
    putRow({
      id: String(row.id),
      work_front: front,
      report_no: reportNo,
      report_date: String(row.report_date || ''),
      week_no: weekFromReportNo(reportNo),
      indirect_hh: dailyIndirectHh,
      direct_hh: dailyDirectHh,
      daily_hh: dailyTotalHh,
      indirect_hh_accum: toNumber(row.s4_curr_indirect_hh ?? notes?.s4_curr_indirect_hh),
      direct_hh_accum: toNumber(row.s4_curr_direct_hh ?? notes?.s4_curr_direct_hh),
      total_hh_accum: toNumber(row.s4_curr_total_hh ?? notes?.s4_curr_total_hh),
      major_hm_daily: 0,
      major_hm_accum: majorAccum,
      minor_hm_daily: 0,
      minor_hm_accum: minorAccum || Math.max(0, totalHm - majorAccum),
      source: 'daily-report'
    })
  })

  return buildDailyRowsFromAccumulated(Array.from(combined.values()))
    .filter((row) => !maxReportNo || row.report_no <= maxReportNo)
}

async function loadActivityReports(context: Awaited<ReturnType<typeof resolveReportContext>>) {
  const select = '*'
  if (context.sourceFieldReportIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('pr_field_reports')
      .select(select)
      .eq('company_id', context.companyId)
      .in('id', context.sourceFieldReportIds)
    if (error) throw new Error(error.message)
    return Array.isArray(data) ? data : []
  }

  const { data, error } = await supabaseAdmin
    .from('pr_field_reports')
    .select(select)
    .eq('company_id', context.companyId)
    .eq('date', context.reportDate)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) throw new Error(error.message)
  return (Array.isArray(data) ? data : [])
    .filter((report: any) => normalizeFront(report?.work_front || report?.front || '') === context.workFront)
}

async function addActivitiesSheet(
  workbook: ExcelJS.Workbook,
  context: Awaited<ReturnType<typeof resolveReportContext>>
) {
  const reports = await loadActivityReports(context)
  const worksheet = workbook.addWorksheet('Actividades', {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    },
  })
  worksheet.columns = [
    { width: 12 }, { width: 4 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ]

  const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
  const medium = { style: 'medium' as const, color: { argb: 'FF000000' } }
  const border = { top: thin, left: thin, bottom: thin, right: thin }
  const blueFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF163B82' } }
  const greenFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD2FFD2' } }
  const setCell = (row: number, col: number, value: any, options: any = {}) => {
    const cell = worksheet.getCell(row, col)
    cell.value = value ?? ''
    cell.border = options.border || border
    cell.font = options.font || { name: 'Arial', size: 10 }
    cell.alignment = options.alignment || { vertical: 'middle', horizontal: 'left', wrapText: true }
    if (options.fill) cell.fill = options.fill
    return cell
  }
  const mergeRow = (
    row: number,
    text: string,
    fill: any,
    font: any = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  ) => {
    worksheet.mergeCells(row, 1, row, 15)
    setCell(row, 1, text, { fill, font, alignment: { vertical: 'middle', horizontal: 'left', wrapText: true } })
    worksheet.getRow(row).height = 22
  }
  const setBoxBorder = (fromRow: number, toRow: number, fromCol = 1, toCol = 15) => {
    for (let r = fromRow; r <= toRow; r += 1) {
      for (let c = fromCol; c <= toCol; c += 1) {
        const cell = worksheet.getCell(r, c)
        const current = cell.border || border
        cell.border = {
          top: r === fromRow ? medium : current.top,
          left: c === fromCol ? medium : current.left,
          bottom: r === toRow ? medium : current.bottom,
          right: c === toCol ? medium : current.right,
        }
      }
    }
  }
  const reportNoLabel = String(context.reportNo || '').padStart(3, '0')
  const contractLabel = context.workFront === 'PISCINAS' ? 'ANT-GPRO-FOR-PISCINAS' : 'ANT-GPRO-FOR-CANALETAS'
  const reportDateLabel = latamDateSlash(context.reportDate)

  ;[
    `DAILY REPORT N°${reportNoLabel || '-'}`,
    contractLabel,
    `REV. 0 ${reportDateLabel}`,
  ].forEach((text, idx) => {
    const r = idx + 1
    worksheet.mergeCells(r, 1, r, 15)
    setCell(r, 1, text, {
      font: { name: 'Arial', size: 12, bold: true, color: { argb: 'FF163B82' } },
      alignment: { horizontal: 'center', vertical: 'middle' }
    })
    worksheet.getRow(r).height = 24
  })

  let row = 4
  mergeRow(row, '1.- DESCRIPCIÓN DE TRABAJO EJECUTADO DIARIO', blueFill)
  row += 1
  mergeRow(row, `FRENTE DE TRABAJO: ${context.workFront}`, greenFill, { name: 'Arial', size: 10, bold: true, color: { argb: 'FF163B82' } })
  row += 1

  const evidenceFiles: Array<{ key: string; name?: string; type?: string; label?: string }> = []
  const activityBlocks: Array<{ title: string; body: string; observation: string }> = []
  reports.forEach((report: any, reportIdx: number) => {
    const crewLabel = String(report?.crew_name || '').trim()
    const rows = (() => {
      const assignments = parseJsonArray(report?.assignments)
      if (assignments.length > 0) return assignments
      return parseJsonArray(report?.activities)
    })()
    //evidenceFilesFrom(report?.evidence_files).forEach((file) => evidenceFiles.push({ ...file, label: `Reporte ${reportIdx + 1}` }))

    const lines: string[] = []
    const observations: string[] = []
    rows.forEach((activity: any, activityIdx: number) => {
      const description = getActivityDescription(activity)
      const front = normalizeFront(activity?.work_front || activity?.activity_front || activity?.front || report?.work_front)
      if (context.sourceFieldReportIds.length <= 0 && front !== context.workFront) return
      const hasPositiveQuantity = hasPositiveActivityQuantity(activity)
      const { quantity, unit } = hasPositiveQuantity
        ? getActivityQuantityUnit(activity)
        : { quantity: '', unit: '' }

      const observation = getActivityObservation(report, activity, activityIdx)
      const meta = [quantity, unit].filter(Boolean).join(' ')
      const suffix = meta ? ` (${meta})` : ''
      if (description) lines.push(`${lines.length + 1}.- ${description.toUpperCase()}${suffix}`)
      if (observation && observation !== '-') observations.push(observation)
      evidenceFilesFrom(activity?.evidence_files).forEach((file) => evidenceFiles.push({ ...file, label: description || `Reporte ${reportIdx + 1}` }))
      evidenceFilesFrom(activity?.evidence).forEach((file) => evidenceFiles.push({ ...file, label: description || `Reporte ${reportIdx + 1}` }))
      evidenceFilesFrom(activity?.images).forEach((file) => evidenceFiles.push({ ...file, label: description || `Reporte ${reportIdx + 1}` }))
    })
    if (lines.length > 0) {
      const cleanCrewLabel = String(crewLabel || `CUADRILLA ${reportIdx + 1}`)
        .replace(/^cuadrilla\s+/i, 'CUADRILLA ')
        .trim()

      activityBlocks.push({
        title: '',
        body: [cleanCrewLabel, ...lines].join('\n'),
        observation: Array.from(new Set(observations.map((x) => x.trim()).filter(Boolean))).join(' / ') || ''
      })
    }
  })
  activityBlocks.sort((a, b) => {
    const getCrewNo = (block: { body: string }) => {
      const firstLine = String(block.body || '').split('\n')[0] || ''
      const match = firstLine.match(/CUADRILLA\s+(\d+)/i)
      return match ? Number(match[1]) : 9999
    }

    return getCrewNo(a) - getCrewNo(b)
  })

  activityBlocks.forEach((block, idx) => {
    block.title = `Actividad ${idx + 1}:`
  })

  if (activityBlocks.length === 0) {
    worksheet.mergeCells(row, 1, row + 1, 2)
    setCell(row, 1, 'Actividad 1:', {
      font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF163B82' } },
      alignment: { horizontal: 'center', vertical: 'middle' }
    })
    worksheet.mergeCells(row, 3, row + 1, 15)
    setCell(row, 3, 'Sin actividades para el frente de este reporte.', {
      font: { name: 'Arial', size: 10, color: { argb: 'FF163B82' } },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })
    row += 2
  }

  activityBlocks.forEach((block) => {
    const lineCount = Math.max(3, block.body.split('\n').length)
    const bodyStart = row
    const bodyEnd = row + Math.max(3, lineCount + 1)
    worksheet.mergeCells(bodyStart, 1, bodyEnd, 2)
    setCell(bodyStart, 1, block.title, {
      font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF163B82' } },
      alignment: { horizontal: 'center', vertical: 'middle' }
    })
    worksheet.mergeCells(bodyStart, 3, bodyEnd, 15)
    setCell(bodyStart, 3, block.body, {
      font: { name: 'Arial', size: 10, color: { argb: 'FF163B82' } },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })
    for (let r = bodyStart; r <= bodyEnd; r += 1) worksheet.getRow(r).height = 19
    row = bodyEnd + 1

    worksheet.mergeCells(row, 1, row, 2)
    setCell(row, 1, 'Observación:', {
      font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF163B82' } },
      alignment: { horizontal: 'center', vertical: 'middle' }
    })
    worksheet.mergeCells(row, 3, row, 15)
    setCell(row, 3, block.observation, {
      font: { name: 'Arial', size: 10, color: { argb: 'FF163B82' } },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })
    worksheet.getRow(row).height = 24
    row += 1
  })

  worksheet.mergeCells(row, 1, row + 1, 5)
  setCell(row, 1, 'RESPONSABLE EMPRESA CONTRATISTA: PUGA MUJICA\nASOCIADOS', {
    font: { name: 'Arial', size: 11, bold: true },
    alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
  })
  worksheet.mergeCells(row, 6, row + 1, 10)
  setCell(row, 6, 'CARGO:', { font: { name: 'Arial', size: 11, bold: true } })
  worksheet.mergeCells(row, 11, row + 1, 15)
  setCell(row, 11, 'FIRMA:', { font: { name: 'Arial', size: 11, bold: true } })
  worksheet.getRow(row).height = 24
  worksheet.getRow(row + 1).height = 24
  row += 2

  setBoxBorder(1, row - 1)

  const images = await loadActivityEvidenceImages(context.companyId, evidenceFiles)

  if (images.length > 0) {
    mergeRow(row, `EVIDENCIA FOTOGRÁFICA: ${context.workFront}`, greenFill, {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: 'FF163B82' }
    })

    row += 1

    const imageColumns = 3
    const slotRows = 10
    const imageRows = Math.ceil(images.length / imageColumns)

    const blockRows = imageRows * slotRows
    const blockRowHeight = 24

    const slotWidthPx = 340
    const slotHeightPx = slotRows * blockRowHeight * 1.33

    const paddingX = 18
    const paddingY = 18

    const imageStartRow = row
    const imageEndRow = row + blockRows - 1

    for (let r = imageStartRow; r <= imageEndRow; r += 1) {
      worksheet.getRow(r).height = blockRowHeight
    }

    worksheet.mergeCells(imageStartRow, 1, imageEndRow, 15)

    setCell(imageStartRow, 1, '', {
      alignment: {
        horizontal: 'center',
        vertical: 'middle'
      }
    })

    images.forEach((image, idx) => {
      const gridCol = idx % imageColumns
      const gridRow = Math.floor(idx / imageColumns)

      const fitted = fitImage(
        image.width,
        image.height,
        slotWidthPx - paddingX * 2,
        slotHeightPx - paddingY * 2
      )

      const imageId = workbook.addImage({
        base64: image.dataUrl,
        extension: image.extension
      })

      const colStart = gridCol * 5
      const rowStart = imageStartRow - 1 + gridRow * slotRows

      const offsetX = Math.max(0, (slotWidthPx - fitted.width) / 2) / 64
      const offsetY = Math.max(0, (slotHeightPx - fitted.height) / 2) / 20

      worksheet.addImage(imageId, {
        tl: {
          col: colStart + offsetX,
          row: rowStart + offsetY
        },
        ext: fitted,
        editAs: 'oneCell'
      })
    })

    row = imageEndRow + 1
  }

  const signatureImages = await Promise.all([
    loadSignatureImage(context.companyId, context.preparedBySignatureUrl),
    loadSignatureImage(context.companyId, context.approvedBySignatureUrl),
    loadSignatureImage(context.companyId, context.validatedBySignatureUrl),
  ])

  const signatureHeaderFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFF3F4F6' }
  }

  const signatureBlocks = [
    {
      title: 'CONFECCIONADO POR',
      name: context.preparedByName || '',
      role: context.preparedByRole || '',
      date: context.preparedByDate ? latamDate(context.preparedByDate) : '',
      signature: signatureImages[0],
      fromCol: 1,
      labelCol: 1,
      valueFromCol: 2,
      toCol: 5,
    },
    {
      title: 'APROBADO POR',
      name: context.approvedByName || '',
      role: context.approvedByRole || '',
      date: context.approvedByDate ? latamDate(context.approvedByDate) : '',
      signature: signatureImages[1],
      fromCol: 6,
      labelCol: 6,
      valueFromCol: 7,
      toCol: 10,
    },
    {
      title: 'TOMA DE CONOCIMIENTO',
      name: '',
      role: '',
      date: '',
      signature: null,
      fromCol: 11,
      labelCol: 11,
      valueFromCol: 12,
      toCol: 15,
    },
  ]

  const titleRow = row
  const nameRow = row + 1
  const roleRow = row + 2
  const dateRow = row + 3
  const signatureRow = row + 4

  worksheet.getRow(titleRow).height = 22
  worksheet.getRow(nameRow).height = 22
  worksheet.getRow(roleRow).height = 22
  worksheet.getRow(dateRow).height = 22
  worksheet.getRow(signatureRow).height = 105

  signatureBlocks.forEach((block) => {
    worksheet.mergeCells(titleRow, block.fromCol, titleRow, block.toCol)
    setCell(titleRow, block.fromCol, block.title, {
      fill: signatureHeaderFill,
      font: { name: 'Arial', size: 10, bold: true },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })

    setCell(nameRow, block.labelCol, 'NOMBRE:', {
      font: { name: 'Arial', size: 9, bold: true },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })
    worksheet.mergeCells(nameRow, block.valueFromCol, nameRow, block.toCol)
    setCell(nameRow, block.valueFromCol, block.name, {
      font: { name: 'Arial', size: 9 },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })

    setCell(roleRow, block.labelCol, 'CARGO:', {
      font: { name: 'Arial', size: 9, bold: true },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })
    worksheet.mergeCells(roleRow, block.valueFromCol, roleRow, block.toCol)
    setCell(roleRow, block.valueFromCol, block.role, {
      font: { name: 'Arial', size: 9 },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })

    setCell(dateRow, block.labelCol, 'FECHA:', {
      font: { name: 'Arial', size: 9, bold: true },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })
    worksheet.mergeCells(dateRow, block.valueFromCol, dateRow, block.toCol)
    setCell(dateRow, block.valueFromCol, block.date, {
      font: { name: 'Arial', size: 9 },
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    })

    setCell(signatureRow, block.labelCol, 'FIRMA:', {
      font: { name: 'Arial', size: 9, bold: true },
      alignment: { horizontal: 'left', vertical: 'top', wrapText: true }
    })
    worksheet.mergeCells(signatureRow, block.valueFromCol, signatureRow, block.toCol)
    setCell(signatureRow, block.valueFromCol, '', {
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
    })

    if (block.signature) {
      const imageId = workbook.addImage({
        base64: block.signature.dataUrl,
        extension: block.signature.extension,
      })

      const fitted = fitImage(block.signature.width, block.signature.height, 220, 92)

      worksheet.addImage(imageId, {
        tl: {
          col: block.valueFromCol - 1 + 0.55,
          row: signatureRow - 1 + 0.65,
        },
        ext: fitted,
        editAs: 'oneCell',
      })
    }
  })

  row = signatureRow + 1
  setBoxBorder(1, row - 1)
}

function addHistoricalHhSheet(workbook: ExcelJS.Workbook, rows: HistoryRow[]) {
  const worksheet = workbook.addWorksheet('HH historico', {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 },
    },
  })
  const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
  const medium = { style: 'medium' as const, color: { argb: 'FF000000' } }
  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF2F2F2' } }
  const yellowFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFCC' } }
  const border = { top: thin, left: thin, bottom: thin, right: thin }
  const setCell = (row: number, col: number, value: any, options: any = {}) => {
    const cell = worksheet.getCell(row, col)
    cell.value = value
    cell.border = options.border || border
    cell.font = options.font || { size: 10 }
    cell.alignment = options.alignment || { vertical: 'middle', horizontal: 'center', wrapText: true }
    if (options.fill) cell.fill = options.fill
    if (options.numFmt) cell.numFmt = options.numFmt
    return cell
  }
  const applyOuterBorder = (top: number, left: number, bottom: number, right: number) => {
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        const cell = worksheet.getCell(row, col)
        const current = cell.border || border
        cell.border = {
          top: row === top ? medium : current.top,
          left: col === left ? medium : current.left,
          bottom: row === bottom ? medium : current.bottom,
          right: col === right ? medium : current.right,
        }
      }
    }
  }

  ;[3, 12, 13, 13, 13, 13, 12, 13, 13, 15, 14, 14, 16, 16, 4, 14, 14, 14].forEach((width, idx) => {
    worksheet.getColumn(idx + 1).width = width
  })
  const headers = [
    'N° Semana', 'Fecha', 'Daily Report N°', 'HH Indirectas', 'HH Directas', 'HH Diarias',
    'HH I. Acum', 'HH D. Acum', 'HH totales Acum', 'HM Mayores Diarias',
    'HM Mayores Acum', 'HM Menores y mov Diarias', 'HM Menores y mov Acum'
  ]
  const grouped = new Map<string, HistoryRow[]>()
  rows.forEach((row) => {
    const current = grouped.get(row.work_front) || []
    current.push(row)
    grouped.set(row.work_front, current)
  })
  let startRow = 2
  Array.from(grouped.entries()).forEach(([front, frontRows]) => {
    const mainLastCol = 14
    const summaryStartCol = 16
    const summaryLastCol = 18
    const titleRow = startRow
    worksheet.mergeCells(titleRow, 2, titleRow, mainLastCol)
    setCell(titleRow, 2, `HH HISTORICO - ${front}`, { font: { bold: true, size: 13 }, alignment: { horizontal: 'center', vertical: 'middle' } })
    worksheet.getRow(titleRow).height = 24
    const headerRow = startRow + 2
    headers.forEach((header, idx) => {
      setCell(headerRow, 2 + idx, header, { fill: headerFill, font: { bold: true, size: 10 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } })
    })
    worksheet.getRow(headerRow).height = 40
    frontRows
      .sort((a, b) => a.report_no - b.report_no)
      .forEach((row, idx) => {
        const rowNo = headerRow + 1 + idx
        const values = [
          Number(row.week_no || 0) || '',
          latamDate(row.report_date),
          row.report_no ? `N°${row.report_no}` : '',
          toNumber(row.indirect_hh),
          toNumber(row.direct_hh),
          toNumber(row.daily_hh),
          toNumber(row.indirect_hh_accum),
          toNumber(row.direct_hh_accum),
          toNumber(row.total_hh_accum),
          toNumber(row.major_hm_daily),
          toNumber(row.major_hm_accum),
          toNumber(row.minor_hm_daily),
          toNumber(row.minor_hm_accum),
        ]
        values.forEach((value, valueIdx) => {
          setCell(rowNo, 2 + valueIdx, value, {
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            numFmt: valueIdx >= 3 ? '#,##0.0' : undefined,
          })
        })
      })

    const weekly = Array.from(frontRows.reduce((weekMap, row) => {
      const weekNo = Number(row.week_no || 0)
      if (!weekNo) return weekMap
      const current = weekMap.get(weekNo) || { weekNo, indirectHh: 0, directHh: 0, hm: 0 }
      current.indirectHh += toNumber(row.indirect_hh)
      current.directHh += toNumber(row.direct_hh)
      current.hm += toNumber(row.major_hm_daily) + toNumber(row.minor_hm_daily)
      weekMap.set(weekNo, current)
      return weekMap
    }, new Map<number, { weekNo: number; indirectHh: number; directHh: number; hm: number }>()).values())
      .sort((a, b) => a.weekNo - b.weekNo)

    ;['HH Ind. Sem.', 'HH Dir. Sem.', 'HM Semanal'].forEach((header, idx) => {
      setCell(headerRow, summaryStartCol + idx, header, { fill: headerFill, font: { bold: true, size: 10 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } })
    })
    let summaryRow = headerRow + 1
    weekly.forEach((week) => {
      worksheet.mergeCells(summaryRow, summaryStartCol, summaryRow, summaryLastCol)
      setCell(summaryRow, summaryStartCol, `Semana ${week.weekNo}`)
      summaryRow += 1
      ;[week.indirectHh, week.directHh, week.hm].forEach((value, idx) => {
        setCell(summaryRow, summaryStartCol + idx, value, { fill: yellowFill, font: { bold: true, size: 10 }, numFmt: '#,##0.0' })
      })
      summaryRow += 3
    })
    const bottomRow = Math.max(headerRow + frontRows.length, summaryRow - 1)
    applyOuterBorder(titleRow, 2, bottomRow, mainLastCol)
    applyOuterBorder(headerRow, summaryStartCol, Math.max(headerRow, summaryRow - 1), summaryLastCol)
    startRow = bottomRow + 3
  })
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 4, showGridLines: false }]
}

async function addAttendanceSheet(workbook: ExcelJS.Workbook, companyId: string, reportDate: string) {
  const [collabRes, statusRes] = await Promise.all([
    supabaseAdmin
      .from('pr_collaborators')
      .select('id, first_name, last_name, document, position, worker_type, is_active, gender')
      .eq('company_id', companyId)
      .order('last_name', { ascending: true }),
    supabaseAdmin
      .from('pr_collaborator_daily_status')
      .select('collaborator_id, work_date, status, reason')
      .eq('company_id', companyId)
      .eq('work_date', reportDate),
  ])
  if (collabRes.error) throw new Error(collabRes.error.message)
  if (statusRes.error && String((statusRes.error as any)?.code || '') !== '42P01') throw new Error(statusRes.error.message)
  const collaborators = Array.isArray(collabRes.data) ? collabRes.data : []
  const statusByCollaborator = new Map<string, any>()
  ;(statusRes.data || []).forEach((row: any) => {
    statusByCollaborator.set(String(row.collaborator_id), row)
  })

  const worksheet = workbook.addWorksheet('Asistencia', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    },
  })
  const startRow = 2
  const startCol = 2
  const staticHeaders = ['CODIGO', 'CAT', 'RUT', 'PATERNO', 'MATERNO', 'NOMBRE', 'NOMBRE', 'GENERO', 'CARGO ACREDITACION']
  const lastCol = startCol + staticHeaders.length
  const tableHeaderRow = startRow + 6
  const firstDataRow = tableHeaderRow + 1
  const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
  const medium = { style: 'medium' as const, color: { argb: 'FF000000' } }
  const thinBorder = { top: thin, left: thin, bottom: thin, right: thin }
  const blueFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } }
  const grayFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9E2F3' } }
  const statusFill = (code: string) => {
    const normalized = String(code || '').trim().toUpperCase()
    if (normalized === '11') return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF00B0F0' } }
    if (normalized === 'D') return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }
    if (normalized === 'FO') return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF4B183' } }
    if (normalized === 'P') return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF92D050' } }
    if (normalized === 'FIN' || normalized === 'F') return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFF0000' } }
    if (normalized === 'L' || normalized === 'AC' || normalized === 'TL') return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE2F0D9' } }
    return undefined
  }
  const setCell = (row: number, col: number, value: any) => {
    const cell = worksheet.getCell(row, col)
    cell.value = value ?? ''
    return cell
  }

  worksheet.getColumn(1).width = 4
  ;[14, 8, 14, 18, 18, 18, 18, 14, 36, 7].forEach((width, idx) => {
    worksheet.getColumn(startCol + idx).width = width
  })
  worksheet.mergeCells(startRow, startCol, startRow, lastCol)
  const title = setCell(startRow, startCol, 'CONTROL DE ASISTENCIA')
  title.font = { bold: true, size: 12, color: { argb: 'FF1F4E79' } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getRow(startRow).height = 34
  await addAttendanceLogo(workbook, worksheet)

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
    for (let col = startCol; col <= lastCol; col += 1) {
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
  const dateHeader = setCell(tableHeaderRow, startCol + staticHeaders.length, latamDate(reportDate))
  dateHeader.fill = grayFill
  dateHeader.font = { bold: true, color: { argb: 'FF1F2937' } }
  dateHeader.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: true }
  dateHeader.border = thinBorder
  worksheet.getRow(tableHeaderRow).height = 44

  collaborators.forEach((collab: any, idx: number) => {
    const rowNo = firstDataRow + idx
    const last = splitLastNames(collab.last_name)
    const first = splitFirstNames(collab.first_name)
    const isTerminated = collab.is_active === false
    const rowFontColor = isTerminated ? 'FFFF0000' : 'FF000000'
    const baseValues = [
      `4291-${String(idx + 1000).padStart(4, '0')}`,
      String(collab.worker_type || '').toUpperCase(),
      formatDocumentForExcel(collab.document),
      last.paterno.toUpperCase(),
      last.materno.toUpperCase(),
      first.first.toUpperCase(),
      first.second.toUpperCase(),
      String(collab.gender || '').toUpperCase(),
      String(collab.position || '').toUpperCase(),
    ]
    baseValues.forEach((value, valueIdx) => {
      const cell = setCell(rowNo, startCol + valueIdx, value)
      cell.border = thinBorder
      cell.font = { size: 10, color: { argb: rowFontColor } }
      cell.alignment = { horizontal: valueIdx === 8 ? 'left' : 'center', vertical: 'middle' }
    })
    const statusRow = statusByCollaborator.get(String(collab.id))
    const code = attendanceCode(statusRow?.status, statusRow?.reason)
    const statusCell = setCell(rowNo, startCol + staticHeaders.length, code)
    statusCell.border = thinBorder
    statusCell.font = { size: 10, bold: true, color: { argb: rowFontColor } }
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' }
    const fill = isTerminated ? undefined : statusFill(code)
    if (fill) statusCell.fill = fill
  })

  const bottomRow = Math.max(firstDataRow, firstDataRow + collaborators.length - 1)
  for (let row = startRow; row <= bottomRow; row += 1) {
    for (let col = startCol; col <= lastCol; col += 1) {
      const cell = worksheet.getCell(row, col)
      const current = cell.border || thinBorder
      cell.border = {
        top: row === startRow ? medium : current.top,
        left: col === startCol ? medium : current.left,
        bottom: row === bottomRow ? medium : current.bottom,
        right: col === lastCol ? medium : current.right,
      }
    }
  }
  worksheet.views = [{ state: 'frozen', xSplit: startCol + staticHeaders.length - 1, ySplit: tableHeaderRow }]
}

const excelColumnLetter = (columnNumber: number) => {
  let n = Math.max(1, Number(columnNumber) || 1)
  let result = ''

  while (n > 0) {
    const mod = (n - 1) % 26
    result = String.fromCharCode(65 + mod) + result
    n = Math.floor((n - mod) / 26)
  }

  return result
}

const applyAutoPrintSetup = (worksheet: ExcelJS.Worksheet) => {
  const lastRow = Math.max(1, worksheet.rowCount || worksheet.actualRowCount || 1)
  const lastCol = Math.max(1, worksheet.columnCount || worksheet.actualColumnCount || 1)
  const lastColLetter = excelColumnLetter(lastCol)

  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    orientation: worksheet.pageSetup?.orientation || 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    verticalCentered: false,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.1,
      footer: 0.1,
      ...(worksheet.pageSetup?.margins || {}),
    },
  }

  worksheet.pageSetup.printArea = `A1:${lastColLetter}${lastRow}`
}

const setRowFontSize = (worksheet: ExcelJS.Worksheet, rowNumber: number, size: number) => {
  worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => {
    cell.font = {
      ...(cell.font || {}),
      size,
    }
  })
}

const applyDailyReportSheetHeaderFontSizes = (worksheet: ExcelJS.Worksheet) => {
  setRowFontSize(worksheet, 1, 18)
  setRowFontSize(worksheet, 2, 16)
  setRowFontSize(worksheet, 3, 15)
}

const setDailyReportSheetBodyFontSize = (worksheet: ExcelJS.Worksheet) => {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = {
        ...(cell.font || {}),
        size: 13,
      }
    })
  })
}

const measureCellText = (cell: ExcelJS.Cell) => {
  const value = cell.value as any
  if (value == null) return 0
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText
        .map((part: any) => String(part?.text || ''))
        .join('')
        .split(/\r?\n/)
        .reduce((max: number, line: string) => Math.max(max, line.length), 0)
    }
    if ('formula' in value) return String(value.result ?? '').length
    if ('text' in value) return String(value.text || '').length
  }
  return String(value).split(/\r?\n/).reduce((max, line) => Math.max(max, line.length), 0)
}

const findExactTextColumns = (worksheet: ExcelJS.Worksheet, labels: string[]) => {
  const targets = new Set(labels.map((label) => normalizeSectionText(label)))
  const columns = new Set<number>()

  worksheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (targets.has(normalizeSectionText(cell.value as any))) columns.add(colNumber)
    })
  })

  return Array.from(columns).sort((a, b) => a - b)
}

const autoFitColumns = (worksheet: ExcelJS.Worksheet, columns: number[]) => {
  columns.forEach((colNumber) => {
    let maxTextLength = 0
    worksheet.getColumn(colNumber).eachCell({ includeEmpty: false }, (cell) => {
      maxTextLength = Math.max(maxTextLength, measureCellText(cell))
    })
    if (maxTextLength <= 0) return

    const currentWidth = Number(worksheet.getColumn(colNumber).width || 0)
    worksheet.getColumn(colNumber).width = Math.min(70, Math.max(currentWidth, maxTextLength + 3))
  })
}

const findCellsByExactText = (worksheet: ExcelJS.Worksheet, labels: string[]) => {
  const targets = new Set(labels.map((label) => normalizeSectionText(label)))
  const matches: Array<{ row: number; col: number; cell: ExcelJS.Cell }> = []

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (targets.has(normalizeSectionText(cell.value as any))) {
        matches.push({ row: rowNumber, col: colNumber, cell })
      }
    })
  })

  return matches
}

const applyDailyReportSheetColumnWidths = (worksheet: ExcelJS.Worksheet) => {
  autoFitColumns(worksheet, findExactTextColumns(worksheet, ['PERSONAL', 'EQUIPOS']))
}

const applyDailyReportSheetFineTuning = (worksheet: ExcelJS.Worksheet) => {
  findCellsByExactText(worksheet, ['DOTACIÓN POR FRENTE']).forEach((match) => {
    const row = worksheet.getRow(match.row)
    row.height = Math.max(Number(row.height || 0) + 4, 30)
  })

  const equipmentColumns = new Set(findCellsByExactText(worksheet, ['EQUIPOS']).map((match) => match.col))
  worksheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cell.alignment?.textRotation === 90 && !equipmentColumns.has(colNumber)) {
        const column = worksheet.getColumn(colNumber)
        const currentWidth = Number(column.width || 0)
        column.width = Math.max(5, currentWidth - 0.15)
      }
    })
  })

  Array.from(equipmentColumns).forEach((colNumber) => {
    const column = worksheet.getColumn(colNumber)
    const currentWidth = Number(column.width || 0)
    if (currentWidth > 6) column.width = Math.max(6, currentWidth - 7)
  })
}

const applyDailyReportSheetPrintSetup = (worksheet: ExcelJS.Worksheet) => {
  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    orientation: 'portrait',
    margins: {
      ...(worksheet.pageSetup?.margins || {}),
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.1,
      footer: 0.1,
    },
  }
}

const applyPortraitPrintSetup = (worksheet: ExcelJS.Worksheet) => {
  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    orientation: 'portrait',
  }
}

async function buildCombinedWorkbook(req: NextRequest, method: 'GET' | 'POST') {
  const body = method === 'POST' ? await req.clone().json().catch(() => ({})) : {}
  const dailyResponse = method === 'POST'
    ? await exportDailyReportPost(req)
    : await exportDailyReportGet(req)
  if (!dailyResponse.ok) return dailyResponse

  const context = await resolveReportContext(req, body)
  const dailyBuffer = Buffer.from(await dailyResponse.arrayBuffer())
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(dailyBuffer as any)
  if (workbook.worksheets[0]) {
    workbook.worksheets[0].name = 'Reporte diario'
    uppercaseDailyEquipmentSections(workbook.worksheets[0])
    setDailyReportSheetBodyFontSize(workbook.worksheets[0])
    applyDailyReportSheetHeaderFontSizes(workbook.worksheets[0])
    applyDailyReportSheetColumnWidths(workbook.worksheets[0])
    applyDailyReportSheetFineTuning(workbook.worksheets[0])
    applyDailyReportSheetPrintSetup(workbook.worksheets[0])
  }

  await addActivitiesSheet(workbook, context)
  const hhRows = (await buildHistoricalHhRows(context.companyId, context.reportNo))
    .filter((row) => normalizeFront(row.work_front) === context.workFront)
  addHistoricalHhSheet(workbook, hhRows)
  await addAttendanceSheet(workbook, context.companyId, context.reportDate)

  ;['Actividades', 'HH historico', 'Asistencia'].forEach((sheetName) => {
    const worksheet = workbook.getWorksheet(sheetName)
    if (worksheet) applyPortraitPrintSetup(worksheet)
  })

  workbook.worksheets.forEach((worksheet) => {
    applyAutoPrintSetup(worksheet)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-consolidado-${context.reportNo || '0'}-${context.reportDate || 'sin-fecha'}.xlsx"`,
      'Cache-Control': 'no-store'
    }
  })
}

export async function GET(req: NextRequest) {
  return buildCombinedWorkbook(req, 'GET')
}

export async function POST(req: NextRequest) {
  return buildCombinedWorkbook(req, 'POST')
}
