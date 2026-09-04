import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ORDER_EVENTS, orderRoom, UserRole } from '@bazaar/shared';
import type { OrderUpdatedEvent } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../common/types/authenticated-user';

interface SubscribePayload {
  orderId?: unknown;
}

/**
 * Live order status, one room per order.
 *
 * A room per *order* rather than per user, because a guest order has no user
 * behind it and its uuid is already the only thing guarding it (the same rule
 * `OrdersService.findOne` applies over HTTP). Joining is therefore authorised
 * exactly like reading: a guest order admits anyone holding the id, a customer's
 * order admits that customer and staff, and nobody else.
 *
 * Authorisation is checked on `subscribe` rather than on connect, since the
 * connection itself carries no order id yet - and re-checked per room, so one
 * socket cannot ride a valid subscription into a second order it may not see.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class OrdersGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The token is optional: a guest tracking the order they just placed has
   * none. An invalid one is treated as absent rather than refused, so an
   * expired access token degrades to guest access instead of dropping the
   * socket mid-page.
   */
  handleConnection(client: Socket): void {
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
      // Expired or forged - carry on as an anonymous socket.
    }
  }

  @SubscribeMessage(ORDER_EVENTS.SUBSCRIBE)
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SubscribePayload,
  ): Promise<{ subscribed: boolean; reason?: string }> {
    const orderId = typeof body?.orderId === 'string' ? body.orderId : null;
    if (!orderId) return { subscribed: false, reason: 'No order id.' };

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });

    if (!order) return { subscribed: false, reason: 'No such order.' };

    const userId = client.data.userId as string | undefined;
    const role = client.data.role as string | undefined;
    const isStaff = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

    if (order.userId && order.userId !== userId && !isStaff) {
      return { subscribed: false, reason: 'That order belongs to another account.' };
    }

    await client.join(orderRoom(orderId));
    return { subscribed: true };
  }

  @SubscribeMessage(ORDER_EVENTS.UNSUBSCRIBE)
  async unsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SubscribePayload,
  ): Promise<{ subscribed: false }> {
    if (typeof body?.orderId === 'string') {
      await client.leave(orderRoom(body.orderId));
    }
    return { subscribed: false };
  }

  /**
   * Broadcast a change into an order's room.
   *
   * Deliberately fire-and-forget and never throwing: an order whose status was
   * committed is changed whether or not anyone was listening, and a websocket
   * problem must not fail the admin's request.
   */
  emitOrderUpdate(event: OrderUpdatedEvent): void {
    try {
      this.server?.to(orderRoom(event.orderId)).emit(ORDER_EVENTS.UPDATED, event);
    } catch (error) {
      this.logger.warn(
        `Could not broadcast order ${event.orderNumber}: ${
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
