'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
  Container,
  Button
} from '@mui/material'
import {
  People,
  AccessTime,
  Security,
  QueryStats
} from '@mui/icons-material'
import UserHeader from '../../../components/layout/UserHeader';
import { colors } from '../../../theme/theme'

interface DashboardStats {
  totalCollaborators: number
  activeCollaborators: number
  presentToday: number
  absentToday: number
  expiredEPP: number
  pendingPayroll: number
  specialtyBreakdown?: { specialty: string; total: number; active: number }[]
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

interface HhHistoryRow {
  id: string
  work_front: string
  report_no: number
  report_date: string
  indirect_hh: number
  direct_hh: number
  daily_hh: number
  indirect_hh_accum: number
  direct_hh_accum: number
  total_hh_accum: number
  major_hm_daily: number
  major_hm_accum: number
  minor_hm_daily: number
  minor_hm_accum: number
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [departments, setDepartments] = useState<DepartmentStats[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null)
  const [hhHistory, setHhHistory] = useState<HhHistoryRow[]>([])
  const [opsView, setOpsView] = useState<'hh' | 'accum' | 'growth'>('hh')
  const [companyDisplayName, setCompanyDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const dashboardLoadedRef = useRef<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    const companyId = String(session?.user?.companyId || '')
    const role = String(session?.user?.role || '')
    const isDev = role === 'dev'

    if (status !== 'authenticated') return

    if (!isDev && !companyId) {
      setLoading(false)
      return
    }

    const loadKey = `${companyId || 'dev'}:${role}`

    if (dashboardLoadedRef.current === loadKey) return
    dashboardLoadedRef.current = loadKey

    const fetchDashboardData = async () => {
      try {
        const [
          statsResponse,
          departmentsResponse,
          alertsResponse,
          monthlyResponse,
          hhHistoryResponse
        ] = await Promise.all([
          fetch('/api/dashboard/stats', { cache: 'no-store' }),
          fetch('/api/dashboard/departments', { cache: 'no-store' }),
          fetch('/api/dashboard/alerts', { cache: 'no-store' }),
          fetch('/api/dashboard/monthly', { cache: 'no-store' }),
          fetch('/api/management/hh-history', { cache: 'no-store' })
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

        if (hhHistoryResponse.ok) {
          const hhHistoryData = await hhHistoryResponse.json()
          setHhHistory(Array.isArray(hhHistoryData) ? hhHistoryData : [])
        }
      } catch (error) {
        dashboardLoadedRef.current = null
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [status, session?.user?.companyId, session?.user?.role])

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

  const latestHhByFront = Array.from(
    hhHistory.reduce((acc, row) => {
      const current = acc.get(row.work_front)
      if (!current || Number(row.report_no || 0) >= Number(current.report_no || 0)) acc.set(row.work_front, row)
      return acc
    }, new Map<string, HhHistoryRow>()).values()
  ).sort((a, b) => a.work_front.localeCompare(b.work_front, 'es'))

  const recentHhRows = [...hhHistory]
    .sort((a, b) => Number(b.report_no || 0) - Number(a.report_no || 0))
    .slice(0, 8)

  const totalDailyHh = latestHhByFront.reduce((acc, row) => acc + Number(row.daily_hh || 0), 0)
  const totalAccumHh = latestHhByFront.reduce((acc, row) => acc + Number(row.total_hh_accum || 0), 0)
  const previousAccumHh = latestHhByFront.reduce((acc, row) => acc + Math.max(0, Number(row.total_hh_accum || 0) - Number(row.daily_hh || 0)), 0)
  const growthPct = previousAccumHh > 0 ? ((totalAccumHh - previousAccumHh) / previousAccumHh) * 100 : 0
  const maxRecentDaily = Math.max(1, ...recentHhRows.map((row) => Number(row.daily_hh || 0)))

  const formatNumber = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Number(value || 0))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh' }}>
      <UserHeader title="Dashboard" />
      <Box component="main" sx={{ flexGrow: 1, my: 2, width: '100%' }}>
          <Container
            maxWidth={false}
            disableGutters
            sx={{ width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 } }}
          >
            <Typography variant="h4" gutterBottom>
              {companyDisplayName || 'Empresa'}
            </Typography>
            
            {/* Tarjetas de estadísticas */}
            <Box 
              display="grid" 
              gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }}
              gap={3}
              mb={4}
            >
              {statsCards.map((stat, index) => (
                <Card
                  key={index}
                  elevation={4}
                  sx={{
                    bgcolor: '#fff',
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.08)'
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Box display="flex" alignItems="center">
                      <Box sx={{ mr: 2, color: `${stat.color}.main`, fontSize: 32 }}>
                        {stat.icon}
                      </Box>
                      <Box>
                        <Typography variant="h4" component="div" fontWeight={700}>
                          {stat.value}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" fontWeight={600}>
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
              <Paper sx={{ p: { xs: 1.5, sm: 2 }, minHeight: 300 }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={1.5} flexWrap="wrap" mb={1.5}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <QueryStats sx={{ color: colors.blue6 }} />
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#052e5a' }}>
                      Control HH
                    </Typography>
                  </Box>
                  <Box display="flex" gap={0.75} flexWrap="wrap">
                    {[
                      { key: 'hh', label: 'HH' },
                      { key: 'accum', label: 'Acumulado' },
                      { key: 'growth', label: 'Crecimiento' }
                    ].map((item) => (
                      <Button
                        key={item.key}
                        size="small"
                        variant={opsView === item.key ? 'contained' : 'outlined'}
                        onClick={() => setOpsView(item.key as typeof opsView)}
                        sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 700 }}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </Box>
                </Box>

                {hhHistory.length === 0 ? (
                  <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin historial HH disponible
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: 'repeat(3, 1fr)' }} gap={1.2} mb={1.6}>
                      <Box sx={{ p: 1.2, border: '1px solid #d9e6f7', borderRadius: 1.5, bgcolor: '#f8fbff' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontWeight: 700 }}>HH último reporte</Typography>
                        <Typography sx={{ fontSize: '1.4rem', color: '#052e5a', fontWeight: 900 }}>{formatNumber(totalDailyHh)}</Typography>
                      </Box>
                      <Box sx={{ p: 1.2, border: '1px solid #d9e6f7', borderRadius: 1.5, bgcolor: '#f8fbff' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontWeight: 700 }}>HH acumuladas</Typography>
                        <Typography sx={{ fontSize: '1.4rem', color: '#052e5a', fontWeight: 900 }}>{formatNumber(totalAccumHh)}</Typography>
                      </Box>
                      <Box sx={{ p: 1.2, border: '1px solid #d9e6f7', borderRadius: 1.5, bgcolor: '#f8fbff' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontWeight: 700 }}>Crecimiento</Typography>
                        <Typography sx={{ fontSize: '1.4rem', color: growthPct >= 0 ? 'success.main' : 'error.main', fontWeight: 900 }}>
                          {growthPct.toFixed(1)}%
                        </Typography>
                      </Box>
                    </Box>

                    {opsView === 'hh' && (
                      <Box display="grid" gap={0.9}>
                        {latestHhByFront.map((row) => (
                          <Box key={row.id} display="grid" gridTemplateColumns="120px 1fr auto" alignItems="center" gap={1}>
                            <Typography sx={{ fontWeight: 800, color: '#052e5a', fontSize: '0.82rem' }}>{row.work_front}</Typography>
                            <Box sx={{ height: 8, borderRadius: 999, bgcolor: '#e7eef8', overflow: 'hidden' }}>
                              <Box sx={{ width: `${Math.min(100, (Number(row.daily_hh || 0) / maxRecentDaily) * 100)}%`, height: '100%', bgcolor: colors.blue6 }} />
                            </Box>
                            <Typography sx={{ fontWeight: 800, fontSize: '0.82rem' }}>{formatNumber(row.daily_hh)} HH</Typography>
                          </Box>
                        ))}
                      </Box>
                    )}

                    {opsView === 'accum' && (
                      <Box display="grid" gap={1}>
                        {latestHhByFront.map((row) => (
                          <Box key={row.id} display="flex" justifyContent="space-between" alignItems="center" sx={{ p: 1, borderRadius: 1.5, bgcolor: '#f8fbff', border: '1px solid #e0e9f6' }}>
                            <Typography sx={{ fontWeight: 800, color: '#052e5a' }}>{row.work_front}</Typography>
                            <Typography sx={{ fontWeight: 900 }}>{formatNumber(row.total_hh_accum)} HH</Typography>
                          </Box>
                        ))}
                      </Box>
                    )}

                    {opsView === 'growth' && (
                      <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: 'repeat(2, 1fr)' }} gap={1}>
                        {latestHhByFront.map((row) => {
                          const previous = Math.max(0, Number(row.total_hh_accum || 0) - Number(row.daily_hh || 0))
                          const pct = previous > 0 ? (Number(row.daily_hh || 0) / previous) * 100 : 0
                          return (
                            <Box key={row.id} sx={{ p: 1.2, borderRadius: 1.5, bgcolor: '#f8fbff', border: '1px solid #e0e9f6' }}>
                              <Typography sx={{ fontWeight: 800, color: '#052e5a' }}>{row.work_front}</Typography>
                              <Typography sx={{ fontWeight: 900, fontSize: '1.35rem', color: pct >= 0 ? 'success.main' : 'error.main' }}>{pct.toFixed(1)}%</Typography>
                              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>vs acumulado anterior</Typography>
                            </Box>
                          )
                        })}
                      </Box>
                    )}
                  </>
                )}
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
  )
}
