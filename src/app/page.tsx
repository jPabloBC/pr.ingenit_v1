'use client'

import { useRouter } from 'next/navigation'
import { Box, Container, Typography, Card, CardContent, Button } from '@mui/material'
import { 
  AdminPanelSettings, 
  People
} from '@mui/icons-material'
import { colors } from '../theme/theme'
import Header from '../components/layout/header'
import Footer from '../components/layout/footer'

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
        background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 50%, ${colors.blue6} 100%)`,
      }}
    >
      <Header />
      
      {/* Contenido principal */}
      <Box 
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          py: { xs: 3, sm: 4, md: 5 },
          minHeight: { md: 'clamp(500px, calc(100vh - 240px), 760px)' },
          position: 'relative',
          '@media (max-height: 860px)': {
            py: { xs: 2.5, sm: 3, md: 3 },
            minHeight: { md: 'clamp(460px, calc(100vh - 210px), 620px)' },
          },
          '@media (max-height: 760px), (max-width: 1366px)': {
            py: { md: 2 },
            minHeight: { md: 'clamp(380px, calc(100vh - 180px), 520px)' },
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `radial-gradient(ellipse at center, transparent 0%, ${colors.blue1}40 100%)`,
            pointerEvents: 'none'
          }
        }}
      >
      <Container 
        maxWidth="md" 
        sx={{ 
          position: 'relative', 
          zIndex: 1,
          px: { xs: 1.5, sm: 3, md: 4 }, // Padding responsive
          '@media (max-height: 860px)': {
            maxWidth: '920px',
          },
        }}
      >
        <Box 
          textAlign="center" 
          mb={{ xs: 2, sm: 2.5, md: 3 }} // Margin responsive
          mt={{ xs: 0, sm: 0.5, md: 0 }} // Margin-top responsive
        >
          <Typography 
            variant="h2" 
            component="h1" 
            sx={{ 
              color: colors.white,
              fontWeight: 700,
              mb: { xs: 1.25, sm: 1.75, md: 2 },
              textShadow: `2px 2px 4px ${colors.blue1}80`,
              fontSize: 'clamp(1.4rem, 3.4vw, 3rem)',
              '@media (max-height: 860px)': {
                fontSize: 'clamp(1.35rem, 3vw, 2.65rem)',
              },
              '@media (max-height: 760px), (max-width: 1366px)': {
                fontSize: 'clamp(1.2rem, 2.4vw, 2.2rem)',
              },
            }}
          >
            Sistema de Gestión y Control
          </Typography>
          
          <Typography 
            variant="h4" 
            sx={{ 
              color: colors.gold4,
              fontWeight: 500,
              mb: { xs: 0.75, sm: 1 },
              textShadow: `1px 1px 2px ${colors.blue1}60`,
              fontSize: 'clamp(1.05rem, 2.4vw, 2rem)',
              '@media (max-height: 760px), (max-width: 1366px)': {
                fontSize: 'clamp(0.95rem, 1.7vw, 1.5rem)',
              },
            }}
          >
            Operación y Equipos
          </Typography>
          
          <Typography 
            variant="body1" 
            sx={{ 
              color: colors.blue13,
              opacity: 0.95,
              mt: { xs: 1, sm: 1.5, md: 2 },
              fontSize: 'clamp(0.9rem, 1.3vw, 1.15rem)',
              px: { xs: 1, sm: 0 }
            }}
          >
            Centraliza el registro, seguimiento y reportes de tu operación en una sola plataforma
          </Typography>
        </Box>

        <Box 
          display="flex" 
          justifyContent="center"
          px={{ xs: 0.25, sm: 2, md: 0 }} // Padding horizontal responsive
        >
          {/* Acceso Unificado */}
          <Card 
            sx={{ 
              maxWidth: { xs: '100%', sm: 460, md: 440 }, // Responsive max width
              width: '100%',
              '@media (max-height: 860px)': {
                maxWidth: { md: 410 },
              },
              '@media (max-height: 760px), (max-width: 1366px)': {
                maxWidth: { md: 360 },
              },
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              background: colors.white,
              border: `2px solid transparent`,
              '&:hover': {
                transform: { 
                  xs: 'translateY(-8px)',  // Menos movimiento en móvil
                  sm: 'translateY(-12px)'  // Movimiento completo en tablet+
                },
                boxShadow: `0 20px 40px ${colors.blue1}20`,
                border: `2px solid ${colors.gold3}`,
                '& .system-icon': {
                  transform: 'scale(1.1)',
                  color: colors.gold3
                }
              }
            }}
            onClick={handleAccess}
          >
            <CardContent sx={{ 
              textAlign: 'center', 
              p: { xs: 2, sm: 4, md: 5 }, // Padding responsive
              '@media (max-height: 860px)': {
                p: { md: 3 },
              },
              '@media (max-height: 760px), (max-width: 1366px)': {
                p: { md: 2.2 },
              },
            }}>
              <Box 
                className="system-icon"
                sx={{ 
                  fontSize: { xs: 44, sm: 62, md: 64 }, 
                  color: colors.blue6, 
                  mb: { xs: 1.25, sm: 2.5, md: 3 }, // Margin responsive
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: { xs: 1, sm: 1.5, md: 2 }, // Gap responsive
                  '@media (max-height: 860px)': {
                    fontSize: { md: 54 },
                    mb: { md: 1.25 },
                  },
                  '@media (max-height: 760px), (max-width: 1366px)': {
                    fontSize: { md: 44 },
                    mb: { md: 0.65 },
                  },
                }} 
              >
                <AdminPanelSettings sx={{ fontSize: 'inherit' }} />
                <People sx={{ fontSize: 'inherit' }} />
              </Box>
              
              <Typography 
                variant="h3" 
                component="h2" 
                sx={{ 
                  color: colors.blue1,
                  fontWeight: 500,
                  mb: { xs: 1, sm: 2, md: 2 }, // Margin responsive
                  fontSize: 'clamp(1.5rem, 2.5vw, 2.5rem)',
                  '@media (max-height: 760px), (max-width: 1366px)': {
                    fontSize: 'clamp(1.15rem, 1.8vw, 1.9rem)',
                  },
                }}
              >
                Acceder al Sistema
              </Typography>
              
              <Typography 
                variant="body1" 
                sx={{ 
                  color: colors.gray4,
                  mb: { xs: 2.25, sm: 3.5, md: 4 }, // Margin responsive
                  fontSize: 'clamp(0.9rem, 1.15vw, 1.1rem)',
                  lineHeight: 1.6,
                  px: { xs: 0, sm: 1, md: 0 }, // Padding horizontal en tablet
                  '@media (max-height: 860px)': {
                    mb: { md: 2.2 },
                  },
                  '@media (max-height: 760px), (max-width: 1366px)': {
                    mb: { md: 1.2 },
                    lineHeight: 1.45,
                    fontSize: '0.88rem',
                  },
                }}
              >
                Plataforma centralizada para el control y seguimiento operativo.
              </Typography>
              
              {/*<Box sx={{ mb: { xs: 3, sm: 3.5, md: 4 } }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: colors.blue6, 
                    mb: { xs: 1.5, sm: 2 }, // Margin responsive
                    display: 'flex', 
                    alignItems: { xs: 'flex-start', sm: 'center' }, // Alignment responsive
                    justifyContent: { xs: 'flex-start', sm: 'center' }, // Justification responsive
                    textAlign: { xs: 'left', sm: 'center' }, // Text align responsive
                    gap: 1,
                    fontSize: { xs: '0.875rem', sm: '0.875rem', md: '0.9rem' }, // Font size responsive
                    px: { xs: 2, sm: 0 } // Padding horizontal en móvil
                  }}
                >
                  <Box 
                    component="span" 
                    sx={{ 
                      width: { xs: 5, sm: 6 }, 
                      height: { xs: 5, sm: 6 }, 
                      bgcolor: colors.gold3, 
                      borderRadius: '50%',
                      flexShrink: 0,
                      mt: { xs: 0.5, sm: 0 } // Ajuste vertical en móvil
                    }} 
                  />
                  Gestión completa de personal y recursos humanos
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: colors.blue6, 
                    mb: { xs: 1.5, sm: 2 },
                    display: 'flex', 
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: { xs: 'flex-start', sm: 'center' },
                    textAlign: { xs: 'left', sm: 'center' },
                    gap: 1,
                    fontSize: { xs: '0.875rem', sm: '0.875rem', md: '0.9rem' },
                    px: { xs: 2, sm: 0 }
                  }}
                >
                  <Box 
                    component="span" 
                    sx={{ 
                      width: { xs: 5, sm: 6 }, 
                      height: { xs: 5, sm: 6 }, 
                      bgcolor: colors.gold3, 
                      borderRadius: '50%',
                      flexShrink: 0,
                      mt: { xs: 0.5, sm: 0 }
                    }} 
                  />
                  Control de asistencia, nóminas y EPP
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: colors.blue6, 
                    mb: { xs: 1.5, sm: 2 },
                    display: 'flex', 
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: { xs: 'flex-start', sm: 'center' },
                    textAlign: { xs: 'left', sm: 'center' },
                    gap: 1,
                    fontSize: { xs: '0.875rem', sm: '0.875rem', md: '0.9rem' },
                    px: { xs: 2, sm: 0 }
                  }}
                >
                  <Box 
                    component="span" 
                    sx={{ 
                      width: { xs: 5, sm: 6 }, 
                      height: { xs: 5, sm: 6 }, 
                      bgcolor: colors.gold3, 
                      borderRadius: '50%',
                      flexShrink: 0,
                      mt: { xs: 0.5, sm: 0 }
                    }} 
                  />
                  Reportes ejecutivos y dashboard personalizado
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: colors.blue6, 
                    display: 'flex', 
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: { xs: 'flex-start', sm: 'center' },
                    textAlign: { xs: 'left', sm: 'center' },
                    gap: 1,
                    fontSize: { xs: '0.875rem', sm: '0.875rem', md: '0.9rem' },
                    px: { xs: 2, sm: 0 }
                  }}
                >
                  <Box 
                    component="span" 
                    sx={{ 
                      width: { xs: 5, sm: 6 }, 
                      height: { xs: 5, sm: 6 }, 
                      bgcolor: colors.gold3, 
                      borderRadius: '50%',
                      flexShrink: 0,
                      mt: { xs: 0.5, sm: 0 }
                    }} 
                  />
                  Acceso diferenciado por roles y permisos
                </Typography>
              </Box> */}
              
              <Button 
                variant="contained" 
                size="large"
                fullWidth
                sx={{
                  background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
                  color: colors.white,
                  py: { xs: 1.25, sm: 1.75, md: 2 }, // Padding vertical responsive
                  px: { xs: 2, sm: 3, md: 4 }, // Padding horizontal responsive
                  borderRadius: { xs: 2.5, sm: 3 }, // Border radius responsive
                  fontWeight: 400,
                  fontSize: { 
                    xs: '0.95rem',    // Mobile
                    sm: '1.05rem', // Tablet
                    md: '1.1rem'   // Desktop
                  },
                  '@media (max-height: 760px), (max-width: 1366px)': {
                    py: { md: 1 },
                    fontSize: { md: '0.88rem' },
                  },
                  textTransform: 'none',
                  boxShadow: `0 4px 16px ${colors.blue6}40`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
                    transform: { 
                      xs: 'scale(1.01)', // Menos escala en móvil
                      sm: 'scale(1.02)'  // Escala completa en tablet+
                    },
                    boxShadow: `0 6px 20px ${colors.blue6}60`
                  }
                }}
              >
                Ingresar al Sistema
              </Button>
            </CardContent>
          </Card>
        </Box>

        {/* Información adicional */}
        <Box 
          textAlign="center" 
          mt={{ xs: 1.5, sm: 2.5, md: 3 }} 
          mb={{ xs: 0, sm: 0.5, md: 1 }} // Margin-bottom incrementado y responsive
        >
          {/* <Typography 
            variant="body2" 
            sx={{ 
              color: colors.blue13,
              opacity: 0.9,
              fontSize: '1rem'
            }}
          >
            Plataforma escalable para minería, pymes y grandes empresas
          </Typography> */}
        </Box>
      </Container>
    </Box>
    
    <Footer />
    </Box>
  )
}
