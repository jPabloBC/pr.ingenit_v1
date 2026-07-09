import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveCurrentActor, type CurrentActor } from '@/lib/currentActor'

type ApiAccessOptions = {
  resource?: string
  aliases?: string[]
  requireCompany?: boolean
  requireProject?: boolean
  allowDev?: boolean
}

type ApiAccessGranted = {
  ok: true
  session: any
  actor: CurrentActor
  permissions: string[]
}

type ApiAccessDenied = {
  ok: false
  response: NextResponse
}

export type ApiAccessResult = ApiAccessGranted | ApiAccessDenied

const clean = (value: unknown) => String(value || '').trim()

const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status })

function hasPermission(permissions: string[], resource: string, aliases: string[] = []) {
  if (permissions.includes('*') || permissions.includes(resource)) return true
  return aliases.some((alias) => permissions.includes(alias))
}

export async function requireApiAccess(options: ApiAccessOptions = {}): Promise<ApiAccessResult> {
  const session = (await getServerSession(authOptions as any)) as any
  if (!session?.user) {
    return { ok: false, response: jsonError('Unauthorized', 401) }
  }

  const actor = await resolveCurrentActor(session)
  if (!actor) {
    return { ok: false, response: jsonError('Unauthorized', 401) }
  }

  const role = clean(actor.role || session.user.role).toLowerCase()
  if (role === 'dev' && options.allowDev !== true) {
    return { ok: false, response: jsonError('Forbidden', 403) }
  }

  if (options.requireCompany !== false && !actor.companyId) {
    return { ok: false, response: jsonError('Missing company context', 400) }
  }

  if (options.requireProject && !actor.projectId) {
    return { ok: false, response: jsonError('Missing project context', 400) }
  }

  const permissions = Array.isArray(session.user.permissions) ? session.user.permissions : []
  if (options.resource && !hasPermission(permissions, options.resource, options.aliases)) {
    return { ok: false, response: jsonError('Forbidden', 403) }
  }

  return { ok: true, session, actor, permissions }
}

export function resolveScopedCompanyId(actor: CurrentActor, requestedCompanyId?: unknown) {
  const sessionCompanyId = clean(actor.companyId)
  const requested = clean(requestedCompanyId)

  if (!sessionCompanyId) {
    return { companyId: '', response: jsonError('Missing company context', 400) }
  }

  if (requested && requested !== sessionCompanyId) {
    return { companyId: '', response: jsonError('Forbidden', 403) }
  }

  return { companyId: sessionCompanyId, response: null }
}
