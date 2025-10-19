
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react'
const IconIngenit = require('../../assets/icon_ingenIT_wt.png')
import { useAuth } from '../context/AuthContext'
import {
  View,
  Image,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native'
import { Button, Card, TextInput, HelperText } from 'react-native-paper'
import { apiService } from '../services/api'
import { authService } from '../services/auth'
import { API_BASE_URL } from '../constants/api'
import * as SecureStore from 'expo-secure-store'

import { COLORS, SPACING } from '../constants'
import { supabase } from '../services/supabaseClient'
import bcrypt from 'bcryptjs'

const LoginScreen = () => {
  const { login, setAuthState } = useAuth() as any
  const [companyId, setCompanyId] = useState('') // UUID de la empresa
  const [companyInput, setCompanyInput] = useState('') // Input de nombre de empresa
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [companyValid, setCompanyValid] = useState<boolean | null>(null)
  const [companyStep, setCompanyStep] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [collaboratorExists, setCollaboratorExists] = useState(false)
  const [collaboratorName, setCollaboratorName] = useState('')
  const [collaboratorLastName, setCollaboratorLastName] = useState('')
  const [password, setPassword] = useState('')
  const [loginSuccess, setLoginSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Paso 1: Validar existencia de la empresa (versión correcta, única)
  // (Eliminado duplicado)

  // Paso 1: Validar existencia de la empresa
  const handleValidateCompany = async () => {
    setLoading(true)
    setError('')
    try {
      // Buscar empresa por nombre y obtener UUID
      const { data, error } = await supabase
        .from('pr_companies')
        .select('id, name, logo_url')
        .ilike('name', companyInput.trim())
        .maybeSingle()
      if (error || !data) {
        setCompanyValid(false)
        setError('La empresa no existe o el identificador es incorrecto.')
        setLoading(false)
        return
      }
      setCompanyId(data.id) // Guardar el UUID de la empresa
      setCompanyValid(true)
      setCompanyStep(false)
      setCompanyName(data.name)
      setCompanyLogo(data.logo_url || null)
    } catch (e: any) {
      setError('Error inesperado en la validación Supabase')
    } finally {
      setLoading(false)
    }
  }

  // Paso 2: Validar existencia del colaborador (sin password)
  const handleValidateUser = async () => {
    setLoading(true)
    setError('')
    setCollaboratorExists(false)
    try {
      // Validar colaborador directamente con Supabase (igual que empresa)
      const { data, error } = await supabase
        .from('pr_collaborators')
        .select('id, first_name, last_name')
        .eq('company_id', companyId)
        .eq('document', identifier)
        .eq('is_active', true)
        .maybeSingle()
      if (error || !data) {
        setError('Colaborador no encontrado o inactivo')
        setLoading(false)
        return
      }
      setCollaboratorExists(true)
      setCollaboratorName(data.first_name || '')
      setCollaboratorLastName(data.last_name || '')
    } catch (e: any) {
      setError('Error inesperado en la validación Supabase')
    } finally {
      setLoading(false)
    }
  }

  // Login colaborador usando documento y contraseña
  // Login usando documento y contraseña (validación en backend)
  // Login usando documento y contraseña (hash SHA-256 en frontend)
  const handleCollaboratorLogin = async () => {
    setLoading(true)
    setError('')
    try {
      // First, try direct Supabase sign-in flow: fetch collaborator email and sign in
      try {
        const { data: collab, error: collabErr } = await supabase
          .from('pr_collaborators')
          .select('id, first_name, last_name, email, password_hash')
          .eq('company_id', companyId)
          .eq('document', identifier)
          .eq('is_active', true)
          .maybeSingle()

          if (!collab || !identifier || !companyId) {
            setError('No se pudieron obtener los datos del usuario. Por favor, intente iniciar sesión de nuevo.')
            setLoading(false)
            return
          }

        if (collabErr || !collab) {
          throw new Error('Colaborador no encontrado en Supabase')
        }

        // If the collaborator has a password_hash, compare it locally first
        if (collab.password_hash) {
          const ok = await bcrypt.compare(password, collab.password_hash)
          if (!ok) {
            throw new Error('Contraseña incorrecta')
          }

          // Password matches the stored hash. Prefer to obtain a Supabase session
          // if we have an email; otherwise create a local session state.
          if (collab.email) {
            const { data: sessionData, error: signInErr } = await supabase.auth.signInWithPassword({
              email: collab.email,
              password,
            } as any)

            if (!signInErr && sessionData) {
              const session = (sessionData as any).session
              const user = (sessionData as any).user || collab

              if (session?.access_token) {
                await SecureStore.setItemAsync('auth_token', session.access_token)
              }
              if (session?.refresh_token) {
                await SecureStore.setItemAsync('refresh_token', session.refresh_token)
              }

              const expires = session?.expires_at
                ? new Date(session.expires_at * 1000).toISOString()
                : new Date(Date.now() + 60 * 60 * 1000).toISOString()

              await SecureStore.setItemAsync('user_data', JSON.stringify(user))
              await setAuthState(user, session?.access_token, expires)
              setLoginSuccess(true)
              setLoading(false)
              return
            }
            // If signInWithPassword failed despite matching hash, continue to local session below
          }

          if (!collab) {
            throw new Error('Colaborador no encontrado o inactivo'); // login falla si no hay datos
          }

          // Solo si collab existe, crear sesión local
          const user = {
            id: collab.id,
            first_name: collab.first_name,
            last_name: collab.last_name,
            email: collab.email,
            user_metadata: {
              document: identifier,
              company_id: companyId,
            },
          }

          const sessionExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString()
          await SecureStore.setItemAsync('user_data', JSON.stringify(user))
          // No Supabase session available here — pass an empty token string for local session
          await setAuthState(user as any, '', sessionExpires)
          setLoginSuccess(true)
          setLoading(false)
          return

        }
      } catch (supabaseErr: any) {
        console.log('⚠️ Supabase sign-in failed, falling back to authService:', supabaseErr)
        // fallback to existing auth service which calls backend endpoints
      }

      // Fallback: Use authService.login which implements endpoint fallback and normalization
      try {
        const resp = await authService.login({ companyId, document: identifier, password })
        console.log('🔎 authService.login response:', resp)

        const finalUser = {
          ...resp.user,
          user_metadata: {
            ...((resp.user as any)?.user_metadata || {}),
            document: identifier,
            company_id: companyId,
          },
        }

        await setAuthState(finalUser, resp.token, resp.expires)
        setLoginSuccess(true)
      } catch (err: any) {
        console.log('❌ Error authService.login:', err)
        setError(err?.message || 'No se pudo iniciar sesión')
        setLoading(false)
        return
      }
    } catch (e: any) {
      setError('No se pudo iniciar sesión: ' + (e?.message || e))
      console.log('❌ Error en fetch login-collaborator:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Image
            source={IconIngenit}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="Logo plataforma"
          />
          <Text style={styles.subtitle}>
            Gestión de Colaboradores
          </Text>
        </View>
        <Card style={styles.loginCard}>
          <Card.Content style={styles.cardContent}>
            <Text style={styles.title}>
              Iniciar Sesión
            </Text>
            <Text style={styles.description}>
              Accede con tu cuenta de colaborador
            </Text>
            <View style={styles.formContainer}>
              {step === 1 && (
                <>
                  {companyStep ? (
                    <>
                      <TextInput
                        label="Nombre de Empresa"
                        value={companyInput}
                        onChangeText={setCompanyInput}
                        mode="outlined"
                        autoCapitalize="none"
                        style={styles.input}
                        disabled={loading}
                        theme={{
                          colors: {
                            onSurfaceVariant: COLORS.gray7,
                          },
                        }}
                      />
                      <Button
                        mode="contained"
                        onPress={handleValidateCompany}
                        loading={loading}
                        style={styles.loginButton}
                        labelStyle={styles.loginButtonLabel}
                        disabled={!companyInput.trim() || loading}
                      >
                        Validar empresa
                      </Button>
                      {companyValid === false && (
                        <HelperText type="error" style={styles.helperError}>
                          La empresa no existe o el identificador es incorrecto.
                        </HelperText>
                      )}
                    </>
                  ) : (
                    <>
                      <View style={styles.companyInfoRow}>
                        <Text style={styles.companyName} numberOfLines={1}>
                          {companyName
                            ? companyName.charAt(0).toUpperCase() + companyName.slice(1).toLowerCase()
                            : ''}
                        </Text>
                        {companyLogo ? (
                          <Image
                            source={{ uri: companyLogo }}
                            style={styles.companyLogo}
                            resizeMode="contain"
                          />
                        ) : null}
                        <Button
                          mode="text"
                          onPress={() => {
                            setCompanyStep(true)
                            setCompanyValid(null)
                            setCompanyName('')
                            setCompanyLogo(null)
                            setCompanyId('')
                            setCompanyInput('')
                            setIdentifier('')
                            setError('')
                          }}
                          style={styles.changeCompanyBtn}
                          labelStyle={styles.changeCompanyLabel}
                        >
                          Cambiar empresa
                        </Button>
                      </View>
                      {!collaboratorExists && (
                        <>
                          <TextInput
                            label="RUT / Documento de Identidad"
                            value={identifier}
                            onChangeText={setIdentifier}
                            mode="outlined"
                            autoCapitalize="none"
                            style={[styles.input, { marginTop: 0 }]}
                            disabled={loading}
                            theme={{
                              colors: {
                                onSurfaceVariant: COLORS.gray7,
                              },
                            }}
                          />
                          <Button
                            mode="contained"
                            onPress={handleValidateUser}
                            loading={loading}
                            style={styles.loginButton}
                            labelStyle={styles.loginButtonLabel}
                            disabled={!identifier || loading}
                          >
                            Validar identidad
                          </Button>
                        </>
                      )}
                      {collaboratorExists && (
                        <View style={{ marginBottom: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 20, fontWeight: 'normal', color: COLORS.blue5 }}>
                            {collaboratorName} {collaboratorLastName}
                          </Text>
                        </View>
                      )}
                      {error ? (
                        <HelperText type="error" style={styles.helperError}>
                          {error}
                        </HelperText>
                      ) : null}
                      {collaboratorExists && !loginSuccess && (
                        <>
                          <TextInput
                            label="Contraseña"
                            value={password}
                            onChangeText={setPassword}
                            mode="outlined"
                            secureTextEntry={!showPassword}
                            style={styles.input}
                            disabled={loading}
                            theme={{
                              colors: {
                                onSurfaceVariant: COLORS.gray7,
                              },
                            }}
                            right={
                              <TextInput.Icon
                                icon={showPassword ? 'eye-off' : 'eye'}
                                onPress={() => setShowPassword((prev) => !prev)}
                                color={COLORS.gray6}
                              />
                            }
                          />
                          <Button
                            mode="contained"
                            onPress={handleCollaboratorLogin}
                            loading={loading}
                            style={styles.loginButton}
                            labelStyle={styles.loginButtonLabel}
                            disabled={!password || loading}
                          >
                            Ingresar
                          </Button>
                        </>
                      )}
                      {loginSuccess && (
                        <Text style={{ color: 'green', fontWeight: 'bold', marginBottom: 12 }}>
                          ¡Login exitoso!
                        </Text>
                      )}
                    </>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <TextInput
                    label="Código de verificación (OTP)"
                    value={otp}
                    onChangeText={setOtp}
                    mode="outlined"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    style={[styles.input, { marginTop: 0 }]}
                    disabled={loading}
                  />
                  <HelperText type="info">
                    Ingresa el código enviado a tu correo o celular
                  </HelperText>
                  <Button
                    mode="contained"
                    // onPress={handleValidateOtp} // Función no implementada
                    loading={loading}
                    style={styles.loginButton}
                    labelStyle={styles.loginButtonLabel}
                    disabled={!otp || loading}
                  >
                    Ingresar
                  </Button>
                </>
              )}
            </View>
          </Card.Content>
        </Card>
        <Text style={styles.footer}>
          ¿No tienes una cuenta?
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = ({
  container: {
    flex: 1,
    backgroundColor: COLORS.blue1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    padding: SPACING.lg,
  },
  logoContainer: {
    alignItems: 'center' as const,
    marginBottom: SPACING.xxl,
  },
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: SPACING.md,
  },
  logoText: {
    color: COLORS.blue1,
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
  },
  subtitle: {
    color: COLORS.white,
    textAlign: 'center' as const,
    opacity: 0.9,
    fontSize: 24,
  },
  loginCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  cardContent: {
    padding: SPACING.lg,
  },
  title: {
    textAlign: 'center' as const,
    marginBottom: SPACING.md,
    color: COLORS.blue1,
    fontWeight: 'normal' as const,
    fontSize: 28,
  },
  description: {
    textAlign: 'center' as const,
    marginBottom: SPACING.md,
    color: COLORS.textSecondary,
    fontSize: 20,
  },
  loginButtonLabel: {
    color: COLORS.white,
    fontWeight: 'normal' as const,
    fontSize: 18,
  },
  formContainer: {
    gap: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.white,
    fontSize: 20,
    marginBottom: SPACING.xs,
  },
  loginButton: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.blue3,
  },
  loginButtonContent: {
    paddingVertical: SPACING.sm,
  },
  footer: {
    textAlign: 'center' as const,
    marginTop: SPACING.xl,
    color: COLORS.white,
    opacity: 0.8,
  },
  helperError: {
    fontSize: 16,
    color: COLORS.error || '#B00020',
  },
  helperInfo: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  companyInfoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 0,
    gap: 8,
  },
  companyName: {
    fontSize: 20,
    color: COLORS.blue1,
    fontWeight: 'normal' as const,
    flex: 1,
    textTransform: 'capitalize' as const,
    textAlign: 'left' as const,
    marginLeft: 8,
  },
  companyLogo: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.gray2,
    marginRight: 8,
    borderRadius: 2,
  },
  changeCompanyBtn: {
    minWidth: 0,
    paddingHorizontal: 0,
    marginLeft: 0,
  },
  changeCompanyLabel: {
    fontSize: 14,
    color: COLORS.blue3,
    textDecorationLine: 'underline' as const,
  },
})

export default LoginScreen