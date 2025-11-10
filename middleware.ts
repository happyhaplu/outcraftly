import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signToken, verifyToken } from '@/lib/auth/session';

const protectedRoutes = ['/dashboard'];
const adminRoutePrefix = '/admin';
const adminLoginRoute = '/admin/login';
const userLoginRoute = '/sign-in';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session');
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAdminRoute = pathname.startsWith(adminRoutePrefix);
  const isAdminLoginRoute = pathname === adminLoginRoute;
  const requiresAuth = isProtectedRoute || (isAdminRoute && !isAdminLoginRoute);

  let parsedSession: Awaited<ReturnType<typeof verifyToken>> | null = null;
  let shouldDeleteSession = false;

  if (sessionCookie) {
    try {
      parsedSession = await verifyToken(sessionCookie.value);
    } catch (error) {
      console.error('Error verifying session:', error);
      shouldDeleteSession = true;
      parsedSession = null;
    }
  }

  const redirectPath = isAdminRoute ? adminLoginRoute : userLoginRoute;

  if (requiresAuth && (!sessionCookie || !parsedSession)) {
    const response = NextResponse.redirect(new URL(redirectPath, request.url));
    response.cookies.delete('session');
    return response;
  }

  if (
    isAdminRoute &&
    !isAdminLoginRoute &&
    parsedSession &&
    parsedSession.user.role !== 'admin'
  ) {
    const response = NextResponse.redirect(new URL(adminLoginRoute, request.url));
    response.cookies.delete('session');
    return response;
  }

  const res = NextResponse.next();

  if (parsedSession && request.method === 'GET') {
    try {
      const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
      res.cookies.set({
        name: 'session',
        value: await signToken({
          ...parsedSession,
          expires: expiresInOneDay.toISOString()
        }),
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        expires: expiresInOneDay
      });
    } catch (error) {
      console.error('Error refreshing session:', error);
      res.cookies.delete('session');
      return res;
    }
  }

  if (shouldDeleteSession && !parsedSession) {
    res.cookies.delete('session');
  }

  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs'
};
