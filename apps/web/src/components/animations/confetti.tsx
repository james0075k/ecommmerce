'use client';

import * as React from 'react';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  width: number;
  height: number;
  color: string;
}

/** Brand palette - the confetti should look like Bazaar, not like a party shop. */
const COLORS = ['#6C3CE1', '#FF6B35', '#00C48C', '#F59E0B', '#4C8DFF'];

const GRAVITY = 0.22;
const DRAG = 0.995;
const DURATION_MS = 3200;

/**
 * A one-shot confetti burst on a canvas.
 *
 * Canvas rather than DOM nodes: 140 absolutely-positioned divs animating
 * transform would thrash layout on a mid-range phone, which is most of the
 * audience here. Canvas draws the whole frame in one pass and disappears
 * entirely when it is done.
 *
 * Respects prefers-reduced-motion by not running at all - a celebration that
 * makes someone ill is not a celebration.
 */
export function Confetti({ pieces = 140 }: { pieces?: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    // Two launchers at the lower corners, angled inwards - the shape a real
    // confetti cannon makes, and it keeps the middle of the screen (where the
    // order number is) clear for the first moment.
    const confetti: Piece[] = Array.from({ length: pieces }, (_, index) => {
      const fromLeft = index % 2 === 0;
      const spread = (Math.random() - 0.5) * 0.9;

      return {
        x: fromLeft ? width * 0.08 : width * 0.92,
        y: height * 0.92,
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 6) + spread * 4,
        vy: -(11 + Math.random() * 8),
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        width: 6 + Math.random() * 5,
        height: 9 + Math.random() * 6,
        color: COLORS[index % COLORS.length] as string,
      };
    });

    const start = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const elapsed = now - start;
      context.clearRect(0, 0, width, height);

      // Fade the whole burst out over its last second rather than having
      // pieces vanish mid-flight.
      const fade = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / 1000));
      context.globalAlpha = fade;

      for (const piece of confetti) {
        piece.vy += GRAVITY;
        piece.vx *= DRAG;
        piece.vy *= DRAG;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.spin;

        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        context.restore();
      }

      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(draw);
      } else {
        context.clearRect(0, 0, width, height);
      }
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [pieces]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
}
