"use client"

import React, { useEffect, useState, useLayoutEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper,
  Chip,
  Button,
  
} from '@mui/material'
import { colors } from '../../../theme/theme'

type User = {
  id: string
  name: string | null
  email: string | null
  company_id: number | null
  role: string | null
}

type Permission = {
  id: number
  user_id: string
  company_id: number | null
  resource_key: string
  can_view: boolean
}

type Company = {
  id: number
  name: string | null
}

type Candidate = {
  collaborator_id: string
  company_id: number | string | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
}

export default function DevUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingIds, setUpdatingIds] = useState<Array<number | string>>([])

  const [RESOURCES, setRESOURCES] = useState<{ key: string; label: string; path?: string }[]>([
    { key: 'dashboard', label: 'dashboard' },
    { key: 'attendance', label: 'asistencia' },
    { key: 'collaborators', label: 'colaboradores' },
    { key: 'crews', label: 'cuadrillas' },
    { key: 'field-reports', label: 'reportes' },
    { key: 'daily-report', label: 'reporte diario' },
    { key: 'program', label: 'programa' },
    { key: 'epp', label: 'EPP' },
    { key: 'profile', label: 'perfil' },
    { key: 'payroll', label: 'nómina' },
  ])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/dev/signin')
  }, [status, router])

  useEffect(() => {
    let mounted = true
    async function loadAll() {
      setLoading(true)
      try {
        const [cRes, uRes, pRes, adminUsersRes] = await Promise.all([
          fetch('/api/dev/companies').then(r => r.json()),
          fetch('/api/dev/users').then(r => r.json()),
          fetch('/api/dev/user-permissions').then(r => r.json()),
          fetch('/api/admin/users').then(r => r.json()),
        ])

        // fetch dynamic screens list for resources
        try {
          const sRes = await fetch('/api/dev/user-screens').then(r => r.json())
          if (!sRes.error && Array.isArray(sRes.screens)) {
            // dedupe by label, prefer the most specific (longest) path
            const grouped = new Map<string, any[]>()
            sRes.screens.forEach((s: any) => {
              const arr = grouped.get(s.label) || []
              arr.push(s)
              grouped.set(s.label, arr)
            })
            const LABEL_OVERRIDES: Record<string, string> = {
              'daily-report': 'reporte diario',
              'field-reports': 'reportes',
            }
            const resolved: { key: string; label: string; path?: string }[] = []
            for (const [label, arr] of grouped.entries()) {
              arr.sort((a, b) => (b.path || '').length - (a.path || '').length)
              const chosen = arr[0]
              resolved.push({ key: chosen.key, label: LABEL_OVERRIDES[chosen.key] || chosen.label, path: chosen.path })
            }
            resolved.sort((a, b) => a.key.localeCompare(b.key))
            setRESOURCES(resolved)
          }
        } catch (e) {
          // ignore; keep defaults
        }

        if (!mounted) return

        if (cRes.error) throw new Error(cRes.error)
        if (uRes.error) throw new Error(uRes.error)
        if (pRes.error) throw new Error(pRes.error)
        if (adminUsersRes.error) throw new Error(adminUsersRes.error)

        setCompanies(cRes.companies || [])
        setUsers(uRes.users || [])
        setPermissions(pRes.permissions || [])
        setCandidates(Array.isArray(adminUsersRes.candidates) ? adminUsersRes.candidates : [])
      } catch (err: any) {
        setError(err?.message || String(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }
    if (session && String(session.user?.role) === 'dev') loadAll()
    return () => {
      mounted = false
    }
  }, [session])

  if (status === 'loading' || loading)
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    )

  if (error)
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Error: {error}</Typography>
      </Box>
    )

  const companyMap = new Map<number | null, string>()
  companies.forEach((c: any) => companyMap.set(c.id, c.name || `Empresa ${c.id}`))

  const usersByCompany = new Map<number | 'none', User[]>()
  users.forEach(u => {
    if (u.role === 'dev') return
    const key = u.company_id ?? 'none'
    const arr = usersByCompany.get(key) || []
    arr.push(u)
    usersByCompany.set(key, arr)
  })

  const permsByUser = new Map<string, Permission[]>()
  permissions.forEach(p => {
    const arr = permsByUser.get(p.user_id) || []
    arr.push(p)
    permsByUser.set(p.user_id, arr)
  })

  const candidatesByCompany = new Map<number | string | 'none', Candidate[]>()
  candidates.forEach((c) => {
    const key = (c.company_id as any) ?? 'none'
    const arr = candidatesByCompany.get(key) || []
    arr.push(c)
    candidatesByCompany.set(key, arr)
  })

  function PermissionButtons({ perms, user }: { perms: Permission[]; user?: User }) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [singleRow, setSingleRow] = useState(true)

    useLayoutEffect(() => {
      const el = containerRef.current
      if (!el) return
      const check = () => {
        // force single row on large viewports (md+)
        if (typeof window !== 'undefined' && window.innerWidth >= 960) {
          setSingleRow(true)
          return
        }
        // otherwise detect if content fits in container
        const fits = el.scrollWidth <= el.clientWidth + 1
        setSingleRow(fits)
      }
      check()
      const ro = new ResizeObserver(check)
      ro.observe(el)
      if (el.parentElement) ro.observe(el.parentElement)
      window.addEventListener('resize', check)
      return () => {
        ro.disconnect()
        window.removeEventListener('resize', check)
      }
    }, [perms.length, updatingIds.join(',')])

    // render all known RESOURCES; if a permission exists show toggle, otherwise show "add" button
    const orderedResources = RESOURCES

    // aggressive button styles for single-row mode on large screens
    const aggressiveBtnSx = (theme: any) => ({
      textTransform: 'none',
      minWidth: 0,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      backgroundColor: undefined,
      color: undefined,
      '&:hover': {},
      px: 0.75,
      py: 0.4,
      fontSize: '0.82rem',
      borderRadius: 1,
      [theme.breakpoints.up('lg')]: {
        px: 0.9,
        fontSize: '0.88rem'
      }
    })

    return (
      <Box
        ref={containerRef}
        sx={{
          display: 'flex',
          gap: 0.5,
          flexWrap: singleRow ? 'nowrap' : 'wrap',
          alignItems: 'center',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {orderedResources.map(r => {
          const perm = perms.find(p => p.resource_key === r.key)
          if (perm) {
            return (
              <Box key={perm.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, alignItems: 'stretch', minWidth: 0, flex: singleRow ? '1 1 0' : '1 1 100%' }}>
                <Button
                  fullWidth={!singleRow}
                  size="small"
                  variant={perm.can_view ? 'contained' : 'outlined'}
                  onClick={() => togglePermission(perm, !perm.can_view)}
                  sx={(theme) => ({
                    ...(singleRow ? aggressiveBtnSx(theme) : { textTransform: 'none', px: 1.5, py: 0.5, fontSize: '0.95rem' }),
                    backgroundColor: perm.can_view ? '#16a34a' : undefined,
                    color: perm.can_view ? '#fff' : undefined,
                    '&:hover': { backgroundColor: perm.can_view ? '#15803d' : undefined },
                  })}
                >
                  {r.label}
                </Button>
                {updatingIds.includes(perm.id) && <Typography variant="caption" color="text.secondary">guardando...</Typography>}
              </Box>
            )
          }

          // no existing permission — render add button
          const tempKey = `new:${user?.id || 'unknown'}:${r.key}`
          return (
            <Box key={r.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, alignItems: 'stretch', minWidth: 0, flex: singleRow ? '1 1 0' : '1 1 100%' }}>
              <Button
                fullWidth={!singleRow}
                size="small"
                variant="outlined"
                onClick={() => createPermission(user, r.key)}
                disabled={!user}
                sx={(theme) => ({
                  ...(singleRow ? aggressiveBtnSx(theme) : { textTransform: 'none', px: 1.5, py: 0.5, fontSize: '0.95rem' }),
                })}
              >
                {r.label}
              </Button>
              {updatingIds.includes(tempKey) && <Typography variant="caption" color="text.secondary">guardando...</Typography>}
            </Box>
          )
        })}
      </Box>
    )
  }

  const togglePermission = async (perm: Permission, checked: boolean) => {
    // optimistic update: apply change locally first for immediate UI feedback
    setUpdatingIds(prev => [...prev, perm.id])
    const previous = permissions
    setPermissions(prev => prev.map(p => (p.id === perm.id ? { ...p, can_view: checked } : p)))
    try {
      const res = await fetch(`/api/dev/user-permissions/${perm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ can_view: checked }),
      })
      const json = await res.json()
      if (res.ok && json.permission) {
        setPermissions(prev => prev.map(p => (p.id === json.permission.id ? json.permission : p)))
      } else {
        console.error('Update failed', json)
        // revert
        setPermissions(previous)
        alert('Error actualizando permiso')
      }
    } catch (err) {
      console.error(err)
      setPermissions(previous)
      alert('Error de red')
    } finally {
      setUpdatingIds(prev => prev.filter(x => x !== perm.id))
    }
  }

  const createPermission = async (user: User | undefined, resourceKey: string) => {
    if (!user) return
    const tempKey = `new:${user.id}:${resourceKey}`
    setUpdatingIds(prev => [...prev, tempKey])
    try {
      const res = await fetch('/api/dev/user-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, resource_key: resourceKey, company_id: user.company_id, can_view: true }),
      })
      const json = await res.json()
      if (res.ok && json.permission) {
        setPermissions(prev => [...prev, json.permission])
      } else {
        alert('Error creando permiso')
      }
    } catch (err) {
      console.error(err)
      alert('Error de red')
    } finally {
      setUpdatingIds(prev => prev.filter(x => x !== tempKey))
    }
  }

  const convertCandidate = async (candidate: Candidate) => {
    const id = String(candidate.collaborator_id)
    if (!id) return
    const tempKey = `convert:${id}`
    setUpdatingIds(prev => [...prev, tempKey])
    try {
      const res = await fetch('/api/admin/users/convert-collaborator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collaborator_id: id }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json?.error || 'Error convirtiendo colaborador')
        return
      }
      // Reload full view so new user appears in its company table.
      const [uRes, pRes, adminUsersRes] = await Promise.all([
        fetch('/api/dev/users').then(r => r.json()),
        fetch('/api/dev/user-permissions').then(r => r.json()),
        fetch('/api/admin/users').then(r => r.json()),
      ])
      if (!uRes.error) setUsers(uRes.users || [])
      if (!pRes.error) setPermissions(pRes.permissions || [])
      if (!adminUsersRes.error) setCandidates(Array.isArray(adminUsersRes.candidates) ? adminUsersRes.candidates : [])
    } catch (err) {
      console.error(err)
      alert('Error de red')
    } finally {
      setUpdatingIds(prev => prev.filter(x => x !== tempKey))
    }
  }

  const companyKeys = Array.from(usersByCompany.keys())

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Usuarios por Compañía</Typography>
        <Typography variant="body2" color="text.secondary">{users.length} usuarios</Typography>
      </Box>

      {companyKeys.length === 0 && <Typography color="text.secondary">No se encontraron usuarios.</Typography>}

      <Box sx={{ display: 'grid', gap: 16, gridTemplateColumns: { xs: '1fr', md: '1fr' } }}>
        {companyKeys.map(key => {
          const compName = key === 'none' ? 'Sin compañía' : companyMap.get(key as number) || `Empresa ${String(key)}`
          const list = usersByCompany.get(key) || []
          return (
              <Box key={String(key)}>
                <Paper elevation={1} sx={{ overflow: 'hidden' }}>
                <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${colors.blue13}12`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">{compName}</Typography>
                  <Typography variant="body2" color="text.secondary">{list.length} usuario(s)</Typography>
                </Box>
                <TableContainer sx={{ width: '100%', overflowX: 'hidden' }}>
                  {(() => {
                    const companyCandidates = candidatesByCompany.get(key) || []
                    if (!companyCandidates.length) return null
                    return (
                      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${colors.blue13}12` }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Colaboradores convertibles ({companyCandidates.length})
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {companyCandidates.map((c) => {
                            const id = String(c.collaborator_id)
                            const tempKey = `convert:${id}`
                            const fullName = `${String(c.first_name || '').trim()} ${String(c.last_name || '').trim()}`.trim() || String(c.email || 'Sin nombre')
                            return (
                              <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, border: `1px solid ${colors.blue13}33`, borderRadius: 1, px: 1, py: 0.5 }}>
                                <Typography variant="body2">{fullName}</Typography>
                                <Button size="small" variant="outlined" onClick={() => convertCandidate(c)} disabled={updatingIds.includes(tempKey)}>
                                  {updatingIds.includes(tempKey) ? '...' : 'Convertir'}
                                </Button>
                              </Box>
                            )
                          })}
                        </Box>
                      </Box>
                    )
                  })()}
                  <Table size="small" sx={{ width: '100%', tableLayout: 'auto' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ whiteSpace: 'nowrap', width: '1%' }}>Nombre</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', width: '1%' }}>Correo</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', width: '1%' }}>Rol</TableCell>
                        <TableCell>Pantallas (acceso)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {list.map(u => (
                        <TableRow key={u.id}>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{u.name || u.id}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{u.email}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Chip label={u.role} size="small" color="primary" />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(auto-fit, minmax(140px, 1fr))' }, alignItems: 'start', width: '100%' }}>
                              {(() => {
                                const perms = permsByUser.get(u.id) || []
                                // render all known resources; allow creating missing permissions
                                return RESOURCES.map(r => {
                                  const perm = perms.find(p => p.resource_key === r.key)
                                  if (perm) {
                                    return (
                                      <Box key={perm.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'stretch', minWidth: 0 }}>
                                        <Button
                                          fullWidth
                                          size="small"
                                          variant={perm.can_view ? 'contained' : 'outlined'}
                                          onClick={() => togglePermission(perm, !perm.can_view)}
                                          sx={{
                                            textTransform: 'none',
                                            minWidth: 0,
                                            whiteSpace: 'normal',
                                            wordBreak: 'break-word',
                                            overflow: 'visible',
                                            backgroundColor: perm.can_view ? '#16a34a' : undefined,
                                            color: perm.can_view ? '#fff' : undefined,
                                            '&:hover': { backgroundColor: perm.can_view ? '#15803d' : undefined },
                                          }}
                                        >
                                          {r.label}
                                        </Button>
                                        {updatingIds.includes(perm.id) && <Typography variant="caption" color="text.secondary">guardando...</Typography>}
                                      </Box>
                                    )
                                  }

                                  const tempKey = `new:${u.id}:${r.key}`
                                  return (
                                    <Box key={r.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'stretch', minWidth: 0 }}>
                                      <Button
                                        fullWidth
                                        size="small"
                                        variant="outlined"
                                        onClick={() => createPermission(u, r.key)}
                                        sx={{ textTransform: 'none', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}
                                      >
                                        {r.label}
                                      </Button>
                                      {updatingIds.includes(tempKey) && <Typography variant="caption" color="text.secondary">guardando...</Typography>}
                                    </Box>
                                  )
                                })
                              })()}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
