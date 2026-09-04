'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Send } from 'lucide-react';
import { z } from 'zod';

import { FadeInOnScroll } from '@/components/animations/fade-in-on-scroll';
import { SuccessCheck } from '@/components/animations/success-check';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const emailSchema = z.string().email('Enter a valid email address');

type State = 'idle' | 'sending' | 'done';

/**
 * Newsletter signup.
 *
 * Posts to the app's own route handler rather than the API: this is a marketing
 * capture, not a commerce operation, and the API has no subscriber table yet.
 * The handler validates and acknowledges with a 202, which is the honest status
 * for "recorded, not yet delivered anywhere".
 */
export function NewsletterSignup() {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<State>('idle');

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
    <section className="bz-defer-paint container-bazaar py-16 md:py-24">
      <FadeInOnScroll>
        <div className="relative isolate overflow-hidden rounded-lg border border-border">
          {/* The colour field the glass sits on - without something textured
              behind it, a blur has nothing to blur and the card just looks
              translucent. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-20"
            style={{
              backgroundImage:
                'linear-gradient(120deg, color-mix(in srgb, var(--bz-primary) 85%, #000), color-mix(in srgb, var(--bz-secondary) 60%, var(--bz-primary)))',
            }}
          />
          <div
            aria-hidden
            className="absolute -top-24 -right-16 -z-20 size-80 rounded-full opacity-70 blur-3xl"
            style={{ backgroundColor: 'color-mix(in srgb, #ffffff 45%, transparent)' }}
          />
          <div
            aria-hidden
            className="absolute -bottom-24 -left-10 -z-20 size-72 rounded-full opacity-50 blur-3xl"
            style={{ backgroundColor: 'color-mix(in srgb, var(--bz-success) 70%, transparent)' }}
          />

          <div className="grid gap-8 border border-white/15 bg-white/10 p-8 backdrop-blur-2xl md:grid-cols-2 md:items-center md:p-12">
            <div className="space-y-3 text-white">
              <span className="font-mono text-xs tracking-widest uppercase opacity-80">
                One email a week
              </span>
              <h2 className="font-display text-2xl font-bold tracking-tight text-balance md:text-3xl">
                Get the drops before the rest of the country
              </h2>
              <p className="max-w-prose text-sm text-white/80 text-pretty">
                New arrivals, price drops on things you have looked at, and the flash sale
                start time. No more than one email a week, and unsubscribing takes one click.
              </p>
            </div>

            <div className="rounded-lg border border-white/20 bg-white/10 p-5 backdrop-blur-xl">
              <AnimatePresence mode="wait" initial={false}>
                {state === 'done' ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center gap-3 py-4 text-center text-white"
                  >
                    <SuccessCheck size={56} className="text-white" />
                    <p className="font-display text-lg font-bold">You are on the list</p>
                    <p className="text-sm text-white/80">
                      Confirmation is on its way to {email}.
                    </p>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    onSubmit={(event) => void submit(event)}
                    noValidate
                    className="space-y-3"
                  >
                    <Label htmlFor="newsletter-email" className="text-sm text-white">
                      Email address
                    </Label>

                    <Input
                      id="newsletter-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (error) setError(null);
                      }}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'newsletter-error' : undefined}
                      // The focus glow reads its colour from a variable, so on
                      // the coloured card it is set to white rather than the
                      // brand ring, which would disappear into the gradient.
                      className="h-11 border-white/30 bg-white/15 text-white [--bz-glow-color:rgba(255,255,255,0.45)] placeholder:text-white/60 focus-visible:border-white"
                    />

                    {error ? (
                      <motion.p
                        id="newsletter-error"
                        role="alert"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs font-medium text-white"
                      >
                        {error}
                      </motion.p>
                    ) : null}

                    <Button
                      type="submit"
                      size="lg"
                      disabled={state === 'sending'}
                      className="group/submit h-11 w-full bg-white text-base font-semibold text-[#1A1A2E] hover:bg-white"
                    >
                      {state === 'sending' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4 transition-transform duration-200 group-hover/submit:translate-x-0.5 group-hover/submit:-translate-y-0.5" />
                      )}
                      {state === 'sending' ? 'Signing you up' : 'Sign me up'}
                    </Button>

                    <p className="text-xs text-white/70">
                      We never sell your address. Read the privacy note before you subscribe.
                    </p>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </FadeInOnScroll>
    </section>
  );
}
