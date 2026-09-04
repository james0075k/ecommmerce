'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, MessageCircle, Send, Sparkles, UserRound, X } from 'lucide-react';

import { AI_CHAT_MAX_MESSAGE } from '@bazaar/shared/constants';
import type { ChatOrderRef, ChatProductRef, ChatTurn } from '@bazaar/shared';
import { EASE_OUT_EXPO, formatPrice } from '@bazaar/ui';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import {
  fetchChatConfig,
  requestHumanHandoff,
  sendChatMessage,
  type ChatConfig,
} from '@/lib/ai';
import { useAuthStore } from '@/lib/store/auth-store';
import { cn } from '@/lib/utils';

/** A rendered line in the transcript. Assistant turns can carry attachments. */
interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: ChatProductRef[];
  orders?: ChatOrderRef[];
  /** Rendered in the assistant's own voice, in a warning tone. */
  isError?: boolean;
}

/** The details a guest supplies when the conversation goes to a human. */
interface HandoffDraft {
  subject: string;
  summary: string;
}

let bubbleId = 0;
const nextId = (): string => `bubble-${(bubbleId += 1)}`;

/**
 * E2: the storefront chat widget.
 *
 * Mounted once in the storefront shell, so the conversation survives navigation
 * - a shopper who asks "do you have this in blue", opens the product, and comes
 * back should not find an empty panel.
 *
 * The transcript is client state and is never persisted. That is the same
 * decision the API makes (there is no conversation table): closing the tab ends
 * the conversation, which is both the cheapest and the most private option, and
 * it means nothing here has to be cleared on logout.
 */
export function ChatWidget() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [bubbles, setBubbles] = React.useState<Bubble[]>([]);
  const [handoff, setHandoff] = React.useState<HandoffDraft | null>(null);

  const user = useAuthStore((state) => state.user);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // The widget hides itself entirely when the server has no API key, rather
  // than offering a button that can only ever apologise.
  const { data: config } = useQuery<ChatConfig>({
    queryKey: ['ai', 'chat', 'config'],
    queryFn: fetchChatConfig,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const send = useMutation({
    mutationFn: (message: string) =>
      sendChatMessage({
        message,
        // The server caps this too; trimming here keeps the request small.
        conversationHistory: bubbles
          .filter((bubble) => !bubble.isError)
          .slice(-10)
          .map((bubble): ChatTurn => ({ role: bubble.role, content: bubble.content })),
      }),
    onSuccess: (reply) => {
      setBubbles((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          content: reply.reply,
          products: reply.products,
          orders: reply.orders,
        },
      ]);

      if (reply.handoffRequested) setHandoff(reply.handoffRequested);
      setSuggestions(reply.suggestions);
    },
    onError: (error: unknown) => {
      setBubbles((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          isError: true,
          content:
            error instanceof ApiError && error.status === 429
              ? 'That is a lot of questions at once - give me a moment and try again.'
              : "I could not reach my brain just then. Try again in a moment, or email us and a person will pick it up.",
        },
      ]);
    },
  });

  const [suggestions, setSuggestions] = React.useState<string[]>([]);

  // Follow the transcript as it grows, including while the typing indicator is
  // the last thing in it.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles, send.isPending, handoff]);

  React.useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!config?.available) return null;

  const ask = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || send.isPending) return;

    setBubbles((current) => [...current, { id: nextId(), role: 'user', content: trimmed }]);
    setDraft('');
    setSuggestions([]);
    send.mutate(trimmed);
  };

  return (
    <>
      <LauncherButton isOpen={isOpen} onToggle={() => setIsOpen((open) => !open)} />

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            role="dialog"
            aria-label="Bazaar AI assistant"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.2 } }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            className={cn(
              // Phase 11: the panel and its launcher both clear the mobile
              // bottom navigation, which owns the lowest 56px plus the home
              // indicator below `lg`.
              'fixed right-4 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col lg:bottom-24',
              'max-h-[min(34rem,calc(100dvh-13rem))] overflow-hidden rounded-xl border border-border lg:max-h-[min(34rem,calc(100dvh-8rem))]',
              'bg-popover text-popover-foreground shadow-float',
            )}
          >
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold leading-tight">Bazaar AI</p>
                <p className="truncate text-xs text-muted-foreground">
                  {send.isPending ? 'Typing…' : 'Usually replies instantly'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setIsOpen(false)}
                aria-label="Close the assistant"
              >
                <X className="size-4" />
              </Button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <AssistantBubble>{config.greeting}</AssistantBubble>

              {bubbles.map((bubble) => (
                <MessageBubble key={bubble.id} bubble={bubble} />
              ))}

              {send.isPending ? <TypingIndicator /> : null}

              {handoff ? (
                <HandoffForm
                  draft={handoff}
                  onDone={(message) => {
                    setHandoff(null);
                    setBubbles((current) => [
                      ...current,
                      { id: nextId(), role: 'assistant', content: message },
                    ]);
                  }}
                />
              ) : null}
            </div>

            <QuickActions
              actions={
                suggestions.length > 0
                  ? suggestions.map((prompt, index) => ({
                      id: `suggestion-${index}`,
                      label: prompt,
                      prompt,
                    }))
                  : bubbles.length === 0
                    ? [...config.quickActions]
                    : []
              }
              disabled={send.isPending}
              onPick={ask}
            />

            <form
              className="flex items-center gap-2 border-t border-border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                ask(draft);
              }}
            >
              <Input
                ref={inputRef}
                value={draft}
                maxLength={AI_CHAT_MAX_MESSAGE}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={user ? `Ask anything, ${user.fullName.split(' ')[0]}` : 'Ask anything…'}
                aria-label="Message"
                className="h-9"
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0"
                disabled={send.isPending || draft.trim().length === 0}
                aria-label="Send"
              >
                {send.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function LauncherButton({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Close the Bazaar AI assistant' : 'Open the Bazaar AI assistant'}
      className={cn(
        'fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex size-14 items-center justify-center rounded-full lg:bottom-6',
        'bg-primary text-primary-foreground shadow-float',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isOpen ? 'close' : 'open'}
          initial={{ opacity: 0, rotate: -45, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 45, scale: 0.6 }}
          transition={{ duration: 0.18 }}
        >
          {isOpen ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function MessageBubble({ bubble }: { bubble: Bubble }) {
  if (bubble.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
        className="flex justify-end"
      >
        <p className="max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          {bubble.content}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-2">
      <AssistantBubble isError={bubble.isError}>{bubble.content}</AssistantBubble>

      {bubble.orders?.map((order) => <OrderCard key={order.id} order={order} />)}
      {bubble.products?.map((product) => (
        <ProductChip key={product.id} product={product} />
      ))}
    </div>
  );
}

function AssistantBubble({
  children,
  isError,
}: {
  children: React.ReactNode;
  isError?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
      className="flex justify-start"
    >
      <p
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-lg rounded-bl-sm px-3 py-2 text-sm',
          isError
            ? 'bg-warning/10 text-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {children}
      </p>
    </motion.div>
  );
}

/** Three dots, staggered. The only purpose is to say "something is happening". */
function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Bazaar AI is typing">
      <span className="flex items-center gap-1 rounded-lg rounded-bl-sm bg-muted px-3 py-3">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="size-1.5 rounded-full bg-muted-foreground"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: index * 0.15 }}
          />
        ))}
      </span>
    </div>
  );
}

