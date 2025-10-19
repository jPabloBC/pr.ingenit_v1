'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { AdminPanelSettings } from '@mui/icons-material'
import { colors } from '@/theme/theme'

export default function RolesPage() {
  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <AdminPanelSettings sx={{ color: colors.blue6, fontSize: 32 }} />
          <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700 }}>
            Gestión de Roles
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: colors.blue7 }}>
          Administra los roles y permisos del sistema
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: colors.blue1, mb: 2 }}>
          Funcionalidades de Roles
        </Typography>
        <Typography variant="body2" sx={{ color: colors.blue7 }}>
          Aquí podrás gestionar:
        </Typography>
        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
          <li>Crear y editar roles</li>
          <li>Asignar permisos a roles</li>
          <li>Gestionar usuarios por rol</li>
          <li>Auditoría de permisos</li>
        </Box>
      </Paper>
    </Container>
  )
}



