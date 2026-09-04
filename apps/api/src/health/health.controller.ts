import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';
import type { HealthReport } from './health.service';

/**
 * Three endpoints, because three different callers ask three different
 * questions (Phase 12.2/12.8):
 *
 *   /health       UptimeRobot and humans - "what is the state of everything?"
 *   /health/live  the orchestrator       - "should this container be restarted?"
 *   /health/ready the load balancer      - "should this instance get traffic?"
 *
 * Conflating them is the classic outage amplifier: a liveness probe that also
 * checks the database restarts every healthy instance the moment Postgres
 * hiccups, turning a slow database into no API at all.
 *
 * All three skip the throttler. A 60-second monitor plus a platform probe on a
 * shared egress IP will eat a rate-limit bucket and start reporting the site as
 * down because it asked too often whether the site was up.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** GET /api/v1/health - full dependency report. Unauthenticated by design. */
  @Public()
  @Get()
  check(): Promise<HealthReport> {
    return this.health.check();
  }

  /**
   * GET /api/v1/health/live - the process is running and the event loop turns.
   * Never touches a dependency, so it can only fail when a restart is the
   * correct remedy.
   */
  @Public()
  @Get('live')
  live(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  /**
   * GET /api/v1/health/ready - 200 when this instance can serve real traffic,
   * 503 when it cannot. The status code is the whole point: load balancers read
   * that, not the body.
   */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ready' }> {
    if (!(await this.health.isReady())) {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        reason: 'database unreachable',
      });
    }

    return { status: 'ready' };
  }
}
