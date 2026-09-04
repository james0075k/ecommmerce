import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_OPTIONAL_AUTH_KEY } from '../../common/decorators/optional-auth.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * Registered globally in AppModule, so every route requires a valid Bearer
 * token unless it is marked @Public(). Authentication is opt-out, not opt-in -
 * forgetting a decorator locks a route down rather than exposing it.
 *
 * @OptionalAuth() is the third mode, used by the cart: run the strategy, but
 * treat "no token at all" as an anonymous visitor instead of a 401.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;
    return super.canActivate(context);
  }

  /**
   * Passport calls this with whatever the strategy produced. The base class
   * throws on any falsy user; under @OptionalAuth() a *missing* token instead
   * resolves to `undefined`, leaving `request.user` empty.
   *
   * A token that was supplied but failed (expired, wrong signature, suspended
   * account) still throws - see the decorator for why.
   */
  override handleRequest<TUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isOptional && !err && !user && isMissingCredentials(info)) {
      return undefined as TUser;
    }

    return super.handleRequest(err, user, info, context, status) as TUser;
  }
}

/**
 * passport-jwt reports an absent header as `Error('No auth token')`. Anything
 * else - JsonWebTokenError, TokenExpiredError - means a token was presented and
 * rejected, which must stay a 401.
 */
function isMissingCredentials(info: unknown): boolean {
  return info instanceof Error && info.message === 'No auth token';
}
