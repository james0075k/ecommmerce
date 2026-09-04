import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import type { Request } from 'express';
import { tap, type Observable } from 'rxjs';

import { RequestContextService } from '../common/request-context';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ActivityLogService } from './activity-log.service';

/** HTTP verb to the enum the schema stores. GET is not audited at all. */
const ACTION_BY_METHOD: Readonly<Record<string, AdminAction>> = {
  POST: AdminAction.CREATE,
  PUT: AdminAction.UPDATE,
  PATCH: AdminAction.UPDATE,
  DELETE: AdminAction.DELETE,
};

/**
 * Route segments that name a thing rather than an entity, so `entityType` comes
 * out as "order" rather than "bulk-status".
 */
const ENTITY_BY_SEGMENT: Readonly<Record<string, string>> = {
  products: 'product',
  orders: 'order',
  customers: 'customer',
  coupons: 'coupon',
  contacts: 'contact_message',
  settings: 'store_setting',
  categories: 'category',
  variants: 'product_variant',
  images: 'product_image',
  reviews: 'review',
  notifications: 'admin_notification',
};

/**
 * Blanket audit for the admin surface.
 *
 * Bound globally rather than per-controller, and filtered on the path prefix:
 * a new admin route is audited the moment it exists, which is the opposite of
 * the usual decorator approach where the one route somebody forgets is the one
 * that matters. Services still call `ActivityLogService.record()` directly
 * where a real before/after diff is worth capturing - this is the floor, not
 * the ceiling.
 *
 * Only successful mutations are logged. A request that threw changed nothing,
 * and a log full of rejected attempts buries the changes that did happen; the
 * exception filter already reports failures.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly activity: ActivityLogService,
    private readonly context: RequestContextService,
  ) {}

  intercept(host: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (host.getType() !== 'http') return next.handle();

    const request = host.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const path = request.route?.path ?? request.originalUrl ?? request.url;

    const action = ACTION_BY_METHOD[request.method];
    if (!action || !isAdminPath(path)) return next.handle();

    // Everything the log needs is captured here, synchronously, while the
    // request context is still open. The `tap` below fires when the response
    // observable emits - a microtask continuation outside the
    // AsyncLocalStorage scope - so anything read there would come back empty.
    const params = { ...(request.params as Record<string, string>) };
    const body = request.body as Record<string, unknown> | undefined;
    const context = this.context.get();
    const ipAddress = context?.ipAddress ?? null;
    const userAgent = context?.userAgent ?? null;

    return next.handle().pipe(
      tap((result: unknown) => {
        // A service that logged a real before/after diff for this request has
        // already said everything this row would, and better.
        if (context?.logged) return;

        void this.activity.record({
          action,
          entityType: entityTypeFor(path),
          entityId: entityIdFor(params, result),
          summary: `${request.method} ${path}`,
          ipAddress,
          userAgent,
          markHandled: false,
          meta: {
            request: isPlainObject(body) ? body : undefined,
            params: Object.keys(params).length > 0 ? params : undefined,
          },
          // The response body is the "after" state for a create or an update;
          // there is no cheap "before" at this level, which is exactly why
          // services that can produce one log their own richer entry instead.
          after: isPlainObject(result) ? (result as Record<string, unknown>) : null,
        });
      }),
    );
  }
}

/** True for `/admin/...` and the versioned `/api/v1/admin/...` form. */
function isAdminPath(path: string): boolean {
  return /(^|\/)admin(\/|$)/.test(path);
}

/**
 * The noun a route acts on.
 *
 * Read left to right from the segment after `admin`, falling back to the first
 * recognised segment - `/admin/products/:id/variants/:variantId` is a variant
 * change, not a product one, so the *last* recognised entity segment wins.
 */
function entityTypeFor(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const start = segments.indexOf('admin');
  const scope = start >= 0 ? segments.slice(start + 1) : segments;

  let entity = 'admin';
  for (const segment of scope) {
    const mapped = ENTITY_BY_SEGMENT[segment];
    if (mapped) entity = mapped;
  }

  return entity;
}

/**
 * The record touched: the most specific route param, or the id the handler
 * returned when the route had none (the create case).
 */
function entityIdFor(params: Record<string, string>, result: unknown): string | null {
  const preferred = ['variantId', 'imageId', 'id', 'key', 'code'];

  for (const key of preferred) {
    const value = params[key];
    if (typeof value === 'string' && value.length > 0) return value.slice(0, 64);
  }

  if (isPlainObject(result) && typeof result.id === 'string') return result.id.slice(0, 64);

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
