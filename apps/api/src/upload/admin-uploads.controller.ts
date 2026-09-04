import { Body, Controller, Post } from '@nestjs/common';
import { imageUploadRequestSchema, UserRole } from '@bazaar/shared';
import type { ImageUploadRequest } from '@bazaar/shared';

import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UploadService, type PresignedUpload } from './upload.service';

/**
 * A presigned upload that does not need a product to exist yet.
 *
 * The per-product route (`/admin/products/:id/images/upload-url`) is still the
 * right one once there *is* a product, because it files the object under that
 * product's prefix. But an operator creating a product drags the photographs in
 * before they press save, and requiring the record first would mean either
 * saving a half-finished draft behind their back or refusing the upload until
 * they do. Objects land under a shared prefix instead and are attached to the
 * product when the form is submitted (Phase 8).
 */
@Controller('admin/uploads')
@Roles(UserRole.ADMIN)
export class AdminUploadsController {
  constructor(private readonly uploads: UploadService) {}

  @Post('image')
  createImageUpload(
    @Body(new ZodValidationPipe(imageUploadRequestSchema)) dto: ImageUploadRequest,
  ): Promise<PresignedUpload> {
    return this.uploads.createDraftImageUpload(dto.contentType);
  }
}
