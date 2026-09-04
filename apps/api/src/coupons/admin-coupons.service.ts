import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction, OrderStatus, Prisma } from '@prisma/client';
import type {
  AdminCouponDetail,
  AdminCouponListItem,
  AdminCouponQueryInput,
  CouponInput,
  CouponLifecycle,
  CouponUsageEntry,
  Paginated,
} from '@bazaar/shared';

import { ActivityLogService } from '../admin/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';

/** Orders whose value a coupon can honestly be said to have influenced. */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

/**
 * Coupon administration.
 *
 * The one rule worth stating: a coupon that has been redeemed is never deleted,
 * only disabled. `coupon_usage` rows point at it, an order's discount line was
 * priced by it, and a code that vanishes turns every one of those into an
 * unexplainable number in the accounts. Deactivating stops it being usable,
 * which is what "delete" actually means to the person asking for it.
 */
@Injectable()
export class AdminCouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async list(query: AdminCouponQueryInput): Promise<Paginated<AdminCouponListItem>> {
    const now = new Date();

    const where: Prisma.CouponWhereInput = {
      ...(query.search && {
        code: { contains: query.search.toUpperCase(), mode: 'insensitive' as const },
      }),
      ...(query.type && { type: query.type }),
      ...stateFilter(query.state, now),
    };

    const [coupons, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: orderByFor(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.coupon.count({ where }),
    ]);

    const stats = await this.statsFor(coupons.map((coupon) => coupon.id));
    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      items: coupons.map((coupon) => toListItem(coupon, stats.get(coupon.id), now)),
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

