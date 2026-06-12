'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Container,
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Avatar,
  Chip,
  Button,
  Alert,
  CircularProgress,
  Divider
} from '@mui/material'
import {
  Person,
  Schedule,
  Security,
  Receipt,
  Notifications,
  CheckCircle,
  AccessTime,
  Warning
} from '@mui/icons-material'
import Image from 'next/image'
import { colors } from '../../../theme/theme'

interface EmployeeData {
  id: string
  firstName: string
  lastName: string
  email: string
  rut: string
  position: string
  department: {
    name: string
  }
  company: {
    name: string
  }
  status: string
}

export default function EmployeeDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [employee, setEmployee] = useState<EmployeeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchEmployeeData = async () => {
    try {
      setLoading(true)
      // In a real implementation, you would fetch the employee data
      // For now, we'll simulate it
      setTimeout(() => {
        setEmployee({
          id: '1',
          firstName: 'Juan',
          lastName: 'Pérez',
          email: session?.user?.email || '',
          rut: '12.345.678-9',
          position: 'Operador de Mina',
          department: { name: 'Operaciones' },
          company: { name: 'Minera Ejemplo S.A.' },
          status: 'ACTIVE'
        })
        setLoading(false)
      }, 1000)
    } catch {
      setError('Error al cargar los datos del empleado')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin?type=employee')
      return
    }

    if (session?.user) {
  // Check if user has employee role
  const userRole = (session.user as { role?: string }).role ?? ''
  if (['ADMIN', 'HR_MANAGER', 'SUPERVISOR'].includes(userRole)) {
        router.push('/dashboard')
        return
      }

      fetchEmployeeData()
    }
  }, [session, status, router, fetchEmployeeData])

  if (status === 'loading' || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    )
  }

  return (
    <Box sx={{ 
      minHeight: '100vh',
      background: `linear-gradient(180deg, ${colors.blue1} 0%, ${colors.gray10} 30%)`,
      pb: 4
    }}>
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        {/* Header con logo */}
        <Paper 
          elevation={8} 
          sx={{ 
            p: 4, 
            mb: 4, 
            background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 100%)`,
            color: colors.white,
            borderRadius: 3,
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              right: 0,
              width: '200px',
              height: '200px',
              background: `radial-gradient(circle, ${colors.blue6}30 0%, transparent 70%)`,
              transform: 'translate(50px, -50px)'
            }
          }}
        >
          {/* Logo en la esquina superior */}
          <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
            <Image
              src="/assets/logo_transparent_ingenIT_white.png"
              alt="IngenIT Logo"
              width={80}
              height={32}
              unoptimized
              priority
              style={{ 
                filter: 'brightness(0) invert(1)',
                opacity: 0.7
              }}
            />
          </Box>
          
          <Box display="flex" alignItems="center" gap={3} sx={{ position: 'relative', zIndex: 1 }}>
            <Avatar sx={{ 
              width: 80, 
              height: 80, 
              bgcolor: colors.gold3,
              color: colors.blue1,
              fontSize: '2rem',
              fontWeight: 700,
              border: `3px solid ${colors.white}40`
            }}>
              <Person fontSize="large" />
            </Avatar>
            <Box>
              <Typography 
                variant="h3" 
                sx={{
                  color: colors.white,
                  fontWeight: 700,
                  mb: 1,
                  textShadow: `2px 2px 4px ${colors.blue1}80`
                }}
              >
                Bienvenido, {employee?.firstName}
              </Typography>
              <Typography 
                variant="h5" 
                sx={{ 
                  color: colors.gold4,
                  fontWeight: 500,
                  mb: 0.5
                }}
              >
                {employee?.position}
              </Typography>
              <Typography 
                variant="h6" 
                sx={{ 
                  color: colors.blue13,
                  fontWeight: 400,
                  opacity: 0.9
                }}
              >
                {employee?.department.name} • {employee?.company.name}
              </Typography>
            </Box>
          </Box>
        </Paper>

      {/* Quick Actions */}
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
        gap: 3,
        mb: 4
      }}>
        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ textAlign: 'center', p: 3 }}>
            <Schedule color="primary" sx={{ fontSize: 40, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Mi Asistencia
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Ver registro de asistencia y solicitar permisos
            </Typography>
            <Button variant="contained" fullWidth>
              Ver Asistencia
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ textAlign: 'center', p: 3 }}>
            <Security color="primary" sx={{ fontSize: 40, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Mi EPP
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Estado de elementos de protección personal
            </Typography>
            <Button variant="contained" fullWidth>
              Ver EPP
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ textAlign: 'center', p: 3 }}>
            <Receipt color="primary" sx={{ fontSize: 40, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Liquidaciones
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Descargar liquidaciones de sueldo
            </Typography>
            <Button variant="contained" fullWidth>
              Ver Liquidaciones
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ textAlign: 'center', p: 3 }}>
            <Person color="primary" sx={{ fontSize: 40, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Mi Perfil
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Actualizar información personal
            </Typography>
            <Button variant="contained" fullWidth>
              Ver Perfil
            </Button>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
        gap: 3
      }}>
        {/* Personal Info */}
        <Paper elevation={2} sx={{ p: 3, height: 'fit-content' }}>
          <Typography variant="h6" gutterBottom display="flex" alignItems="center">
            <Person sx={{ mr: 1 }} />
            Información Personal
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="textSecondary">RUT</Typography>
            <Typography variant="body1" fontWeight="medium">{employee?.rut}</Typography>
          </Box>
          
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="textSecondary">Email</Typography>
            <Typography variant="body1" fontWeight="medium">{employee?.email}</Typography>
          </Box>
          
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="textSecondary">Cargo</Typography>
            <Typography variant="body1" fontWeight="medium">{employee?.position}</Typography>
          </Box>
          
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="textSecondary">Estado</Typography>
            <Chip 
              label={employee?.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
              color={employee?.status === 'ACTIVE' ? 'success' : 'error'}
              size="small"
            />
          </Box>
        </Paper>

        {/* Recent Activity & Notifications */}
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom display="flex" alignItems="center">
            <Notifications sx={{ mr: 1 }} />
            Notificaciones Recientes
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Box sx={{ mb: 2 }}>
            <Alert severity="success" icon={<CheckCircle />}>
              <Typography variant="body2">
                Asistencia registrada correctamente - Hoy 08:00 AM
              </Typography>
            </Alert>
          </Box>
          
          <Box sx={{ mb: 2 }}>
            <Alert severity="info" icon={<AccessTime />}>
              <Typography variant="body2">
                Recuerda actualizar tu certificado de EPP antes del 15/12
              </Typography>
            </Alert>
          </Box>
          
          <Box sx={{ mb: 2 }}>
            <Alert severity="warning" icon={<Warning />}>
              <Typography variant="body2">
                Nueva liquidación disponible para descarga
              </Typography>
            </Alert>
          </Box>
        </Paper>
      </Box>
      </Container>
    </Box>
  )
}