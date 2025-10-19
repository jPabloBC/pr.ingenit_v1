'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { CircularProgress, Box, Typography } from '@mui/material'
import { colors } from '../../theme/theme'
import Aside from '@/components/layout/Aside'

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    } else if (status === 'authenticated' && session?.user) {
      // Verificar que el usuario tenga rol administrativo
      const userRole = (session.user as any).role
      const adminRoles = ['admin', 'hr_manager', 'supervisor', 'ADMIN', 'HR_MANAGER', 'SUPERVISOR']
      
      if (!adminRoles.includes(userRole)) {
        router.push('/auth/signin?error=access_denied')
      }
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <Box 
        display="flex" 
        flexDirection="column"
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
        sx={{
          background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 50%, ${colors.blue6} 100%)`,
          zIndex: 0
        }}
      >
        <CircularProgress size={60} sx={{ color: colors.white, mb: 2 }} />
        <Typography variant="h6" sx={{ color: colors.white, fontWeight: 500 }}>
          Verificando acceso...
        </Typography>
      </Box>
    )
  }

  if (status === 'unauthenticated') {
    return null // Se redirige automáticamente
  }

  if (status === 'authenticated' && session?.user) {
    const userRole = (session.user as any).role
    const adminRoles = ['admin', 'hr_manager', 'supervisor', 'ADMIN', 'HR_MANAGER', 'SUPERVISOR']
    
    if (!adminRoles.includes(userRole)) {
      return (
        <Box 
          display="flex" 
          flexDirection="column"
          justifyContent="center" 
          alignItems="center" 
          minHeight="100vh"
          sx={{
            background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 50%, ${colors.blue6} 100%)`,
            zIndex: 0
          }}
        >
          <Typography variant="h4" sx={{ color: colors.white, mb: 2, textAlign: 'center' }}>
            Acceso Denegado
          </Typography>
          <Typography variant="h6" sx={{ color: colors.white, textAlign: 'center' }}>
            No tienes permisos para acceder a esta sección
          </Typography>
        </Box>
      )
    }
  }

  return (
    <Box sx={{ display: 'flex', backgroundColor: 'white', minHeight: '100vh' }}>
      <Aside />
      <Box sx={{ flex: 1 }}>{children}</Box>
    </Box>
  )
}

