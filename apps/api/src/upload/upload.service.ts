import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { randomUUID } from 'node:crypto';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_UPLOAD_BYTES } from '@bazaar/shared';

export interface PresignedUpload {
  /** POST the file here as multipart/form-data. */
  url: string;
  /** Every field must be appended to the form before the `file` field. */
  fields: Record<string, string>;
  /** Where the object will be readable once the upload completes. */
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
}

const PRESIGN_TTL_SECONDS = 300;

/**
 * Presigned S3 uploads.
 *
 * D1: the browser never receives AWS credentials, and the policy pins the
 * content type and a 5 MB ceiling, so a signed URL cannot be reused to upload
 * something else. The bucket stays private; objects are served through the CDN.
 */
@Injectable()
export class UploadService {
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly cdnUrl: string | undefined;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.region = this.config.get<string>('AWS_REGION') ?? 'ap-south-1';
    this.bucket = this.config.get<string>('S3_BUCKET_NAME') || undefined;
    this.cdnUrl = this.config.get<string>('CDN_URL') || undefined;

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.client =
      accessKeyId && secretAccessKey && this.bucket
        ? new S3Client({ region: this.region, credentials: { accessKeyId, secretAccessKey } })
        : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createAvatarUpload(userId: string, contentType: string): Promise<PresignedUpload> {
    return this.createUpload(`avatars/${userId}`, contentType);
  }

  async createProductImageUpload(
    productId: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    return this.createUpload(`products/${productId}`, contentType);
  }

  /**
   * An upload not yet tied to a product.
   *
   * Used by the create-product form, where the images are chosen before the
   * record exists. The prefix is shared rather than per-product, which is the
   * one cost of this: an abandoned draft leaves an orphan object, so this
   * prefix is the one worth pointing a lifecycle rule at.
   */
  async createDraftImageUpload(contentType: string): Promise<PresignedUpload> {
    return this.createUpload('products/drafts', contentType);
  }

  private async createUpload(prefix: string, contentType: string): Promise<PresignedUpload> {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        'File uploads are not configured on this server. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and S3_BUCKET_NAME.',
      );
    }

    if (!isAllowedImageType(contentType)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            field: 'contentType',
            message: `Use one of: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}.`,
          },
        ],
      });
    }

    const key = `${prefix}/${randomUUID()}.${extensionFor(contentType)}`;

    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Expires: PRESIGN_TTL_SECONDS,
      Conditions: [
        ['content-length-range', 1, MAX_IMAGE_UPLOAD_BYTES],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
    });

    return {
      url,
      fields,
      publicUrl: this.cdnUrl
        ? `${this.cdnUrl.replace(/\/$/, '')}/${key}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
      key,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    };
  }
}

function isAllowedImageType(value: string): value is (typeof ALLOWED_IMAGE_MIME_TYPES)[number] {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

function extensionFor(contentType: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[
    contentType
  ] ?? 'bin';
}
