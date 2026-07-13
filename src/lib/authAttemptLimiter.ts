import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const LOGIN_ACTION = 'login'
const COLLABORATOR_LOGIN_ACTION = 'collaborator_login'
const PASSWORD_RESET_ACTION = 'password_reset_request'
const WINDOW_MS = 15 * 60 * 1000
const MAX_EMAIL_FAILURES = 5
const MAX_IP_FAILURES = 25

type RequestLike = {
  headers?: Headers | Record<string, string | string[] | undefined>
}

const hashValue = (value: string) =>
  createHash('sha256').update(value).digest('hex')

const getHeader = (request: RequestLike | undefined, name: string) => {
  const headers = request?.headers
  if (!headers) return ''
  if (typeof (headers as Headers).get === 'function') {
    return String((headers as Headers).get(name) || '')
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name]
    || (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()]
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

export const getClientIpHash = (request?: RequestLike) => {
  const forwarded = getHeader(request, 'x-forwarded-for')
  const ip = (forwarded ? forwarded.split(',')[0] : getHeader(request, 'x-real-ip')).trim()
  return ip ? hashValue(ip) : null
}

export const getEmailHash = (email: string) => hashValue(String(email || '').trim().toLowerCase())
export const getAuthIdentifierHash = (value: string) => hashValue(String(value || '').trim().toLowerCase())

const countEmailFailuresSinceSuccess = (rows: Array<{ success: boolean }>) => {
  let failures = 0
  for (const row of rows) {
    if (row.success) break
    failures += 1
  }
  return failures
}

export const isLoginRateLimited = async ({
  emailHash,
  ipHash,
}: {
  emailHash: string
  ipHash: string | null
}) => {
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const emailQuery = supabaseAdmin
    .from('pr_auth_attempts')
    .select('success, created_at')
    .eq('action', LOGIN_ACTION)
    .eq('email_hash', emailHash)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)
  const ipQuery = ipHash
    ? supabaseAdmin
      .from('pr_auth_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('action', LOGIN_ACTION)
      .eq('ip_hash', ipHash)
      .eq('success', false)
      .gte('created_at', since)
    : null

  const [emailResult, ipResult] = await Promise.all([
    emailQuery,
    ipQuery || Promise.resolve({ count: 0, error: null }),
  ])
  if (emailResult.error) throw emailResult.error
  if (ipResult.error) throw ipResult.error

  const emailFailures = countEmailFailuresSinceSuccess(emailResult.data || [])
  const ipFailures = Number(ipResult.count || 0)
  return emailFailures >= MAX_EMAIL_FAILURES || ipFailures >= MAX_IP_FAILURES
}

export const recordLoginAttempt = async ({
  emailHash,
  ipHash,
  success,
}: {
  emailHash: string
  ipHash: string | null
  success: boolean
}) => {
  const { error } = await supabaseAdmin
    .from('pr_auth_attempts')
    .insert({
      action: LOGIN_ACTION,
      email_hash: emailHash,
      ip_hash: ipHash,
      success,
      metadata: { source: 'credentials' },
    })
  if (error) throw error
}

const isCredentialRateLimited = async ({
  action,
  identifierHash,
  ipHash,
}: {
  action: string
  identifierHash: string
  ipHash: string | null
}) => {
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const identifierQuery = supabaseAdmin
    .from('pr_auth_attempts')
    .select('success')
    .eq('action', action)
    .eq('email_hash', identifierHash)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)
  const ipQuery = ipHash
    ? supabaseAdmin
      .from('pr_auth_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('action', action)
      .eq('ip_hash', ipHash)
      .eq('success', false)
      .gte('created_at', since)
    : null
  const [identifierResult, ipResult] = await Promise.all([
    identifierQuery,
    ipQuery || Promise.resolve({ count: 0, error: null }),
  ])
  if (identifierResult.error) throw identifierResult.error
  if (ipResult.error) throw ipResult.error

  return countEmailFailuresSinceSuccess(identifierResult.data || []) >= MAX_EMAIL_FAILURES
    || Number(ipResult.count || 0) >= MAX_IP_FAILURES
}

const recordAttempt = async ({
  action,
  identifierHash,
  ipHash,
  success,
  source,
}: {
  action: string
  identifierHash: string
  ipHash: string | null
  success: boolean
  source: string
}) => {
  const { error } = await supabaseAdmin
    .from('pr_auth_attempts')
    .insert({
      action,
      email_hash: identifierHash,
      ip_hash: ipHash,
      success,
      metadata: { source },
    })
  if (error) throw error
}

export const isCollaboratorLoginRateLimited = (identifierHash: string, ipHash: string | null) =>
  isCredentialRateLimited({ action: COLLABORATOR_LOGIN_ACTION, identifierHash, ipHash })

export const recordCollaboratorLoginAttempt = ({
  identifierHash,
  ipHash,
  success,
}: {
  identifierHash: string
  ipHash: string | null
  success: boolean
}) => recordAttempt({
  action: COLLABORATOR_LOGIN_ACTION,
  identifierHash,
  ipHash,
  success,
  source: 'mobile_collaborator',
})

export const isPasswordResetRequestRateLimited = async (emailHash: string, ipHash: string | null) => {
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const emailQuery = supabaseAdmin
    .from('pr_auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('action', PASSWORD_RESET_ACTION)
    .eq('email_hash', emailHash)
    .gte('created_at', since)
  const ipQuery = ipHash
    ? supabaseAdmin
      .from('pr_auth_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('action', PASSWORD_RESET_ACTION)
      .eq('ip_hash', ipHash)
      .gte('created_at', since)
    : null
  const [emailResult, ipResult] = await Promise.all([
    emailQuery,
    ipQuery || Promise.resolve({ count: 0, error: null }),
  ])
  if (emailResult.error) throw emailResult.error
  if (ipResult.error) throw ipResult.error

  return Number(emailResult.count || 0) >= 3 || Number(ipResult.count || 0) >= 10
}

export const recordPasswordResetRequest = (emailHash: string, ipHash: string | null) => recordAttempt({
  action: PASSWORD_RESET_ACTION,
  identifierHash: emailHash,
  ipHash,
  success: true,
  source: 'password_reset',
})
