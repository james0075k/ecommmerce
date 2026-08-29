import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';
import type { HealthReport } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** GET /api/v1/health - liveness + dependency probe. Unauthenticated by design. */
  @Public()
  @Get()
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
