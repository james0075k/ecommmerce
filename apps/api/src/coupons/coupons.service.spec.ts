import { BadRequestException } from '@nestjs/common';
import { CouponType } from '@bazaar/shared';

import { CouponsService, type CouponContext } from './coupons.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Coupon pricing is the one place where a bug hands out money, so the rules
 * that cap a discount are tested harder than the ones that reject it.
 */

const DAY = 24 * 60 * 60 * 1000;

interface CouponRow {
  id: string;
  code: string;
  type: string;
  value: unknown;
  minOrderAmount: unknown;
  maxDiscountAmount: unknown;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number | null;
  validFrom: Date;
  validUntil: Date;
  applicableCategories: string[];
  applicableProducts: string[];
  isActive: boolean;
}

function coupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: 'c1',
    code: 'SAVE20',
    type: CouponType.PERCENTAGE,
    value: 20,
    minOrderAmount: null,
    maxDiscountAmount: null,
    usageLimit: null,
    usedCount: 0,
    perUserLimit: null,
    validFrom: new Date(Date.now() - DAY),
    validUntil: new Date(Date.now() + DAY),
    applicableCategories: [],
    applicableProducts: [],
    isActive: true,
    ...overrides,
  };
}

function serviceFor(row: CouponRow | null, usageCount = 0): CouponsService {
  const prisma = {
    coupon: { findUnique: jest.fn().mockResolvedValue(row) },
    couponUsage: { count: jest.fn().mockResolvedValue(usageCount) },
  } as unknown as PrismaService;

  return new CouponsService(prisma);
}

function context(overrides: Partial<CouponContext> = {}): CouponContext {
  return {
    userId: 'u1',
    lines: [
      { productId: 'p1', categoryId: 'cat-electronics', lineTotal: 600 },
      { productId: 'p2', categoryId: 'cat-books', lineTotal: 400 },
    ],
    subtotal: 1000,
    shipping: 100,
    ...overrides,
  };
}

describe('CouponsService', () => {
  describe('rejections', () => {
    it('rejects an unknown code', async () => {
      await expect(serviceFor(null).validate('NOPE', context())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a deactivated coupon', async () => {
      await expect(
        serviceFor(coupon({ isActive: false })).validate('SAVE20', context()),
      ).rejects.toThrow(/not a valid coupon/i);
    });

    it('rejects a coupon that has not started', async () => {
      await expect(
        serviceFor(coupon({ validFrom: new Date(Date.now() + DAY) })).validate(
          'SAVE20',
          context(),
        ),
      ).rejects.toThrow(/not active yet/i);
    });

    it('rejects an expired coupon', async () => {
      await expect(
        serviceFor(coupon({ validUntil: new Date(Date.now() - 1) })).validate(
          'SAVE20',
          context(),
        ),
      ).rejects.toThrow(/expired/i);
    });

    it('rejects a coupon that has hit its global usage limit', async () => {
      await expect(
        serviceFor(coupon({ usageLimit: 100, usedCount: 100 })).validate('SAVE20', context()),
      ).rejects.toThrow(/fully redeemed/i);
    });

    it('rejects a coupon the user has already used', async () => {
      await expect(
        serviceFor(coupon({ perUserLimit: 1 }), 1).validate('SAVE20', context()),
      ).rejects.toThrow(/already used/i);
    });

    it('requires a login for a per-user-limited coupon', async () => {
      await expect(
        serviceFor(coupon({ perUserLimit: 1 })).validate(
          'SAVE20',
          context({ userId: undefined }),
        ),
      ).rejects.toThrow(/log in/i);
    });

    it('rejects when the minimum order is not met, and says how much short', async () => {
      await expect(
        serviceFor(coupon({ minOrderAmount: 1500 })).validate('SAVE20', context()),
      ).rejects.toThrow(/Add Rs 500 more/);
    });

    it('rejects when nothing in the cart matches the scope', async () => {
      await expect(
        serviceFor(coupon({ applicableProducts: ['p-other'] })).validate('SAVE20', context()),
      ).rejects.toThrow(/does not apply/i);
    });
  });

  describe('pricing', () => {
    it('prices a percentage discount off the whole cart', async () => {
      const result = await serviceFor(coupon()).validate('SAVE20', context());

      expect(result.discountAmount).toBe(200);
      expect(result.isPartial).toBe(false);
      expect(result.description).toBe('20% off');
    });

    it('prices a percentage discount off only the eligible lines', async () => {
      const result = await serviceFor(
        coupon({ applicableCategories: ['cat-electronics'] }),
      ).validate('SAVE20', context());

      // 20% of the 600 electronics line, not of the 1000 cart.
      expect(result.discountAmount).toBe(120);
      expect(result.isPartial).toBe(true);
      expect(result.description).toBe('20% off eligible items');
    });

    it('honours a max-discount cap', async () => {
      const result = await serviceFor(
        coupon({ value: 50, maxDiscountAmount: 300 }),
      ).validate('SAVE20', context());

      // 50% of 1000 is 500, capped to 300.
      expect(result.discountAmount).toBe(300);
    });

    it('never lets a fixed discount exceed the eligible total', async () => {
      // A Rs 5000 voucher against a Rs 1000 cart must not become store credit.
      const result = await serviceFor(
        coupon({ type: CouponType.FIXED, value: 5000 }),
      ).validate('FLAT', context());

      expect(result.discountAmount).toBe(1000);
    });

    it('prices free shipping as the shipping line itself', async () => {
      const result = await serviceFor(
        coupon({ type: CouponType.FREE_SHIPPING, value: 0 }),
      ).validate('FREESHIP', context({ shipping: 150 }));

      expect(result.discountAmount).toBe(150);
      expect(result.description).toBe('Free shipping');
    });

    it('makes free shipping worth nothing when shipping is already free', async () => {
      const result = await serviceFor(
        coupon({ type: CouponType.FREE_SHIPPING, value: 0 }),
      ).validate('FREESHIP', context({ shipping: 0 }));

      expect(result.discountAmount).toBe(0);
    });

    it('rounds to two decimals so totals never drift', async () => {
      const result = await serviceFor(coupon({ value: 33 })).validate(
        'SAVE33',
        context({ lines: [{ productId: 'p1', categoryId: 'c', lineTotal: 99.99 }], subtotal: 99.99 }),
      );

      // 99.99 * 0.33 = 32.9967
      expect(result.discountAmount).toBe(33);
    });

    it('uppercases and trims the submitted code', async () => {
      const service = serviceFor(coupon());
      await service.validate('  save20  ', context());

      const prisma = (service as unknown as { prisma: { coupon: { findUnique: jest.Mock } } })
        .prisma;
      expect(prisma.coupon.findUnique).toHaveBeenCalledWith({ where: { code: 'SAVE20' } });
    });
  });

  describe('revalidateQuietly', () => {
    it('returns null instead of throwing, so GET /cart still renders', async () => {
      const result = await serviceFor(coupon({ validUntil: new Date(Date.now() - 1) }))
        .revalidateQuietly('SAVE20', context());

      expect(result).toBeNull();
    });

    it('returns the coupon when it is still valid', async () => {
      const result = await serviceFor(coupon()).revalidateQuietly('SAVE20', context());
      expect(result?.discountAmount).toBe(200);
    });
  });
});
