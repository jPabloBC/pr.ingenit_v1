import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

const DAILY_REPORT_BASE_SEQUENCE_ANCHOR_DATE = '2026-05-09'
const DAILY_REPORT_BASE_SEQUENCE_ANCHOR_NO = 32

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Missing service role key')
  return createClient(SUPABASE_URL, key)
}

function parseJson(value: any) {
  if (value == null) return null
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function parseJsonArray(value: any): any[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') return Object.values(parsed)
    } catch {}
  }
  return []
}

function asObjectOrNull(value: any): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, any>
}

function normalizeWorkFront(value: any): 'CANALETAS' | 'PISCINAS' {
  const raw = String(value || '').trim().toUpperCase()
  return raw === 'PISCINAS' ? 'PISCINAS' : 'CANALETAS'
}

function resolveWorkFront(body: any, baseNotes: Record<string, any>, v2FormSnapshot: Record<string, any> | null, v2RuntimeSnapshot: Record<string, any> | null) {
  return normalizeWorkFront(
    body?.work_front ??
      baseNotes?.work_front ??
      v2RuntimeSnapshot?.work_front ??
      v2FormSnapshot?.work_front
  )
}

function resolvePersistedRecordFront(record: any): 'CANALETAS' | 'PISCINAS' {
  const notes = asObjectOrNull(record?.notes) || {}
  const v2FormSnapshot = asObjectOrNull(record?.v2_form_snapshot)
  const v2RuntimeSnapshot = asObjectOrNull(record?.v2_runtime_snapshot)
  return normalizeWorkFront(
    record?.work_front ??
      notes?.work_front ??
      v2RuntimeSnapshot?.work_front ??
      v2FormSnapshot?.work_front
  )
}

function extractEvidenceEntries(raw: any): Array<{ key: string; name?: string }> {
  const out: Array<{ key: string; name?: string }> = []
  const seenInline = new Set<string>()
  const normalizePossibleKey = (value: string) => {
    const v = String(value || '').trim()
    if (!v) return ''
    if (v.startsWith('http://') || v.startsWith('https://')) {
      try {
        const u = new URL(v)
        const path = decodeURIComponent(u.pathname || '')
        const parts = path.split('/').filter(Boolean)
        if (parts.length >= 2) return parts.slice(1).join('/')
        return ''
      } catch {
        return ''
      }
    }
    if (v.includes('/') && !v.includes(' ')) return v
    return ''
  }
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
        const possible = normalizePossibleKey(node)
        if (possible && !seenInline.has(possible)) {
          seenInline.add(possible)
          out.push({ key: possible })
        }
      }
      return
    }
    if (typeof node === 'object') {
      const key = String((node as any).key || '').trim()
      const keyFromUrl = normalizePossibleKey(String((node as any).url || '').trim())
      const resolvedKey = key || keyFromUrl
      if (resolvedKey) out.push({ key: resolvedKey, name: String((node as any).name || '').trim() || undefined })
      Object.values(node).forEach(walk)
    }
  }
  walk(raw)
  const seen = new Set<string>()
  return out.filter((x) => {
    if (!x.key || seen.has(x.key)) return false
    seen.add(x.key)
    return true
  })
}

function collectEvidenceManifest(fieldReports: any[]) {
  const out: Array<{ key: string; name: string; activityName: string }> = []
  const seen = new Set<string>()
  const pushFiles = (filesRaw: any, activityNameRaw: any) => {
    const activityName = String(activityNameRaw || 'Actividad')
    const files = extractEvidenceEntries(filesRaw)
    files.forEach((file) => {
      const key = String(file?.key || '').trim()
      if (!key || seen.has(key)) return
      seen.add(key)
      out.push({ key, name: String(file?.name || 'imagen'), activityName })
    })
  }
  fieldReports.forEach((report: any) => {
    const assignments = parseJsonArray(report?.assignments)
    const activities = parseJsonArray(report?.activities)
    const blocks = assignments.length > 0 ? assignments : activities
    blocks.forEach((asg: any) => {
      const actName = String(asg?.activity || asg?.description || 'Actividad')
      pushFiles(asg?.evidence_files, actName)
      pushFiles(asg?.evidences, actName)
      pushFiles(asg?.images, actName)
      pushFiles(asg?.evidence, actName)
    })
    const obsRows = parseJsonArray(report?.activity_observations)
    obsRows.forEach((obs: any) => {
      const actName = String(obs?.activity || obs?.description || obs?.name || 'Actividad')
      pushFiles(obs?.evidence_files, actName)
      pushFiles(obs?.evidences, actName)
      pushFiles(obs?.images, actName)
      pushFiles(obs?.evidence, actName)
    })
  })
  return out
}

async function buildEvidenceManifestForReport(
  supabaseAdmin: any,
  companyId: string,
  reportDate: string,
  sourceFieldReportIds: string[]
) {
  let rows: any[] = []
  if (sourceFieldReportIds.length > 0) {
    const byIds = await supabaseAdmin
      .from('pr_field_reports')
      .select('id, date, created_at, assignments, activities, activity_observations')
      .eq('company_id', companyId)
      .in('id', sourceFieldReportIds)
    rows = Array.isArray(byIds.data) ? byIds.data : []
  }
  if (rows.length === 0) {
    const dayStart = `${reportDate}T00:00:00.000Z`
    const dayEnd = `${reportDate}T23:59:59.999Z`
    const byDate = await supabaseAdmin
      .from('pr_field_reports')
      .select('id, date, created_at, assignments, activities, activity_observations')
      .eq('company_id', companyId)
      .or(`date.eq.${reportDate},and(date.is.null,created_at.gte.${dayStart},created_at.lte.${dayEnd})`)
      .order('created_at', { ascending: false })
      .limit(500)
    rows = Array.isArray(byDate.data) ? byDate.data : []
  }
  return collectEvidenceManifest(rows)
}

