import React, { useEffect, useState } from 'react'
import { View, Text, Alert, ScrollView } from 'react-native'
import { Button, Card, Paragraph, Divider } from 'react-native-paper'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabaseClient'
import { useCallback } from 'react'
import { apiService } from '../services/api'

const ProfileScreen: React.FC = () => {
  const { logout, user, refreshUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const handleLogout = async () => {
    setLoading(true)
    try {
      await logout()
    } catch (err: unknown) {
      console.error('Logout error', err)
      Alert.alert('Error', 'No se pudo cerrar sesión')
    } finally {
      setLoading(false)
    }
  }

  const employee = user?.employee
  const [remoteEmployee, setRemoteEmployee] = useState<any | null>(null)
  const activeEmployee = remoteEmployee || employee
  const displayFirstName = (activeEmployee && activeEmployee.first_name) || (user as any)?.first_name || ''
  const displayLastName = (activeEmployee && activeEmployee.last_name) || (user as any)?.last_name || ''
  // DEBUG: show stored user object in console for quick inspection during dev

  useEffect(() => {
    let mounted = true
    const tryRefresh = async () => {
      if (!user) {
        return
      }

      const employee = (user as any).employee
      const hasName =
        (employee && (employee.first_name || employee.last_name)) ||
        (user as any).first_name ||
        (user as any).last_name

      if (!hasName) {
        try {
          await refreshUser()
        } catch (e) {
          Alert.alert(
            'Error',
            'No se pudo actualizar los datos del usuario. Por favor, verifica tu conexión a internet.'
          )
        }
      }
    }

    if (mounted) tryRefresh()
    return () => { mounted = false }
  }, [user, refreshUser])

  // If after refresh there is still no employee, try to fetch collaborator directly
  const fetchCollaborator = useCallback(async () => {
    if (!user) {
      return
    }

    const uid = (user as any).id
    const email = (user as any).email
    if (!uid && !email) {
      return
    }

    try {
      let query = supabase.from('pr_collaborators').select('*')
      if (uid && email) {
        query = query.or(`user_id.eq.${uid},email.eq.${email}`)
      } else if (uid) {
        query = query.eq('user_id', uid)
      } else if (email) {
        query = query.eq('email', email)
      }

      const { data, error } = await query.maybeSingle()
      if (!error && data) {
        setRemoteEmployee(data)
      } else if (error) {
        Alert.alert(
          'Error',
          'No se pudo obtener los datos del colaborador. Por favor, intenta nuevamente.'
        )
      }
    } catch (e) {
      Alert.alert(
        'Error',
        'Ocurrió un problema al conectar con el servidor. Verifica tu conexión.'
      )
    }
  }, [user])

  useEffect(() => {
    if (!employee && user) {
      fetchCollaborator()
    }
  }, [employee, user, fetchCollaborator])

  const handleForceRefresh = async () => {
    setLastError(null)
    setRefreshing(true)
    try {
      // Try server-side profile refresh first
      try {
        await refreshUser()
      } catch (e) {
        if ((e as any)?.message?.includes('Network Error')) {
          Alert.alert(
            'Error',
            'No se pudo conectar con el servidor para actualizar los datos del usuario. Verifica tu conexión.'
          )
        }
      }

      // Try collaborator fetch via Supabase client
      try {
        await fetchCollaborator()
      } catch (e) {
        Alert.alert(
          'Error',
          'No se pudo obtener los datos del colaborador. Por favor, intenta nuevamente.'
        )
      }

      // If still no employee, try requesting via API service (if backend configured)
      if (!((user as any)?.employee) && typeof apiService?.get === 'function' && user) {
        try {
          const email = (user as any).email
          const uid = (user as any).id
          // Best-effort API endpoint — backend may implement a profile route
          const path = `/api/collaborators?email=${encodeURIComponent(email || '')}&userId=${encodeURIComponent(uid || '')}`
          const result = await apiService.get(path)
          if (result) {
            setRemoteEmployee(result)
          }
        } catch (e: any) {
          console.debug('API collaborator fetch failed', e)
          setLastError((e && e.message) || String(e))
        }
      }

      // Show visual feedback
      Alert.alert('Refresco completado', 'Intenté refrescar datos. Revisa la sección DEBUG abajo.')
    } catch (e: any) {
      setLastError(e.message || String(e))
      Alert.alert('Error', e.message || String(e))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {/* PROMINENT BANNER: always show name/email */}
      <View style={{ backgroundColor: '#ffeb3b', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ fontSize: 20, fontWeight: '700', color: '#000', textAlign: 'center', flexWrap: 'nowrap' }}
        >
          {displayFirstName || displayLastName
            ? `${displayFirstName} ${displayLastName}`.trim()
            : (user?.email || 'Usuario')}
        </Text>
        {!displayFirstName && !displayLastName && (
          <Text style={{ color: 'red', textAlign: 'center' }}>
            No se encontraron nombres para mostrar. Verifica los datos del usuario.
          </Text>
        )}
      </View>
      <Card style={{ marginBottom: 12 }}>
        <Card.Title title="Mi Perfil" />
        <Card.Content>
          <Paragraph style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>Bienvenido</Paragraph>
          <Paragraph
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#000', flexWrap: 'nowrap' }}
          >
            {displayFirstName || displayLastName
              ? `${displayFirstName} ${displayLastName}`.trim()
              : (user?.email || 'Usuario')}
          </Paragraph>
          <Divider style={{ marginVertical: 8 }} />

          {/* Show collaborator properties (from remote fetch or employee) as stored (read-only). Exclude sensitive keys. */}
          {activeEmployee ? (
            Object.entries(activeEmployee as any)
              .filter(([k]) => !['password', 'password_hash', 'salt', 'auth_token', 'refresh_token'].includes(k))
              .map(([key, value]) => {
                const display =
                  value === null || value === undefined
                    ? '—'
                    : typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value)
                return (
                  <Paragraph key={key} style={{ color: '#000' }}>
                    {`${key}: ${display}`}
                  </Paragraph>
                )
              })
          ) : (
            <Paragraph style={{ color: '#000' }}>No se encontraron datos del colaborador.</Paragraph>
          )}
        </Card.Content>
      </Card>

      <Card style={{ marginTop: 12, padding: 12 }}>
        <Card.Title title="DEBUG: raw user data" />
        <Card.Content>
          <Paragraph style={{ color: '#000', fontSize: 12 }}>{JSON.stringify(user || {}, null, 2)}</Paragraph>
          <Divider style={{ marginVertical: 8 }} />
          <Paragraph style={{ color: '#000', fontSize: 12 }}>{JSON.stringify(activeEmployee || remoteEmployee || {}, null, 2)}</Paragraph>
        </Card.Content>
      </Card>

      {lastError ? (
        <Text style={{ color: '#b00020', marginVertical: 8 }}>Error: {lastError}</Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Button mode="outlined" onPress={handleForceRefresh} loading={refreshing} disabled={refreshing}>
          Forzar refresco
        </Button>
        <Button mode="contained" onPress={handleLogout} loading={loading}>
          Cerrar sesión
        </Button>
      </View>
    </ScrollView>
  )
}

export default ProfileScreen
