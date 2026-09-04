import { randomUUID } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { CART_SESSION_COOKIE, CART_SESSION_TTL_DAYS } from '@bazaar/shared';

const TTL_MS = CART_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Who this cart belongs to. Exactly one of the two is set: a signed-in shopper
 * is never also a guest, which is what keeps the two unique constraints on
 * `cart_items` ([userId, variantId] and [sessionId, variantId]) from fighting.
 */
export type CartOwner =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; sessionId: string };

/** The Prisma `where` fragment that scopes a query to this owner. */
export function ownerWhere(owner: CartOwner): { userId: string } | { sessionId: string } {
  return owner.kind === 'user' ? { userId: owner.userId } : { sessionId: owner.sessionId };
}

export function readCartSession(request: Request): string | undefined {
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  const value = cookies?.[CART_SESSION_COOKIE];
  // A hand-edited cookie must not become a `LIKE`-able wildcard or blow the
  // varchar(120) column, so only well-formed ids are honoured.
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
}

/**
 * Resolves the owner of the current request, minting a guest session cookie the
 * first time an anonymous visitor touches the cart.
 *
 * `mutating` is the important argument. A plain `GET /cart` from a crawler
 * should not hand out a cookie - only an action that is about to *write* a row
 * needs an identity to write it against. Passing false keeps GET responses
 * cacheable-shaped and avoids seeding a session for every bot that hits the
 * page.
 */
export function resolveCartOwner(
  userId: string | undefined,
  request: Request,
  response: Response,
  mutating: boolean,
): CartOwner | null {
  if (userId) return { kind: 'user', userId };

  const existing = readCartSession(request);
  if (existing) return { kind: 'guest', sessionId: existing };

  if (!mutating) return null;

  const sessionId = randomUUID();
  response.cookie(CART_SESSION_COOKIE, sessionId, cookieOptions());
  // The cookie is only visible on the *next* request, so hand the id back now.
  return { kind: 'guest', sessionId };
}

export function clearCartSession(response: Response): void {
  response.clearCookie(CART_SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/**
 * HttpOnly for the same reason the refresh token is: nothing in the page needs
 * to read this, and a script that could would be able to graft its own cart
 * onto the visitor. `sameSite: 'lax'` matches the refresh cookie so both
 * survive the OAuth round-trip through Google.
 */
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS,
  };
}
