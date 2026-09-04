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

interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

/**
 * PayPal Orders v2.
 *
 * Two-phase by design: `create` reserves the order and returns an approval URL,
 * then `capture` takes the money once the buyer has approved. Skipping the
 * capture is the classic PayPal bug - the buyer sees "approved", the merchant
 * never gets paid.
 *
 * PayPal does not settle NPR, so orders in rupees are presented in USD. The
 * conversion rate is configurable and pinned into the payment record, so a
 * later dispute can be reconciled against the rate actually used.
 */
@Injectable()
export class PaypalGateway implements PaymentGateway {
  readonly method = PaymentMethod.PAYPAL;
  readonly label = 'PayPal';
  readonly description = 'Pay with your PayPal balance or a linked card.';
  readonly currencies: readonly SupportedCurrency[] = ['USD'];

  private readonly logger = new Logger(PaypalGateway.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }

  async initiate(context: PaymentContext): Promise<PaymentInit> {
    this.assertConfigured();

    const { amount, currency } = this.presentAmount(context.order.total, context.order.currency);

    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          // Echoed on the webhook, so an async event can find its order.
          custom_id: context.paymentId,
          invoice_id: context.order.orderNumber,
          description: `Bazaar order ${context.order.orderNumber}`,
          amount: { currency_code: currency, value: amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: this.callbackUrl('return', context.paymentId),
            cancel_url: this.callbackUrl('cancel', context.paymentId),
            user_action: 'PAY_NOW',
            brand_name: 'Bazaar',
          },
        },
      },
    };

    const payload = await this.request<{ id: string; links?: PayPalLink[] }>(
      'POST',
      '/v2/checkout/orders',
      body,
      // PayPal deduplicates on this header the same way Stripe does on its key.
      { 'PayPal-Request-Id': `order-${context.paymentId}` },
    );

    const approval = payload.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve');

    if (!approval) {
      throw new GatewayError('PayPal', 'No approval link was returned.', payload);
    }

    this.logger.log(`PayPal order ${payload.id} created for ${context.order.orderNumber}.`);

    return { kind: 'redirect', method: this.method, redirectUrl: approval.href };
  }

  /**
   * Captures the approved order, then reports what PayPal actually took.
   *
   * A capture that has already happened comes back as ORDER_ALREADY_CAPTURED;
   * that is a success, not an error - it is what a shopper refreshing the
   * return URL produces.
   */
  async verify(params: Record<string, string>): Promise<PaymentVerification> {
    this.assertConfigured();

    const orderId = params.token ?? params.orderId;

    if (!orderId) {
      throw new GatewayError('PayPal', 'The callback did not include an order token.');
    }

    let payload: PayPalCaptureResponse;

    try {
      payload = await this.request<PayPalCaptureResponse>(
        'POST',
        `/v2/checkout/orders/${orderId}/capture`,
        {},
      );
    } catch (error) {
      if (error instanceof GatewayError && String(error.message).includes('ORDER_ALREADY_CAPTURED')) {
        payload = await this.request<PayPalCaptureResponse>(
          'GET',
          `/v2/checkout/orders/${orderId}`,
        );
      } else {
        throw error;
      }
    }

    const capture = payload.purchase_units?.[0]?.payments?.captures?.[0];
    const completed = payload.status === 'COMPLETED' && capture?.status === 'COMPLETED';

    return {
      status: completed ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
      transactionId: capture?.id ?? orderId,
      amount: capture?.amount?.value === undefined ? null : Number(capture.amount.value),
      raw: payload,
      failureReason: completed ? undefined : `PayPal reported status ${payload.status ?? 'UNKNOWN'}`,
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    this.assertConfigured();

    const captureId = request.payment.transactionId;

    if (!captureId) {
      return {
        isAutomated: false,
        gatewayRefundId: null,
        status: 'PENDING',
        message: 'No PayPal capture id was recorded for this payment.',
      };
    }

    const { amount, currency } = this.presentAmount(request.amount, request.payment.currency);

    try {
      const payload = await this.request<{ id: string; status?: string }>(
        'POST',
        `/v2/payments/captures/${captureId}/refund`,
        {
          amount: { value: amount, currency_code: currency },
          note_to_payer: request.reason.slice(0, 255),
        },
      );

      return {
        isAutomated: true,
        gatewayRefundId: payload.id,
        status: payload.status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
        message: `PayPal refund ${payload.id} ${payload.status ?? 'created'}.`,
        raw: payload,
      };
    } catch (error) {
      return {
        isAutomated: true,
        gatewayRefundId: null,
        status: 'FAILED',
        message: error instanceof Error ? error.message : 'PayPal refused the refund.',
      };
    }
  }

  /** Verifies a webhook against PayPal's own verification endpoint. */
  async verifyWebhook(headers: Record<string, string | undefined>, body: unknown): Promise<boolean> {
    const webhookId = this.config.get<string>('PAYPAL_WEBHOOK_ID');

    if (!webhookId) {
      this.logger.warn('PAYPAL_WEBHOOK_ID is not set - webhook signatures cannot be verified.');
      return false;
    }

    try {
      const result = await this.request<{ verification_status?: string }>(
        'POST',
        '/v1/notifications/verify-webhook-signature',
        {
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: webhookId,
          webhook_event: body,
        },
      );

      return result.verification_status === 'SUCCESS';
    } catch (error) {
      this.logger.error(
        `PayPal webhook verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /* --------------------------------------------------------------------- */

  /**
   * OAuth2 client-credentials token, cached until a minute before it expires.
   * Fetching one per API call would double every round trip.
   */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw new GatewayError(
        'PayPal',
        payload.error_description ?? `token request responded ${response.status}`,
      );
    }

    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + ((payload.expires_in ?? 3600) - 60) * 1000,
    };

    return this.token.value;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const token = await this.accessToken();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      ...(body !== undefined && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    const payload = (text ? JSON.parse(text) : {}) as T & {
      name?: string;
      message?: string;
      details?: Array<{ issue?: string }>;
    };

    if (!response.ok) {
      const issue = payload.details?.[0]?.issue ?? payload.name ?? String(response.status);
      throw new GatewayError('PayPal', `${issue} - ${payload.message ?? 'request failed'}`, payload);
    }

    return payload;
  }

  /**
   * PayPal cannot settle NPR. Rupee orders are charged in USD at a configured
   * rate; the rate is intentionally explicit rather than looked up live, so the
   * amount a shopper is quoted cannot move between quote and capture.
   */
  private presentAmount(
    amount: number,
    currency: SupportedCurrency,
  ): { amount: string; currency: string } {
    if (currency === 'USD') return { amount: amount.toFixed(2), currency: 'USD' };

    const rate = Number(this.config.get<string>('NPR_TO_USD_RATE') ?? '0.0075');
    return { amount: (amount * rate).toFixed(2), currency: 'USD' };
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new GatewayNotConfiguredError('PayPal', [
        'PAYPAL_CLIENT_ID',
        'PAYPAL_CLIENT_SECRET',
      ]);
    }
  }

  /**
   * PayPal's return URL carries our payment id. The `token` PayPal appends
   * identifies *its* order; this identifies ours, so the callback needs no
   * lookup table between the two.
   */
  private callbackUrl(outcome: 'return' | 'cancel', paymentId: string): string {
    const apiUrl = this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000/api/v1';
    return `${apiUrl.replace(/\/$/, '')}/payments/paypal/${outcome}?paymentId=${paymentId}`;
  }

  private get clientId(): string {
    return this.config.get<string>('PAYPAL_CLIENT_ID') ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('PAYPAL_CLIENT_SECRET') ?? '';
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('PAYPAL_BASE_URL') ?? 'https://api-m.sandbox.paypal.com'
    ).replace(/\/$/, '');
  }
}

interface PayPalCaptureResponse {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: { value?: string; currency_code?: string };
      }>;
    };
  }>;
}
