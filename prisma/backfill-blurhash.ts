/**
 * Backfills `blurhash`, `width` and `height` on product images (Phase 11).
 *
 *   pnpm db:blurhash            fill in the images that have no hash
 *   BLURHASH_FORCE=1 pnpm db:blurhash   recompute every image
 *
 * Phase 11 renders a blur-up placeholder from `products.images.blurhash`, and
 * `ProductImagesService` derives one for every image uploaded through the admin
 * panel. Two sets of rows never went through that path: anything created before
 * the column existed, and everything the seed writes - the demo catalogue points
 * at picsum URLs and stores them without fetching a byte, which is what keeps
 * seeding fast and possible offline.
 *
 * The result is a catalogue where the placeholder silently does nothing. This
 * closes that gap without moving the network cost into the seed.
 *
 * Re-running is safe. Rows that already have a hash are skipped unless
 * BLURHASH_FORCE is set, and an image that cannot be fetched is left alone and
 * reported rather than written as null - so a second run picks it up.
 *
 * This writes straight to the database, so it does not go through the paths
 * that invalidate the API's catalog cache. Listings keep serving their cached
 * copy until the five-minute TTL expires, at which point the placeholders
 * appear. Restart the API if you want them immediately.
 */
import { PrismaClient } from '@prisma/client';
import { encode } from 'blurhash';
import sharp from 'sharp';

const prisma = new PrismaClient();

/** Same parameters as `ProductImagesService`, so both paths agree. */
const BLURHASH_X = 4;
const BLURHASH_Y = 3;
const BLURHASH_SIZE = 32;
const FETCH_TIMEOUT_MS = 8000;

/**
 * How many images are fetched at once.
 *
 * Six is enough to keep the pipe busy without looking like a scrape to whatever
 * is serving the images - which for the demo catalogue is picsum, and it does
 * rate-limit.
 */
const CONCURRENCY = 6;

interface Derived {
  width: number | null;
  height: number | null;
  blurhash: string;
}

async function derive(url: string): Promise<Derived> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Fetch returned ${response.status}`);

    const image = sharp(Buffer.from(await response.arrayBuffer()));
    const { width, height } = await image.metadata();

    const { data, info } = await image
      .raw()
      .ensureAlpha()
      // `inside` preserves the aspect ratio, so a wide banner does not encode
      // as a square and decode to a stretched smear.
      .resize(BLURHASH_SIZE, BLURHASH_SIZE, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });

    return {
      width: width ?? null,
      height: height ?? null,
      blurhash: encode(
        new Uint8ClampedArray(data),
        info.width,
        info.height,
        BLURHASH_X,
        BLURHASH_Y,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const force = process.env.BLURHASH_FORCE === '1';

  const images = await prisma.productImage.findMany({
    where: force ? {} : { blurhash: null },
    select: { id: true, url: true },
    orderBy: { createdAt: 'asc' },
  });

  if (images.length === 0) {
    console.log('Every product image already has a blurhash. Nothing to do.');
    return;
  }

  console.log(
    `Deriving blurhashes for ${images.length} image${images.length === 1 ? '' : 's'}…`,
  );

  let done = 0;
  let failed = 0;

  // A shared cursor rather than chunked batches: with batches the whole group
  // waits on its slowest member, and one 8-second timeout stalls five images
  // that would each have taken 200ms.
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;

      const image = images[index];
      if (!image) return;

      try {
        const { width, height, blurhash } = await derive(image.url);
        await prisma.productImage.update({
          where: { id: image.id },
          data: { blurhash, width, height },
        });
        done += 1;
      } catch (error) {
        failed += 1;
        console.warn(
          `  skipped ${image.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if ((done + failed) % 25 === 0) {
        console.log(`  ${done + failed}/${images.length}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, images.length) }, () => worker()),
  );

  console.log(`Done. ${done} updated, ${failed} skipped.`);

  if (failed > 0) {
    console.log('Re-run to retry the skipped ones - they were left untouched.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
