import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Route protection at the edge.
 *
 * The refresh token is an HttpOnly cookie set by the API. Because cookies
 * ignore port, localhost:4000 and localhost:3000 share it in development; in
 * production the API sets Domain=.bazaar.com so both hosts see it.
 *
 * The signature is verified here rather than merely checking the cookie exists -
 * an unverified cookie is trivially forged, and /admin gates on the `role` claim
 * inside it. The API re-checks the role on every request regardless; this only
 * decides what to render.
 */

const REFRESH_COOKIE = 'bz_refresh';

/** Signed in required. */
const PROTECTED_PREFIXES = ['/account', '/orders', '/wishlist'];
/** Signed in AND an admin role required. */
const ADMIN_PREFIXES = ['/admin'];
/** Pointless to visit while already signed in. */
const GUEST_ONLY = ['/login', '/register', '/forgot-password'];

interface RefreshClaims {
  sub?: string;
  role?: string;
  type?: string;
}

async function readSession(request: NextRequest): Promise<RefreshClaims | null> {
  const token = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) return null;

  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    // Fail closed: without the secret nothing can be trusted, so treat every
    // visitor as signed out rather than waving them through.
    console.error('JWT_REFRESH_SECRET is not set - middleware cannot verify sessions.');
    return null;
  }

  try {
    const { payload } = await jwtVerify<RefreshClaims>(
      token,
      new TextEncoder().encode(secret),
    );
    return payload.type === 'refresh' ? payload : null;
  } catch {
    // Expired or tampered with.
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readSession(request);

  const needsAdmin = ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const needsAuth =
    needsAdmin || PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (needsAuth && !session) {
    const login = new URL('/login', request.url);
    // Send them back where they were headed once they are in.
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (needsAdmin && session?.role !== 'ADMIN' && session?.role !== 'SUPER_ADMIN') {
    // Deliberately the same redirect a signed-out visitor gets: confirming that
    // /admin exists to a signed-in customer is information they do not need.
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (session && GUEST_ONLY.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.redirect(new URL('/account', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/account/:path*',
    '/orders/:path*',
    '/wishlist/:path*',
    '/admin/:path*',
    '/login',
    '/register',
    '/forgot-password',
  ],
};
