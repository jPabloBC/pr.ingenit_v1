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
  Chip,
  CircularProgress,
  Container,
  Button
} from '@mui/material'
import {
  People,
  AccessTime,
  Security,
  QueryStats,
  TrendingUp,
  WarningAmber,
  Payments
} from '@mui/icons-material'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from 'recharts'
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
  const [trendMetric, setTrendMetric] = useState<'daily' | 'direct' | 'indirect'>('daily')
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

  const formatNumber = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Number(value || 0))
  const formatDecimal = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number(value || 0))
  const formatDateLabel = (value: string) => {
    const clean = String(value || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return ''
    const [, month, day] = clean.split('-')
    return `${day}/${month}`
  }
  const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const totalCollaborators = Number(stats?.totalCollaborators || 0)
  const activeCollaborators = Number(stats?.activeCollaborators || 0)
  const presentToday = Number(stats?.presentToday || 0)
  const absentToday = Number(stats?.absentToday || 0)
  const expiredEPP = Number(stats?.expiredEPP || 0)
  const pendingPayroll = Number(stats?.pendingPayroll || 0)
  const activeRate = totalCollaborators > 0 ? (activeCollaborators / totalCollaborators) * 100 : 0
  const attendanceRate = activeCollaborators > 0 ? (presentToday / activeCollaborators) * 100 : 0
  const absenceRate = activeCollaborators > 0 ? (absentToday / activeCollaborators) * 100 : 0
  const eppRiskRate = activeCollaborators > 0 ? (expiredEPP / activeCollaborators) * 100 : 0
  const payrollRiskRate = activeCollaborators > 0 ? (pendingPayroll / activeCollaborators) * 100 : 0

  const statsCards = [
    {
      title: 'Total Colaboradores',
      value: totalCollaborators,
      icon: <People />,
      color: '#075ecb',
      bg: '#eef6ff',
      helper: `${formatNumber(activeCollaborators)} activos`,
      progress: activeRate
    },
    {
      title: 'Activos',
      value: activeCollaborators,
      icon: <People />,
      color: '#2e7d32',
      bg: '#effaf1',
      helper: `${formatDecimal(activeRate)}% del total`,
      progress: activeRate
    },
    {
      title: 'Presentes Hoy',
      value: presentToday,
      icon: <AccessTime />,
      color: '#16803a',
      bg: '#effaf1',
      helper: `${formatDecimal(attendanceRate)}% asistencia`,
      progress: attendanceRate
    },
    {
      title: 'Ausentes Hoy',
      value: absentToday,
      icon: <AccessTime />,
      color: '#d32f2f',
      bg: '#fff1f1',
      helper: `${formatDecimal(absenceRate)}% de activos`,
      progress: absenceRate
    },
    {
      title: 'EPP Vencidos',
      value: expiredEPP,
      icon: <Security />,
      color: '#d99a00',
      bg: '#fff8e6',
      helper: expiredEPP > 0 ? `${formatDecimal(eppRiskRate)}% con riesgo` : 'Sin vencidos',
      progress: eppRiskRate
    },
    {
      title: 'Nóminas Pendientes',
      value: pendingPayroll,
      icon: <Payments />,
      color: '#0b73d9',
      bg: '#eef6ff',
      helper: pendingPayroll > 0 ? `${formatDecimal(payrollRiskRate)}% del equipo` : 'Sin pendientes',
      progress: payrollRiskRate
    }
  ]

  const latestHhByFront = Array.from(
    hhHistory.reduce((acc, row) => {
      const current = acc.get(row.work_front)
      if (!current || Number(row.report_no || 0) >= Number(current.report_no || 0)) acc.set(row.work_front, row)
      return acc
    }, new Map<string, HhHistoryRow>()).values()
  ).sort((a, b) => a.work_front.localeCompare(b.work_front, 'es'))

  const totalDailyHh = latestHhByFront.reduce((acc, row) => acc + Number(row.daily_hh || 0), 0)
  const totalDirectHh = latestHhByFront.reduce((acc, row) => acc + Number(row.direct_hh || 0), 0)
  const totalIndirectHh = latestHhByFront.reduce((acc, row) => acc + Number(row.indirect_hh || 0), 0)
  const totalAccumHh = latestHhByFront.reduce((acc, row) => acc + Number(row.total_hh_accum || 0), 0)
  const previousAccumHh = latestHhByFront.reduce((acc, row) => acc + Math.max(0, Number(row.total_hh_accum || 0) - Number(row.daily_hh || 0)), 0)
  const growthPct = previousAccumHh > 0 ? ((totalAccumHh - previousAccumHh) / previousAccumHh) * 100 : 0
  const recentHhByReport = Array.from(
    hhHistory.reduce((acc, row) => {
      const key = `${row.report_date || ''}:${row.report_no || ''}`
      const current = acc.get(key) || { key, reportNo: Number(row.report_no || 0), date: row.report_date || '', daily: 0, direct: 0, indirect: 0 }
      current.daily += Number(row.daily_hh || 0)
      current.direct += Number(row.direct_hh || 0)
      current.indirect += Number(row.indirect_hh || 0)
      acc.set(key, current)
      return acc
    }, new Map<string, { key: string; reportNo: number; date: string; daily: number; direct: number; indirect: number }>())
      .values()
  )
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.reportNo - b.reportNo
    })
    .slice(-8)
  const hhTrendChartData = recentHhByReport.map((row) => ({
    name: row.reportNo ? `R${row.reportNo}` : formatDateLabel(row.date),
    date: formatDateLabel(row.date),
    daily: Math.round(Number(row.daily || 0) * 10) / 10,
    direct: Math.round(Number(row.direct || 0) * 10) / 10,
    indirect: Math.round(Number(row.indirect || 0) * 10) / 10,
  }))
  const frontChartData = latestHhByFront.map((row) => {
    const daily = Number(row.daily_hh || 0)
    const accum = Number(row.total_hh_accum || 0)
    const previous = Math.max(0, accum - daily)
    const frontGrowth = previous > 0 ? (daily / previous) * 100 : 0
    return {
      front: row.work_front,
      daily: Math.round(daily * 10) / 10,
      accum: Math.round(accum * 10) / 10,
      growth: Math.round(frontGrowth * 10) / 10,
    }
  })
  const frontMetric = opsView === 'accum' ? 'accum' : opsView === 'growth' ? 'growth' : 'daily'
  const frontMetricLabel = opsView === 'accum' ? 'HH acumuladas' : opsView === 'growth' ? 'Crecimiento' : 'HH último reporte'
  const frontMetricSuffix = opsView === 'growth' ? '%' : ' HH'
  const toUpperDisplay = (value: any) => String(value || '').trim().toUpperCase()
  const trendMetricConfig = trendMetric === 'direct'
    ? { key: 'direct', label: 'Directas', color: '#075ecb' }
    : trendMetric === 'indirect'
      ? { key: 'indirect', label: 'Indirectas', color: '#1b8a48' }
      : { key: 'daily', label: 'Total HH', color: colors.blue6 }
  const hhCompositionData = [
    { name: 'Directas', metric: 'direct', hh: Math.round(totalDirectHh * 10) / 10, fill: '#075ecb' },
    { name: 'Indirectas', metric: 'indirect', hh: Math.round(totalIndirectHh * 10) / 10, fill: '#1b8a48' },
  ]
  const departmentChartRows = departments.length > 0
    ? departments.map((dept) => ({ id: dept.id, label: dept.name, total: Number(dept.collaboratorCount || 0) }))
    : (stats?.specialtyBreakdown || []).slice(0, 8).map((item) => ({ id: item.specialty, label: item.specialty, total: Number(item.active || item.total || 0) }))
  const departmentChartTotal = departmentChartRows.reduce((acc, item) => acc + item.total, 0)
  const departmentTitle = departments.length > 0 ? 'Por Departamento' : 'Por Especialidad'
  const departmentChartData = departmentChartRows.map((item) => ({
    name: toUpperDisplay(item.label),
    total: item.total,
  }))
  const monthlyCards = [
    { label: 'Asistencia Promedio', value: Number(monthlyStats?.averageAttendance || 0), suffix: '%', color: '#075ecb', progress: Number(monthlyStats?.averageAttendance || 0) },
    { label: 'Horas Extra Promedio', value: Number(monthlyStats?.averageOvertime || 0), suffix: 'h', color: '#2e7d32', progress: Math.min(100, Number(monthlyStats?.averageOvertime || 0) * 10) },
    { label: 'Incidentes Reportados', value: Number(monthlyStats?.incidents || 0), suffix: '', color: '#d32f2f', progress: Math.min(100, Number(monthlyStats?.incidents || 0) * 12) },
    { label: 'EPP en Uso', value: Number(monthlyStats?.eppUsageRate || 0), suffix: '%', color: '#d99a00', progress: Number(monthlyStats?.eppUsageRate || 0) }
  ]

  const summaryCards = [
    { label: 'Último reporte', value: `${formatNumber(totalDailyHh)} HH`, detail: `${formatNumber(totalDirectHh)} directas · ${formatNumber(totalIndirectHh)} indirectas`, color: '#075ecb' },
    { label: 'Acumulado', value: `${formatNumber(totalAccumHh)} HH`, detail: `${latestHhByFront.length} frentes activos`, color: '#052e5a' },
    { label: 'Crecimiento', value: `${formatDecimal(growthPct)}%`, detail: 'vs acumulado anterior', color: growthPct >= 0 ? '#2e7d32' : '#d32f2f' }
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh' }}>
      <UserHeader title="Dashboard" />
      <Box component="main" sx={{ flexGrow: 1, my: 2, width: '100%' }}>
          <Container
            maxWidth={false}
            disableGutters
            sx={{ width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 } }}
          >
            <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'flex-end' }, justifyContent: 'space-between', gap: 2, mb: 2.5, flexDirection: { xs: 'column', md: 'row' } }}>
              <Box>
                <Typography variant="h4" sx={{ color: '#052e5a', fontWeight: 900, lineHeight: 1.05 }}>
                  {companyDisplayName || 'Empresa'}
                </Typography>
                <Typography sx={{ mt: 0.55, color: '#64748b', fontSize: '0.92rem', fontWeight: 600 }}>
                  Indicadores operacionales actualizados con los datos disponibles del sistema.
                </Typography>
              </Box>
              <Chip
                icon={<TrendingUp sx={{ fontSize: 17 }} />}
                label={`${formatNumber(totalDailyHh)} HH último reporte`}
                sx={{ bgcolor: '#eaf3ff', color: '#052e5a', fontWeight: 800, border: '1px solid #c7dcf7' }}
              />
            </Box>

            <Box
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' }}
              gap={{ xs: 1.25, md: 1.5 }}
              mb={3}
            >
              {statsCards.map((stat) => (
                <Card
                  key={stat.title}
                  elevation={0}
                  sx={{
                    bgcolor: '#ffffff',
                    border: '1px solid #e4ebf5',
                    borderRadius: 2,
                    boxShadow: `0 14px 30px ${stat.color}14`,
                    minHeight: 128,
                    overflow: 'hidden',
                  }}
                >
                  <CardContent sx={{ p: { xs: 1.4, md: 1.6 }, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Box>
                        <Typography sx={{ fontSize: { xs: '1.45rem', md: '1.65rem' }, lineHeight: 1, fontWeight: 900, color: '#052e5a' }}>
                          {formatNumber(stat.value)}
                        </Typography>
                        <Typography sx={{ mt: 0.45, color: '#475569', fontSize: '0.78rem', lineHeight: 1.15, fontWeight: 800 }}>
                          {stat.title}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          flex: '0 0 34px',
                          borderRadius: '50%',
                          bgcolor: stat.bg,
                          color: stat.color,
                          display: 'grid',
                          placeItems: 'center',
                          '& svg': { fontSize: 20 },
                        }}
                      >
                        {stat.icon}
                      </Box>
                    </Box>
                    <Box sx={{ mt: 1.3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.55 }}>
                        <Typography sx={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 700 }} noWrap>
                          {stat.helper}
                        </Typography>
                        <Typography sx={{ color: stat.color, fontSize: '0.7rem', fontWeight: 900 }}>
                          {formatDecimal(clampPercent(stat.progress))}%
                        </Typography>
                      </Box>
                      <Box sx={{ height: 5, borderRadius: 999, bgcolor: '#edf2f8', overflow: 'hidden' }}>
                        <Box sx={{ width: `${clampPercent(stat.progress)}%`, height: '100%', borderRadius: 999, bgcolor: stat.color }} />
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>

            <Box
              display="grid"
              gridTemplateColumns={{ xs: '1fr', lg: '1.45fr 0.85fr' }}
              gap={3}
              mb={3}
            >
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.6, sm: 2.2 },
                  border: '1px solid #e3ebf7',
                  borderRadius: 2,
                  boxShadow: '0 14px 34px rgba(15, 50, 90, 0.08)',
                  minHeight: 382,
                }}
              >
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={1.5} flexWrap="wrap" mb={1.8}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: '#eaf3ff', color: colors.blue6, display: 'grid', placeItems: 'center' }}>
                      <QueryStats />
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 900, color: '#052e5a', lineHeight: 1.1 }}>
                        Control HH
                      </Typography>
                      <Typography sx={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
                        Último reporte, acumulado y tendencia reciente
                      </Typography>
                    </Box>
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
                        sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 800, px: 1.4 }}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </Box>
                </Box>

                {hhHistory.length === 0 ? (
                  <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #cbd7e6', borderRadius: 2, bgcolor: '#f8fbff' }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin historial HH disponible
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: 'repeat(3, 1fr)' }} gap={1.1} mb={1.8}>
                      {summaryCards.map((item) => (
                        <Box key={item.label} sx={{ p: 1.25, border: '1px solid #d9e6f7', borderRadius: 1.5, bgcolor: '#f8fbff' }}>
                          <Typography sx={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 800 }}>{item.label}</Typography>
                          <Typography sx={{ mt: 0.25, fontSize: '1.35rem', color: item.color, fontWeight: 950, lineHeight: 1.05 }}>{item.value}</Typography>
                          <Typography sx={{ mt: 0.35, fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>{item.detail}</Typography>
                        </Box>
                      ))}
                    </Box>

                    <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1.45fr 0.9fr' }} gap={1.6}>
                      <Box sx={{ p: 1.4, borderRadius: 2, border: '1px solid #e3ebf7', bgcolor: '#ffffff' }}>
                        <Typography sx={{ color: '#052e5a', fontSize: '0.82rem', fontWeight: 900, mb: 1 }}>
                          {frontMetricLabel}
                        </Typography>
                        <Box sx={{ height: 188 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={frontChartData}
                              layout="vertical"
                              margin={{ top: 4, right: 18, left: 6, bottom: 4 }}
                              barCategoryGap={12}
                            >
                              <CartesianGrid stroke="#edf2f8" horizontal={false} />
                              <XAxis type="number" hide />
                              <YAxis
                                type="category"
                                dataKey="front"
                                width={92}
                                tick={{ fontSize: 11, fontWeight: 800, fill: '#052e5a' }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <RechartsTooltip
                                cursor={{ fill: 'rgba(7, 94, 203, 0.06)' }}
                                formatter={(value: any) => [`${frontMetric === 'growth' ? formatDecimal(Number(value)) : formatNumber(Number(value))}${frontMetricSuffix}`, frontMetricLabel]}
                                labelStyle={{ color: '#052e5a', fontWeight: 900 }}
                              />
                              <Bar dataKey={frontMetric} fill={frontMetric === 'growth' ? '#2e7d32' : colors.blue6} radius={[0, 8, 8, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </Box>
                      </Box>

                      <Box sx={{ p: 1.4, borderRadius: 2, border: '1px solid #e3ebf7', bgcolor: '#f8fbff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                          <Typography sx={{ color: '#052e5a', fontSize: '0.82rem', fontWeight: 900 }}>
                            Tendencia reciente
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {[
                              { key: 'daily', label: 'Total' },
                              { key: 'direct', label: 'Directas' },
                              { key: 'indirect', label: 'Indirectas' },
                            ].map((item) => (
                              <Button
                                key={item.key}
                                size="small"
                                variant={trendMetric === item.key ? 'contained' : 'outlined'}
                                onClick={() => setTrendMetric(item.key as typeof trendMetric)}
                                sx={{ minWidth: 0, px: 0.85, py: 0.25, borderRadius: 1.25, fontSize: '0.68rem', fontWeight: 900, textTransform: 'none' }}
                              >
                                {item.label}
                              </Button>
                            ))}
                          </Box>
                        </Box>
                        <Box sx={{ mt: 1, height: 132, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e4ebf5', overflow: 'hidden', p: 1 }}>
                          {hhTrendChartData.length > 1 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={hhTrendChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="dashboardHhTrend" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={trendMetricConfig.color} stopOpacity={0.28} />
                                    <stop offset="95%" stopColor={trendMetricConfig.color} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid stroke="#edf2f8" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={34} />
                                <RechartsTooltip
                                  formatter={(value: any) => [`${formatNumber(Number(value))} HH`, trendMetricConfig.label]}
                                  labelFormatter={(label: any, payload: readonly any[]) => {
                                    const row = payload?.[0]?.payload
                                    return `${label}${row?.date ? ` · ${row.date}` : ''}`
                                  }}
                                  labelStyle={{ color: '#052e5a', fontWeight: 900 }}
                                />
                                <Area type="monotone" dataKey={trendMetricConfig.key} stroke={trendMetricConfig.color} strokeWidth={3} fill="url(#dashboardHhTrend)" activeDot={{ r: 4 }} />
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : (
                            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Typography sx={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>Sin tendencia suficiente</Typography>
                            </Box>
                          )}
                        </Box>
                        <Box sx={{ mt: 1.1 }}>
                          <Box sx={{ height: 92, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e4ebf5', p: 0.75 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={hhCompositionData}
                                layout="vertical"
                                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                                barCategoryGap={12}
                                onClick={(state: any) => {
                                  const metric = state?.activePayload?.[0]?.payload?.metric
                                  if (metric === 'direct' || metric === 'indirect') setTrendMetric(metric)
                                }}
                              >
                                <XAxis type="number" hide />
                                <YAxis
                                  type="category"
                                  dataKey="name"
                                  width={64}
                                  tick={{ fontSize: 11, fontWeight: 800, fill: '#64748b' }}
                                  tickLine={false}
                                  axisLine={false}
                                />
                                <RechartsTooltip
                                  formatter={(value: any, _name: any, entry: any) => [`${formatNumber(Number(value))} HH`, entry?.payload?.name || 'HH']}
                                  labelStyle={{ color: '#052e5a', fontWeight: 900 }}
                                />
                                <Bar dataKey="hh" radius={[0, 7, 7, 0]}>
                                  {hhCompositionData.map((entry) => (
                                    <Cell
                                      key={entry.name}
                                      fill={entry.fill}
                                      fillOpacity={trendMetric === 'daily' || trendMetric === entry.metric ? 1 : 0.46}
                                      style={{ cursor: 'pointer' }}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </>
                )}
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.8, sm: 2.2 },
                  border: '1px solid #e3ebf7',
                  borderRadius: 2,
                  boxShadow: '0 14px 34px rgba(15, 50, 90, 0.08)',
                  minHeight: 382,
                }}
              >
                <Typography variant="h6" sx={{ color: '#052e5a', fontWeight: 900, mb: 0.5 }}>
                  {departmentTitle}
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700, mb: 2 }}>
                  {departments.length > 0 ? 'Distribución activa por departamento' : 'Distribución activa por especialidad'}
                </Typography>
                {departmentChartRows.length > 0 ? (
                  <Box>
                    <Box sx={{ height: 250 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={departmentChartData} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 4 }} barCategoryGap={10}>
                          <CartesianGrid stroke="#edf2f8" horizontal={false} />
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={116}
                            tick={{ fontSize: 11, fontWeight: 800, fill: '#052e5a' }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <RechartsTooltip
                            formatter={(value: any) => [`${formatNumber(Number(value))} colaboradores`, departmentTitle]}
                            labelStyle={{ color: '#052e5a', fontWeight: 900 }}
                            cursor={{ fill: 'rgba(7, 94, 203, 0.06)' }}
                          />
                          <Bar dataKey="total" fill={colors.blue6} radius={[0, 8, 8, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                    <Box sx={{ mt: 1.2, p: 1.2, borderRadius: 1.5, bgcolor: '#f8fbff', border: '1px solid #e0e9f6', display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 800 }}>Total visible</Typography>
                      <Typography sx={{ color: '#052e5a', fontSize: '0.9rem', fontWeight: 950 }}>{formatNumber(departmentChartTotal)}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ minHeight: 230, borderRadius: 2, border: '1px dashed #cbd7e6', bgcolor: '#f8fbff', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 2 }}>
                    <Box>
                      <Typography sx={{ color: '#0f172a', fontWeight: 900 }}>Sin distribución registrada</Typography>
                      <Typography sx={{ mt: 0.35, color: '#64748b', fontSize: '0.86rem' }}>No hay departamentos ni especialidades disponibles.</Typography>
                    </Box>
                  </Box>
                )}
              </Paper>
            </Box>

            <Box
              display="grid"
              gridTemplateColumns={{ xs: '1fr', lg: '1fr 1fr' }}
              gap={3}
            >
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.8, sm: 2.2 },
                  border: '1px solid #e3ebf7',
                  borderRadius: 2,
                  boxShadow: '0 14px 34px rgba(15, 50, 90, 0.08)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.6 }}>
                  <WarningAmber sx={{ color: '#d99a00' }} />
                  <Typography variant="h6" sx={{ color: '#052e5a', fontWeight: 900 }}>
                    Alertas Recientes
                  </Typography>
                </Box>
                <Box display="grid" gap={1}>
                  {alerts.length > 0 ? (
                    alerts.map((alert) => (
                      <Box
                        key={alert.id}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          alignItems: 'center',
                          gap: 1,
                          p: 1.25,
                          borderRadius: 1.5,
                          border: '1px solid #e5edf7',
                          bgcolor: alert.priority === 'high' ? '#fff5f5' : '#f8fbff',
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ color: '#0f172a', fontWeight: 850 }} noWrap title={alert.title}>{alert.title}</Typography>
                          <Typography sx={{ color: '#64748b', fontSize: '0.82rem' }} noWrap title={alert.message}>{alert.message}</Typography>
                        </Box>
                        <Chip
                          label={alert.priority === 'high' ? 'Urgente' : alert.priority === 'medium' ? 'Pendiente' : 'Info'}
                          color={alert.type === 'warning' ? 'error' : alert.type === 'info' ? 'info' : 'warning'}
                          size="small"
                          sx={{ fontWeight: 800 }}
                        />
                      </Box>
                    ))
                  ) : (
                    <Box sx={{ p: 2.2, borderRadius: 2, border: '1px dashed #cbd7e6', bgcolor: '#f8fbff', textAlign: 'center' }}>
                      <Typography sx={{ color: '#0f172a', fontWeight: 900 }}>Sin alertas</Typography>
                      <Typography sx={{ mt: 0.35, color: '#64748b', fontSize: '0.86rem' }}>No hay alertas pendientes.</Typography>
                    </Box>
                  )}
                </Box>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.8, sm: 2.2 },
                  border: '1px solid #e3ebf7',
                  borderRadius: 2,
                  boxShadow: '0 14px 34px rgba(15, 50, 90, 0.08)',
                }}
              >
                <Typography variant="h6" sx={{ color: '#052e5a', fontWeight: 900, mb: 1.8 }}>
                  Resumen del Mes
                </Typography>
                <Box display="grid" gridTemplateColumns={{ xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }} gap={1.4}>
                  {monthlyCards.map((card) => (
                    <Box key={card.label} sx={{ p: 1.25, borderRadius: 2, border: '1px solid #e5edf7', bgcolor: '#f8fbff', textAlign: 'center' }}>
                      <Box
                        sx={{
                          width: 82,
                          height: 82,
                          mx: 'auto',
                          borderRadius: '50%',
                          position: 'relative',
                        }}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart
                            data={[{ name: card.label, value: clampPercent(card.progress), fill: card.color }]}
                            innerRadius="72%"
                            outerRadius="100%"
                            startAngle={90}
                            endAngle={-270}
                          >
                            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                            <RadialBar dataKey="value" background cornerRadius={8} />
                          </RadialBarChart>
                        </ResponsiveContainer>
                        <Box sx={{ position: 'absolute', inset: 10, borderRadius: '50%', bgcolor: '#ffffff', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px #e5edf7' }}>
                          <Typography sx={{ color: card.color, fontWeight: 950, fontSize: '0.98rem' }}>
                            {card.suffix === 'h' ? formatDecimal(card.value) : formatNumber(card.value)}{card.suffix}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography sx={{ mt: 1, color: '#475569', fontSize: '0.76rem', fontWeight: 800, lineHeight: 1.2 }}>
                        {card.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Box>
          </Container>
        </Box>
    </Box>
  )
}
