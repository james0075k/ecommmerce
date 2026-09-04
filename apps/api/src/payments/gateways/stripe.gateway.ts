import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
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
 * Stripe PaymentIntents.
 *
 * The client never sees the secret key - it gets a `client_secret` scoped to
 * one intent, which is exactly what Stripe Elements needs and nothing more.
 *
 * Test card 4242 4242 4242 4242, any future expiry, any CVC.
 */
@Injectable()
export class StripeGateway implements PaymentGateway {
  readonly method = PaymentMethod.STRIPE;
  readonly label = 'Card';
  readonly description = 'Visa, Mastercard and American Express, processed by Stripe.';
  readonly currencies: readonly SupportedCurrency[] = ['NPR', 'USD'];

  private readonly logger = new Logger(StripeGateway.name);
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('STRIPE_SECRET_KEY');
  }

  async initiate(context: PaymentContext): Promise<PaymentInit> {
    const stripe = this.stripe();

    const intent = await stripe.paymentIntents.create(
      {
        amount: toMinorUnits(context.order.total, context.order.currency),
        currency: context.order.currency.toLowerCase(),
        // Lets Stripe surface whatever the account has enabled (cards, wallets)
        // without this file having to enumerate them.
        automatic_payment_methods: { enabled: true },
        receipt_email: context.customer.email,
        description: `Bazaar order ${context.order.orderNumber}`,
        // Echoed back on the webhook - this is how an async event finds its
        // order without trusting anything the browser said.
        metadata: {
          orderId: context.order.id,
          orderNumber: context.order.orderNumber,
          paymentId: context.paymentId,
        },
      },
      // Stripe deduplicates on this key, so a double-clicked "Place order"
      // creates one intent rather than charging twice.
      { idempotencyKey: `order-${context.paymentId}` },
    );

    if (!intent.client_secret) {
      throw new GatewayError('Stripe', 'PaymentIntent was created without a client secret.');
    }

    this.logger.log(`Stripe intent ${intent.id} created for ${context.order.orderNumber}.`);

    return {
      kind: 'client_sdk',
      method: this.method,
      clientSecret: intent.client_secret,
      publishableKey: this.config.get<string>('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY') ?? null,
      paymentId: context.paymentId,
    };
  }

  /** Re-reads the intent from Stripe; the browser's word is not evidence. */
  async verify(params: Record<string, string>): Promise<PaymentVerification> {
    const stripe = this.stripe();
    const intentId = params.payment_intent ?? params.paymentIntentId;

    if (!intentId) {
      throw new GatewayError('Stripe', 'No payment_intent was supplied.');
    }

    const intent = await stripe.paymentIntents.retrieve(intentId);
    return this.fromIntent(intent);
  }

  /**
   * Validates a webhook signature and returns the event.
   *
   * Takes the *raw* body, never the parsed one: `constructEvent` hashes the
   * exact bytes Stripe sent, and JSON round-tripping changes them.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!secret) {
      throw new GatewayNotConfiguredError('Stripe webhooks', ['STRIPE_WEBHOOK_SECRET']);
    }

    return this.stripe().webhooks.constructEvent(rawBody, signature, secret);
  }

  /** Maps an intent from a webhook event into the shared verification shape. */
  fromIntent(intent: Stripe.PaymentIntent): PaymentVerification {
    const status =
      intent.status === 'succeeded'
        ? PaymentStatus.COMPLETED
        : intent.status === 'processing' || intent.status === 'requires_action'
          ? PaymentStatus.PENDING
          : PaymentStatus.FAILED;

    return {
      status,
      transactionId: intent.id,
      amount: fromMinorUnits(intent.amount_received || intent.amount, intent.currency),
      raw: intent as unknown,
      failureReason:
        status === PaymentStatus.COMPLETED
          ? undefined
          : (intent.last_payment_error?.message ?? `Stripe status ${intent.status}`),
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const stripe = this.stripe();

    if (!request.payment.transactionId) {
      return {
        isAutomated: false,
        gatewayRefundId: null,
        status: 'PENDING',
        message: 'No Stripe PaymentIntent was recorded for this payment.',
      };
    }

    try {
      const refund = await stripe.refunds.create({
        payment_intent: request.payment.transactionId,
        amount: toMinorUnits(request.amount, request.payment.currency),
        reason: 'requested_by_customer',
        metadata: { note: request.reason.slice(0, 500) },
      });

      return {
        isAutomated: true,
        gatewayRefundId: refund.id,
        // Card refunds settle asynchronously; `succeeded` here means Stripe
        // accepted it, and the money lands in a few business days.
        status: refund.status === 'succeeded' ? 'COMPLETED' : 'PROCESSING',
        message: `Stripe refund ${refund.id} ${refund.status ?? 'created'}.`,
        raw: refund as unknown,
      };
    } catch (error) {
      return {
        isAutomated: true,
        gatewayRefundId: null,
        status: 'FAILED',
        message: error instanceof Error ? error.message : 'Stripe refused the refund.',
      };
    }
  }

  /* --------------------------------------------------------------------- */

  private stripe(): Stripe {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');

    if (!key) {
      throw new GatewayNotConfiguredError('Stripe', ['STRIPE_SECRET_KEY']);
    }

    // Built once and reused - the client holds a keep-alive connection pool.
    this.client ??= new Stripe(key);
    return this.client;
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Stripe works in an ISO-4217 currency's minor unit. NPR is a two-decimal
 * currency like USD, so both are ×100 - but the zero-decimal list is real
 * (JPY, KRW) and getting it wrong overcharges by 100×, so it is handled
 * explicitly rather than assumed.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['jpy', 'krw', 'vnd', 'clp', 'isk']);

function toMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

function fromMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? amount : amount / 100;
}
