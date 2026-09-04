import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { coordinatesFor, LOW_STOCK_THRESHOLD } from '@bazaar/shared';
import type {
  AnalyticsGranularity,
  AnalyticsOverview,
  AnalyticsRangeInput,
  AnalyticsSeriesPoint,
  AnalyticsTotals,
  DashboardOrderCounts,
  DashboardSummary,
  GeoRow,
  LowStockRow,
  MetricDelta,
  ProductPerformanceRow,
  RecentOrderRow,
  RevenuePoint,
  TopCustomerRow,
  TopProductRow,
  TrackPageViewInput,
  WebVitalInput,
  TrafficSourceRow,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Which orders count as revenue.
 *
 * CANCELLED and REFUNDED are excluded everywhere, and PENDING with them: an
 * order that has not been confirmed is a basket someone abandoned at the
 * gateway, and counting it makes every chart in the panel optimistic. Refunds
 * are reported as their own line rather than netted off silently, so a bad week
 * looks like a bad week instead of a slightly smaller good one.
 */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Referrer hosts worth naming, so the pie chart is not a list of domains. */
const SOURCE_NAMES: ReadonlyArray<{ match: RegExp; label: string }> = [
  { match: /(^|\.)google\./, label: 'Google' },
  { match: /(^|\.)bing\./, label: 'Bing' },
  { match: /(^|\.)duckduckgo\./, label: 'DuckDuckGo' },
  { match: /(^|\.)(facebook|fb)\./, label: 'Facebook' },
  { match: /(^|\.)instagram\./, label: 'Instagram' },
  { match: /(^|\.)tiktok\./, label: 'TikTok' },
  { match: /(^|\.)(x|twitter)\./, label: 'X' },
  { match: /(^|\.)youtube\./, label: 'YouTube' },
  { match: /(^|\.)linkedin\./, label: 'LinkedIn' },
  { match: /(^|\.)reddit\./, label: 'Reddit' },
  { match: /(^|\.)(mail|gmail|outlook)\./, label: 'Email' },
];

/**
 * Every number the admin panel shows.
 *
 * Two decisions shape this file. The first is that aggregation happens in
 * Postgres, not in Node: `groupBy` and `aggregate` do the counting and the
 * service reshapes small result sets, because pulling a year of orders across
 * the wire to sum them in JavaScript is the classic way an admin dashboard
 * becomes the slowest page in an application.
 *
 * The second is that every series is *dense*. A day with no orders still gets a
 * point at zero, filled in here rather than left to the chart library, because
 * a line that skips its empty days silently redraws the shape of the trend and
 * makes a dead week look like a straight line between two good ones.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ====================================================================== */
  /*  Dashboard                                                             */
  /* ====================================================================== */

  async dashboard(): Promise<DashboardSummary> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = addDays(todayStart, -6);
    const monthStart = addDays(todayStart, -29);

    const [
      today,
      week,
      month,
      allTime,
      statusCounts,
      customers,
      series,
      topProducts,
      topCustomers,
      recentOrders,
      lowStock,
    ] = await Promise.all([
      this.revenueBetween(todayStart, now),
      this.revenueBetween(weekStart, now),
      this.revenueBetween(monthStart, now),
      this.revenueBetween(null, now),
      this.orderStatusCounts(),
      this.customerCounts(monthStart, now),
      this.revenueSeries(monthStart, now, 'day'),
      this.topProducts(monthStart, now, 5),
      this.topCustomers(5),
      this.recentOrders(10),
      this.lowStock(10),
    ]);

    // Each comparison window is the same length as the one it precedes, ending
    // where that one begins - "last 7 days vs the 7 before them", not "this
    // calendar week vs last", which on a Tuesday compares two days with seven.
    const [prevToday, prevWeek, prevMonth] = await Promise.all([
      this.revenueBetween(addDays(todayStart, -1), todayStart),
      this.revenueBetween(addDays(weekStart, -7), weekStart),
      this.revenueBetween(addDays(monthStart, -30), monthStart),
    ]);

    const averageNow = month.orders > 0 ? month.revenue / month.orders : 0;
    const averageBefore = prevMonth.orders > 0 ? prevMonth.revenue / prevMonth.orders : 0;

    return {
      revenue: {
        today: delta(today.revenue, prevToday.revenue),
        week: delta(week.revenue, prevWeek.revenue),
        month: delta(month.revenue, prevMonth.revenue),
        total: allTime.revenue,
        currency: 'NPR',
      },
      orders: statusCounts,
      customers,
      averageOrderValue: delta(averageNow, averageBefore),
      series,
      topProducts,
      topCustomers,
      recentOrders,
      lowStock,
      generatedAt: now.toISOString(),
    };
  }

  /* ====================================================================== */
  /*  Analytics page                                                        */
  /* ====================================================================== */

  async overview(range: AnalyticsRangeInput): Promise<AnalyticsOverview> {
    const { from, to, granularity } = resolveRange(range);
    const span = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - span);

    const [totals, previous, series] = await Promise.all([
      this.totalsBetween(from, to),
      this.totalsBetween(previousFrom, from),
      this.analyticsSeries(from, to, granularity),
    ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString(), granularity },
      totals,
      previous,
      series,
      currency: 'NPR',
    };
  }

  /**
   * Per-product sales against per-product page views.
   *
   * Views come from `page_views` matched on the product's slug in the path,
   * which is why the conversion figure is honest but approximate: a shopper who
   * reaches a product through search and never loads its page buys without
   * being counted as a visitor to it. Stated here rather than hidden, because
   * the number is useful for ranking products against each other and misleading
   * if read as an absolute rate.
   */
  async productPerformance(range: AnalyticsRangeInput, limit = 50): Promise<ProductPerformanceRow[]> {
    const { from, to } = resolveRange(range);

    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { not: null },
        order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: from, lte: to } },
      },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: limit,
    });

    const productIds = grouped
      .map((row) => row.productId)
      .filter((id): id is string => id !== null);

    if (productIds.length === 0) return [];

    const [products, refunded, views] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          sku: true,
          slug: true,
          category: { select: { name: true } },
        },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
          order: {
            status: { in: [OrderStatus.REFUNDED, OrderStatus.CANCELLED] },
            createdAt: { gte: from, lte: to },
          },
        },
        _sum: { quantity: true },
      }),
      this.productViews(from, to),
    ]);

    const byId = new Map(products.map((product) => [product.id, product]));
    const refundsById = new Map(
      refunded.map((row) => [row.productId, row._sum.quantity ?? 0] as const),
    );

    return grouped.flatMap((row) => {
      const product = row.productId ? byId.get(row.productId) : undefined;
      if (!product) return [];

      const unitsSold = row._sum.quantity ?? 0;
      const productViews = views.get(product.slug) ?? 0;

      return [
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          categoryName: product.category.name,
          unitsSold,
          revenue: row._sum.totalPrice?.toNumber() ?? 0,
          views: productViews,
          conversionRate: productViews > 0 ? (unitsSold / productViews) * 100 : 0,
          refundedUnits: refundsById.get(product.id) ?? 0,
        },
      ];
    });
  }

  /**
   * Where visits came from.
   *
   * Attributed per *session*, not per page view. Only the landing hit of a
   * session carries an external referrer - every page after it is internal
   * navigation with none - so counting views individually files five sixths of
   * a Google session under "Direct" and makes Direct the biggest slice of every
   * pie no matter what the marketing did. Each session is resolved to its one
   * landing referrer, and that session's whole visit count is credited to it.
   *
   * An empty referrer really is "Direct": a typed URL, a bookmark, or a client
   * that strips the header. Our own host counts as direct too, since internal
   * navigation is not traffic acquisition.
   */
  async trafficSources(range: AnalyticsRangeInput): Promise<TrafficSourceRow[]> {
    const { from, to } = resolveRange(range);

    const rows = await this.prisma.pageView.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { referrer: true, sessionId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50_000,
    });

    // First pass: the earliest external referrer each session presented.
    const sessionSource = new Map<string, string>();

    for (const row of rows) {
      if (!row.referrer) continue;
      const source = labelReferrer(row.referrer);
      if (source === 'Direct') continue;
      if (!sessionSource.has(row.sessionId)) sessionSource.set(row.sessionId, source);
    }

    const buckets = new Map<string, { visits: number; sessions: Set<string> }>();

    for (const row of rows) {
      const source = sessionSource.get(row.sessionId) ?? 'Direct';
      const bucket = buckets.get(source) ?? { visits: 0, sessions: new Set<string>() };
      bucket.visits += 1;
      bucket.sessions.add(row.sessionId);
      buckets.set(source, bucket);
    }

    const total = rows.length || 1;

    return [...buckets.entries()]
      .map(([source, bucket]) => ({
        source,
        visits: bucket.visits,
        sessions: bucket.sessions.size,
        share: (bucket.visits / total) * 100,
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 12);
  }

  /**
   * Orders by district, for the map.
   *
   * Read from each order's shipping-address snapshot rather than from the
   * customer's address book: the snapshot is where the parcel actually went,
   * and an address edited afterwards must not silently move last month's orders
   * to a different district.
   */
  async geography(range: AnalyticsRangeInput): Promise<GeoRow[]> {
    const { from, to } = resolveRange(range);

    const orders = await this.prisma.order.findMany({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: from, lte: to } },
      select: { shippingAddress: true, total: true, userId: true, guestEmail: true },
      take: 20_000,
    });

    const buckets = new Map<
      string,
      { district: string; province: string; orders: number; revenue: number; people: Set<string> }
    >();

    for (const order of orders) {
      const address = readAddress(order.shippingAddress);
      const district = address.district ?? 'Unknown';
      const province = address.province ?? '';
      const key = `${district}|${province}`;

      const bucket = buckets.get(key) ?? {
        district,
        province,
        orders: 0,
        revenue: 0,
        people: new Set<string>(),
      };

      bucket.orders += 1;
      bucket.revenue += order.total.toNumber();
      const identity = order.userId ?? order.guestEmail;
      if (identity) bucket.people.add(identity);

      buckets.set(key, bucket);
    }

    return [...buckets.values()]
      .map((bucket) => {
        const [latitude, longitude] = coordinatesFor(bucket.district, bucket.province || null);
        return {
          district: bucket.district,
          province: bucket.province,
          latitude,
          longitude,
          orders: bucket.orders,
          revenue: bucket.revenue,
          customers: bucket.people.size,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  /* ====================================================================== */
  /*  Page-view ingestion                                                   */
  /* ====================================================================== */

  /**
   * Records one page view.
   *
   * Never throws. Analytics is the least important thing happening on any
   * request, and a failed insert here must not turn into an error the shopper
   * sees - the beacon is fired from a page that has already rendered.
   */
  async track(
    dto: TrackPageViewInput,
    context: { userId?: string | null; userAgent?: string | null; country?: string | null },
  ): Promise<void> {
    try {
      await this.prisma.pageView.create({
        data: {
          sessionId: dto.sessionId,
          userId: context.userId ?? null,
          pagePath: dto.pagePath.slice(0, 500),
          referrer: dto.referrer?.slice(0, 500) ?? null,
          userAgent: context.userAgent?.slice(0, 500) ?? null,
          country: context.country ?? null,
          durationMs: dto.durationMs ?? null,
        },
      });
    } catch (error) {
      this.logger.debug(
        `Could not record page view: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Stores one Core Web Vital sample.
   *
   * Swallows its errors like `track` above does, and for the same reason: this
   * is measurement, and measurement failing must never turn into an error the
   * visitor sees on a page that was otherwise fine.
   */
  async recordVital(dto: WebVitalInput): Promise<void> {
    try {
      await this.prisma.webVital.create({
        data: {
          sessionId: dto.sessionId,
          name: dto.name,
          // CLS arrives as a long float; three decimals is well past the
          // precision the 0.1 / 0.25 thresholds need.
          value: Math.round(dto.value * 1000) / 1000,
          rating: dto.rating,
          pagePath: dto.pagePath.slice(0, 500),
          connection: dto.connection ?? null,
        },
      });
    } catch (error) {
      this.logger.debug(
        `Could not record web vital: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /* ====================================================================== */
  /*  Building blocks                                                       */
  /* ====================================================================== */

  private async revenueBetween(
    from: Date | null,
    to: Date,
  ): Promise<{ revenue: number; orders: number }> {
    const result = await this.prisma.order.aggregate({
      where: {
        status: { in: REVENUE_STATUSES },
        createdAt: { ...(from && { gte: from }), lte: to },
      },
      _sum: { total: true },
      _count: { _all: true },
    });

    return {
      revenue: result._sum.total?.toNumber() ?? 0,
      orders: result._count._all,
    };
  }

  private async orderStatusCounts(): Promise<DashboardOrderCounts> {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const counts = {
      PENDING: 0,
      CONFIRMED: 0,
      PROCESSING: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
      REFUNDED: 0,
      total: 0,
    } as DashboardOrderCounts;

    for (const row of grouped) {
      counts[row.status] = row._count._all;
      counts.total += row._count._all;
    }

    return counts;
  }

  private async customerCounts(
    from: Date,
    to: Date,
  ): Promise<{ total: number; newThisMonth: MetricDelta }> {
    const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

    const [total, current, previous] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.prisma.user.count({
        where: { role: 'CUSTOMER', createdAt: { gte: from, lte: to } },
      }),
      this.prisma.user.count({
        where: { role: 'CUSTOMER', createdAt: { gte: previousFrom, lt: from } },
      }),
    ]);

    return { total, newThisMonth: delta(current, previous) };
  }

  /**
   * Revenue, order count and refunds per bucket, with empty buckets filled in.
   *
   * Grouped in Postgres by the truncated date. `$queryRaw` rather than Prisma's
   * `groupBy` because grouping by a *derived* value - the day a timestamp falls
   * in - is not something the query builder can express, and the alternative is
   * to fetch every order in the window and bucket them in Node.
   */
  private async revenueSeries(
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<RevenuePoint[]> {
    // `status::text IN (...)` rather than a bare comparison: the column is a
    // native Postgres enum, and casting it to text is what lets the values
    // travel as ordinary bound parameters instead of needing a literal cast on
    // each one. Prisma.join builds the placeholder list, so the statuses are
    // still parameters and never interpolated text.
    const [orderRows, refundRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ bucket: Date; revenue: unknown; orders: bigint }>>(Prisma.sql`
        SELECT date_trunc(${granularity}, created_at) AS bucket,
               COALESCE(SUM(total), 0)               AS revenue,
               COUNT(*)                              AS orders
        FROM orders
        WHERE created_at >= ${from}
          AND created_at <= ${to}
          AND status::text IN (${Prisma.join(REVENUE_STATUSES)})
        GROUP BY 1
        ORDER BY 1
      `),
      this.prisma.$queryRaw<Array<{ bucket: Date; refunds: unknown }>>(Prisma.sql`
        SELECT date_trunc(${granularity}, created_at) AS bucket,
               COALESCE(SUM(amount), 0)              AS refunds
        FROM refunds
        WHERE created_at >= ${from}
          AND created_at <= ${to}
          AND status::text = 'COMPLETED'
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    const revenueByBucket = new Map(
      orderRows.map((row) => [
        isoDay(row.bucket),
        { revenue: toNumber(row.revenue), orders: Number(row.orders) },
      ]),
    );
    const refundByBucket = new Map(
      refundRows.map((row) => [isoDay(row.bucket), toNumber(row.refunds)]),
    );

    return bucketDates(from, to, granularity).map((date) => {
      const key = isoDay(date);
      const found = revenueByBucket.get(key);

      return {
        date: key,
        revenue: found?.revenue ?? 0,
        orders: found?.orders ?? 0,
        refunds: refundByBucket.get(key) ?? 0,
      };
    });
  }

  /** The dashboard series plus visitors and the conversion rate they imply. */
  private async analyticsSeries(
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<AnalyticsSeriesPoint[]> {
    const [revenue, visitors] = await Promise.all([
      this.revenueSeries(from, to, granularity),
      this.prisma.$queryRaw<Array<{ bucket: Date; sessions: bigint }>>(Prisma.sql`
        SELECT date_trunc(${granularity}, created_at) AS bucket,
               COUNT(DISTINCT session_id)            AS sessions
        FROM page_views
        WHERE created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    const visitorsByBucket = new Map(
      visitors.map((row) => [isoDay(row.bucket), Number(row.sessions)]),
    );

    return revenue.map((point) => {
      const sessions = visitorsByBucket.get(point.date) ?? 0;

      return {
        date: point.date,
        revenue: point.revenue,
        orders: point.orders,
        visitors: sessions,
        conversionRate: sessions > 0 ? (point.orders / sessions) * 100 : 0,
        averageOrderValue: point.orders > 0 ? point.revenue / point.orders : 0,
      };
    });
  }

  private async totalsBetween(from: Date, to: Date): Promise<AnalyticsTotals> {
    const [orders, units, sessions, refunds, newCustomers] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: from, lte: to } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.orderItem.aggregate({
        where: {
          order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: from, lte: to } },
        },
        _sum: { quantity: true },
      }),
      this.prisma.pageView
        .findMany({
          where: { createdAt: { gte: from, lte: to } },
          distinct: ['sessionId'],
          select: { sessionId: true },
          take: 100_000,
        })
        .then((rows) => rows.length),
      this.prisma.refund.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.user.count({
        where: { role: 'CUSTOMER', createdAt: { gte: from, lte: to } },
      }),
    ]);

    const revenue = orders._sum.total?.toNumber() ?? 0;
    const orderCount = orders._count._all;

    return {
      revenue,
      orders: orderCount,
      visitors: sessions,
      conversionRate: sessions > 0 ? (orderCount / sessions) * 100 : 0,
      averageOrderValue: orderCount > 0 ? revenue / orderCount : 0,
      refunds: refunds._sum.amount?.toNumber() ?? 0,
      newCustomers,
      unitsSold: units._sum.quantity ?? 0,
    };
  }

  async topProducts(from: Date, to: Date, limit: number): Promise<TopProductRow[]> {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { not: null },
        order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: from, lte: to } },
      },
      _sum: { quantity: true, totalPrice: true },
      _count: { _all: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: limit,
    });

    const ids = grouped.map((row) => row.productId).filter((id): id is string => id !== null);
    if (ids.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { url: true },
        },
      },
    });

    const byId = new Map(products.map((product) => [product.id, product]));

    return grouped.flatMap((row) => {
      const product = row.productId ? byId.get(row.productId) : undefined;
      if (!product) return [];

      return [
        {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          imageUrl: product.images[0]?.url ?? null,
          unitsSold: row._sum.quantity ?? 0,
          revenue: row._sum.totalPrice?.toNumber() ?? 0,
          orderCount: row._count._all,
        },
      ];
    });
  }

  async topCustomers(limit: number): Promise<TopCustomerRow[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, status: { in: REVENUE_STATUSES } },
      _sum: { total: true },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });

    const ids = grouped.map((row) => row.userId).filter((id): id is string => id !== null);
    if (ids.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true, avatarUrl: true },
    });

    const byId = new Map(users.map((user) => [user.id, user]));

    return grouped.flatMap((row) => {
      const user = row.userId ? byId.get(row.userId) : undefined;
      if (!user) return [];

      return [
        {
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          orderCount: row._count._all,
          lifetimeValue: row._sum.total?.toNumber() ?? 0,
          lastOrderAt: row._max.createdAt?.toISOString() ?? null,
        },
      ];
    });
  }

  async recentOrders(limit: number): Promise<RecentOrderRow[]> {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        currency: true,
        guestEmail: true,
        createdAt: true,
        placedAt: true,
        shippingAddress: true,
        user: { select: { fullName: true, email: true } },
        _count: { select: { items: true } },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      // A guest order has no user, so the snapshot's name is the only one there
      // is - and it is the name on the parcel, which is what an operator wants.
      customerName:
        order.user?.fullName ?? readAddress(order.shippingAddress).fullName ?? 'Guest',
      customerEmail: order.user?.email ?? order.guestEmail,
      status: order.status,
      total: order.total.toNumber(),
      currency: order.currency,
      itemCount: order._count.items,
      placedAt: (order.placedAt ?? order.createdAt).toISOString(),
    }));
  }

  /**
   * Variants running out.
   *
   * Sellable stock is `product_variants.stock_quantity` - that is the column
   * the cart checks and the one a refund increments, so it is the only figure
   * an alert may be built on. The `inventory` table exists for multi-warehouse
   * counts and per-variant reorder levels, and is read here *only* to refine a
   * threshold when a row happens to exist; a store that has never used it still
   * gets alerts against the store-wide default rather than silence.
   */
  async lowStock(limit: number): Promise<LowStockRow[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        stockQuantity: { lte: LOW_STOCK_THRESHOLD },
        product: { deletedAt: null, isActive: true },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        product: { select: { id: true, name: true, slug: true } },
        inventory: {
          select: { reservedQuantity: true, reorderLevel: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { stockQuantity: 'asc' },
      take: limit,
    });

    return variants.map((variant) => {
      const inventory = variant.inventory[0];

      return {
        variantId: variant.id,
        productId: variant.product.id,
        productName: variant.product.name,
        productSlug: variant.product.slug,
        variantName: variant.name,
        sku: variant.sku,
        quantity: variant.stockQuantity,
        reserved: inventory?.reservedQuantity ?? 0,
        reorderLevel:
          inventory && inventory.reorderLevel > 0 ? inventory.reorderLevel : LOW_STOCK_THRESHOLD,
      };
    });
  }

  /**
   * Views per product slug, read out of `/products/<slug>` paths.
   *
   * Counted here rather than with a join because `page_views` stores a path,
   * not a product id - deliberately, since the table also records category and
   * campaign pages that have no product behind them at all.
   */
  private async productViews(from: Date, to: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.pageView.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        pagePath: { startsWith: '/products/' },
      },
      select: { pagePath: true },
      take: 100_000,
    });

    const views = new Map<string, number>();

    for (const row of rows) {
      const slug = row.pagePath.split('/')[2]?.split('?')[0];
      if (!slug) continue;
      views.set(slug, (views.get(slug) ?? 0) + 1);
    }

    return views;
  }
}

