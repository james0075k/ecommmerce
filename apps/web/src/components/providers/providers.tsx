'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Tooltip } from 'radix-ui';

import { AuthProvider } from '@/components/providers/auth-provider';
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
      {/* A1.2: dark is the default, with a one-click light toggle. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <Tooltip.Provider delayDuration={200}>
          <AuthProvider>{children}</AuthProvider>
          <Toaster position="top-right" richColors closeButton />
        </Tooltip.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
