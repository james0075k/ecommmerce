import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** What `pg_stat_activity` says about this database, for the metrics endpoint. */
export interface ConnectionStats {
  total: number;
  active: number;
  idle: number;
  max: number;
}

/**
 * Owns the Prisma connection lifecycle for the whole application.
 * Query methods belong in feature services - this class stays connection-only.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * This instance is also handed out under the PRISMA_READ token when no read
   * replica is configured, so Nest resolves it as two providers and calls the
   * lifecycle hooks twice. Connecting twice is harmless; saying so in the log
   * twice is just confusing.
   */
  private started = false;

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
          : [{ emit: 'stdout', level: 'error' }],
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.started) return;
    this.started = true;

    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL');
    } catch (error) {
      // D3 availability: a database outage degrades the API, it does not stop it
      // booting. /health reports `database: down` and load balancers can still
      // route to cached read paths. Queries will surface their own errors.
      this.logger.error(
        `Could not connect to PostgreSQL - starting in degraded mode. ${
          error instanceof Error ? error.message.split('\n')[0] : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }

  /** Used by the health endpoint to prove the database is actually reachable. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pool saturation, for the Grafana dashboard (Phase 12.8).
   *
   * Raw SQL, and deliberately so: `pg_stat_activity` is server state, not
   * application data, and Prisma models none of it. The "Prisma for all
   * database access" rule is about the domain - this class is the one place
   * that is allowed to ask Postgres about itself.
   *
   * Connections climbing toward `max` is the failure that looks like a slow
   * site and reads like a mystery, so it is worth a scrape.
   */
  async connectionStats(): Promise<ConnectionStats | null> {
    try {
      const [row] = await this.$queryRaw<ConnectionStats[]>`
        SELECT
          (SELECT count(*)::int FROM pg_stat_activity
             WHERE datname = current_database())                        AS total,
          (SELECT count(*)::int FROM pg_stat_activity
             WHERE datname = current_database() AND state = 'active')   AS active,
          (SELECT count(*)::int FROM pg_stat_activity
             WHERE datname = current_database() AND state = 'idle')     AS idle,
          current_setting('max_connections')::int                       AS max
      `;

      return row ?? null;
    } catch {
      // A pooler in transaction mode can refuse this, and a metrics scrape is
      // never worth an error page.
      return null;
    }
  }
}
