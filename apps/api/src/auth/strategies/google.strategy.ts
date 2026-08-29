import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  providerId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
}

/**
 * Google OAuth2. Only registered when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
 * are both set - see AuthModule. Without them the /auth/google routes return a
 * clear 503 rather than the app failing to boot.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const apiUrl = config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000';
    const prefix = config.get<string>('API_GLOBAL_PREFIX') ?? 'api/v1';

    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: `${apiUrl}/${prefix}/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(new Error('Google did not return an email address for this account.'), undefined);
      return;
    }

    const user: GoogleProfile = {
      providerId: profile.id,
      email,
      fullName: profile.displayName || email.split('@')[0] || 'Bazaar customer',
      avatarUrl: profile.photos?.[0]?.value,
    };

    done(null, user);
  }
}
