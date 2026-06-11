'use client'

import { Box, Container, Typography, Grid, Link, Divider } from '@mui/material'
import Image from 'next/image'
import { colors } from '../../theme/theme'
import {
  Email,
  Phone,
  LocationOn,
  LinkedIn,
  Twitter,
  Facebook
} from '@mui/icons-material'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <Box
      component="footer"
      sx={{
        background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue2} 50%, ${colors.blue3} 100%)`,
        color: colors.white,
        pt: { xs: 4, md: 6 },
        pb: { xs: 2, md: 3 },
        mt: 'auto',
        '@media (max-height: 760px), (max-width: 1366px)': {
          pt: { md: 2.25 },
          pb: { md: 1.1 },
        },
      }}
    >
      <Container maxWidth="xl" sx={{ px: { xs: 1.5, sm: 2.5, md: 3 } }}>
        <Grid container spacing={{ xs: 2, md: 3 }}>
          {/* Información de la empresa */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={{ xs: 1.25, md: 2 }}>
              <Image
                src="/assets/logo_transparent_ingenIT_white.png"
                alt="IngenIT Logo"
                width={102}
                height={32}
                unoptimized
                priority
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  opacity: 0.3,
                }}
              />
            </Box>
            
            <Typography 
              variant="body2" 
              sx={{ 
                color: colors.blue13,
                mb: { xs: 1.25, md: 2 },
                lineHeight: 1.6
              }}
            >
            </Typography>

            <Box display="flex" gap={1}>
              <Link href="#" sx={{ color: colors.gold4, '&:hover': { color: colors.gold2 } }}>
                <LinkedIn />
              </Link>
              <Link href="#" sx={{ color: colors.gold4, '&:hover': { color: colors.gold2 } }}>
                <Twitter />
              </Link>
              <Link href="#" sx={{ color: colors.gold4, '&:hover': { color: colors.gold2 } }}>
                <Facebook />
              </Link>
            </Box>
          </Grid>

          {/* Enlaces rápidos */}
          <Grid size={{ xs: 12, md: 3 }}>
            <Typography 
              variant="h6" 
              sx={{ 
                color: colors.blue6,
                fontWeight: 400,
                mb: { xs: 1, md: 2 },
                fontSize: { xs: '1rem', md: '1.25rem' }
              }}
            >
              Plataforma
            </Typography>
            
            <Box display="flex" flexDirection="column" gap={{ xs: 0.75, md: 1 }}>
              <Link 
                href="#" 
                sx={{ 
                  color: colors.blue13,
                  textDecoration: 'none',
                  fontSize: { xs: '0.82rem', md: '0.875rem' },
                  '&:hover': { 
                    color: colors.gold4,
                    textDecoration: 'underline'
                  }
                }}
              >
                Gestión de Personal
              </Link>
              <Link 
                href="#" 
                sx={{ 
                  color: colors.blue13,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': { 
                    color: colors.gold4,
                    textDecoration: 'underline'
                  }
                }}
              >
                Control de Asistencia
              </Link>
              <Link 
                href="#" 
                sx={{ 
                  color: colors.blue13,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': { 
                    color: colors.gold4,
                    textDecoration: 'underline'
                  }
                }}
              >
                Gestión de EPP
              </Link>
              <Link 
                href="#" 
                sx={{ 
                  color: colors.blue13,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': { 
                    color: colors.gold4,
                    textDecoration: 'underline'
                  }
                }}
              >
                Sistema de Nóminas
              </Link>
            </Box>
          </Grid>

          {/* Soporte */}
          <Grid size={{ xs: 12, md: 2 }}>
            <Typography 
              variant="h6" 
              sx={{ 
                color: colors.blue6,
                fontWeight: 400,
                mb: { xs: 1, md: 2 },
                fontSize: { xs: '1rem', md: '1.25rem' }
              }}
            >
              Soporte
            </Typography>
            
            <Box display="flex" flexDirection="column" gap={{ xs: 0.75, md: 1 }}>
              <Link 
                href="#" 
                sx={{ 
                  color: colors.blue13,
                  textDecoration: 'none',
                  fontSize: { xs: '0.82rem', md: '0.875rem' },
                  '&:hover': { 
                    color: colors.gold4,
                    textDecoration: 'underline'
                  }
                }}
              >
                Documentación
              </Link>
              <Link 
                href="#" 
                sx={{ 
                  color: colors.blue13,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': { 
                    color: colors.gold4,
                    textDecoration: 'underline'
                  }
                }}
              >
                FAQ
              </Link>
              <Link 
                href="#" 
                sx={{ 
                  color: colors.blue13,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': { 
                    color: colors.gold4,
                    textDecoration: 'underline'
                  }
                }}
              >
                Contacto Técnico
              </Link>
              <Link 
                href="#" 
                sx={{ 
                  color: colors.blue13,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': { 
                    color: colors.gold4,
                    textDecoration: 'underline'
                  }
                }}
              >
                Estado del Sistema
              </Link>
            </Box>
          </Grid>

          {/* Contacto */}
          <Grid size={{ xs: 12, md: 3 }}>
            <Typography 
              variant="h6" 
              sx={{ 
                color: colors.blue6,
                fontWeight: 400,
                mb: { xs: 1, md: 2 },
                fontSize: { xs: '1rem', md: '1.25rem' }
              }}
            >
              Contacto
            </Typography>
            
            <Box display="flex" flexDirection="column" gap={{ xs: 1, md: 2 }}>
              <Box display="flex" alignItems="center" gap={1}>
                <Email sx={{ color: colors.gold4, fontSize: { xs: 16, md: 18 } }} />
                <Typography 
                  variant="body2" 
                  sx={{ color: colors.blue13, fontSize: { xs: '0.82rem', md: '0.875rem' } }}
                >
                  contacto@ingenit.cl
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <Phone sx={{ color: colors.gold4, fontSize: { xs: 16, md: 18 } }} />
                <Typography 
                  variant="body2" 
                  sx={{ color: colors.blue13, fontSize: { xs: '0.82rem', md: '0.875rem' } }}
                >
                  +56 9 9020 6618
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <LocationOn sx={{ color: colors.gold4, fontSize: { xs: 16, md: 18 } }} />
                <Typography 
                  variant="body2" 
                  sx={{ color: colors.blue13, fontSize: { xs: '0.82rem', md: '0.875rem' } }}
                >
                  Chile
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: { xs: 1.25, md: 2.2 }, borderColor: colors.blue6 + '30' }} />

        {/* Copyright */}
        <Box 
          display="flex" 
          justifyContent="space-between" 
          alignItems="center"
          flexWrap="wrap"
          gap={2}
        >
          <Typography 
            variant="body2" 
            sx={{ 
              color: colors.blue14,
              fontSize: { xs: '0.8rem', md: '0.875rem' }
            }}
          >
            © 2024 IngenIT. Todos los derechos reservados.
          </Typography>
          
          <Box display="flex" gap={{ xs: 1.5, md: 3 }}>
            <Link 
              href="#" 
              sx={{ 
                color: colors.blue14,
                textDecoration: 'none',
                fontSize: { xs: '0.8rem', md: '0.875rem' },
                '&:hover': { 
                  color: colors.gold4,
                  textDecoration: 'underline'
                }
              }}
            >
              Términos de Uso
            </Link>
            <Link 
              href="#" 
              sx={{ 
                color: colors.blue14,
                textDecoration: 'none',
                fontSize: { xs: '0.8rem', md: '0.875rem' },
                '&:hover': { 
                  color: colors.gold4,
                  textDecoration: 'underline'
                }
              }}
            >
              Política de Privacidad
            </Link>
          </Box>
        </Box>
      </Container>
    </Box>
  )
}
