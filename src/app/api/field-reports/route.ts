import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import { normalizeText } from '@/lib/normalize'
import { createR2PresignedUrl } from '@/lib/r2Presign'
import { resolveCurrentActor } from '@/lib/currentActor'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const FIELD_REPORT_BASE_SEQUENCE_ANCHOR_DATE = '2026-05-31'
const FIELD_REPORT_BASE_SEQUENCE_ANCHOR_NO = 54
const FIELD_REPORT_NOC_SEQUENCE_SEEDS: Array<{ match: string[]; next: number }> = [
  { match: ['NOC', '001', 'CALAMIN'], next: 10 },
  { match: ['NOC', '002', 'PISCINA', 'AGUA', 'SALADA'], next: 23 },
  { match: ['NOC', '006', 'ELECTRIC'], next: 1 },
  { match: ['NOC', '007', 'VERTEDERO', 'ILS', '2'], next: 5 }
]

type ReportFrontConfig = {
  id?: string | null
  name?: string | null
  title_prefix?: string | null
  sequence_mode?: string | null
  next_sequence_no?: number | null
  date_anchor?: string | null
  date_anchor_sequence_no?: number | null
}

function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Missing service role key')
  return createClient(SUPABASE_URL, key)
}

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

const isBaseContractFront = (front: any) => {
  const normalized = normalizeFrontLabel(front)
  return normalized.includes('CONTRATO BASE') || normalized === 'PISCINAS' || normalized === 'CANALETAS'
}

const getNocSequenceSeed = (front: any) => {
  const normalized = normalizeFrontLabel(front)
  return FIELD_REPORT_NOC_SEQUENCE_SEEDS.find((item) => item.match.every((part) => normalized.includes(part)))?.next || null
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

const buildFieldReportTitleFromConfig = (frontConfig: ReportFrontConfig, fallbackFront: any, sequenceNo?: number | null) => {
  const prefix = String(frontConfig?.title_prefix || '').trim()
  if (!prefix) return buildFieldReportTitle(fallbackFront, sequenceNo)
  const sequence = Number(sequenceNo || 0)
  return sequence > 0 ? `${prefix.toUpperCase()} N°${String(sequence).padStart(3, '0')}` : prefix.toUpperCase()
}

const FIELD_REPORT_LIST_SUMMARY_SELECT = [
  'id',
  'company_id',
  'design_version',
  'emitted_by_id',
  'date',
  'report_sequence_no',
  'report_title',
  'supervisor_id',
  'capataz_id',
  'specialty',
  'work_front',
  'crew_id',
  'crew_ids',
  'crew_name',
  'field_boss_name',
  'field_boss_phone',
  'supervisor',
  'capataz',
  'supervisor_name',
  'capataz_name',
  'weather',
  'turno',
  'area',
  'start_time',
  'end_time',
  'activities',
  'assignments',
  'created_at'
].join(', ')

const FIELD_REPORT_LIST_SLIM_SELECT = [
  'id',
  'company_id',
  'emitted_by_id',
  'date',
  'report_sequence_no',
  'report_title',
  'supervisor_id',
  'capataz_id',
  'specialty',
  'work_front',
  'crew_id',
  'crew_ids',
  'crew_name',
  'weather',
  'turno',
  'area',
  'start_time',
  'end_time',
  'created_at'
].join(', ')

const FIELD_REPORT_DAILY_SUMMARY_SELECT = [
  FIELD_REPORT_LIST_SUMMARY_SELECT,
  'personnel',
  'personnel_ids',
  'person_hours',
  'equipment_entries',
  'equipment_hours',
  'activity_observations'
].join(', ')

const FIELD_REPORT_HOURS_SUMMARY_SELECT = [
  'id',
  'company_id',
  'date',
  'created_at',
  'crew_id',
  'crew_ids',
  'crew_name',
  'specialty',
  'personnel',
  'person_hours'
].join(', ')

const resolveFieldReportSequenceNo = async (
  supabaseAdmin: any,
  companyId: string,
  front: string,
  date: string,
  provided: any,
  excludeReportId?: string
) => {
  const providedNo = Number(provided || 0)
  if (isBaseContractFront(front)) return getBaseContractSequenceNo(date) || (providedNo > 0 ? providedNo : null)
  if (excludeReportId && providedNo > 0) return providedNo

  const seed = getNocSequenceSeed(front) || 1
  const { data, error } = await supabaseAdmin
    .from('pr_field_reports')
    .select('id, work_front, report_sequence_no')
    .eq('company_id', companyId)
    .not('report_sequence_no', 'is', null)
    .limit(500)
  if (error) return seed

  const normalizedFront = normalizeFrontLabel(front)
  const maxExisting = (data || []).reduce((max: number, row: any) => {
    if (excludeReportId && String(row?.id || '') === String(excludeReportId)) return max
    if (normalizeFrontLabel(row?.work_front || '') !== normalizedFront) return max
    const n = Number(row?.report_sequence_no || 0)
    return n > max ? n : max
  }, 0)
  return Math.max(seed, maxExisting + 1)
}

const getReportFrontConfig = async (
  supabaseAdmin: any,
  companyId: string,
  workFrontId: any,
  front: string
): Promise<ReportFrontConfig | null> => {
  try {
    const id = String(workFrontId || '').trim()
    if (id) {
      const { data, error } = await supabaseAdmin
        .from('pr_report_fronts')
        .select('id, name, title_prefix, sequence_mode, next_sequence_no, date_anchor, date_anchor_sequence_no')
        .eq('company_id', companyId)
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle()
      if (!error && data) return data
    }

    const name = String(front || '').trim()
    if (!name) return null
    const { data, error } = await supabaseAdmin
      .from('pr_report_fronts')
      .select('id, name, title_prefix, sequence_mode, next_sequence_no, date_anchor, date_anchor_sequence_no')
      .eq('company_id', companyId)
      .eq('name', name)
      .eq('is_active', true)
      .maybeSingle()
    if (!error && data) return data
    return null
  } catch {
    return null
  }
}

const resolveReportFrontNumberAndTitle = async (params: {
  supabaseAdmin: any
  companyId: string
  front: string
  date: string
  provided: any
  workFrontId?: any
  excludeReportId?: string
}) => {
  const frontConfig = await getReportFrontConfig(
    params.supabaseAdmin,
    params.companyId,
    params.workFrontId,
    params.front
  )
  const frontName = String(frontConfig?.name || params.front || '').trim()

  if (frontConfig) {
    const providedNo = Number(params.provided || 0)
    if (params.excludeReportId && providedNo > 0) {
      return {
        reportSequenceNo: providedNo,
        reportTitle: buildFieldReportTitleFromConfig(frontConfig, frontName, providedNo),
        workFrontId: frontConfig.id || null,
        workFrontName: frontName,
        nextSequenceNoToPersist: null as number | null,
      }
    }

    const mode = String(frontConfig.sequence_mode || '').toLowerCase()
    if (mode === 'date_anchor') {
      const anchorDate = String(frontConfig.date_anchor || FIELD_REPORT_BASE_SEQUENCE_ANCHOR_DATE)
      const anchorNo = Number(frontConfig.date_anchor_sequence_no || FIELD_REPORT_BASE_SEQUENCE_ANCHOR_NO)
      const target = getUtcDayNumber(params.date)
      const anchor = getUtcDayNumber(anchorDate)
      const sequenceNo =
        target == null || anchor == null
          ? (providedNo > 0 ? providedNo : null)
          : anchorNo + (target - anchor)
      return {
        reportSequenceNo: sequenceNo,
        reportTitle: buildFieldReportTitleFromConfig(frontConfig, frontName, sequenceNo),
        workFrontId: frontConfig.id || null,
        workFrontName: frontName,
        nextSequenceNoToPersist: null as number | null,
      }
    }

    const fallbackSequenceNo = await resolveFieldReportSequenceNo(
      params.supabaseAdmin,
      params.companyId,
      frontName,
      params.date,
      params.provided,
      params.excludeReportId
    )
    const tableNext = Number(frontConfig.next_sequence_no || 0)
    const sequenceNo = Math.max(tableNext > 0 ? tableNext : 1, Number(fallbackSequenceNo || 0) || 1)
    return {
      reportSequenceNo: sequenceNo,
      reportTitle: buildFieldReportTitleFromConfig(frontConfig, frontName, sequenceNo),
      workFrontId: frontConfig.id || null,
      workFrontName: frontName,
      nextSequenceNoToPersist: sequenceNo + 1,
    }
  }

  const reportSequenceNo = await resolveFieldReportSequenceNo(
    params.supabaseAdmin,
    params.companyId,
    params.front,
    params.date,
    params.provided,
    params.excludeReportId
  )
  return {
    reportSequenceNo,
    reportTitle: buildFieldReportTitle(params.front, reportSequenceNo),
    workFrontId: String(params.workFrontId || '').trim() || null,
    workFrontName: String(params.front || '').trim(),
    nextSequenceNoToPersist: null as number | null,
  }
}

const persistNextReportFrontSequence = async (
  supabaseAdmin: any,
  companyId: string,
  workFrontId: any,
  nextSequenceNo: number | null
) => {
  const id = String(workFrontId || '').trim()
  if (!id || !nextSequenceNo) return
  try {
    await supabaseAdmin
      .from('pr_report_fronts')
      .update({ next_sequence_no: nextSequenceNo, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id)
  } catch {}
}

const buildPersonName = (row: any) => {
  const full = `${String(row?.first_name || '').trim()} ${String(row?.last_name || '').trim()}`.replace(/\s+/g, ' ').trim()
  return full || String(row?.full_name || row?.name || row?.worker_name || '').trim()
}

const splitNames = (value: any) =>
  String(value || '')
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)

const uniqNames = (values: string[]) =>
  Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)))

