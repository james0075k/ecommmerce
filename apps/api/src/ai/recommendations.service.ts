import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { BROWSE_HISTORY_LIMIT, BROWSE_SESSION_TTL_DAYS } from '@bazaar/shared';
import type { RecommendationReason } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ProductsService, type ProductListItem } from '../products/products.service';

/** How many cards a rail asks for. The blueprint says six to eight (E3). */
const RAIL_SIZE = 8;

/**
 * Relative weight of each signal in the blend.
 *
 * Co-purchase dominates deliberately: "people who bought this also bought that"
 * is evidence, while "same category" and "similar price" are guesses that only
 * exist to keep the rail full when a new product has no purchase history yet.
 * Every score is normalised to 0..1 before the weight is applied, so these
 * numbers mean what they look like they mean.
 */
const WEIGHTS: Record<'coPurchase' | 'category' | 'price', number> = {
  coPurchase: 1,
  category: 0.4,
  price: 0.25,
};

/** Orders that never completed say nothing about what goes with what. */
const COUNTED_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

/** A product is "similarly priced" within this fraction of the anchor price. */
const PRICE_BAND = 0.35;

export interface RecommendationRail {
  items: ProductListItem[];
  /** The strongest signal behind the rail, used as its subtitle. */
  reason: RecommendationReason;
}

interface Candidate {
  score: number;
  reason: RecommendationReason;
  reasonScore: number;
}

