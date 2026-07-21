'use client'

import {
  Avatar,
  Box,
  Chip,
  Container,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import { BriefcaseBusiness, Building2, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import UserHeader from '../../../components/layout/UserHeader'
import { colors } from '../../../theme/theme'

const unavailable = 'No informado'

function displayValue(value: unknown) {
  const text = String(value || '').trim()
  return text || unavailable
}

function formatTitleCase(value: unknown) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toLocaleUpperCase('es-CL')}${word.slice(1)}`)
    .join(' ')
}

function formatRole(role: unknown) {
  const normalized = String(role || '').trim().toLowerCase()
  const labels: Record<string, string> = {
    admin: 'Administrador',
    dev: 'Desarrollador',
    hr_manager: 'Recursos Humanos',
    supervisor: 'Supervisor',
    user: 'Usuario',
    viewer: 'Visualizador',
  }
  return labels[normalized] || (normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : unavailable)
}

function getInitials(name: unknown, email: unknown) {
  const source = String(name || '').trim() || String(email || '').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function formatPhone(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return unavailable
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('56')) {
    return `+56 ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 9) {
    return `+56 ${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5)}`
  }
  return raw
}

type ProfileDetailProps = {
  icon: React.ReactNode
  label: string
  singleLine?: boolean
  value: string
}

