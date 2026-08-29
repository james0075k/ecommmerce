import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../common/types/authenticated-user';

export const REFRESH_COOKIE = 'bz_refresh';

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Issues, rotates and revokes the token pair.
 *
 * D1: the access token is short-lived (15 min) and returned in the response
 * body for the client to hold in memory - never localStorage. The refresh token
 * is 7 days and only ever travels in an HttpOnly, SameSite cookie.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Issues a fresh pair and records the session row so a device can be revoked
   * server-side (C1.1 `sessions`).
   */
  async issueTokens(user: User, context?: { ip?: string; userAgent?: string }): Promise<IssuedTokens> {
    const sessionId = randomUUID();

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      type: 'access',
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      role: user.role,
      sid: sessionId,
      type: 'refresh',
    };

    const accessToken = await this.jwt.signAsync(accessPayload, this.accessSignOptions());
    const refreshToken = await this.jwt.signAsync(refreshPayload, this.refreshSignOptions());

    // Only the hash is stored - a database leak cannot be replayed as a session.
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        deviceInfo: context?.userAgent?.slice(0, 255) ?? null,
        ipAddress: context?.ip?.slice(0, 45) ?? null,
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds() };
  }

  /** Verifies a refresh token against its signature, the denylist and its session row. */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Your session has expired. Log in again.');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Wrong token type.');
    }

    if (await this.redis.exists(denylistKey(payload.sid))) {
      throw new UnauthorizedException('This session was logged out.');
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Your session has expired. Log in again.');
    }

    if (session.tokenHash !== hashToken(token)) {
      // The stored hash has moved on, so this is a replay of a rotated token.
      // Revoke the whole session rather than just rejecting the request.
      await this.revokeSession(payload.sid);
      throw new UnauthorizedException('Your session has expired. Log in again.');
    }

    return payload;
  }

  /** Rotates the refresh token in place, keeping the same session row. */
  async rotateRefreshToken(user: User, sessionId: string): Promise<IssuedTokens> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      type: 'access',
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      role: user.role,
      sid: sessionId,
      type: 'refresh',
    };

    const accessToken = await this.jwt.signAsync(accessPayload, this.accessSignOptions());
    const refreshToken = await this.jwt.signAsync(refreshPayload, this.refreshSignOptions());

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds() };
  }

  /** Marks a session revoked in the database and denylists it until it would expire. */
  async revokeSession(sessionId: string): Promise<void> {
    await this.redis.set(denylistKey(sessionId), '1', this.refreshTtlSeconds());
    await this.prisma.session
      .update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  /** Used after a password reset - every device must log in again. */
  async revokeAllSessions(userId: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });

    await Promise.all(sessions.map((session) => this.revokeSession(session.id)));
  }

  setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      // Lax still sends the cookie on top-level navigation, which the Google
      // OAuth callback redirect relies on.
      sameSite: 'lax',
      secure: this.config.get<string>('NODE_ENV') === 'production',
      path: '/',
      maxAge: this.refreshTtlSeconds() * 1000,
    });
  }

  clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
  }

  /**
   * @nestjs/jwt v11 types `expiresIn` as ms's `StringValue` template literal
   * ("15m", "7d", ...). The env value is validated as a plain string, so the
   * narrowing happens here once rather than at every call site.
   */
  private accessSignOptions(): JwtSignOptions {
    return {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.accessTtl() as JwtSignOptions['expiresIn'],
    };
  }

  private refreshSignOptions(): JwtSignOptions {
    return {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.refreshTtl() as JwtSignOptions['expiresIn'],
    };
  }

  private accessTtl(): string {
    return this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
  }

  private refreshTtl(): string {
    return this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
  }

  accessTtlSeconds(): number {
    return parseDuration(this.accessTtl(), 900);
  }

  refreshTtlSeconds(): number {
    return parseDuration(this.refreshTtl(), 604_800);
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** URL-safe opaque token for email verification and password reset. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function denylistKey(sessionId: string): string {
  return `auth:denylist:${sessionId}`;
}

/** Converts "15m" / "7d" / "3600" into seconds. */
function parseDuration(value: string, fallback: number): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(value.trim());
  if (!match?.[1]) return fallback;

  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multiplier = { s: 1, m: 60, h: 3600, d: 86_400 }[unit] ?? 1;

  return amount * multiplier;
}
