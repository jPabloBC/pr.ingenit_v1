/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import * as SecureStore from 'expo-secure-store'
import { API_BASE_URL } from '../constants'

export class ApiService {
  private api: AxiosInstance

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      async (config) => {
        const token = await SecureStore.getItemAsync('auth_token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config
        // Log minimal API failure info (avoid sensitive headers/token)
        console.error('API request failed:', {
          url: originalRequest.url,
          method: originalRequest.method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          errorMessage: error.message,
        })

        // Improved error handling for network issues
        if (error.message.includes('Network Error')) {
          console.error('Network Error: Unable to reach the server. Please check your connection.')
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true
          try {
            const refreshToken = await SecureStore.getItemAsync('refresh_token')
            if (refreshToken) {
              // Attempt to refresh token logic here
              console.log('Attempting to refresh token...')
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError)
          }
        }

        return Promise.reject(error)
      }
    )
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.api.get(url, config)
    return response.data
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.api.post(url, data, config)
      console.log('POST request successful:', {
        url,
        status: response.status,
        headers: response.headers,
        data: response.data,
      })
      return response.data
    } catch (error) {
      // Better logging: include baseURL, full URL, and response body if present
      try {
        const base = (this.api.defaults && this.api.defaults.baseURL) || ''
        const fullUrl = base ? `${base.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}` : url
        const respBody = (error as any)?.response?.data
        console.error('POST request failed:', {
          url,
          fullUrl,
          message: error instanceof Error ? error.message : String(error),
          status: (error as any)?.response?.status,
          responseBody: respBody,
        })
      } catch (logErr) {
        console.error('POST request failed (logging fallback):', error)
      }
      throw error
    }
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.api.put(url, data, config)
    return response.data
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.api.delete(url, config)
    return response.data
  }
}

export const apiService = new ApiService()