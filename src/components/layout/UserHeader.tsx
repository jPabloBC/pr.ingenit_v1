import React, { useEffect, useRef, useState } from 'react';
import { AppBar, Badge, Box, IconButton, Popover, Stack, Toolbar, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Bell } from 'lucide-react';
import { useTheme, useMediaQuery } from '@mui/material';
import { useRouter } from 'next/navigation';
import { colors } from '../../theme/theme';
import { AppButton } from '../ui/AppButton';

interface UserHeaderProps {
  title: string;
}

type InternalNotification = {
  id: string;
  title: string;
  body: string;
  link_url?: string | null;
  read_at?: string | null;
  created_at?: string | null;
  sender_name?: string | null;
};

const formatNotificationTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const splitNotificationTitle = (title: string) => {
  const match = String(title || '').match(/^(.*?)(?:\s*-\s*)(\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})$/);
  if (!match) return { label: title, date: '' };
  return { label: match[1], date: match[2] };
};

const splitNotificationBody = (body: string, senderName?: string | null) => {
  const text = String(body || '');
  const match = text.match(/\s+(informó|actualizó|agregó)\s+/i)
  const normalizedSenderName = String(senderName || '').trim()
  if (!match || match.index === undefined) return { sender: normalizedSenderName, message: text };
  const sender = text.slice(0, match.index).trim();
  const visibleSender = normalizedSenderName || (sender.includes('@') ? '' : sender)
  const normalizedSender = visibleSender.toUpperCase();
  return { sender: normalizedSender, message: text.slice(match.index) };
};