function sumPersonHours(value: any): number {
  const parsed = parseJson(value)
  if (!parsed || typeof parsed !== 'object') return 0
  const extras = parsed && typeof parsed.__extras === 'object' && parsed.__extras ? parsed.__extras : {}
  return Object.entries(parsed).reduce((acc: number, [key, row]: [string, any]) => {
    if (!key || key === '__extras' || !Array.isArray(row)) return acc
    const base = row.reduce((s: number, v: any) => s + (Number(v) || 0), 0)
    const extra = Number(extras?.[key] || 0) || 0
    return acc + Math.min(10, Math.max(0, base + extra))
  }, 0)
}

function weatherLabel(value: any): string {
  const parsed = parseJson(value)
  if (!parsed) return ''
  if (typeof parsed === 'string') return parsed.trim()
  if (typeof parsed !== 'object') return ''

  const labels = [
    parsed?.sunny ? 'Soleado' : null,
    parsed?.cloudy ? 'Nublado' : null,
    parsed?.rain ? 'Lluvia' : null,
    parsed?.snow ? 'Nieve' : null
  ].filter(Boolean)
  return labels.join(', ')
}

function pickFirst(obj: any, keys: string[]) {
  for (const key of keys) {
    const v = obj?.[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v)
  }
  return ''
}

function formatError(err: any) {
  const message = String(err?.message || err || 'Unknown error')
  if (String(err?.code) === '42P01') return 'Tabla pr_daily_reports no existe. Ejecuta la migración.'
  return message
}

function stripMissingColumn(payload: Record<string, any>, errorMsg: string) {
  const patterns = [
    /column\s+"?([a-zA-Z0-9_]+)"?\s+of relation/i,
    /Could not find the '([^']+)' column/i,
    /Could not find column '([^']+)'/i
  ]
  for (const re of patterns) {
    const m = errorMsg.match(re)
    if (m && m[1] && Object.prototype.hasOwnProperty.call(payload, m[1])) {
      const copy = { ...payload }
      delete copy[m[1]]
      return copy
    }
  }
  return null
}

function stripMissingTable(errorMsg: string) {
  const relationMissing = /relation\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i.test(errorMsg)
  const schemaCacheMissing = /Could not find the table/i.test(errorMsg)
  return relationMissing || schemaCacheMissing
}

function toNum(value: any) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getIsoWeekNo(dateStr: string) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function normalizeEquipmentSnapshotDateForReport(snapshotDate: any, reportDate: string) {
  const report = String(reportDate || '').slice(0, 10)
  const snapshot = String(snapshotDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(report)) return snapshot || null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) return report
  return snapshot > report ? report : snapshot
}

async function resolveFrontHistoryWeekNo(params: {
  supabaseAdmin: any
  companyId: string
  workFront: 'CANALETAS' | 'PISCINAS'
  reportDate: string
  reportNo: number
}) {
  const { supabaseAdmin, companyId, workFront, reportDate, reportNo } = params

  // Sincronía entre frentes: si el reporte hermano ya existe para la misma fecha/número,
  // usar exactamente ese week_no.
  const { data: samePairRows } = await supabaseAdmin
    .from('pr_daily_report_front_history')
    .select('work_front, week_no')
    .eq('company_id', companyId)
    .eq('report_date', reportDate)
    .eq('report_no', reportNo)
    .limit(2)
  const pairedWeekNo = (Array.isArray(samePairRows) ? samePairRows : [])
    .map((r: any) => Number(r?.week_no || 0))
    .find((n: number) => n > 0)
  if (pairedWeekNo && pairedWeekNo > 0) return pairedWeekNo

  const { data: frontRows } = await supabaseAdmin
    .from('pr_daily_report_front_history')
    .select('week_no, report_date, report_no')
    .eq('company_id', companyId)
    .eq('work_front', workFront)
    .order('report_date', { ascending: true })
    .order('report_no', { ascending: true })

  const rows = Array.isArray(frontRows) ? frontRows : []
  if (rows.length === 0) return 1

  const lastWeekNo = Number(rows[rows.length - 1]?.week_no || 0)
  if (!(lastWeekNo > 0)) return 1

  const countInLastWeek = rows.filter((r: any) => Number(r?.week_no || 0) === lastWeekNo).length
  if (countInLastWeek >= 7) return lastWeekNo + 1
  return lastWeekNo
}

