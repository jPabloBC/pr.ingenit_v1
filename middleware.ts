import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Note: middleware runs in edge runtime; we'll call an internal API route
// that performs a DB check using the admin client. Protect that route
// with `INTERNAL_SECRET` (set in env) — default for development is
// 'dev-internal-secret'.

const RESOURCE_MAP: Record<string, string> = {
  '/users/dashboard': 'dashboard',
  '/users/collaborators': 'collaborators',
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

function matchResource(pathname: string) {
  for (const pattern of Object.keys(RESOURCE_MAP)) {
    if (pathname === pattern || pathname.startsWith(pattern + '/')) return RESOURCE_MAP[pattern]
  }
  return null
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  
  console.log('[middleware] EXECUTING for', pathname)
  
  // Protect /dev routes: only users with role 'dev' can access
  if (pathname.startsWith('/dev')) {
    // Allow public dev entry pages (index and signin) to avoid redirect loops
    if (pathname === '/dev' || pathname === '/dev/signin') {
      return NextResponse.next()
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as any
    if (!token || token.role !== 'dev') {
      const url = new URL('/dev/signin', req.nextUrl.origin)
      url.searchParams.set('error', 'access_denied')
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // Only protect /users routes
  if (!pathname.startsWith('/users')) return NextResponse.next()

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as any
  if (!token) {
    const url = new URL('/auth/signin', req.nextUrl.origin)
    url.searchParams.set('error', 'access_denied')
    // Development debug header + log
    if (process.env.NODE_ENV === 'development') {
      console.debug('[middleware] no token, redirecting to signin for', pathname)
    }
    const r = NextResponse.redirect(url)
    if (process.env.NODE_ENV === 'development') {
      r.headers.set('x-debug-auth', JSON.stringify({ reason: 'no_token' }))
    }
    return r
  }

  // dev is global superuser
  if (token.role === 'dev') return NextResponse.next()

  // Require project selection for non-dev users before entering protected user modules.
  if (pathname !== '/users/select-project' && !token?.projectId) {
    const url = new URL('/users/select-project', req.nextUrl.origin)
    return NextResponse.redirect(url)
  }

  // Selector page must stay accessible even without menu permissions.
  if (pathname === '/users/select-project') return NextResponse.next()

  const resource = matchResource(pathname)
  if (!resource) {
    const url = new URL('/auth/signin', req.nextUrl.origin)
    url.searchParams.set('error', 'access_denied')
    if (process.env.NODE_ENV === 'development') {
      console.debug('[middleware] no mapped resource for', pathname)
    }
    const r = NextResponse.redirect(url)
    if (process.env.NODE_ENV === 'development') {
      r.headers.set('x-debug-auth', JSON.stringify({ reason: 'no_resource', pathname }))
    }
    return r
  }

  const perms: string[] = Array.isArray(token.permissions) ? token.permissions : []
  const role = String(token.role || '').trim().toLowerCase()

  if (resource === 'daily-report' && role === 'viewer') {
    return NextResponse.next()
  }
  
  // Check if user has permission: wildcard or explicit resource
  const allowed = perms.includes('*') || perms.includes(resource)

  if (process.env.NODE_ENV === 'development') {
    console.log('[middleware]', { pathname, resource, role: token.role, userId: token.id, permissions: perms, allowed })
  }

  if (!allowed) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[middleware] BLOCKED access to', pathname, 'for user', token.id)
    }
    const url = new URL('/auth/signin', req.nextUrl.origin)
    url.searchParams.set('error', 'access_denied')
    const r = NextResponse.redirect(url)
    if (process.env.NODE_ENV === 'development') {
      r.headers.set('x-debug-auth', JSON.stringify({ role: token.role, id: token.id, permissions: perms, resource, allowed: false }))
    }
    return r
  }

  const r = NextResponse.next()
  if (process.env.NODE_ENV === 'development') {
    r.headers.set('x-debug-auth', JSON.stringify({ role: token.role, id: token.id, permissions: perms, resource, allowed: true }))
  }
  return r
}

export const config = {
  matcher: [
    '/users/:path*',
    '/dev/:path*'
  ]
}
