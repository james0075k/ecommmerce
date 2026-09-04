import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  AddToWishlistInput,
  CartLineVariant,
  CartView,
  MoveToCartInput,
  SharedWishlistView,
  SupportedCurrency,
  WishlistEntry,
  WishlistView,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { CartService, isPurchasableProduct } from '../cart/cart.service';
import { round } from '../coupons/coupons.service';

/** The saved-product tile: image, price, rating and enough stock to act on. */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  brand: true,
  currency: true,
  basePrice: true,
  compareAtPrice: true,
  status: true,
  isActive: true,
  deletedAt: true,
  images: {
    where: { isPrimary: true },
    take: 1,
    select: { url: true, altText: true, blurhash: true },
  },
  variants: {
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      attributes: true,
      priceOverride: true,
      stockQuantity: true,
    },
  },
} satisfies Prisma.ProductSelect;

const ENTRY_SELECT = {
  id: true,
  productId: true,
  variantId: true,
  priceAtAdd: true,
  addedAt: true,
  product: { select: PRODUCT_SELECT },
} satisfies Prisma.WishlistSelect;

type EntryRow = Prisma.WishlistGetPayload<{ select: typeof ENTRY_SELECT }>;

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly config: ConfigService,
  ) {}

  /* ---------------------------------------------------------------------- */
  /*  Read                                                                   */
  /* ---------------------------------------------------------------------- */

  async list(userId: string): Promise<WishlistView> {
    const [rows, user] = await Promise.all([
      this.prisma.wishlist.findMany({
        where: { userId },
        select: ENTRY_SELECT,
        orderBy: { addedAt: 'desc' },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { wishlistShareToken: true },
      }),
    ]);

    const ratings = await this.ratingsFor(rows.map((row) => row.productId));

    return {
      items: rows.map((row) => toEntry(row, ratings)),
      shareUrl: user?.wishlistShareToken ? this.shareUrl(user.wishlistShareToken) : null,
    };
  }

  async count(userId: string): Promise<{ count: number }> {
    return { count: await this.prisma.wishlist.count({ where: { userId } }) };
  }

  /**
   * The public view behind a share link.
   *
   * Deliberately narrower than `list()`: no wishlist-entry ids, no owner id and
   * no `priceAtAdd`-derived drop the owner might not want broadcast - just the
   * products, so a friend can browse and buy them for themselves.
   */
  async listShared(token: string): Promise<SharedWishlistView> {
    const owner = await this.prisma.user.findUnique({
      where: { wishlistShareToken: token },
      select: { id: true, fullName: true },
    });

    if (!owner) {
      throw new NotFoundException('That wishlist link is no longer valid.');
    }

    const rows = await this.prisma.wishlist.findMany({
      where: { userId: owner.id },
      select: ENTRY_SELECT,
      orderBy: { addedAt: 'desc' },
    });

    const ratings = await this.ratingsFor(rows.map((row) => row.productId));

    // A product pulled from sale should not keep showing on a public page.
    const visible = rows.filter((row) => isVisible(row.product));

    return {
      ownerName: owner.fullName,
      items: visible.map((row) => ({ ...toEntry(row, ratings), priceDropAmount: 0, priceDropPercent: 0 })),
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Write                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Saves a product, stamping today's price as the price-drop baseline (G2).
   *
   * The baseline is the *variant's* price when one was chosen, so saving the
   * 512GB model does not later report a "drop" that is really just the 128GB
   * model's price.
   */
  async add(userId: string, dto: AddToWishlistInput): Promise<WishlistEntry> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: PRODUCT_SELECT,
    });

    if (!product || !isVisible(product)) {
      throw new NotFoundException('That product is not available.');
    }

    const variantId = dto.variantId ?? null;

    if (variantId && !product.variants.some((variant) => variant.id === variantId)) {
      throw new BadRequestException('That product option no longer exists.');
    }

    const variant = variantId
      ? product.variants.find((item) => item.id === variantId)
      : undefined;

    const priceAtAdd = Number(variant?.priceOverride ?? product.basePrice);

    try {
      const created = await this.prisma.wishlist.create({
        data: { userId, productId: dto.productId, variantId, priceAtAdd },
        select: ENTRY_SELECT,
      });

      const ratings = await this.ratingsFor([created.productId]);
      return toEntry(created, ratings);
    } catch (error) {
      // The @@unique([userId, productId, variantId]) is the source of truth for
      // "already saved" - checking first would race two rapid double-clicks.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('That item is already in your wishlist.');
      }
      throw error;
    }
  }

  async remove(userId: string, entryId: string): Promise<{ message: string }> {
    const deleted = await this.prisma.wishlist.deleteMany({
      where: { id: entryId, userId },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('That item is not in your wishlist.');
    }

    return { message: 'Removed from your wishlist.' };
  }

  /**
   * Moves a saved item into the cart and drops it from the wishlist.
   *
   * The variant is resolved in order of specificity: the one the client picked,
   * then the one saved with the entry, then the first in-stock option - so a
   * single-variant product moves in one click with no selector.
   */
  async moveToCart(
    userId: string,
    entryId: string,
    dto: MoveToCartInput,
  ): Promise<CartView> {
    const entry = await this.prisma.wishlist.findFirst({
      where: { id: entryId, userId },
      select: ENTRY_SELECT,
    });

    if (!entry) {
      throw new NotFoundException('That item is not in your wishlist.');
    }

    if (!isVisible(entry.product)) {
      throw new BadRequestException('That product is not available right now.');
    }

    const variantId = this.resolveVariant(entry, dto.variantId ?? null);

    if (!variantId) {
      throw new BadRequestException('Every option for this product is out of stock.');
    }

    const cart = await this.cart.addItem(
      { kind: 'user', userId },
      { productId: entry.productId, variantId, quantity: dto.quantity },
    );

    // Only after the add succeeded - a failed add must leave the item saved.
    await this.prisma.wishlist.delete({ where: { id: entry.id } });

    return cart;
  }

  /* ---------------------------------------------------------------------- */
  /*  Sharing                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Returns the share link, minting one on first use.
   *
   * `regenerate` is the revoke button: a new token instantly dead-ends every
   * link handed out before it, which is the only way to take a public URL back.
   */
  async share(userId: string, regenerate = false): Promise<{ shareUrl: string; token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { wishlistShareToken: true },
    });

    if (!user) throw new NotFoundException('Account not found.');

    let token = user.wishlistShareToken;

    if (!token || regenerate) {
      // 32 hex chars - unguessable, and short enough to survive being pasted
      // into a chat app that likes to break long URLs.
      token = randomBytes(16).toString('hex');
      await this.prisma.user.update({
        where: { id: userId },
        data: { wishlistShareToken: token },
      });
    }

    return { token, shareUrl: this.shareUrl(token) };
  }

  async unshare(userId: string): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { wishlistShareToken: null },
    });

    return { message: 'Your wishlist is private again.' };
  }

  /* ---------------------------------------------------------------------- */

  private resolveVariant(entry: EntryRow, requested: string | null): string | null {
    const inStock = entry.product.variants.filter((variant) => variant.stockQuantity > 0);

    if (requested) {
      return inStock.some((variant) => variant.id === requested) ? requested : null;
    }

    if (entry.variantId && inStock.some((variant) => variant.id === entry.variantId)) {
      return entry.variantId;
    }

    return inStock[0]?.id ?? null;
  }

  /** Approved reviews only, matching what the product pages count. */
  private async ratingsFor(
    productIds: string[],
  ): Promise<Map<string, { rating: number; count: number }>> {
    if (productIds.length === 0) return new Map();

    const grouped = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, isApproved: true },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return new Map(
      grouped.map((row) => [
        row.productId,
        {
          rating: Math.round((row._avg.rating ?? 0) * 10) / 10,
          count: row._count._all,
        },
      ]),
    );
  }

  private shareUrl(token: string): string {
    const siteUrl = this.config.get<string>('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000';
    return `${siteUrl.replace(/\/$/, '')}/wishlist/shared/${token}`;
  }
}

