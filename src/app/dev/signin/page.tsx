"use client"
import React, { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Container, Box, Paper, TextField, Button, Typography, CircularProgress, IconButton, InputAdornment } from '@mui/material'
import Image from 'next/image'
import { colors } from '../../../theme/theme'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'

export default function DevSignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
        callbackUrl: `${location.origin}/dev/dashboard`
      })
      if (result?.ok && result?.url) {
        try { router.replace(result.url); return } catch { window.location.replace(result.url) }
      }
      if (result?.error) setError(result.error)
    } catch (e:any) {
      setError('Error de autenticación')
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
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          

          <Paper
            elevation={8}
            sx={{ padding: 4, width: '100%', borderRadius: 3, background: colors.white, backdropFilter: 'blur(10px)', border: `1px solid ${colors.blue13}50` }}
          >
            <Box textAlign="center" mb={3}>
              <Image src="/assets/logo_transparent_ingenIT.png" alt="IngenIT Logo" width={140} height={55} unoptimized priority style={{ maxWidth: '100%', height: 'auto' }} />
            </Box>

            <Typography component="h1" variant="h4" align="center" sx={{ color: colors.blue1, fontWeight: 700, mb: 1 }}>
              Acceso Dev
            </Typography>

            <Typography variant="body2" align="center" sx={{ color: colors.gold3, mb: 3, fontWeight: 500, backgroundColor: colors.gold7, padding: 1, borderRadius: 1, border: `1px solid ${colors.gold3}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <ShieldCheck size={16} className="text-current" />
              Acceso Superusuario
            </Typography>

            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
              {error && (
                <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
              )}

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
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, '&:hover fieldset': { borderColor: colors.blue6 }, '&.Mui-focused fieldset': { borderColor: colors.blue6 } }, '& .MuiInputLabel-root.Mui-focused': { color: colors.blue6 } }}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 2, '&:hover fieldset': { borderColor: colors.blue6 }, '&.Mui-focused fieldset': { borderColor: colors.blue6 } }, '& .MuiInputLabel-root.Mui-focused': { color: colors.blue6 } }}
                InputProps={{
                  endAdornment: (
                    <Button onClick={() => setShowPassword((prev) => !prev)} sx={{ minWidth: 0, p: 0, ml: 1 }}>
                      {showPassword ? (
                        <EyeOff size={22} color={colors.gray8} />
                      ) : (
                        <Eye size={22} color={colors.gray8} />
                      )}
                    </Button>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{ py: 1.5, fontSize: '1.1rem', fontWeight: 600, borderRadius: 2, textTransform: 'none', background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`, '&:hover': { background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`, transform: 'translateY(-1px)', boxShadow: `0 8px 20px ${colors.blue6}30` }, '&:disabled': { background: colors.gray7, color: colors.gray5 } }}
              >
                {loading ? (
                  <Box display="flex" alignItems="center" gap={2}><CircularProgress size={20} sx={{ color: colors.white }} />Iniciando sesión...</Box>
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
