'use client';

import type { ReactNode } from 'react';
import { Box, MenuItem, Paper, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { colors } from '@/theme/theme';
import { AppButton } from './AppButton';
import { AppTextField } from './FormControls';

export type AppWeekNavigatorOption = {
  value: string;
  label: ReactNode;
  shortLabel?: ReactNode;
};

type AppWeekNavigatorProps = {
  periodLabel: ReactNode;
  value: string;
  options: AppWeekNavigatorOption[];
  onChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onLatest: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  latestDisabled?: boolean;
  selectDisabled?: boolean;
  previousLabel?: string;
  nextLabel?: string;
  latestLabel?: string;
  sx?: SxProps<Theme>;
};

export function AppWeekNavigator({
  periodLabel,
  value,
  options,
  onChange,
  onPrevious,
  onNext,
  onLatest,
  previousDisabled = false,
  nextDisabled = false,
  latestDisabled = false,
  selectDisabled = false,
  previousLabel = 'Semana anterior',
  nextLabel = 'Semana siguiente',
  latestLabel = 'Última semana',
  sx,
}: AppWeekNavigatorProps) {
  return (
    <Paper
      variant="outlined"
      sx={[
        {
          mx: 'auto',
          px: { xs: 1, sm: 1.25 },
          py: 1,
          width: { xs: '100%', lg: '70%' },
          maxWidth: 1400,
          borderColor: colors.blue15,
          borderRadius: 1.5,
          bgcolor: colors.white,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'auto minmax(240px, 1fr) auto' },
          alignItems: 'center',
          gap: 1,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <AppButton
        variant="outlined"
        disabled={previousDisabled}
        onClick={onPrevious}
        startIcon={<ChevronLeft sx={{ fontSize: 18 }} />}
        sx={{ height: 40, minHeight: 40, whiteSpace: 'nowrap' }}
      >
        {previousLabel}
      </AppButton>

      <Typography
        sx={{
          minWidth: 0,
          color: colors.gray4,
          fontSize: { xs: 14, sm: 16 },
          fontWeight: 600,
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: { sm: 'nowrap' },
          order: { xs: -1, md: 0 },
        }}
      >
        {periodLabel}
      </Typography>

      <Box
        sx={{
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '142px auto auto' },
          alignItems: 'center',
          gap: 1,
        }}
      >
        <AppTextField
          select
          value={value}
          disabled={selectDisabled || options.length === 0}
          SelectProps={{
            displayEmpty: true,
            renderValue: (selectedValue) => {
              const selected = options.find((option) => option.value === selectedValue);
              return selected?.shortLabel ?? selected?.label ?? 'Semana';
            },
          }}
          inputProps={{ 'aria-label': 'Seleccionar semana' }}
          onChange={(event) => onChange(String(event.target.value))}
          sx={{
            minWidth: 0,
            '& .MuiInputBase-root': { height: 40 },
            '& .MuiSelect-select': {
              py: 0.55,
              fontSize: '0.95rem',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          }}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </AppTextField>

        <AppButton
          variant="contained"
          disabled={latestDisabled}
          onClick={onLatest}
          sx={{ height: 40, minHeight: 40, whiteSpace: 'nowrap' }}
        >
          {latestLabel}
        </AppButton>

        <AppButton
          variant="outlined"
          disabled={nextDisabled}
          onClick={onNext}
          endIcon={<ChevronRight sx={{ fontSize: 18 }} />}
          sx={{ height: 40, minHeight: 40, whiteSpace: 'nowrap' }}
        >
          {nextLabel}
        </AppButton>
      </Box>
    </Paper>
  );
}
