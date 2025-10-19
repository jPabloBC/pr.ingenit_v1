'use client'

import { useState, useEffect } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Container,
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Divider
} from '@mui/material'
import {
  ArrowBack
} from '@mui/icons-material'
import Image from 'next/image'
import { colors } from '../../../theme/theme'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Solo usuarios administrativos
  const router = useRouter()
  const searchParams = useSearchParams()

  // Eliminado: lógica de tabs y tipos de usuario

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false
      })

      if (result?.error) {
        if (result.error.includes('auth_id')) {
          setError('Error de autenticación: auth_id no sincronizado');
        } else {
          setError('Credenciales inválidas')
        }
      } else {
        // Get the session to check user role and redirect accordingly
        const session = await getSession()
        if (session?.user) {
          // Solo usuarios administrativos
          const userRole = (session.user as any).role
          if (['admin', 'hr_manager', 'supervisor', 'ADMIN', 'HR_MANAGER', 'SUPERVISOR'].includes(userRole)) {
            router.push('/users/dashboard')
          } else {
            setError('No tienes permisos administrativos')
            setLoading(false)
            return
          }
        }
      }
    } catch (err) {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 50%, ${colors.blue6} 100%)`,
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
      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Button
            startIcon={<ArrowBack />}
            onClick={() => router.push('/')}
            sx={{ 
              alignSelf: 'flex-start', 
              mb: 3,
              color: colors.white,
              '&:hover': {
                backgroundColor: `${colors.white}10`
              }
            }}
          >
            Volver al inicio
          </Button>

          <Paper 
            elevation={8} 
            sx={{ 
              padding: 4, 
              width: '100%',
              borderRadius: 3,
              background: colors.white,
              backdropFilter: 'blur(10px)',
              border: `1px solid ${colors.blue13}50`
            }}
          >
            {/* Logo corporativo */}
            <Box textAlign="center" mb={3}>
              <Image
                src="/assets/logo_transparent_ingenIT.png"
                alt="IngenIT Logo"
                width={140}
                height={55}
                style={{ 
                  maxWidth: '100%',
                  height: 'auto'
                }}
              />
            </Box>

            <Typography 
              component="h1" 
              variant="h4" 
              align="center" 
              sx={{
                color: colors.blue1,
                fontWeight: 700,
                mb: 1
              }}
            >
              Bienvenido
            </Typography>
            
            <Typography 
              variant="h6" 
              align="center" 
              sx={{
                color: colors.blue7,
                mb: 2,
                fontWeight: 400
              }}
            >
              Sistema de Gestión de Personal
            </Typography>
            
            <Typography 
              variant="body2" 
              align="center" 
              sx={{
                color: colors.gold3,
                mb: 3,
                fontWeight: 500,
                backgroundColor: colors.gold7,
                padding: 1,
                borderRadius: 1,
                border: `1px solid ${colors.gold3}`
              }}
            >
              🔐 Acceso Administrativo
            </Typography>

            {/* Eliminado: tabs de selección de tipo de usuario */}
          
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
              {error && (
                <Alert 
                  severity="error" 
                  sx={{ 
                    mb: 2,
                    backgroundColor: `${colors.gold7}50`,
                    color: colors.gold1,
                    borderLeft: `4px solid ${colors.gold2}`,
                    '& .MuiAlert-icon': {
                      color: colors.gold2
                    }
                  }}
                >
                  {error}
                </Alert>
              )}

              <Typography 
                variant="body2" 
                sx={{ 
                  mb: 3, 
                  textAlign: 'center',
                  color: colors.blue7,
                  fontWeight: 500,
                  fontSize: '0.9rem'
                }}
              >
                Acceso para administradores y personal de RRHH
              </Typography>
              
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Correo Electrónico"
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    '&:hover fieldset': {
                      borderColor: colors.blue6,
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.blue6,
                    },
                  },
                  '& .MuiInputLabel-root.Mui-focused': {
                    color: colors.blue6,
                  },
                }}
              />
              
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Contraseña"
                type="password"
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    '&:hover fieldset': {
                      borderColor: colors.blue6,
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.blue6,
                    },
                  },
                  '& .MuiInputLabel-root.Mui-focused': {
                    color: colors.blue6,
                  },
                }}
              />
              
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{ 
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  borderRadius: 2,
                  textTransform: 'none',
                  background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
                    transform: 'translateY(-1px)',
                    boxShadow: `0 8px 20px ${colors.blue6}30`
                  },
                  '&:disabled': {
                    background: colors.gray7,
                    color: colors.gray5
                  }
                }}
              >
                {loading ? (
                  <Box display="flex" alignItems="center" gap={2}>
                    <CircularProgress size={20} sx={{ color: colors.white }} />
                    Iniciando sesión...
                  </Box>
                ) : (
                  'Iniciar Sesión'
                )}
              </Button>
            </Box>
          </Paper>
        </Box>
      </Container>
    </Box>
  )
}