import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminAction } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  analyticsExportSchema,
  analyticsRangeSchema,
  trackPageViewSchema,
  UserRole,
  webVitalSchema,
} from '@bazaar/shared';
import type {
  AnalyticsExportInput,
  AnalyticsOverview,
  AnalyticsRangeInput,
  DashboardSummary,
  GeoRow,
  ProductPerformanceRow,
  TrackPageViewInput,
  TrafficSourceRow,
  WebVitalInput,
} from '@bazaar/shared';

import { ActivityLogService } from '../admin/activity-log.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CSV_BOM } from '../common/csv';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AnalyticsExportService } from './analytics-export.service';
import { AnalyticsService } from './analytics.service';

/**
 * The numbers behind /admin/dashboard and /admin/analytics.
 *
 * Split into narrow endpoints rather than one fat payload for everything: the
 * dashboard genuinely wants one round trip and gets it, but the analytics page
 * re-fetches only the panel whose range changed, and a table paging through 500
 * products has no business also re-computing a map.
 */
@Controller('admin/analytics')
@Roles(UserRole.ADMIN)
export class AdminAnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly exporter: AnalyticsExportService,
    private readonly activity: ActivityLogService,
  ) {}

  /** Everything the dashboard renders, in one request. */
  @Get('dashboard')
  dashboard(): Promise<DashboardSummary> {
    return this.analytics.dashboard();
  }

  @Get('overview')
  overview(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeInput,
  ): Promise<AnalyticsOverview> {
    return this.analytics.overview(query);
  }

  @Get('products')
  products(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeInput,
  ): Promise<ProductPerformanceRow[]> {
    return this.analytics.productPerformance(query, 100);
  }

  @Get('traffic')
  traffic(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeInput,
  ): Promise<TrafficSourceRow[]> {
    return this.analytics.trafficSources(query);
  }

  @Get('geography')
  geography(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeInput,
  ): Promise<GeoRow[]> {
    return this.analytics.geography(query);
  }

  /**
   * A report as a CSV download.
   *
   * Logged as an EXPORT action with the range attached. An export is the one
   * admin operation that moves data *out* of the system, so it is the one most
   * worth being able to reconstruct later - "who pulled the customer geography
   * for last quarter" is a question that gets asked eventually.
   */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Query(new ZodValidationPipe(analyticsExportSchema)) query: AnalyticsExportInput,
    @Res() response: Response,
  ): Promise<void> {
    const { csv, filename } = await this.exporter.render(query);

    await this.activity.record({
      action: AdminAction.EXPORT,
      entityType: 'analytics',
      entityId: query.report,
      summary: `Exported the ${query.report} report`,
      meta: { preset: query.preset, from: query.from ?? null, to: query.to ?? null },
    });

    response.set({
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    });

    response.end(CSV_BOM + csv);
  }
}

/**
 * The storefront's page-view beacon.
 *
 * @OptionalAuth rather than @Public: most views are anonymous, but a signed-in
 * shopper's should be attributed to them, and @Public would skip the strategy
 * entirely so `request.user` would stay empty even for a valid token.
 *
 * Throttled hard because it is the only unauthenticated write in the
 * application - 60 a minute is far more than a real browser sends and far less
 * than a useful flood.
 */
@Controller('analytics')
@OptionalAuth()
export class AnalyticsTrackingController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async track(
    @Body(new ZodValidationPipe(trackPageViewSchema)) dto: TrackPageViewInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
  ): Promise<void> {
    await this.analytics.track(dto, {
      userId: user?.id ?? null,
      userAgent: request.get('user-agent') ?? null,
      // Set by Cloudflare and most CDNs. Absent in development, which is
      // correct - an unknown country is better than a guessed one.
      country: request.get('cf-ipcountry') ?? null,
    });
  }

  /**
   * Core Web Vitals from real page loads (Phase 11).
   *
   * A separate endpoint from `track` because the shape and the cadence are
   * different: one page view produces one tracking hit and up to five vitals,
   * and the vitals arrive late - CLS and INP are only final at page hide, which
   * is why the browser sends them with `sendBeacon` rather than `fetch`.
   *
   * The throttle is looser than `track` for the same reason. Five metrics per
   * load plus a client-side navigation or two lands well inside 120 a minute,
   * and the endpoint writes one small row with no reads behind it.
   */
  @Post('vitals')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async vitals(
    @Body(new ZodValidationPipe(webVitalSchema)) dto: WebVitalInput,
  ): Promise<void> {
    await this.analytics.recordVital(dto);
  }
}
