import { type ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

/**
 * Drives the Google redirect and callback handshake.
 *
 * The strategy is only registered when credentials are present (see
 * AuthModule), so without them Passport would raise "Unknown authentication
 * strategy" as an opaque 500. Check first and say what is actually wrong.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (!this.config.get<string>('GOOGLE_CLIENT_ID')) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the API.',
      );
    }

    return super.canActivate(context);
  }
}
