import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ProductImage } from '@prisma/client';
import { encode } from 'blurhash';
import sharp from 'sharp';
import type { AttachImageInput } from '@bazaar/shared';

import { CacheService } from '../common/redis/cache.service';
import { PrismaService } from '../prisma/prisma.service';

/** Blurhash components. 4x3 is the usual sweet spot for product photography. */
const BLURHASH_X = 4;
const BLURHASH_Y = 3;
/** Downscale before encoding - blurhash only needs a thumbnail's worth of data. */
const BLURHASH_SIZE = 32;
const FETCH_TIMEOUT_MS = 8000;

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** The primary image is part of every cached listing row. */
  private async invalidateListings(): Promise<void> {
    await this.cache.invalidate('products');
  }

  async list(productId: string): Promise<ProductImage[]> {
    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  /**
   * Records an uploaded image and derives its blurhash and dimensions.
   *
   * A1.1 wants blur-up placeholders, which need the hash at render time; doing
   * it here means the storefront never computes anything. If the source cannot
   * be fetched the row is still written - a missing placeholder degrades the
   * loading experience, it does not break the product.
   */
  async attach(productId: string, dto: AttachImageInput): Promise<ProductImage> {
    await this.assertProductExists(productId);

    const metadata = await this.deriveMetadata(dto.url);

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      }

      const existingCount = await tx.productImage.count({ where: { productId } });

      return tx.productImage.create({
        data: {
          productId,
          url: dto.url,
          altText: dto.altText ?? null,
          sortOrder: dto.sortOrder,
          // The first image uploaded becomes primary whether or not it was asked for.
          isPrimary: dto.isPrimary || existingCount === 0,
          ...metadata,
        },
      });
    });

    await this.invalidateListings();
    return created;
  }

  async setPrimary(imageId: string): Promise<ProductImage> {
    const image = await this.assertExists(imageId);

    const primary = await this.prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({
        where: { productId: image.productId },
        data: { isPrimary: false },
      });
      return tx.productImage.update({ where: { id: imageId }, data: { isPrimary: true } });
    });

    await this.invalidateListings();
    return primary;
  }

  async reorder(productId: string, orderedIds: string[]): Promise<ProductImage[]> {
    await this.assertProductExists(productId);

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.productImage.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    // Reordering can promote a different photo into the grid's one visible
    // slot, so the cached rows are wrong until this runs.
    await this.invalidateListings();
    return this.list(productId);
  }

  async remove(imageId: string): Promise<{ message: string }> {
    const image = await this.assertExists(imageId);

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } });

      // Never leave a product without a primary image.
      if (image.isPrimary) {
        const next = await tx.productImage.findFirst({
          where: { productId: image.productId },
          orderBy: { sortOrder: 'asc' },
        });
        if (next) {
          await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }
    });

    await this.invalidateListings();
    return { message: 'Image removed.' };
  }

  /** Fetches the image and returns width, height and blurhash. */
  async deriveMetadata(
    url: string,
  ): Promise<{ width: number | null; height: number | null; blurhash: string | null }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Fetch returned ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      const image = sharp(buffer);
      const { width, height } = await image.metadata();

      const { data, info } = await image
        .raw()
        .ensureAlpha()
        .resize(BLURHASH_SIZE, BLURHASH_SIZE, { fit: 'inside' })
        .toBuffer({ resolveWithObject: true });

      const blurhash = encode(
        new Uint8ClampedArray(data),
        info.width,
        info.height,
        BLURHASH_X,
        BLURHASH_Y,
      );

      return { width: width ?? null, height: height ?? null, blurhash };
    } catch (error) {
      this.logger.warn(
        `Could not derive blurhash for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { width: null, height: null, blurhash: null };
    }
  }

  private async assertExists(imageId: string): Promise<ProductImage> {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Image not found.');
    return image;
  }

  private async assertProductExists(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found.');
  }
}
