'use client'

import { Box, Paper, Portal, Typography } from '@mui/material'
import { colors } from '@/theme/theme'

type AppLoadingOverlayProps = {
  open: boolean
  title?: string
  message?: string
  progress?: number | null
}

const clampProgress = (value: number) => Math.max(0, Math.min(100, value))

export function AppLoadingOverlay({
  open,
  title = 'Procesando',
  message,
  progress = null,
}: AppLoadingOverlayProps) {
  if (!open) return null

  const normalizedProgress = typeof progress === 'number' && Number.isFinite(progress)
    ? clampProgress(progress)
    : null

  return (
    <Portal>
      <Box
        role="status"
        aria-live="polite"
        aria-busy="true"
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: (theme) => theme.zIndex.modal + 10,
          display: 'grid',
          placeItems: 'center',
          px: 2,
          bgcolor: 'rgba(8, 23, 40, 0.68)',
          '@keyframes appLoadingSweep': {
            from: { transform: 'translate3d(-150%, 0, 0)' },
            to: { transform: 'translate3d(350%, 0, 0)' },
          },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: 'min(440px, 100%)',
            p: { xs: 2.25, sm: 2.75 },
            borderRadius: 2.5,
            border: `1px solid ${colors.managementBorderStrong}`,
            bgcolor: colors.white,
            boxShadow: '0 24px 64px rgba(0, 26, 51, 0.28)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
            <Typography sx={{ color: colors.blue3, fontSize: '1.08rem', fontWeight: 500, lineHeight: 1.25 }}>
              {title}
            </Typography>
            {normalizedProgress !== null ? (
              <Typography sx={{ color: colors.blue6, fontSize: '0.88rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(normalizedProgress)}%
              </Typography>
            ) : null}
          </Box>

          <Box
            sx={{
              position: 'relative',
              mt: 1.75,
              height: 8,
              overflow: 'hidden',
              borderRadius: 999,
              bgcolor: colors.blue100,
            }}
          >
            <Box
              sx={{
                width: normalizedProgress === null ? '32%' : `${normalizedProgress}%`,
                height: '100%',
                borderRadius: 999,
                bgcolor: colors.blue6,
                transition: 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                inset: 0,
                width: '30%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                animation: 'appLoadingSweep 1.2s linear infinite',
                willChange: 'transform',
                pointerEvents: 'none',
              }}
            />
          </Box>

          {message ? (
            <Typography sx={{ mt: 1.4, color: colors.slate500, fontSize: '0.9rem', fontWeight: 400, lineHeight: 1.45 }}>
              {message}
            </Typography>
          ) : null}
        </Paper>
      </Box>
    </Portal>
  )
}
