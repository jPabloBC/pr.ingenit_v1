'use client'

import type { MouseEventHandler, ReactNode } from 'react'
import { Box, Fab, Tooltip } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Add } from '@mui/icons-material'
import { alpha } from '@mui/material/styles'
import { colors } from '@/theme/theme'

type AppFloatingActionButtonProps = {
  ariaLabel: string
  disabled?: boolean
  icon?: ReactNode
  offset?: 'header' | 'tabs'
  placement?: 'fixed' | 'inline'
  onClick: MouseEventHandler<HTMLButtonElement>
  sx?: SxProps<Theme>
  tooltip?: string
}

export function AppFloatingActionButton({
  ariaLabel,
  disabled = false,
  icon,
  offset = 'header',
  placement = 'fixed',
  onClick,
  sx,
  tooltip = ariaLabel,
}: AppFloatingActionButtonProps) {
  return (
    <Box
      sx={{
        ...(placement === 'fixed'
          ? {
              position: 'fixed',
              top: offset === 'tabs' ? { xs: 150, sm: 164 } : { xs: 64, sm: 70 },
              right: { xs: 14, sm: 22 },
            }
          : {
              position: 'relative',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              minHeight: 60,
              px: { xs: 0.75, sm: 1 },
            }),
        zIndex: 1150,
      }}
    >
      <Tooltip title={tooltip}>
        <Box component="span" sx={{ display: 'inline-flex' }}>
          <Fab
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={onClick}
            sx={[
              {
                width: 52,
                height: 52,
                minHeight: 52,
                bgcolor: colors.blue1,
                color: colors.white,
                border: `2px solid ${colors.blue14}`,
                boxShadow: `0 10px 24px ${alpha(colors.blue1, 0.32)}`,
                transition: 'border-color 160ms ease, box-shadow 160ms ease',
                '&:hover': {
                  bgcolor: colors.blue1,
                  borderColor: colors.blue15,
                  boxShadow: `0 10px 28px ${alpha(colors.sky300, 0.55)}`,
                  '& .app-floating-action-icon': {
                    color: colors.blue14,
                    transform: 'scale(1.18)',
                  },
                },
                '&.Mui-disabled': {
                  bgcolor: colors.blue300,
                  color: colors.sky50,
                  borderColor: colors.sky100,
                },
              },
              ...(Array.isArray(sx) ? sx : [sx]),
            ]}
          >
            {icon || <Add className="app-floating-action-icon" sx={{ fontSize: 28, color: colors.blue14, transition: 'color 160ms ease, transform 160ms ease' }} />}
          </Fab>
        </Box>
      </Tooltip>
    </Box>
  )
}
