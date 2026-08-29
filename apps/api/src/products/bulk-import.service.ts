import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Papa from 'papaparse';
import { bulkImportRowSchema, ProductStatus } from '@bazaar/shared';
import type { BulkImportResult, BulkImportRowError } from '@bazaar/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

const MAX_ROWS = 5000;

/**
 * CSV product import.
 *
 * Validates every row before writing anything, so a malformed file cannot leave
 * the catalog half-imported. Rows that fail are reported with their line number
 * and the admin fixes and re-uploads; valid rows in the same file still import.
 */
@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  /** Parses and validates without writing - powers the admin preview step. */
  parse(csv: string): {
    valid: Array<{ row: number; data: ReturnType<typeof bulkImportRowSchema.parse> }>;
    failed: BulkImportRowError[];
  } {
    const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      throw new BadRequestException(
        `Could not read that CSV: ${parsed.errors[0]?.message ?? 'unknown error'}`,
      );
    }

    if (parsed.data.length > MAX_ROWS) {
      throw new BadRequestException(
        `That file has ${parsed.data.length} rows. Split it into files of ${MAX_ROWS} or fewer.`,
      );
    }

    const valid: Array<{ row: number; data: ReturnType<typeof bulkImportRowSchema.parse> }> = [];
    const failed: BulkImportRowError[] = [];

    parsed.data.forEach((raw, index) => {
      // +2: one for the header row, one because humans count from 1.
      const row = index + 2;
      const result = bulkImportRowSchema.safeParse(raw);

      if (result.success) {
        valid.push({ row, data: result.data });
      } else {
        failed.push({
          row,
          sku: raw.sku,
          errors: result.error.issues.map((issue) => ({
            field: issue.path.join('.') || 'row',
            message: issue.message,
          })),
        });
      }
    });

    return { valid, failed };
  }

  async import(csv: string): Promise<BulkImportResult> {
    const { valid, failed } = this.parse(csv);

    const categories = await this.prisma.category.findMany({ select: { id: true, slug: true } });
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const touchedIds: string[] = [];

    for (const { row, data } of valid) {
      const categoryId = categoryBySlug.get(data.categorySlug);

      if (!categoryId) {
        failed.push({
          row,
          sku: data.sku,
          errors: [
            {
              field: 'categorySlug',
              message: `No category with the slug "${data.categorySlug}".`,
            },
          ],
        });
        skipped += 1;
        continue;
      }

      try {
        const slug = data.slug ?? slugify(data.name);
        const existing = await this.prisma.product.findUnique({ where: { sku: data.sku } });

        const fields = {
          name: data.name,
          slug: existing ? existing.slug : await this.uniqueSlug(slug),
          description: data.description ?? null,
          shortDescription: data.shortDescription ?? null,
          basePrice: data.basePrice,
          compareAtPrice: data.compareAtPrice ?? null,
          categoryId,
          brand: data.brand ?? null,
          tags: data.tags,
          isActive: data.isActive,
          status: data.isActive ? ProductStatus.ACTIVE : ProductStatus.DRAFT,
        } satisfies Prisma.ProductUncheckedUpdateInput;

        if (existing) {
          // Re-importing the same SKU updates rather than duplicating, so a
          // corrected file can simply be uploaded again.
          await this.prisma.product.update({ where: { id: existing.id }, data: fields });
          touchedIds.push(existing.id);
          updated += 1;
        } else {
          const product = await this.prisma.product.create({
            data: {
              ...fields,
              sku: data.sku,
              ...(data.imageUrl && {
                images: { create: { url: data.imageUrl, isPrimary: true, sortOrder: 0 } },
              }),
              variants: {
                create: {
                  sku: `${data.sku}-DEFAULT`,
                  name: 'Default',
                  stockQuantity: data.stockQuantity,
                },
              },
            },
          });
          touchedIds.push(product.id);
          created += 1;
        }
      } catch (error) {
        failed.push({
          row,
          sku: data.sku,
          errors: [
            {
              field: 'row',
              message: error instanceof Error ? error.message : 'Could not import this row.',
            },
          ],
        });
        skipped += 1;
      }
    }

    // Index once at the end rather than per row.
    for (const id of touchedIds) {
      await this.products.syncToSearch(id);
    }

    this.logger.log(
      `Bulk import finished: ${created} created, ${updated} updated, ${failed.length} failed.`,
    );

    return { created, updated, skipped, failed };
  }

  /** The importable column set, served to the admin as a starter file. */
  buildTemplate(): string {
    const headers = [
      'sku',
      'name',
      'slug',
      'description',
      'shortDescription',
      'basePrice',
      'compareAtPrice',
      'categorySlug',
      'brand',
      'tags',
      'stockQuantity',
      'imageUrl',
      'isActive',
    ];

    const example = [
      'BZR-TS-001',
      'Premium Cotton T-Shirt',
      'premium-cotton-t-shirt',
      'Soft combed cotton, pre-shrunk.',
      'Everyday cotton tee',
      '1499',
      '1999',
      'mens-clothing',
      'Bazaar Basics',
      'cotton|casual|summer',
      '120',
      'https://picsum.photos/seed/tshirt/800/800',
      'true',
    ];

    return `${headers.join(',')}\n${example.map(quoteCsv).join(',')}\n`;
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;

    while (await this.prisma.product.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function quoteCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
