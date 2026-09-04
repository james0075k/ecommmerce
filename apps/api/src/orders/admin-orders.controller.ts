import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  adminOrderQuerySchema,
  adminRefundSchema,
  bulkOrderStatusSchema,
  orderShippingSchema,
  updateOrderStatusSchema,
  UserRole,
} from '@bazaar/shared';
import type {
  AdminOrderListItem,
  AdminOrderQueryInput,
  AdminRefundInput,
  BulkOrderStatusInput,
  OrderDetail,
  OrderShippingInput,
  Paginated,
  UpdateOrderStatusInput,
} from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AdminOrdersService, type BulkStatusResult } from './admin-orders.service';
import { OrdersService } from './orders.service';

/**
 * The byte-order mark Excel needs to read a CSV as UTF-8 rather than the
 * local codepage - without it a Nepali customer name arrives as mojibake.
 * Written as an escape rather than a literal so it cannot be lost by an editor
 * that trims invisible characters.
 */
const BOM = '﻿';

/** Every route requires ADMIN; SUPER_ADMIN satisfies it via RolesGuard. */
@Controller('admin/orders')
@Roles(UserRole.ADMIN)
export class AdminOrdersController {
  constructor(
    private readonly admin: AdminOrdersService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminOrderQuerySchema)) query: AdminOrderQueryInput,
  ): Promise<Paginated<AdminOrderListItem>> {
    return this.admin.list(query);
  }

  /**
   * The same filtered set as `list`, as a CSV download.
   *
   * `attachment` rather than `inline` here, the opposite of the invoice: nobody
   * reads a CSV in a browser tab, and the operator's next step is always to open
   * it in a spreadsheet.
   */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Query(new ZodValidationPipe(adminOrderQuerySchema)) query: AdminOrderQueryInput,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.admin.exportCsv(query);
    const stamp = new Date().toISOString().slice(0, 10);

    response.set({
      'Content-Disposition': `attachment; filename="bazaar-orders-${stamp}.csv"`,
      'Cache-Control': 'private, no-store',
    });

    response.end(BOM + csv);
  }

  /** Staff see any order, so this reads through with the staff flag set. */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrderDetail> {
    return this.orders.findDetail(id, undefined, true);
  }

  @Patch('bulk-status')
  @HttpCode(HttpStatus.OK)
  bulkStatus(
    @Body(new ZodValidationPipe(bulkOrderStatusSchema)) dto: BulkOrderStatusInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<BulkStatusResult> {
    return this.admin.bulkStatus(admin.id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOrderStatusSchema)) dto: UpdateOrderStatusInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<OrderDetail> {
    return this.admin.updateStatus(id, admin.id, dto);
  }

  @Post(':id/shipping')
  @HttpCode(HttpStatus.OK)
  addShipping(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(orderShippingSchema)) dto: OrderShippingInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<OrderDetail> {
    return this.admin.addShipping(id, admin.id, dto);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(adminRefundSchema)) dto: AdminRefundInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<OrderDetail> {
    return this.admin.refund(id, admin.id, dto);
  }
}
