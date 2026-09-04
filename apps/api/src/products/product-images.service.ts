import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ProductImage } from '@prisma/client';
import { encode } from 'blurhash';
import sharp from 'sharp';
import type { AttachImageInput } from '@bazaar/shared';

import { CacheService } from '../common/redis/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

/** Blurhash components. 4x3 is the usual sweet spot for product photography. */
const BLURHASH_X = 4;
const BLURHASH_Y = 3;
/** Downscale before encoding - blurhash only needs a thumbnail's worth of data. */
const BLURHASH_SIZE = 32;
const FETCH_TIMEOUT_MS = 8000;

/* --- Derivative encoding (Phase 12.6) ------------------------------------ */

/**
 * The widest the storefront ever renders a product image: the detail page's
 * zoom view at 2x on a large display. `deviceSizes` in next.config.ts tops out
 * at 1920, and asking the optimiser for more pixels than the source has only
 * wastes them.
 */
const MAX_EDGE_PX = 2000;

/**
 * AVIF at this quality is visually indistinguishable from the source for
 * product photography and lands roughly 50% smaller than equivalent WebP.
 * `effort` is the encode-time/size trade: 4 is the point past which each extra
 * level costs seconds per image for single-digit percentages.
 */
const AVIF_QUALITY = 62;
const AVIF_EFFORT = 4;

/**
 * Below this, re-encoding is not worth a round trip to S3 and a second object
 * to store. A 180KB JPEG is already fine; the images this exists for are the
 * 8MB ones straight off a phone.
 */
const SKIP_BELOW_BYTES = 200 * 1024;

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly uploads: UploadService,
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

    const processed = await this.process(dto.url);

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      }

      const existingCount = await tx.productImage.count({ where: { productId } });

      return tx.productImage.create({
        data: {
          productId,
          url: processed.url,
          originalUrl: processed.originalUrl,
          altText: dto.altText ?? null,
          sortOrder: dto.sortOrder,
          // The first image uploaded becomes primary whether or not it was asked for.
          isPrimary: dto.isPrimary || existingCount === 0,
          width: processed.width,
          height: processed.height,
          blurhash: processed.blurhash,
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

  /**
   * Fetches an uploaded image, compresses it, writes the result back to S3 and
   * returns everything the row needs (Phase 12.6).
   *
   * Why this happens here and not at upload time: the browser uploads straight
   * to S3 with a presigned POST, so the API never sees the bytes. Attaching the
   * image is the first moment it can, and it is already fetching the file to
   * compute the blurhash - the derivative costs one decode, not one round trip.
   *
   * Every failure degrades to "store the original URL and carry on". A product
   * with a heavy image is a slow page; a product with no image because the
   * encoder choked is a lost sale.
   */
  private async process(url: string): Promise<{
    url: string;
    originalUrl: string | null;
    width: number | null;
    height: number | null;
    blurhash: string | null;
  }> {
    const source = await this.fetchImage(url);
    if (!source) return { url, originalUrl: null, width: null, height: null, blurhash: null };

    const metadata = await this.deriveMetadataFrom(source);

    // Only ever rewrite objects in our own bucket. An admin can paste any URL
    // into the image field, and the seed catalogue points at picsum.
    const key = this.uploads.keyFromUrl(url);

    const worthEncoding =
      key !== null &&
      this.uploads.isConfigured() &&
      (source.byteLength > SKIP_BELOW_BYTES ||
        (metadata.width ?? 0) > MAX_EDGE_PX ||
        (metadata.height ?? 0) > MAX_EDGE_PX);

    if (!key || !worthEncoding) {
      return { url, originalUrl: null, ...metadata };
    }

    try {
      const encoded = await sharp(source)
        // `withoutEnlargement` matters: a 400px image asked to fit 2000 would
        // otherwise be upscaled into a larger file with no more detail in it.
        .resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
        // Strips EXIF, which on a phone photo includes the GPS coordinates of
        // wherever the product was photographed.
        .rotate()
        .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
        .toBuffer({ resolveWithObject: true });

      // A derivative that came out bigger than the source is a worse file and a
      // second object to pay for. It happens with flat graphics and small PNGs.
      if (encoded.data.byteLength >= source.byteLength) {
        return { url, originalUrl: null, ...metadata };
      }

      const derivativeKey = `${key.replace(/\.[^./]+$/, '')}-opt.avif`;
      const derivativeUrl = await this.uploads.putObject(
        derivativeKey,
        encoded.data,
        'image/avif',
      );

      this.logger.log(
        `Compressed ${key}: ${kb(source.byteLength)} -> ${kb(encoded.data.byteLength)}`,
      );

      return {
        url: derivativeUrl,
        originalUrl: url,
        // The encoder's own output dimensions, not the source's - the resize
        // above may have changed them, and the storefront reads these to
        // reserve layout space.
        width: encoded.info.width,
        height: encoded.info.height,
        blurhash: metadata.blurhash,
      };
    } catch (error) {
      this.logger.warn(
        `Could not compress ${url}, keeping the original: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { url, originalUrl: null, ...metadata };
    }
  }

  /** Downloads an image, or null if it cannot be read. */
  private async fetchImage(url: string): Promise<Buffer | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Fetch returned ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(
        `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Width, height and blurhash from bytes already in memory. */
  private async deriveMetadataFrom(
    buffer: Buffer,
  ): Promise<{ width: number | null; height: number | null; blurhash: string | null }> {
    try {
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
        `Could not derive blurhash: ${error instanceof Error ? error.message : String(error)}`,
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

/** Byte count as a rounded kilobyte figure, for the compression log line. */
function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}
