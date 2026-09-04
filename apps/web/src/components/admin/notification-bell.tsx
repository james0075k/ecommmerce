'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  Mail,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  Volume2,
  VolumeX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AdminNotification, AdminNotificationKind } from '@bazaar/shared';
import { EASE_OUT_EXPO } from '@bazaar/ui';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi, adminKeys, formatRelative } from '@/lib/admin';
import { apiFetch } from '@/lib/api';
import { useAdminRealtime } from '@/lib/realtime';
import { cn } from '@/lib/utils';

const ICONS: Record<AdminNotificationKind, LucideIcon> = {
  ORDER_PLACED: ReceiptText,
  ORDER_PAID: PackageCheck,
  ORDER_CANCELLED: XCircle,
  REFUND_ISSUED: RotateCcw,
  LOW_STOCK: AlertTriangle,
  CONTACT_MESSAGE: Mail,
};

const SOUND_KEY = 'bz-admin-bell-sound';

/**
 * The notifications bell.
 *
 * The socket is the trigger, not the source: an event arriving invalidates the
 * query rather than being pushed into the list. Each admin holds their own
 * notification rows with their own read state, so the broadcast - which is one
 * message to everybody - cannot carry the row that belongs to *this* operator.
 * Refetching is one cheap request and it makes the offline case correct for
 * free: an operator who opens the tab an hour later sees everything they
 * missed, in the same list, from the same code path.
 */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [soundOn, setSoundOn] = React.useState(true);

  React.useEffect(() => {
    try {
      setSoundOn(window.localStorage.getItem(SOUND_KEY) !== 'off');
    } catch {
      // Storage unavailable - the default (on) stands for this session.
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: adminKeys.notifications,
    queryFn: adminApi.notifications,
    // A slow poll as a safety net under the socket: a dropped connection that
    // has not reconnected yet should not leave the bell silently stale.
    refetchInterval: 120_000,
    staleTime: 30_000,
  });

  const playChime = useChime();

  const { connected } = useAdminRealtime(true, () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.notifications });
    if (soundOn) playChime();
  });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) =>
      apiFetch<{ unread: number }>('/admin/notifications/read', {
        method: 'PATCH',
        body: ids ? { ids } : {},
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.notifications });
    },
  });

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const toggleSound = () => {
    setSoundOn((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      } catch {
        // Preference simply will not persist.
      }
      // Play on enable so the operator hears what they just turned on.
      if (next) playChime();
      return next;
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-5" aria-hidden />

          <AnimatePresence>
            {unread > 0 ? (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-sale px-1 text-[10px] font-bold text-white"
              >
                {unread > 99 ? '99+' : unread}
              </motion.span>
            ) : null}
          </AnimatePresence>

          {/* A quiet dot rather than a banner: the connection state matters
              only when it is wrong, and an operator does not need reassurance
              that a websocket is fine. */}
          {!connected ? (
            <span
              className="absolute right-1 bottom-1 size-1.5 rounded-full bg-warning"
              title="Live updates are reconnecting"
              aria-hidden
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? 'Mute notification sound' : 'Unmute notification sound'}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {soundOn ? (
                <Volume2 className="size-3.5" aria-hidden />
              ) : (
                <VolumeX className="size-3.5" aria-hidden />
              )}
            </button>

            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markRead.mutate(undefined)}
                disabled={markRead.isPending}
                className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>
        </div>

        <div className="max-h-[26rem] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((n) => (
                <div key={n} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <BellOff className="mx-auto size-6 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-sm text-muted-foreground">Nothing new right now.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={() => {
                    setOpen(false);
                    if (!notification.read) markRead.mutate([notification.id]);
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/admin/activity" onClick={() => setOpen(false)}>
              See the full activity log
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: AdminNotification;
  onOpen: () => void;
}) {
  const Icon = ICONS[notification.kind] ?? Bell;

  const body = (
    <>
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
          notification.read ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span
            className={cn(
              'flex-1 text-sm leading-snug',
              notification.read ? 'text-muted-foreground' : 'font-medium text-foreground',
            )}
          >
            {notification.title}
          </span>
          {!notification.read ? (
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          ) : null}
        </span>

        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {notification.body}
        </span>
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {formatRelative(notification.createdAt)}
        </span>
      </span>
    </>
  );

  return (
    <li>
      {notification.href ? (
        <Link
          href={notification.href}
          onClick={onOpen}
          className="flex gap-3 px-3 py-2.5 transition-colors hover:bg-muted"
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
        >
          {body}
        </button>
      )}
    </li>
  );
}

/**
 * A two-note chime, synthesised rather than loaded.
 *
 * An audio file would be one more asset to ship, cache and get wrong, for a
 * sound that is two sine tones. The Web Audio context is created lazily on the
 * first play because browsers refuse to start one before a user gesture, and
 * every call is wrapped: an operator whose browser blocks audio should get a
 * silent bell, not an error in the console on every order.
 */
function useChime(): () => void {
  const contextRef = React.useRef<AudioContext | null>(null);

  React.useEffect(() => {
    return () => {
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, []);

  return React.useCallback(() => {
    try {
      contextRef.current ??= new AudioContext();
      const context = contextRef.current;

      // Suspended is the normal state until a gesture resumes it.
      if (context.state === 'suspended') void context.resume();

      const now = context.currentTime;

      // E5 then A5 - a rising interval reads as "something arrived" rather
      // than as an error, which a falling one does.
      for (const [index, frequency] of [659.25, 880].entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;

        const start = now + index * 0.11;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);

        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.3);
      }
    } catch {
      // Autoplay policy, no audio device, or a browser without Web Audio.
    }
  }, []);
}
