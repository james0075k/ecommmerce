import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminAction, CouponType, Prisma } from '@prisma/client';

import { AdminCouponsService } from './admin-coupons.service';
import type { ActivityLogService } from '../admin/activity-log.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The rules coupon administration exists to enforce.
 *
 * All three are about not rewriting history: a redeemed code cannot be renamed,
 * cannot be deleted, and cannot have its limit set below what has already been
 * taken. Each of those, if allowed, turns a past order's discount line into a
 * number nobody can explain.
 */
describe('AdminCouponsService', () => {
  const decimal = (value: number) => new Prisma.Decimal(value);

  function build(coupon: Partial<Record<string, unknown>> = {}) {
    const record = {
      id: 'c1',
      code: 'DASHAIN500',
      type: CouponType.FIXED,
      value: decimal(500),
      minOrderAmount: null,
      maxDiscountAmount: null,
      usageLimit: null,
      usedCount: 0,
      perUserLimit: null,
      validFrom: new Date('2026-01-01'),
      validUntil: new Date('2026-12-31'),
      applicableCategories: [],
      applicableProducts: [],
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...coupon,
    };

    const prisma = {
      coupon: {
        findUnique: jest.fn().mockResolvedValue(record),
        findMany: jest.fn().mockResolvedValue([record]),
        update: jest.fn().mockResolvedValue(record),
        delete: jest.fn().mockResolvedValue(record),
        create: jest.fn().mockResolvedValue(record),
        count: jest.fn().mockResolvedValue(1),
      },
      couponUsage: { findMany: jest.fn().mockResolvedValue([]) },
      category: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      product: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const activity = { record: jest.fn().mockResolvedValue(undefined) } as unknown as ActivityLogService;

    return { service: new AdminCouponsService(prisma, activity), prisma, activity, record };
  }

  const input = (overrides: Record<string, unknown> = {}) =>
    ({
      code: 'DASHAIN500',
      type: CouponType.FIXED,
      value: 500,
      minOrderAmount: null,
      maxDiscountAmount: null,
      usageLimit: null,
      perUserLimit: null,
      validFrom: new Date('2026-01-01'),
      validUntil: new Date('2026-12-31'),
      applicableCategories: [],
      applicableProducts: [],
      isActive: true,
      ...overrides,
    }) as never;

  describe('lifecycle', () => {
    it('derives the lifecycle in the order an operator would ask about it', async () => {
      // "Why does my code not work?" - switched off beats used up beats not
      // started yet beats expired. Each case below is a coupon that would
      // satisfy a later rule too, so the order is what is actually asserted.
      const now = new Date();
      const future = new Date(now.getTime() + 86_400_000);
      const past = new Date(now.getTime() - 86_400_000);

      const cases: Array<[Record<string, unknown>, string]> = [
        [{ isActive: false }, 'DISABLED'],
        [{ usageLimit: 5, usedCount: 5 }, 'EXHAUSTED'],
        [{ validFrom: future, validUntil: future }, 'SCHEDULED'],
        [{ validFrom: past, validUntil: past }, 'EXPIRED'],
        [{ validFrom: past, validUntil: future }, 'ACTIVE'],
      ];

      for (const [overrides, expected] of cases) {
        const { service } = build(overrides);
        const page = await service.list({ page: 1, limit: 20, state: 'all', sort: 'newest' } as never);
        expect(page.items[0]?.lifecycle).toBe(expected);
      }
    });
  });

  describe('update', () => {
    it('refuses to rename a code that has already been redeemed', async () => {
      const { service } = build({ usedCount: 3 });

      await expect(service.update('c1', input({ code: 'SOMETHINGELSE' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows renaming a code nobody has used', async () => {
      const { service, prisma } = build({ usedCount: 0 });
      (prisma.coupon.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'c1', code: 'DASHAIN500', usedCount: 0 })
        // The clash check finds nothing...
        .mockResolvedValueOnce(null)
        // ...and findOne() re-reads afterwards.
        .mockResolvedValue({
          id: 'c1',
          code: 'NEWCODE',
          type: CouponType.FIXED,
          value: decimal(500),
          minOrderAmount: null,
          maxDiscountAmount: null,
          usageLimit: null,
          usedCount: 0,
          perUserLimit: null,
          validFrom: new Date('2026-01-01'),
          validUntil: new Date('2026-12-31'),
          applicableCategories: [],
          applicableProducts: [],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          usages: [],
        });

      await service.update('c1', input({ code: 'NEWCODE' }));

      expect(prisma.coupon.update).toHaveBeenCalled();
    });

    it('refuses a usage limit below what has already been redeemed', async () => {
      const { service } = build({ usedCount: 12 });

      await expect(service.update('c1', input({ usageLimit: 5 }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('404s on a coupon that does not exist', async () => {
      const { service, prisma } = build();
      (prisma.coupon.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.update('missing', input())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a coupon nobody has redeemed', async () => {
      const { service, prisma, activity } = build();
      (prisma.coupon.findUnique as jest.Mock).mockResolvedValue({
        id: 'c1',
        code: 'UNUSED',
        usedCount: 0,
        isActive: true,
      });

      await expect(service.remove('c1')).resolves.toEqual({ deleted: true, deactivated: false });
      expect(prisma.coupon.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AdminAction.DELETE }),
      );
    });

    it('disables rather than deletes a coupon that has been redeemed', async () => {
      // The orders that used it still refer to the code on their receipts.
      const { service, prisma } = build();
      (prisma.coupon.findUnique as jest.Mock).mockResolvedValue({
        id: 'c1',
        code: 'USED',
        usedCount: 9,
        isActive: true,
      });

      await expect(service.remove('c1')).resolves.toEqual({ deleted: false, deactivated: true });
      expect(prisma.coupon.delete).not.toHaveBeenCalled();
      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { isActive: false },
      });
    });
  });

  describe('scope validation', () => {
    it('rejects a scope pointing at a category that does not exist', async () => {
      // Otherwise the coupon silently applies to nothing and the first report
      // is a shopper saying a valid code "does nothing".
      const { service, prisma } = build();
      (prisma.coupon.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.category.count as jest.Mock).mockResolvedValue(0);

      await expect(
        service.create(input({ applicableCategories: ['11111111-1111-1111-1111-111111111111'] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
