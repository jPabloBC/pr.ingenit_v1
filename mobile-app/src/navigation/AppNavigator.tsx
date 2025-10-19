/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList, TabParamList } from '../types'
import { COLORS } from '../constants'

// Import screens (we'll create these next)
import LoginScreen from '../screens/LoginScreen'
import DashboardScreen from '../screens/DashboardScreen'
import AttendanceScreen from '../screens/AttendanceScreen'
import EPPScreen from '../screens/EPPScreen'
import DocumentsScreen from '../screens/DocumentsScreen'
import ProfileScreen from '../screens/ProfileScreen'
import LoadingScreen from '../screens/LoadingScreen'
import AttendanceHistoryScreen from '../screens/AttendanceHistoryScreen'

const Stack = createStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<TabParamList>()

const TabNavigator: React.FC = () => {
  const { logout } = useAuth()
  const insets = useSafeAreaInsets()

  const commonScreenOptions = ({ route }: any) => ({
  tabBarIcon: ({ focused, color, size }: any) => {
          let iconName: keyof typeof Ionicons.glyphMap

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'home' : 'home-outline'
              break
            case 'Attendance':
              iconName = focused ? 'time' : 'time-outline'
              break
            case 'EPP':
              iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline'
              break
            case 'Documents':
              iconName = focused ? 'document-text' : 'document-text-outline'
              break
            case 'Profile':
              iconName = focused ? 'person' : 'person-outline'
              break
            default:
              iconName = 'help-outline'
          }

          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray5,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.gray10,
          paddingBottom: Math.max(8, insets.bottom + 8),
          paddingTop: 8,
          height: 65 + insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: COLORS.white,
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerRight: () => (
          <Ionicons
            name="log-out-outline"
            size={22}
            color={COLORS.white}
            style={{ marginRight: 16 }}
            onPress={async () => {
              try {
                await logout()
              } catch (e) {
                console.error('Logout failed', e)
              }
            }}
          />
        ),
      })

  return (
    <Tab.Navigator screenOptions={commonScreenOptions as any}>
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ 
          title: 'Inicio',
          headerTitle: 'Panel Principal',
        }}
      />
      <Tab.Screen 
        name="Attendance" 
        component={AttendanceScreen}
        options={{ 
          title: 'Asistencia',
          headerTitle: 'Mi Asistencia',
        }}
      />
      <Tab.Screen 
        name="EPP" 
        component={EPPScreen}
        options={{ 
          title: 'EPP',
          headerTitle: 'Mi EPP',
        }}
      />
      <Tab.Screen 
        name="Documents" 
        component={DocumentsScreen}
        options={{ 
          title: 'Documentos',
          headerTitle: 'Mis Documentos',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ 
          title: 'Perfil',
          headerTitle: 'Mi Perfil',
        }}
      />
    </Tab.Navigator>
  )
}

const AppNavigator: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen 
              name="AttendanceHistory" 
              component={AttendanceHistoryScreen} 
              options={{ headerShown: true, title: 'Historial de Asistencia' }} 
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default AppNavigator