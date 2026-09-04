'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

import { CursorGlow } from '@/components/animations/cursor-glow';
import { KineticText } from '@/components/animations/kinetic-text';
import { Magnetic } from '@/components/animations/magnetic';
import { ParallaxSection } from '@/components/animations/parallax-section';
import { RippleButton } from '@/components/animations/ripple-button';
import { Button } from '@/components/ui/button';

const SLIDE_MS = 5000;

interface Slide {
  id: string;
  eyebrow: string;
  headline: string;
  subheadline: string;
  cta: { label: string; href: string };
  secondary: { label: string; href: string };
  /** Three stops - the middle one is what stops a two-stop ramp looking flat. */
  gradient: string;
  glow: string;
}

const SLIDES: Slide[] = [
  {
    id: 'delivery',
    eyebrow: 'All 77 districts',
    headline: 'Everything you need, delivered',
    subheadline:
      'Electronics, fashion and home essentials, from Kathmandu to Darchula. Free delivery on orders over Rs 5,000.',
    cta: { label: 'Shop the catalogue', href: '/products' },
    secondary: { label: 'See what is new', href: '/products?sort=newest' },
    gradient: 'linear-gradient(135deg, #2A1259 0%, #6C3CE1 45%, #B14BFF 100%)',
    glow: 'color-mix(in srgb, #ffffff 22%, transparent)',
  },
  {
    id: 'festival',
    eyebrow: 'Festival season',
    headline: 'Festival prices, while stock lasts',
    subheadline:
      'Up to 40% off across the catalogue. New drops every morning, and the counter below is not decorative.',
    cta: { label: 'See the deals', href: '/products?sort=popular' },
    secondary: { label: 'Top rated first', href: '/products?sort=rating' },
    gradient: 'linear-gradient(135deg, #4A1503 0%, #FF6B35 50%, #FFB347 100%)',
    glow: 'color-mix(in srgb, #ffffff 26%, transparent)',
  },
  {
    id: 'payments',
    eyebrow: 'Pay your way',
    headline: 'eSewa, Khalti, card or cash',
    subheadline:
      'Six ways to pay, including cash on delivery. Every order is tracked from warehouse to doorstep.',
    cta: { label: 'Start shopping', href: '/products' },
    secondary: { label: 'In stock right now', href: '/products?inStock=true' },
    gradient: 'linear-gradient(135deg, #05231B 0%, #00C48C 48%, #38BDF8 100%)',
    glow: 'color-mix(in srgb, #ffffff 24%, transparent)',
  },
];

/**
 * The hero: three slides on a five second rotation, each one a gradient field
 * that drifts at a fraction of scroll speed while the headline assembles itself
 * letter by letter.
 *
 * Autoplay stops on hover, on keyboard focus, while the tab is hidden and for
 * anyone who asked for reduced motion - a carousel that keeps moving while
 * someone is reading it is the most common way this component fails.
 */
export function HeroCarousel() {
  const reduced = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  const [paused, setPaused] = React.useState(false);
  const [playing, setPlaying] = React.useState(true);

  const go = React.useCallback((next: number, dir: number) => {
    setDirection(dir);
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  React.useEffect(() => {
    if (paused || !playing || reduced) return;

    const timer = window.setInterval(() => {
      // A background tab still fires intervals; advancing there would mean
      // coming back to a slide nobody watched change.
      if (document.hidden) return;
      setDirection(1);
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
      className="relative isolate flex min-h-[34rem] flex-col overflow-hidden bg-[#0B0E1A] text-white md:min-h-[40rem] lg:min-h-[44rem]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* --- Background ---------------------------------------------------- */}
      <div className="absolute inset-0 -z-10">
        <ParallaxSection speed={0.4} className="h-full">
          <AnimatePresence initial={false}>
            <motion.div
              key={slide.id}
              className="absolute inset-0"
              style={{ backgroundImage: slide.gradient }}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </AnimatePresence>
        </ParallaxSection>

        {/* Two scrims: one keeps the headline at AA contrast whichever gradient
            is behind it, the other blends the section into the page below. */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <CursorGlow color={slide.glow} size={520} />

      {/* --- Copy ---------------------------------------------------------- */}
      <div className="container-bazaar relative z-10 flex flex-1 flex-col justify-center py-28">
        <div className="max-w-2xl">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={slide.id}
              custom={direction}
              initial={reduced ? false : { opacity: 0, x: direction * 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: direction * -32 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 font-mono text-[11px] tracking-widest uppercase backdrop-blur-sm">
                <span className="size-1.5 rounded-full bg-white" aria-hidden />
                {slide.eyebrow}
              </span>

              <KineticText
                as="h1"
                // Keyed on the slide so the letters re-stagger on every change,
                // not only on first mount.
                key={`headline-${slide.id}`}
                text={slide.headline}
                delay={0.12}
                className="font-display block text-4xl leading-[1.03] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl"
              />

              <motion.p
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="max-w-lg text-base text-white/80 text-pretty md:text-lg"
              >
                {slide.subheadline}
              </motion.p>

              <motion.div
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-wrap items-center gap-3 pt-2"
              >
                {/* Magnetic on a desktop pointer, inert on touch: the primary
                    CTA leans towards the cursor before it is reached. */}
                <Magnetic>
                  <RippleButton
                    asChild
                    size="lg"
                    className="h-11 bg-white px-6 text-base font-semibold text-[#1A1A2E] hover:bg-white"
                    rippleClassName="bg-primary/25"
                  >
                    <Link href={slide.cta.href}>
                      {slide.cta.label}
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5" />
                    </Link>
                  </RippleButton>
                </Magnetic>

                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="h-11 border border-white/30 px-5 text-base text-white hover:bg-white/15 hover:text-white"
                >
                  <Link href={slide.secondary.href}>{slide.secondary.label}</Link>
                </Button>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* --- Controls ------------------------------------------------------ */}
      {/* The extra bottom padding is not decoration: the stats strip below the
          hero pulls up over this edge, and the indicator bars have to clear it. */}
      <div className="container-bazaar relative z-20 flex items-center gap-3 pb-16 md:pb-20">
        <div className="flex flex-1 items-center gap-2" role="tablist" aria-label="Slides">
          {SLIDES.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={itemIndex === index}
              aria-label={item.headline}
              onClick={() => go(itemIndex, itemIndex > index ? 1 : -1)}
              className="group/dot relative h-8 max-w-24 flex-1 cursor-pointer"
            >
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/dot:h-1">
                {/* The active bar fills over exactly one interval, so the
                    indicator doubles as the countdown to the next slide. */}
                <motion.span
                  key={`${item.id}-${index}-${String(autoplaying)}`}
                  className="block h-full origin-left rounded-full bg-white"
                  initial={{ scaleX: itemIndex === index ? 0 : itemIndex < index ? 1 : 0 }}
                  animate={{ scaleX: itemIndex <= index ? 1 : 0 }}
                  transition={
                    itemIndex === index && autoplaying
                      ? { duration: SLIDE_MS / 1000, ease: 'linear' }
                      : { duration: 0.2 }
                  }
                />
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? 'Pause the carousel' : 'Play the carousel'}
            className="text-white hover:bg-white/15 hover:text-white"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => go(index - 1, -1)}
            aria-label="Previous slide"
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => go(index + 1, 1)}
            aria-label="Next slide"
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Announces the change for anyone who is not watching it happen. */}
      <span aria-live="polite" className="sr-only">
        {`Slide ${index + 1} of ${SLIDES.length}: ${slide.headline}`}
      </span>
    </section>
  );
}
