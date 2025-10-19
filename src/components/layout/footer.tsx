'use client'

import { Box, Container, Typography, Grid, Link, Divider } from '@mui/material'
import Image from 'next/image'
import { colors } from '@/theme/theme'
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
        pt: 6,
        pb: 3,
        mt: 'auto'
      }}
    >
      <Container maxWidth="xl">
        <Grid container spacing={4}>
          {/* Información de la empresa */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Box display="flex" alignItems="center" gap={2} mb={3}>
              <Image
                src="/assets/logo_transparent_ingenIT_white.png"
                alt="IngenIT Logo"
                width={140}
                height={45}
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                }}
              />
            </Box>
            
            <Typography 
              variant="body2" 
              sx={{ 
                color: colors.blue13,
                mb: 2,
                lineHeight: 1.6
              }}
            >
              Soluciones tecnológicas especializadas para la gestión de recursos humanos 
              en minería, pymes y grandes empresas.
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
                color: colors.white,
                fontWeight: 600,
                mb: 3
              }}
            >
              Plataforma
            </Typography>
            
            <Box display="flex" flexDirection="column" gap={1}>
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
                color: colors.white,
                fontWeight: 600,
                mb: 3
              }}
            >
              Soporte
            </Typography>
            
            <Box display="flex" flexDirection="column" gap={1}>
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
                color: colors.white,
                fontWeight: 600,
                mb: 3
              }}
            >
              Contacto
            </Typography>
            
            <Box display="flex" flexDirection="column" gap={2}>
              <Box display="flex" alignItems="center" gap={1}>
                <Email sx={{ color: colors.gold4, fontSize: 18 }} />
                <Typography 
                  variant="body2" 
                  sx={{ color: colors.blue13, fontSize: '0.875rem' }}
                >
                  contacto@ingenit.cl
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <Phone sx={{ color: colors.gold4, fontSize: 18 }} />
                <Typography 
                  variant="body2" 
                  sx={{ color: colors.blue13, fontSize: '0.875rem' }}
                >
                  +56 9 XXXX XXXX
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <LocationOn sx={{ color: colors.gold4, fontSize: 18 }} />
                <Typography 
                  variant="body2" 
                  sx={{ color: colors.blue13, fontSize: '0.875rem' }}
                >
                  Santiago, Chile
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3, borderColor: colors.blue6 + '30' }} />

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
              fontSize: '0.875rem'
            }}
          >
            © {currentYear} IngenIT. Todos los derechos reservados.
          </Typography>
          
          <Box display="flex" gap={3}>
            <Link 
              href="#" 
              sx={{ 
                color: colors.blue14,
                textDecoration: 'none',
                fontSize: '0.875rem',
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
                fontSize: '0.875rem',
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