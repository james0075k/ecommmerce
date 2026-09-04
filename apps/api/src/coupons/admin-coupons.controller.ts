import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { adminCouponQuerySchema, couponInputSchema, UserRole } from '@bazaar/shared';
import type {
  AdminCouponDetail,
  AdminCouponListItem,
  AdminCouponQueryInput,
  CouponInput,
  Paginated,
} from '@bazaar/shared';

import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminCouponsService } from './admin-coupons.service';

@Controller('admin/coupons')
@Roles(UserRole.ADMIN)
export class AdminCouponsController {
  constructor(private readonly coupons: AdminCouponsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminCouponQuerySchema)) query: AdminCouponQueryInput,
  ): Promise<Paginated<AdminCouponListItem>> {
    return this.coupons.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AdminCouponDetail> {
    return this.coupons.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(couponInputSchema)) dto: CouponInput,
  ): Promise<AdminCouponDetail> {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(couponInputSchema)) dto: CouponInput,
  ): Promise<AdminCouponDetail> {
    return this.coupons.update(id, dto);
  }

  /**
   * Deletes, or disables when the coupon has been redeemed. The response says
   * which, so the panel can be honest about what the button did.
   */
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ deleted: boolean; deactivated: boolean }> {
    return this.coupons.remove(id);
  }
}
