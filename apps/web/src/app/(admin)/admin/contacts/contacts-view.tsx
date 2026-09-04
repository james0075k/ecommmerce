'use client';

import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Phone,
  Reply,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ContactStatus } from '@bazaar/shared';
import type { AdminContactMessage } from '@bazaar/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { adminApi, adminKeys, formatDateTime, formatRelative, toQueryString } from '@/lib/admin';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  ALL: 'All',
  NEW: 'New',
  READ: 'Read',
  REPLIED: 'Replied',
};

const STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-sale/10 text-deal',
  READ: 'bg-accent text-accent-foreground',
  REPLIED: 'bg-success/10 text-ok',
};

/**
 * The contact queue.
 *
 * A master/detail split rather than a table: these are messages to be read, and
 * a row that truncates the one thing an operator needs to see is a row they
 * have to click anyway. Selecting a message marks it READ automatically -
 * having looked at something is not a separate decision worth a button.
 */
export function AdminContactsView() {
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState('ALL');
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [replyOpen, setReplyOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const query = toQueryString({
    page,
    limit: PAGE_SIZE,
    search: debounced || undefined,
    status: status === 'ALL' ? undefined : status,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: adminKeys.contacts.list({ query } as never),
    queryFn: () => adminApi.contacts(query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const { data: counts } = useQuery({
    queryKey: adminKeys.contacts.counts,
    queryFn: adminApi.contactCounts,
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  const selected = items.find((message) => message.id === selectedId) ?? items[0] ?? null;

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch<AdminContactMessage>(`/admin/contacts/${id}/status`, {
        method: 'PATCH',
        body: { status: ContactStatus.READ },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.contacts.all });
    },
  });

  // Opening a NEW message marks it read. Deliberately fire-and-forget: the
  // operator is already reading it, and a failed write should not interrupt
  // them - the next open will try again.
  React.useEffect(() => {
    if (selected?.status === ContactStatus.NEW && !markRead.isPending) {
      markRead.mutate(selected.id);
    }
  }, [selected?.id]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts
            ? `${counts.NEW ?? 0} new, ${counts.READ ?? 0} read, ${counts.REPLIED ?? 0} replied.`
            : 'Everything sent through the contact form.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email or subject"
            aria-label="Search messages"
            className="pl-8"
          />
        </div>

        <div
          role="group"
          aria-label="Filter by status"
          className="inline-flex gap-1 rounded-md border border-border bg-card p-1"
        >
          {['ALL', ContactStatus.NEW, ContactStatus.READ, ContactStatus.REPLIED].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              aria-pressed={status === value}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                status === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {STATUS_LABELS[value]}
              {value !== 'ALL' && counts?.[value] ? (
                <span className="ml-1 opacity-70">{counts[value]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {search ? (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="gap-1">
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {/* --- List ------------------------------------------------------- */}
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border bg-card shadow-card transition-opacity',
            isFetching && !isLoading && 'opacity-60',
          )}
        >
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }, (_, n) => (
                <Skeleton key={n} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Inbox className="mx-auto size-6 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-sm text-muted-foreground">Nothing in this filter.</p>
            </div>
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-border overflow-y-auto">
              {items.map((message) => (
                <li key={message.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(message.id)}
                    aria-current={selected?.id === message.id ? 'true' : undefined}
                    className={cn(
                      'w-full px-3 py-3 text-left transition-colors',
                      selected?.id === message.id ? 'bg-accent' : 'hover:bg-muted',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'truncate text-sm',
                          message.status === ContactStatus.NEW
                            ? 'font-semibold'
                            : 'font-medium text-muted-foreground',
                        )}
                      >
                        {message.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelative(message.createdAt)}
                      </span>
                    </div>

                    <p className="mt-0.5 truncate text-sm">{message.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {message.message}
                    </p>

                    <span
                      className={cn(
                        'mt-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                        STATUS_STYLES[message.status],
                      )}
                    >
                      {STATUS_LABELS[message.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {meta.page} / {meta.totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!meta.hasPrev}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!meta.hasNext}
                  onClick={() => setPage((current) => current + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* --- Detail ----------------------------------------------------- */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-card sm:p-6">
          {!selected ? (
            <div className="py-20 text-center">
              <MailOpen className="mx-auto size-7 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-sm text-muted-foreground">
                Pick a message to read it here.
              </p>
            </div>
          ) : (
            <article>
              <header className="border-b border-border pb-4">
                <h2 className="font-display text-lg font-semibold">{selected.subject}</h2>

                <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <div>
                    <dt className="sr-only">From</dt>
                    <dd className="font-medium text-foreground">{selected.name}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3.5" aria-hidden />
                    <dd>
                      <a href={`mailto:${selected.email}`} className="hover:underline">
                        {selected.email}
                      </a>
                    </dd>
                  </div>
                  {selected.phone ? (
                    <div className="flex items-center gap-1.5">
                      <Phone className="size-3.5" aria-hidden />
                      <dd className="numeric">
                        <a href={`tel:${selected.phone}`} className="hover:underline">
                          {selected.phone}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="sr-only">Received</dt>
                    <dd>{formatDateTime(selected.createdAt)}</dd>
                  </div>
                </dl>
              </header>

              <p className="my-5 text-sm leading-relaxed whitespace-pre-wrap">
                {selected.message}
              </p>

              {selected.repliedAt ? (
                <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-xs text-ok">
                  Replied {formatDateTime(selected.repliedAt)}
                  {selected.repliedByName ? ` by ${selected.repliedByName}` : ''}.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setReplyOpen(true)} className="gap-1.5">
                  <Reply className="size-4" aria-hidden />
                  {selected.repliedAt ? 'Reply again' : 'Reply'}
                </Button>

                <Button asChild variant="outline">
                  <a href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`}>
                    Open in mail client
                  </a>
                </Button>
              </div>
            </article>
          )}
        </div>
      </div>

      {selected ? (
        <ReplyDialog message={selected} open={replyOpen} onOpenChange={setReplyOpen} />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ReplyDialog({
  message,
  open,
  onOpenChange,
}: {
  message: AdminContactMessage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = React.useState(`Re: ${message.subject}`);
  const [body, setBody] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setSubject(`Re: ${message.subject}`);
      setBody('');
    }
  }, [open, message.id]);

  const send = useMutation({
    mutationFn: () =>
      apiFetch<AdminContactMessage>(`/admin/contacts/${message.id}/reply`, {
        method: 'POST',
        body: { subject, body },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.contacts.all });
      toast.success(`Replied to ${message.name}.`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The reply could not be sent.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Reply to {message.name}</DialogTitle>
          <DialogDescription>
            This goes to {message.email} and marks the message replied.
          </DialogDescription>
        </DialogHeader>

        <blockquote className="max-h-28 overflow-y-auto rounded-md border-l-2 border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {message.message}
        </blockquote>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reply-subject">Subject</Label>
            <Input
              id="reply-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reply-body">Your reply</Label>
            <Textarea
              id="reply-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              maxLength={5000}
              placeholder="Answer their question directly - they will read this as an email."
            />
            <p className="text-right text-xs text-muted-foreground">{body.length}/5000</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => send.mutate()}
            disabled={body.trim().length < 5 || send.isPending}
            className="gap-1.5"
          >
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Reply className="size-4" aria-hidden />
            )}
            Send reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
