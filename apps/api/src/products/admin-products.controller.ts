import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Product, ProductImage, ProductVariant } from '@prisma/client';
import {
  adminProductQuerySchema,
  adminProductSchema,
  adminProductUpdateSchema,
  attachImageSchema,
  bulkProductActionSchema,
  imageUploadRequestSchema,
  stockAdjustmentSchema,
  UserRole,
  variantInputSchema,
  variantUpdateSchema,
} from '@bazaar/shared';
import type {
  AdminProductInput,
  AdminProductQueryInput,
  AdminProductRow,
  AdminProductUpdateInput,
  AttachImageInput,
  BulkImportResult,
  BulkProductActionInput,
  BulkProductResult,
  ImageUploadRequest,
  Paginated,
  StockAdjustmentInput,
  VariantInput,
  VariantUpdateInput,
} from '@bazaar/shared';

import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UploadService } from '../upload/upload.service';
import type { PresignedUpload } from '../upload/upload.service';
import { BulkImportService } from './bulk-import.service';
import { AdminProductsService } from './admin-products.service';
import { ProductImagesService } from './product-images.service';
import { ProductsService } from './products.service';
import { VariantsService } from './variants.service';

/** Every route requires ADMIN; SUPER_ADMIN satisfies it via RolesGuard. */
@Controller('admin/products')
@Roles(UserRole.ADMIN)
export class AdminProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly admin: AdminProductsService,
    private readonly variants: VariantsService,
    private readonly images: ProductImagesService,
    private readonly bulkImport: BulkImportService,
    private readonly uploads: UploadService,
  ) {}

  /* --- Products ---------------------------------------------------------- */

  /**
   * The admin catalog table.
   *
   * `adminProductQuerySchema`, not the storefront's - that one hardcodes
   * "active and not deleted", which hides exactly the drafts and archived rows
   * this table exists to manage (Phase 8).
   */
  @Get()
  list(
    @Query(new ZodValidationPipe(adminProductQuerySchema)) query: AdminProductQueryInput,
  ): Promise<Paginated<AdminProductRow>> {
    return this.admin.list(query);
  }

  /** Declared before any `:id` route so "brands" is not read as a product id. */
  @Get('brands')
  brands(): Promise<string[]> {
    return this.admin.brands();
  }

  /** One action across a selection. Partial success is reported, not thrown. */
  @Patch('bulk')
  @HttpCode(HttpStatus.OK)
  bulk(
    @Body(new ZodValidationPipe(bulkProductActionSchema)) dto: BulkProductActionInput,
  ): Promise<BulkProductResult> {
    return this.admin.bulkAction(dto);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(adminProductSchema)) dto: AdminProductInput,
  ): Promise<Product> {
    return this.products.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(adminProductUpdateSchema)) dto: AdminProductUpdateInput,
  ): Promise<Product> {
    return this.products.update(id, dto);
  }

  /** Soft delete - orders and reviews keep pointing at a real row. */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.products.remove(id);
  }

  @Post(':id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.restore(id);
  }

  /* --- Images ------------------------------------------------------------ */

  /** Presigned S3 POST; the browser uploads directly, then calls attach below. */
  @Post(':id/images/upload-url')
  createUploadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(imageUploadRequestSchema)) dto: ImageUploadRequest,
  ): Promise<PresignedUpload> {
    return this.uploads.createProductImageUpload(id, dto.contentType);
  }

  /** Records the uploaded image and derives its blurhash and dimensions. */
  @Post(':id/images')
  attachImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(attachImageSchema)) dto: AttachImageInput,
  ): Promise<ProductImage> {
    return this.images.attach(id, dto);
  }

  @Get(':id/images')
  listImages(@Param('id', ParseUUIDPipe) id: string): Promise<ProductImage[]> {
    return this.images.list(id);
  }

  @Patch(':id/images/reorder')
  reorderImages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('orderedIds') orderedIds: string[],
  ): Promise<ProductImage[]> {
    return this.images.reorder(id, orderedIds ?? []);
  }

  @Patch('images/:imageId/primary')
  setPrimaryImage(@Param('imageId', ParseUUIDPipe) imageId: string): Promise<ProductImage> {
    return this.images.setPrimary(imageId);
  }

  @Delete('images/:imageId')
  removeImage(@Param('imageId', ParseUUIDPipe) imageId: string): Promise<{ message: string }> {
    return this.images.remove(imageId);
  }

  /* --- Variants ---------------------------------------------------------- */

  @Get(':id/variants')
  listVariants(@Param('id', ParseUUIDPipe) id: string): Promise<ProductVariant[]> {
    return this.variants.list(id);
  }

  @Post(':id/variants')
  createVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(variantInputSchema)) dto: VariantInput,
  ): Promise<ProductVariant> {
    return this.variants.create(id, dto);
  }

  /** Cartesian product of option sets: Color x Size -> Red/S, Red/M, ... */
  @Post(':id/variants/matrix')
  generateMatrix(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('options') options: Record<string, string[]>,
  ) {
    return this.variants.generateMatrix(id, options ?? {});
  }

  @Patch('variants/:variantId')
  updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(variantUpdateSchema)) dto: VariantUpdateInput,
  ): Promise<ProductVariant> {
    return this.variants.update(variantId, dto);
  }

  @Patch('variants/:variantId/stock')
  adjustStock(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(stockAdjustmentSchema)) dto: StockAdjustmentInput,
  ): Promise<ProductVariant> {
    return this.variants.adjustStock(variantId, dto);
  }

  @Delete('variants/:variantId')
  removeVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<{ message: string }> {
    return this.variants.remove(variantId);
  }

  /* --- Bulk import ------------------------------------------------------- */

  /** Validates without writing, so the admin can preview before committing. */
  @Post('bulk-import/preview')
  previewImport(@Body('csv') csv: string) {
    const { valid, failed } = this.bulkImport.parse(csv ?? '');
    return { willImport: valid.length, failed, sample: valid.slice(0, 10).map((v) => v.data) };
  }

  @Post('bulk-import')
  runImport(@Body('csv') csv: string): Promise<BulkImportResult> {
    return this.bulkImport.import(csv ?? '');
  }

  @Get('bulk-import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="bazaar-products-template.csv"')
  downloadTemplate(): string {
    return this.bulkImport.buildTemplate();
  }

  /* --- Search index ------------------------------------------------------ */

  @Post('reindex')
  reindex(): Promise<{ indexed: number; engine: string }> {
    return this.products.reindexAll();
  }
}