/**
 * E3: related products, and the homepage's "Recommended for you".
 *
 * There is no model call in this file, and that is the point. Recommendations
 * are arithmetic over the order book - fast, free, explainable, and correct on
 * a cold start in a way an LLM guess is not. The AI module hosts it because it
 * is the same feature surface, not because Claude is involved.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly products: ProductsService,
  ) {}

  /* ---------------------------------------------------------------------- */
  /*  Related products for one product                                      */
  /* ---------------------------------------------------------------------- */

  async forProduct(productId: string): Promise<RecommendationRail> {
    const anchor = await this.products.assertExists(productId);

    const candidates = new Map<string, Candidate>();

    const coPurchased = await this.coPurchasedWith([productId]);
    addAll(candidates, coPurchased, 'BOUGHT_TOGETHER', WEIGHTS.coPurchase);

    const sameCategory = await this.sameCategory([anchor.categoryId], [productId]);
    addAll(candidates, sameCategory, 'SAME_CATEGORY', WEIGHTS.category);

    const similarPrice = await this.similarPrice(Number(anchor.basePrice), [productId]);
    addAll(candidates, similarPrice, 'SIMILAR_PRICE', WEIGHTS.price);

    return this.hydrate(candidates, [productId], 'SAME_CATEGORY');
  }

  /* ---------------------------------------------------------------------- */
  /*  Personalised rail for a visitor                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Ranked from what this visitor has actually looked at.
   *
   * Falls back to the popular rail when the history is empty - a homepage
   * section that renders nothing on a first visit is a section that most
   * visitors never see.
   */
  async forVisitor(key: BrowseKey | null): Promise<RecommendationRail> {
    const viewed = key ? await this.readHistory(key) : [];

    if (viewed.length === 0) {
      return { items: await this.popular([]), reason: 'POPULAR' };
    }

    const anchors = await this.prisma.product.findMany({
      where: { id: { in: viewed }, isActive: true, deletedAt: null },
      select: { id: true, categoryId: true, basePrice: true },
    });

    if (anchors.length === 0) {
      return { items: await this.popular([]), reason: 'POPULAR' };
    }

    const exclude = anchors.map((anchor) => anchor.id);
    const candidates = new Map<string, Candidate>();

    addAll(
      candidates,
      await this.coPurchasedWith(exclude),
      'BOUGHT_TOGETHER',
      WEIGHTS.coPurchase,
    );

    addAll(
      candidates,
      await this.sameCategory(
        [...new Set(anchors.map((anchor) => anchor.categoryId))],
        exclude,
      ),
      'RECENTLY_VIEWED',
      WEIGHTS.category,
    );

    // The most recent view is the strongest signal of current intent, so the
    // price band is drawn around it rather than around the whole history.
    const [first] = anchors;
    const latest = anchors.find((anchor) => anchor.id === viewed[0]) ?? first;
    if (latest) {
      addAll(
        candidates,
        await this.similarPrice(Number(latest.basePrice), exclude),
        'SIMILAR_PRICE',
        WEIGHTS.price,
      );
    }

    return this.hydrate(candidates, exclude, 'RECENTLY_VIEWED');
  }

  /* ---------------------------------------------------------------------- */
  /*  Browsing history                                                      */
  /* ---------------------------------------------------------------------- */

  /** Most-recent-first, capped, deduplicated. */
  async recordView(key: BrowseKey, productId: string): Promise<void> {
    const history = await this.readHistory(key);
    const next = [productId, ...history.filter((id) => id !== productId)].slice(
      0,
      BROWSE_HISTORY_LIMIT,
    );

    await this.redis.set(
      redisKey(key),
      JSON.stringify(next),
      BROWSE_SESSION_TTL_DAYS * 24 * 60 * 60,
    );
  }

  async readHistory(key: BrowseKey): Promise<string[]> {
    const raw = await this.redis.get(redisKey(key));
    if (!raw) return [];

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id): id is string => typeof id === 'string');
    } catch {
      // A malformed value is not worth an error path - the rail just falls
      // back to popular products.
      return [];
    }
  }

  /** Hydrates the recently-viewed products themselves, newest first. */
  async recentlyViewed(key: BrowseKey | null): Promise<ProductListItem[]> {
    if (!key) return [];
    return this.products.listByIds(await this.readHistory(key));
  }

  /* ---------------------------------------------------------------------- */
  /*  Signals                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Collaborative filtering: other products in the orders that contained these.
   *
   * Two queries rather than a join, because Prisma is the only data path here
   * and a raw SQL self-join would buy a few milliseconds at the cost of the one
   * rule this codebase never bends. The order set is capped so a bestseller
   * cannot turn one recommendation into a table scan.
   */
  private async coPurchasedWith(productIds: string[]): Promise<Map<string, number>> {
    const orders = await this.prisma.orderItem.findMany({
      where: {
        productId: { in: productIds },
        order: { status: { in: COUNTED_STATUSES } },
      },
      select: { orderId: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
      distinct: ['orderId'],
    });

    if (orders.length === 0) return new Map();

    const lines = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        orderId: { in: orders.map((order) => order.orderId) },
        productId: { notIn: productIds, not: null },
        product: { isActive: true, deletedAt: null },
      },
      _count: { _all: true },
    });

    return normalise(
      lines
        .filter((line): line is typeof line & { productId: string } => line.productId !== null)
        .map((line) => [line.productId, line._count._all] as const),
    );
  }

  /** Newest active products in the same categories, excluding the anchors. */
  private async sameCategory(
    categoryIds: string[],
    exclude: string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.product.findMany({
      where: {
        categoryId: { in: categoryIds },
        id: { notIn: exclude },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, viewCount: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    // Ranked by views inside the category so the rail leans towards products
    // people actually open, not merely towards whatever was added last.
    return normalise(rows.map((row) => [row.id, row.viewCount + 1] as const));
  }

  /** Active products within +/-35% of the anchor price, closest first. */
  private async similarPrice(
    anchorPrice: number,
    exclude: string[],
  ): Promise<Map<string, number>> {
    if (!Number.isFinite(anchorPrice) || anchorPrice <= 0) return new Map();

    const rows = await this.prisma.product.findMany({
      where: {
        id: { notIn: exclude },
        isActive: true,
        deletedAt: null,
        basePrice: {
          gte: new Prisma.Decimal(anchorPrice * (1 - PRICE_BAND)),
          lte: new Prisma.Decimal(anchorPrice * (1 + PRICE_BAND)),
        },
      },
      select: { id: true, basePrice: true },
      take: 40,
    });

    return normalise(
      rows.map((row) => {
        const distance = Math.abs(Number(row.basePrice) - anchorPrice) / anchorPrice;
        return [row.id, Math.max(0, 1 - distance / PRICE_BAND)] as const;
      }),
    );
  }

  /** The cold-start rail: most-viewed active products. */
  private async popular(exclude: string[]): Promise<ProductListItem[]> {
    const rows = await this.prisma.product.findMany({
      where: { id: { notIn: exclude }, isActive: true, deletedAt: null },
      select: { id: true },
      orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
      take: RAIL_SIZE,
    });

    return this.products.listByIds(rows.map((row) => row.id));
  }

  /**
   * Turns the blended scores into cards, topping up from the popular rail so a
   * product with no signal at all still gets a full row rather than one lonely
   * card next to empty space.
   */
  private async hydrate(
    candidates: Map<string, Candidate>,
    exclude: string[],
    fallbackReason: RecommendationReason,
  ): Promise<RecommendationRail> {
    const ranked = [...candidates.entries()]
      .sort(([, a], [, b]) => b.score - a.score)
      .slice(0, RAIL_SIZE);

    let items = await this.products.listByIds(ranked.map(([id]) => id));

    if (items.length < RAIL_SIZE) {
      const have = new Set([...items.map((item) => item.id), ...exclude]);
      const filler = (await this.popular([...have])).slice(0, RAIL_SIZE - items.length);
      items = [...items, ...filler];
    }

    // The rail is labelled by the signal that actually produced its top card,
    // so "Often bought together" only ever appears over co-purchase data.
    const top = ranked[0]?.[1].reason;

    return { items, reason: top ?? (items.length > 0 ? fallbackReason : 'POPULAR') };
  }
}

/* -------------------------------------------------------------------------- */
/*  Browse key                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Whose history this is. A signed-in shopper is keyed by user id so the rail
 * follows them between devices; everyone else by the `bz_browse` cookie.
 */
export type BrowseKey =
  | { kind: 'user'; userId: string }
  | { kind: 'session'; sessionId: string };

function redisKey(key: BrowseKey): string {
  return key.kind === 'user' ? `browse:user:${key.userId}` : `browse:sid:${key.sessionId}`;
}

/* -------------------------------------------------------------------------- */
/*  Scoring helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Scales raw counts to 0..1 so signals of different magnitudes can be added. */
function normalise(entries: ReadonlyArray<readonly [string, number]>): Map<string, number> {
  const max = entries.reduce((highest, [, value]) => Math.max(highest, value), 0);
  if (max <= 0) return new Map();
  return new Map(entries.map(([id, value]) => [id, value / max]));
}

/**
 * Folds one signal into the candidate set.
 *
 * A product keeps the reason of its *strongest* single signal rather than of
 * the last one merged - otherwise the label would depend on call order, and
 * "similar price" would end up explaining a co-purchase.
 */
function addAll(
  candidates: Map<string, Candidate>,
  scores: Map<string, number>,
  reason: RecommendationReason,
  weight: number,
): void {
  for (const [id, raw] of scores) {
    const weighted = raw * weight;
    const existing = candidates.get(id);

    if (!existing) {
      candidates.set(id, { score: weighted, reason, reasonScore: weighted });
      continue;
    }

    existing.score += weighted;
    if (weighted > existing.reasonScore) {
      existing.reason = reason;
      existing.reasonScore = weighted;
    }
  }
}
