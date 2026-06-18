import React, { useState, useEffect, useRef } from 'react';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Toolbar, Box, IconButton, CircularProgress } from '@mui/material';
import { useTheme, useMediaQuery, alpha } from '@mui/material';
import { useRouter, usePathname } from 'next/navigation';
import {
  Dashboard,
  People,
  AccessTime,
  Security,
  Payment,
  Settings,
  Logout,
  ViewList,
  Engineering,
  Handyman,
  Construction,
  AccountCircle,
  EventNote,
  Business,
  ReceiptLong,
  AdminPanelSettings,
  Work,
} from '@mui/icons-material';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { colors } from '../../theme/theme';
import { useSession, signOut } from 'next-auth/react';

const drawerWidth = 220;
const collapsedDrawerWidth = 56;
const mobileDrawerWidth = 236;
const ASIDE_COLLAPSED_STORAGE_KEY = 'users_aside_collapsed_v1';

const menuItemGroupsUsers = [
  [
    { text: 'Dashboard', path: '/users/dashboard', icon: <Dashboard />, resourceKey: 'dashboard' },
    { text: 'Asistencia', path: '/users/attendance', icon: <AccessTime />, resourceKey: 'attendance' },
    { text: 'Colaboradores', path: '/users/collaborators', icon: <People />, resourceKey: 'collaborators' },
    { text: 'Dotación y actividades', path: '/users/staffing-activities', icon: <Engineering />, resourceKey: 'staffing-activities' },
    { text: 'Cuadrillas', path: '/users/crews', icon: <Construction />, resourceKey: 'crews' },
    { text: 'Gestión y Datos', path: '/users/management', icon: <Work />, resourceKey: 'management' },
    { text: 'Programa', path: '/users/program', icon: <EventNote />, resourceKey: 'program' },
    { text: 'Reportabilidad', path: '/users/field-reports', icon: <ViewList />, resourceKey: 'field-reports' },
    { text: 'Reporte diario', path: '/users/daily-report', icon: <ReceiptLong />, resourceKey: 'daily-report', legacyResourceKey: 'admin-daily-report', visibleRoles: ['admin', 'dev', 'user'] },
  ],
  [
    { text: 'Administración', path: '/users/admin/permissions', icon: <AdminPanelSettings />, resourceKey: 'admin-permissions', hideRoles: ['dev'] },
    { text: 'Perfil', path: '/users/profile', icon: <AccountCircle />, resourceKey: 'profile' },
    { text: 'Ajustes', path: '/users/settings', icon: <Settings />, resourceKey: 'settings' },
  ],
];

