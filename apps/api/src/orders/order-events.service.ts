import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  carrierLabel,
  OrderStatus,
  REVIEW_REQUEST_DELAY_DAYS,
  trackingUrlFor,
} from '@bazaar/shared';
import type { OrderUpdatedEvent } from '@bazaar/shared';

import { AdminNotificationsService } from '../admin/admin-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notifications/mail.service';
import { SmsService } from '../notifications/sms.service';
import { QueueService } from '../queue/queue.service';
import { OrdersGateway } from './orders.gateway';

const REVIEW_REQUEST_JOB = 'order.review-request';
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the shopper is told when a status changes, in their words not ours. */
const STATUS_HEADLINES: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Your order is confirmed',
  PROCESSING: 'Your order is being packed',
  DELIVERED: 'Your order has been delivered',
  CANCELLED: 'Your order has been cancelled',
  REFUNDED: 'Your order has been refunded',
};

/**
 * Everything that happens *because* an order changed: the live broadcast, the
 * email and SMS, and the review request queued a week out.
 *
 * It lives apart from OrdersService for two reasons. The obvious one is that
 * three callers now move an order - the shopper cancelling, the payment webhook
 * settling, and an operator in the admin table - and each should trigger the
 * same consequences without repeating them. The important one is that *none* of
 * these may fail the transition that caused them: an order that is SHIPPED is
 * shipped whether or not Resend answered, so every method here swallows its own
 * errors and logs. The status write is already committed by the time announce()
 * is called, deliberately.
 */
@Injectable()
export class OrderEventsService implements OnModuleInit {
  private readonly logger = new Logger(OrderEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly queue: QueueService,
    private readonly gateway: OrdersGateway,
    private readonly adminNotifications: AdminNotificationsService,
  ) {}

  onModuleInit(): void {
    this.queue.register(REVIEW_REQUEST_JOB, (payload) =>
      this.sendReviewRequest(String(payload.orderId)),
    );
  }