const UserHeader: React.FC<UserHeaderProps> = ({ title }) => {
  const theme = useTheme()
  const router = useRouter()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [notifications, setNotifications] = useState<InternalNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const notificationsLoadedRef = useRef(false)
  const notificationsLoadingRef = useRef(false)

  const loadNotifications = async ({ details = false, force = false }: { details?: boolean; force?: boolean } = {}) => {
    if (!force && notificationsLoadingRef.current) return

    try {
      notificationsLoadingRef.current = true

      const res = await fetch(details ? '/api/internal-notifications?limit=8' : '/api/internal-notifications?summary=1', {
        cache: 'no-store',
      })

      if (!res.ok) return

      const json = await res.json().catch(() => null)
      if (details) setNotifications(Array.isArray(json?.notifications) ? json.notifications : [])
      setUnreadCount(Number(json?.unread_count || 0))
      if (details) notificationsLoadedRef.current = true
    } catch {
      // ignore notification errors
    } finally {
      notificationsLoadingRef.current = false
    }
  }

  useEffect(() => {
    if (!notificationsLoadedRef.current) {
      void loadNotifications()
    }

    const id = window.setInterval(() => void loadNotifications({ force: true }), 60000)

    return () => window.clearInterval(id)
  }, [])

  const markNotificationsRead = async (ids?: string[]) => {
    try {
      await fetch('/api/internal-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids && ids.length > 0 ? { ids } : { mark_all: true }),
      })
      await loadNotifications({ details: true, force: true })
    } catch {}
  }

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          top: 0,
          left: isMobile ? 0 : 'var(--users-aside-width, 240px)',
          width: isMobile ? '100%' : 'calc(100% - var(--users-aside-width, 240px))',
          transition: 'left 0.3s ease, width 0.3s ease',
          zIndex: 1200,
          background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 100%)`,
          boxShadow: '0 3px 14px rgba(0, 26, 51, 0.14)',
          borderBottom: `1px solid ${colors.blue5}`,
          borderRadius: 0,
          padding: 0,
          margin: 0,
        }}
      >
        <Toolbar
          sx={{
            minHeight: { xs: '56px !important', md: '60px !important' },
            px: { xs: 1.5, sm: 2.25, md: 3 },
          }}
        >
          {isMobile ? (
            <IconButton
              edge="start"
              aria-label="Abrir menú"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new Event('users-mobile-menu-toggle'))
                }
              }}
              sx={{ color: colors.blue9, mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography
            variant="h6"
            sx={{
              color: colors.blue14,
              fontWeight: 300,
              fontSize: { xs: '1rem', md: '1.08rem' },
              lineHeight: 1.2,
              letterSpacing: 0.2,
            }}
          >
            {title}
          </Typography>
          <IconButton
            aria-label="Notificaciones"
            onClick={(event) => {
              setAnchorEl(event.currentTarget)
              void loadNotifications({ details: true, force: true })
            }}
            sx={{
              ml: 'auto',
              width: 38,
              height: 38,
              color: colors.blue14,
              '&:hover': {
                color: colors.white,
                bgcolor: 'rgba(255,255,255,0.08)',
              },
            }}
          >
            <Badge
              badgeContent={unreadCount}
              color="error"
              max={99}
              sx={{ '& .MuiBadge-badge': { minWidth: 16, height: 16, px: 0.4, fontSize: '0.62rem', fontWeight: 500 } }}
            >
              <Bell size={21} strokeWidth={1.5} />
            </Badge>
          </IconButton>
        </Toolbar>
      </AppBar>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: { xs: 320, sm: 390 }, maxWidth: 'calc(100vw - 24px)', p: 1.25 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 0.25, pb: 1, borderBottom: '1px solid #dbe5f1' }}
          >
            <Typography sx={{ fontWeight: 500, color: colors.blue1, fontSize: 15 }}>Notificaciones</Typography>
            <AppButton
              size="small"
              onClick={() => void markNotificationsRead()}
              disabled={unreadCount === 0}
              sx={{ minWidth: 0, minHeight: 28, fontSize: 12, px: 0.75 }}
            >
              Marcar leídas
            </AppButton>
          </Stack>
          {notifications.length === 0 ? (
            <Typography sx={{ py: 3, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No hay notificaciones.</Typography>
          ) : (
            <Stack spacing={0.75} sx={{ maxHeight: 'min(68vh, 540px)', overflowY: 'auto', pt: 1 }}>
              {notifications.map((notification) => {
                const unread = !notification.read_at
                const titleParts = splitNotificationTitle(notification.title)
                const time = formatNotificationTime(notification.created_at)
                const bodyParts = splitNotificationBody(notification.body, notification.sender_name)
                return (
                  <Box
                    key={notification.id}
                    component="button"
                    type="button"
                    onClick={() => {
                      void markNotificationsRead([notification.id])
                      setAnchorEl(null)
                      if (notification.link_url) router.push(notification.link_url)
                    }}
                    sx={{
                      width: '100%',
                      border: '1px solid #dbe5f1',
                      borderRadius: 1,
                      bgcolor: unread ? '#eef6ff' : '#ffffff',
                      textAlign: 'left',
                      p: 1,
                      cursor: 'pointer',
                      transition: 'border-color 140ms ease, background-color 140ms ease',
                      '&:hover': { borderColor: colors.blue6, bgcolor: '#f8fbff' },
                    }}
                  >
                    <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
                      <Typography sx={{ minWidth: 0, fontWeight: unread ? 600 : 400, color: '#172033', fontSize: 13, lineHeight: 1.3 }}>
                        {titleParts.date ? `${titleParts.label} - ${titleParts.date}` : titleParts.label}
                      </Typography>
                      {time ? (
                        <Typography sx={{ flex: '0 0 auto', color: '#b5c3d5', fontSize: 11, fontWeight: 400 }}>
                          {time}
                        </Typography>
                      ) : null}
                    </Stack>
                    <Typography sx={{ mt: 0.4, color: '#526278', fontSize: 12.25, lineHeight: 1.4 }}>
                      {bodyParts.sender ? (
                        <Box component="span" sx={{ color: '#526278', fontWeight: 500 }}>
                          {bodyParts.sender}
                        </Box>
                      ) : null}
                      {bodyParts.message}
                    </Typography>
                  </Box>
                )
              })}
            </Stack>
          )}
        </Box>
      </Popover>
      <Toolbar sx={{ minHeight: { xs: '56px !important', md: '60px !important' } }} />
    </>
  );
};

export default UserHeader;
