import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/**
 * Exported so AuthModule can merge a guest cart at login, and WishlistModule
 * can move a saved item straight into the cart.
 */
@Module({
  imports: [CouponsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
