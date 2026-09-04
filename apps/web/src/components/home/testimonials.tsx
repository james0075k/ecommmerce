'use client';

import * as React from 'react';
import { Quote } from 'lucide-react';

import { StarRating } from '@/components/shop/star-rating';
import { cn } from '@/lib/utils';

import { SectionHeading } from './section-heading';

/**
 * Customer quotes.
 *
 * These are written here rather than fetched: there is no public reviews
 * endpoint yet - reviews land in Phase 7 - and a testimonial rail wired to an
 * endpoint that does not exist would fail silently on every load. When
 * `GET /reviews` ships, this array is what it replaces.
 */
interface Testimonial {
  id: string;
  name: string;
  location: string;
  rating: number;
  quote: string;
  /** Initials stand in for a photo until real avatars are uploaded. */
  initials: string;
  hue: number;
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: 'sabina',
    name: 'Sabina Karki',
    location: 'Pokhara, Gandaki',
    rating: 5,
    quote:
      'Ordered on Friday evening and it was at my door on Sunday morning. Outside the valley that usually means a week.',
    initials: 'SK',
    hue: 268,
  },
  {
    id: 'anil',
    name: 'Anil Shrestha',
    location: 'Kathmandu, Bagmati',
    rating: 5,
    quote:
      'Paid with eSewa in two taps, no redirect that loses your cart halfway. The tracking page actually updates.',
    initials: 'AS',
    hue: 196,
  },
  {
    id: 'pratima',
    name: 'Pratima Yadav',
    location: 'Janakpur, Madhesh',
    rating: 4,
    quote:
      'A size exchange took one message. They picked the old one up when they dropped off the new one.',
    initials: 'PY',
    hue: 158,
  },
  {
    id: 'deepak',
    name: 'Deepak Thapa',
    location: 'Biratnagar, Koshi',
    rating: 5,
    quote:
      'Cash on delivery without a deposit up front is the only reason I tried it. Now it is where I buy everything.',
    initials: 'DT',
    hue: 24,
  },
  {
    id: 'nisha',
    name: 'Nisha Gurung',
    location: 'Butwal, Lumbini',
    rating: 5,
    quote:
      'The stock count is honest. If it says three left, there are three - I have never had an order cancelled after the fact.',
    initials: 'NG',
    hue: 322,
  },
  {
    id: 'rajesh',
    name: 'Rajesh Bista',
    location: 'Dhangadhi, Sudurpashchim',
    rating: 4,
    quote:
      'Far west delivery used to be a gamble. Six orders in, every one arrived inside the window they quoted.',
    initials: 'RB',
    hue: 96,
  },
];

/**
 * An infinite marquee of quotes: the list is rendered twice and the track is
 * translated by exactly half its width, so the seam falls where the copy
 * begins and the loop is invisible.
 *
 * CSS animation rather than Framer Motion - nothing here needs orchestration,
 * and a keyframe on the compositor keeps running at 60fps while the main
 * thread is busy hydrating the rest of the page.
 */
export function Testimonials() {
  return (
    <section className="bz-defer-paint overflow-hidden py-16 md:py-24">
      <div className="container-bazaar">
        <SectionHeading
          eyebrow="Word of mouth"
          title="What shoppers say once the box arrives"
          description="Six of the reviews that keep coming back to the same three things: it arrives, it is what was pictured, and paying was not a fight."
          align="center"
        />
      </div>

      {/* The mask is what makes the rail read as continuous rather than as a
          list that starts and stops at the edge of the screen. */}
      <div
        className="group/marquee relative flex gap-4 overflow-hidden py-2"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 6rem, black calc(100% - 6rem), transparent)',
        }}
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1}
            className="flex shrink-0 gap-4 [animation:bz-marquee_46s_linear_infinite] group-hover/marquee:[animation-play-state:paused] motion-reduce:[animation:none]"
          >
            {TESTIMONIALS.map((testimonial) => (
              <TestimonialCard key={testimonial.id} testimonial={testimonial} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <figure className="flex w-[19rem] shrink-0 flex-col gap-4 rounded-lg border border-border bg-card p-5 transition-shadow duration-300 hover:shadow-float md:w-[22rem]">
      <div className="flex items-center justify-between gap-3">
        <StarRating rating={testimonial.rating} size="sm" />
        <Quote className="size-5 shrink-0 text-primary/30" aria-hidden />
      </div>

      <blockquote className="flex-1 text-sm leading-relaxed text-pretty">
        {testimonial.quote}
      </blockquote>

      <figcaption className="flex items-center gap-3 border-t border-border pt-4">
        <span
          aria-hidden
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white',
          )}
          style={{
            backgroundImage: `linear-gradient(135deg, hsl(${testimonial.hue} 62% 42%), hsl(${
              (testimonial.hue + 40) % 360
            } 66% 56%))`,
          }}
        >
          {testimonial.initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{testimonial.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {testimonial.location}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
