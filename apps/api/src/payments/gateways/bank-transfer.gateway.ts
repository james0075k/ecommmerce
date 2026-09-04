import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@bazaar/shared';
import type { PaymentInit, SupportedCurrency } from '@bazaar/shared';

import type {
  PaymentContext,
  PaymentGateway,
  PaymentVerification,
  RefundRequest,
  RefundResult,
} from '../payment-gateway';

/**
 * Direct bank transfer.
 *
 * `PaymentMethod.BANK_TRANSFER` is in the schema, so leaving it unimplemented
 * would mean an enum value that reaches checkout and throws. It is manual by
 * nature: the shopper is shown the account details and the order stays PENDING
 * until an operator matches the deposit.
 */
@Injectable()
export class BankTransferGateway implements PaymentGateway {
  readonly method = PaymentMethod.BANK_TRANSFER;
  readonly label = 'Bank transfer';
  readonly description = 'Transfer to our bank account and quote your order number.';
  readonly currencies: readonly SupportedCurrency[] = ['NPR', 'USD'];

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('BANK_TRANSFER_ACCOUNT');
  }

  initiate(context: PaymentContext): Promise<PaymentInit> {
    const bank = this.config.get<string>('BANK_TRANSFER_BANK') ?? 'our bank';
    const account = this.config.get<string>('BANK_TRANSFER_ACCOUNT') ?? '';
    const name = this.config.get<string>('BANK_TRANSFER_NAME') ?? 'Bazaar';

    return Promise.resolve({
      kind: 'none',
      method: this.method,
      message:
        `Transfer ${context.order.currency} ${context.order.total.toFixed(2)} to ${name}, ` +
        `account ${account} at ${bank}, quoting ${context.order.orderNumber}. ` +
        `Your order ships once we see the deposit.`,
    });
  }

  verify(): Promise<PaymentVerification> {
    return Promise.resolve({
      status: PaymentStatus.PENDING,
      transactionId: null,
      amount: null,
      raw: { method: 'BANK_TRANSFER', note: 'Reconciled manually against the bank statement.' },
    });
  }

  refund(request: RefundRequest): Promise<RefundResult> {
    return Promise.resolve({
      isAutomated: false,
      gatewayRefundId: null,
      status: 'PENDING',
      message:
        `Return ${request.payment.currency} ${request.amount.toFixed(2)} by bank transfer ` +
        `to the account the payment came from.`,
    });
  }
}
