'use client'

import { useRouter } from 'next/navigation'
import { Box, Container, Typography, Card, CardContent, Button } from '@mui/material'
import { 
  AdminPanelSettings, 
  People
} from '@mui/icons-material'
import Image from 'next/image'
import { colors } from '../theme/theme'
import Header from '@/components/layout/header'
import Footer from '@/components/layout/footer'

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
          position: 'relative',
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
          px: { xs: 2, sm: 3, md: 4 } // Padding responsive
        }}
      >
        <Box 
          textAlign="center" 
          mb={{ xs: 4, sm: 6, md: 8 }} // Margin responsive
          mt={{ xs: 4, sm: 6, md: 8 }} // Margin-top responsive
        >
          <Typography 
            variant="h2" 
            component="h1" 
            sx={{ 
              color: colors.white,
              fontWeight: 700,
              mb: 2,
              textShadow: `2px 2px 4px ${colors.blue1}80`,
              fontSize: { 
                xs: '2rem',    // Mobile: 32px
                sm: '2.5rem',  // Tablet: 40px  
                md: '3rem',    // Desktop: 48px
                lg: '3.5rem'   // Large: 56px
              }
            }}
          >
            Sistema de Gestión
          </Typography>
          
          <Typography 
            variant="h4" 
            sx={{ 
              color: colors.gold4,
              fontWeight: 500,
              mb: 1,
              textShadow: `1px 1px 2px ${colors.blue1}60`,
              fontSize: { 
                xs: '1.25rem', // Mobile: 20px
                sm: '1.5rem',  // Tablet: 24px
                md: '1.75rem', // Desktop: 28px
                lg: '2rem'     // Large: 32px
              }
            }}
          >
            Recursos Humanos
          </Typography>
          
          <Typography 
            variant="body1" 
            sx={{ 
              color: colors.blue13,
              opacity: 0.95,
              mt: 3,
              fontSize: { 
                xs: '0.95rem', // Mobile
                sm: '1rem',    // Tablet
                md: '1.1rem',  // Desktop
                lg: '1.15rem'  // Large
              }
            }}
          >
            Accede a la plataforma de gestión de recursos humanos
          </Typography>
        </Box>

        <Box 
          display="flex" 
          justifyContent="center"
          px={{ xs: 1, sm: 2, md: 0 }} // Padding horizontal responsive
        >
          {/* Acceso Unificado */}
          <Card 
            sx={{ 
              maxWidth: { xs: '100%', sm: 480, md: 500 }, // Responsive max width
              width: '100%',
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
              p: { xs: 3, sm: 4, md: 5 } // Padding responsive
            }}>
              <Box 
                className="system-icon"
                sx={{ 
                  fontSize: { 
                    xs: 60,  // Mobile: iconos más pequeños
                    sm: 70,  // Tablet: iconos medianos
                    md: 80   // Desktop: iconos grandes
                  }, 
                  color: colors.blue6, 
                  mb: { xs: 2, sm: 2.5, md: 3 }, // Margin responsive
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: { xs: 1, sm: 1.5, md: 2 } // Gap responsive
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
                  mb: { xs: 1.5, sm: 2, md: 2 }, // Margin responsive
                  fontSize: { 
                    xs: '1.85rem', // Mobile: 28px
                    sm: '2rem',    // Tablet: 32px
                    md: '2.25rem', // Desktop: 36px
                    lg: '2.5rem'   // Large: 40px
                  }
                }}
              >
                Acceder al Sistema
              </Typography>
              
              <Typography 
                variant="body1" 
                sx={{ 
                  color: colors.gray4,
                  mb: { xs: 3, sm: 3.5, md: 4 }, // Margin responsive
                  fontSize: { 
                    xs: '0.95rem', // Mobile
                    sm: '1rem',    // Tablet
                    md: '1.05rem', // Desktop
                    lg: '1.1rem'   // Large
                  },
                  lineHeight: 1.6,
                  px: { xs: 0, sm: 1, md: 0 } // Padding horizontal en tablet
                }}
              >
                Portal unificado para administradores y colaboradores.
                Selecciona tu tipo de usuario una vez dentro del sistema.
              </Typography>
              
              <Box sx={{ mb: { xs: 3, sm: 3.5, md: 4 } }}> {/* Margin responsive */}
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
              </Box>
              
              <Button 
                variant="contained" 
                size="large"
                fullWidth
                sx={{
                  background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
                  color: colors.white,
                  py: { xs: 1.5, sm: 1.75, md: 2 }, // Padding vertical responsive
                  px: { xs: 2, sm: 3, md: 4 }, // Padding horizontal responsive
                  borderRadius: { xs: 2.5, sm: 3 }, // Border radius responsive
                  fontWeight: 600,
                  fontSize: { 
                    xs: '1rem',    // Mobile
                    sm: '1.05rem', // Tablet
                    md: '1.1rem'   // Desktop
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
          mt={{ xs: 6, sm: 7, md: 8 }} 
          mb={{ xs: 8, sm: 10, md: 12 }} // Margin-bottom incrementado y responsive
        >
          <Typography 
            variant="body2" 
            sx={{ 
              color: colors.blue13,
              opacity: 0.9,
              fontSize: '1rem'
            }}
          >
            Plataforma escalable para minería, pymes y grandes empresas
          </Typography>
          <Typography 
            variant="caption" 
            sx={{ 
              color: colors.blue14,
              opacity: 0.8,
              mt: 1,
              display: 'block',
              fontSize: '0.9rem'
            }}
          >
            IngenIT © 2025 - Sistema de Gestión de Personal v1.0.0
          </Typography>
        </Box>
      </Container>
    </Box>
    
    <Footer />
    </Box>
  )
}