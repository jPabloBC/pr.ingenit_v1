'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { AccessTime } from '@mui/icons-material'
import { colors } from '../../../theme/theme'

export default function CollaboratorAttendancePage() {
  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <AccessTime sx={{ color: colors.blue6, fontSize: 32 }} />
          <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700 }}>
            Mi Asistencia
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: colors.blue7 }}>
          Registra tu asistencia y consulta tu historial
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          Funcionalidades de Asistencia
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>Registrar entrada y salida</li>
          <li>Consultar tu historial de asistencia</li>
          <li>Solicitar justificaciones</li>
          <li>Ver reportes de horas trabajadas</li>
        </Box>
      </Paper>
    </Container>
  )
}



