import { DefaultTheme, configureFonts } from 'react-native-paper'
import { COLORS, FONTS } from '../constants'
import { Platform } from 'react-native'

const fontVariants = {
  regular: {
    fontFamily: FONTS.body,
    fontWeight: 'normal' as const,
  },
  medium: {
    fontFamily: FONTS.title,
    fontWeight: 'normal' as const,
  },
  light: {
    fontFamily: FONTS.body,
    fontWeight: '300' as const,
  },
  thin: {
    fontFamily: FONTS.body,
    fontWeight: '100' as const,
  },
  // Paper v5 variants
  bodyLarge: {
    fontFamily: FONTS.body,
    fontWeight: 'normal' as const,
  },
  bodyMedium: {
    fontFamily: FONTS.body,
    fontWeight: 'normal' as const,
  },
  bodySmall: {
    fontFamily: FONTS.body,
    fontWeight: 'normal' as const,
  },
  headlineSmall: {
    fontFamily: FONTS.title,
    fontWeight: 'normal' as const,
  },
  headlineMedium: {
    fontFamily: FONTS.title,
    fontWeight: 'bold' as const,
  },
  titleLarge: {
    fontFamily: FONTS.title,
    fontWeight: 'bold' as const,
  },
  titleMedium: {
    fontFamily: FONTS.title,
    fontWeight: 'normal' as const,
  },
  titleSmall: {
    fontFamily: FONTS.title,
    fontWeight: 'normal' as const,
  },
  labelLarge: {
    fontFamily: FONTS.body,
    fontWeight: 'bold' as const,
  },
  labelMedium: {
    fontFamily: FONTS.body,
    fontWeight: 'normal' as const,
  },
  labelSmall: {
    fontFamily: FONTS.body,
    fontWeight: 'normal' as const,
  },
}

const fontConfig = {
  web: fontVariants,
  ios: fontVariants,
  android: fontVariants,
}

export const theme = {
  ...DefaultTheme,
  roundness: 8,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary,
    accent: COLORS.secondary,
    background: COLORS.background,
    surface: COLORS.surface,
    text: COLORS.textPrimary,
    disabled: COLORS.textDisabled,
    placeholder: COLORS.gray6,
    notification: COLORS.gold3,
    success: COLORS.success,
    error: COLORS.error,
    warning: COLORS.warning,
    info: COLORS.info,
  },
  fonts:
    Platform.OS === 'ios'
      ? fontConfig.ios
      : Platform.OS === 'android'
      ? fontConfig.android
      : fontConfig.web,
}

export default theme;
