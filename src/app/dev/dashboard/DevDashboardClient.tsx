"use client"
import React, { useEffect, useState } from 'react'
import { Box, Typography, CircularProgress, List, ListItem, Button } from '@mui/material'
import { useRouter } from 'next/navigation'
import { colors } from '../../../theme/theme'

export default function DevDashboardClient() {
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setLoading(true)
    fetch('/api/dev/companies')
      .then(r => r.json())
      .then(j => setCompanies(j.companies || []))
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Dashboard Dev</Typography>
      <Typography variant="body1" sx={{ mb: 3 }}>Desde aquí puedes navegar a las secciones de administración dev (empresas, usuarios y configuración).</Typography>

      {loading ? (
        <CircularProgress />
      ) : (
        <>
          <Box sx={{ mb: 2 }}>
            <Button variant="contained" onClick={() => router.push('/dev/companies')}>Ver Empresas</Button>
            <Button variant="outlined" sx={{ ml: 2 }} onClick={() => router.push('/dev/users')}>Ver Usuarios</Button>
          </Box>

          <Typography variant="h6">Empresas</Typography>
          {companies.length === 0 && <Typography variant="body2">No hay empresas registradas</Typography>}
          <List>
            {companies.map(c => (
              <ListItem key={c.id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{c.name || c.id}</span>
                <Button size="small" onClick={() => router.push(`/dev/companies/${c.id}`)}>Abrir</Button>
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Box>
  )
}
