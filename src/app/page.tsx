'use client'

import { useRouter } from 'next/navigation'
import {
  Assessment,
  Badge,
  Groups,
  Login,
  ShieldOutlined,
  TaskAlt,
} from '@mui/icons-material'
import { Box, Card, CardContent, Container, Stack, Tooltip, Typography } from '@mui/material'
import Header from '../components/layout/header'
import Footer from '../components/layout/footer'
import { colors } from '../theme/theme'
import { AppButton } from '@/components/ui/AppButton'

const platformAreas = [
  { label: 'Asistencia', icon: TaskAlt },
  { label: 'Cuadrillas', icon: Groups },
  { label: 'Reportes', icon: Assessment },
  { label: 'Personal', icon: Badge },
]

const confidenceItems = [
  'Control operativo centralizado',
  'Acceso por perfiles y permisos',
  'Trazabilidad para terreno y administración',
]

export default function Home() {
  const router = useRouter()

  const handleAccess = () => {
    router.push('/auth/signin')
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.blue1,
        backgroundImage: `
          repeating-linear-gradient(90deg, ${colors.white}07 0 1px, transparent 1px 96px),
          repeating-linear-gradient(0deg, ${colors.white}05 0 1px, transparent 1px 96px),
          linear-gradient(145deg, ${colors.blue1} 0%, ${colors.blue2} 42%, ${colors.blue5} 100%)
        `,
      }}
    >
      <Header />

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          py: { xs: 4, md: 7 },
        }}
      >
        <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.05fr) minmax(360px, 440px)' },
              gap: { xs: 3, md: 6 },
              alignItems: 'center',
            }}
          >
            <Box sx={{ color: colors.white }}>
              <Box
                sx={{
                  width: 72,
                  height: 4,
                  bgcolor: colors.gold3,
                  mb: { xs: 2, md: 3 },
                }}
              />

              <Typography
                variant="h1"
                sx={{
                  color: colors.white,
                  fontWeight: 500,
                  fontSize: { xs: '2rem', sm: '2.6rem', md: '3.45rem' },
                  lineHeight: 1.08,
                  maxWidth: 760,
                }}
              >
                Sistema de Gestión y Control
              </Typography>

              <Typography
                component="p"
                sx={{
                  color: colors.gold4,
                  fontSize: { xs: '1.15rem', md: '1.55rem' },
                  fontWeight: 600,
                  mt: 1.5,
                }}
              >
                Operación y Equipos
              </Typography>

              <Typography
                sx={{
                  color: colors.blue13,
                  fontSize: { xs: '0.98rem', md: '1.08rem' },
                  lineHeight: 1.7,
                  maxWidth: 720,
                  mt: 2.5,
                }}
              >
                Centraliza el registro, seguimiento y reportes de tu operación en una plataforma
                preparada para trabajo administrativo y terreno.
              </Typography>

              <Stack
                direction="row"
                flexWrap="wrap"
                gap={1.25}
                sx={{ mt: { xs: 3, md: 4 }, maxWidth: 760 }}
              >
                {platformAreas.map(({ label, icon: Icon }) => (
                  <Box
                    key={label}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      width: 68,
                      height: 58,
                      border: `1px solid ${colors.blue12}35`,
                      bgcolor: `${colors.white}0d`,
                      color: colors.blue15,
                      borderRadius: 1.5,
                      justifyContent: 'center',
                    }}
                  >
                    <Tooltip title={label} arrow>
                      <Icon sx={{ fontSize: 34, color: colors.gold4 }} />
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            </Box>

            <Card
              elevation={0}
              sx={{
                borderRadius: 2,
                border: `1px solid ${colors.blue15}`,
                bgcolor: colors.white,
                boxShadow: `0 22px 55px ${colors.black}33`,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ height: 6, bgcolor: colors.gold3 }} />
              <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                <Box
                  sx={{
                    width: 54,
                    height: 54,
                    borderRadius: 2,
                    bgcolor: colors.blue15,
                    color: colors.blue6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 2.2,
                  }}
                >
                  <ShieldOutlined sx={{ fontSize: 34 }} />
                </Box>

                <Typography
                  component="h2"
                  sx={{
                    color: colors.blue1,
                    fontSize: { xs: '1.55rem', sm: '1.85rem' },
                    fontWeight: 700,
                    lineHeight: 1.15,
                  }}
                >
                  Acceder al Sistema
                </Typography>

                <Typography
                  sx={{
                    color: colors.gray4,
                    fontSize: '0.98rem',
                    lineHeight: 1.55,
                    mt: 1.2,
                    mb: 2.5,
                  }}
                >
                  Ingresa con tus credenciales para continuar con la gestión diaria de personal,
                  recursos y reportes.
                </Typography>

                <Stack spacing={1.2} sx={{ mb: 3 }}>
                  {confidenceItems.map((item) => (
                    <Box
                      key={item}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        color: colors.blue3,
                        fontSize: '0.92rem',
                        fontWeight: 500,
                      }}
                    >
                      <TaskAlt sx={{ color: colors.gold3, fontSize: 18 }} />
                      {item}
                    </Box>
                  ))}
                </Stack>

                <AppButton
                  variant="contained"
                  size="large"
                  fullWidth
                  onClick={handleAccess}
                  startIcon={<Login />}
                  sx={{
                    bgcolor: colors.blue6,
                    color: colors.white,
                    py: 1.35,
                    borderRadius: 1.5,
                    boxShadow: `0 10px 20px ${colors.blue6}33`,
                    '&:hover': {
                      bgcolor: colors.blue4,
                      boxShadow: `0 12px 24px ${colors.blue6}45`,
                    },
                  }}
                >
                  Ingresar al sistema
                </AppButton>
              </CardContent>
            </Card>
          </Box>
        </Container>
      </Box>

      <Footer />
    </Box>
  )
}
