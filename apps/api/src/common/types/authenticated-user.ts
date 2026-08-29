import type { UserRole } from '@bazaar/shared';

/** Shape attached to `request.user` by the JWT strategy. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

/** Claims carried by the 15-minute access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  type: 'access';
}

/** Claims carried by the 7-day refresh token (HttpOnly cookie). */
export interface RefreshTokenPayload {
  sub: string;
  role: UserRole;
  /** Session id - lets a single device be revoked without touching the others. */
  sid: string;
  type: 'refresh';
}
