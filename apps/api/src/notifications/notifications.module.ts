import { Global, Module } from '@nestjs/common';

import { MailService } from './mail.service';
import { SmsService } from './sms.service';

/**
 * Global so auth, orders and admin can all reach the transports without
 * re-importing. The in-app notification centre (C1.5) arrives in Phase 6.
 */
@Global()
@Module({
  providers: [MailService, SmsService],
  exports: [MailService, SmsService],
})
export class NotificationsModule {}
