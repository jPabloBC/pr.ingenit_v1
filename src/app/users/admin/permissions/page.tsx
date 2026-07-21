"use client"
import React, { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Box,
  CircularProgress,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Container,
  Typography,
  Snackbar,
} from '@mui/material'
import { FactCheckOutlined, ManageAccountsOutlined } from '@mui/icons-material'
import { colors } from '@/theme/theme'
import UserHeader from '@/components/layout/UserHeader'
import { MANAGEMENT_TAB_DEFINITIONS } from '@/lib/managementPermissions'
import { AppAlert } from '@/components/ui/AppAlert'
import { AppButton } from '@/components/ui/AppButton'
import { AppSearchField } from '@/components/ui/FormControls'
import { AppCheckbox, AppChip } from '@/components/ui/InteractiveControls'
import { AppTabs } from '@/components/ui/AppTabs'

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

type ResourceOption = { key: string; label: string; children?: Array<{ key: string; label: string }> }

const RESOURCES: ResourceOption[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Asistencia' },
  { key: 'collaborators', label: 'Colaboradores' },
  { key: 'staffing-activities', label: 'Dotación y actividades' },
  { key: 'crews', label: 'Cuadrillas' },
  { key: 'field-reports', label: 'Reportabilidad' },
  { key: 'daily-report', label: 'Reporte diario' },
  { key: 'program', label: 'Programa' },
  { key: 'admin-permissions', label: 'Administración' },
  { key: 'management', label: 'Gestión y Datos', children: MANAGEMENT_TAB_DEFINITIONS.map((tab) => ({
    key: tab.permissionKey,
    label: tab.label,
  })) },
  { key: 'communications', label: 'Comunicaciones', children: [
    { key: 'communications.send', label: 'Envíos' },
    { key: 'communications.forms', label: 'Formulario' },
  ] },
  { key: 'settings', label: 'Ajustes' },
  { key: 'profile', label: 'Perfil' },
  { key: 'epp', label: 'EPP' },
  { key: 'payroll', label: 'Nómina' }
]

const NON_DELEGABLE_RESOURCE_KEYS = new Set<string>(['admin-permissions'])
const HIDDEN_RESOURCE_KEYS = new Set<string>(['epp', 'payroll'])

