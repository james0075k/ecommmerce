import { Module } from '@nestjs/common';

import { CartModule } from '../cart/cart.module';
import { CouponsModule } from '../coupons/coupons.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { InvoiceService } from './invoice.service';
import { OrderEventsService } from './order-events.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, CouponsModule, ShippingModule, PaymentsModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [
    OrdersService,
    AdminOrdersService,
    InvoiceService,
    OrderEventsService,
    OrdersGateway,
  ],
  exports: [OrdersService, OrderEventsService],
})
export class OrdersModule {}
