import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction, NotificationType, OrderStatus, Prisma, UserRole } from '@prisma/client';
import type {
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminCustomerQueryInput,
  CustomerCommunicationRow,
  CustomerMessageInput,
  CustomerStatusInput,
  Paginated,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notifications/mail.service';
import { ActivityLogService } from './activity-log.service';

/**
 * Orders that represent money the store actually kept.
 *
 * Lifetime value counts DELIVERED and the statuses still on their way there;
 * a cancelled or refunded order is revenue that came back out, and counting it
 * would rank a serial returner as the best customer in the store.
 */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

/**
 * The people behind the orders.
 *
 * The list is deliberately computed from `orders` rather than a cached total on
 * `users`: a denormalised lifetime value is wrong the moment a refund lands,
 * and nobody notices until a customer is comped for spending they got back. At
 * this scale the aggregate is cheap; when it stops being cheap it becomes a
 * materialised view, not a column.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly activity: ActivityLogService,
  ) {}

  async list(query: AdminCustomerQueryInput): Promise<Paginated<AdminCustomerListItem>> {
    const where: Prisma.UserWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.role && { role: query.role }),
      ...(query.hasOrders && { orders: { some: {} } }),
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { phone: { contains: query.search } },
        ],
      }),
    };

    // Sorting by a computed figure cannot be pushed into the same query that
    // pages the rows, so those two sorts fetch a bounded candidate set and rank
    // it here. The cap keeps a "top spenders" view from turning into a full
    // table scan serialised through Node.
    const computedSort = query.sort === 'ltv_high' || query.sort === 'orders_high';
    const take = computedSort ? Math.min(500, query.page * query.limit + 200) : query.limit;
    const skip = computedSort ? 0 : (query.page - 1) * query.limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: orderByFor(query.sort),
        skip,
        take,
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    const stats = await this.statsFor(users.map((user) => user.id));

    let items = users.map((user) => toListItem(user, stats.get(user.id)));

    if (computedSort) {
      items.sort((a, b) =>
        query.sort === 'ltv_high'
          ? b.lifetimeValue - a.lifetimeValue
          : b.orderCount - a.orderCount,
      );
      items = items.slice((query.page - 1) * query.limit, query.page * query.limit);
    }

    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNext: query.page < totalPages,
        hasPrev: query.page > 1,
      },
    };
  }

  async findOne(id: string): Promise<AdminCustomerDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SELECT,
        addresses: {
          where: { deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
        _count: { select: { reviews: true, wishlists: true, cartItems: true, couponUsages: true } },
      },
    });

    if (!user) throw new NotFoundException('No such customer.');

    const [orders, notifications, contacts, refunded] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          currency: true,
          createdAt: true,
          placedAt: true,
          shippingAddress: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.notification.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      // Matched on email rather than a foreign key: the contact form is open to
      // guests, so a message may predate the account it clearly belongs to.
      this.prisma.contactMessage.findMany({
        where: { email: user.email },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.refund.aggregate({
        where: { status: 'COMPLETED', payment: { order: { userId: id } } },
        _sum: { amount: true },
      }),
    ]);

    const revenueOrders = orders.filter((order) => REVENUE_STATUSES.includes(order.status));
    const lifetimeValue = revenueOrders.reduce((sum, order) => sum + order.total.toNumber(), 0);

    const communications: CustomerCommunicationRow[] = [
      ...notifications.map((row) => ({
        id: row.id,
        channel: 'NOTIFICATION' as const,
        title: row.title,
        body: row.body,
        status: row.isRead ? 'Read' : 'Unread',
        createdAt: row.createdAt.toISOString(),
      })),
      ...contacts.map((row) => ({
        id: row.id,
        channel: 'CONTACT' as const,
        title: row.subject,
        body: row.message,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const districts = [
      ...new Set(
        orders
          .map((order) => readDistrict(order.shippingAddress))
          .filter((district): district is string => Boolean(district)),
      ),
    ];

    const placedDates = orders
      .map((order) => order.placedAt ?? order.createdAt)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      ...toListItem(user, {
        orderCount: revenueOrders.length,
        lifetimeValue,
        lastOrderAt: placedDates.at(-1) ?? null,
      }),
      averageOrderValue: revenueOrders.length > 0 ? lifetimeValue / revenueOrders.length : 0,
      firstOrderAt: placedDates[0]?.toISOString() ?? null,
      totalRefunded: refunded._sum.amount?.toNumber() ?? 0,
      reviewCount: user._count.reviews,
      wishlistCount: user._count.wishlists,
      cartItemCount: user._count.cartItems,
      couponsUsed: user._count.couponUsages,
      addresses: user.addresses.map((address) => ({
        id: address.id,
        label: address.label,
        fullName: address.fullName,
        phone: address.phone,
        street: address.street,
        city: address.city,
        district: address.district,
        province: address.province,
        country: address.country,
        isDefault: address.isDefault,
      })),
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total.toNumber(),
        currency: order.currency,
        itemCount: order._count.items,
        placedAt: (order.placedAt ?? order.createdAt).toISOString(),
      })),
      communications,
      districts,
    };
  }

  /**
   * Suspends, bans or reinstates an account.
   *
   * A SUPER_ADMIN cannot be touched from here at all. The panel is the widest
   * blast radius in the application, and "an admin account was suspended by
   * another admin" is a support call at best and a lockout at worst - that
   * change belongs in a deliberate database operation, not a dropdown.
   */
  async setStatus(
    id: string,
    adminId: string,
    dto: CustomerStatusInput,
  ): Promise<AdminCustomerDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true, fullName: true, email: true },
    });

    if (!user) throw new NotFoundException('No such customer.');

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('A super admin account cannot be changed from the panel.');
    }

    if (user.id === adminId) {
      throw new BadRequestException('You cannot change the status of your own account.');
    }

    if (user.status === dto.status) return this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: dto.status } });

      // A suspended account must not keep browsing on the token it already
      // holds, so every live session is revoked in the same transaction.
      if (dto.status !== 'ACTIVE') {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    await this.activity.record({
      action: AdminAction.UPDATE,
      entityType: 'customer',
      entityId: id,
      summary: `${user.email} set to ${dto.status}`,
      before: { status: user.status },
      after: { status: dto.status },
      meta: { reason: dto.reason ?? null },
    });

    return this.findOne(id);
  }

  /**
   * Sends a message from the customer's detail page.
   *
   * The notification row is written first and the email second: a bell entry
   * with no email is an inconvenience, an email with no record of it having
   * been sent is a support agent repeating themselves. Mail failures are
   * reported in the result rather than thrown, since the message *was* filed.
   */
  async sendMessage(
    id: string,
    dto: CustomerMessageInput,
  ): Promise<{ delivered: boolean; channel: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true },
    });

    if (!user) throw new NotFoundException('No such customer.');

    await this.prisma.notification.create({
      data: {
        userId: id,
        type: NotificationType.SYSTEM,
        title: dto.subject,
        body: dto.body,
        data: { source: 'admin' } as Prisma.InputJsonValue,
      },
    });

    let delivered = dto.channel === 'NOTIFICATION';

    if (dto.channel === 'EMAIL') {
      delivered = await this.mail
        .sendAdminMessage(user.email, user.fullName, dto.subject, dto.body)
        .then(() => true)
        .catch(() => false);
    }

    await this.activity.record({
      action: AdminAction.CREATE,
      entityType: 'customer_message',
      entityId: id,
      summary: `Message sent to ${user.email}`,
      meta: { channel: dto.channel, subject: dto.subject, delivered },
    });

    return { delivered, channel: dto.channel };
  }

  /* ---------------------------------------------------------------------- */

  /**
   * Order count, lifetime value and last order date for a batch of users.
   *
   * One grouped query for the whole page rather than one per row - the N+1 here
   * would be invisible in development against ten seeded customers and very
   * visible in production against a thousand.
   */
  private async statsFor(userIds: string[]): Promise<Map<string, CustomerStats>> {
    const stats = new Map<string, CustomerStats>();
    if (userIds.length === 0) return stats;

    const grouped = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: { in: REVENUE_STATUSES } },
      _count: { _all: true },
      _sum: { total: true },
      _max: { createdAt: true },
    });

    for (const row of grouped) {
      if (!row.userId) continue;
      stats.set(row.userId, {
        orderCount: row._count._all,
        lifetimeValue: row._sum.total?.toNumber() ?? 0,
        lastOrderAt: row._max.createdAt,
      });
    }

    return stats;
  }
}

/* -------------------------------------------------------------------------- */

interface CustomerStats {
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: Date | null;
}

const USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerified: true,
  phoneVerified: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toListItem(user: UserRow, stats: CustomerStats | undefined): AdminCustomerListItem {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    orderCount: stats?.orderCount ?? 0,
    lifetimeValue: stats?.lifetimeValue ?? 0,
    lastOrderAt: stats?.lastOrderAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

function orderByFor(sort: AdminCustomerQueryInput['sort']): Prisma.UserOrderByWithRelationInput {
  switch (sort) {
    case 'oldest':
      return { createdAt: 'asc' };
    case 'name':
      return { fullName: 'asc' };
    // The computed sorts still need a stable base order for the candidate set.
    case 'ltv_high':
    case 'orders_high':
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

/** The shipping address is a JSONB snapshot, so its shape is not guaranteed. */
function readDistrict(address: Prisma.JsonValue): string | null {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return null;
  const district = (address as Record<string, unknown>).district;
  return typeof district === 'string' ? district : null;
}