export default function Page() {
  const { data: session } = useSession()
  const actorRole = String(session?.user?.role || '').trim().toLowerCase()
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
        ;(data.permissions || []).forEach((permission: { resource_key?: string; can_view?: boolean }) => {
          const key = String(permission.resource_key || '').trim()
          if (key) p[key] = Boolean(permission.can_view)
        })
        visibleResources.forEach(r => {
          if (!(r.key in p)) p[r.key] = false
          r.children?.forEach((child) => {
            if (!(child.key in p)) p[child.key] = Boolean(p[r.key])
          })
        })
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
    const resource = visibleResources.find((item) => item.key === key)
    if (resource?.children?.length) {
      setPermissions((previous) => {
        const enable = !resource.children?.every((child) => Boolean(previous[child.key]))
        const next = { ...previous, [resource.key]: false }
        resource.children?.forEach((child) => { next[child.key] = enable })
        return next
      })
      return
    }
    setPermissions((previous) => ({ ...previous, [key]: !previous[key] }))
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    const payload = {
      permissions: visibleResources.flatMap((resource) => resource.children?.length
        ? [
          { resource_key: resource.key, can_view: false },
          ...resource.children.map((child) => ({ resource_key: child.key, can_view: Boolean(permissions[child.key]) })),
        ]
        : [{ resource_key: resource.key, can_view: Boolean(permissions[resource.key]) }]),
    }
    try {
      const res = await fetch(`/api/admin/users/${selected}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error saving')
      setToast({ open: true, message: 'Permisos guardados correctamente', severity: 'success' })
    } catch (e: unknown) {
      console.error(e)
      setToast({ open: true, message: e instanceof Error ? e.message : 'Error al guardar permisos', severity: 'error' })
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
    } catch (e: unknown) {
      console.error(e)
      setToast({ open: true, message: e instanceof Error ? e.message : 'Error al convertir colaborador', severity: 'error' })
    } finally {
      setConvertingId(null)
    }
  }

  const enabledCount = visibleResources.filter((resource) => resource.children?.length
    ? resource.children.some((child) => Boolean(permissions[child.key]))
    : Boolean(permissions[resource.key])).length

  return (
    <Box sx={{ display: 'flex', width: '100%', minHeight: '100vh', bgcolor: colors.managementWhiteSoft }}>
      <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
        <UserHeader title="Administración" />
        <Container
          component="main"
          maxWidth={false}
          disableGutters
          sx={{ width: '100%', maxWidth: '100%', px: 0, pt: 0, pb: 2 }}
        >
          <Stack spacing={0}>
            <AppTabs
              ariaLabel="Secciones de Administración"
              value={activeTab}
              onChange={(value) => setActiveTab(value as typeof activeTab)}
              minItemWidth={160}
              items={[
                { value: 'users', label: 'Usuarios y permisos', icon: <ManageAccountsOutlined /> },
                { value: 'audit', label: 'Auditoría', icon: <FactCheckOutlined /> },
              ]}
            />

            <Box sx={{ minWidth: 0, px: { xs: 1, sm: 1.5, md: 2 }, pt: 2 }}>

            {activeTab === 'users' && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, color: colors.blue3 }}>
                  Gestión de permisos
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Asigna accesos por módulo y, cuando corresponda, por pestaña.
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, 36%) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
                <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderColor: colors.managementBorder, borderRadius: 1.5 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: colors.blue3 }}>
                      Usuarios
                    </Typography>
                    <AppSearchField
                      label="Buscar usuario"
                      placeholder="Nombre o correo electrónico"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <Divider />
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      <AppChip size="small" variant="outlined" label={`Total: ${summary.total_workers}`} />
                      <AppChip size="small" color="success" variant="outlined" label={`Con acceso: ${summary.with_access}`} />
                      <AppChip size="small" color="warning" variant="outlined" label={`Sin acceso: ${summary.without_access}`} />
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
                      <List dense disablePadding sx={{ maxHeight: 420, overflow: 'auto', border: `1px solid ${colors.managementBorder}`, borderRadius: 1, '& .MuiListItem-root:not(:last-child)': { borderBottom: `1px solid ${colors.managementBorder}` } }}>
                        {filteredUsers.map(u => {
                          const isActive = u.id === selected
                          return (
                            <ListItem key={u.id} disablePadding>
                              <ListItemButton
                                selected={isActive}
                                onClick={() => setSelected(u.id)}
                                sx={{
                                  minHeight: 56,
                                  borderRadius: 0,
                                  '&.Mui-selected': { backgroundColor: colors.blue50, color: colors.blue3 },
                                  '&.Mui-selected:hover': { backgroundColor: colors.blue100 },
                                }}
                              >
                                <ListItemText
                                  primary={u.name ? u.name.toUpperCase() : u.email}
                                  secondary={u.email && u.name ? u.email : undefined}
                                />
                                {u.role ? <AppChip size="small" label={u.role} variant="outlined" /> : null}
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
                        <List dense disablePadding sx={{ maxHeight: 220, overflow: 'auto', border: `1px solid ${colors.managementBorder}`, borderRadius: 1, '& .MuiListItem-root:not(:last-child)': { borderBottom: `1px solid ${colors.managementBorder}` } }}>
                          {filteredCandidates.map((c) => {
                            const label = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Sin nombre'
                            return (
                              <ListItem key={c.collaborator_id} disablePadding>
                                <ListItemButton sx={{ minHeight: 56 }}>
                                  <ListItemText
                                    primary={label.toUpperCase()}
                                    secondary={c.email || 'Sin email'}
                                  />
                                  <AppButton
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleConvertCandidate(c)}
                                    disabled={convertingId === c.collaborator_id}
                                  >
                                    {convertingId === c.collaborator_id ? 'Convirtiendo...' : 'Convertir a user'}
                                  </AppButton>
                                </ListItemButton>
                              </ListItem>
                            )
                          })}
                        </List>
                      </>
                    )}
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderColor: colors.managementBorder, borderRadius: 1.5 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: colors.blue3 }}>
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
                          {selectedUser.role ? <AppChip size="small" label={selectedUser.role} variant="outlined" /> : null}
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
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                            {visibleResources.map((resource) => {
                              const childValues = resource.children?.map((child) => Boolean(permissions[child.key])) || []
                              const allChildren = childValues.length > 0 && childValues.every(Boolean)
                              const someChildren = childValues.some(Boolean)
                              const enabled = resource.children?.length ? someChildren : Boolean(permissions[resource.key])
                              return <Paper
                                key={resource.key}
                                variant="outlined"
                                sx={{
                                  p: 1.25,
                                  borderRadius: 1,
                                  borderColor: enabled ? colors.blue600 : colors.managementBorder,
                                  bgcolor: enabled ? colors.blue50 : colors.white,
                                  transition: 'border-color 180ms ease, background-color 180ms ease',
                                }}
                              >
                                <Stack spacing={resource.children?.length ? 0.75 : 0}>
                                  <Stack direction="row" alignItems="center" spacing={1}>
                                    <AppCheckbox checked={resource.children?.length ? allChildren : Boolean(permissions[resource.key])} indeterminate={Boolean(resource.children?.length && someChildren && !allChildren)} onChange={() => handleToggle(resource.key)} />
                                    <Typography sx={{ fontWeight: enabled ? 600 : 400, color: enabled ? colors.blue3 : 'text.primary' }}>{resource.label}</Typography>
                                  </Stack>
                                  {resource.children?.length ? <Stack sx={{ pl: 4.5 }}>
                                    {resource.children.map((child) => <FormControlLabel key={child.key} control={<AppCheckbox size="small" checked={Boolean(permissions[child.key])} onChange={() => handleToggle(child.key)} />} label={child.label} />)}
                                  </Stack> : null}
                                </Stack>
                              </Paper>
                            })}
                          </Box>
                        )}
                        <Divider />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                          <Typography variant="body2" sx={{ color: colors.gray4 }}>
                            {enabledCount} permisos activos
                          </Typography>
                          <AppButton variant="contained" onClick={handleSave} disabled={saving || loadingPerms}>
                            {saving ? 'Guardando...' : 'Guardar cambios'}
                          </AppButton>
                        </Stack>
                      </>
                    )}
                  </Stack>
                </Paper>
              </Box>
            </Stack>
            )}

            {activeTab === 'audit' && (
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 1.5, borderColor: colors.managementBorder }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: colors.blue3, mb: 1 }}>
                  Auditoría
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  La trazabilidad de acciones estará disponible próximamente.
                </Typography>
              </Paper>
            )}
            </Box>
          </Stack>
        </Container>
        <Snackbar
          open={toast.open}
          autoHideDuration={3500}
          onClose={() => setToast(prev => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <AppAlert
            onClose={() => setToast(prev => ({ ...prev, open: false }))}
            severity={toast.severity}
            sx={{ width: '100%' }}
          >
            {toast.message}
          </AppAlert>
        </Snackbar>
      </Box>
    </Box>
  )
}
