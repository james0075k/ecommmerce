import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';

import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

/**
 * `GET /api/v1/metrics` in the Prometheus text exposition format.
 *
 * Not behind the JWT guard, because Prometheus does not carry a user session -
 * it presents a static bearer token instead. `METRICS_TOKEN` unset leaves the
 * endpoint open, which is right for a laptop and wrong for the internet; the
 * launch checklist requires it in production, and the deploy fails the check
 * without it.
 *
 * Left open, this endpoint tells an attacker your route table, your traffic
 * shape and how close your database is to running out of connections.
 */
@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  // prom-client's `registry.contentType`, spelled out because a decorator
  // argument has to be a constant. Prometheus rejects a body served as
  // text/html, and Nest would infer exactly that from a returned string.
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async scrape(@Headers('authorization') authorization?: string): Promise<string> {
    const expected = this.config.get<string>('METRICS_TOKEN');

    if (expected) {
      const presented = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';

      if (!constantTimeEquals(presented, expected)) {
        throw new ForbiddenException('Invalid metrics token.');
      }
    } else if (this.config.get<string>('NODE_ENV') === 'production') {
      // Refusing is the safe failure. Serving it would be a silent one.
      throw new ServiceUnavailableException(
        'METRICS_TOKEN must be set before /metrics is served in production.',
      );
    }

    return this.metrics.scrape();
  }
}

/**
 * Comparing tokens with `===` leaks their length and shared prefix through
 * timing. The length check below is not a leak of anything useful - the token
 * length is chosen by whoever deployed it and is not secret.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
