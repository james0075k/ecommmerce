import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccountStatus } from '@bazaar/shared';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../../common/types/authenticated-user';

/**
 * Validates the Bearer access token and resolves the current user.
 *
 * The database is read on every request rather than trusting the token's claims
 * alone, so suspending or banning an account takes effect immediately instead of
 * waiting out the 15-minute token lifetime.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Wrong token type.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, emailVerified: true, status: true },
    });

    if (!user) {
      throw new UnauthorizedException('Your account no longer exists.');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('This account is not active.');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };
  }
}
