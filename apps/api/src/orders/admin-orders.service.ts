import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canTransition,
  carrierLabel,
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
  PaymentStatus,
} from '@bazaar/shared';
import type {
  AdminOrderListItem,
  AdminOrderQueryInput,
  AdminRefundInput,
  BulkOrderStatusInput,
  OrderDetail,
  OrderShippingInput,
  Paginated,
  UpdateOrderStatusInput,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { OrderEventsService } from './order-events.service';
import { OrdersService, buildOrderMeta, endOfDay, toOrderListItem } from './orders.service';
import { round } from '../coupons/coupons.service';

const ADMIN_LIST_INCLUDE = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  user: { select: { fullName: true, email: true } },
} satisfies Prisma.OrderInclude;

type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof ADMIN_LIST_INCLUDE }>;

/** One failure from a bulk update, so the operator learns which rows did not move. */
export interface BulkStatusFailure {
  orderId: string;
  orderNumber: string;
  reason: string;
}

export interface BulkStatusResult {
  updated: number;
  failures: BulkStatusFailure[];
}

/**
 * The operations side of orders: the queue an operator works through, the
 * status they move it to, the consignment number they type in, and the money
 * they occasionally have to send back.
 *
 * The rule this class exists to enforce is that a status is not a column an
 * admin may set to anything. `ORDER_STATUS_TRANSITIONS` decides what may follow
 * what, so a mis-click cannot mark an unpaid order DELIVERED, and REFUNDED is
 * unreachable from here at all - it is a *consequence* of money moving, and
 * money moves through `refund()` or not at all.
 */
