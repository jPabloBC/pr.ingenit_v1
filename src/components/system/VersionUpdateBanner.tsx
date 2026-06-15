'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Snackbar, Typography } from '@mui/material'

const POLL_INTERVAL_MS = 60_000

export default function VersionUpdateBanner() {
  const currentVersion = useMemo(
    () => String(process.env.NEXT_PUBLIC_APP_VERSION || 'dev'),
    []
  )
  const [latestVersion, setLatestVersion] = useState<string>(currentVersion)
  const [open, setOpen] = useState(false)
  const versionCheckedRef = useRef(false)
  const versionCheckingRef = useRef(false)

  useEffect(() => {
    let mounted = true

    const checkVersion = async (force = false) => {
      if (!force && versionCheckingRef.current) return

      try {
        versionCheckingRef.current = true

        const response = await fetch('/api/version', { cache: 'no-store' })
        if (!response.ok) return

        const payload = (await response.json()) as { version?: string }
        const nextVersion = String(payload?.version || '').trim()

        if (!nextVersion || !mounted) return

        setLatestVersion(nextVersion)
        versionCheckedRef.current = true

        if (nextVersion !== currentVersion) {
          setOpen(true)
        }
      } catch {
        // Silently ignore temporary network failures
      } finally {
        versionCheckingRef.current = false
      }
    }

    if (!versionCheckedRef.current) {
      void checkVersion()
    }

    const timer = window.setInterval(() => {
      void checkVersion(true)
    }, POLL_INTERVAL_MS)

    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [currentVersion])

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      sx={{ mb: 1, mr: 1, maxWidth: 'calc(100vw - 24px)' }}
    >
      <Alert
        severity="info"
        variant="filled"
        sx={{
          width: '100%',
          alignItems: 'center',
          boxShadow: '0 10px 24px rgba(2, 6, 23, 0.25)',
        }}
        action={
          <Button
            color="inherit"
            size="small"
            variant="outlined"
            onClick={() => window.location.reload()}
            sx={{ borderColor: 'rgba(255,255,255,0.5)' }}
          >
            Actualizar
          </Button>
        }
      >
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Hay una nueva versión disponible
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            Actual: {currentVersion} · Nueva: {latestVersion}
          </Typography>
        </Box>
      </Alert>
    </Snackbar>
  )
}

