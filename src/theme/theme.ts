'use client'

import { createTheme } from '@mui/material/styles'

// Colores corporativos IngenIT
export const colors = {
  blue1: "#001a33",
  blue2: "#001e40", 
  blue3: "#00264d",
  blue4: "#003c80",
  blue5: "#003366",
  blue6: "#005abf",
  blue7: "#335c85",
  blue8: "#0078ff",
  blue9: "#6685a3",
  blue10: "#3393ff",
  blue11: "#99adc2",
  blue12: "#66aeff",
  blue13: "#ccd6e0",
  blue14: "#99c9ff",
  blue15: "#cce4ff",
  gold: "#372908",
  gold1: "#6d5310",
  gold2: "#a37c18",
  gold3: "#daa520",
  gold4: "#e1b74d",
  gold5: "#e9c979",
  gold6: "#f0dba6",
  gold7: "#f8edd2",
  black: "#000000",
  gray1: "#1a1a1a",
  gray2: "#333333",
  gray3: "#4d4d4d",
  gray4: "#666666",
  gray5: "#808080",
  gray6: "#999999",
  gray7: "#b3b3b3",
  gray8: "#cccccc",
  gray9: "#e6e6e6",
  gray10: "#f2f2f2",
  white: "#ffffff",
}

export const theme = createTheme({
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
    },
    h2: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 600,
      color: colors.blue3,
    },
    h3: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 600,
      color: colors.blue3,
    },
    h4: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 600,
      color: colors.blue3,
    },
    h5: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 500,
      color: colors.blue3,
    },
    h6: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 500,
      color: colors.blue3,
    },
    body1: {
      fontFamily: 'var(--font-sansation, "Open Sans", Arial, sans-serif)',
    },
    body2: {
      fontFamily: 'var(--font-sansation, "Open Sans", Arial, sans-serif)',
    },
    button: {
      fontFamily: 'var(--font-archivo, "Archivo", Arial, sans-serif)',
      fontWeight: 500,
      textTransform: 'none' as const,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
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
      styleOverrides: {
        standardSuccess: {
          backgroundColor: colors.blue15,
          color: colors.blue1,
        },
        standardInfo: {
          backgroundColor: colors.blue15,
          color: colors.blue1,
        },
        standardWarning: {
          backgroundColor: colors.gold7,
          color: colors.gold,
        },
      },
    },
  },
})