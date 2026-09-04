import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Payment, Prisma } from '@prisma/client';
import { OrderStatus, PaymentMethod, PaymentStatus, RefundStatus } from '@bazaar/shared';
import type { PaymentInit, PaymentMethodOption, SupportedCurrency } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notifications/mail.service';
import { SmsService } from '../notifications/sms.service';
import { BankTransferGateway } from './gateways/bank-transfer.gateway';
import { CodGateway } from './gateways/cod.gateway';
import { ConnectIpsGateway } from './gateways/connectips.gateway';
import { EsewaGateway } from './gateways/esewa.gateway';
import { FonepayGateway } from './gateways/fonepay.gateway';
import { ImePayGateway } from './gateways/imepay.gateway';
import { KhaltiGateway } from './gateways/khalti.gateway';
import { PaypalGateway } from './gateways/paypal.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import {
  amountsMatch,
  GatewayError,
  GatewayNotConfiguredError,
  type PaymentContext,
  type PaymentGateway,
  type PaymentVerification,
} from './payment-gateway';

/**
 * What a refund attempt actually did.
 *
 * `SKIPPED` is its own outcome rather than an error because the customer
 * cancellation path calls this speculatively on orders that may never have been
 * paid for - but the admin refund screen must be able to tell "we sent the money
 * back" apart from "there was nothing to send", and a void return could not.
 */
export interface RefundOutcome {
  status: RefundStatus | 'SKIPPED';
  message: string;
  refundId: string | null;
  /** False when an operator has to move the money by hand (cash, bank transfer). */
  isAutomated: boolean;
}

