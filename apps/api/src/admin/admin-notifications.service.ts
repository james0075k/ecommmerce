import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma, UserRole } from '@prisma/client';
import type {
  AdminNotification,
  AdminNotificationKind,
  AdminNotificationQueryInput,
  MarkNotificationsInput,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AdminGateway } from './admin.gateway';

interface NotifyInput {
  kind: AdminNotificationKind;
  title: string;
  body: string;
  href?: string | null;
  data?: Record<string, unknown>;
}

/**
 * The notifications bell.
 *
 * Stored per admin rather than once globally, because "read" is a property of a
 * person, not of an event: two operators working the same queue each need their
 * own unread count, and a shared row would let one of them silence the other's
 * bell. The fan-out is a handful of rows for a handful of staff - cheap enough
 * that the alternative (one row plus a read-receipts table) would be complexity
 * bought for nothing at this scale.
 *
 * The websocket push and the database row are deliberately separate concerns:
 * the row is the record, the push is a convenience for whoever happens to be
 * looking. An operator who was offline when an order landed still sees it in
 * the bell when they open the tab.
 */
@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AdminGateway,
  ) {}

  /**
   * Records a notification for every admin and pushes it to the ones connected.
   *
   * Never throws: this is always called *after* the thing it describes has been
   * committed, so failing here would report an error for work that succeeded.
   */
  async notify(input: NotifyInput): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (admins.length === 0) return;

      const payload = {
        kind: input.kind,
        href: input.href ?? null,
        ...input.data,
      } satisfies Record<string, unknown>;

      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: kindToType(input.kind),
          title: input.title.slice(0, 160),
          body: input.body.slice(0, 1000),
          data: payload as Prisma.InputJsonValue,
        })),
      });

      // The broadcast carries a synthetic id: every admin holds a *different*
      // row for this event, so no single database id is correct for all of
      // them. The client uses it only to de-duplicate what it has already
      // rendered, and refetches to get its own real rows.
      this.gateway.broadcast({
        id: `live-${Date.now().toString(36)}`,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        data: input.data ?? null,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Could not raise admin notification ${input.kind}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async list(
    adminId: string,
    query: AdminNotificationQueryInput,
  ): Promise<{ items: AdminNotification[]; unread: number }> {
    const where: Prisma.NotificationWhereInput = {
      userId: adminId,
      ...(query.unreadOnly && { isRead: false }),
    };

    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
      this.prisma.notification.count({ where: { userId: adminId, isRead: false } }),
    ]);

    return { items: rows.map(toAdminNotification), unread };
  }

  /** Marks the given ids read, or everything when `ids` is omitted. */
  async markRead(adminId: string, input: MarkNotificationsInput): Promise<{ unread: number }> {
    await this.prisma.notification.updateMany({
      where: {
        userId: adminId,
        isRead: false,
        ...(input.ids?.length && { id: { in: input.ids } }),
      },
      data: { isRead: true },
    });

    const unread = await this.prisma.notification.count({
      where: { userId: adminId, isRead: false },
    });

    return { unread };
  }

  /* ---------------------------------------------------------------------- */
  /*  Convenience wrappers, so callers do not hand-write copy                */
  /* ---------------------------------------------------------------------- */

  orderPlaced(order: { id: string; orderNumber: string; total: unknown; customer: string }): Promise<void> {
    return this.notify({
      kind: 'ORDER_PLACED',
      title: `New order ${order.orderNumber}`,
      body: `${order.customer} placed an order for ${formatAmount(order.total)}.`,
      href: `/admin/orders?search=${encodeURIComponent(order.orderNumber)}`,
      data: { orderId: order.id, orderNumber: order.orderNumber },
    });
  }

  orderPaid(order: { id: string; orderNumber: string; total: unknown }): Promise<void> {
    return this.notify({
      kind: 'ORDER_PAID',
      title: `Payment received for ${order.orderNumber}`,
      body: `${formatAmount(order.total)} has settled.`,
      href: `/admin/orders?search=${encodeURIComponent(order.orderNumber)}`,
      data: { orderId: order.id, orderNumber: order.orderNumber },
    });
  }

  orderCancelled(order: { id: string; orderNumber: string; reason?: string | null }): Promise<void> {
    return this.notify({
      kind: 'ORDER_CANCELLED',
      title: `${order.orderNumber} was cancelled`,
      body: order.reason ?? 'No reason was recorded.',
      href: `/admin/orders?search=${encodeURIComponent(order.orderNumber)}`,
      data: { orderId: order.id, orderNumber: order.orderNumber },
    });
  }

  refundIssued(order: { id: string; orderNumber: string; amount: unknown }): Promise<void> {
    return this.notify({
      kind: 'REFUND_ISSUED',
      title: `Refund issued on ${order.orderNumber}`,
      body: `${formatAmount(order.amount)} was sent back to the customer.`,
      href: `/admin/orders?search=${encodeURIComponent(order.orderNumber)}`,
      data: { orderId: order.id, orderNumber: order.orderNumber },
    });
  }

  contactReceived(message: { id: string; name: string; subject: string }): Promise<void> {
    return this.notify({
      kind: 'CONTACT_MESSAGE',
      title: 'New contact message',
      body: `${message.name}: ${message.subject}`,
      href: '/admin/contacts',
      data: { contactId: message.id },
    });
  }

  lowStock(variant: { id: string; sku: string; productName: string; quantity: number }): Promise<void> {
    return this.notify({
      kind: 'LOW_STOCK',
      title: `Low stock: ${variant.productName}`,
      body: `${variant.sku} is down to ${variant.quantity} unit${variant.quantity === 1 ? '' : 's'}.`,
      href: '/admin/products',
      data: { variantId: variant.id, sku: variant.sku },
    });
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Order events keep the ORDER type so they group with the shopper's own order
 * notifications in any shared view; everything else is store housekeeping.
 */
function kindToType(kind: AdminNotificationKind): NotificationType {
  return kind.startsWith('ORDER_') || kind === 'REFUND_ISSUED'
    ? NotificationType.ORDER
    : NotificationType.SYSTEM;
}

function toAdminNotification(row: {
  id: string;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  isRead: boolean;
  createdAt: Date;
}): AdminNotification {
  const data = (row.data ?? {}) as Record<string, unknown>;

  return {
    id: row.id,
    kind: (typeof data.kind === 'string' ? data.kind : 'ORDER_PLACED') as AdminNotificationKind,
    title: row.title,
    body: row.body,
    href: typeof data.href === 'string' ? data.href : null,
    data,
    read: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Prisma hands back Decimal; the copy only ever needs a rounded rupee figure. */
function formatAmount(value: unknown): string {
  const amount = Prisma.Decimal.isDecimal(value) ? value.toNumber() : Number(value ?? 0);
  return `Rs ${Math.round(amount).toLocaleString('en-NP')}`;
}
