'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Tooltip } from 'radix-ui';

import { AnalyticsProvider } from '@/components/providers/analytics-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { CartProvider } from '@/components/providers/cart-provider';
import { WebVitalsProvider } from '@/components/providers/web-vitals-provider';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker';
import { Toaster } from '@/components/ui/sonner';

/**
 * Every client-side provider the app needs, in one place so the root layout
 * stays a server component.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Created once per browser session; a module-level client would be shared
  // across users during SSR.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Phase 9: the OS preference decides, and the navbar toggle overrides
          it. `defaultTheme="system"` is what makes the toggle a preference
          rather than a correction - a visitor whose machine is already in dark
          mode never has to set anything. The choice is persisted by next-themes
          in localStorage under `theme`. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <Tooltip.Provider delayDuration={200}>
          <AuthProvider>
            <CartProvider>{children}</CartProvider>
          </AuthProvider>
          {/* `useSearchParams` opts its subtree out of static rendering, so
              the beacon sits behind its own Suspense boundary rather than
              making every page dynamic (Phase 8). */}
          <React.Suspense fallback={null}>
            <AnalyticsProvider />
          </React.Suspense>
          {/* Field Core Web Vitals (Phase 11). Renders nothing and reads only
              `usePathname`, so unlike the beacon above it does not force the
              tree dynamic and needs no boundary of its own. */}
          <WebVitalsProvider />
          <Toaster position="top-right" richColors closeButton duration={4000} />
          <ServiceWorkerRegistrar />
        </Tooltip.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
