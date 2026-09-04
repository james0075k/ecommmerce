import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@bazaar/shared';
import type { PaymentInit, SupportedCurrency } from '@bazaar/shared';

import {
  GatewayError,
  GatewayNotConfiguredError,
  type PaymentContext,
  type PaymentGateway,
  type PaymentVerification,
  type RefundRequest,
  type RefundResult,
} from '../payment-gateway';

/**
 * Khalti ePayment (KPG-2).
 *
 * Every amount Khalti handles is in *paisa*, not rupees. Sending 1500 when you
 * mean Rs 1,500 charges Rs 15 - so conversion happens at exactly two points
 * here (`toPaisa` on the way out, `fromPaisa` on the way back) and nowhere else.
 *
 * Sandbox: a.khalti.com with a test secret key; test wallet 9800000000..05,
 * MPIN 1111, OTP 987654.
 */
@Injectable()
export class KhaltiGateway implements PaymentGateway {
  readonly method = PaymentMethod.KHALTI;
  readonly description = 'Pay with Khalti wallet, e-banking or connected cards.';
  readonly label = 'Khalti';
  readonly currencies: readonly SupportedCurrency[] = ['NPR'];

  private readonly logger = new Logger(KhaltiGateway.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.secretKey;
  }

  async initiate(context: PaymentContext): Promise<PaymentInit> {
    this.assertConfigured();

    const body = {
      return_url: this.callbackUrl(),
      website_url: this.config.get<string>('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000',
      amount: toPaisa(context.order.total),
      purchase_order_id: context.paymentId,
      purchase_order_name: `Bazaar order ${context.order.orderNumber}`,
      customer_info: {
        name: context.customer.fullName,
        email: context.customer.email,
        ...(context.customer.phone ? { phone: context.customer.phone } : {}),
      },
    };

    const response = await fetch(`${this.baseUrl}/api/v2/epayment/initiate/`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      pidx?: string;
      payment_url?: string;
      detail?: string;
    };

    if (!response.ok || !payload.payment_url) {
      throw new GatewayError(
        'Khalti',
        payload.detail ?? `initiate responded ${response.status}`,
        payload,
      );
    }

    this.logger.log(`Khalti payment initiated for ${context.order.orderNumber} (pidx ${payload.pidx}).`);

    return {
      kind: 'redirect',
      method: this.method,
      redirectUrl: payload.payment_url,
    };
  }

  /**
   * Confirms with Khalti's lookup API.
   *
   * Khalti's own documentation is explicit that the redirect parameters are not
   * proof of payment and that lookup is the authority - a shopper can reach the
   * return URL with a hand-written query string.
   */
  async verify(params: Record<string, string>): Promise<PaymentVerification> {
    this.assertConfigured();

    const pidx = params.pidx;

    if (!pidx) {
      throw new GatewayError('Khalti', 'The callback did not include a pidx.');
    }

    const response = await fetch(`${this.baseUrl}/api/v2/epayment/lookup/`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pidx }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      pidx?: string;
      status?: string;
      transaction_id?: string | null;
      total_amount?: number;
      detail?: string;
    };

    if (!response.ok) {
      throw new GatewayError(
        'Khalti',
        payload.detail ?? `lookup responded ${response.status}`,
        payload,
      );
    }

    // Khalti's statuses: Completed | Pending | Initiated | Refunded |
    // Expired | User canceled. Only "Completed" releases the goods; "Pending"
    // genuinely means "not yet", so it must not be treated as a failure and
    // must not confirm the order either.
    const status =
      payload.status === 'Completed'
        ? PaymentStatus.COMPLETED
        : payload.status === 'Refunded'
          ? PaymentStatus.REFUNDED
          : payload.status === 'Pending' || payload.status === 'Initiated'
            ? PaymentStatus.PENDING
            : PaymentStatus.FAILED;

    return {
      status,
      transactionId: payload.transaction_id ?? pidx,
      amount: payload.total_amount === undefined ? null : fromPaisa(payload.total_amount),
      raw: payload,
      failureReason:
        status === PaymentStatus.COMPLETED
          ? undefined
          : `Khalti reported status ${payload.status ?? 'UNKNOWN'}`,
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    this.assertConfigured();

    const pidx = readPidx(request.payment.gatewayResponse) ?? request.payment.transactionId;

    if (!pidx) {
      return {
        isAutomated: false,
        gatewayRefundId: null,
        status: 'PENDING',
        message: 'No Khalti pidx was recorded for this payment - refund it from the dashboard.',
      };
    }

    const response = await fetch(`${this.baseUrl}/api/v2/epayment/refund/`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pidx, amount: toPaisa(request.amount) }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
      status?: string;
    };

    if (!response.ok) {
      return {
        isAutomated: true,
        gatewayRefundId: null,
        status: 'FAILED',
        message: payload.detail ?? `Khalti refund responded ${response.status}`,
        raw: payload,
      };
    }

    return {
      isAutomated: true,
      gatewayRefundId: pidx,
      status: 'COMPLETED',
      message: 'Khalti refund accepted.',
      raw: payload,
    };
  }

  /* --------------------------------------------------------------------- */

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new GatewayNotConfiguredError('Khalti', ['KHALTI_SECRET_KEY']);
    }
  }

  private callbackUrl(): string {
    const apiUrl = this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000/api/v1';
    return `${apiUrl.replace(/\/$/, '')}/payments/khalti/callback`;
  }

  private get secretKey(): string {
    return this.config.get<string>('KHALTI_SECRET_KEY') ?? '';
  }

  private get baseUrl(): string {
    return (this.config.get<string>('KHALTI_BASE_URL') ?? 'https://a.khalti.com').replace(
      /\/$/,
      '',
    );
  }
}

/* -------------------------------------------------------------------------- */

/** Khalti speaks paisa. Rounding here, not at the call site, is deliberate. */
function toPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

function fromPaisa(paisa: number): number {
  return paisa / 100;
}

function readPidx(gatewayResponse: unknown): string | null {
  if (!gatewayResponse || typeof gatewayResponse !== 'object') return null;
  const pidx = (gatewayResponse as { pidx?: unknown }).pidx;
  return typeof pidx === 'string' ? pidx : null;
}
