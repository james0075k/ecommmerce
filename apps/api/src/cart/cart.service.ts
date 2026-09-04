import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CART_MAX_QUANTITY,
  CART_SESSION_TTL_DAYS,
  FREE_SHIPPING_THRESHOLD,
  ProductStatus,
  SHIPPING_FLAT_RATE,
} from '@bazaar/shared';
import type {
  AddToCartInput,
  AppliedCoupon,
  CartIssue,
  CartLine,
  CartSummary,
  CartView,
  CouponValidationResult,
  SupportedCurrency,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { CouponsService, round } from '../coupons/coupons.service';
import type { CouponEligibleLine } from '../coupons/coupons.service';
import { ownerWhere, type CartOwner } from './cart-session';

/** Everything a drawer line renders, joined in one query. */
const LINE_SELECT = {
  id: true,
  quantity: true,
  addedAt: true,
  productId: true,
  variantId: true,
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      brand: true,
      currency: true,
      basePrice: true,
      compareAtPrice: true,
      categoryId: true,
      status: true,
      isActive: true,
      deletedAt: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { url: true, altText: true, blurhash: true },
      },
    },
  },
  variant: {
    select: {
      id: true,
      sku: true,
      name: true,
      attributes: true,
      priceOverride: true,
      stockQuantity: true,
      isActive: true,
    },
  },
} satisfies Prisma.CartItemSelect;

type CartRow = Prisma.CartItemGetPayload<{ select: typeof LINE_SELECT }>;