const isSupervisorPosition = (value: any) => {
  const p = normalizeText(String(value || '')).toLowerCase()
  return p.includes('supervisor') || p.includes('jefe') || p.includes('coordinador')
}

const isCapatazPosition = (value: any) => {
  const p = normalizeText(String(value || '')).toLowerCase()
  return p.includes('capataz') || p.includes('foreman') || p.includes('encargado')
}

const getReportCrewIds = (report: any): string[] => {
  const parsedCrewIds = parseJsonMaybe(report?.crew_ids)
  const ids = Array.isArray(parsedCrewIds)
    ? parsedCrewIds.map((x: any) => String(x || '').trim()).filter(Boolean)
    : String(report?.crew_ids || '')
      .split(/[;,]/)
      .map((x: any) => String(x || '').trim())
      .filter((x: string) => x && x !== '[]')
  if (report?.crew_id) ids.push(String(report.crew_id).trim())
  ;[
    ...parseJsonArrayMaybe(report?.assignments),
    ...parseJsonArrayMaybe(report?.activities),
    ...getReportPersonnelRows(report),
  ].forEach((row: any) => {
    ;[
      row?.crewId,
      row?.crew_id,
      row?.assigned_crew_id,
      row?.crew?.id,
    ].forEach((value) => {
      const id = String(value || '').trim()
      if (id) ids.push(id)
    })
  })
  return Array.from(new Set(ids.filter(Boolean)))
}

const getReportCrewNames = (report: any): string[] => {
  const names = [
    ...splitNames(report?.crew_name),
    ...splitNames(report?.crewName),
  ]
  ;[
    ...parseJsonArrayMaybe(report?.assignments),
    ...parseJsonArrayMaybe(report?.activities),
    ...getReportPersonnelRows(report),
  ].forEach((row: any) => {
    ;[
      row?.crewName,
      row?.crew_name,
      row?.crew?.name,
    ].forEach((value) => {
      const name = String(value || '').trim()
      if (name) names.push(name)
    })
  })
  return Array.from(new Set(names.filter(Boolean)))
}

const readStringIds = (...values: any[]): string[] => {
  const ids = new Set<string>()
  values.forEach((value) => {
    const parsed = parseJsonMaybe(value)
    const items = Array.isArray(parsed)
      ? parsed
      : String(parsed || '')
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    items.forEach((item: any) => {
      const id = String(item || '').trim()
      if (id && id !== '[]') ids.add(id)
    })
  })
  return Array.from(ids)
}

const getReportSupervisorIds = (report: any) =>
  readStringIds(report?.supervisor_id, report?.supervisor_ids, report?.supervisors, report?.supervisor_user_id, report?.supervisor_collaborator_id)

const getReportCapatazIds = (report: any) =>
  readStringIds(report?.capataz_id, report?.capataz_ids, report?.foreman_id, report?.foreman_ids, report?.foremen, report?.capataz_user_id, report?.capataz_collaborator_id)

const parseJsonMaybe = (value: any) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const parseJsonArrayMaybe = (value: any): any[] => {
  const parsed = parseJsonMaybe(value)
  return Array.isArray(parsed) ? parsed : []
}

const normalizePersonDocument = (value: any) =>
  String(value || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '')

const normalizePersonLookupText = (value: any) =>
  normalizeText(String(value || '').trim()).replace(/\s+/g, ' ')

const getPersonNameFromReportRow = (row: any) => {
  const full = `${String(row?.first_name || row?.firstName || '').trim()} ${String(row?.last_name || row?.lastName || '').trim()}`
    .replace(/\s+/g, ' ')
    .trim()
  return full || String(row?.name || row?.full_name || row?.worker_name || '').trim()
}

const getPersonLookupNamePositionKey = (name: any, position: any) => {
  const cleanName = normalizePersonLookupText(name)
  if (!cleanName) return ''
  const cleanPosition = normalizePersonLookupText(position)
  return `${cleanName}|${cleanPosition || '-'}`
}

const getReportPersonnelRows = (report: any): any[] => {
  const parsed = parseJsonMaybe(report?.personnel)
  return Array.isArray(parsed) ? parsed : []
}

const getReportPersonnelIds = (report: any): string[] => {
  const ids = new Set<string>()
  getReportPersonnelRows(report).forEach((row: any) => {
    ;[
      row?.personId,
      row?.id,
      row?.collaborator_id,
      row?.user_id,
    ].forEach((value) => {
      const id = String(value || '').trim()
      if (id) ids.add(id)
    })
  })
  const parsedIds = parseJsonMaybe(report?.personnel_ids)
  if (Array.isArray(parsedIds)) {
    parsedIds.forEach((value) => {
      const id = String(value || '').trim()
      if (id) ids.add(id)
    })
  }
  return Array.from(ids)
}

