import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Injection token for the read-only client.
 *
 * `@Inject(PRISMA_READ) private readonly read: PrismaRead`
 *
 * It resolves to a client pointed at `DATABASE_REPLICA_URL` when one is set,
 * and to the primary PrismaService when it is not - so a service written
 * against this token behaves correctly on a single-database deployment and
 * gets the replica for free the day one appears (Phase 12.3).
 */
export const PRISMA_READ = Symbol('PRISMA_READ');

/** The token's type. Structurally a PrismaClient, whichever instance it is. */
export type PrismaRead = PrismaClient;

/**
 * A second pool against the replica.
 *
 * Only ever used for queries whose answer may be a few hundred milliseconds
 * stale: the analytics dashboard's aggregate scans over orders and page views.
 * Replication lag makes it the wrong client for anything a shopper reads back
 * immediately after writing it - "your order is not in your order list" is a
 * support ticket, and a slower dashboard is not.
 */
export class PrismaReadClient extends PrismaClient {
  private readonly logger = new Logger('PrismaReadClient');

  constructor(url: string) {
    super({
      datasourceUrl: url,
      log: [{ emit: 'stdout', level: 'error' }],
    });
  }

  async connect(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to the PostgreSQL read replica');
    } catch (error) {
      // Same trade as the primary: degrade, do not refuse to boot. Analytics
      // queries will fail individually and the storefront never notices.
      this.logger.error(
        `Could not connect to the read replica - analytics will error until it returns. ${
          error instanceof Error ? error.message.split('\n')[0] : String(error)
        }`,
      );
    }
  }
}
