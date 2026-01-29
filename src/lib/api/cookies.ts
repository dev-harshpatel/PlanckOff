/**
 * Cookie Utilities
 * Centralized cookie management for authentication
 */

import { NextResponse } from 'next/server';
import { AUTH_CONFIG, COOKIE_CONFIG } from '@/constants/auth';

/**
 * Set the auth session cookie on a response
 */
export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(AUTH_CONFIG.SESSION_COOKIE_NAME, token, {
    ...COOKIE_CONFIG,
    maxAge: AUTH_CONFIG.SESSION_DURATION_DAYS * 24 * 60 * 60, // Convert days to seconds
  });
}

/**
 * Clear the auth session cookie on a response
 */
export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(AUTH_CONFIG.SESSION_COOKIE_NAME, '', {
    ...COOKIE_CONFIG,
    maxAge: 0, // Expire immediately
  });
}

/**
 * Get the session token from request cookies
 */
export function getSessionToken(cookies: { get: (name: string) => { value: string } | undefined }): string | null {
  return cookies.get(AUTH_CONFIG.SESSION_COOKIE_NAME)?.value || null;
}
