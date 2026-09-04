import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';

import { MetricsService } from './metrics.service';

/**
 * Times every request and files it under the route *pattern* Nest matched.
 *
 * `tap` fires on both success and error, which is what keeps a 500 from
 * vanishing out of the latency histogram - errors are usually the slow ones,
 * and a p99 that excludes them is a comforting lie.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // WebSocket and scheduled contexts have no HTTP request to time.
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const route = routeOf(request);

    // The scrape itself would otherwise appear as the busiest endpoint on the
    // dashboard measuring it.
    if (route.endsWith('/metrics')) return next.handle();

    const startedAt = process.hrtime.bigint();
    this.metrics.enter();

    const finish = (): void => {
      this.metrics.leave();
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.record(request.method, route, response.statusCode, seconds);
    };

    return next.handle().pipe(tap({ next: finish, error: finish }));
  }
}

/**
 * The matched Express route pattern - `/api/v1/products/:slug`, not
 * `/api/v1/products/nikon-z6`. Falls back to a single `unmatched` bucket for
 * 404s, which are exactly the requests whose paths are attacker-controlled and
 * unbounded.
 */
function routeOf(request: Request): string {
  const path = (request.route as { path?: string } | undefined)?.path;
  if (!path) return 'unmatched';

  // Express strips the global prefix from `route.path` under a router, so put
  // it back: two routes named `/` in different modules must not merge.
  const base = request.baseUrl || '';
  const full = `${base}${path}`.replace(/\/+$/, '');
  return full || '/';
}
