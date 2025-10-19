import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { apiService } from '../services/api'
import { API_ENDPOINTS, API_BASE_URL } from '../constants'
import { supabase } from '../services/supabaseClient'
import { authService, LoginCredentials, AuthResponse } from '../services/auth'
import { User, Employee } from '../types'
import { AppState, Platform } from 'react-native'
import LoadingScreen from '../components/LoadingScreen';

interface AuthContextType {
  user: (User & { employee?: Employee }) | null
  isLoading: boolean
  isAuthenticated: boolean
  sendHeartbeat: () => Promise<void>
  login: (credentials: LoginCredentials) => Promise<AuthResponse>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  // allow setting auth state directly (used for Supabase direct sign-in)
  setAuthState: (user: (User & { employee?: Employee }) | null, token?: string, expires?: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<(User & { employee?: Employee }) | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isRehydrating, setIsRehydrating] = useState(true)

  useEffect(() => {
    initializeAuth()
  }, [])

  const initializeAuth = async () => {
    try {
      setIsLoading(true)
      setIsRehydrating(true) // Start rehydration
      // Siempre rehidrata desde SecureStore
  const token = await SecureStore.getItemAsync('auth_token')
  const refreshToken = await SecureStore.getItemAsync('refresh_token')
  const userData = await SecureStore.getItemAsync('user_data')
  const expires = await SecureStore.getItemAsync('auth_expires')
      let authenticated = false
      // rehydrating session (silenced logs)
      if (token) {
        // Restore Supabase client session so SDK has the auth headers available in-memory
        try {
          // supabase.auth.setSession expects an object with access_token and refresh_token
          await supabase.auth.setSession({ access_token: token, refresh_token: refreshToken || undefined } as any)
        } catch (err) {
          console.warn('Could not set Supabase session during rehydration:', err)
        }
      }

      if (token && expires) {
        const expirationDate = new Date(expires)
        const now = new Date()
        if (now < expirationDate) {
          authenticated = true
        } else {
          // Token expirado, limpiar
          await authService.logout()
        }
      }
      setIsAuthenticated(authenticated)
      if (authenticated && userData) {
        setUser(JSON.parse(userData))
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Error initializing auth:', error)
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setIsLoading(false)
      setIsRehydrating(false) // End rehydration
    }
  }

  // Allow other components to set auth state (e.g. after direct Supabase sign-in)
  const setAuthState = async (
    newUser: (User & { employee?: Employee }) | null,
    token?: string,
    expires?: string
  ) => {
    try {
      if (token) {
        await SecureStore.setItemAsync('auth_token', token)
      }
      if (expires) {
        await SecureStore.setItemAsync('auth_expires', expires)
      }
      if (newUser) {
        await SecureStore.setItemAsync('user_data', JSON.stringify(newUser))
      }
      setUser(newUser)
      setIsAuthenticated(!!newUser)
    } catch (error) {
      console.error('Error setting auth state:', error)
      throw error
    }
  }

  const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
      setIsLoading(true)
      const response = await authService.login(credentials)
      
      setUser(response.user)
      setIsAuthenticated(true)
      
      return response
    } catch (error) {
      setIsAuthenticated(false)
      setUser(null)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true)
      const collaboratorId = user?.employee?.id; // Assuming user object has employee field with id

      // Log the logout request details
      console.log('Logout request details:', {
        endpoint: API_ENDPOINTS.AUTH.LOGOUT,
        collaboratorId,
      });

      await authService.logout()
    } catch (error) {
      console.error('Logout error:', error)

      // Log the error details for debugging
      console.error('Logout error details:', {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setUser(null)
      setIsAuthenticated(false)
      setIsLoading(false)
    }
  }

  const refreshUser = async (): Promise<void> => {
    try {
      const updatedUser = await authService.refreshUserData();
      setUser(updatedUser);
    } catch (error) {
      console.error('Error refreshing user:', error);
      // Avoid logging out the user on network errors
      if ((error as any)?.message?.includes('Network Error')) {
        console.warn('Network error occurred during user refresh. Retaining current user state.');
      } else {
        // For other errors, log them but do not log out the user
        console.warn('Non-network error during user refresh:', error);
      }
    }
  }

  const renewToken = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        const { newToken, newExpires } = await authService.renewToken(token);
        if (newToken && newExpires) {
          await SecureStore.setItemAsync('auth_token', newToken);
          await SecureStore.setItemAsync('auth_expires', newExpires);
          setIsAuthenticated(true);
        }
      }
    } catch (error) {
      console.error('Error renewing token (will retry later):', error);
      // Do not log out the user immediately; retry later via interval
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // When app comes to foreground, re-check the auth state.
        // This is crucial for recovering the session after the OS kills the app
        // (e.g., when using the camera).
        console.log("App became active, re-initializing auth...");
        initializeAuth();
      }
    });

    return () => subscription.remove();
  }, []);

  const sendHeartbeat = async (): Promise<void> => {
    try {
      const token = await SecureStore.getItemAsync('auth_token')
      // Build a device-reachable base URL when API_BASE_URL is not set.
      let base = API_BASE_URL || ''
      if (!base) {
        if (__DEV__) {
          // On Android emulator use 10.0.2.2 to reach host machine. On iOS simulator use localhost.
          base = `http://${Platform.OS === 'android' ? '10.0.2.2' : 'localhost'}:3000`
        } else {
          // In production we can't assume host; bail silently.
          return
        }
      }
      const url = base + API_ENDPOINTS.AUTH.HEARTBEAT

      // Short timeout so heartbeat doesn't hang the app
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      await fetch(url, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch (error) {
      // Silent: heartbeat failures must not be noisy
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      renewToken(); // Periodically renew token
    }, 15 * 60 * 1000); // Every 15 minutes

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // auth state changed (silenced)
  }, [isAuthenticated, user]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    sendHeartbeat,
    login,
    logout,
    refreshUser,
    setAuthState,
  }

  if (isRehydrating) {
    return <LoadingScreen />; // Show a loading screen during rehydration
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}