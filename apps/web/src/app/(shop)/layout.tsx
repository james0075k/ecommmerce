import { ChatWidget } from '@/components/ai/chat-widget-lazy';
import { PageTransition } from '@/components/animations/page-transition';
import { ScrollProgress } from '@/components/animations/scroll-progress';
import { CartDrawer } from '@/components/cart/cart-drawer';
import { BottomNav } from '@/components/layout/bottom-nav';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { InstallPrompt } from '@/components/pwa/install-prompt';

/**
 * The storefront shell. The header, footer and cart drawer are mounted once
 * here rather than per page, so the cart badge survives navigation and the
 * drawer can be opened from anywhere - including a product card three routes
 * deep.
 *
 * `PageTransition` wraps only `<main>`: animating the shell would take the
 * header and the drawer with it on every navigation.
 *
 * Phase 11 adds the bottom navigation below `lg`. It is fixed to the viewport,
 * so the footer carries matching padding to keep the last row of any page out
 * from underneath it.
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ScrollProgress />
      <SiteHeader />

      <main id="main" className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>

      {/* The bar is `position: fixed`, so it takes no space in the flow; this
          reserves the height it covers, plus the iOS home indicator. */}
      <SiteFooter className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0" />

      <BottomNav />

      <CartDrawer />
      {/* Mounted beside the drawer, for the same reason: the conversation has
          to survive navigation, and it can be opened from any route. The
          `-lazy` module is the same widget, fetched once the browser is idle so
          its chunk is off the critical path (Phase 11). */}
      <ChatWidget />
      <InstallPrompt />
    </div>
  );
}
