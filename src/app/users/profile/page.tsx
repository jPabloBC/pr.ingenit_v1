'use client'

import { Box, Container, Typography } from '@mui/material'
import { useSession } from 'next-auth/react'
import UserHeader from '../../../components/layout/UserHeader'
import { colors } from '../../../theme/theme'

const unavailable = 'No disponible'

function displayValue(value: unknown) {
  const text = String(value || '').trim()
  return text || unavailable
}

function formatRole(role: unknown) {
  const text = String(role || '').trim()
  if (!text) return unavailable
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export default function UserProfilePage() {
  const { data: session, status } = useSession()
  const user = session?.user as any

  const profileRows = [
    { label: 'Nombre', value: displayValue(user?.name) },
    { label: 'Email', value: displayValue(user?.email) },
    { label: 'Rol', value: formatRole(user?.role) },
    { label: 'Empresa actual', value: displayValue(user?.companyName || user?.companyId) },
    { label: 'Proyecto activo', value: displayValue(user?.projectName || user?.projectId) },
    { label: 'ID de usuario', value: displayValue(user?.id) },
  ]

  return (
    <>
      <UserHeader title="Perfil" />
      <Container
        maxWidth={false}
        disableGutters
        sx={{ width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}
      >
        {status === 'loading' ? (
          <Typography sx={{ color: colors.blue7 }}>Cargando perfil...</Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            {profileRows.map((row) => (
              <Box
                key={row.label}
                sx={{
                  border: '1px solid #edf2f7',
                  borderRadius: 1.5,
                  p: 2,
                  bgcolor: '#ffffff',
                  minWidth: 0,
                }}
              >
                <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
                  {row.label}
                </Typography>
                <Typography sx={{ mt: 0.75, color: '#0f172a', fontWeight: 700, wordBreak: 'break-word' }}>
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Container>
    </>
  )
}
