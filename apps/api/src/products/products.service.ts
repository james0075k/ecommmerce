import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Product } from '@prisma/client';
import { ProductStatus } from '@bazaar/shared';
import type {
  AdminProductInput,
  AdminProductUpdateInput,
  CatalogFacets,
  Paginated,
  ProductQueryInput,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { SearchService } from '../search/search.service';
import type { ProductDocument } from '../search/search.service';

/** Everything the listing grid needs, and nothing it does not. */
const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  shortDescription: true,
  basePrice: true,
  compareAtPrice: true,
  currency: true,
  brand: true,
  tags: true,
  isFeatured: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  images: {
    where: { isPrimary: true },
    take: 1,
    select: { url: true, altText: true, blurhash: true, width: true, height: true },
  },
  variants: {
    where: { isActive: true },
    select: { id: true, stockQuantity: true, priceOverride: true },
  },
} satisfies Prisma.ProductSelect;

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  brand: string | null;
  tags: string[];
  isFeatured: boolean;
  category: { id: string; name: string; slug: string };
  image: { url: string; altText: string | null; blurhash: string | null } | null;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  stockQuantity: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly search: SearchService,
  ) {}

  /* ---------------------------------------------------------------------- */
  /*  Listing                                                               */
  /* ---------------------------------------------------------------------- */

  async list(
    query: ProductQueryInput,
  ): Promise<Paginated<ProductListItem> & { facets: CatalogFacets }> {
    const where = await this.buildWhere(query);

    const [rows, total, ratings, facets] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: LIST_SELECT,
        orderBy: orderByFor(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
      this.aggregateRatingsFor(where),
      this.buildFacets(where),
    ]);

    let items = rows.map((row) => toListItem(row, ratings));

    // Rating is derived from the reviews table, so it cannot be an ORDER BY on
    // products. Sorting the page in memory is only correct because the whole
    // page is already in hand; a catalog-wide rating sort needs the denormalised
    // column that Phase 7 adds with the review aggregates.
    if (query.sort === 'rating') {
      items = [...items].sort((a, b) => b.rating - a.rating);
    }

    return {
      items,
      meta: buildMeta(query.page, query.limit, total),
      facets,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Detail                                                                */
  /* ---------------------------------------------------------------------- */

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, slug: true, parentId: true } },
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        videos: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: { inventory: true },
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found.');

    const [aggregate, reviewBuckets, related] = await Promise.all([
      this.prisma.review.aggregate({
        where: { productId: product.id, isApproved: true },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId: product.id, isApproved: true },
        _count: { _all: true },
      }),
      this.findRelated(product.id, product.categoryId),
    ]);

    // Views drive the "popular" sort. Fire and forget: a failed counter must
    // never break the page.
    void this.prisma.product
      .update({ where: { id: product.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    const stockQuantity = product.variants.reduce((sum, v) => sum + v.stockQuantity, 0);

    return {
      ...product,
      basePrice: Number(product.basePrice),
      compareAtPrice: product.compareAtPrice === null ? null : Number(product.compareAtPrice),
      variants: product.variants.map((variant) => ({
        ...variant,
        priceOverride: variant.priceOverride === null ? null : Number(variant.priceOverride),
        price: Number(variant.priceOverride ?? product.basePrice),
      })),
      reviewSummary: {
        rating: Number((aggregate._avg.rating ?? 0).toFixed(2)),
        count: aggregate._count._all,
        // Fill every star so the bar chart has all five rows, even at zero.
        distribution: [5, 4, 3, 2, 1].map((star) => ({
          rating: star,
          count: reviewBuckets.find((bucket) => bucket.rating === star)?._count._all ?? 0,
        })),
      },
      inStock: stockQuantity > 0,
      stockQuantity,
      related,
    };
  }

  /** Same category, cheapest-first tie-break on newest. */
  private async findRelated(productId: string, categoryId: string): Promise<ProductListItem[]> {
    const where: Prisma.ProductWhereInput = {
      id: { not: productId },
      categoryId,
      isActive: true,
      deletedAt: null,
    };

    const rows = await this.prisma.product.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const ratings = await this.aggregateRatingsFor({ id: { in: rows.map((r) => r.id) } });
    return rows.map((row) => toListItem(row, ratings));
  }

  /* ---------------------------------------------------------------------- */
  /*  Admin write                                                           */
  /* ---------------------------------------------------------------------- */

  async create(dto: AdminProductInput): Promise<Product> {
    await this.assertSkuFree(dto.sku);
    await this.assertSlugFree(dto.slug);

    const { images, variants, ...fields } = dto;

    const product = await this.prisma.product.create({
      data: {
        ...fields,
        attributes: fields.attributes as Prisma.InputJsonValue,
        images: { create: images },
        variants: {
          create: variants.map(({ id: _id, ...variant }) => ({
            ...variant,
            attributes: variant.attributes as Prisma.InputJsonValue,
          })),
        },
      },
    });

    await this.syncToSearch(product.id);
    return product;
  }

  async update(id: string, dto: AdminProductUpdateInput): Promise<Product> {
    const existing = await this.assertExists(id);

    if (dto.sku && dto.sku !== existing.sku) await this.assertSkuFree(dto.sku);
    if (dto.slug && dto.slug !== existing.slug) await this.assertSlugFree(dto.slug);

    const { images, variants, attributes, ...fields } = dto;

    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...fields,
          ...(attributes !== undefined && { attributes: attributes as Prisma.InputJsonValue }),
        },
      });

      // Images are replaced wholesale: the admin form always submits the full
      // ordered list, so a diff would be more code for the same result.
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (images.length > 0) {
          await tx.productImage.createMany({
            data: images.map((image) => ({ ...image, productId: id })),
          });
        }
      }

      // Variants are upserted by id and anything absent is deactivated rather
      // than deleted - order_items reference variants and must not dangle.
      if (variants) {
        const keptIds: string[] = [];

        for (const variant of variants) {
          const { id: variantId, ...data } = variant;
          const payload = { ...data, attributes: data.attributes as Prisma.InputJsonValue };

          if (variantId) {
            await tx.productVariant.update({ where: { id: variantId }, data: payload });
            keptIds.push(variantId);
          } else {
            const created = await tx.productVariant.create({
              data: { ...payload, productId: id },
            });
            keptIds.push(created.id);
          }
        }

        await tx.productVariant.updateMany({
          where: { productId: id, id: { notIn: keptIds } },
          data: { isActive: false },
        });
      }

      return updated;
    });

    await this.syncToSearch(id);
    return product;
  }

  /** Soft delete - orders and reviews keep pointing at a real row. */
  async remove(id: string): Promise<{ message: string }> {
    await this.assertExists(id);

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: ProductStatus.ARCHIVED },
    });

    await this.search.removeProduct(id);
    return { message: 'Product archived.' };
  }

  async restore(id: string): Promise<Product> {
    const product = await this.prisma.product.update({
      where: { id },
      data: { deletedAt: null, isActive: true, status: ProductStatus.ACTIVE },
    });

    await this.syncToSearch(id);
    return product;
  }

  /* ---------------------------------------------------------------------- */
  /*  Search sync                                                           */
  /* ---------------------------------------------------------------------- */

  async syncToSearch(productId: string): Promise<void> {
    const document = await this.buildDocument(productId);
    if (document) await this.search.upsertProducts([document]);
  }

  async reindexAll(): Promise<{ indexed: number; engine: string }> {
    const ids = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true },
    });

    const documents = (
      await Promise.all(ids.map((row) => this.buildDocument(row.id)))
    ).filter((document): document is ProductDocument => document !== null);

    return this.search.reindexAll(documents);
  }

  private async buildDocument(productId: string): Promise<ProductDocument | null> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        category: { select: { id: true, slug: true, name: true } },
        images: { where: { isPrimary: true }, take: 1 },
        variants: { where: { isActive: true }, select: { stockQuantity: true } },
      },
    });

    if (!product) return null;

    const aggregate = await this.prisma.review.aggregate({
      where: { productId, isApproved: true },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const primaryImage = product.images[0];

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      description: stripHtml(product.description ?? ''),
      shortDescription: product.shortDescription ?? '',
      brand: product.brand ?? '',
      tags: product.tags,
      categoryId: product.categoryId,
      categorySlug: product.category.slug,
      categoryName: product.category.name,
      price: Number(product.basePrice),
      compareAtPrice: product.compareAtPrice === null ? null : Number(product.compareAtPrice),
      currency: product.currency,
      rating: Number((aggregate._avg.rating ?? 0).toFixed(2)),
      reviewCount: aggregate._count._all,
      inStock: product.variants.some((variant) => variant.stockQuantity > 0),
      isFeatured: product.isFeatured,
      imageUrl: primaryImage?.url ?? null,
      blurhash: primaryImage?.blurhash ?? null,
      createdAt: product.createdAt.getTime(),
    };
  }

  /* ---------------------------------------------------------------------- */

  /** Resolves the query into a Prisma filter, expanding a category to its subtree. */
  private async buildWhere(query: ProductQueryInput): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = { isActive: true, deletedAt: null };

    if (query.category) {
      const category = await this.prisma.category.findUnique({
        where: { slug: query.category },
        select: { id: true },
      });

      if (category) {
        // Filtering on "Electronics" must include Phones and Smartphones.
        const ids = await this.categories.collectDescendantIds(category.id);
        where.categoryId = { in: ids };
      } else {
        // An unknown slug matches nothing rather than silently matching all.
        where.categoryId = { in: [] };
      }
    }

    if (query.brand) where.brand = query.brand;
    if (query.featured) where.isFeatured = true;

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.basePrice = {
        ...(query.minPrice !== undefined && { gte: query.minPrice }),
        ...(query.maxPrice !== undefined && { lte: query.maxPrice }),
      };
    }

    if (query.inStock) {
      where.variants = { some: { isActive: true, stockQuantity: { gt: 0 } } };
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { shortDescription: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** One grouped query for the whole page instead of N per-product aggregates. */
  private async aggregateRatingsFor(
    where: Prisma.ProductWhereInput,
  ): Promise<Map<string, { rating: number; count: number }>> {
    const groups = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { isApproved: true, product: where },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return new Map(
      groups.map((group) => [
        group.productId,
        {
          rating: Number((group._avg.rating ?? 0).toFixed(2)),
          count: group._count._all,
        },
      ]),
    );
  }

  /**
   * Facets are computed against the filter *without* the brand clause, so
   * selecting a brand does not collapse the brand list to that one option.
   */
  private async buildFacets(where: Prisma.ProductWhereInput): Promise<CatalogFacets> {
    const { brand: _brand, ...withoutBrand } = where;

    const [brandGroups, priceAggregate, categoryGroups] = await Promise.all([
      this.prisma.product.groupBy({
        by: ['brand'],
        where: withoutBrand,
        _count: { _all: true },
        orderBy: { _count: { brand: 'desc' } },
      }),
      this.prisma.product.aggregate({
        where,
        _min: { basePrice: true },
        _max: { basePrice: true },
      }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where,
        _count: { _all: true },
      }),
    ]);

    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryGroups.map((group) => group.categoryId) } },
      select: { id: true, name: true, slug: true },
    });

    return {
      categories: categoryGroups.map((group) => {
        const category = categories.find((entry) => entry.id === group.categoryId);
        return {
          value: category?.slug ?? group.categoryId,
          label: category?.name ?? 'Unknown',
          count: group._count._all,
        };
      }),
      brands: brandGroups
        .filter((group): group is typeof group & { brand: string } => !!group.brand)
        .map((group) => ({ value: group.brand, count: group._count._all })),
      priceRange: {
        min: Math.floor(Number(priceAggregate._min.basePrice ?? 0)),
        max: Math.ceil(Number(priceAggregate._max.basePrice ?? 0)),
      },
    };
  }

  async assertExists(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  private async assertSkuFree(sku: string): Promise<void> {
    const clash = await this.prisma.product.findUnique({ where: { sku } });
    if (clash) throw new ConflictException(`SKU "${sku}" is already in use.`);
  }

  private async assertSlugFree(slug: string): Promise<void> {
    const clash = await this.prisma.product.findUnique({ where: { slug } });
    if (clash) throw new ConflictException(`The slug "${slug}" is already in use.`);
  }
}

