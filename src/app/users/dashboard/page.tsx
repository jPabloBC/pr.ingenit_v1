'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Container
} from '@mui/material'
import {
  People,
  AccessTime,
  Security
} from '@mui/icons-material'
import UserHeader from '@/components/layout/UserHeader';
import { colors } from '@/theme/theme'

interface DashboardStats {
  totalCollaborators: number
  activeCollaborators: number
  presentToday: number
  absentToday: number
  expiredEPP: number
  pendingPayroll: number
}

interface DepartmentStats {
  id: string
  name: string
  collaboratorCount: number
}

interface Alert {
  id: string
  type: string
  title: string
  message: string
  priority: string
}

interface MonthlyStats {
  averageAttendance: number
  averageOvertime: number
  incidents: number
  eppUsageRate: number
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [departments, setDepartments] = useState<DepartmentStats[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!session?.user?.companyId) return
      
      try {
        // Fetch all dashboard data in parallel
        const [statsResponse, departmentsResponse, alertsResponse, monthlyResponse] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/departments'),
          fetch('/api/dashboard/alerts'),
          fetch('/api/dashboard/monthly')
        ])

        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          setStats(statsData)
        }

        if (departmentsResponse.ok) {
          const departmentsData = await departmentsResponse.json()
          setDepartments(departmentsData)
        }

        if (alertsResponse.ok) {
          const alertsData = await alertsResponse.json()
          setAlerts(alertsData)
        }

        if (monthlyResponse.ok) {
          const monthlyData = await monthlyResponse.json()
          setMonthlyStats(monthlyData)
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (session?.user?.companyId) {
      fetchDashboardData()
    }
  }, [session])

  if (status === 'loading' || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  if (!session) {
    return null
  }

  const statsCards = [
    {
      title: 'Total Colaboradores',
      value: stats?.totalCollaborators || 0,
      icon: <People />,
      color: 'primary'
    },
    {
      title: 'Activos',
      value: stats?.activeCollaborators || 0,
      icon: <People />,
      color: 'success'
    },
    {
      title: 'Presentes Hoy',
      value: stats?.presentToday || 0,
      icon: <AccessTime />,
      color: 'success'
    },
    {
      title: 'Ausentes Hoy',
      value: stats?.absentToday || 0,
      icon: <AccessTime />,
      color: 'error'
    },
    {
      title: 'EPP Vencidos',
      value: stats?.expiredEPP || 0,
      icon: <Security />,
      color: 'warning'
    },
    {
      title: 'Nóminas Pendientes',
      value: stats?.pendingPayroll || 0,
      icon: <Security />,
      color: 'info'
    }
  ]

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <UserHeader title="Dashboard" />
        <Box component="main" sx={{ flexGrow: 1, my: 2 }}>
          <Container maxWidth="xl">
            <Typography variant="h4" gutterBottom>
              Dashboard - {session.user.companyName || 'Mi Empresa'}
            </Typography>
            
            {/* Tarjetas de estadísticas */}
            <Box 
              display="grid" 
              gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }}
              gap={3}
              mb={4}
            >
              {statsCards.map((stat, index) => (
                <Card key={index}>
                  <CardContent>
                    <Box display="flex" alignItems="center">
                      <Box sx={{ mr: 2, color: `${stat.color}.main` }}>
                        {stat.icon}
                      </Box>
                      <Box>
                        <Typography variant="h5" component="div">
                          {stat.value}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {stat.title}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>

            <Box 
              display="grid" 
              gridTemplateColumns={{ xs: '1fr', md: '2fr 1fr' }}
              gap={3}
              mb={4}
            >
              {/* Gráfico de asistencia */}
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Asistencia Semanal
                </Typography>
                <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Gráfico de asistencia (En desarrollo)
                  </Typography>
                </Box>
              </Paper>

              {/* Distribución por departamento */}
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Por Departamento
                </Typography>
                <List dense>
                  {departments.length > 0 ? (
                    departments.map((dept) => (
                      <ListItem key={dept.id}>
                        <ListItemText 
                          primary={dept.name} 
                          secondary={`${dept.collaboratorCount} colaboradores`} 
                        />
                      </ListItem>
                    ))
                  ) : (
                    <ListItem>
                      <ListItemText 
                        primary="Sin departamentos registrados" 
                        secondary="No hay departamentos configurados" 
                      />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Box>

            <Box 
              display="grid" 
              gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }}
              gap={3}
            >
              {/* Alertas y notificaciones */}
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Alertas Recientes
                </Typography>
                <List>
                  {alerts.length > 0 ? (
                    alerts.map((alert) => (
                      <ListItem key={alert.id}>
                        <ListItemText
                          primary={alert.title}
                          secondary={alert.message}
                        />
                        <Chip 
                          label={alert.priority === 'high' ? 'Urgente' : alert.priority === 'medium' ? 'Pendiente' : 'Info'} 
                          color={alert.type === 'warning' ? 'error' : alert.type === 'info' ? 'info' : 'warning'} 
                          size="small" 
                        />
                      </ListItem>
                    ))
                  ) : (
                    <ListItem>
                      <ListItemText
                        primary="Sin alertas"
                        secondary="No hay alertas pendientes"
                      />
                    </ListItem>
                  )}
                </List>
              </Paper>

              {/* Resumen rápido */}
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Resumen del Mes
                </Typography>
                <Box 
                  display="grid" 
                  gridTemplateColumns="1fr 1fr"
                  gap={2}
                  mt={2}
                >
                  <Box textAlign="center">
                    <Typography variant="h4" color="primary">
                      {monthlyStats?.averageAttendance || 0}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Asistencia Promedio
                    </Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="h4" color="success.main">
                      {monthlyStats?.averageOvertime || 0}h
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Horas Extra Promedio
                    </Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="h4" color="error">
                      {monthlyStats?.incidents || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Incidentes Reportados
                    </Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="h4" color="warning.main">
                      {monthlyStats?.eppUsageRate || 0}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      EPP en Uso
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>
  )
}