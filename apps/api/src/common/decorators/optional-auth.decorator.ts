import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * Authenticates the request when a Bearer token is present, and lets it through
 * anonymously when it is not.
 *
 * This is the cart's shape: the same endpoint serves a guest (identified by the
 * `bz_cart` cookie) and a signed-in shopper (identified by `user.id`). @Public()
 * would be wrong here - it skips the strategy entirely, so `request.user` would
 * stay empty even for a shopper holding a valid token, and their server-side
 * cart would silently become a guest cart.
 *
 * An *invalid* or expired token is still rejected. Failing open there would let
 * a stale token quietly downgrade a shopper to a guest mid-session, which reads
 * to them as "my cart emptied itself".
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
