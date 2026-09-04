import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
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
 * eSewa ePay v2.
 *
 * The v2 API signs a *specific* subset of fields, in a *specific* order, and
 * the signed string has to be reproduced character for character - the single
 * most common integration failure. `signed_field_names` names them and
 * `SIGNED_FIELDS` below is that list; changing one without the other silently
 * breaks every payment.
 *
 * Sandbox: rc-epay.esewa.com.np with merchant code EPAYTEST. Test login
 * 9806800001..9806800005, password/MPIN Nepal@123, token 123456.
 */
@Injectable()
export class EsewaGateway implements PaymentGateway {
  readonly method = PaymentMethod.ESEWA;
  readonly label = 'eSewa';
  readonly description = 'Pay with your eSewa wallet. You will be redirected to eSewa.';
  readonly currencies: readonly SupportedCurrency[] = ['NPR'];

  private readonly logger = new Logger(EsewaGateway.name);

  /** Order matters - the signature string is built from exactly this sequence. */
  private static readonly SIGNED_FIELDS = [
    'total_amount',
    'transaction_uuid',
    'product_code',
  ] as const;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.merchantCode && !!this.secretKey;
  }

  // `async` even though nothing is awaited: the contract is a promise, so an
  // unconfigured gateway must reject rather than throw past a `.catch()`.
  async initiate(context: PaymentContext): Promise<PaymentInit> {
    this.assertConfigured();

    // eSewa rejects amounts with more than 2dp and treats "100" and "100.0"
    // as different strings for signing - so format once and reuse the exact
    // string in both the field and the signature.
    const totalAmount = format(context.order.total);
    const amount = format(
      context.order.total - context.order.shippingCost - context.order.taxAmount,
    );

    const fields: Record<string, string> = {
      amount,
      tax_amount: format(context.order.taxAmount),
      total_amount: totalAmount,
      // The payments row id - unique per attempt, which is what eSewa requires.
      transaction_uuid: context.paymentId,
      product_code: this.merchantCode,
      product_service_charge: '0',
      product_delivery_charge: format(context.order.shippingCost),
      success_url: this.callbackUrl('success'),
      failure_url: this.callbackUrl('failure'),
      signed_field_names: EsewaGateway.SIGNED_FIELDS.join(','),
    };

    fields.signature = this.sign(fields);

    return {
      kind: 'form_post',
      method: this.method,
      actionUrl: `${this.baseUrl}/api/epay/main/v2/form`,
      fields,
    };
  }

  /**
   * Confirms against eSewa's status API rather than the callback payload.
   *
   * The browser arrives at success_url carrying a base64 blob that eSewa signed
   * - but a shopper can simply navigate to that URL themselves. Asking eSewa
   * directly is the only answer that cannot be forged, so the callback data is
   * used only to learn *which* transaction to ask about.
   */
  async verify(params: Record<string, string>): Promise<PaymentVerification> {
    this.assertConfigured();

    const decoded = decodeCallback(params.data);
    const transactionUuid = decoded?.transaction_uuid ?? params.transaction_uuid;
    const totalAmount = decoded?.total_amount ?? params.total_amount;

    if (!transactionUuid) {
      throw new GatewayError('eSewa', 'The callback did not identify a transaction.');
    }

    const url = new URL('/api/epay/transaction/status/', this.statusUrl);
    url.searchParams.set('product_code', this.merchantCode);
    url.searchParams.set('total_amount', stripCommas(totalAmount ?? '0'));
    url.searchParams.set('transaction_uuid', transactionUuid);

    const response = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      throw new GatewayError('eSewa', `status API responded ${response.status}`);
    }

    const body = (await response.json()) as {
      status?: string;
      ref_id?: string;
      total_amount?: number | string;
      transaction_uuid?: string;
    };

    this.logger.log(
      `eSewa status for ${transactionUuid}: ${body.status ?? 'unknown'} (ref ${body.ref_id ?? '-'})`,
    );

    return {
      status: body.status === 'COMPLETE' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
      transactionId: body.ref_id ?? null,
      amount: body.total_amount === undefined ? null : Number(stripCommas(String(body.total_amount))),
      raw: body,
      failureReason:
        body.status === 'COMPLETE' ? undefined : `eSewa reported status ${body.status ?? 'UNKNOWN'}`,
    };
  }

  /**
   * eSewa has no public refund API - reversals are raised through the merchant
   * dashboard. Reporting that honestly is better than pretending it succeeded:
   * the refund row is created as PENDING and an operator settles it.
   */
  refund(request: RefundRequest): Promise<RefundResult> {
    return Promise.resolve({
      isAutomated: false,
      gatewayRefundId: null,
      status: 'PENDING',
      message:
        `Refund of NPR ${format(request.amount)} must be issued from the eSewa merchant ` +
        `dashboard against reference ${request.payment.transactionId ?? 'unknown'}.`,
    });
  }

  /* --------------------------------------------------------------------- */

  /** HMAC-SHA256 over `key=value,key=value`, base64 encoded. */
  private sign(fields: Record<string, string>): string {
    const message = EsewaGateway.SIGNED_FIELDS.map((name) => `${name}=${fields[name]}`).join(',');

    return createHmac('sha256', this.secretKey).update(message).digest('base64');
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new GatewayNotConfiguredError('eSewa', [
        'ESEWA_MERCHANT_CODE',
        'ESEWA_SECRET_KEY',
      ]);
    }
  }

  private callbackUrl(outcome: 'success' | 'failure'): string {
    const apiUrl = this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000/api/v1';
    return `${apiUrl.replace(/\/$/, '')}/payments/esewa/${outcome}`;
  }

  private get merchantCode(): string {
    return this.config.get<string>('ESEWA_MERCHANT_CODE') ?? '';
  }

  private get secretKey(): string {
    return this.config.get<string>('ESEWA_SECRET_KEY') ?? '';
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('ESEWA_BASE_URL') ?? 'https://rc-epay.esewa.com.np'
    ).replace(/\/$/, '');
  }

  /**
   * The status API lives on a different host from the payment form: the RC
   * sandbox posts to rc-epay but is queried at rc.esewa, and production posts
   * to epay but is queried at esewa.com.np.
   */
  private get statusUrl(): string {
    return this.baseUrl.includes('rc-epay')
      ? 'https://rc.esewa.com.np'
      : 'https://esewa.com.np';
  }
}

/* -------------------------------------------------------------------------- */

/** eSewa returns the result as a base64-encoded JSON blob in `?data=`. */
function decodeCallback(data: string | undefined): Record<string, string> | null {
  if (!data) return null;

  try {
    const json = Buffer.from(data, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

function format(value: number): string {
  return value.toFixed(2);
}

/** eSewa echoes amounts back with thousands separators ("1,250.00"). */
function stripCommas(value: string): string {
  return value.replace(/,/g, '');
}
