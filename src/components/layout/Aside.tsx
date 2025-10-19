import React, { useState, useEffect } from 'react';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Toolbar, Box, IconButton } from '@mui/material';
import { useRouter, usePathname } from 'next/navigation';
import { Dashboard, People, AccessTime, Security, Payment, Settings, ArrowForwardIos, ArrowBackIos } from '@mui/icons-material';
import { colors } from '@/theme/theme';
import { supabase } from '../../../mobile-app/src/services/supabaseClient';
import { useSession, signOut } from 'next-auth/react';

const drawerWidth = 240;

const menuItems = [
  { text: 'Dashboard', path: '/users/dashboard', icon: <Dashboard /> },
  { text: 'Colaboradores', path: '/users/collaborators', icon: <People /> },
  { text: 'Asistencia', path: '/users/attendance', icon: <AccessTime /> },
  { text: 'EPP', path: '/global/epp', icon: <Security /> },
  { text: 'Nóminas', path: '/global/payroll', icon: <Payment /> },
  { text: 'Configuración', path: '/users/settings', icon: <Settings /> },
];

const Aside: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading' || !session?.user?.id) {
      return;
    }

    const fetchCompanyLogo = async () => {
      try {
        setIsLoading(true);

        const authId = session.user.id;
        console.log('Auth ID usado para buscar en pr_users:', authId);

        const { data: userData, error: userError } = await supabase
          .from('pr_users')
          .select('company_id')
          .eq('id', authId)
          .maybeSingle();

        if (userError || !userData?.company_id) {
          console.error('No se pudo obtener el company_id del usuario:', userError);
          return;
        }

        const companyId = userData.company_id;
        const { data: companyData, error: companyError } = await supabase
          .from('pr_companies')
          .select('logo_url')
          .eq('id', companyId)
          .maybeSingle();

        if (companyError) {
          console.error('Error al obtener el logo de la compañía:', companyError);
          return;
        }

        if (companyData?.logo_url) {
          setCompanyLogoUrl(companyData.logo_url);
        }
      } catch (error) {
        console.error('Error fetching company logo:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompanyLogo();
  }, []); // Eliminé las dependencias dinámicas para evitar recargas innecesarias

  const toggleDrawer = () => {
    setCollapsed(!collapsed);
  };

  if (isLoading) {
    return <div>Cargando...</div>;
  }

  return (
    <Box
      component="nav"
      sx={{ width: collapsed ? 60 : drawerWidth, flexShrink: 0 }}
    >
      <Drawer
        variant="permanent"
        sx={{
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: collapsed ? 60 : drawerWidth,
            transition: 'width 0.3s',
            borderRadius: 0
          },
        }}
        open
      >
        <Toolbar>
          <Box
            sx={{
              display: 'flex',
              flexDirection: collapsed ? 'column' : 'row',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              gap: collapsed ? 0.1 : 2,
              mt: 2,
              px: collapsed ? 0 : undefined,
            }}
          >
            {/* Default logo */}
            <img
              src={'/assets/icon_border_ingenIT.png'}
              alt="Default Logo"
              style={{
                maxWidth: collapsed ? '70%' : '35%',
                minWidth: collapsed ? 36 : undefined,
                height: 'auto',
                borderRadius: collapsed ? 0 : 6,
                marginBottom: collapsed ? 8 : 0,
              }}
            />
            {/* Company logo */}
            {companyLogoUrl && (
              <img
                src={companyLogoUrl}
                alt="Company Logo"
                style={{
                  maxWidth: collapsed ? '70%' : '35%',
                  minWidth: collapsed ? 36 : undefined,
                  height: 'auto',
                  borderRadius: collapsed ? 0 : 6,
                  marginTop: collapsed ? 8 : 0,
                }}
              />
            )}
          </Box>
        </Toolbar>
        <List>
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <ListItem
                component="div"
                key={item.text}
                onClick={() => router.push(item.path)}
                sx={{
                  borderRadius: 0,
                  bgcolor: isActive ? colors.gray9 : undefined,
                  color: isActive ? colors.blue6 : undefined,
                  fontWeight: isActive ? 'bold' : undefined,
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
                    color: isActive ? colors.blue6 : undefined,
                    transition: 'color 0.2s',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {!collapsed && <ListItemText primary={item.text} />}
              </ListItem>
            );
          })}
        </List>
        <IconButton
          onClick={toggleDrawer}
          sx={{
            position: 'absolute',
            bottom: 0,
            left: collapsed ? '55%' : '105%',
            transform: collapsed ? 'translateX(-55%)' : 'translateX(-105%)',
            transition: 'left 0.3s',
            color: colors.blue6,
            backgroundColor: 'transparent',
            '&:hover': {
              backgroundColor: 'transparent'
            }
          }}
        >
          {collapsed ? <ArrowForwardIos /> : <ArrowBackIos />}
        </IconButton>
      </Drawer>
    </Box>
  );
};

export default Aside;