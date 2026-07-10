import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { resolveCurrentActor } from '@/lib/currentActor'

const getSupabaseAdminClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  return createClient(supabaseUrl, serviceRoleKey)
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
  if (normalized === 'turno') return 'Turno'
  if (normalized === 'descanso') return 'Descanso'
  if (normalized === 'acreditacion') return 'Acreditacion'
  if (normalized === 'finiquitado') return 'Finiquitado'
  if (
    normalized === 'oficina central teletrabajo' ||
    normalized === 'oficina central - teletrabajo' ||
    normalized === 'oficina central/teletrabajo'
  ) return 'Oficina Central - Teletrabajo'
  return null
}

const isConditionConstraintError = (error: any) =>
  String(error?.code || '') === '23514' &&
  String(error?.message || '').includes('pr_collaborators_condition_chk')

const parseIsActiveValue = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (value === null) return undefined
  const normalized = String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (!normalized) return undefined
  if (['true', '1', 'si', 'sí', 'yes', 'activo', 'vigente'].includes(normalized)) return true
  if (['false', '0', 'no', 'inactivo', 'finiquitado'].includes(normalized)) return false
  return undefined
}

const cleanTextPreserve = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

const normalizeWorkerTypeValue = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  const raw = cleanTextPreserve(value)
  if (!raw) return null
  return raw.toLowerCase()
}

const normalizeEmptyToNull = (value: unknown) => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}

const normalizeForCompare = (value: unknown): string => {
  return cleanTextPreserve(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const COLLABORATORS_DEBUG = process.env.COLLABORATORS_DEBUG === 'true'

const COLLABORATORS_SUMMARY_SELECT = [
  'id',
  'company_id',
  'first_name',
  'last_name',
  'position',
  'specialty',
  'worker_type',
  'condition',
  'exception_condition',
  'current_crew_id',
  'is_assigned',
  'phone',
  'email',
  'document',
  'is_active',
  'gender',
  'signature_url',
  'photo_url',
  'auth_id',
  'user_id',
].join(', ')

const COLLABORATORS_ATTENDANCE_SELECT = [
  'id',
  'company_id',
  'first_name',
  'last_name',
  'document',
  'position',
  'specialty',
  'worker_type',
  'is_active',
  'gender',
  'phone',
  'email',
].join(', ')

const COLLABORATORS_CREWS_SELECT = [
  'id',
  'company_id',
  'first_name',
  'last_name',
  'document',
  'position',
  'specialty',
  'worker_type',
  'is_active',
  'phone',
  'email',
  'current_crew_id',
  'is_assigned',
].join(', ')

const stripMissingSelectColumn = (select: string, errorMsg: string) => {
  const patterns = [
    /column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i,
    /Could not find the '([a-zA-Z0-9_]+)' column/i,
  ]
  const missing = patterns
    .map((re) => errorMsg.match(re)?.[1])
    .find(Boolean)
  if (!missing) return null
  const parts = select
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const next = parts.filter((part) => part !== missing)
  return next.length === parts.length ? null : next.join(', ')
}

const isMissingTableError = (error: any) =>
  String(error?.code || '') === '42P01' ||
  String(error?.message || '').toLowerCase().includes('does not exist')

const normalizeYmd = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return new Date().toISOString().slice(0, 10)
  return raw.slice(0, 10)
}

const fetchRoleHistoryByCollaborator = async (
  supabaseAdmin: any,
  companyId: string,
  collaboratorIds: string[],
  asOfDate: string
) => {
  const ids = Array.from(new Set(collaboratorIds.map((id) => String(id || '').trim()).filter(Boolean)))
  if (!ids.length || !asOfDate) return new Map<string, any>()

  const { data, error } = await supabaseAdmin
    .from('pr_collaborator_role_history')
    .select('collaborator_id, position, specialty, worker_type, valid_from, valid_to')
    .eq('company_id', companyId)
    .in('collaborator_id', ids)
    .lte('valid_from', asOfDate)
    .or(`valid_to.is.null,valid_to.gte.${asOfDate}`)
    .order('valid_from', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) return new Map<string, any>()
    throw error
  }

  const byId = new Map<string, any>()
  ;(data || []).forEach((row: any) => {
    const id = String(row?.collaborator_id || '').trim()
    if (id && !byId.has(id)) byId.set(id, row)
  })
  return byId
}

const applyRoleHistorySnapshot = (collaborators: any[], historyByCollaborator: Map<string, any>) =>
  (collaborators || []).map((collab: any) => {
    const historical = historyByCollaborator.get(String(collab?.id || '').trim())
    if (!historical) return collab
    return {
      ...collab,
      position: historical.position ?? collab.position,
      specialty: historical.specialty ?? collab.specialty,
      worker_type: historical.worker_type ?? collab.worker_type,
      role_history_applied: true,
      role_valid_from: historical.valid_from || null,
      role_valid_to: historical.valid_to || null,
    }
  })

