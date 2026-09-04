import { Injectable } from '@nestjs/common';
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
 * Cash on Delivery - the single most-used method in Nepal, and the only one
 * with no gateway behind it.
 *
 * The order is CONFIRMED immediately (the shopper has committed to buy) while
 * the payment stays PENDING until the courier hands over the cash. Those two
 * being allowed to disagree is the whole point of tracking them separately.
 */
@Injectable()
export class CodGateway implements PaymentGateway {
  readonly method = PaymentMethod.COD;
  readonly label = 'Cash on Delivery';
  readonly description = 'Pay the courier in cash when your order arrives.';
  readonly currencies: readonly SupportedCurrency[] = ['NPR'];

  /** Always available - there is nothing to configure. */
  isConfigured(): boolean {
    return true;
  }

  initiate(context: PaymentContext): Promise<PaymentInit> {
    return Promise.resolve({
      kind: 'none',
      method: this.method,
      message:
        `Have NPR ${context.order.total.toFixed(2)} ready for the courier. ` +
        `Your order is confirmed and will ship shortly.`,
    });
  }

  /**
   * There is nothing to check with anyone - collection is recorded by an admin
   * marking the order delivered, which is a Phase 6 action.
   */
  verify(): Promise<PaymentVerification> {
    return Promise.resolve({
      status: PaymentStatus.PENDING,
      transactionId: null,
      amount: null,
      raw: { method: 'COD', note: 'Collected on delivery.' },
    });
  }

  /** No money has moved, so a "refund" is just cancelling the collection. */
  refund(request: RefundRequest): Promise<RefundResult> {
    return Promise.resolve({
      isAutomated: true,
      gatewayRefundId: null,
      status: 'COMPLETED',
      message: `Nothing to refund - NPR ${request.amount.toFixed(2)} was never collected.`,
    });
  }
}