async function upsertFrontHistoryFromSector4(params: {
  supabaseAdmin: any
  companyId: string
  payload: Record<string, any>
  notes: Record<string, any>
}) {
  const { supabaseAdmin, companyId, payload, notes } = params
  const reportDate = String(payload?.report_date || '').trim()
  const reportNo = Number(payload?.report_no || 0)
  const workFront = normalizeWorkFront(payload?.work_front || notes?.work_front)
  if (!reportDate || !reportNo) return { saved: false, skipped: true, reason: 'missing_keys' as const }

  const prevIndirectHh = toNum(payload?.s4_prev_indirect_hh)
  const prevDirectHh = toNum(payload?.s4_prev_direct_hh)
  const currIndirectHh = toNum(payload?.s4_curr_indirect_hh)
  const currDirectHh = toNum(payload?.s4_curr_direct_hh)
  const currTotalHh = toNum(payload?.s4_curr_total_hh) || (currIndirectHh + currDirectHh)

  const majorHmAccum = toNum(notes?.s4_curr_major_hm)
  const minorHmAccum = toNum(notes?.s4_curr_minor_hm)
  const prevMajorHm = toNum(notes?.s4_prev_major_hm)
  const prevMinorHm = toNum(notes?.s4_prev_minor_hm)
  const majorEquipAccum = toNum(notes?.s4_curr_major_equip)
  const minorEquipAccum = toNum(notes?.s4_curr_minor_equip)
  const totalEquipAccum = toNum(notes?.s4_curr_total_equip) || (majorEquipAccum + minorEquipAccum)

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('pr_daily_report_front_history')
    .select('id, week_no')
    .eq('company_id', companyId)
    .eq('work_front', workFront)
    .eq('report_date', reportDate)
    .eq('report_no', reportNo)
    .limit(1)
    .maybeSingle()
  if (existingError) {
    const msg = String((existingError as any)?.message || existingError)
    if (stripMissingTable(msg)) return { saved: false, skipped: true, reason: 'missing_table' as const }
    return { saved: false, skipped: true, reason: 'read_error' as const }
  }

  const computedWeekNo = Number(existing?.week_no || 0) > 0
    ? Number(existing?.week_no || 0)
    : await resolveFrontHistoryWeekNo({
      supabaseAdmin,
      companyId,
      workFront,
      reportDate,
      reportNo,
    })

  let historyPayload: Record<string, any> = {
    company_id: companyId,
    work_front: workFront,
    report_no: reportNo,
    report_date: reportDate,
    week_no: computedWeekNo || getIsoWeekNo(reportDate),
    indirect_hh: Math.max(0, currIndirectHh - prevIndirectHh),
    direct_hh: Math.max(0, currDirectHh - prevDirectHh),
    daily_hh: Math.max(0, (currIndirectHh - prevIndirectHh) + (currDirectHh - prevDirectHh)),
    indirect_hh_accum: currIndirectHh,
    direct_hh_accum: currDirectHh,
    total_hh_accum: currTotalHh,
    major_hm_daily: Math.max(0, majorHmAccum - prevMajorHm),
    major_hm_accum: majorHmAccum,
    minor_hm_daily: Math.max(0, minorHmAccum - prevMinorHm),
    minor_hm_accum: minorHmAccum,
    major_equip_accum: majorEquipAccum,
    minor_equip_accum: minorEquipAccum,
    total_equip_accum: totalEquipAccum,
    source: 'daily-report',
    notes: `sync daily_report sector4 ${reportDate} #${reportNo}`
  }

  if (existing?.id) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { error: updateError } = await supabaseAdmin
        .from('pr_daily_report_front_history')
        .update({ ...historyPayload, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (!updateError) return { saved: true, skipped: false, mode: 'update' as const }
      const msg = String((updateError as any)?.message || updateError)
      if (stripMissingTable(msg)) return { saved: false, skipped: true, reason: 'missing_table' as const }
      const trimmed = stripMissingColumn(historyPayload, msg)
      if (trimmed) {
        historyPayload = trimmed
        continue
      }
      return { saved: false, skipped: true, reason: 'update_error' as const }
    }
    return { saved: false, skipped: true, reason: 'update_retries_exhausted' as const }
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const { error: insertError } = await supabaseAdmin
      .from('pr_daily_report_front_history')
      .insert(historyPayload)
    if (!insertError) return { saved: true, skipped: false, mode: 'insert' as const }
    const msg = String((insertError as any)?.message || insertError)
    if (stripMissingTable(msg)) return { saved: false, skipped: true, reason: 'missing_table' as const }
    const trimmed = stripMissingColumn(historyPayload, msg)
    if (trimmed) {
      historyPayload = trimmed
      continue
    }
    return { saved: false, skipped: true, reason: 'insert_error' as const }
  }
  return { saved: false, skipped: true, reason: 'insert_retries_exhausted' as const }
}

async function saveDailyReportVersion(params: {
  supabaseAdmin: any
  companyId: string
  reportId: string
  editedBy: string | null
  previousData: any
  newData: any
}) {
  const { supabaseAdmin, companyId, reportId, editedBy, previousData, newData } = params
  const { count, error: countError } = await supabaseAdmin
    .from('pr_daily_reports_versions')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('daily_report_id', reportId)

  if (countError) {
    const msg = String((countError as any)?.message || countError)
    if (stripMissingTable(msg)) return { saved: false, skipped: true, reason: 'missing_versions_table' as const }
    return { saved: false, skipped: true, reason: 'count_error' as const }
  }

  const versionNo = Number(count || 0) + 1
  let versionPayload: Record<string, any> = {
    company_id: companyId,
    daily_report_id: reportId,
    version_no: versionNo,
    edited_by: editedBy,
    previous_data: previousData,
    new_data: newData
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabaseAdmin
      .from('pr_daily_reports_versions')
      .insert(versionPayload)
    if (!error) return { saved: true, skipped: false, reason: null as string | null, version_no: versionNo }

    const msg = String((error as any)?.message || error)
    if (stripMissingTable(msg)) return { saved: false, skipped: true, reason: 'missing_versions_table' as const }
    const trimmed = stripMissingColumn(versionPayload, msg)
    if (trimmed) {
      versionPayload = trimmed
      continue
    }
    console.error('Error saving daily report version:', error)
    return { saved: false, skipped: true, reason: 'insert_error' as const }
  }

  return { saved: false, skipped: true, reason: 'retries_exhausted' as const }
}