const recordCollaboratorRoleHistory = async (params: {
  supabaseAdmin: any
  companyId: string
  collaboratorId: string
  position: unknown
  specialty: unknown
  workerType: unknown
  effectiveDate: string
  updatedBy?: string | null
  previousPosition?: unknown
  previousSpecialty?: unknown
  previousWorkerType?: unknown
  previousValidFrom?: unknown
}) => {
  const { supabaseAdmin, companyId, collaboratorId } = params
  const effectiveDate = normalizeYmd(params.effectiveDate)
  if (!companyId || !collaboratorId || !effectiveDate) return

  const nextPosition = normalizeEmptyToNull(params.position)
  const nextSpecialty = normalizeEmptyToNull(params.specialty)
  const nextWorkerType = normalizeWorkerTypeValue(params.workerType)

  const { data: activeRows, error: activeError } = await supabaseAdmin
    .from('pr_collaborator_role_history')
    .select('id, position, specialty, worker_type, valid_from, valid_to')
    .eq('company_id', companyId)
    .eq('collaborator_id', collaboratorId)
    .lte('valid_from', effectiveDate)
    .or(`valid_to.is.null,valid_to.gte.${effectiveDate}`)
    .order('valid_from', { ascending: false })
    .limit(1)

  if (activeError) {
    if (isMissingTableError(activeError)) return
    throw activeError
  }

  const active = Array.isArray(activeRows) ? activeRows[0] : null
  const sameRole =
    active &&
    normalizeForCompare(active.position) === normalizeForCompare(nextPosition) &&
    normalizeForCompare(active.specialty) === normalizeForCompare(nextSpecialty) &&
    normalizeForCompare(active.worker_type) === normalizeForCompare(nextWorkerType)

  if (sameRole) return

  const previousDay = new Date(`${effectiveDate}T00:00:00.000Z`)
  previousDay.setUTCDate(previousDay.getUTCDate() - 1)
  const validTo = previousDay.toISOString().slice(0, 10)

  if (active?.id) {
    if (validTo >= String(active.valid_from || '')) {
      const { error: closeError } = await supabaseAdmin
        .from('pr_collaborator_role_history')
        .update({ valid_to: validTo })
        .eq('id', active.id)
      if (closeError && !isMissingTableError(closeError)) throw closeError
    }
  } else {
    const previousPosition = normalizeEmptyToNull(params.previousPosition)
    const previousSpecialty = normalizeEmptyToNull(params.previousSpecialty)
    const previousWorkerType = normalizeWorkerTypeValue(params.previousWorkerType)
    const previousValidFrom = normalizeYmd(params.previousValidFrom || '1900-01-01')
    const hasPreviousRole = Boolean(previousPosition || previousSpecialty || previousWorkerType)
    const previousDiffers =
      hasPreviousRole &&
      (
        normalizeForCompare(previousPosition) !== normalizeForCompare(nextPosition) ||
        normalizeForCompare(previousSpecialty) !== normalizeForCompare(nextSpecialty) ||
        normalizeForCompare(previousWorkerType) !== normalizeForCompare(nextWorkerType)
      )
    if (previousDiffers && validTo >= previousValidFrom) {
      const { error: previousInsertError } = await supabaseAdmin
        .from('pr_collaborator_role_history')
        .insert({
          company_id: companyId,
          collaborator_id: collaboratorId,
          position: previousPosition,
          specialty: previousSpecialty,
          worker_type: previousWorkerType,
          valid_from: previousValidFrom,
          valid_to: validTo,
          created_by: params.updatedBy || null,
        })
      if (previousInsertError && !isMissingTableError(previousInsertError)) throw previousInsertError
    }
  }

  const { error: insertError } = await supabaseAdmin
    .from('pr_collaborator_role_history')
    .insert({
      company_id: companyId,
      collaborator_id: collaboratorId,
      position: nextPosition,
      specialty: nextSpecialty,
      worker_type: nextWorkerType,
      valid_from: effectiveDate,
      valid_to: null,
      created_by: params.updatedBy || null,
    })

  if (insertError && !isMissingTableError(insertError)) throw insertError
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    const role = String((session?.user as any)?.role || '').trim().toLowerCase()
    const isDev = role === 'dev'
    const companyId = session?.user?.companyId || null

    let supabaseAdmin
    try {
      supabaseAdmin = getSupabaseAdminClient()
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Supabase admin client misconfigured', details: String(e?.message || e) },
        { status: 500 }
      )
    }

    if (!companyId && !isDev) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Check query params: excludeAssigned and allowCrewId
    const url = new URL(request.url)
    const excludeAssigned = url.searchParams.get('excludeAssigned') === 'true'
    const allowCrewId = url.searchParams.get('allowCrewId') || null
    const summary = url.searchParams.get('summary') === '1'
    const attendance = url.searchParams.get('attendance') === '1'
    const crewsMode = url.searchParams.get('crews') === '1'
    const asOfDate = String(url.searchParams.get('as_of_date') || '').trim().slice(0, 10)
    // ids to exclude (populated when excludeAssigned processing runs)
    let excludedAssignedIds: string[] = []

    // Base collaborators query - order alphabetically by last_name then first_name
    const buildCollaboratorsQuery = (select: string) => {
      let query = supabaseAdmin
        .from('pr_collaborators')
        .select(select)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })

      if (!isDev && companyId) {
        query = query.eq('company_id', companyId)
      }

      return query
    }

    let activeSummarySelect = attendance
      ? COLLABORATORS_ATTENDANCE_SELECT
      : crewsMode
        ? COLLABORATORS_CREWS_SELECT
        : COLLABORATORS_SUMMARY_SELECT

    let collaboratorsQuery = buildCollaboratorsQuery(summary ? activeSummarySelect : '*')

    // If we need to exclude assigned collaborators, fetch assigned ids from pr_crew_members
    if (excludeAssigned) {
      // Fast-path: if assignment flags exist, filter directly (exclude non-supervisors assigned elsewhere)
      try {
        const { data: flagsProbe, error: flagsErr } = await supabaseAdmin
          .from('pr_collaborators')
          .select('id,current_crew_id,is_assigned')
          .eq('company_id', companyId)
          .limit(1)
        if (!flagsErr && flagsProbe) {
          // Exclude those assigned to any other crew (allow supervisors later)
          collaboratorsQuery = collaboratorsQuery.or(`is_assigned.is.null,is_assigned.eq.false,current_crew_id.eq.${allowCrewId || '00000000-0000-0000-0000-000000000000'}`)
        }
      } catch {
        // ignore, fall back to legacy checks below
      }

      // Get collaborator_ids assigned to crews other than allowCrewId (if provided)
      // Only consider assignments for crews belonging to this company.
      // Use subquery: collaborator_id IN (SELECT collaborator_id FROM pr_crew_members WHERE crew_id IN (SELECT id FROM pr_crews WHERE company_id = companyId) AND crew_id != allowCrewId)
      const crewSubquery = supabaseAdmin.from('pr_crews').select('id').eq('company_id', companyId)
      const { data: crewRows, error: crewErr } = await crewSubquery
      if (crewErr) {
        console.error('Error fetching company crews:', crewErr)
        return NextResponse.json({ error: 'Error al obtener cuadrillas' }, { status: 500 })
      }
      const crewIds = (crewRows || []).map((r: any) => String(r.id))
      let filteredCrewIds = crewIds
      if (allowCrewId) filteredCrewIds = crewIds.filter(id => id !== String(allowCrewId))
      let assignedRows: any[] = []
      if (filteredCrewIds.length > 0) {
        // Try to include role; if column doesn't exist, fallback to collaborator_id only
        try {
          const { data: aRows, error: aErr } = await supabaseAdmin.from('pr_crew_members').select('collaborator_id, role').in('crew_id', filteredCrewIds)
          if (aErr) throw aErr
          assignedRows = aRows || []
        } catch (qErr: any) {
          // If missing column (Postgres code 42703), fallback to selecting collaborator_id only
          if (qErr && String(qErr.code) === '42703') {
            console.warn('pr_crew_members.role not found, falling back to collaborator_id-only lookup')
            const { data: fallbackRows, error: fallbackErr } = await supabaseAdmin.from('pr_crew_members').select('collaborator_id').in('crew_id', filteredCrewIds)
            if (fallbackErr) {
              console.error('Error fetching assigned members (fallback):', fallbackErr)
              return NextResponse.json({ error: 'Error al obtener asignaciones' }, { status: 500 })
            }
            assignedRows = (fallbackRows || []).map((r: any) => ({ collaborator_id: r.collaborator_id, role: null }))
          } else {
            console.error('Error fetching assigned members:', qErr)
            return NextResponse.json({ error: 'Error al obtener asignaciones' }, { status: 500 })
          }
        }
      }
      
        // Determine whether the `role` column exists in returned rows.
        const roleColumnPresent = (assignedRows || []).some((r: any) => Object.prototype.hasOwnProperty.call(r, 'role'))
        if (roleColumnPresent) {
          // Exclude all assigned collaborators except those explicitly with role 'supervisor'.
          // This enforces: only supervisors may belong to multiple crews.
          const assignedNonSupervisorIds = (assignedRows || []).filter((r: any) => {
              const role = (r && r.role) ? String(r.role).toLowerCase() : null
              return role !== 'supervisor'
            }).map((r: any) => String(r.collaborator_id))
          if (assignedNonSupervisorIds.length > 0) {
            const notInValue = `(${assignedNonSupervisorIds.join(',')})`
            collaboratorsQuery = collaboratorsQuery.not('id', 'in', notInValue)
            excludedAssignedIds = assignedNonSupervisorIds.slice()
          }
        } else {
          // role column missing: determine actual positions of assigned collaborators
          const assignedIds = (assignedRows || []).map((r: any) => String(r.collaborator_id))
          if (assignedIds.length > 0) {
            try {
              const { data: collRows, error: collErr } = await supabaseAdmin
                .from('pr_collaborators')
                .select('id, position, posicion')
                .in('id', assignedIds)
              if (collErr) {
                console.warn('Could not fetch collaborator positions, skipping role-based filtering', collErr)
              } else {
                // Exclude only those assigned collaborators whose position is NOT supervisor-like
                const nonSupervisorIds = (collRows || []).filter((c: any) => {
                  const pos = String((c.position || c.posicion || '')).toLowerCase()
                  // consider only 'supervisor' as supervisor-like
                  return !pos.includes('supervisor')
                }).map((c: any) => String(c.id))
                if (nonSupervisorIds.length > 0) {
                  const notInValue = `(${nonSupervisorIds.join(',')})`
                  collaboratorsQuery = collaboratorsQuery.not('id', 'in', notInValue)
                  excludedAssignedIds = nonSupervisorIds.slice()
                }
              }
            } catch (e) {
              console.warn('Error while fetching collaborator positions for assigned filter:', e)
            }
          }
        }

      // Legacy fallback: exclude foremen/members stored directly on pr_crews (if present).
      try {
        if (filteredCrewIds.length > 0) {
          const { data: legacyCrews, error: legacyErr } = await supabaseAdmin
            .from('pr_crews')
            .select('id, supervisors, foremen, members, supervisor, foreman, member')
            .in('id', filteredCrewIds)
          if (legacyErr) throw legacyErr
          const legacyExclude: string[] = []
          ;(legacyCrews || []).forEach((c: any) => {
            const foremen = Array.isArray(c.foremen) ? c.foremen : (c.foreman ? [c.foreman] : [])
            const members = Array.isArray(c.members) ? c.members : (c.member ? [c.member] : [])
            legacyExclude.push(...foremen.map(String))
            legacyExclude.push(...members.map(String))
          })
          const uniqueLegacy = Array.from(new Set(legacyExclude.filter(Boolean)))
          if (uniqueLegacy.length > 0) {
            const notInValue = `(${uniqueLegacy.join(',')})`
            collaboratorsQuery = collaboratorsQuery.not('id', 'in', notInValue)
            excludedAssignedIds = Array.from(new Set([...excludedAssignedIds, ...uniqueLegacy]))
          }
        }
      } catch (e) {
        console.warn('Error while applying legacy crew member exclusions:', e)
      }
    }

    let collaborators: any[] | null = null
    let collaboratorsError: any = null

    if (summary && !excludeAssigned) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const result = await buildCollaboratorsQuery(activeSummarySelect)
        collaborators = result.data as any[] | null
        collaboratorsError = result.error
        if (!collaboratorsError) break
        const nextSelect = stripMissingSelectColumn(activeSummarySelect, String(collaboratorsError?.message || collaboratorsError))
        if (!nextSelect || nextSelect === activeSummarySelect) break
        activeSummarySelect = nextSelect
      }

      if (collaboratorsError) {
        const fallbackSelects = [
          'id, company_id, first_name, last_name, position, specialty, worker_type, condition, phone, email, document, signature_url, photo_url',
          'id, company_id, first_name, last_name, position, specialty, worker_type, condition, signature_url, photo_url',
          'id, company_id, first_name, last_name, position, specialty, worker_type, signature_url, photo_url',
          'id, company_id, first_name, last_name, position, signature_url, photo_url',
          'id, company_id, first_name, last_name, signature_url, photo_url',
          'id, company_id',
        ]
        for (const fallbackSelect of fallbackSelects) {
          let candidateSelect = fallbackSelect
          for (let attempt = 0; attempt < 40; attempt++) {
            const result = await buildCollaboratorsQuery(candidateSelect)
            collaborators = result.data as any[] | null
            collaboratorsError = result.error
            if (!collaboratorsError) {
              activeSummarySelect = candidateSelect
              break
            }
            const nextSelect = stripMissingSelectColumn(candidateSelect, String(collaboratorsError?.message || collaboratorsError))
            if (!nextSelect || nextSelect === candidateSelect) break
            candidateSelect = nextSelect
          }
          if (!collaboratorsError) break
        }
      }
    } else {
      const result = await collaboratorsQuery
      collaborators = result.data as any[] | null
      collaboratorsError = result.error
    }

    if (collaboratorsError) {
      console.error('Error fetching collaborators:', collaboratorsError)
      return NextResponse.json(
        { error: 'Error al obtener colaboradores', details: String(collaboratorsError.message || collaboratorsError) },
        { status: 500 }
      )
    }

    // Ensure `specialty` is always a clean string (handle arrays, json-strings, nulls)
    const normalizeCandidateSpecialty = (val: any) => {
      if (val == null) return ''
      if (Array.isArray(val)) return cleanTextPreserve(val.join(', '))
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val)
          if (Array.isArray(parsed)) return cleanTextPreserve(parsed.join(', '))
        } catch {
          // not JSON
        }
        return cleanTextPreserve(val)
      }
      try { return cleanTextPreserve(String(val)) } catch { return '' }
    }

    // Ensure `position` is also clean for reliable matching/display
    const normalizeCandidatePosition = (val: any) => {
      if (val == null) return ''
      if (Array.isArray(val)) return cleanTextPreserve(val.join(', '))
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val)
          if (Array.isArray(parsed)) return cleanTextPreserve(parsed.join(', '))
        } catch {
          // not JSON
        }
        return cleanTextPreserve(val)
      }
      try { return cleanTextPreserve(String(val)) } catch { return '' }
    }

    let normalized = (collaborators || []).map((c: any) => ({
      ...c,
      specialty: normalizeCandidateSpecialty((c && c.specialty) || c.specialidad || null),
      position: normalizeCandidatePosition((c && c.position) || c.posicion || null),
    }))
    if (asOfDate) {
      try {
        const history = await fetchRoleHistoryByCollaborator(
          supabaseAdmin,
          String(companyId || ''),
          normalized.map((c: any) => String(c?.id || '').trim()).filter(Boolean),
          asOfDate
        )
        normalized = applyRoleHistorySnapshot(normalized, history)
      } catch (historyError) {
        console.warn('Could not apply collaborator role history:', historyError)
      }
    }

    // If the client requested a specific specialty (e.g. when creating a crew for user's specialty),
    // or explicitly asked to include supervisors across specialties (`includeSupervisors=true`),
    // include supervisors from other specialties as additional candidates so they can be assigned across specialties.
    const requestedSpecialty = url.searchParams.get('specialty') || null
    const includeSupervisorsFlag = url.searchParams.get('includeSupervisors') === 'true'
    const includeIndirectsFlag = url.searchParams.get('includeIndirects') === 'true'
    if ((requestedSpecialty && excludeAssigned) || (includeSupervisorsFlag && excludeAssigned) || (includeIndirectsFlag && excludeAssigned)) {
      try {
        let supervisorsQuery = supabaseAdmin
          .from('pr_collaborators')
          .select('*')
          .eq('company_id', companyId)
          .ilike('position', '%supervisor%')
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true })

        if (excludedAssignedIds && excludedAssignedIds.length > 0) {
          const notInValue = `(${excludedAssignedIds.join(',')})`
          supervisorsQuery = supervisorsQuery.not('id', 'in', notInValue)
        }

        const { data: supRows, error: supErr } = await supervisorsQuery
        if (!supErr && Array.isArray(supRows) && supRows.length > 0) {
          const normSup = (supRows || []).map((c: any) => ({
            ...c,
            specialty: normalizeCandidateSpecialty((c && c.specialty) || c.specialidad || null),
            position: normalizeCandidatePosition((c && c.position) || c.posicion || null),
          }))
          // Merge supervisors into normalized list, dedupe by id
          const byId = new Map<string, any>()
          for (const it of normalized) byId.set(String(it.id), it)
          for (const s of normSup) {
            if (!byId.has(String(s.id))) byId.set(String(s.id), s)
          }
          normalized = Array.from(byId.values())
        }
      } catch (e) {
        console.warn('Error fetching cross-specialty supervisors fallback:', e)
      }

      try {
        if (includeIndirectsFlag) {
          let indirectsQuery = supabaseAdmin
            .from('pr_collaborators')
            .select('*')
            .eq('company_id', companyId)
            .or('worker_type.ilike.%indirect%,position.ilike.%indirect%,specialty.ilike.%indirect%,position.ilike.%mecanico%mantencion%,position.ilike.%electrico%mantencion%')
            .order('last_name', { ascending: true })
            .order('first_name', { ascending: true })

          const { data: indirectRows, error: indirectErr } = await indirectsQuery
          if (!indirectErr && Array.isArray(indirectRows) && indirectRows.length > 0) {
            const normIndirect = (indirectRows || []).map((c: any) => ({
              ...c,
              specialty: normalizeCandidateSpecialty((c && c.specialty) || c.specialidad || null),
              position: normalizeCandidatePosition((c && c.position) || c.posicion || null),
            }))
            const byId = new Map<string, any>()
            for (const it of normalized) byId.set(String(it.id), it)
            for (const s of normIndirect) {
              if (!byId.has(String(s.id))) byId.set(String(s.id), s)
            }
            normalized = Array.from(byId.values())
          }
        }
      } catch (e) {
        console.warn('Error fetching indirect collaborators fallback:', e)
      }
    }

    return NextResponse.json(normalized)
  } catch (error) {
    console.error('Error in collaborators API:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String((error as any)?.message || error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    if (COLLABORATORS_DEBUG) console.log('🚀 POST /api/collaborators - Iniciando...')
    
    const session = await getServerSession(authOptions)
    if (COLLABORATORS_DEBUG) console.log('👤 Sesión obtenida:', session?.user?.email)
    
    if (!session?.user?.companyId) {
      if (COLLABORATORS_DEBUG) console.log('❌ No autorizado - falta companyId')
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const actor = await resolveCurrentActor(session)
    void actor

    if (COLLABORATORS_DEBUG) console.log('📥 Parseando body...')
    let body
    try {
      body = await request.json()
      if (COLLABORATORS_DEBUG) console.log('📥 Datos recibidos en API:', body)
    } catch (parseError) {
      console.error('❌ Error al parsear JSON:', parseError)
      return NextResponse.json({ error: 'Error al parsear datos JSON' }, { status: 400 })
    }

    const {
      first_name, 
      last_name, 
      document, 
      email, 
      phone, 
      address, 
      position, 
      contract,
      shift_pattern,
      condition,
      exception_condition,
      worker_type, 
      salary, 
      birth_date, 
      hire_date, 
      emergency_contact, 
      upper_clothing_size, 
      lower_clothing_size, 
      shoe_size, 
      gender,
      specialty,
      photo_url,
      signature_url,
      epp_details, 
      is_active, 
      role_effective_date,
    } = body

  // (POST) Creating a collaborator requires name and email; validate below

    // Verificar si ya existe un colaborador con este email
    if (COLLABORATORS_DEBUG) console.log('🔍 Verificando si ya existe un colaborador con este email...')
    const supabaseAdmin = getSupabaseAdminClient()

    const { data: existingCollaborator, error: checkError } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id, email')
      .eq('email', email)
      .eq('company_id', session.user.companyId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('❌ Error al verificar colaborador existente:', checkError)
      return NextResponse.json({ error: 'Error al verificar colaborador existente' }, { status: 500 })
    }

    if (existingCollaborator) {
      if (COLLABORATORS_DEBUG) console.log('⚠️ Ya existe un colaborador con este email:', existingCollaborator.email)
      return NextResponse.json({ 
        error: 'Colaborador ya existe', 
        details: 'Ya existe un colaborador con este email en la empresa. Por favor usa un email diferente.',
        code: 'COLLABORATOR_EXISTS'
      }, { status: 409 })
    }

    // Obtener la contraseña inicial enviada desde el frontend
    const plainPassword = body.password
    let passwordHash: string | undefined = undefined
    if (plainPassword) {
      // Hashear la contraseña con bcrypt
      const saltRounds = 10
      passwordHash = await bcrypt.hash(plainPassword, saltRounds)
    }

    // Crear colaborador en Supabase Auth primero
    if (COLLABORATORS_DEBUG) console.log('🔐 Creando usuario en Supabase Auth para:', email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: plainPassword || 'temp_password_123', // Usar la contraseña generada si existe
      email_confirm: true
    })

    // Track the resulting user id (either newly created or existing)
    let userId: string | null = authData?.user?.id ?? null

    if (authError) {
      console.error('❌ Error creating auth user:', authError)
      console.error('❌ Error details:', JSON.stringify(authError, null, 2))
      
      // Si el usuario ya existe, intentar obtener su ID
      if (authError.message.includes('already been registered')) {
        if (COLLABORATORS_DEBUG) console.log('🔄 Usuario ya existe, buscando usuario existente...')
        
        // Buscar el usuario existente por email
        const { data: existingUser, error: getUserError } = await supabaseAdmin.auth.admin.listUsers()

        if (getUserError) {
          console.error('❌ Error al buscar usuario existente:', getUserError)
          return NextResponse.json({ 
            error: 'Error al buscar usuario existente', 
            details: getUserError.message,
            code: getUserError.status 
          }, { status: 500 })
        }

        // existingUser.users puede no tener tipos inferrables correctamente; usar comprobación y any
        let user: any = undefined
        if (existingUser && Array.isArray((existingUser as any).users)) {
          user = (existingUser as any).users.find((u: any) => u && u.email === email)
        }

        if (user) {
          if (COLLABORATORS_DEBUG) console.log('✅ Usuario existente encontrado:', user.id)
          // Usar el ID del usuario existente
          userId = user.id
        } else {
          return NextResponse.json({ 
            error: 'Usuario ya existe', 
            details: 'Ya existe un usuario con este email. Por favor usa un email diferente.',
            code: 'USER_EXISTS'
          }, { status: 409 })
        }
      } else {
        return NextResponse.json({ 
          error: 'Error al crear usuario', 
          details: authError.message,
          code: authError.status 
        }, { status: 500 })
      }
    }

    // If we didn't already set userId from an existing user, read it from authData
    userId = userId ?? authData?.user?.id ?? null
    if (COLLABORATORS_DEBUG) console.log('✅ Usuario en Auth id:', userId)

    // Crear registro en pr_collaborators
    if (COLLABORATORS_DEBUG) console.log('📝 Creando registro en pr_collaborators...')
    const parsedIsActive = parseIsActiveValue(is_active)
    const normalizedCondition = normalizeConditionValue(condition)
    const effectiveIsActive =
      parsedIsActive ??
      (normalizedCondition === 'Finiquitado' ? false : normalizedCondition ? true : true)
    const effectiveCondition = effectiveIsActive === false ? 'Finiquitado' : 'Vigente'

    const collaboratorRecord = {
      user_id: userId,
      company_id: session.user.companyId,
      first_name,
      last_name,
      document: document, // Usar 'document' en lugar de 'rut'
      email,
      phone,
      address,
      position: position ? cleanTextPreserve(position) : null,
      contract: contract ? String(contract).trim() : null,
      shift_pattern: shift_pattern ? String(shift_pattern).trim() : null,
      condition: effectiveCondition,
      exception_condition: exception_condition ? String(exception_condition).trim() : null,
      specialty: specialty ? cleanTextPreserve(specialty) : null,
      worker_type: normalizeWorkerTypeValue(worker_type),
      salary,
      birth_date,
      hire_date,
      emergency_contact,
      upper_clothing_size,
      lower_clothing_size,
      shoe_size,
      gender,
      photo_url,
      signature_url,
      epp_details: epp_details || {},
      is_active: effectiveIsActive,
      password_hash: passwordHash // Guardar el hash en la tabla
    }
    
    if (COLLABORATORS_DEBUG) console.log('📋 Datos de colaborador a insertar:', collaboratorRecord)
    
    let { data: collaboratorData, error: collaboratorError } = await supabaseAdmin
      .from('pr_collaborators')
      .insert(collaboratorRecord)
      .select()
      .single()

    // Backward-compatibility: if `condition` column is not yet migrated, retry without it.
    if (collaboratorError && String(collaboratorError.code) === '42703') {
      const fallbackRecord = { ...collaboratorRecord } as any
      delete fallbackRecord.condition
      const retry = await supabaseAdmin
        .from('pr_collaborators')
        .insert(fallbackRecord)
        .select()
        .single()
      collaboratorData = retry.data as any
      collaboratorError = retry.error as any
    }

    // Transitional fallback: DB check constraint not updated yet for new condition catalog.
    if (
      collaboratorError &&
      isConditionConstraintError(collaboratorError) &&
      collaboratorRecord.condition === 'Oficina Central - Teletrabajo'
    ) {
      const fallbackRecord = { ...collaboratorRecord } as any
      fallbackRecord.condition = null
      if (!fallbackRecord.exception_condition) {
        fallbackRecord.exception_condition = 'Oficina Central - Teletrabajo'
      }
      const retry = await supabaseAdmin
        .from('pr_collaborators')
        .insert(fallbackRecord)
        .select()
        .single()
      collaboratorData = retry.data as any
      collaboratorError = retry.error as any
    }

    if (collaboratorError) {
      console.error('❌ Error creating collaborator record:', collaboratorError)
      console.error('❌ Error details:', JSON.stringify(collaboratorError, null, 2))
      
      // Manejar específicamente el error de clave foránea
      if (collaboratorError.code === '23503') {
        console.error('❌ Violación de clave foránea detectada')
        return NextResponse.json({ 
          error: 'Error de integridad de datos', 
          details: 'Hay un problema con las relaciones de la base de datos. El usuario no puede ser asociado correctamente.',
          code: 'FOREIGN_KEY_VIOLATION',
          originalError: collaboratorError.message
        }, { status: 500 })
      }
      
      return NextResponse.json({ 
        error: 'Error al crear registro de colaborador', 
        details: collaboratorError.message,
        code: collaboratorError.code 
      }, { status: 500 })
    }

    if (COLLABORATORS_DEBUG) console.log('✅ Colaborador creado exitosamente:', collaboratorData.id)
    try {
      await recordCollaboratorRoleHistory({
        supabaseAdmin,
        companyId: String(session.user.companyId || ''),
        collaboratorId: String(collaboratorData?.id || ''),
        position: collaboratorData?.position ?? collaboratorRecord.position,
        specialty: collaboratorData?.specialty ?? collaboratorRecord.specialty,
        workerType: collaboratorData?.worker_type ?? collaboratorRecord.worker_type,
        effectiveDate: normalizeYmd(hire_date || new Date().toISOString().slice(0, 10)),
        updatedBy: String((session.user as any)?.id || '') || null,
      })
    } catch (historyError) {
      console.warn('Could not create initial collaborator role history:', historyError)
    }

    // If company defaults exist, append new specialty or position if they are new
    try {
      // Read current defaults
      const { data: companyDefaults, error: defaultsError } = await supabaseAdmin
        .from('pr_companies')
        .select('default_positions, default_specialties')
        .eq('id', session.user.companyId)
        .single()

      if (!defaultsError && companyDefaults) {
        const currentPositions = Array.isArray(companyDefaults.default_positions) ? companyDefaults.default_positions : []
        const currentSpecialties = Array.isArray(companyDefaults.default_specialties) ? companyDefaults.default_specialties : []

        const toUpdate: Record<string, unknown> = {}

        // Preserve text and compare accent-insensitive to avoid duplicates
        const cleanedPosition = cleanTextPreserve(position)
        const hasPosition = currentPositions.some((item: any) =>
          normalizeForCompare(item) === normalizeForCompare(cleanedPosition)
        )
        if (cleanedPosition && !hasPosition) {
          toUpdate.default_positions = [...currentPositions, cleanedPosition]
        }

        const cleanedSpecialty = cleanTextPreserve(specialty)
        const hasSpecialty = currentSpecialties.some((item: any) =>
          normalizeForCompare(item) === normalizeForCompare(cleanedSpecialty)
        )
        if (cleanedSpecialty && !hasSpecialty) {
          toUpdate.default_specialties = [...currentSpecialties, cleanedSpecialty]
        }

        if (Object.keys(toUpdate).length > 0) {
          await supabaseAdmin
            .from('pr_companies')
            .update(toUpdate)
            .eq('id', session.user.companyId)
        }
      }
    } catch (err) {
      console.warn('Could not update company defaults with new specialty/position:', err)
    }

    if (COLLABORATORS_DEBUG) console.log('✅ Colaborador creado exitosamente:', collaboratorData)
    return NextResponse.json(collaboratorData)
  } catch (error) {
    console.error('❌ Error in collaborators POST:', error)
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('❌ Error message:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (COLLABORATORS_DEBUG) console.log('🚀 PUT /api/collaborators - Iniciando actualización...')
    
    const session = await getServerSession(authOptions)
    if (COLLABORATORS_DEBUG) console.log('👤 Sesión obtenida:', session?.user?.email)
    
    if (!session?.user?.companyId) {
      if (COLLABORATORS_DEBUG) console.log('❌ No autorizado - falta companyId')
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const actor = await resolveCurrentActor(session)
    void actor

    if (COLLABORATORS_DEBUG) console.log('📥 Parseando body...')
    let body
    try {
      body = await request.json()
      if (COLLABORATORS_DEBUG) console.log('📥 Datos recibidos en API:', body)
    } catch (parseError) {
      console.error('❌ Error al parsear JSON:', parseError)
      return NextResponse.json({ error: 'Error al parsear datos JSON' }, { status: 400 })
    }

    const { 
      id,
      first_name, 
      last_name, 
      document, 
      email, 
      phone, 
      address, 
      position, 
      contract,
      shift_pattern,
      condition,
      exception_condition,
      specialty,
      worker_type, 
      salary, 
      birth_date, 
      hire_date, 
      emergency_contact, 
      upper_clothing_size, 
      lower_clothing_size, 
      shoe_size, 
      gender,
      photo_url,
      signature_url,
      epp_details, 
      is_active, 
      role_effective_date,
    } = body

    if (!id) {
      return NextResponse.json({ error: 'ID del colaborador es requerido' }, { status: 400 })
    }

    // Solo exigir los campos obligatorios si se intenta actualizar alguno de ellos
    const wantsToUpdateNameOrEmail =
      (first_name !== undefined || last_name !== undefined || email !== undefined)
    if (wantsToUpdateNameOrEmail) {
      if (!first_name || !last_name || !email) {
        return NextResponse.json({ error: 'Nombre, apellido y email son requeridos' }, { status: 400 })
      }
    }

    // Allow partial updates: if caller only wants to update photo_url, is_active, etc.
    const isPartialUpdate = !wantsToUpdateNameOrEmail

  // Crear cliente de Supabase con clave de servicio para operaciones de admin
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!serviceRoleKey) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY no está configurada')
      return NextResponse.json({ 
        error: 'Configuración faltante', 
        details: 'La clave de servicio de Supabase no está configurada. Contacta al administrador.',
        code: 'MISSING_SERVICE_KEY'
      }, { status: 500 })
    }
    
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    // Actualizar registro en pr_collaborators
    if (COLLABORATORS_DEBUG) console.log('📝 Actualizando registro en pr_collaborators...')

    // Build update object only with provided fields to allow partial updates (eg. only photo_url)
    const updatePayload: Record<string, unknown> = {}

    const maybeSet = (key: string, value: unknown) => {
      if (value !== undefined) updatePayload[key] = value
    }
    const normalizeDateValue = (value: unknown) => {
      const normalized = normalizeEmptyToNull(value)
      if (normalized === undefined || normalized === null) return normalized
      if (typeof normalized === 'string') return normalized.slice(0, 10)
      return normalized
    }

    // If it's not a partial update, require core fields
    if (!isPartialUpdate) {
      maybeSet('first_name', first_name)
      maybeSet('last_name', last_name)
      maybeSet('email', email)
    }

    // Always allow updating these if provided
    maybeSet('document', normalizeEmptyToNull(document))
    maybeSet('phone', normalizeEmptyToNull(phone))
    maybeSet('address', normalizeEmptyToNull(address))
    maybeSet('position', normalizeEmptyToNull(position))
    maybeSet('contract', normalizeEmptyToNull(contract))
    maybeSet('shift_pattern', normalizeEmptyToNull(shift_pattern))
    const normalizedCondition = normalizeConditionValue(condition)
    maybeSet('exception_condition', normalizeEmptyToNull(exception_condition))
    maybeSet('specialty', normalizeEmptyToNull(specialty))
    maybeSet('worker_type', normalizeWorkerTypeValue(worker_type))
    maybeSet('salary', salary)
    maybeSet('birth_date', normalizeDateValue(birth_date))
    maybeSet('hire_date', normalizeDateValue(hire_date))
    maybeSet('emergency_contact', normalizeEmptyToNull(emergency_contact))
    maybeSet('upper_clothing_size', normalizeEmptyToNull(upper_clothing_size))
    maybeSet('lower_clothing_size', normalizeEmptyToNull(lower_clothing_size))
    maybeSet('shoe_size', normalizeEmptyToNull(shoe_size))
    maybeSet('gender', normalizeEmptyToNull(gender))
    maybeSet('photo_url', photo_url)
    maybeSet('signature_url', signature_url)
    maybeSet('epp_details', epp_details || {})
    const parsedIsActive = parseIsActiveValue(is_active)
    const effectiveIsActiveForCondition =
      parsedIsActive !== undefined
        ? parsedIsActive
        : normalizedCondition === 'Finiquitado'
          ? false
          : normalizedCondition
            ? true
            : undefined
    if (effectiveIsActiveForCondition !== undefined) {
      updatePayload.is_active = effectiveIsActiveForCondition
      updatePayload.condition = effectiveIsActiveForCondition ? 'Vigente' : 'Finiquitado'
    }

    if (COLLABORATORS_DEBUG) console.log('📋 Datos de colaborador a actualizar:', updatePayload)

    // Ensure the collaborator belongs to the same company as the session user
    const { data: existing, error: existsErr } = await supabaseAdmin
      .from('pr_collaborators')
      .select('company_id, position, specialty, worker_type, hire_date')
      .eq('id', id)
      .single()

    if (existsErr) {
      console.error('❌ Error comprobando existencia del colaborador:', existsErr)
      return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 })
    }

    if (existing.company_id !== session.user.companyId) {
      console.error('❌ Intento de actualizar colaborador de otra empresa')
      return NextResponse.json({ error: 'No autorizado para actualizar este colaborador' }, { status: 403 })
    }

    let { data: collaboratorData, error: collaboratorError } = await supabaseAdmin
      .from('pr_collaborators')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    // Backward-compatibility: if `condition` column is not yet migrated, retry without it.
    if (collaboratorError && String(collaboratorError.code) === '42703' && Object.prototype.hasOwnProperty.call(updatePayload, 'condition')) {
      const fallbackPayload = { ...updatePayload } as Record<string, unknown>
      delete fallbackPayload.condition
      const retry = await supabaseAdmin
        .from('pr_collaborators')
        .update(fallbackPayload)
        .eq('id', id)
        .select()
        .single()
      collaboratorData = retry.data as any
      collaboratorError = retry.error as any
    }

    // Transitional fallback: DB check constraint not updated yet for new condition catalog.
    if (
      collaboratorError &&
      isConditionConstraintError(collaboratorError) &&
      updatePayload.condition === 'Oficina Central - Teletrabajo'
    ) {
      const fallbackPayload = { ...updatePayload } as Record<string, unknown>
      fallbackPayload.condition = null
      if (!fallbackPayload.exception_condition) {
        fallbackPayload.exception_condition = 'Oficina Central - Teletrabajo'
      }
      const retry = await supabaseAdmin
        .from('pr_collaborators')
        .update(fallbackPayload)
        .eq('id', id)
        .select()
        .single()
      collaboratorData = retry.data as any
      collaboratorError = retry.error as any
    }

    if (collaboratorError) {
      console.error('❌ Error updating collaborator record:', collaboratorError)
      console.error('❌ Error details:', JSON.stringify(collaboratorError, null, 2))
      
      return NextResponse.json({ 
        error: 'Error al actualizar registro de colaborador', 
        details: collaboratorError.message,
        code: collaboratorError.code 
      }, { status: 500 })
    }

    const roleFieldsWereProvided =
      position !== undefined ||
      specialty !== undefined ||
      worker_type !== undefined
    const roleChanged =
      roleFieldsWereProvided &&
      (
        normalizeForCompare(existing?.position) !== normalizeForCompare(collaboratorData?.position ?? updatePayload.position) ||
        normalizeForCompare(existing?.specialty) !== normalizeForCompare(collaboratorData?.specialty ?? updatePayload.specialty) ||
        normalizeForCompare(existing?.worker_type) !== normalizeForCompare(collaboratorData?.worker_type ?? updatePayload.worker_type)
      )
    if (roleChanged) {
      try {
        await recordCollaboratorRoleHistory({
          supabaseAdmin,
          companyId: String(session.user.companyId || ''),
          collaboratorId: String(id || ''),
          position: collaboratorData?.position ?? updatePayload.position ?? existing?.position,
          specialty: collaboratorData?.specialty ?? updatePayload.specialty ?? existing?.specialty,
          workerType: collaboratorData?.worker_type ?? updatePayload.worker_type ?? existing?.worker_type,
          effectiveDate: normalizeYmd(role_effective_date || new Date().toISOString().slice(0, 10)),
          updatedBy: String((session.user as any)?.id || '') || null,
          previousPosition: existing?.position,
          previousSpecialty: existing?.specialty,
          previousWorkerType: existing?.worker_type,
          previousValidFrom: existing?.hire_date || '1900-01-01',
        })
      } catch (historyError) {
        console.warn('Could not update collaborator role history:', historyError)
      }
    }

    // After successful update, append position/specialty to company defaults if new
    try {
      const { data: companyDefaults, error: defaultsError } = await supabaseAdmin
        .from('pr_companies')
        .select('default_positions, default_specialties')
        .eq('id', session.user.companyId)
        .single()

      if (!defaultsError && companyDefaults) {
        const currentPositions = Array.isArray(companyDefaults.default_positions) ? companyDefaults.default_positions : []
        const currentSpecialties = Array.isArray(companyDefaults.default_specialties) ? companyDefaults.default_specialties : []

        const toUpdate: Record<string, unknown> = {}

        const cleanedPosition = cleanTextPreserve(position)
        const hasPosition = currentPositions.some((item: any) =>
          normalizeForCompare(item) === normalizeForCompare(cleanedPosition)
        )
        if (cleanedPosition && !hasPosition) {
          toUpdate.default_positions = [...currentPositions, cleanedPosition]
        }

        const cleanedSpecialty = cleanTextPreserve(specialty)
        const hasSpecialty = currentSpecialties.some((item: any) =>
          normalizeForCompare(item) === normalizeForCompare(cleanedSpecialty)
        )
        if (cleanedSpecialty && !hasSpecialty) {
          toUpdate.default_specialties = [...currentSpecialties, cleanedSpecialty]
        }

        if (Object.keys(toUpdate).length > 0) {
          await supabaseAdmin
            .from('pr_companies')
            .update(toUpdate)
            .eq('id', session.user.companyId)
        }
      }
    } catch (err) {
      console.warn('Could not update company defaults on collaborator update:', err)
    }

    // Read-back verification from DB to ensure we return persisted values
    const { data: persistedRow } = await supabaseAdmin
      .from('pr_collaborators')
      .select('*')
      .eq('id', id)
      .single()

    if (COLLABORATORS_DEBUG) console.log('✅ Colaborador actualizado exitosamente:', persistedRow || collaboratorData)
    return NextResponse.json(persistedRow || collaboratorData)
  } catch (error) {
    console.error('❌ Error in collaborators PUT:', error)
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('❌ Error message:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
