import React from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { Text } from 'react-native-paper'
import { COLORS, SPACING } from '../constants'

const LoadingScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text variant="bodyLarge" style={styles.text}>
        Cargando...
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  text: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
  },
})

export default LoadingScreen