const enrichReportPeople = async (supabaseAdmin: any, companyId: string, report: any) => {
  if (!report || typeof report !== 'object') return report
  const supervisorIds = getReportSupervisorIds(report)
  const capatazIds = getReportCapatazIds(report)
  const emitId = String(report?.emitted_by_id || report?.emitido_por_id || '').trim()
  const ids = Array.from(new Set([...supervisorIds, ...capatazIds, emitId].filter(Boolean)))
  if (ids.length === 0) return report

  const map: Record<string, any> = {}
  const upsertRows = (rows: any[]) => {
    ;(rows || []).forEach((r: any) => {
      const keys = [String(r?.id || '').trim(), String(r?.user_id || '').trim(), String(r?.collaborator_id || '').trim()].filter(Boolean)
      keys.forEach((k) => { if (!map[k]) map[k] = r })
    })
  }

  try {
    const { data } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id, user_id, collaborator_id, first_name, last_name, position')
      .eq('company_id', companyId)
      .in('id', ids)
    upsertRows(data || [])
  } catch {}
  const missingAfterId = ids.filter((id) => !map[id])
  if (missingAfterId.length > 0) {
    try {
      const { data } = await supabaseAdmin
        .from('pr_collaborators')
        .select('id, user_id, collaborator_id, first_name, last_name, position')
        .eq('company_id', companyId)
        .in('user_id', missingAfterId)
      upsertRows(data || [])
    } catch {}
  }
  const missingAfterUser = ids.filter((id) => !map[id])
  if (missingAfterUser.length > 0) {
    try {
      const { data } = await supabaseAdmin
        .from('pr_collaborators')
        .select('id, user_id, collaborator_id, first_name, last_name, position')
        .eq('company_id', companyId)
        .in('collaborator_id', missingAfterUser)
      upsertRows(data || [])
    } catch {}
  }

  const supervisors = supervisorIds.map((id) => map[id]).filter(Boolean)
  const capataces = capatazIds.map((id) => map[id]).filter(Boolean)
  const emit = emitId ? map[emitId] : null
  const supervisorNames = supervisors.map((row) => buildPersonName(row)).filter(Boolean)
  const capatazNames = capataces.map((row) => buildPersonName(row)).filter(Boolean)
  const emittedByName = buildPersonName(emit)
  const mergedSupervisor = uniqNames([
    ...splitNames(report?.supervisor),
    ...splitNames(report?.supervisor_name),
    ...splitNames(report?.supervisor_display_name),
    ...supervisorNames
  ]).join(', ')
  const mergedCapataz = uniqNames([
    ...splitNames(report?.capataz),
    ...splitNames(report?.capataz_name),
    ...splitNames(report?.foreman),
    ...capatazNames
  ]).join(', ')

  return {
    ...report,
    supervisor: mergedSupervisor || null,
    capataz: mergedCapataz || null,
    supervisor_name: mergedSupervisor || null,
    capataz_name: mergedCapataz || null,
    emitted_by_name: String(report?.emitted_by_name || '').trim() || emittedByName || null,
    emitted_by_position: String(report?.emitted_by_position || '').trim() || String(emit?.position || '').trim() || null
  }
}

