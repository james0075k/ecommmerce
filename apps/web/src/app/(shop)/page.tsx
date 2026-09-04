import type { Metadata } from 'next';

import { BrandMarquee } from '@/components/home/brand-marquee';
import { CategoryBento } from '@/components/home/category-bento';
import { FlashSale } from '@/components/home/flash-sale';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { NewsletterSignup } from '@/components/home/newsletter-signup';
import { RecommendedForYou } from '@/components/home/recommended-for-you';
import { StoreStats } from '@/components/home/store-stats';
import { Testimonials } from '@/components/home/testimonials';
import { TrendingProducts } from '@/components/home/trending-products';

export const metadata: Metadata = {
  // The root title has no template applied, so this is the full document title.
  title: 'Bazaar — Everything you need, delivered across Nepal',
  description:
    'Shop electronics, fashion and home essentials with delivery to all 77 districts. Flash sales daily, and payment by eSewa, Khalti, card or cash on delivery.',
  alternates: { canonical: '/' },
};

/**
 * The storefront homepage.
 *
 * A server component that composes client sections. Each section owns its own
 * fetch and its own loading state rather than the page awaiting everything up
 * front - the hero is static and paints immediately, and a catalogue query that
 * is slow (or down) costs that one section rather than the whole page.
 *
 * The navbar sits transparently over the hero, so this page starts at y=0 with
 * no top padding; every other route gets the spacer the header renders.
 */
export default function HomePage() {
  return (
    <>
      <HeroCarousel />
      <StoreStats />
      <CategoryBento />
      <FlashSale />
      <TrendingProducts />
      <RecommendedForYou />
      <Testimonials />
      <BrandMarquee />
      <NewsletterSignup />
    </>
  );
}
