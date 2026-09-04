import { Global, Module } from '@nestjs/common';

import { RequestContextService } from './request-context';

/**
 * Global so any service can read the ambient request without its module having
 * to declare a dependency on HTTP plumbing. There is one store for the process
 * and it is keyed by the async execution path, so a single shared instance is
 * not just acceptable but required - a second instance would have its own
 * AsyncLocalStorage and see nothing.
 */
@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
