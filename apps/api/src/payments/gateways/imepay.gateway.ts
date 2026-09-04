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
 * IME Pay wallet.
 *
 * A two-step REST redirect: get a token, send the shopper to the hosted page
 * with it, then confirm the token afterwards. Amounts are in *paisa*.
 *
 * IME authenticates with a Basic header built from the module credentials plus
 * a base64 merchant code, which is unusual enough to be worth stating: the
 * merchant code is base64'd *inside* a header that is itself base64.
 */
@Injectable()
export class ImePayGateway implements PaymentGateway {
  readonly method = PaymentMethod.IME_PAY;
  readonly label = 'IME Pay';
  readonly description = 'Pay with your IME Pay wallet.';
  readonly currencies: readonly SupportedCurrency[] = ['NPR'];

  private readonly logger = new Logger(ImePayGateway.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.merchantCode && !!this.username && !!this.password && !!this.module;
  }

  async initiate(context: PaymentContext): Promise<PaymentInit> {
    this.assertConfigured();

    const amountPaisa = String(Math.round(context.order.total * 100));

    const response = await fetch(`${this.baseUrl}/api/Web/GetToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Module: this.module,
        Authorization: this.authHeader(),
      },
      body: JSON.stringify({
        MerchantCode: this.merchantCode,
        Amount: amountPaisa,
        RefId: context.paymentId,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      TokenId?: string;
      ResponseCode?: number | string;
      ResponseDescription?: string;
    };

    if (!response.ok || !payload.TokenId) {
      throw new GatewayError(
        'IME Pay',
        payload.ResponseDescription ?? `GetToken responded ${response.status}`,
        payload,
      );
    }

    const url = new URL(`${this.baseUrl}/WebCheckout/Checkout`);
    url.searchParams.set('tid', payload.TokenId);
    url.searchParams.set('mid', this.merchantCode);
    url.searchParams.set('amt', amountPaisa);
    url.searchParams.set('refId', context.paymentId);
    url.searchParams.set('resp_url', this.callbackUrl());

    this.logger.log(`IME Pay token issued for ${context.order.orderNumber}.`);

    return { kind: 'redirect', method: this.method, redirectUrl: url.toString() };
  }

  async verify(params: Record<string, string>): Promise<PaymentVerification> {
    this.assertConfigured();

    const tokenId = params.TokenId ?? params.tid;
    const refId = params.RefId ?? params.refId;

    if (!tokenId || !refId) {
      throw new GatewayError('IME Pay', 'The callback did not include a token and reference.');
    }

    const response = await fetch(`${this.baseUrl}/api/Web/Confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Module: this.module,
        Authorization: this.authHeader(),
      },
      body: JSON.stringify({
        MerchantCode: this.merchantCode,
        RefId: refId,
        TokenId: tokenId,
        // IME echoes back what the redirect carried; sending it unchanged is
        // what lets them match the session.
        TransactionId: params.TransactionId ?? params.msisdn ?? '',
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ResponseCode?: number | string;
      ResponseDescription?: string;
      TransactionId?: string;
      Amount?: string | number;
      RefId?: string;
    };

    if (!response.ok) {
      throw new GatewayError(
        'IME Pay',
        payload.ResponseDescription ?? `Confirm responded ${response.status}`,
        payload,
      );
    }

    // ResponseCode 0 is IME's success. It arrives as a number from some
    // endpoints and a string from others, so it is compared loosely on purpose.
    const completed = String(payload.ResponseCode) === '0';

    return {
      status: completed ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
      transactionId: payload.TransactionId ?? tokenId,
      amount: payload.Amount === undefined ? null : Number(payload.Amount) / 100,
      raw: payload,
      failureReason: completed
        ? undefined
        : (payload.ResponseDescription ?? `IME Pay returned code ${payload.ResponseCode}`),
    };
  }

  refund(request: RefundRequest): Promise<RefundResult> {
    return Promise.resolve({
      isAutomated: false,
      gatewayRefundId: null,
      status: 'PENDING',
      message:
        `IME Pay refunds are raised through merchant support. Reference ` +
        `${request.payment.transactionId ?? 'unknown'}, NPR ${request.amount.toFixed(2)}.`,
    });
  }

  /* --------------------------------------------------------------------- */

  private authHeader(): string {
    const basic = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${basic}`;
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new GatewayNotConfiguredError('IME Pay', [
        'IMEPAY_MERCHANT_CODE',
        'IMEPAY_USERNAME',
        'IMEPAY_PASSWORD',
        'IMEPAY_MODULE',
      ]);
    }
  }

  private callbackUrl(): string {
    const apiUrl = this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000/api/v1';
    return `${apiUrl.replace(/\/$/, '')}/payments/imepay/callback`;
  }

  private get merchantCode(): string {
    return this.config.get<string>('IMEPAY_MERCHANT_CODE') ?? '';
  }

  private get username(): string {
    return this.config.get<string>('IMEPAY_USERNAME') ?? '';
  }

  private get password(): string {
    return this.config.get<string>('IMEPAY_PASSWORD') ?? '';
  }

  private get module(): string {
    return this.config.get<string>('IMEPAY_MODULE') ?? '';
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('IMEPAY_BASE_URL') ?? 'https://stg.imepay.com.np:7979'
    ).replace(/\/$/, '');
  }
}
