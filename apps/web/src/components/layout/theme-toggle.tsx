'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { cn } from '@/lib/utils';

/**
 * Dark and light, with the OS preference as the starting point.
 *
 * The one icon in a navbar of words. It stays an icon because it is the only
 * control up there whose label would have to be a lie half the time - "Dark
 * mode" is both what you are in and what you are switching to, depending on
 * where you started - whereas a sun and a moon say which one you are choosing.
 *
 * Both icons are always rendered and swapped by the `dark` class, so the server
 * and client markup match with no mounted-state guard and no hydration flash.
 * `resolvedTheme` is read only inside the handler, never during render.
 *
 * The swap is a rotation rather than a fade: the sun turns out of frame as the
 * moon turns into it, which reads as one control changing state rather than two
 * icons cross-fading.
 */
export function ThemeToggle({ overlay = false }: { overlay?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      data-slot="nav-control"
      className={cn(
        'relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border transition-colors duration-[260ms]',
        overlay
          ? 'border-white/30 text-white/85 hover:border-white hover:text-white'
          : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
      )}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-4 rotate-0 scale-100 transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle between light and dark mode</span>
    </button>
  );
}
