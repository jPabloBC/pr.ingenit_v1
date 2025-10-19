/* eslint-disable @typescript-eslint/no-explicit-any */
import * as SecureStore from 'expo-secure-store'
import { apiService } from './api'
import { User, Employee, AuthSession } from '../types'
import { API_ENDPOINTS } from '../constants'

export interface LoginCredentials {
  // Support both email/password (typical auth) and
  // companyId + document + password (collaborator login)
  email?: string
  companyId?: string
  document?: string
  password: string
}

export interface AuthResponse {
  user: User & { employee?: Employee }
  token: string
  expires: string
}

class AuthService {
  private currentUser: (User & { employee?: Employee }) | null = null

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      // Try the standard /api/auth/login first (dev-server), then fallback to
      // /api/auth/login-collaborator (main server) which may return a different
      // response shape. Normalize both shapes into AuthResponse.
      let raw: any = null
      try {
        raw = await apiService.post('/api/auth/login', credentials)
      } catch (err) {
        // If the endpoint doesn't exist or fails, try collaborator endpoint
        raw = await apiService.post('/api/auth/login-collaborator', credentials)
      }

      // Normalize possible shapes:
      // Dev server: { accessToken, refreshToken, collaborator }
      // Main server: { success: true, collaborator: { ... } }
      // Expected AuthResponse: { user, token, expires }
      const token = raw.accessToken || raw.token || raw.access_token || null
      const refreshToken = raw.refreshToken || raw.refresh_token || null
      const user = raw.user || raw.collaborator || raw.collaborator?.collaborator || null
      const expires = raw.expires || null

      // Store tokens if present
      if (token) {
        await SecureStore.setItemAsync('auth_token', token)
      }
      if (refreshToken) {
        await SecureStore.setItemAsync('refresh_token', refreshToken)
      }

      if (user) {
        await SecureStore.setItemAsync('user_data', JSON.stringify(user))
        this.currentUser = user
      }

      const normalized: AuthResponse = {
        user: (user as any) || null,
        token: token || '',
        expires: expires || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }

      return normalized
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    }
  }

  async logout(): Promise<void> {
    try {
      // Obtener el id del colaborador desde SecureStore
      const userData = await SecureStore.getItemAsync('user_data')
      let collaboratorId = null
      if (userData) {
        try {
          const user = JSON.parse(userData)
          collaboratorId = user.id
          if (!collaboratorId) {
            console.error('Collaborator ID is missing in user data:', user)
            return
          }
        } catch (parseError) {
          console.error('Failed to parse user data from SecureStore:', parseError)
          return
        }
      } else {
        console.error('No user data found in SecureStore. Cannot proceed with logout.')
        return
      }
      console.log('Sending logout request:', { endpoint: API_ENDPOINTS.AUTH.LOGOUT, collaboratorId });
      // Call logout endpoint enviando el id
      await apiService.post(API_ENDPOINTS.AUTH.LOGOUT, { id: collaboratorId })
      console.log('Logout request sent successfully');
    } catch (error) {
      // Suppress noisy network errors (device may be offline or backend unreachable)
      const msg = (error as any)?.message || ''
      if (typeof msg === 'string' && msg.includes('Network Error')) {
        // intentional no-op: network error is expected sometimes on mobile
      } else {
        console.error('Logout API call failed:', error)
      }
      // Continue with local logout even if API call fails
    } finally {
      // Clear local storage
      await SecureStore.deleteItemAsync('auth_token')
      await SecureStore.deleteItemAsync('user_data')
      await SecureStore.deleteItemAsync('auth_expires')
      this.currentUser = null
    }
  }

  async getCurrentUser(): Promise<(User & { employee?: Employee }) | null> {
    if (this.currentUser) {
      return this.currentUser
    }

    try {
      const userData = await SecureStore.getItemAsync('user_data')
      if (userData) {
        this.currentUser = JSON.parse(userData)
        return this.currentUser
      }
    } catch (error) {
      console.error('Error getting current user:', error)
    }

    return null
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await SecureStore.getItemAsync('auth_token')
      const expires = await SecureStore.getItemAsync('auth_expires')
      
      if (!token || !expires) {
        return false
      }

      // Check if token is expired
      const expirationDate = new Date(expires)
      const now = new Date()
      
      if (now >= expirationDate) {
        // Token expired, clear storage
        await this.logout()
        return false
      }

      return true
    } catch (error) {
      console.error('Error checking authentication:', error)
      return false
    }
  }

  async refreshUserData(): Promise<(User & { employee?: Employee }) | null> {
    try {
      const userData = await apiService.get<User & { employee?: Employee }>(
        API_ENDPOINTS.AUTH.PROFILE
      )
      
      await SecureStore.setItemAsync('user_data', JSON.stringify(userData))
      this.currentUser = userData
      return userData
    } catch (error) {
      console.error('Error refreshing user data:', error)
      throw error
    }
  }

  async getStoredToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync('auth_token')
    } catch (error) {
      console.error('Error getting stored token:', error)
      return null
    }
  }

  async renewToken(currentToken: string): Promise<{ newToken: string; newExpires: string }> {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await apiService.post('/api/auth/refresh-token', {
        token: currentToken,
        refresh_token: refreshToken,
      });

      const newToken = response.accessToken || response.token;
      const newExpires = response.expires;

      if (newToken) {
        await SecureStore.setItemAsync('auth_token', newToken);
      }
      if (newExpires) {
        await SecureStore.setItemAsync('auth_expires', newExpires);
      }

      return { newToken, newExpires };
    } catch (error) {
      console.error('Error renewing token:', error);
      throw error;
    }
  }
}

export const authService = new AuthService()