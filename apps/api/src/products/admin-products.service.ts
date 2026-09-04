import { Injectable } from '@nestjs/common';
import { AdminAction, OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { LOW_STOCK_THRESHOLD } from '@bazaar/shared';
import type {
  AdminProductQueryInput,
  AdminProductRow,
  BulkProductActionInput,
  BulkProductResult,
  Paginated,
} from '@bazaar/shared';

import { ActivityLogService } from '../admin/activity-log.service';
import { CacheService } from '../common/redis/cache.service';
import { PrismaService } from '../prisma/prisma.service';

const ROW_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  brand: true,
  status: true,
  isActive: true,
  isFeatured: true,
  basePrice: true,
  compareAtPrice: true,
  currency: true,
  categoryId: true,
  viewCount: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true } },
  images: { where: { isPrimary: true }, take: 1, select: { url: true } },
  variants: { select: { stockQuantity: true, isActive: true } },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof ROW_SELECT }>;

/** Statuses that mean a product is still owed to somebody. */
const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
];

/**
 * The catalog as the person maintaining it sees it.
 *
 * Separate from `ProductsService.list` on purpose. That method hardcodes
 * `isActive: true, deletedAt: null` because a shopper must never be shown a
 * draft - which makes it exactly the wrong query for the operator whose job is
 * to find the draft. Sharing one method with a flag would put a boolean between
 * a shopper and an unpublished product, and that is not a boolean worth
 * trusting.
 */
@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly cache: CacheService,
  ) {}

  async list(query: AdminProductQueryInput): Promise<Paginated<AdminProductRow>> {
    const where: Prisma.ProductWhereInput = {
      ...(query.includeArchived ? {} : { deletedAt: null }),
      ...(query.status && { status: query.status }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.brand && { brand: query.brand }),
      ...(query.featured !== undefined && { isFeatured: query.featured }),
      ...(query.lowStock && {
        variants: { some: { stockQuantity: { lte: LOW_STOCK_THRESHOLD }, isActive: true } },
      }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { sku: { contains: query.search, mode: 'insensitive' as const } },
          { slug: { contains: query.search, mode: 'insensitive' as const } },
          { brand: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    // Stock is the sum of a relation, which Prisma cannot order by. Those two
    // sorts fetch a bounded candidate set and rank it here; every other sort is
    // a real ORDER BY and pages properly.
    const computedSort = query.sort === 'stock_asc' || query.sort === 'stock_desc';
    const take = computedSort ? Math.min(500, query.page * query.limit + 200) : query.limit;
    const skip = computedSort ? 0 : (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: ROW_SELECT,
        orderBy: orderByFor(query.sort),
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    let items = rows.map(toRow);

    if (computedSort) {
      items.sort((a, b) =>
        query.sort === 'stock_asc'
          ? a.stockQuantity - b.stockQuantity
          : b.stockQuantity - a.stockQuantity,
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

  /**
   * Applies one action across a selection.
   *
   * Rows are checked individually and failures are reported rather than thrown,
   * for the reason bulk order updates work the same way: an operator selecting
   * two hundred products will have picked up one that cannot move, and rolling
   * back the other hundred and ninety-nine because of it turns a small surprise
   * into a large one.
   *
   * DELETE is a soft delete except where nothing references the product, and it
   * is refused outright while an order is still open against it - an order line
   * keeps a snapshot, but the shopper chasing that order still needs the page.
   */
  async bulkAction(dto: BulkProductActionInput): Promise<BulkProductResult> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.productIds } },
      select: { id: true, name: true, status: true, isActive: true, isFeatured: true, deletedAt: true },
    });

    const found = new Map(products.map((product) => [product.id, product]));
    const failures: BulkProductResult['failures'] = [];
    const applicable: string[] = [];

    // One query for the whole selection rather than one per product.
    const blocked = new Set(
      dto.action === 'DELETE'
        ? (
            await this.prisma.orderItem.findMany({
              where: {
                productId: { in: dto.productIds },
                order: { status: { in: OPEN_ORDER_STATUSES } },
              },
              select: { productId: true },
              distinct: ['productId'],
            })
          ).flatMap((item) => (item.productId ? [item.productId] : []))
        : [],
    );

    for (const id of dto.productIds) {
      const product = found.get(id);

      if (!product) {
        failures.push({ productId: id, name: id, reason: 'No longer exists.' });
        continue;
      }

      if (dto.action === 'DELETE' && blocked.has(id)) {
        failures.push({
          productId: id,
          name: product.name,
          reason: 'It is on an order that has not been delivered yet.',
        });
        continue;
      }

      if (dto.action === 'RESTORE' && !product.deletedAt) {
        failures.push({ productId: id, name: product.name, reason: 'It is not archived.' });
        continue;
      }

      if (dto.action !== 'RESTORE' && dto.action !== 'DELETE' && product.deletedAt) {
        failures.push({
          productId: id,
          name: product.name,
          reason: 'It is archived. Restore it first.',
        });
        continue;
      }

      applicable.push(id);
    }

    let updated = 0;

    if (applicable.length > 0) {
      const result = await this.prisma.product.updateMany({
        where: { id: { in: applicable } },
        data: dataFor(dto.action),
      });

      updated = result.count;

      await this.activity.record({
        action: dto.action === 'DELETE' ? AdminAction.DELETE : AdminAction.UPDATE,
        entityType: 'product',
        summary: `Bulk ${dto.action.toLowerCase()} on ${updated} product${updated === 1 ? '' : 's'}`,
        meta: {
          bulkAction: dto.action,
          productIds: applicable.slice(0, 50),
          requested: dto.productIds.length,
          failed: failures.length,
        },
      });

      // Publishing, archiving or featuring a batch changes what every listing
      // page shows, so the cached ones have to go.
      await Promise.all([
        this.cache.invalidate('products'),
        this.cache.invalidate('categories'),
      ]);
    }

    return { updated, failures };
  }

  /** Distinct brands, for the table's brand filter. */
  async brands(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { deletedAt: null, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
      take: 200,
    });

    return rows.flatMap((row) => (row.brand ? [row.brand] : []));
  }

}

