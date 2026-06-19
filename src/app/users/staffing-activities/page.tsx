"use client"

import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import RefreshIcon from '@mui/icons-material/Refresh'
import SaveIcon from '@mui/icons-material/Save'
import UserHeader from '@/components/layout/UserHeader'
import { colors } from '@/theme/theme'

type Collaborator = {
  id: string
  first_name?: string | null
  last_name?: string | null
  document?: string | null
  position?: string | null
  specialty?: string | null
  worker_type?: string | null
}

type ReportFront = {
  id: string | null
  code?: string | null
  name?: string | null
  is_active?: boolean | null
}

type ActivityForm = {
  activity: string
  activity_start_time: string
  activity_end_time: string
  activity_observations: string
  restrictions: string
}

type StaffingSession = Record<string, any> & {
  id: string
  status?: string | null
  work_front_name?: string | null
  supervisor_id?: string | null
  foreman_id?: string | null
  generated_crew_id?: string | null
  workers?: any[]
  activities?: any[]
}

const todayYmd = () => new Date().toISOString().slice(0, 10)

const emptyActivity = (): ActivityForm => ({
  activity: '',
  activity_start_time: '',
  activity_end_time: '',
  activity_observations: '',
  restrictions: '',
})

const fullName = (collaborator: Partial<Collaborator> | null | undefined) =>
  [collaborator?.first_name, collaborator?.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ') || 'Sin nombre'

const fullNameUpper = (collaborator: Partial<Collaborator> | null | undefined) =>
  fullName(collaborator).toUpperCase()

const formatChileRut = (value: unknown) => {
  const raw = String(value || '')
    .replace(/\./g, '')
    .replace(/-/g, '')
    .replace(/\s/g, '')
    .toUpperCase()

  if (!raw || raw.length < 2) return ''

  const body = raw.slice(0, -1).replace(/\D/g, '')
  const dv = raw.slice(-1)

  if (!body || !/^[0-9K]$/.test(dv)) return String(value || '').trim()

  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formattedBody}-${dv}`
}

const collaboratorPositionUpper = (collaborator: Partial<Collaborator> | null | undefined) => {
  const position = String(collaborator?.position || '').trim()
  return position ? position.toUpperCase() : 'SIN CARGO'
}

const collaboratorSubtitle = (collaborator: Partial<Collaborator> | null | undefined) => {
  const position = collaboratorPositionUpper(collaborator)
  const document = formatChileRut(collaborator?.document)
  return [position, document].filter(Boolean).join(' · ')
}   

const normalizeRoleText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const collaboratorRoleText = (collaborator: Collaborator) =>
  [
    collaborator.position,
    collaborator.specialty,
    collaborator.worker_type,
  ]
    .map(normalizeRoleText)
    .filter(Boolean)
    .join(' ')

const isSupervisorCollaborator = (collaborator: Collaborator) =>
  collaboratorRoleText(collaborator).includes('supervisor')

const isForemanCollaborator = (collaborator: Collaborator) => {
  const roleText = collaboratorRoleText(collaborator)
  return roleText.includes('capataz') || roleText.includes('foreman')
}    

const frontKey = (front: ReportFront, index: number) =>
  String(front.id || front.code || front.name || `front-${index}`)

const shortId = (value: unknown) => {
  const text = String(value || '').trim()
  return text ? `${text.slice(0, 8)}...` : '-'
}

export default function StaffingActivitiesPage() {
  const [date, setDate] = useState(todayYmd())
  const [fronts, setFronts] = useState<ReportFront[]>([])
  const [frontValue, setFrontValue] = useState('')
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [supervisorId, setSupervisorId] = useState('')
  const [foremanId, setForemanId] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [activities, setActivities] = useState<ActivityForm[]>([emptyActivity()])
  const [sessions, setSessions] = useState<StaffingSession[]>([])
  const [loadingFronts, setLoadingFronts] = useState(false)
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null)

  const selectedFront = useMemo(
    () => fronts.find((front, index) => frontKey(front, index) === frontValue) || null,
    [frontValue, fronts]
  )

  const collaboratorsById = useMemo(() => {
    const map = new Map<string, Collaborator>()
    collaborators.forEach((collaborator) => map.set(String(collaborator.id), collaborator))
    return map
  }, [collaborators])

  const supervisorOptions = useMemo(
    () => collaborators.filter(isSupervisorCollaborator),
    [collaborators]
  )

  const foremanOptions = useMemo(
    () => collaborators.filter(isForemanCollaborator),
    [collaborators]
  )

  const selectableMembers = useMemo(
    () => collaborators.filter((collaborator) => collaborator.id !== supervisorId && collaborator.id !== foremanId),
    [collaborators, supervisorId, foremanId]
  )

  const loadFronts = async () => {
    try {
      setLoadingFronts(true)
      const res = await fetch('/api/report-fronts?include_inactive=1', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar los frentes')
      const rows = Array.isArray(json?.fronts) ? json.fronts : []
      setFronts(rows)
      setFrontValue((prev) => prev || (rows[0] ? frontKey(rows[0], 0) : ''))
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cargando frentes' })
    } finally {
      setLoadingFronts(false)
    }
  }

  const loadCollaborators = async (targetDate = date) => {
    if (!targetDate) return
    try {
      setLoadingCollaborators(true)
      const res = await fetch(`/api/staffing-activities/available-collaborators?date=${encodeURIComponent(targetDate)}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar colaboradores')
      const rows = Array.isArray(json?.collaborators) ? json.collaborators : []
      const validIds = new Set(rows.map((row: Collaborator) => String(row.id)))
      setCollaborators(rows)
      setSupervisorId((prev) => (prev && validIds.has(prev) ? prev : ''))
      setForemanId((prev) => (prev && validIds.has(prev) ? prev : ''))
      setMemberIds((prev) => prev.filter((id) => validIds.has(id)))
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cargando colaboradores' })
    } finally {
      setLoadingCollaborators(false)
    }
  }

  const loadSessions = async (targetDate = date) => {
    if (!targetDate) return
    try {
      setLoadingSessions(true)
      const res = await fetch(`/api/staffing-activities?date=${encodeURIComponent(targetDate)}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar jornadas')
      setSessions(Array.isArray(json?.sessions) ? json.sessions : [])
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cargando jornadas' })
    } finally {
      setLoadingSessions(false)
    }
  }

  useEffect(() => {
    void loadFronts()
  }, [])

  useEffect(() => {
    void loadCollaborators(date)
    void loadSessions(date)
  }, [date])

  const updateSupervisor = (id: string) => {
    setSupervisorId(id)
    setMemberIds((prev) => prev.filter((memberId) => memberId !== id))
  }

  const updateForeman = (id: string) => {
    setForemanId(id)
    setMemberIds((prev) => prev.filter((memberId) => memberId !== id))
  }

  const toggleMember = (id: string) => {
    if (id === supervisorId || id === foremanId) return
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const updateActivity = (index: number, patch: Partial<ActivityForm>) => {
    setActivities((prev) => prev.map((activity, idx) => (idx === index ? { ...activity, ...patch } : activity)))
  }

  const resetForm = () => {
    setSupervisorId('')
    setForemanId('')
    setMemberIds([])
    setActivities([emptyActivity()])
  }

  const addActivity = () => setActivities((prev) => [...prev, emptyActivity()])

  const removeActivity = (index: number) => {
    setActivities((prev) => (prev.length === 1 ? [emptyActivity()] : prev.filter((_, idx) => idx !== index)))
  }

  const saveDraft = async () => {
    const cleanActivities = activities
      .map((activity) => ({
        activity: activity.activity.trim(),
        activity_start_time: activity.activity_start_time || null,
        activity_end_time: activity.activity_end_time || null,
        activity_observations: activity.activity_observations.trim() || null,
        restrictions: activity.restrictions.trim() || null,
      }))
      .filter((activity) => activity.activity)

    if (!date) return setNotice({ severity: 'error', message: 'Selecciona una fecha.' })
    if (!selectedFront) return setNotice({ severity: 'error', message: 'Selecciona un frente o área de trabajo.' })
    if (!supervisorId) return setNotice({ severity: 'error', message: 'Selecciona un supervisor.' })
    if (!foremanId) return setNotice({ severity: 'error', message: 'Selecciona un capataz.' })
    if (memberIds.length === 0) return setNotice({ severity: 'error', message: 'Selecciona al menos un colaborador en turno.' })
    if (cleanActivities.length === 0) return setNotice({ severity: 'error', message: 'Ingresa al menos una actividad.' })

    try {
      setSaving(true)
      const res = await fetch('/api/staffing-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date: date,
          work_front_id: selectedFront.id || null,
          work_front_name: selectedFront.name || selectedFront.code || null,
          supervisor_id: supervisorId,
          foreman_id: foremanId,
          members: memberIds,
          activities: cleanActivities,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo guardar la cuadrilla del día')
      setNotice({ severity: 'success', message: 'Cuadrilla del día guardada como borrador.' })
      resetForm()
      await loadSessions(date)
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error guardando borrador' })
    } finally {
      setSaving(false)
    }
  }

  const deleteDraft = async (sessionId: string) => {
    if (!window.confirm('Eliminar este borrador de cuadrilla del día?')) return
    try {
      setDeletingId(sessionId)
      const res = await fetch(`/api/staffing-activities/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar el borrador')
      setNotice({ severity: 'success', message: 'Borrador eliminado.' })
      await loadSessions(date)
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error eliminando borrador' })
    } finally {
      setDeletingId(null)
    }
  }

  const closeDay = async (sessionId: string) => {
    const closureNotes = window.prompt('Notas de cierre de jornada (opcional):') ?? null
    try {
      setClosingId(sessionId)
      const res = await fetch(`/api/staffing-activities/${encodeURIComponent(sessionId)}/close`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closure_notes: closureNotes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo cerrar la jornada')
      setNotice({ severity: 'success', message: 'Jornada cerrada.' })
      await loadSessions(date)
    } catch (err) {
      setNotice({ severity: 'error', message: (err as Error)?.message || 'Error cerrando jornada' })
    } finally {
      setClosingId(null)
    }
  }

  const collaboratorLabel = (id: unknown) => {
    const text = String(id || '').trim()
    if (!text) return '-'
    const collaborator = collaboratorsById.get(text)
    return collaborator ? fullName(collaborator) : shortId(text)
  }

  return (
    <>
      <UserHeader title="Dotación y actividades" />
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack spacing={2.5}>
          <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#0f172a', mb: 1.5 }}>Cuadrilla del día</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px 1fr 1fr 1fr auto' }, gap: 1.5, alignItems: 'center' }}>
              <TextField label="Fecha" type="date" value={date} onChange={(event) => setDate(event.target.value)} InputLabelProps={{ shrink: true }} />
              <FormControl fullWidth disabled={loadingFronts}>
                <InputLabel id="front-select-label">Frente / Área de trabajo</InputLabel>
                <Select labelId="front-select-label" label="Frente / Área de trabajo" value={frontValue} onChange={(event) => setFrontValue(String(event.target.value))}>
                  {fronts.map((front, index) => (
                    <MenuItem key={frontKey(front, index)} value={frontKey(front, index)}>
                      {front.name || front.code || 'Frente sin nombre'}{front.is_active === false ? ' (inactivo)' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="supervisor-select-label">Supervisor</InputLabel>
                <Select labelId="supervisor-select-label" label="Supervisor" value={supervisorId} onChange={(event) => updateSupervisor(String(event.target.value))}>
                  {supervisorOptions.map((collaborator) => (
                    <MenuItem key={collaborator.id} value={collaborator.id}>
                      <Box>
                        <Typography sx={{ fontWeight: 850, color: '#0f172a', fontSize: 14 }}>
                          {fullNameUpper(collaborator)}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                          {collaboratorSubtitle(collaborator)}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="foreman-select-label">Capataz</InputLabel>
                <Select labelId="foreman-select-label" label="Capataz" value={foremanId} onChange={(event) => updateForeman(String(event.target.value))}>
                  {foremanOptions.map((collaborator) => (
                    <MenuItem key={collaborator.id} value={collaborator.id}>
                      <Box>
                        <Typography sx={{ fontWeight: 850, color: '#0f172a', fontSize: 14 }}>
                          {fullNameUpper(collaborator)}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                          {collaboratorSubtitle(collaborator)}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  void loadCollaborators(date)
                  void loadSessions(date)
                }}
                sx={{ textTransform: 'none', fontWeight: 800, minHeight: 56 }}
              >
                Actualizar
              </Button>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography sx={{ fontWeight: 850, color: '#0f172a' }}>Colaboradores en turno</Typography>
              {loadingCollaborators ? <CircularProgress size={20} /> : <Typography sx={{ color: '#64748b', fontSize: 13 }}>{memberIds.length} seleccionados</Typography>}
            </Stack>
            <List dense disablePadding sx={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 1 }}>
              {selectableMembers.length === 0 && !loadingCollaborators ? (
                <Typography sx={{ py: 3, color: '#64748b', textAlign: 'center' }}>No hay colaboradores disponibles para la fecha.</Typography>
              ) : null}
              {selectableMembers.map((collaborator) => {
                const checked = memberIds.includes(collaborator.id)
                return (
                  <ListItemButton key={collaborator.id} onClick={() => toggleMember(collaborator.id)}>
                    <ListItemIcon sx={{ minWidth: 38 }}>
                      <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText
                      primary={fullNameUpper(collaborator)}
                      secondary={collaboratorSubtitle(collaborator)}
                      primaryTypographyProps={{ fontWeight: 800, color: '#0f172a' }}
                      secondaryTypographyProps={{ color: '#64748b', fontSize: 12.5 }}
                    />
                  </ListItemButton>
                )
              })}
            </List>
          </Paper>

          <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#0f172a' }}>Actividades de la cuadrilla</Typography>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Se guardan en staging, sin crear cuadrillas reales.</Typography>
              </Box>
              <Button startIcon={<AddIcon />} onClick={addActivity} sx={{ textTransform: 'none', fontWeight: 800 }}>Agregar</Button>
            </Stack>
            <Stack spacing={1.25}>
              {activities.map((activity, index) => (
                <Box key={index} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.5fr 160px 160px auto' }, gap: 1 }}>
                  <TextField label="Actividad" value={activity.activity} onChange={(event) => updateActivity(index, { activity: event.target.value })} size="small" />
                  <TextField label="Hora inicio" type="time" value={activity.activity_start_time} onChange={(event) => updateActivity(index, { activity_start_time: event.target.value })} size="small" InputLabelProps={{ shrink: true }} />
                  <TextField label="Hora fin" type="time" value={activity.activity_end_time} onChange={(event) => updateActivity(index, { activity_end_time: event.target.value })} size="small" InputLabelProps={{ shrink: true }} />
                  <IconButton aria-label="Eliminar actividad" onClick={() => removeActivity(index)} sx={{ border: '1px solid #e2e8f0', borderRadius: 1 }}>
                    <DeleteOutlineIcon />
                  </IconButton>
                  <TextField
                    label="Observaciones / excepciones"
                    value={activity.activity_observations}
                    onChange={(event) => updateActivity(index, { activity_observations: event.target.value })}
                    size="small"
                    sx={{ gridColumn: { xs: '1', md: '1 / 3' } }}
                  />
                  <TextField
                    label="Restricciones"
                    value={activity.restrictions}
                    onChange={(event) => updateActivity(index, { restrictions: event.target.value })}
                    size="small"
                    sx={{ gridColumn: { xs: '1', md: '3 / -1' } }}
                  />
                </Box>
              ))}
            </Stack>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                onClick={() => void saveDraft()}
                disabled={saving}
                sx={{ textTransform: 'none', fontWeight: 900, bgcolor: colors.blue3, '&:hover': { bgcolor: colors.blue2 } }}
              >
                Guardar borrador
              </Button>
            </Stack>
          </Paper>

          <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#0f172a' }}>Borradores / jornadas registradas</Typography>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>{sessions.length} jornadas para {date}</Typography>
              </Box>
              {loadingSessions ? <CircularProgress size={22} /> : null}
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Frente</TableCell>
                    <TableCell>Supervisor</TableCell>
                    <TableCell>Capataz</TableCell>
                    <TableCell align="right">Colaboradores</TableCell>
                    <TableCell align="right">Actividades</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ color: '#64748b', py: 4 }}>No hay jornadas para la fecha.</TableCell>
                    </TableRow>
                  ) : null}
                  {sessions.map((session) => {
                    const status = String(session.status || '').toLowerCase()
                    const canChange = status === 'draft' && !session.generated_crew_id
                    return (
                      <TableRow key={session.id} hover>
                        <TableCell sx={{ fontWeight: 800 }}>{session.work_front_name || '-'}</TableCell>
                        <TableCell>{collaboratorLabel(session.supervisor_id)}</TableCell>
                        <TableCell>{collaboratorLabel(session.foreman_id)}</TableCell>
                        <TableCell align="right">{Array.isArray(session.workers) ? session.workers.length : 0}</TableCell>
                        <TableCell align="right">{Array.isArray(session.activities) ? session.activities.length : 0}</TableCell>
                        <TableCell>{session.status || '-'}</TableCell>
                        <TableCell align="right">
                          <IconButton aria-label="Cerrar jornada" disabled={!canChange || closingId === session.id} onClick={() => void closeDay(session.id)}>
                            {closingId === session.id ? <CircularProgress size={18} /> : <DoneAllIcon />}
                          </IconButton>
                          <IconButton aria-label="Eliminar borrador" disabled={!canChange || deletingId === session.id} onClick={() => void deleteDraft(session.id)}>
                            {deletingId === session.id ? <CircularProgress size={18} /> : <DeleteOutlineIcon />}
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      </Container>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice(null)}>
        {notice ? <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.message}</Alert> : undefined}
      </Snackbar>
    </>
  )
}