const enrichReportsPeopleBatch = async (
  supabaseAdmin: any,
  companyId: string,
  reports: any[]
) => {
  const list = Array.isArray(reports) ? reports : []
  if (list.length === 0) {
    return { reports: [], uniqueLookupIds: 0, queries: 0 }
  }

  const lookupIds = new Set<string>()
  const lookupDocuments = new Set<string>()
  list.forEach((report: any) => {
    const emitId = String(report?.emitted_by_id || report?.emitido_por_id || '').trim()
    getReportSupervisorIds(report).forEach((id) => lookupIds.add(id))
    getReportCapatazIds(report).forEach((id) => lookupIds.add(id))
    if (emitId) lookupIds.add(emitId)
    getReportPersonnelIds(report).forEach((id) => lookupIds.add(id))
    getReportPersonnelRows(report).forEach((person: any) => {
      const doc = normalizePersonDocument(person?.document || person?.rut || person?.dni)
      if (doc) lookupDocuments.add(doc)
    })
  })

  const ids = Array.from(lookupIds)
  const documents = Array.from(lookupDocuments)

  const mapByAnyKey = new Map<string, any>()
  const mapByDocument = new Map<string, any>()
  const mapByNamePosition = new Map<string, any>()
  const upsertRows = (rows: any[]) => {
    ;(rows || []).forEach((row: any) => {
      const keys = [
        String(row?.id || '').trim(),
        String(row?.user_id || '').trim(),
        String(row?.collaborator_id || '').trim(),
      ].filter(Boolean)
      keys.forEach((key) => {
        if (!mapByAnyKey.has(key)) mapByAnyKey.set(key, row)
      })
      const doc = normalizePersonDocument(row?.document || row?.rut || row?.dni)
      if (doc && !mapByDocument.has(doc)) mapByDocument.set(doc, row)
      const namePositionKey = getPersonLookupNamePositionKey(buildPersonName(row), row?.position)
      if (namePositionKey && !mapByNamePosition.has(namePositionKey)) mapByNamePosition.set(namePositionKey, row)
    })
  }

  let batchQueries = 0
  const collaboratorSelect = 'id, user_id, collaborator_id, first_name, last_name, document, position, specialty, worker_type'

  if (ids.length > 0) {
    const { data: byIdRows } = await supabaseAdmin
      .from('pr_collaborators')
      .select(collaboratorSelect)
      .eq('company_id', companyId)
      .in('id', ids)
    batchQueries += 1
    upsertRows(byIdRows || [])

    const missingAfterId = ids.filter((id) => !mapByAnyKey.has(id))
    if (missingAfterId.length > 0) {
      const { data: byUserRows } = await supabaseAdmin
        .from('pr_collaborators')
        .select(collaboratorSelect)
        .eq('company_id', companyId)
        .in('user_id', missingAfterId)
      batchQueries += 1
      upsertRows(byUserRows || [])
    }

    const missingAfterUser = ids.filter((id) => !mapByAnyKey.has(id))
    if (missingAfterUser.length > 0) {
      const { data: byCollaboratorRows } = await supabaseAdmin
        .from('pr_collaborators')
        .select(collaboratorSelect)
        .eq('company_id', companyId)
        .in('collaborator_id', missingAfterUser)
      batchQueries += 1
      upsertRows(byCollaboratorRows || [])
    }
  }

  if (documents.length > 0) {
    const { data: byDocumentRows } = await supabaseAdmin
      .from('pr_collaborators')
      .select(collaboratorSelect)
      .eq('company_id', companyId)
      .in('document', documents)
    batchQueries += 1
    upsertRows(byDocumentRows || [])
  }

  const fallbackCrewIdsByReport = new Map<any, string[]>()
  const normalizeCrewLookup = (value: any) =>
    normalizeText(String(value || '').trim()).replace(/\s+/g, ' ')

  const directCrewIds = Array.from(new Set(list.flatMap((report: any) => getReportCrewIds(report))))
  const reportsWithCrewName = list.filter((report: any) => getReportCrewNames(report).length > 0)
  if (reportsWithCrewName.length > 0) {
    const dates = Array.from(new Set(
      reportsWithCrewName
        .map((report: any) => String(report?.date || report?.report_date || '').slice(0, 10))
        .filter(Boolean)
    ))
    if (dates.length > 0) {
      try {
        const { data: crewRows } = await supabaseAdmin
          .from('pr_crews')
          .select('id, name, work_date')
          .eq('company_id', companyId)
          .in('work_date', dates)
        batchQueries += 1
        const crewsByDateName = new Map<string, string[]>()
        ;(crewRows || []).forEach((crew: any) => {
          const key = `${String(crew?.work_date || '').slice(0, 10)}::${normalizeCrewLookup(crew?.name)}`
          const id = String(crew?.id || '').trim()
          if (!key || !id) return
          const listForKey = crewsByDateName.get(key) || []
          listForKey.push(id)
          crewsByDateName.set(key, listForKey)
        })
        reportsWithCrewName.forEach((report: any) => {
          const dateKey = String(report?.date || report?.report_date || '').slice(0, 10)
          const idsForReport = getReportCrewNames(report)
            .flatMap((crewName) => crewsByDateName.get(`${dateKey}::${normalizeCrewLookup(crewName)}`) || [])
          if (idsForReport.length > 0) fallbackCrewIdsByReport.set(report, idsForReport)
        })
      } catch {
        // Keep report enrichment working even if crew-name fallback is unavailable.
      }
    }
  }
  const getCrewIdsForReport = (report: any) =>
    Array.from(new Set([...getReportCrewIds(report), ...(fallbackCrewIdsByReport.get(report) || [])]))

  const crewIds = Array.from(new Set([...directCrewIds, ...Array.from(fallbackCrewIdsByReport.values()).flat()]))
  const crewResponsibleByCrewId = new Map<string, { supervisors: string[]; capataces: string[]; people: any[] }>()
  if (crewIds.length > 0) {
    const addCrewResponsibleId = (
      crewId: any,
      collaboratorId: any,
      role: 'supervisor' | 'capataz',
      collaboratorById: Map<string, any>
    ) => {
      const cid = String(crewId || '').trim()
      const id = String(collaboratorId || '').trim()
      const collaborator = collaboratorById.get(id)
      const name = buildPersonName(collaborator)
      if (!cid || !name) return
      if (!crewResponsibleByCrewId.has(cid)) {
        crewResponsibleByCrewId.set(cid, { supervisors: [], capataces: [], people: [] })
      }
      const target = crewResponsibleByCrewId.get(cid)!
      if (role === 'supervisor' && !target.supervisors.includes(name)) target.supervisors.push(name)
      if (role === 'capataz' && !target.capataces.includes(name)) target.capataces.push(name)
      const personId = String(collaborator?.id || id || '').trim()
      const personKey = `${role}:${personId || normalizeText(name)}`
      if (!target.people.some((p: any) => String(p?.personKey || '') === personKey)) {
        target.people.push({
          personKey,
          personId,
          id: personId,
          collaborator_id: String(collaborator?.collaborator_id || '').trim() || undefined,
          user_id: String(collaborator?.user_id || '').trim() || undefined,
          name,
          document: String(collaborator?.document || '').trim(),
          position: String(collaborator?.position || (role === 'supervisor' ? 'Supervisor' : 'Capataz')).trim(),
          worker_type: String(collaborator?.worker_type || 'INDIRECTO').trim(),
          role,
        })
      }
    }

    try {
      const explicitByCrew = new Map<string, { supervisors: string[]; capataces: string[] }>()
      const ensureExplicit = (crewId: string) => {
        if (!explicitByCrew.has(crewId)) explicitByCrew.set(crewId, { supervisors: [], capataces: [] })
        return explicitByCrew.get(crewId)!
      }
      const readIds = (...values: any[]) => values.flatMap((value) => {
        if (Array.isArray(value)) return value
        if (value == null || value === '') return []
        return [value]
      }).map((value) => String(value || '').trim()).filter(Boolean)

      try {
        const { data: crewRows } = await supabaseAdmin
          .from('pr_crews')
          .select('id, supervisors, foremen, supervisor, foreman')
          .eq('company_id', companyId)
          .in('id', crewIds)
        batchQueries += 1
        ;(crewRows || []).forEach((crew: any) => {
          const crewId = String(crew?.id || '').trim()
          if (!crewId) return
          const slot = ensureExplicit(crewId)
          readIds(crew?.supervisors, crew?.supervisor).forEach((id) => {
            if (!slot.supervisors.includes(id)) slot.supervisors.push(id)
          })
          readIds(crew?.foremen, crew?.foreman).forEach((id) => {
            if (!slot.capataces.includes(id)) slot.capataces.push(id)
          })
        })
      } catch {
        // Some schemas may not keep legacy role arrays on pr_crews.
      }

      let crewMemberRows: any[] = []
      try {
        const { data } = await supabaseAdmin
          .from('pr_crew_members')
          .select('crew_id, role, collaborator_id')
          .in('crew_id', crewIds)
        batchQueries += 1
        crewMemberRows = data || []
      } catch {
        const { data } = await supabaseAdmin
          .from('pr_crew_members')
          .select('crew_id, collaborator_id')
          .in('crew_id', crewIds)
        batchQueries += 1
        crewMemberRows = data || []
      }

      const collaboratorIds = Array.from(new Set([
        ...Array.from(explicitByCrew.values()).flatMap((item) => [...item.supervisors, ...item.capataces]),
        ...(crewMemberRows || []).map((member: any) => String(member?.collaborator_id || '').trim())
      ].filter(Boolean)))
      const collaboratorById = new Map<string, any>()
      if (collaboratorIds.length > 0) {
        const { data: collaboratorRows } = await supabaseAdmin
          .from('pr_collaborators')
          .select(collaboratorSelect)
          .eq('company_id', companyId)
          .in('id', collaboratorIds)
        batchQueries += 1
        ;(collaboratorRows || []).forEach((row: any) => {
          const id = String(row?.id || '').trim()
          if (id) collaboratorById.set(id, row)
        })
      }

      explicitByCrew.forEach((item, crewId) => {
        item.supervisors.forEach((id) => addCrewResponsibleId(crewId, id, 'supervisor', collaboratorById))
        item.capataces.forEach((id) => addCrewResponsibleId(crewId, id, 'capataz', collaboratorById))
      })

      ;(crewMemberRows || []).forEach((member: any) => {
        const crewId = String(member?.crew_id || '').trim()
        const collaboratorId = String(member?.collaborator_id || '').trim()
        const collaborator = collaboratorById.get(collaboratorId)
        const role = String(member?.role || '').toLowerCase()
        const position = collaborator?.position
        const isSupervisor = role === 'supervisor' || isSupervisorPosition(position)
        const isCapataz = role === 'foreman' || role === 'capataz' || isCapatazPosition(position)
        if (isSupervisor) addCrewResponsibleId(crewId, collaboratorId, 'supervisor', collaboratorById)
        if (isCapataz) addCrewResponsibleId(crewId, collaboratorId, 'capataz', collaboratorById)
      })
    } catch {
      // Keep list loading even if optional crew responsible enrichment fails.
    }
  }

  const enriched = list.map((report: any) => {
    const supervisorIds = getReportSupervisorIds(report)
    const capatazIds = getReportCapatazIds(report)
    const emitId = String(report?.emitted_by_id || report?.emitido_por_id || '').trim()

    const supervisors = supervisorIds.map((id) => mapByAnyKey.get(id)).filter(Boolean)
    const capataces = capatazIds.map((id) => mapByAnyKey.get(id)).filter(Boolean)
    const emit = emitId ? mapByAnyKey.get(emitId) : null

    const supervisorNames = supervisors.map((row) => buildPersonName(row)).filter(Boolean)
    const capatazNames = capataces.map((row) => buildPersonName(row)).filter(Boolean)
    const emittedByName = buildPersonName(emit)
    const addResponsiblePerson = (people: any[], collaborator: any, role: 'supervisor' | 'capataz') => {
      const name = buildPersonName(collaborator)
      if (!name) return people
      const personId = String(collaborator?.id || '').trim()
      const personKey = `${role}:${personId || normalizeText(name)}`
      if (people.some((p: any) => String(p?.personKey || '') === personKey || normalizeText(p?.name) === normalizeText(name))) {
        return people
      }
      return [
        ...people,
        {
          personKey,
          personId,
          id: personId,
          collaborator_id: String(collaborator?.collaborator_id || '').trim() || undefined,
          user_id: String(collaborator?.user_id || '').trim() || undefined,
          name,
          document: String(collaborator?.document || '').trim(),
          position: String(collaborator?.position || (role === 'supervisor' ? 'Supervisor' : 'Capataz')).trim(),
          worker_type: String(collaborator?.worker_type || 'INDIRECTO').trim(),
          role,
        },
      ]
    }
    const crewResponsible = getCrewIdsForReport(report).reduce((acc, crewId) => {
      const item = crewResponsibleByCrewId.get(crewId)
      if (!item) return acc
      item.supervisors.forEach((name) => { if (!acc.supervisors.includes(name)) acc.supervisors.push(name) })
      item.capataces.forEach((name) => { if (!acc.capataces.includes(name)) acc.capataces.push(name) })
      item.people.forEach((person: any) => {
        const key = String(person?.personKey || person?.personId || person?.name || '').trim()
        if (key && !acc.people.some((p: any) => String(p?.personKey || p?.personId || p?.name || '').trim() === key)) {
          acc.people.push(person)
        }
      })
      return acc
    }, { supervisors: [] as string[], capataces: [] as string[], people: [] as any[] })
    supervisors.forEach((supervisor) => {
      crewResponsible.people = addResponsiblePerson(crewResponsible.people, supervisor, 'supervisor')
    })
    capataces.forEach((capataz) => {
      crewResponsible.people = addResponsiblePerson(crewResponsible.people, capataz, 'capataz')
    })
    const crewSupervisorName = crewResponsible.supervisors.join(', ')
    const crewCapatazName = crewResponsible.capataces.join(', ')
    const mergedSupervisor = uniqNames([
      ...splitNames(report?.supervisor),
      ...splitNames(report?.supervisor_name),
      ...splitNames(report?.supervisor_display_name),
      ...supervisorNames,
      ...splitNames(crewSupervisorName)
    ]).join(', ')
    const mergedCapataz = uniqNames([
      ...splitNames(report?.capataz),
      ...splitNames(report?.capataz_name),
      ...splitNames(report?.foreman),
      ...capatazNames,
      ...splitNames(crewCapatazName)
    ]).join(', ')
    const personnelRows = getReportPersonnelRows(report)
    const enrichedPersonnel = personnelRows.map((person: any) => {
      const candidateIds = [
        person?.personId,
        person?.id,
        person?.collaborator_id,
        person?.user_id,
      ].map((value) => String(value || '').trim()).filter(Boolean)
      const doc = normalizePersonDocument(person?.document || person?.rut || person?.dni)
      const namePositionKey = getPersonLookupNamePositionKey(
        getPersonNameFromReportRow(person),
        person?.position || person?.role || person?.cargo
      )
      const collaborator =
        candidateIds.map((id) => mapByAnyKey.get(id)).find(Boolean) ||
        (doc ? mapByDocument.get(doc) : null) ||
        (namePositionKey ? mapByNamePosition.get(namePositionKey) : null)
      if (!collaborator) return person
      return {
        ...person,
        position: person?.position || person?.role || collaborator?.position || '',
        role: person?.role || person?.position || collaborator?.position || '',
        specialty: person?.specialty || collaborator?.specialty || '',
        worker_type: person?.worker_type || collaborator?.worker_type || '',
      }
    })

    return {
      ...report,
      personnel: enrichedPersonnel,
      responsible_personnel: crewResponsible.people,
      supervisor: mergedSupervisor || null,
      capataz: mergedCapataz || null,
      supervisor_name: mergedSupervisor || null,
      capataz_name: mergedCapataz || null,
      emitted_by_name: String(report?.emitted_by_name || '').trim() || emittedByName || null,
      emitted_by_position: String(report?.emitted_by_position || '').trim() || String(emit?.position || '').trim() || null
    }
  })

  return { reports: enriched, uniqueLookupIds: ids.length, queries: batchQueries }
}

