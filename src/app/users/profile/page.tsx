'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { Person } from '@mui/icons-material'
import { colors } from '@/theme/theme'

export default function UserProfilePage() {
  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Person sx={{ color: colors.blue6, fontSize: 32 }} />
          <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700 }}>
            Mi Perfil
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: colors.blue7 }}>
          Gestiona tu información de usuario administrativo
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          Información del Usuario
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>Ver y editar tu información personal</li>
          <li>Gestionar permisos y roles</li>
          <li>Configurar preferencias del sistema</li>
          <li>Cambiar contraseña</li>
        </Box>
      </Paper>
    </Container>
  )
}



