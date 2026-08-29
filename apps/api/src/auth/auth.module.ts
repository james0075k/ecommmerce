import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Google is optional. Registering the strategy without credentials makes
 * passport-google-oauth20 throw at construction and takes the whole app down,
 * so it is only provided when both values are present. The routes then return a
 * clear 503 (see GoogleAuthGuard) instead of the server failing to start.
 */
const googleStrategyProvider: Provider = {
  provide: GoogleStrategy,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const configured =
      !!config.get<string>('GOOGLE_CLIENT_ID') && !!config.get<string>('GOOGLE_CLIENT_SECRET');

    if (!configured) {
      new Logger('AuthModule').warn(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set - Google sign-in is disabled.',
      );
      return null;
    }

    return new GoogleStrategy(config);
  },
};

@Module({
  imports: [ConfigModule, PassportModule.register({ session: false })],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, googleStrategyProvider],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
