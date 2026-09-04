import { Module } from '@nestjs/common';

import { AnalyticsExportService } from './analytics-export.service';
import { AdminAnalyticsController, AnalyticsTrackingController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AdminAnalyticsController, AnalyticsTrackingController],
  providers: [AnalyticsService, AnalyticsExportService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
