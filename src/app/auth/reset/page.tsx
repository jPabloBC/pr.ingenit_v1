"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { colors } from '../../../theme/theme'
import { Eye, EyeOff } from 'lucide-react'
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  LinearProgress
} from '@mui/material'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [token, setToken] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [countdown, setCountdown] = useState(7)

  const getPasswordStrength = (pw: string) => {
    let score = 0
    if (!pw) return { score: 0, label: 'Muy débil' }
    if (pw.length >= 8) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte']
    return { score, label: labels[score] || 'Muy débil' }
  }

  const router = useRouter()

  useEffect(() => {
    try {
      const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
      const t = sp.get('token')
      if (t) setToken(t)
    } catch (e) {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!token) return
    const validate = async () => {
      setValidating(true)
      setError('')
      setTokenValid(null)
      try {
        const res = await fetch(`/api/auth/reset/validate?token=${encodeURIComponent(token)}`)
        const j = await res.json()
        if (res.ok && j?.valid) {
          setTokenValid(true)
        } else {
          setTokenValid(false)
          const reason = j?.reason || 'invalid'
          if (reason === 'expired') setError('El enlace ha expirado. Solicita uno nuevo.')
          else if (reason === 'used') setError('El enlace ya fue usado.')
          else setError('Token inválido. Solicita un nuevo enlace.')
        }
      } catch (e) {
        setTokenValid(false)
        setError('Error al validar el enlace')
      } finally {
        setValidating(false)
      }
    }
    validate()
  }, [token])

  const performReset = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    setMessage('')
    if (!token) return setError('Token faltante')
    if (!newPassword || newPassword.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    if (newPassword !== confirmPassword) return setError('Las contraseñas no coinciden')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: newPassword })
      })
      if (res.ok) {
        setResetDone(true)
        setMessage('Contraseña restablecida correctamente. Serás redirigido en unos segundos...')
        setLoading(false)
        setCountdown(7)
      } else {
        const j = await res.json()
        setError(j?.error || 'Error al restablecer contraseña')
      }
    } catch (e) {
      setError('Error de red')
    } finally {
      if (!resetDone) setLoading(false)
    }
  }

  useEffect(() => {
    if (!resetDone) return
    setCountdown(7)
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id)
          router.push('/auth/signin')
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [resetDone, router])

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 50%, ${colors.blue6} 100%)` }}>
      <Container maxWidth="sm">
        <Paper elevation={8} sx={{ p: 4, mt: 6, borderRadius: 3 }}>
          <Typography variant="h5" sx={{ mb: 2, color: colors.blue1 }}>Restablecer contraseña</Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

          {!token ? (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">Abre el enlace de restablecimiento desde tu correo para cambiar la contraseña.</Typography>
            </Box>
          ) : validating ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : resetDone ? (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Contraseña restablecida</Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>Tu contraseña ha sido actualizada correctamente.</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>Redirigiendo en {countdown} segundos...</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                <Button variant="contained" onClick={() => router.push('/auth/signin')}>Ir al inicio de sesión ahora</Button>
              </Box>
            </Box>
          ) : tokenValid ? (
            <Box component="form" onSubmit={performReset}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="newPassword"
                label="Nueva contraseña"
                name="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowNewPassword((s) => !s)} edge="end">
                        {showNewPassword ? <EyeOff size={20} color={colors.gray8} /> : <Eye size={20} color={colors.gray8} />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />


              <TextField
                margin="normal"
                required
                fullWidth
                id="confirmPassword"
                label="Repetir contraseña"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowConfirmPassword((s) => !s)} edge="end">
                        {showConfirmPassword ? <EyeOff size={20} color={colors.gray8} /> : <Eye size={20} color={colors.gray8} />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />

              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Requisitos: mínimo 8 caracteres, incluir mayúsculas, números o símbolos para mayor seguridad.</Typography>
              </Box>

              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Fortaleza: {getPasswordStrength(newPassword).label}</Typography>
                <LinearProgress variant="determinate" value={(getPasswordStrength(newPassword).score / 4) * 100} sx={{ height: 8, borderRadius: 1 }} />
              </Box>

              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <Typography variant="body2" color="error" sx={{ mb: 1 }}>Las contraseñas no coinciden</Typography>
              )}

              <Button type="submit" fullWidth variant="contained" disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword} sx={{ mt: 2 }}>
                {loading ? <CircularProgress size={18} sx={{ color: colors.white }} /> : 'Restablecer contraseña'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">No es posible usar este enlace. Solicita uno nuevo.</Typography>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  )
}
