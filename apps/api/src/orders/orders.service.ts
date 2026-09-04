import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  CANCELLABLE_ORDER_STATUSES,
  carrierLabel,
  DEFAULT_TAX_RATE,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SHIPPING_METHODS,
  shippingZoneFor,
  trackingUrlFor,
} from '@bazaar/shared';
import type {
  AddressInput,
  CheckoutInput,
  CheckoutResult,
  OrderAddressView,
  OrderDetail,
  OrderItemView,
  OrderListItem,
  OrderQueryInput,
  OrderRefundView,
  OrderTimelineEntry,
  OrderView,
  Paginated,
  ShippingMethodId,
  SupportedCurrency,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { CouponsService, round } from '../coupons/coupons.service';
import { PaymentsService } from '../payments/payments.service';
import { ShippingService } from '../shipping/shipping.service';
import { OrderEventsService } from './order-events.service';
import type { CartOwner } from '../cart/cart-session';

const ORDER_INCLUDE = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/**
 * The detail read pulls the whole history and every refund alongside the order.
 * It is one query rather than three because the timeline is the point of the
 * page - a detail view that renders its steps a beat after the rest of the card
 * looks broken, however fast each request is on its own.
 */
const ORDER_DETAIL_INCLUDE = {
  items: true,
  payments: {
    orderBy: { createdAt: 'desc' as const },
    include: { refunds: { orderBy: { createdAt: 'asc' as const } } },
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: { admin: { select: { fullName: true } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

/** The list needs the lines for the quick-view expansion, but no history. */
const ORDER_LIST_INCLUDE = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly coupons: CouponsService,
    private readonly shipping: ShippingService,
    private readonly payments: PaymentsService,
    private readonly events: OrderEventsService,
  ) {}

  /* ---------------------------------------------------------------------- */
  /*  Checkout                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Turns a cart into an order.
   *
   * The whole thing is one transaction, and the order it does things in is the
   * point: stock is decremented *before* the order is written, using a
   * conditional update that fails if someone else took the last unit first.
   * Reserving after writing the order would let two shoppers both "buy" the
   * same last item and leave an operator to pick a loser.
   *
   * D2: every figure is recomputed here. Nothing the client sent about money is
   * read at all.
   */
  async checkout(
    owner: CartOwner,
    dto: CheckoutInput,
    userId: string | undefined,
  ): Promise<CheckoutResult> {
    const cart = await this.cart.getCart(owner);

    if (cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty.');
    }

    if (!cart.isCheckoutReady) {
      throw new ConflictException(
        'Some items in your cart are no longer available. Review your cart and try again.',
      );
    }

    const shippingAddress = await this.resolveAddress(
      userId,
      dto.shippingAddressId,
      dto.shippingAddress,
    );

    const billingAddress = dto.billingAddressId || dto.billingAddress
      ? await this.resolveAddress(userId, dto.billingAddressId, dto.billingAddress)
      : null;

    const email = await this.resolveEmail(userId, dto.guestEmail);

    // --- Money, computed from the database ------------------------------- //

    const subtotal = round(cart.items.reduce((sum, item) => sum + item.lineTotal, 0));
    const shippingMethod = this.shipping.isValidMethod(dto.shippingMethod)
      ? dto.shippingMethod
      : this.shipping.defaultMethod;

    const shippingCost = this.shipping.costFor(
      shippingMethod,
      shippingAddress.district,
      subtotal,
    );

    // Re-validated here, not carried over from the drawer: a coupon can expire
    // or hit its usage limit between the shopper reading the total and pressing
    // Place Order, and the order must be written with the discount that is
    // actually valid at this instant.
    const coupon = dto.couponCode
      ? await this.coupons
          .validate(dto.couponCode, {
            userId,
            lines: await this.cart.eligibleLines(owner),
            subtotal,
            shipping: shippingCost,
          })
          .catch(() => null)
      : null;

    const discountAmount = coupon?.type === 'FREE_SHIPPING' ? 0 : (coupon?.discountAmount ?? 0);
    const effectiveShipping = coupon?.type === 'FREE_SHIPPING' ? 0 : shippingCost;

    // F1.6: 13% VAT on the discounted goods value. Shipping is not taxed
    // separately here - the courier invoices that VAT themselves.
    const taxable = Math.max(0, subtotal - discountAmount);
    const taxAmount = round(taxable * DEFAULT_TAX_RATE);
    const total = round(taxable + effectiveShipping + taxAmount);

    const currency = cart.summary.currency;

    // --- Write ------------------------------------------------------------ //

    const order = await this.prisma.$transaction(async (tx) => {
      // Conditional decrements. `updateMany` with a `gte` guard is what makes
      // this safe under concurrency: it matches zero rows if the stock has
      // already gone, and we treat that as the sale being lost.
      for (const item of cart.items) {
        const claimed = await tx.productVariant.updateMany({
          where: { id: item.variant.id, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        if (claimed.count === 0) {
          throw new ConflictException(
            `${item.product.name} sold out while you were checking out. Please review your cart.`,
          );
        }
      }

      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId: userId ?? null,
          guestEmail: userId ? null : email,
          status: OrderStatus.PENDING,
          subtotal,
          discountAmount,
          shippingCost: effectiveShipping,
          taxAmount,
          total,
          currency,
          // Snapshots, not references: the shopper may edit or delete the
          // address in their book afterwards, and the order must still show
          // where it was actually sent. The chosen shipping method rides along
          // here rather than earning a column of its own.
          shippingAddress: {
            ...toAddressSnapshot(shippingAddress),
            shippingMethod,
          } satisfies Record<string, unknown> as Prisma.InputJsonValue,
          billingAddress: billingAddress
            ? ({ ...toAddressSnapshot(billingAddress) } satisfies Record<
                string,
                unknown
              > as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          notes: dto.notes ?? null,
          items: {
            create: cart.items.map((item) => ({
              productId: item.product.id,
              variantId: item.variant.id,
              productName: item.product.name,
              variantName: item.variant.name,
              sku: item.variant.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.lineTotal,
              // D2: a snapshot, so the line still renders correctly years later
              // even if the product is renamed, re-priced or deleted.
              productSnapshot: {
                slug: item.product.slug,
                brand: item.product.brand,
                imageUrl: item.product.image?.url ?? null,
                attributes: item.variant.attributes,
                capturedAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            })),
          },
          statusHistory: {
            create: { status: OrderStatus.PENDING, note: 'Order placed.' },
          },
        },
        include: ORDER_INCLUDE,
      });

      if (coupon) {
        await tx.couponUsage.create({
          data: {
            coupon: { connect: { code: coupon.code } },
            ...(userId ? { user: { connect: { id: userId } } } : {}),
            order: { connect: { id: created.id } },
          },
        });

        await tx.coupon.update({
          where: { code: coupon.code },
          data: { usedCount: { increment: 1 } },
        });
      }

      return created;
    });

    // --- Payment ---------------------------------------------------------- //

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method: dto.paymentMethod,
        status: PaymentStatus.PENDING,
        amount: total,
        currency,
        // D2: the gateway's dedupe key, so a retried webhook cannot double-pay.
        idempotencyKey: `checkout:${order.id}`,
      },
    });

    const init = await this.payments.initiate(dto.paymentMethod, {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        total,
        currency: currency as SupportedCurrency,
        subtotal,
        shippingCost: effectiveShipping,
        taxAmount,
      },
      paymentId: payment.id,
      customer: {
        email,
        fullName: shippingAddress.fullName,
        phone: shippingAddress.phone,
      },
    });

    // COD is committed the moment it is chosen - the shopper has agreed to buy,
    // and the payment stays PENDING until the courier collects the cash.
    if (dto.paymentMethod === PaymentMethod.COD) {
      await this.confirmCashOnDelivery(order.id);
    }

    // The cart is only emptied once an order exists to replace it. Clearing it
    // earlier would lose the basket if the gateway refused.
    await this.cart.clear(owner);

    const finalOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: ORDER_INCLUDE,
    });

    this.logger.log(
      `Order ${order.orderNumber} placed (${dto.paymentMethod}, ${currency} ${total}).`,
    );

    return { order: toOrderView(finalOrder), payment: init };
  }

  /* ---------------------------------------------------------------------- */
  /*  Reads                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * One order, scoped to whoever may see it.
   *
   * A guest order has no user id, so it is reachable by anyone holding the
   * order id - which is a uuid, and is the only thing the confirmation email
   * links to. A *signed-in* shopper's order is never readable by another
   * account.
   */
  async findOne(orderId: string, userId: string | undefined): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!order) throw new NotFoundException('That order does not exist.');

    if (order.userId && order.userId !== userId) {
      throw new ForbiddenException('That order belongs to another account.');
    }

    return toOrderView(order);
  }

  /**
   * The shopper's own order history, paginated and filterable.
   *
   * `to` is pushed to the end of its day before it is used as a bound. A shopper
   * picking "1 Sep to 8 Sep" in a date range means both days inclusive; a naive
   * `lte` on a midnight timestamp silently drops everything they bought on the
   * 8th, which reads as lost orders rather than as an off-by-one.
   */
  async listForUser(userId: string, query: OrderQueryInput): Promise<Paginated<OrderListItem>> {
    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: endOfDay(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? { orderNumber: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.paymentMethod ? { payments: { some: { method: query.paymentMethod } } } : {}),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: orders.map(toOrderListItem),
      meta: buildOrderMeta(query.page, query.limit, total),
    };
  }

  /**
   * One order with its full history, for the detail page.
   *
   * Visibility is the same rule `findOne` applies - a guest order is reachable
   * by its uuid, a customer's order is not reachable by anyone else - with staff
   * additionally allowed through, since the admin table opens the same view.
   */
  async findDetail(
    orderId: string,
    userId: string | undefined,
    isStaff = false,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_DETAIL_INCLUDE,
    });

    if (!order) throw new NotFoundException('That order does not exist.');

    if (order.userId && order.userId !== userId && !isStaff) {
      throw new ForbiddenException('That order belongs to another account.');
    }

    return toOrderDetail(order);
  }

  /** The raw row, for the invoice generator. */
  async findForInvoice(orderId: string, userId: string | undefined): Promise<OrderRow> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!order) throw new NotFoundException('That order does not exist.');

    if (order.userId && order.userId !== userId) {
      throw new ForbiddenException('That order belongs to another account.');
    }

    return order;
  }

  /* ---------------------------------------------------------------------- */
  /*  Cancellation                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Cancels an order, refunds it and puts the stock back.
   *
   * The refund is attempted *before* the status flips, so a gateway that
   * refuses leaves the order visibly uncancelled rather than cancelled-but-
   * unpaid-back. Stock restoration and the status change then happen together
   * in one transaction.
   */
  async cancel(orderId: string, userId: string | undefined, reason: string): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!order) throw new NotFoundException('That order does not exist.');

    if (order.userId && order.userId !== userId) {
      throw new ForbiddenException('That order belongs to another account.');
    }

    if (!isCancellable(order.status)) {
      throw new BadRequestException(
        `An order that is already ${order.status.toLowerCase()} cannot be cancelled. ` +
          `Contact support to arrange a return.`,
      );
    }

    const payment = order.payments[0];

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
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledReason: reason.slice(0, 500),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: OrderStatus.CANCELLED,
          changedBy: userId ?? null,
          note: reason.slice(0, 500),
        },
      });

      // The coupon becomes usable again - it was never really spent.
      await tx.couponUsage.deleteMany({ where: { orderId: order.id } });
    });

    this.logger.log(`Order ${order.orderNumber} cancelled: ${reason}`);

    // Announced after the transaction, never inside it: a mail provider timing
    // out must not roll back a cancellation whose stock has already gone back.
    await this.events.announce(order.id, { note: reason });

    return this.findDetail(order.id, userId, true);
  }

  /* ---------------------------------------------------------------------- */
  /*  Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private async confirmCashOnDelivery(orderId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED, placedAt: new Date() },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.CONFIRMED,
          note: 'Cash on delivery - payment collected on arrival.',
        },
      }),
    ]);
  }

  /**
   * A saved address is re-read from the database rather than trusted from the
   * request, so a client cannot pass someone else's id and have it snapshotted
   * onto their own order.
   */
  private async resolveAddress(
    userId: string | undefined,
    addressId: string | undefined,
    inline: AddressInput | undefined,
  ): Promise<AddressInput> {
    if (addressId) {
      if (!userId) {
        throw new BadRequestException('Log in to use a saved address.');
      }

      const address = await this.prisma.address.findFirst({
        where: { id: addressId, userId, deletedAt: null },
      });

      if (!address) throw new NotFoundException('That address is not in your address book.');

      return {
        label: address.label,
        fullName: address.fullName,
        phone: address.phone,
        street: address.street,
        city: address.city,
        district: address.district as AddressInput['district'],
        province: address.province as AddressInput['province'],
        postalCode: address.postalCode,
        country: address.country,
        latitude: address.latitude === null ? null : Number(address.latitude),
        longitude: address.longitude === null ? null : Number(address.longitude),
        isDefault: address.isDefault,
      };
    }

    if (!inline) {
      throw new BadRequestException('A delivery address is required.');
    }

    return inline;
  }

  /** Signed-in shoppers use their account email; guests must supply one. */
  private async resolveEmail(
    userId: string | undefined,
    guestEmail: string | undefined,
  ): Promise<string> {
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (user) return user.email;
    }

    if (!guestEmail) {
      throw new BadRequestException('An email address is required so we can send your receipt.');
    }

    return guestEmail.toLowerCase();
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

