import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PRISMA_READ, PrismaReadClient, type PrismaRead } from './prisma-read';
import { PrismaService } from './prisma.service';

/**
 * Global so feature modules can inject PrismaService without re-importing.
 * Blueprint rule: Prisma is the only database access path - no raw SQL.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PRISMA_READ,
      inject: [ConfigService, PrismaService],
      useFactory: async (
        config: ConfigService,
        primary: PrismaService,
      ): Promise<PrismaRead> => {
        const url = config.get<string>('DATABASE_REPLICA_URL');

        // No replica configured: hand back the primary rather than opening a
        // second pool to the same server. Two pools against one database halve
        // the connections available to everything else for no benefit.
        if (!url) return primary;

        const replica = new PrismaReadClient(url);
        await replica.connect();
        return replica;
      },
    },
  ],
  exports: [PrismaService, PRISMA_READ],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA_READ) private readonly read: PrismaRead,
    private readonly primary: PrismaService,
  ) {}

  /**
   * Nest runs lifecycle hooks on providers that declare them, and the factory
   * above returns a bare client that does not. The identity check is what keeps
   * this from disconnecting the primary twice on the single-database path.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.read !== this.primary) await this.read.$disconnect();
  }
}
