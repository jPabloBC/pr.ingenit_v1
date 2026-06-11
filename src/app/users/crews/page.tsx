"use client"

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { Box, Container, Typography, Paper, Button, TextField, FormControl, InputLabel, Select, MenuItem, OutlinedInput, Checkbox, FormGroup, FormControlLabel, Radio, RadioGroup, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip, Popover } from "@mui/material"
import { DateCalendar } from '@mui/x-date-pickers'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus } from 'lucide-react'
import UserHeader from "../../../components/layout/UserHeader"
import { colors } from "../../../theme/theme"
import { normalizeText } from "../../../lib/normalize"
import { supabase } from "../../../services/supabaseClient"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"

const parseYmdToDate = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

  const dateToYmd = (date: Date | null) => {
    if (!date) return ''
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function CrewsPage() {
  const latePolicyFeatureEnabled = false
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const debugCrewRoles = searchParams.get('debug') === 'roles'
  const role = String((session?.user as any)?.role || '').toLowerCase()
  const isAdminReadOnly = role === 'admin'
  const isViewerReadOnly = role === 'viewer'
  const isUserRole = role === 'user'
  const canManageCrews = !isAdminReadOnly && !isViewerReadOnly
  const canViewDateNotes = canManageCrews || isAdminReadOnly || isViewerReadOnly
  const [latePolicy, setLatePolicy] = useState<{ allowByUser: boolean }>({
    allowByUser: false
  })
  const [latePolicyOpen, setLatePolicyOpen] = useState(false)
  const [latePolicyUsers, setLatePolicyUsers] = useState<any[]>([])
  const [latePolicyUserSpecialty, setLatePolicyUserSpecialty] = useState<Record<string, string>>({})
  const [latePolicyLoading, setLatePolicyLoading] = useState(false)
  const [latePolicySaving, setLatePolicySaving] = useState(false)
  const [programDialogOpen, setProgramDialogOpen] = useState(false)
  const getChileToday = useCallback(() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date())
    const map: Record<string, string> = {}
    parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
    return `${map.year}-${map.month}-${map.day}`
  }, [])
  const getChileNowParts = useCallback(() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date())
    const map: Record<string, string> = {}
    parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
    return {
      date: `${map.year}-${map.month}-${map.day}`,
      hour: Number(map.hour || 0)
    }
  }, [])
  const toChileDateKey = useCallback((value: any) => {
    if (!value) return ''
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date(value))
      const map: Record<string, string> = {}
      parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
      return `${map.year}-${map.month}-${map.day}`
    } catch {
      return ''
    }
  }, [])
  const [programActivities, setProgramActivities] = useState<any[]>([])
  const [loadingProgram, setLoadingProgram] = useState(false)
  const [selectedCrewForProgram, setSelectedCrewForProgram] = useState<string | null>(null)
  const [programWorkDate, setProgramWorkDate] = useState<string>(getChileToday())
  const [programQuery, setProgramQuery] = useState('')
  const [programResults, setProgramResults] = useState<any[]>([])
  const [programCrewMembers, setProgramCrewMembers] = useState<any[]>([])
  const [programCrewRoleIds, setProgramCrewRoleIds] = useState<{ supervisors: string[]; foremen: string[]; members: string[] } | null>(null)
  const [programAssignedActivities, setProgramAssignedActivities] = useState<any[]>([])
  const [loadingProgramCrew, setLoadingProgramCrew] = useState(false)
  const [programInitialAssignedIds, setProgramInitialAssignedIds] = useState<Set<string>>(new Set())
  const [exportDates, setExportDates] = useState<string[]>([])
  const [exportDate, setExportDate] = useState<string>(getChileToday())
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportDateDraft, setExportDateDraft] = useState<string>(getChileToday())
  const collaboratorsCacheRef = useRef<any[] | null>(null)
  const collaboratorsInFlightRef = useRef<Promise<any[]> | null>(null)
  const crewsInFlightRef = useRef<Promise<any[]> | null>(null)

  const setOverflowTitle = (e: React.MouseEvent<HTMLElement>, fullText: string) => {
    const el = e.currentTarget as HTMLElement
    const label = el.querySelector('[data-overflow-label="true"]') as HTMLElement | null
    if (!label) {
      el.removeAttribute('title')
      return
    }
    const isOverflowing = label.scrollWidth > label.clientWidth
    if (isOverflowing) el.setAttribute('title', fullText)
    else el.removeAttribute('title')
  }

  const refreshLatePolicy = useCallback(async () => {
    if (!latePolicyFeatureEnabled) return
    try {
      const res = await fetch('/api/crews/late-creation-policy', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setLatePolicy({ allowByUser: !!data?.allowByUser })
    } catch {}
  }, [latePolicyFeatureEnabled])

  useEffect(() => {
    if (!latePolicyFeatureEnabled) return
    if (!session?.user?.companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/crews/late-creation-policy', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setLatePolicy({
          allowByUser: !!data?.allowByUser
        })
      } catch {}
    })()
    return () => { cancelled = true }
  }, [session?.user?.companyId, latePolicyFeatureEnabled])

  useEffect(() => {
    if (!latePolicyFeatureEnabled) return
    if (!session?.user?.companyId || role !== 'user') return
    const onFocus = () => { refreshLatePolicy() }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshLatePolicy()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [session?.user?.companyId, role, refreshLatePolicy, latePolicyFeatureEnabled])

  useEffect(() => {
    if (!latePolicyFeatureEnabled) return
    if (!latePolicyOpen || (role !== 'dev' && role !== 'admin')) return
    let cancelled = false
    ;(async () => {
      setLatePolicyLoading(true)
      try {
        const [usersRes, policyRes, collabRes] = await Promise.all([
          fetch('/api/admin/users'),
          fetch('/api/crews/late-creation-policy'),
          fetch('/api/collaborators')
        ])
        if (usersRes.ok) {
          const u = await usersRes.json()
          const list = Array.isArray(u?.users) ? u.users : []
          if (!cancelled) {
            setLatePolicyUsers(list.map((x: any) => ({
              ...x,
              allow_late_crew_creation: !!x.allow_late_crew_creation
            })))
          }
        }
        if (policyRes.ok) {
          const p = await policyRes.json()
          if (!cancelled) setLatePolicy({ allowByUser: !!p?.allowByUser })
        }
        if (collabRes.ok) {
          const c = await collabRes.json()
          const map: Record<string, string> = {}
          ;(c || []).forEach((row: any) => {
            if (row?.user_id && row?.specialty) {
              map[String(row.user_id)] = String(row.specialty)
            }
          })
          if (!cancelled) setLatePolicyUserSpecialty(map)
        }
      } catch {}
      if (!cancelled) setLatePolicyLoading(false)
    })()
    return () => { cancelled = true }
  }, [latePolicyOpen, role, latePolicyFeatureEnabled])

  const [programDirty, setProgramDirty] = useState(false)
  const [newActivity, setNewActivity] = useState({ activity: '', area: '', discipline: '', unit: '', quantity: '' })
  const [creatingActivity, setCreatingActivity] = useState(false)
  const [quickEditOpen, setQuickEditOpen] = useState(false)
  const [quickEditSaving, setQuickEditSaving] = useState(false)
  const [quickEditActivity, setQuickEditActivity] = useState<any | null>(null)
  const [quickEditForm, setQuickEditForm] = useState({
    activity: '',
    description: '',
    area: '',
    discipline: '',
    unit: '',
    quantity: ''
  })
  const [disciplineOptions, setDisciplineOptions] = useState<string[]>([])
  const [areaOptions, setAreaOptions] = useState<string[]>([])
  const [areaMode, setAreaMode] = useState<'existing' | 'other'>('existing')
  const [areaOther, setAreaOther] = useState('')
  const [areaMatch, setAreaMatch] = useState<string | null>(null)
  const [unitOptions, setUnitOptions] = useState<string[]>([])
  const [unitMode, setUnitMode] = useState<'existing' | 'other'>('existing')
  const [unitOther, setUnitOther] = useState('')
  const [unitMatch, setUnitMatch] = useState<string | null>(null)
  const [disciplineMode, setDisciplineMode] = useState<'existing' | 'other'>('existing')
  const [disciplineOther, setDisciplineOther] = useState('')
  const [disciplineMatch, setDisciplineMatch] = useState<string | null>(null)
  const programSearchTimeout = useRef<number | null>(null)
  const [userSpecialty, setUserSpecialty] = useState<string | null>(null)
  const [showAllProgramDisciplines, setShowAllProgramDisciplines] = useState(false)
  const [crews, setCrews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [openingCreateForm, setOpeningCreateForm] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Shared legacy states kept for safety (but new forms use create/edit-prefixed states)
  const [fName, setFName] = useState("")
  const [fDescription, setFDescription] = useState("")
  // Create form specific states
  const [createFName, setCreateFName] = useState("")
  const [createFDescription, setCreateFDescription] = useState("")
  const [createSelectedFrontName, setCreateSelectedFrontName] = useState("")
  const [createWorkDate, setCreateWorkDate] = useState<string>('')
  const [createWorkDateAnchorEl, setCreateWorkDateAnchorEl] = useState<HTMLElement | null>(null)
  const [attendanceWorkDates, setAttendanceWorkDates] = useState<string[]>([])
  const [attendanceDatesLoading, setAttendanceDatesLoading] = useState(false)
  const attendanceDatesLoadedRef = useRef(false)
  const initialLoadCompanyRef = useRef<string>('')
  const [createLateOverride, setCreateLateOverride] = useState(false)
  const [collaborators, setCollaborators] = useState<any[]>([])
  const [specialtyOptions, setSpecialtyOptions] = useState<string[]>([])

  useEffect(() => {
    const { date: chileToday, hour: chileHour } = getChileNowParts()
    const cutoffHour = 13
    if (chileHour < cutoffHour || createWorkDate !== chileToday) {
      if (createLateOverride) setCreateLateOverride(false)
    }
  }, [createWorkDate, createLateOverride, getChileNowParts])

  useEffect(() => {
    if (!latePolicy.allowByUser && createLateOverride) {
      setCreateLateOverride(false)
    }
  }, [latePolicy.allowByUser, createLateOverride])

  const loadAttendanceWorkDates = useCallback(async (force = false) => {
    if (!force && attendanceDatesLoadedRef.current) return
    setAttendanceDatesLoading(true)
    try {
      const res = await fetch('/api/collaborators/daily-status?dates=1&turno_dates=1', { cache: 'no-store' })
      if (!res.ok) {
        setAttendanceWorkDates([])
        attendanceDatesLoadedRef.current = true
        return
      }
      const json = await res.json()
      const uniqueDates = new Set<string>()
      if (Array.isArray(json?.dates)) {
        json.dates.forEach((d: any) => {
          const date = String(d || '').trim().slice(0, 10)
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) uniqueDates.add(date)
        })
      }
      const dates = Array.from(uniqueDates).sort((a, b) => b.localeCompare(a))
      setAttendanceWorkDates(dates)
      attendanceDatesLoadedRef.current = true
    } catch {
      setAttendanceWorkDates([])
      attendanceDatesLoadedRef.current = true
    } finally {
      setAttendanceDatesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAttendanceWorkDates()
  }, [loadAttendanceWorkDates])

  useEffect(() => {
    let cancelled = false
    const loadReportFronts = async () => {
      setReportFrontsLoading(true)
      try {
        const res = await fetch('/api/report-fronts', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        const fronts = Array.isArray(json?.fronts) ? json.fronts : []
        const seen = new Set<string>()
        const options = fronts
          .map((front: any) => ({
            id: front?.id ? String(front.id) : null,
            name: String(front?.name || '').trim(),
            code: front?.code ? String(front.code) : null,
            type: front?.type ? String(front.type) : null,
          }))
          .filter((front: any) => {
            const key = normalizeStr(front.name)
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
          })
        if (!cancelled) setReportFrontOptions(options)
      } catch {
        if (!cancelled) setReportFrontOptions([])
      } finally {
        if (!cancelled) setReportFrontsLoading(false)
      }
    }
    void loadReportFronts()
    return () => {
      cancelled = true
    }
  }, [])

  // Edit form states
  const [editSelectedSpecialty, setEditSelectedSpecialty] = useState<string | null>(null)
  const [editSelectedFrontName, setEditSelectedFrontName] = useState("")
  const [editWorkDate, setEditWorkDate] = useState<string>('')
  const [editSupervisorsSelected, setEditSupervisorsSelected] = useState<string[]>([])
  const [editForemenSelected, setEditForemenSelected] = useState<string[]>([])
  const [editSkipSupervisor, setEditSkipSupervisor] = useState(false)
  const [editSkipForeman, setEditSkipForeman] = useState(false)
  const [editMajor, setEditMajor] = useState("")
  const [editFirst, setEditFirst] = useState("")
  const [editSecond, setEditSecond] = useState("")
  const [editHelper, setEditHelper] = useState("")
  const [editMajorCustom, setEditMajorCustom] = useState("")
  const [editFirstCustom, setEditFirstCustom] = useState("")
  const [editSecondCustom, setEditSecondCustom] = useState("")
  const [editHelperCustom, setEditHelperCustom] = useState("")
  const [editMembersSelected, setEditMembersSelected] = useState<string[]>([])
  const [editIndirectSelected, setEditIndirectSelected] = useState<string[]>([])
  const [editMultiAssignOverrides, setEditMultiAssignOverrides] = useState<Set<string>>(new Set())
  // Create form states
  const [createSelectedSpecialty, setCreateSelectedSpecialty] = useState<string | null>(null)
  const [createSupervisorsSelected, setCreateSupervisorsSelected] = useState<string[]>([])
  const [createForemenSelected, setCreateForemenSelected] = useState<string[]>([])
  const [createSkipSupervisor, setCreateSkipSupervisor] = useState(false)
  const [createSkipForeman, setCreateSkipForeman] = useState(false)
  const [createMajor, setCreateMajor] = useState("")
  const [createFirst, setCreateFirst] = useState("")
  const [createSecond, setCreateSecond] = useState("")
  const [createHelper, setCreateHelper] = useState("")
  const [createMajorCustom, setCreateMajorCustom] = useState("")
  const [createFirstCustom, setCreateFirstCustom] = useState("")
  const [createSecondCustom, setCreateSecondCustom] = useState("")
  const [createHelperCustom, setCreateHelperCustom] = useState("")
  const [createMembersSelected, setCreateMembersSelected] = useState<string[]>([])
  const [createIndirectSelected, setCreateIndirectSelected] = useState<string[]>([])
  const [createMultiAssignOverrides, setCreateMultiAssignOverrides] = useState<Set<string>>(new Set())
  const [createFieldBossId, setCreateFieldBossId] = useState<string>('')
  const [createFieldBossAttempted, setCreateFieldBossAttempted] = useState(false)
  const [createCandidatesQuery, setCreateCandidatesQuery] = useState("")
  const [editCandidatesQuery, setEditCandidatesQuery] = useState("")
  const [editFieldBossId, setEditFieldBossId] = useState<string>('')
  const [turnoIdsByDate, setTurnoIdsByDate] = useState<Record<string, string[]>>({})
  const [turnoLoadingByDate, setTurnoLoadingByDate] = useState<Record<string, boolean>>({})
  const turnoLoadedDatesRef = useRef<Set<string>>(new Set())
  const [initialAssigned, setInitialAssigned] = useState<Set<string>>(new Set())
  const [editingCrew, setEditingCrew] = useState<any>(null)
  const [supervisorsTouched, setSupervisorsTouched] = useState(false)
  const [foremenTouched, setForemenTouched] = useState(false)
  const [membersTouched, setMembersTouched] = useState(false)
  // touch states per form
  const [createSupervisorsTouched, setCreateSupervisorsTouched] = useState(false)
  const [createForemenTouched, setCreateForemenTouched] = useState(false)
  const [createMembersTouched, setCreateMembersTouched] = useState(false)
  const [editSupervisorsTouched, setEditSupervisorsTouched] = useState(false)
  const [editForemenTouched, setEditForemenTouched] = useState(false)
  const [editMembersTouched, setEditMembersTouched] = useState(false)
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewCrewId, setViewCrewId] = useState<string>('')
  const [viewCrew, setViewCrew] = useState<any>(null)
  const [viewCrewMembers, setViewCrewMembers] = useState<any[]>([])
  const [viewCrewRoleIds, setViewCrewRoleIds] = useState<{ supervisors: string[]; foremen: string[]; members: string[] } | null>(null)
  const [viewAssignedActivities, setViewAssignedActivities] = useState<any[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const viewLoadSeqRef = useRef(0)
  const [reportFrontOptions, setReportFrontOptions] = useState<Array<{ id?: string | null; name: string; code?: string | null; type?: string | null }>>([])
  const [reportFrontsLoading, setReportFrontsLoading] = useState(false)
  const [collapsedDateGroups, setCollapsedDateGroups] = useState<Set<string>>(new Set())
  const knownDateGroupKeysRef = useRef<Set<string>>(new Set())
  const [dateNoteModalOpen, setDateNoteModalOpen] = useState(false)
  const [dateNoteModalDateKey, setDateNoteModalDateKey] = useState<string>('')
  const [dateNoteModalDateLabel, setDateNoteModalDateLabel] = useState<string>('')
  const [dateCollaboratorNotesByDate, setDateCollaboratorNotesByDate] = useState<Record<string, Record<string, string>>>({})
  const [dateAssignedIdsByDate, setDateAssignedIdsByDate] = useState<Record<string, string[]>>({})
  const [dateNoteDraftByCollaborator, setDateNoteDraftByCollaborator] = useState<Record<string, string>>({})
  const [crewCloseConfirmOpen, setCrewCloseConfirmOpen] = useState(false)
  const [crewCloseConfirmTarget, setCrewCloseConfirmTarget] = useState<'create' | 'edit' | null>(null)
  const createInitialFingerprintRef = useRef<string | null>(null)
  const editInitialFingerprintRef = useRef<string | null>(null)
  const createTouchedRef = useRef(false)
  const editTouchedRef = useRef(false)
  const deriveAssignedIds = useCallback((rows: any[]) => {
    const ids = (rows || []).flatMap((c: any) => readCrewAssignedIds(c))
    setAssignedIds(new Set(ids))
  }, [])

  function readCrewAssignedIds(crew: any): string[] {
    const asArray = (value: any) => {
      if (!value) return [] as string[]
      if (Array.isArray(value)) return value.map((x: any) => String(typeof x === 'object' && x !== null && 'id' in x ? x.id : x))
      return [String(value)]
    }
    const ids = [
      ...asArray(crew?.supervisors ?? crew?.supervisor),
      ...asArray(crew?.foremen ?? crew?.foreman),
      ...asArray(crew?.members ?? crew?.member),
      ...asArray(crew?.collaborators),
    ]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
    return Array.from(new Set(ids))
  }

  function normalizeIdentityText(value: any): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  function normalizeIdentityCode(value: any): string {
    return normalizeIdentityText(value).replace(/[^a-z0-9]/g, '')
  }

  function getCollaboratorIdentityKeys(collaborator: any): string[] {
    if (!collaborator) return []
    const keys: string[] = []
    const id = String(collaborator?.id || collaborator?.collaborator_id || '').trim()
    if (id) keys.push(`id:${id}`)

    const document = normalizeIdentityCode(collaborator?.document || collaborator?.rut || collaborator?.dni)
    if (document) keys.push(`doc:${document}`)

    const email = normalizeIdentityText(collaborator?.email)
    if (email) keys.push(`email:${email}`)

    const phone = normalizeIdentityCode(collaborator?.phone || collaborator?.telefono)
    if (phone) keys.push(`phone:${phone}`)

    const firstName = normalizeIdentityText(collaborator?.first_name || collaborator?.nombre)
    const lastName = normalizeIdentityText(collaborator?.last_name || collaborator?.apellido)
    const fullName = normalizeIdentityText(`${firstName} ${lastName}`)
    const position = normalizeIdentityText(collaborator?.position || collaborator?.posicion)
    if (fullName && position) keys.push(`namepos:${fullName}|${position}`)

    return Array.from(new Set(keys))
  }

  function formatApiError(value: any): string {
    if (!value) return ''
    if (typeof value === 'string') return value
    const parts = [
      value?.message,
      value?.details,
      value?.hint,
      value?.code ? `Código: ${value.code}` : ''
    ].map((x) => String(x || '').trim()).filter(Boolean)
    if (parts.length > 0) return parts.join(' | ')
    try { return JSON.stringify(value) } catch { return String(value) }
  }

  function buildAssignedCrewNamesByIdentity(crewsSource: any[], workDate: string, excludeCrewId?: string | null) {
    const collaboratorById = new Map((collaborators || []).map((c: any) => [String(c?.id || ''), c]))
    const assigned = new Map<string, string[]>()
    ;(crewsSource || []).forEach((crew: any) => {
      const crewId = String(crew?.id || crew?.crew_id || '')
      if (!crewId) return
      if (excludeCrewId && String(excludeCrewId) === crewId) return
      const crewWorkDate = String(crew?.work_date || '').trim()
      if (!workDate || !crewWorkDate || crewWorkDate !== workDate) return
      const crewName = String(crew?.name || '').trim() || `Cuadrilla ${crewId}`
      readCrewAssignedIds(crew).forEach((collabId) => {
        const id = String(collabId || '').trim()
        if (!id) return
        const keys = getCollaboratorIdentityKeys(collaboratorById.get(id) || { id })
        keys.forEach((key) => {
          const prev = assigned.get(key) || []
          if (!prev.includes(crewName)) assigned.set(key, [...prev, crewName])
        })
      })
    })
    return assigned
  }

  const normalizeCollaboratorsList = useCallback((data: any[], options?: { normalizeSpecialty?: boolean }) => {
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
    const norm = (data || []).map((c: any) => ({
      ...c,
      id: String(c.id),
      ...(options?.normalizeSpecialty ? { specialty: normalizeCandidateSpecialty(c.specialty) } : {})
    }))
    return Array.from(new Map(norm.map((c: any) => [String(c.id), c])).values())
  }, [])

  const loadCollaboratorsCached = useCallback(async (options?: { force?: boolean; normalizeSpecialty?: boolean }) => {
    const cached = collaboratorsCacheRef.current
    if (!options?.force && cached && cached.length > 0) {
      return options?.normalizeSpecialty
        ? normalizeCollaboratorsList(cached, { normalizeSpecialty: true })
        : cached
    }
    if (!options?.force && collaboratorsInFlightRef.current) return collaboratorsInFlightRef.current

    const promise = (async () => {
      const res = await fetch('/api/collaborators')
      if (!res.ok) return collaboratorsCacheRef.current || []
      const data = await res.json()
      const dedup = normalizeCollaboratorsList(data || [], { normalizeSpecialty: options?.normalizeSpecialty })
      collaboratorsCacheRef.current = dedup
      setCollaborators(dedup)
      return dedup
    })().finally(() => {
      collaboratorsInFlightRef.current = null
    })

    collaboratorsInFlightRef.current = promise
    return promise
  }, [normalizeCollaboratorsList])

  useEffect(() => {
    if (attendanceDatesLoading || !attendanceDatesLoadedRef.current) return
    if (attendanceWorkDates.length === 0) {
      if (createWorkDate) setCreateWorkDate('')
      return
    }
    if (attendanceWorkDates.includes(createWorkDate)) return
    const today = getChileToday()
    setCreateWorkDate(attendanceWorkDates.includes(today) ? today : attendanceWorkDates[0])
  }, [attendanceDatesLoading, attendanceWorkDates, createWorkDate, getChileToday])

  const loadTurnoByDate = useCallback(async (dateKey?: string, force = false) => {
    const date = String(dateKey || '').trim()
    if (!date) return
    if (!force && turnoLoadedDatesRef.current.has(date)) return
    setTurnoLoadingByDate(prev => ({ ...prev, [date]: true }))
    try {
      const res = await fetch(`/api/collaborators/daily-status?date=${encodeURIComponent(date)}&turno_ids=1`, { cache: 'no-store' })
      if (!res.ok) {
        setTurnoIdsByDate(prev => ({ ...prev, [date]: [] }))
        turnoLoadedDatesRef.current.add(date)
        return
      }
      const json = await res.json()
      if (Array.isArray(json?.ids)) {
        const ids: string[] = Array.from(new Set<string>(json.ids.map((id: any) => String(id || '').trim()).filter(Boolean)))
        setTurnoIdsByDate(prev => ({ ...prev, [date]: ids }))
        turnoLoadedDatesRef.current.add(date)
        return
      }
      const normalizeLocal = (value: any) =>
        String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
      const ids: string[] = Array.from(
        new Set<string>(
          (Array.isArray(json?.rows) ? json.rows : [])
            .filter((r: any) => {
              const statusNorm = normalizeLocal(r?.status)
              const reasonNorm = normalizeLocal(r?.reason)
              return statusNorm === 'turno' || reasonNorm === '11'
            })
            .flatMap((r: any) => ([
              String(r?.collaborator_id || '').trim(),
              String(r?.collaborator?.id || '').trim(),
              String(r?.collaborator?.user_id || '').trim(),
            ]))
            .filter(Boolean)
        )
      )
      setTurnoIdsByDate(prev => ({ ...prev, [date]: ids }))
      turnoLoadedDatesRef.current.add(date)
    } catch {
      setTurnoIdsByDate(prev => ({ ...prev, [date]: [] }))
      turnoLoadedDatesRef.current.add(date)
    } finally {
      setTurnoLoadingByDate(prev => ({ ...prev, [date]: false }))
    }
  }, [])

  useEffect(() => {
    if (!createWorkDate) return
    loadTurnoByDate(createWorkDate)
  }, [createWorkDate, loadTurnoByDate])

  useEffect(() => {
    if (!editWorkDate) return
    loadTurnoByDate(editWorkDate)
  }, [editWorkDate, loadTurnoByDate])

  useEffect(() => {
    if (!programDialogOpen) return
    if (!selectedCrewForProgram) return
    const crew = crews.find((c: any) => String(c.id) === String(selectedCrewForProgram))
    if (crew?.work_date) {
      setProgramWorkDate(String(crew.work_date))
    } else if (crew?.created_at) {
      setProgramWorkDate(toChileDateKey(crew.created_at) || getChileToday())
    } else {
      setProgramWorkDate(getChileToday())
    }
  }, [programDialogOpen, selectedCrewForProgram, crews, toChileDateKey, getChileToday])

  const loadProgramCrewContext = useCallback(async (crewId: string, workDate?: string) => {
    setLoadingProgramCrew(true)
    setProgramCrewMembers([])
    setProgramCrewRoleIds(null)
    setProgramAssignedActivities([])
    setProgramInitialAssignedIds(new Set<string>())
    setProgramDirty(false)
    try {
      const assignedUrl = workDate
        ? `/api/crews/${encodeURIComponent(String(crewId))}/activities?date=${encodeURIComponent(workDate)}`
        : `/api/crews/${encodeURIComponent(String(crewId))}/activities`
      const [crewRes, fullRes, assignedRes] = await Promise.all([
        fetch(`/api/crews/${encodeURIComponent(String(crewId))}`),
        fetch(`/api/crews/${encodeURIComponent(String(crewId))}/full`),
        fetch(assignedUrl)
      ])

      if (crewRes.ok) {
        const crew = await crewRes.json()
        setProgramCrewRoleIds({
          supervisors: Array.isArray(crew?.supervisors) ? crew.supervisors.map(String) : [],
          foremen: Array.isArray(crew?.foremen) ? crew.foremen.map(String) : [],
          members: Array.isArray(crew?.members) ? crew.members.map(String) : [],
        })
      }

      if (fullRes.ok) {
        const j = await fullRes.json()
        setProgramCrewMembers(Array.isArray(j?.collaborators) ? j.collaborators : [])
      }

      if (assignedRes.ok) {
        const j = await assignedRes.json()
        setProgramAssignedActivities(Array.isArray(j?.activities) ? j.activities : [])
        const ids: Set<string> = new Set<string>((j?.activities || []).map((a: any) => String(a.id)))
        setProgramInitialAssignedIds(ids)
        setProgramDirty(false)
      }
    } catch (e) {
      console.warn('Could not load program crew context', e)
    } finally {
      setLoadingProgramCrew(false)
    }
  }, [])

  useEffect(() => {
    if (!programDialogOpen) return
    if (!selectedCrewForProgram) return
    if (!programWorkDate) return
    ;(async () => {
      try {
        await loadProgramCrewContext(String(selectedCrewForProgram), programWorkDate)
      } catch {}
    })()
  }, [programDialogOpen, selectedCrewForProgram, programWorkDate, loadProgramCrewContext])

  const formatDisciplineLabel = (val: any) => {
    if (val == null) return ''
    const raw = String(val).trim()
    if (!raw) return ''
    const norm = normalizeText(raw)
    if (['canieria', 'caneria', 'piping', 'cañeria', 'canerias', 'cañerias'].includes(norm)) return 'Cañería'
    if (['electricidad', 'electrico', 'electrica', 'electricos', 'electricas', 'eléctrico', 'eléctrica'].includes(norm)) return 'Eléctrico'
    if (['instrumentacion', 'instrumentación'].includes(norm)) return 'Instrumentación'
    if (['mecanica', 'mecánica', 'mecanico', 'mecánico'].includes(norm)) return 'Mecánica'
    if (['soldadura', 'soldador', 'soldadores'].includes(norm)) return 'Soldadura'
    if (['sin asignar', 'sinasignar', 'n/a', 'na'].includes(norm)) return 'Sin asignar'
    return raw
      .replace(/\bcaneria\b/gi, 'Cañería')
      .replace(/\bcanieria\b/gi, 'Cañería')
      .replace(/\belectrico\b/gi, 'Eléctrico')
      .replace(/\belectrica\b/gi, 'Eléctrica')
      .replace(/\binstrumentacion\b/gi, 'Instrumentación')
      .replace(/\bmecanica\b/gi, 'Mecánica')
  }

  const formatCrewName = (name: any) => {
    if (name == null) return ''
    let raw = String(name)
    if (!raw.trim()) return raw
    // replace specialty tokens in crew names for display
    raw = raw.replace(/\bcaneria\b/gi, 'Cañeria')
    raw = raw.replace(/\bcanieria\b/gi, 'Cañeria')
    raw = raw.replace(/\belectricidad\b/gi, 'Eléctrico')
    return toDisplayUpper(raw)
  }

  const toDisplayUpper = (val: any) => {
    if (val === null || val === undefined) return ''
    return String(val).trim().toLocaleUpperCase('es-CL')
  }

  const formatCollaboratorName = (firstName: any, lastName: any) => {
    const full = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.replace(/\s+/g, ' ').trim()
    return toDisplayUpper(full)
  }

  const formatPositionLabel = (val: any) => {
    if (!val) return ''
    const raw = String(val)
    const replaced = raw
      .replace(/\bcaneria\b/gi, 'Cañería')
      .replace(/\bcanieria\b/gi, 'Cañería')
    return toDisplayUpper(replaced)
  }

  const normalizeDisciplineValue = (val: any) => {
    if (!val) return null
    const norm = normalizeText(String(val))
    if (!norm) return null
    if (['canieria', 'caneria', 'piping', 'cañeria', 'cañerias', 'canerias'].includes(norm)) return 'caneria'
    if (norm === 'electricidad' || norm === 'electrico' || norm === 'eléctrico' || norm === 'electricos' || norm === 'electricas') return 'electricidad'
    if (norm === 'instrumentacion' || norm === 'instrumentación') return 'instrumentacion'
    if (norm === 'mecanica' || norm === 'mecánica' || norm === 'mecanicos' || norm === 'mecanicas') return 'mecanica'
    if (norm === 'soldadura') return 'soldadura'
    if (norm.endsWith('s')) {
      const singular = norm.slice(0, -1)
      if (['canieria', 'caneria', 'piping', 'cañeria'].includes(singular)) return 'caneria'
      if (singular === 'electricidad' || singular === 'electrico' || singular === 'eléctrico') return 'electricidad'
      if (singular === 'instrumentacion' || singular === 'instrumentación') return 'instrumentacion'
      if (singular === 'mecanica' || singular === 'mecánica') return 'mecanica'
      if (singular === 'soldadura') return 'soldadura'
    }
    return norm
  }

  const getCanonicalDiscipline = (val: any, options: string[]) => {
    const norm = normalizeDisciplineValue(val)
    if (!norm) return null
    const match = (options || []).find((opt) => normalizeDisciplineValue(opt) === norm)
    return match || norm
  }

  const formatNa = (val: any) => {
    if (val === null || val === undefined) return 'N/A'
    const s = String(val).trim()
    return s ? s : 'N/A'
  }

  const formatActivityId = (itemId: any, id: any) => {
    const item = itemId !== null && itemId !== undefined ? String(itemId).trim() : ''
    if (item) return item
    const rawId = id !== null && id !== undefined ? String(id).trim() : ''
    if (!rawId) return 'S/ID'
    const prefix = rawId.split('-')[0] || rawId
    return `S/ID (${prefix})`
  }

  const renderListCell = (items: string[], fallback: string) => {
    const list = (items || []).filter(Boolean)
    if (list.length === 0) return fallback || '-'
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {list.map((t, idx) => (
          <span key={`${t}-${idx}`}>{t}</span>
        ))}
      </Box>
    )
  }

  const renderStripedListCell = (items: string[], fallback: string) => {
    const list = (items || []).filter(Boolean)
    if (list.length === 0) return fallback || '-'
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {list.map((t, idx) => (
          <Box
            key={`${t}-${idx}`}
            sx={{
              px: 0.5,
              py: 0.5,
              fontSize: 13,
              bgcolor: idx % 2 === 0 ? '#ffffff' : '#eef3f8',
              borderBottom: idx === list.length - 1 ? 'none' : '1px solid #eef2f7'
            }}
          >
            {t}
          </Box>
        ))}
      </Box>
    )
  }

  const getCrewDescriptionCell = (crew: any) => {
    const base = String(crew?.description || '').trim()
    const extraList: string[] = Array.from(new Set(
      (Array.isArray(crew?.activities) ? crew.activities : [])
        .map((a: any) => String(a?.user_detail || '').trim())
        .filter(Boolean)
    )) as string[]

    const composed: string[] = [
      ...(base ? [base] : []),
      ...extraList
    ]
    return renderStripedListCell(composed, '-')
  }

  const loadExportDates = useCallback(async () => {
    try {
      const res = await fetch('/api/crews/activities/today?dates=1')
      if (!res.ok) {
        setExportDates([])
        return
      }
      const json = await res.json()
      const list = Array.isArray(json?.dates) ? json.dates.filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))) : []
      setExportDates(list)
      const today = getChileToday()
      if (list.includes(exportDate)) return
      if (list.includes(today)) setExportDate(today)
      else if (list.length > 0) setExportDate(list[0])
    } catch {
      setExportDates([])
    }
  }, [exportDate, getChileToday])

  const formatDateLabel = (ymd: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return ymd
    const [y, m, d] = String(ymd).split('-')
    return `${d}-${m}-${y}`
  }

  const handleExportToday = async (selectedDate?: string) => {
    try {
      const targetDate = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
        ? selectedDate
        : (exportDate && /^\d{4}-\d{2}-\d{2}$/.test(exportDate) ? exportDate : getChileToday())
      const res = await fetch(`/api/crews/activities/today?date=${encodeURIComponent(targetDate)}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) {
        alert('No hay actividades para exportar en la fecha seleccionada')
        return false
      }
      const crewsMap = new Map<string, { crew_name: string; assigned_at: any; activities: any[]; members: any[] }>()
      ;(data || []).forEach((r: any) => {
        const key = String(r.crew_id || r.crew_name || '')
        if (!crewsMap.has(key)) {
          crewsMap.set(key, {
            crew_name: r.crew_name || '',
            assigned_at: r.assigned_at || '',
            activities: [],
            members: Array.isArray(r.crew_members?.ordered_list) ? r.crew_members.ordered_list : []
          })
        }
        const entry = crewsMap.get(key)!
        if (!entry.members || entry.members.length === 0) {
          entry.members = Array.isArray(r.crew_members?.ordered_list) ? r.crew_members.ordered_list : entry.members
        }
        entry.activities.push(r)
      })

      const rows: any[] = []
      const disciplineOrder = ['electricidad', 'caneria', 'instrumentacion', 'mecanica', 'soldadura', 'sin asignar']
      const resolveDisciplineKey = (entry: any) => {
        const acts = entry.activities || []
        for (const a of acts) {
          const raw = normalizeText(String(a?.discipline || ''))
          if (raw) return raw
        }
        const name = String(entry.crew_name || '').toLowerCase()
        if (/\bcanieria\b|\bcaneria\b|\bpiping\b/.test(name)) return 'caneria'
        if (/\belectricidad\b|\belectrico\b|\bel[eé]ctrico\b/.test(name)) return 'electricidad'
        if (/\binstrumentacion\b|\binstrumentación\b/.test(name)) return 'instrumentacion'
        if (/\bmecanica\b|\bmec[aá]nica\b/.test(name)) return 'mecanica'
        if (/\bsoldadura\b/.test(name)) return 'soldadura'
        return 'sin asignar'
      }
      const entries = Array.from(crewsMap.values()).sort((a: any, b: any) => {
        const ka = resolveDisciplineKey(a)
        const kb = resolveDisciplineKey(b)
        const ia = disciplineOrder.indexOf(ka)
        const ib = disciplineOrder.indexOf(kb)
        if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
        const an = String(a.crew_name || '')
        const bn = String(b.crew_name || '')
        return an.localeCompare(bn, 'es')
      })
      for (const entry of entries) {
        const activities = entry.activities || []
        const members = entry.members && entry.members.length > 0 ? entry.members : []
        const totalRows = Math.max(activities.length, members.length, 1)

        for (let i = 0; i < totalRows; i += 1) {
          const r = activities[i]
          const m = members[i]
          rows.push({
            Fecha: i === 0 ? (entry.assigned_at ? new Date(entry.assigned_at).toLocaleDateString() : '') : '',
            Cuadrilla: i === 0 ? (entry.crew_name || '') : '',
            Actividad: r ? (r.activity || '') : '',
            Descripcion: r ? (r.description || '') : '',
            Area: r ? (r.area || '') : '',
            Disciplina: r ? formatDisciplineLabel(r.discipline || '') : '',
            Cantidad: r ? (r.quantity ?? '') : '',
            Unidad: r ? (r.unit || '') : '',
            Paquete: r ? (r.package || '') : '',
            Nombre: m ? toDisplayUpper(m.name || '') : '',
            Cargo: m ? toDisplayUpper(m.position || '') : '',
            Documento: m ? (m.doc || '') : '',
          })
        }
      }
      const mod = await import('xlsx')
      const XLSX = (mod && (mod.default || mod)) as any
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Actividades')
      const [yyyy, mm, dd] = targetDate.split('-')
      const dateSuffix = `${mm}-${dd}-${yyyy}`
      const role = String((session?.user as any)?.role || '').toLowerCase()
      const isGlobal = ['admin', 'dev', 'hr_manager', 'supervisor'].includes(role)
      const specialtyRaw = userSpecialty || ''
      const specialtySlug = specialtyRaw ? normalizeText(specialtyRaw).replace(/\s+/g, '-') : 'sin-disciplina'
      const filename = isGlobal
        ? `actividades_${dateSuffix}.xlsx`
        : `actividades_${specialtySlug}_${dateSuffix}.xlsx`
      XLSX.writeFile(wb, filename)
      setExportDate(targetDate)
      return true
    } catch (e) {
      console.error(e)
      alert('Error exportando actividades')
      return false
    }
  }

  const getCrewDisciplineKey = (crew: any) => {
    const raw = String((crew && (crew.specialty || crew.specialidad)) || '').trim()
    if (raw) return normalizeText(raw)
    const name = String((crew && crew.name) || '').toLowerCase()
    if (/\bcanieria\b|\bcaneria\b|\bpiping\b/.test(name)) return 'caneria'
    if (/\belectricidad\b|\belectrico\b|\bel[eé]ctrico\b/.test(name)) return 'electricidad'
    if (/\binstrumentacion\b|\binstrumentación\b/.test(name)) return 'instrumentacion'
    if (/\bmecanica\b|\bmec[aá]nica\b/.test(name)) return 'mecanica'
    if (/\bsoldadura\b/.test(name)) return 'soldadura'
    return 'sin asignar'
  }

  const getCrewDisplaySortParts = (crew: any) => {
    const name = String(crew?.name || '').trim()
    const normalizedName = normalizeText(name)
    const crewNumberMatch = normalizedName.match(/\bcuadrilla\s*(\d+)\b/)
    const crewNumber = crewNumberMatch ? Number(crewNumberMatch[1]) : Number.MAX_SAFE_INTEGER
    const frontKey = normalizedName
      .replace(/\bcuadrilla\s*\d+\b/g, ' ')
      .replace(/\bcontrato\s+base\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return {
      frontKey: frontKey || normalizedName,
      crewNumber,
      nameKey: normalizedName
    }
  }

  const sortCrewsForExtendedSummary = (items: any[]) => {
    return (items || []).slice().sort((a: any, b: any) => {
      const pa = getCrewDisplaySortParts(a)
      const pb = getCrewDisplaySortParts(b)
      const frontCompare = pa.frontKey.localeCompare(pb.frontKey, 'es', { numeric: true, sensitivity: 'base' })
      if (frontCompare !== 0) return frontCompare
      if (pa.crewNumber !== pb.crewNumber) return pa.crewNumber - pb.crewNumber
      return pa.nameKey.localeCompare(pb.nameKey, 'es', { numeric: true, sensitivity: 'base' })
    })
  }

  const groupedCrews = useMemo(() => {
    const groups = new Map<string, any[]>()
    for (const c of crews || []) {
      const k = getCrewDisciplineKey(c)
      const list = groups.get(k) || []
      list.push(c)
      groups.set(k, list)
    }
    const preferredOrder = ['electricidad', 'caneria', 'instrumentacion', 'mecanica', 'soldadura', 'sin asignar']
    const keys = Array.from(groups.keys())
    keys.sort((a, b) => {
      const ia = preferredOrder.indexOf(a)
      const ib = preferredOrder.indexOf(b)
      const ra = ia === -1 ? 999 : ia
      const rb = ib === -1 ? 999 : ib
      if (ra !== rb) return ra - rb
      return a.localeCompare(b)
    })
    return keys.map(k => ({
      key: k,
      label: formatDisciplineLabel(k),
      crews: sortCrewsForExtendedSummary(groups.get(k) || [])
    }))
  }, [crews])

  const crewsGroupedByDate = useMemo(() => {
    const allCrews = groupedCrews.flatMap((g) => g.crews || [])
    const groups = new Map<string, any[]>()
    allCrews.forEach((c: any) => {
      const key = String(c?.work_date || '').trim() || '__sin_fecha__'
      const list = groups.get(key) || []
      list.push(c)
      groups.set(key, list)
    })
    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === '__sin_fecha__') return 1
      if (b === '__sin_fecha__') return -1
      return b.localeCompare(a) // fecha más reciente primero
    })
    return keys.map((key) => ({
      key,
      label: key === '__sin_fecha__' ? 'Sin fecha' : formatDateLabel(key),
      crews: sortCrewsForExtendedSummary(groups.get(key) || [])
    }))
  }, [groupedCrews])

  useEffect(() => {
    const defaultExpandedKey = (crewsGroupedByDate || [])
      .map((g: any) => String(g?.key || '').trim())
      .find((key) => key && key !== '__sin_fecha__')
      || String((crewsGroupedByDate || [])[0]?.key || '').trim()

    const unseenKeys = (crewsGroupedByDate || [])
      .map((g: any) => String(g?.key || '').trim())
      .filter((key) => key && !knownDateGroupKeysRef.current.has(key))

    if (unseenKeys.length === 0) return

    setCollapsedDateGroups((prev) => {
      const next = new Set(Array.from(prev))
      unseenKeys.forEach((key) => {
        knownDateGroupKeysRef.current.add(key)
        if (key !== defaultExpandedKey) next.add(key)
      })
      return next
    })
  }, [crewsGroupedByDate])

  const getPreloadDateKeys = useCallback(() => {
    const dateKeys = (crewsGroupedByDate || [])
      .map((g: any) => String(g?.key || '').trim())
      .filter((key) => !!key && key !== '__sin_fecha__')

    if (dateKeys.length === 0) return []
    if (collapsedDateGroups.size === 0) return [dateKeys[0]]
    return dateKeys.filter((key) => !collapsedDateGroups.has(key))
  }, [crewsGroupedByDate, collapsedDateGroups])

  useEffect(() => {
    // Precarga solo fechas expandidas; cargar todo el histórico genera demasiadas
    // llamadas y egress innecesario.
    const dateKeys = getPreloadDateKeys()
    dateKeys.forEach((key) => {
      void loadTurnoByDate(key)
    })
  }, [getPreloadDateKeys, loadTurnoByDate])

  const loadDateCollaboratorNotes = useCallback(async (dateKey: string) => {
    const key = String(dateKey || '').trim()
    if (!key || key === '__sin_fecha__') return {}
    try {
      const res = await fetch(`/api/crews/daily-exceptions?date=${encodeURIComponent(key)}`, { cache: 'no-store' })
      if (!res.ok) return {}
      const json = await res.json()
      const rows = Array.isArray(json?.rows) ? json.rows : []
      const assignedIds: string[] = Array.isArray(json?.assigned_collaborator_ids)
        ? Array.from(new Set<string>(json.assigned_collaborator_ids.map((id: any) => String(id || '').trim()).filter(Boolean)))
        : []
      const map: Record<string, string> = {}
      rows.forEach((r: any) => {
        const cid = String(r?.collaborator_id || '').trim()
        const note = String(r?.note || '').trim()
        if (!cid || !note) return
        map[cid] = note
      })
      setDateCollaboratorNotesByDate((prev) => ({ ...prev, [key]: map }))
      setDateAssignedIdsByDate((prev) => ({ ...prev, [key]: assignedIds }))
      return map
    } catch {
      return {}
    }
  }, [])

  useEffect(() => {
    if (!canViewDateNotes) return
    const dateKeys = getPreloadDateKeys()
    dateKeys.forEach((key) => {
      void loadDateCollaboratorNotes(key)
    })
  }, [canViewDateNotes, getPreloadDateKeys, loadDateCollaboratorNotes])

  const getDateAvailableCollaborators = useCallback((dateKey: string) => {
    const validDate = String(dateKey || '').trim()
    if (!validDate || validDate === '__sin_fecha__') return [] as any[]
    const crewsInDate = (crewsGroupedByDate || []).find((g) => String(g?.key || '') === validDate)?.crews || []
    const assignedByIdentity = buildAssignedCrewNamesByIdentity(crewsInDate, validDate)
    const assignedIdsFromServer = new Set((dateAssignedIdsByDate[validDate] || []).map(String))
    const turnoIds = new Set((turnoIdsByDate[validDate] || []).map(String))
    const isEligibleForDateNote = (c: any) => {
      const normalizeLocal = (s: any) =>
        String(s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
      const pos = String(c?.position || c?.posicion || '')
      const posNorm = normalizeLocal(pos)
      const specNorm = normalizeLocal(c?.specialty || c?.specialidad || '')
      const workerTypeNorm = normalizeLocal(c?.worker_type || c?.tipo_trabajador || '')
      const isHiddenAdminPosition =
        posNorm.startsWith('jefe') ||
        posNorm.includes('encargado de relaciones laborales') ||
        posNorm.includes('encargado relaciones laborales') ||
        posNorm.includes('jefe de terreno') ||
        posNorm.includes('jefe terreno') ||
        posNorm.includes('coordinador logistico') ||
        posNorm.includes('encargado medio ambiente') ||
        posNorm.includes('jefe de prevencion') ||
        posNorm.includes('jefe prevencion')
      if (isHiddenAdminPosition) return false
      const role =
        posNorm.includes('capataz') || posNorm.includes('encargado') || posNorm.includes('foreman')
          ? 'foreman'
          : posNorm.includes('supervisor') ||
              posNorm.includes('jefe') ||
              posNorm.includes('coordinador') ||
              posNorm.includes('senior') ||
              posNorm.includes('lead')
            ? 'supervisor'
            : 'member'
      const isIndirect = (
        posNorm.includes('nivelador') ||
        posNorm.includes('mecanico mantencion') ||
        posNorm.includes('electrico mantencion') ||
        posNorm.includes('indirect') ||
        specNorm.includes('indirect') ||
        workerTypeNorm.includes('indirect') ||
        posNorm.includes('topografo') ||
        posNorm.includes('alarife')
      )
      if (role === 'supervisor' || role === 'foreman') return true
      if (role === 'member' && !isIndirect) return true
      return false
    }
    return (collaborators || [])
      .filter((c: any) => {
        const id = String(c?.id || '').trim()
        if (!id) return false
        if (!turnoIds.has(id)) return false
        if (assignedIdsFromServer.has(id)) return false
        if (getCollaboratorIdentityKeys(c).some((key) => assignedByIdentity.has(key))) return false
        if (!isEligibleForDateNote(c)) return false
        return true
      })
      .sort((a: any, b: any) => {
        const la = `${String(a?.last_name || '').trim()} ${String(a?.first_name || '').trim()}`.trim()
        const lb = `${String(b?.last_name || '').trim()} ${String(b?.first_name || '').trim()}`.trim()
        return la.localeCompare(lb, 'es')
      })
  }, [crewsGroupedByDate, turnoIdsByDate, collaborators, dateAssignedIdsByDate])
  const availableCollaboratorsForModal = useMemo(
    () => getDateAvailableCollaborators(dateNoteModalDateKey),
    [getDateAvailableCollaborators, dateNoteModalDateKey]
  )
  const availableCountByDate = useMemo(() => {
    const out: Record<string, number> = {}
    ;(crewsGroupedByDate || []).forEach((g: any) => {
      const key = String(g?.key || '').trim()
      if (!key || key === '__sin_fecha__') return
      out[key] = getDateAvailableCollaborators(key).length
    })
    return out
  }, [crewsGroupedByDate, getDateAvailableCollaborators])
  const noteStatusByDate = useMemo(() => {
    const out: Record<string, { saved: number; pending: number; available: number }> = {}
    ;(crewsGroupedByDate || []).forEach((g: any) => {
      const key = String(g?.key || '').trim()
      if (!key || key === '__sin_fecha__') return
      const available = getDateAvailableCollaborators(key)
      const notes = dateCollaboratorNotesByDate[key] || {}
      const saved = available.filter((c: any) => String(notes[String(c?.id || '')] || '').trim()).length
      out[key] = {
        saved,
        pending: Math.max(0, available.length - saved),
        available: available.length
      }
    })
    return out
  }, [crewsGroupedByDate, getDateAvailableCollaborators, dateCollaboratorNotesByDate])

  const closeDateNoteModal = useCallback(() => {
    setDateNoteModalOpen(false)
    setDateNoteModalDateKey('')
    setDateNoteModalDateLabel('')
    setDateNoteDraftByCollaborator({})
  }, [])

  const openDateNoteModal = useCallback((dateKey: string, dateLabel: string) => {
    if (!canViewDateNotes) return
    const key = String(dateKey || '').trim()
    setDateNoteModalDateKey(key)
    setDateNoteModalDateLabel(String(dateLabel || key))
    setDateNoteDraftByCollaborator({ ...(dateCollaboratorNotesByDate[key] || {}) })
    setDateNoteModalOpen(true)
    if (key && key !== '__sin_fecha__') loadTurnoByDate(key)
    if (key && key !== '__sin_fecha__') {
      loadDateCollaboratorNotes(key).then((notesMap) => {
        setDateNoteDraftByCollaborator({ ...(notesMap || {}) })
      })
    }
  }, [canViewDateNotes, dateCollaboratorNotesByDate, loadTurnoByDate, loadDateCollaboratorNotes])

  const handleSaveDateNote = useCallback(async () => {
    if (!canManageCrews) return
    const key = String(dateNoteModalDateKey || '').trim()
    if (!key) return
    const scopeIds = (availableCollaboratorsForModal || []).map((c: any) => String(c?.id || '')).filter(Boolean)
    const entries = scopeIds.map((cid) => ({
      collaborator_id: cid,
      note: String(dateNoteDraftByCollaborator[cid] || '').trim(),
      reason_type: null
    }))
    try {
      const res = await fetch('/api/crews/daily-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date: key,
          entries,
          scope_collaborator_ids: scopeIds
        })
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || 'Error guardando notas')
      }
      const savedNotes = Object.fromEntries(
        Object.entries(dateNoteDraftByCollaborator)
          .map(([cid, note]) => [cid, String(note || '').trim()])
          .filter(([, note]) => !!note)
      )
      setDateCollaboratorNotesByDate((prev) => ({ ...prev, [key]: savedNotes }))
    } catch (e: any) {
      alert(e?.message || 'No se pudo guardar las notas')
      return
    }
    closeDateNoteModal()
  }, [canManageCrews, dateNoteModalDateKey, dateNoteDraftByCollaborator, availableCollaboratorsForModal, closeDateNoteModal])

  const openView = useCallback(async (crewId: string) => {
    const id = String(crewId || '').trim()
    if (!id) return
    const seq = viewLoadSeqRef.current + 1
    viewLoadSeqRef.current = seq
    setViewDialogOpen(true)
    setViewLoading(true)
    setViewCrewId(id)
    setViewCrew(null)
    setViewCrewMembers([])
    setViewCrewRoleIds(null)
    setViewAssignedActivities([])

    try {
      const [crewRes, fullRes, assignedRes] = await Promise.all([
        fetch(`/api/crews/${encodeURIComponent(id)}`, { cache: 'no-store' }),
        fetch(`/api/crews/${encodeURIComponent(id)}/full`, { cache: 'no-store' }),
        fetch(`/api/crews/${encodeURIComponent(id)}/activities`, { cache: 'no-store' })
      ])

      if (seq !== viewLoadSeqRef.current) return

      if (crewRes.ok) {
        const crew = await crewRes.json()
        if (seq !== viewLoadSeqRef.current) return
        setViewCrew(crew || null)
        setViewCrewRoleIds({
          supervisors: Array.isArray(crew?.supervisors) ? crew.supervisors.map(String) : [],
          foremen: Array.isArray(crew?.foremen) ? crew.foremen.map(String) : [],
          members: Array.isArray(crew?.members) ? crew.members.map(String) : [],
        })
      }

      if (fullRes.ok) {
        const j = await fullRes.json()
        if (seq !== viewLoadSeqRef.current) return
        setViewCrewMembers(Array.isArray(j?.collaborators) ? j.collaborators : [])
      }

      if (assignedRes.ok) {
        const j = await assignedRes.json()
        if (seq !== viewLoadSeqRef.current) return
        const list = Array.isArray(j?.activities) ? j.activities : []
        setViewAssignedActivities(list)
      }
    } catch (e) {
      console.warn('Could not load crew view data', e)
    } finally {
      if (seq === viewLoadSeqRef.current) setViewLoading(false)
    }
  }, [])

  const viewCrewDateKey = useMemo(() => {
    const id = String(viewCrewId || viewCrew?.id || '').trim()
    const crewFromList = id ? crews.find((c: any) => String(c?.id || '') === id) : null
    const rawDate = viewCrew?.work_date || crewFromList?.work_date || ''
    return String(rawDate || '').trim() || '__sin_fecha__'
  }, [crews, viewCrew, viewCrewId])

  const viewDateCrewList = useMemo(() => {
    const group = (crewsGroupedByDate || []).find((g: any) => String(g?.key || '') === viewCrewDateKey)
    return Array.isArray(group?.crews) ? group.crews : []
  }, [crewsGroupedByDate, viewCrewDateKey])

  const viewCrewIndex = useMemo(() => {
    const id = String(viewCrewId || viewCrew?.id || '').trim()
    if (!id) return -1
    return viewDateCrewList.findIndex((c: any) => String(c?.id || '') === id)
  }, [viewCrew?.id, viewCrewId, viewDateCrewList])

  const canViewPreviousCrew = viewCrewIndex > 0
  const canViewNextCrew = viewCrewIndex >= 0 && viewCrewIndex < viewDateCrewList.length - 1

  const openAdjacentViewCrew = useCallback((direction: -1 | 1) => {
    const nextIndex = viewCrewIndex + direction
    const nextCrew = viewDateCrewList[nextIndex]
    const nextId = String(nextCrew?.id || '').trim()
    if (!nextId) return
    void openView(nextId)
  }, [openView, viewCrewIndex, viewDateCrewList])

  const closeView = useCallback(() => {
    viewLoadSeqRef.current += 1
    setViewDialogOpen(false)
    setViewCrewId('')
    setViewCrew(null)
    setViewCrewMembers([])
    setViewCrewRoleIds(null)
    setViewAssignedActivities([])
    setViewLoading(false)
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setFName("")
    setFDescription("")
    // legacy single-state fields for name/description are kept above
    // all selection and role states are handled per-form (create/edit)
    setInitialAssigned(new Set())
    setEditingCrew(null)
    setSupervisorsTouched(false)
    setForemenTouched(false)
    setMembersTouched(false)
    // reset create-specific
    setCreateFName("")
    setCreateFDescription("")
    setCreateSelectedFrontName("")
    const today = getChileToday()
    setCreateWorkDate(attendanceWorkDates.includes(today) ? today : (attendanceWorkDates[0] || ''))
    setCreateWorkDateAnchorEl(null)
    setCreateSelectedSpecialty(null)
    setCreateSupervisorsSelected([])
    setCreateForemenSelected([])
    setCreateSkipSupervisor(false)
    setCreateSkipForeman(false)
    setCreateMajor("")
    setCreateFirst("")
    setCreateSecond("")
    setCreateHelper("")
    setCreateMajorCustom("")
    setCreateFirstCustom("")
    setCreateSecondCustom("")
    setCreateHelperCustom("")
    setCreateMembersSelected([])
    setCreateIndirectSelected([])
    setCreateMultiAssignOverrides(new Set())
    setCreateFieldBossId('')
    setCreateFieldBossAttempted(false)
    setCreateCandidatesQuery("")
    setCreateSupervisorsTouched(false)
    setCreateForemenTouched(false)
    setCreateMembersTouched(false)
    setCreateLateOverride(false)
    // reset edit-specific
    setEditSelectedSpecialty(null)
    setEditSelectedFrontName("")
    setEditWorkDate("")
    setEditSupervisorsSelected([])
    setEditForemenSelected([])
    setEditSkipSupervisor(false)
    setEditSkipForeman(false)
    setEditMajor("")
    setEditFirst("")
    setEditSecond("")
    setEditHelper("")
    setEditMajorCustom("")
    setEditFirstCustom("")
    setEditSecondCustom("")
    setEditHelperCustom("")
    setEditMembersSelected([])
    setEditIndirectSelected([])
    setEditMultiAssignOverrides(new Set())
    setEditFieldBossId('')
    setEditCandidatesQuery("")
    setEditSupervisorsTouched(false)
    setEditForemenTouched(false)
    setEditMembersTouched(false)
    createInitialFingerprintRef.current = null
    editInitialFingerprintRef.current = null
    createTouchedRef.current = false
    editTouchedRef.current = false
    setCrewCloseConfirmOpen(false)
    setCrewCloseConfirmTarget(null)
  }

  const buildCrewDraftFingerprint = useCallback((mode: 'create' | 'edit') => {
    const isEdit = mode === 'edit'
    return JSON.stringify({
      name: String(isEdit ? fName : createFName),
      frontName: String(isEdit ? editSelectedFrontName : createSelectedFrontName),
      description: String(isEdit ? fDescription : createFDescription),
      workDate: String(isEdit ? editWorkDate : createWorkDate),
      specialty: String((isEdit ? editSelectedSpecialty : createSelectedSpecialty) || ''),
      fieldBossId: String((isEdit ? editFieldBossId : createFieldBossId) || ''),
      supervisors: (isEdit ? editSupervisorsSelected : createSupervisorsSelected).map(String).sort(),
      foremen: (isEdit ? editForemenSelected : createForemenSelected).map(String).sort(),
      members: (isEdit ? editMembersSelected : createMembersSelected).map(String).sort(),
      indirect: (isEdit ? editIndirectSelected : createIndirectSelected).map(String).sort(),
      skipSupervisor: !!(isEdit ? editSkipSupervisor : createSkipSupervisor),
      skipForeman: !!(isEdit ? editSkipForeman : createSkipForeman),
      major: String(isEdit ? editMajor : createMajor),
      first: String(isEdit ? editFirst : createFirst),
      second: String(isEdit ? editSecond : createSecond),
      helper: String(isEdit ? editHelper : createHelper),
      majorCustom: String(isEdit ? editMajorCustom : createMajorCustom),
      firstCustom: String(isEdit ? editFirstCustom : createFirstCustom),
      secondCustom: String(isEdit ? editSecondCustom : createSecondCustom),
      helperCustom: String(isEdit ? editHelperCustom : createHelperCustom),
      candidatesQuery: String(isEdit ? editCandidatesQuery : createCandidatesQuery),
      lateOverride: !isEdit ? !!createLateOverride : false
    })
  }, [
    fName, createFName, editSelectedFrontName, createSelectedFrontName, fDescription, createFDescription, editWorkDate, createWorkDate,
    editSelectedSpecialty, createSelectedSpecialty, editFieldBossId, createFieldBossId,
    editSupervisorsSelected, createSupervisorsSelected, editForemenSelected, createForemenSelected,
    editMembersSelected, createMembersSelected, editIndirectSelected, createIndirectSelected,
    editSkipSupervisor, createSkipSupervisor, editSkipForeman, createSkipForeman,
    editMajor, createMajor, editFirst, createFirst, editSecond, createSecond, editHelper, createHelper,
    editMajorCustom, createMajorCustom, editFirstCustom, createFirstCustom, editSecondCustom, createSecondCustom,
    editHelperCustom, createHelperCustom, editCandidatesQuery, createCandidatesQuery, createLateOverride
  ])

  const closeCreateModalImmediate = () => {
    setShowCreateForm(false)
    resetForm()
  }

  const closeEditModalImmediate = () => {
    setShowEditModal(false)
    resetForm()
  }

  const requestCloseCrewModal = useCallback((mode: 'create' | 'edit') => {
    const baseRef = mode === 'edit' ? editInitialFingerprintRef : createInitialFingerprintRef
    const touchedRef = mode === 'edit' ? editTouchedRef : createTouchedRef
    const current = buildCrewDraftFingerprint(mode)
    const base = baseRef.current
    const hasChanges = !!base && base !== current

    if (!hasChanges || !touchedRef.current) {
      if (mode === 'edit') closeEditModalImmediate()
      else closeCreateModalImmediate()
      return
    }
    setCrewCloseConfirmTarget(mode)
    setCrewCloseConfirmOpen(true)
  }, [buildCrewDraftFingerprint, closeCreateModalImmediate, closeEditModalImmediate])

  useEffect(() => {
    if (!showCreateForm) return
    const timer = setTimeout(() => {
      createInitialFingerprintRef.current = buildCrewDraftFingerprint('create')
      createTouchedRef.current = false
    }, 0)
    return () => clearTimeout(timer)
  }, [showCreateForm, buildCrewDraftFingerprint])

  useEffect(() => {
    if (!showEditModal) return
    const timer = setTimeout(() => {
      editInitialFingerprintRef.current = buildCrewDraftFingerprint('edit')
      editTouchedRef.current = false
    }, 0)
    return () => clearTimeout(timer)
  }, [showEditModal, buildCrewDraftFingerprint])

  const renderFormFields = (mode: 'create' | 'edit' = 'create') => {
    const isEdit = mode === 'edit'
    // Logging removed to reduce console noise in production
    // helpers to map state based on mode
    const name = isEdit ? fName : createFName
    const setName = isEdit ? setFName : setCreateFName
    const selectedFrontName = isEdit ? editSelectedFrontName : createSelectedFrontName
    const setSelectedFrontName = isEdit ? setEditSelectedFrontName : setCreateSelectedFrontName
    const description = isEdit ? fDescription : createFDescription
    const setDescription = isEdit ? setFDescription : setCreateFDescription
    const workDate = isEdit ? editWorkDate : createWorkDate
    const setWorkDate = isEdit ? setEditWorkDate : setCreateWorkDate
    const { date: chileToday, hour: chileHour } = getChileNowParts()
    const cutoffHour = 13
    const selSpecialty = isEdit ? editSelectedSpecialty : createSelectedSpecialty
    const fieldBossId = isEdit ? editFieldBossId : createFieldBossId
    const hasFieldBossSelected = String(fieldBossId || '').trim().length > 0
    const setFieldBossId = isEdit ? setEditFieldBossId : setCreateFieldBossId
    const canLateOverride = latePolicy.allowByUser
    const setSelSpecialty = isEdit ? setEditSelectedSpecialty : setCreateSelectedSpecialty
    const normalizedSelSpecialty = normalizeStr(selSpecialty || '')
    const specialtySelectValue = (() => {
      const match = (specialtyOptions || []).find((opt) => normalizeStr(opt) === normalizedSelSpecialty)
      return (match || selSpecialty || '') as string
    })()
    const normalizedSelectedFrontName = normalizeStr(selectedFrontName || (isEdit ? getCrewNameBase(name) : ''))
    const frontSelectValue = (() => {
      const match = (reportFrontOptions || []).find((front) => normalizeStr(front.name) === normalizedSelectedFrontName)
      return match?.name || selectedFrontName || (isEdit ? getCrewNameBase(name) : '') || ''
    })()
    const updateWorkDate = (nextDate: string) => {
      setWorkDate(nextDate)
      const frontBase = selectedFrontName || getCrewNameBase(name)
      if (frontBase) {
        setName(getNextCrewNameForFront(frontBase, nextDate, isEdit ? editingId : null))
      }
    }
    const attendanceWorkDateSet = new Set(attendanceWorkDates)
    const hasValidCreateWorkDate = isEdit || attendanceWorkDateSet.has(String(workDate || '').trim())
    const minAttendanceWorkDate = attendanceWorkDates.length > 0 ? attendanceWorkDates[attendanceWorkDates.length - 1] : ''
    const maxAttendanceWorkDate = attendanceWorkDates.length > 0 ? attendanceWorkDates[0] : ''
    const supSelected = isEdit ? editSupervisorsSelected : createSupervisorsSelected
    const setSupSelected = isEdit ? setEditSupervisorsSelected : setCreateSupervisorsSelected
    const frmSelected = isEdit ? editForemenSelected : createForemenSelected
    const setFrmSelected = isEdit ? setEditForemenSelected : setCreateForemenSelected
    const skipSup = isEdit ? editSkipSupervisor : createSkipSupervisor
    const setSkipSup = isEdit ? setEditSkipSupervisor : setCreateSkipSupervisor
    const skipFrm = isEdit ? editSkipForeman : createSkipForeman
    const setSkipFrm = isEdit ? setEditSkipForeman : setCreateSkipForeman
    const maj = isEdit ? editMajor : createMajor
    const setMaj = isEdit ? setEditMajor : setCreateMajor
    const fir = isEdit ? editFirst : createFirst
    const setFir = isEdit ? setEditFirst : setCreateFirst
    const sec = isEdit ? editSecond : createSecond
    const setSec = isEdit ? setEditSecond : setCreateSecond
    const hel = isEdit ? editHelper : createHelper
    const setHel = isEdit ? setEditHelper : setCreateHelper
    const majC = isEdit ? editMajorCustom : createMajorCustom
    const setMajC = isEdit ? setEditMajorCustom : setCreateMajorCustom
    const firC = isEdit ? editFirstCustom : createFirstCustom
    const setFirC = isEdit ? setEditFirstCustom : setCreateFirstCustom
    const secC = isEdit ? editSecondCustom : createSecondCustom
    const setSecC = isEdit ? setEditSecondCustom : setCreateSecondCustom
    const helC = isEdit ? editHelperCustom : createHelperCustom
    const setHelC = isEdit ? setEditHelperCustom : setCreateHelperCustom
    const memSelected = isEdit ? editMembersSelected : createMembersSelected
    const setMemSelected = isEdit ? setEditMembersSelected : setCreateMembersSelected
    const indirectSelected = isEdit ? editIndirectSelected : createIndirectSelected
    const setIndirectSelected = isEdit ? setEditIndirectSelected : setCreateIndirectSelected
    const multiAssignOverrides = isEdit ? editMultiAssignOverrides : createMultiAssignOverrides
    const setMultiAssignOverrides = isEdit ? setEditMultiAssignOverrides : setCreateMultiAssignOverrides
    const candidatesQuery = isEdit ? editCandidatesQuery : createCandidatesQuery
    const setCandidatesQuery = isEdit ? setEditCandidatesQuery : setCreateCandidatesQuery
    const touchedSup = isEdit ? editSupervisorsTouched : createSupervisorsTouched
    const setTouchedSup = isEdit ? setEditSupervisorsTouched : setCreateSupervisorsTouched
    const touchedFrm = isEdit ? editForemenTouched : createForemenTouched
    const setTouchedFrm = isEdit ? setEditForemenTouched : setCreateForemenTouched
    const touchedMem = isEdit ? editMembersTouched : createMembersTouched
    const setTouchedMem = isEdit ? setEditMembersTouched : setCreateMembersTouched
    const turnoIdsForDate = new Set((turnoIdsByDate[workDate] || []).map(String))
    const blockedDisciplineTokens = new Set(['bodega', 'calidad', 'hsec', 'oficinatecnica', 'rrll', 'terreno'])
    const normalizeDisciplineToken = (value: any) =>
      normalizeStr(String(value || '')).replace(/[^a-z0-9]/g, '')
    const isRiggerCandidate = (item: any) => {
      const posNorm = normalizeStr(String(item?.position || item?.posicion || ''))
      const specNorm = normalizeStr(String(item?.specialty || item?.specialidad || ''))
      return posNorm.includes('rigger') || specNorm.includes('rigger')
    }
    const isMaintenanceIndirect = (item: any) => {
      const posNorm = normalizeStr(String(item?.position || item?.posicion || ''))
      const workerTypeNorm = normalizeStr(String(item?.worker_type || item?.tipo_trabajador || ''))
      return (
        (posNorm.includes('mecanico mantencion') || posNorm.includes('electrico mantencion')) &&
        workerTypeNorm.includes('indirect')
      )
    }
    const isBlockedDiscipline = (item: any) => {
      const posNormBase = normalizeStr(String(item?.position || item?.posicion || ''))
      const isRiskPreventionRole =
        posNormBase.includes('prevencionista') ||
        posNormBase.includes('prevencion de riesgos') ||
        posNormBase.includes('prevencion riesgos')
      const isHiddenAdminPosition =
        posNormBase.includes('encargado de relaciones laborales') ||
        posNormBase.includes('encargado relaciones laborales') ||
        posNormBase.includes('jefe de terreno') ||
        posNormBase.includes('jefe terreno') ||
        posNormBase.includes('coordinador logistico') ||
        posNormBase.includes('encargado medio ambiente') ||
        posNormBase.includes('jefe de prevencion') ||
        posNormBase.includes('jefe prevencion')
      if (isHiddenAdminPosition) return true
      if (isRiskPreventionRole) return false
      if (posNormBase.includes('topografo') || posNormBase.includes('alarife') || posNormBase.includes('nivelador') || isRiggerCandidate(item)) return false
      if (isMaintenanceIndirect(item)) return false
      const specialtyRaw = String(item?.specialty || item?.specialidad || '').trim()
      const positionRaw = String(item?.position || item?.posicion || '').trim()
      const specToken = normalizeDisciplineToken(specialtyRaw)
      const posToken = normalizeDisciplineToken(positionRaw)
      if ([...blockedDisciplineTokens].some(t => specToken.includes(t))) return true
      if ([...blockedDisciplineTokens].some(t => posToken.includes(t))) return true
      return false
    }
    const isInTurnoForDate = (c: any) => {
      const ids = [
        String(c?.id || '').trim(),
        String(c?.user_id || '').trim(),
        String(c?.collaborator_id || '').trim()
      ].filter(Boolean)
      return ids.some((id) => turnoIdsForDate.has(String(id)))
    }
    const candidatesSource = (collaborators || []).filter((c: any) => {
      const id = String(c?.id || '').trim()
      if (!id) return false
      if (!isInTurnoForDate(c)) return false
      if (isBlockedDiscipline(c)) return false
      return true
    })
    const isFieldBossPosition = (position: any) => {
      const p = normalizeStr(String(position || ''))
      if (!p) return false
      return p.includes('jefe de terreno') || p.includes('jefe terreno')
    }
    const turnoCandidates = (collaborators || []).filter((c: any) => {
      const id = String(c?.id || '').trim()
      if (!id) return false
      if (!turnoIdsForDate.has(id)) return false
      return isFieldBossPosition(c?.position || c?.posicion)
    }).sort((a: any, b: any) => {
      const la = `${String(a?.last_name || '').trim()} ${String(a?.first_name || '').trim()}`.trim()
      const lb = `${String(b?.last_name || '').trim()} ${String(b?.first_name || '').trim()}`.trim()
      return la.localeCompare(lb, 'es')
    })
    const isTurnoLoading = !!turnoLoadingByDate[workDate]
    const preferredDiscipline = normalizeStr(selSpecialty || '')

    const getCandidateDisciplineLabel = (item: any) => {
      const raw = String(item?.specialty || item?.specialidad || '').trim()
      return raw ? formatDisciplineLabel(raw) : 'Sin disciplina'
    }

    const groupCandidatesByDiscipline = (items: any[]) => {
      const grouped = new Map<string, any[]>()
      ;(items || []).forEach((item: any) => {
        const label = getCandidateDisciplineLabel(item)
        if (!grouped.has(label)) grouped.set(label, [])
        grouped.get(label)!.push(item)
      })
      const keys = Array.from(grouped.keys()).sort((a, b) => {
        const aIsPreferred = normalizeStr(a) === preferredDiscipline
        const bIsPreferred = normalizeStr(b) === preferredDiscipline
        if (aIsPreferred && !bIsPreferred) return -1
        if (!aIsPreferred && bIsPreferred) return 1
        return a.localeCompare(b, 'es')
      })
      return keys.map((key) => {
        const arr = (grouped.get(key) || []).slice().sort((a: any, b: any) => {
          const la = ((a.last_name || '') + ' ' + (a.first_name || '')).trim()
          const lb = ((b.last_name || '') + ' ' + (b.first_name || '')).trim()
          return la.localeCompare(lb, 'es')
        })
        return { key, items: arr }
      })
    }

    const currentCrewId = String(editingId || (editingCrew as any)?.id || (editingCrew as any)?.crew_id || '')
    const assignedCrewNamesByIdentity = buildAssignedCrewNamesByIdentity(crews || [], workDate, isEdit ? currentCrewId : null)
    const getAssignedCrewsForCandidate = (itemOrId: any) => {
      const item = typeof itemOrId === 'object'
        ? itemOrId
        : (collaborators || []).find((c: any) => String(c?.id || '') === String(itemOrId)) || { id: itemOrId }
      const names = getCollaboratorIdentityKeys(item).flatMap((key) => assignedCrewNamesByIdentity.get(key) || [])
      return Array.from(new Set(names))
    }
    const isBlockedByOtherCrew = (itemOrId: any) => getAssignedCrewsForCandidate(itemOrId).length > 0

    const renderDisciplineGroupedList = (
      items: any[],
      selected: string[],
      onToggle: (id: string) => void,
      keyPrefix: string
    ) => {
      const groups = groupCandidatesByDiscipline(items)
      return groups.map((group, gIdx) => (
        <Box key={`${keyPrefix}-group-${group.key}-${gIdx}`} sx={{ mb: 1.25 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#475569', mb: 0.5 }}>
            {toDisplayUpper(group.key)}
          </Typography>
          {group.items.map((c: any, idx: number) => {
            const idStr = String(c.id)
            const checked = selected.includes(idStr)
            const lockedByOtherCrew = isBlockedByOtherCrew(c)
            const isOverrideEnabled = multiAssignOverrides.has(idStr)
            const assignedCrews = getAssignedCrewsForCandidate(c).slice().sort((a, b) =>
              String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' })
            )
            const assignmentMsg = assignedCrews.length
              ? `${checked ? 'También asignado a' : 'Asignado a'}:\n${assignedCrews.join('\n')}`
              : ''
            return (
              <FormControlLabel
                key={`${keyPrefix}-${group.key}-${c.id}-${idx}`}
                sx={{
                  alignItems: 'flex-start',
                  width: '100%',
                  mx: 0,
                  my: 0,
                  px: 0.5,
                  py: 0.75,
                  borderBottom: idx < group.items.length - 1 ? '1px solid #e5e7eb' : 'none',
                  '.MuiFormControlLabel-label': { width: '100%', minWidth: 0 }
                }}
                control={<Checkbox checked={checked} disabled={lockedByOtherCrew && !checked && !isOverrideEnabled} onChange={() => onToggle(idStr)} />}
                label={
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: 600,
                        width: '100%',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block'
                      }}
                      title={formatCollaboratorName(c.first_name, c.last_name)}
                    >
                      {formatCollaboratorName(c.first_name, c.last_name)}
                    </span>
                    <small
                      style={{
                        color: '#666',
                        marginTop: 2,
                        width: '100%',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block'
                      }}
                      title={formatPositionLabel(c.position || '')}
                    >
                      {formatPositionLabel(c.position || '')}
                    </small>
                    {assignmentMsg ? (
                      <small
                        style={{
                          color: '#b45309',
                          marginTop: 2,
                          width: '100%',
                          whiteSpace: 'pre-line',
                          display: 'block'
                        }}
                        title={assignmentMsg}
                      >
                        {assignmentMsg}
                      </small>
                    ) : null}
                    {assignmentMsg ? (
                      <FormControlLabel
                        sx={{ mt: 0.25, ml: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={isOverrideEnabled}
                            onChange={(e) => {
                              const enabled = e.target.checked
                              setMultiAssignOverrides((prev) => {
                                const next = new Set(Array.from(prev || []).map(String))
                                if (enabled) next.add(idStr)
                                else next.delete(idStr)
                                return next
                              })
                            }}
                          />
                        }
                        label={
                          <span style={{ fontSize: 12, color: '#92400e' }}>
                            Permitir en esta cuadrilla
                          </span>
                        }
                      />
                    ) : null}
                  </div>
                }
              />
            )
          })}
        </Box>
      ))
    }

    // When editing, get role-specific assigned IDs from the loaded crew to avoid showing duplicates
    const getRoleAssignedIds = (role: 'supervisor' | 'foreman' | 'member') => {
      if (!isEdit || !editingCrew) return [] as string[]
      const getArr = (keyA: string, keyB?: string) => {
        const val = (editingCrew as any)[keyA] ?? (keyB ? (editingCrew as any)[keyB] : undefined)
        if (!val) return [] as string[]
        if (Array.isArray(val)) return val.map((x: any) => String(x))
        return [String(val)]
      }
      if (role === 'supervisor') return getArr('supervisors', 'supervisor')
      if (role === 'foreman') return getArr('foremen', 'foreman')
      return getArr('members', 'member')
    }

    // Simple independent togglers - each role is independent
    const toggleSupLocal = (id: string) => {
      const sid = String(id)
      const selectedNow = (supSelected || []).map(String).includes(sid)
      if (selectedNow) {
        setSupSelected(prev => (prev || []).map(String).filter(x => x !== sid))
        return
      }
      const candidate = (collaborators || []).find((c: any) => String(c?.id || '') === sid) || { id: sid }
      if (!multiAssignOverrides.has(sid) && isBlockedByOtherCrew(candidate)) {
        const msg = getAssignedCrewsForCandidate(candidate)
          .slice()
          .sort((a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' }))
          .join('\n')
        alert(`Este trabajador pertenece a otra cuadrilla: ${msg}`)
        return
      }
      setSupSelected(prev => {
        const s = (prev || []).map(String)
        return [...s, sid]
      })
    }
    const toggleFrmLocal = (id: string) => {
      const sid = String(id)
      const selectedNow = (frmSelected || []).map(String).includes(sid)
      if (selectedNow) {
        setFrmSelected(prev => (prev || []).map(String).filter(x => x !== sid))
        return
      }
      const candidate = (collaborators || []).find((c: any) => String(c?.id || '') === sid) || { id: sid }
      if (!multiAssignOverrides.has(sid) && isBlockedByOtherCrew(candidate)) {
        const msg = getAssignedCrewsForCandidate(candidate)
          .slice()
          .sort((a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' }))
          .join('\n')
        alert(`Este trabajador pertenece a otra cuadrilla: ${msg}`)
        return
      }
      setFrmSelected(prev => {
        const s = (prev || []).map(String)
        return [...s, sid]
      })
    }
    const toggleMemLocal = (id: string) => {
      const sid = String(id)
      const selectedNow = (memSelected || []).map(String).includes(sid)
      if (selectedNow) {
        setMemSelected(prev => (prev || []).map(String).filter(x => x !== sid))
        return
      }
      const candidate = (collaborators || []).find((c: any) => String(c?.id || '') === sid) || { id: sid }
      if (!multiAssignOverrides.has(sid) && isBlockedByOtherCrew(candidate)) {
        const msg = getAssignedCrewsForCandidate(candidate)
          .slice()
          .sort((a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' }))
          .join('\n')
        alert(`Este trabajador pertenece a otra cuadrilla: ${msg}`)
        return
      }
      setMemSelected(prev => {
        const s = (prev || []).map(String)
        return [...s, sid]
      })
    }
    const toggleIndirectLocal = (id: string) => {
      const sid = String(id)
      const selectedNow = (indirectSelected || []).map(String).includes(sid)
      if (selectedNow) {
        setIndirectSelected(prev => (prev || []).map(String).filter(x => x !== sid))
        return
      }
      const candidate = (collaborators || []).find((c: any) => String(c?.id || '') === sid) || { id: sid }
      if (!multiAssignOverrides.has(sid) && isBlockedByOtherCrew(candidate)) {
        const msg = getAssignedCrewsForCandidate(candidate)
          .slice()
          .sort((a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' }))
          .join('\n')
        alert(`Este trabajador pertenece a otra cuadrilla: ${msg}`)
        return
      }
      setIndirectSelected(prev => {
        const s = (prev || []).map(String)
        return [...s, sid]
      })
    }

    // Precompute candidate lists so we can decide visibility of role columns
    const isCrewSupportPosition = (item: any) => {
      const posNorm = normalizeStr(item?.position || item?.posicion || '')
      return posNorm.includes('topografo') || posNorm.includes('alarife') || posNorm.includes('nivelador')
    }
    const isIndirectCandidate = (item: any) => {
      if (isCrewSupportPosition(item)) return true
      const posNorm = normalizeStr(item?.position || item?.posicion || '')
      const specNorm = normalizeStr(item?.specialty || item?.specialidad || '')
      const workerTypeNorm = normalizeStr(item?.worker_type || item?.tipo_trabajador || '')
      if (posNorm.includes('administrador de contrato')) return false
      if (posNorm.includes('supervisor')) return false
      if (categorizePosition(item?.position || item?.posicion || '') === 'supervisor') return false
      if (categorizePosition(item?.position || item?.posicion || '') === 'foreman') return false
      if (posNorm.includes('mecanico mantencion')) return true
      if (posNorm.includes('electrico mantencion')) return true
      if (posNorm.includes('indirect')) return true
      if (specNorm.includes('indirect')) return true
      if (workerTypeNorm.includes('indirect')) return true
      return false
    }
    const supCandidates = getCandidatesForRole(supSelected, pos => categorizePosition(pos) === 'supervisor', selSpecialty, candidatesSource)
    const frmCandidates = getCandidatesForRole(frmSelected, pos => categorizePosition(pos) === 'foreman', selSpecialty, candidatesSource)
    const indirectCandidatesRaw = getCandidatesForRole(indirectSelected, () => true, selSpecialty, candidatesSource)
      .filter((c: any) => isIndirectCandidate(c))
    // Compute raw member candidates then exclude any supervisors/foremen by id or by misclassified position
    const memCandidatesRaw = getCandidatesForRole(memSelected, pos => {
      const role = categorizePosition(pos)
      return role === 'member'
    }, selSpecialty, candidatesSource)
    const supIds = new Set((supCandidates || []).map((c: any) => String(c.id)))
    const frmIds = new Set((frmCandidates || []).map((c: any) => String(c.id)))
    const memCandidates = (memCandidatesRaw || []).filter((c: any) => {
      const id = String(c.id)
      if (supIds.has(id) || frmIds.has(id)) return false
      if ((indirectCandidatesRaw || []).some((x: any) => String(x.id) === id)) return false
      if (isCrewSupportPosition(c)) return false
      const posNorm = normalizeStr(c.position || c.posicion || '')
      const specNorm = normalizeStr(c.specialty || c.specialidad || '')
      const workerTypeNorm = normalizeStr(c.worker_type || c.tipo_trabajador || '')
      if (posNorm.includes('rigger') || specNorm.includes('rigger')) return categorizePosition(c.position || '') === 'member'
      if (posNorm.includes('administrador')) return false
      if (specNorm.includes('administrador')) return false
      return categorizePosition(c.position || '') === 'member'
    })

    const queryNorm = normalizeStr(candidatesQuery || '')
    const matchesQuery = (c: any) => {
      if (!queryNorm) return true
      const haystack = [
        String(c?.first_name || ''),
        String(c?.last_name || ''),
        String(c?.document || ''),
        String(c?.position || c?.posicion || ''),
        String(c?.specialty || c?.specialidad || ''),
        String(c?.email || '')
      ].map(normalizeStr).join(' ')
      return haystack.includes(queryNorm)
    }
    const filterRoleList = (items: any[], selectedIds: string[]) => {
      if (!queryNorm) return items
      const selectedSet = new Set((selectedIds || []).map(String))
      return (items || []).filter((c: any) => selectedSet.has(String(c.id)) || matchesQuery(c))
    }
    const supCandidatesFiltered = filterRoleList(supCandidates, supSelected)
    const frmCandidatesFiltered = filterRoleList(frmCandidates, frmSelected)
    const indirectCandidatesFiltered = filterRoleList(indirectCandidatesRaw, indirectSelected)
    const memCandidatesFiltered = filterRoleList(memCandidates, memSelected)
    const getRoleStats = (items: any[]) => {
      const occupied = (items || []).filter((c: any) => isBlockedByOtherCrew(c)).length
      const available = Math.max(0, (items || []).length - occupied)
      return { available, occupied }
    }
    const supStats = getRoleStats(supCandidates)
    const frmStats = getRoleStats(frmCandidates)
    const indirectStats = getRoleStats(indirectCandidatesRaw)
    const memStats = getRoleStats(memCandidates)

    // No cross-role filtering - each role is completely independent

    return (
      <Box sx={{ mb: 2, p: 2, border: "1px solid #eee", borderRadius: 1 }}>
        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, mt: 1 }}>
          <FormControl fullWidth required={!isEdit} error={!isEdit && createFieldBossAttempted && !fieldBossId}>
            <InputLabel id={`field-boss-label-${mode}`}>Jefe de Terreno</InputLabel>
            <Select
              labelId={`field-boss-label-${mode}`}
              value={fieldBossId}
              label="Jefe de Terreno"
              onChange={(e) => {
                const value = String(e.target.value || '')
                setFieldBossId(value)
                if (!isEdit && value) setCreateFieldBossAttempted(false)
              }}
            >
              <MenuItem value="">Sin asignar</MenuItem>
              {turnoCandidates.map((c: any) => {
                const cid = String(c.id)
                return (
                  <MenuItem key={`boss-${mode}-${cid}`} value={cid}>
                    {formatCollaboratorName(c.first_name, c.last_name)}
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="specialty-label">Especialidad</InputLabel>
            <Select
              labelId="specialty-label"
              value={specialtySelectValue}
              label="Especialidad"
              renderValue={(v) => toDisplayUpper(formatDisciplineLabel(v))}
              onChange={e => {
                const v = String(e.target.value)
                setSelSpecialty(v === 'ALL' ? 'ALL' : v)
              }}
            >
              <MenuItem value="ALL">Todas</MenuItem>
              {(specialtyOptions || []).map(s => (
                <MenuItem key={s} value={s}>{toDisplayUpper(formatDisciplineLabel(s))}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id={`crew-front-name-label-${mode}`}>Nombre</InputLabel>
            <Select
              labelId={`crew-front-name-label-${mode}`}
              value={frontSelectValue}
              label="Nombre"
              disabled={reportFrontsLoading || reportFrontOptions.length === 0}
              displayEmpty
              renderValue={(value) => {
                const frontBase = String(value || '').trim()
                if (!frontBase) return ''
                return name || getNextCrewNameForFront(frontBase, workDate, isEdit ? editingId : null)
              }}
              onChange={(e) => {
                const frontBase = String(e.target.value || '').trim()
                setSelectedFrontName(frontBase)
                setName(getNextCrewNameForFront(frontBase, workDate, isEdit ? editingId : null))
              }}
            >
              <MenuItem value="" disabled>
                Seleccione frente/UDR
              </MenuItem>
              {reportFrontOptions.map((front) => (
                <MenuItem key={front.id || front.name} value={front.name}>
                  {front.name.toLocaleUpperCase('es-CL')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Descripción" value={description} onChange={e => setDescription(e.target.value)} fullWidth />
          {isEdit ? (
            <TextField
              label="Fecha de trabajo"
              type="date"
              value={workDate}
              onChange={(e) => updateWorkDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          ) : (
            <Box>
              <Typography sx={{ mb: 0.5, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                Fecha de trabajo
              </Typography>
              <Button
                variant="outlined"
                disabled={attendanceDatesLoading || attendanceWorkDates.length === 0}
                onClick={(e) => setCreateWorkDateAnchorEl(e.currentTarget)}
                fullWidth
                sx={{
                  justifyContent: 'flex-start',
                  minHeight: 56,
                  px: 1.75,
                  borderColor: '#cbd5e1',
                  color: workDate ? '#0f172a' : '#64748b',
                  fontSize: '1rem',
                  fontWeight: 400,
                  lineHeight: 1.4375,
                  textAlign: 'left',
                  textTransform: 'none',
                  '&:hover': { borderColor: colors.blue6, bgcolor: '#f8fbff' }
                }}
              >
                <span>{attendanceDatesLoading ? 'Cargando fechas...' : (workDate ? formatDateLabel(workDate) : 'Sin fechas de asistencia')}</span>
              </Button>
              <Popover
                open={Boolean(createWorkDateAnchorEl)}
                anchorEl={createWorkDateAnchorEl}
                onClose={() => setCreateWorkDateAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              >
                <DateCalendar
                  value={parseYmdToDate(workDate)}
                  minDate={parseYmdToDate(minAttendanceWorkDate) || undefined}
                  maxDate={parseYmdToDate(maxAttendanceWorkDate) || undefined}
                  onChange={(next) => {
                    const ymd = dateToYmd(next as Date | null)
                    if (!ymd || !attendanceWorkDateSet.has(ymd)) return
                    updateWorkDate(ymd)
                    setCreateWorkDateAnchorEl(null)
                  }}
                  shouldDisableDate={(day) => !attendanceWorkDateSet.has(dateToYmd(day as Date))}
                />
              </Popover>
            </Box>
          )}
          <Typography sx={{ gridColumn: '1/-1', fontSize: 12, color: '#64748b' }}>
            {isTurnoLoading
              ? 'Cargando colaboradores en turno para la fecha seleccionada...'
              : hasValidCreateWorkDate
                ? `Colaboradores en turno para ${formatDateLabel(workDate)}: ${turnoIdsForDate.size}`
                : 'Seleccione una fecha existente en asistencia para cargar colaboradores en turno.'}
          </Typography>
          <TextField
            label="Buscar colaborador"
            value={candidatesQuery}
            onChange={(e) => setCandidatesQuery(e.target.value)}
            placeholder="Nombre, documento, cargo, especialidad o correo"
            fullWidth
            sx={{ gridColumn: '1/-1', mb: 1.5 }}
          />
          {!isEdit && (
            (() => {
              const canLateOverride = latePolicy.allowByUser
              if (chileHour < cutoffHour || workDate !== chileToday) return null
              if (!canLateOverride) {
                return (
                  <Typography sx={{ gridColumn: '1/-1', fontSize: 12, color: colors.gray4 }}>
                    No tienes permiso para excepción de creación fuera de horario.
                  </Typography>
                )
              }
              return (
                <FormControlLabel
                  sx={{ gridColumn: '1/-1' }}
                  control={<Checkbox checked={createLateOverride} onChange={(e) => setCreateLateOverride(e.target.checked)} />}
                  label="Crear excepcionalmente para hoy (después de las 13:00)"
                />
              )
            })()
          )}
          {(isEdit || hasFieldBossSelected) ? (
            <>
              <Box sx={{ gridColumn: '1/-1', display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
                {/* Supervisores */}
                <Box>
                  <Typography sx={{ mb: 1, px: 1.25, py: 0.75, borderRadius: 1, border: `1px solid ${colors.gray8}`, bgcolor: colors.gray10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <span>Supervisores</span>
                    <span style={{ fontWeight: 400, color: colors.gray6, fontSize: 12 }}>
                      Elegibles: {supStats.available} | Ocupados: {supStats.occupied}
                    </span>
                  </Typography>
                  <FormGroup>
                    {(() => {
                      const list = supCandidatesFiltered
                      if (list.length === 0) return <Typography color="text.secondary">No hay supervisores disponibles.</Typography>
                      return renderDisciplineGroupedList(list, supSelected, toggleSupLocal, 'sup')
                    })()}
                  </FormGroup>
                  <Button sx={{ mt: 1 }} onClick={() => setSkipSup(true)}>Omitir</Button>
                </Box>

                {/* Capataces */}
                <Box>
                  <Typography sx={{ mb: 1, px: 1.25, py: 0.75, borderRadius: 1, border: `1px solid ${colors.gray8}`, bgcolor: colors.gray10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <span>Capataces</span>
                    <span style={{ fontWeight: 400, color: colors.gray6, fontSize: 12 }}>
                      Elegibles: {frmStats.available} | Ocupados: {frmStats.occupied}
                    </span>
                  </Typography>
                  {(skipSup || supSelected.length > 0) ? (
                    <>
                      <FormGroup>
                        {(() => {
                          const list = frmCandidatesFiltered
                          if (list.length === 0) return <Typography color="text.secondary">No hay capataces disponibles.</Typography>
                          return renderDisciplineGroupedList(list, frmSelected, toggleFrmLocal, 'frm')
                        })()}
                      </FormGroup>
                      <Button sx={{ mt: 1 }} onClick={() => setSkipFrm(true)}>Omitir</Button>
                      <Box sx={{ mt: 2 }}>
                        <Typography sx={{ mb: 1, px: 1.25, py: 0.75, borderRadius: 1, border: `1px solid ${colors.gray8}`, bgcolor: colors.gray10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                          <span>Indirectos</span>
                          <span style={{ fontWeight: 400, color: colors.gray6, fontSize: 12 }}>
                            Elegibles: {indirectStats.available} | Ocupados: {indirectStats.occupied}
                          </span>
                        </Typography>
                        <FormGroup>
                          {(() => {
                            const list = indirectCandidatesFiltered
                            if (list.length === 0) return <Typography color="text.secondary">No hay indirectos disponibles.</Typography>
                            return renderDisciplineGroupedList(list, indirectSelected, toggleIndirectLocal, 'ind')
                          })()}
                        </FormGroup>
                      </Box>
                    </>
                  ) : (
                    <Typography color="text.secondary">Seleccione al menos un supervisor o presione "Omitir" para continuar.</Typography>
                  )}
                </Box>

                {/* Colaboradores */}
                <Box>
                  <Typography sx={{ mb: 1, px: 1.25, py: 0.75, borderRadius: 1, border: `1px solid ${colors.gray8}`, bgcolor: colors.gray10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <span>Colaboradores</span>
                    <span style={{ fontWeight: 400, color: colors.gray6, fontSize: 12 }}>
                      Elegibles: {memStats.available} | Ocupados: {memStats.occupied}
                    </span>
                  </Typography>
                  {(skipFrm || frmSelected.length > 0) ? (
                    <FormGroup>
                      {(() => {
                        const list = memCandidatesFiltered
                        if (list.length === 0) return <Typography color="text.secondary">No hay colaboradores disponibles.</Typography>
                        return renderDisciplineGroupedList(list, memSelected, toggleMemLocal, 'mem')
                      })()}
                    </FormGroup>
                  ) : (
                    <Typography color="text.secondary">Seleccione al menos un capataz o presione "Omitir" para continuar.</Typography>
                  )}
                </Box>
              </Box>
            </>
          ) : (
            <Typography sx={{ gridColumn: '1/-1', fontSize: 12, color: colors.gray4 }}>
              Seleccione Jefe de Terreno para habilitar supervisores, capataces y colaboradores.
            </Typography>
          )}
        </Box>
      </Box>
    )
  }

  const toggleSelection = (id: string, arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, setTouched?: (v: boolean) => void) => {
    if (!id) return
    if (setTouched) setTouched(true)
    setArr(prev => {
      const as = (prev || [])
      if (as.map(String).includes(String(id))) return as.filter(x => String(x) !== String(id))
      return [...as, String(id)]
    })
  }

  const getCandidatesForRole = (selectedIds: string[], roleFilter: (pos: string) => boolean, specialty?: string | null, source?: any[]) => {
    const pool = source || collaborators || []
    void specialty

    const filtered = pool.filter(c => {
      const posVal = (c.position || '')
      const matchesRole = roleFilter(normalizeStr(posVal))
      if (!matchesRole) return false
      return true
    })
    // Sort alphabetically by last_name then first_name for stable display
    filtered.sort((a: any, b: any) => {
      const la = ((a.last_name || '') + ' ' + (a.first_name || '')).trim()
      const lb = ((b.last_name || '') + ' ' + (b.first_name || '')).trim()
      return la.localeCompare(lb)
    })
    
    const filteredIds = filtered.map(f => String(f.id))
    const filteredIdSet = new Set(filteredIds)
    const selectedIdsStr = (selectedIds || []).map(id => String(id))
    const selectedInPool = selectedIdsStr.filter((id) => filteredIdSet.has(id))
    // Place explicitly-selected ids first, then the rest of matching candidates
    const ids = Array.from(new Set([...(selectedInPool), ...(filteredIds)]))
    return ids.map(id => {
      const c = pool.find(x => String(x.id) === id)
      if (c) return c
      return { id, first_name: `ID:${id}`, last_name: '', position: '' }
    })
  }

  const categorizePosition = (pos: string) => {
    const p = (pos || '').toLowerCase()
    if (!p) return 'member'
    if (p.includes('topografo') || p.includes('alarife') || p.includes('rigger')) return 'member'
    // Keep maintenance roles as collaborators (members)
    if (p.includes('mecanico mantencion') || p.includes('electrico mantencion')) return 'member'
    // Check more specific foreman terms first to avoid misclassification with generic substrings
    if (p.includes('capataz') || p.includes('encargado') || p.includes('foreman')) return 'foreman'
    if (p.includes('supervisor') || p.includes('jefe') || p.includes('coordinador')) return 'supervisor'
    // common worker roles
    if (/maestro|maestra|ayudante|helper|operador|operadora|operario|operaria|peon|obrero|trabajador/.test(p)) return 'member'
    // fallback: if contains senior roles treat as supervisor, otherwise member
    if (p.includes('senior') || p.includes('lead')) return 'supervisor'
    return 'member'
  }

  const normalizeStr = (s: string | null | undefined) => {
    if (!s) return ''
    try {
      // remove diacritics and lower-case
      return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
    } catch (e) {
      // Fallback for environments without String.prototype.normalize or without Unicode property escapes
      if (typeof (String.prototype as any).normalize === 'function') {
        try {
          return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        } catch {
          return String(s).toLowerCase().trim()
        }
      }
      return String(s).toLowerCase().trim()
    }
  }

  const toId = (v: any) => {
    if (v == null) return String(v)
    if (typeof v === 'object') {
      if ('id' in v) return String((v as any).id)
      try { return String(v) } catch { return JSON.stringify(v) }
    }
    return String(v)
  }

  const normalizeList = (arr: any[] | undefined | null) => (arr || []).map(toId)

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  const getCrewNameBase = (name: any) =>
    String(name || '').trim().replace(/^Cuadrilla\s*\d+\s+/i, '').trim()

  const getNextCrewNumberForNameBase = (baseName: string, workDate?: string, excludeCrewId?: string | null) => {
    const base = String(baseName || '').trim()
    if (!base) return 1
    const re = new RegExp(`^Cuadrilla\\s*(\\d+)\\s+${escapeRegex(base)}$`, 'i')
    let max = 0
    for (const c of crews || []) {
      if (excludeCrewId && String(c?.id || '') === String(excludeCrewId)) continue
      const cWorkDate = String(c?.work_date || '').trim()
      if (workDate && cWorkDate && cWorkDate !== String(workDate).trim()) continue
      const name = (c && c.name) ? String(c.name).trim() : ''
      const m = name.match(re)
      if (m && m[1]) {
        const n = parseInt(m[1], 10)
        if (!isNaN(n) && n > max) max = n
      }
    }
    return max + 1
  }

  const getNextCrewNameForFront = (frontName: string, workDate?: string, excludeCrewId?: string | null) => {
    const base = String(frontName || '').trim()
    if (!base) return ''
    const n = getNextCrewNumberForNameBase(base, workDate, excludeCrewId)
    return `CUADRILLA ${n} ${base.toLocaleUpperCase('es-CL')}`.trim()
  }

  const getNextCrewNameForSpecialty = (spec: string, workDate?: string) => {
    return getNextCrewNameForFront(spec, workDate)
  }
  const getRenamedCrewNameForSpecialty = (spec: string, workDate?: string, excludeCrewId?: string | null) => {
    return getNextCrewNameForFront(spec, workDate, excludeCrewId)
  }

  const handleSaveCrew = async () => {
    if (!canManageCrews) return
    const isEdit = Boolean(editingId)
    // pick the right vectors depending on mode
    // Asegurar que solo se envíen arrays de strings (IDs)
    const toIdArray = (arr: any[]) => (arr || []).map(x => (typeof x === 'object' && x !== null && 'id' in x) ? String(x.id) : String(x))
    const selSupervisors = toIdArray(isEdit ? editSupervisorsSelected : createSupervisorsSelected)
    const selForemen = toIdArray(isEdit ? editForemenSelected : createForemenSelected)
    const selMembers = toIdArray(isEdit ? editMembersSelected : createMembersSelected)
    const selIndirect = toIdArray(isEdit ? editIndirectSelected : createIndirectSelected)
    const selSkipSupervisor = isEdit ? editSkipSupervisor : createSkipSupervisor
    const selSkipForeman = isEdit ? editSkipForeman : createSkipForeman
    const selSelectedSpecialty = isEdit ? editSelectedSpecialty : createSelectedSpecialty
    const selSelectedFrontName = isEdit ? editSelectedFrontName : createSelectedFrontName
    const selName = isEdit ? fName : createFName
    const selDescription = isEdit ? fDescription : createFDescription
    const selWorkDate = isEdit ? editWorkDate : createWorkDate
    const selFieldBossId = isEdit ? editFieldBossId : createFieldBossId
    const selMultiAssignOverrides = isEdit ? editMultiAssignOverrides : createMultiAssignOverrides
    if (!isEdit && !String(selFieldBossId || '').trim()) {
      setCreateFieldBossAttempted(true)
      alert('Seleccione Jefe de Terreno')
      return
    }
    if (!isEdit && !String(selWorkDate || '').trim()) {
      alert('Seleccione una fecha de trabajo con asistencia registrada')
      return
    }
    if (!isEdit && !attendanceWorkDates.includes(String(selWorkDate || '').trim())) {
      alert('Seleccione una fecha existente en asistencia')
      return
    }
    const existingIdentityKeysInEditedCrew = (() => {
      if (!isEdit || !editingCrew) return new Set<string>()
      const collaboratorById = new Map((collaborators || []).map((c: any) => [String(c?.id || ''), c]))
      return new Set<string>(
        readCrewAssignedIds(editingCrew).flatMap((id) =>
          getCollaboratorIdentityKeys(collaboratorById.get(String(id)) || { id })
        )
      )
    })()

    const currentCrewId = String(editingId || (editingCrew as any)?.id || (editingCrew as any)?.crew_id || '')
    const assignedCrewNamesByIdentity = buildAssignedCrewNamesByIdentity(crews || [], selWorkDate, isEdit ? currentCrewId : null)
    const selectedAll = Array.from(new Set([...selSupervisors, ...selForemen, ...selMembers, ...selIndirect].map(String)))
    const conflicts = selectedAll
      .map((id) => {
        const candidate = (collaborators || []).find((c: any) => String(c?.id || '') === String(id)) || { id }
        const identityKeys = getCollaboratorIdentityKeys(candidate)
        const crewNames = identityKeys.flatMap((key) => assignedCrewNamesByIdentity.get(key) || [])
        return {
          id,
          identityKeys,
          crews: Array.from(new Set(crewNames))
        }
      })
      .filter((x) => x.crews.length > 0)
    const conflictsWithoutOverride = conflicts.filter((c) => {
      const id = String(c.id)
      if (selMultiAssignOverrides.has(id)) return false
      // In edit mode, do not block collaborators that already belonged to this crew.
      if (isEdit && c.identityKeys.some((key) => existingIdentityKeysInEditedCrew.has(key))) return false
      return true
    })
    if (conflictsWithoutOverride.length > 0) {
      const msg = conflictsWithoutOverride
        .slice(0, 8)
        .map((c) => {
          const sortedCrews = (c.crews || [])
            .slice()
            .sort((a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' }))
          return `${c.id}:\n${sortedCrews.join('\n')}`
        })
        .join('\n')
      alert(`No se puede guardar. Hay trabajadores en otras cuadrillas:\n${msg}`)
      return
    }

    // Validate availability and selection of supervisors/capataces
    const turnoIdsForDate = new Set((turnoIdsByDate[selWorkDate] || []).map(String))
    const blockedDisciplineTokens = new Set(['bodega', 'calidad', 'hsec', 'oficinatecnica', 'rrll', 'terreno'])
    const normalizeDisciplineToken = (value: any) =>
      normalizeStr(String(value || '')).replace(/[^a-z0-9]/g, '')
    const isRiggerCandidate = (item: any) => {
      const posNorm = normalizeStr(String(item?.position || item?.posicion || ''))
      const specNorm = normalizeStr(String(item?.specialty || item?.specialidad || ''))
      return posNorm.includes('rigger') || specNorm.includes('rigger')
    }
    const isMaintenanceIndirect = (item: any) => {
      const posNorm = normalizeStr(String(item?.position || item?.posicion || ''))
      const workerTypeNorm = normalizeStr(String(item?.worker_type || item?.tipo_trabajador || ''))
      return (
        (posNorm.includes('mecanico mantencion') || posNorm.includes('electrico mantencion')) &&
        workerTypeNorm.includes('indirect')
      )
    }
    const isBlockedDiscipline = (item: any) => {
      const posNormBase = normalizeStr(String(item?.position || item?.posicion || ''))
      const isRiskPreventionRole =
        posNormBase.includes('prevencionista') ||
        posNormBase.includes('prevencion de riesgos') ||
        posNormBase.includes('prevencion riesgos')
      if (isRiskPreventionRole) return false
      if (posNormBase.includes('topografo') || posNormBase.includes('alarife') || posNormBase.includes('nivelador') || isRiggerCandidate(item)) return false
      if (isMaintenanceIndirect(item)) return false
      const specialtyRaw = String(item?.specialty || item?.specialidad || '').trim()
      const positionRaw = String(item?.position || item?.posicion || '').trim()
      const specToken = normalizeDisciplineToken(specialtyRaw)
      const posToken = normalizeDisciplineToken(positionRaw)
      if ([...blockedDisciplineTokens].some(t => specToken.includes(t))) return true
      if ([...blockedDisciplineTokens].some(t => posToken.includes(t))) return true
      return false
    }
    const isInTurnoForDate = (c: any) => {
      const ids = [
        String(c?.id || '').trim(),
        String(c?.user_id || '').trim(),
        String(c?.collaborator_id || '').trim()
      ].filter(Boolean)
      return ids.some((id) => turnoIdsForDate.has(String(id)))
    }
    const filteredByTurno = (collaborators || []).filter((c: any) => {
      const id = String(c?.id || '').trim()
      if (!id) return false
      if (!isInTurnoForDate(c)) return false
      if (isBlockedDiscipline(c)) return false
      return true
    })
    const availableSup = getCandidatesForRole([], pos => categorizePosition(pos) === 'supervisor', selSelectedSpecialty, filteredByTurno)
    const availableFrm = getCandidatesForRole([], pos => categorizePosition(pos) === 'foreman', selSelectedSpecialty, filteredByTurno)
    if ((availableSup.length === 0) && (availableFrm.length === 0)) {
      alert('No hay supervisores ni capataces disponibles — no se puede crear una cuadrilla sin supervisión.')
      return
    }

    // Allow if user explicitly skipped supervisor or foreman (skip flags) or selected at least one
    if (!((selSupervisors.length > 0) || selSkipSupervisor || (selForemen.length > 0) || selSkipForeman)) {
      alert("Seleccione al menos un Supervisor o un Capataz")
      return
    }

    let finalName = selName
    if (!String(selSelectedFrontName || getCrewNameBase(finalName)).trim()) {
      alert('Seleccione un nombre de frente/UDR para la cuadrilla.')
      return
    }
    if (!isEdit && selSelectedFrontName) {
      finalName = getNextCrewNameForFront(String(selSelectedFrontName), selWorkDate)
      setCreateFName(finalName)
    }

    const members_custom = isEdit ? (editMajorCustom || editFirstCustom || editSecondCustom || editHelperCustom) : (createMajorCustom || createFirstCustom || createSecondCustom || createHelperCustom)

    const payload = {
      name: String(finalName || '').toLocaleUpperCase('es-CL'),
      description: selDescription,
      specialty: selSelectedSpecialty ? String(selSelectedSpecialty).toLocaleUpperCase('es-CL') : null,
      field_boss_id: selFieldBossId || null,
      supervisors: Array.isArray(selSupervisors) ? selSupervisors : [],
      foremen: Array.isArray(selForemen) ? selForemen : [],
      members: Array.from(new Set([...(Array.isArray(selMembers) ? selMembers : []), ...(Array.isArray(selIndirect) ? selIndirect : [])])),
      members_custom: members_custom || null,
      work_date: selWorkDate || null,
      allow_multi_assignment_ids: Array.from(selMultiAssignOverrides).filter((id) => selectedAll.includes(String(id))),
    }

    const { date: chileToday, hour: chileHour } = getChileNowParts()
    const cutoffHour = 13
    if (!selWorkDate) {
      alert('Seleccione Fecha de trabajo')
      return
    }
    // Bloqueo horario desactivado temporalmente por requerimiento:
    // permitir crear cuadrillas para hoy aun después de las 13:00.
    // Mantener lógica para posible reactivación futura.
    // if (!isEdit && selWorkDate === chileToday && chileHour >= cutoffHour) {
    //   const canLateOverride = latePolicy.allowByUser
    //   if (!canLateOverride || !createLateOverride) {
    //     alert('Después de las 13:00 no se puede crear para hoy. Seleccione una fecha futura.')
    //     return
    //   }
    // }

    let res
    if (isEdit && editingId) {
      // saving (PUT)
      res = await fetch(`/api/crews/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    } else {
      // saving (POST)
      res = await fetch("/api/crews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    }

    if (!res.ok) {
      const text = await res.text()
      console.error('Error saving crew', res.status)
      try {
        const json = JSON.parse(text)
        alert('Error guardando cuadrilla: ' + (formatApiError(json?.error) || formatApiError(json) || text))
      } catch (e) {
        alert('Error guardando cuadrilla: ' + text)
      }
      return
    }
    await loadCrews({ force: true })
    try { await refreshAssignedIds() } catch (e) {}
    if (isEdit) {
      setShowEditModal(false)
    } else {
      setShowCreateForm(false)
    }
    resetForm()
  }

  const handleEdit = async (crew: any) => {
    if (!canManageCrews) return
    // Editando cuadrilla
    try {
      await loadCrews({ silent: true, force: true })
    } catch (e) {
      // keep opening with current state if refresh fails
    }
    // fetch latest crew data from server to ensure supervisors/foremen/members fields are present
    try {
      const res = await fetch(`/api/crews/${crew.id}`, { cache: 'no-store' })
      if (res.ok) {
        const latest = await res.json()
        crew = latest || crew
      }
    } catch (e) {
      // ignore, use provided crew
    }
    
    // Store the full crew for direct access in render
    setEditingCrew(crew)

    setEditingId(crew.id)
    setFName(crew.name || "")
    setEditSelectedFrontName(getCrewNameBase(crew.name || ''))
    setFDescription(crew.description || "")
    setEditFieldBossId(String(crew.field_boss_id || crew.jefe_terreno_id || crew.terrain_boss_id || ''))
    setEditWorkDate(crew.work_date || toChileDateKey(crew.created_at) || getChileToday())
    // set specialty if present or try to infer from name e.g. "Cuadrilla 1 Especialidad"
    if (crew.specialty) {
      const fromOptions = (specialtyOptions || []).find((opt) => normalizeStr(opt) === normalizeStr(String(crew.specialty)))
      setEditSelectedSpecialty(fromOptions || String(crew.specialty))
    }
    else if (crew.name) {
      try {
        const m = String(crew.name).trim().match(/^Cuadrilla\s*\d+\s+(.+)$/i)
        if (m && m[1]) setEditSelectedSpecialty(m[1].trim())
      } catch (e) {
        // ignore
      }
    }

    // ensure collaborators are loaded so checkboxes can match ids
    let loadedCollaborators: any[] = []
    try {
      // Fetch all collaborators; occupied ones are handled in UI (disabled + crew label)
      loadedCollaborators = await loadCollaboratorsCached({ force: true, normalizeSpecialty: true })
    } catch (e) {
      loadedCollaborators = collaborators
    }

    // set arrays for supervisors/foremen/members (support legacy single fields)
    const sup = Array.isArray(crew.supervisors) ? crew.supervisors : (crew.supervisor ? [crew.supervisor] : [])
    const frm = Array.isArray(crew.foremen) ? crew.foremen : (crew.foreman ? [crew.foreman] : [])
    const mem = Array.isArray(crew.members) ? crew.members : (crew.member ? [crew.member] : [])

    // Normalize assigned values: support id numbers, id strings, or objects like { id: ... }
    const normalizeAssigned = (arr: any[]) => (arr || []).map(a => {
      if (a == null) return String(a)
      if (typeof a === 'object') {
        if ('id' in a) return String((a as any).id)
        // fallback to JSON string
        try { return String((a as any).toString()) } catch { return JSON.stringify(a) }
      }
      return String(a)
    })

    const supIds = normalizeAssigned(sup)
    const frmIds = normalizeAssigned(frm)
    const memIds = normalizeAssigned(mem)
    // store initial assigned ids for immediate checkbox rendering
    const allAssigned = Array.from(new Set([...(supIds || []), ...(frmIds || []), ...(memIds || [])]))
    setInitialAssigned(new Set(allAssigned))
    // suppressed debug logs for edit flow
    
    // Llenar todos los checkboxes con TODOS los candidatos posibles
    const allSupIds = (loadedCollaborators || [])
      .filter(c => categorizePosition(c.position || '') === 'supervisor')
      .map(c => String(c.id))
    const allFrmIds = (loadedCollaborators || [])
      .filter(c => categorizePosition(c.position || '') === 'foreman')
      .map(c => String(c.id))
    const allMemIds = (loadedCollaborators || [])
      .filter(c => categorizePosition(c.position || '') === 'member')
      .map(c => String(c.id))
    
    // Mark only the currently assigned IDs as checked in edit mode
    const isIndirectMember = (candidate: any) => {
      const posNorm = normalizeStr(candidate?.position || candidate?.posicion || '')
      const specNorm = normalizeStr(candidate?.specialty || candidate?.specialidad || '')
      const workerTypeNorm = normalizeStr(candidate?.worker_type || candidate?.tipo_trabajador || '')
      // Debe coincidir con la lógica visual del editor:
      // TOPÓGRAFO / ALARIFE se muestran en la columna de Indirectos.
      if (posNorm.includes('nivelador')) return true
      if (posNorm.includes('topografo')) return true
      if (posNorm.includes('alarife')) return true
      if (posNorm.includes('mecanico mantencion')) return true
      if (posNorm.includes('electrico mantencion')) return true
      if (posNorm.includes('indirect')) return true
      if (specNorm.includes('indirect')) return true
      if (workerTypeNorm.includes('indirect')) return true
      return false
    }
    const indirectIds = (memIds || []).filter((id) => {
      const c = (loadedCollaborators || []).find((x: any) => String(x.id) === String(id))
      return isIndirectMember(c)
    })
    const regularMemberIds = (memIds || []).filter((id) => !indirectIds.includes(String(id)))
    setEditSupervisorsSelected(supIds)
    setEditForemenSelected(frmIds)
    setEditMembersSelected(regularMemberIds)
    setEditIndirectSelected(indirectIds)

    setEditMajor(crew.major || "")
    setEditFirst(crew.first || "")
    setEditSecond(crew.second || "")
    setEditHelper(crew.helper || "")
    setEditSkipSupervisor(!(sup && sup.length))
    setEditSkipForeman(!(frm && frm.length))
    // ensure create form is closed and assigned ids are refreshed before opening edit
    try { await refreshAssignedIds() } catch (e) {}
    setShowCreateForm(false)
    setShowEditModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!canManageCrews) return
    if (!confirm("¿Eliminar cuadrilla?")) return
    const res = await fetch(`/api/crews/${id}`, { method: "DELETE" })
    if (!res.ok) return alert("Error eliminando cuadrilla")
    await loadCrews({ force: true })
    try { await refreshAssignedIds() } catch (e) {}
  }

  const loadCrews = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const silent = opts?.silent
    if (!silent) setLoading(true)
    try {
      if (opts?.force) crewsInFlightRef.current = null
      if (!crewsInFlightRef.current) {
        crewsInFlightRef.current = (async () => {
          const res = await fetch("/api/crews", { cache: 'no-store' })
          if (!res.ok) return crews
          const data = await res.json()
          return data || []
        })().finally(() => {
          crewsInFlightRef.current = null
        })
      }
      const data = await crewsInFlightRef.current
      setCrews(data || [])
      deriveAssignedIds(data || [])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [crews, deriveAssignedIds])

  useEffect(() => {
    const companyId = String(session?.user?.companyId || '').trim()
    if (!companyId) return
    if (initialLoadCompanyRef.current === companyId) return
    initialLoadCompanyRef.current = companyId

    // fetch specialties (preferred) and collaborators (for candidate lists)
    const fetchData = async () => {
      try {
        let specialtiesFromApi: string[] | null = null
        try {
          const spRes = await fetch('/api/collaborators/specialties')
          if (spRes.ok) {
            const sp = await spRes.json()
            if (Array.isArray(sp)) {
              specialtiesFromApi = sp
              setSpecialtyOptions(sp)
            }
          }
        } catch (e) {
          // ignore — we'll fallback to deriving from collaborators
        }

        // Always load collaborators to populate candidate lists
        try {
          const data = await loadCollaboratorsCached()
          // If specialties endpoint failed, derive list from collaborators as fallback
          if (!specialtiesFromApi) {
            const fromCollab: string[] = Array.from(new Set(((data || []) as any[]).map((c: any) => normalizeText(String((c && c.specialty) || ''))).filter(Boolean)))
            setSpecialtyOptions(fromCollab)
          }
        } catch (e) {
          console.warn('Error fetching collaborators for crews:', e)
        }
      } catch (e) {
        console.warn('Error initializing collaborators/specialties for crews:', e)
      }
    }
    const init = async () => {
      await loadCrews()
      await fetchData()
      await loadExportDates()
    }

    init()
  }, [session?.user?.companyId])

  const refreshAssignedIds = useCallback(async () => {
    deriveAssignedIds(crews || [])
  }, [crews, deriveAssignedIds])

  useEffect(() => { refreshAssignedIds() }, [refreshAssignedIds])

  useEffect(() => {
    const companyId = session?.user?.companyId
    if (!companyId) return
    const channel = supabase
      .channel(`crews-${companyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pr_crews', filter: `company_id=eq.${companyId}` }, async () => {
        await loadCrews({ silent: true })
        await refreshAssignedIds()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pr_crew_activities', filter: `company_id=eq.${companyId}` }, async () => {
        await loadCrews({ silent: true })
        await loadExportDates()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pr_crew_activities', filter: `company_id=eq.${companyId}` }, async () => {
        await loadCrews({ silent: true })
        await loadExportDates()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.companyId, loadCrews, refreshAssignedIds, loadExportDates])

  useEffect(() => {
    const companyId = session?.user?.companyId
    if (!companyId) return
    const tick = async () => {
      await loadCrews({ silent: true })
      await loadExportDates()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    const onFocus = () => tick()

    window.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)

    return () => {
      window.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [session?.user?.companyId, loadCrews, loadExportDates])

  useEffect(() => {
    if (!programDialogOpen) return
    if (programQuery && programQuery.trim().length >= 3) {
      loadProgramActivities(programQuery)
    } else {
      loadProgramActivities()
    }
  }, [programDialogOpen, showAllProgramDisciplines, userSpecialty])

  useEffect(() => {
    const loadMySpecialty = async () => {
      try {
        const meRes = await fetch('/api/collaborators/me')
        if (meRes.ok) {
          const mj = await meRes.json()
          const rawSpec = (mj && mj.collaborator && mj.collaborator.specialty) ? String(mj.collaborator.specialty) : null
          try {
            setUserSpecialty(rawSpec ? normalizeText(rawSpec) : null)
          } catch {
            setUserSpecialty(rawSpec ? String(rawSpec).trim() : null)
          }
        }
      } catch {
        // ignore
      }
    }
    loadMySpecialty()
  }, [])

  const buildProgramUrl = (q?: string) => {
    const params = new URLSearchParams()
    params.set('limit', '200')
    if (q && q.trim()) params.set('q', q.trim())
    if (!showAllProgramDisciplines && userSpecialty) {
      params.set('discipline', userSpecialty)
    }
    return `/api/activities?${params.toString()}`
  }

  const loadProgramActivities = async (q?: string) => {
    try {
      setLoadingProgram(true)
      const res = await fetch(buildProgramUrl(q))
      if (res.ok) {
        const data = await res.json()
        if (q && q.trim().length >= 3) {
          setProgramResults(data || [])
        } else {
          setProgramActivities(data || [])
        }
      }
    } catch (e) {
      console.warn('Could not load program activities', e)
      if (q && q.trim().length >= 3) {
        setProgramResults([])
      }
    } finally {
      setLoadingProgram(false)
    }
  }

  const quickQuantityRaw = String(newActivity.quantity || '').trim()
  const quickQuantityNormalized = quickQuantityRaw.replace(',', '.')
  const quickQuantityParsed = quickQuantityNormalized === '' ? null : Number(quickQuantityNormalized)
  const quickQuantityValid = quickQuantityRaw === '' || (Number.isFinite(quickQuantityParsed) && Number(quickQuantityParsed) >= 0)
  const quickEditQuantityRaw = String(quickEditForm.quantity || '').trim()
  const quickEditQuantityNormalized = quickEditQuantityRaw.replace(',', '.')
  const quickEditQuantityParsed = quickEditQuantityNormalized === '' ? null : Number(quickEditQuantityNormalized)
  const quickEditQuantityValid = quickEditQuantityRaw === '' || (Number.isFinite(quickEditQuantityParsed) && Number(quickEditQuantityParsed) >= 0)
  const normalizeAreaKey = (v: any) => normalizeStr(String(v || '')).replace(/\s+/g, ' ').trim()
  const toCanonicalUnit = (value: any): string => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const k = raw.toLowerCase().replace(/\s+/g, '')
    if (['ml', 'mℓ'].includes(k)) return 'ml'
    if (['l', 'lt', 'lts', 'litro', 'litros'].includes(k)) return 'L'
    if (['gal', 'gln', 'gl', 'galon', 'galones'].includes(k)) return 'gal'
    if (['mm'].includes(k)) return 'mm'
    if (['cm'].includes(k)) return 'cm'
    if (['m', 'mt', 'mts', 'metro', 'metros'].includes(k)) return 'm'
    if (['km', 'kms', 'kilometro', 'kilometros'].includes(k)) return 'km'
    if (['m2', 'mt2', 'mts2', 'm^2'].includes(k)) return 'm2'
    if (['m3', 'mt3', 'mts3', 'm^3'].includes(k)) return 'm3'
    if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(k)) return 'g'
    if (['kg', 'kgr', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(k)) return 'kg'
    if (['ton', 'tn', 't', 'tonelada', 'toneladas'].includes(k)) return 't'
    if (['u', 'un', 'und', 'unidad', 'unidades', 'ea'].includes(k)) return 'un'
    return raw
  }
  const normalizeUnitKey = (v: any) => normalizeStr(toCanonicalUnit(v)).replace(/\s+/g, ' ').trim()

  const openQuickEditDialog = useCallback((activity: any) => {
    if (!activity) return
    if (String(activity?.activity_origin || '').toLowerCase() !== 'crew_created') return
    setQuickEditActivity(activity)
    setQuickEditForm({
      activity: String(activity.activity || '').trim(),
      description: String(activity.description || '').trim(),
      area: String(activity.area || '').trim(),
      discipline: String(activity.discipline || '').trim(),
      unit: String(activity.unit || '').trim(),
      quantity: activity.quantity == null ? '' : String(activity.quantity)
    })
    setQuickEditOpen(true)
  }, [])

  const closeQuickEditDialog = useCallback(() => {
    if (quickEditSaving) return
    setQuickEditOpen(false)
    setQuickEditActivity(null)
    setQuickEditForm({
      activity: '',
      description: '',
      area: '',
      discipline: '',
      unit: '',
      quantity: ''
    })
  }, [quickEditSaving])

  const applyEditedActivityLocally = useCallback((edited: any) => {
    const apply = (rows: any[]) =>
      (rows || []).map((row: any) => String(row?.id) === String(edited?.id) ? { ...row, ...edited } : row)
    setProgramActivities((prev) => apply(prev))
    setProgramResults((prev) => apply(prev))
    setProgramAssignedActivities((prev) => apply(prev))
  }, [])

  const saveQuickEditedActivity = useCallback(async () => {
    if (!quickEditActivity?.id) return
    if (!quickEditForm.activity.trim()) {
      alert('Actividad es obligatoria')
      return
    }
    if (!quickEditQuantityValid) {
      alert('Cantidad inválida')
      return
    }
    setQuickEditSaving(true)
    try {
      const canonical = getCanonicalDiscipline(quickEditForm.discipline, disciplineOptions)
      const payload: any = {
        activity: quickEditForm.activity.trim(),
        description: String(quickEditForm.description || '').trim() || null,
        area: String(quickEditForm.area || '').trim() || null,
        discipline: canonical || null,
        unit: String(toCanonicalUnit(quickEditForm.unit || '') || '').trim() || null,
        quantity: quickEditQuantityRaw ? quickEditQuantityParsed : null
      }
      const res = await fetch(`/api/activities/${encodeURIComponent(String(quickEditActivity.id))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Error actualizando actividad')
      applyEditedActivityLocally(j)
      if (j?.area) {
        const areaEdited = String(j.area).trim()
        if (areaEdited) {
          setAreaOptions((prev) => {
            if (prev.some((x) => normalizeAreaKey(x) === normalizeAreaKey(areaEdited))) return prev
            return [...prev, areaEdited].sort((a, b) => a.localeCompare(b, 'es'))
          })
        }
      }
      if (j?.unit) {
        const unitEdited = String(j.unit).trim()
        if (unitEdited) {
          setUnitOptions((prev) => {
            if (prev.some((x) => normalizeUnitKey(x) === normalizeUnitKey(unitEdited))) return prev
            return [...prev, unitEdited].sort((a, b) => a.localeCompare(b, 'es'))
          })
        }
      }
      setProgramDirty(true)
      closeQuickEditDialog()
    } catch (e: any) {
      console.error('Error editing quick activity', e)
      alert(e?.message || 'Error actualizando actividad')
    } finally {
      setQuickEditSaving(false)
    }
  }, [
    applyEditedActivityLocally,
    closeQuickEditDialog,
    disciplineOptions,
    getCanonicalDiscipline,
    normalizeAreaKey,
    normalizeUnitKey,
    quickEditActivity?.id,
    quickEditForm.activity,
    quickEditForm.area,
    quickEditForm.description,
    quickEditForm.discipline,
    quickEditForm.unit,
    quickEditQuantityParsed,
    quickEditQuantityRaw,
    quickEditQuantityValid
  ])

  const computeProgramDirty = useCallback((nextIds: Set<string>) => {
    let dirty = nextIds.size !== programInitialAssignedIds.size
    if (!dirty) {
      for (const id of nextIds) {
        if (!programInitialAssignedIds.has(id)) { dirty = true; break }
      }
    }
    setProgramDirty(dirty)
  }, [programInitialAssignedIds])

  useEffect(() => {
    if (!programDialogOpen) return
    ;(async () => {
      try {
        const [discRes, areaRes, unitRes] = await Promise.all([
          fetch('/api/activities/disciplines'),
          fetch('/api/activities/areas'),
          fetch('/api/activities/units')
        ])
        if (discRes.ok) {
          const list = await discRes.json()
          if (Array.isArray(list)) {
            setDisciplineOptions(list)
          }
        }
        if (areaRes.ok) {
          const list = await areaRes.json()
          if (Array.isArray(list)) {
            setAreaOptions(
              list.filter((x: any) => normalizeAreaKey(String(x || '')) !== normalizeAreaKey('SIN AREA'))
            )
          }
        }
        if (unitRes.ok) {
          const list = await unitRes.json()
          if (Array.isArray(list)) setUnitOptions(list)
        }
      } catch {
        // ignore
      }
    })()
  }, [programDialogOpen])

  const openCreateCrewForm = async () => {
    if (!canManageCrews) return
    if (openingCreateForm) return
    if (showCreateForm) {
      resetForm()
      setShowCreateForm(false)
      return
    }
    setOpeningCreateForm(true)
    try {
      try { await refreshAssignedIds() } catch(e){}
      try { await loadAttendanceWorkDates(true) } catch(e){}
      resetForm()
      // ensure edit modal is closed when opening create
      setShowEditModal(false)
      // fetch collaborators excluding already assigned
      try {
        // Fetch all collaborators; occupied ones are handled in UI (disabled + crew label)
        await loadCollaboratorsCached({ force: true, normalizeSpecialty: true })
        setCreateSelectedSpecialty(null)
        setCreateFName('')
      } catch (e) {}
      setShowCreateForm(true)
    } finally {
      setOpeningCreateForm(false)
    }
  }

  return (
    <Box sx={{ display: "flex" }}>
      <Box sx={{ flex: 1 }}>
        <UserHeader title="Cuadrillas" />
        {isUserRole && canManageCrews ? (
          <Tooltip title={showCreateForm ? "Cerrar formulario" : "Nueva cuadrilla"}>
            <IconButton
              color="primary"
              onClick={openCreateCrewForm}
              disabled={openingCreateForm}
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
        <Box component="main" sx={{ minWidth: 0, width: '100%', overflowX: 'hidden' }}>
          <Container
            maxWidth={false}
            disableGutters
            sx={{ py: { xs: 1, sm: 1.5, md: 2 }, width: '100%', maxWidth: '100% !important', px: { xs: 0.75, sm: 1.25, md: 2 }, minWidth: 0, overflowX: 'hidden' }}
          >
            {debugCrewRoles ? (
              <Box
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 3000,
                  mb: 1,
                  px: 1.5,
                  py: 1,
                  bgcolor: '#991b1b',
                  color: '#fff',
                  border: '2px solid #fca5a5',
                  borderRadius: 1,
                  fontSize: 13,
                  fontWeight: 800,
                  boxShadow: '0 8px 20px rgba(0,0,0,0.18)'
                }}
              >
                DEBUG ROLES ACTIVO - si ves este banner, estas en la version correcta. Revisa las cajas "DBG roles v4" debajo de cada cuadrilla.
              </Box>
            ) : null}
            {/* <Typography variant="h4" gutterBottom sx={{ color: colors.blue1 }}>Cuadrillas</Typography> */}
            <Paper elevation={0} sx={{ p: 0, m: 0, minWidth: 0, overflow: 'visible', bgcolor: 'transparent', boxShadow: 'none' }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, gap: 1, flexWrap: 'wrap' }}>
                {latePolicyFeatureEnabled && (role === 'dev' || role === 'admin') && (
                  <Button variant="outlined" onClick={() => setLatePolicyOpen(true)}>Permisos fuera de horario</Button>
                )}
                {canManageCrews && !isUserRole && (
                  <Button
                    variant="contained"
                    disabled={openingCreateForm}
                    sx={{
                      ...(openingCreateForm ? {
                        bgcolor: '#93c5fd',
                        color: '#0ea5e9',
                        '&.Mui-disabled': {
                          bgcolor: '#93c5fd',
                          color: '#0ea5e9',
                          opacity: 1,
                          cursor: 'not-allowed'
                        }
                      } : {})
                    }}
                    onClick={openCreateCrewForm}
                  >
                    {openingCreateForm ? "Abriendo..." : (showCreateForm ? "Cancelar" : "Nueva cuadrilla")}
                  </Button>
                )}
              </Box>
              {loading ? (
                <Typography>Cargando...</Typography>
              ) : crews.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No hay cuadrillas registradas.</Typography>
              ) : (
                <Box
                  sx={{
                    overflowX: "hidden",
                    border: '1px solid #dbe6f7',
                    borderRadius: 2.5,
                    bgcolor: '#fff',
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
                    '& table': { width: '100%', minWidth: 0, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 },
                    '& thead th': {
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: 12,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: '#334155',
                      background: '#f1f5ff',
                      borderBottom: '1px solid #dbe6f7',
                      padding: '12px 12px',
                      position: 'sticky',
                      top: 0,
                      zIndex: 2
                    },
                    '& tbody td': {
                      borderBottom: '1px solid #eef2f7',
                      padding: { xs: '5px 5px', sm: '6px 6px' },
                      verticalAlign: 'top'
                    },
                    '& thead th, & tbody td': {
                      borderRight: '1px solid #eef2f7'
                    },
                    '& thead th:last-of-type, & tbody td:last-of-type': {
                      borderRight: 'none'
                    },
                    '& tbody tr:hover td': {
                      background: '#f8fbff'
                    }
                  }}
                >
                  <table>
                    <colgroup>
                      <col style={{ width: '21%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '29%' }} />
                      <col style={{ width: '27%' }} />
                      <col style={{ width: '10%' }} />
                    </colgroup>
                    <tbody>
                      {crewsGroupedByDate.flatMap((dateGroup) => {
                        const dateExpanded = !collapsedDateGroups.has(String(dateGroup.key))
                        const dateKey = String(dateGroup.key)
                        const noteStatus = noteStatusByDate[dateKey] || { saved: 0, pending: 0, available: 0 }
                        const rows: React.ReactNode[] = [
                          <tr key={`date-group-${dateGroup.key}`}>
                            <td
                              colSpan={5}
                              style={{
                                padding: '9px 12px',
                                background: colors.blue6,
                                borderBottom: '2px solid #0078ff',
                                cursor: 'pointer',
                                transition: 'background 160ms ease, filter 160ms ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#003c80'
                                e.currentTarget.style.filter = 'brightness(1.08)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = colors.blue6
                                e.currentTarget.style.filter = 'none'
                              }}
                              onClick={() => {
                                setCollapsedDateGroups((prev) => {
                                  const next = new Set(Array.from(prev))
                                  const key = String(dateGroup.key)
                                  if (next.has(key)) next.delete(key)
                                  else next.add(key)
                                  return next
                                })
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                                {dateExpanded
                                  ? <ChevronUp size={24} strokeWidth={3} color="rgba(255, 255, 255, 0.5)" />
                                  : <ChevronDown size={24} strokeWidth={3} color="rgba(255, 255, 255, 0.5)" />}
                                <span style={{ fontSize: 16, fontWeight: 400, color: colors.blue14, letterSpacing: '0.01em', lineHeight: 1.2 }}>
                                  {dateGroup.label}
                                </span>
                                {canViewDateNotes && dateGroup.key !== '__sin_fecha__' ? (
                                  <Box sx={{ ml: { xs: 0, sm: 1 }, display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
                                    <Button
                                      size="small"
                                      variant="contained"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openDateNoteModal(String(dateGroup.key), String(dateGroup.label))
                                      }}
                                      sx={{
                                        minWidth: 0,
                                        px: 1.25,
                                        py: 0.25,
                                        fontSize: { xs: 10, sm: 11 },
                                        textTransform: 'none',
                                        bgcolor: '#0ea5e9',
                                        color: '#fff',
                                        '&:hover': { bgcolor: '#0284c7' }
                                      }}
                                    >
                                      {canManageCrews ? 'Disponibles y nota' : 'Ver notas'}
                                    </Button>
                                    {noteStatus.pending > 0 ? (
                                      <Tooltip title="Disponibles sin nota" arrow>
                                        <Box
                                          component="span"
                                          sx={{
                                            bgcolor: '#dc2626',
                                            color: '#fff',
                                            fontWeight: 800,
                                            minWidth: 22,
                                            height: 22,
                                            px: 0.6,
                                            fontSize: 12,
                                            borderRadius: '999px',
                                            border: '1px solid rgba(255,255,255,0.95)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            lineHeight: 1
                                          }}
                                        >
                                          {noteStatus.pending}
                                        </Box>
                                      </Tooltip>
                                    ) : null}
                                    {noteStatus.saved > 0 ? (
                                      <Tooltip title="Notas guardadas" arrow>
                                        <Box
                                          component="span"
                                          sx={{
                                            bgcolor: '#16a34a',
                                            color: '#fff',
                                            fontWeight: 800,
                                            minWidth: 22,
                                            height: 22,
                                            px: 0.6,
                                            fontSize: 12,
                                            borderRadius: '999px',
                                            border: '1px solid rgba(255,255,255,0.95)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            lineHeight: 1
                                          }}
                                        >
                                          {noteStatus.saved}
                                        </Box>
                                      </Tooltip>
                                    ) : null}
                                  </Box>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ]
                        if (!dateExpanded) return rows
                        dateGroup.crews.forEach((c: any) => {
                        const crewId = String(c.id)
                        const asArray = (value: any) => {
                          if (!value) return [] as string[]
                          const normalizeId = (item: any) => String(
                            typeof item === 'object' && item !== null
                              ? (item.id ?? item.collaborator_id ?? '')
                              : item
                          ).trim()
                          if (Array.isArray(value)) return value.map(normalizeId).filter(Boolean)
                          return [normalizeId(value)].filter(Boolean)
                        }
                        const crewMemberDetails = Array.isArray(c?.crew_member_details) ? c.crew_member_details : []
                        const crewDetailById = new Map(
                          crewMemberDetails
                            .map((detail: any) => [String(detail?.id || detail?.collaborator_id || '').trim(), detail])
                            .filter(([id]: any) => Boolean(id))
                        )
                        const detailsByRole = (role: string) => crewMemberDetails
                          .filter((detail: any) => String(detail?.crew_role || '').toLowerCase() === role)
                          .map((detail: any) => String(detail?.id || detail?.collaborator_id || '').trim())
                          .filter(Boolean)
                        const supExplicit = new Set([
                          ...asArray(c?.supervisors ?? c?.supervisor),
                          ...detailsByRole('supervisor')
                        ])
                        const frmExplicit = new Set([
                          ...asArray(c?.foremen ?? c?.foreman),
                          ...detailsByRole('foreman')
                        ])
                        const memExplicit = new Set([
                          ...asArray(c?.members ?? c?.member),
                          ...detailsByRole('member')
                        ])
                        const allIds = Array.from(new Set([...Array.from(supExplicit), ...Array.from(frmExplicit), ...Array.from(memExplicit)]))
                        const supIds: string[] = []
                        const frmIds: string[] = []
                        const memIds: string[] = []
                        allIds.forEach((id) => {
                          if (supExplicit.has(id)) { supIds.push(id); return }
                          if (frmExplicit.has(id)) { frmIds.push(id); return }
                          const collab = crewDetailById.get(String(id)) || (collaborators || []).find((x: any) => String(x?.id) === String(id))
                          const pos = normalizeStr(collab?.position || collab?.posicion || '')
                          const role = categorizePosition(pos)
                          if (role === 'supervisor') supIds.push(id)
                          else if (role === 'foreman') frmIds.push(id)
                          else memIds.push(id)
                        })
                        const isIndirectById = (id: string) => {
                          const collab = crewDetailById.get(String(id)) || (collaborators || []).find((x: any) => String(x?.id) === String(id))
                          const posNorm = normalizeStr(collab?.position || collab?.posicion || '')
                          const specNorm = normalizeStr(collab?.specialty || collab?.specialidad || '')
                          const workerTypeNorm = normalizeStr(collab?.worker_type || collab?.tipo_trabajador || '')
                          return (
                            posNorm.includes('nivelador') ||
                            posNorm.includes('mecanico mantencion') ||
                            posNorm.includes('electrico mantencion') ||
                            posNorm.includes('indirect') ||
                            specNorm.includes('indirect') ||
                            workerTypeNorm.includes('indirect')
                          )
                        }
                        const indirectCount = Array.from(new Set(memIds)).filter((id) => isIndirectById(id)).length
                        const directCount = Math.max(0, Array.from(new Set(memIds)).length - indirectCount)
                        const getGlobalCollabById = (id: string) => (collaborators || []).find((x: any) => String(x?.id) === String(id))
                        const getCollabById = (id: string) => crewDetailById.get(String(id)) || getGlobalCollabById(id)
                        const formatCrewLeadSummary = (ids: string[], label: string) => {
                          const people = Array.from(new Set(ids))
                            .map((id) => getCollabById(id))
                            .filter(Boolean)
                            .map((person: any) => {
                              const name = formatCollaboratorName(person?.first_name, person?.last_name)
                              const position = person?.position || person?.posicion ? formatPositionLabel(person.position || person.posicion) : label
                              return name ? `${name} - ${position}` : ''
                            })
                            .filter(Boolean)
                          if (people.length === 0) return ''
                          return people.join(' / ')
                        }
                        const supervisorSummary = formatCrewLeadSummary(supIds, 'SUPERVISOR')
                        const foremanSummary = formatCrewLeadSummary(frmIds, 'CAPATAZ')
                        const leadRows = [
                          supervisorSummary || '',
                          foremanSummary || '',
                        ].filter(Boolean)
                        const leadSummary = leadRows.join('\n')
                        const debugRoleItems = debugCrewRoles ? allIds.map((id) => {
                          const detail = crewDetailById.get(String(id)) as any
                          const global = getGlobalCollabById(id)
                          const person = detail || global || null
                          const explicitRole = supExplicit.has(id) ? 'supervisor' : frmExplicit.has(id) ? 'capataz' : memExplicit.has(id) ? 'colaborador' : 'sin-explicito'
                          const classifiedRole = supIds.includes(id) ? 'supervisor' : frmIds.includes(id) ? 'capataz' : memIds.includes(id) ? 'colaborador' : 'sin-clasificar'
                          const name = person ? formatCollaboratorName(person?.first_name, person?.last_name) : ''
                          const positionRaw = String(person?.position || person?.posicion || '')
                          const source = detail ? 'crew_member_details' : global ? 'collaborators' : 'missing'
                          return {
                            id,
                            idShort: id ? `${id.slice(0, 8)}...${id.slice(-4)}` : '-',
                            explicitRole,
                            classifiedRole,
                            source,
                            name: name || '(sin nombre)',
                            position: positionRaw || '(sin cargo)',
                            crewRole: detail?.crew_role || '',
                          }
                        }) : []
                        const crewRows: React.ReactNode[] = [
                          <tr key={crewId}>
                            <td colSpan={5} style={{ padding: '8px 10px', background: '#f8fbff', maxWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: { xs: 0.5, sm: 0.75, md: 1 }, minWidth: 0, width: '100%', overflow: 'hidden', flexDirection: 'row', flexWrap: 'nowrap' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 0.75, md: 1 }, minWidth: 0, flex: '1 1 auto', overflow: 'hidden', flexDirection: 'row', width: 'auto' }}>
                                  <Box
                                    component="span"
                                    sx={{
                                      display: 'block',
                                      fontWeight: 700,
                                      color: '#0f172a',
                                      minWidth: 0,
                                      flex: '0 1 auto',
                                      maxWidth: { xs: '52%', sm: '45%', md: '36%', lg: '42%' },
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      fontSize: { xs: 12.5, sm: 14, md: 15 }
                                    }}
                                    title={formatCrewName(c.name)}
                                  >
                                    {formatCrewName(c.name)}
                                  </Box>
                                  {leadRows.length > 0 ? (
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 0.25,
                                        color: '#94a3b8',
                                        fontSize: { xs: 11, sm: 12 },
                                        fontWeight: 600,
                                        minWidth: 0,
                                        flex: '1 1 auto',
                                        maxWidth: '100%',
                                        overflow: 'hidden'
                                      }}
                                      title={leadSummary}
                                    >
                                      {leadRows.map((row, idx) => (
                                        <Box
                                          key={`lead-row-${crewId}-${idx}`}
                                          component="span"
                                          sx={{
                                            display: 'block',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            lineHeight: 1.25
                                          }}
                                        >
                                          {row}
                                        </Box>
                                      ))}
                                    </Box>
                                  ) : null}
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.35, sm: 0.5, md: 0.75 }, flexWrap: 'nowrap', justifyContent: 'flex-end', flex: '0 0 auto', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
                                  <Box component="span" sx={{ color: '#374151', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 999, fontSize: { xs: 11, sm: 12 }, fontWeight: 700, px: { xs: 0.75, sm: 1 }, py: '2px', minWidth: { xs: 36, sm: 42 }, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    S: {supIds.length}
                                  </Box>
                                  <Box component="span" sx={{ color: '#374151', background: '#e5e7eb', border: '1px solid #cbd5e1', borderRadius: 999, fontSize: { xs: 11, sm: 12 }, fontWeight: 700, px: { xs: 0.75, sm: 1 }, py: '2px', minWidth: { xs: 36, sm: 42 }, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    C: {frmIds.length}
                                  </Box>
                                  <Box component="span" sx={{ color: '#374151', background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 999, fontSize: { xs: 11, sm: 12 }, fontWeight: 700, px: { xs: 0.75, sm: 1 }, py: '2px', maxWidth: { xs: 112, sm: 150, md: 'none' }, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    c: {memIds.length} (DIR {directCount} / IND {indirectCount})
                                  </Box>
                                  <Box sx={{ display: 'inline-flex', flexWrap: 'nowrap', gap: { xs: 0.35, sm: 0.5, md: 0.75 }, alignItems: 'center', justifyContent: 'flex-end', ml: { xs: 0, sm: 0.25, md: 0.5 }, flex: '0 0 auto', maxWidth: '100%' }}>
                                    {isAdminReadOnly || isViewerReadOnly ? (
                                      <Tooltip title="Ver" arrow>
                                        <span>
                                          <IconButton size="small" disabled={showCreateForm} onClick={() => openView(String(c.id))} sx={{ border: '1px solid', borderColor: '#d7e2f0', borderRadius: 1.5, bgcolor: '#fff', color: '#334155', width: { xs: 30, sm: 34 }, height: { xs: 30, sm: 34 }, '&:hover': { bgcolor: '#f8fafc' } }}>
                                            <VisibilityOutlinedIcon fontSize="small" />
                                          </IconButton>
                                        </span>
                                      </Tooltip>
                                    ) : (
                                      <>
                                        {isUserRole && (
                                          <Tooltip title="Ver" arrow>
                                            <span>
                                              <IconButton size="small" disabled={showCreateForm} onClick={() => openView(String(c.id))} sx={{ border: '1px solid', borderColor: '#d7e2f0', borderRadius: 1.5, bgcolor: '#fff', color: '#334155', width: { xs: 30, sm: 34 }, height: { xs: 30, sm: 34 }, '&:hover': { bgcolor: '#f8fafc' } }}>
                                                <VisibilityOutlinedIcon fontSize="small" />
                                              </IconButton>
                                            </span>
                                          </Tooltip>
                                        )}
                                        <Tooltip title="Editar" arrow>
                                          <span>
                                            <IconButton size="small" disabled={showCreateForm} onClick={() => handleEdit(c)} sx={{ border: '1px solid', borderColor: '#d7e2f0', borderRadius: 1.5, bgcolor: '#fff', color: '#334155', width: { xs: 30, sm: 34 }, height: { xs: 30, sm: 34 }, '&:hover': { bgcolor: '#f8fafc' } }}>
                                              <EditOutlinedIcon fontSize="small" />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                        <Tooltip title="Actividades" arrow>
                                          <span>
                                            <IconButton size="small" disabled={showCreateForm} onClick={async () => {
                                              setSelectedCrewForProgram(String(c.id))
                                              setProgramWorkDate(getChileToday())
                                              setProgramDialogOpen(true)
                                              setShowAllProgramDisciplines(false)
                                              setProgramQuery('')
                                              setProgramResults([])
                                              setProgramAssignedActivities([])
                                              try {
                                                await loadProgramCrewContext(String(c.id), programWorkDate)
                                                await loadProgramActivities()
                                              } catch (e) {
                                                console.warn('Could not load program activities', e)
                                              }
                                            }} sx={() => {
                                              const hasActivities = (Array.isArray(c.activities) && c.activities.length > 0) || c.activity_id || c.activityId || c.activity_name || c.activity
                                              return {
                                                border: '1px solid',
                                                borderColor: hasActivities ? '#2563eb' : '#d7e2f0',
                                                borderRadius: 1.5,
                                                color: hasActivities ? '#ffffff' : '#ca6807',
                                                bgcolor: hasActivities ? '#2563eb' : '#fff',
                                                width: { xs: 30, sm: 34 },
                                                height: { xs: 30, sm: 34 },
                                                '&:hover': { bgcolor: hasActivities ? '#1d4ed8' : '#f8fafc' }
                                              }
                                            }}>
                                              <AssignmentTurnedInOutlinedIcon fontSize="small" />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                        <Tooltip title="Eliminar" arrow>
                                          <span>
                                            <IconButton size="small" color="error" disabled={showCreateForm} onClick={() => handleDelete(c.id)} sx={{ border: '1px solid', borderColor: '#ef4444', borderRadius: 1.5, bgcolor: '#fff5f5', width: { xs: 30, sm: 34 }, height: { xs: 30, sm: 34 }, '&:hover': { bgcolor: '#ffe4e6' } }}>
                                              <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                      </>
                                    )}
                                  </Box>
                                </Box>
                              </Box>
                            </td>
                          </tr>
                        ]
                        if (debugCrewRoles) {
                          crewRows.push(
                            <tr key={`${crewId}-debug`}>
                              <td colSpan={5} style={{ padding: '8px 10px', background: '#fff7ed', borderBottom: '2px solid #f97316' }}>
                                <Box
                                  sx={{
                                    p: 1,
                                    border: '2px dashed #f97316',
                                    borderRadius: 1,
                                    bgcolor: '#fff',
                                    color: '#0f172a',
                                    fontSize: 11,
                                    lineHeight: 1.35,
                                    overflowX: 'auto'
                                  }}
                                >
                                  <Box sx={{ fontWeight: 900, mb: 0.5, color: '#9a3412' }}>
                                    DBG roles v4 | crew {crewId.slice(0, 8)} | supIds [{supIds.join(', ') || '-'}] | capIds [{frmIds.join(', ') || '-'}] | memIds [{memIds.join(', ') || '-'}]
                                  </Box>
                                  <Box>leadSummary: {leadSummary || '(vacio)'}</Box>
                                  <Box>supervisorSummary: {supervisorSummary || '(vacio)'}</Box>
                                  <Box>capatazSummary: {foremanSummary || '(vacio)'}</Box>
                                  <Box>raw c.supervisors: {JSON.stringify(c?.supervisors ?? c?.supervisor ?? null)}</Box>
                                  <Box>raw c.foremen: {JSON.stringify(c?.foremen ?? c?.foreman ?? null)}</Box>
                                  <Box>raw details count: {crewMemberDetails.length}</Box>
                                  {debugRoleItems.length > 0 ? debugRoleItems.map((item) => (
                                    <Box key={`debug-${crewId}-${item.id}`} sx={{ mt: 0.4, whiteSpace: 'nowrap' }}>
                                      {item.idShort} | explicit={item.explicitRole} | classified={item.classifiedRole} | source={item.source} | crew_role={item.crewRole || '-'} | {item.name} | {item.position}
                                    </Box>
                                  )) : (
                                    <Box sx={{ mt: 0.4 }}>Sin integrantes detectados en esta fila.</Box>
                                  )}
                                </Box>
                              </td>
                            </tr>
                          )
                        }
                        rows.push(...crewRows)
                      })
                      return rows
                      })}
                    </tbody>
                  </table>
                </Box>
              )}
            </Paper>
            <Dialog
              open={dateNoteModalOpen}
              onClose={closeDateNoteModal}
              fullWidth
              maxWidth="xl"
              PaperProps={{
                sx: {
                  width: 'min(1400px, 96vw)',
                  maxWidth: '96vw',
                  height: '80vh',
                  maxHeight: '80vh',
                }
              }}
            >
              <DialogTitle>
                Disponibles del día {dateNoteModalDateLabel}
              </DialogTitle>
              <DialogContent>
                {(() => {
                  const available = availableCollaboratorsForModal
                  const counts = available.reduce((acc: { sup: number; capa: number; colab: number }, c: any) => {
                    const pos = String(c?.position || c?.posicion || '')
                    const role = categorizePosition(pos)
                    if (role === 'supervisor') acc.sup += 1
                    else if (role === 'foreman') acc.capa += 1
                    else acc.colab += 1
                    return acc
                  }, { sup: 0, capa: 0, colab: 0 })
                  return (
                    <Box sx={{ pt: 1, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <Typography variant="body2" sx={{ color: colors.gray4, mb: 1 }}>
                        Disponibles en turno y no asignados a cuadrillas: {available.length}
                      </Typography>
                      <Typography variant="body2" sx={{ color: colors.gray4, mb: 0.75, fontWeight: 700 }}>
                        Sup.: {counts.sup} | Capa.: {counts.capa} | Directos: {counts.colab}
                      </Typography>
                      <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1.5, flex: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
                        {available.length === 0 ? (
                          <Typography sx={{ p: 1.5, color: '#64748b' }}>No hay colaboradores para registrar notas.</Typography>
                        ) : (
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
                              gap: 1,
                            }}
                          >
                            {available.map((c: any, idx: number) => {
                              const cid = String(c?.id || '')
                              const name = formatCollaboratorName(c?.first_name, c?.last_name)
                              const pos = c?.position ? formatPositionLabel(c.position) : ''
                              const hasNote = String(dateNoteDraftByCollaborator[cid] || '').trim().length > 0
                              return (
                                <Box
                                  key={`note-${cid}-${idx}`}
                                  sx={{
                                    p: 1.25,
                                    border: hasNote ? '1px solid #334155' : '1px solid #ef4444',
                                    borderRadius: 1,
                                    bgcolor: hasNote ? '#e2e8f0' : '#fef2f2'
                                  }}
                                >
                                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: hasNote ? '#0f172a' : '#991b1b' }}>{name || `ID:${cid}`}</Typography>
                                  <Typography sx={{ fontSize: 12, color: hasNote ? '#334155' : '#b91c1c', mb: 0.75 }}>{pos || 'Sin cargo'}</Typography>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="Ingrese nota para este colaborador"
                                    value={String(dateNoteDraftByCollaborator[cid] || '')}
                                    disabled={!canManageCrews}
                                    onChange={(e) => {
                                      if (!canManageCrews) return
                                      const value = e.target.value
                                      setDateNoteDraftByCollaborator((prev) => ({ ...prev, [cid]: value }))
                                    }}
                                  />
                                </Box>
                              )
                            })}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  )
                })()}
              </DialogContent>
              <DialogActions>
                <Button onClick={closeDateNoteModal}>{canManageCrews ? 'Cancelar' : 'Cerrar'}</Button>
                {canManageCrews ? (
                  <Button variant="contained" onClick={handleSaveDateNote}>Guardar nota</Button>
                ) : null}
              </DialogActions>
            </Dialog>
            {!isAdminReadOnly && (
              <Dialog
                open={showCreateForm}
                onClose={(_event, reason) => {
                  if (reason === 'backdropClick') return
                  requestCloseCrewModal('create')
                }}
                fullWidth
                maxWidth="xl"
                PaperProps={{
                  sx: {
                    width: 'min(1400px, 96vw)',
                    maxWidth: '96vw',
                  }
                }}
              >
                <DialogTitle>Crear cuadrilla</DialogTitle>
                <DialogContent onChangeCapture={() => { createTouchedRef.current = true }}>
                  {renderFormFields('create')}
                </DialogContent>
                <DialogActions>
                  <Button
                    variant="contained"
                    onClick={handleSaveCrew}
                    disabled={(
                      !attendanceWorkDates.includes(String(createWorkDate || '').trim()) ||
                      !String(createFieldBossId || '').trim() ||
                      (createSupervisorsSelected.length === 0) &&
                      (createForemenSelected.length === 0) &&
                      (createMembersSelected.length === 0) &&
                      (createIndirectSelected.length === 0) &&
                      !createSkipSupervisor &&
                      !createSkipForeman
                    )}
                  >Crear</Button>
                  <Button onClick={() => requestCloseCrewModal('create')} sx={{ border: '1px solid', borderColor: colors.blue6 }}>Cancelar</Button>
                </DialogActions>
              </Dialog>
            )}
            {!isAdminReadOnly && (
              <Dialog
                open={showEditModal}
                onClose={(_event, reason) => {
                  if (reason === 'backdropClick') return
                  requestCloseCrewModal('edit')
                }}
                fullWidth
                maxWidth="xl"
                PaperProps={{
                  sx: {
                    width: 'min(1400px, 96vw)',
                    maxWidth: '96vw',
                  }
                }}
              >
                <DialogTitle>Editar cuadrilla</DialogTitle>
                <DialogContent onChangeCapture={() => { editTouchedRef.current = true }}>
                  {renderFormFields('edit')}
                </DialogContent>
                <DialogActions>
                  <Button
                    variant="contained"
                    onClick={handleSaveCrew}
                    disabled={(
                      (editSupervisorsSelected.length === 0) &&
                      (editForemenSelected.length === 0) &&
                      (editMembersSelected.length === 0) &&
                      (editIndirectSelected.length === 0) &&
                      !editSkipSupervisor &&
                      !editSkipForeman
                    )}
                  >Actualizar</Button>
                  <Button onClick={() => requestCloseCrewModal('edit')} sx={{ border: '1px solid', borderColor: colors.blue6 }}>Cancelar</Button>
                </DialogActions>
              </Dialog>
            )}
            <Dialog open={crewCloseConfirmOpen} onClose={() => setCrewCloseConfirmOpen(false)} maxWidth="xs" fullWidth>
              <DialogTitle>¿Cerrar sin guardar?</DialogTitle>
              <DialogContent>
                <Typography sx={{ color: '#475569', fontSize: 14 }}>
                  Si cierras ahora, perderás los cambios realizados.
                </Typography>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button variant="outlined" onClick={() => setCrewCloseConfirmOpen(false)}>Volver</Button>
                <Button
                  color="error"
                  variant="contained"
                  onClick={() => {
                    const target = crewCloseConfirmTarget
                    setCrewCloseConfirmOpen(false)
                    setCrewCloseConfirmTarget(null)
                    if (target === 'edit') closeEditModalImmediate()
                    else closeCreateModalImmediate()
                  }}
                >
                  Cerrar y perder cambios
                </Button>
              </DialogActions>
            </Dialog>
            {!isAdminReadOnly && (
            <Dialog open={programDialogOpen} onClose={(_event, reason) => {
              if (reason === 'backdropClick') return
              if (programDirty) {
                const ok = window.confirm('Hay cambios sin guardar. Si cierras, se perderán.')
                if (!ok) return
              }
              setProgramDialogOpen(false)
              setProgramActivities([])
              setSelectedCrewForProgram(null)
              setProgramCrewMembers([])
              setProgramCrewRoleIds(null)
              setProgramAssignedActivities([])
              setProgramInitialAssignedIds(new Set<string>())
              setProgramDirty(false)
              setProgramWorkDate(getChileToday())
            }} fullWidth maxWidth={false} PaperProps={{ sx: { width: '97vw', maxWidth: '97vw', height: '95vh', maxHeight: '95vh', m: 0 } }}>
              <DialogTitle>Seleccionar actividad desde Programa</DialogTitle>
              <DialogContent>
                <Typography variant="body2" sx={{ mb: 1 }}>Asignando a: {selectedCrewForProgram ? (crews.find(x => String(x.id) === String(selectedCrewForProgram))?.name || selectedCrewForProgram) : '—'}</Typography>
                <Box sx={{ mb: 2, maxWidth: 240 }}>
                  <TextField
                    label="Fecha de trabajo"
                    type="date"
                    size="small"
                    value={programWorkDate}
                    onChange={(e) => setProgramWorkDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    disabled
                    fullWidth
                  />
                </Box>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: { xs: '1fr', lg: '2fr 3fr' },
                    alignItems: 'start'
                  }}
                >
                  <Box sx={{ display: 'grid', gap: 2 }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Integrantes</Typography>
                  {loadingProgramCrew ? (
                    <Typography variant="body2" color="text.secondary">Cargando...</Typography>
                  ) : (
                    (() => {
                      const byId = new Map((programCrewMembers || []).map((c: any) => [String(c.id), c]))
                      const roleIds = programCrewRoleIds || { supervisors: [], foremen: [], members: [] }
                      const renderList = (ids: string[]) => {
                        if (!ids.length) return <Typography variant="body2" color="text.secondary">—</Typography>
                        return (
                          <Box component="ul" sx={{ m: 0, pl: 2, width: '100%' }}>
                            {ids.map((id) => {
                              const c = byId.get(String(id)) || null
                              const name = c ? formatCollaboratorName(c.first_name, c.last_name) : `ID:${id}`
                              return (
                                <li key={id} style={{ width: '100%' }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      display: 'block',
                                      width: '100%',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                    title={`${name}${c?.position ? ` - ${formatPositionLabel(c.position)}` : ''}`}
                                  >
                                    {name}{c?.position ? ` - ${formatPositionLabel(c.position)}` : ''}
                                  </Typography>
                                </li>
                              )
                            })}
                          </Box>
                        )
                      }
                      return (
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#f8fafc' }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: colors.gray3 }}>Supervisores</Typography>
                              {renderList(roleIds.supervisors)}
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#f8fafc' }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: colors.gray3 }}>Capataces</Typography>
                              {renderList(roleIds.foremen)}
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#f8fafc' }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: colors.gray3 }}>Colaboradores</Typography>
                              {renderList(roleIds.members)}
                            </Paper>
                          </Box>
                          <Box />
                        </Box>
                      )
                    })()
                  )}
                </Box>
                <Box sx={{ mb: 2, p: 2, border: '1px solid #dbe6f7', borderRadius: 2, bgcolor: '#f8fbff' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5, color: colors.gray3 }}>Crear actividad rápida</Typography>
                  <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr' } }}>
                    <TextField
                      size="small"
                      label="Actividad *"
                      value={newActivity.activity}
                      onChange={(e) => setNewActivity((s) => ({ ...s, activity: e.target.value }))}
                      fullWidth
                    />
                    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="area-select-label">Área</InputLabel>
                        <Select
                          labelId="area-select-label"
                          label="Área"
                          value={areaMode === 'other' ? '__other__' : (newActivity.area || '__none__')}
                          onChange={(e) => {
                            const v = String(e.target.value)
                            if (v === '__other__') {
                              setAreaMode('other')
                              setNewActivity((s) => ({ ...s, area: '' }))
                            } else if (v === '__none__') {
                              setAreaMode('existing')
                              setAreaOther('')
                              setAreaMatch(null)
                              setNewActivity((s) => ({ ...s, area: '' }))
                            } else {
                              setAreaMode('existing')
                              setAreaOther('')
                              setAreaMatch(null)
                              setNewActivity((s) => ({ ...s, area: v }))
                            }
                          }}
                        >
                          <MenuItem value="__none__">Sin área</MenuItem>
                          {areaOptions
                            .filter((a) => normalizeAreaKey(a) !== normalizeAreaKey('SIN AREA'))
                            .map((a) => (
                            <MenuItem key={a} value={a}>{a}</MenuItem>
                          ))}
                          <MenuItem value="__other__">Otra (crear)</MenuItem>
                        </Select>
                      </FormControl>
                      {areaMode === 'other' && (
                        <TextField
                          size="small"
                          label="Área"
                          value={areaOther}
                          onChange={(e) => {
                            const v = e.target.value
                            setAreaOther(v)
                            const key = normalizeAreaKey(v)
                            const match = areaOptions.find((opt) => normalizeAreaKey(opt) === key) || null
                            setAreaMatch(match)
                          }}
                          error={!!areaMatch}
                          helperText={areaMatch ? `Ya existe: ${areaMatch}` : ' '}
                          fullWidth
                        />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="discipline-select-label">Disciplina</InputLabel>
                        <Select
                          labelId="discipline-select-label"
                          label="Disciplina"
                          value={disciplineMode === 'other' ? '__other__' : (newActivity.discipline || '')}
                          onChange={(e) => {
                            const v = String(e.target.value)
                            if (v === '__other__') {
                              setDisciplineMode('other')
                              setNewActivity((s) => ({ ...s, discipline: '' }))
                            } else {
                              setDisciplineMode('existing')
                              setDisciplineOther('')
                              setDisciplineMatch(null)
                              setNewActivity((s) => ({ ...s, discipline: v }))
                            }
                          }}
                        >
                          {disciplineOptions.map((d) => (
                            <MenuItem key={d} value={d}>{formatDisciplineLabel(d)}</MenuItem>
                          ))}
                          <MenuItem value="__other__">Otra (crear)</MenuItem>
                        </Select>
                      </FormControl>
                      {disciplineMode === 'other' && (
                        <TextField
                          size="small"
                          label="Disciplina"
                          value={disciplineOther}
                          onChange={(e) => {
                            const v = e.target.value
                            setDisciplineOther(v)
                            const vNorm = normalizeDisciplineValue(v) || ''
                            const match = disciplineOptions.find((opt) => normalizeDisciplineValue(opt) === vNorm) || null
                            setDisciplineMatch(match)
                          }}
                          error={!!disciplineMatch}
                          helperText={disciplineMatch ? `Ya existe: ${formatDisciplineLabel(disciplineMatch)}` : ' '}
                          fullWidth
                        />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="unit-select-label">Unidad</InputLabel>
                        <Select
                          labelId="unit-select-label"
                          label="Unidad"
                          value={unitMode === 'other' ? '__other__' : (newActivity.unit || '__none__')}
                          onChange={(e) => {
                            const v = String(e.target.value)
                            if (v === '__other__') {
                              setUnitMode('other')
                              setNewActivity((s) => ({ ...s, unit: '' }))
                            } else if (v === '__none__') {
                              setUnitMode('existing')
                              setUnitOther('')
                              setUnitMatch(null)
                              setNewActivity((s) => ({ ...s, unit: '' }))
                            } else {
                              setUnitMode('existing')
                              setUnitOther('')
                              setUnitMatch(null)
                              setNewActivity((s) => ({ ...s, unit: v }))
                            }
                          }}
                        >
                          <MenuItem value="__none__">Sin unidad</MenuItem>
                          {unitOptions.map((u) => (
                            <MenuItem key={u} value={u}>{u}</MenuItem>
                          ))}
                          <MenuItem value="__other__">Otra (crear)</MenuItem>
                        </Select>
                      </FormControl>
                      {unitMode === 'other' && (
                        <TextField
                          size="small"
                          label="Unidad"
                          value={unitOther}
                          onChange={(e) => {
                            const v = e.target.value
                            setUnitOther(v)
                            const key = normalizeUnitKey(v)
                            const match = unitOptions.find((opt) => normalizeUnitKey(opt) === key) || null
                            setUnitMatch(match)
                          }}
                          error={!!unitMatch}
                          helperText={unitMatch ? `Ya existe: ${unitMatch}` : ' '}
                          fullWidth
                        />
                      )}
                    </Box>
                    <TextField
                      size="small"
                      label="Cantidad"
                      value={newActivity.quantity}
                      onChange={(e) => setNewActivity((s) => ({ ...s, quantity: e.target.value }))}
                      error={!quickQuantityValid}
                      helperText={!quickQuantityValid ? 'Debe ser numérica y mayor o igual a 0' : ' '}
                      inputProps={{ inputMode: 'decimal', min: 0, step: 'any' }}
                      fullWidth
                    />
                    </Box>
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setNewActivity({ activity: '', area: '', discipline: '', unit: '', quantity: '' })
                        setAreaMode('existing')
                        setAreaOther('')
                        setAreaMatch(null)
                        setUnitMode('existing')
                        setUnitOther('')
                        setUnitMatch(null)
                        setDisciplineMode('existing')
                        setDisciplineOther('')
                        setDisciplineMatch(null)
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="contained"
                      disabled={
                        creatingActivity ||
                        !newActivity.activity.trim() ||
                        !quickQuantityValid ||
                        (areaMode === 'other' && (!String(areaOther || '').trim() || !!areaMatch)) ||
                        (unitMode === 'other' && (!String(unitOther || '').trim() || !!unitMatch)) ||
                        (disciplineMode === 'existing' && !String(newActivity.discipline || '').trim()) ||
                        (disciplineMode === 'other' && (!String(disciplineOther || '').trim() || !!disciplineMatch))
                      }
                      onClick={async () => {
                        setCreatingActivity(true)
                        try {
                          const disciplineValue = disciplineMode === 'existing'
                            ? newActivity.discipline
                            : (disciplineMatch ? disciplineMatch : disciplineOther)
                          const canonical = getCanonicalDiscipline(disciplineValue, disciplineOptions)
                          const areaValue = areaMode === 'other'
                            ? (areaMatch ? areaMatch : areaOther)
                            : newActivity.area
                          const unitValue = unitMode === 'other'
                            ? (unitMatch ? unitMatch : unitOther)
                            : newActivity.unit
                          const payload: any = {
                            activity: newActivity.activity.trim(),
                            area: String(areaValue || '').trim() || null,
                            discipline: canonical,
                            unit: String(unitValue || '').trim() || null,
                            quantity: quickQuantityRaw ? quickQuantityParsed : null,
                            activity_origin: 'crew_created',
                          }
                          const res = await fetch('/api/activities', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                          })
                          const j = await res.json()
                          if (!res.ok) throw new Error(j?.error || 'Error creando actividad')
                          setProgramActivities((prev) => [j, ...prev])
                          if (programQuery && programQuery.trim().length >= 3) {
                            setProgramResults((prev) => [j, ...prev])
                          }
                          if (j?.area) {
                            const areaCreated = String(j.area).trim()
                            if (areaCreated) {
                              setAreaOptions((prev) => {
                                if (prev.some((x) => normalizeAreaKey(x) === normalizeAreaKey(areaCreated))) return prev
                                return [...prev, areaCreated].sort((a, b) => a.localeCompare(b, 'es'))
                              })
                            }
                          }
                          if (j?.unit) {
                            const unitCreated = String(j.unit).trim()
                            if (unitCreated) {
                              setUnitOptions((prev) => {
                                if (prev.some((x) => normalizeUnitKey(x) === normalizeUnitKey(unitCreated))) return prev
                                return [...prev, unitCreated].sort((a, b) => a.localeCompare(b, 'es'))
                              })
                            }
                          }
                          setProgramAssignedActivities((prev) => {
                            const exists = prev.some((x: any) => String(x.id) === String(j.id))
                            if (exists) return prev
                            const next = [...prev, { ...j }]
                            const nextIds = new Set(next.map((x: any) => String(x.id)))
                            computeProgramDirty(nextIds)
                            return next
                          })
                          setNewActivity({ activity: '', area: '', discipline: '', unit: '', quantity: '' })
                          setAreaMode('existing')
                          setAreaOther('')
                          setAreaMatch(null)
                          setUnitMode('existing')
                          setUnitOther('')
                          setUnitMatch(null)
                        } catch (e) {
                          console.error(e)
                          alert((e as any)?.message || 'Error creando actividad')
                        } finally {
                          setCreatingActivity(false)
                        }
                      }}
                    >
                      {creatingActivity ? 'Creando...' : 'Crear'}
                    </Button>
                  </Box>
                </Box>
                  </Box>
                  <Box sx={{ display: 'grid', gap: 2 }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Actividades asignadas</Typography>
                  {programAssignedActivities.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">—</Typography>
                  ) : (
                    <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1.5, overflow: 'hidden' }}>
                      <Box sx={{ maxHeight: 360, overflowX: 'auto', overflowY: 'auto' }}>
                      <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '8%' }}>Orden</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'left', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '22%' }}>Actividad</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '10%' }}>Origen</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'left', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '23%' }}>Descripción</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'left', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '18%' }}>Descripción adicional</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '10%' }}>Área</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '8%' }}>Cant.</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '8%' }}>Unidad</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '11%' }}>Disciplina</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '10%' }}>Asignada</th>
                            <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', color: colors.gray4, fontWeight: 600, fontSize: 13, width: '12%' }}>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {programAssignedActivities.map((a: any, idx: number) => (
                            <tr key={String(a.id || idx)} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbff' }}>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 12, textAlign: 'center', fontWeight: 700 }}>
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                  <span>{idx + 1}</span>
                                  <IconButton
                                    size="small"
                                    disabled={idx === 0}
                                    onClick={() => {
                                      setProgramAssignedActivities((prev) => {
                                        if (idx <= 0 || idx >= prev.length) return prev
                                        const next = prev.slice()
                                        const tmp = next[idx - 1]
                                        next[idx - 1] = next[idx]
                                        next[idx] = tmp
                                        return next
                                      })
                                      setProgramDirty(true)
                                    }}
                                    sx={{ border: '1px solid #dbe6f7', borderRadius: 1, p: 0.25 }}
                                  >
                                    <ArrowUpwardIcon fontSize="inherit" />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    disabled={idx === programAssignedActivities.length - 1}
                                    onClick={() => {
                                      setProgramAssignedActivities((prev) => {
                                        if (idx < 0 || idx >= prev.length - 1) return prev
                                        const next = prev.slice()
                                        const tmp = next[idx + 1]
                                        next[idx + 1] = next[idx]
                                        next[idx] = tmp
                                        return next
                                      })
                                      setProgramDirty(true)
                                    }}
                                    sx={{ border: '1px solid #dbe6f7', borderRadius: 1, p: 0.25 }}
                                  >
                                    <ArrowDownwardIcon fontSize="inherit" />
                                  </IconButton>
                                </Box>
                              </td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13 }}>{a.activity || a.name || a.id}</td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 12, textAlign: 'center', fontWeight: 700, color: String(a.activity_origin || '').toLowerCase() === 'crew_created' ? '#b45309' : '#1d4ed8' }}>
                                {String(a.activity_origin || '').toLowerCase() === 'crew_created' ? 'Creada' : 'Programa'}
                              </td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13 }}>{formatNa(a.description || 'S/D')}</td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13 }}>
                                <TextField
                                  size="small"
                                  value={String(a.user_detail || '')}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setProgramAssignedActivities((prev) => prev.map((x: any) => String(x.id) === String(a.id) ? { ...x, user_detail: v } : x))
                                    setProgramDirty(true)
                                  }}
                                  placeholder="Ingresar detalle"
                                  fullWidth
                                />
                              </td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13, textAlign: 'center' }}>{a.area || ''}</td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13, textAlign: 'center' }}>{formatNa(a.quantity)}</td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13, textAlign: 'center' }}>{a.unit || ''}</td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13, textAlign: 'center' }}>{formatNa(formatDisciplineLabel(a.discipline || a.Disciplina || ''))}</td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13, textAlign: 'center' }}>{a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : ''}</td>
                              <td style={{ borderBottom: '1px solid #eef2f7', padding: '8px 10px', fontSize: 13, textAlign: 'center' }}>
                                <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center' }}>
                                  {String(a.activity_origin || '').toLowerCase() === 'crew_created' && (
                                    <Tooltip title="Editar actividad" arrow>
                                      <IconButton
                                        size="small"
                                        onClick={() => openQuickEditDialog(a)}
                                        sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}
                                      >
                                        <EditOutlinedIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  <Tooltip title="Quitar actividad" arrow>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={async () => {
                                        setProgramAssignedActivities((prev) => {
                                          const next = prev.filter((x: any) => String(x.id) !== String(a.id))
                                          const nextIds = new Set(next.map((x: any) => String(x.id)))
                                          computeProgramDirty(nextIds)
                                          return next
                                        })
                                      }}
                                      sx={{ border: '1px solid #fecaca', borderRadius: 1 }}
                                    >
                                      <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </Box>
                    </Box>
                  )}
                </Box>
                <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    label="Buscar en Programa (mín. 3 caracteres)"
                    value={programQuery}
                    onChange={(e) => {
                      const v = e.target.value
                      setProgramQuery(v)
                      if (programSearchTimeout.current) window.clearTimeout(programSearchTimeout.current)
                      if (!v || v.trim().length < 3) {
                        setProgramResults([])
                        return
                      }
                      // debounce
                      // @ts-ignore
                      programSearchTimeout.current = window.setTimeout(async () => {
                        try { await loadProgramActivities(String(v)) } catch (err) {
                          console.warn('Program search error', err)
                          setProgramResults([])
                        }
                      }, 300)
                    }}
                    fullWidth
                  />
                  <Button
                    variant={showAllProgramDisciplines ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => setShowAllProgramDisciplines((v) => !v)}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {showAllProgramDisciplines ? 'Solo mi disciplina' : 'Todas las disciplinas'}
                  </Button>
                </Box>
                <Box sx={{ maxHeight: '60vh', overflowX: 'auto', overflowY: 'auto' }}>
                  {(() => {
                    const sourceRows = (programQuery && programQuery.trim().length >= 3 ? (programResults || []) : (programActivities || []))
                    const isCrewCreated = (row: any) => String(row?.activity_origin || '').toLowerCase() === 'crew_created'
                    const programRows = sourceRows.filter((row: any) => !isCrewCreated(row))
                    const crewCreatedRows = sourceRows.filter((row: any) => isCrewCreated(row))
                    const renderRow = (p: any) => {
                      const alreadyAssigned = !!programAssignedActivities.find((a: any) => String(a.id) === String(p.id))
                      const isCrewCreated = String(p.activity_origin || '').toLowerCase() === 'crew_created'
                      return (
                        <tr key={p.id}>
                          <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>{formatActivityId(p.item_id, p.id)}</td>
                          <td style={{ border: '1px solid #eee', padding: 8 }}>{p.activity}</td>
                          <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center', fontWeight: 700, color: String(p.activity_origin || '').toLowerCase() === 'crew_created' ? '#b45309' : '#1d4ed8' }}>
                            {String(p.activity_origin || '').toLowerCase() === 'crew_created' ? 'Creada' : 'Programa'}
                          </td>
                          <td style={{ border: '1px solid #eee', padding: 8 }}>{formatNa(p.description || 'S/D')}</td>
                          <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>{p.area || ''}</td>
                          <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>{formatNa(p.package)}</td>
                          <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>{formatNa(p.quantity)}</td>
                          <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>{p.unit || ''}</td>
                          <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>{formatNa(formatDisciplineLabel(p.discipline || p.Disciplina || ''))}</td>
                          <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', flexWrap: 'wrap' }}>
                              {String(p.activity_origin || '').toLowerCase() === 'crew_created' && (
                                <Tooltip title="Editar actividad" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={() => openQuickEditDialog(p)}
                                    sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}
                                  >
                                    <EditOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Button size="small" variant={alreadyAssigned ? 'outlined' : 'contained'} onClick={() => {
                                if (alreadyAssigned) {
                                  setProgramAssignedActivities((prev) => {
                                    const next = prev.filter((x: any) => String(x.id) !== String(p.id))
                                    const nextIds = new Set(next.map((x: any) => String(x.id)))
                                    computeProgramDirty(nextIds)
                                    return next
                                  })
                                  return
                                }
                                setProgramAssignedActivities((prev) => {
                                  const exists = prev.some((x: any) => String(x.id) === String(p.id))
                                  if (exists) return prev
                                  const next = [...prev, { ...p }]
                                  const nextIds = new Set(next.map((x: any) => String(x.id)))
                                  computeProgramDirty(nextIds)
                                  return next
                                })
                              }}>
                                {alreadyAssigned && isCrewCreated ? (
                                  <Tooltip title="Quitar actividad" arrow>
                                    <DeleteOutlineIcon fontSize="small" />
                                  </Tooltip>
                                ) : (alreadyAssigned ? 'Quitar' : 'Asignar')}
                              </Button>
                            </Box>
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #1e40af', padding: 8, textAlign: 'center', position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>ID</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Actividad</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, textAlign: 'center', position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Origen</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Descripción</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, textAlign: 'center', position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Área</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, textAlign: 'center', position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Paquete</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, textAlign: 'center', position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Cantidad</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, textAlign: 'center', position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Unidad</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, textAlign: 'center', position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Disciplina</th>
                        <th style={{ border: '1px solid #1e40af', padding: 8, textAlign: 'center', position: 'sticky', top: 0, background: '#1d4ed8', color: '#fff', fontWeight: 400, zIndex: 1 }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {programRows.length > 0 && (
                        <tr>
                          <td colSpan={10} style={{ border: '1px solid #dbeafe', padding: '8px 10px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }}>
                            Actividades del Programa
                          </td>
                        </tr>
                      )}
                      {programRows.map((p: any) => renderRow(p))}
                      {crewCreatedRows.length > 0 && (
                        <tr>
                          <td colSpan={10} style={{ border: '1px solid #fde68a', padding: '8px 10px', background: '#fffbeb', color: '#b45309', fontWeight: 700 }}>
                            Actividades creadas en Cuadrillas
                          </td>
                        </tr>
                      )}
                      {crewCreatedRows.map((p: any) => renderRow(p))}
                    </tbody>
                  </table>
                    )
                  })()}
                  {loadingProgram && <Typography sx={{ mt: 1 }}>Cargando...</Typography>}
                </Box>
                  </Box>
                </Box>
              </DialogContent>
              <DialogActions sx={{ mt: 2, mb: 2, pb: 1, justifyContent: 'center' }}>
                <Button variant="outlined" sx={{ mr: 1 }} onClick={() => {
                  if (programDirty) {
                    const ok = window.confirm('Hay cambios sin guardar. Si cierras, se perderán.')
                    if (!ok) return
                  }
                  setProgramDialogOpen(false)
                  setProgramActivities([])
                  setSelectedCrewForProgram(null)
                  setProgramCrewMembers([])
                  setProgramCrewRoleIds(null)
                  setProgramAssignedActivities([])
                  setProgramInitialAssignedIds(new Set<string>())
                  setProgramDirty(false)
                }}>Cerrar</Button>
                {programDirty && (
                  <Button variant="contained" sx={{ ml: 1 }} onClick={async () => {
                    if (!selectedCrewForProgram) return
                    const currentIds = new Set(programAssignedActivities.map((a: any) => String(a.id)))
                    const added: string[] = []
                    const removed: string[] = []
                    for (const id of currentIds) {
                      if (!programInitialAssignedIds.has(id)) added.push(id)
                    }
                    for (const id of programInitialAssignedIds) {
                      if (!currentIds.has(id)) removed.push(id)
                    }
                    try {
                      if (added.length > 0) {
                        const addResponses = await Promise.all(added.map((id) => fetch(`/api/crews/${encodeURIComponent(String(selectedCrewForProgram))}/assign-program`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ activityId: id, workDate: programWorkDate })
                        })))
                        const addFailed = addResponses.find((r) => !r.ok)
                        if (addFailed) {
                          const msg = await addFailed.text()
                          throw new Error(msg || 'Error asignando actividades')
                        }
                      }
                      if (removed.length > 0) {
                        const delResponses = await Promise.all(removed.map((id) => fetch(`/api/crews/${encodeURIComponent(String(selectedCrewForProgram))}/activities`, {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ activityId: id, workDate: programWorkDate })
                        })))
                        const delFailed = delResponses.find((r) => !r.ok)
                        if (delFailed) {
                          const msg = await delFailed.text()
                          throw new Error(msg || 'Error quitando actividades')
                        }
                      }

                      // Reload latest assignments for this crew/date to get stable assignment_id values
                      // before persisting visual order and per-row details.
                      let latestAssignedByActivityId = new Map<string, { assignmentId: string | null; userDetail: string | null }>()
                      try {
                        const latestRes = await fetch(
                          `/api/crews/${encodeURIComponent(String(selectedCrewForProgram))}/activities?date=${encodeURIComponent(String(programWorkDate || ''))}`
                        )
                        if (latestRes.ok) {
                          const latestJson = await latestRes.json()
                          const latestList = Array.isArray(latestJson?.activities) ? latestJson.activities : []
                          latestList.forEach((a: any) => {
                            const aid = String(a?.id || '').trim()
                            if (!aid || latestAssignedByActivityId.has(aid)) return
                            latestAssignedByActivityId.set(aid, {
                              assignmentId: a?.assignment_id ? String(a.assignment_id) : null,
                              userDetail: a?.user_detail == null ? null : String(a.user_detail)
                            })
                          })
                        }
                      } catch {
                        // non-fatal; we'll fallback to local assignment_id if present
                      }

                      // Persist manual visual order for this crew/date.
                      if (programWorkDate && programAssignedActivities.length > 0) {
                        // Guard against accidental duplicates in UI state.
                        const dedupMap = new Map<string, { assignmentId: string | null; activityId: string }>()
                        programAssignedActivities.forEach((a: any) => {
                          const activityId = String(a?.id || '').trim()
                          if (!activityId) return
                          if (!dedupMap.has(activityId)) {
                            const latest = latestAssignedByActivityId.get(activityId)
                            dedupMap.set(activityId, {
                              assignmentId: latest?.assignmentId || (a?.assignment_id ? String(a.assignment_id) : null),
                              activityId
                            })
                          }
                        })
                        const orderPayload = Array.from(dedupMap.values()).map((row, index) => ({
                          ...row,
                          display_order: index + 1
                        }))
                        const orderRes = await fetch(`/api/crews/${encodeURIComponent(String(selectedCrewForProgram))}/activities`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ workDate: programWorkDate, orders: orderPayload })
                        })
                        if (!orderRes.ok) {
                          const msg = await orderRes.text()
                          throw new Error(msg || 'Error guardando orden visual')
                        }
                      }

                      // Save user detail (user_detail) for current assigned activities on this work date
                      if (programAssignedActivities.length > 0) {
                        const detailResponses = await Promise.all(programAssignedActivities.map((a: any) => fetch(`/api/crews/${encodeURIComponent(String(selectedCrewForProgram))}/activities`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            activityId: String(a.id),
                            assignmentId: latestAssignedByActivityId.get(String(a?.id || '').trim())?.assignmentId || (a?.assignment_id ? String(a.assignment_id) : null),
                            workDate: programWorkDate,
                            user_detail: (a.user_detail ?? '') === '' ? null : String(a.user_detail)
                          })
                        })))
                        const detailFailed = detailResponses.find((r) => !r.ok)
                        if (detailFailed) {
                          const msg = await detailFailed.text()
                          throw new Error(msg || 'Error guardando detalle de usuario')
                        }
                      }
                    } catch (e) {
                      console.error('save program activities error', e)
                      const msg = e instanceof Error ? e.message : 'Error guardando cambios'
                      alert(msg || 'Error guardando cambios')
                      return
                    }
                    await loadCrews({ force: true })
                    setProgramInitialAssignedIds(new Set(currentIds))
                    setProgramDirty(false)
                    setProgramDialogOpen(false)
                    setProgramActivities([])
                    setSelectedCrewForProgram(null)
                    setProgramCrewMembers([])
                    setProgramCrewRoleIds(null)
                    setProgramAssignedActivities([])
                  }}>Guardar</Button>
                )}
              </DialogActions>
            </Dialog>
            )}
            {!isAdminReadOnly && (
              <Dialog
                open={quickEditOpen}
                onClose={closeQuickEditDialog}
                fullWidth
                maxWidth={false}
                PaperProps={{ sx: { width: '97vw', maxWidth: '97vw', height: '95vh', maxHeight: '95vh', m: 0 } }}
              >
                <DialogTitle>Editar actividad rápida</DialogTitle>
                <DialogContent>
                  <Box sx={{ display: 'grid', gap: 1.25, mt: 0.5 }}>
                    <TextField
                      size="small"
                      label="Actividad *"
                      value={quickEditForm.activity}
                      onChange={(e) => setQuickEditForm((s) => ({ ...s, activity: e.target.value }))}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      label="Descripción"
                      value={quickEditForm.description}
                      onChange={(e) => setQuickEditForm((s) => ({ ...s, description: e.target.value }))}
                      fullWidth
                      multiline
                      minRows={2}
                    />
                    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                      <TextField
                        size="small"
                        label="Área"
                        value={quickEditForm.area}
                        onChange={(e) => setQuickEditForm((s) => ({ ...s, area: e.target.value }))}
                        fullWidth
                      />
                      <FormControl fullWidth size="small">
                        <InputLabel id="quick-edit-discipline-label">Disciplina</InputLabel>
                        <Select
                          labelId="quick-edit-discipline-label"
                          label="Disciplina"
                          value={quickEditForm.discipline || ''}
                          onChange={(e) => setQuickEditForm((s) => ({ ...s, discipline: String(e.target.value || '') }))}
                        >
                          <MenuItem value="">Sin disciplina</MenuItem>
                          {disciplineOptions.map((d) => (
                            <MenuItem key={d} value={d}>{formatDisciplineLabel(d)}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        label="Unidad"
                        value={quickEditForm.unit}
                        onChange={(e) => setQuickEditForm((s) => ({ ...s, unit: e.target.value }))}
                        fullWidth
                      />
                      <TextField
                        size="small"
                        label="Cantidad"
                        value={quickEditForm.quantity}
                        onChange={(e) => setQuickEditForm((s) => ({ ...s, quantity: e.target.value }))}
                        error={!quickEditQuantityValid}
                        helperText={!quickEditQuantityValid ? 'Debe ser numérica y mayor o igual a 0' : ' '}
                        inputProps={{ inputMode: 'decimal', min: 0, step: 'any' }}
                        fullWidth
                      />
                    </Box>
                  </Box>
                </DialogContent>
                <DialogActions>
                  <Button onClick={closeQuickEditDialog} disabled={quickEditSaving} sx={{ border: '1px solid', borderColor: colors.blue6 }}>
                    Cancelar
                  </Button>
                  <Button
                    variant="contained"
                    onClick={saveQuickEditedActivity}
                    disabled={quickEditSaving || !quickEditForm.activity.trim() || !quickEditQuantityValid}
                  >
                    {quickEditSaving ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </DialogActions>
              </Dialog>
            )}
            <Dialog open={viewDialogOpen} onClose={closeView} fullWidth maxWidth="md">
              <DialogTitle sx={{ px: 3, pt: 2, pb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                  <Typography component="span" sx={{ fontSize: 20, fontWeight: 700, minWidth: 0, flex: '0 0 auto' }}>
                    Ver cuadrilla
                  </Typography>
                  {viewDateCrewList.length > 1 ? (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        flex: { xs: '1 1 100%', sm: '0 1 auto' },
                        minWidth: 0,
                        px: 1,
                        py: 0.5,
                        border: '1px solid #cbd5e1',
                        borderRadius: 999,
                        bgcolor: '#f8fafc'
                      }}
                    >
                      <Tooltip title="Cuadrilla anterior de la misma fecha" arrow>
                        <span>
                          <IconButton
                            size="small"
                            disabled={viewLoading || !canViewPreviousCrew}
                            onClick={() => openAdjacentViewCrew(-1)}
                            sx={{ color: '#0f2d5c' }}
                          >
                            <ChevronLeft size={18} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <TextField
                        select
                        size="small"
                        value={String(viewCrewId || viewCrew?.id || '')}
                        onChange={(e) => {
                          const nextId = String(e.target.value || '').trim()
                          if (nextId) void openView(nextId)
                        }}
                        disabled={viewLoading}
                        sx={{
                          minWidth: { xs: 0, sm: 260, md: 360 },
                          maxWidth: { xs: '100%', sm: 360, md: 520 },
                          flex: '1 1 auto',
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 999,
                            bgcolor: '#ffffff'
                          },
                          '& .MuiOutlinedInput-input': {
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: { xs: 12, sm: 13 },
                            py: 0.6
                          }
                        }}
                      >
                        {viewDateCrewList.map((item: any, idx: number) => {
                          const id = String(item?.id || '').trim()
                          const label = formatCrewName(item?.name || '') || `Cuadrilla ${idx + 1}`
                          return (
                            <MenuItem key={`same-date-crew-${id || idx}`} value={id}>
                              {label}
                            </MenuItem>
                          )
                        })}
                      </TextField>
                      <Tooltip title="Cuadrilla siguiente de la misma fecha" arrow>
                        <span>
                          <IconButton
                            size="small"
                            disabled={viewLoading || !canViewNextCrew}
                            onClick={() => openAdjacentViewCrew(1)}
                            sx={{ color: '#0f2d5c' }}
                          >
                            <ChevronRight size={18} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  ) : null}
                </Box>
              </DialogTitle>
              <DialogContent>
                {viewLoading ? (
                  <Typography>Cargando...</Typography>
                ) : (
                  <>
                    <Box sx={{ mb: 2, pb: 1, borderBottom: '1px solid #eef2f7' }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>
                        {formatCrewName(viewCrew?.name || '')}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {viewCrew?.description || '—'}
                      </Typography>
                    </Box>

                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: colors.gray3 }}>Integrantes</Typography>
                    {(() => {
                      const byId = new Map((viewCrewMembers || []).map((c: any) => [String(c.id), c]))
                      const roleIds = viewCrewRoleIds || { supervisors: [], foremen: [], members: [] }
                      const renderList = (ids: string[], showHeader: boolean, showPhone: boolean) => {
                        if (!ids.length) return <Typography variant="body2" color="text.secondary">—</Typography>
                        return (
                          <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                              <colgroup>
                                <col style={{ width: showPhone ? '40%' : '50%' }} />
                                <col style={{ width: showPhone ? '30%' : '50%' }} />
                                {showPhone ? <col style={{ width: '30%' }} /> : null}
                              </colgroup>
                              {showHeader && (
                                <thead>
                                  <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ textAlign: 'left', fontWeight: 700, color: colors.gray4, fontSize: 13, padding: '8px 10px' }}>Nombre</th>
                                    <th style={{ textAlign: 'center', fontWeight: 700, color: colors.gray4, fontSize: 13, padding: '8px 10px' }}>Cargo</th>
                                    {showPhone ? <th style={{ textAlign: 'center', fontWeight: 700, color: colors.gray4, fontSize: 13, padding: '8px 10px' }}>Teléfono</th> : null}
                                  </tr>
                                </thead>
                              )}
                              <tbody>
                                {ids.map((id, idx) => {
                                  const c = byId.get(String(id)) || null
                                  const name = c ? formatCollaboratorName(c.first_name, c.last_name) : `ID:${id}`
                                  const pos = c?.position ? formatPositionLabel(c.position) : ''
                                  const phone = (c && (c.phone || c.phone_number || c.telefono || c.telefono_movil)) ? String(c.phone || c.phone_number || c.telefono || c.telefono_movil) : ''
                                  const bg = idx % 2 === 0 ? '#fff' : '#fafbff'
                                  return (
                                    <tr key={id} style={{ background: bg }}>
                                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef2f7' }}>
                                        <span
                                          style={{
                                            fontSize: 13,
                                            display: 'block',
                                            width: '100%',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                          }}
                                          title={name}
                                        >
                                          {name}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #eef2f7' }}>
                                        <span
                                          style={{
                                            fontSize: 13,
                                            color: colors.gray4,
                                            display: 'block',
                                            width: '100%',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                          }}
                                          title={pos || '—'}
                                        >
                                          {pos || '—'}
                                        </span>
                                      </td>
                                      {showPhone ? (
                                        <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #eef2f7' }}>
                                          <span style={{ fontSize: 13, color: colors.gray4 }}>{phone || '—'}</span>
                                        </td>
                                      ) : null}
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </Box>
                        )
                      }
                      return (
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2, mb: 2 }}>
                          <Box sx={{ borderRadius: 1.5, background: '#fff', p: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: colors.gray3, mb: 1 }}>Supervisores</Typography>
                            {renderList(roleIds.supervisors, true, false)}
                          </Box>
                          <Box sx={{ borderRadius: 1.5, background: '#fff', p: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: colors.gray3, mb: 1 }}>Capataces</Typography>
                            {renderList(roleIds.foremen, true, false)}
                          </Box>
                          <Box sx={{ borderRadius: 1.5, background: '#fff', p: 0, gridColumn: { xs: '1 / -1', sm: '1 / -1' } }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: colors.gray3, mb: 1 }}>Miembros</Typography>
                            {renderList(roleIds.members, true, true)}
                          </Box>
                        </Box>
                      )
                    })()}

                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: colors.gray3 }}>
                      Actividades asignadas
                    </Typography>
                    {viewAssignedActivities.length === 0 ? (
                      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5, bgcolor: '#f8fafc' }}>
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      </Paper>
                    ) : (
                      <Paper variant="outlined" sx={{ p: 0, borderRadius: 1.5, overflow: 'hidden', borderColor: '#e5e7eb' }}>
                        <Box sx={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc' }}>
                                <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'left', color: colors.gray4, fontWeight: 600, fontSize: 13 }}>Actividad</th>
                                <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'left', color: colors.gray4, fontWeight: 600, fontSize: 13 }}>Área</th>
                                <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', width: 90, color: colors.gray4, fontWeight: 600, fontSize: 13 }}>Cant.</th>
                                <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', width: 90, color: colors.gray4, fontWeight: 600, fontSize: 13 }}>Unidad</th>
                                <th style={{ borderBottom: '1px solid #eee', padding: '8px 10px', textAlign: 'center', width: 140, color: colors.gray4, fontWeight: 600, fontSize: 13 }}>Disciplina</th>
                              </tr>
                            </thead>
                            <tbody>
                              {viewAssignedActivities.slice(0, 50).map((a: any, idx: number) => (
                                <tr key={String(a?.activityId || a?.id || idx)}>
                                  <td style={{ borderBottom: '1px solid #f1f5f9', padding: 10 }}>
                                  <span style={{ fontSize: 13 }}>{a?.activity || a?.name || '—'}</span>
                                  {a?.assigned_at ? (
                                    <div style={{ color: colors.gray4, fontSize: 13, marginTop: 2 }}>
                                      Asignada: {new Date(a.assigned_at).toLocaleDateString()}
                                    </div>
                                  ) : null}
                                  </td>
                                  <td style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 10px', fontSize: 13 }}>{a?.area ? String(a.area) : ''}</td>
                                  <td style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 10px', textAlign: 'center', fontSize: 13 }}>{a?.quantity ?? ''}</td>
                                  <td style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 10px', textAlign: 'center', fontSize: 13 }}>{a?.unit || ''}</td>
                                  <td style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 10px', textAlign: 'center', fontSize: 13 }}>{formatDisciplineLabel(a?.discipline || a?.Disciplina || '')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Box>
                      </Paper>
                    )}
                  </>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={closeView} sx={{ border: '1px solid', borderColor: colors.blue6 }}>Cerrar</Button>
              </DialogActions>
            </Dialog>
          </Container>
        </Box>
      </Box>
      <Dialog open={latePolicyFeatureEnabled && latePolicyOpen} onClose={() => setLatePolicyOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Permisos fuera de horario</DialogTitle>
        <DialogContent dividers>
          {latePolicyLoading ? (
            <Typography color="text.secondary">Cargando...</Typography>
          ) : (
            <>
              <Box>
                <Typography sx={{ fontWeight: 700, mb: 1 }}>Usuarios con excepción</Typography>
                {latePolicyUsers.length === 0 ? (
                  <Typography color="text.secondary">No hay usuarios.</Typography>
                ) : (
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 1,
                      gridTemplateColumns: {
                        xs: 'repeat(1, minmax(0, 1fr))',
                        sm: 'repeat(2, minmax(0, 1fr))',
                        md: 'repeat(3, minmax(0, 1fr))'
                      }
                    }}
                  >
                    {latePolicyUsers.filter((u) => String(u.role || '').toLowerCase() !== 'admin').map((u) => {
                      const checked = !!u.allow_late_crew_creation
                      const specialty = latePolicyUserSpecialty[String(u.id)]
                      return (
                        <Button
                          key={u.id}
                          variant={checked ? 'contained' : 'outlined'}
                          color={checked ? 'success' : 'inherit'}
                          onMouseEnter={(e) => setOverflowTitle(e, `${u.name || u.email} (${u.role || 'user'})${specialty ? ` • ${specialty}` : ''}`)}
                          onClick={() => {
                            setLatePolicyUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, allow_late_crew_creation: !checked } : x))
                          }}
                          sx={{ justifyContent: 'space-between', textTransform: 'none', overflow: 'hidden' }}
                        >
                          <span data-overflow-label="true" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.name || u.email}
                          </span>
                          <span style={{ marginLeft: 8, color: checked ? '#7dd3fc' : colors.gray4, whiteSpace: 'nowrap' }}>({u.role || 'user'})</span>
                          {specialty ? (
                            <span style={{ marginLeft: 8, color: checked ? '#7dd3fc' : colors.gray4, whiteSpace: 'nowrap' }}>{formatDisciplineLabel(specialty)}</span>
                          ) : null}
                          <span style={{ marginLeft: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>{checked ? 'Activo' : 'Inactivo'}</span>
                        </Button>
                      )
                    })}
                  </Box>
                )}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLatePolicyOpen(false)} variant="outlined">Cerrar</Button>
          <Button
            variant="contained"
            disabled={latePolicySaving}
            onClick={async () => {
              setLatePolicySaving(true)
              try {
                const allowedUserIds = latePolicyUsers.filter((u) => u.allow_late_crew_creation).map((u) => u.id)
                const res = await fetch('/api/crews/late-creation-policy', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    allowedUserIds
                  })
                })
                if (!res.ok) {
                  const text = await res.text()
                  throw new Error(text || 'Error guardando')
                }
                setLatePolicyOpen(false)
              } catch (e) {
                console.error('Error saving late policy', e)
                alert('Error al guardar permisos')
              } finally {
                setLatePolicySaving(false)
              }
            }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
