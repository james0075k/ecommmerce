'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Share, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

const VISITS_KEY = 'bazaar.visits';
const DISMISSED_KEY = 'bazaar.install-dismissed';
const VISITS_BEFORE_PROMPT = 3;

/**
 * `beforeinstallprompt` is not in the DOM lib - it is Chromium-only - so the
 * two members actually used are declared here rather than casting to `any`.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * The custom install banner.
 *
 * Held back until the third visit: asking someone to install a store they have
 * seen once is the request most likely to be dismissed permanently, and a
 * dismissal is remembered by the browser as well as by us.
 *
 * Two shapes, because the platforms differ. Chromium fires
 * `beforeinstallprompt`, which is captured and replayed when the button is
 * pressed. iOS Safari has no such event and no programmatic install, so it gets
 * the Share-sheet instruction instead - and only when it is not already running
 * standalone.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  // One piece of state, set from a timer or an event listener rather than from
  // the effect body - the banner has nothing to show until one of those fires.
  const [banner, setBanner] = React.useState<{ visible: boolean; ios: boolean }>({
    visible: false,
    ios: false,
  });

  React.useEffect(() => {
    // Already installed: there is nothing to offer.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Safari's non-standard flag, the only signal iOS gives.
      ('standalone' in navigator && navigator.standalone === true);

    if (standalone) return;

    let dismissed = false;
    let visits = 0;

    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === '1';
      visits = Number(window.localStorage.getItem(VISITS_KEY) ?? '0') + 1;
      window.localStorage.setItem(VISITS_KEY, String(visits));
    } catch {
      // Private mode or blocked storage: count this as a first visit and never
      // nag, rather than failing the render.
      return;
    }

    if (dismissed || visits < VISITS_BEFORE_PROMPT) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

    // iOS never fires the event, so the instruction card is shown directly -
    // after a pause, so it does not land on top of the page still painting.
    if (ios) {
      const timer = window.setTimeout(() => setBanner({ visible: true, ios: true }), 2500);
      return () => window.clearTimeout(timer);
    }

    const onBeforeInstall = (event: Event) => {
      // Suppress the browser's own mini-infobar so there is only one ask.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setBanner({ visible: true, ios: false });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const remember = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Nothing to do - it will ask again next time, which is the safe failure.
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // The event can only be used once, accepted or not.
    setDeferred(null);
    setBanner({ visible: false, ios: false });
    remember();
  };

  return (
    <AnimatePresence>
      {banner.visible ? (
        <motion.div
          role="dialog"
          aria-label="Install Bazaar"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-3 z-80 mx-auto max-w-md rounded-lg border border-border bg-card/95 p-4 shadow-float backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:bottom-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-solid text-primary-foreground"
            >
              <Download className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold tracking-tight">
                Install Bazaar
              </p>
              <p className="mt-1 text-xs text-muted-foreground text-pretty">
                {banner.ios
                  ? 'Tap the Share button, then “Add to Home Screen” for full-screen shopping and offline browsing.'
                  : 'Add it to your home screen for full-screen shopping, faster loads and offline browsing.'}
              </p>

              {banner.ios ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                  <Share className="size-3.5" aria-hidden />
                  Share → Add to Home Screen
                </p>
              ) : (
                <Button size="sm" className="mt-3" onClick={() => void install()}>
                  Install
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss"
              onClick={() => {
                setBanner({ visible: false, ios: false });
                remember();
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
