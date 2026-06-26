'use client'

import { AppBar, Toolbar, Box, Typography, Button, Container } from '@mui/material'
import Image from 'next/image'
import { colors } from '../../theme/theme'
import Link from 'next/link'

interface HeaderProps {
  showNavigation?: boolean
}

export default function Header({ showNavigation = false }: HeaderProps) {
  const appVersion = String(process.env.NEXT_PUBLIC_APP_VERSION || 'dev')

  return (
    <AppBar 
      position="sticky" 
      elevation={0}
      sx={{
        background: `${colors.blue1}f2`,
        borderBottom: `1px solid ${colors.blue12}24`,
        backdropFilter: 'blur(10px)',
        '@media (max-height: 760px), (max-width: 1366px)': {
          borderBottom: `1px solid ${colors.blue6}18`,
        },
      }}
    >
      <Container
        maxWidth="xl"
        sx={{
          px: { xs: 1.5, sm: 2.5, md: 3 },
        }}
      >
        <Toolbar 
          sx={{ 
            justifyContent: 'space-between',
            py: { xs: 0.75, sm: 1, md: 1 },
            minHeight: { xs: 56, md: 68 },
            '@media (max-height: 760px), (max-width: 1366px)': {
              py: { md: 0.5 },
              minHeight: { md: 52 },
            },
          }}
        >
          {/* Logo y marca */}
          <Box display="flex" alignItems="center" gap={2}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Box display="flex" alignItems="center" gap={2}>
                <Image
                  src="/assets/logo_transparent_ingenIT_white.png"
                  alt="IngenIT Logo"
                  width={126}
                  height={40}
                  unoptimized
                  priority
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                  }}
                />
              </Box>
            </Link>
          </Box>

          {/* Navegación (opcional) */}
          {showNavigation && (
            <Box display="flex" alignItems="center" gap={2}>
              <Button 
                color="inherit" 
                sx={{ 
                  color: colors.white,
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: colors.blue6 + '20'
                  }
                }}
              >
                Inicio
              </Button>
              <Button 
                color="inherit" 
                sx={{ 
                  color: colors.white,
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: colors.blue6 + '20'
                  }
                }}
              >
                Servicios
              </Button>
              <Button 
                color="inherit" 
                sx={{ 
                  color: colors.white,
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: colors.blue6 + '20'
                  }
                }}
              >
                Contacto
              </Button>
            </Box>
          )}

          {/* Espacio para futuros elementos */}
          {!showNavigation && (
            <Box
              sx={{
                px: 1.2,
                py: 0.45,
                border: `1px solid ${colors.blue12}25`,
                borderRadius: 1,
                bgcolor: `${colors.white}08`,
              }}
            >
              <Typography 
                variant="body2" 
                sx={{ 
                  color: colors.blue15,
                  fontSize: { xs: '0.72rem', md: '0.8rem' },
                  fontWeight: 600,
                  '@media (max-height: 760px), (max-width: 1366px)': {
                    fontSize: { md: '0.78rem' },
                  },
                }}
              >
                v{appVersion}
              </Typography>
            </Box>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  )
}