const normalizeCrewIdsForValidation = (payload: any): string[] => {
  const ids = Array.isArray(payload?.crew_ids)
    ? payload.crew_ids.map((x: any) => String(x)).filter(Boolean)
    : (payload?.crew_id ? [String(payload.crew_id)] : [])
  return Array.from(new Set(ids))
}

const hasDateCrewCollision = async (
  supabaseAdmin: any,
  companyId: string,
  date: string,
  crewIds: string[],
  excludeReportId?: string
): Promise<boolean> => {
  if (!companyId || !date || !Array.isArray(crewIds) || crewIds.length === 0) return false
  let q = supabaseAdmin
    .from('pr_field_reports')
    .select('id, crew_id, crew_ids')
    .eq('company_id', companyId)
    .eq('date', date)
  if (excludeReportId) q = q.neq('id', excludeReportId)
  const { data, error } = await q
  if (error) throw new Error(error.message || 'Error validating field report date/crew collision')
  const used = new Set<string>()
  ;(data || []).forEach((r: any) => {
    if (r?.crew_id) used.add(String(r.crew_id))
    if (Array.isArray(r?.crew_ids)) r.crew_ids.forEach((id: any) => used.add(String(id)))
  })
  return crewIds.some((id) => used.has(String(id)))
}

const getMissingColumnName = (errorMsg: string) => {
  const patterns = [
    /column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i,
    /Could not find the '([a-zA-Z0-9_]+)' column/i,
    /Could not find column '([a-zA-Z0-9_]+)'/i,
    /Could not find the ['"]([^'"]+)['"] column/i,
    /Could not find column ['"]([^'"]+)['"]/i
  ]
  for (const re of patterns) {
    const m = errorMsg.match(re)
    if (m && m[1]) return m[1]
  }
  return null
}

const stripMissingColumn = (payload: Record<string, any>, errorMsg: string) => {
  const missing = getMissingColumnName(errorMsg)
  if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
    const copy = { ...payload }
    delete copy[missing]
    return copy
  }
  return null
}

const stripMissingSelectColumn = (select: string, errorMsg: string) => {
  const patterns = [
    /column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i,
    /Could not find the '([a-zA-Z0-9_]+)' column/i,
    /Could not find column '([a-zA-Z0-9_]+)'/i,
    /Could not find the ['"]([^'"]+)['"] column/i,
    /Could not find column ['"]([^'"]+)['"]/i
  ]
  const missing = patterns
    .map((re) => errorMsg.match(re)?.[1])
    .find(Boolean)
  if (!missing) return null
  const next = select
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part !== missing)
  return next.length === select.split(',').length ? null : next.join(', ')
}

const stripMissingTable = (errorMsg: string) => {
  const relationMissing = /relation\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i.test(errorMsg)
  const schemaCacheMissing = /Could not find the table/i.test(errorMsg)
  return relationMissing || schemaCacheMissing
}

const parseJsonArray = (value: any): any[] => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const getReportEvidenceKeys = (report: any): string[] => {
  const rows = [
    ...parseJsonArray(report?.activities),
    ...parseJsonArray(report?.assignments)
  ]
  const keys = new Set<string>()
  rows.forEach((row: any) => {
    const files = Array.isArray(row?.evidence_files) ? row.evidence_files : []
    files.forEach((file: any) => {
      const key = String(file?.key || '').trim()
      if (key) keys.add(key)
    })
  })
  return Array.from(keys)
}

const getPayloadEvidenceKeys = (body: any): string[] => {
  const rows = [
    ...parseJsonArray(body?.activities),
    ...parseJsonArray(body?.assignments)
  ]
  const keys = new Set<string>()
  rows.forEach((row: any) => {
    const files = Array.isArray(row?.evidence_files) ? row.evidence_files : []
    files.forEach((file: any) => {
      const key = String(file?.key || '').trim()
      if (key) keys.add(key)
    })
  })
  return Array.from(keys)
}

const deleteEvidenceKeysFromR2 = async (companyId: string, keys: string[]) => {
  if (!companyId || !Array.isArray(keys) || keys.length === 0) return { attempted: 0, deleted: 0, failed: [] as string[] }
  const bucket = process.env.R2_BUCKET_NAME
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 environment variables are missing')
  }

  const expectedPrefix = `field-reports/${companyId}/`
  const toDelete = keys.filter((key) => String(key || '').startsWith(expectedPrefix))
  const failed: string[] = []
  let deleted = 0

  for (const key of toDelete) {
    try {
      const signed = createR2PresignedUrl({
        method: 'DELETE',
        bucket,
        accountId,
        key,
        accessKeyId,
        secretAccessKey,
        expiresInSeconds: 120
      })
      const res = await fetch(signed.url, { method: 'DELETE' })
      if (!res.ok) {
        failed.push(key)
        continue
      }
      deleted += 1
    } catch {
      failed.push(key)
    }
  }

  return { attempted: toDelete.length, deleted, failed }
}

