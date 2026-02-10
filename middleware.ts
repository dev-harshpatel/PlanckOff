import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/login'];
const publicPrefixes = ['/api/', '/_next/', '/favicon', '/logo', '/assembly-data/', '/material-data/'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the route is public
  const isPublicRoute = publicRoutes.includes(pathname);
  const isPublicPrefix = publicPrefixes.some(prefix => pathname.startsWith(prefix));

  if (isPublicRoute || isPublicPrefix) {
    // If authenticated user tries to access login, redirect to dashboard
    if (pathname === '/login') {
      const authCookie = request.cookies.get('auth_session');
      if (authCookie?.value) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get('auth_session');

  if (!authCookie?.value) {
    // Redirect to login if not authenticated
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (like images)
     * - JSON data files
     * - api routes (handled by publicPrefixes check)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|assembly-data|material-data|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)',
  ],
};
