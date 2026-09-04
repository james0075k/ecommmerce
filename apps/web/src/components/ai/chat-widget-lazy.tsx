'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

/**
 * Defers the chat widget's code off the critical path (Phase 11).
 *
 * The widget is mounted in the storefront shell, so it is on the homepage, the
 * listing and every product page - and it is the largest client component the
 * storefront has: a transcript renderer, a mutation, a query, product and order
 * cards and the AI client. Statically imported it lands in the chunk every one
 * of those routes must download before it can paint, for a launcher most visits
 * never touch.
 *
 * Rendering a stand-in launcher and swapping it on hover was the obvious
 * alternative and is wrong here: the widget asks the API whether AI is
 * configured and renders nothing when it is not, so a placeholder would put a
 * button on screen that vanishes a moment later on every deployment without an
 * Anthropic key.
 *
 * Instead the mount waits for the browser to go idle - after hydration, after
 * the LCP image, after the fonts - or for the first sign the visitor is doing
 * something, whichever comes first. Either way the chunk is fetched during time
 * the page was not using, and the widget behaves exactly as it always did once
 * it arrives.
 */
const ChatWidgetImpl = dynamic(
  () => import('@/components/ai/chat-widget').then((module) => module.ChatWidget),
  { ssr: false },
);

/** Long enough to be clear of the LCP on a slow phone, short enough to feel instant. */
const IDLE_TIMEOUT_MS = 2500;

const INTERACTIONS = ['pointerdown', 'keydown', 'scroll'] as const;

export function ChatWidget() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (mounted) return;

    let idle: number | null = null;
    const mount = () => setMounted(true);

    // requestIdleCallback is unsupported in Safari before 17, which is a large
    // share of the iOS traffic this store is built for - so the timeout is the
    // real scheduler there, not a fallback nobody hits.
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(mount, { timeout: IDLE_TIMEOUT_MS });
    } else {
      idle = window.setTimeout(mount, IDLE_TIMEOUT_MS);
    }

    // A visitor who has started scrolling or typing has finished the part of
    // the load that mattered; there is no reason to keep waiting on idle.
    for (const event of INTERACTIONS) {
      window.addEventListener(event, mount, { once: true, passive: true });
    }

    return () => {
      if (idle !== null) {
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
        else window.clearTimeout(idle);
      }
      for (const event of INTERACTIONS) window.removeEventListener(event, mount);
    };
  }, [mounted]);

  return mounted ? <ChatWidgetImpl /> : null;
}
