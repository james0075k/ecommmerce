import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  activityLogQuerySchema,
  adminCustomerQuerySchema,
  adminNotificationQuerySchema,
  adminSearchSchema,
  customerMessageSchema,
  customerStatusSchema,
  markNotificationsSchema,
  settingsPatchSchema,
  UserRole,
} from '@bazaar/shared';
import type {
  ActivityLogQueryInput,
  AdminActivityEntry,
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminCustomerQueryInput,
  AdminNotification,
  AdminNotificationQueryInput,
  AdminSearchInput,
  AdminSearchResults,
  CustomerMessageInput,
  CustomerStatusInput,
  MarkNotificationsInput,
  Paginated,
  PublicStoreSettings,
  SettingsPatchInput,
  StoreSettings,
} from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ActivityLogService } from './activity-log.service';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminSearchService } from './admin-search.service';
import { CustomersService } from './customers.service';
import { SettingsService } from './settings.service';

/**
 * Customers, as the panel sees them.
 *
 * Read routes and two writes: a status change and a message. Everything else a
 * customer owns - their addresses, their orders - is edited from the record it
 * belongs to, not from here, so there is one place each thing can change.
 */
@Controller('admin/customers')
@Roles(UserRole.ADMIN)
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminCustomerQuerySchema)) query: AdminCustomerQueryInput,
  ): Promise<Paginated<AdminCustomerListItem>> {
    return this.customers.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AdminCustomerDetail> {
    return this.customers.findOne(id);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(customerStatusSchema)) dto: CustomerStatusInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<AdminCustomerDetail> {
    return this.customers.setStatus(id, admin.id, dto);
  }

  @Post(':id/message')
  @HttpCode(HttpStatus.OK)
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(customerMessageSchema)) dto: CustomerMessageInput,
  ): Promise<{ delivered: boolean; channel: string }> {
    return this.customers.sendMessage(id, dto);
  }
}

/**
 * Store configuration.
 *
 * Writing requires SUPER_ADMIN. Tax rate, currency and enabled gateways decide
 * what every shopper is charged - that is a different class of change from
 * moving an order to SHIPPED, and it should need a different level of trust.
 */
@Controller('admin/settings')
@Roles(UserRole.ADMIN)
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll(): Promise<StoreSettings> {
    return this.settings.getAll();
  }

  @Patch()
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Body(new ZodValidationPipe(settingsPatchSchema)) patch: SettingsPatchInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<StoreSettings> {
    return this.settings.update(patch, admin.id);
  }
}

/** The public slice, read by the storefront on every page. */
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Public()
  getPublic(): Promise<PublicStoreSettings> {
    return this.settings.getPublic();
  }
}

/**
 * The audit trail, the bell, and the top bar's search box.
 *
 * Grouped in one controller because each is a single endpoint on the shell
 * rather than a resource of its own, and three files with one route apiece
 * would be filing for its own sake.
 */
@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminShellController {
  constructor(
    private readonly activity: ActivityLogService,
    private readonly notifications: AdminNotificationsService,
    private readonly search: AdminSearchService,
  ) {}

  @Get('activity')
  activityLog(
    @Query(new ZodValidationPipe(activityLogQuerySchema)) query: ActivityLogQueryInput,
  ): Promise<Paginated<AdminActivityEntry>> {
    return this.activity.list(query);
  }

  @Get('notifications')
  listNotifications(
    @Query(new ZodValidationPipe(adminNotificationQuerySchema)) query: AdminNotificationQueryInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<{ items: AdminNotification[]; unread: number }> {
    return this.notifications.list(admin.id, query);
  }

  @Patch('notifications/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @Body(new ZodValidationPipe(markNotificationsSchema)) dto: MarkNotificationsInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<{ unread: number }> {
    return this.notifications.markRead(admin.id, dto);
  }

  @Get('search')
  globalSearch(
    @Query(new ZodValidationPipe(adminSearchSchema)) query: AdminSearchInput,
  ): Promise<AdminSearchResults> {
    return this.search.search(query);
  }
}
