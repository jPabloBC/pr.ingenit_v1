import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { createR2PresignedUrl } from '@/lib/r2Presign'
import {
  resolveCalculationVersion,
  resolvePersonWorkdayHours,
  resolveMachineWorkdayHours,
  resolveHalfDayHours,
  resolvePersonDotationFromHours,
  resolveMachineDotationFromHours
} from '@/lib/workdayConfig'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Missing service role key')
  return createClient(SUPABASE_URL, key)
}

function requireRole(role: string) {
  return role === 'admin' || role === 'dev' || role === 'user'
}

function latamDate(value: any) {
  const v = String(value || '').slice(0, 10)
  const [y, m, d] = v.split('-')
  if (!y || !m || !d) return '-'
  return `${d}-${m}-${y}`
}

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizeDirectKeyToken(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function normalizeSpecialtyLabel(specialty: any, discipline?: any, position?: any) {
  const raw = normalizeDirectKeyToken(specialty)
  if (raw) return raw
  const disc = normalizeDirectKeyToken(discipline)
  if (disc) return disc
  const pos = normalizeDirectKeyToken(position)
  return pos || 'GENERAL'
}

function buildDirectFrontKey(discipline?: string, specialty?: string, position?: string) {
  const disc = normalizeDirectKeyToken(discipline) || '-'
  const spec = normalizeSpecialtyLabel(specialty, discipline, position) || '-'
  const pos = normalizeDirectKeyToken(position) || '-'
  return `${disc}|||${spec}|||${pos}`
}

function inferDisciplineFromText(value: any) {
  const t = normalizeText(value)
  if (!t) return 'GENERAL'
  if (t.includes('civil') || t.includes('obras civiles')) return 'OBRA CIVILES'
  if (t.includes('electric')) return 'ELECTRICO'
  if (t.includes('mecanic')) return 'MECANICO'
  if (t.includes('caner') || t.includes('caner') || t.includes('hdpe')) return 'CAÑERIA'
  if (t.includes('andam')) return 'ANDAMIOS'
  if (t.includes('estruct')) return 'ESTRUCTURA'
  if (t.includes('rigger')) return 'RIGGER'
  if (t.includes('topogra')) return 'TOPOGRAFIA'
  return 'GENERAL'
}

function inferDirectDiscipline(params: { discipline?: any; specialty?: any; position?: any }) {
  const specialtyText = normalizeText(params.specialty)
  const positionText = normalizeText(params.position)
  if (specialtyText.includes('rigger') || positionText.includes('rigger')) return 'RIGGER'
  return inferDisciplineFromText(params.discipline || params.specialty || params.position || 'GENERAL')
}

function parseJsonArray(value: any): any[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') return Object.values(parsed)
      return []
    } catch {
      return []
    }
  }
  return []
}

function asObject(value: any): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {}
  }
  return {}
}

