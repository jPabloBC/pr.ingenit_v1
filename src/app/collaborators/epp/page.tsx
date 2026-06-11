'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { Security } from '@mui/icons-material'
import { colors } from '../../../theme/theme'

export default function CollaboratorEPPPage() {
  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Security sx={{ color: colors.blue6, fontSize: 32 }} />
          <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700 }}>
            Mi EPP
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: colors.blue7 }}>
          Consulta tus Equipos de Protección Personal asignados
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          EPP Asignado
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás consultar:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>EPP asignado a tu persona</li>
          <li>Fechas de entrega</li>
          <li>Estado de los equipos</li>
          <li>Próximos vencimientos</li>
        </Box>
      </Paper>
    </Container>
  )
}



