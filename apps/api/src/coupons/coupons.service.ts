import { BadRequestException, Injectable } from '@nestjs/common';
import type { Coupon } from '@prisma/client';
import { CouponType } from '@bazaar/shared';
import type { AppliedCoupon } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';

/** One cart line, reduced to just what coupon scoping needs to decide. */
export interface CouponEligibleLine {
  productId: string;
  categoryId: string;
  lineTotal: number;
}

export interface CouponContext {
  userId?: string;
  lines: CouponEligibleLine[];
  /** Sum of every `lineTotal`, eligible or not. */
  subtotal: number;
  /** The shipping estimate, so FREE_SHIPPING knows what it is worth. */
  shipping: number;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates a code against a cart and prices the discount.
   *
   * Every rejection is a 400 with a message written for the shopper, because
   * this is read straight into the drawer's error line. The checks run in the
   * order a shopper would care about: does it exist, is it live, is it used up,
   * does my cart qualify.
   */
  async validate(code: string, context: CouponContext): Promise<AppliedCoupon> {
    const normalised = code.trim().toUpperCase();

    const coupon = await this.prisma.coupon.findUnique({ where: { code: normalised } });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException(`"${normalised}" is not a valid coupon code.`);
    }

    const now = new Date();

    if (coupon.validFrom > now) {
      throw new BadRequestException('This coupon is not active yet.');
    }

    if (coupon.validUntil < now) {
      throw new BadRequestException('This coupon has expired.');
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('This coupon has been fully redeemed.');
    }

    await this.assertPerUserLimit(coupon, context.userId);

    const minOrder = coupon.minOrderAmount === null ? null : Number(coupon.minOrderAmount);

    if (minOrder !== null && context.subtotal < minOrder) {
      const short = round(minOrder - context.subtotal);
      throw new BadRequestException(
        `This coupon needs a minimum order of Rs ${minOrder}. Add Rs ${short} more to use it.`,
      );
    }

    const eligible = this.eligibleLines(coupon, context.lines);

    if (eligible.length === 0) {
      throw new BadRequestException('This coupon does not apply to anything in your cart.');
    }

    const eligibleTotal = round(eligible.reduce((sum, line) => sum + line.lineTotal, 0));
    const isPartial = eligible.length < context.lines.length;

    return this.price(coupon, eligibleTotal, isPartial, context.shipping);
  }

  /**
   * Re-prices an already-applied coupon while returning the cart.
   *
   * Never throws: a coupon that has since expired, or that no longer matches
   * the cart after a line was removed, simply stops applying. Blowing up
   * `GET /cart` because of a stale code would leave the shopper with a cart
   * they cannot even look at.
   */
  async revalidateQuietly(code: string, context: CouponContext): Promise<AppliedCoupon | null> {
    try {
      return await this.validate(code, context);
    } catch {
      return null;
    }
  }

  /* --------------------------------------------------------------------- */

  private async assertPerUserLimit(coupon: Coupon, userId?: string): Promise<void> {
    if (coupon.perUserLimit === null) return;

    if (!userId) {
      throw new BadRequestException('Log in to use this coupon.');
    }

    const used = await this.prisma.couponUsage.count({
      where: { couponId: coupon.id, userId },
    });

    if (used >= coupon.perUserLimit) {
      throw new BadRequestException('You have already used this coupon.');
    }
  }

  /**
   * Applies the product/category scoping. Both arrays empty means the coupon is
   * cart-wide; otherwise a line qualifies if it matches *either* list, so
   * "these three products, plus anything in Electronics" is expressible.
   */
  private eligibleLines(coupon: Coupon, lines: CouponEligibleLine[]): CouponEligibleLine[] {
    const products = coupon.applicableProducts;
    const categories = coupon.applicableCategories;

    if (products.length === 0 && categories.length === 0) return lines;

    return lines.filter(
      (line) =>
        products.includes(line.productId) || categories.includes(line.categoryId),
    );
  }

  private price(
    coupon: Coupon,
    eligibleTotal: number,
    isPartial: boolean,
    shipping: number,
  ): AppliedCoupon {
    const value = Number(coupon.value);
    const cap = coupon.maxDiscountAmount === null ? null : Number(coupon.maxDiscountAmount);

    let discountAmount: number;
    let description: string;

    switch (coupon.type) {
      case CouponType.PERCENTAGE:
        discountAmount = (eligibleTotal * value) / 100;
        description = `${value}% off${isPartial ? ' eligible items' : ''}`;
        break;

      case CouponType.FIXED:
        discountAmount = value;
        description = `Rs ${value} off${isPartial ? ' eligible items' : ''}`;
        break;

      case CouponType.FREE_SHIPPING:
      default:
        // Worth exactly the shipping line - and nothing when it is already free.
        discountAmount = shipping;
        description = 'Free shipping';
        break;
    }

    if (cap !== null && discountAmount > cap) {
      discountAmount = cap;
    }

    // A fixed discount larger than the cart must not turn into store credit.
    if (coupon.type !== CouponType.FREE_SHIPPING && discountAmount > eligibleTotal) {
      discountAmount = eligibleTotal;
    }

    return {
      code: coupon.code,
      type: coupon.type,
      value,
      discountAmount: round(discountAmount),
      isPartial,
      description,
    };
  }
}

/** Money is rounded to 2dp at every boundary so totals never drift by a paisa. */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}
