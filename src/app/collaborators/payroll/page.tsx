'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { Payment } from '@mui/icons-material'
import { colors } from '../../../theme/theme'

export default function CollaboratorPayrollPage() {
  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Payment sx={{ color: colors.blue6, fontSize: 32 }} />
          <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700 }}>
            Mi Nómina
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: colors.blue7 }}>
          Consulta tu información de nómina
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          Información de Nómina
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás consultar:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>Liquidaciones de sueldo</li>
          <li>Descuentos aplicados</li>
          <li>Bonificaciones</li>
          <li>Historial de pagos</li>
        </Box>
      </Paper>
    </Container>
  )
}



