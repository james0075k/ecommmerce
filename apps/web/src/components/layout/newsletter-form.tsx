'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const emailSchema = z.string().email('Enter a valid email address');

type State = 'idle' | 'sending' | 'done';

/**
 * The subscribe field and its button, joined as one control.
 *
 * Posts to the app's own route handler rather than the API: this is a marketing
 * capture, not a commerce operation, and the API has no subscriber table. The
 * handler validates and acknowledges with a 202, which is the honest status for
 * "recorded, not yet delivered anywhere".
 *
 * `idPrefix` exists because the form is mounted in the footer of every page and
 * could appear twice on one document; two inputs sharing an id would point both
 * labels at the first one.
 */
export function NewsletterForm({
  idPrefix = 'newsletter',
  className,
}: {
  idPrefix?: string;
  className?: string;
}) {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<State>('idle');

  const inputId = `${idPrefix}-email`;
  const errorId = `${idPrefix}-error`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setError(null);
    setState('sending');

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parsed.data }),
      });

      if (!response.ok) throw new Error('Subscription failed');
      setState('done');
    } catch {
      setState('idle');
      setError('Could not sign you up just now. Try again in a moment.');
    }
  };

  return (
    <div className={cn('max-w-md', className)}>
      <AnimatePresence mode="wait" initial={false}>
        {state === 'done' ? (
          <motion.p
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="border-b border-foreground py-3 text-sm"
            role="status"
          >
            You are on the list. Confirmation is on its way to {email}.
          </motion.p>
        ) : (
          <motion.form
            key="form"
            initial={false}
            exit={{ opacity: 0 }}
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <Label htmlFor={inputId} className="sr-only">
              Email address
            </Label>

            {/* Field and button share one hairline box - the button is the end
                of the field rather than a second object next to it, which is
                what makes an inline signup read as a single action. */}
            <div className="flex items-stretch gap-2 border-b border-foreground/30 pb-2 transition-colors duration-[260ms] focus-within:border-foreground">
              <Input
                id={inputId}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="Email address"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                className="h-10 flex-1 rounded-none border-0 bg-transparent px-0 [--bz-glow-color:transparent] focus-visible:border-0"
              />

              <Button
                type="submit"
                size="sm"
                disabled={state === 'sending'}
                className="shrink-0 px-5 text-[0.6875rem] font-semibold tracking-[0.11em] uppercase"
              >
                {state === 'sending' ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                {state === 'sending' ? 'Signing up' : 'Subscribe'}
              </Button>
            </div>

            {error ? (
              <p id={errorId} role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            ) : null}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
