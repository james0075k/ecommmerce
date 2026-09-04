import { Injectable } from '@nestjs/common';
import type { AnalyticsExportInput } from '@bazaar/shared';

import { toCsv } from '../common/csv';
import { AnalyticsService, resolveRange } from './analytics.service';

/**
 * Renders an analytics report as a spreadsheet.
 *
 * Separated from AnalyticsService because it is a presentation concern with a
 * different shape: numbers are rounded to what an accountant would type,
 * percentages become plain decimals rather than "12.3%", and dates are written
 * as ISO days so a spreadsheet parses them as dates rather than as strings in
 * whatever the machine's locale happens to be.
 */
@Injectable()
export class AnalyticsExportService {
  constructor(private readonly analytics: AnalyticsService) {}

  async render(query: AnalyticsExportInput): Promise<{ csv: string; filename: string }> {
    const { from, to } = resolveRange(query);
    const stamp = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;

    switch (query.report) {
      case 'products':
        return {
          csv: await this.products(query),
          filename: `bazaar-product-performance-${stamp}.csv`,
        };
      case 'traffic':
        return { csv: await this.traffic(query), filename: `bazaar-traffic-${stamp}.csv` };
      case 'geography':
        return { csv: await this.geography(query), filename: `bazaar-geography-${stamp}.csv` };
      case 'overview':
      default:
        return { csv: await this.overview(query), filename: `bazaar-analytics-${stamp}.csv` };
    }
  }

  private async overview(query: AnalyticsExportInput): Promise<string> {
    const report = await this.analytics.overview(query);

    return toCsv(
      ['Date', 'Revenue', 'Orders', 'Visitors', 'Conversion %', 'Average order value'],
      report.series.map((point) => [
        point.date,
        money(point.revenue),
        String(point.orders),
        String(point.visitors),
        percent(point.conversionRate),
        money(point.averageOrderValue),
      ]),
    );
  }

  private async products(query: AnalyticsExportInput): Promise<string> {
    const rows = await this.analytics.productPerformance(query, 500);

    return toCsv(
      ['Product', 'SKU', 'Category', 'Units sold', 'Revenue', 'Views', 'Conversion %', 'Refunded units'],
      rows.map((row) => [
        row.name,
        row.sku,
        row.categoryName,
        String(row.unitsSold),
        money(row.revenue),
        String(row.views),
        percent(row.conversionRate),
        String(row.refundedUnits),
      ]),
    );
  }

  private async traffic(query: AnalyticsExportInput): Promise<string> {
    const rows = await this.analytics.trafficSources(query);

    return toCsv(
      ['Source', 'Visits', 'Sessions', 'Share %'],
      rows.map((row) => [row.source, String(row.visits), String(row.sessions), percent(row.share)]),
    );
  }

  private async geography(query: AnalyticsExportInput): Promise<string> {
    const rows = await this.analytics.geography(query);

    return toCsv(
      ['District', 'Province', 'Orders', 'Revenue', 'Customers', 'Latitude', 'Longitude'],
      rows.map((row) => [
        row.district,
        row.province,
        String(row.orders),
        money(row.revenue),
        String(row.customers),
        row.latitude.toFixed(4),
        row.longitude.toFixed(4),
      ]),
    );
  }
}

/** Two decimals, no thousands separator - a separator breaks CSV parsing. */
function money(value: number): string {
  return value.toFixed(2);
}

function percent(value: number): string {
  return value.toFixed(2);
}