function detectWorkFrontStrictFromRecord(record: any): 'CANALETAS' | 'PISCINAS' | null {
  const notes = asObject(record?.notes)
  const runtime = asObject(record?.v2_runtime_snapshot)
  const formSnap = asObject(record?.v2_form_snapshot)
  const candidates = [
    String(record?.work_front || ''),
    String(notes?.work_front || ''),
    String(runtime?.work_front || ''),
    String(formSnap?.work_front || ''),
    String(notes?.report_format_code || ''),
    String(runtime?.report_format_code || ''),
    String(formSnap?.report_format_code || '')
  ].map((v) => v.toUpperCase())
  if (candidates.some((v) => v === 'PISCINAS' || v.includes('PISCINAS'))) return 'PISCINAS'
  if (candidates.some((v) => v === 'CANALETAS' || v.includes('CANALETAS'))) return 'CANALETAS'
  return null
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
        // signed URL path: /bucket/key...
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
      if (resolvedKey) {
        out.push({ key: resolvedKey, name: String((node as any).name || '').trim() || undefined })
      }
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

function inferShiftLabel(workCalendar: string) {
  const n = normalizeText(workCalendar)
  if (n.includes('noche')) return 'Noche'
  return 'Dia'
}

function isCourseException(value: any) {
  const n = normalizeText(value)
  return n.includes('curso') || n.includes('capacitacion')
}

function isDownException(value: any) {
  const n = normalizeText(value)
  return n.startsWith('bajada') || n.startsWith('baja')
}

function isPoliclinicoException(value: any) {
  const n = normalizeText(value)
  return !isDownException(value) && n.includes('policlinico')
}

function isOfficeTelework(value: any) {
  const n = normalizeText(value).replace(/[/-]/g, ' ')
  return n.includes('oficina central') && n.includes('teletrabajo')
}

function buildRowsByWorkerType(source: any[], workerTypeMatcher: (wt: string) => boolean) {
  const byPosition = new Map<string, number>()
  source.forEach((c) => {
    const wt = normalizeText(c?.worker_type)
    if (!workerTypeMatcher(wt)) return
    const pos = String(c?.position || '').trim() || 'Sin cargo'
    byPosition.set(pos, (byPosition.get(pos) || 0) + 1)
  })
  return Array.from(byPosition.entries())
    .map(([position, quantity]) => ({ position, quantity, hh: quantity * 12 }))
    .sort((a, b) => a.position.localeCompare(b.position, 'es', { sensitivity: 'base' }))
}

function buildDirectRows(source: any[]) {
  const grouped = new Map<string, { specialty: string; position: string; quantity: number }>()
  source.forEach((c) => {
    const wt = normalizeText(c?.worker_type)
    if (wt !== 'directo') return
    const specialty = String(c?.specialty || '').trim() || 'Sin especialidad'
    const position = String(c?.position || '').trim() || 'Sin cargo'
    const key = `${specialty}|||${position}`
    const current = grouped.get(key) || { specialty, position, quantity: 0 }
    current.quantity += 1
    grouped.set(key, current)
  })
  return Array.from(grouped.values())
    .sort((a, b) => {
      const s = a.specialty.localeCompare(b.specialty, 'es', { sensitivity: 'base' })
      if (s !== 0) return s
      return a.position.localeCompare(b.position, 'es', { sensitivity: 'base' })
    })
    .map((row) => ({
      specialty: row.specialty,
      position: row.position,
      quantity: row.quantity,
      realOnSite: row.quantity,
      hh12: row.quantity * 12,
      quantityProductive: row.quantity,
      hh11: row.quantity * 11
    }))
}

function numberSum(rows: any[], key: string) {
  return rows.reduce((acc, row) => acc + (Number(row?.[key]) || 0), 0)
}

function collectEvidenceItems(fieldReports: any[]) {
  const items: Array<{ key: string; name: string; activityName: string }> = []
  const seen = new Set<string>()
  const pushEvidence = (filesRaw: any, activityNameRaw: any) => {
    const activityName = String(activityNameRaw || 'Actividad')
    const files = extractEvidenceEntries(filesRaw)
    files.forEach((f: any) => {
      const key = String(f?.key || '').trim()
      if (!key || seen.has(key)) return
      seen.add(key)
      items.push({
        key,
        name: String(f?.name || 'imagen'),
        activityName
      })
    })
  }
  fieldReports.forEach((report: any) => {
    const assignments = parseJsonArray(report?.assignments)
    const activities = parseJsonArray(report?.activities)
    const blocks = assignments.length > 0 ? assignments : activities
    blocks.forEach((asg: any) => {
      const actName = String(asg?.activity || asg?.description || 'Actividad')
      pushEvidence(asg?.evidence_files, actName)
      pushEvidence(asg?.evidences, actName)
      pushEvidence(asg?.images, actName)
      pushEvidence(asg?.evidence, actName)
    })

    // Fallback: algunas versiones guardan evidencias en activity_observations.
    const obsRows = parseJsonArray(report?.activity_observations)
    obsRows.forEach((obs: any) => {
      const actName = String(obs?.activity || obs?.description || obs?.name || 'Actividad')
      pushEvidence(obs?.evidence_files, actName)
      pushEvidence(obs?.evidences, actName)
      pushEvidence(obs?.images, actName)
      pushEvidence(obs?.evidence, actName)
    })
  })
  return items
}

function resolveImageExtension(name: string, key: string, contentType: string) {
  const fromType = String(contentType || '').toLowerCase()
  if (fromType.includes('png')) return 'png'
  if (fromType.includes('jpeg') || fromType.includes('jpg')) return 'jpeg'
  const raw = `${name} ${key}`.toLowerCase()
  if (raw.endsWith('.png')) return 'png'
  if (raw.endsWith('.jpg') || raw.endsWith('.jpeg')) return 'jpeg'
  return ''
}

async function loadEvidenceImages(items: Array<{ key: string; name: string; activityName: string }>, companyId: string) {
  const bucket = process.env.R2_BUCKET_NAME
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return []

  const prefix = `field-reports/${companyId}/`
  const resolved = await Promise.all(items.map(async (item) => {
    try {
      if (!item.key.startsWith(prefix)) return null
      const download = createR2PresignedUrl({
        method: 'GET',
        bucket,
        accountId,
        key: item.key,
        accessKeyId,
        secretAccessKey,
        expiresInSeconds: 600
      })
      const res = await fetch(download.url, { cache: 'no-store' })
      if (!res.ok) return null
      const contentType = String(res.headers.get('content-type') || '')
      const extension = resolveImageExtension(item.name, item.key, contentType)
      if (!extension) return null
      const arr = await res.arrayBuffer()
      if (!arr || arr.byteLength === 0) return null
      const mime = extension === 'png' ? 'image/png' : 'image/jpeg'
      const base64 = `data:${mime};base64,${Buffer.from(arr).toString('base64')}`
      return {
        ...item,
        extension: extension as 'png' | 'jpeg',
        base64
      }
    } catch {
      return null
    }
  }))
  return resolved.filter(Boolean) as Array<{ key: string; name: string; activityName: string; extension: 'png' | 'jpeg'; base64: string }>
}

function decodeDataUrlBase64(dataUrl: string) {
  const raw = String(dataUrl || '')
  const idx = raw.indexOf(',')
  const payload = idx >= 0 ? raw.slice(idx + 1) : raw
  return Buffer.from(payload, 'base64')
}

function getPngDimensions(buffer: Buffer) {
  if (buffer.length < 24) return null
  // PNG IHDR width/height at bytes 16-23 (big-endian)
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (!width || !height) return null
  return { width, height }
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
    // Most SOF markers contain image dimensions (except DHT, JPG, DAC)
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

function getImageDimensionsFromBase64(base64: string, extension: 'png' | 'jpeg') {
  try {
    const buffer = decodeDataUrlBase64(base64)
    if (extension === 'png') return getPngDimensions(buffer)
    return getJpegDimensions(buffer)
  } catch {
    return null
  }
}

function buildEvidenceLinks(items: Array<{ key: string; name: string; activityName: string }>, companyId: string) {
  const bucket = process.env.R2_BUCKET_NAME
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
    return items.map((item) => ({ ...item, url: '' }))
  }
  const prefix = `field-reports/${companyId}/`
  return items.map((item) => {
    try {
      if (!item.key.startsWith(prefix)) return { ...item, url: '' }
      const signed = createR2PresignedUrl({
        method: 'GET',
        bucket,
        accountId,
        key: item.key,
        accessKeyId,
        secretAccessKey,
        expiresInSeconds: 86400 // 24 horas
      })
      return { ...item, url: signed.url }
    } catch {
      return { ...item, url: '' }
    }
  })
}

function buildDirectSpecialtySections(fieldReportsForDate: any[]) {
  const bySpecialty = new Map<string, {
    specialty: string
    supervisors: Set<string>
    crewLines: Map<string, {
      crewName: string
      count: number
      activityNames: Set<string>
      itemRefs: Set<string>
      areas: Set<string>
      descriptions: Set<string>
      evidenceCount: number
    }>
  }>()

  fieldReportsForDate.forEach((report: any) => {
    const specialty = String(report?.specialty || '').trim() || 'Sin especialidad'
    const assignments = parseJsonArray(report?.assignments)
    if (assignments.length === 0) return
    const current = bySpecialty.get(specialty) || {
      specialty,
      supervisors: new Set<string>(),
      crewLines: new Map<string, {
        crewName: string
        count: number
        activityNames: Set<string>
        itemRefs: Set<string>
        areas: Set<string>
        descriptions: Set<string>
        evidenceCount: number
      }>()
    }
    String(report?.supervisor || '')
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((n) => current.supervisors.add(n))

    const personnelIds = new Set<string>(Array.isArray(report?.personnel_ids) ? report.personnel_ids.map(String) : [])
    String(report?.capataz_id || '')
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((id) => personnelIds.add(id))

    assignments.forEach((asg: any) => {
      const crewName = String(asg?.crewName || asg?.crew_name || report?.crew_name || 'Cuadrilla').trim()
      const crewKey = String(asg?.crewId || asg?.crew_id || crewName || report?.id || Math.random())
      const line = current.crewLines.get(crewKey) || {
        crewName,
        count: Math.max(0, personnelIds.size),
        activityNames: new Set<string>(),
        itemRefs: new Set<string>(),
        areas: new Set<string>(),
        descriptions: new Set<string>(),
        evidenceCount: 0
      }
      const actName = String(asg?.activity || asg?.description || '').trim()
      if (actName) line.activityNames.add(actName)
      const itemId = String(asg?.item_id || '').trim()
      const subId = String(asg?.sub_id || '').trim()
      if (itemId || subId) line.itemRefs.add(`${itemId}${subId ? ` (${subId})` : ''}`)
      const area = String(asg?.area || report?.area || '').trim()
      if (area) line.areas.add(area)
      const desc = String(asg?.description || report?.description || '').trim()
      line.descriptions.add(desc || '-')
      line.evidenceCount += parseJsonArray(asg?.evidence_files).length
      current.crewLines.set(crewKey, line)
    })

    bySpecialty.set(specialty, current)
  })

  return Array.from(bySpecialty.values())
    .sort((a, b) => a.specialty.localeCompare(b.specialty, 'es', { sensitivity: 'base' }))
    .map((section) => {
      const crewLines = Array.from(section.crewLines.values())
      const activitiesSubtotal = crewLines.reduce((acc, line) => acc + (Number(line.count) || 0), 0)
      return {
        specialty: section.specialty,
        clientId: 'ID',
        supervisorsText: Array.from(section.supervisors).join(', ') || '-',
        activitiesSubtotal,
        crewLines
      }
    })
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  return exportDailyReport(req, body?.reportOverride || null)
}

export async function GET(req: NextRequest) {
  return exportDailyReport(req)
}

async function exportDailyReport(req: NextRequest, reportOverride?: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (!requireRole(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const id = String(req.nextUrl.searchParams.get('id') || reportOverride?.id || '').trim()
    const debugMode = req.nextUrl.searchParams.get('debug') === '1'
    const strictVisibleMode = req.nextUrl.searchParams.get('strict_visible') === '1'
    const templateParam = String(req.nextUrl.searchParams.get('template') || '').trim().toLowerCase()
    const exportTemplate: 'daily_v1' | 'daily_v2' = templateParam === 'daily_v2' ? 'daily_v2' : 'daily_v1'
    if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const companyId = String(session.user.companyId)
    const fieldReportExportSelect = '*'

    const { data: dbReport, error } = await supabaseAdmin
      .from('pr_daily_reports')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', id)
      .single()
    if (error || !dbReport) return NextResponse.json({ error: String(error?.message || 'Reporte no encontrado') }, { status: 404 })
    const report = reportOverride && typeof reportOverride === 'object'
      ? {
          ...dbReport,
          ...reportOverride,
          id: dbReport.id,
          company_id: dbReport.company_id,
          notes: {
            ...asObject((dbReport as any)?.notes),
            ...asObject((reportOverride as any)?.notes)
          },
          v2_form_snapshot: {
            ...asObject((dbReport as any)?.v2_form_snapshot),
            ...asObject((reportOverride as any)?.v2_form_snapshot)
          },
          v2_runtime_snapshot: {
            ...asObject((dbReport as any)?.v2_runtime_snapshot),
            ...asObject((reportOverride as any)?.v2_runtime_snapshot)
          }
        }
      : dbReport

    const sourceIds = (() => {
      const fromArray = Array.isArray(report?.source_field_report_ids)
        ? report.source_field_report_ids
        : parseJsonArray(report?.source_field_report_ids)
      return fromArray.map((x: any) => String(x || '').trim()).filter(Boolean)
    })()

    const [collRes, fieldRes] = await Promise.all([
      supabaseAdmin.from('pr_collaborators').select('id, first_name, last_name, specialty, position, worker_type, condition, exception_condition').eq('company_id', companyId),
      sourceIds.length > 0
        ? supabaseAdmin
            .from('pr_field_reports')
            .select(fieldReportExportSelect)
            .eq('company_id', companyId)
            .in('id', sourceIds)
        : supabaseAdmin
            .from('pr_field_reports')
            .select(fieldReportExportSelect)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(500)
    ])
    const collaborators = Array.isArray(collRes.data) ? collRes.data : []
    const allFieldReports = Array.isArray(fieldRes.data) ? fieldRes.data : []
    const day = String(report?.report_date || '').slice(0, 10)
    const fieldReportsLoadDebug: Record<string, any> = {
      sourceQueryCount: allFieldReports.length,
      sourceQueryError: fieldRes.error ? String(fieldRes.error.message || fieldRes.error) : null,
      byDateCount: null,
      byDateError: null,
      broadCount: null,
      broadError: null,
      jsDateCount: null
    }
    let fieldReports = sourceIds.length > 0 ? allFieldReports : []
    if (fieldReports.length === 0) {
      // Igual criterio del modal Ver/Editar en daily-report.
      fieldReports = allFieldReports.filter((r: any) => {
        const reportDate = String(r?.date || '').slice(0, 10)
        const createdDate = String(r?.created_at || '').slice(0, 10)
        if (reportDate) return reportDate === day
        return createdDate === day
      })
    }
    let fieldReportsForSpecialRoles = fieldReports
    if (sourceIds.length > 0) {
      // Los reportes diarios V2 guardan source_field_report_ids filtrados por frente.
      // Para saber si un cargo especial estuvo en ambos frentes, el Excel debe mirar todo el día.
      const dayStart = `${day}T00:00:00.000Z`
      const dayEnd = `${day}T23:59:59.999Z`
      const byDateRes = await supabaseAdmin
        .from('pr_field_reports')
        .select(fieldReportExportSelect)
        .eq('company_id', companyId)
        .or(`date.eq.${day},and(date.is.null,created_at.gte.${dayStart},created_at.lte.${dayEnd})`)
        .order('created_at', { ascending: false })
        .limit(500)
      fieldReportsLoadDebug.byDateCount = Array.isArray(byDateRes.data) ? byDateRes.data.length : 0
      fieldReportsLoadDebug.byDateError = byDateRes.error ? String(byDateRes.error.message || byDateRes.error) : null
      if (Array.isArray(byDateRes.data) && byDateRes.data.length > 0) {
        fieldReportsForSpecialRoles = byDateRes.data
      } else {
        const broadRes = await supabaseAdmin
          .from('pr_field_reports')
          .select(fieldReportExportSelect)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(500)
        const broadRows = Array.isArray(broadRes.data) ? broadRes.data : []
        fieldReportsLoadDebug.broadCount = broadRows.length
        fieldReportsLoadDebug.broadError = broadRes.error ? String(broadRes.error.message || broadRes.error) : null
        const byJsDate = broadRows.filter((r: any) => {
          const reportDate = String(r?.date || '').slice(0, 10)
          const createdDate = String(r?.created_at || '').slice(0, 10)
          if (reportDate) return reportDate === day
          return createdDate === day
        })
        fieldReportsLoadDebug.jsDateCount = byJsDate.length
        if (byJsDate.length > 0) {
          fieldReportsForSpecialRoles = byJsDate
        }
      }
    }

    const indirectRows = buildRowsByWorkerType(collaborators, (wt) => wt === 'indirecto')
    const directNoOperationalRows = buildRowsByWorkerType(collaborators, (wt) => /directo\s*no\s*operacional/.test(wt))
    const directRows = buildDirectRows(collaborators)

    const courseCollaborators = collaborators.filter((c) => isCourseException(c?.exception_condition))
    const downCollaborators = collaborators.filter((c) => normalizeText(c?.condition) === 'turno' && isDownException(c?.exception_condition))
    const policlinicoCollaborators = collaborators.filter((c) => normalizeText(c?.condition) === 'turno' && isPoliclinicoException(c?.exception_condition))
    const teleworkCollaborators = collaborators.filter((c) => isOfficeTelework(c?.condition) || isOfficeTelework(c?.exception_condition))

    const courseIndirectRows = buildRowsByWorkerType(courseCollaborators, (wt) => wt === 'indirecto')
    const courseDirectNoOperationalRows = buildRowsByWorkerType(courseCollaborators, (wt) => /directo\s*no\s*operacional/.test(wt))
    const courseDirectRows = buildDirectRows(courseCollaborators)

    const downIndirectRows = buildRowsByWorkerType(downCollaborators, (wt) => wt === 'indirecto')
    const downDirectNoOperationalRows = buildRowsByWorkerType(downCollaborators, (wt) => /directo\s*no\s*operacional/.test(wt))
    const downDirectRows = buildDirectRows(downCollaborators)

    const policlinicoIndirectRows = buildRowsByWorkerType(policlinicoCollaborators, (wt) => wt === 'indirecto')
    const policlinicoDirectNoOperationalRows = buildRowsByWorkerType(policlinicoCollaborators, (wt) => /directo\s*no\s*operacional/.test(wt))
    const policlinicoDirectRows = buildDirectRows(policlinicoCollaborators)

    const teleworkIndirectRows = buildRowsByWorkerType(teleworkCollaborators, (wt) => wt === 'indirecto')
    const directSpecialtySections = buildDirectSpecialtySections(fieldReports)
    const notes = asObject(report?.notes)
    const runtimeSnap = asObject(report?.v2_runtime_snapshot)
    const formSnap = asObject(report?.v2_form_snapshot)
    const workdaySource = {
      ...report,
      notes,
      v2_runtime_snapshot: runtimeSnap,
      v2_form_snapshot: formSnap
    }
    const personWorkdayHours = resolvePersonWorkdayHours(workdaySource)
    const machineWorkdayHours = resolveMachineWorkdayHours(workdaySource)
    const halfDayHours = resolveHalfDayHours(workdaySource)
    const calculationVersion = resolveCalculationVersion(workdaySource)

    if (exportTemplate === 'daily_v2') {
      const toNum = (v: any) => {
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0
        const raw = String(v ?? '').trim()
        if (!raw) return 0
        let normalized = raw.replace(/\s+/g, '')
        if (normalized.includes(',') && normalized.includes('.')) {
          const lastComma = normalized.lastIndexOf(',')
          const lastDot = normalized.lastIndexOf('.')
          if (lastComma > lastDot) {
            normalized = normalized.replace(/\./g, '').replace(',', '.')
          } else {
            normalized = normalized.replace(/,/g, '')
          }
        } else if (normalized.includes(',')) {
          normalized = normalized.replace(',', '.')
        }
        const n = Number(normalized)
        return Number.isFinite(n) ? n : 0
      }
      const displayHhTurnoDia = (value: any) => {
        const n = toNum(value)
        return n > 0 ? n : personWorkdayHours
      }
      const snap = formSnap
      const runtime = runtimeSnap
      const pick = (key: string, fallback = 0) => {
        if (runtime[key] !== undefined && runtime[key] !== null && runtime[key] !== '') return toNum(runtime[key])
        if ((snap as any)[key] !== undefined && (snap as any)[key] !== null && (snap as any)[key] !== '') return toNum((snap as any)[key])
        if ((notes as any)[key] !== undefined && (notes as any)[key] !== null && (notes as any)[key] !== '') return toNum((notes as any)[key])
        return fallback
      }
      const pickText = (key: string, fallback = '-') => {
        const rv = runtime[key]
        const sv = (snap as any)[key]
        const nv = (notes as any)[key]
        const val = rv ?? sv ?? nv
        const txt = String(val ?? '').trim()
        return txt || fallback
      }
      const pickArray = (...keys: string[]) => {
        const sources = [runtime, snap, notes]
        for (const key of keys) {
          for (const source of sources) {
            const arr = parseJsonArray((source as any)?.[key])
            if (arr.length > 0) return arr
          }
        }
        return []
      }
      const reportFrontRaw = pickText('work_front', String((report as any)?.work_front || 'CANALETAS'))
      const reportFront = normalizeText(reportFrontRaw).includes('piscinas') ? 'PISCINAS' : 'CANALETAS'
      const specialFrontRoles = ['topografo', 'alarife', 'electrico mantencion', 'mecanico mantencion'] as const
      type SpecialFrontRole = typeof specialFrontRoles[number]
      const getSpecialFrontRole = (value: any): SpecialFrontRole | null => {
        const n = normalizeText(value)
        if (n.includes('electrico') && n.includes('mantencion')) return 'electrico mantencion'
        if (n.includes('mecanico') && n.includes('mantencion')) return 'mecanico mantencion'
        return specialFrontRoles.find((role) => n.includes(role)) || null
      }
      const inferBaseFront = (value: any): 'canaletas' | 'piscinas' | null => {
        const n = normalizeText(value)
        if (n === 'canaletas' || n.includes('contrato base canaletas') || n.includes('canalet')) return 'canaletas'
        if (n === 'piscinas' || n.includes('contrato base piscinas') || n.includes('piscin')) return 'piscinas'
        return null
      }
      const specialRolePresence = (() => {
        const out: Record<SpecialFrontRole, Set<'canaletas' | 'piscinas' | 'excluded'>> = {
          topografo: new Set(),
          alarife: new Set(),
          'electrico mantencion': new Set(),
          'mecanico mantencion': new Set()
        }
        const debugRows: Array<Record<string, any>> = []
        const collaboratorById = new Map<string, any>()
        const collaboratorIdByName = new Map<string, string>()
        collaborators.forEach((c: any) => {
          const id = String(c?.id || '').trim()
          if (!id) return
          collaboratorById.set(id, c)
          const fullName = `${String(c?.first_name || '').trim()} ${String(c?.last_name || '').trim()}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim()
          if (fullName) collaboratorIdByName.set(fullName, id)
        })
        const resolveParticipantId = (value: any) => {
          const raw = String(value || '').trim()
          if (!raw) return ''
          if (collaboratorById.has(raw)) return raw
          return collaboratorIdByName.get(
            raw
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toUpperCase()
              .trim()
          ) || ''
        }
        fieldReportsForSpecialRoles.forEach((fieldReport: any) => {
          const rawReportFront = String(fieldReport?.work_front || '').trim()
          const reportFrontBase = inferBaseFront(rawReportFront)
          const reportFrontValue = rawReportFront ? (reportFrontBase || 'excluded') : null
          const activityRows = parseJsonArray(fieldReport?.assignments).length > 0
            ? parseJsonArray(fieldReport?.assignments)
            : parseJsonArray(fieldReport?.activities)
          const rowFronts = activityRows.map((activity: any) => {
            const rawFront = String(activity?.activity_front || activity?.work_front || activity?.front || activity?.frente || '').trim()
            if (rawFront) return inferBaseFront(rawFront) || 'excluded'
            return reportFrontValue
          })
          const fallbackFronts = new Set<'canaletas' | 'piscinas' | 'excluded'>()
          rowFronts.forEach((front) => {
            if (front === 'canaletas' || front === 'piscinas' || front === 'excluded') fallbackFronts.add(front)
          })
          if (reportFrontValue === 'canaletas' || reportFrontValue === 'piscinas' || reportFrontValue === 'excluded') fallbackFronts.add(reportFrontValue)

          const personHours = asObject(fieldReport?.person_hours)
          const personHoursById: Record<string, any> = {}
          const personExtraHoursById: Record<string, any> = {}
          Object.entries(personHours).forEach(([rawKey, hours]) => {
            if (!rawKey || rawKey === '__extras') return
            const pid = resolveParticipantId(rawKey)
            if (pid) personHoursById[pid] = hours
          })
          Object.entries(asObject((personHours as any)?.__extras)).forEach(([rawKey, hours]) => {
            const pid = resolveParticipantId(rawKey)
            if (pid) personExtraHoursById[pid] = hours
          })

          const roleByParticipant = new Map<string, string>()
          parseJsonArray(fieldReport?.personnel).forEach((person: any) => {
            const pid = resolveParticipantId(person?.id || person?.collaborator_id || `${String(person?.first_name || person?.name || '').trim()} ${String(person?.last_name || '').trim()}`)
            const roleText = [
              person?.role,
              person?.position,
              person?.cargo,
              person?.specialty,
              person?.especialidad
            ].map((x) => String(x || '').trim()).filter(Boolean).join(' ')
            const role = getSpecialFrontRole(roleText)
            if (!pid || !role) return
            roleByParticipant.set(pid, role)
          })
          parseJsonArray(fieldReport?.personnel_ids).forEach((rawPid: any) => {
            const pid = resolveParticipantId(rawPid)
            const collab = pid ? collaboratorById.get(pid) : null
            const role = getSpecialFrontRole(`${String(collab?.position || '')} ${String(collab?.specialty || '')}`)
            if (!pid || !role) return
            roleByParticipant.set(pid, role)
          })

          roleByParticipant.forEach((role, pid) => {
            const frontsForPerson = new Set<'canaletas' | 'piscinas' | 'excluded'>()
            const hasHoursForPerson =
              Object.prototype.hasOwnProperty.call(personHoursById, pid) ||
              Object.prototype.hasOwnProperty.call(personExtraHoursById, pid)
            const hours = Array.isArray(personHoursById[pid]) ? personHoursById[pid] : []
            const extraHours = toNum(personExtraHoursById[pid])
            const hourFrontHits: Array<{ idx: number; hours: number; front: string | null }> = []
            hours.forEach((rawHour: any, idx: number) => {
              const parsedHours = toNum(rawHour)
              if (!(parsedHours > 0)) return
              const front = rowFronts[idx]
              hourFrontHits.push({ idx, hours: parsedHours, front })
              if (front === 'canaletas' || front === 'piscinas' || front === 'excluded') frontsForPerson.add(front)
            })
            if (extraHours > 0) {
              const front = reportFrontValue
              hourFrontHits.push({ idx: -1, hours: extraHours, front })
              if (front === 'canaletas' || front === 'piscinas' || front === 'excluded') frontsForPerson.add(front)
            }
            const frontsToApply = hasHoursForPerson ? frontsForPerson : fallbackFronts
            frontsToApply.forEach((front) => out[role as SpecialFrontRole].add(front))
            debugRows.push({
              reportId: String(fieldReport?.id || ''),
              reportDate: String(fieldReport?.date || fieldReport?.created_at || '').slice(0, 10),
              reportWorkFront: String(fieldReport?.work_front || ''),
              role,
              participantId: pid,
              hasHoursForPerson,
              extraHours,
              hours,
              rowFronts,
              fallbackFronts: Array.from(fallbackFronts),
              hourFrontHits,
              frontsApplied: Array.from(frontsToApply)
            })
          })
        })
        if (false) console.log('[daily-report][excel-v2][special-front-debug]', {
          reportId: String(report?.id || ''),
          reportDate: day,
          reportFront,
          sourceIds,
          fieldReportsLoadDebug,
          fieldReportsForSpecialRoles: fieldReportsForSpecialRoles.map((r: any) => ({
            id: String(r?.id || ''),
            date: String(r?.date || r?.created_at || '').slice(0, 10),
            work_front: String(r?.work_front || ''),
            personnelCount: parseJsonArray(r?.personnel).length,
            personnelIdsCount: parseJsonArray(r?.personnel_ids).length,
            personHoursKeys: Object.keys(asObject(r?.person_hours)).filter((key) => key !== '__extras')
          })),
          rows: debugRows,
          result: Object.fromEntries(
            Object.entries(out).map(([role, fronts]) => [role, Array.from(fronts)])
          )
        })
        return out
      })()
      const getSpecialRoleExcelFrontValue = (role: SpecialFrontRole | null) => {
        if (!role) return null
        const fronts = specialRolePresence[role]
        const hasCanaletas = fronts.has('canaletas')
        const hasPiscinas = fronts.has('piscinas')
        const selected = reportFront === 'PISCINAS' ? 'piscinas' : 'canaletas'
        if (!hasCanaletas && !hasPiscinas) return fronts.has('excluded') ? 0 : null
        if (hasCanaletas && hasPiscinas) return fronts.has(selected) ? 0.5 : 0
        return fronts.has(selected) ? 1 : 0
      }
      const directFrontDotationByPosition = (() => {
        const selectedFront: 'CANALETAS' | 'PISCINAS' = reportFront === 'PISCINAS' ? 'PISCINAS' : 'CANALETAS'
        const collaboratorById = new Map<string, any>()
        const collaboratorIdByName = new Map<string, string>()
        collaborators.forEach((c: any) => {
          const id = String(c?.id || '').trim()
          if (!id) return
          collaboratorById.set(id, c)
          const fullName = `${String(c?.first_name || '').trim()} ${String(c?.last_name || '').trim()}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim()
          if (fullName) collaboratorIdByName.set(fullName, id)
        })
        const resolveParticipantId = (value: any) => {
          const raw = String(value || '').trim()
          if (!raw) return ''
          if (collaboratorById.has(raw)) return raw
          return collaboratorIdByName.get(
            raw
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toUpperCase()
              .trim()
          ) || ''
        }
        const resolveBaseFront = (frontLike: any): 'CANALETAS' | 'PISCINAS' | null => {
          const label = normalizeText(frontLike)
          if (!label) return null
          if (label === 'canaletas' || label.includes('contrato base canaletas') || label.includes('canalet')) return 'CANALETAS'
          if (label === 'piscinas' || label.includes('contrato base piscinas') || label.includes('piscin')) return 'PISCINAS'
          return null
        }
        const isIfaArea = (value: any) => {
          const label = normalizeText(value)
          return (
            label === 'ifa' ||
            label.includes('area ifa') ||
            label.includes('instalacion faena') ||
            label.includes('instalacion de faena')
          )
        }
        const personFrontHours = new Map<string, { canaletas: number; piscinas: number; ifa: number }>()
        const debugReports: Array<Record<string, any>> = []
        fieldReportsForSpecialRoles.forEach((fieldReport: any) => {
          const assignments = parseJsonArray(fieldReport?.assignments)
          const activityRows = assignments.length > 0 ? assignments : parseJsonArray(fieldReport?.activities)
          const reportFrontRaw = String(fieldReport?.work_front || fieldReport?.front || fieldReport?.frente || '').trim()
          const reportFrontFallback = isIfaArea(reportFrontRaw) ? 'IFA' : resolveBaseFront(reportFrontRaw)
          const rowFronts = activityRows.map((activity: any) => {
            const rawFront = String(activity?.activity_front || activity?.work_front || activity?.front || activity?.frente || '').trim()
            const hasExplicitFront = rawFront.length > 0
            const activityFront = resolveBaseFront(rawFront)
            if (hasExplicitFront) {
              if (activityFront) return activityFront
              if (isIfaArea(rawFront)) return 'IFA'
              return null
            }
            return reportFrontFallback
          })
          const personHours = asObject(fieldReport?.person_hours)
          const personExtraHours = asObject((personHours as any)?.__extras)
          const participantKeys = new Set<string>()
          Object.keys(personHours).forEach((rawKey) => {
            if (rawKey && rawKey !== '__extras') participantKeys.add(rawKey)
          })
          Object.keys(personExtraHours).forEach((rawKey) => {
            if (rawKey) participantKeys.add(rawKey)
          })
          participantKeys.forEach((rawKey) => {
            const pid = resolveParticipantId(rawKey)
            if (!pid) return
            const hours = Array.isArray((personHours as any)?.[rawKey]) ? (personHours as any)[rawKey] : []
            const extraHours = toNum((personExtraHours as any)?.[rawKey])
            if (!hours.some((v: any) => toNum(v) > 0) && !(extraHours > 0)) return
            const agg = personFrontHours.get(pid) || { canaletas: 0, piscinas: 0, ifa: 0 }
            hours.forEach((hh: any, idx: number) => {
              const parsedHours = toNum(hh)
              if (!(parsedHours > 0)) return
              const front = rowFronts[idx]
              if (front === 'CANALETAS') agg.canaletas += parsedHours
              if (front === 'PISCINAS') agg.piscinas += parsedHours
              if (front === 'IFA') agg.ifa += parsedHours
            })
            if (extraHours > 0) {
              if (reportFrontFallback === 'CANALETAS') agg.canaletas += extraHours
              if (reportFrontFallback === 'PISCINAS') agg.piscinas += extraHours
              if (reportFrontFallback === 'IFA') agg.ifa += extraHours
            }
            personFrontHours.set(pid, agg)
          })
          debugReports.push({
            reportId: String(fieldReport?.id || ''),
            workFront: String(fieldReport?.work_front || ''),
            activityRows: activityRows.length,
            rowFronts,
            personHoursKeys: Object.keys(personHours).filter((key) => key !== '__extras'),
            personExtraHoursKeys: Object.keys(personExtraHours)
          })
        })

        const out: Record<string, number> = {}
        const outIfa: Record<string, number> = {}
        const outIfaByPosition: Record<string, number> = {}
        const perPersonDebug: Array<Record<string, any>> = []
        personFrontHours.forEach((frontHours, pid) => {
          const collab = collaboratorById.get(pid)
          if (!collab) return
          const workerType = normalizeText(collab?.worker_type)
          const positionCandidate = String(collab?.position || 'SIN CARGO')
          const isCapataz = normalizeText(positionCandidate).includes('capataz')
          if (workerType !== 'directo' && !isCapataz) return
          const can = Number(frontHours.canaletas || 0)
          const pis = Number(frontHours.piscinas || 0)
          const ifa = Number(frontHours.ifa || 0)
          const totalFieldHoursForPerson = can + pis + ifa
          const dailyCapFactor = totalFieldHoursForPerson > personWorkdayHours ? personWorkdayHours / totalFieldHoursForPerson : 1
          const cappedCan = can * dailyCapFactor
          const cappedPis = pis * dailyCapFactor
          const cappedIfa = ifa * dailyCapFactor
          const selectedRawHours = selectedFront === 'CANALETAS' ? cappedCan : cappedPis
          const selectedHours = Math.min(personWorkdayHours, selectedRawHours)
          if (!(selectedHours > 0) && !(cappedIfa > 0)) return
          const specialtyCandidate = normalizeSpecialtyLabel(
            collab?.specialty,
            collab?.discipline || collab?.disciplina,
            collab?.position
          )
          const disciplineCandidate = inferDirectDiscipline({
            discipline: collab?.discipline || collab?.disciplina,
            specialty: specialtyCandidate,
            position: positionCandidate
          })
          const key = buildDirectFrontKey(disciplineCandidate, specialtyCandidate || disciplineCandidate, positionCandidate)
          const dotationForFront = resolvePersonDotationFromHours(selectedHours, workdaySource)
          // Regla negocio: IFA se declara en columna "INSTALACIÓN FAENA"
          // y se reparte mitad/mitad entre reportes CANALETAS y PISCINAS.
          const dotationForIfa = resolvePersonDotationFromHours(Math.min(personWorkdayHours, cappedIfa), workdaySource) / 2
          if (dotationForFront > 0) out[key] = Number(out[key] || 0) + dotationForFront
          if (dotationForIfa > 0) {
            outIfa[key] = Number(outIfa[key] || 0) + dotationForIfa
            const posKey = String(positionCandidate || '').trim().toUpperCase() || 'SIN CARGO'
            outIfaByPosition[posKey] = Number(outIfaByPosition[posKey] || 0) + dotationForIfa
          }
          perPersonDebug.push({
            collaboratorId: pid,
            position: positionCandidate,
            specialty: specialtyCandidate,
            canHours: can,
            pisHours: pis,
            ifaHours: ifa,
            selectedRawHours,
            selectedHours,
            dotationForFront,
            dotationForIfa,
            key
          })
        })
        if (false) console.log('[daily-report][excel-v2][direct-front-debug]', {
          reportId: String(report?.id || ''),
          reportDate: day,
          reportFront,
          selectedFront,
          reportsUsed: debugReports.length,
          participantsWithHours: Array.from(personFrontHours.keys()),
          byRowKey: out,
          ifaByRowKey: outIfa,
          ifaByPosition: outIfaByPosition,
          reports: debugReports,
          personHours: perPersonDebug
        })
        return {
          values: out,
          ifaValues: outIfa,
          ifaValuesByPosition: outIfaByPosition,
          hasEvidence: personFrontHours.size > 0
        }
      })()
      if (false) console.log('[daily-report][excel-v2][audit-start]', {
        reportId: String(report?.id || ''),
        reportNo: String(report?.report_no || ''),
        reportDate: String(report?.report_date || ''),
        template: exportTemplate,
        calculationVersion,
        personWorkdayHours,
        machineWorkdayHours,
        halfDayHours
      })
      const normalizeDetailRowSnapshot = (item: any, fallbackSpecialty = '') => {
        const rawFrente = toNum(item?.frente)
        const rawNocFront = toNum(item?.nocFront)
        const dynamicFrontValues = Array.isArray(item?.dynamicFrontValues)
          ? item.dynamicFrontValues.map((value: any) => toNum(value))
          : []
        const rawDotacionTotalObra = toNum(item?.dotacionTotalObra)
        const rawInstalacionFaena = toNum(item?.instalacionFaena ?? item?.front1)
        const rawHhTotalObra = toNum(item?.hhTotalObra)
        const positionText = String(item?.position || 'SIN CARGO').trim() || 'SIN CARGO'
        const normalizedPosition = normalizeText(positionText)
        const isSpecialIndirectRole =
          normalizedPosition.includes('topografo') ||
          normalizedPosition.includes('alarife') ||
          normalizedPosition.includes('mecanico mantencion') ||
          normalizedPosition.includes('electrico mantencion')
        const isPrevencionistaRole = normalizedPosition.includes('prevencionista')
        const specialRoleExcelFrontValue = getSpecialRoleExcelFrontValue(getSpecialFrontRole(positionText))
        const baseDotacion = Math.max(
          0,
          (
            toNum(item?.contratados) -
            toNum(item?.apoyoOficina) -
            toNum(item?.descansoCambioTurno) -
            toNum(item?.permisoCovid)
          ) / 2
        )
        const hasPersistedFrontValues =
          rawInstalacionFaena > 0 ||
          rawFrente > 0 ||
          rawDotacionTotalObra > 0 ||
          rawHhTotalObra > 0
        const isDirectDetail = String(fallbackSpecialty || '').trim() !== ''
        const persistedTotal = rawDotacionTotalObra > 0
          ? rawDotacionTotalObra
          : rawInstalacionFaena + rawFrente
        const fallbackTotal = !hasPersistedFrontValues && specialRoleExcelFrontValue != null
          ? specialRoleExcelFrontValue
          : (persistedTotal > 0 ? persistedTotal : baseDotacion)
        const persistedPrevencionistaTotal =
          isPrevencionistaRole && rawInstalacionFaena <= 0 && rawFrente <= 0
            ? (rawDotacionTotalObra > 0 ? rawDotacionTotalObra : resolvePersonDotationFromHours(rawHhTotalObra, workdaySource))
            : 0
        const shouldForceFrontColumn = isDirectDetail || isSpecialIndirectRole || isPrevencionistaRole
        // En V2, si la fila ya viene persistida con distribución visible, no recalcular
        // desde presencia especial para evitar desfases contra el subtotal en pantalla.
        const hasFieldReportSpecialValue =
          !hasPersistedFrontValues &&
          isSpecialIndirectRole &&
          specialRoleExcelFrontValue != null
        const instalacionFaena = hasFieldReportSpecialValue
          ? 0
          : shouldForceFrontColumn
            ? 0
            : (hasPersistedFrontValues ? rawInstalacionFaena : fallbackTotal)
        const frente = hasFieldReportSpecialValue
          ? specialRoleExcelFrontValue
          : isPrevencionistaRole && persistedPrevencionistaTotal > 0
            ? persistedPrevencionistaTotal
            : shouldForceFrontColumn
              ? (hasPersistedFrontValues ? rawFrente : fallbackTotal)
            : (hasPersistedFrontValues ? rawFrente : 0)
        const dotacionTotalObra = hasFieldReportSpecialValue
          ? specialRoleExcelFrontValue
          : isPrevencionistaRole && persistedPrevencionistaTotal > 0
            ? persistedPrevencionistaTotal
          : hasPersistedFrontValues
            ? (rawDotacionTotalObra > 0 ? rawDotacionTotalObra : instalacionFaena + frente)
            : instalacionFaena + frente
        const hhTotalObra = hasFieldReportSpecialValue
          ? specialRoleExcelFrontValue * personWorkdayHours
          : isPrevencionistaRole && persistedPrevencionistaTotal > 0
            ? persistedPrevencionistaTotal * personWorkdayHours
          : hasPersistedFrontValues
            ? (rawHhTotalObra > 0 ? rawHhTotalObra : dotacionTotalObra * personWorkdayHours)
            : dotacionTotalObra * personWorkdayHours
        return {
        discipline: String(item?.discipline || item?.specialty || fallbackSpecialty || '').trim(),
        specialty: String(item?.specialty || item?.discipline || fallbackSpecialty || '').trim() || fallbackSpecialty,
        position: positionText,
        hhTurnoDia: displayHhTurnoDia(item?.hhTurnoDia),
        contratados: toNum(item?.contratados),
        contratacionProceso: toNum(item?.contratacionProceso),
        apoyoOficina: toNum(item?.apoyoOficina),
        descansoCambioTurno: toNum(item?.descansoCambioTurno),
        permisoCovid: toNum(item?.permisoCovid),
        renunciaVoluntaria: toNum(item?.renunciaVoluntaria),
        terminoContrato: toNum(item?.terminoContrato),
        enCurso3d: toNum(item?.enCurso3d),
        capacitacionAcreditacion: toNum(item?.capacitacionAcreditacion),
        teletrabajo: toNum(item?.teletrabajo),
        pruebaPractica: toNum(item?.pruebaPractica),
        ofertaComercial: toNum(item?.ofertaComercial),
        instalacionFaena,
        frente,
        nocFront: rawNocFront,
        dynamicFrontValues,
        dotacionTotalObra,
        hhTotalObra
        }
      }
      const normalizeDetailRowSnapshotStrict = (item: any, fallbackSpecialty = '') => {
        const instalacionFaena = toNum(item?.instalacionFaena ?? item?.front1)
        const frente = toNum(item?.frente ?? item?.front2)
        const nocFront = toNum(item?.nocFront)
        const dynamicFrontValues = Array.isArray(item?.dynamicFrontValues)
          ? item.dynamicFrontValues.map((value: any) => toNum(value))
          : []
        const dotacionTotalObra = toNum(item?.dotacionTotalObra ?? (instalacionFaena + frente))
        const hhTotalObra = toNum(item?.hhTotalObra ?? (dotacionTotalObra * personWorkdayHours))
        return {
          discipline: String(item?.discipline || item?.specialty || fallbackSpecialty || '').trim(),
          specialty: String(item?.specialty || item?.discipline || fallbackSpecialty || '').trim() || fallbackSpecialty,
          position: String(item?.position || 'SIN CARGO').trim() || 'SIN CARGO',
          hhTurnoDia: displayHhTurnoDia(item?.hhTurnoDia),
          contratados: toNum(item?.contratados),
          contratacionProceso: toNum(item?.contratacionProceso),
          apoyoOficina: toNum(item?.apoyoOficina),
          descansoCambioTurno: toNum(item?.descansoCambioTurno),
          permisoCovid: toNum(item?.permisoCovid),
          renunciaVoluntaria: toNum(item?.renunciaVoluntaria),
          terminoContrato: toNum(item?.terminoContrato),
          enCurso3d: toNum(item?.enCurso3d),
          capacitacionAcreditacion: toNum(item?.capacitacionAcreditacion),
          teletrabajo: toNum(item?.teletrabajo),
          pruebaPractica: toNum(item?.pruebaPractica),
          ofertaComercial: toNum(item?.ofertaComercial),
          instalacionFaena,
          frente,
          nocFront,
          dynamicFrontValues,
          dotacionTotalObra,
          hhTotalObra
        }
      }
      const normalizeEquipmentRowSnapshot = (item: any) => {
        const hmTurnoDia = toNum(item?.hmTurnoDia) || machineWorkdayHours
        const instalacionFaena = toNum(item?.instalacionFaena ?? item?.front1)
        const mainFront = toNum(item?.mainFront ?? item?.front2)
        const nocFront = toNum(item?.nocFront)
        const dynamicFrontValues = Array.isArray(item?.dynamicFrontValues)
          ? item.dynamicFrontValues.map((value: any) => toNum(value))
          : []
        const dynamicFrontTotal = dynamicFrontValues.length > 0
          ? dynamicFrontValues.reduce((acc: number, value: number) => acc + toNum(value), 0)
          : nocFront
        const totalEqMaq = toNum(item?.totalEqMaq ?? item?.totalEqObra ?? (instalacionFaena + mainFront + dynamicFrontTotal))
        return {
          name: String(item?.name || item?.equipment || '').trim(),
          hmTurnoDia,
          totalEquipos: toNum(item?.totalEquipos),
          operacion: toNum(item?.operacion),
          disponibles: toNum(item?.disponibles),
          acredMant: toNum(item?.acredMant ?? item?.acreditacionMantencion),
          panne: toNum(item?.panne),
          ofCentral: toNum(item?.ofCentral ?? item?.oficinaFuera),
          instalacionFaena,
          mainFront,
          nocFront,
          dynamicFrontValues,
          totalEqMaq,
          hmTotal: toNum(item?.hmTotal ?? (totalEqMaq * hmTurnoDia))
        }
      }

      const hasDynamicNocColumnFlag = (() => {
        const rawFlag =
          (report as any)?.v2_has_noc_front_column ??
          runtime?.v2_has_noc_front_column ??
          snap?.v2_has_noc_front_column ??
          notes?.v2_has_noc_front_column
        if (typeof rawFlag === 'boolean') return rawFlag
        if (typeof rawFlag === 'number') return rawFlag > 0
        const txt = String(rawFlag ?? '').trim().toLowerCase()
        return txt === '1' || txt === 'true' || txt === 'si' || txt === 'sí'
      })()
      const hasPositiveNocFront = (value: any) => {
        const n = Number(String(value ?? '').replace(',', '.'))
        return Number.isFinite(n) && n > 0
      }
      const parseDynamicFrontColumns = (value: any): Array<{ key: string; label: string }> => {
        const raw = (() => {
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
        })()
        return raw
          .map((column: any) => ({
            key: String(column?.key || column?.label || '').trim(),
            label: String(column?.label || '').replace(/\s+/g, ' ').trim()
          }))
          .filter((column) => column.key && column.label)
      }
      const parseDynamicFrontColumnsByBlock = (value: any): Record<'CANALETAS' | 'PISCINAS', Array<{ key: string; label: string }>> | null => {
        const raw = (() => {
          if (value && typeof value === 'object' && !Array.isArray(value)) return value
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value)
              return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
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
      const persistedDynamicFrontColumns = parseDynamicFrontColumns(
        (report as any)?.v2_dynamic_front_columns ??
        runtime?.v2_dynamic_front_columns ??
        snap?.v2_dynamic_front_columns ??
        notes?.v2_dynamic_front_columns
      )
      const persistedDynamicFrontColumnsByBlock = parseDynamicFrontColumnsByBlock(
        (report as any)?.v2_dynamic_front_columns_by_block ??
        runtime?.v2_dynamic_front_columns_by_block ??
        snap?.v2_dynamic_front_columns_by_block ??
        notes?.v2_dynamic_front_columns_by_block
      )
      const splitPersistedDynamicColumns = (columns: Array<{ key: string; label: string }>) => {
        const firstCount = Math.ceil(columns.length / 2)
        return {
          CANALETAS: columns.slice(0, firstCount),
          PISCINAS: columns.slice(firstCount)
        }
      }
      const dynamicFrontColumnsForExport = persistedDynamicFrontColumnsByBlock
        ? persistedDynamicFrontColumnsByBlock[reportFront]
        : splitPersistedDynamicColumns(persistedDynamicFrontColumns)[reportFront]
      const strictVisibleRowsHaveNocFront = (() => {
        if (!strictVisibleMode) return false
        const indirect = pickArray('v2_detail_indirect_rows', 'detail_indirect_rows')
        const direct = pickArray('v2_detail_direct_rows', 'detail_direct_rows')
        const major = pickArray('v2_detail_major_equipment_rows', 'detail_major_equipment_rows')
        const minor = pickArray('v2_detail_minor_equipment_rows', 'detail_minor_equipment_rows')
        return [...indirect, ...direct, ...major, ...minor].some((row: any) => hasPositiveNocFront(row?.nocFront))
      })()
      const hasDynamicNocColumn = strictVisibleMode
        ? (dynamicFrontColumnsForExport.length > 0 || hasDynamicNocColumnFlag || strictVisibleRowsHaveNocFront)
        : (dynamicFrontColumnsForExport.length > 0 || hasDynamicNocColumnFlag)
      const rawNocFrontLabel = String(
        (report as any)?.v2_noc_front_column_label ??
        runtime?.v2_noc_front_column_label ??
        snap?.v2_noc_front_column_label ??
        notes?.v2_noc_front_column_label ??
        ''
      ).trim()
      const extractNocLabelForFrontHeader = (value: any) => {
        const raw = String(value || '').trim()
        if (!raw) return ''
        const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const fullLabelMatch = normalized.match(/USO\s+DE\s+RECURSOS\s+NOC\s+N[º°]?\s*\d+.*$/i)
        if (fullLabelMatch) {
          return String(fullLabelMatch[0] || '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^USO\s+DE\s+RECURSOS/i, 'UDR')
        }
        const codeMatch = normalized.match(/NOC\s+N[º°]?\s*0*(\d+)/i)
        const num = String(codeMatch?.[1] || '').trim()
        return num ? `UDR NOC Nº${num.padStart(3, '0')}` : ''
      }
      const isNocReportForFrontHeader = (fieldReport: any) => {
        const label = [
          fieldReport?.work_front,
          fieldReport?.front,
          fieldReport?.frente,
          fieldReport?.area,
          fieldReport?.work_area,
          fieldReport?.report_title,
          fieldReport?.crew_name
        ].map((x) => String(x || '')).join(' ')
        return Boolean(extractNocLabelForFrontHeader(label))
      }
      const extractNocLabelFromReportForFrontHeader = (fieldReport: any) => {
        const direct =
          extractNocLabelForFrontHeader(fieldReport?.work_front || fieldReport?.front || fieldReport?.frente || '') ||
          extractNocLabelForFrontHeader(fieldReport?.report_title || '') ||
          extractNocLabelForFrontHeader(fieldReport?.area || fieldReport?.work_area || '') ||
          extractNocLabelForFrontHeader(fieldReport?.crew_name || '')
        if (direct) return direct
        try {
          return extractNocLabelForFrontHeader(JSON.stringify(fieldReport))
        } catch {
          return ''
        }
      }
      const nocFrontAssignmentByReportId = (() => {
        const map = new Map<string, 'CANALETAS' | 'PISCINAS'>()
        ;(fieldReportsForSpecialRoles || [])
          .filter((fieldReport: any) => isNocReportForFrontHeader(fieldReport))
          .map((fieldReport: any, idx: number) => ({
            idx,
            id: String(fieldReport?.id || '').trim(),
            reportNo: Number(fieldReport?.report_no || 0) || 0,
            createdAt: String(fieldReport?.created_at || '')
          }))
          .sort((a, b) => {
            if (a.reportNo !== b.reportNo) return a.reportNo - b.reportNo
            return a.createdAt.localeCompare(b.createdAt)
          })
          .forEach((row, idx) => {
            if (!row.id) return
            map.set(row.id, idx === 0 ? 'CANALETAS' : 'PISCINAS')
          })
        return map
      })()
      const resolveNocFrontLabel = () => {
        const byId = new Map<string, any>()
        ;(fieldReportsForSpecialRoles || []).forEach((fieldReport: any) => {
          const id = String(fieldReport?.id || '').trim()
          if (id) byId.set(id, fieldReport)
        })
        const labelsFromSources = sourceIds
          .map((sourceId: string) => {
            const id = String(sourceId || '').trim()
            const assignedFront = nocFrontAssignmentByReportId.get(id)
            if (assignedFront && assignedFront !== reportFront) return ''
            const fieldReport = byId.get(id)
            if (!fieldReport) return ''
            return extractNocLabelFromReportForFrontHeader(fieldReport)
          })
          .filter(Boolean)
        if (labelsFromSources.length > 0) return Array.from(new Set(labelsFromSources)).join(' / ').trim()

        const rawParts = rawNocFrontLabel
          .split(/\s*\/\s*/)
          .map((part) => part.trim())
          .filter(Boolean)
        if (rawParts.length > 1) return rawParts[reportFront === 'PISCINAS' ? 1 : 0] || rawParts[0] || 'UDR NOC'
        return rawNocFrontLabel || 'UDR NOC'
      }
      const nocFrontLabel = resolveNocFrontLabel()
      const dynamicFrontLabels = dynamicFrontColumnsForExport.length > 0
        ? dynamicFrontColumnsForExport.map((column) => column.label)
        : (hasDynamicNocColumn ? [nocFrontLabel] : [])
      const dynamicFrontCount = dynamicFrontLabels.length
      const getDynamicFrontValuesForExport = (item: any, count: number) => {
        const values = Array.isArray(item?.dynamicFrontValues)
          ? item.dynamicFrontValues.map((value: any) => toNum(value))
          : []
        if (values.length > 0) {
          return Array.from({ length: count }).map((_, idx) => toNum(values[idx]))
        }
        return Array.from({ length: count }).map((_, idx) => idx === 0 ? toNum(item?.nocFront) : 0)
      }
      const addDynamicFrontValuesForExport = (target: any, source: any) => {
        const current = Array.isArray(target.dynamicFrontValues)
          ? target.dynamicFrontValues.map((value: any) => toNum(value))
          : Array.from({ length: dynamicFrontCount }).map(() => 0)
        const incoming = getDynamicFrontValuesForExport(source, dynamicFrontCount)
        target.dynamicFrontValues = Array.from({ length: dynamicFrontCount }).map((_, idx) => toNum(current[idx]) + toNum(incoming[idx]))
      }
      const wb = new ExcelJS.Workbook()
      wb.calcProperties.fullCalcOnLoad = true
      const ws = wb.addWorksheet('Reporte diario V2')
      const totalCols = 30 + dynamicFrontCount * 2
      const EQUIP_START_COL = 19 + dynamicFrontCount
      const EQUIP_HEADERS_START_COL = EQUIP_START_COL + 1
      const MAQ_START_COL = EQUIP_HEADERS_START_COL + 7
      const MAQ_FRONT_COLS = 2 + dynamicFrontCount
      const MAQ_TOTAL_EQ_COL = MAQ_START_COL + MAQ_FRONT_COLS
      const MAQ_HM_TOTAL_COL = MAQ_TOTAL_EQ_COL + 1
      const PERSONAL_FRONT_GROUP_END_COL = 16 + dynamicFrontCount
      const PERSONAL_DOT_TOTAL_COL = 17 + dynamicFrontCount
      const PERSONAL_HH_TOTAL_COL = 18 + dynamicFrontCount
      ws.views = [{ showGridLines: false }]
      ws.columns = Array.from({ length: totalCols }).map((_, idx) => {
        const col = idx + 1
        const isWideLabelCol = col === 1 || col === EQUIP_START_COL
        const isSlimRequestedRange = (col >= 2 && col <= 19) || (col >= 21 && col <= 32)
        return {
          width: isWideLabelCol ? 26 : (isSlimRequestedRange ? 7 : 8)
        }
      })
      const borderThin = { style: 'thin' as const, color: { argb: 'FF111111' } }
      const borderAll = { top: borderThin, left: borderThin, right: borderThin, bottom: borderThin }
      const blueFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F3B8F' } }
      const softFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } }
      const whiteFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } }
      const whiteFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }
      const titleBlueFont = { color: { argb: 'FF173B8F' }, bold: true }
      const setCell = (row: number, col: number, value: any, opts?: any) => {
        const c = ws.getCell(row, col)
        c.value = value
        c.border = borderAll
        c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
        if (opts?.fill) c.fill = opts.fill
        if (opts?.font) c.font = opts.font
        const formulaResult = value && typeof value === 'object' && 'formula' in value ? Number((value as any).result) : NaN
        const numericValue = typeof value === 'number' ? value : formulaResult
        if (Number.isFinite(numericValue)) c.numFmt = opts?.numFmt || (Number.isInteger(numericValue) ? '0' : '0.0')
        if (opts?.numFmt) c.numFmt = opts.numFmt
        if (opts?.alignment) c.alignment = { ...c.alignment, ...opts.alignment }
        return c
      }
      const merge = (r1: number, c1: number, r2: number, c2: number) => ws.mergeCells(r1, c1, r2, c2)
      const sectionTitle = (row: number, text: string) => {
        merge(row, 1, row, totalCols)
        setCell(row, 1, text, { fill: blueFill, font: whiteFont, alignment: { horizontal: 'left', vertical: 'middle' } })
      }

      const fmtCode = String((notes as any)?.report_format_code || pickText('report_format_code', 'ANT-GPRO-FOR'))
      const title = `DAILY REPORT N°${String(report?.report_no || '-')}`
      merge(1, 1, 1, totalCols)
      setCell(1, 1, title, { fill: whiteFill, font: { ...titleBlueFont, size: 16 }, alignment: { horizontal: 'center', vertical: 'middle' } })
      merge(2, 1, 2, totalCols)
      setCell(2, 1, fmtCode, { fill: whiteFill, font: { ...titleBlueFont, size: 14 }, alignment: { horizontal: 'center', vertical: 'middle' } })
      merge(3, 1, 3, totalCols)
      setCell(3, 1, `REV ${String(report?.revision || '0')} ${latamDate(report?.report_date)}`, { fill: whiteFill, font: { ...titleBlueFont, size: 13 }, alignment: { horizontal: 'center', vertical: 'middle' } })
      ws.getRow(1).height = 24
      ws.getRow(2).height = 21
      ws.getRow(3).height = 19

      let row = 4
      merge(row, 1, row, 2); setCell(row, 1, 'Informe N°', { fill: whiteFill, font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 3, row, 10); setCell(row, 3, String(report?.report_no || '-'), { alignment: { horizontal: 'left', vertical: 'middle' } })
      setCell(row, 11, 'Rev', { fill: whiteFill, font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 12, row, 20); setCell(row, 12, String(report?.revision || '0'), { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 21, row, 23); setCell(row, 21, 'Fecha asistencia', { fill: whiteFill, font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 24, row, totalCols); setCell(row, 24, latamDate(report?.report_date), { alignment: { horizontal: 'left', vertical: 'middle' } })
      ws.getRow(row).height = 27

      row = 5
      sectionTitle(row, '1.- INFORMACIÓN GENERAL')
      row += 1
      // Bloque izquierdo de datos generales y panel derecho de cuenta/clima.
      const infoPairs: Array<[string, string]> = [
        ['Nombre del Contrato', String(report?.contract_title || '-')],
        ['Nombre Empresa', String(report?.contractor_name || '-')],
        ['N° Contrato', String(report?.contract_number || '-')],
        ['Responsable de Terreno', String((notes as any)?.site_responsible || report?.site_responsible || '-')]
      ]
      const weatherKey = normalizeText((notes as any)?.weather_v2 || report?.weather_label || '')
      const weatherLabels = ['Sol', 'Nieve', 'Lluvia', 'Tiempo Frío', 'Viento']
      const weatherMarks = ['☀', '❄', '☂', '☁', '≋']
      const isWeatherSelected = (label: string) => {
        const n = normalizeText(label)
        return weatherKey === n || weatherKey.includes(n)
      }
      const leftLabelStart = 1
      const leftLabelEnd = 5
      const leftValueStart = 6
      const leftValueEnd = 17
      const rightBlockStart = 18
      const rightBlockEnd = totalCols
      const infoStartRow = row

      for (let i = 0; i < infoPairs.length; i += 1) {
        const [label, value] = infoPairs[i]
        merge(row, leftLabelStart, row, leftLabelEnd)
        setCell(row, leftLabelStart, label, { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } })
        merge(row, leftValueStart, row, leftValueEnd)
        setCell(row, leftValueStart, value, { alignment: { horizontal: 'left', vertical: 'middle' } })
        ws.getRow(row).height = 28
        row += 1
      }
      // Panel derecho: cuenta proyecto + condiciones climáticas
      const rightTop = infoStartRow
      merge(rightTop, rightBlockStart, rightTop, rightBlockEnd)
      setCell(rightTop, rightBlockStart, 'CUENTA PROYECTO', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } })
      merge(rightTop + 1, rightBlockStart, rightTop + 1, rightBlockEnd)
      setCell(rightTop + 1, rightBlockStart, String((notes as any)?.project_account || '-'), { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(rightTop + 2, rightBlockStart, rightTop + 2, rightBlockEnd)
      setCell(rightTop + 2, rightBlockStart, 'Condiciones Climáticas', { font: { bold: true, size: 12, color: { argb: 'FF0F3B8F' } }, alignment: { horizontal: 'center', vertical: 'middle' } })
      const weatherRow = rightTop + 3
      const weatherGroups = [
        { start: 18, end: 19 },
        { start: 20, end: 21 },
        { start: 22, end: 24 },
        { start: 25, end: 27 },
        { start: 28, end: totalCols }
      ]
      for (let i = 0; i < 5; i += 1) {
        const { start: colStart, end: colEnd } = weatherGroups[i]
        const label = weatherLabels[i]
        const selected = isWeatherSelected(label)
        merge(weatherRow, colStart, weatherRow, colEnd)
        setCell(weatherRow, colStart, `${weatherMarks[i]}\n${label}`, {
          alignment: { horizontal: 'center', vertical: 'middle' },
          fill: selected ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5EDFF' } } : undefined,
          font: selected ? { bold: true, color: { argb: 'FF0F5CC0' } } : undefined
        })
      }
      ws.getRow(weatherRow).height = 46

      row += 1
      sectionTitle(row, '2.- RESUMEN DE PERSONAL Y EQUIPOS')
      row += 1
      merge(row, 1, row, 15); setCell(row, 1, 'RESUMEN PERSONAL', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center' } })
      merge(row, 16, row, totalCols); setCell(row, 16, 'RESUMEN EQUIPOS Y VEHÍCULOS', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center' } })
      row += 1
      merge(row, 1, row, 7); setCell(row, 1, 'Tipo', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center' } })
      merge(row, 8, row, 11); setCell(row, 8, 'Dotación', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center' } })
      merge(row, 12, row, 15); setCell(row, 12, 'HH', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center' } })
      merge(row, 16, row, 22); setCell(row, 16, 'Tipo', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center' } })
      merge(row, 23, row, 27); setCell(row, 23, 'Total', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center' } })
      merge(row, 28, row, totalCols); setCell(row, 28, 'HM', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center' } })
      row += 1
      const parseNum = (value: any) => {
        const n = Number(String(value ?? '').replace(',', '.'))
        return Number.isFinite(n) ? n : 0
      }
      const visibleDotacionFromRow = (item: any) => {
        const splitDot =
          parseNum(item?.instalacionFaena) +
          parseNum(item?.frente) +
          parseNum(item?.nocFront)
        if (splitDot > 0) return splitDot
        return parseNum(item?.dotacionTotalObra)
      }
      const visibleHhFromRow = (item: any) => {
        const splitDot = visibleDotacionFromRow(item)
        if (splitDot > 0) return splitDot * personWorkdayHours
        return parseNum(item?.hhTotalObra)
      }
      const sumDotacionTotalObra = (rows: any[]) =>
        Number((rows || []).reduce((acc, item) => acc + visibleDotacionFromRow(item), 0).toFixed(2))
      const sumHhTotalObra = (rows: any[]) =>
        Number((rows || []).reduce((acc, item) => acc + visibleHhFromRow(item), 0).toFixed(2))
      const formatNumber = (value: any) => {
        if (value == null) return '-'
        if (typeof value === 'string' && value.trim() === '') return ''
        const n = Number(String(value).replace(',', '.'))
        if (!Number.isFinite(n)) return value ?? ''
        if (Math.abs(n) < 0.000001) return '-'
        const rounded = Number(n.toFixed(1))
        return rounded
      }
      const displayExcelNumber = (value: any) => {
        if (value == null) return '-'
        if (typeof value === 'string' && value.trim() === '') return '-'
        return formatNumber(value) || '-'
      }
      const excelColumnLetter = (col: number) => {
        let n = col
        let letter = ''
        while (n > 0) {
          const rem = (n - 1) % 26
          letter = String.fromCharCode(65 + rem) + letter
          n = Math.floor((n - 1) / 26)
        }
        return letter
      }
      const sumFormulaValue = (col: number, startRow: number, endRow: number, result: any) => {
        const total = formatNumber(result)
        if (startRow > endRow) return total
        const colLetter = excelColumnLetter(col)
        const sum = `SUM(${colLetter}${startRow}:${colLetter}${endRow})`
        return {
          formula: `IF(${sum}=0,"-",${sum})`,
          result: total === '-' ? '-' : total
        }
      }

      const savedIndirectRowsForSummary = pickArray('v2_detail_indirect_rows', 'detail_indirect_rows')
        .map((item: any) => strictVisibleMode ? normalizeDetailRowSnapshotStrict(item) : normalizeDetailRowSnapshot(item))
        .filter((item: any) => strictVisibleMode ? true : (item.position && normalizeText(item.position) !== 'sin cargo'))
      const savedDirectRowsForSummary = pickArray('v2_detail_direct_rows', 'detail_direct_rows')
        .map((item: any) => strictVisibleMode ? normalizeDetailRowSnapshotStrict(item, String(item?.specialty || item?.discipline || '').trim()) : normalizeDetailRowSnapshot(item, String(item?.specialty || item?.discipline || '').trim()))
        .filter((item: any) => strictVisibleMode ? true : (item.position && normalizeText(item.position) !== 'sin cargo'))
      const shouldUseDetailSummary =
        exportTemplate === 'daily_v2' &&
        !strictVisibleMode &&
        (savedIndirectRowsForSummary.length > 0 || savedDirectRowsForSummary.length > 0)

      const computedIndirectDot = shouldUseDetailSummary ? sumDotacionTotalObra(savedIndirectRowsForSummary) : parseNum(pick('summary_indirect_dotation'))
      const computedDirectDot = shouldUseDetailSummary ? sumDotacionTotalObra(savedDirectRowsForSummary) : parseNum(pick('summary_direct_dotation'))
      const computedIndirectHh = shouldUseDetailSummary ? sumHhTotalObra(savedIndirectRowsForSummary) : parseNum(pick('summary_indirect_hh'))
      const computedDirectHh = shouldUseDetailSummary ? sumHhTotalObra(savedDirectRowsForSummary) : parseNum(pick('summary_direct_hh'))
      const computedTotalDot = Number((computedIndirectDot + computedDirectDot).toFixed(2))
      const computedTotalHh = Number((computedIndirectHh + computedDirectHh).toFixed(2))

      const summaryRows = [
        ['INDIRECTO', computedIndirectDot, computedIndirectHh, 'MAYORES', pick('equip_major_qty'), pick('equip_major_hm')],
        ['DIRECTO', computedDirectDot, computedDirectHh, 'MENORES Y MOV.', pick('equip_minor_qty'), pick('equip_minor_hm')],
        ['TOTAL', computedTotalDot, computedTotalHh, 'TOTAL', pick('equip_total_qty'), pick('equip_total_hm')]
      ]
      summaryRows.forEach(([tipo, dot, hh, tipoEq, qty, hm]) => {
        const isTotal = String(tipo) === 'TOTAL'
        const rowFill = isTotal ? blueFill : undefined
        const rowFont = isTotal ? { color: { argb: 'FFFFFFFF' }, bold: true } : undefined

        merge(row, 1, row, 7); setCell(row, 1, tipo, { font: rowFont || { bold: false }, fill: rowFill })
        merge(row, 8, row, 11); setCell(row, 8, formatNumber(dot), { alignment: { horizontal: 'center' }, font: rowFont || { bold: true }, fill: rowFill })
        merge(row, 12, row, 15); setCell(row, 12, formatNumber(hh), { alignment: { horizontal: 'center' }, font: rowFont || { bold: true }, fill: rowFill })
        merge(row, 16, row, 22); setCell(row, 16, tipoEq, { font: rowFont || { bold: false }, fill: rowFill })
        merge(row, 23, row, 27); setCell(row, 23, formatNumber(qty), { alignment: { horizontal: 'center' }, font: rowFont || { bold: true }, fill: rowFill })
        merge(row, 28, row, totalCols); setCell(row, 28, formatNumber(hm), { alignment: { horizontal: 'center' }, font: rowFont || { bold: true }, fill: rowFill })
        ws.getRow(row).height = 22
        row += 1
      })

      const detailTotalCols = totalCols
      const greenFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFAEDFB1' } }
      const yellowFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE6E992' } }
      const nocHeaderFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF4A261' } }
      const nocDataFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF3E6' } }
      merge(row, 1, row, detailTotalCols)
      setCell(row, 1, '3.- DETALLE DE PERSONAL Y EQUIPOS', {
        fill: blueFill,
        font: whiteFont,
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      row += 1

      const hTop = row
      const hMid = row + 1
      const hBot = row + 2
      const setVertical = (col: number, text: string, fill: any = greenFill, fromRow = hMid, toRow = hBot) => {
        merge(fromRow, col, toRow, col)
        setCell(fromRow, col, text, {
          fill,
          font: { bold: true, size: 10, color: { argb: 'FF111111' } },
          alignment: {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true,
            textRotation: 90
          }
        })
      }

      for (let col = 1; col <= 14; col += 1) setCell(hTop, col, '', { fill: greenFill })
      merge(hTop, 1, hBot, 1)
      setCell(hTop, 1, 'PERSONAL', {
        fill: greenFill,
        font: { bold: true, size: 11 },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
      })
      const personalHeaders = [
        'HH TURNO/DÍA',
        'CONTRATADOS',
        'CONTRATACIÓN EN PROCESO',
        'APOYO/OFICINA CENTRAL',
        'DESCANSO / CAMBIO DE TURNO',
        'FALLA-LIC./VAC. / PERMISO/COVID 19',
        'RENUNCIA VOLUNTARIA',
        'TÉRMINO CONTRATO',
        'EN CURSO 3D',
        'CAPACITACIÓN / ACREDITACIÓN',
        'TELETRABAJO',
        'PRUEBA PRÁCTICA',
        'OFERTA COMERCIAL'
      ]
      personalHeaders.forEach((label, idx) => setVertical(2 + idx, label, greenFill, hTop, hBot))
      merge(hTop, 15, hTop, PERSONAL_FRONT_GROUP_END_COL)
      setCell(hTop, 15, 'DOTACIÓN POR FRENTE', {
        fill: yellowFill,
        font: { bold: true, size: 10 },
        alignment: { horizontal: 'center', vertical: 'middle' }
      })
      setVertical(15, 'INSTALACIÓN FAENA', yellowFill)
      setVertical(16, reportFront === 'PISCINAS' ? 'PISCINAS' : 'CANALETAS', yellowFill)
      dynamicFrontLabels.forEach((label, idx) => setVertical(17 + idx, label, nocHeaderFill))
      setVertical(PERSONAL_DOT_TOTAL_COL, 'DOTACIÓN TOTAL OBRA', yellowFill, hTop, hBot)
      setVertical(PERSONAL_HH_TOTAL_COL, 'HH TOTAL OBRA', yellowFill, hTop, hBot)
      for (let col = EQUIP_START_COL; col <= EQUIP_HEADERS_START_COL + 6; col += 1) setCell(hTop, col, '', { fill: greenFill })
      merge(hTop, EQUIP_START_COL, hBot, EQUIP_START_COL)
      setCell(hTop, EQUIP_START_COL, 'EQUIPOS', {
        fill: greenFill,
        font: { bold: true, size: 11 },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
      })
      const equipmentHeaders = [
        'HM TURNO/DÍA',
        'TOTAL EQUIPOS',
        'OPERACIÓN',
        'DISPONIBLES',
        'ACREDITACIÓN/MANTENCIÓN',
        'PANNE',
        'OF. CENTRAL / FUERA DE OBRA / ETC'
      ]
      equipmentHeaders.forEach((label, idx) => setVertical(EQUIP_HEADERS_START_COL + idx, label, greenFill, hTop, hBot))
      for (let col = MAQ_START_COL; col <= totalCols; col += 1) setCell(hTop, col, '', { fill: yellowFill })
      merge(hTop, MAQ_START_COL, hTop, MAQ_START_COL + MAQ_FRONT_COLS - 1)
      setCell(hTop, MAQ_START_COL, 'MAQUINARIA POR FRENTE', {
        fill: yellowFill,
        font: { bold: true, size: 10 },
        alignment: { horizontal: 'center', vertical: 'middle' }
      })
      setVertical(MAQ_START_COL, 'INSTALACIÓN FAENA', yellowFill)
      setVertical(MAQ_START_COL + 1, reportFront === 'PISCINAS' ? 'PISCINAS' : 'CANALETAS', yellowFill)
      dynamicFrontLabels.forEach((label, idx) => setVertical(MAQ_START_COL + 2 + idx, label, nocHeaderFill))
      setVertical(MAQ_TOTAL_EQ_COL, 'TOTAL EQUIPOS Y MAQUINARIA OBRA', yellowFill, hTop, hBot)
      setVertical(MAQ_HM_TOTAL_COL, 'HM TOTAL OBRA', yellowFill, hTop, hBot)
      ws.getRow(hTop).height = 26
      ws.getRow(hMid).height = 190
      ws.getRow(hBot).height = 22

      const majorEquipmentRows = [
        { name: 'Retroexcavadora PDGV-54', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Grua Horquilla RKRL-48', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0, mainFront: 0 },
        { name: 'Camion Pluma RGJD-42', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0, mainFront: 0 },
        { name: 'Camion Aljibe HSDC-63', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Camion Tolva TSJH-64', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Cargador Frontal VTCZ-83', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Excavadora TRSV-73', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Camion 3/4 VFHR-70', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Tracto Pluma TVFX-62', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 }
      ].map((item) => {
        const nocFront = Number((item as any).nocFront || 0)
        const totalEqMaq = Number(item.instalacionFaena || 0) + Number(item.mainFront || 0) + nocFront
        return { ...item, nocFront, totalEqMaq, hmTotal: totalEqMaq * Number(item.hmTurnoDia || 0) }
      })
      const savedMajorEquipmentRows = pickArray('v2_detail_major_equipment_rows', 'detail_major_equipment_rows')
        .map((item: any) => normalizeEquipmentRowSnapshot(item))
        .filter((item: any) => !!item.name)
      const majorEquipmentDisplayRows = savedMajorEquipmentRows.length > 0 ? savedMajorEquipmentRows : majorEquipmentRows
      const savedIndirectDetailRows = pickArray('v2_detail_indirect_rows', 'detail_indirect_rows')
        .map((item: any) => strictVisibleMode ? normalizeDetailRowSnapshotStrict(item) : normalizeDetailRowSnapshot(item))
        .filter((item: any) => strictVisibleMode ? true : (item.position && normalizeText(item.position) !== 'sin cargo'))
      const indirectDetailRows = savedIndirectDetailRows
      if (strictVisibleMode) {
        if (savedIndirectDetailRows.length === 0) {
          return NextResponse.json({ error: 'Exportación V2 cancelada: faltan filas visibles de personal indirecto (v2_detail_indirect_rows).' }, { status: 400 })
        }
        if (savedMajorEquipmentRows.length === 0) {
          return NextResponse.json({ error: 'Exportación V2 cancelada: faltan filas visibles de equipo mayor (v2_detail_major_equipment_rows).' }, { status: 400 })
        }
      }
      const maxDetailRows = Math.max(indirectDetailRows.length, majorEquipmentDisplayRows.length)
      row = hBot + 1
      merge(row, 1, row, PERSONAL_HH_TOTAL_COL)
      setCell(row, 1, '1.- PERSONAL INDIRECTO', {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } },
        font: { bold: true, color: { argb: 'FF0F3B8F' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      merge(row, EQUIP_START_COL, row, totalCols)
      setCell(row, EQUIP_START_COL, '1.- EQUIPO MAYOR DE CONSTRUCCIÓN', {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } },
        font: { bold: true, color: { argb: 'FF0F3B8F' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      ws.getRow(row).height = 20
      row += 1

      const indirectTotals = {
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
        instalacionFaena: 0,
        frente: 0,
        nocFront: 0,
        dotacionTotalObra: 0,
        hhTotalObra: 0
      }
      const majorTotals = {
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
        totalEqMaq: 0,
        hmTotal: 0
      }

      const indirectMajorStartRow = row
      for (let i = 0; i < maxDetailRows; i += 1) {
        const p = indirectDetailRows[i]
        const e = majorEquipmentDisplayRows[i]
        if (p) {
          indirectTotals.hhTurnoDia = Math.max(indirectTotals.hhTurnoDia, Number(p.hhTurnoDia || 0))
          ;([
            'contratados',
            'contratacionProceso',
            'apoyoOficina',
            'descansoCambioTurno',
            'permisoCovid',
            'renunciaVoluntaria',
            'terminoContrato',
            'enCurso3d',
            'capacitacionAcreditacion',
            'teletrabajo',
            'pruebaPractica',
            'ofertaComercial',
            'instalacionFaena',
            'frente',
            'nocFront',
            'dotacionTotalObra',
            'hhTotalObra'
          ] as const).forEach((key) => {
            indirectTotals[key] += Number(p[key] || 0)
          })
          addDynamicFrontValuesForExport(indirectTotals, p)
        }
        if (e) {
          ;([
            'hmTurnoDia',
            'totalEquipos',
            'operacion',
            'disponibles',
            'acredMant',
            'panne',
            'ofCentral',
            'instalacionFaena',
            'mainFront',
            'nocFront',
            'totalEqMaq',
            'hmTotal'
          ] as const).forEach((key) => {
            majorTotals[key] += Number(e[key] || 0)
          })
          addDynamicFrontValuesForExport(majorTotals, e)
        }

        const personalValues = p
          ? [
              p.position,
              p.hhTurnoDia,
              p.contratados,
              p.contratacionProceso,
              p.apoyoOficina,
              p.descansoCambioTurno,
              p.permisoCovid,
              p.renunciaVoluntaria,
              p.terminoContrato,
              p.enCurso3d,
              p.capacitacionAcreditacion,
              p.teletrabajo,
              p.pruebaPractica,
              p.ofertaComercial,
              displayExcelNumber(p.instalacionFaena),
              displayExcelNumber(p.frente),
              ...getDynamicFrontValuesForExport(p, dynamicFrontCount).map(displayExcelNumber),
              displayExcelNumber(p.dotacionTotalObra),
              displayExcelNumber(p.hhTotalObra)
            ]
          : Array(18 + dynamicFrontCount).fill('')
        if (p && i < 5) {
          const rawOriginal = savedIndirectDetailRows[i] || null
          const normalizedInst = Number(p.instalacionFaena || 0)
          const normalizedFrente = Number(p.frente || 0)
          const normalizedDotTotal = Number(p.dotacionTotalObra || 0)
          const excelColOValue = personalValues[14]
          if (false) console.log('[daily-report][excel-v2][audit-indirect-row]', {
            rowIndex: i,
            cargo: String(p.position || ''),
            dotacionTotalObra: normalizedDotTotal,
            frente: normalizedFrente,
            instalacionFaenaOriginal: rawOriginal ? rawOriginal?.instalacionFaena : null,
            instalacionFaenaNormalized: normalizedInst,
            excelColOValue
          })
        }
        const equipmentValues = e
          ? [
              String(e.name || '').toUpperCase(),
              e.hmTurnoDia,
              e.totalEquipos,
              e.operacion,
              e.disponibles,
              e.acredMant,
              e.panne,
              e.ofCentral,
              e.instalacionFaena,
              e.mainFront,
              ...getDynamicFrontValuesForExport(e, dynamicFrontCount),
              e.totalEqMaq,
              e.hmTotal
            ]
          : Array(12 + dynamicFrontCount).fill('')

        personalValues.forEach((value, idx) => {
          const excelCol = 1 + idx
          const isNocDynamicCell = dynamicFrontCount > 0 && excelCol >= 17 && excelCol < 17 + dynamicFrontCount
          setCell(row, 1 + idx, idx === 0 ? value : formatNumber(value), {
            alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' },
            font: { size: 10 },
            ...(isNocDynamicCell ? { fill: nocDataFill } : {})
          })
        })
        equipmentValues.forEach((value, idx) => {
          const excelCol = EQUIP_START_COL + idx
          const isNocDynamicCell = dynamicFrontCount > 0 && excelCol >= (MAQ_START_COL + 2) && excelCol < (MAQ_START_COL + 2 + dynamicFrontCount)
          setCell(row, EQUIP_START_COL + idx, idx === 0 ? value : formatNumber(value), {
            alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' },
            font: { size: 10 },
            ...(isNocDynamicCell ? { fill: nocDataFill } : {})
          })
        })
        ws.getRow(row).height = 17
        row += 1
      }
      const indirectMajorEndRow = row - 1

      const subtotalFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F3B8F' } }
      const totalLabelFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }
      const indirectTotalValues = [
        'TOTAL INDIRECTO',
        '',
        indirectTotals.contratados,
        indirectTotals.contratacionProceso,
        indirectTotals.apoyoOficina,
        indirectTotals.descansoCambioTurno,
        indirectTotals.permisoCovid,
        indirectTotals.renunciaVoluntaria,
        indirectTotals.terminoContrato,
        indirectTotals.enCurso3d,
        indirectTotals.capacitacionAcreditacion,
        indirectTotals.teletrabajo,
        indirectTotals.pruebaPractica,
        indirectTotals.ofertaComercial,
        indirectTotals.instalacionFaena,
        indirectTotals.frente,
        ...getDynamicFrontValuesForExport(indirectTotals, dynamicFrontCount),
        indirectTotals.dotacionTotalObra,
        indirectTotals.hhTotalObra
      ]
      const majorTotalValues = [
        'TOTAL E. MAYORES',
        majorTotals.hmTurnoDia,
        majorTotals.totalEquipos,
        majorTotals.operacion,
        majorTotals.disponibles,
        majorTotals.acredMant,
        majorTotals.panne,
        majorTotals.ofCentral,
        majorTotals.instalacionFaena,
        majorTotals.mainFront,
        ...getDynamicFrontValuesForExport(majorTotals, dynamicFrontCount),
        majorTotals.totalEqMaq,
        majorTotals.hmTotal
      ]
      indirectTotalValues.forEach((value, idx) => {
        const col = 1 + idx
        const cellValue = idx === 0 || value === ''
          ? value
          : sumFormulaValue(col, indirectMajorStartRow, indirectMajorEndRow, value)
        setCell(row, col, cellValue, {
          fill: idx === 0 ? totalLabelFill : subtotalFill,
          font: idx === 0 ? { bold: true, color: { argb: 'FF0F3B8F' } } : { bold: true, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' }
        })
      })
      majorTotalValues.forEach((value, idx) => {
        const col = EQUIP_START_COL + idx
        const cellValue = idx === 0
          ? value
          : sumFormulaValue(col, indirectMajorStartRow, indirectMajorEndRow, value)
        setCell(row, col, cellValue, {
          fill: subtotalFill,
          font: { bold: true, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' }
        })
      })
      ws.getRow(row).height = 22
      row += 1

      const savedDirectDetailRows = pickArray('v2_detail_direct_rows', 'detail_direct_rows')
        .map((item: any) => strictVisibleMode ? normalizeDetailRowSnapshotStrict(item, 'SIN ESPECIALIDAD') : normalizeDetailRowSnapshot(item, 'SIN ESPECIALIDAD'))
        .filter((item: any) => strictVisibleMode ? true : (item.position && normalizeText(item.position) !== 'sin cargo'))
      const directDetailRowsBase = savedDirectDetailRows
      if (strictVisibleMode && savedDirectDetailRows.length === 0) {
        return NextResponse.json({ error: 'Exportación V2 cancelada: faltan filas visibles de personal directo (v2_detail_direct_rows).' }, { status: 400 })
      }
      const directDetailRows = !strictVisibleMode && directFrontDotationByPosition.hasEvidence
        ? directDetailRowsBase.map((item: any) => {
            const key = buildDirectFrontKey(item.discipline, item.specialty || item.discipline, item.position)
            const frente = Number(directFrontDotationByPosition.values[key] || 0)
            const instalacionFaenaByKey = Number(directFrontDotationByPosition.ifaValues?.[key] || 0)
            const instalacionFaena = instalacionFaenaByKey
            const dotacionTotalObra = instalacionFaena + frente
            return {
              ...item,
              instalacionFaena,
              frente,
              dotacionTotalObra,
              hhTotalObra: dotacionTotalObra * personWorkdayHours
            }
          })
        : directDetailRowsBase
      const directDisplayRows: Array<{ type: 'group'; specialty: string } | ({ type: 'row' } & typeof directDetailRows[number])> = []
      let lastDirectSpecialty = ''
      directDetailRows.forEach((item) => {
        if (normalizeText(item.specialty) !== normalizeText(lastDirectSpecialty)) {
          directDisplayRows.push({ type: 'group', specialty: item.specialty })
          lastDirectSpecialty = item.specialty
        }
        directDisplayRows.push({ type: 'row', ...item })
      })
      if (directDisplayRows.length === 0) {
        directDisplayRows.push({ type: 'group', specialty: 'SIN PERSONAL DIRECTO' })
      }

      const minorEquipmentRows = [
        { name: 'Camioneta RSXY31', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Camioneta TGJK47', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Camioneta RRZT32', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Camioneta TGJK56', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Camioneta TYTL46', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'BUS PFXD84', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Rodillo RC', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Placa Comp 3500kg N°100341920599', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Placa Comp 5500kg N°11487266', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 2, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Placa Comp 5500kg N°11815737', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 2, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 },
        { name: 'Container', hmTurnoDia: machineWorkdayHours, totalEquipos: 25, operacion: 0, disponibles: 25, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 6, mainFront: 4 },
        { name: 'BUS SHYW97', hmTurnoDia: machineWorkdayHours, totalEquipos: 1, operacion: 0, disponibles: 1, acredMant: 0, panne: 0, ofCentral: 0, instalacionFaena: 0.5, mainFront: 0 }
      ].map((item) => {
        const nocFront = Number((item as any).nocFront || 0)
        const totalEqMaq = Number(item.instalacionFaena || 0) + Number(item.mainFront || 0) + nocFront
        return { ...item, nocFront, totalEqMaq, hmTotal: totalEqMaq * Number(item.hmTurnoDia || 0) }
      })
      const savedMinorEquipmentRows = pickArray('v2_detail_minor_equipment_rows', 'detail_minor_equipment_rows')
        .map((item: any) => normalizeEquipmentRowSnapshot(item))
        .filter((item: any) => !!item.name)
      if (strictVisibleMode && savedMinorEquipmentRows.length === 0) {
        return NextResponse.json({ error: 'Exportación V2 cancelada: faltan filas visibles de equipo menor (v2_detail_minor_equipment_rows).' }, { status: 400 })
      }
      const minorEquipmentDisplayRows = savedMinorEquipmentRows.length > 0 ? savedMinorEquipmentRows : minorEquipmentRows

      merge(row, 1, row, PERSONAL_HH_TOTAL_COL)
      setCell(row, 1, '2.- PERSONAL DIRECTO', {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } },
        font: { bold: true, color: { argb: 'FF0F3B8F' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      merge(row, EQUIP_START_COL, row, totalCols)
      setCell(row, EQUIP_START_COL, '2.- EQUIPO MENOR DE CONSTRUCCIÓN Y MOVILIZACIÓN', {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } },
        font: { bold: true, color: { argb: 'FF0F3B8F' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      ws.getRow(row).height = 20
      row += 1

      const directTotals: Record<string, number> = {
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
        instalacionFaena: 0,
        frente: 0,
        nocFront: 0,
        dotacionTotalObra: 0,
        hhTotalObra: 0
      }
      const minorTotals: Record<string, number> = {
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
        totalEqMaq: 0,
        hmTotal: 0
      }
      directDetailRows.forEach((p) => {
        directTotals.hhTurnoDia = Math.max(directTotals.hhTurnoDia, Number(p.hhTurnoDia || 0))
        ;([
          'contratados',
          'contratacionProceso',
          'apoyoOficina',
          'descansoCambioTurno',
          'permisoCovid',
          'renunciaVoluntaria',
          'terminoContrato',
          'enCurso3d',
          'capacitacionAcreditacion',
          'teletrabajo',
          'pruebaPractica',
          'ofertaComercial',
          'instalacionFaena',
          'frente',
          'nocFront',
          'dotacionTotalObra',
          'hhTotalObra'
        ] as const).forEach((key) => {
          directTotals[key] += Number(p[key] || 0)
        })
        addDynamicFrontValuesForExport(directTotals, p)
      })
      minorEquipmentDisplayRows.forEach((e) => {
        ;([
          'hmTurnoDia',
          'totalEquipos',
          'operacion',
          'disponibles',
          'acredMant',
          'panne',
          'ofCentral',
          'instalacionFaena',
          'mainFront',
          'nocFront',
          'totalEqMaq',
          'hmTotal'
        ] as const).forEach((key) => {
          minorTotals[key] += Number(e[key] || 0)
        })
        addDynamicFrontValuesForExport(minorTotals, e)
      })

      const maxDirectMinorRows = Math.max(directDisplayRows.length, minorEquipmentDisplayRows.length)
      const directMinorStartRow = row
      for (let i = 0; i < maxDirectMinorRows; i += 1) {
        const p = directDisplayRows[i]
        const e = minorEquipmentDisplayRows[i]
        if (p?.type === 'group') {
          merge(row, 1, row, PERSONAL_HH_TOTAL_COL)
          setCell(row, 1, `PERSONAL ${String(p.specialty || '').toUpperCase()}`, {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5C8' } },
            font: { bold: true, color: { argb: 'FFC75016' } },
            alignment: { horizontal: 'left', vertical: 'middle' }
          })
        } else if (p?.type === 'row') {
          const personalValues = [
            p.position,
            p.hhTurnoDia,
            p.contratados,
            p.contratacionProceso,
            p.apoyoOficina,
            p.descansoCambioTurno,
            p.permisoCovid,
            p.renunciaVoluntaria,
            p.terminoContrato,
            p.enCurso3d,
            p.capacitacionAcreditacion,
            p.teletrabajo,
            p.pruebaPractica,
            p.ofertaComercial,
            displayExcelNumber(p.instalacionFaena),
            displayExcelNumber(p.frente),
            ...getDynamicFrontValuesForExport(p, dynamicFrontCount).map(displayExcelNumber),
            displayExcelNumber(p.dotacionTotalObra),
            displayExcelNumber(p.hhTotalObra)
          ]
          personalValues.forEach((value, idx) => {
            const excelCol = 1 + idx
            const isNocDynamicCell = dynamicFrontCount > 0 && excelCol >= 17 && excelCol < 17 + dynamicFrontCount
            setCell(row, 1 + idx, idx === 0 ? value : formatNumber(value), {
              alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' },
              font: { size: 10 },
              ...(isNocDynamicCell ? { fill: nocDataFill } : {})
            })
          })
        } else {
          for (let col = 1; col <= PERSONAL_HH_TOTAL_COL; col += 1) setCell(row, col, '', { alignment: { horizontal: 'center', vertical: 'middle' } })
        }

        if (e) {
          const equipmentValues = [
            String(e.name || '').toUpperCase(),
            e.hmTurnoDia,
            e.totalEquipos,
            e.operacion,
            e.disponibles,
            e.acredMant,
            e.panne,
            e.ofCentral,
            e.instalacionFaena,
            e.mainFront,
            ...getDynamicFrontValuesForExport(e, dynamicFrontCount),
            e.totalEqMaq,
            e.hmTotal
          ]
          equipmentValues.forEach((value, idx) => {
            const excelCol = EQUIP_START_COL + idx
            const isNocDynamicCell = dynamicFrontCount > 0 && excelCol >= (MAQ_START_COL + 2) && excelCol < (MAQ_START_COL + 2 + dynamicFrontCount)
            setCell(row, EQUIP_START_COL + idx, idx === 0 ? value : formatNumber(value), {
              alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' },
              font: { size: 10 },
              ...(isNocDynamicCell ? { fill: nocDataFill } : {})
            })
          })
        } else {
          for (let col = EQUIP_START_COL; col <= totalCols; col += 1) setCell(row, col, '', { alignment: { horizontal: 'center', vertical: 'middle' } })
        }
        ws.getRow(row).height = 17
        row += 1
      }
      const directMinorEndRow = row - 1

      const directTotalValues = [
        'TOTAL DIRECTOS',
        '',
        directTotals.contratados,
        directTotals.contratacionProceso,
        directTotals.apoyoOficina,
        directTotals.descansoCambioTurno,
        directTotals.permisoCovid,
        directTotals.renunciaVoluntaria,
        directTotals.terminoContrato,
        directTotals.enCurso3d,
        directTotals.capacitacionAcreditacion,
        directTotals.teletrabajo,
        directTotals.pruebaPractica,
        directTotals.ofertaComercial,
        directTotals.instalacionFaena,
        directTotals.frente,
        ...getDynamicFrontValuesForExport(directTotals, dynamicFrontCount),
        directTotals.dotacionTotalObra,
        directTotals.hhTotalObra
      ]
      const minorTotalValues = [
        'TOTAL E. MENORES',
        minorTotals.hmTurnoDia,
        minorTotals.totalEquipos,
        minorTotals.operacion,
        minorTotals.disponibles,
        minorTotals.acredMant,
        minorTotals.panne,
        minorTotals.ofCentral,
        minorTotals.instalacionFaena,
        minorTotals.mainFront,
        ...getDynamicFrontValuesForExport(minorTotals, dynamicFrontCount),
        minorTotals.totalEqMaq,
        minorTotals.hmTotal
      ]
      directTotalValues.forEach((value, idx) => {
        const col = 1 + idx
        const cellValue = idx === 0 || value === ''
          ? value
          : sumFormulaValue(col, directMinorStartRow, directMinorEndRow, value)
        setCell(row, col, cellValue, {
          fill: idx === 0 ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8C8A8' } } : subtotalFill,
          font: idx === 0 ? { bold: true, color: { argb: 'FF0F3B8F' } } : { bold: true, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' }
        })
      })
      minorTotalValues.forEach((value, idx) => {
        const col = EQUIP_START_COL + idx
        const cellValue = idx === 0
          ? value
          : sumFormulaValue(col, directMinorStartRow, directMinorEndRow, value)
        setCell(row, col, cellValue, {
          fill: idx === 0 ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8C8A8' } } : subtotalFill,
          font: idx === 0 ? { bold: true, color: { argb: 'FF0F3B8F' } } : { bold: true, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' }
        })
      })
      ws.getRow(row).height = 22
      row += 1

      merge(row, 1, row, PERSONAL_HH_TOTAL_COL)
      setCell(row, 1, 'SUBCONTRATOS', {
        fill: softFill,
        font: { bold: true, color: { argb: 'FF222222' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      merge(row, EQUIP_START_COL, row, totalCols)
      setCell(row, EQUIP_START_COL, '', { fill: softFill })
      ws.getRow(row).height = 20
      row += 1

      merge(row, 1, row, PERSONAL_HH_TOTAL_COL)
      setCell(row, 1, 'TOTAL SUBCONTRATOS', {
        fill: subtotalFill,
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      merge(row, EQUIP_START_COL, row, totalCols)
      setCell(row, EQUIP_START_COL, '', {
        fill: subtotalFill,
        font: { bold: true, color: { argb: 'FFFFFFFF' } }
      })
      ws.getRow(row).height = 20
      row += 1

      const overallPersonalTotals = {
        contratados: Number(indirectTotals.contratados || 0) + Number(directTotals.contratados || 0),
        contratacionProceso: Number(indirectTotals.contratacionProceso || 0) + Number(directTotals.contratacionProceso || 0),
        apoyoOficina: Number(indirectTotals.apoyoOficina || 0) + Number(directTotals.apoyoOficina || 0),
        descansoCambioTurno: Number(indirectTotals.descansoCambioTurno || 0) + Number(directTotals.descansoCambioTurno || 0),
        permisoCovid: Number(indirectTotals.permisoCovid || 0) + Number(directTotals.permisoCovid || 0),
        renunciaVoluntaria: Number(indirectTotals.renunciaVoluntaria || 0) + Number(directTotals.renunciaVoluntaria || 0),
        terminoContrato: Number(indirectTotals.terminoContrato || 0) + Number(directTotals.terminoContrato || 0),
        enCurso3d: Number(indirectTotals.enCurso3d || 0) + Number(directTotals.enCurso3d || 0),
        capacitacionAcreditacion: Number(indirectTotals.capacitacionAcreditacion || 0) + Number(directTotals.capacitacionAcreditacion || 0),
        teletrabajo: Number(indirectTotals.teletrabajo || 0) + Number(directTotals.teletrabajo || 0),
        pruebaPractica: Number(indirectTotals.pruebaPractica || 0) + Number(directTotals.pruebaPractica || 0),
        ofertaComercial: Number(indirectTotals.ofertaComercial || 0) + Number(directTotals.ofertaComercial || 0),
        instalacionFaena: Number(indirectTotals.instalacionFaena || 0) + Number(directTotals.instalacionFaena || 0),
        frente: Number(indirectTotals.frente || 0) + Number(directTotals.frente || 0),
        nocFront: Number(indirectTotals.nocFront || 0) + Number(directTotals.nocFront || 0),
        dynamicFrontValues: Array.from({ length: dynamicFrontCount }).map((_, idx) =>
          toNum((indirectTotals as any).dynamicFrontValues?.[idx]) + toNum((directTotals as any).dynamicFrontValues?.[idx])
        ),
        dotacionTotalObra: Number(indirectTotals.dotacionTotalObra || 0) + Number(directTotals.dotacionTotalObra || 0),
        hhTotalObra: Number(indirectTotals.hhTotalObra || 0) + Number(directTotals.hhTotalObra || 0)
      }
      const overallEquipmentTotals = {
        hmTurnoDia: Number(majorTotals.hmTurnoDia || 0) + Number(minorTotals.hmTurnoDia || 0),
        totalEquipos: Number(majorTotals.totalEquipos || 0) + Number(minorTotals.totalEquipos || 0),
        operacion: Number(majorTotals.operacion || 0) + Number(minorTotals.operacion || 0),
        disponibles: Number(majorTotals.disponibles || 0) + Number(minorTotals.disponibles || 0),
        acredMant: Number(majorTotals.acredMant || 0) + Number(minorTotals.acredMant || 0),
        panne: Number(majorTotals.panne || 0) + Number(minorTotals.panne || 0),
        ofCentral: Number(majorTotals.ofCentral || 0) + Number(minorTotals.ofCentral || 0),
        instalacionFaena: Number(majorTotals.instalacionFaena || 0) + Number(minorTotals.instalacionFaena || 0),
        mainFront: Number(majorTotals.mainFront || 0) + Number(minorTotals.mainFront || 0),
        nocFront: Number(majorTotals.nocFront || 0) + Number(minorTotals.nocFront || 0),
        dynamicFrontValues: Array.from({ length: dynamicFrontCount }).map((_, idx) =>
          toNum((majorTotals as any).dynamicFrontValues?.[idx]) + toNum((minorTotals as any).dynamicFrontValues?.[idx])
        ),
        totalEqMaq: Number(majorTotals.totalEqMaq || 0) + Number(minorTotals.totalEqMaq || 0),
        hmTotal: Number(majorTotals.hmTotal || 0) + Number(minorTotals.hmTotal || 0)
      }
      const totalGeneralPersonalValues = [
        'TOTAL',
        '',
        overallPersonalTotals.contratados,
        overallPersonalTotals.contratacionProceso,
        overallPersonalTotals.apoyoOficina,
        overallPersonalTotals.descansoCambioTurno,
        overallPersonalTotals.permisoCovid,
        overallPersonalTotals.renunciaVoluntaria,
        overallPersonalTotals.terminoContrato,
        overallPersonalTotals.enCurso3d,
        overallPersonalTotals.capacitacionAcreditacion,
        overallPersonalTotals.teletrabajo,
        overallPersonalTotals.pruebaPractica,
        overallPersonalTotals.ofertaComercial,
        overallPersonalTotals.instalacionFaena,
        overallPersonalTotals.frente,
        ...getDynamicFrontValuesForExport(overallPersonalTotals, dynamicFrontCount),
        overallPersonalTotals.dotacionTotalObra,
        overallPersonalTotals.hhTotalObra
      ]
      const totalGeneralEquipmentValues = [
        'TOTAL',
        overallEquipmentTotals.hmTurnoDia,
        overallEquipmentTotals.totalEquipos,
        overallEquipmentTotals.operacion,
        overallEquipmentTotals.disponibles,
        overallEquipmentTotals.acredMant,
        overallEquipmentTotals.panne,
        overallEquipmentTotals.ofCentral,
        overallEquipmentTotals.instalacionFaena,
        overallEquipmentTotals.mainFront,
        ...getDynamicFrontValuesForExport(overallEquipmentTotals, dynamicFrontCount),
        overallEquipmentTotals.totalEqMaq,
        overallEquipmentTotals.hmTotal
      ]
      totalGeneralPersonalValues.forEach((value, idx) => {
        setCell(row, 1 + idx, idx === 0 ? value : formatNumber(value), {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBEBC7' } },
          font: { bold: true, color: { argb: 'FF0F3B8F' } },
          alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' }
        })
      })
      totalGeneralEquipmentValues.forEach((value, idx) => {
        setCell(row, EQUIP_START_COL + idx, idx === 0 ? value : formatNumber(value), {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBEBC7' } },
          font: { bold: true, color: { argb: 'FF0F3B8F' } },
          alignment: { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' }
        })
      })
      ws.getRow(row).height = 22
      row += 1

      sectionTitle(row, '4.- RESUMEN DE INFORMACIÓN A LA FECHA')
      row += 1
      merge(row, 1, row, 12)
      setCell(row, 1, 'RESUMEN ACUM. ANTERIOR', {
        fill: softFill,
        font: { bold: true, color: { argb: 'FF222222' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      merge(row, 13, row, 16)
      setCell(row, 13, 'DOT. TOTAL OBRA', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } })
      merge(row, 17, row, 20)
      setCell(row, 17, 'HH TOTAL OBRA', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } })
      merge(row, 21, row, 24)
      setCell(row, 21, 'TOTAL EQUIPOS', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } })
      merge(row, 25, row, totalCols)
      setCell(row, 25, 'HM TOTAL OBRA', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } })
      ws.getRow(row).height = 24
      row += 1

      const dayIndirectDot = pick('summary_indirect_dotation')
      const dayIndirectHh = pick('summary_indirect_hh')
      const dayDirectDot = pick('summary_direct_dotation')
      const dayDirectHh = pick('summary_direct_hh')
      const dayTotalDot = pick('summary_total_dotation', dayIndirectDot + dayDirectDot)
      const dayTotalHh = pick('summary_total_hh', dayIndirectHh + dayDirectHh)
      const dayMajorHm = pick('equip_major_hm')
      const dayMajorQty = pick('equip_major_qty', dayMajorHm > 0 ? resolveMachineDotationFromHours(dayMajorHm, workdaySource) : 0)
      const dayMinorHm = pick('equip_minor_hm')
      const dayMinorQty = pick('equip_minor_qty', dayMinorHm > 0 ? resolveMachineDotationFromHours(dayMinorHm, workdaySource) : 0)
      const dayTotalEquip = pick('equip_total_qty', dayMajorQty + dayMinorQty)
      const dayTotalHm = pick('equip_total_hm', dayMajorHm + dayMinorHm)

      const prevIndirectHh = pick('s4_prev_indirect_hh')
      const prevDirectHh = pick('s4_prev_direct_hh')
      const prevTotalHh = pick('s4_prev_total_hh', prevIndirectHh + prevDirectHh)
      const prevIndirectDot = pick('s4_prev_indirect_dot', prevIndirectHh > 0 ? resolvePersonDotationFromHours(prevIndirectHh, workdaySource) : 0)
      const prevDirectDot = pick('s4_prev_direct_dot', prevDirectHh > 0 ? resolvePersonDotationFromHours(prevDirectHh, workdaySource) : 0)
      const prevTotalDot = pick('s4_prev_total_dot', prevTotalHh > 0 ? resolvePersonDotationFromHours(prevTotalHh, workdaySource) : prevIndirectDot + prevDirectDot)
      const prevMajorHm = pick('s4_prev_major_hm')
      const prevMajorQty = pick('s4_prev_major_equip', prevMajorHm > 0 ? resolveMachineDotationFromHours(prevMajorHm, workdaySource) : 0)
      const prevMinorHm = pick('s4_prev_minor_hm')
      const prevMinorQty = pick('s4_prev_minor_equip', prevMinorHm > 0 ? resolveMachineDotationFromHours(prevMinorHm, workdaySource) : 0)
      const prevTotalEquip = pick('s4_prev_total_equip', prevMajorQty + prevMinorQty)
      const prevTotalHm = pick('s4_prev_total_hm', prevMajorHm + prevMinorHm)

      const currentIndirectHh = pick('s4_curr_indirect_hh', prevIndirectHh + dayIndirectHh)
      const currentDirectHh = pick('s4_curr_direct_hh', prevDirectHh + dayDirectHh)
      const currentTotalHh = pick('s4_curr_total_hh', prevTotalHh + dayTotalHh)
      const currentIndirectDot = pick('s4_curr_indirect_dot', prevIndirectDot + dayIndirectDot)
      const currentDirectDot = pick('s4_curr_direct_dot', prevDirectDot + dayDirectDot)
      const currentTotalDot = pick('s4_curr_total_dot', prevTotalDot + dayTotalDot)
      const currentMajorHm = pick('s4_curr_major_hm', prevMajorHm + dayMajorHm)
      const currentMajorQty = pick('s4_curr_major_equip', currentMajorHm > 0 ? resolveMachineDotationFromHours(currentMajorHm, workdaySource) : prevMajorQty + dayMajorQty)
      const currentMinorHm = pick('s4_curr_minor_hm', prevMinorHm + dayMinorHm)
      const currentMinorQty = pick('s4_curr_minor_equip', currentMinorHm > 0 ? resolveMachineDotationFromHours(currentMinorHm, workdaySource) : prevMinorQty + dayMinorQty)
      const currentTotalEquip = pick('s4_curr_total_equip', prevTotalEquip + dayTotalEquip)
      const currentTotalHm = pick('s4_curr_total_hm', prevTotalHm + dayTotalHm)

      const s4Rows = [
        ['INDIRECTO', prevIndirectDot, prevIndirectHh, prevMajorQty + prevMinorQty === 0 ? prevTotalEquip : prevMajorQty, prevMajorHm + prevMinorHm === 0 ? prevTotalHm : prevMajorHm],
        ['DIRECTO', prevDirectDot, prevDirectHh, prevMajorQty + prevMinorQty === 0 ? 0 : prevMinorQty, prevMajorHm + prevMinorHm === 0 ? 0 : prevMinorHm],
        ['TOTAL', prevTotalDot, prevTotalHh, prevTotalEquip, prevTotalHm]
      ]
      s4Rows.forEach(([label, dot, hh, eq, hm]) => {
        const isTotal = label === 'TOTAL'
        merge(row, 1, row, 12)
        setCell(row, 1, isTotal ? '' : String(label), {
          fill: isTotal ? blueFill : undefined,
          font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : { bold: true, color: { argb: 'FF0F3B8F' } },
          alignment: { horizontal: 'left', vertical: 'middle' }
        })
        merge(row, 13, row, 16); setCell(row, 13, formatNumber(dot), { fill: isTotal ? blueFill : undefined, font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : undefined, alignment: { horizontal: 'center' } })
        merge(row, 17, row, 20); setCell(row, 17, formatNumber(hh), { fill: isTotal ? blueFill : undefined, font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : undefined, alignment: { horizontal: 'center' } })
        merge(row, 21, row, 24); setCell(row, 21, formatNumber(eq), { fill: isTotal ? blueFill : undefined, font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : undefined, alignment: { horizontal: 'center' } })
        merge(row, 25, row, totalCols); setCell(row, 25, formatNumber(hm), { fill: isTotal ? blueFill : undefined, font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : undefined, alignment: { horizontal: 'center' } })
        ws.getRow(row).height = 22
        row += 1
      })

      merge(row, 1, row, 12)
      setCell(row, 1, 'RESUMEN ACUM. ACTUAL', {
        fill: softFill,
        font: { bold: true, color: { argb: 'FF222222' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      })
      merge(row, 13, row, 16); setCell(row, 13, '', { fill: softFill })
      merge(row, 17, row, 20); setCell(row, 17, '', { fill: softFill })
      merge(row, 21, row, 24); setCell(row, 21, '', { fill: softFill })
      merge(row, 25, row, totalCols); setCell(row, 25, '', { fill: softFill })
      ws.getRow(row).height = 24
      row += 1

      const s4CurrentRows = [
        ['INDIRECTO', currentIndirectDot, currentIndirectHh, currentMajorQty + currentMinorQty === 0 ? currentTotalEquip : currentMajorQty, currentMajorHm + currentMinorHm === 0 ? currentTotalHm : currentMajorHm],
        ['DIRECTO', currentDirectDot, currentDirectHh, currentMajorQty + currentMinorQty === 0 ? 0 : currentMinorQty, currentMajorHm + currentMinorHm === 0 ? 0 : currentMinorHm],
        ['TOTAL', currentTotalDot, currentTotalHh, currentTotalEquip, currentTotalHm]
      ]
      s4CurrentRows.forEach(([label, dot, hh, eq, hm]) => {
        const isTotal = label === 'TOTAL'
        merge(row, 1, row, 12)
        setCell(row, 1, isTotal ? '' : String(label), {
          fill: isTotal ? blueFill : undefined,
          font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : { bold: true, color: { argb: 'FF0F3B8F' } },
          alignment: { horizontal: 'left', vertical: 'middle' }
        })
        merge(row, 13, row, 16); setCell(row, 13, formatNumber(dot), { fill: isTotal ? blueFill : undefined, font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : undefined, alignment: { horizontal: 'center' } })
        merge(row, 17, row, 20); setCell(row, 17, formatNumber(hh), { fill: isTotal ? blueFill : undefined, font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : undefined, alignment: { horizontal: 'center' } })
        merge(row, 21, row, 24); setCell(row, 21, formatNumber(eq), { fill: isTotal ? blueFill : undefined, font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : undefined, alignment: { horizontal: 'center' } })
        merge(row, 25, row, totalCols); setCell(row, 25, formatNumber(hm), { fill: isTotal ? blueFill : undefined, font: isTotal ? { bold: true, color: { argb: 'FFFFFFFF' } } : undefined, alignment: { horizontal: 'center' } })
        ws.getRow(row).height = 22
        row += 1
      })

      sectionTitle(row, 'COMENTARIOS')
      row += 1
      merge(row, 1, row + 3, totalCols)
      setCell(row, 1, pickText('comments_v2', ''), { alignment: { horizontal: 'left', vertical: 'top', wrapText: true } })
      ws.getRow(row).height = 26
      ws.getRow(row + 1).height = 26
      ws.getRow(row + 2).height = 26
      ws.getRow(row + 3).height = 26
      row += 4

      const signerPreparedName = pickText('prepared_by_name', '-')
      const signerPreparedRole = pickText('prepared_by_role', '-')
      const signerPreparedDate = pickText('prepared_by_date', String(report?.report_date || '-'))
      const signerPreparedSignature = pickText('prepared_by_signature_url', '')
      const signerApprovedName = pickText('approved_by_name', '-')
      const signerApprovedRole = pickText('approved_by_role', '-')
      const signerApprovedDate = pickText('approved_by_date', String(report?.report_date || '-'))
      const signerApprovedSignature = pickText('approved_by_signature_url', '')
      const signerValidatedName = ''
      const signerValidatedRole = ''
      const signerValidatedDate = ''
      const signerValidatedSignature = pickText('validated_by_signature_url', '')

      merge(row, 1, row, 10); setCell(row, 1, 'CONFECCIONADO POR', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 11, row, 20); setCell(row, 11, 'APROBADO POR', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 21, row, totalCols); setCell(row, 21, 'TOMA DE CONOCIMIENTO', { fill: softFill, font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } })
      ws.getRow(row).height = 22
      row += 1

      merge(row, 1, row, 2); setCell(row, 1, 'NOMBRE:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 3, row, 10); setCell(row, 3, signerPreparedName, { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 11, row, 12); setCell(row, 11, 'NOMBRE:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 13, row, 20); setCell(row, 13, signerApprovedName, { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 21, row, 22); setCell(row, 21, 'NOMBRE:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 23, row, totalCols); setCell(row, 23, signerValidatedName, { alignment: { horizontal: 'left', vertical: 'middle' } })
      ws.getRow(row).height = 22
      row += 1

      merge(row, 1, row, 2); setCell(row, 1, 'CARGO:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 3, row, 10); setCell(row, 3, signerPreparedRole, { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 11, row, 12); setCell(row, 11, 'CARGO:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 13, row, 20); setCell(row, 13, signerApprovedRole, { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 21, row, 22); setCell(row, 21, 'CARGO:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 23, row, totalCols); setCell(row, 23, signerValidatedRole, { alignment: { horizontal: 'left', vertical: 'middle' } })
      ws.getRow(row).height = 22
      row += 1

      merge(row, 1, row, 2); setCell(row, 1, 'FECHA:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 3, row, 10); setCell(row, 3, latamDate(signerPreparedDate), { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 11, row, 12); setCell(row, 11, 'FECHA:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 13, row, 20); setCell(row, 13, latamDate(signerApprovedDate), { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 21, row, 22); setCell(row, 21, 'FECHA:', { alignment: { horizontal: 'left', vertical: 'middle' } })
      merge(row, 23, row, totalCols); setCell(row, 23, signerValidatedDate ? latamDate(signerValidatedDate) : '', { alignment: { horizontal: 'left', vertical: 'middle' } })
      ws.getRow(row).height = 22
      row += 1

      merge(row, 1, row + 2, 2); setCell(row, 1, 'FIRMA:', { alignment: { horizontal: 'left', vertical: 'top' } })
      merge(row, 3, row + 2, 10); setCell(row, 3, '', { alignment: { horizontal: 'left', vertical: 'top' } })
      merge(row, 11, row + 2, 12); setCell(row, 11, 'FIRMA:', { alignment: { horizontal: 'left', vertical: 'top' } })
      merge(row, 13, row + 2, 20); setCell(row, 13, '', { alignment: { horizontal: 'left', vertical: 'top' } })
      merge(row, 21, row + 2, 22); setCell(row, 21, 'FIRMA:', { alignment: { horizontal: 'left', vertical: 'top' } })
      merge(row, 23, row + 2, totalCols); setCell(row, 23, '', { alignment: { horizontal: 'left', vertical: 'top' } })
      ws.getRow(row).height = 32
      ws.getRow(row + 1).height = 32
      ws.getRow(row + 2).height = 32

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
          const url = raw.startsWith('http://') || raw.startsWith('https://')
            ? new URL(raw)
            : new URL(raw, req.nextUrl.origin)
          const key = String(url.searchParams.get('key') || '').trim()
          return key
        } catch {
          return ''
        }
      }
      const loadSignatureImage = async (value: string): Promise<{ dataUrl: string; extension: 'png' | 'jpeg' } | null> => {
        const raw = String(value || '').trim()
        const inlineExt = inferDataUrlExtension(raw)
        if (inlineExt) return { dataUrl: raw, extension: inlineExt }

        const key = resolveSignatureKey(raw)
        const expectedPrefix = `collaborators/${companyId}/`
        const bucket = process.env.R2_BUCKET_NAME
        const accountId = process.env.R2_ACCOUNT_ID
        const accessKeyId = process.env.R2_ACCESS_KEY_ID
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
        if (!key || !key.startsWith(expectedPrefix) || !bucket || !accountId || !accessKeyId || !secretAccessKey) return null

        try {
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
          const contentType = String(res.headers.get('content-type') || '')
          const extension = resolveImageExtension(raw, key, contentType)
          if (extension !== 'png' && extension !== 'jpeg') return null
          const arr = await res.arrayBuffer()
          if (!arr || arr.byteLength === 0) return null
          const mime = extension === 'png' ? 'image/png' : 'image/jpeg'
          return {
            dataUrl: `data:${mime};base64,${Buffer.from(arr).toString('base64')}`,
            extension
          }
        } catch {
          return null
        }
      }
      const addSignatureImage = async (
        signatureSource: string,
        fromCol: number,
        toCol: number,
        fromRow: number,
        toRow: number
      ) => {
        const image = await loadSignatureImage(signatureSource)
        if (!image) return
        const dims = getImageDimensionsFromBase64(image.dataUrl, image.extension)
        const boxWidth = Math.max(20, (toCol - fromCol + 1) * 58)
        // Excel row.height is in points; image ext expects pixels.
        const POINT_TO_PX = 96 / 72
        const rowHeightsPx = Array.from({ length: toRow - fromRow + 1 }).reduce<number>((acc, _, i) => {
          const hPt = Number(ws.getRow(fromRow + i).height || 15)
          return acc + (hPt * POINT_TO_PX)
        }, 0)
        const boxHeight = Math.max(20, rowHeightsPx)
        const targetWidth = boxWidth * 0.62
        const targetHeight = boxHeight * 0.995
        let renderWidth = targetWidth
        let renderHeight = targetHeight
        if (dims && dims.width > 0 && dims.height > 0) {
          const scale = Math.min(targetWidth / dims.width, targetHeight / dims.height)
          renderWidth = Math.max(1, Math.round(dims.width * scale))
          renderHeight = Math.max(1, Math.round(dims.height * scale))
        }
        const offsetX = Math.max(0, (boxWidth - renderWidth) / 2)
        const centeredOffsetY = Math.max(0, (boxHeight - renderHeight) / 2)
        const offsetY = Math.max(0, centeredOffsetY - 10)
        const imageId = wb.addImage({ base64: image.dataUrl, extension: image.extension })
        ws.addImage(imageId, {
          tl: { col: (fromCol - 1) + (offsetX / 64), row: (fromRow - 1) + (offsetY / 20) },
          ext: { width: renderWidth, height: renderHeight }
        })
      }

      const signFromRow = row
      const signToRow = row + 2
      await addSignatureImage(signerPreparedSignature, 3, 10, signFromRow, signToRow)
      await addSignatureImage(signerApprovedSignature, 13, 20, signFromRow, signToRow)
      await addSignatureImage(signerValidatedSignature, 23, totalCols, signFromRow, signToRow)

      row += 3

      const buffer = await wb.xlsx.writeBuffer()
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="reporte-diario-v2-${report.report_no}-${String(report.report_date || '').slice(0, 10)}.xlsx"`,
          'Cache-Control': 'no-store'
        }
      })
    }
    const manifestRows = parseJsonArray((notes as any)?.evidence_manifest)
      .map((x: any) => ({
        key: String(x?.key || '').trim(),
        name: String(x?.name || 'imagen'),
        activityName: String(x?.activityName || 'Actividad')
      }))
      .filter((x: any) => !!x.key)
    let evidenceItems = manifestRows.length > 0 ? manifestRows : collectEvidenceItems(fieldReports)
    if (evidenceItems.length === 0 && sourceIds.length > 0) {
      // Si los IDs guardados no traen evidencia (p. ej. quedaron desfasados),
      // hacemos una segunda consulta completa por fecha para rescatar evidencias reales.
      const dayStart = `${day}T00:00:00.000Z`
      const dayEnd = `${day}T23:59:59.999Z`
      const byDateRes = await supabaseAdmin
        .from('pr_field_reports')
        .select('id, date, created_at, work_front, specialty, supervisor, crew_name, personnel_ids, personnel, person_hours, capataz_id, area, description, assignments, activities, activity_observations')
        .eq('company_id', companyId)
        .or(`date.eq.${day},and(date.is.null,created_at.gte.${dayStart},created_at.lte.${dayEnd})`)
        .order('created_at', { ascending: false })
        .limit(500)
      const byDateRows = Array.isArray(byDateRes.data) ? byDateRes.data : []
      if (byDateRows.length > 0) {
        fieldReports = byDateRows
        evidenceItems = collectEvidenceItems(fieldReports)
      }
    }
    const evidenceLinks = buildEvidenceLinks(evidenceItems, companyId)
    const evidenceImages = await loadEvidenceImages(evidenceItems, companyId)
    const evidenceImageByKey = new Map<string, { extension: 'png' | 'jpeg'; base64: string }>()
    evidenceImages.forEach((img) => {
      evidenceImageByKey.set(String(img.key), { extension: img.extension, base64: img.base64 })
    })
    const shiftLabel = inferShiftLabel(String(report?.work_calendar || ''))
    const subtotalLabel = shiftLabel === 'Noche' ? 'SUB TOTAL NOCTURNO' : 'SUB TOTAL DIURNO'

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Reporte diario')
    ws.columns = [
      { width: 20 }, { width: 16 }, { width: 14 }, { width: 20 }, { width: 14 }, { width: 14 },
      { width: 18 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }
    ]

    const borderThin = { style: 'thin' as const, color: { argb: 'FF111111' } }
    const borderAll = { top: borderThin, left: borderThin, right: borderThin, bottom: borderThin }
    const blueFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF082D75' } }
    const lightFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF7F7F7' } }
    const whiteFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }

    const setCell = (addr: string, value: any, opts?: any) => {
      const c = ws.getCell(addr)
      c.value = value
      c.border = borderAll
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      if (opts?.fill) c.fill = opts.fill
      if (opts?.font) c.font = opts.font
      if (opts?.alignment) c.alignment = { ...c.alignment, ...opts.alignment }
      return c
    }
    const merge = (range: string) => ws.mergeCells(range)

    merge('A1:B1'); merge('C1:K1'); merge('L1:M1')
    setCell('A1', 'LOGO CLIENTE')
    setCell('C1', 'INFORME DIARIO DE CONTRATISTAS', { font: { bold: true, size: 14 } })
    setCell('L1', 'LOGO EMPRESA')

    merge('A2:B2'); merge('C2:E2'); merge('F2:G2'); merge('H2:J2'); merge('K2:M2')
    setCell('A2', 'REPORTE N°', { alignment: { horizontal: 'left' }, fill: lightFill })
    setCell('C2', Number(report.report_no || 0), { font: { color: { argb: 'FFD00000' }, bold: true } })
    setCell('F2', `Rev. ${String(report.revision || '0')}`)
    setCell('H2', 'Fecha:', { alignment: { horizontal: 'left' }, fill: lightFill })
    setCell('K2', latamDate(report.report_date))

    merge('A3:B3'); merge('C3:G3'); merge('H3:I3'); merge('J3:M3')
    setCell('A3', 'CONTRATISTA', { alignment: { horizontal: 'left' }, fill: lightFill })
    setCell('C3', String(report.contractor_name || '-'))
    setCell('H3', 'CLIENTE', { fill: lightFill })
    setCell('J3', String(report.client_name || '-'))

    merge('A4:B4'); merge('C4:G4'); merge('H4:I4'); merge('J4:M4')
    setCell('A4', 'CONTRATO', { alignment: { horizontal: 'left' }, fill: lightFill })
    setCell('C4', String(report.contract_title || '-'))
    setCell('H4', 'PROYECTO', { fill: lightFill })
    setCell('J4', String(report.project_name || '-'))

    merge('A5:B5'); merge('C5:G5'); merge('H5:I5'); merge('J5:K5'); merge('L5:M5')
    setCell('A5', 'N° DE CONTRATO', { alignment: { horizontal: 'left' }, fill: lightFill })
    setCell('C5', String(report.contract_number || '-'))
    setCell('H5', 'HH DIA', { fill: lightFill })
    setCell('J5', Number(report.hh_day || 0))
    setCell('L5', 'HH PRODUCTIVAS', { fill: lightFill })
    setCell('M5', Number(report.hh_productive || 0))

    merge('A6:B6'); merge('C6:G6'); merge('H6:I6'); merge('J6:M6')
    setCell('A6', 'CALENDARIO DE TRABAJO', { alignment: { horizontal: 'left' }, fill: lightFill })
    setCell('C6', String(report.work_calendar || '-'))
    setCell('H6', 'COND. CLIMATICA', { fill: lightFill })
    setCell('J6', String(report.weather_label || '-'))

    let row = 7
    const setBand = (fromCol: string, toCol: string, text: string) => {
      merge(`${fromCol}${row}:${toCol}${row}`)
      setCell(`${fromCol}${row}`, text, { fill: blueFill, font: whiteFont })
    }
    const setBandCell = (addr: string, value: any) => setCell(addr, value, { fill: blueFill, font: whiteFont })

    merge(`A${row}:M${row}`)
    setCell(`A${row}`, 'FUERZA LABORAL', { fill: lightFill, font: { bold: true } })
    row += 1
    merge(`A${row}:C${row}`); setCell(`A${row}`, 'HH INDIRECTO', { fill: lightFill, font: { bold: true } })
    merge(`D${row}:F${row}`); setCell(`D${row}`, 'HH DIRECTO NO OPERACIONAL', { fill: lightFill, font: { bold: true } })
    merge(`G${row}:M${row}`); setCell(`G${row}`, 'HH DIRECTO', { fill: lightFill, font: { bold: true } })
    row += 1
    setCell(`A${row}`, 'Posicion', { fill: lightFill, font: { bold: true } })
    setCell(`B${row}`, 'HD', { fill: lightFill, font: { bold: true } })
    setCell(`C${row}`, 'HH', { fill: lightFill, font: { bold: true } })
    setCell(`D${row}`, 'Posicion', { fill: lightFill, font: { bold: true } })
    setCell(`E${row}`, 'HD', { fill: lightFill, font: { bold: true } })
    setCell(`F${row}`, 'HH', { fill: lightFill, font: { bold: true } })
    setCell(`G${row}`, 'Especialidad', { fill: lightFill, font: { bold: true } })
    setCell(`H${row}`, 'Posicion', { fill: lightFill, font: { bold: true } })
    setCell(`I${row}`, 'Cantidad Posicion', { fill: lightFill, font: { bold: true } })
    setCell(`J${row}`, 'Cantidad Real Terreno', { fill: lightFill, font: { bold: true } })
    setCell(`K${row}`, 'Cantidad x 12', { fill: lightFill, font: { bold: true } })
    setCell(`L${row}`, 'Cantidad Posicion', { fill: lightFill, font: { bold: true } })
    setCell(`M${row}`, 'Cantidad x 11', { fill: lightFill, font: { bold: true } })
    row += 1

    const writeTripleSection = (
      title: string,
      indirect: any[],
      directNoOp: any[],
      direct: any[],
      onlyIndirect = false
    ) => {
      setBand('A', 'C', title)
      if (onlyIndirect) {
        merge(`D${row}:M${row}`)
        setCell(`D${row}`, '', { fill: lightFill })
      } else {
        setBand('D', 'F', title)
        setBand('G', 'M', title)
      }
      row += 1

      const count = Math.max(indirect.length, onlyIndirect ? 0 : directNoOp.length, onlyIndirect ? 0 : direct.length, 1)
      for (let i = 0; i < count; i += 1) {
        const ind = indirect[i]
        setCell(`A${row}`, ind?.position || (i === 0 && !indirect.length ? 'Sin personal' : ''))
        setCell(`B${row}`, ind ? Number(ind.quantity || 0) : '')
        setCell(`C${row}`, ind ? Number(ind.hh || 0) : '')

        if (onlyIndirect) {
          merge(`D${row}:M${row}`)
          setCell(`D${row}`, '')
        } else {
          const dno = directNoOp[i]
          const dir = direct[i]
          setCell(`D${row}`, dno?.position || (i === 0 && !directNoOp.length ? 'Sin personal' : ''))
          setCell(`E${row}`, dno ? Number(dno.quantity || 0) : '')
          setCell(`F${row}`, dno ? Number(dno.hh || 0) : '')

          setCell(`G${row}`, dir?.specialty || (i === 0 && !direct.length ? 'Sin personal' : ''))
          setCell(`H${row}`, dir?.position || '')
          setCell(`I${row}`, dir ? Number(dir.quantity || 0) : '')
          setCell(`J${row}`, dir ? Number(dir.realOnSite || 0) : '')
          setCell(`K${row}`, dir ? Number(dir.hh12 || 0) : '')
          setCell(`L${row}`, dir ? Number(dir.quantityProductive || 0) : '')
          setCell(`M${row}`, dir ? Number(dir.hh11 || 0) : '')
        }
        row += 1
      }

      setBandCell(`A${row}`, subtotalLabel)
      setBandCell(`B${row}`, numberSum(indirect, 'quantity'))
      setBandCell(`C${row}`, numberSum(indirect, 'hh'))
      if (onlyIndirect) {
        merge(`D${row}:M${row}`)
        setCell(`D${row}`, '', { fill: blueFill, font: whiteFont })
      } else {
        setBandCell(`D${row}`, '')
        setBandCell(`E${row}`, numberSum(directNoOp, 'quantity'))
        setBandCell(`F${row}`, numberSum(directNoOp, 'hh'))
        setBandCell(`G${row}`, '')
        setBandCell(`H${row}`, '')
        setBandCell(`I${row}`, numberSum(direct, 'quantity'))
        setBandCell(`J${row}`, numberSum(direct, 'realOnSite'))
        setBandCell(`K${row}`, numberSum(direct, 'hh12'))
        setBandCell(`L${row}`, numberSum(direct, 'quantityProductive'))
        setBandCell(`M${row}`, numberSum(direct, 'hh11'))
      }
      row += 1
    }

    writeTripleSection(`En Proyecto Turno ${shiftLabel}`, indirectRows, directNoOperationalRows, directRows)
    writeTripleSection('PERSONAL INDIRECTO NO PRODUCTIVO PRESENTE EN CURSO', courseIndirectRows, courseDirectNoOperationalRows, courseDirectRows)
    writeTripleSection('PERSONAL INDIRECTO NO PRODUCTIVO BAJADA', downIndirectRows, downDirectNoOperationalRows, downDirectRows)
    writeTripleSection('PERSONAL INDIRECTO NO PRODUCTIVO EN POLICLINICO', policlinicoIndirectRows, policlinicoDirectNoOperationalRows, policlinicoDirectRows)
    writeTripleSection('OFICINA CENTRAL - TELETRABAJO', teleworkIndirectRows, [], [], true)

    const totalPresentIndirect = numberSum(indirectRows, 'quantity')
    const totalPresentIndirectHh = numberSum(indirectRows, 'hh')
    const totalPresentNoOp = numberSum(directNoOperationalRows, 'quantity')
    const totalPresentNoOpHh = numberSum(directNoOperationalRows, 'hh')
    const totalPresentDirect = numberSum(directRows, 'quantity')
    const totalPresentDirectReal = numberSum(directRows, 'realOnSite')
    const totalPresentDirectHh12 = numberSum(directRows, 'hh12')
    const totalPresentDirectQtyProd = numberSum(directRows, 'quantityProductive')
    const totalPresentDirectHh11 = numberSum(directRows, 'hh11')
    const totalNoPresentIndirect = numberSum(courseIndirectRows, 'quantity') + numberSum(downIndirectRows, 'quantity') + numberSum(policlinicoIndirectRows, 'quantity') + numberSum(teleworkIndirectRows, 'quantity')
    const totalNoPresentIndirectHh = numberSum(courseIndirectRows, 'hh') + numberSum(downIndirectRows, 'hh') + numberSum(policlinicoIndirectRows, 'hh') + numberSum(teleworkIndirectRows, 'hh')
    const totalNoPresentNoOp = numberSum(courseDirectNoOperationalRows, 'quantity') + numberSum(downDirectNoOperationalRows, 'quantity') + numberSum(policlinicoDirectNoOperationalRows, 'quantity')
    const totalNoPresentNoOpHh = numberSum(courseDirectNoOperationalRows, 'hh') + numberSum(downDirectNoOperationalRows, 'hh') + numberSum(policlinicoDirectNoOperationalRows, 'hh')
    const totalNoPresentDirect = numberSum(courseDirectRows, 'quantity') + numberSum(downDirectRows, 'quantity') + numberSum(policlinicoDirectRows, 'quantity')
    const totalNoPresentDirectReal = numberSum(courseDirectRows, 'realOnSite') + numberSum(downDirectRows, 'realOnSite') + numberSum(policlinicoDirectRows, 'realOnSite')
    const totalNoPresentDirectHh12 = numberSum(courseDirectRows, 'hh12') + numberSum(downDirectRows, 'hh12') + numberSum(policlinicoDirectRows, 'hh12')
    const totalNoPresentDirectQtyProd = numberSum(courseDirectRows, 'quantityProductive') + numberSum(downDirectRows, 'quantityProductive') + numberSum(policlinicoDirectRows, 'quantityProductive')
    const totalNoPresentDirectHh11 = numberSum(courseDirectRows, 'hh11') + numberSum(downDirectRows, 'hh11') + numberSum(policlinicoDirectRows, 'hh11')

    setBandCell(`A${row}`, 'TOTAL PRESENTES INDIRECTO')
    setBandCell(`B${row}`, totalPresentIndirect)
    setBandCell(`C${row}`, totalPresentIndirectHh)
    setBandCell(`D${row}`, 'TOTAL PRESENTES DIRECTO NO OPERACIONAL')
    setBandCell(`E${row}`, totalPresentNoOp)
    setBandCell(`F${row}`, totalPresentNoOpHh)
    merge(`G${row}:H${row}`); setCell(`G${row}`, 'TOTAL PRESENTES DIRECTO', { fill: blueFill, font: whiteFont })
    setBandCell(`I${row}`, totalPresentDirect)
    setBandCell(`J${row}`, totalPresentDirectReal)
    setBandCell(`K${row}`, totalPresentDirectHh12)
    setBandCell(`L${row}`, totalPresentDirectQtyProd)
    setBandCell(`M${row}`, totalPresentDirectHh11)
    row += 1

    setBandCell(`A${row}`, 'TOTAL NO PRESENTES (CAMPAMENTO, CURSOS, TL)')
    setBandCell(`B${row}`, totalNoPresentIndirect)
    setBandCell(`C${row}`, totalNoPresentIndirectHh)
    setBandCell(`D${row}`, 'TOTAL NO PRESENTES')
    setBandCell(`E${row}`, totalNoPresentNoOp)
    setBandCell(`F${row}`, totalNoPresentNoOpHh)
    merge(`G${row}:H${row}`); setCell(`G${row}`, 'TOTAL NO PRESENTES', { fill: blueFill, font: whiteFont })
    setBandCell(`I${row}`, totalNoPresentDirect)
    setBandCell(`J${row}`, totalNoPresentDirectReal)
    setBandCell(`K${row}`, totalNoPresentDirectHh12)
    setBandCell(`L${row}`, totalNoPresentDirectQtyProd)
    setBandCell(`M${row}`, totalNoPresentDirectHh11)
    row += 1

    setBand('A', 'H', 'EQUIPOS Y MAQUINARIAS')
    setBand('I', 'M', 'VEHICULOS MENORES Y SERVICIO')
    row += 1
    merge(`A${row}:B${row}`); setCell(`A${row}`, 'Descripción (Agrupar por tipo/capacidad)', { fill: lightFill, font: { bold: true } })
    setCell(`C${row}`, 'KM / HRS', { fill: lightFill, font: { bold: true } })
    setCell(`D${row}`, 'Cantidad', { fill: lightFill, font: { bold: true } })
    setCell(`E${row}`, 'DM Operando', { fill: lightFill, font: { bold: true } })
    setCell(`F${row}`, 'HM Operando', { fill: lightFill, font: { bold: true } })
    setCell(`G${row}`, 'HM Mantención / Panne / STAND-BY', { fill: lightFill, font: { bold: true } })
    setCell(`H${row}`, 'Frentes de Trabajo', { fill: lightFill, font: { bold: true } })
    merge(`I${row}:K${row}`); setCell(`I${row}`, 'Descripción', { fill: lightFill, font: { bold: true } })
    setCell(`L${row}`, 'Operativos', { fill: lightFill, font: { bold: true } })
    setCell(`M${row}`, 'Fuera de servicio', { fill: lightFill, font: { bold: true } })
    row += 1

    const tempRows = [
      { equipmentDescription: 'MAN LIFT - JLG 800AJ', kmHrs: '', quantity: 0, dmOperando: 0, hmOperando: 0, hmMaintStandby: 0, workFronts: 'Apoyo en todas las areas', vehicleDescription: 'GRUPO ELECTROGENO 20 KVA', vehicleOperative: 0, vehicleOutOfService: 0 },
      { equipmentDescription: 'CAMION RAMPLA', kmHrs: '', quantity: 0, dmOperando: 0, hmOperando: 0, hmMaintStandby: 0, workFronts: 'Apoyo en todas las areas', vehicleDescription: 'GRUPO ELECTROGENO 60 KVA', vehicleOperative: 0, vehicleOutOfService: 0 }
    ]
    tempRows.forEach((r) => {
      merge(`A${row}:B${row}`); setCell(`A${row}`, r.equipmentDescription)
      setCell(`C${row}`, r.kmHrs)
      setCell(`D${row}`, r.quantity)
      setCell(`E${row}`, r.dmOperando)
      setCell(`F${row}`, r.hmOperando)
      setCell(`G${row}`, r.hmMaintStandby)
      setCell(`H${row}`, r.workFronts)
      merge(`I${row}:K${row}`); setCell(`I${row}`, r.vehicleDescription)
      setCell(`L${row}`, r.vehicleOperative)
      setCell(`M${row}`, r.vehicleOutOfService)
      row += 1
    })
    setBandCell(`A${row}`, 'TOTAL')
    setBandCell(`B${row}`, '')
    setBandCell(`C${row}`, '')
    setBandCell(`D${row}`, tempRows.reduce((a, x) => a + x.quantity, 0))
    setBandCell(`E${row}`, tempRows.reduce((a, x) => a + x.dmOperando, 0))
    setBandCell(`F${row}`, tempRows.reduce((a, x) => a + x.hmOperando, 0))
    setBandCell(`G${row}`, tempRows.reduce((a, x) => a + x.hmMaintStandby, 0))
    setBandCell(`H${row}`, '')
    merge(`I${row}:K${row}`); setCell(`I${row}`, 'TOTAL', { fill: blueFill, font: whiteFont })
    setBandCell(`L${row}`, tempRows.reduce((a, x) => a + x.vehicleOperative, 0))
    setBandCell(`M${row}`, tempRows.reduce((a, x) => a + x.vehicleOutOfService, 0))
    row += 2

    if (directSpecialtySections.length > 0) {
      merge(`A${row}:M${row}`)
      setCell(`A${row}`, 'ACTIVIDADES TURNO DIA (DESDE REPORTABILIDAD)', { fill: lightFill, font: { bold: true } })
      row += 1
      directSpecialtySections.forEach((section) => {
        merge(`A${row}:B${row}`)
        setCell(`A${row}`, `ESPECIALIDAD: ${section.specialty}`, { fill: blueFill, font: whiteFont, alignment: { horizontal: 'left' } })
        merge(`C${row}:D${row}`)
        setCell(`C${row}`, `SUPERVISOR: ${section.supervisorsText}`, { fill: blueFill, font: whiteFont, alignment: { horizontal: 'left' } })
        merge(`E${row}:L${row}`)
        setCell(`E${row}`, 'DESCRIPCION ACTIVIDADES', { fill: blueFill, font: whiteFont })
        setCell(`M${row}`, section.activitiesSubtotal, { fill: blueFill, font: whiteFont })
        row += 1
        section.crewLines.forEach((line) => {
          const activityList = Array.from(line.activityNames || [])
          const areaList = Array.from(line.areas || [])
          const descList = Array.from(line.descriptions || [])
          merge(`A${row}:B${row}`)
          setCell(`A${row}`, activityList.length ? activityList.join(' | ') : '-')
          merge(`C${row}:D${row}`)
          setCell(`C${row}`, areaList.length ? areaList.join(', ') : '-')
          merge(`E${row}:L${row}`)
          setCell(`E${row}`, descList.length ? descList.join(' | ') : '-')
          setCell(`M${row}`, Number(line.count || 0))
          row += 1
        })
      })
      row += 1
    }

    merge(`A${row}:G${row}`); merge(`H${row}:M${row}`)
    setCell(`A${row}`, `OBSERVACIONES - ${String(report.contractor_name || 'EMPRESA')}`, { fill: blueFill, font: whiteFont })
    setCell(`H${row}`, `OBSERVACIONES - ${String(report.client_name || 'CLIENTE')}`, { fill: blueFill, font: whiteFont })
    row += 1
    merge(`A${row}:G${row + 4}`); merge(`H${row}:M${row + 4}`)
    setCell(`A${row}`, String(notes?.obs_contractor || ''), { alignment: { horizontal: 'left', vertical: 'top' } })
    setCell(`H${row}`, String(notes?.obs_client || ''), { alignment: { horizontal: 'left', vertical: 'top' } })
    row += 5

    const evidenceCount = evidenceLinks.length
    merge(`A${row}:M${row}`)
    setCell(`A${row}`, 'REGISTRO FOTOGRAFICO DE ACTIVIDADES', { fill: blueFill, font: whiteFont })
    row += 1
    if (evidenceCount <= 0) {
      merge(`A${row}:M${row + 4}`)
      setCell(`A${row}`, 'Sin imagenes asociadas', { alignment: { horizontal: 'left', vertical: 'top' } })
      row += 5
    } else {
      merge(`A${row}:D${row}`); setCell(`A${row}`, 'Actividad', { fill: lightFill, font: { bold: true } })
      merge(`E${row}:H${row}`); setCell(`E${row}`, 'Archivo', { fill: lightFill, font: { bold: true } })
      merge(`I${row}:M${row}`); setCell(`I${row}`, 'Enlace', { fill: lightFill, font: { bold: true } })
      row += 1

      evidenceLinks.forEach((item) => {
        merge(`A${row}:D${row}`)
        setCell(`A${row}`, String(item.activityName || 'Actividad'), { alignment: { horizontal: 'left' } })
        merge(`E${row}:H${row}`)
        setCell(`E${row}`, String(item.name || 'imagen'), { alignment: { horizontal: 'left' } })
        merge(`I${row}:M${row}`)
        const linkCell = setCell(`I${row}`, item.url ? 'Abrir imagen' : 'No disponible', { alignment: { horizontal: 'left' } })
        if (item.url) {
          linkCell.value = { text: 'Abrir imagen', hyperlink: item.url, tooltip: String(item.name || 'Imagen') } as any
          linkCell.font = { color: { argb: 'FF1D4ED8' }, underline: true }
        }
        row += 1

        const embedded = evidenceImageByKey.get(String(item.key || ''))
        if (embedded) {
          const imageRow = row
          merge(`A${imageRow}:M${imageRow}`)
          setCell(`A${imageRow}`, '', { alignment: { horizontal: 'left', vertical: 'top' } })
          const boxWidth = 384
          const boxHeight = 144
          let renderWidth = Math.round(boxHeight)
          let renderHeight = boxHeight
          const dims = getImageDimensionsFromBase64(embedded.base64, embedded.extension)
          if (dims && dims.width > 0 && dims.height > 0) {
            const scale = Math.min(boxWidth / dims.width, boxHeight / dims.height)
            renderWidth = Math.max(1, Math.round(dims.width * scale))
            renderHeight = Math.max(1, Math.round(dims.height * scale))
          }
          const offsetX = Math.max(0, Math.round((boxWidth - renderWidth) / 2))
          const offsetY = Math.max(0, Math.round((boxHeight - renderHeight) / 2))
          // Excel row height uses points (~0.75 * px). Keep fixed box height for all images.
          ws.getRow(imageRow).height = Math.max(110, Math.round((boxHeight + 14) * 0.75))
          const imageId = wb.addImage({
            base64: embedded.base64,
            extension: embedded.extension
          })
          ws.addImage(imageId, {
            tl: { col: 0.2 + (offsetX / 64), row: imageRow - 1 + 0.1 + (offsetY / 20) },
            ext: { width: renderWidth, height: renderHeight }
          })
          row += 1
        }
      })
    }

    merge(`A${row}:E${row}`); merge(`F${row}:I${row}`); merge(`J${row}:M${row}`)
    setCell(`A${row}`, 'Administrador de contrato', { fill: blueFill, font: whiteFont })
    setCell(`F${row}`, String(report.client_name || 'Cliente'), { fill: blueFill, font: whiteFont })
    setCell(`J${row}`, 'Representante agente (Superintendente o Gerente)', { fill: blueFill, font: whiteFont })
    row += 1

    merge(`A${row}:E${row}`); merge(`F${row}:I${row}`); merge(`J${row}:M${row}`)
    setCell(`A${row}`, 'Nombre:', { alignment: { horizontal: 'left' } })
    setCell(`F${row}`, 'Nombre:', { alignment: { horizontal: 'left' } })
    setCell(`J${row}`, 'Nombre:', { alignment: { horizontal: 'left' } })
    row += 1

    merge(`A${row}:E${row + 2}`); merge(`F${row}:I${row + 2}`); merge(`J${row}:M${row + 2}`)
    setCell(`A${row}`, 'Firma:', { alignment: { horizontal: 'left', vertical: 'top' } })
    setCell(`F${row}`, 'Firma:', { alignment: { horizontal: 'left', vertical: 'top' } })
    setCell(`J${row}`, 'Firma:', { alignment: { horizontal: 'left', vertical: 'top' } })
    row += 3

    merge(`A${row}:E${row}`); merge(`F${row}:I${row}`); merge(`J${row}:M${row}`)
    setCell(`A${row}`, `Fecha: ${latamDate(report.report_date)}`, { alignment: { horizontal: 'left' } })
    setCell(`F${row}`, 'Fecha:', { alignment: { horizontal: 'left' } })
    setCell(`J${row}`, 'Fecha:', { alignment: { horizontal: 'left' } })

    if (debugMode) {
      const dbg = wb.addWorksheet('DEBUG_EXPORT')
      const push = (k: string, v: any) => dbg.addRow([k, typeof v === 'string' ? v : JSON.stringify(v)])
      push('daily_report_id', id)
      push('report_date', day)
      push('source_field_report_ids_count', sourceIds.length)
      push('source_field_report_ids', sourceIds)
      push('all_field_reports_count', allFieldReports.length)
      push('filtered_field_reports_count', fieldReports.length)
      push('evidence_items_count', evidenceItems.length)
      push('evidence_links_count', evidenceLinks.length)
      push('evidence_items_sample', evidenceItems.slice(0, 10))
      push('evidence_links_sample', evidenceLinks.slice(0, 10).map((x) => ({
        key: x.key,
        name: x.name,
        activityName: x.activityName,
        hasUrl: !!x.url
      })))
      const first = fieldReports[0] || {}
      push('first_report_id', first?.id || '')
      push('first_report_assignments_raw', first?.assignments || null)
      push('first_report_activities_raw', first?.activities || null)
      push('first_report_activity_observations_raw', first?.activity_observations || null)
      dbg.columns = [{ width: 42 }, { width: 140 }]
    }

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte-diario-${report.report_no}-${String(report.report_date || '').slice(0, 10)}.xlsx"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err || 'Error exportando') }, { status: 500 })
  }
}
