import React, { useState, useEffect } from 'react';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Toolbar, Box, IconButton, CircularProgress } from '@mui/material';
import { useTheme, useMediaQuery } from '@mui/material';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { colors } from '../../theme/theme';
import { prettifySpecialty } from '../../lib/normalize';
import { useSession, signOut } from 'next-auth/react';

const drawerWidth = 240;
const ASIDE_COLLAPSED_STORAGE_KEY = 'users_aside_collapsed_v1';

const menuItemsUsers = [
  { text: 'Dashboard', path: '/users/dashboard', icon: <Dashboard />, resourceKey: 'dashboard' },
  { text: 'Colaboradores', path: '/users/collaborators', icon: <People />, resourceKey: 'collaborators' },
  { text: 'Cuadrillas', path: '/users/crews', icon: <Construction />, resourceKey: 'crews' },
  { text: 'Reportabilidad', path: '/users/field-reports', icon: <ViewList />, resourceKey: 'field-reports' },
  { text: 'Reporte diario', path: '/users/daily-report', icon: <ReceiptLong />, resourceKey: 'daily-report', legacyResourceKey: 'admin-daily-report', visibleRoles: ['admin', 'dev', 'user'] },
  { text: 'Programa', path: '/users/program', icon: <EventNote />, resourceKey: 'program' },
  { text: 'Asistencia', path: '/users/attendance', icon: <AccessTime />, resourceKey: 'attendance' },
  { text: 'Perfil', path: '/users/profile', icon: <AccountCircle />, resourceKey: 'profile' },
  { text: 'Administración', path: '/users/admin/permissions', icon: <AdminPanelSettings />, resourceKey: 'admin-permissions', hideRoles: ['dev'] },
  { text: 'Gestión y Datos', path: '/users/management', icon: <Work />, resourceKey: 'management' },
  { text: 'Ajustes', path: '/users/settings', icon: <Settings />, resourceKey: 'settings' },
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
        document.documentElement.style.setProperty('--users-aside-width', collapsed ? '60px' : '240px')
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
    if (status === 'loading' || !session?.user?.id) {
      return;
    }

    const companyId = session.user.companyId;
    if (!companyId) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const fetchCompanyLogo = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/companies/${companyId}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error('Error al obtener el logo de la compañía:', payload);
          return;
        }

        const logoUrl = String((payload as any)?.logo_url || (payload as any)?.logoUrl || '').trim();
        if (mounted) {
          setCompanyLogoUrl(logoUrl);
        }
      } catch (error) {
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
  const [collaborator, setCollaborator] = useState<any | null>(null)

  function capitalizeWords(input: string) {
    if (!input) return ''
    return String(input)
      .toLowerCase()
      .split(/\s+/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ')
  }
  useEffect(() => {
    let mounted = true
    async function loadPerms() {
      try {
        const res = await fetch('/api/session/permissions')
        if (!mounted) return
        if (res.ok) {
          const json = await res.json()
          setServerPermissions(Array.isArray(json.permissions) ? json.permissions : [])
        } else {
          setServerPermissions([])
        }
      } catch (e) {
        if (mounted) setServerPermissions([])
      }
    }
    if (session?.user) loadPerms()
    return () => { mounted = false }
  }, [session?.user])

  // prepare display first/last name for Aside
  const displayFirstName = (() => {
    if (collaborator) {
      const first = collaborator.first_name || collaborator.name || collaborator.nombres || collaborator.nombre || ''
      return capitalizeWords(first || (session?.user?.name ? String(session.user.name).split(/\s+/)[0] : String(session?.user?.id || '')))
    }
    if (session?.user?.name) {
      const parts = String(session.user.name).trim().split(/\s+/)
      return capitalizeWords(parts[0] || String(session.user.name))
    }
    return ''
  })()

  const displayLastName = (() => {
    if (collaborator) {
      const last = collaborator.last_name || collaborator.lastname || collaborator.apellidos || collaborator.surname || ''
      return capitalizeWords(last || '')
    }
    if (session?.user?.name) {
      const parts = String(session.user.name).trim().split(/\s+/)
      if (parts.length > 1) return capitalizeWords(parts.slice(1).join(' '))
    }
    return ''
  })()

  useEffect(() => {
    let mounted = true
    async function loadCollaborator() {
      if (!session?.user) return
      try {
        const res = await fetch('/api/collaborators/me')
        if (!mounted) return
        if (res.ok) {
          const json = await res.json()
          setCollaborator(json.collaborator || null)
        } else {
          setCollaborator(null)
        }
      } catch (e) {
        if (mounted) setCollaborator(null)
      }
    }
    loadCollaborator()
    return () => { mounted = false }
  }, [session?.user])

  const asideContent = (
    <>
      {!isMobile ? (
    <Box
      component="nav"
      sx={{ width: collapsed ? 60 : drawerWidth, flexShrink: 0, transition: 'width 0.3s', position: 'relative' }}
    >
      <IconButton
        onClick={toggleDrawer}
        size="small"
        aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
        sx={{
          position: 'fixed',
          bottom: 20,
          left: (collapsed ? 60 : drawerWidth) - 14,
          width: 28,
          height: 28,
          zIndex: 1201,
          transition: 'left 0.3s',
          border: `1px solid ${colors.gray7}`,
          bgcolor: 'rgba(255, 255, 255, 0.25)',
          color: colors.gray8,
          boxShadow: 'none',
          backdropFilter: 'blur(1px)',
          '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.4)' }
        }}
      >
        {collapsed ? <ChevronRight size={16} strokeWidth={2.2} /> : <ChevronLeft size={16} strokeWidth={2.2} />}
      </IconButton>
    </Box>
      ) : null}
      <Toolbar sx={{ alignItems: 'flex-start', minHeight: 'auto !important', py: 1, position: 'relative' }}>
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
                gap: (!isMobile && collapsed) ? 0.1 : 2,
                flex: 1
              }}
            >
              <img
                src={'/assets/icon_ingenIT.png'}
                alt="Default Logo"
                style={{
                  maxWidth: (!isMobile && collapsed) ? '58%' : '24%',
                  minWidth: (!isMobile && collapsed) ? 28 : undefined,
                  height: 'auto',
                  borderRadius: (!isMobile && collapsed) ? 0 : 6,
                  marginBottom: (!isMobile && collapsed) ? 8 : 0,
                }}
              />
              {companyLogoUrl && (
                <img
                  src={companyLogoUrl}
                  alt="Company Logo"
                  style={{
                    maxWidth: (!isMobile && collapsed) ? '70%' : '35%',
                    minWidth: (!isMobile && collapsed) ? 36 : undefined,
                    height: 'auto',
                    borderRadius: (!isMobile && collapsed) ? 0 : 6,
                    marginTop: (!isMobile && collapsed) ? 8 : 0,
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>
      </Toolbar>
      <List>
        {menuItemsUsers.map((item) => {
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
                bgcolor: isActive || isPending ? colors.gray9 : undefined,
                color: isActive || isPending ? colors.blue6 : undefined,
                fontWeight: isActive || isPending ? 'bold' : undefined,
                opacity: pendingPath && !isPending ? 0.65 : 1,
                '&:hover': {
                  bgcolor: colors.gray7,
                  color: colors.blue5,
                  '& .MuiListItemIcon-root': {
                    color: colors.blue5,
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: isActive || isPending ? colors.blue6 : undefined,
                  transition: 'color 0.2s',
                }}
              >
                {isPending ? <CircularProgress size={18} thickness={5} /> : item.icon}
              </ListItemIcon>
              {(isMobile || !collapsed) && <ListItemText primary={item.text} />}
            </ListItem>
          )
        })}
      </List>
      <Box sx={{ width: '100%', mt: 'auto', pb: 2 }}>
        {session?.user && (
          <Box sx={{ px: 2, mb: 1, textAlign: 'center' }}>
            {(isMobile || !collapsed) ? (
              <>
                <Box component="div" sx={{ fontWeight: 600 }}>{displayFirstName}</Box>
                {displayLastName ? <Box component="div" sx={{ fontWeight: 600, mt: 0.25 }}>{displayLastName}</Box> : null}
                <Box component="div" sx={{ fontSize: '0.9rem', color: 'text.secondary', mt: 0.25 }}>
                  {(() => {
                    const spec = (collaborator && (collaborator.specialty || collaborator.specialidad)) || ''
                    return spec ? prettifySpecialty(spec) : null
                  })()}
                </Box>
                <Box component="div" sx={{ fontSize: '0.85rem', color: 'text.secondary', wordBreak: 'break-all', mt: 0.25 }}>{session.user.email}</Box>
              </>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <AccountCircle />
              </Box>
            )}
          </Box>
        )}
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
              '&:hover': {
                bgcolor: colors.gray7,
                color: colors.blue5,
                '& .MuiListItemIcon-root': {
                  color: colors.blue5,
                },
              },
            }}
          >
            <ListItemIcon sx={{ color: undefined }}>
              <Logout sx={{ transform: 'scaleX(-1)' }} />
            </ListItemIcon>
            {(isMobile || !collapsed) && <ListItemText primary="Cerrar sesión" />}
          </ListItem>
        </List>
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
    <Box component="nav" sx={{ width: isMobile ? 0 : (collapsed ? 60 : drawerWidth), flexShrink: 0, transition: 'width 0.3s', position: 'relative' }}>
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        ModalProps={{ keepMounted: true }}
        onClose={() => setMobileOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: isMobile ? drawerWidth : (collapsed ? 60 : drawerWidth),
            transition: 'width 0.3s',
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden'
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
