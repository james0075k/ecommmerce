import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { BankTransferGateway } from './gateways/bank-transfer.gateway';
import { CodGateway } from './gateways/cod.gateway';
import { ConnectIpsGateway } from './gateways/connectips.gateway';
import { EsewaGateway } from './gateways/esewa.gateway';
import { FonepayGateway } from './gateways/fonepay.gateway';
import { ImePayGateway } from './gateways/imepay.gateway';
import { KhaltiGateway } from './gateways/khalti.gateway';
import { PaypalGateway } from './gateways/paypal.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * All nine payment methods.
 *
 * Every gateway is registered unconditionally, unlike the optional Google
 * strategy in AuthModule: a gateway with no credentials constructs fine and
 * simply reports `isConfigured() === false`, so checkout can list it as
 * unavailable rather than the server refusing to boot without eight vendors'
 * keys.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    EsewaGateway,
    KhaltiGateway,
    StripeGateway,
    PaypalGateway,
    ConnectIpsGateway,
    FonepayGateway,
    ImePayGateway,
    CodGateway,
    BankTransferGateway,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
