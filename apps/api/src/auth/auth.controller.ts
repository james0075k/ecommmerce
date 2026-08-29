import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  phoneLoginSchema,
  RATE_LIMIT_AUTH,
  registerSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from '@bazaar/shared';
import type {
  ForgotPasswordInput,
  LoginInput,
  PhoneLoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyOtpInput,
} from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthService } from './auth.service';
import type { AuthResult, PublicUserView } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import type { GoogleProfile } from './strategies/google.strategy';
import { REFRESH_COOKIE } from './token.service';

/** D3: auth endpoints are limited to 20 requests/minute, tighter than the global 100. */
const AUTH_THROTTLE = {
  default: { limit: RATE_LIMIT_AUTH.limit, ttl: RATE_LIMIT_AUTH.ttl },
};

@Controller('auth')
@Throttle(AUTH_THROTTLE)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /* --- Registration ------------------------------------------------------ */

  @Public()
  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    return this.auth.register(dto, response, contextOf(request));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body('token') token: string): Promise<PublicUserView> {
    return this.auth.verifyEmail(token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body('email') email: string): Promise<{ message: string }> {
    await this.auth.resendVerification(email ?? '');
    return { message: 'If that account needs verifying, a new link is on its way.' };
  }

  /* --- Password login ---------------------------------------------------- */

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    return this.auth.login(dto, response, contextOf(request));
  }

  /* --- Phone OTP login --------------------------------------------------- */

  @Public()
  @Post('login/phone')
  @HttpCode(HttpStatus.OK)
  requestOtp(
    @Body(new ZodValidationPipe(phoneLoginSchema)) dto: PhoneLoginInput,
  ): Promise<{ message: string; expiresInSeconds: number }> {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    return this.auth.verifyOtp(dto, response, contextOf(request));
  }

  /* --- Session ----------------------------------------------------------- */

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    return this.auth.refresh(readRefreshCookie(request), response);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    return this.auth.logout(readRefreshCookie(request), response);
  }

  /* --- Password reset ---------------------------------------------------- */

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordInput,
  ): Promise<{ message: string }> {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordInput,
  ): Promise<{ message: string }> {
    return this.auth.resetPassword(dto);
  }

  /* --- Google OAuth ------------------------------------------------------ */

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleRedirect(): void {
    // The guard issues the redirect; this body never runs. It is only reachable
    // when Google is unconfigured, in which case the guard is not registered.
    this.assertGoogleConfigured();
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() request: Request & { user?: GoogleProfile },
    @Res() response: Response,
  ): Promise<void> {
    this.assertGoogleConfigured();

    const profile = request.user;
    const siteUrl = this.config.get<string>('NEXTAUTH_URL') ?? 'http://localhost:3000';

    if (!profile) {
      response.redirect(`${siteUrl}/login?error=google_failed`);
      return;
    }

    const result = await this.auth.loginWithGoogle(profile, response, contextOf(request));

    // The refresh cookie is already set. The access token rides back in the URL
    // fragment, which browsers never send to the server and which the callback
    // page strips immediately after reading it.
    response.redirect(`${siteUrl}/auth/callback#access_token=${result.accessToken}`);
  }

  /* --- Current user ------------------------------------------------------ */

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUserView> {
    return this.auth.me(user.id);
  }

  private assertGoogleConfigured(): void {
    if (!this.config.get<string>('GOOGLE_CLIENT_ID')) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    }
  }
}

function readRefreshCookie(request: Request): string | undefined {
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}

function contextOf(request: Request): { ip?: string; userAgent?: string } {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