const COUPON_KEY_TTL_SECONDS = CART_SESSION_TTL_DAYS * 24 * 60 * 60;

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly coupons: CouponsService,
  ) {}

  /* ---------------------------------------------------------------------- */
  /*  Read                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * The whole cart, stock-validated on every read.
   *
   * Blueprint requirement: "check stock availability on every cart view". The
   * alternative - trusting the quantity saved at add time - means a shopper
   * discovers a sold-out item at the payment step, which is the worst possible
   * moment to find out.
   */
  async getCart(owner: CartOwner | null): Promise<CartView> {
    if (!owner) return emptyCart();

    const rows = await this.prisma.cartItem.findMany({
      where: ownerWhere(owner),
      select: LINE_SELECT,
      orderBy: { addedAt: 'desc' },
    });

    return this.buildView(owner, rows);
  }

  /** Just the badge number, so the navbar does not pull the whole cart. */
  async getCount(owner: CartOwner | null): Promise<{ count: number }> {
    if (!owner) return { count: 0 };

    const result = await this.prisma.cartItem.aggregate({
      where: ownerWhere(owner),
      _sum: { quantity: true },
    });

    return { count: result._sum.quantity ?? 0 };
  }

  /* ---------------------------------------------------------------------- */
  /*  Write                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Adds a variant, or tops up the line that already holds it.
   *
   * The quantity is clamped to available stock rather than rejected: a shopper
   * asking for 10 of the 3 that exist wants those 3, and telling them so in the
   * returned cart is friendlier than a 400 that loses the click.
   */
  async addItem(owner: CartOwner, dto: AddToCartInput): Promise<CartView> {
    const variant = await this.loadPurchasableVariant(dto.productId, dto.variantId);

    const existing = await this.prisma.cartItem.findFirst({
      where: { ...ownerWhere(owner), variantId: dto.variantId },
      select: { id: true, quantity: true },
    });

    const desired = (existing?.quantity ?? 0) + dto.quantity;
    const quantity = clamp(desired, variant.stockQuantity);

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          ...ownerWhere(owner),
          productId: dto.productId,
          variantId: dto.variantId,
          quantity,
        },
      });
    }

    return this.getCart(owner);
  }

  /** Quantity 0 removes the line - that is what a stepper clicked down to 0 means. */
  async updateItem(owner: CartOwner, itemId: string, quantity: number): Promise<CartView> {
    const item = await this.findOwnedItem(owner, itemId);

    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      return this.getCart(owner);
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: item.variantId },
      select: { stockQuantity: true, isActive: true },
    });

    if (!variant?.isActive) {
      throw new BadRequestException('That option is no longer available.');
    }

    if (variant.stockQuantity === 0) {
      throw new BadRequestException('That option just sold out.');
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: clamp(quantity, variant.stockQuantity) },
    });

    return this.getCart(owner);
  }

  async removeItem(owner: CartOwner, itemId: string): Promise<CartView> {
    const item = await this.findOwnedItem(owner, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.getCart(owner);
  }

  async clear(owner: CartOwner): Promise<CartView> {
    await this.prisma.cartItem.deleteMany({ where: ownerWhere(owner) });
    await this.redis.del(couponKey(owner));
    return emptyCart();
  }

  /* ---------------------------------------------------------------------- */
  /*  Coupons                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Validates a code against the live cart and remembers it for this owner.
   *
   * The code is stored in Redis rather than on `cart_items`, because it belongs
   * to the cart as a whole, not to any one line, and it must not survive into
   * the order - the redemption row is written at checkout after the coupon is
   * validated one final time against the real order total.
   */
  async applyCoupon(owner: CartOwner, code: string): Promise<CouponValidationResult> {
    const view = await this.getCart(owner);

    if (view.items.length === 0) {
      throw new BadRequestException('Add something to your cart before applying a coupon.');
    }

    const coupon = await this.coupons.validate(code, {
      userId: owner.kind === 'user' ? owner.userId : undefined,
      lines: await this.eligibleLines(owner),
      subtotal: view.summary.subtotal,
      shipping: view.summary.shipping,
    });

    await this.redis.set(couponKey(owner), coupon.code, COUPON_KEY_TTL_SECONDS);

    return {
      coupon,
      summary: summarise(view.items, coupon),
    };
  }

  async removeCoupon(owner: CartOwner): Promise<CartView> {
    await this.redis.del(couponKey(owner));
    return this.getCart(owner);
  }

  /* ---------------------------------------------------------------------- */
  /*  Guest -> user merge                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * Folds a guest cart into the shopper's own on login.
   *
   * Blueprint rule: "higher quantity wins for duplicates". Summing instead
   * would silently double a line for someone who added the same thing on their
   * phone and then their laptop; taking the max preserves the stronger of the
   * two intents without inventing a quantity neither of them chose.
   *
   * Runs in a transaction so a crash mid-merge cannot leave the same variant in
   * both carts, and never throws - a failed merge must not block a login.
   */
  async mergeGuestCart(userId: string, sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;

    try {
      const guestItems = await this.prisma.cartItem.findMany({
        where: { sessionId },
        select: { id: true, productId: true, variantId: true, quantity: true },
      });

      if (guestItems.length === 0) return;

      const userItems = await this.prisma.cartItem.findMany({
        where: { userId },
        select: { id: true, variantId: true, quantity: true },
      });

      const byVariant = new Map(userItems.map((item) => [item.variantId, item]));

      await this.prisma.$transaction(async (tx) => {
        for (const guest of guestItems) {
          const mine = byVariant.get(guest.variantId);

          if (mine) {
            if (guest.quantity > mine.quantity) {
              await tx.cartItem.update({
                where: { id: mine.id },
                data: { quantity: guest.quantity },
              });
            }
            // The guest row is dropped either way - keeping it would resurrect
            // the merged line the next time this browser is used signed-out.
            await tx.cartItem.delete({ where: { id: guest.id } });
          } else {
            // Re-key the existing row instead of create+delete: one write, and
            // `addedAt` survives so the drawer keeps its ordering.
            await tx.cartItem.update({
              where: { id: guest.id },
              data: { userId, sessionId: null },
            });
          }
        }
      });

      await this.mergeCoupon(userId, sessionId);

      this.logger.log(`Merged ${guestItems.length} guest cart line(s) into user ${userId}.`);
    } catch (error) {
      this.logger.error(
        `Guest cart merge failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Loads a variant and proves it can actually be bought. Checking the parent
   * product's status here is what stops a draft or soft-deleted product being
   * added by anyone who kept an old variant id.
   */
  private async loadPurchasableVariant(
    productId: string,
    variantId: string,
  ): Promise<{ stockQuantity: number }> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, isActive: true },
      select: {
        stockQuantity: true,
        product: {
          select: { status: true, isActive: true, deletedAt: true },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException('That product option no longer exists.');
    }

    const { product } = variant;

    if (!isPurchasableProduct(product)) {
      throw new BadRequestException('That product is not available right now.');
    }

    if (variant.stockQuantity === 0) {
      throw new BadRequestException('That option is out of stock.');
    }

    return { stockQuantity: variant.stockQuantity };
  }

  /**
   * Scopes the lookup to the owner as part of the *query*, not as a check after
   * the fact - so a guessed cart-item id from someone else's cart returns 404
   * rather than being deleted.
   */
  private async findOwnedItem(
    owner: CartOwner,
    itemId: string,
  ): Promise<{ id: string; variantId: string }> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, ...ownerWhere(owner) },
      select: { id: true, variantId: true },
    });

    if (!item) throw new NotFoundException('That item is not in your cart.');
    return item;
  }

  private async buildView(owner: CartOwner, rows: CartRow[]): Promise<CartView> {
    const items = rows.map(toCartLine);
    const issues = collectIssues(items);

    const storedCode = await this.redis.get(couponKey(owner));
    let coupon: AppliedCoupon | null = null;

    if (storedCode && items.length > 0) {
      const base = summarise(items, null);

      coupon = await this.coupons.revalidateQuietly(storedCode, {
        userId: owner.kind === 'user' ? owner.userId : undefined,
        lines: rows.map((row) => ({
          productId: row.productId,
          categoryId: row.product.categoryId,
          lineTotal: lineTotalOf(row),
        })),
        subtotal: base.subtotal,
        shipping: base.shipping,
      });

      // A code that stopped applying is forgotten, so the drawer does not keep
      // showing a coupon row worth nothing.
      if (!coupon) await this.redis.del(couponKey(owner));
    }

    return {
      items,
      summary: summarise(items, coupon),
      coupon,
      issues,
      isCheckoutReady: items.length > 0 && issues.length === 0,
    };
  }

  /**
   * The cart reduced to what coupon scoping needs. Public because checkout
   * re-validates the coupon against the same lines before writing the order -
   * the CartView it otherwise holds does not carry `categoryId`.
   */
  async eligibleLines(owner: CartOwner): Promise<CouponEligibleLine[]> {
    const rows = await this.prisma.cartItem.findMany({
      where: ownerWhere(owner),
      select: LINE_SELECT,
    });

    return rows.map((row) => ({
      productId: row.productId,
      categoryId: row.product.categoryId,
      lineTotal: lineTotalOf(row),
    }));
  }

  /** Carries a coupon the guest had typed over to the account they logged into. */
  private async mergeCoupon(userId: string, sessionId: string): Promise<void> {
    const guestKey = couponKey({ kind: 'guest', sessionId });
    const code = await this.redis.get(guestKey);
    if (!code) return;

    const userKey = couponKey({ kind: 'user', userId });
    // Anything already typed while signed in is the more recent intent.
    if (!(await this.redis.get(userKey))) {
      await this.redis.set(userKey, code, COUPON_KEY_TTL_SECONDS);
    }
    await this.redis.del(guestKey);
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The storefront's visibility rule (`isActive` + not soft-deleted), plus the two
 * statuses that must never reach a cart. OUT_OF_STOCK is deliberately allowed
 * through: the stock number itself decides that, and treating the status as
 * fatal would strand an item that has since been restocked.
 */
export function isPurchasableProduct(product: {
  isActive: boolean;
  deletedAt: Date | null;
  status: string;
}): boolean {
  return (
    product.isActive &&
    product.deletedAt === null &&
    product.status !== ProductStatus.DRAFT &&
    product.status !== ProductStatus.ARCHIVED
  );
}

function couponKey(owner: CartOwner): string {
  return owner.kind === 'user' ? `cart:coupon:u:${owner.userId}` : `cart:coupon:s:${owner.sessionId}`;
}

function clamp(quantity: number, stock: number): number {
  return Math.max(1, Math.min(quantity, stock, CART_MAX_QUANTITY));
}

function unitPriceOf(row: CartRow): number {
  return Number(row.variant.priceOverride ?? row.product.basePrice);
}

function lineTotalOf(row: CartRow): number {
  return round(unitPriceOf(row) * row.quantity);
}

function toCartLine(row: CartRow): CartLine {
  const unitPrice = unitPriceOf(row);
  const image = row.product.images[0];

  // Anything that would block a purchase counts as zero available, so one flag
  // covers "sold out", "option retired" and "product withdrawn" alike.
  const purchasable = row.variant.isActive && isPurchasableProduct(row.product);

  const availableQuantity = purchasable ? row.variant.stockQuantity : 0;

  return {
    id: row.id,
    quantity: row.quantity,
    addedAt: row.addedAt.toISOString(),
    product: {
      id: row.product.id,
      name: row.product.name,
      slug: row.product.slug,
      brand: row.product.brand,
      currency: row.product.currency as SupportedCurrency,
      image: image
        ? { url: image.url, altText: image.altText, blurhash: image.blurhash }
        : null,
    },
    variant: {
      id: row.variant.id,
      sku: row.variant.sku,
      name: row.variant.name,
      attributes: toAttributes(row.variant.attributes),
    },
    unitPrice,
    lineTotal: round(unitPrice * row.quantity),
    compareAtPrice:
      row.product.compareAtPrice === null ? null : Number(row.product.compareAtPrice),
    availableQuantity,
    isOutOfStock: availableQuantity === 0,
    isPartiallyAvailable: availableQuantity > 0 && availableQuantity < row.quantity,
    maxQuantity: Math.min(availableQuantity, CART_MAX_QUANTITY),
  };
}

/** The variant JSONB is `Record<string, string>` by construction, not by type. */
function toAttributes(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, raw]) => [key, String(raw)]),
  );
}

function collectIssues(items: CartLine[]): CartIssue[] {
  const issues: CartIssue[] = [];

  for (const item of items) {
    if (item.isOutOfStock) {
      issues.push({
        cartItemId: item.id,
        code: 'OUT_OF_STOCK',
        message: `${item.product.name} is out of stock.`,
      });
    } else if (item.isPartiallyAvailable) {
      issues.push({
        cartItemId: item.id,
        code: 'QUANTITY_REDUCED',
        message: `Only ${item.availableQuantity} of ${item.product.name} left.`,
      });
    }
  }

  return issues;
}

/**
 * The single place cart money is computed.
 *
 * Out-of-stock lines still contribute to the subtotal shown, because they are
 * still in the cart and hiding their value would make the number jump the
 * moment the shopper removes them. `isCheckoutReady` is what actually gates
 * paying for them.
 */
export function summarise(items: CartLine[], coupon: AppliedCoupon | null): CartSummary {
  const subtotal = round(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const earnedFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const baseShipping = items.length === 0 || earnedFreeShipping ? 0 : SHIPPING_FLAT_RATE;

  const couponPaysShipping = coupon?.type === 'FREE_SHIPPING';
  const shipping = couponPaysShipping ? 0 : baseShipping;

  // A FREE_SHIPPING coupon is priced as the shipping line itself, so it is
  // subtracted there rather than counted twice as a discount.
  const discount = couponPaysShipping ? 0 : (coupon?.discountAmount ?? 0);

  return {
    currency: items[0]?.product.currency ?? 'NPR',
    subtotal,
    discount: round(discount),
    shipping,
    isFreeShipping: items.length > 0 && shipping === 0,
    total: round(Math.max(0, subtotal - discount + shipping)),
    itemCount,
    freeShippingRemaining: earnedFreeShipping
      ? 0
      : round(Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal)),
  };
}

function emptyCart(): CartView {
  return {
    items: [],
    summary: summarise([], null),
    coupon: null,
    issues: [],
    isCheckoutReady: false,
  };
}
