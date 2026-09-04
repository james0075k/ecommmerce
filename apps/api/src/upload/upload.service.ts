import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

  /**
   * Writes an object we generated ourselves - a compressed derivative of an
   * uploaded image (Phase 12.6). Unlike the presigned path, the bytes go
   * through the API, which is correct here: the browser never had them.
   *
   * `immutable` is safe because the key contains a uuid. A changed image is a
   * new key, so a year in the CloudFront and browser cache can never be stale
   * and a repeat visit costs nothing.
   */
  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException('Object storage is not configured.');
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return this.publicUrlFor(key);
  }

  /** Where an object with this key is readable from - the CDN when there is one. */
  publicUrlFor(key: string): string {
    return this.cdnUrl
      ? `${this.cdnUrl.replace(/\/$/, '')}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * The S3 key behind one of our own public URLs, or null when the URL points
   * somewhere else entirely.
   *
   * The null case is the important one: the seed catalogue points at picsum,
   * and an admin can paste any URL into the image field. Deriving a key from a
   * host we do not own and then writing to it would put a derivative of someone
   * else's image in our bucket under a path that means nothing.
   */
  keyFromUrl(url: string): string | null {
    if (!this.bucket) return null;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const key = parsed.pathname.replace(/^\//, '');
    if (!key) return null;

    if (this.cdnUrl) {
      try {
        if (parsed.host === new URL(this.cdnUrl).host) return key;
      } catch {
        // A malformed CDN_URL is a configuration error, not a reason to throw
        // here - fall through to the bucket host check.
      }
    }

    const bucketHosts = [
      `${this.bucket}.s3.${this.region}.amazonaws.com`,
      `${this.bucket}.s3.amazonaws.com`,
    ];

    return bucketHosts.includes(parsed.host) ? key : null;
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
      publicUrl: this.publicUrlFor(key),
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
