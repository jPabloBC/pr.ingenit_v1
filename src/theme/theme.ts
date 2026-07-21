'use client'

import { createTheme, responsiveFontSizes } from '@mui/material/styles'
import { tailwindColors } from './tailwindColors'

// Colores corporativos IngenIT
export const colors = tailwindColors

const baseTheme = createTheme({
  palette: {
    primary: {
      main: colors.blue6, // #005abf
      dark: colors.blue4, // #003c80
      light: colors.blue10, // #3393ff
      contrastText: colors.white,
    },
    secondary: {
      main: colors.gold3, // #daa520
      dark: colors.gold2, // #a37c18
      light: colors.gold4, // #e1b74d
      contrastText: colors.blue1,
    },
    error: {
      main: '#d32f2f',
      dark: '#c62828',
      light: '#ef5350',
    },
    warning: {
      main: colors.gold3,
      dark: colors.gold2,
      light: colors.gold4,
    },
    info: {
      main: colors.blue8,
      dark: colors.blue6,
      light: colors.blue10,
    },
    success: {
      main: '#2e7d32',
      dark: '#1b5e20',
      light: '#4caf50',
    },
    background: {
      default: colors.gray10,
      paper: colors.white,
    },
    text: {
      primary: colors.gray1,
      secondary: colors.gray4,
    },
    grey: {
      50: colors.gray10,
      100: colors.gray9,
      200: colors.gray8,
      300: colors.gray7,
      400: colors.gray6,
      500: colors.gray5,
      600: colors.gray4,
      700: colors.gray3,
      800: colors.gray2,
      900: colors.gray1,
    },
  },
  typography: {
    fontFamily: [
      'Archivo',
      'Sansation',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 700,
      color: colors.blue3,
      fontSize: '2.5rem',
      lineHeight: 1.15,
    },
    h2: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 600,
      color: colors.blue3,
      fontSize: '2rem',
      lineHeight: 1.18,
    },
    h3: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 600,
      color: colors.blue3,
      fontSize: '1.75rem',
      lineHeight: 1.2,
    },
    h4: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 600,
      color: colors.blue3,
      fontSize: '1.55rem',
      lineHeight: 1.22,
    },
    h5: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 500,
      color: colors.blue3,
      fontSize: '1.3rem',
      lineHeight: 1.25,
    },
    h6: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 500,
      color: colors.blue3,
      fontSize: '1.1rem',
      lineHeight: 1.28,
    },
    body1: {
      fontFamily: 'var(--font-sansation, "Open Sans", Arial, sans-serif)',
      fontSize: '1rem',
      lineHeight: 1.55,
    },
    body2: {
      fontFamily: 'var(--font-sansation, "Open Sans", Arial, sans-serif)',
      fontSize: '0.92rem',
      lineHeight: 1.5,
    },
    button: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 400,
      fontSize: '0.95rem',
      lineHeight: 1.3,
      textTransform: 'none' as const,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 400,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
        },
        contained: {
          background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
          },
        },
        outlined: {
          borderColor: colors.blue6,
          color: colors.blue6,
          '&:hover': {
            backgroundColor: colors.blue15,
            borderColor: colors.blue4,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0, 26, 51, 0.08)',
          border: `1px solid ${colors.gray9}`,
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0, 26, 51, 0.12)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
        elevation1: {
          boxShadow: '0 2px 8px rgba(0, 26, 51, 0.08)',
        },
        elevation2: {
          boxShadow: '0 4px 12px rgba(0, 26, 51, 0.1)',
        },
        elevation3: {
          boxShadow: '0 8px 24px rgba(0, 26, 51, 0.12)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: `linear-gradient(135deg, ${colors.blue1} 0%, ${colors.blue3} 100%)`,
          color: colors.white,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '&:hover fieldset': {
              borderColor: colors.blue6,
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.blue6,
            },
          },
          '& .MuiInputLabel-root.Mui-focused': {
            color: colors.blue6,
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        input: {
          fontSize: '1rem',
          lineHeight: 1.4,
          '&::placeholder': {
            fontSize: '1rem',
            opacity: 0.75,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.95rem',
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
          lineHeight: 1.35,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
        filled: {
          backgroundColor: colors.blue13,
          color: colors.blue1,
        },
      },
    },
    MuiAlert: {
      defaultProps: {
        variant: 'standard',
      },
      styleOverrides: {
        root: {
          alignItems: 'center',
          border: '1px solid transparent',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: '0.95rem',
          fontWeight: 400,
          lineHeight: 1.45,
          '&.MuiAlert-filled': {
            borderColor: 'transparent',
          },
        },
        icon: {
          marginRight: 10,
          padding: 0,
          fontSize: 22,
        },
        message: {
          padding: '2px 0',
        },
        action: {
          alignItems: 'center',
          marginRight: 0,
          padding: '0 0 0 12px',
        },
        standardSuccess: {
          backgroundColor: colors.green100,
          borderColor: '#bbf7d0',
          color: colors.green800,
          '& .MuiAlert-icon': { color: colors.green600 },
        },
        standardError: {
          backgroundColor: colors.red50,
          borderColor: colors.red200,
          color: colors.red800,
          '& .MuiAlert-icon': { color: colors.red600 },
        },
        standardInfo: {
          backgroundColor: colors.blue50,
          borderColor: colors.blue200,
          color: colors.blue800,
          '& .MuiAlert-icon': { color: colors.blue600 },
        },
        standardWarning: {
          backgroundColor: colors.amber50,
          borderColor: colors.amber100,
          color: colors.amber800,
          '& .MuiAlert-icon': { color: colors.amber700 },
        },
      },
    },
  },
})

export const theme = responsiveFontSizes(baseTheme, {
  factor: 2.2,
  variants: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body1', 'body2', 'button'],
})
