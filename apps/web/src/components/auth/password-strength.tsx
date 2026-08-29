'use client';

import { cn } from '@/lib/utils';

type Strength = 'empty' | 'weak' | 'medium' | 'strong';

interface Assessment {
  level: Strength;
  score: number;
  hint: string;
}

/**
 * Scores against the same rules the Zod schema enforces, so the meter and the
 * validation never disagree. Length past the minimum is what actually buys
 * security, so it is weighted heaviest.
 */
export function assessPassword(password: string): Assessment {
  if (!password) {
    return { level: 'empty', score: 0, hint: 'Use at least 8 characters.' };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const missing: string[] = [];
  if (password.length < 8) missing.push('8+ characters');
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter');
  if (!/\d/.test(password)) missing.push('a number');

  if (missing.length > 0) {
    return { level: 'weak', score: Math.max(score, 1), hint: `Still needs ${missing.join(', ')}.` };
  }

  if (score >= 5) {
    return { level: 'strong', score, hint: 'Strong password.' };
  }

  return {
    level: 'medium',
    score,
    hint: 'Add a symbol or a few more characters to make it strong.',
  };
}

const BAR_COUNT = 3;

export function PasswordStrength({ password }: { password: string }) {
  const { level, hint } = assessPassword(password);

  const filled = { empty: 0, weak: 1, medium: 2, strong: 3 }[level];
  const colour = {
    empty: 'bg-border',
    weak: 'bg-destructive',
    medium: 'bg-warning',
    strong: 'bg-success',
  }[level];

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-200',
              index < filled ? colour : 'bg-border',
            )}
          />
        ))}
      </div>
      <p
        className={cn(
          'text-xs',
          level === 'strong' ? 'text-success' : 'text-muted-foreground',
        )}
        // Announced politely so a screen reader hears the assessment change
        // without interrupting typing.
        aria-live="polite"
      >
        {level === 'empty' ? hint : `${capitalise(level)} — ${hint}`}
      </p>
    </div>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
