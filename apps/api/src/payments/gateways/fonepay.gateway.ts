import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import QRCode from 'qrcode';
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

/** A Fonepay QR is only good for a few minutes before the shopper must retry. */
const QR_TTL_MINUTES = 10;

/**
 * Fonepay dynamic QR.
 *
 * Unlike every other gateway here, there is no redirect: the shopper stays on
 * the page and scans a QR with their own bank's mobile app. That means the
 * browser is never told the outcome - the page polls, and the bank tells us
 * out of band. `statusUrl` in the returned PaymentInit is what it polls.
 */
@Injectable()
export class FonepayGateway implements PaymentGateway {
  readonly method = PaymentMethod.FONEPAY;
  readonly label = 'Fonepay QR';
  readonly description = 'Scan with any bank app that supports Fonepay.';
  readonly currencies: readonly SupportedCurrency[] = ['NPR'];

  private readonly logger = new Logger(FonepayGateway.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.merchantCode && !!this.secretKey && !!this.username;
  }

  async initiate(context: PaymentContext): Promise<PaymentInit> {
    this.assertConfigured();

    const prn = context.paymentId;
    const amount = context.order.total.toFixed(2);

    const body = {
      amount,
      remarks1: `Bazaar ${context.order.orderNumber}`.slice(0, 50),
      remarks2: context.customer.fullName.slice(0, 50),
      prn,
      merchantCode: this.merchantCode,
      username: this.username,
      password: this.password,
      // HMAC over the fields in this exact order - Fonepay rejects any other.
      dataValidation: this.sign([
        amount,
        `Bazaar ${context.order.orderNumber}`.slice(0, 50),
        context.customer.fullName.slice(0, 50),
        prn,
        this.merchantCode,
        this.username,
        this.password,
      ]),
    };

    const response = await fetch(`${this.baseUrl}/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      qrMessage?: string;
      status?: boolean;
      message?: string;
      thirdpartyQrWebSocketUrl?: string;
    };

    if (!response.ok || !payload.qrMessage) {
      throw new GatewayError(
        'Fonepay',
        payload.message ?? `QR request responded ${response.status}`,
        payload,
      );
    }

    // Rendered server-side into a data URI so the page needs no QR library and
    // no third-party image host sees the payload.
    const qrImage = await QRCode.toDataURL(payload.qrMessage, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });

    this.logger.log(`Fonepay QR issued for ${context.order.orderNumber} (prn ${prn}).`);

    const apiUrl = this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000/api/v1';

    return {
      kind: 'qr',
      method: this.method,
      qrImage,
      qrPayload: payload.qrMessage,
      statusUrl: `${apiUrl.replace(/\/$/, '')}/payments/fonepay/status?prn=${encodeURIComponent(prn)}`,
      expiresAt: new Date(Date.now() + QR_TTL_MINUTES * 60_000).toISOString(),
    };
  }

  async verify(params: Record<string, string>): Promise<PaymentVerification> {
    this.assertConfigured();

    const prn = params.prn;

    if (!prn) {
      throw new GatewayError('Fonepay', 'No PRN was supplied.');
    }

    const body = {
      prn,
      merchantCode: this.merchantCode,
      username: this.username,
      password: this.password,
      dataValidation: this.sign([prn, this.merchantCode, this.username, this.password]),
    };

    const response = await fetch(
      `${this.baseUrl}/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      paymentStatus?: string;
      fonepayTraceId?: number | string;
      totalAmount?: number | string;
      message?: string;
    };

    if (!response.ok) {
      throw new GatewayError(
        'Fonepay',
        payload.message ?? `status responded ${response.status}`,
        payload,
      );
    }

    const completed = payload.paymentStatus === 'success';

    return {
      status: completed ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
      transactionId: payload.fonepayTraceId === undefined ? null : String(payload.fonepayTraceId),
      amount: payload.totalAmount === undefined ? null : Number(payload.totalAmount),
      raw: payload,
      // Not-yet-scanned is the normal state while polling, so this is only a
      // failure reason once the QR has expired.
      failureReason: completed ? undefined : `Fonepay reports ${payload.paymentStatus ?? 'pending'}`,
    };
  }

  refund(request: RefundRequest): Promise<RefundResult> {
    return Promise.resolve({
      isAutomated: false,
      gatewayRefundId: null,
      status: 'PENDING',
      message:
        `Fonepay reversals are handled by the acquiring bank. Raise one for trace ` +
        `${request.payment.transactionId ?? 'unknown'} (NPR ${request.amount.toFixed(2)}).`,
    });
  }

  /* --------------------------------------------------------------------- */

  private sign(parts: string[]): string {
    return createHmac('sha512', this.secretKey).update(parts.join(',')).digest('hex');
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new GatewayNotConfiguredError('Fonepay', [
        'FONEPAY_MERCHANT_CODE',
        'FONEPAY_SECRET_KEY',
        'FONEPAY_USERNAME',
      ]);
    }
  }

  private get merchantCode(): string {
    return this.config.get<string>('FONEPAY_MERCHANT_CODE') ?? '';
  }

  private get secretKey(): string {
    return this.config.get<string>('FONEPAY_SECRET_KEY') ?? '';
  }

  private get username(): string {
    return this.config.get<string>('FONEPAY_USERNAME') ?? '';
  }

  private get password(): string {
    return this.config.get<string>('FONEPAY_PASSWORD') ?? '';
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('FONEPAY_BASE_URL') ?? 'https://dev-merchantapi.fonepay.com'
    ).replace(/\/$/, '');
  }
}
