'use client'

import { Checkbox, Chip, IconButton, ToggleButton } from '@mui/material'
import { styled } from '@mui/material/styles'

const StandardIconButton = styled(IconButton)(({ theme }) => ({
  borderRadius: 8,
  transition: theme.transitions.create(['color', 'background-color'], { duration: 180 }),
}))

const StandardCheckbox = styled(Checkbox)(({ theme }) => ({
  color: theme.palette.grey[500],
  '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: theme.palette.primary.main },
}))

const StandardChip = styled(Chip)({
  borderRadius: 6,
  fontWeight: 400,
})

const StandardToggleButton = styled(ToggleButton)(({ theme }) => ({
  minHeight: 40,
  borderRadius: 8,
  fontWeight: 500,
  textTransform: 'none',
  transition: theme.transitions.create(['color', 'background-color', 'border-color'], { duration: 180 }),
}))

export const AppIconButton = StandardIconButton
export const AppCheckbox = StandardCheckbox
export const AppChip = StandardChip
export const AppToggleButton = StandardToggleButton
