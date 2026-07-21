'use client'

import { useState, useEffect } from 'react'
import { signIn, getSession, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Container,
  Box,
  Paper,
  Typography,
  CircularProgress
} from '@mui/material'
import Image from 'next/image'
import { colors } from '../../../theme/theme'
import { Eye, EyeOff } from 'lucide-react'
import { AppAlert } from '@/components/ui/AppAlert'
import { AppButton } from '@/components/ui/AppButton'
import { AppTextField } from '@/components/ui/FormControls'
import { AppIconButton } from '@/components/ui/InteractiveControls'

export default function SignIn() {
  const { update } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [attemptsThisSession, setAttemptsThisSession] = useState(0)
  const [loading, setLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')
  const router = useRouter()
  const redirectToApp = () => {
    const target = '/users/select-project'
    try { router.replace(target) } catch {}
    window.setTimeout(() => {
      if (window.location.pathname === '/auth/signin') {
        window.location.replace(target)
      }
    }, 1500)
  }

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('error') === 'access_denied') {
        ;(async () => {
          const s = await getSession()
          if (s?.user) {
            try { router.replace('/users/select-project') } catch { window.location.replace('/users/select-project') }
          } else {
            // remove the error param to clean URL without navigating
            history.replaceState(null, '', '/auth/signin')
          }
        })()
      }
    } catch {
      // ignore
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || redirecting) return
    setError('')
    setLoading(true)
    let keepBusyUntilRedirect = false

    const normalizedEmail = String(email || '').trim().toLowerCase()

    try {
      const result = await signIn('credentials', {
        email: normalizedEmail,
        password,
        redirect: false,
        callbackUrl: `${location.origin}/users/select-project`
      })

        // If NextAuth returned a redirect URL, navigate there immediately
        if (result?.ok && result?.url) {
          try {
            const s = await getSession()
            if (s?.user) {
              await update({ projectId: null, projectName: null })
            }
            keepBusyUntilRedirect = true
            setRedirecting(true)
            redirectToApp()
            return
          } catch { /* fallthrough */ }
        }

      if (result?.error) {
        const errorText = String(result.error || '')
        const isNetworkAuthError =
          errorText.includes('AUTH_NETWORK_ERROR') ||
          errorText.toLowerCase().includes('fetch failed') ||
          errorText.includes('AuthRetryableFetchError')

        if (!isNetworkAuthError) setAttemptsThisSession((s) => s + 1)

        if (isNetworkAuthError) {
          setError('No se pudo conectar con el servicio de autenticación. Intenta nuevamente en unos segundos.')
        } else {
          setError('Credenciales inválidas')
        }

        // No redirigir automáticamente; mostramos enlace de restablecer cuando next >= 3
      } else {
        const session = await getSession()
        if (session?.user) {
          await update({ projectId: null, projectName: null })
          keepBusyUntilRedirect = true
          setRedirecting(true)
          redirectToApp()
          return
        }
        setAttemptsThisSession(0)
      }
    } catch {
      setError('Error al iniciar sesión')
    } finally {
      if (!keepBusyUntilRedirect) {
        setLoading(false)
      }
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 50%, ${colors.blue6} 100%)`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        py: { xs: 1, sm: 3, md: 4 },
        position: 'relative',
        overflow: 'hidden',
        '@media (max-height: 760px), (max-width: 1366px)': {
          py: { md: 1.75 },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '&::after': {
            animation: 'none',
          },
        },
        '@keyframes signinBackgroundDrift': {
          '0%': {
            transform: 'translate3d(-3%, -2%, 0)',
          },
          '100%': {
            transform: 'translate3d(3%, 2%, 0)',
          },
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
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: '-25%',
          background: `repeating-linear-gradient(115deg, transparent 0 150px, ${colors.white}0D 150px 151px)`,
          opacity: 0.65,
          animation: 'signinBackgroundDrift 24s ease-in-out infinite alternate',
          willChange: 'transform',
          pointerEvents: 'none',
        }
      }}
    >
      <Container
        maxWidth="sm"
        sx={{
          position: 'relative',
          zIndex: 1,
          px: { xs: 2, sm: 2.5, md: 3 },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Paper 
            elevation={8} 
            sx={{ 
              p: { xs: 2, sm: 2.75, md: 3 },
              width: { xs: 'min(calc(100vw - 32px), 410px)', sm: '100%' },
              mx: 'auto',
              maxWidth: { xs: 410, sm: 500, md: 460 },
              borderRadius: { xs: 3.5, sm: 3 },
              background: colors.white,
              backdropFilter: 'blur(10px)',
              border: `1px solid ${colors.blue13}50`,
              '@media (max-height: 860px)': {
                p: { sm: 2.25, md: 2.5 },
                maxWidth: { md: 430 },
              },
              '@media (max-height: 760px), (max-width: 1366px)': {
                p: { md: 2 },
                maxWidth: { md: 390 },
              },
            }}
          >
            <Box
              textAlign="center"
              mb={{ xs: 1.5, sm: 1.75, md: 2 }}
              onClick={() => router.push('/')}
              sx={{ cursor: 'pointer' }}
              role="link"
              aria-label="Ir al inicio"
            >
              <Image
                src="/assets/logo_transparent_ingenIT.png"
                alt="IngenIT Logo"
                width={150}
                height={58}
                unoptimized
                priority
                style={{ 
                  maxWidth: '100%',
                  height: 'auto',
                  marginTop: '4px',
                }}
              />
            </Box>

            <Box component="form" onSubmit={handleSubmit} sx={{ mt: .5 }}>
              {error && (
                <AppAlert severity="error" sx={{ mb: 1.5 }}>
                  {error}
                </AppAlert>
              )}

              <Typography
                variant="body2"
                sx={{
                  mb: { xs: 1.5, sm: 1.75 },
                  textAlign: 'center',
                  color: colors.blue11,
                  fontWeight: 400,
                  letterSpacing: 0.2,
                  fontSize: { xs: '1.2rem', sm: '1.3rem', md: '1.4em' }
                }}
              >
                Acceso al sistema
              </Typography>
              
              <AppTextField
                margin="none"
                required
                id="email"
                label="Correo electrónico"
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || redirecting}
                sx={{ mb: 2 }}
              />
              
              <AppTextField
                margin="none"
                required
                name="password"
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || redirecting}
                sx={{
                  mb: 2,
                  '& input::-ms-reveal, & input::-ms-clear': {
                    display: 'none',
                  },
                  '& input::-webkit-credentials-auto-fill-button': {
                    visibility: 'hidden',
                    display: 'none !important',
                    pointerEvents: 'none',
                    position: 'absolute',
                    right: 0,
                  },
                }}
                InputProps={{
                  endAdornment: (
                    <AppIconButton
                      type="button"
                      size="small"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      sx={{ ml: 1, color: colors.gray8 }}
                    >
                      {showPassword ? (
                        <EyeOff size={20} />
                      ) : (
                        <Eye size={20} />
                      )}
                    </AppIconButton>
                  ),
                }}
              />

              {attemptsThisSession >= 3 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 1.5 }}>
                  {resetError ? (
                    <Typography variant="body2" color="error" sx={{ mb: 1 }}>{resetError}</Typography>
                  ) : resetMessage ? (
                    <Typography variant="body2" color="success.main" sx={{ mb: 1 }}>{resetMessage}</Typography>
                  ) : null}

                  <AppButton
                    onClick={async () => {
                      setResetError('')
                      setResetMessage('')
                      if (!email) {
                        setResetError('Ingresa tu correo para enviar el enlace')
                        return
                      }
                      setResetLoading(true)
                        try {
                          const res = await fetch('/api/auth/forgot', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email })
                          })
                          const j = await res.json()
                          if (!res.ok) {
                            setResetError(j?.error || 'Error al solicitar restablecimiento')
                          } else {
                            // Consider success only when server returned a preview/reset URL (dev) or explicit ok (prod)
                            if (j?.resetUrl || j?.previewUrl) {
                              // show the resetUrl in dev for testing
                              setResetMessage('Se envió el enlace. Revisa tu correo (o abre el enlace dev).')
                              if (j.resetUrl) console.info('Reset URL (dev):', j.resetUrl)
                              if (j.previewUrl) console.info('Email preview (Ethereal):', j.previewUrl)
                            } else {
                              // No URL returned — assume server attempted to send via real SMTP.
                              // If server returned ok without URL, treat as success but inform user to check email.
                              setResetMessage('Si existe una cuenta con ese correo, recibirás instrucciones por email.')
                            }
                            // refresh the page shortly after showing the message to reset UI
                            setTimeout(() => {
                              try { window.location.reload() } catch { router.refresh() }
                            }, 3000)
                          }
                        } catch {
                          setResetError('Error de red')
                        } finally {
                          setResetLoading(false)
                        }
                    }}
                    variant="text"
                    disabled={resetLoading}
                    sx={{ color: colors.blue6, minHeight: 32, px: 0.5, '&:hover': { textDecoration: 'underline', backgroundColor: 'transparent' } }}
                  >
                    {resetLoading ? 'Enviando...' : '¿Olvidaste tu contraseña? Restablecer contraseña'}
                  </AppButton>
                </Box>
              )}
              
              <AppButton
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || redirecting}
                sx={{ 
                  minHeight: 46,
                  '@media (max-height: 760px), (max-width: 1366px)': {
                    minHeight: 44,
                  },
                  '&:hover': {
                    transform: 'translateY(-1px)',
                    boxShadow: `0 8px 20px ${colors.blue6}30`
                  },
                  '&:disabled': {
                    background: colors.gray7,
                    color: colors.gray5
                  }
                }}
              >
                {loading || redirecting ? (
                  <Box display="flex" alignItems="center" gap={2}>
                    <CircularProgress size={20} sx={{ color: colors.white }} />
                    {redirecting ? 'Ingresando...' : 'Iniciando sesión...'}
                  </Box>
                ) : (
                  'Iniciar sesión'
                )}
              </AppButton>
            </Box>
          </Paper>
        </Box>
      </Container>
    </Box>
  )
}