const Aside: React.FC = () => {
  const appVersion = String(process.env.NEXT_PUBLIC_APP_VERSION || 'local')
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false)
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>('');
  const [, setIsLoading] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const companyLogoLoadedRef = useRef<string | null>(null);
  const permissionsLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    setPendingPath(null)
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(ASIDE_COLLAPSED_STORAGE_KEY)
      if (raw === '1') setCollapsed(true)
      if (raw === '0') setCollapsed(false)
      if (raw == null) setCollapsed(true)
    } catch {
      // ignore localStorage access issues
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(ASIDE_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore localStorage access issues
    }
    try {
      if (isMobile) {
        document.documentElement.style.setProperty('--users-aside-width', '0px')
      } else {
        document.documentElement.style.setProperty('--users-aside-width', collapsed ? `${collapsedDrawerWidth}px` : `${drawerWidth}px`)
      }
    } catch {
      // ignore DOM access issues
    }
  }, [collapsed, isMobile])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setMobileOpen((prev) => !prev)
    window.addEventListener('users-mobile-menu-toggle', handler)
    return () => window.removeEventListener('users-mobile-menu-toggle', handler)
  }, [])

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) {
      return;
    }

    const companyId = String(session.user.companyId || '').trim();

    if (!companyId) {
      setIsLoading(false);
      return;
    }

    if (companyLogoLoadedRef.current === companyId && companyLogoUrl) return;

    let mounted = true;

    const fetchCompanyLogo = async () => {
      try {
        setIsLoading(true);

        const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}`, {
          cache: 'no-store',
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error('Error al obtener el logo de la compañía:', payload);
          return;
        }

        const logoUrl = String((payload as any)?.logo_url || (payload as any)?.logoUrl || '').trim();

        console.log('[Aside company logo]', {
          companyId,
          payload,
          logoUrl,
        });

        if (mounted) {
          setCompanyLogoUrl(logoUrl);
          companyLogoLoadedRef.current = companyId;
        }
      } catch (error) {
        companyLogoLoadedRef.current = null;
        console.error('Error fetching company logo:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchCompanyLogo();

    return () => {
      mounted = false;
    };
  }, [status, session?.user?.id, session?.user?.companyId]);

  // explicit dev routes (static)

  const toggleDrawer = () => {
    setCollapsed(!collapsed);
  };

  // Fetch authoritative permissions from the server so the Aside reflects
  // the DB-controlled permissions immediately (independent of JWT cache).
  const [serverPermissions, setServerPermissions] = useState<string[] | null>(null)

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) return

    const userId = String(session.user.id || '').trim()
    const companyId = String(session.user.companyId || '').trim()
    const loadKey = `${userId}:${companyId}`

    if (permissionsLoadedRef.current === loadKey) return
    permissionsLoadedRef.current = loadKey

    let mounted = true

    async function loadPerms() {
      try {
        const res = await fetch('/api/session/permissions', {
          cache: 'no-store',
        })

        if (!mounted) return

        if (res.ok) {
          const json = await res.json()
          setServerPermissions(Array.isArray(json.permissions) ? json.permissions : [])
        } else {
          setServerPermissions([])
        }
      } catch (e) {
        permissionsLoadedRef.current = null
        if (mounted) setServerPermissions([])
      }
    }

    loadPerms()

    return () => {
      mounted = false
    }
  }, [status, session?.user?.id, session?.user?.companyId])

  const asideContent = (
    <>
      <Toolbar sx={{ alignItems: 'flex-start', minHeight: 'auto !important', py: 0.75, px: 1, position: 'relative' }}>
        <Box sx={{ width: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              width: '100%',
              justifyContent: 'center',
              mt: 0.5,
              px: (!isMobile && collapsed) ? 0 : 0.5,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: (!isMobile && collapsed) ? 'column' : 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: (!isMobile && collapsed) ? 0.1 : 1.5,
                flex: 1
              }}
            >
              <img
                src={'/assets/icon_ingenIT_wt.png'}
                alt="Default Logo"
                style={{
                  maxWidth: (!isMobile && collapsed) ? '56%' : '23%',
                  minWidth: (!isMobile && collapsed) ? 24 : undefined,
                  height: 'auto',
                  borderRadius: (!isMobile && collapsed) ? 0 : 6,
                  marginBottom: (!isMobile && collapsed) ? 8 : 0,
                }}
              />
              {companyLogoUrl && (
                <Box
                  sx={{
                    mt: (!isMobile && collapsed) ? 1 : 0,
                    width: (!isMobile && collapsed) ? 46 : 58,
                    minHeight: (!isMobile && collapsed) ? 46 : 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={companyLogoUrl}
                    alt="Company Logo"
                    onLoad={() => {
                      console.log('[Aside company logo] image loaded:', companyLogoUrl);
                    }}
                    onError={() => {
                      console.error('[Aside company logo] image failed to load:', companyLogoUrl);
                    }}
                    style={{
                      maxWidth: '100%',
                      maxHeight: (!isMobile && collapsed) ? 40 : 34,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Toolbar>
      <List>
        {menuItemGroupsUsers.map((group, groupIndex) => (
          <React.Fragment key={`menu-group-${groupIndex}`}>
            {group.map((item) => {
          const isActive = pathname === item.path;
          const isPending = pendingPath === item.path
          const role = String(session?.user?.role || '').trim().toLowerCase()
          const roleIsPrivileged = role === 'dev'
          const visibleRoles = Array.isArray((item as any).visibleRoles) ? (item as any).visibleRoles.map((r: string) => String(r).toLowerCase()) : null
          const hideRoles = Array.isArray((item as any).hideRoles) ? (item as any).hideRoles.map((r: string) => String(r).toLowerCase()) : null
          if (hideRoles && hideRoles.includes(role)) return null
          if (visibleRoles && !visibleRoles.includes(role)) return null
          const permissions = serverPermissions ?? (session?.user as any)?.permissions ?? []
          const legacyKey = String((item as any).legacyResourceKey || '')
          const hasPermission = roleIsPrivileged || (Array.isArray(permissions) && (
            permissions.includes('*') ||
            permissions.includes(item.resourceKey) ||
            (!!legacyKey && permissions.includes(legacyKey))
          ));
          if (!hasPermission) return null;
          return (
            <ListItem
              component="div"
              key={item.text}
              onClick={() => {
                if (isActive || isPending || pendingPath) return
                setPendingPath(item.path)
                if (isMobile) setMobileOpen(false)
                router.push(item.path)
              }}
              sx={{
                cursor: isPending || pendingPath ? 'wait' : 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                borderRadius: 0,
                minHeight: 48,
                px: collapsed && !isMobile ? 0 : 2,
                justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                bgcolor: isActive || isPending ? alpha(colors.white, 0.14) : undefined,
                color: colors.white,
                fontWeight: isActive || isPending ? 'bold' : undefined,
                opacity: pendingPath && !isPending ? 0.65 : 1,
                '&:hover': {
                  bgcolor: alpha(colors.white, 0.10),
                  color: colors.white,
                  '& .MuiListItemIcon-root': {
                    color: colors.white,
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: collapsed && !isMobile ? 0 : 48,
                  width: collapsed && !isMobile ? '100%' : 'auto',
                  justifyContent: 'center',
                  color: isActive || isPending ? colors.white : alpha(colors.white, 0.82),
                  transition: 'color 0.2s',
                }}
              >
                {isPending ? <CircularProgress size={18} thickness={5} /> : item.icon}
              </ListItemIcon>
              {(isMobile || !collapsed) && <ListItemText primary={item.text} />}
            </ListItem>
          )
            })}
            {groupIndex === 0 ? (
              <Box
                component="li"
                sx={{
                  borderTop: `1px solid ${alpha(colors.white, 0.16)}`,
                  mx: collapsed && !isMobile ? 1.25 : 2,
                  my: 0.75,
                  listStyle: 'none',
                }}
              />
            ) : null}
          </React.Fragment>
        ))}
      </List>
      <Box sx={{ width: '100%', mt: 'auto', pb: 1.5 }}>
        <List>
          <ListItem
            component="div"
            onClick={() => {
              const redirectUrl = pathname?.startsWith('/dev') ? '/' : '/auth/signin'
              if (isMobile) setMobileOpen(false)
              signOut({ callbackUrl: redirectUrl })
            }}
            sx={{
              cursor: 'pointer',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              borderRadius: 0,
              mt: 1,
              minHeight: 48,
              px: collapsed && !isMobile ? 0 : 2,
              justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
              '&:hover': {
                bgcolor: alpha(colors.white, 0.10),
                color: colors.white,
                '& .MuiListItemIcon-root': {
                  color: colors.white,
                },
              },
            }}
          >
            <ListItemIcon sx={{ color: undefined, minWidth: collapsed && !isMobile ? 0 : 48, width: collapsed && !isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              <Logout sx={{ transform: 'scaleX(-1)' }} />
            </ListItemIcon>
            {(isMobile || !collapsed) && <ListItemText primary="Cerrar sesión" />}
          </ListItem>
        </List>
        {!isMobile ? (
          <Box
            sx={{
              display: 'flex',
              width: '100%',
              justifyContent: collapsed ? 'center' : 'flex-end',
              px: collapsed ? 0 : 1.5,
              pt: 0.5,
            }}
          >
            <IconButton
              onClick={toggleDrawer}
              size="small"
              aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
              sx={{
                width: 28,
                height: 28,
                border: 'none',
                bgcolor: 'transparent',
                color: alpha(colors.white, 0.82),
                boxShadow: 'none',
                transition: 'background-color 0.2s ease, color 0.2s ease',
                '&:hover': {
                  bgcolor: alpha(colors.white, 0.10),
                  color: colors.white,
                  boxShadow: 'none',
                },
              }}
            >
              {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.75} /> : <PanelLeftClose size={15} strokeWidth={1.75} />}
            </IconButton>
          </Box>
        ) : null}
        <Box sx={{ px: 2, pt: 1, textAlign: (isMobile || !collapsed) ? 'center' : 'center' }}>
          <Box
            component="div"
            sx={{
              fontSize: '0.74rem',
              color: '#8aa2c6',
              fontWeight: 700,
              letterSpacing: 0.2,
              opacity: 0.95,
            }}
          >
            v{appVersion}
          </Box>
        </Box>
      </Box>
    </>
  )

  return (
    <Box component="nav" sx={{ width: isMobile ? 0 : (collapsed ? collapsedDrawerWidth : drawerWidth), flexShrink: 0, transition: 'width 0.25s ease', position: 'relative' }}>
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        ModalProps={{ keepMounted: true }}
        onClose={() => setMobileOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: isMobile ? mobileDrawerWidth : (collapsed ? collapsedDrawerWidth : drawerWidth),
            transition: 'width 0.25s ease',
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
            background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 100%)`,
            color: colors.white,
            borderRight: `1px solid ${alpha(colors.white, 0.12)}`,
            '& .MuiListItemIcon-root': {
              color: alpha(colors.white, 0.82),
            },
            '& .MuiListItemText-primary': {
              color: colors.white,
              fontWeight: 600,
            },
          },
        }}
        open={isMobile ? mobileOpen : true}
      >
        {asideContent}
      </Drawer>
    </Box>
  );
};

export default Aside;