export function isCancellable(status: string): boolean {
  return (CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * `ORD-YYYYMMDD-XXXX`, matching the pattern `orderSchema` enforces.
 *
 * The random suffix is 4 base32 chars from crypto randomness rather than a
 * daily counter: a counter leaks how many orders the shop takes, and guessing
 * a neighbour's order number would expose a guest order.
 */
function generateOrderNumber(): string {
  const now = new Date();
  const date =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, '0')}` +
    `${String(now.getDate()).padStart(2, '0')}`;

  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
  const suffix = Array.from(randomBytes(4))
    .map((byte) => alphabet[byte % alphabet.length])
    .join('');

  return `ORD-${date}-${suffix}`;
}

function toAddressSnapshot(address: AddressInput): OrderAddressView {
  return {
    fullName: address.fullName,
    phone: address.phone,
    street: address.street,
    city: address.city,
    district: address.district,
    province: address.province,
    postalCode: address.postalCode ?? null,
    country: address.country,
  };
}

export function toOrderView(order: OrderRow): OrderView {
  const shipping = readAddress(order.shippingAddress);
  const payment = order.payments[0];

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,

    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discountAmount),
    shippingCost: Number(order.shippingCost),
    taxAmount: Number(order.taxAmount),
    total: Number(order.total),

    items: order.items.map(toItemView),
    shippingAddress: shipping,
    billingAddress: order.billingAddress ? readAddress(order.billingAddress) : null,

    shippingMethod: readShippingMethod(order.shippingAddress),
    estimatedDeliveryDate: estimateDelivery(order, shipping.district),
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,

    payment: payment
      ? {
          id: payment.id,
          method: payment.method,
          status: payment.status,
          amount: Number(payment.amount),
          transactionId: payment.transactionId,
          paidAt: payment.paidAt?.toISOString() ?? null,
        }
      : null,

    notes: order.notes,
    cancelledReason: order.cancelledReason,

    placedAt: order.placedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),

    isCancellable: isCancellable(order.status),
  };
}

function toItemView(item: OrderRow['items'][number]): OrderItemView {
  const snapshot = (item.productSnapshot ?? {}) as {
    slug?: string;
    imageUrl?: string | null;
  };

  return {
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    productName: item.productName,
    variantName: item.variantName,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
    imageUrl: snapshot.imageUrl ?? null,
    slug: snapshot.slug ?? null,
  };
}

function readAddress(value: Prisma.JsonValue): OrderAddressView {
  const raw = (value ?? {}) as Partial<OrderAddressView>;

  return {
    fullName: raw.fullName ?? '',
    phone: raw.phone ?? '',
    street: raw.street ?? '',
    city: raw.city ?? '',
    district: raw.district ?? '',
    province: raw.province ?? '',
    postalCode: raw.postalCode ?? null,
    country: raw.country ?? 'Nepal',
  };
}

/** The chosen method rides along in the address snapshot - see `checkout`. */
function readShippingMethod(value: Prisma.JsonValue): ShippingMethodId {
  const raw = (value ?? {}) as { shippingMethod?: string };
  return raw.shippingMethod === 'EXPRESS' ? 'EXPRESS' : 'STANDARD';
}

/**
 * Counted from when the order was *placed*, not from now, so the date the
 * shopper was shown on the confirmation page does not creep forward every time
 * they reload it. Null until it is placed - an unpaid order has no clock.
 */
function estimateDelivery(order: OrderRow, district: string): string | null {
  if (!order.placedAt) return null;

  const methodId = readShippingMethod(order.shippingAddress);
  const method = SHIPPING_METHODS.find((candidate) => candidate.id === methodId);
  if (!method) return null;

  const [, maxDays] = method.etaDays[shippingZoneFor(district)];

  const date = new Date(order.placedAt);
  let remaining = maxDays;

  // Saturday is Nepal's weekly holiday; Friday is a working day.
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 6) remaining -= 1;
  }

  return date.toISOString();
}

/* -------------------------------------------------------------------------- */
/*  View mappers (Phase 6)                                                    */
/* -------------------------------------------------------------------------- */

export function toOrderDetail(order: OrderDetailRow): OrderDetail {
  const refunds = order.payments.flatMap((payment) => payment.refunds);

  return {
    ...toOrderView(order),
    timeline: order.statusHistory.map(toTimelineEntry),
    refunds: refunds.map(toRefundView),
    carrierLabel: carrierLabel(order.carrier),
    trackingUrl: trackingUrlFor(order.carrier, order.trackingNumber),
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    // Only settled refunds count. Showing a pending manual reversal as money
    // already returned would have support arguing with a customer's bank
    // statement.
    refundedAmount: round(
      refunds
        .filter((refund) => refund.status === 'COMPLETED')
        .reduce((sum, refund) => sum + Number(refund.amount), 0),
    ),
  };
}

function toTimelineEntry(entry: OrderDetailRow['statusHistory'][number]): OrderTimelineEntry {
  return {
    id: entry.id,
    status: entry.status,
    note: entry.note,
    changedByName: entry.admin?.fullName ?? null,
    createdAt: entry.createdAt.toISOString(),
  };
}

function toRefundView(
  refund: OrderDetailRow['payments'][number]['refunds'][number],
): OrderRefundView {
  return {
    id: refund.id,
    amount: Number(refund.amount),
    reason: refund.reason,
    status: refund.status,
    processedAt: refund.processedAt?.toISOString() ?? null,
    createdAt: refund.createdAt.toISOString(),
  };
}

export function toOrderListItem(order: OrderRow): OrderListItem {
  const items = order.items.map(toItemView);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    total: Number(order.total),
    // Units, not lines: "3 items" should mean three things in the box.
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    thumbnails: items
      .map((item) => item.imageUrl)
      .filter((url): url is string => Boolean(url))
      .slice(0, 3),
    items,
    trackingNumber: order.trackingNumber,
    carrierLabel: carrierLabel(order.carrier),
    trackingUrl: trackingUrlFor(order.carrier, order.trackingNumber),
    placedAt: order.placedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    isCancellable: isCancellable(order.status),
  };
}

export function buildOrderMeta(page: number, limit: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * A date filter's upper bound, inclusive of the whole day the operator picked.
 */
export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}
