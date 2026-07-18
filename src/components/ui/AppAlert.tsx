'use client'

import { forwardRef } from 'react'
import type { AlertProps } from '@mui/material'
import { Alert } from '@mui/material'

export const AppAlert = forwardRef<HTMLDivElement, AlertProps>(function AppAlert(props, ref) {
  return <Alert ref={ref} variant="standard" {...props} />
})
