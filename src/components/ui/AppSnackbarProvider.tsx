'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, SyntheticEvent } from 'react'
import type { AlertColor } from '@mui/material'
import { Snackbar } from '@mui/material'
import { AppAlert } from '@/components/ui/AppAlert'

type NoticeOptions = {
  duration?: number
  severity?: AlertColor
}

type Notice = Required<NoticeOptions> & {
  id: number
  message: string
}

type AppSnackbarContextValue = {
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  notify: (message: string, options?: NoticeOptions) => void
  success: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
}

const AppSnackbarContext = createContext<AppSnackbarContextValue | null>(null)

export function AppSnackbarProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0)
  const [notices, setNotices] = useState<Notice[]>([])
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (activeNotice || notices.length === 0) return
    const [nextNotice, ...remainingNotices] = notices
    setActiveNotice(nextNotice)
    setNotices(remainingNotices)
    setOpen(true)
  }, [activeNotice, notices])

  const notify = useCallback((message: string, options: NoticeOptions = {}) => {
    const normalizedMessage = String(message || '').trim()
    if (!normalizedMessage) return
    nextId.current += 1
    setNotices((current) => [...current, {
      id: nextId.current,
      message: normalizedMessage,
      severity: options.severity || 'info',
      duration: options.duration ?? 4000,
    }])
  }, [])

  const close = useCallback((_event?: Event | SyntheticEvent, reason?: string) => {
    if (reason === 'clickaway') return
    setOpen(false)
  }, [])

  const handleExited = useCallback(() => {
    setActiveNotice(null)
  }, [])

  const value = useMemo<AppSnackbarContextValue>(() => ({
    notify,
    success: (message, duration) => notify(message, { severity: 'success', duration }),
    error: (message, duration) => notify(message, { severity: 'error', duration }),
    info: (message, duration) => notify(message, { severity: 'info', duration }),
    warning: (message, duration) => notify(message, { severity: 'warning', duration }),
  }), [notify])

  return (
    <AppSnackbarContext.Provider value={value}>
      {children}
      {activeNotice ? (
        <Snackbar
          key={activeNotice.id}
          open={open}
          autoHideDuration={activeNotice.duration}
          onClose={close}
          TransitionProps={{ onExited: handleExited }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          sx={{ width: { xs: 'calc(100% - 24px)', sm: 'auto' }, maxWidth: 560 }}
        >
          <AppAlert severity={activeNotice.severity} onClose={close} sx={{ width: '100%' }}>
            {activeNotice.message}
          </AppAlert>
        </Snackbar>
      ) : null}
    </AppSnackbarContext.Provider>
  )
}

export function useAppSnackbar() {
  const context = useContext(AppSnackbarContext)
  if (!context) throw new Error('useAppSnackbar debe utilizarse dentro de AppSnackbarProvider.')
  return context
}