async function saveDailyReportDeletionAudit(params: {
  supabaseAdmin: any
  companyId: string
  report: any
  relatedSnapshot: Record<string, any>
  deletedBy: string | null
  deletedByEmail: string | null
  deletedByRole: string | null
  deleteReason: string | null
  deleteSource: string | null
}) {
  const {
    supabaseAdmin,
    companyId,
    report,
    relatedSnapshot,
    deletedBy,
    deletedByEmail,
    deletedByRole,
    deleteReason,
    deleteSource
  } = params

  const auditPayload = {
    company_id: companyId,
    daily_report_id: String(report?.id || ''),
    report_no: Number(report?.report_no || 0) || null,
    report_date: String(report?.report_date || '').trim() || null,
    work_front: resolvePersistedRecordFront(report),
    deleted_by: deletedBy,
    deleted_by_email: deletedByEmail,
    deleted_by_role: deletedByRole,
    delete_reason: deleteReason,
    delete_source: deleteSource,
    report_snapshot: report,
    related_snapshot: relatedSnapshot
  }

  const { data, error } = await supabaseAdmin
    .from('pr_daily_reports_deletions')
    .insert(auditPayload)
    .select('id')
    .single()

  if (error) {
    const msg = String((error as any)?.message || error)
    if (stripMissingTable(msg)) {
      throw new Error('Tabla pr_daily_reports_deletions no existe. Ejecuta la migración de auditoría antes de eliminar reportes.')
    }
    throw new Error(`No se pudo registrar auditoría de eliminación: ${msg}`)
  }

  return data?.id ? String(data.id) : null
}

async function getFrontHistorySnapshot(params: {
  supabaseAdmin: any
  companyId: string
  reportDate: string
  reportNo: number
  workFront: string
}) {
  const { supabaseAdmin, companyId, reportDate, reportNo, workFront } = params
  if (!reportDate || !(reportNo > 0) || !workFront) return []

  const { data, error } = await supabaseAdmin
    .from('pr_daily_report_front_history')
    .select('*')
    .eq('company_id', companyId)
    .eq('report_date', reportDate)
    .eq('report_no', reportNo)
    .eq('work_front', workFront)

  if (error) {
    const msg = String((error as any)?.message || error)
    if (!stripMissingTable(msg)) throw error
    return []
  }

  return Array.isArray(data) ? data : []
}

async function deleteFrontHistoryForReport(params: {
  supabaseAdmin: any
  companyId: string
  reportDate: string
  reportNo: number
  workFront: string
}) {
  const { supabaseAdmin, companyId, reportDate, reportNo, workFront } = params
  if (!reportDate || !(reportNo > 0) || !workFront) return

  const { error } = await supabaseAdmin
    .from('pr_daily_report_front_history')
    .delete()
    .eq('company_id', companyId)
    .eq('report_date', reportDate)
    .eq('report_no', reportNo)
    .eq('work_front', workFront)

  if (error) {
    const msg = String((error as any)?.message || error)
    if (!stripMissingTable(msg)) throw error
  }
}

