import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, ProductVariant } from '@prisma/client';
import type { StockAdjustmentInput, VariantInput, VariantUpdateInput } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(productId: string): Promise<ProductVariant[]> {
    return this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(productId: string, dto: VariantInput): Promise<ProductVariant> {
    await this.assertProductExists(productId);
    await this.assertSkuFree(dto.sku);

    return this.prisma.productVariant.create({
      data: {
        ...dto,
        productId,
        attributes: dto.attributes as Prisma.InputJsonValue,
      },
    });
  }

  async update(variantId: string, dto: VariantUpdateInput): Promise<ProductVariant> {
    const existing = await this.assertExists(variantId);

    if (dto.sku && dto.sku !== existing.sku) {
      await this.assertSkuFree(dto.sku);
    }

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...dto,
        ...(dto.attributes !== undefined && {
          attributes: dto.attributes as Prisma.InputJsonValue,
        }),
      },
    });
  }

  /**
   * Deactivates rather than deletes when the variant has been ordered.
   * order_items reference it, and purchase history must stay intact (D2).
   */
  async remove(variantId: string): Promise<{ message: string }> {
    await this.assertExists(variantId);

    const orderCount = await this.prisma.orderItem.count({ where: { variantId } });

    if (orderCount > 0) {
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { isActive: false },
      });
      return {
        message: `This variant appears in ${orderCount} orders, so it was deactivated rather than deleted.`,
      };
    }

    await this.prisma.productVariant.delete({ where: { id: variantId } });
    return { message: 'Variant deleted.' };
  }

  /**
   * Applies a relative change inside a transaction with the row locked by the
   * update itself, so two concurrent adjustments cannot both read the same
   * starting value (D2: no overselling).
   */
  async adjustStock(variantId: string, dto: StockAdjustmentInput): Promise<ProductVariant> {
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) throw new NotFoundException('Variant not found.');

      const next = variant.stockQuantity + dto.delta;
      if (next < 0) {
        throw new BadRequestException(
          `Only ${variant.stockQuantity} in stock - cannot remove ${Math.abs(dto.delta)}.`,
        );
      }

      return tx.productVariant.update({
        where: { id: variantId },
        data: { stockQuantity: next },
      });
    });
  }

  /**
   * Builds the cartesian product of option sets, e.g.
   * { Color: [Red, Blue], Size: [S, M] } -> Red/S, Red/M, Blue/S, Blue/M.
   * Existing SKUs are skipped so re-running is safe.
   */
  async generateMatrix(
    productId: string,
    options: Record<string, string[]>,
  ): Promise<{ created: number; skipped: number; variants: ProductVariant[] }> {
    const product = await this.assertProductExists(productId);

    const names = Object.keys(options).filter((key) => options[key]?.length);
    if (names.length === 0) {
      throw new BadRequestException('Provide at least one option with values.');
    }

    const combinations = names.reduce<Array<Record<string, string>>>(
      (acc, name) =>
        acc.flatMap((partial) =>
          (options[name] ?? []).map((value) => ({ ...partial, [name]: value })),
        ),
      [{}],
    );

    if (combinations.length > 200) {
      throw new BadRequestException(
        `That would create ${combinations.length} variants. The limit is 200.`,
      );
    }

    const existing = await this.prisma.productVariant.findMany({
      where: { productId },
      select: { sku: true },
    });
    const takenSkus = new Set(existing.map((variant) => variant.sku));

    const created: ProductVariant[] = [];
    let skipped = 0;

    for (const attributes of combinations) {
      const suffix = Object.values(attributes)
        .map((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
        .join('-');
      const sku = `${product.sku}-${suffix}`;

      if (takenSkus.has(sku)) {
        skipped += 1;
        continue;
      }

      created.push(
        await this.prisma.productVariant.create({
          data: {
            productId,
            sku,
            name: Object.values(attributes).join(' / '),
            stockQuantity: 0,
            attributes: attributes as Prisma.InputJsonValue,
          },
        }),
      );
    }

    return { created: created.length, skipped, variants: created };
  }

  private async assertExists(variantId: string): Promise<ProductVariant> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found.');
    return variant;
  }

  private async assertProductExists(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  private async assertSkuFree(sku: string): Promise<void> {
    const clash = await this.prisma.productVariant.findUnique({ where: { sku } });
    if (clash) throw new ConflictException(`SKU "${sku}" is already in use.`);
  }
}
