import { Global, Module } from '@nestjs/common';

import { QueueService } from './queue.service';

/**
 * Global for the same reason NotificationsModule is: any module with work to
 * defer should reach the queue without a wiring change, and there is exactly
 * one of it.
 */
@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