/* ========================================================================== */
/*  Helpers                                                                   */
/* ========================================================================== */

/** Turns a preset into concrete bounds, and picks a sane bucket size for it. */
export function resolveRange(range: AnalyticsRangeInput): {
  from: Date;
  to: Date;
  granularity: AnalyticsGranularity;
} {
  const to = range.to ?? new Date();
  const todayStart = startOfDay(to);

  let from: Date;

  switch (range.preset) {
    case 'today':
      from = todayStart;
      break;
    case '7d':
      from = addDays(todayStart, -6);
      break;
    case '90d':
      from = addDays(todayStart, -89);
      break;
    case '12m':
      from = addDays(todayStart, -364);
      break;
    case 'custom':
      from = range.from ?? addDays(todayStart, -29);
      break;
    case '30d':
    default:
      from = addDays(todayStart, -29);
      break;
  }

  // A year of daily points is 365 ticks on an axis 800 pixels wide, so a long
  // range coarsens itself unless the caller insisted otherwise.
  let granularity = range.granularity;
  const spanDays = Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

  if (granularity === 'day' && spanDays > 120) granularity = 'week';
  if (granularity === 'week' && spanDays > 400) granularity = 'month';

  return { from, to, granularity };
}

export function delta(current: number, previous: number): MetricDelta {
  return {
    current,
    previous,
    changePct: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

/**
 * Postgres `numeric` arrives as a Decimal, `bigint` as a BigInt, and an empty
 * aggregate as null. One coercion for all three keeps the call sites readable.
 */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  return Number(value) || 0;
}

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Local-time YYYY-MM-DD, matching how `date_trunc` bucketed the rows. */
function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Every bucket start in the range, so the series has no gaps. */
function bucketDates(from: Date, to: Date, granularity: AnalyticsGranularity): Date[] {
  const dates: Date[] = [];
  const cursor = truncate(from, granularity);
  const end = to.getTime();

  // Bounded so a bad range cannot spin: 3660 daily buckets is ten years.
  for (let guard = 0; cursor.getTime() <= end && guard < 3660; guard += 1) {
    dates.push(new Date(cursor));

    if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  return dates;
}

/** Matches Postgres `date_trunc`, whose week starts on Monday. */
function truncate(date: Date, granularity: AnalyticsGranularity): Date {
  const result = startOfDay(date);

  if (granularity === 'week') {
    const weekday = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - weekday);
  } else if (granularity === 'month') {
    result.setDate(1);
  }

  return result;
}

function labelReferrer(referrer: string | null): string {
  if (!referrer) return 'Direct';

  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'Direct';
  }

  if (host === 'localhost' || host.includes('bazaar')) return 'Direct';

  const named = SOURCE_NAMES.find((entry) => entry.match.test(host));
  return named ? named.label : host.replace(/^www\./, '');
}

interface AddressSnapshot {
  fullName: string | null;
  district: string | null;
  province: string | null;
}

/** The address column is a JSONB snapshot, so nothing about it is guaranteed. */
function readAddress(value: Prisma.JsonValue): AddressSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { fullName: null, district: null, province: null };
  }

  const record = value as Record<string, unknown>;
  const read = (key: string): string | null =>
    typeof record[key] === 'string' && record[key] ? (record[key] as string) : null;

  return {
    fullName: read('fullName'),
    district: read('district'),
    province: read('province'),
  };
}
