// API Configuration
// Prefer explicit environment variable (injected at build/runtime). Fall back to localhost in dev,
// and to an empty string in production so failures are explicit and configurable.
import { Platform } from 'react-native'

// Prefer explicit API base URL injected at build/runtime
const envApiBase = (process.env && (process.env.EXPO_PUBLIC_API_BASE_URL as string)) || (process.env && (process.env.API_BASE_URL as string)) || ''

let apiBase = envApiBase

// If not provided, and running in dev, try to construct a usable local URL.
// Prefer METRO_HOST (injected by Expo) to get the host IP reachable by devices.
if (!apiBase && __DEV__) {
  const metroHost = process.env.METRO_HOST || ''
  const localHost = metroHost.split(':')[0] || 'localhost'
  apiBase = `http://${localHost}:3000`
}

// If running on Android emulator/device during dev, replace localhost with 10.0.2.2
if (__DEV__ && Platform.OS === 'android' && apiBase.includes('localhost')) {
  apiBase = apiBase.replace('localhost', '10.0.2.2')
}

// Ensure we export an explicit string (empty in production if not configured)
export const API_BASE_URL = 'http://192.168.1.87:3000';

console.log('API_BASE_URL:', API_BASE_URL);

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/signin',
  LOGOUT: '/api/auth/logout',
  HEARTBEAT: '/api/auth/heartbeat',
    PROFILE: '/api/users/profile',
  },
  ATTENDANCE: {
    LIST: '/api/attendance',
    CREATE: '/api/attendance',
    TODAY: '/api/attendance/today',
  },
  EPP: {
    LIST: '/api/epp',
    DETAIL: (id: string) => `/api/epp/${id}`,
  },
  DOCUMENTS: {
    LIST: '/api/documents',
    DOWNLOAD: (id: string) => `/api/documents/${id}/download`,
  },
  NOTIFICATIONS: {
    LIST: '/api/notifications',
    MARK_READ: (id: string) => `/api/notifications/${id}/read`,
  },
} as const


// Paleta de colores según theme Tailwind
export const COLORS = {
  // Azules
  blue1: '#001a33',
  blue2: '#001e40',
  blue3: '#00264d',
  blue4: '#003c80',
  blue5: '#003366',
  blue6: '#005abf',
  blue7: '#335c85',
  blue8: '#0078ff',
  blue9: '#6685a3',
  blue10: '#3393ff',
  blue11: '#99adc2',
  blue12: '#66aeff',
  blue13: '#ccd6e0',
  blue14: '#99c9ff',
  blue15: '#cce4ff',
  // Dorados
  gold: '#372908',
  gold1: '#6d5310',
  gold2: '#a37c18',
  gold3: '#daa520',
  gold4: '#e1b74d',
  gold5: '#e9c979',
  gold6: '#f0dba6',
  gold7: '#f8edd2',
  // Negros y grises
  black: '#000000',
  gray1: '#1a1a1a',
  gray2: '#333333',
  gray3: '#4d4d4d',
  gray4: '#666666',
  gray5: '#808080',
  gray6: '#999999',
  gray7: '#b3b3b3',
  gray8: '#cccccc',
  gray9: '#e6e6e6',
  gray10: '#f2f2f2',
  white: '#ffffff',
  // Estados y básicos
  primary: '#003c80',
  secondary: '#daa520',
  success: '#2e7d32',
  warning: '#ed6c02',
  error: '#d32f2f',
  info: '#0288d1',
  background: '#f2f2f2',
  surface: '#ffffff',
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  textDisabled: '#b3b3b3',
}

// Fuentes
export const FONTS = {
  title: 'Archivo',
  body: 'Sansation',
}

// Spacing
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

// Font sizes
export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

// Screen dimensions helpers
export const SCREEN_PADDING = SPACING.md

// Status colors mapping
export const STATUS_COLORS = {
  PRESENT: COLORS.success,
  ABSENT: COLORS.error,
  LATE: COLORS.warning,
  ON_LEAVE: COLORS.info,
  ACTIVE: COLORS.success,
  EXPIRED: COLORS.error,
  PENDING: COLORS.warning,
  DELIVERED: COLORS.success,
  PAID: COLORS.success,
  ERROR: COLORS.error,
} as const

// Default date formats
export const DATE_FORMATS = {
  DISPLAY: 'dd/MM/yyyy',
  DISPLAY_WITH_TIME: 'dd/MM/yyyy HH:mm',
  API: 'yyyy-MM-dd',
  TIME: 'HH:mm',
} as const