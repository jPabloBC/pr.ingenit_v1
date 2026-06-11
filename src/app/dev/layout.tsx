"use client"

import React, { useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { CircularProgress, Box, Typography } from '@mui/material'
import { colors } from '../../theme/theme'
import Aside from '../../components/layout/Aside'

export default function DevLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const timerRef = useRef<number | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    // do not auto-redirect when we are already on the signin page
    if (status === 'unauthenticated' && pathname !== '/dev/signin') {
      router.push('/dev/signin')
    }

    // if already authenticated and is a dev, don't show signin — send to dashboard
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role ?? ''
      if (role === 'dev' && pathname === '/dev/signin') {
        try { router.replace('/dev/summary') } catch { window.location.replace('/dev/summary') }
      }
    }
  }, [status, router, pathname])

  useEffect(() => {
    // If the user is authenticated but not a dev, sign them out and send to dev signin
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role ?? ''
      if (role !== 'dev' && pathname !== '/dev/signin') {
        if (!timerRef.current) {
          // show message for ~8s then sign out
          timerRef.current = window.setTimeout(() => {
            try {
              signOut({ callbackUrl: '/dev/signin' })
            } catch (e) {
              router.push('/dev/signin')
            }
          }, 8000)
          setSigningOut(true)
        }
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [status, session, pathname, router])

  if (status === 'loading') {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" sx={{ background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 50%, ${colors.blue6} 100%)` }}>
        <CircularProgress size={60} sx={{ color: colors.white, mb: 2 }} />
        <Typography variant="h6" sx={{ color: colors.white, fontWeight: 500 }}>Verificando acceso...</Typography>
      </Box>
    )
  }

  // allow rendering of signin page without Aside regardless of auth state
  if (pathname === '/dev/signin') {
    return <Box sx={{ minHeight: '100vh' }}>{children}</Box>
  }

  if (status === 'unauthenticated') return null

  const role = (session?.user as any)?.role ?? ''
  if (status === 'authenticated' && role !== 'dev') {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" sx={{ background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 50%, ${colors.blue6} 100%)` }}>
        <Typography variant="h4" sx={{ color: colors.white, mb: 2, textAlign: 'center' }}>Acceso Denegado</Typography>
        <Typography variant="h6" sx={{ color: colors.white, textAlign: 'center' }}>No tienes permisos para acceder a esta sección</Typography>
        {signingOut && (
          <Typography variant="body2" sx={{ color: colors.white, mt: 2 }}>Redirigiendo al inicio de sesión en unos segundos...</Typography>
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', backgroundColor: '#f6f8fb', minHeight: '100vh' }}>
      <Aside />
      <Box sx={{ flex: 1, overflow: 'auto', width: '100%' }}>
        <Box component="header" sx={{ background: 'white', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <Box sx={{ width: '100%', px: 0.5, py: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Dev Area</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Permisos y resumenes</Typography>
          </Box>
        </Box>

        <Box sx={{ width: '100%', px: 1, py: 1 }}>{children}</Box>
      </Box>
    </Box>
  )
}
