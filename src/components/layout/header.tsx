'use client'

import { AppBar, Toolbar, Box, Typography, Button, Container } from '@mui/material'
import Image from 'next/image'
import { colors } from '@/theme/theme'
import Link from 'next/link'

interface HeaderProps {
  showNavigation?: boolean
}

export default function Header({ showNavigation = false }: HeaderProps) {
  return (
    <AppBar 
      position="sticky" 
      elevation={0}
      sx={{
        background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 100%)`,
        borderBottom: `1px solid ${colors.blue6}20`,
        backdropFilter: 'blur(10px)',
      }}
    >
      <Container maxWidth="xl">
        <Toolbar 
          sx={{ 
            justifyContent: 'space-between',
            py: 2
          }}
        >
          {/* Logo y marca */}
          <Box display="flex" alignItems="center" gap={2}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Box display="flex" alignItems="center" gap={2}>
                <Image
                  src="/assets/icon_ingenIT_wt.png"
                  alt="IngenIT Logo"
                  width={60}
                  height={60}
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
            <Box>
              <Typography 
                variant="body2" 
                sx={{ 
                  color: colors.blue13,
                  fontSize: '0.875rem'
                }}
              >
                v1.0.0
              </Typography>
            </Box>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  )
}