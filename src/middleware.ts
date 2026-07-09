import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const RESOURCE_MAP: Record<string, string> = {
  '/users/dashboard': 'dashboard',
  '/users/collaborators': 'collaborators',
  '/users/staffing-activities': 'staffing-activities',
  '/users/crews': 'crews',
  '/users/field-reports': 'field-reports',
  '/users/daily-report': 'daily-report',
  '/users/program': 'program',
  '/users/attendance': 'attendance',
  '/users/profile': 'profile',
  '/users/admin/permissions': 'admin-permissions',
  '/users/management': 'management',
  '/users/settings': 'settings',
}

const RESOURCE_ALIASES: Record<string, string[]> = {
  'daily-report': ['admin-daily-report'],
  attendance: ['daily-report'],
}

const API_RESOURCE_MAP: Record<string, string> = {
  '/api/admin': 'admin-permissions',
  '/api/activities': 'program',
  '/api/attendance': 'attendance',
  '/api/collaborators/daily-status': 'attendance',
  '/api/collaborators/assets': 'collaborators',
  '/api/collaborators/import': 'collaborators',
  '/api/collaborators/role-history': 'collaborators',
  '/api/collaborators/specialties': 'collaborators',
  '/api/collaborators/me': 'profile',
  '/api/collaborators': 'collaborators',
  '/api/company-assets': 'settings',
  '/api/companies': 'settings',
  '/api/crews': 'crews',
  '/api/daily-reports': 'daily-report',
  '/api/dashboard': 'dashboard',
  '/api/departments': 'management',
  '/api/employees': 'collaborators',
  '/api/field-reports': 'field-reports',
  '/api/management': 'management',
  '/api/report-fronts': 'daily-report',
  '/api/staffing-activities': 'staffing-activities',
  '/api/storage': 'settings',
  '/api/users/profile': 'profile',
}

const PUBLIC_API_PREFIXES = [
  '/api/auth',
  '/api/version',
  '/api/attendance/logo',
  '/api/collaborators/session',
]

const TOKEN_ONLY_API_PREFIXES = [
  '/api/session',
  '/api/internal-notifications',
  '/api/pdf/render',
]

function matchResource(pathname: string, map: Record<string, string>) {
  for (const pattern of Object.keys(map)) {
    if (pathname === pattern || pathname.startsWith(pattern + '/')) return map[pattern]
  }
  return null
}

function apiResourceForRequest(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  if (pathname === '/api/collaborators') {
    if (searchParams.get('crews') === '1' && searchParams.get('summary') === '1') return 'crews'
  }

  if (pathname === '/api/collaborators/specialties' && searchParams.get('source') === 'crews') {
    return 'crews'
  }

  if (pathname === '/api/collaborators/daily-status' && searchParams.get('source') === 'crews') {
    const datesOnly = searchParams.get('dates') === '1'
    const turnoDatesOnly = searchParams.get('turno_dates') === '1'
    const turnoIdsOnly = searchParams.get('turno_ids') === '1'
    if ((datesOnly && turnoDatesOnly) || turnoIdsOnly) return 'crews'
  }

  if (pathname === '/api/report-fronts' && searchParams.get('source') === 'crews') {
    return 'crews'
  }

  if ((pathname === '/api/activities' || pathname.startsWith('/api/activities/')) && searchParams.get('source') === 'crews') {
    return 'crews'
  }

  return matchResource(pathname, API_RESOURCE_MAP)
}

function hasPermission(perms: string[], resource: string) {
  if (perms.includes('*') || perms.includes(resource)) return true
  const aliases = RESOURCE_ALIASES[resource] || []
  return aliases.some((key) => perms.includes(key))
}

function redirectToSignin(req: NextRequest, error = 'access_denied') {
  const url = new URL('/auth/signin', req.nextUrl.origin)
  url.searchParams.set('error', error)
  return NextResponse.redirect(url)
}

function apiError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

async function protectApi(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/dev')) {
    return apiError('Not found', 404)
  }

  const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as any
  if (!token) return apiError('Unauthorized', 401)

  const role = String(token.role || '').trim().toLowerCase()
  if (role === 'dev') return apiError('Forbidden', 403)

  const requiresOnlyToken = TOKEN_ONLY_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))
  if (requiresOnlyToken) return NextResponse.next()

  if (!token?.projectId) return apiError('Missing project context', 400)

  const resource = apiResourceForRequest(req)
  if (!resource) return NextResponse.next()

  const perms: string[] = Array.isArray(token.permissions) ? token.permissions : []
  if (hasPermission(perms, resource)) return NextResponse.next()

  return apiError('Forbidden', 403)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/dev')) {
    return redirectToSignin(req, 'dev_area_moved_to_ingenit_v2')
  }

  if (pathname.startsWith('/api')) {
    return protectApi(req)
  }

  if (!pathname.startsWith('/users')) return NextResponse.next()

  const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as any
  if (!token) return redirectToSignin(req)

  if (token.role === 'dev') {
    return redirectToSignin(req, 'dev_area_moved_to_ingenit_v2')
  }

  if (pathname !== '/users/select-project' && !token?.projectId) {
    return NextResponse.redirect(new URL('/users/select-project', req.nextUrl.origin))
  }

  if (pathname === '/users/select-project') return NextResponse.next()

  const resource = matchResource(pathname, RESOURCE_MAP)
  if (!resource) return redirectToSignin(req)

  const perms: string[] = Array.isArray(token.permissions) ? token.permissions : []
  const role = String(token.role || '').trim().toLowerCase()

  if (resource === 'daily-report' && (role === 'user' || role === 'viewer')) {
    return NextResponse.next()
  }

  if (hasPermission(perms, resource)) {
    return NextResponse.next()
  }

  for (const [path, mappedResource] of Object.entries(RESOURCE_MAP)) {
    if (hasPermission(perms, mappedResource)) {
      return NextResponse.redirect(new URL(path, req.nextUrl.origin))
    }
  }

  return redirectToSignin(req)
}

export const config = {
  matcher: ['/users/:path*', '/dev/:path*', '/api/:path*'],
}
