'use client'

import type { SelectProps, StackProps, TextFieldProps } from '@mui/material'
import { InputAdornment, Select, Stack, TextField } from '@mui/material'
import { SearchOutlined } from '@mui/icons-material'
import { styled } from '@mui/material/styles'

const StandardTextField = styled(TextField)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 8,
    backgroundColor: theme.palette.background.paper,
    transition: theme.transitions.create(['border-color', 'box-shadow', 'background-color']),
    '&:not(.MuiInputBase-multiline)': {
      height: 44,
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.grey[300],
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.info.main,
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
      borderWidth: 2,
    },
    '&.Mui-error .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.error.main,
    },
    '&.Mui-disabled': {
      backgroundColor: theme.palette.grey[100],
    },
  },
  '& .MuiInputBase-input, & .MuiSelect-select': {
    fontSize: '1rem',
    fontWeight: 400,
  },
  '& .MuiInputLabel-root': {
    color: theme.palette.text.secondary,
    fontSize: '0.95rem',
    fontWeight: 400,
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: theme.palette.primary.main,
  },
  '& .MuiFormHelperText-root': {
    marginLeft: 0,
    marginRight: 0,
  },
}))

const StandardSelect = styled(Select)(({ theme }) => ({
  height: 44,
  borderRadius: 8,
  backgroundColor: theme.palette.background.paper,
  fontSize: '1rem',
  fontWeight: 400,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.grey[300] },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.info.main },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.primary.main, borderWidth: 2 },
  '&.Mui-disabled': { backgroundColor: theme.palette.grey[100] },
}))

export function AppTextField(props: TextFieldProps) {
  return <StandardTextField variant="outlined" size="small" fullWidth {...props} />
}

export function AppSelect(props: TextFieldProps) {
  return <AppTextField select {...props} />
}

export function AppSearchField(props: TextFieldProps) {
  const { InputProps, ...rest } = props

  return (
    <AppTextField
      {...rest}
      type="search"
      InputProps={{
        ...InputProps,
        startAdornment: InputProps?.startAdornment || (
          <InputAdornment position="start">
            <SearchOutlined sx={{ fontSize: 20, color: 'text.secondary' }} />
          </InputAdornment>
        ),
      }}
    />
  )
}

export function AppSelectControl(props: SelectProps) {
  return <StandardSelect size="small" {...props} />
}

export function AppFormStack({ spacing = 1.75, ...props }: StackProps) {
  return <Stack spacing={spacing} {...props} />
}
