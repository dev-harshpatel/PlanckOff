/**
 * Next.js Middleware
 *
 * Protects routes at the edge level before they reach the page.
 * This provides server-side route protection.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_CONFIG } from '@/constants/auth';

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/set-password',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/team/set-password',
];

// Paths that start with these prefixes are public
const PUBLIC_PREFIXES = [
  '/api/team/invite/', // Token validation endpoints
  '/api/cron/',
  '/_next',
  '/images',
  '/favicon',
  '/assembly-data/',
  '/material-data/',
];

// Static file extensions to ignore
const STATIC_EXTENSIONS = ['.ico', '.png', '.jpg', '.jpeg', '.svg', '.css', '.js', '.json'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files
  if (STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
    return NextResponse.next();
  }

  // Skip public prefixes
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Skip public paths
  if (PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'))) {
    return NextResponse.next();
  }

  // Check for auth session cookie
  const sessionToken = request.cookies.get(AUTH_CONFIG.SESSION_COOKIE_NAME)?.value;

  // No session - redirect to login for pages, return 401 for API
  if (!sessionToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Redirect to login with return URL
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Session exists - let the request proceed
  // Role-based checks are done in API routes and page components
  // because middleware can't easily decode/verify the session
  return NextResponse.next();
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|images/).*)',
  ],
};