function ProductChip({ product }: { product: ChatProductRef }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
    >
      <Link
        href={`/products/${product.slug}`}
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/50"
      >
        <span className="relative size-11 shrink-0 overflow-hidden rounded-md bg-muted">
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt="" fill sizes="44px" className="object-cover" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{product.name}</span>
          <span className="numeric block text-xs text-muted-foreground">
            {formatPrice(product.price, product.currency === 'USD' ? 'USD' : 'NPR')}
          </span>
        </span>
      </Link>
    </motion.div>
  );
}

function OrderCard({ order }: { order: ChatOrderRef }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
    >
      <Link
        href={`/orders/${order.id}`}
        className="block rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="numeric text-sm font-medium">{order.orderNumber}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
            {order.status.toLowerCase().replaceAll('_', ' ')}
          </span>
        </span>
        <span className="numeric mt-1 block text-xs text-muted-foreground">
          {formatPrice(order.total)}
          {order.trackingNumber ? ` · ${order.trackingNumber}` : ''}
        </span>
      </Link>
    </motion.div>
  );
}

function QuickActions({
  actions,
  disabled,
  onPick,
}: {
  actions: ReadonlyArray<{ id: string; label: string; prompt: string }>;
  disabled: boolean;
  onPick: (prompt: string) => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(action.prompt)}
          className={cn(
            'rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground',
            'transition-colors hover:border-primary/50 hover:text-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The guest half of a handover.
 *
 * A signed-in shopper never sees this - the server already filed the ticket
 * against their account. A guest has to leave an address, or "a human will get
 * back to you" is a promise nobody can keep.
 */
function HandoffForm({
  draft,
  onDone,
}: {
  draft: HandoffDraft;
  onDone: (message: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const file = useMutation({
    mutationFn: () =>
      requestHumanHandoff({
        name,
        email,
        subject: draft.subject,
        message: draft.summary,
      }),
    onSuccess: () =>
      onDone(
        'Thanks - a person from the Bazaar team has this now and will email you back.',
      ),
    onError: (cause: unknown) =>
      setError(
        cause instanceof ApiError ? cause.message : 'Could not send that. Try again?',
      ),
  });

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2 rounded-lg border border-dashed border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        file.mutate();
      }}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <UserRound className="size-3.5" aria-hidden />
        Pass this to a person
      </p>
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        className="h-8 text-sm"
        required
      />
      <Input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Your email"
        aria-label="Your email"
        className="h-8 text-sm"
        required
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" className="w-full" disabled={file.isPending}>
        {file.isPending ? <Loader2 className="size-3.5 animate-spin" /> : 'Send to support'}
      </Button>
    </motion.form>
  );
}