/** The outcome of settling a payment, for the redirect the caller performs. */
export interface SettlementResult {
  orderId: string;
  orderNumber: string;
  status: PaymentStatus;
  message: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly gateways: Map<PaymentMethod, PaymentGateway>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    esewa: EsewaGateway,
    khalti: KhaltiGateway,
    /** Public: the webhook controller needs `constructEvent` for signatures. */
    readonly stripe: StripeGateway,
    /** Public: the webhook controller needs `verifyWebhook` for signatures. */
    readonly paypal: PaypalGateway,
    connectips: ConnectIpsGateway,
    fonepay: FonepayGateway,
    imepay: ImePayGateway,
    cod: CodGateway,
    bankTransfer: BankTransferGateway,
  ) {
    this.gateways = new Map(
      [esewa, khalti, stripe, paypal, connectips, fonepay, imepay, cod, bankTransfer].map(
        (gateway) => [gateway.method, gateway],
      ),
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Discovery                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * What checkout should offer, with unconfigured gateways marked unavailable
   * rather than hidden - a missing key should look like a missing key.
   */
  listMethods(currency: SupportedCurrency = 'NPR'): PaymentMethodOption[] {
    return [...this.gateways.values()]
      .filter((gateway) => gateway.currencies.includes(currency))
      .map((gateway) => ({
        method: gateway.method,
        label: gateway.label,
        description: gateway.description,
        isAvailable: gateway.isConfigured(),
        currencies: [...gateway.currencies],
      }));
  }

  gatewayFor(method: PaymentMethod): PaymentGateway {
    const gateway = this.gateways.get(method);

    if (!gateway) {
      throw new BadRequestException(`${method} is not a supported payment method.`);
    }

    if (!gateway.isConfigured()) {
      throw new ServiceUnavailableException(
        `${gateway.label} is not available right now. Choose another payment method.`,
      );
    }

    return gateway;
  }

  /* ---------------------------------------------------------------------- */
  /*  Initiation                                                             */
  /* ---------------------------------------------------------------------- */

  async initiate(method: PaymentMethod, context: PaymentContext): Promise<PaymentInit> {
    const gateway = this.gatewayFor(method);

    try {
      return await gateway.initiate(context);
    } catch (error) {
      if (error instanceof GatewayNotConfiguredError) {
        throw new ServiceUnavailableException(error.message);
      }

      this.logger.error(
        `${gateway.label} initiation failed for ${context.order.orderNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new BadRequestException(
        error instanceof GatewayError
          ? error.message
          : `${gateway.label} could not start this payment. Try again or pick another method.`,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Settlement                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Verifies a payment with its gateway and applies the outcome.
   *
   * Every callback and webhook funnels through here, so the rules that matter -
   * verify out of band, check the amount, never confirm twice - are written
   * once. `paymentId` is looked up rather than trusted from the URL: the caller
   * supplies it, but the amount is always compared against the order's own row.
   */
  async settle(
    paymentId: string,
    params: Record<string, string>,
    prefetched?: PaymentVerification,
  ): Promise<SettlementResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true, orderNumber: true, status: true, total: true } } },
    });

    if (!payment) {
      throw new NotFoundException('That payment does not exist.');
    }

    // D2: webhooks retry. A payment already marked COMPLETED must not be
    // confirmed a second time - that would re-send the email and, worse,
    // re-run any side effect added here later.
    if (payment.status === PaymentStatus.COMPLETED) {
      return {
        orderId: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: PaymentStatus.COMPLETED,
        message: 'This payment was already confirmed.',
      };
    }

    const gateway = this.gatewayFor(payment.method);
    const verification = prefetched ?? (await gateway.verify(params));

    // The gateway is the authority on whether money moved, but *this* server is
    // the authority on how much was owed. A gateway reporting a smaller amount
    // than the order total is either a misconfiguration or tampering, and must
    // never confirm the order.
    if (
      verification.status === PaymentStatus.COMPLETED &&
      verification.amount !== null &&
      !amountsMatch(Number(payment.amount), verification.amount)
    ) {
      this.logger.error(
        `Amount mismatch on payment ${payment.id}: expected ${String(payment.amount)}, ` +
          `${gateway.label} reported ${verification.amount}.`,
      );

      await this.recordFailure(payment, verification, 'Amount did not match the order total.');

      return {
        orderId: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: PaymentStatus.FAILED,
        message: 'The amount paid did not match this order. Our team has been notified.',
      };
    }

    if (verification.status === PaymentStatus.COMPLETED) {
      await this.recordSuccess(payment.id, payment.order.id, verification);
      await this.notifyConfirmed(payment.order.id);

      return {
        orderId: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: PaymentStatus.COMPLETED,
        message: 'Payment confirmed.',
      };
    }

    if (verification.status === PaymentStatus.PENDING) {
      // Genuinely undecided (a Fonepay QR not yet scanned, a Khalti wallet
      // mid-flow). Leave everything as it is and let the next poll decide.
      return {
        orderId: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: PaymentStatus.PENDING,
        message: verification.failureReason ?? 'This payment is still being processed.',
      };
    }

    await this.recordFailure(payment, verification, verification.failureReason);

    return {
      orderId: payment.order.id,
      orderNumber: payment.order.orderNumber,
      status: PaymentStatus.FAILED,
      message: verification.failureReason ?? 'The payment did not go through.',
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Refunds                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Reverses a captured payment through the gateway that took it.
   *
   * A refund row is written whatever happens, including for the gateways with
   * no refund API - the row is the operator's worklist. Marking a manual
   * reversal COMPLETED would lose the money silently.
   */
  async refund(paymentId: string, amount: number, reason: string): Promise<RefundOutcome> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment) throw new NotFoundException('That payment does not exist.');

    if (payment.status !== PaymentStatus.COMPLETED) {
      // Cash on delivery is the one case where an uncaptured payment can still
      // owe money back: the courier took notes at the door, so the payment row
      // never left PENDING even though the shopper paid in full. There is no
      // gateway to reverse, so the refund is written PENDING as an operator's
      // worklist item rather than pretended into COMPLETED.
      if (payment.method === PaymentMethod.COD && payment.paidAt) {
        const manual = await this.prisma.refund.create({
          data: {
            paymentId: payment.id,
            amount,
            reason: `${reason} — cash on delivery, settle by hand`.slice(0, 500),
            status: RefundStatus.PENDING,
          },
        });

        return {
          status: RefundStatus.PENDING,
          message: 'Cash on delivery - hand this to finance to pay out.',
          refundId: manual.id,
          isAutomated: false,
        };
      }

      // Nothing was captured, so there is nothing to send back.
      this.logger.log(`Skipping refund for ${paymentId} - payment is ${payment.status}.`);

      return {
        status: 'SKIPPED',
        message: `Nothing to refund - the payment is ${payment.status.toLowerCase()}.`,
        refundId: null,
        isAutomated: false,
      };
    }

    const gateway = this.gateways.get(payment.method);

    if (!gateway) {
      this.logger.error(`No gateway registered for ${payment.method} - cannot refund ${paymentId}.`);

      return {
        status: 'SKIPPED',
        message: `No gateway is registered for ${payment.method}.`,
        refundId: null,
        isAutomated: false,
      };
    }

    let result;

    try {
      result = await gateway.refund({
        payment: {
          id: payment.id,
          transactionId: payment.transactionId,
          amount: Number(payment.amount),
          currency: payment.currency as SupportedCurrency,
          gatewayResponse: payment.gatewayResponse,
        },
        amount,
        reason,
      });
    } catch (error) {
      result = {
        isAutomated: true,
        gatewayRefundId: null,
        status: 'FAILED' as const,
        message: error instanceof Error ? error.message : 'The gateway refused the refund.',
      };
    }

    const [refund] = await this.prisma.$transaction([
      this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          amount,
          reason: `${reason} — ${result.message}`.slice(0, 500),
          status: result.status as RefundStatus,
          gatewayRefundId: result.gatewayRefundId,
          processedAt: result.status === 'COMPLETED' ? new Date() : null,
        },
      }),
      this.prisma.payment.update({
        where: { id: payment.id },
        data:
          // A partial refund leaves the payment COMPLETED: the capture still
          // stands for the rest of it, and flipping the whole row to REFUNDED
          // would make reconciliation read as if the order were free.
          result.status === 'COMPLETED' && amountsMatch(Number(payment.amount), amount)
            ? { status: PaymentStatus.REFUNDED }
            : // Still COMPLETED until the money is actually back - a PENDING
              // reversal has not undone the capture.
              {},
      }),
    ]);

    this.logger.log(`Refund for payment ${payment.id}: ${result.status} - ${result.message}`);

    return {
      status: result.status as RefundStatus,
      message: result.message,
      refundId: refund.id,
      isAutomated: result.isAutomated,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private async recordSuccess(
    paymentId: string,
    orderId: string,
    verification: PaymentVerification,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.COMPLETED,
          transactionId: verification.transactionId,
          gatewayResponse: verification.raw as Prisma.InputJsonValue,
          paidAt: new Date(),
        },
      });

      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });

      // Only advance an order that is still waiting. A cancelled order whose
      // payment lands late must not resurrect itself - that is a refund case.
      if (order?.status === OrderStatus.PENDING) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CONFIRMED, placedAt: new Date() },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            status: OrderStatus.CONFIRMED,
            note: 'Payment confirmed by the gateway.',
          },
        });
      }
    });
  }

  private async recordFailure(
    payment: Payment,
    verification: PaymentVerification,
    reason?: string,
  ): Promise<void> {
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        transactionId: verification.transactionId,
        gatewayResponse: {
          ...(verification.raw as Record<string, unknown>),
          ...(reason ? { bazaarNote: reason } : {}),
        } as Prisma.InputJsonValue,
      },
    });
  }

  /** Email + SMS on confirmation. Neither may fail the settlement. */
  private async notifyConfirmed(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { select: { productName: true, quantity: true, totalPrice: true } },
          user: { select: { email: true, fullName: true, phone: true } },
        },
      });

      if (!order) return;

      const email = order.user?.email ?? order.guestEmail;
      const name = order.user?.fullName ?? 'there';

      if (email) {
        await this.mail.sendOrderConfirmation(email, name, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          total: Number(order.total),
          currency: order.currency,
          items: order.items.map((item) => ({
            name: item.productName,
            quantity: item.quantity,
            total: Number(item.totalPrice),
          })),
        });
      }

      const phone = order.user?.phone ?? readPhone(order.shippingAddress);
      if (phone) await this.sms.sendOrderConfirmation(phone, order.orderNumber);
    } catch (error) {
      this.logger.error(
        `Order ${orderId} was confirmed but notifications failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function readPhone(address: Prisma.JsonValue): string | null {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return null;
  const phone = (address as { phone?: unknown }).phone;
  return typeof phone === 'string' ? phone : null;
}
