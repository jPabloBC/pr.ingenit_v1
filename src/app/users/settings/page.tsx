'use client'

import { Box, Container, Paper, Typography } from '@mui/material'
import UserHeader from '../../../components/layout/UserHeader'
import { colors } from '../../../theme/theme'

export default function SettingsPage() {
  return (
    <>
      <UserHeader title="Ajustes" />
      <Container
        maxWidth={false}
        disableGutters
        sx={{ width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}
      >
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: { xs: 2, md: 3 }, mb: 3 }}>
          <Typography variant="h5" sx={{ color: colors.blue1, fontWeight: 800, mb: 0.75 }}>
            Ajustes
          </Typography>
          <Typography sx={{ color: colors.blue7 }}>
            Configuraciones de usuario y plataforma.
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: { xs: 2, md: 3 } }}>
          <Box sx={{ maxWidth: 720 }}>
            <Typography variant="h6" sx={{ color: colors.blue1, fontWeight: 800, mb: 1 }}>
              Configuraciones próximamente
            </Typography>
            <Typography sx={{ color: colors.blue7 }}>
              Esta sección quedará disponible para centralizar preferencias y parámetros del usuario.
            </Typography>
          </Box>
        </Paper>
      </Container>
    </>
  )
}
