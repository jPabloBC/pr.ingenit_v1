"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { Box, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

type Company = { id: string | number; name?: string | null }
type User = { id: string; email?: string | null; first_name?: string | null; last_name?: string | null; role?: string | null; company_id?: string | number | null }
type Permission = { id: number | string; user_id: string; company_id?: string | number | null; resource_key?: string; can_view?: boolean }

export default function DevSummaryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [cRes, uRes, pRes] = await Promise.all([
          fetch('/api/dev/companies').then(r => r.json()),
          fetch('/api/dev/users').then(r => r.json()),
          fetch('/api/dev/user-permissions').then(r => r.json()),
        ])
        if (!mounted) return
        if (cRes.error) throw new Error(cRes.error)
        if (uRes.error) throw new Error(uRes.error)
        if (pRes.error) throw new Error(pRes.error)
        setCompanies(Array.isArray(cRes.companies) ? cRes.companies : [])
        setUsers(Array.isArray(uRes.users) ? uRes.users : [])
        setPermissions(Array.isArray(pRes.permissions) ? pRes.permissions : [])
      } catch (e: any) {
        if (mounted) setError(e?.message || String(e))
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  const rows = useMemo(() => {
    const compMap = new Map<string, string>()
    companies.forEach((c) => compMap.set(String(c.id), String(c.name || `Empresa ${c.id}`)))

    const byCompany = new Map<string, {
      companyId: string
      companyName: string
      admins: number
      users: number
      usersWithAccess: Set<string>
      permissionRows: number
    }>()

    for (const c of companies) {
      const id = String(c.id)
      byCompany.set(id, {
        companyId: id,
        companyName: String(c.name || `Empresa ${id}`),
        admins: 0,
        users: 0,
        usersWithAccess: new Set<string>(),
        permissionRows: 0,
      })
    }

    for (const u of users) {
      if (String(u.role || '').toLowerCase() === 'dev') continue
      const cid = String(u.company_id || 'none')
      if (!byCompany.has(cid)) {
        byCompany.set(cid, {
          companyId: cid,
          companyName: cid === 'none' ? 'Sin empresa' : (compMap.get(cid) || `Empresa ${cid}`),
          admins: 0,
          users: 0,
          usersWithAccess: new Set<string>(),
          permissionRows: 0,
        })
      }
      const role = String(u.role || '').toLowerCase()
      const row = byCompany.get(cid)!
      if (role === 'admin') row.admins += 1
      if (role === 'user' || role === 'member') row.users += 1
    }

    for (const p of permissions) {
      if (!p.can_view) continue
      const cid = String(p.company_id || 'none')
      if (!byCompany.has(cid)) {
        byCompany.set(cid, {
          companyId: cid,
          companyName: cid === 'none' ? 'Sin empresa' : (compMap.get(cid) || `Empresa ${cid}`),
          admins: 0,
          users: 0,
          usersWithAccess: new Set<string>(),
          permissionRows: 0,
        })
      }
      const row = byCompany.get(cid)!
      row.permissionRows += 1
      if (p.user_id) row.usersWithAccess.add(String(p.user_id))
    }

    return Array.from(byCompany.values())
      .map((r) => ({
        ...r,
        usersWithAccessCount: r.usersWithAccess.size
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [companies, users, permissions])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Error: {error}</Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4">Resumen por empresa</Typography>
        <Typography variant="body2" color="text.secondary">
          Vista consolidada de admins, usuarios finales y asignaciones de permisos.
        </Typography>
      </Box>

      <Paper elevation={1}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Empresa</TableCell>
                <TableCell align="right">Admins</TableCell>
                <TableCell align="right">Users/Member</TableCell>
                <TableCell align="right">Usuarios con acceso</TableCell>
                <TableCell align="right">Permisos activos</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.companyId}>
                  <TableCell>{r.companyName}</TableCell>
                  <TableCell align="right">{r.admins}</TableCell>
                  <TableCell align="right">{r.users}</TableCell>
                  <TableCell align="right">{r.usersWithAccessCount}</TableCell>
                  <TableCell align="right">{r.permissionRows}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>Sin datos para mostrar.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}