/* -------------------------------------------------------------------------- */

/**
 * What each action writes.
 *
 * `isActive` moves with `status` rather than being set independently: they are
 * two representations of the same fact, and letting them disagree produces an
 * ACTIVE product that no shopper can see, which is the hardest kind of bug to
 * notice because everything looks right in the table.
 */
function dataFor(action: BulkProductActionInput['action']): Prisma.ProductUpdateManyMutationInput {
  switch (action) {
    case 'ACTIVATE':
      return { status: ProductStatus.ACTIVE, isActive: true };
    case 'DRAFT':
      return { status: ProductStatus.DRAFT, isActive: false };
    case 'ARCHIVE':
      return { status: ProductStatus.ARCHIVED, isActive: false };
    case 'FEATURE':
      return { isFeatured: true };
    case 'UNFEATURE':
      return { isFeatured: false };
    case 'RESTORE':
      return { deletedAt: null, status: ProductStatus.DRAFT, isActive: false };
    case 'DELETE':
      return { deletedAt: new Date(), isActive: false, status: ProductStatus.ARCHIVED };
  }
}

function orderByFor(sort: AdminProductQueryInput['sort']): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case 'oldest':
      return { createdAt: 'asc' };
    case 'name_asc':
      return { name: 'asc' };
    case 'name_desc':
      return { name: 'desc' };
    case 'price_asc':
      return { basePrice: 'asc' };
    case 'price_desc':
      return { basePrice: 'desc' };
    case 'updated':
      return { updatedAt: 'desc' };
    // The stock sorts still need a stable base order for the candidate set.
    case 'stock_asc':
    case 'stock_desc':
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

function toRow(product: ProductRow): AdminProductRow {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    brand: product.brand,
    status: product.status,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    basePrice: product.basePrice.toNumber(),
    compareAtPrice: product.compareAtPrice?.toNumber() ?? null,
    currency: product.currency,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    imageUrl: product.images[0]?.url ?? null,
    variantCount: product.variants.length,
    // Only active variants count: stock held on a disabled variant is stock
    // nobody can buy, and reporting it makes a sold-out product look stocked.
    stockQuantity: product.variants
      .filter((variant) => variant.isActive)
      .reduce((sum, variant) => sum + variant.stockQuantity, 0),
    viewCount: product.viewCount,
    deletedAt: product.deletedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
