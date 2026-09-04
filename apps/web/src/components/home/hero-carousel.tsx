'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

import { Button } from '@/components/ui/button';

const SLIDE_MS = 7000;

interface Slide {
  id: string;
  /** Short, ends in a full stop, reads as a sentence rather than a slogan. */
  headline: string;
  cta: { label: string; href: string };
  image: string;
  /** What is actually in the picture, for anyone who cannot see it. */
  alt: string;
}

/**
 * Fixed picsum seeds rather than random ones: the catalogue seed points every
 * product at picsum too, and an unpinned hero would serve a different
 * photograph on every request, which is a different page on every reload.
 */
const SLIDES: Slide[] = [
  {
    id: 'delivery',
    headline: 'Everything you need, at your door.',
    cta: { label: 'Shop everything', href: '/products' },
    image: 'https://picsum.photos/seed/bazaar-hero-delivery/1920/1080',
    alt: 'A courier carrying parcels along a street in Kathmandu.',
  },
  {
    id: 'festival',
    headline: 'Festival prices, while they last.',
    cta: { label: 'See the deals', href: '/products?sort=popular' },
    image: 'https://picsum.photos/seed/bazaar-hero-festival/1920/1080',
    alt: 'Marigold garlands and lamps laid out for the festival season.',
  },
  {
    id: 'payments',
    headline: 'Pay however you like.',
    cta: { label: 'Start shopping', href: '/products' },
    image: 'https://picsum.photos/seed/bazaar-hero-payments/1920/1080',
    alt: 'A shopper paying by phone at a counter.',
  },
];

/**
 * The hero: one photograph held inside a rounded panel, with the headline
 * settled into the bottom corner and the navbar floating over the top of it.
 *
 * The slides cross-fade over 900ms and hold for seven seconds. Both numbers are
 * deliberately slow - the whole design is quiet, and a hero that snaps between
 * three images every four seconds would be the one thing on the page insisting
 * on itself. Nothing slides, nothing parallaxes, and the letters do not
 * assemble: the photograph is the event.
 *
 * Autoplay stops on hover, on keyboard focus, while the tab is hidden and for
 * anyone who asked for reduced motion - a carousel that keeps moving while
 * someone is reading it is the most common way this component fails. The pause
 * control is not optional either: WCAG 2.2.2 requires a way to stop anything
 * that moves for more than five seconds.
 */
export function HeroCarousel() {
  const reduced = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [playing, setPlaying] = React.useState(true);

  const go = React.useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  React.useEffect(() => {
    if (paused || !playing || reduced) return;

    const timer = window.setInterval(() => {
      // A background tab still fires intervals; advancing there would mean
      // coming back to a slide nobody watched change.
      if (document.hidden) return;
      setIndex((current) => (current + 1) % SLIDES.length);
    }, SLIDE_MS);

    return () => window.clearInterval(timer);
  }, [paused, playing, reduced]);

  const slide = SLIDES[index];
  const autoplaying = playing && !paused && !reduced;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      // Pulled up under the sticky navbar, which is transparent at the top of
      // this route. The padding gives it back, so nothing lands beneath the bar.
      className="-mt-16 md:-mt-20"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="bz-panel relative isolate flex h-[86svh] max-h-[54rem] min-h-[34rem] flex-col justify-end bg-[#1b1916] pt-16 text-white md:pt-20">
        {/* --- Photograph ---------------------------------------------------- */}
        <div className="absolute inset-0 -z-10">
          <AnimatePresence initial={false}>
            <motion.div
              key={slide.id}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image
                src={slide.image}
                alt={slide.alt}
                fill
                // The hero is the LCP element on the homepage; the first slide
                // must not wait for the rest of the page to ask for it.
                priority={index === 0}
                sizes="100vw"
                className="object-cover"
              />
            </motion.div>
          </AnimatePresence>

          {/* One scrim, weighted to the bottom where the type sits, and a
              lighter one at the top for the navbar. Any photograph can end up
              behind this - the copy has to stay at AA whatever arrives. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/35"
          />
        </div>

        {/* --- Copy ------------------------------------------------------------
            Bottom right, ranged right. The photograph occupies the frame and
            the sentence sits in the corner it leaves - which is the opposite of
            centring a headline over an image and hoping the subject is not
            behind it. */}
        <div className="relative z-10 px-6 pb-8 md:px-12 md:pb-12 lg:px-16 lg:pb-16">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slide.id}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="ml-auto flex max-w-xl flex-col items-start gap-6 md:items-end"
            >
              <h1 className="bz-display text-4xl text-balance md:text-right md:text-6xl lg:text-7xl">
                {slide.headline}
              </h1>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/60 bg-transparent text-white hover:border-white hover:bg-white hover:text-[#1b1916]"
              >
                <Link href={slide.cta.href}>{slide.cta.label}</Link>
              </Button>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* --- Controls -------------------------------------------------------- */}
        <div className="relative z-20 flex items-center gap-4 px-6 pb-6 md:px-12 md:pb-8 lg:px-16">
          <div className="flex flex-1 items-center gap-2" role="tablist" aria-label="Slides">
            {SLIDES.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={itemIndex === index}
                aria-label={item.headline}
                onClick={() => go(itemIndex)}
                className="group/dot relative h-6 max-w-20 flex-1 cursor-pointer"
              >
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 overflow-hidden bg-white/35 transition-[height] duration-[260ms] group-hover/dot:h-0.5">
                  {/* The active rule fills over exactly one interval, so the
                      indicator doubles as the countdown to the next slide. */}
                  <motion.span
                    key={`${item.id}-${index}-${String(autoplaying)}`}
                    className="block h-full origin-left bg-white"
                    initial={{ scaleX: itemIndex === index ? 0 : itemIndex < index ? 1 : 0 }}
                    animate={{ scaleX: itemIndex <= index ? 1 : 0 }}
                    transition={
                      itemIndex === index && autoplaying
                        ? { duration: SLIDE_MS / 1000, ease: 'linear' }
                        : { duration: 0.3 }
                    }
                  />
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {[
              {
                label: playing ? 'Pause the carousel' : 'Play the carousel',
                icon: playing ? Pause : Play,
                onClick: () => setPlaying((current) => !current),
              },
              {
                label: 'Previous slide',
                icon: ChevronLeft,
                onClick: () => go(index - 1),
              },
              { label: 'Next slide', icon: ChevronRight, onClick: () => go(index + 1) },
            ].map(({ label, icon: Icon, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                aria-label={label}
                className="grid size-9 cursor-pointer place-items-center rounded-full border border-white/30 text-white/85 transition-colors duration-[260ms] hover:border-white hover:text-white"
              >
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
        </div>

        {/* Announces the change for anyone who is not watching it happen. */}
        <span aria-live="polite" className="sr-only">
          {`Slide ${index + 1} of ${SLIDES.length}: ${slide.headline}`}
        </span>
      </div>
    </section>
  );
}
