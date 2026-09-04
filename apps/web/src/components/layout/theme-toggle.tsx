'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Dark and light, with the OS preference as the starting point.
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
    <Button
      variant={overlay ? 'ghost' : 'outline'}
      size="icon"
      className={cn(
        'relative overflow-hidden',
        overlay && 'text-white hover:bg-white/15 hover:text-white',
      )}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-4 rotate-0 scale-100 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle between light and dark mode</span>
    </Button>
  );
}
