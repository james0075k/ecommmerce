import { Global, Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityLogService } from './activity-log.service';
import { AdminGateway } from './admin.gateway';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminSearchService } from './admin-search.service';
import {
  AdminCustomersController,
  AdminSettingsController,
  AdminShellController,
  PublicSettingsController,
} from './admin.controller';
import { AdminContactsController, ContactController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { CustomersService } from './customers.service';
import { SettingsService } from './settings.service';

/**
 * The admin panel's own concerns: the audit trail, the bell, store settings,
 * customers and the contact queue.
 *
 * Global, because ActivityLogService and AdminNotificationsService are wanted
 * by feature modules that have nothing else to do with the panel - products
 * logging an edit, orders raising a "new order" notification - and importing
 * AdminModule into each of them would build an import graph where every feature
 * depends on the admin panel. This module deliberately imports no feature
 * module in return, so the dependency only ever points one way and there is no
 * cycle to break later.
 */
@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [
    AdminCustomersController,
    AdminSettingsController,
    AdminShellController,
    PublicSettingsController,
    AdminContactsController,
    ContactController,
  ],
  providers: [
    ActivityLogService,
    AdminGateway,
    AdminNotificationsService,
    AdminSearchService,
    ContactsService,
    CustomersService,
    SettingsService,
  ],
  exports: [
    ActivityLogService,
    AdminGateway,
    AdminNotificationsService,
    ContactsService,
    SettingsService,
  ],
})
export class AdminModule {}