/* -------------------------------------------------------------------------- */

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/** Same rule the cart enforces, so "saved" and "buyable" never disagree. */
function isVisible(product: Pick<ProductRow, 'status' | 'isActive' | 'deletedAt'>): boolean {
  return isPurchasableProduct(product);
}

function toEntry(
  row: EntryRow,
  ratings: Map<string, { rating: number; count: number }>,
): WishlistEntry {
  const { product } = row;
  const image = product.images[0];
  const summary = ratings.get(product.id);

  const variant = row.variantId
    ? product.variants.find((item) => item.id === row.variantId)
    : undefined;

  const currentPrice = Number(variant?.priceOverride ?? product.basePrice);
  const priceAtAdd = Number(row.priceAtAdd);
  const drop = Math.max(0, priceAtAdd - currentPrice);

  // Stock for the saved option specifically; for an entry saved without one,
  // the product as a whole.
  const stockQuantity = variant
    ? variant.stockQuantity
    : product.variants.reduce((sum, item) => sum + item.stockQuantity, 0);

  const purchasable = isVisible(product);

  return {
    id: row.id,
    addedAt: row.addedAt.toISOString(),
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      currency: product.currency as SupportedCurrency,
      image: image
        ? { url: image.url, altText: image.altText, blurhash: image.blurhash }
        : null,
      rating: summary?.rating ?? 0,
      reviewCount: summary?.count ?? 0,
      compareAtPrice:
        product.compareAtPrice === null ? null : Number(product.compareAtPrice),
    },
    variant: variant ? toVariantView(variant) : null,
    priceAtAdd,
    currentPrice,
    priceDropAmount: round(drop),
    priceDropPercent: priceAtAdd > 0 ? Math.round((drop / priceAtAdd) * 100) : 0,
    inStock: purchasable && stockQuantity > 0,
    stockQuantity: purchasable ? stockQuantity : 0,
  };
}

function toVariantView(variant: ProductRow['variants'][number]): CartLineVariant {
  const attributes =
    variant.attributes && typeof variant.attributes === 'object' && !Array.isArray(variant.attributes)
      ? Object.fromEntries(
          Object.entries(variant.attributes as Record<string, unknown>).map(([key, value]) => [
            key,
            String(value),
          ]),
        )
      : {};

  return { id: variant.id, sku: variant.sku, name: variant.name, attributes };
}