@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly events: OrderEventsService,
  ) {}

  /* ---------------------------------------------------------------------- */
  /*  Reads                                                                  */
  /* ---------------------------------------------------------------------- */

  async list(query: AdminOrderQueryInput): Promise<Paginated<AdminOrderListItem>> {
    const where = this.buildWhere(query);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ADMIN_LIST_INCLUDE,
        orderBy: sortOrder(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: orders.map(toAdminListItem),
      meta: buildOrderMeta(query.page, query.limit, total),
    };
  }

  /**
   * The same filtered set as `list`, flattened to CSV for a spreadsheet.
   *
   * Pagination is ignored on purpose - an export of page 1 of 40 is a bug
   * report waiting to happen - but the row count is capped, because a CSV built
   * in memory is the easiest way to take the API down with a single click.
   */
  async exportCsv(query: AdminOrderQueryInput): Promise<string> {
    const MAX_ROWS = 5000;

    const orders = await this.prisma.order.findMany({
      where: this.buildWhere(query),
      include: ADMIN_LIST_INCLUDE,
      orderBy: sortOrder(query.sort),
      take: MAX_ROWS,
    });

    const header = [
      'Order number',
      'Placed',
      'Status',
      'Customer',
      'Email',
      'District',
      'Items',
      'Payment method',
      'Payment status',
      'Subtotal',
      'Discount',
      'Shipping',
      'Tax',
      'Total',
      'Currency',
      'Carrier',
      'Tracking number',
    ];

    const rows = orders.map((order) => {
      const item = toAdminListItem(order);

      return [
        order.orderNumber,
        (order.placedAt ?? order.createdAt).toISOString(),
        order.status,
        item.customerName,
        item.customerEmail,
        item.district,
        String(item.itemCount),
        item.paymentMethod ?? '',
        item.paymentStatus ?? '',
        String(Number(order.subtotal)),
        String(Number(order.discountAmount)),
        String(Number(order.shippingCost)),
        String(Number(order.taxAmount)),
        String(Number(order.total)),
        order.currency,
        item.carrierLabel ?? '',
        order.trackingNumber ?? '',
      ];
    });

    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  /* ---------------------------------------------------------------------- */
  /*  Status                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Moves one order along the flow.
   *
   * Cancelling from here does everything the shopper's own cancellation does -
   * stock back, refund raised - because who clicked the button should not
   * change whether the customer gets their money. The one thing an operator can
   * do that a shopper cannot is cancel an order that is already PROCESSING.
   */
  async updateStatus(
    orderId: string,
    adminId: string,
    dto: UpdateOrderStatusInput,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!order) throw new NotFoundException('That order does not exist.');

    if (order.status === dto.status) {
      throw new BadRequestException(`This order is already ${labelFor(dto.status)}.`);
    }

    if (dto.status === OrderStatus.REFUNDED) {
      throw new BadRequestException(
        'Mark an order refunded by issuing the refund, not by setting the status - ' +
          'otherwise the money never leaves.',
      );
    }

    if (!canTransition(order.status, dto.status)) {
      const allowed = ORDER_STATUS_TRANSITIONS[order.status];

      throw new BadRequestException(
        allowed.length === 0
          ? `A ${labelFor(order.status)} order is final and cannot change status.`
          : `A ${labelFor(order.status)} order can only move to ` +
            `${allowed.map(labelFor).join(' or ')}.`,
      );
    }

    if (dto.status === OrderStatus.CANCELLED) {
      return this.cancelAsAdmin(orderId, adminId, dto.note ?? 'Cancelled by an operator.');
    }

    const note = dto.note?.trim() || defaultNote(dto.status);

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: dto.status,
          ...(dto.trackingNumber ? { trackingNumber: dto.trackingNumber } : {}),
          ...(dto.carrier ? { carrier: dto.carrier } : {}),
          // The delivery timestamp is what the review request counts its seven
          // days from, so it is stamped here rather than inferred later from a
          // history row that an operator might edit.
          ...(dto.status === OrderStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
          ...(dto.status === OrderStatus.CONFIRMED && !order.placedAt
            ? { placedAt: new Date() }
            : {}),
        },
      }),
      this.prisma.orderStatusHistory.create({
        data: { orderId, status: dto.status, changedBy: adminId, note: note.slice(0, 500) },
      }),
    ]);

    this.logger.log(`Order ${order.orderNumber} -> ${dto.status} by admin ${adminId}.`);

    await this.events.announce(orderId, { note });

    return this.orders.findDetail(orderId, undefined, true);
  }

  /**
   * The same move across a selection.
   *
   * Each order is updated in its own transaction and its own try block: a
   * hundred-row selection will contain rows at different statuses, and one that
   * cannot legally move should not roll back the ninety-nine that can. The
   * failures come back with reasons attached so the operator can see why.
   */
  async bulkStatus(adminId: string, dto: BulkOrderStatusInput): Promise<BulkStatusResult> {
    const failures: BulkStatusFailure[] = [];
    let updated = 0;

    for (const orderId of dto.orderIds) {
      try {
        await this.updateStatus(orderId, adminId, { status: dto.status, note: dto.note });
        updated += 1;
      } catch (error) {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { orderNumber: true },
        });

        failures.push({
          orderId,
          orderNumber: order?.orderNumber ?? orderId,
          reason: error instanceof Error ? error.message : 'Unknown error.',
        });
      }
    }

    return { updated, failures };
  }

  /* ---------------------------------------------------------------------- */
  /*  Shipping                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Records the consignment and, by default, marks the order shipped.
   *
   * Entering a tracking number *is* the evidence that the parcel was packed and
   * handed over, so this is allowed to jump a CONFIRMED order straight past
   * PROCESSING - it writes the intermediate row itself rather than pretending
   * the step never happened.
   */
  async addShipping(
    orderId: string,
    adminId: string,
    dto: OrderShippingInput,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true, trackingNumber: true },
    });

    if (!order) throw new NotFoundException('That order does not exist.');

    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException(
        `A ${labelFor(order.status)} order is not going anywhere - remove the consignment instead.`,
      );
    }

    const shipping = dto.markShipped && order.status !== OrderStatus.DELIVERED;
    const note =
      dto.note?.trim() ||
      `${order.trackingNumber ? 'Tracking updated' : 'Handed to'} ${carrierLabel(dto.carrier)}: ${dto.trackingNumber}.`;

    const writes: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          trackingNumber: dto.trackingNumber,
          carrier: dto.carrier,
          ...(shipping ? { status: OrderStatus.SHIPPED } : {}),
        },
      }),
    ];

    if (shipping) {
      // The skipped step is written explicitly so the timeline stays a truthful
      // record: the parcel really was picked and packed, just not clicked.
      if (order.status === OrderStatus.CONFIRMED) {
        writes.push(
          this.prisma.orderStatusHistory.create({
            data: {
              orderId,
              status: OrderStatus.PROCESSING,
              changedBy: adminId,
              note: 'Packed for dispatch.',
            },
          }),
        );
      }

      writes.push(
        this.prisma.orderStatusHistory.create({
          data: {
            orderId,
            status: OrderStatus.SHIPPED,
            changedBy: adminId,
            note: note.slice(0, 500),
          },
        }),
      );
    }

    await this.prisma.$transaction(writes);

    this.logger.log(
      `Order ${order.orderNumber}: ${dto.carrier} ${dto.trackingNumber}${
        shipping ? ' (marked shipped)' : ''
      }.`,
    );

    // Announced whether or not the status moved: adding a tracking number to an
    // order that was already SHIPPED is precisely the case where the shopper is
    // waiting for the link, and that mail would otherwise never be sent.
    await this.events.announce(orderId, { note });

    return this.orders.findDetail(orderId, undefined, true);
  }

  /* ---------------------------------------------------------------------- */
  /*  Refunds                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Sends money back through the gateway that took it.
   *
   * The amount is clamped against what is actually refundable - the captured
   * total minus anything already returned - and computed from the payment row,
   * never from the request. A client asking to refund more than was charged is
   * either confused or hostile, and both get the same answer.
   *
   * The order only becomes REFUNDED once the refunds cover the whole total; a
   * partial goodwill refund leaves a DELIVERED order delivered, because it is.
   */
  async refund(orderId: string, adminId: string, dto: AdminRefundInput): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'desc' }, include: { refunds: true } },
      },
    });

    if (!order) throw new NotFoundException('That order does not exist.');

    const payment = order.payments[0];

    if (!payment) {
      throw new BadRequestException('No payment was ever recorded against this order.');
    }

    const alreadyRefunded = round(
      order.payments
        .flatMap((row) => row.refunds)
        .filter((refund) => refund.status !== 'FAILED')
        .reduce((sum, refund) => sum + Number(refund.amount), 0),
    );

    const refundable = round(Number(payment.amount) - alreadyRefunded);

    if (refundable <= 0) {
      throw new BadRequestException('This order has already been refunded in full.');
    }

    const amount = round(dto.amount ?? refundable);

    if (amount > refundable) {
      throw new BadRequestException(
        `Only ${order.currency} ${refundable.toFixed(2)} is left to refund on this order.`,
      );
    }

    const outcome = await this.payments.refund(payment.id, amount, dto.reason);

    if (outcome.status === 'SKIPPED') {
      throw new BadRequestException(outcome.message);
    }

    const settled = round(alreadyRefunded + amount);
    const isFull = settled >= round(Number(payment.amount));

    await this.prisma.$transaction(async (tx) => {
      if (dto.restock) {
        for (const item of order.items) {
          if (!item.variantId) continue;

          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
      }

      if (isFull && order.status !== OrderStatus.REFUNDED) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.REFUNDED },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: isFull ? OrderStatus.REFUNDED : order.status,
          changedBy: adminId,
          note: `Refunded ${order.currency} ${amount.toFixed(2)} — ${dto.reason}`.slice(0, 500),
        },
      });
    });

    this.logger.log(
      `Refunded ${order.currency} ${amount.toFixed(2)} on ${order.orderNumber} ` +
        `(${outcome.status}${outcome.isAutomated ? '' : ', manual'}) by admin ${adminId}.`,
    );

    await this.events.announceRefund(orderId, amount, dto.reason, methodLabel(payment.method));
    // Silent: the refund mail above already says everything the status change
    // would, and two emails about one refund reads as a double refund.
    await this.events.announce(orderId, { note: dto.reason, silent: true });

    return this.orders.findDetail(orderId, undefined, true);
  }

  /* ---------------------------------------------------------------------- */
  /*  Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private async cancelAsAdmin(
    orderId: string,
    adminId: string,
    reason: string,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const payment = order.payments[0];

    // Attempted before the status flips, for the same reason the customer path
    // does it: a gateway that refuses leaves the order visibly uncancelled
    // rather than cancelled-but-not-paid-back.
    if (payment && payment.status === PaymentStatus.COMPLETED) {
      await this.payments.refund(payment.id, Number(payment.amount), reason);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.variantId) continue;

        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED, cancelledReason: reason.slice(0, 500) },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.CANCELLED,
          changedBy: adminId,
          note: reason.slice(0, 500),
        },
      });

      await tx.couponUsage.deleteMany({ where: { orderId } });
    });

    this.logger.log(`Order ${order.orderNumber} cancelled by admin ${adminId}: ${reason}`);

    await this.events.announce(orderId, { note: reason });

    return this.orders.findDetail(orderId, undefined, true);
  }

  private buildWhere(query: AdminOrderQueryInput): Prisma.OrderWhereInput {
    const search = query.search?.trim();

    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: endOfDay(query.to) } : {}),
            },
          }
        : {}),
      ...(query.paymentMethod || query.paymentStatus
        ? {
            payments: {
              some: {
                ...(query.paymentMethod ? { method: query.paymentMethod } : {}),
                ...(query.paymentStatus ? { status: query.paymentStatus } : {}),
              },
            },
          }
        : {}),
      // The dispatch worklist: paid for, not yet handed to a courier.
      ...(query.awaitingShipment
        ? {
            trackingNumber: null,
            status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING] },
          }
        : {}),
      // One box searching an order number, a customer name and an email,
      // because an operator on the phone has whichever of the three the caller
      // can read out - not the one a dedicated field would have asked for.
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { guestEmail: { contains: search, mode: 'insensitive' } },
              { trackingNumber: { contains: search, mode: 'insensitive' } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
              { user: { fullName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function toAdminListItem(order: AdminOrderRow): AdminOrderListItem {
  const base = toOrderListItem(order);
  const payment = order.payments[0] ?? null;
  const address = order.shippingAddress as { fullName?: string; district?: string } | null;

  return {
    ...base,
    customerName: order.user?.fullName ?? address?.fullName ?? 'Guest',
    customerEmail: order.user?.email ?? order.guestEmail ?? '',
    paymentMethod: payment?.method ?? null,
    paymentStatus: payment?.status ?? null,
    itemsTotal: Number(order.subtotal),
    district: address?.district ?? '',
  };
}

function sortOrder(sort: AdminOrderQueryInput['sort']): Prisma.OrderOrderByWithRelationInput {
  switch (sort) {
    case 'oldest':
      return { createdAt: 'asc' };
    case 'total_high':
      return { total: 'desc' };
    case 'total_low':
      return { total: 'asc' };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

function defaultNote(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return 'Order confirmed.';
    case OrderStatus.PROCESSING:
      return 'Packing your order.';
    case OrderStatus.SHIPPED:
      return 'Handed to the courier.';
    case OrderStatus.DELIVERED:
      return 'Delivered.';
    default:
      return `Status set to ${labelFor(status)}.`;
  }
}

function labelFor(status: string): string {
  return status.toLowerCase();
}

function methodLabel(method: string): string {
  switch (method) {
    case 'STRIPE':
      return 'card';
    case 'COD':
      return 'cash';
    case 'BANK_TRANSFER':
      return 'bank';
    case 'IME_PAY':
      return 'IME Pay';
    case 'CONNECTIPS':
      return 'ConnectIPS';
    default:
      return method.charAt(0) + method.slice(1).toLowerCase();
  }
}

/**
 * RFC 4180 quoting.
 *
 * The leading-character guard is the one that matters: Excel treats a cell
 * starting with `=`, `+`, `-` or `@` as a formula, so a customer who names
 * themselves `=cmd|...` gets their name executed on an operator's machine when
 * the export is opened. Prefixing a quote neutralises it and still reads as the
 * original text.
 */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}
