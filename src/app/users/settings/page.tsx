'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { Settings } from '@mui/icons-material'
import { colors } from '../../../theme/theme'

export default function SettingsPage() {
  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{ width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}
    >
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Settings sx={{ color: colors.blue6, fontSize: 32 }} />
          <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700 }}>
            Configuración
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: colors.blue7 }}>
          Configura los parámetros del sistema
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          Configuraciones Disponibles
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás configurar:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>Parámetros de la empresa</li>
          <li>Configuración de horarios</li>
          <li>Políticas de asistencia</li>
          <li>Configuración de notificaciones</li>
        </Box>
      </Paper>
    </Container>
  )
}