const saveFieldReportVersion = async (params: {
  supabaseAdmin: any
  companyId: string
  reportId: string
  editedBy: string | null
  previousData: any
  newData: any
}) => {
  const { supabaseAdmin, companyId, reportId, editedBy, previousData, newData } = params
  const { count } = await supabaseAdmin
    .from('pr_field_reports_versions')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('field_report_id', reportId)

  const versionNo = Number(count || 0) + 1
  let versionPayload: Record<string, any> = {
    company_id: companyId,
    field_report_id: reportId,
    version_no: versionNo,
    edited_by: editedBy,
    previous_data: previousData,
    new_data: newData
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabaseAdmin
      .from('pr_field_reports_versions')
      .insert(versionPayload)
    if (!error) return { saved: true, skipped: false, reason: null as string | null }

    const msg = String((error as any)?.message || error)
    if (stripMissingTable(msg)) return { saved: false, skipped: true, reason: 'missing_versions_table' as const }
    const trimmed = stripMissingColumn(versionPayload, msg)
    if (trimmed) {
      versionPayload = trimmed
      continue
    }
    console.error('❌ Error saving field report version:', error)
    return { saved: false, skipped: true, reason: 'insert_error' as const }
  }

  return { saved: false, skipped: true, reason: 'retries_exhausted' as const }
}

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
  return normalized
    .split(/[,;/|]+/)
    .map((x) => normalizeText(x))
    .filter(Boolean)
}

const specialtyMatches = (reportSpecialty: any, userSpecialty: string) => {
  const userNorm = normalizeCandidateSpecialty(userSpecialty)
  if (!userNorm) return false
  const reportNorm = normalizeCandidateSpecialty(reportSpecialty)
  if (!reportNorm) return false
  const reportTokens = splitSpecialtyTokens(reportSpecialty)
  if (reportTokens.includes(userNorm)) return true
  if (reportNorm.includes(userNorm) || userNorm.includes(reportNorm)) return true
  return false
}

