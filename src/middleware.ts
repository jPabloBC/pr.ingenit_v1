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
  '/users/settings': 'settings'
}

// Keep middleware aligned with Aside/API during permission key migrations.
const RESOURCE_ALIASES: Record<string, string[]> = {
  'daily-report': ['admin-daily-report']
}

function matchResource(pathname: string) {
  for (const pattern of Object.keys(RESOURCE_MAP)) {
    if (pathname === pattern || pathname.startsWith(pattern + '/')) return RESOURCE_MAP[pattern]
  }
  return null
}

function hasPermission(perms: string[], resource: string) {
  if (perms.includes('*') || perms.includes(resource)) return true
  const aliases = RESOURCE_ALIASES[resource] || []
  return aliases.some((k) => perms.includes(k))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Dev area is managed in ingenit_v2, so /dev is disabled in this app.
  if (pathname.startsWith('/dev')) {
    const url = new URL('/auth/signin', req.nextUrl.origin)
    url.searchParams.set('error', 'dev_area_moved_to_ingenit_v2')
    return NextResponse.redirect(url)
  }

  // Only protect /users routes
  if (!pathname.startsWith('/users')) return NextResponse.next()

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as any
  if (!token) {
    const url = new URL('/auth/signin', req.nextUrl.origin)
    url.searchParams.set('error', 'access_denied')
    return NextResponse.redirect(url)
  }

  // Dev no longer operates in this app.
  if (token.role === 'dev') {
    const url = new URL('/auth/signin', req.nextUrl.origin)
    url.searchParams.set('error', 'dev_area_moved_to_ingenit_v2')
    return NextResponse.redirect(url)
  }

  // Require project selection for non-dev users before entering protected user modules.
  if (pathname !== '/users/select-project' && !token?.projectId) {
    return NextResponse.redirect(new URL('/users/select-project', req.nextUrl.origin))
  }

  // Selector page must stay accessible even without menu permissions.
  if (pathname === '/users/select-project') return NextResponse.next()

  const resource = matchResource(pathname)
  if (!resource) {
    const url = new URL('/auth/signin', req.nextUrl.origin)
    url.searchParams.set('error', 'access_denied')
    return NextResponse.redirect(url)
  }

  const perms: string[] = Array.isArray(token.permissions) ? token.permissions : []
  const role = String(token.role || '').trim().toLowerCase()

  // Direct access: allow user/viewer roles into daily report screen
  // even when project permissions are not yet assigned.
  if (resource === 'daily-report' && (role === 'user' || role === 'viewer')) {
    return NextResponse.next()
  }
  
  // Check if user has permission: wildcard, explicit resource, or legacy alias.
  const allowed = hasPermission(perms, resource)

  if (!allowed) {
    // Find a fallback route the user *does* have access to.
    let fallback = '/users/dashboard'
    for (const [p, r] of Object.entries(RESOURCE_MAP)) {
      if (hasPermission(perms, r)) {
        fallback = p
        break
      }
    }

    // If fallback is the same as the requested path or user has no perms,
    // redirect to signin. Otherwise redirect to the fallback page.
    if (!fallback || fallback === pathname) {
      const url = new URL('/auth/signin', req.nextUrl.origin)
      url.searchParams.set('error', 'access_denied')
      return NextResponse.redirect(url)
    }

    return NextResponse.redirect(new URL(fallback, req.nextUrl.origin))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/users/:path*',
    '/dev/:path*'
  ]
}