  /**
   * Announce a transition that has already been written.
   *
   * `note` is the operator's own words, passed in rather than re-read: the
   * history row and the email should say the same thing, and a bulk update
   * writes one note across many orders.
   */
  async announce(
    orderId: string,
    options: { note?: string | null; silent?: boolean } = {},
  ): Promise<void> {
    try {
      const order = await this.load(orderId);
      if (!order) return;

      const note = options.note?.trim() || null;
      const payment = order.payments[0] ?? null;

      const event: OrderUpdatedEvent = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        note,
        trackingNumber: order.trackingNumber,
        carrierLabel: carrierLabel(order.carrier),
        trackingUrl: trackingUrlFor(order.carrier, order.trackingNumber),
        paymentStatus: payment?.status ?? null,
        at: new Date().toISOString(),
      };

      // The broadcast goes first and unconditionally: a shopper watching the
      // page should see the change at the moment the operator makes it, not
      // after an email round-trip.
      this.gateway.emitOrderUpdate(event);

      // The operator's bell rings on the transitions worth interrupting for
      // (Phase 8). Not on every status: an operator who just clicked "mark
      // processing" does not need a notification telling them they did, and a
      // bell that fires on their own routine work is a bell they turn off.
      await this.notifyAdmins(order);

      if (options.silent) return;

      await this.notify(order, note);
    } catch (error) {
      this.logger.error(
        `Could not announce the change to order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** The refund confirmation, which carries an amount the status alone cannot. */
  async announceRefund(
    orderId: string,
    amount: number,
    reason: string,
    methodLabel: string,
  ): Promise<void> {
    try {
      const order = await this.load(orderId);
      if (!order) return;

      const { email, name, phone } = recipient(order);

      if (email) {
        await this.mail.sendRefundNotification(email, name, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          amount,
          currency: order.currency,
          reason,
          methodLabel,
        });
      }

      if (phone) {
        await this.sms.sendRefundIssued(phone, order.orderNumber, amount, order.currency);
      }

      await this.adminNotifications.refundIssued({
        id: order.id,
        orderNumber: order.orderNumber,
        amount,
      });
    } catch (error) {
      this.logger.error(
        `Refund on order ${orderId} was processed but the customer was not notified: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Rings the admin bell for the two transitions an operator would want to know
   * about without being told: a new order arriving, and one being cancelled.
   *
   * CONFIRMED is the moment an order becomes real - it is set by the payment
   * webhook settling, or by checkout itself for cash on delivery - so it is the
   * signal, not the PENDING row that a gateway redirect may never come back to.
   */
  private async notifyAdmins(order: OrderWithRelations): Promise<void> {
    const { name } = recipient(order);

    if (order.status === OrderStatus.CONFIRMED) {
      await this.adminNotifications.orderPlaced({
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        customer: name,
      });
      return;
    }

    if (order.status === OrderStatus.CANCELLED) {
      await this.adminNotifications.orderCancelled({
        id: order.id,
        orderNumber: order.orderNumber,
        reason: order.cancelledReason,
      });
    }
  }

  private async notify(order: OrderWithRelations, note: string | null): Promise<void> {
    const { email, name, phone } = recipient(order);

    switch (order.status) {
      case OrderStatus.SHIPPED: {
        // Marking SHIPPED before a consignment number exists is allowed - an
        // operator often hands the parcel over first and gets the number back
        // minutes later. The shopper still gets told it left the building; the
        // *tracking* mail is sent when the number arrives, which is the moment
        // it is actually useful.
        if (!order.trackingNumber) {
          if (email) {
            await this.mail.sendOrderStatusUpdate(email, name, {
              orderId: order.id,
              orderNumber: order.orderNumber,
              headline: 'Your order is on its way',
              note,
            });
          }
          return;
        }

        const label = carrierLabel(order.carrier);
        const url = trackingUrlFor(order.carrier, order.trackingNumber);

        if (email) {
          await this.mail.sendShippingNotification(email, name, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber,
            carrierLabel: label,
            trackingUrl: url,
            estimatedDeliveryDate: null,
          });
        }

        if (phone) {
          await this.sms.sendOrderShipped(phone, order.orderNumber, order.trackingNumber, label);
        }

        return;
      }

      case OrderStatus.DELIVERED: {
        if (phone) await this.sms.sendOrderDelivered(phone, order.orderNumber);

        // The job id is derived from the order id, so a status set to DELIVERED
        // twice still only ever produces one review request.
        await this.queue.schedule(
          REVIEW_REQUEST_JOB,
          { orderId: order.id },
          REVIEW_REQUEST_DELAY_DAYS * DAY_MS,
          `${REVIEW_REQUEST_JOB}:${order.id}`,
        );

        if (email) {
          await this.mail.sendOrderStatusUpdate(email, name, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            headline: STATUS_HEADLINES.DELIVERED ?? 'Your order has been delivered',
            note,
          });
        }

        return;
      }

      default: {
        const headline = STATUS_HEADLINES[order.status];
        // PENDING has no headline: nobody needs an email saying an order they
        // just placed exists - the confirmation covers that.
        if (!headline || !email) return;

        await this.mail.sendOrderStatusUpdate(email, name, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          headline,
          note,
        });
      }
    }
  }

  /**
   * The seven-day job.
   *
   * Every precondition is re-checked at run time rather than trusted from when
   * it was queued: a week is long enough for the order to have been refunded or
   * returned, and asking those people for a review would be the worst email we
   * send.
   */
  private async sendReviewRequest(orderId: string): Promise<void> {
    const order = await this.load(orderId);
    if (!order) return;

    if (order.status !== OrderStatus.DELIVERED) {
      this.logger.log(
        `Skipping the review request for ${order.orderNumber} - it is now ${order.status}.`,
      );
      return;
    }

    const { email, name } = recipient(order);
    if (!email) return;

    await this.mail.sendReviewRequest(email, name, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      productNames: order.items.map((item) => item.productName),
    });
  }

  private async load(orderId: string): Promise<OrderWithRelations | null> {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { productName: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        user: { select: { email: true, fullName: true, phone: true } },
      },
    });
  }
}

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    items: { select: { productName: true } };
    payments: true;
    user: { select: { email: true; fullName: true; phone: true } };
  };
}>;

/**
 * Who to contact. A guest has no user row, so the address snapshot is the only
 * place their name and phone number exist.
 */
function recipient(order: OrderWithRelations): {
  email: string | null;
  name: string;
  phone: string | null;
} {
  const snapshot = readSnapshot(order.shippingAddress);

  return {
    email: order.user?.email ?? order.guestEmail ?? null,
    name: order.user?.fullName ?? snapshot.fullName ?? 'there',
    phone: order.user?.phone ?? snapshot.phone ?? null,
  };
}

function readSnapshot(value: Prisma.JsonValue): { fullName?: string; phone?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as { fullName?: unknown; phone?: unknown };

  return {
    fullName: typeof raw.fullName === 'string' ? raw.fullName : undefined,
    phone: typeof raw.phone === 'string' ? raw.phone : undefined,
  };
}
