import React, { useEffect, useRef, useState } from 'react';
import { AppBar, Badge, Box, Button, IconButton, Popover, Stack, Toolbar, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { useTheme, useMediaQuery } from '@mui/material';
import { colors } from '../../theme/theme';

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
};

const UserHeader: React.FC<UserHeaderProps> = ({ title }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [notifications, setNotifications] = useState<InternalNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const notificationsLoadedRef = useRef(false)
  const notificationsLoadingRef = useRef(false)

  const loadNotifications = async (force = false) => {
    if (!force && notificationsLoadingRef.current) return

    try {
      notificationsLoadingRef.current = true

      const res = await fetch('/api/internal-notifications?limit=8', {
        cache: 'no-store',
      })

      if (!res.ok) return

      const json = await res.json().catch(() => null)
      setNotifications(Array.isArray(json?.notifications) ? json.notifications : [])
      setUnreadCount(Number(json?.unread_count || 0))
      notificationsLoadedRef.current = true
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

    const id = window.setInterval(() => void loadNotifications(true), 60000)

    return () => window.clearInterval(id)
  }, [])

  const markNotificationsRead = async (ids?: string[]) => {
    try {
      await fetch('/api/internal-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids && ids.length > 0 ? { ids } : { mark_all: true }),
      })
      await loadNotifications()
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
          boxShadow: '0 4px 20px rgba(0, 26, 51, 0.15)',
          borderRadius: 0,
          padding: 0,
          margin: 0,
        }}
      >
        <Toolbar>
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
          <Typography variant="h6" sx={{ color: colors.white, fontWeight: 600 }}>
            {title}
          </Typography>
          <IconButton
            aria-label="Notificaciones"
            onClick={(event) => setAnchorEl(event.currentTarget)}
            sx={{ ml: 'auto', color: colors.white }}
          >
            <Badge badgeContent={unreadCount} color="error" max={99}>
              <NotificationsNoneIcon />
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
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography sx={{ fontWeight: 900, color: '#0f172a' }}>Notificaciones</Typography>
            <Button size="small" onClick={() => void markNotificationsRead()} disabled={unreadCount === 0} sx={{ textTransform: 'none', fontWeight: 700 }}>
              Marcar leídas
            </Button>
          </Stack>
          {notifications.length === 0 ? (
            <Typography sx={{ py: 2, color: '#64748b', fontSize: 13 }}>No hay notificaciones.</Typography>
          ) : (
            <Stack spacing={0.75}>
              {notifications.map((notification) => {
                const unread = !notification.read_at
                return (
                  <Box
                    key={notification.id}
                    component="button"
                    type="button"
                    onClick={() => {
                      void markNotificationsRead([notification.id])
                      setAnchorEl(null)
                      if (notification.link_url) window.location.href = notification.link_url
                    }}
                    sx={{
                      width: '100%',
                      border: '1px solid #e2e8f0',
                      borderRadius: 1,
                      bgcolor: unread ? '#eff6ff' : '#ffffff',
                      textAlign: 'left',
                      p: 1,
                      cursor: 'pointer',
                      '&:hover': { borderColor: '#2563eb', bgcolor: '#f8fbff' },
                    }}
                  >
                    <Typography sx={{ fontWeight: unread ? 900 : 700, color: '#0f172a', fontSize: 13.5 }}>
                      {notification.title}
                    </Typography>
                    <Typography sx={{ mt: 0.35, color: '#475569', fontSize: 12.5 }}>
                      {notification.body}
                    </Typography>
                  </Box>
                )
              })}
            </Stack>
          )}
        </Box>
      </Popover>
      <Toolbar />
    </>
  );
};

export default UserHeader;
