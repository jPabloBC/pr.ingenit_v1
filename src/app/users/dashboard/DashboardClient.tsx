"use client"

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
  CircularProgress,
  Container
} from '@mui/material'
import {
  People,
  AccessTime,
  Security
} from '@mui/icons-material'
import UserHeader from '../../../components/layout/UserHeader';
import { colors } from '../../../theme/theme'

export default function DashboardClient() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<any | null>(null)
  const [departments, setDepartments] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [monthlyStats, setMonthlyStats] = useState<any | null>(null)
  const [companyDisplayName, setCompanyDisplayName] = useState('')
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

  useEffect(() => {
    const sessionCompanyName = String(session?.user?.companyName || '').trim()
    if (sessionCompanyName) {
      setCompanyDisplayName(sessionCompanyName)
      return
    }

    const companyId = String(session?.user?.companyId || '').trim()
    if (!companyId) {
      setCompanyDisplayName('')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/companies/${encodeURIComponent(companyId)}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setCompanyDisplayName(String(data?.name || '').trim())
      } catch {
        if (!cancelled) setCompanyDisplayName('')
      }
    })()
    return () => { cancelled = true }
  }, [session?.user?.companyId, session?.user?.companyName])

  if (status === 'loading' || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  if (!session) return null

  const statsCards = [
    { title: 'Total Colaboradores', value: stats?.totalCollaborators || 0, icon: <People />, color: 'primary' },
    { title: 'Activos', value: stats?.activeCollaborators || 0, icon: <People />, color: 'success' },
    { title: 'Presentes Hoy', value: stats?.presentToday || 0, icon: <AccessTime />, color: 'success' },
    { title: 'Ausentes Hoy', value: stats?.absentToday || 0, icon: <AccessTime />, color: 'error' },
    { title: 'EPP Vencidos', value: stats?.expiredEPP || 0, icon: <Security />, color: 'warning' },
    { title: 'Nóminas Pendientes', value: stats?.pendingPayroll || 0, icon: <Security />, color: 'info' }
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh' }}>
      <UserHeader title="Dashboard" />
      <Box component="main" sx={{ flexGrow: 1, my: 2, width: '100%' }}>
        <Container maxWidth={false} disableGutters sx={{ width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            Dashboard - {companyDisplayName || 'Empresa'}
          </Typography>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }} gap={3} mb={4}>
            {statsCards.map((stat, index) => (
              <Card key={index}>
                <CardContent>
                  <Box display="flex" alignItems="center">
                    <Box sx={{ mr: 2, color: `${stat.color}.main` }}>{stat.icon}</Box>
                    <Box>
                      <Typography variant="h5" component="div">{stat.value}</Typography>
                      <Typography variant="body2" color="text.secondary">{stat.title}</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '2fr 1fr' }} gap={3} mb={4}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Asistencia Semanal</Typography>
              <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">Gráfico (placeholder)</Typography>
              </Box>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant="h6">Alertas</Typography>
              <List>
                {alerts.map(a => (
                  <ListItem key={a.id}><ListItemText primary={a.title} secondary={a.message} /></ListItem>
                ))}
              </List>
            </Paper>
          </Box>
        </Container>
      </Box>
    </Box>
  )
}
