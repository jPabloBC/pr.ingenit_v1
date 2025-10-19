'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { Business } from '@mui/icons-material'
import { colors } from '@/theme/theme'

export default function DepartmentsPage() {
  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Business sx={{ color: colors.blue6, fontSize: 32 }} />
          <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700 }}>
            Gestión de Departamentos
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: colors.blue7 }}>
          Administra los departamentos de la empresa
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          Funcionalidades de Departamentos
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás gestionar:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>Crear y editar departamentos</li>
          <li>Asignar colaboradores a departamentos</li>
          <li>Gestionar jerarquías organizacionales</li>
          <li>Reportes por departamento</li>
        </Box>
      </Paper>
    </Container>
  )
}