  async findOne(id: string): Promise<AdminCouponDetail> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        usages: {
          orderBy: { usedAt: 'desc' },
          take: 100,
          include: {
            user: { select: { fullName: true, email: true } },
            order: { select: { orderNumber: true, total: true, discountAmount: true } },
          },
        },
      },
    });

    if (!coupon) throw new NotFoundException('No such coupon.');

    const [stats, categories, products] = await Promise.all([
      this.statsFor([id]),
      coupon.applicableCategories.length > 0
        ? this.prisma.category.findMany({
            where: { id: { in: coupon.applicableCategories } },
            select: { name: true },
          })
        : Promise.resolve([]),
      coupon.applicableProducts.length > 0
        ? this.prisma.product.findMany({
            where: { id: { in: coupon.applicableProducts } },
            select: { name: true },
          })
        : Promise.resolve([]),
    ]);

    const usages: CouponUsageEntry[] = coupon.usages.map((usage) => ({
      id: usage.id,
      userId: usage.userId,
      userName: usage.user?.fullName ?? null,
      userEmail: usage.user?.email ?? null,
      orderId: usage.orderId,
      orderNumber: usage.order?.orderNumber ?? null,
      orderTotal: usage.order?.total.toNumber() ?? null,
      discountAmount: usage.order?.discountAmount.toNumber() ?? null,
      usedAt: usage.usedAt.toISOString(),
    }));

    return {
      ...toListItem(coupon, stats.get(id), new Date()),
      usages,
      categoryNames: categories.map((category) => category.name),
      productNames: products.map((product) => product.name),
    };
  }

  async create(dto: CouponInput): Promise<AdminCouponDetail> {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) throw new BadRequestException(`The code ${code} is already in use.`);

    await this.assertScopeExists(dto);

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        type: dto.type,
        value: dto.value,
        minOrderAmount: dto.minOrderAmount ?? null,
        maxDiscountAmount: dto.maxDiscountAmount ?? null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        validFrom: dto.validFrom,
        validUntil: dto.validUntil,
        applicableCategories: dto.applicableCategories,
        applicableProducts: dto.applicableProducts,
        isActive: dto.isActive,
      },
    });

    await this.activity.record({
      action: AdminAction.CREATE,
      entityType: 'coupon',
      entityId: coupon.id,
      summary: `Created coupon ${code}`,
      after: snapshot(coupon),
    });

    return this.findOne(coupon.id);
  }

  /**
   * Edits a coupon.
   *
   * The code itself is immutable once anyone has redeemed it: `coupon_usage`
   * records which coupon, but the order's discount line and the customer's
   * receipt both say the *code*, and renaming it makes those two disagree with
   * no way to reconcile them afterwards.
   */
  async update(id: string, dto: CouponInput): Promise<AdminCouponDetail> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('No such coupon.');

    const code = dto.code.trim().toUpperCase();

    if (code !== existing.code) {
      if (existing.usedCount > 0) {
        throw new BadRequestException(
          'This code has already been redeemed and cannot be renamed. Disable it and create a new one.',
        );
      }

      const clash = await this.prisma.coupon.findUnique({ where: { code } });
      if (clash) throw new BadRequestException(`The code ${code} is already in use.`);
    }

    // A limit below what has already been redeemed would make the coupon read
    // as over-used forever and can never be satisfied.
    if (dto.usageLimit !== null && dto.usageLimit !== undefined && dto.usageLimit < existing.usedCount) {
      throw new BadRequestException(
        `This coupon has already been used ${existing.usedCount} times, so the limit cannot be lower.`,
      );
    }

    await this.assertScopeExists(dto);

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        code,
        type: dto.type,
        value: dto.value,
        minOrderAmount: dto.minOrderAmount ?? null,
        maxDiscountAmount: dto.maxDiscountAmount ?? null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        validFrom: dto.validFrom,
        validUntil: dto.validUntil,
        applicableCategories: dto.applicableCategories,
        applicableProducts: dto.applicableProducts,
        isActive: dto.isActive,
      },
    });

    await this.activity.record({
      action: AdminAction.UPDATE,
      entityType: 'coupon',
      entityId: id,
      summary: `Updated coupon ${code}`,
      before: snapshot(existing),
      after: snapshot(updated),
    });

    return this.findOne(id);
  }

  /**
   * Removes a coupon, or disables it when removal would rewrite history.
   *
   * The response says which happened, so the panel can tell the operator "this
   * has been used 12 times, so it has been disabled rather than deleted"
   * instead of silently doing something other than what the button said.
   */
  async remove(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      select: { id: true, code: true, usedCount: true, isActive: true },
    });

    if (!coupon) throw new NotFoundException('No such coupon.');

    if (coupon.usedCount > 0) {
      await this.prisma.coupon.update({ where: { id }, data: { isActive: false } });

      await this.activity.record({
        action: AdminAction.UPDATE,
        entityType: 'coupon',
        entityId: id,
        summary: `Disabled coupon ${coupon.code} (redeemed ${coupon.usedCount} times, so not deleted)`,
        before: { isActive: coupon.isActive },
        after: { isActive: false },
      });

      return { deleted: false, deactivated: true };
    }

    await this.prisma.coupon.delete({ where: { id } });

    await this.activity.record({
      action: AdminAction.DELETE,
      entityType: 'coupon',
      entityId: id,
      summary: `Deleted coupon ${coupon.code}`,
      before: { code: coupon.code, usedCount: 0 },
    });

    return { deleted: true, deactivated: false };
  }

  /* ---------------------------------------------------------------------- */

  /**
   * Redemption counts and influenced revenue for a batch of coupons.
   *
   * `usedCount` on the row is the authoritative counter checkout increments;
   * this is the richer picture the usage tab shows - who redeemed it and what
   * they spent - which needs the join.
   */
  private async statsFor(ids: string[]): Promise<Map<string, CouponStats>> {
    const stats = new Map<string, CouponStats>();
    if (ids.length === 0) return stats;

    const usages = await this.prisma.couponUsage.findMany({
      where: { couponId: { in: ids } },
      select: {
        couponId: true,
        userId: true,
        order: { select: { total: true, status: true } },
      },
    });

    for (const usage of usages) {
      const entry = stats.get(usage.couponId) ?? {
        revenueInfluenced: 0,
        users: new Set<string>(),
      };

      if (usage.order && REVENUE_STATUSES.includes(usage.order.status)) {
        entry.revenueInfluenced += usage.order.total.toNumber();
      }
      if (usage.userId) entry.users.add(usage.userId);

      stats.set(usage.couponId, entry);
    }

    return stats;
  }

  /**
   * Rejects a scope that points at records which do not exist.
   *
   * Without this a typo in a product id produces a coupon that silently applies
   * to nothing, and the first anyone hears of it is a shopper reporting that a
   * valid code "does nothing".
   */
  private async assertScopeExists(dto: CouponInput): Promise<void> {
    if (dto.applicableCategories.length > 0) {
      const found = await this.prisma.category.count({
        where: { id: { in: dto.applicableCategories } },
      });
      if (found !== dto.applicableCategories.length) {
        throw new BadRequestException('One of the selected categories no longer exists.');
      }
    }

    if (dto.applicableProducts.length > 0) {
      const found = await this.prisma.product.count({
        where: { id: { in: dto.applicableProducts }, deletedAt: null },
      });
      if (found !== dto.applicableProducts.length) {
        throw new BadRequestException('One of the selected products no longer exists.');
      }
    }
  }
}

