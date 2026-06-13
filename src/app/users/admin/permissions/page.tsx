"use client"
import React, { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Container,
  TextField,
  Typography,
  Snackbar,
  Alert,
  Tab,
  Tabs,
} from '@mui/material'
import { colors } from '@/theme/theme'
import UserHeader from '@/components/layout/UserHeader'

type User = { id: string; name?: string; email?: string; role?: string }
type Candidate = {
  collaborator_id: string
  company_id?: string
  email?: string
  first_name?: string
  last_name?: string
}
type Summary = {
  total_workers: number
  with_access: number
  without_access: number
}

const RESOURCES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Asistencia' },
  { key: 'collaborators', label: 'Colaboradores' },
  { key: 'crews', label: 'Cuadrillas' },
  { key: 'field-reports', label: 'Reportabilidad' },
  { key: 'daily-report', label: 'Reporte diario' },
  { key: 'program', label: 'Programa' },
  { key: 'admin-permissions', label: 'Administración' },
  { key: 'management', label: 'Gestión y Datos' },
  { key: 'settings', label: 'Ajustes' },
  { key: 'profile', label: 'Perfil' },
  { key: 'epp', label: 'EPP' },
  { key: 'payroll', label: 'Nómina' }
]

const NON_DELEGABLE_RESOURCE_KEYS = new Set<string>(['admin-permissions'])
const HIDDEN_RESOURCE_KEYS = new Set<string>(['epp', 'payroll'])

