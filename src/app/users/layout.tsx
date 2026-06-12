'use client'

import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { CircularProgress, Box, Typography } from '@mui/material'
import { colors } from '../../theme/theme'
import Aside from '../../components/layout/Aside'
import VersionUpdateBanner from '../../components/system/VersionUpdateBanner'

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const isProjectSelectionRoute = pathname === '/users/select-project'

	useEffect(() => {
		if (status === 'unauthenticated') {
			router.push('/auth/signin')
		} else if (status === 'authenticated' && session?.user) {
			if (isProjectSelectionRoute) return
			// Verificar que el usuario tenga rol administrativo o permisos asignados
			const userRole = String((session.user as { role?: string }).role ?? '').trim().toLowerCase()
			if (userRole === 'dev') {
				router.push('/auth/signin?error=dev_area_moved_to_ingenit_v2')
        return
      }
      const permissions = (session.user as any)?.permissions || []
      const adminRoles = ['admin', 'hr_manager', 'supervisor']
      const isBasicUser = userRole === 'user'

      if (!adminRoles.includes(userRole) && !isBasicUser && (!Array.isArray(permissions) || permissions.length === 0)) {
        router.push('/auth/signin?error=access_denied')
      }
    }
	}, [status, session, router, isProjectSelectionRoute])

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
		if (isProjectSelectionRoute) {
			return <Box sx={{ backgroundColor: 'white', minHeight: '100vh' }}>{children}</Box>
		}
		const userRole = String((session.user as { role?: string }).role ?? '').trim().toLowerCase()
		if (userRole === 'dev') return null
		const permissions = (session.user as any)?.permissions || []
		const adminRoles = ['admin', 'hr_manager', 'supervisor']
    const isBasicUser = userRole === 'user'
    
    if (!adminRoles.includes(userRole) && !isBasicUser && (!Array.isArray(permissions) || permissions.length === 0)) {
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
			<Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', width: '100%', minWidth: 0 }}>
        {children}
        <VersionUpdateBanner />
      </Box>
		</Box>
	)
}
