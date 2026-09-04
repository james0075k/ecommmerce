import { Module } from '@nestjs/common';

import { SearchModule } from '../search/search.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  // Only for `isAvailable()`: the report distinguishes "Meilisearch is serving
  // search" from "we quietly fell back to Postgres", which is invisible
  // everywhere else.
  imports: [SearchModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