const resolveUserSpecialty = async (supabaseAdmin: any, session: any) => {
  const fromSession = normalizeCandidateSpecialty(session?.user?.specialty)
  if (fromSession) return fromSession
  const userId = session?.user?.id
  const companyId = session?.user?.companyId
  if (!userId || !companyId) return ''

  try {
    const { data: byUserId } = await supabaseAdmin
      .from('pr_collaborators')
      .select('specialty, especialidad')
      .eq('user_id', String(userId))
      .eq('company_id', String(companyId))
      .maybeSingle()
    const fromUserId = normalizeCandidateSpecialty((byUserId as any)?.specialty || (byUserId as any)?.especialidad)
    if (fromUserId) return fromUserId
  } catch {}

  return ''
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await resolveCurrentActor(session)
    void actor
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role for field reports' }, { status: 403 })

    const body = await req.json()
    const supabaseAdmin = getSupabaseAdmin()
    const crewIdsForValidation = normalizeCrewIdsForValidation(body)
    const dateForValidation = String(body?.date || '').trim()
    if (dateForValidation && crewIdsForValidation.length > 0) {
      const collides = await hasDateCrewCollision(
        supabaseAdmin,
        String(session.user.companyId),
        dateForValidation,
        crewIdsForValidation
      )
      if (collides) {
        return NextResponse.json(
          { error: 'La cuadrilla seleccionada ya tiene un reporte en esa fecha.' },
          { status: 409 }
        )
      }
    }

    const toText = (val: any) => {
      if (val === undefined) return null
      if (typeof val === 'string') return val
      try { return JSON.stringify(val) } catch { return String(val) }
    }
    const workFront = body.work_front !== undefined && body.work_front !== '' ? String(body.work_front) : ''
    const resolvedReportFront = await resolveReportFrontNumberAndTitle({
      supabaseAdmin,
      companyId: String(session.user.companyId),
      front: workFront,
      date: String(body?.date || ''),
      provided: body?.report_sequence_no,
      workFrontId: body?.work_front_id,
    })
    const reportSequenceNo = resolvedReportFront.reportSequenceNo
    const reportTitle = resolvedReportFront.reportTitle
    const resolvedWorkFrontId = resolvedReportFront.workFrontId
    const resolvedWorkFront = resolvedReportFront.workFrontName || workFront

    const payload: Record<string, any> = {
      company_id: session.user.companyId,
      design_version: body.design_version !== undefined && body.design_version !== '' ? String(body.design_version).toUpperCase() : 'V1',
      emitted_by_id: body.emitted_by_id !== undefined && body.emitted_by_id !== '' ? body.emitted_by_id : null,
      date: body.date !== undefined ? body.date : null,
      report_sequence_no: reportSequenceNo,
      report_title: reportTitle,
      supervisor_id: body.supervisor_id !== undefined ? body.supervisor_id : null,
      capataz_id: body.capataz_id !== undefined ? body.capataz_id : null,
      specialty: body.specialty !== undefined && body.specialty !== '' ? body.specialty : null,
      work_front_id: resolvedWorkFrontId,
      work_front: resolvedWorkFront || null,
      crew_id: body.crew_id !== undefined ? body.crew_id : null,
      crew_ids: body.crew_ids !== undefined ? body.crew_ids : null,
      crew_name: body.crew_name !== undefined && body.crew_name !== '' ? body.crew_name : null,
      field_boss_name: body.field_boss_name !== undefined && body.field_boss_name !== '' ? body.field_boss_name : null,
      field_boss_phone: body.field_boss_phone !== undefined && body.field_boss_phone !== '' ? body.field_boss_phone : null,
      weather: body.weather !== undefined ? toText(body.weather) : null,
      turno: body.turno !== undefined && body.turno !== '' ? body.turno : null,
      area: body.area !== undefined && body.area !== '' ? body.area : null,
      start_time: body.start_time !== undefined && body.start_time !== '' ? body.start_time : null,
      end_time: body.end_time !== undefined && body.end_time !== '' ? body.end_time : null,
      activities: body.activities !== undefined ? toText(body.activities) : null,
      assignments: body.assignments !== undefined ? body.assignments : null,
      restrictions: body.restrictions !== undefined && body.restrictions !== '' ? body.restrictions : null,
      personnel: body.personnel !== undefined ? body.personnel : null,
      personnel_ids: body.personnel_ids !== undefined ? body.personnel_ids : null,
      person_hours: body.person_hours !== undefined ? body.person_hours : null,
      equipment_entries: body.equipment_entries !== undefined ? body.equipment_entries : null,
      equipment_hours: body.equipment_hours !== undefined ? body.equipment_hours : null,
      material_entries: body.material_entries !== undefined ? body.material_entries : null,
      material_quantities: body.material_quantities !== undefined ? body.material_quantities : null,
      activity_observations: body.activity_observations !== undefined ? body.activity_observations : null,
      general_events_answers: body.general_events_answers !== undefined ? body.general_events_answers : null,
      general_events_comments: body.general_events_comments !== undefined ? body.general_events_comments : null
    }

    let insertPayload = { ...payload }
    const omittedFields = new Set<string>()
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await supabaseAdmin.from('pr_field_reports').insert(insertPayload).select().single()
      if (!error) {
        await persistNextReportFrontSequence(
          supabaseAdmin,
          String(session.user.companyId),
          resolvedWorkFrontId,
          resolvedReportFront.nextSequenceNoToPersist
        )
        return NextResponse.json({ ...data, _saved_fields: Object.keys(insertPayload), _omitted_fields: Array.from(omittedFields) })
      }
      const msg = (error && (error as any).message) ? String((error as any).message) : JSON.stringify(error)
      const missing = getMissingColumnName(msg)
      const trimmed = stripMissingColumn(insertPayload, msg)
      if (trimmed) {
        if (missing) omittedFields.add(missing)
        insertPayload = trimmed
        continue
      }
      console.error('❌ Error al guardar en Supabase:', error)
      return NextResponse.json({ error: msg, details: error }, { status: 500 })
    }

    return NextResponse.json({ error: 'Could not insert report after retries' }, { status: 500 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })
    const supabaseAdmin = getSupabaseAdmin()
    const role = String(session?.user?.role || '').toLowerCase()
    const id = req.nextUrl.searchParams.get('id')
    const historyReportId = req.nextUrl.searchParams.get('history_report_id')
    const crewId = req.nextUrl.searchParams.get('crewId')
    const date = String(req.nextUrl.searchParams.get('date') || '').slice(0, 10)
    const dateFrom = String(req.nextUrl.searchParams.get('date_from') || '').slice(0, 10)
    const dateTo = String(req.nextUrl.searchParams.get('date_to') || '').slice(0, 10)
    const summary = req.nextUrl.searchParams.get('summary') === '1'
    const slim = req.nextUrl.searchParams.get('slim') === '1'
    const datesOnly = req.nextUrl.searchParams.get('dates') === '1'
    const includeCalc = req.nextUrl.searchParams.get('include_calc') === '1'
    const hoursSummary = req.nextUrl.searchParams.get('hours_summary') === '1'
    const limitParam = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 100
    const userSpecialty = role === 'user' ? await resolveUserSpecialty(supabaseAdmin, session) : ''

    if (datesOnly) {
      let q = supabaseAdmin
        .from('pr_field_reports')
        .select('id, date, specialty')
        .eq('company_id', session.user.companyId)
        .order('date', { ascending: false })
        .limit(5000)
      if (crewId) {
        q = q.or(`crew_id.eq.${crewId},crew_ids.cs.{${crewId}}`)
      }
      const { data, error } = await q
      if (error) {
        return NextResponse.json({
          error: String(error?.message || error),
          code: String(error?.code || ''),
          details: String(error?.details || ''),
          hint: String(error?.hint || '')
        }, { status: 500 })
      }
      const rows = Array.isArray(data) ? data : []
      const visibleRows = role === 'user' && userSpecialty
        ? rows.filter((r: any) => {
            const raw = normalizeCandidateSpecialty(r?.specialty)
            if (!raw) return true
            return specialtyMatches(r?.specialty, userSpecialty)
          })
        : rows
      const dates = Array.from(new Set(
        visibleRows
          .map((row: any) => String(row?.date || '').slice(0, 10))
          .filter((day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day))
      )).sort((a, b) => b.localeCompare(a))
      return NextResponse.json({ dates })
    }

    if (hoursSummary) {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: 'Missing or invalid date for hours_summary' }, { status: 400 })
      }
      let q = supabaseAdmin
        .from('pr_field_reports')
        .select(FIELD_REPORT_HOURS_SUMMARY_SELECT)
        .eq('company_id', session.user.companyId)
        .eq('date', date)
        .order('created_at', { ascending: false })
        .limit(200)
      if (crewId) {
        q = q.or(`crew_id.eq.${crewId},crew_ids.cs.{${crewId}}`)
      }
      const { data, error } = await q
      if (error) {
        return NextResponse.json({
          error: String(error?.message || error),
          code: String(error?.code || ''),
          details: String(error?.details || ''),
          hint: String(error?.hint || '')
        }, { status: 500 })
      }
      const rows = Array.isArray(data) ? data : []
      if (role === 'user' && userSpecialty) {
        const filtered = rows.filter((r: any) => {
          const raw = normalizeCandidateSpecialty(r?.specialty)
          if (!raw) return true
          return specialtyMatches(r?.specialty, userSpecialty)
        })
        return NextResponse.json(filtered)
      }
      return NextResponse.json(rows)
    }

    if (historyReportId) {
      if (role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { data, error } = await supabaseAdmin
        .from('pr_field_reports_versions')
        .select('id, field_report_id, version_no, edited_by, previous_data, new_data, created_at')
        .eq('company_id', session.user.companyId)
        .eq('field_report_id', historyReportId)
        .order('version_no', { ascending: false })
      if (error) return NextResponse.json({ error: String(error) }, { status: 500 })
      return NextResponse.json(data || [])
    }

    const listSelect = summary
      ? (slim ? FIELD_REPORT_LIST_SLIM_SELECT : (includeCalc ? FIELD_REPORT_DAILY_SUMMARY_SELECT : FIELD_REPORT_LIST_SUMMARY_SELECT))
      : '*'
    const buildReportQuery = (select: string) => {
      let query = supabaseAdmin
        .from('pr_field_reports')
        .select(select)
        .eq('company_id', session.user.companyId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (crewId) {
        query = query.or(`crew_id.eq.${crewId},crew_ids.cs.{${crewId}}`)
      }
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        query = query.eq('date', date)
      } else {
        if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
          query = query.gte('date', dateFrom)
        }
        if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
          query = query.lte('date', dateTo)
        }
      }
      return query
    }

    const q = supabaseAdmin
      .from('pr_field_reports')
      .select(id ? '*' : listSelect)
      .eq('company_id', session.user.companyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (id) {
      const { data, error } = await q.eq('id', id).single()
      if (error) return NextResponse.json({ error: String(error) }, { status: 500 })
      const enriched = await enrichReportPeople(supabaseAdmin, String(session.user.companyId), data)
      return NextResponse.json(enriched)
    }

    let activeSelect = listSelect
    let data: any[] | null = null
    let error: any = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await buildReportQuery(activeSelect)
      data = result.data as any[] | null
      error = result.error
      if (!error) break
      if (!summary) break
      const nextSelect = stripMissingSelectColumn(activeSelect, String(error?.message || error))
      if (!nextSelect || nextSelect === activeSelect) break
      activeSelect = nextSelect
    }
    if (summary && error) {
      const fallbackSelects = slim
        ? [
            'id, company_id, date, created_at, area, work_front, crew_id, crew_ids, crew_name, supervisor_id, capataz_id, start_time, end_time, specialty',
            'id, company_id, date, created_at, area, work_front, crew_id, crew_name, supervisor_id, capataz_id',
            'id, company_id, date, created_at, area, work_front, crew_id, crew_name',
            'id, company_id, date, created_at',
            'id, company_id'
          ]
        : includeCalc ? [
            'id, company_id, design_version, emitted_by_id, date, report_sequence_no, report_title, supervisor_id, capataz_id, specialty, work_front, crew_id, crew_ids, crew_name, weather, turno, area, start_time, end_time, activities, assignments, created_at, personnel, personnel_ids, person_hours, equipment_entries, equipment_hours',
            'id, company_id, date, created_at, area, work_front, crew_id, crew_ids, crew_name, supervisor_id, capataz_id, start_time, end_time, activities, assignments, specialty, personnel, personnel_ids, person_hours, equipment_entries, equipment_hours',
            'id, company_id, date, created_at, area, work_front, crew_id, crew_name, supervisor_id, capataz_id, activities, assignments, personnel_ids, person_hours, equipment_entries, equipment_hours',
            'id, company_id, date, created_at, area, work_front, crew_id, crew_name, supervisor_id, capataz_id, activities, assignments, person_hours, equipment_entries, equipment_hours',
          ] : [
            'id, company_id, date, created_at, area, work_front, crew_id, crew_ids, crew_name, supervisor_id, capataz_id, start_time, end_time, activities, assignments, specialty',
            'id, company_id, date, created_at, area, work_front, crew_id, crew_name, supervisor_id, capataz_id, activities, assignments',
            'id, company_id, date, created_at, area, work_front, crew_id, crew_name',
            'id, company_id, date, created_at',
            'id, company_id'
          ]
      for (const fallbackSelect of fallbackSelects) {
        let candidateSelect = fallbackSelect
        for (let attempt = 0; attempt < 40; attempt++) {
          const result = await buildReportQuery(candidateSelect)
          data = result.data as any[] | null
          error = result.error
          if (!error) {
            activeSelect = candidateSelect
            break
          }
          const nextSelect = stripMissingSelectColumn(candidateSelect, String(error?.message || error))
          if (!nextSelect || nextSelect === candidateSelect) break
          candidateSelect = nextSelect
        }
        if (!error) break
      }
    }
    if (error) {
      return NextResponse.json({
        error: String(error?.message || error),
        code: String(error?.code || ''),
        details: String(error?.details || ''),
        hint: String(error?.hint || '')
      }, { status: 500 })
    }
    const listRows = Array.isArray(data) ? data : []
    if (role === 'user') {
      // If user specialty is missing, avoid hiding all reports.
      if (!userSpecialty) {
        const batch = await enrichReportsPeopleBatch(supabaseAdmin, String(session.user.companyId), listRows)
        const enriched = batch.reports
        return NextResponse.json(enriched)
      }
      // Keep specialty filter, but do not exclude reports with empty specialty.
      const filtered = listRows.filter((r: any) => {
        const raw = normalizeCandidateSpecialty(r?.specialty)
        if (!raw) return true
        return specialtyMatches(r?.specialty, userSpecialty)
      })
      const batch = await enrichReportsPeopleBatch(supabaseAdmin, String(session.user.companyId), filtered)
      const enriched = batch.reports
      return NextResponse.json(enriched)
    }
    const batch = await enrichReportsPeopleBatch(supabaseAdmin, String(session.user.companyId), listRows)
    const enriched = batch.reports
    return NextResponse.json(enriched)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await resolveCurrentActor(session)
    void actor
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role for field reports' }, { status: 403 })
    const body = await req.json()
    const id = body.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const crewIdsForValidation = normalizeCrewIdsForValidation(body)
    const dateForValidation = String(body?.date || '').trim()
    if (dateForValidation && crewIdsForValidation.length > 0) {
      const collides = await hasDateCrewCollision(
        supabaseAdmin,
        String(session.user.companyId),
        dateForValidation,
        crewIdsForValidation,
        String(id)
      )
      if (collides) {
        return NextResponse.json(
          { error: 'La cuadrilla seleccionada ya tiene un reporte en esa fecha.' },
          { status: 409 }
        )
      }
    }

    const toText = (val: any) => {
      if (val === undefined) return null
      if (typeof val === 'string') return val
      try { return JSON.stringify(val) } catch { return String(val) }
    }
    const { data: previousReport } = await supabaseAdmin
      .from('pr_field_reports')
      .select('*')
      .eq('id', id)
      .eq('company_id', session.user.companyId)
      .single()
    if (!previousReport) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 })
    const workFront = body.work_front !== undefined && body.work_front !== '' ? String(body.work_front) : ''
    const resolvedReportFront = await resolveReportFrontNumberAndTitle({
      supabaseAdmin,
      companyId: String(session.user.companyId),
      front: workFront,
      date: String(body?.date || ''),
      provided: body?.report_sequence_no,
      workFrontId: body?.work_front_id,
      excludeReportId: String(id),
    })
    const reportSequenceNo = resolvedReportFront.reportSequenceNo
    const reportTitle = resolvedReportFront.reportTitle
    const resolvedWorkFrontId = resolvedReportFront.workFrontId
    const resolvedWorkFront = resolvedReportFront.workFrontName || workFront

    const payload: Record<string, any> = {
      design_version: body.design_version !== undefined && body.design_version !== '' ? String(body.design_version).toUpperCase() : 'V1',
      emitted_by_id: body.emitted_by_id !== undefined && body.emitted_by_id !== '' ? body.emitted_by_id : null,
      date: body.date !== undefined ? body.date : null,
      report_sequence_no: reportSequenceNo,
      report_title: reportTitle,
      supervisor_id: body.supervisor_id !== undefined ? body.supervisor_id : null,
      capataz_id: body.capataz_id !== undefined ? body.capataz_id : null,
      specialty: body.specialty !== undefined && body.specialty !== '' ? body.specialty : null,
      work_front_id: resolvedWorkFrontId,
      work_front: resolvedWorkFront || null,
      crew_id: body.crew_id !== undefined ? body.crew_id : null,
      crew_ids: body.crew_ids !== undefined ? body.crew_ids : null,
      crew_name: body.crew_name !== undefined && body.crew_name !== '' ? body.crew_name : null,
      field_boss_name: body.field_boss_name !== undefined && body.field_boss_name !== '' ? body.field_boss_name : null,
      field_boss_phone: body.field_boss_phone !== undefined && body.field_boss_phone !== '' ? body.field_boss_phone : null,
      weather: body.weather !== undefined ? toText(body.weather) : null,
      turno: body.turno !== undefined && body.turno !== '' ? body.turno : null,
      area: body.area !== undefined && body.area !== '' ? body.area : null,
      start_time: body.start_time !== undefined && body.start_time !== '' ? body.start_time : null,
      end_time: body.end_time !== undefined && body.end_time !== '' ? body.end_time : null,
      activities: body.activities !== undefined ? toText(body.activities) : null,
      assignments: body.assignments !== undefined ? body.assignments : null,
      restrictions: body.restrictions !== undefined && body.restrictions !== '' ? body.restrictions : null,
      personnel: body.personnel !== undefined ? body.personnel : null,
      personnel_ids: body.personnel_ids !== undefined ? body.personnel_ids : null,
      person_hours: body.person_hours !== undefined ? body.person_hours : null,
      equipment_entries: body.equipment_entries !== undefined ? body.equipment_entries : null,
      equipment_hours: body.equipment_hours !== undefined ? body.equipment_hours : null,
      material_entries: body.material_entries !== undefined ? body.material_entries : null,
      material_quantities: body.material_quantities !== undefined ? body.material_quantities : null,
      activity_observations: body.activity_observations !== undefined ? body.activity_observations : null,
      general_events_answers: body.general_events_answers !== undefined ? body.general_events_answers : null,
      general_events_comments: body.general_events_comments !== undefined ? body.general_events_comments : null
    }

    let updatePayload = { ...payload }
    const omittedFields = new Set<string>()
    let lastErrorMsg = ''
    let lastErrorDetails: any = null
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await supabaseAdmin
        .from('pr_field_reports')
        .update(updatePayload)
        .eq('id', id)
        .eq('company_id', session.user.companyId)
        .select()
        .single()
      if (!error) {
        const previousKeys = getReportEvidenceKeys(previousReport || {})
        const nextKeys = getPayloadEvidenceKeys(body)
        const removedKeys = previousKeys.filter((key) => !nextKeys.includes(key))
        let r2DeleteResult: { attempted: number; deleted: number; failed: string[] } | null = null
        if (removedKeys.length > 0) {
          try {
            r2DeleteResult = await deleteEvidenceKeysFromR2(String(session.user.companyId), removedKeys)
          } catch (r2Err) {
            console.error('❌ Error deleting removed evidence from R2:', r2Err)
            r2DeleteResult = {
              attempted: removedKeys.length,
              deleted: 0,
              failed: removedKeys
            }
          }
        }
        const versionResult = await saveFieldReportVersion({
          supabaseAdmin,
          companyId: String(session.user.companyId),
          reportId: String(id),
          editedBy: session?.user?.id ? String(session.user.id) : null,
          previousData: previousReport || null,
          newData: data || null
        })
        return NextResponse.json({
          ...data,
          _saved_fields: Object.keys(updatePayload),
          _omitted_fields: Array.from(omittedFields),
          _versioning: versionResult,
          _evidence_r2_delete: r2DeleteResult
        })
      }
      const msg = (error && (error as any).message) ? String((error as any).message) : JSON.stringify(error)
      lastErrorMsg = msg
      lastErrorDetails = error
      const missing = getMissingColumnName(msg)
      const trimmed = stripMissingColumn(updatePayload, msg)
      if (trimmed) {
        if (missing) omittedFields.add(missing)
        updatePayload = trimmed
        continue
      }
      return NextResponse.json({ error: msg, details: error }, { status: 500 })
    }
    return NextResponse.json({
      error: lastErrorMsg || 'Could not update report after retries',
      details: lastErrorDetails,
      retries_exhausted: true
    }, { status: 500 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role for field reports' }, { status: 403 })
    const body = await req.json()
    const id = body.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pr_field_reports')
      .delete()
      .eq('id', id)
      .eq('company_id', session.user.companyId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: String(error) }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
