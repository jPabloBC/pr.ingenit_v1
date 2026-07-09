import crypto from 'crypto'
import { supabaseAdmin } from './supabaseAdmin'

type AuthAction = 'signin' | 'collaborator_signin' | 'forgot_password' | 'reset_validate' | 'reset_password'

type RateLimitOptions = {
  action: AuthAction
  email?: string | null
  ip?: string | null
  maxAttempts: number
  windowSeconds: number
}

const isMissingTableError = (error: any) =>
  String(error?.code || '') === '42P01' ||
  String(error?.message || '').toLowerCase().includes('does not exist')

const hashIdentifier = (value?: string | null) => {
  const clean = String(value || '').trim().toLowerCase()
  if (!clean) return null
  const secret = process.env.NEXTAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-auth-rate-limit'
  return crypto.createHmac('sha256', secret).update(clean).digest('hex')
}

export const getRequestIp = (headers: Headers) => {
  const forwarded = headers.get('x-forwarded-for') || ''
  const firstForwarded = forwarded.split(',')[0]?.trim()
  return (
    firstForwarded ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    headers.get('x-client-ip') ||
    null
  )
}

export const checkAuthRateLimit = async (options: RateLimitOptions) => {
  const emailHash = hashIdentifier(options.email)
  const ipHash = hashIdentifier(options.ip)
  if (!emailHash && !ipHash) return { allowed: true, disabled: false }

  const since = new Date(Date.now() - options.windowSeconds * 1000).toISOString()
  const checks: Array<Promise<{ count: number | null; error: any }>> = []

  if (emailHash) {
    checks.push(
      supabaseAdmin
        .from('pr_auth_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('action', options.action)
        .eq('success', false)
        .eq('email_hash', emailHash)
        .gte('created_at', since) as any,
    )
  }

  if (ipHash) {
    checks.push(
      supabaseAdmin
        .from('pr_auth_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('action', options.action)
        .eq('success', false)
        .eq('ip_hash', ipHash)
        .gte('created_at', since) as any,
    )
  }

  const results = await Promise.all(checks)
  if (results.some((result) => isMissingTableError(result.error))) {
    return { allowed: true, disabled: true }
  }

  const hasError = results.find((result) => result.error)
  if (hasError) {
    console.error('Auth rate limit check failed:', hasError.error)
    return { allowed: true, disabled: true }
  }

  const blocked = results.some((result) => Number(result.count || 0) >= options.maxAttempts)
  return { allowed: !blocked, disabled: false }
}

export const recordAuthAttempt = async (params: {
  action: AuthAction
  email?: string | null
  ip?: string | null
  success: boolean
  metadata?: Record<string, any>
}) => {
  const emailHash = hashIdentifier(params.email)
  const ipHash = hashIdentifier(params.ip)

  const { error } = await supabaseAdmin
    .from('pr_auth_attempts')
    .insert({
      action: params.action,
      email_hash: emailHash,
      ip_hash: ipHash,
      success: params.success,
      metadata: params.metadata || {},
    })

  if (error && !isMissingTableError(error)) {
    console.error('Auth attempt record failed:', error)
  }
}
