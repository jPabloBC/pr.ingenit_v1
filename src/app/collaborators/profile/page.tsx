'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { Person } from '@mui/icons-material'
import { colors } from '../../../theme/theme'

export default function CollaboratorProfilePage() {
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
          Gestiona tu información personal
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          Información Personal
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>Ver y editar tu información personal</li>
          <li>Actualizar datos de contacto</li>
          <li>Cambiar tu contraseña</li>
          <li>Gestionar preferencias</li>
        </Box>
      </Paper>
    </Container>
  )
}



