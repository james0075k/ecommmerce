import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Response } from 'express';
import type { Prisma, User } from '@prisma/client';
import { AccountStatus, OAuthProvider, UserRole } from '@bazaar/shared';
import type {
  ForgotPasswordInput,
  LoginInput,
  PhoneLoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyOtpInput,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { MailService } from '../notifications/mail.service';
import { SmsService } from '../notifications/sms.service';
import { generateOpaqueToken, hashToken, TokenService } from './token.service';

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: PublicUserView;
}

export interface PublicUserView {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: string;
  createdAt: Date;
}

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

/** D4: 5 failed logins in 15 minutes locks the account out. */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;
/** Stops an attacker cycling codes by re-requesting an OTP. */
const OTP_RESEND_COOLDOWN_SECONDS = 60;

const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Argon2id parameters. Memory-hard by design (D1) - the cost is deliberate.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB - OWASP minimum
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  /* ---------------------------------------------------------------------- */
  /*  Registration                                                          */
  /* ---------------------------------------------------------------------- */

  async register(dto: RegisterInput, response: Response, ctx: RequestContext): Promise<AuthResult> {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(dto.phone ? [{ phone: dto.phone }] : [])] },
      select: { id: true, email: true },
    });

    if (existing) {
      throw new ConflictException(
        existing.email === email
          ? 'An account with this email already exists.'
          : 'An account with this phone number already exists.',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        phone: dto.phone ?? null,
        passwordHash: await argon2.hash(dto.password, ARGON2_OPTIONS),
        fullName: dto.fullName,
        role: UserRole.CUSTOMER,
      },
    });

    await this.sendVerificationEmail(user);

    const issued = await this.tokens.issueTokens(user, ctx);
    this.tokens.setRefreshCookie(response, issued.refreshToken);

    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn, user: toPublicUser(user) };
  }

  async sendVerificationEmail(user: User): Promise<void> {
    const token = generateOpaqueToken();

    await this.redis.set(
      emailVerifyKey(hashToken(token)),
      user.id,
      EMAIL_VERIFY_TTL_SECONDS,
    );

    await this.mail.sendVerificationEmail(user.email, user.fullName, token);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always succeed: telling a caller whether an address is registered is an
    // account-enumeration leak.
    if (user && !user.emailVerified) {
      await this.sendVerificationEmail(user);
    }
  }

  async verifyEmail(token: string): Promise<PublicUserView> {
    const key = emailVerifyKey(hashToken(token));
    const userId = await this.redis.get(key);

    if (!userId) {
      throw new BadRequestException('This verification link is invalid or has expired.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    await this.redis.del(key);
    await this.mail.sendWelcomeEmail(user.email, user.fullName);

    return toPublicUser(user);
  }

  /* ---------------------------------------------------------------------- */
  /*  Password login                                                        */
  /* ---------------------------------------------------------------------- */

  async login(dto: LoginInput, response: Response, ctx: RequestContext): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const attemptKey = loginAttemptKey(email);

    const attempts = Number((await this.redis.get(attemptKey)) ?? 0);
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      const retryIn = Math.ceil((await this.redis.ttl(attemptKey)) / 60);
      throw new ForbiddenException(
        `Too many failed attempts. Try again in ${Math.max(retryIn, 1)} minutes.`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Hash even when the user is absent so response timing does not reveal
    // whether the address exists.
    const passwordValid = user?.passwordHash
      ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
      : await argon2.hash(dto.password, ARGON2_OPTIONS).then(() => false);

    if (!user || !passwordValid) {
      await this.redis.increment(attemptKey, LOGIN_WINDOW_SECONDS);
      throw new UnauthorizedException('That email or password is incorrect.');
    }

    this.assertAccountUsable(user);

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Confirm your email address before logging in. Check your inbox for the link.',
      );
    }

    await this.redis.del(attemptKey);

    return this.completeLogin(user, response, ctx);
  }

  /* ---------------------------------------------------------------------- */
  /*  Phone OTP login                                                       */
  /* ---------------------------------------------------------------------- */

  async requestOtp(dto: PhoneLoginInput): Promise<{ message: string; expiresInSeconds: number }> {
    const cooldownKey = otpCooldownKey(dto.phone);

    if (await this.redis.exists(cooldownKey)) {
      const wait = await this.redis.ttl(cooldownKey);
      throw new ForbiddenException(`Wait ${wait} seconds before requesting another code.`);
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');

    await this.redis.set(otpKey(dto.phone), await argon2.hash(otp, ARGON2_OPTIONS), OTP_TTL_SECONDS);
    await this.redis.del(otpAttemptKey(dto.phone));
    await this.redis.set(cooldownKey, '1', OTP_RESEND_COOLDOWN_SECONDS);

    await this.sms.sendOtp(dto.phone, otp, OTP_TTL_SECONDS / 60);

    if (!this.config.get<string>('SPARROW_SMS_TOKEN')) {
      this.logger.warn(`[dev] OTP for ${dto.phone} is ${otp}`);
    }

    return { message: 'OTP sent', expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyOtp(dto: VerifyOtpInput, response: Response, ctx: RequestContext): Promise<AuthResult> {
    const key = otpKey(dto.phone);
    const stored = await this.redis.get(key);

    if (!stored) {
      throw new BadRequestException('That code has expired. Request a new one.');
    }

    const attempts = await this.redis.increment(otpAttemptKey(dto.phone), OTP_TTL_SECONDS);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new ForbiddenException('Too many incorrect codes. Request a new one.');
    }

    if (!(await argon2.verify(stored, dto.otp).catch(() => false))) {
      throw new BadRequestException('That code is not correct.');
    }

    await this.redis.del(key);
    await this.redis.del(otpAttemptKey(dto.phone));

    // Phone login doubles as sign-up: a verified number is proof enough to
    // create the account (G2 - Nepal focus).
    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });

    user ??= await this.prisma.user.create({
      data: {
        // Placeholder address; the user sets a real one on their profile. The
        // domain is reserved so it can never collide with a deliverable inbox.
        email: `${dto.phone.replace(/\D/g, '')}@phone.bazaar.invalid`,
        phone: dto.phone,
        fullName: 'Bazaar customer',
        phoneVerified: true,
        role: UserRole.CUSTOMER,
      },
    });

    if (!user.phoneVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    }

    this.assertAccountUsable(user);

    return this.completeLogin(user, response, ctx);
  }

  /* ---------------------------------------------------------------------- */
  /*  Google OAuth                                                          */
  /* ---------------------------------------------------------------------- */

  async loginWithGoogle(
    profile: { providerId: string; email: string; fullName: string; avatarUrl?: string },
    response: Response,
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const email = profile.email.toLowerCase();

    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerId: { provider: OAuthProvider.GOOGLE, providerId: profile.providerId },
      },
      include: { user: true },
    });

    let user = linked?.user ?? (await this.prisma.user.findUnique({ where: { email } }));

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: profile.fullName,
          avatarUrl: profile.avatarUrl ?? null,
          // Google has already verified the address.
          emailVerified: true,
          role: UserRole.CUSTOMER,
        },
      });
    } else if (!user.emailVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    if (!linked) {
      await this.prisma.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: OAuthProvider.GOOGLE,
          providerId: profile.providerId,
          email,
        },
      });
    }

    this.assertAccountUsable(user);

    return this.completeLogin(user, response, ctx);
  }

  /* ---------------------------------------------------------------------- */
  /*  Session lifecycle                                                     */
  /* ---------------------------------------------------------------------- */

  async refresh(refreshToken: string | undefined, response: Response): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('You are not logged in.');
    }

    const payload = await this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) {
      throw new UnauthorizedException('Your account no longer exists.');
    }

    this.assertAccountUsable(user);

    const issued = await this.tokens.rotateRefreshToken(user, payload.sid);
    this.tokens.setRefreshCookie(response, issued.refreshToken);

    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn, user: toPublicUser(user) };
  }

  async logout(refreshToken: string | undefined, response: Response): Promise<{ message: string }> {
    if (refreshToken) {
      // Best effort: an already-invalid token still clears the cookie.
      await this.tokens
        .verifyRefreshToken(refreshToken)
        .then((payload) => this.tokens.revokeSession(payload.sid))
        .catch(() => undefined);
    }

    this.tokens.clearRefreshCookie(response);
    return { message: 'Logged out' };
  }

  /* ---------------------------------------------------------------------- */
  /*  Password reset                                                        */
  /* ---------------------------------------------------------------------- */

  async forgotPassword(dto: ForgotPasswordInput): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    if (user) {
      const token = generateOpaqueToken();

      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });

      await this.mail.sendPasswordResetEmail(user.email, user.fullName, token);
    }

    // Same response either way - do not reveal which addresses are registered.
    return {
      message: 'If that email is registered, a reset link is on its way.',
    };
  }

  async resetPassword(dto: ResetPasswordInput): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await argon2.hash(dto.newPassword, ARGON2_OPTIONS) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding reset links are now void.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    // A password change logs every device out - that is the point of the reset.
    await this.tokens.revokeAllSessions(record.userId);

    return { message: 'Your password has been changed. Log in with your new password.' };
  }

  /* ---------------------------------------------------------------------- */
  /*  Current user                                                          */
  /* ---------------------------------------------------------------------- */

  async me(userId: string): Promise<PublicUserView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found.');
    return toPublicUser(user);
  }

  /* ---------------------------------------------------------------------- */

  private async completeLogin(
    user: User,
    response: Response,
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const issued = await this.tokens.issueTokens(user, ctx);
    this.tokens.setRefreshCookie(response, issued.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn, user: toPublicUser(user) };
  }

  private assertAccountUsable(user: Pick<User, 'status'>): void {
    if (user.status === AccountStatus.SUSPENDED) {
      throw new ForbiddenException('This account is suspended. Contact support.');
    }
    if (user.status === AccountStatus.BANNED) {
      throw new ForbiddenException('This account has been closed.');
    }
  }
}

export function toPublicUser(user: User): PublicUserView {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    status: user.status,
    createdAt: user.createdAt,
  };
}

/** Never widen this - `passwordHash` must not reach a select that gets returned. */
export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  emailVerified: true,
  phoneVerified: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const loginAttemptKey = (email: string) => `auth:login-attempts:${email}`;
const otpKey = (phone: string) => `auth:otp:${phone}`;
const otpAttemptKey = (phone: string) => `auth:otp-attempts:${phone}`;
const otpCooldownKey = (phone: string) => `auth:otp-cooldown:${phone}`;
const emailVerifyKey = (tokenHash: string) => `auth:verify-email:${tokenHash}`;
