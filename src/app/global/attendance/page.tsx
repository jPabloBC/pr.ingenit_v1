'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { AccessTime } from '@mui/icons-material'
import { colors } from '@/theme/theme'

export default function AttendancePage() {
  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <AccessTime sx={{ color: colors.blue6, fontSize: 32 }} />
          <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700 }}>
            Gestión de Asistencia
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: colors.blue7 }}>
          Administra la asistencia de todos los colaboradores
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          Funcionalidades de Asistencia
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás gestionar:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>Registro de entrada y salida</li>
          <li>Reportes de asistencia</li>
          <li>Control de horas extras</li>
          <li>Justificaciones de ausencias</li>
        </Box>
      </Paper>
    </Container>
  )
}