function ProfileDetail({ icon, label, singleLine = false, value }: ProfileDetailProps) {
  const isUnavailable = value === unavailable

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{
        minWidth: 0,
        p: { xs: 1.5, sm: 1.75 },
        border: `1px solid ${colors.slate200}`,
        borderRadius: 2,
        bgcolor: colors.white,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: 42,
          height: 42,
          flex: '0 0 auto',
          borderRadius: 1.5,
          color: colors.blue6,
          bgcolor: colors.blue50,
          '& svg': { width: 21, height: 21, strokeWidth: 1.8 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: colors.slate500, fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>
          {label}
        </Typography>
        <Typography
          sx={{
            mt: 0.35,
            color: isUnavailable ? colors.slate400 : colors.blue1,
            fontSize: singleLine ? { xs: 12, sm: 14, md: 15 } : { xs: 14, sm: 15 },
            fontWeight: isUnavailable ? 400 : 600,
            lineHeight: 1.35,
            wordBreak: 'break-word',
            whiteSpace: singleLine ? 'nowrap' : 'normal',
          }}
        >
          {value}
        </Typography>
      </Box>
    </Stack>
  )
}

export default function UserProfilePage() {
  const { data: session, status } = useSession()
  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [profileName, setProfileName] = useState('')
  const user = session?.user
  const userName = displayValue(profileName || user?.name)
  const userEmail = displayValue(user?.email)
  const role = formatRole(user?.role)

  useEffect(() => {
    if (status !== 'authenticated') return
    let active = true

    fetch('/api/users/profile', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active) {
          setPhone(String(data?.phone || '').trim())
          setFirstName(String(data?.first_name || '').trim())
          setProfileName(String(data?.name || '').trim())
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [status])

  return (
    <>
      <UserHeader title="Perfil" />
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          width: '100%',
          maxWidth: '100% !important',
          minHeight: 'calc(100vh - 64px)',
          px: { xs: 1.5, sm: 3, md: 4 },
          py: { xs: 2, sm: 3 },
          bgcolor: colors.managementPageBg,
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1240, mx: 'auto' }}>
          {status === 'loading' ? (
            <Stack spacing={2}>
              <Skeleton variant="rounded" height={210} sx={{ borderRadius: 3 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' }, gap: 2 }}>
                <Skeleton variant="rounded" height={310} sx={{ borderRadius: 3 }} />
                <Skeleton variant="rounded" height={310} sx={{ borderRadius: 3 }} />
              </Box>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Paper
                elevation={0}
                sx={{
                  position: 'relative',
                  overflow: 'hidden',
                  p: { xs: 2.25, sm: 3, md: 3.5 },
                  border: `1px solid ${colors.blue4}`,
                  borderRadius: 3,
                  color: colors.white,
                  background: `linear-gradient(125deg, ${colors.blue1} 0%, ${colors.blue3} 58%, ${colors.blue5} 100%)`,
                  boxShadow: '0 12px 32px rgba(0, 38, 77, 0.16)',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: 240,
                    height: 240,
                    right: -75,
                    top: -125,
                    borderRadius: '50%',
                    bgcolor: 'rgba(102, 174, 255, 0.12)',
                  },
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    width: 150,
                    height: 150,
                    right: 90,
                    bottom: -115,
                    borderRadius: '50%',
                    border: '24px solid rgba(218, 165, 32, 0.08)',
                  },
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 2, sm: 2.5 }}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  sx={{ position: 'relative', zIndex: 1 }}
                >
                  <Avatar
                    sx={{
                      width: { xs: 72, sm: 88 },
                      height: { xs: 72, sm: 88 },
                      bgcolor: colors.blue15,
                      color: colors.blue3,
                      border: '3px solid rgba(255, 255, 255, 0.82)',
                      fontSize: { xs: 25, sm: 30 },
                      fontWeight: 700,
                      boxShadow: '0 8px 22px rgba(0, 0, 0, 0.2)',
                    }}
                  >
                    {getInitials(profileName || user?.name, user?.email)}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{
                        mb: 1,
                        color: colors.blue7,
                        fontSize: { xs: 30, sm: 36 },
                        fontWeight: 300,
                        lineHeight: 1.2,
                        wordBreak: 'break-word',
                      }}
                    >
                      {formatTitleCase(firstName || userName.split(/\s+/)[0])}
                    </Typography>
                    <Chip
                      icon={<ShieldCheck size={16} />}
                      label={role}
                      size="small"
                      sx={{
                        height: 30,
                        px: 0.4,
                        color: colors.white,
                        bgcolor: 'rgba(51, 147, 255, 0.25)',
                        border: '1px solid rgba(153, 201, 255, 0.45)',
                        fontWeight: 500,
                        '& .MuiChip-icon': { color: colors.blue14 },
                      }}
                    />
                  </Box>
                </Stack>
              </Paper>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(320px, 1fr)' },
                  gap: 2,
                  alignItems: 'start',
                }}
              >
                <Paper
                  elevation={0}
                  sx={{ p: { xs: 2, sm: 2.5 }, border: `1px solid ${colors.slate200}`, borderRadius: 3 }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
                    <Box sx={{ display: 'grid', placeItems: 'center', color: colors.blue6 }}>
                      <UserRound size={23} strokeWidth={1.8} />
                    </Box>
                    <Box>
                      <Typography component="h2" sx={{ color: colors.blue1, fontSize: 18, fontWeight: 650 }}>
                        Información de la cuenta
                      </Typography>
                      <Typography sx={{ color: colors.slate500, fontSize: 13 }}>
                        Datos asociados a tu acceso en la plataforma.
                      </Typography>
                    </Box>
                  </Stack>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
                    <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                      <ProfileDetail icon={<UserRound />} label="Nombres y apellidos" singleLine value={userName === unavailable ? unavailable : userName.toLocaleUpperCase('es-CL')} />
                    </Box>
                    <ProfileDetail icon={<Mail />} label="Correo electrónico" value={userEmail} />
                    <ProfileDetail icon={<Phone />} label="Teléfono" value={formatPhone(phone)} />
                    <ProfileDetail icon={<ShieldCheck />} label="Tipo de acceso" value={role} />
                  </Box>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{ p: { xs: 2, sm: 2.5 }, border: `1px solid ${colors.slate200}`, borderRadius: 3 }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
                    <Box sx={{ display: 'grid', placeItems: 'center', color: colors.blue6 }}>
                      <BriefcaseBusiness size={23} strokeWidth={1.8} />
                    </Box>
                    <Box>
                      <Typography component="h2" sx={{ color: colors.blue1, fontSize: 18, fontWeight: 650 }}>
                        Contexto de trabajo
                      </Typography>
                      <Typography sx={{ color: colors.slate500, fontSize: 13 }}>
                        Empresa y proyecto seleccionados actualmente.
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack spacing={1.25}>
                    <ProfileDetail icon={<Building2 />} label="Empresa actual" value={displayValue(user?.companyName || user?.companyId)} />
                    <ProfileDetail icon={<BriefcaseBusiness />} label="Proyecto activo" value={displayValue(user?.projectName || user?.projectId)} />
                  </Stack>
                </Paper>
              </Box>
            </Stack>
          )}
        </Box>
      </Container>
    </>
  )
}
