import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign, createPrivateKey, type KeyObject } from 'node:crypto';
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
 * ConnectIPS, operated by NCHL - direct bank-account debit.
 *
 * The odd one out: it signs with an RSA private key from a PKCS#12 file NCHL
 * issues per merchant, not an HMAC shared secret. The token is SHA256withRSA
 * over a fixed field order, base64 encoded.
 *
 * Amounts are in *paisa*, like Khalti.
 */
@Injectable()
export class ConnectIpsGateway implements PaymentGateway {
  readonly method = PaymentMethod.CONNECTIPS;
  readonly label = 'ConnectIPS';
  readonly description = 'Pay directly from your bank account through ConnectIPS.';
  readonly currencies: readonly SupportedCurrency[] = ['NPR'];

  private readonly logger = new Logger(ConnectIpsGateway.name);
  private privateKey: KeyObject | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.merchantId && !!this.appId && !!this.appName && !!this.rawPrivateKey;
  }

  // `async` for the same reason as eSewa: reject, never throw synchronously.
  async initiate(context: PaymentContext): Promise<PaymentInit> {
    this.assertConfigured();

    // NCHL requires a reference of at most 20 chars; the order number is
    // already short and unique, and the uuid would not fit.
    const txnId = context.order.orderNumber.slice(0, 20);
    const txnDate = formatDate(new Date());
    const amountPaisa = String(Math.round(context.order.total * 100));

    const fields: Record<string, string> = {
      MERCHANTID: this.merchantId,
      APPID: this.appId,
      APPNAME: this.appName,
      TXNID: txnId,
      TXNDATE: txnDate,
      TXNCRNCY: 'NPR',
      TXNAMT: amountPaisa,
      REFERENCEID: context.paymentId,
      REMARKS: `Bazaar ${context.order.orderNumber}`,
      PARTICULARS: `Order ${context.order.orderNumber}`,
      TOKEN: 'TOKEN',
    };

    fields.TOKEN = this.sign(fields);

    // A GET redirect with the token in the query is what NCHL's hosted page
    // expects; there is no JSON initiate step.
    const url = new URL(`${this.baseUrl}/connectipswebgw/loginpage`);
    for (const [key, value] of Object.entries(fields)) {
      url.searchParams.set(key, value);
    }

    this.logger.log(`ConnectIPS redirect prepared for ${context.order.orderNumber}.`);

    return {
      kind: 'redirect',
      method: this.method,
      redirectUrl: url.toString(),
    };
  }

  /** Validates against NCHL's transaction-detail API, not the redirect. */
  async verify(params: Record<string, string>): Promise<PaymentVerification> {
    this.assertConfigured();

    const txnId = params.TXNID ?? params.txnId;

    if (!txnId) {
      throw new GatewayError('ConnectIPS', 'The callback did not identify a transaction.');
    }

    const token = this.sign({
      MERCHANTID: this.merchantId,
      APPID: this.appId,
      REFERENCEID: txnId,
      TXNAMT: params.TXNAMT ?? '0',
    }, ['MERCHANTID', 'APPID', 'REFERENCEID', 'TXNAMT']);

    const basic = Buffer.from(`${this.appId}:${this.appPassword}`).toString('base64');

    const response = await fetch(`${this.baseUrl}/connectipswebws/api/creditor/validatetxn`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchantId: Number(this.merchantId),
        appId: this.appId,
        referenceId: txnId,
        txnAmt: Number(params.TXNAMT ?? 0),
        token,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      status?: string;
      statusDesc?: string;
      referenceId?: string;
      amount?: number;
    };

    if (!response.ok) {
      throw new GatewayError(
        'ConnectIPS',
        payload.statusDesc ?? `validatetxn responded ${response.status}`,
        payload,
      );
    }

    const completed = payload.status === 'SUCCESS';

    return {
      status: completed ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
      transactionId: payload.referenceId ?? txnId,
      // The API answers in paisa, matching what was sent.
      amount: payload.amount === undefined ? null : payload.amount / 100,
      raw: payload,
      failureReason: completed
        ? undefined
        : (payload.statusDesc ?? `ConnectIPS reported ${payload.status ?? 'UNKNOWN'}`),
    };
  }

  /** NCHL settles reversals bank-to-bank; there is no merchant refund API. */
  refund(request: RefundRequest): Promise<RefundResult> {
    return Promise.resolve({
      isAutomated: false,
      gatewayRefundId: null,
      status: 'PENDING',
      message:
        `ConnectIPS refunds are settled through NCHL. Raise a reversal for reference ` +
        `${request.payment.transactionId ?? 'unknown'} (NPR ${request.amount.toFixed(2)}).`,
    });
  }

  /* --------------------------------------------------------------------- */

  /** SHA256withRSA over `KEY=value,KEY=value`, base64 encoded. */
  private sign(
    fields: Record<string, string>,
    order: string[] = [
      'MERCHANTID',
      'APPID',
      'APPNAME',
      'TXNID',
      'TXNDATE',
      'TXNCRNCY',
      'TXNAMT',
      'REFERENCEID',
      'REMARKS',
      'PARTICULARS',
      'TOKEN',
    ],
  ): string {
    const message = order
      .filter((key) => key !== 'TOKEN')
      .map((key) => `${key}=${fields[key] ?? ''}`)
      .join(',');

    return createSign('RSA-SHA256').update(message).sign(this.key(), 'base64');
  }

  private key(): KeyObject {
    if (this.privateKey) return this.privateKey;

    const raw = this.rawPrivateKey;

    try {
      // Accepts either a PEM pasted into the env or a base64 blob of one, since
      // multi-line PEMs are awkward to put in a .env file.
      const pem = raw.includes('-----BEGIN')
        ? raw.replace(/\\n/g, '\n')
        : Buffer.from(raw, 'base64').toString('utf8');

      this.privateKey = createPrivateKey({
        key: pem,
        ...(this.keyPassphrase ? { passphrase: this.keyPassphrase } : {}),
      });

      return this.privateKey;
    } catch (error) {
      throw new GatewayError(
        'ConnectIPS',
        `CONNECTIPS_PRIVATE_KEY could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new GatewayNotConfiguredError('ConnectIPS', [
        'CONNECTIPS_MERCHANT_ID',
        'CONNECTIPS_APP_ID',
        'CONNECTIPS_APP_NAME',
        'CONNECTIPS_PRIVATE_KEY',
      ]);
    }
  }

  private get merchantId(): string {
    return this.config.get<string>('CONNECTIPS_MERCHANT_ID') ?? '';
  }

  private get appId(): string {
    return this.config.get<string>('CONNECTIPS_APP_ID') ?? '';
  }

  private get appName(): string {
    return this.config.get<string>('CONNECTIPS_APP_NAME') ?? '';
  }

  private get appPassword(): string {
    return this.config.get<string>('CONNECTIPS_APP_PASSWORD') ?? '';
  }

  private get rawPrivateKey(): string {
    return this.config.get<string>('CONNECTIPS_PRIVATE_KEY') ?? '';
  }

  private get keyPassphrase(): string {
    return this.config.get<string>('CONNECTIPS_KEY_PASSPHRASE') ?? '';
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('CONNECTIPS_BASE_URL') ?? 'https://uat.connectips.com'
    ).replace(/\/$/, '');
  }
}

/** NCHL expects `MM-DD-YYYY`, not ISO. */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}-${date.getFullYear()}`;
}
