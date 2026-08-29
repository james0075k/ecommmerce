import type { Transition, Variants } from 'framer-motion';

/**
 * Framer Motion presets transcribed from Blueprint H2.
 * Durations and easings here are the specification, not taste - if a component
 * needs different timing, the blueprint is what changes first.
 */

/* --- Easings -------------------------------------------------------------- */

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;
export const EASE_DRAWER = [0.33, 1, 0.68, 1] as const;

export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 24 };
export const springBouncy: Transition = { type: 'spring', stiffness: 400, damping: 12 };

/* --- Page load: fade in + slide up 20px, 400ms ---------------------------- */

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_OUT_EXPO },
  },
};

/* --- Product card on scroll: fade + scale from 0.95, 500ms, 50ms stagger -- */

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

export const staggerChildren = (staggerSeconds = 0.05): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: staggerSeconds, delayChildren: 0.05 },
  },
});

/* --- Route change: crossfade + slide ------------------------------------- */

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT_EXPO } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: 'easeIn' } },
};

/* --- Drawer / modal: enter 300ms, exit 200ms ----------------------------- */

export const slideInRight: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { duration: 0.3, ease: EASE_DRAWER } },
  exit: { x: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
};

export const backdropFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 0.5, transition: { duration: 0.3, ease: EASE_DRAWER } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

/* --- Product card hover: scale 1.03, 250ms ------------------------------- */

export const cardHover = {
  scale: 1.03,
  transition: { duration: 0.25, ease: 'easeOut' },
} as const;

/** Shared viewport config so scroll reveals fire consistently across the app. */
export const revealViewport = { once: true, amount: 0.2 } as const;
