import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

import { RequestContextService } from '../request-context';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Opens the AsyncLocalStorage scope for the lifetime of one request.
 *
 * Registered globally and ordered *before* the audit interceptor, so anything
 * that runs deeper - a service writing an activity log entry, say - can read
 * the caller's IP without being handed it.
 *
 * Non-HTTP contexts (websocket frames, queue jobs) pass straight through: they
 * have no request to describe, and forcing a synthetic one would put misleading
 * values in the audit trail.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly context: RequestContextService) {}

  intercept(host: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (host.getType() !== 'http') return next.handle();

    const request = host.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    return this.context.run(
      {
        userId: request.user?.id ?? null,
        role: request.user?.role ?? null,
        ipAddress: clientIp(request),
        userAgent: truncate(request.get('user-agent'), 500),
        method: request.method,
        path: request.originalUrl ?? request.url,
        logged: false,
      },
      () => next.handle(),
    );
  }
}

/**
 * The caller's address, honouring the proxy chain.
 *
 * `X-Forwarded-For` is a list appended to by each hop, so the client is the
 * *first* entry - taking the last would record the load balancer on every row.
 * Express's own `req.ip` already does this when `trust proxy` is set, which it
 * is not here by default, so the header is read directly and capped at the
 * column width (45 characters, enough for IPv6).
 */
function clientIp(request: Request): string | null {
  const forwarded = request.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  const address = first || request.ip || request.socket.remoteAddress || null;

  if (!address) return null;
  // Normalise the IPv4-mapped IPv6 form Node reports on dual-stack sockets.
  return truncate(address.replace(/^::ffff:/, ''), 45);
}

function truncate(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
