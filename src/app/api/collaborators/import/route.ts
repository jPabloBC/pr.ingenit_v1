import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { normalizeText } from '../../../../lib/normalize'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const normalizeKey = (value: unknown) => {
  if (value === undefined || value === null) return ''
  return String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
}

const normalizeConditionValue = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  if (normalized === 'turno') return 'turno'
  if (normalized === 'descanso') return 'descanso'
  if (normalized === 'permiso') return 'permiso'
  if (normalized === 'teletrabajo') return 'teletrabajo'
  if (normalized === 'vacaciones') return 'vacaciones'
  if (normalized === 'licencia') return 'licencia'
  if (normalized === 'acreditacion') return 'acreditacion'
  if (normalized === 'finiquitado') return 'finiquitado'
  return null
}

const toLegacyConditionValue = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  const normalized = String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (!normalized) return null
  if (normalized === 'vigente') return 'Vigente'
  if (normalized === 'finiquitado') return 'Finiquitado'
  if (normalized === 'turno') return 'Turno'
  if (normalized === 'descanso') return 'Descanso'
  if (normalized === 'permiso') return 'Permiso'
  if (normalized === 'teletrabajo') return 'Teletrabajo'
  if (normalized === 'vacaciones') return 'Vacaciones'
  if (normalized === 'licencia') return 'Licencia'
  if (normalized === 'acreditacion') return 'Acreditacion'
  return null
}

const isConditionConstraintError = (error: any) =>
  String(error?.message || '').includes('pr_collaborators_condition_chk')

const parseIsActiveValue = (value: unknown): boolean | null => {
  if (value === undefined || value === null) return null
  const normalized = String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (!normalized) return null

  if (['true', '1', 'si', 'sí', 'yes', 'activo', 'vigente'].includes(normalized)) return true
  if (['false', '0', 'no', 'inactivo', 'finiquitado'].includes(normalized)) return false
  return null
}

const mapDailyStatusCode = (value: unknown): {
  normalizedCondition: string | null
  effectiveIsActive: boolean | null
  dailyStatus: string | null
  dailyReason: string | null
} => {
  const raw = String(value || '').trim()
  if (!raw) {
    return {
      normalizedCondition: null,
      effectiveIsActive: null,
      dailyStatus: null,
      dailyReason: null,
    }
  }

  const key = normalizeKey(raw)

  if (key === '11' || key === 'TURNO' || key === 'PRESENTE' || key === 'ENURNO') {
    return {
      normalizedCondition: 'Turno',
      effectiveIsActive: true,
      dailyStatus: 'Turno',
      dailyReason: null,
    }
  }

  if (key === 'D' || key === 'DESCANSO') {
    return {
      normalizedCondition: 'Descanso',
      effectiveIsActive: true,
      dailyStatus: 'Descanso',
      dailyReason: null,
    }
  }

  if (key === 'L' || key === 'LICENCIA') {
    return {
      normalizedCondition: null,
      effectiveIsActive: true,
      dailyStatus: 'Licencia',
      dailyReason: null,
    }
  }

  if (key === 'F' || key === 'FALLA') {
    return {
      normalizedCondition: null,
      effectiveIsActive: true,
      dailyStatus: 'Falla',
      dailyReason: 'F',
    }
  }

  if (key === 'FO' || key === 'FUERADEOBRA') {
    return {
      normalizedCondition: null,
      effectiveIsActive: true,
      dailyStatus: 'Fuera de Obra',
      dailyReason: null,
    }
  }

  if (key === 'AC' || key === 'ACRED' || key === 'ACREDITACION') {
    return {
      normalizedCondition: 'Acreditacion',
      effectiveIsActive: true,
      dailyStatus: 'Acreditacion',
      dailyReason: null,
    }
  }

  if (key === 'P' || key === 'PERMISO') {
    return {
      normalizedCondition: 'Permiso',
      effectiveIsActive: true,
      dailyStatus: 'Permiso',
      dailyReason: null,
    }
  }

  if (key === 'FIN' || key === 'FINIQUITADO' || key === 'FINIQUITADOR') {
    return {
      normalizedCondition: 'Finiquitado',
      effectiveIsActive: false,
      dailyStatus: 'Finiquitado',
      dailyReason: null,
    }
  }

  if (key === 'VIGENTE') {
    return {
      normalizedCondition: null,
      effectiveIsActive: true,
      dailyStatus: null,
      dailyReason: null,
    }
  }

  const normalizedCondition = normalizeConditionValue(raw)
  const effectiveIsActive = parseIsActiveValue(raw)

  if (normalizedCondition) {
    return {
      normalizedCondition,
      effectiveIsActive,
      dailyStatus: normalizedCondition === 'Finiquitado' ? 'Finiquitado' : normalizedCondition,
      dailyReason: null,
    }
  }

  // Unknown markers are skipped (do not force "Otro").
  return {
    normalizedCondition: null,
    effectiveIsActive,
    dailyStatus: null,
    dailyReason: raw,
  }
}

