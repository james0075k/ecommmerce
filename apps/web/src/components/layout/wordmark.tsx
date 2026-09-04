import { cn } from '@/lib/utils';

/**
 * The Bazaar logotype.
 *
 * Set in the product's own typeface rather than drawn as an SVG: the brand has
 * one family and the wordmark is that family at its tightest fitting, which is
 * the whole idea - the logo and the paragraph beneath it are visibly the same
 * voice. Being live text also means it inherits `currentColor`, so it turns
 * white over the hero and ink on the page with no second asset.
 *
 * Lowercase, always. `size` scales the whole thing from the container's font
 * size, so the footer's 12rem version and the navbar's 1rem version are the
 * same component with a different type size.
 */
export function Wordmark({
  className,
  as: Tag = 'span',
}: {
  className?: string;
  /** `h1`/`h2` where the wordmark is genuinely the heading of its section. */
  as?: 'span' | 'div' | 'h1' | 'h2';
}) {
  return (
    <Tag
      // The tracking is optical, not proportional: at 1rem the letters need
      // room and at 12rem they need to close ranks, so the two sizes cannot
      // share one em-relative value. This is the tight end for the oversized
      // footer mark; the navbar loosens it back through `className`, which
      // wins because `cn` resolves the conflict in the caller's favour.
      className={cn(
        'font-display block leading-none font-medium tracking-[-0.045em] lowercase select-none',
        className,
      )}
    >
      bazaar
    </Tag>
  );
}