async function getNextReportNo(supabaseAdmin: any, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('pr_daily_reports')
    .select('report_no')
    .eq('company_id', companyId)
    .order('report_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const last = Number(data?.report_no || 0)
  return last + 1
}

const getUtcDayNumber = (date: string) => {
  const m = String(date || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000)
}

const getDailyReportNoFromDate = (date: string) => {
  const target = getUtcDayNumber(date)
  const anchor = getUtcDayNumber(DAILY_REPORT_BASE_SEQUENCE_ANCHOR_DATE)
  if (target == null || anchor == null) return null
  return DAILY_REPORT_BASE_SEQUENCE_ANCHOR_NO + (target - anchor)
}

function requireRole(role: string) {
  return role === 'admin' || role === 'dev' || role === 'user'
}

const DAILY_REPORT_LIST_SELECT = `
  id,
  report_no,
  revision,
  report_date,
  equipment_snapshot_date,
  contractor_name,
  client_name,
  project_name,
  contract_title,
  contract_number,
  work_front,
  hh_day,
  hh_productive,
  weather_label,
  source_field_report_ids,
  notes,
  created_at,
  updated_at,
  s4_prev_indirect_dot,
  s4_prev_indirect_hh,
  s4_prev_direct_dot,
  s4_prev_direct_hh,
  s4_prev_total_dot,
  s4_prev_total_hh,
  s4_prev_total_equip,
  s4_prev_total_hm,
  s4_curr_indirect_dot,
  s4_curr_indirect_hh,
  s4_curr_direct_dot,
  s4_curr_direct_hh,
  s4_curr_total_dot,
  s4_curr_total_hh,
  s4_curr_total_equip,
  s4_curr_total_hm
`

const DAILY_REPORT_VALIDATION_SELECT = `
  id,
  report_no,
  report_date,
  work_front,
  project_name,
  contract_title,
  contract_number,
  contractor_name,
  client_name,
  created_at
`

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (!requireRole(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabaseAdmin = getSupabaseAdmin()
    const companyId = String(session.user.companyId)
    const id = req.nextUrl.searchParams.get('id')
    const historyReportId = req.nextUrl.searchParams.get('history_report_id')
    const historyReportDate = String(req.nextUrl.searchParams.get('history_report_date') || '').trim().slice(0, 10)
    const bootstrap = req.nextUrl.searchParams.get('bootstrap') === '1'
    const baselines = req.nextUrl.searchParams.get('baselines') === '1'
    const frontHistory = req.nextUrl.searchParams.get('front_history') === '1'
    const validation = req.nextUrl.searchParams.get('validation') === '1'
    const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10)

    if (historyReportId) {
      if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const { data, error } = await supabaseAdmin
        .from('pr_daily_reports_versions')
        .select('id, daily_report_id, version_no, edited_by, previous_data, new_data, created_at')
        .eq('company_id', companyId)
        .eq('daily_report_id', historyReportId)
        .order('version_no', { ascending: false })
      if (error) return NextResponse.json({ error: formatError(error) }, { status: 500 })
      return NextResponse.json(data || [])
    }

    if (historyReportDate) {
      if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!/^\d{4}-\d{2}-\d{2}$/.test(historyReportDate)) {
        return NextResponse.json({ error: 'history_report_date inválida' }, { status: 400 })
      }

      const { data: dateReports, error: dateReportsError } = await supabaseAdmin
        .from('pr_daily_reports')
        .select('id, report_no, report_date, work_front, notes')
        .eq('company_id', companyId)
        .eq('report_date', historyReportDate)
      if (dateReportsError) return NextResponse.json({ error: formatError(dateReportsError) }, { status: 500 })

      const reportIds = (Array.isArray(dateReports) ? dateReports : [])
        .map((row: any) => String(row?.id || '').trim())
        .filter(Boolean)

      let versions: any[] = []
      if (reportIds.length > 0) {
        const { data: versionRows, error: versionsError } = await supabaseAdmin
          .from('pr_daily_reports_versions')
          .select('id, daily_report_id, version_no, edited_by, previous_data, new_data, created_at')
          .eq('company_id', companyId)
          .in('daily_report_id', reportIds)
          .order('created_at', { ascending: false })
        if (versionsError) return NextResponse.json({ error: formatError(versionsError) }, { status: 500 })
        versions = Array.isArray(versionRows) ? versionRows : []
      }

      let deletions: any[] = []
      const { data: deletionRows, error: deletionsError } = await supabaseAdmin
        .from('pr_daily_reports_deletions')
        .select('id, daily_report_id, report_no, report_date, work_front, deleted_by, deleted_by_email, deleted_by_role, deleted_at, delete_reason, delete_source, report_snapshot, related_snapshot')
        .eq('company_id', companyId)
        .eq('report_date', historyReportDate)
        .order('deleted_at', { ascending: false })
      if (deletionsError) {
        const msg = String((deletionsError as any)?.message || deletionsError)
        if (!stripMissingTable(msg)) return NextResponse.json({ error: formatError(deletionsError) }, { status: 500 })
      } else {
        deletions = Array.isArray(deletionRows) ? deletionRows : []
      }

      return NextResponse.json({
        report_date: historyReportDate,
        reports: dateReports || [],
        versions,
        deletions
      })
    }

    if (baselines) {
      const { data, error } = await supabaseAdmin
        .from('pr_daily_report_front_baselines')
        .select('*')
        .eq('company_id', companyId)
        .order('as_of_date', { ascending: false })
        .order('as_of_report_no', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) return NextResponse.json({ error: formatError(error) }, { status: 500 })
      const latestByFront = new Map<string, any>()
      ;(data || []).forEach((row: any) => {
        const front = normalizeWorkFront(row?.work_front)
        if (!latestByFront.has(front)) latestByFront.set(front, row)
      })
      return NextResponse.json(Array.from(latestByFront.values()))
    }

    if (frontHistory) {
      const { data, error } = await supabaseAdmin
        .from('pr_daily_report_front_history')
        .select('*')
        .eq('company_id', companyId)
        .in('work_front', ['CANALETAS', 'PISCINAS'])
        .order('report_date', { ascending: true })
        .order('report_no', { ascending: true })
      if (error) return NextResponse.json({ error: formatError(error) }, { status: 500 })
      return NextResponse.json(data || [])
    }

    if (bootstrap) {
      const [companyRes, projectRes, fieldRes] = await Promise.all([
        supabaseAdmin
          .from('pr_companies')
          .select('id, name, logo_url')
          .eq('id', companyId)
          .maybeSingle(),
        supabaseAdmin
          .from('pr_projects')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('pr_field_reports')
          .select('id, weather, person_hours')
          .eq('company_id', companyId)
          .eq('date', date)
      ])

      if (companyRes.error) throw companyRes.error
      const company: any = companyRes.data || {}
      const project: any = projectRes.error ? {} : (projectRes.data || {})
      const fieldReports = fieldRes.error ? [] : (fieldRes.data || [])

      const hhDay = fieldReports.reduce((acc: number, r: any) => acc + sumPersonHours(r?.person_hours), 0)
      const weatherFreq = new Map<string, number>()
      fieldReports.forEach((r: any) => {
        const label = weatherLabel(r?.weather)
        if (!label) return
        weatherFreq.set(label, (weatherFreq.get(label) || 0) + 1)
      })
      const weather = Array.from(weatherFreq.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || ''

      const dateBasedNo = getDailyReportNoFromDate(date)
      const nextNo = dateBasedNo && dateBasedNo > 0 ? dateBasedNo : await getNextReportNo(supabaseAdmin, companyId)

      return NextResponse.json({
        defaults: {
          report_no: nextNo,
          revision: '0',
          report_date: date,
          contractor_name: String(company?.name || ''),
          contractor_logo_url: String(company?.logo_url || ''),
          client_name: pickFirst(project, ['client_name', 'client', 'mandante', 'owner']),
          client_logo_url: pickFirst(project, ['client_logo_url', 'logo_url', 'client_logo']),
          project_name: pickFirst(project, ['project_name', 'name', 'project', 'nombre']),
          contract_title: pickFirst(project, ['contract_title', 'contract_name', 'contract', 'description']),
          contract_number: pickFirst(project, ['contract_number', 'contract_no', 'code', 'number']),
          work_calendar: pickFirst(project, ['work_calendar', 'calendar', 'shift_pattern']),
          hh_day: Number(hhDay.toFixed(2)),
          hh_productive: Number(hhDay.toFixed(2)),
          weather_label: weather,
          source_field_report_ids: fieldReports.map((r: any) => String(r.id))
        }
      })
    }

    if (id) {
      const { data, error } = await supabaseAdmin
        .from('pr_daily_reports')
        .select('*')
        .eq('company_id', companyId)
        .eq('id', id)
        .single()
      if (error) return NextResponse.json({ error: formatError(error) }, { status: 500 })
      return NextResponse.json(data)
    }

    const limitRaw = parseInt(req.nextUrl.searchParams.get('limit') || '120', 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : 120
    const { data, error } = await supabaseAdmin
      .from('pr_daily_reports')
      .select(validation ? DAILY_REPORT_VALIDATION_SELECT : DAILY_REPORT_LIST_SELECT)
      .eq('company_id', companyId)
      .order('report_date', { ascending: false })
      .order('report_no', { ascending: false })
      .limit(limit)
    if (error) return NextResponse.json({ error: formatError(error) }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: formatError(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (!requireRole(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabaseAdmin = getSupabaseAdmin()
    const companyId = String(session.user.companyId)
    const body = await req.json()

    const reportDate = String(body?.report_date || '').trim()
    if (!reportDate) return NextResponse.json({ error: 'report_date es requerido' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return NextResponse.json({ error: 'report_date debe tener formato YYYY-MM-DD' }, { status: 400 })
    }

    const baseNotes = body?.notes && typeof body.notes === 'object' ? body.notes : {}
    const v2FormSnapshot = asObjectOrNull(body?.v2_form_snapshot)
    const v2RuntimeSnapshot = asObjectOrNull(body?.v2_runtime_snapshot)
    const workFront = resolveWorkFront(body, baseNotes, v2FormSnapshot, v2RuntimeSnapshot)

    const { data: existingByDate, error: existingByDateError } = await supabaseAdmin
      .from('pr_daily_reports')
      .select('id, work_front, notes, v2_form_snapshot, v2_runtime_snapshot')
      .eq('company_id', companyId)
      .eq('report_date', reportDate)
      .limit(10)
    if (existingByDateError) {
      return NextResponse.json({ error: formatError(existingByDateError) }, { status: 500 })
    }
    const sameDateRows = Array.isArray(existingByDate) ? existingByDate : []
    const hasSameFrontForDate = sameDateRows.some((row: any) => resolvePersistedRecordFront(row) === workFront)
    if (hasSameFrontForDate) {
      return NextResponse.json({ error: `Ya existe un reporte diario para esa fecha y frente (${workFront}).` }, { status: 409 })
    }

    const dateBasedNo = getDailyReportNoFromDate(reportDate)
    let reportNo = dateBasedNo && dateBasedNo > 0
      ? dateBasedNo
      : Number(body?.report_no || 0)
    if (!reportNo) reportNo = await getNextReportNo(supabaseAdmin, companyId)

    const sourceIds = Array.isArray(body?.source_field_report_ids)
      ? body.source_field_report_ids.map((x: any) => String(x)).filter(Boolean)
      : []
    const evidenceManifest = await buildEvidenceManifestForReport(supabaseAdmin, companyId, reportDate, sourceIds)

    const payload: Record<string, any> = {
      company_id: companyId,
      report_no: reportNo,
      revision: body?.revision != null ? String(body.revision) : '0',
      report_date: reportDate,
      equipment_snapshot_date: normalizeEquipmentSnapshotDateForReport(body?.equipment_snapshot_date, reportDate),
      contractor_name: body?.contractor_name || null,
      contractor_logo_url: body?.contractor_logo_url || null,
      client_name: body?.client_name || null,
      client_logo_url: body?.client_logo_url || null,
      project_name: body?.project_name || null,
      contract_title: body?.contract_title || null,
      contract_number: body?.contract_number || null,
      work_calendar: body?.work_calendar || null,
      hh_day: Number(body?.hh_day || 0),
      hh_productive: Number(body?.hh_productive || 0),
      s4_prev_indirect_dot: Number(body?.s4_prev_indirect_dot || 0),
      s4_prev_indirect_hh: Number(body?.s4_prev_indirect_hh || 0),
      s4_prev_direct_dot: Number(body?.s4_prev_direct_dot || 0),
      s4_prev_direct_hh: Number(body?.s4_prev_direct_hh || 0),
      s4_prev_total_dot: Number(body?.s4_prev_total_dot || 0),
      s4_prev_total_hh: Number(body?.s4_prev_total_hh || 0),
      s4_prev_total_equip: Number(body?.s4_prev_total_equip || 0),
      s4_prev_total_hm: Number(body?.s4_prev_total_hm || 0),
      s4_curr_indirect_dot: Number(body?.s4_curr_indirect_dot || 0),
      s4_curr_indirect_hh: Number(body?.s4_curr_indirect_hh || 0),
      s4_curr_direct_dot: Number(body?.s4_curr_direct_dot || 0),
      s4_curr_direct_hh: Number(body?.s4_curr_direct_hh || 0),
      s4_curr_total_dot: Number(body?.s4_curr_total_dot || 0),
      s4_curr_total_hh: Number(body?.s4_curr_total_hh || 0),
      s4_curr_total_equip: Number(body?.s4_curr_total_equip || 0),
      s4_curr_total_hm: Number(body?.s4_curr_total_hm || 0),
      weather_label: body?.weather_label || null,
      work_front: workFront,
      source_field_report_ids: sourceIds,
      notes: { ...baseNotes, work_front: workFront, evidence_manifest: evidenceManifest },
      v2_form_snapshot: v2FormSnapshot,
      v2_runtime_snapshot: v2RuntimeSnapshot,
      raw_payload: asObjectOrNull(body),
      created_by: session?.user?.id || null,
      updated_by: session?.user?.id || null
    }

    const { data, error } = await supabaseAdmin
      .from('pr_daily_reports')
      .insert(payload)
      .select()
      .single()
    if (error) return NextResponse.json({ error: formatError(error), details: error }, { status: 500 })
    const historySync = await upsertFrontHistoryFromSector4({
      supabaseAdmin,
      companyId,
      payload,
      notes: (payload.notes && typeof payload.notes === 'object') ? payload.notes : {}
    })
    return NextResponse.json({ ...data, _front_history_sync: historySync })
  } catch (err: any) {
    return NextResponse.json({ error: formatError(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (!requireRole(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabaseAdmin = getSupabaseAdmin()
    const companyId = String(session.user.companyId)
    const body = await req.json()
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
    const { data: previousReport, error: previousError } = await supabaseAdmin
      .from('pr_daily_reports')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', id)
      .single()
    if (previousError) return NextResponse.json({ error: formatError(previousError), details: previousError }, { status: 500 })

    const reportDate = String(body?.report_date || '').trim()
    const dateBasedNo = getDailyReportNoFromDate(reportDate)
    const sourceIds = Array.isArray(body?.source_field_report_ids)
      ? body.source_field_report_ids.map((x: any) => String(x)).filter(Boolean)
      : []
    const evidenceManifest = await buildEvidenceManifestForReport(supabaseAdmin, companyId, reportDate, sourceIds)
    const baseNotes = body?.notes && typeof body.notes === 'object' ? body.notes : {}
    const v2FormSnapshot = asObjectOrNull(body?.v2_form_snapshot)
    const v2RuntimeSnapshot = asObjectOrNull(body?.v2_runtime_snapshot)
    const workFront = resolveWorkFront(body, baseNotes, v2FormSnapshot, v2RuntimeSnapshot)

    const payload: Record<string, any> = {
      report_no: (dateBasedNo && dateBasedNo > 0) ? dateBasedNo : (Number(body?.report_no || 0) || null),
      revision: body?.revision != null ? String(body.revision) : null,
      report_date: body?.report_date || null,
      equipment_snapshot_date: normalizeEquipmentSnapshotDateForReport(body?.equipment_snapshot_date, reportDate),
      contractor_name: body?.contractor_name || null,
      contractor_logo_url: body?.contractor_logo_url || null,
      client_name: body?.client_name || null,
      client_logo_url: body?.client_logo_url || null,
      project_name: body?.project_name || null,
      contract_title: body?.contract_title || null,
      contract_number: body?.contract_number || null,
      work_calendar: body?.work_calendar || null,
      hh_day: Number(body?.hh_day || 0),
      hh_productive: Number(body?.hh_productive || 0),
      s4_prev_indirect_dot: Number(body?.s4_prev_indirect_dot || 0),
      s4_prev_indirect_hh: Number(body?.s4_prev_indirect_hh || 0),
      s4_prev_direct_dot: Number(body?.s4_prev_direct_dot || 0),
      s4_prev_direct_hh: Number(body?.s4_prev_direct_hh || 0),
      s4_prev_total_dot: Number(body?.s4_prev_total_dot || 0),
      s4_prev_total_hh: Number(body?.s4_prev_total_hh || 0),
      s4_prev_total_equip: Number(body?.s4_prev_total_equip || 0),
      s4_prev_total_hm: Number(body?.s4_prev_total_hm || 0),
      s4_curr_indirect_dot: Number(body?.s4_curr_indirect_dot || 0),
      s4_curr_indirect_hh: Number(body?.s4_curr_indirect_hh || 0),
      s4_curr_direct_dot: Number(body?.s4_curr_direct_dot || 0),
      s4_curr_direct_hh: Number(body?.s4_curr_direct_hh || 0),
      s4_curr_total_dot: Number(body?.s4_curr_total_dot || 0),
      s4_curr_total_hh: Number(body?.s4_curr_total_hh || 0),
      s4_curr_total_equip: Number(body?.s4_curr_total_equip || 0),
      s4_curr_total_hm: Number(body?.s4_curr_total_hm || 0),
      weather_label: body?.weather_label || null,
      work_front: workFront,
      source_field_report_ids: sourceIds,
      notes: { ...baseNotes, work_front: workFront, evidence_manifest: evidenceManifest },
      v2_form_snapshot: v2FormSnapshot,
      v2_runtime_snapshot: v2RuntimeSnapshot,
      raw_payload: asObjectOrNull(body),
      updated_by: session?.user?.id || null,
      updated_at: new Date().toISOString()
    }

    Object.keys(payload).forEach((k) => {
      if (payload[k] === null) delete payload[k]
    })

    const { data, error } = await supabaseAdmin
      .from('pr_daily_reports')
      .update(payload)
      .eq('company_id', companyId)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: formatError(error), details: error }, { status: 500 })
    const historySync = await upsertFrontHistoryFromSector4({
      supabaseAdmin,
      companyId,
      payload: { ...payload, report_no: data?.report_no, report_date: data?.report_date, work_front: data?.work_front },
      notes: (payload.notes && typeof payload.notes === 'object') ? payload.notes : {}
    })
    const versionResult = await saveDailyReportVersion({
      supabaseAdmin,
      companyId,
      reportId: id,
      editedBy: session?.user?.id ? String(session.user.id) : null,
      previousData: previousReport || null,
      newData: data || null
    })
    return NextResponse.json({ ...data, _versioning: versionResult, _front_history_sync: historySync })
  } catch (err: any) {
    return NextResponse.json({ error: formatError(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (!requireRole(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabaseAdmin = getSupabaseAdmin()
    const companyId = String(session.user.companyId)
    const currentUserId = session?.user?.id ? String(session.user.id) : ''
    const isUserRole = role === 'user'
    const deleteReason = String(req.nextUrl.searchParams.get('delete_reason') || req.nextUrl.searchParams.get('reason') || '').trim() || null
    const deleteSource = String(req.nextUrl.searchParams.get('delete_source') || req.nextUrl.searchParams.get('source') || 'daily_report_delete').trim()
    const deleteScope = String(req.nextUrl.searchParams.get('delete_scope') || '').trim().toLowerCase()
    const reportDateForScope = String(req.nextUrl.searchParams.get('report_date') || req.nextUrl.searchParams.get('date') || '').trim().slice(0, 10)

    if (deleteScope === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDateForScope)) {
        return NextResponse.json({ error: 'report_date es requerido para eliminar por fecha' }, { status: 400 })
      }

      const { data: dateReports, error: dateReportsError } = await supabaseAdmin
        .from('pr_daily_reports')
        .select('*')
        .eq('company_id', companyId)
        .eq('report_date', reportDateForScope)
        .order('report_no', { ascending: true })
      if (dateReportsError) return NextResponse.json({ error: formatError(dateReportsError) }, { status: 500 })

      const reportsToDelete = Array.isArray(dateReports) ? dateReports : []
      if (reportsToDelete.length === 0) return NextResponse.json({ error: 'No hay reportes para la fecha indicada' }, { status: 404 })
      if (isUserRole && reportsToDelete.some((report: any) => String(report?.created_by || '') !== currentUserId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const preparedReports = await Promise.all(reportsToDelete.map(async (report: any) => {
        const reportDate = String(report?.report_date || '').trim()
        const reportNo = Number(report?.report_no || 0)
        const workFront = resolvePersistedRecordFront(report)
        const frontHistorySnapshot = await getFrontHistorySnapshot({
          supabaseAdmin,
          companyId,
          reportDate,
          reportNo,
          workFront
        })
        return { report, reportDate, reportNo, workFront, frontHistorySnapshot }
      }))

      const deletionAuditIds: string[] = []
      for (const item of preparedReports) {
        const deletionAuditId = await saveDailyReportDeletionAudit({
          supabaseAdmin,
          companyId,
          report: item.report,
          relatedSnapshot: {
            pr_daily_report_front_history: item.frontHistorySnapshot
          },
          deletedBy: session?.user?.id ? String(session.user.id) : null,
          deletedByEmail: session?.user?.email ? String(session.user.email) : null,
          deletedByRole: role || null,
          deleteReason,
          deleteSource: deleteSource || 'daily_report_date_delete'
        })
        if (deletionAuditId) deletionAuditIds.push(deletionAuditId)
      }

      const ids = preparedReports.map((item) => String(item.report?.id || '')).filter(Boolean)
      const { error: deleteReportsError } = await supabaseAdmin
        .from('pr_daily_reports')
        .delete()
        .eq('company_id', companyId)
        .in('id', ids)
      if (deleteReportsError) return NextResponse.json({ error: formatError(deleteReportsError) }, { status: 500 })

      for (const item of preparedReports) {
        await deleteFrontHistoryForReport({
          supabaseAdmin,
          companyId,
          reportDate: item.reportDate,
          reportNo: item.reportNo,
          workFront: item.workFront
        })
      }

      return NextResponse.json({
        ok: true,
        delete_scope: 'date',
        report_date: reportDateForScope,
        deleted_count: ids.length,
        deleted_ids: ids,
        deletion_audit_ids: deletionAuditIds
      })
    }

    const id = String(req.nextUrl.searchParams.get('id') || '').trim()
    if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('pr_daily_reports')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle()
    if (existingError) return NextResponse.json({ error: formatError(existingError) }, { status: 500 })
    if (!existing?.id) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 })
    if (isUserRole && String(existing?.created_by || '') !== currentUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const reportDate = String(existing?.report_date || '').trim()
    const reportNo = Number(existing?.report_no || 0)
    const workFront = resolvePersistedRecordFront(existing)
    const frontHistorySnapshot = await getFrontHistorySnapshot({ supabaseAdmin, companyId, reportDate, reportNo, workFront })

    const deletionAuditId = await saveDailyReportDeletionAudit({
      supabaseAdmin,
      companyId,
      report: existing,
      relatedSnapshot: {
        pr_daily_report_front_history: frontHistorySnapshot
      },
      deletedBy: session?.user?.id ? String(session.user.id) : null,
      deletedByEmail: session?.user?.email ? String(session.user.email) : null,
      deletedByRole: role || null,
      deleteReason,
      deleteSource
    })

    const { error: deleteReportError } = await supabaseAdmin
      .from('pr_daily_reports')
      .delete()
      .eq('company_id', companyId)
      .eq('id', id)
    if (deleteReportError) return NextResponse.json({ error: formatError(deleteReportError) }, { status: 500 })

    await deleteFrontHistoryForReport({ supabaseAdmin, companyId, reportDate, reportNo, workFront })

    return NextResponse.json({ ok: true, id, report_date: reportDate, report_no: reportNo, work_front: workFront, deletion_audit_id: deletionAuditId })
  } catch (err: any) {
    return NextResponse.json({ error: formatError(err) }, { status: 500 })
  }
}
