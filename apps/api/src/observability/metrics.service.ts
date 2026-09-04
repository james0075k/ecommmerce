import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

/**
 * Buckets in seconds, chosen for what this API actually does rather than
 * prom-client's defaults. A storefront read should land in the first three; the
 * long tail exists to make a checkout call that took four seconds visible
 * instead of averaged away.
 */
const LATENCY_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Prometheus registry for the Grafana dashboard in Phase 12.8: CPU, memory,
 * request latency and database connections.
 *
 * A note on cardinality, because this is where metrics endpoints go wrong: the
 * `route` label is the *pattern* Nest matched (`/products/:slug`), never the
 * request URL. With the URL, one crawler walking the catalogue creates fifty
 * thousand time series and the scrape starts costing more than the traffic.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  private readonly requests: Counter<'method' | 'route' | 'status'>;
  private readonly duration: Histogram<'method' | 'route' | 'status'>;
  private readonly inFlight: Gauge;
  private readonly dependencyUp: Gauge<'dependency'>;
  private readonly dbConnections: Gauge<'state'>;
  private readonly dbConnectionsMax: Gauge;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.requests = new Counter({
      name: 'bazaar_http_requests_total',
      help: 'HTTP requests handled, by method, matched route and status code.',
      labelNames: ['method', 'route', 'status'] as const,
      registers: [this.registry],
    });

    this.duration = new Histogram({
      name: 'bazaar_http_request_duration_seconds',
      help: 'End-to-end handler latency.',
      labelNames: ['method', 'route', 'status'] as const,
      buckets: LATENCY_BUCKETS,
      registers: [this.registry],
    });

    this.inFlight = new Gauge({
      name: 'bazaar_http_requests_in_flight',
      help: 'Requests currently being handled. A rising floor here means the ' +
        'instance is saturating before latency shows it.',
      registers: [this.registry],
    });

    this.dependencyUp = new Gauge({
      name: 'bazaar_dependency_up',
      help: '1 when the dependency is reachable, 0 otherwise.',
      labelNames: ['dependency'] as const,
      registers: [this.registry],
      collect: async () => {
        this.dependencyUp.set({ dependency: 'postgres' }, (await this.prisma.isHealthy()) ? 1 : 0);
        // 0 here does not mean auth is broken - it means the in-process
        // fallback is serving OTP codes and the token denylist, which is only
        // correct on a single instance. Alert on it.
        this.dependencyUp.set({ dependency: 'redis' }, this.redis.isDistributed() ? 1 : 0);
      },
    });

    this.dbConnectionsMax = new Gauge({
      name: 'bazaar_db_connections_max',
      help: "Postgres `max_connections`. The dashboard's denominator: what " +
        'matters is the ratio, and the ceiling moves when the plan does.',
      registers: [this.registry],
    });

    this.dbConnections = new Gauge({
      name: 'bazaar_db_connections',
      help: 'Server-side connections to this database, by state.',
      labelNames: ['state'] as const,
      registers: [this.registry],
      collect: async () => {
        const stats = await this.prisma.connectionStats();
        if (!stats) return;

        this.dbConnections.set({ state: 'total' }, stats.total);
        this.dbConnections.set({ state: 'active' }, stats.active);
        this.dbConnections.set({ state: 'idle' }, stats.idle);
        this.dbConnectionsMax.set(stats.max);
      },
    });
  }

  onModuleInit(): void {
    // CPU, resident memory, heap, event loop lag, GC pauses, open handles.
    // Everything the blueprint's "server metrics" line asks for, and the event
    // loop lag in particular is what distinguishes a slow database from a
    // blocked process.
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'bazaar_',
      labels: {
        environment: this.config.get<string>('NODE_ENV') ?? 'development',
        version: this.config.get<string>('RELEASE_VERSION') ?? 'dev',
      },
    });
  }

  /** Called by the interceptor once per request, after the response is written. */
  record(method: string, route: string, status: number, seconds: number): void {
    const labels = { method, route, status: String(status) };
    this.requests.inc(labels);
    this.duration.observe(labels, seconds);
  }

  enter(): void {
    this.inFlight.inc();
  }

  leave(): void {
    this.inFlight.dec();
  }

  /** The Prometheus text exposition format, produced at scrape time. */
  async scrape(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