/* -------------------------------------------------------------------------- */

interface CouponStats {
  revenueInfluenced: number;
  users: Set<string>;
}

type CouponRow = Prisma.CouponGetPayload<object>;

function toListItem(
  coupon: CouponRow,
  stats: CouponStats | undefined,
  now: Date,
): AdminCouponListItem {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value.toNumber(),
    minOrderAmount: coupon.minOrderAmount?.toNumber() ?? null,
    maxDiscountAmount: coupon.maxDiscountAmount?.toNumber() ?? null,
    usageLimit: coupon.usageLimit,
    usedCount: coupon.usedCount,
    perUserLimit: coupon.perUserLimit,
    validFrom: coupon.validFrom.toISOString(),
    validUntil: coupon.validUntil.toISOString(),
    applicableCategories: coupon.applicableCategories,
    applicableProducts: coupon.applicableProducts,
    isActive: coupon.isActive,
    lifecycle: lifecycleOf(coupon, now),
    revenueInfluenced: stats?.revenueInfluenced ?? 0,
    uniqueUsers: stats?.users.size ?? 0,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

/**
 * Derived rather than stored, and checked in the order that answers "why can I
 * not use this?" first: switched off beats used up beats out of date.
 */
function lifecycleOf(coupon: CouponRow, now: Date): CouponLifecycle {
  if (!coupon.isActive) return 'DISABLED';
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return 'EXHAUSTED';
  if (coupon.validFrom > now) return 'SCHEDULED';
  if (coupon.validUntil < now) return 'EXPIRED';
  return 'ACTIVE';
}

function stateFilter(state: AdminCouponQueryInput['state'], now: Date): Prisma.CouponWhereInput {
  switch (state) {
    case 'active':
      return { isActive: true, validFrom: { lte: now }, validUntil: { gte: now } };
    case 'scheduled':
      return { isActive: true, validFrom: { gt: now } };
    case 'expired':
      return { validUntil: { lt: now } };
    case 'exhausted':
      // Prisma cannot compare two columns, so this is the closest expressible
      // filter; the lifecycle on each row is what the UI actually badges.
      return { usageLimit: { not: null }, usedCount: { gt: 0 } };
    case 'all':
    default:
      return {};
  }
}

function orderByFor(sort: AdminCouponQueryInput['sort']): Prisma.CouponOrderByWithRelationInput {
  switch (sort) {
    case 'code':
      return { code: 'asc' };
    case 'redemptions':
      return { usedCount: 'desc' };
    case 'expiring':
      return { validUntil: 'asc' };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

/** The fields worth seeing in an activity diff - not the timestamps. */
function snapshot(coupon: CouponRow): Record<string, unknown> {
  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrderAmount: coupon.minOrderAmount,
    maxDiscountAmount: coupon.maxDiscountAmount,
    usageLimit: coupon.usageLimit,
    perUserLimit: coupon.perUserLimit,
    validFrom: coupon.validFrom,
    validUntil: coupon.validUntil,
    applicableCategories: coupon.applicableCategories,
    applicableProducts: coupon.applicableProducts,
    isActive: coupon.isActive,
  };
}
