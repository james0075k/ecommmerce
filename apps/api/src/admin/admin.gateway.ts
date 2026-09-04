import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ADMIN_EVENTS, ADMIN_ROOM, UserRole } from '@bazaar/shared';
import type { AdminNotification } from '@bazaar/shared';

import type { AccessTokenPayload } from '../common/types/authenticated-user';

/**
 * The admin bell's transport.
 *
 * Shares the `/realtime` namespace with the order gateway - one socket per tab
 * rather than two, since a browser's connection budget is not free and both
 * sides authenticate the same way. The room is joined on an explicit
 * `subscribe`, and membership is decided from the role inside the verified
 * token, never from anything the client sends: asking to join is not the same
 * as being allowed to, and an expired token means no.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class AdminGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AdminGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Both gateways in this namespace get `handleConnection`, so this one only
   * fills in what is missing rather than overwriting: whichever runs second
   * would otherwise clear the role the first just resolved.
   */
  handleConnection(client: Socket): void {
    if (client.data.role) return;

    const token =
      (client.handshake.auth as { token?: string } | undefined)?.token ??
      readBearer(client.handshake.headers.authorization);

    if (!token) return;

    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      if (payload.type === 'access') {
        client.data.userId = payload.sub;
        client.data.role = payload.role;
      }
    } catch {
      // Expired or forged - the socket stays anonymous and cannot join.
    }
  }

  @SubscribeMessage(ADMIN_EVENTS.SUBSCRIBE)
  async subscribe(@ConnectedSocket() client: Socket): Promise<{ subscribed: boolean }> {
    const role = client.data.role as string | undefined;

    if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
      return { subscribed: false };
    }

    await client.join(ADMIN_ROOM);
    return { subscribed: true };
  }

  @SubscribeMessage(ADMIN_EVENTS.UNSUBSCRIBE)
  async unsubscribe(@ConnectedSocket() client: Socket): Promise<{ subscribed: false }> {
    await client.leave(ADMIN_ROOM);
    return { subscribed: false };
  }

  /**
   * Push one notification to every connected operator.
   *
   * Fire-and-forget and never throwing, for the same reason the order broadcast
   * is: the order was placed whether or not anyone had the tab open, and a
   * websocket problem must not fail the checkout that caused it.
   */
  broadcast(notification: AdminNotification): void {
    try {
      this.server?.to(ADMIN_ROOM).emit(ADMIN_EVENTS.NOTIFICATION, notification);
    } catch (error) {
      this.logger.warn(
        `Could not broadcast admin notification ${notification.kind}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function readBearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}
