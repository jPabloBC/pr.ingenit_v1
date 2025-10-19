import React from 'react';
import { AppBar, Toolbar, Typography } from '@mui/material';
import { colors } from '@/theme/theme';

interface UserHeaderProps {
  title: string;
}

const UserHeader: React.FC<UserHeaderProps> = ({ title }) => {
  return (
    <AppBar
      position="sticky"
      sx={{
        background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 100%)`,
        boxShadow: '0 4px 20px rgba(0, 26, 51, 0.15)',
        borderRadius: 0,
        padding: 0,
        margin: 0,
      }}
    >
      <Toolbar>
        <Typography variant="h6" sx={{ color: colors.white, fontWeight: 600 }}>
          {title}
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default UserHeader;