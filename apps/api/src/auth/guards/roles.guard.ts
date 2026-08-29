import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@bazaar/shared';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Enforces @Roles('ADMIN'). Runs after JwtAuthGuard, so request.user is set.
 * SUPER_ADMIN satisfies any ADMIN requirement.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('You need to be logged in to do that.');
    }

    const allowed = required.includes(user.role) || user.role === 'SUPER_ADMIN';

    if (!allowed) {
      throw new ForbiddenException('You do not have permission to do that.');
    }

    return true;
  }
}
