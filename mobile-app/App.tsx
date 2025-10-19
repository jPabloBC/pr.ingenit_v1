

/* eslint-disable @typescript-eslint/no-require-imports */
import React, { useCallback, useEffect, useState } from 'react'
const ArchivoRegular = require('./assets/fonts/Archivo-Regular.ttf')
const ArchivoBold = require('./assets/fonts/Archivo-Bold.ttf')
const SansationRegular = require('./assets/fonts/Sansation-Regular.ttf')
const SansationBold = require('./assets/fonts/Sansation-Bold.ttf')
import { Provider as PaperProvider } from 'react-native-paper'
import { AuthProvider } from './src/context/AuthContext'
import AppNavigator from './src/navigation/AppNavigator'
import * as Font from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { View } from 'react-native'
import theme from './src/theme/theme'


SplashScreen.preventAutoHideAsync()

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false)

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          Archivo: ArchivoRegular,
          'Archivo-Bold': ArchivoBold,
          Sansation: SansationRegular,
          'Sansation-Bold': SansationBold,
        })
      } catch (e) {
        // handle error
      } finally {
        setAppIsReady(true)
      }
    }
    prepare()
  }, [])

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync()
    }
  }, [appIsReady])

  if (!appIsReady) {
    return null
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <PaperProvider theme={theme}>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </PaperProvider>
    </View>
  )
}
