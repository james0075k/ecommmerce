import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the global JwtAuthGuard.
 * Authentication is default-on: forgetting this decorator locks a route down,
 * which is the safe direction to fail.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
