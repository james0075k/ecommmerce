'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { ADMIN_EVENTS, ORDER_EVENTS } from '@bazaar/shared/constants';
import type { AdminNotification, OrderUpdatedEvent } from '@bazaar/shared';

import { API_BASE_URL, getAccessToken } from '@/lib/api';

/**
 * The websocket origin, derived from the REST base rather than configured
 * twice. `/api/v1` is stripped because the gateway lives on the server root at
 * `/realtime`, not under the versioned HTTP prefix.
 */
function realtimeOrigin(): string {
  try {
    return new URL(API_BASE_URL, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

let socket: Socket | null = null;
/** How many hooks currently want the connection open. */
let subscribers = 0;

function acquire(): Socket {
  socket ??= io(`${realtimeOrigin()}/realtime`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    // The access token lives in memory and rotates every 15 minutes, so it is
    // read at connect time rather than captured once. An expired one is not
    // fatal: the server downgrades the socket to guest access, which is all a
    // guest order needs anyway.
    auth: (callback) => callback({ token: getAccessToken() }),
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });

  subscribers += 1;
  return socket;
}

function release(): void {
  subscribers = Math.max(0, subscribers - 1);

  // Kept open briefly rather than torn down on the last unmount: navigating
  // between two order pages would otherwise close and reopen the connection in
  // the same tick, and the reconnect costs more than the idle socket.
  if (subscribers === 0) {
    const closing = socket;
    socket = null;

    setTimeout(() => {
      if (subscribers === 0) closing?.disconnect();
    }, 2_000);
  }
}

/**
 * Live status for one order.
 *
 * The subscribe is re-sent on every `connect`, not just on mount: a socket that
 * drops and comes back has forgotten its rooms, and a shopper watching a page
 * through a tunnel should not silently stop receiving updates.
 */
export function useOrderRealtime(
  orderId: string | null,
  onUpdate: (event: OrderUpdatedEvent) => void,
): { connected: boolean } {
  const [connected, setConnected] = React.useState(false);

  // An effect event rather than a dependency: a caller passing an inline arrow
  // would otherwise tear the socket down and rebuild it on every render, and a
  // ref written during render is not safe under concurrent rendering. This
  // always calls the latest `onUpdate` without joining the effect's deps.
  const handleUpdate = React.useEffectEvent((event: OrderUpdatedEvent) => {
    onUpdate(event);
  });

  React.useEffect(() => {
    if (!orderId) return;

    const client = acquire();

    const subscribe = () => {
      setConnected(true);
      client.emit(ORDER_EVENTS.SUBSCRIBE, { orderId });
    };

    const onEvent = (event: OrderUpdatedEvent) => {
      if (event.orderId === orderId) handleUpdate(event);
    };

    const onDisconnect = () => setConnected(false);

    if (client.connected) subscribe();

    client.on('connect', subscribe);
    client.on('disconnect', onDisconnect);
    client.on(ORDER_EVENTS.UPDATED, onEvent);

    return () => {
      client.emit(ORDER_EVENTS.UNSUBSCRIBE, { orderId });
      client.off('connect', subscribe);
      client.off('disconnect', onDisconnect);
      client.off(ORDER_EVENTS.UPDATED, onEvent);
      release();
    };
  }, [orderId]);

  return { connected };
}

/**
 * The admin bell's live feed.
 *
 * Subscribing is re-sent on every `connect` for the same reason the order hook
 * does it: a socket that dropped and came back has forgotten its rooms, and an
 * operator whose wifi blinked should not silently stop being notified for the
 * rest of their shift.
 *
 * The server decides whether the subscribe is honoured - it reads the role out
 * of the verified token - so a non-admin calling this hook simply never
 * receives anything rather than being refused.
 */
export function useAdminRealtime(
  enabled: boolean,
  onNotification: (event: AdminNotification) => void,
): { connected: boolean } {
  const [connected, setConnected] = React.useState(false);

  const handle = React.useEffectEvent((event: AdminNotification) => {
    onNotification(event);
  });

  React.useEffect(() => {
    if (!enabled) return;

    const client = acquire();

    const subscribe = () => {
      setConnected(true);
      client.emit(ADMIN_EVENTS.SUBSCRIBE, {});
    };

    const onDisconnect = () => setConnected(false);
    const onEvent = (event: AdminNotification) => handle(event);

    if (client.connected) subscribe();

    client.on('connect', subscribe);
    client.on('disconnect', onDisconnect);
    client.on(ADMIN_EVENTS.NOTIFICATION, onEvent);

    return () => {
      client.emit(ADMIN_EVENTS.UNSUBSCRIBE, {});
      client.off('connect', subscribe);
      client.off('disconnect', onDisconnect);
      client.off(ADMIN_EVENTS.NOTIFICATION, onEvent);
      release();
    };
  }, [enabled]);

  return { connected };
}
