'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from '@mui/material'
import { Logout } from '@mui/icons-material'

type SessionProject = {
  id: string
  name: string
  company_id?: string | null
  company_name?: string | null
  company_logo_url?: string | null
  source?: string
}

type CompanyBrand = {
  name?: string | null
  logo_url?: string | null
}

const PROJECT_ENTRY_LOCK_KEY = 'pr_select_project_entering'

export default function SelectProjectPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<SessionProject[]>([])
  const [companyBrand, setCompanyBrand] = useState<CompanyBrand | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null)
  const [enteringProject, setEnteringProject] = useState(false)

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const lock = window.sessionStorage.getItem(PROJECT_ENTRY_LOCK_KEY)
      if (lock === '1') setEnteringProject(true)
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    const activeProjectId = String((session?.user as any)?.projectId || '').trim()
    if (activeProjectId) {
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(PROJECT_ENTRY_LOCK_KEY)
        }
      } catch {
        // ignore storage errors
      }
      router.replace('/users/dashboard')
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/signin')
      return
    }
    if (status !== 'authenticated') return
    if (enteringProject) return

    const loadProjects = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/session/projects', { cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) {
          throw new Error(json?.error || 'No se pudieron cargar los proyectos')
        }
        const list = Array.isArray(json?.projects) ? json.projects : []
        setProjects(list)
        const firstProject = list[0] as SessionProject | undefined
        if (firstProject?.company_name || firstProject?.company_logo_url) {
          setCompanyBrand({
            name: firstProject.company_name || null,
            logo_url: firstProject.company_logo_url || null,
          })
        }

      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [status, router, update, enteringProject])

  useEffect(() => {
    if (status !== 'authenticated') return
    const firstProject = projects[0]
    if (!firstProject) return
    setCompanyBrand((current) => ({
      name: firstProject.company_name || current?.name || session?.user?.companyName || null,
      logo_url: firstProject.company_logo_url || current?.logo_url || null,
    }))
  }, [status, session?.user?.companyName, projects])

  const handleSelectProject = async (project: SessionProject) => {
    if (savingProjectId || enteringProject) return
    let keepBusyUntilRedirect = false
    try {
      setSavingProjectId(project.id)
      setEnteringProject(true)
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(PROJECT_ENTRY_LOCK_KEY, '1')
        }
      } catch {
        // ignore storage errors
      }
      setError(null)
      await update({
        projectId: project.id,
        projectName: project.name,
      })
      keepBusyUntilRedirect = true
      router.replace('/users/dashboard')
      window.setTimeout(() => {
        if (window.location.pathname === '/users/select-project') {
          window.location.replace('/users/dashboard')
        }
      }, 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el proyecto seleccionado')
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(PROJECT_ENTRY_LOCK_KEY)
        }
      } catch {
        // ignore storage errors
      }
    } finally {
      if (!keepBusyUntilRedirect) {
        setSavingProjectId(null)
        setEnteringProject(false)
      }
    }
  }

  const hasLoadedContent = projects.length > 0 || Boolean(companyBrand) || Boolean(error)
  const showInitialLoader = status === 'loading' || (loading && !hasLoadedContent)

  if (showInitialLoader) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  if (!session?.user) return null

  if (enteringProject) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'radial-gradient(circle at 15% 15%, #e8f1ff 0, #f3f7ff 34%, #ffffff 70%)',
          px: 2,
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress />
          <Typography variant="h6" sx={{ mt: 2, fontWeight: 700, color: '#063466' }}>
            Ingresando al proyecto
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
            Espera un momento, estamos cargando tu panel.
          </Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 15% 15%, #e8f1ff 0, #f3f7ff 34%, #ffffff 70%)',
      }}
    >
      <Box
        component="header"
        sx={{
          borderBottom: '1px solid #d7e4f8',
          background: 'linear-gradient(90deg, #012c57 0%, #093b70 48%, #0c4a86 100%)',
          color: '#fff',
          px: { xs: 1.5, sm: 2, md: 3 },
          py: { xs: 0.8, sm: 1, md: 1.25 },
        }}
      >
        <Container maxWidth="lg" sx={{ px: '0 !important' }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            gap={{ xs: 1, sm: 2 }}
            sx={{ minHeight: { xs: 42, sm: 48, md: 54 } }}
          >
            <Stack direction="row" alignItems="center" gap={{ xs: 1, sm: 1.5, md: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Image
                  src="/assets/logo_transparent_ingenIT_white.png"
                  alt="IngenIT"
                  width={128}
                  height={40}
                  priority
                  unoptimized
                  style={{
                    width: 'clamp(104px, 28vw, 128px)',
                    height: 'auto',
                    objectFit: 'contain',
                  }}
                />
              </Box>
            </Stack>
            <Button
              variant="outlined"
              startIcon={<Logout />}
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              disabled={enteringProject}
              sx={{
                borderColor: 'rgba(255,255,255,0.45)',
                color: '#fff',
                textTransform: 'none',
                minWidth: 'auto',
                px: { xs: 1, sm: 1.5 },
                py: { xs: 0.45, sm: 0.6 },
                fontSize: { xs: '0.74rem', sm: '0.82rem', md: '0.9rem' },
                '& .MuiButton-startIcon': {
                  mr: { xs: 0.45, sm: 0.7 },
                  '& svg': { fontSize: { xs: '1rem', sm: '1.1rem' } },
                },
                '&:hover': {
                  borderColor: '#fff',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                },
              }}
            >
              Cerrar sesión
            </Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 2.5, sm: 3.5, md: 5 } }}>
        <Box
          sx={{
            mb: { xs: 2, sm: 2.5, md: 3 },
            p: { xs: 1.4, sm: 1.8, md: 2.1 },
            borderRadius: 3,
            border: '1px solid #d5e4fa',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(247,250,255,0.96) 100%)',
            boxShadow: '0 8px 24px rgba(6,52,102,0.06)',
          }}
        >
          <Stack direction="column" gap={{ xs: 1.4, md: 1.8 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              gap={1.2}
            >
              <Box
                sx={{
                  width: { xs: 96, sm: 124, md: 154, lg: 176 },
                  height: { xs: 64, sm: 78, md: 92, lg: 104 },
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: { xs: 0.2, sm: 0.3, md: 0.4 },
                  flexShrink: 0,
                }}
              >
                {companyBrand?.logo_url ? (
                  <Box
                    component="img"
                    src={companyBrand.logo_url}
                    alt={companyBrand?.name || 'Logo compañía'}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <Typography
                    sx={{
                      color: '#0c4a86',
                      fontWeight: 800,
                      fontSize: { xs: '1.15rem', sm: '1.45rem', md: '1.75rem' },
                      lineHeight: 1,
                      textAlign: 'center',
                    }}
                  >
                    {(companyBrand?.name || session?.user?.companyName || 'Empresa').slice(0, 2).toUpperCase()}
                  </Typography>
                )}
              </Box>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  minWidth: { xs: 124, sm: 150 },
                  px: { xs: 1, sm: 1.2 },
                  py: { xs: 0.65, sm: 0.75 },
                  borderRadius: 2,
                  color: '#d9ecff',
                  background: 'linear-gradient(135deg, #052e5a 0%, #0b4b86 58%, #0f6bc1 100%)',
                  border: '1px solid rgba(168,210,255,0.55)',
                  boxShadow: '0 10px 22px rgba(6,52,102,0.16)',
                  flexShrink: 0,
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 900,
                    fontSize: { xs: '2rem', sm: '2.35rem' },
                    lineHeight: 1,
                    color: 'rgba(217,236,255,0.58)',
                  }}
                >
                  {projects.length}
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 500,
                    fontSize: { xs: '0.84rem', sm: '0.94rem' },
                    lineHeight: 1.22,
                    letterSpacing: 0,
                  }}
                >
                  proyecto{projects.length === 1 ? '' : 's'}<br />
                  disponible{projects.length === 1 ? '' : 's'}
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{
                  color: '#99a4af',
                  fontWeight: 700,
                  letterSpacing: 0.2,
                }}
              >
                Empresa
              </Typography>
              <Typography
                sx={{
                  color: '#052e5a',
                  fontWeight: 800,
                  fontSize: { xs: '1rem', sm: '1.08rem' },
                  lineHeight: 1.15,
                  mb: { xs: 1.2, sm: 1.4 },
                }}
              >
                {companyBrand?.name || session?.user?.companyName || 'Sin compañía'}
              </Typography>
            </Box>
          </Stack>
        </Box>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {projects.length === 0 ? (
          <Alert severity="warning">
            No tienes proyectos asignados por ahora. Solicita acceso a un administrador.
          </Alert>
        ) : (
          <>
            <Typography
              variant="h4"
              fontWeight={600}
              color="#d0d9e2"
              sx={{ fontSize: 'clamp(1.35rem, 1.1rem + 1.2vw, 2rem)', lineHeight: 1.1, mb: 1.6 }}
            >
              Selecciona un proyecto
            </Typography>
            <Box
              display="grid"
              gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }}
              gap={{ xs: 1.25, sm: 1.6, md: 2 }}
            >
              {projects.map((project) => (
                <Card
                  key={project.id}
                  variant="outlined"
                  sx={{
                    borderColor: 'rgba(129, 181, 255, 0.38)',
                    borderRadius: 2.5,
                    background: 'linear-gradient(135deg, #052e5a 0%, #0b4b86 52%, #0f6bc1 100%)',
                    color: '#d9ecff',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'border-color 180ms ease, background-color 180ms ease',
                    animation: 'projectCardIn 420ms ease both',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(120deg, rgba(173,220,255,0.18) 0%, rgba(173,220,255,0.02) 45%, rgba(173,220,255,0.12) 100%)',
                      pointerEvents: 'none',
                    },
                    '&:hover': {
                      borderColor: '#003c80',
                      background: 'linear-gradient(135deg, #001a33 0%, #001e40 52%, #003c80 100%)',
                    },
                    '@keyframes projectCardIn': {
                      '0%': { opacity: 0, transform: 'translateY(10px) scale(0.985)' },
                      '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
                    },
                  }}
                >
                  <CardActionArea
                    disabled={Boolean(savingProjectId) || enteringProject}
                    onClick={() => handleSelectProject(project)}
                    sx={{
                      position: 'relative',
                      zIndex: 1,
                      '&:active': {
                        transform: 'scale(0.995)',
                      },
                      '&:hover .MuiCardActionArea-focusHighlight': {
                        opacity: 0.08,
                      },
                    }}
                  >
                    <CardContent sx={{ py: { xs: 1.8, sm: 2.1, md: 2.4 }, px: { xs: 1.8, sm: 2.2 } }}>
                      <Typography
                        variant="h6"
                        fontWeight={700}
                        color="#d9ecff"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          fontSize: 'clamp(1rem, 0.93rem + 0.44vw, 1.2rem)',
                          lineHeight: 1.2,
                          textAlign: 'center',
                          textShadow: '0 1px 0 rgba(5,28,52,0.2)',
                        }}
                      >
                        {project.name}
                        {savingProjectId === project.id ? <CircularProgress size={18} /> : null}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
            </Box>
          </>
        )}
      </Container>

    </Box>
  )
}
