import { randomUUID } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { BROWSE_SESSION_COOKIE, BROWSE_SESSION_TTL_DAYS } from '@bazaar/shared';

import type { BrowseKey } from './recommendations.service';

const TTL_MS = BROWSE_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Who the browsing history belongs to.
 *
 * Deliberately the same shape and the same rules as the cart's guest session
 * (`cart-session.ts`): a signed-in shopper is keyed by user id, a guest by an
 * HttpOnly cookie, and the cookie is only minted by a request that is about to
 * write - so a crawler reading the homepage does not get one.
 *
 * A separate cookie from the cart's, because the two have different lifetimes
 * and very different consequences: losing a browse history costs a slightly
 * worse recommendation, losing a cart costs a sale.
 */
export function resolveBrowseKey(
  userId: string | undefined,
  request: Request,
  response: Response,
  mutating: boolean,
): BrowseKey | null {
  if (userId) return { kind: 'user', userId };

  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  const existing = cookies?.[BROWSE_SESSION_COOKIE];

  // A hand-edited cookie must not become part of a Redis key, so only
  // well-formed ids are honoured.
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
    return { kind: 'session', sessionId: existing };
  }

  if (!mutating) return null;

  const sessionId = randomUUID();
  response.cookie(BROWSE_SESSION_COOKIE, sessionId, cookieOptions());
  return { kind: 'session', sessionId };
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS,
  };
}