/* -------------------------------------------------------------------------- */

type ListRow = Prisma.ProductGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(
  row: ListRow,
  ratings: Map<string, { rating: number; count: number }>,
): ProductListItem {
  const stockQuantity = row.variants.reduce((sum, variant) => sum + variant.stockQuantity, 0);
  const summary = ratings.get(row.id);
  const image = row.images[0];

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    shortDescription: row.shortDescription,
    price: Number(row.basePrice),
    compareAtPrice: row.compareAtPrice === null ? null : Number(row.compareAtPrice),
    currency: row.currency,
    brand: row.brand,
    tags: row.tags,
    isFeatured: row.isFeatured,
    category: row.category,
    image: image
      ? { url: image.url, altText: image.altText, blurhash: image.blurhash }
      : null,
    rating: summary?.rating ?? 0,
    reviewCount: summary?.count ?? 0,
    inStock: stockQuantity > 0,
    stockQuantity,
  };
}

function orderByFor(
  sort: ProductQueryInput['sort'],
): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc':
      return { basePrice: 'asc' };
    case 'price_desc':
      return { basePrice: 'desc' };
    case 'popular':
      return { viewCount: 'desc' };
    case 'rating':
      // Re-sorted in memory once ratings are joined; this keeps the page stable.
      return { createdAt: 'desc' };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

function buildMeta(page: number, limit: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/** Rich-text descriptions are indexed as plain text. */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
}
