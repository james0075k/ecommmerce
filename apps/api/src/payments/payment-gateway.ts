import type { PaymentInit, PaymentMethod, PaymentStatus, SupportedCurrency } from '@bazaar/shared';

/**
 * The contract every gateway implements.
 *
 * Eight gateways, one interface. The alternative - a switch in the orders
 * service - would put eight vendors' quirks into the one file that must stay
 * readable, and would make adding a ninth a change to checkout rather than a
 * new file.
 */

/** What a gateway needs in order to start a payment. */
export interface PaymentContext {
  order: {
    id: string;
    orderNumber: string;
    total: number;
    currency: SupportedCurrency;
    subtotal: number;
    shippingCost: number;
    taxAmount: number;
  };
  /** The `payments` row - its id doubles as the gateway's transaction_uuid. */
  paymentId: string;
  customer: {
    email: string;
    fullName: string;
    phone: string | null;
  };
}

/** The verified outcome of a payment, as the gateway itself reports it. */
export interface PaymentVerification {
  status: PaymentStatus;
  /** The gateway's own reference, stored for reconciliation and disputes. */
  transactionId: string | null;
  /** What the gateway says was actually charged - checked against the order. */
  amount: number | null;
  /** The full payload, persisted to `payments.gateway_response`. */
  raw: unknown;
  /** Present when the gateway declined, for the failure page. */
  failureReason?: string;
}

export interface RefundRequest {
  payment: {
    id: string;
    transactionId: string | null;
    amount: number;
    currency: SupportedCurrency;
    gatewayResponse: unknown;
  };
  amount: number;
  reason: string;
}

export interface RefundResult {
  /** False when the gateway has no API for it and it must be done by hand. */
  isAutomated: boolean;
  gatewayRefundId: string | null;
  status: 'COMPLETED' | 'PROCESSING' | 'PENDING' | 'FAILED';
  message: string;
  raw?: unknown;
}

export interface PaymentGateway {
  readonly method: PaymentMethod;
  readonly label: string;
  readonly description: string;
  readonly currencies: readonly SupportedCurrency[];

  /**
   * Whether this gateway has the credentials it needs.
   *
   * Checkout lists unconfigured gateways as disabled rather than hiding them,
   * so a missing key looks like a missing key instead of a missing feature.
   */
  isConfigured(): boolean;

  /** Starts a payment and returns what the browser should do next. */
  initiate(context: PaymentContext): Promise<PaymentInit>;

  /**
   * Confirms a payment out of band, by asking the gateway.
   *
   * Never trusts the browser: a shopper landing on the success URL proves only
   * that they visited a URL. `params` carries whatever the callback supplied
   * (a pidx, a token, a base64 blob) and the gateway decides what to do with it.
   */
  verify(params: Record<string, string>): Promise<PaymentVerification>;

  /** Reverses a captured payment, where the gateway supports it. */
  refund(request: RefundRequest): Promise<RefundResult>;
}

/** DI token - Nest cannot inject an interface. */
export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');

/**
 * Thrown when a gateway is asked to do something it has no credentials for.
 * Surfaces as a 503, matching how AuthModule already reports an unconfigured
 * Google sign-in.
 */
export class GatewayNotConfiguredError extends Error {
  constructor(label: string, envVars: string[]) {
    super(
      `${label} is not configured on this server. Set ${envVars.join(' and ')} to enable it.`,
    );
    this.name = 'GatewayNotConfiguredError';
  }
}

/** A gateway that answered, but with something that is not a valid payment. */
export class GatewayError extends Error {
  constructor(
    label: string,
    detail: string,
    readonly raw?: unknown,
  ) {
    super(`${label}: ${detail}`);
    this.name = 'GatewayError';
  }
}

/** Money comparisons must not fail on floating-point noise. */
export function amountsMatch(expected: number, actual: number | null): boolean {
  if (actual === null) return false;
  return Math.abs(expected - actual) < 0.01;
}