const parseInputDateToISO = (value: unknown): string | null => {
  const raw = String(value || '').trim()
  if (!raw) return null

  if (/^\d+(\.0+)?$/.test(raw)) {
    const serial = Math.round(Number(raw))
    if (Number.isFinite(serial) && serial >= 20000 && serial <= 60000) {
      const excelEpoch = Date.UTC(1899, 11, 30)
      const dt = new Date(excelEpoch + serial * 86400000)
      if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
    }
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const isoDateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s].*$/)
  if (isoDateTime) return `${isoDateTime[1]}-${isoDateTime[2]}-${isoDateTime[3]}`

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3])
    const dt = new Date(Date.UTC(year, month - 1, day))
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  }
  const dmyWithTime = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[T\s].*$/)
  if (dmyWithTime) {
    const day = Number(dmyWithTime[1])
    const month = Number(dmyWithTime[2])
    const year = Number(dmyWithTime[3])
    const dt = new Date(Date.UTC(year, month - 1, day))
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  }

  const dmyAlt = raw.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})$/)
  if (dmyAlt) {
    const day = Number(dmyAlt[1])
    const month = Number(dmyAlt[2])
    let year = Number(dmyAlt[3])
    if (year < 100) year += 2000
    const dt = new Date(Date.UTC(year, month - 1, day))
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const rows: any[] = body.rows || []
    const options = body.options || {
      onDuplicate: 'overwrite',
      createAuth: true,
      updateDefaults: true,
      attendanceOnly: false,
      profileOnly: false,
      allowAttendanceForSkippedDuplicates: false,
    }
    const stream = Boolean(body.stream)
    const attendanceOnly = Boolean(options.attendanceOnly)
    const profileOnly = Boolean(options.profileOnly)
    const attendanceStartDate = parseInputDateToISO(options.attendanceStartDate)
    const attendanceExactDate = parseInputDateToISO(options.attendanceExactDate)
    const attendanceWriteMode = String(options.attendanceWriteMode || 'insert_only').toLowerCase() === 'upsert'
      ? 'upsert'
      : 'insert_only'
    const targetDocumentsSet = new Set(
      Array.isArray(options.targetDocuments)
        ? options.targetDocuments.map((doc: unknown) => normalizeKey(doc)).filter(Boolean)
        : []
    )
    const onDuplicate = String(options.onDuplicate || 'overwrite').toLowerCase() === 'skip' ? 'skip' : 'overwrite'
    const allowAttendanceForSkippedDuplicates = Boolean(options.allowAttendanceForSkippedDuplicates)

    type ProgressEvent = {
      type: 'progress' | 'done' | 'error'
      stage: string
      message: string
      percent: number
      current?: number
      total?: number
      payload?: any
    }
    const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

    const executeImport = async (emit?: (event: ProgressEvent) => void) => {
      const push = (event: Omit<ProgressEvent, 'type'> & { type?: 'progress' | 'done' | 'error' }) => {
        if (!emit) return
        emit({
          type: event.type || 'progress',
          stage: event.stage,
          message: event.message,
          percent: clampPercent(event.percent),
          current: event.current,
          total: event.total,
          payload: event.payload,
        })
      }

      push({
        stage: 'init',
        message: attendanceOnly
          ? 'Iniciando actualización de asistencia...'
          : profileOnly
            ? 'Iniciando actualización de datos...'
            : 'Iniciando importación...',
        percent: 3,
        current: 0,
        total: rows.length
      })

      const results: any[] = []
      let inserted = 0
      let updated = 0
      let skipped = 0
      let attendanceRowsWritten = 0
      let attendanceRowsDetected = 0
      let attendanceRowsAttempted = 0
      let attendanceRowsSkippedNoStatus = 0
      const attendanceDatesDetectedSet = new Set<string>()
      const attendanceDatesWrittenSet = new Set<string>()
      const attendanceCodeCounts: Record<string, number> = {}
      const attendanceStatusCounts: Record<string, number> = {}
      const attendanceOtherSamples = new Set<string>()
      const documentsProcessedSet = new Set<string>()
      const documentsMatchedSet = new Set<string>()
      const documentsNotFoundSet = new Set<string>()
      const documentsAttendanceUpdatedSet = new Set<string>()
      const errors: any[] = []
      let filtered_out = 0
      const today = new Date().toISOString().slice(0, 10)
      const totalRows = rows.length
      const progressEvery = Math.max(1, Math.floor(totalRows / 200))

      push({ stage: 'loading_collaborators', message: 'Cargando colaboradores existentes...', percent: 6 })
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
      const pageSize = 1000
      let existingCollaborators: any[] = []
      let pageIndex = 0
      while (true) {
        let pageRows: any[] = []
        let pageError: any = null
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const from = pageIndex * pageSize
            const to = from + pageSize - 1
            const { data, error } = await supabaseAdmin
              .from('pr_collaborators')
              .select('id, document, is_active, updated_at, created_at, user_id, email')
              .eq('company_id', session.user.companyId)
              .order('id', { ascending: true })
              .range(from, to)
            if (error) {
              pageError = error
            } else {
              pageRows = Array.isArray(data) ? data : []
              pageError = null
              break
            }
          } catch (err) {
            pageError = err
          }
          if (attempt < 3) {
            push({
              stage: 'loading_collaborators',
              message: `Reintentando carga de colaboradores (página ${pageIndex + 1}, intento ${attempt + 1}/3)...`,
              percent: 6,
            })
            await sleep(250 * attempt)
          }
        }

        if (pageError) {
          const detail = pageError?.message || String(pageError)
          throw new Error(`Error cargando colaboradores existentes (página ${pageIndex + 1}): ${detail}`)
        }

        if (pageRows.length === 0) break
        existingCollaborators = existingCollaborators.concat(pageRows)
        pageIndex += 1

        if (pageRows.length < pageSize) break
      }

      const collaboratorsByDocument = new Map<string, any[]>()
      const collaboratorsByEmail = new Map<string, any[]>()
      for (const collab of Array.isArray(existingCollaborators) ? existingCollaborators : []) {
        const normalizedDoc = normalizeKey(collab?.document)
        if (normalizedDoc) {
          const list = collaboratorsByDocument.get(normalizedDoc) || []
          list.push(collab)
          collaboratorsByDocument.set(normalizedDoc, list)
        }
        const normalizedEmail = String(collab?.email || '').trim().toLowerCase()
        if (normalizedEmail) {
          const listByEmail = collaboratorsByEmail.get(normalizedEmail) || []
          listByEmail.push(collab)
          collaboratorsByEmail.set(normalizedEmail, listByEmail)
        }
      }
      for (const [doc, list] of collaboratorsByDocument.entries()) {
        list.sort((a: any, b: any) => {
          if (Boolean(a?.is_active) !== Boolean(b?.is_active)) return a?.is_active ? -1 : 1
          const aDate = new Date(String(a?.updated_at || a?.created_at || 0)).getTime()
          const bDate = new Date(String(b?.updated_at || b?.created_at || 0)).getTime()
          return bDate - aDate
        })
        collaboratorsByDocument.set(doc, list)
      }
      for (const [email, list] of collaboratorsByEmail.entries()) {
        list.sort((a: any, b: any) => {
          if (Boolean(a?.is_active) !== Boolean(b?.is_active)) return a?.is_active ? -1 : 1
          const aDate = new Date(String(a?.updated_at || a?.created_at || 0)).getTime()
          const bDate = new Date(String(b?.updated_at || b?.created_at || 0)).getTime()
          return bDate - aDate
        })
        collaboratorsByEmail.set(email, list)
      }

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        try {
          const first_name = (r.first_name || '').trim()
          const last_name = (r.last_name || '').trim()
          const document = (r.document || '').trim()
          const email = (r.email || '').trim()

          if ((!document && !email && profileOnly) || (!document && attendanceOnly) || (!attendanceOnly && !profileOnly && (!document || !first_name || !last_name))) {
            skipped++
            errors.push({
              row: i + 1,
              reason: attendanceOnly
                ? 'Falta document para actualizar asistencia'
                : profileOnly
                  ? 'Falta identificador (document o email) para actualizar ficha'
                : 'Faltan campos requeridos (first_name/last_name/document)'
            })
            continue
          }

          const docClean = String(document || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
          const emailClean = String(email || '').trim().toLowerCase()
          if (docClean) documentsProcessedSet.add(docClean)
          else if (emailClean) documentsProcessedSet.add(emailClean)
          if (targetDocumentsSet.size > 0 && !targetDocumentsSet.has(normalizeKey(docClean))) {
            filtered_out++
            continue
          }

          const existingList = collaboratorsByDocument.get(normalizeKey(docClean)) || []
          const existingEmailList = collaboratorsByEmail.get(emailClean) || []
          const sortedExisting = [...existingList]
          const existingTarget = sortedExisting[0] || existingEmailList[0] || null
          if (existingTarget) {
            if (docClean) documentsMatchedSet.add(docClean)
            else if (emailClean) documentsMatchedSet.add(emailClean)
          }

          let userId: string | null = existingTarget?.user_id ? String(existingTarget.user_id) : null

          if (!attendanceOnly && !profileOnly && !userId && options.createAuth && email) {
            try {
              const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
                email,
                password: r.password || 'temp_password_123',
                email_confirm: true
              })
              if (authErr) {
                if (String(authErr.message || '').toLowerCase().includes('already')) {
                  try {
                    const list = await supabaseAdmin.auth.admin.listUsers()
                    const found = (list.data?.users || []).find((u: any) => u.email === email)
                    if (found) userId = found.id
                  } catch {}
                }
              } else {
                userId = authData?.user?.id ?? null
              }
            } catch {}
          }

          const parseDateInput = (v: any) => {
            if (v === undefined || v === null || v === '') return null
            if (typeof v === 'number' || (/^\d+$/.test(String(v).trim()))) {
              const num = Number(v)
              if (!isNaN(num)) {
                const ts = (num - 25569) * 86400000
                const d = new Date(ts)
                if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
              }
            }
            const s = String(v).trim()
            const dm = s.match(/^(\d{1,2})[-\/]?(\d{1,2})[-\/]?(\d{2,4})$/)
            if (dm) {
              let day = Number(dm[1]), month = Number(dm[2]), year = Number(dm[3])
              if (year < 100) year += 1900
              const d = new Date(year, month - 1, day)
              if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
            }
            const d2 = new Date(s)
            if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0]
            return null
          }

          const normalizeGender = (v: any) => {
            if (v === undefined || v === null) return null
            const s = String(v).toLowerCase().trim()
            if (!s) return null
            if (['m', 'male', 'masculino', 'hombre', 'varon', 'varón'].includes(s)) return 'M'
            if (['f', 'female', 'femenino', 'mujer'].includes(s)) return 'F'
            if (['o', 'other', 'otro', 'non-binary', 'nb'].includes(s)) return 'O'
            return null
          }

          const attendanceByDateInput =
            r.attendance_by_date && typeof r.attendance_by_date === 'object'
              ? (r.attendance_by_date as Record<string, unknown>)
              : {}

          const inferredFromRowKeys: Record<string, unknown> = {}
          Object.entries(r || {}).forEach(([key, value]) => {
            if (key === 'attendance_by_date') return
            const asIso = parseInputDateToISO(key)
            if (!asIso) return
            inferredFromRowKeys[asIso] = value
          })

          const normalizedExplicitMap: Record<string, unknown> = {}
          Object.entries(attendanceByDateInput).forEach(([key, value]) => {
            const asIso = parseInputDateToISO(key)
            if (asIso) normalizedExplicitMap[asIso] = value
          })
          const attendanceByDate: Record<string, unknown> = {
            ...inferredFromRowKeys,
            ...normalizedExplicitMap,
          }

          const attendanceEntries = Object.entries(attendanceByDate)
            .map(([dateKey, value]) => ({
              work_date: parseInputDateToISO(dateKey),
              raw_value: String(value ?? '').trim(),
            }))
            .filter((entry) => Boolean(entry.work_date) && Boolean(entry.raw_value))
            .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)))
          const attendanceEntriesForImport = attendanceExactDate
            ? attendanceEntries.filter((entry) => String(entry.work_date) === attendanceExactDate)
            : attendanceStartDate
              ? attendanceEntries.filter((entry) => String(entry.work_date) >= attendanceStartDate)
              : attendanceEntries
          attendanceRowsDetected += attendanceEntries.length
          attendanceEntriesForImport.forEach((entry) => {
            if (entry.work_date) attendanceDatesDetectedSet.add(String(entry.work_date))
          })

          const rawStatusCode =
            r.condition ??
            r.status ??
            r.estado ??
            r.estado_actual ??
            r.current_status ??
            r.worker_status
          const latestAttendanceRaw =
            attendanceEntriesForImport.length > 0
              ? attendanceEntriesForImport[attendanceEntriesForImport.length - 1].raw_value
              : null
          // Attendance columns are daily facts, not collaborator master-state changes.
          // Only explicit scalar status/condition fields should update the collaborator record.
          const hasStatusSignal = Boolean(rawStatusCode)
          const statusFromCode = mapDailyStatusCode(rawStatusCode || latestAttendanceRaw)
          const parsedIsActive = parseIsActiveValue(r.is_active)
          const effectiveIsActive = parsedIsActive ?? statusFromCode.effectiveIsActive ?? true
          const effectiveCondition = effectiveIsActive === false ? 'finiquitado' : 'vigente'

          const record: any = {
            company_id: session.user.companyId,
            first_name,
            last_name,
            document: docClean,
            email: email || null,
            phone: r.phone || null,
            address: r.address || null,
            position: r.position ? String(r.position).trim().replace(/\s+/g, ' ') : null,
            shift_pattern: r.shift_pattern ? String(r.shift_pattern).trim() : null,
            condition: effectiveCondition,
            exception_condition: r.exception_condition ? String(r.exception_condition).trim() : null,
            specialty: r.specialty ? String(r.specialty).trim().replace(/\s+/g, ' ') : null,
            worker_type: r.worker_type ? String(r.worker_type).trim().toLowerCase() : null,
            contract: r.contract ? String(r.contract).trim() : null,
            salary: r.salary ? Number(String(r.salary).replace(/[^0-9.-]/g, '')) : null,
            birth_date: parseDateInput(r.birth_date),
            hire_date: parseDateInput(r.hire_date),
            emergency_contact: r.emergency_contact || null,
            upper_clothing_size: r.upper_clothing_size || null,
            lower_clothing_size: r.lower_clothing_size || null,
            shoe_size: r.shoe_size || null,
            gender: normalizeGender(r.gender),
            photo_url: r.photo_url || null,
            epp_details: r.epp_details ? (typeof r.epp_details === 'string' ? (() => { try { return JSON.parse(r.epp_details) } catch { return {} } })() : r.epp_details) : {},
            is_active: effectiveIsActive,
            user_id: userId
          }

          const buildDailyStatusPayload = (collaboratorId: string, workDate: string, rawCode: unknown) => {
            attendanceRowsAttempted++
            const normalizedCode = normalizeKey(rawCode) || '(EMPTY)'
            attendanceCodeCounts[normalizedCode] = (attendanceCodeCounts[normalizedCode] || 0) + 1
            const mapped = mapDailyStatusCode(rawCode)
            const dailyStatus = mapped.dailyStatus
            if (!dailyStatus) {
              attendanceRowsSkippedNoStatus++
              return null
            }
            attendanceStatusCounts[dailyStatus] = (attendanceStatusCounts[dailyStatus] || 0) + 1
            if (dailyStatus === 'Otro' && attendanceOtherSamples.size < 20) {
              attendanceOtherSamples.add(String(rawCode ?? '').trim())
            }

            const explicitReason = r.status_reason ? String(r.status_reason).trim() : ''
            const rawReason = String(rawCode ?? '').trim()
            const reason = mapped.dailyReason || explicitReason || rawReason || null
            return {
              company_id: session.user.companyId,
              collaborator_id: collaboratorId,
              work_date: workDate,
              status: dailyStatus,
              reason: reason || null,
              updated_by: null as string | null,
            }
          }

          const writeAllDailyStatuses = async (collaboratorId: string) => {
            const payloads: Array<{
              company_id: string
              collaborator_id: string
              work_date: string
              status: string
              reason: string | null
              updated_by: string | null
            }> = []

            for (const entry of attendanceEntriesForImport) {
              if (!entry.work_date) continue
              const payload = buildDailyStatusPayload(collaboratorId, entry.work_date, entry.raw_value)
              if (payload) payloads.push(payload)
            }
            if (rawStatusCode) {
              const payload = buildDailyStatusPayload(collaboratorId, today, rawStatusCode)
              if (payload) payloads.push(payload)
            }
            if (payloads.length === 0) return

            const uniqueByDate = new Map<string, (typeof payloads)[number]>()
            for (const item of payloads) uniqueByDate.set(String(item.work_date), item)
            let deduped = Array.from(uniqueByDate.values())

            if (attendanceWriteMode === 'insert_only' && deduped.length > 0) {
              const dates = deduped.map((row) => String(row.work_date)).filter(Boolean)
              const { data: existingRows, error: existingErr } = await supabaseAdmin
                .from('pr_collaborator_daily_status')
                .select('work_date')
                .eq('company_id', session.user.companyId)
                .eq('collaborator_id', collaboratorId)
                .in('work_date', dates)

              if (existingErr) {
                throw new Error(`Error consultando asistencia existente (${collaboratorId}): ${existingErr.message}`)
              }

              const existingDateSet = new Set((existingRows || []).map((row: any) => String(row?.work_date || '')).filter(Boolean))
              deduped = deduped.filter((row) => !existingDateSet.has(String(row.work_date)))
            }

            if (deduped.length === 0) return

            const BATCH_SIZE = 300
            for (let start = 0; start < deduped.length; start += BATCH_SIZE) {
              const batch = deduped.slice(start, start + BATCH_SIZE)
              const writeBuilder = supabaseAdmin.from('pr_collaborator_daily_status')
              const writeResult = attendanceWriteMode === 'upsert'
                ? await writeBuilder.upsert(batch, { onConflict: 'company_id,collaborator_id,work_date' })
                : await writeBuilder.insert(batch)
              const upsertError = writeResult.error

              if (upsertError) {
                if (String(upsertError.code) === '42P01') {
                  throw new Error('Tabla pr_collaborator_daily_status no existe. Ejecuta migración.')
                }
                throw new Error(`Error escribiendo asistencia (${collaboratorId}): ${upsertError.message}`)
              }
            }

            attendanceRowsWritten += deduped.length
            deduped.forEach((row) => attendanceDatesWrittenSet.add(String(row.work_date)))
          }

          if (!attendanceOnly && onDuplicate === 'skip' && existingTarget) {
            if (allowAttendanceForSkippedDuplicates) {
              const activeTargets = existingList.filter((x: any) => Boolean(x?.is_active))
              const attendanceTargets = activeTargets.length > 0 ? activeTargets : [existingTarget]
              for (const target of attendanceTargets) {
                if (!target?.id) continue
                await writeAllDailyStatuses(String(target.id))
              }
              if (attendanceEntriesForImport.length > 0 || rawStatusCode) {
                documentsAttendanceUpdatedSet.add(docClean)
              }
              updated++
              results.push({
                row: i + 1,
                id: existingTarget.id,
                action: 'attendance_updated_skip_duplicate',
                targets_count: attendanceTargets.length,
              })
            } else {
              skipped++
              errors.push({ row: i + 1, reason: 'Duplicado por document (omitido por configuración)', id: existingTarget.id })
            }
            continue
          }

          if (attendanceOnly) {
            if (!existingTarget) {
              skipped++
              documentsNotFoundSet.add(docClean)
              errors.push({ row: i + 1, reason: 'Colaborador no encontrado por document para actualizar asistencia', document: docClean })
              continue
            }

            // Attendance-only mode: update all active records for the same document.
            // If no active records exist, fallback to the most recent one.
            const activeTargets = existingList.filter((x: any) => Boolean(x?.is_active))
            const attendanceTargets = activeTargets.length > 0 ? activeTargets : [existingTarget]

            for (const target of attendanceTargets) {
              if (!target?.id) continue
              if (parsedIsActive !== null || hasStatusSignal) {
                const updatePayload: Record<string, any> = {
                  is_active: effectiveIsActive,
                  condition: effectiveCondition,
                }
            let { error: updErr } = await supabaseAdmin
              .from('pr_collaborators')
              .update(updatePayload)
              .eq('id', target.id)

            if (updErr && isConditionConstraintError(updErr) && updatePayload.condition) {
              const legacyPayload = { ...updatePayload, condition: toLegacyConditionValue(updatePayload.condition) || updatePayload.condition }
              const retryLegacy = await supabaseAdmin
                .from('pr_collaborators')
                .update(legacyPayload)
                .eq('id', target.id)
              updErr = retryLegacy.error as any
            }

            if (updErr && String((updErr as any).code) === '42703') {
              const fallbackPayload = { ...updatePayload } as any
              delete fallbackPayload.condition
                  const retry = await supabaseAdmin
                    .from('pr_collaborators')
                    .update(fallbackPayload)
                    .eq('id', target.id)
                  updErr = retry.error as any
                }

                if (updErr) {
                  skipped++
                  errors.push({ row: i + 1, reason: 'Error actualizando estado del colaborador', details: updErr.message, id: target.id })
                  continue
                }
              }

              await writeAllDailyStatuses(String(target.id))
            }
            if (attendanceEntriesForImport.length > 0 || rawStatusCode) {
              documentsAttendanceUpdatedSet.add(docClean)
            }
            updated++
            results.push({
              row: i + 1,
              id: existingTarget.id,
              action: 'attendance_updated',
              targets_count: attendanceTargets.length,
            })
          } else if (profileOnly) {
            if (!existingTarget) {
              skipped++
              if (docClean) documentsNotFoundSet.add(docClean)
              else if (emailClean) documentsNotFoundSet.add(emailClean)
              errors.push({ row: i + 1, reason: 'Colaborador no encontrado por document/email para actualizar ficha', document: docClean || null, email: emailClean || null })
              continue
            }

            const updatePayload: Record<string, any> = {}
            for (const [key, value] of Object.entries(record)) {
              if (key === 'company_id' || key === 'user_id') continue
              if (value === undefined || value === null || value === '') continue
              updatePayload[key] = value
            }
            if (parsedIsActive !== null || hasStatusSignal) {
              updatePayload.is_active = effectiveIsActive
              updatePayload.condition = effectiveCondition
            }
            if (Object.keys(updatePayload).length === 0) {
              skipped++
              errors.push({ row: i + 1, reason: 'Sin columnas mapeadas con datos para actualizar ficha', id: existingTarget.id })
              continue
            }

            let { error: updErr } = await supabaseAdmin
              .from('pr_collaborators')
              .update(updatePayload)
              .eq('id', existingTarget.id)

            if (updErr && isConditionConstraintError(updErr) && updatePayload.condition) {
              const legacyPayload = { ...updatePayload, condition: toLegacyConditionValue(updatePayload.condition) || updatePayload.condition }
              const retryLegacy = await supabaseAdmin
                .from('pr_collaborators')
                .update(legacyPayload)
                .eq('id', existingTarget.id)
              updErr = retryLegacy.error as any
            }

            if (updErr && String((updErr as any).code) === '42703') {
              const fallbackPayload = { ...updatePayload } as any
              delete fallbackPayload.condition
              const retry = await supabaseAdmin
                .from('pr_collaborators')
                .update(fallbackPayload)
                .eq('id', existingTarget.id)
              updErr = retry.error as any
            }

            if (updErr) {
              skipped++
              errors.push({ row: i + 1, reason: 'Error actualizando ficha de colaborador', details: updErr.message, id: existingTarget.id })
              continue
            }

            updated++
            results.push({ row: i + 1, id: existingTarget.id, action: 'profile_updated' })
          } else if (existingTarget) {
            const updatePayload: Record<string, any> = {}
            for (const [key, value] of Object.entries(record)) {
              if (key === 'company_id' || key === 'document') continue
              if (value === undefined || value === null || value === '') continue
              updatePayload[key] = value
            }
            if (parsedIsActive !== null || hasStatusSignal) {
              updatePayload.is_active = effectiveIsActive
              updatePayload.condition = effectiveCondition
            }

            let { error: updErr } = await supabaseAdmin
              .from('pr_collaborators')
              .update(updatePayload)
              .eq('id', existingTarget.id)

            if (updErr && isConditionConstraintError(updErr) && updatePayload.condition) {
              const legacyPayload = { ...updatePayload, condition: toLegacyConditionValue(updatePayload.condition) || updatePayload.condition }
              const retryLegacy = await supabaseAdmin
                .from('pr_collaborators')
                .update(legacyPayload)
                .eq('id', existingTarget.id)
              updErr = retryLegacy.error as any
            }

            if (updErr && String((updErr as any).code) === '42703') {
              const fallbackPayload = { ...updatePayload } as any
              delete fallbackPayload.condition
              const retry = await supabaseAdmin
                .from('pr_collaborators')
                .update(fallbackPayload)
                .eq('id', existingTarget.id)
              updErr = retry.error as any
            }

            if (updErr) {
              skipped++
              errors.push({ row: i + 1, reason: 'Error actualizando colaborador existente', details: updErr.message, id: existingTarget.id })
              continue
            }

            await writeAllDailyStatuses(String(existingTarget.id))
            if (attendanceEntriesForImport.length > 0 || rawStatusCode) {
              documentsAttendanceUpdatedSet.add(docClean)
            }

            updated++
            results.push({ row: i + 1, id: existingTarget.id, action: 'updated' })
          } else {
            let { data: ins, error: insErr } = await supabaseAdmin.from('pr_collaborators').insert(record).select().single()
            if (insErr && isConditionConstraintError(insErr) && record?.condition) {
              const legacyRecord = { ...record, condition: toLegacyConditionValue(record.condition) || record.condition }
              const retryLegacy = await supabaseAdmin.from('pr_collaborators').insert(legacyRecord).select().single()
              ins = retryLegacy.data as any
              insErr = retryLegacy.error as any
            }
            if (insErr && String((insErr as any).code) === '42703') {
              const fallbackRecord = { ...record } as any
              delete fallbackRecord.condition
              const retry = await supabaseAdmin.from('pr_collaborators').insert(fallbackRecord).select().single()
              ins = retry.data as any
              insErr = retry.error as any
            }
            if (insErr) {
              skipped++
              errors.push({ row: i + 1, reason: 'Error insert collaborator', details: insErr.message })
              continue
            }

            await writeAllDailyStatuses(String(ins.id))
            if (attendanceEntriesForImport.length > 0 || rawStatusCode) {
              documentsAttendanceUpdatedSet.add(docClean)
            }

            inserted++
            const docKey = normalizeKey(docClean)
            const current = collaboratorsByDocument.get(docKey) || []
            current.unshift(ins)
            collaboratorsByDocument.set(docKey, current)
            results.push({ row: i + 1, id: ins.id, action: 'inserted' })
          }
        } catch (err) {
          skipped++
          errors.push({ row: i + 1, reason: 'Unexpected error', details: String(err) })
        } finally {
          if (rows.length > 0 && (i === 0 || (i + 1) % progressEvery === 0 || i === rows.length - 1)) {
            const percent = 10 + ((i + 1) / rows.length) * 80
            push({
              stage: 'processing_rows',
              message: attendanceOnly
                ? `Procesando asistencia (${i + 1}/${rows.length})...`
                : profileOnly
                  ? `Procesando actualización de datos (${i + 1}/${rows.length})...`
                : `Procesando colaboradores (${i + 1}/${rows.length})...`,
              percent,
              current: i + 1,
              total: rows.length,
            })
          }
        }
      }

      if (!attendanceOnly && !profileOnly && options.updateDefaults) {
        push({ stage: 'update_defaults', message: 'Actualizando catálogos por defecto...', percent: 92 })
        try {
          const { data: comp, error: compErr } = await supabaseAdmin.from('pr_companies').select('id,default_positions,default_specialties').eq('id', session.user.companyId).single()
          if (!compErr && comp) {
            const curPos = Array.isArray(comp.default_positions) ? comp.default_positions.map((p: any) => normalizeText(String(p))) : []
            const curSpec = Array.isArray(comp.default_specialties) ? comp.default_specialties.map((s: any) => normalizeText(String(s))) : []
            const toAddPos = new Set<string>()
            const toAddSpec = new Set<string>()
            for (const r of rows) {
              if (r.position) {
                const norm = normalizeText(String(r.position))
                if (norm && !curPos.includes(norm)) toAddPos.add(norm)
              }
              if (r.specialty) {
                const norm = normalizeText(String(r.specialty))
                if (norm && !curSpec.includes(norm)) toAddSpec.add(norm)
              }
            }
            const newPos = [...curPos, ...Array.from(toAddPos)]
            const newSpec = [...curSpec, ...Array.from(toAddSpec)]
            if (toAddPos.size || toAddSpec.size) {
              await supabaseAdmin.from('pr_companies').update({ default_positions: newPos, default_specialties: newSpec }).eq('id', session.user.companyId)
            }
          }
        } catch {}
      }

      push({ stage: 'finalizing', message: 'Finalizando importación...', percent: 98 })

      return {
        inserted,
        updated,
        skipped,
        errors,
        error_sample: errors.length > 0 ? errors[0] : null,
        results,
        onDuplicate,
        attendance_rows_detected: attendanceRowsDetected,
        attendance_rows_written: attendanceRowsWritten,
        attendance_dates_detected: Array.from(attendanceDatesDetectedSet).sort(),
        attendance_dates_written: Array.from(attendanceDatesWrittenSet).sort(),
        attendance_start_date: attendanceStartDate || null,
        attendance_exact_date: attendanceExactDate || null,
        filtered_out,
        target_documents_count: targetDocumentsSet.size,
        diagnostics: {
          documents_processed_count: documentsProcessedSet.size,
          documents_matched_count: documentsMatchedSet.size,
          documents_not_found_count: documentsNotFoundSet.size,
          documents_attendance_updated_count: documentsAttendanceUpdatedSet.size,
          documents_not_found: Array.from(documentsNotFoundSet).sort(),
          documents_attendance_updated: Array.from(documentsAttendanceUpdatedSet).sort(),
          attendance_rows_attempted: attendanceRowsAttempted,
          attendance_rows_skipped_no_status: attendanceRowsSkippedNoStatus,
          attendance_code_counts: attendanceCodeCounts,
          attendance_status_counts: attendanceStatusCounts,
          attendance_other_samples: Array.from(attendanceOtherSamples),
        }
      }
    }

    if (!stream) {
      const result = await executeImport()
      return NextResponse.json(result)
    }

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      start(controller) {
        const write = (event: ProgressEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }

        ;(async () => {
          try {
            const payload = await executeImport((event) => write(event))
            write({
              type: 'done',
              stage: 'done',
              message: 'Importación completada',
              percent: 100,
              payload,
            })
          } catch (error) {
            write({
              type: 'error',
              stage: 'error',
              message: 'Error en importación',
              percent: 100,
              payload: { error: String(error) },
            })
          } finally {
            controller.close()
          }
        })()
      },
    })

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('Error in import endpoint:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
