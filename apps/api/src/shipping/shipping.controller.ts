import { Controller, Get, Query } from '@nestjs/common';
import type { ShippingQuote } from '@bazaar/shared';

import { Public } from '../common/decorators/public.decorator';
import { ShippingService } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  /**
   * Rates for a district, used by checkout step 2 before an order exists.
   *
   * Public because guests check out too, and because the rate card is not
   * secret - it is the same table printed on the delivery page.
   */
  @Public()
  @Get('quote')
  quote(
    @Query('district') district: string,
    @Query('subtotal') subtotal?: string,
  ): ShippingQuote[] {
    const value = Number(subtotal ?? 0);
    return this.shipping.quoteAll(district ?? '', Number.isFinite(value) ? value : 0);
  }
}
