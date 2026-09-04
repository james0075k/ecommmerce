import { Module } from '@nestjs/common';

import { AdminCouponsController } from './admin-coupons.controller';
import { AdminCouponsService } from './admin-coupons.service';
import { CouponsService } from './coupons.service';

/**
 * Two audiences, one table. `CouponsService` prices a code against a cart at
 * checkout; `AdminCouponsService` is the CRUD behind /admin/coupons. They stay
 * apart because the questions they answer are different - "may this shopper use
 * this code right now" against "what should this code be" - and folding them
 * together would put the panel's validation rules in the checkout path.
 */
@Module({
  controllers: [AdminCouponsController],
  providers: [CouponsService, AdminCouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
