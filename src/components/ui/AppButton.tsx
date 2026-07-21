'use client'

import type { ButtonProps } from '@mui/material'
import { Button } from '@mui/material'
import { styled } from '@mui/material/styles'

const StandardButton = styled(Button)(({ theme }) => ({
  minHeight: 40,
  paddingInline: theme.spacing(2),
  borderRadius: 8,
  fontSize: '0.95rem',
  fontWeight: 400,
  lineHeight: 1.2,
  boxShadow: 'none',
  '&.MuiButton-sizeSmall': {
    minHeight: 32,
    paddingInline: theme.spacing(1.25),
    fontSize: '0.875rem',
  },
  '&.MuiButton-sizeLarge': {
    minHeight: 48,
    paddingInline: theme.spacing(2.5),
    fontSize: '1rem',
  },
  '&:hover': {
    boxShadow: 'none',
  },
  '&.Mui-disabled': {
    boxShadow: 'none',
  },
}))

export function AppButton(props: ButtonProps) {
  return <StandardButton disableElevation {...props} />
}