export default function Page() {
  const { data: session } = useSession()
  const actorRole = String((session?.user as any)?.role || '').trim().toLowerCase()
  const visibleResources = useMemo(() => {
    const activeResources = RESOURCES.filter((r) => !HIDDEN_RESOURCE_KEYS.has(r.key))
    if (actorRole === 'dev') return activeResources
    return activeResources.filter((r) => !NON_DELEGABLE_RESOURCE_KEYS.has(r.key))
  }, [actorRole])
  const [users, setUsers] = useState<User[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [summary, setSummary] = useState<Summary>({ total_workers: 0, with_access: 0, without_access: 0 })
  const [selected, setSelected] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users')
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
    open: false,
    message: '',
    severity: 'info'
  })

  const loadUsers = async () => {
    if (!session?.user?.id) return
    setLoadingUsers(true)
    fetch('/api/admin/users')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || `Error ${r.status} al cargar usuarios`)
        return j
      })
      .then(data => {
        const allUsers: User[] = data.users || []
        const filtered = allUsers.filter(u => u.id !== session.user.id)
        setUsers(filtered)
        setCandidates(Array.isArray(data.candidates) ? data.candidates : [])
        setSummary({
          total_workers: Number(data?.summary?.total_workers || 0),
          with_access: Number(data?.summary?.with_access || 0),
          without_access: Number(data?.summary?.without_access || 0),
        })
      })
      .catch(err => {
        console.error(err)
        setUsers([])
        setCandidates([])
        setSummary({ total_workers: 0, with_access: 0, without_access: 0 })
        setToast({ open: true, message: err?.message || 'No se pudieron cargar los usuarios', severity: 'error' })
      })
      .finally(() => setLoadingUsers(false))
  }

  useEffect(() => {
    loadUsers()
  }, [session?.user?.id])

  useEffect(() => {
    if (!selected) return setPermissions({})
    setLoadingPerms(true)
    fetch(`/api/admin/users/${selected}/permissions`)
      .then(r => r.json())
      .then(data => {
        const p: Record<string, boolean> = {}
        ;(data.permissions || []).forEach((pp: any) => { p[pp.resource_key] = !!pp.can_view })
        visibleResources.forEach(r => { if (!(r.key in p)) p[r.key] = false })
        setPermissions(p)
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingPerms(false))
  }, [selected, visibleResources])

  const filteredUsers = useMemo(() => {
    const onlyUsers = users.filter((u) => String(u.role || '').trim().toLowerCase() === 'user')
    const q = query.trim().toLowerCase()
    if (!q) return onlyUsers
    return onlyUsers.filter(u => {
      const name = (u.name || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      const role = (u.role || '').toLowerCase()
      return name.includes(q) || email.includes(q) || role.includes(q)
    })
  }, [users, query])

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return candidates.filter(c => {
      const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase()
      const email = String(c.email || '').toLowerCase()
      return fullName.includes(q) || email.includes(q)
    })
  }, [candidates, query])

  const selectedUser = useMemo(() => users.find(u => u.id === selected) || null, [users, selected])

  const handleToggle = (key: string) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    const payload = { permissions: visibleResources.map(r => ({ resource_key: r.key, can_view: !!permissions[r.key] })) }
    try {
      const res = await fetch(`/api/admin/users/${selected}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error saving')
      setToast({ open: true, message: 'Permisos guardados correctamente', severity: 'success' })
    } catch (e: any) {
      console.error(e)
      setToast({ open: true, message: e?.message || 'Error al guardar permisos', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleConvertCandidate = async (candidate: Candidate) => {
    if (!candidate?.collaborator_id) return
    setConvertingId(candidate.collaborator_id)
    try {
      const res = await fetch('/api/admin/users/convert-collaborator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collaborator_id: candidate.collaborator_id })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo convertir colaborador')
      await loadUsers()
      if (json?.user?.id) setSelected(String(json.user.id))
      setToast({ open: true, message: 'Colaborador convertido a usuario', severity: 'success' })
    } catch (e: any) {
      console.error(e)
      setToast({ open: true, message: e?.message || 'Error al convertir colaborador', severity: 'error' })
    } finally {
      setConvertingId(null)
    }
  }

  const enabledCount = Object.values(permissions).filter(Boolean).length

  return (
    <Box sx={{ display: 'flex' }}>
      <Box sx={{ flex: 1 }}>
        <UserHeader title="Administración" />
        <Box component="main">
          <Container
            maxWidth={false}
            disableGutters
            sx={{ py: 3, width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 } }}
          >
            <Tabs
              value={activeTab}
              onChange={(_event, value) => setActiveTab(value)}
              sx={{ mb: 2, borderBottom: '1px solid #e5e7eb' }}
            >
              <Tab value="users" label="Usuarios y permisos" />
              <Tab value="audit" label="Auditoría" />
            </Tabs>

            {activeTab === 'users' && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, color: colors.blue6 }}>
                  Gestión de permisos
                </Typography>
                <Typography variant="body2" sx={{ color: colors.gray4 }}>
                  Asigna accesos por módulo para cada usuario.
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '40% 60%' }, gap: 2 }}>
                <Paper sx={{ p: 2, borderRadius: 1.5, height: 'fit-content' }}>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: colors.gray2 }}>
                      Usuarios
                    </Typography>
                    <TextField
                      size="small"
                      placeholder="Buscar user por nombre o email"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <Divider />
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Chip size="small" color="default" label={`Total: ${summary.total_workers}`} />
                      <Chip size="small" color="success" label={`Con acceso: ${summary.with_access}`} />
                      <Chip size="small" color="warning" label={`Sin acceso: ${summary.without_access}`} />
                    </Stack>
                    {loadingUsers && (
                      <Stack alignItems="center" sx={{ py: 2 }}>
                        <CircularProgress size={24} />
                      </Stack>
                    )}
                    {!loadingUsers && filteredUsers.length === 0 && (
                      query.trim() ? (
                        <Typography variant="body2" sx={{ color: colors.gray4 }}>
                          No hay usuarios para mostrar.
                        </Typography>
                      ) : (
                        <Typography variant="body2" sx={{ color: colors.gray4 }}>
                          No hay usuarios con rol `user` para mostrar.
                        </Typography>
                      )
                    )}
                    {!loadingUsers && filteredUsers.length > 0 && (
                      <List dense sx={{ maxHeight: 420, overflow: 'auto' }}>
                        {filteredUsers.map(u => {
                          const isActive = u.id === selected
                          return (
                            <ListItem key={u.id} disablePadding>
                              <ListItemButton
                                selected={isActive}
                                onClick={() => setSelected(u.id)}
                                sx={{
                                  borderRadius: 1,
                                  mb: 0.5,
                                  '&.Mui-selected': { backgroundColor: colors.gray9 }
                                }}
                              >
                                <ListItemText
                                  primary={u.name ? u.name.toUpperCase() : u.email}
                                  secondary={u.email && u.name ? u.email : undefined}
                                />
                                {u.role ? <Chip size="small" label={u.role} color="default" /> : null}
                              </ListItemButton>
                            </ListItem>
                          )
                        })}
                      </List>
                    )}
                    {!loadingUsers && filteredCandidates.length > 0 && (
                      <>
                        <Divider />
                        <Typography variant="subtitle2" sx={{ color: colors.gray2 }}>
                          Colaboradores convertibles
                        </Typography>
                        <List dense sx={{ maxHeight: 220, overflow: 'auto' }}>
                          {filteredCandidates.map((c) => {
                            const label = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Sin nombre'
                            return (
                              <ListItem key={c.collaborator_id} disablePadding>
                                <ListItemButton sx={{ borderRadius: 1, mb: 0.5 }}>
                                  <ListItemText
                                    primary={label.toUpperCase()}
                                    secondary={c.email || 'Sin email'}
                                  />
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleConvertCandidate(c)}
                                    disabled={convertingId === c.collaborator_id}
                                  >
                                    {convertingId === c.collaborator_id ? 'Convirtiendo...' : 'Convertir a user'}
                                  </Button>
                                </ListItemButton>
                              </ListItem>
                            )
                          })}
                        </List>
                      </>
                    )}
                  </Stack>
                </Paper>

                <Paper sx={{ p: 2, borderRadius: 1.5 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: colors.gray2 }}>
                        Permisos
                      </Typography>
                      {!selectedUser && (
                        <Typography variant="body2" sx={{ color: colors.gray4 }}>
                          Selecciona un usuario para ver y editar sus permisos.
                        </Typography>
                      )}
                      {selectedUser && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                          <Typography variant="body2" sx={{ color: colors.gray4 }}>
                            {selectedUser.name ? selectedUser.name.toUpperCase() : selectedUser.email}
                          </Typography>
                          {selectedUser.role ? <Chip size="small" label={selectedUser.role} color="default" /> : null}
                        </Stack>
                      )}
                    </Box>

                    <Divider />

                    {!selectedUser && (
                      <Box sx={{ py: 6, textAlign: 'center', color: colors.gray4 }}>
                        <Typography variant="body1">Sin usuario seleccionado</Typography>
                        <Typography variant="body2">Elige un usuario a la izquierda.</Typography>
                      </Box>
                    )}

                    {selectedUser && (
                      <>
                        {loadingPerms && (
                          <Stack alignItems="center" sx={{ py: 2 }}>
                            <CircularProgress size={24} />
                          </Stack>
                        )}
                        {!loadingPerms && (
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                            {visibleResources.map(r => (
                              <Paper key={r.key} variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                  <Checkbox checked={!!permissions[r.key]} onChange={() => handleToggle(r.key)} />
                                  <Typography>{r.label}</Typography>
                                </Stack>
                              </Paper>
                            ))}
                          </Box>
                        )}
                        <Divider />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                          <Typography variant="body2" sx={{ color: colors.gray4 }}>
                            {enabledCount} permisos activos
                          </Typography>
                          <Button variant="contained" onClick={handleSave} disabled={saving || loadingPerms}>
                            {saving ? 'Guardando...' : 'Guardar cambios'}
                          </Button>
                        </Stack>
                      </>
                    )}
                  </Stack>
                </Paper>
              </Box>
            </Stack>
            )}

            {activeTab === 'audit' && (
              <Paper sx={{ p: 3, borderRadius: 1.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: colors.blue6, mb: 1 }}>
                  Auditoría
                </Typography>
                <Typography variant="body2" sx={{ color: colors.gray4 }}>
                  La trazabilidad de acciones estará disponible próximamente.
                </Typography>
              </Paper>
            )}
          </Container>
        </Box>
        <Snackbar
          open={toast.open}
          autoHideDuration={3500}
          onClose={() => setToast(prev => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setToast(prev => ({ ...prev, open: false }))}
            severity={toast.severity}
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  )
}
