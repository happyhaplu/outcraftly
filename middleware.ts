import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signToken, verifyToken } from '@/lib/auth/session';
import { getLogger, withLogContext } from '@/lib/logger';

const protectedRoutes = ['/dashboard'];
const adminRoutePrefix = '/admin';
const adminLoginRoute = '/admin/login';
const userLoginRoute = '/sign-in';

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  // Disable HTTPS enforcement - configure via reverse proxy (Nginx) instead
  // const enforceHttps = process.env.NODE_ENV === 'production';
  // if (enforceHttps && request.headers.get('x-forwarded-proto') === 'http') {
  //   const httpsUrl = new URL(request.url);
  //   httpsUrl.protocol = 'https:';
  //   return NextResponse.redirect(httpsUrl);
  // }

  return withLogContext({ requestId }, async () => {
    const logger = getLogger({ component: 'middleware' });
    const { pathname } = request.nextUrl;
    const sessionCookie = request.cookies.get('session');
    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
    const isAdminRoute = pathname.startsWith(adminRoutePrefix);
    const isAdminLoginRoute = pathname === adminLoginRoute;
    const requiresAuth = isProtectedRoute || (isAdminRoute && !isAdminLoginRoute);

    let parsedSession: Awaited<ReturnType<typeof verifyToken>> | null = null;
    let shouldDeleteSession = false;
    let scopedLogger = logger;

    if (sessionCookie) {
      try {
        parsedSession = await verifyToken(sessionCookie.value);
        if (parsedSession?.user?.id) {
          scopedLogger = logger.child({ userId: String(parsedSession.user.id) });
        }
      } catch (error) {
        scopedLogger.error({ err: error, event: 'session.verify.failed' }, 'Error verifying session token');
        shouldDeleteSession = true;
        parsedSession = null;
      }
    }

    const redirectPath = isAdminRoute ? adminLoginRoute : userLoginRoute;

    if (requiresAuth && (!sessionCookie || !parsedSession)) {
      const response = NextResponse.redirect(new URL(redirectPath, request.url));
      response.cookies.delete('session');
      attachSecureHeaders(response);
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
      attachSecureHeaders(response);
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
        scopedLogger.error({ err: error, event: 'session.refresh.failed' }, 'Error refreshing session token');
        res.cookies.delete('session');
      }
    }

    if (shouldDeleteSession && !parsedSession) {
      res.cookies.delete('session');
    }

    attachSecureHeaders(res);
    res.headers.set('x-request-id', requestId);
    return res;
  });
}

function attachSecureHeaders(response: NextResponse) {
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs'
};
