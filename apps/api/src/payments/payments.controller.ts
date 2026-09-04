import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { PaymentStatus } from '@bazaar/shared';
import type { PaymentMethodOption, SupportedCurrency } from '@bazaar/shared';

import { Public } from '../common/decorators/public.decorator';
import { PaymentsService, type SettlementResult } from './payments.service';

/**
 * Gateway callbacks and webhooks.
 *
 * Everything here is @Public() by necessity - a bank's server has no Bearer
 * token. Authentication is replaced by proof of a different kind: each route
 * either verifies a signature (Stripe, PayPal) or re-asks the gateway what
 * happened (eSewa, Khalti, ConnectIPS, IME, Fonepay). Nothing on these routes
 * trusts its own query string.
 */
@Public()
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  /** Drives the radio list in checkout step 3. */
  @Get('methods')
  listMethods(@Query('currency') currency?: string): PaymentMethodOption[] {
    return this.payments.listMethods((currency as SupportedCurrency) ?? 'NPR');
  }

  /* ---------------------------------------------------------------------- */
  /*  eSewa                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * eSewa sends the shopper's *browser* here, so this responds with a redirect
   * to the storefront rather than JSON. The `data` blob identifies the
   * transaction; `settle` re-checks it against eSewa's status API.
   */
  @Get('esewa/success')
  async esewaSuccess(@Query() query: Record<string, string>, @Res() response: Response) {
    const paymentId = decodeTransactionUuid(query.data) ?? query.transaction_uuid;

    if (!paymentId) {
      return this.redirectFailure(response, null, 'eSewa did not identify the transaction.');
    }

    const result = await this.payments.settle(paymentId, query);
    return this.redirectOutcome(response, result);
  }

  @Get('esewa/failure')
  esewaFailure(@Query() query: Record<string, string>, @Res() response: Response) {
    const paymentId = decodeTransactionUuid(query.data) ?? query.transaction_uuid;
    this.logger.warn(`eSewa reported a failed payment for ${paymentId ?? 'unknown'}.`);
    return this.redirectFailure(response, null, 'The eSewa payment was cancelled or declined.');
  }

  /* ---------------------------------------------------------------------- */
  /*  Khalti                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Khalti returns `purchase_order_id` (our payment id) alongside the pidx.
   * The pidx is what `verify` looks up - the rest of the query string is
   * ignored on purpose.
   */
  @Get('khalti/callback')
  async khaltiCallback(@Query() query: Record<string, string>, @Res() response: Response) {
    const paymentId = query.purchase_order_id;

    if (!paymentId) {
      return this.redirectFailure(response, null, 'Khalti did not identify the order.');
    }

    const result = await this.payments.settle(paymentId, query);
    return this.redirectOutcome(response, result);
  }

  /* ---------------------------------------------------------------------- */
  /*  Stripe                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Stripe webhook.
   *
   * `request.rawBody` is required: `constructEvent` hashes the exact bytes
   * Stripe sent, and a body that has been JSON-parsed and re-serialised no
   * longer matches its own signature. main.ts enables `rawBody` for this.
   *
   * Throttling is relaxed here - Stripe can burst retries, and a 429 would make
   * it back off and delay a confirmation the shopper is waiting on.
   */
  @Post('stripe/webhook')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async stripeWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!signature || !request.rawBody) {
      throw new BadRequestException('Missing Stripe signature or raw body.');
    }

    let event: Stripe.Event;

    try {
      event = this.payments.stripe.constructEvent(request.rawBody, signature);
    } catch (error) {
      // An unverifiable webhook is indistinguishable from a forged one.
      this.logger.error(
        `Rejected a Stripe webhook: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException('Invalid Stripe signature.');
    }

    if (
      event.type === 'payment_intent.succeeded' ||
      event.type === 'payment_intent.payment_failed'
    ) {
      const intent = event.data.object;
      const paymentId = intent.metadata?.paymentId;

      if (paymentId) {
        // The intent is already in the verified event, so it is passed straight
        // through rather than re-fetched.
        await this.payments.settle(paymentId, {}, this.payments.stripe.fromIntent(intent));
      } else {
        this.logger.warn(`Stripe intent ${intent.id} carried no paymentId metadata.`);
      }
    }

    // Always 200 for an event we chose not to act on - a non-2xx makes Stripe
    // retry something that will never succeed.
    return { received: true };
  }

  /**
   * The browser's return path after Stripe.js confirms. The webhook is the
   * authority; this exists so the shopper sees a result immediately instead of
   * waiting for a webhook that may take a second to arrive.
   */
  @Get('stripe/return')
  async stripeReturn(@Query() query: Record<string, string>, @Res() response: Response) {
    const paymentId = query.paymentId;

    if (!paymentId) {
      return this.redirectFailure(response, null, 'The payment could not be identified.');
    }

    const result = await this.payments.settle(paymentId, query);
    return this.redirectOutcome(response, result);
  }

  /* ---------------------------------------------------------------------- */
  /*  PayPal                                                                 */
  /* ---------------------------------------------------------------------- */

  @Get('paypal/return')
  async paypalReturn(@Query() query: Record<string, string>, @Res() response: Response) {
    // PayPal echoes our payment id back as the custom_id; it also arrives on
    // the query as `paymentId` because we put it in the return URL.
    const paymentId = query.paymentId;

    if (!paymentId) {
      return this.redirectFailure(response, null, 'PayPal did not identify the order.');
    }

    const result = await this.payments.settle(paymentId, query);
    return this.redirectOutcome(response, result);
  }

  @Get('paypal/cancel')
  paypalCancel(@Query('paymentId') paymentId: string | undefined, @Res() response: Response) {
    this.logger.log(`PayPal payment ${paymentId ?? 'unknown'} was cancelled by the buyer.`);
    return this.redirectFailure(response, null, 'You cancelled the PayPal payment.');
  }

  @Post('paypal/webhook')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async paypalWebhook(
    @Req() request: Request,
    @Headers() headers: Record<string, string | undefined>,
  ): Promise<{ received: true }> {
    const body = request.body as {
      event_type?: string;
      resource?: { custom_id?: string; id?: string };
    };

    const verified = await this.payments.paypal.verifyWebhook(headers, body);

    if (!verified) {
      throw new BadRequestException('Invalid PayPal webhook signature.');
    }

    if (body.event_type === 'PAYMENT.CAPTURE.COMPLETED' && body.resource?.custom_id) {
      await this.payments.settle(body.resource.custom_id, {
        orderId: body.resource.id ?? '',
      });
    }

    return { received: true };
  }

  /* ---------------------------------------------------------------------- */
  /*  ConnectIPS / IME Pay / Fonepay                                         */
  /* ---------------------------------------------------------------------- */

  @Get('connectips/callback')
  async connectIpsCallback(@Query() query: Record<string, string>, @Res() response: Response) {
    const paymentId = query.REFERENCEID ?? query.paymentId;

    if (!paymentId) {
      return this.redirectFailure(response, null, 'ConnectIPS did not identify the payment.');
    }

    const result = await this.payments.settle(paymentId, query);
    return this.redirectOutcome(response, result);
  }

  @Get('imepay/callback')
  async imePayCallback(@Query() query: Record<string, string>, @Res() response: Response) {
    const paymentId = query.RefId ?? query.refId;

    if (!paymentId) {
      return this.redirectFailure(response, null, 'IME Pay did not identify the payment.');
    }

    const result = await this.payments.settle(paymentId, query);
    return this.redirectOutcome(response, result);
  }

  /**
   * Polled by the Fonepay QR screen. Returns JSON rather than a redirect,
   * because nothing navigated here - the page is asking on the shopper's
   * behalf while they scan.
   */
  @Get('fonepay/status')
  async fonepayStatus(
    @Query('prn') prn: string,
  ): Promise<{ status: PaymentStatus; orderId: string | null; message: string }> {
    if (!prn) throw new BadRequestException('A prn is required.');

    const result = await this.payments.settle(prn, { prn });

    return {
      status: result.status,
      orderId: result.status === PaymentStatus.COMPLETED ? result.orderId : null,
      message: result.message,
    };
  }

  /* ---------------------------------------------------------------------- */

  /** Sends the browser to the confirmation page, or back to checkout. */
  private redirectOutcome(response: Response, result: SettlementResult): void {
    if (result.status === PaymentStatus.COMPLETED) {
      response.redirect(`${this.siteUrl}/orders/${result.orderId}/confirmation`);
      return;
    }

    if (result.status === PaymentStatus.PENDING) {
      response.redirect(
        `${this.siteUrl}/orders/${result.orderId}/confirmation?pending=1`,
      );
      return;
    }

    this.redirectFailure(response, result.orderId, result.message);
  }

  private redirectFailure(response: Response, orderId: string | null, message: string): void {
    const url = new URL('/checkout', this.siteUrl);
    url.searchParams.set('error', message);
    if (orderId) url.searchParams.set('orderId', orderId);
    response.redirect(url.toString());
  }

  private get siteUrl(): string {
    return (
      this.config.get<string>('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
  }
}

/** eSewa's `?data=` is base64 JSON; we only need the transaction_uuid from it. */
function decodeTransactionUuid(data: string | undefined): string | undefined {
  if (!data) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as {
      transaction_uuid?: string;
    };
    return parsed.transaction_uuid;
  } catch {
    return undefined;
  }
}
