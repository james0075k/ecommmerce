import type { ReactNode } from 'react';

/**
 * Shared shell for the three policy pages (Phase 12.10).
 *
 * There is no typography plugin in this workspace, so the prose rules live here
 * as one `[&_...]` block rather than being repeated in three files. The reading
 * measure is capped at 68 characters: policy text is the longest continuous
 * prose on the site and the only place where line length decides whether it
 * gets read at all.
 */
export function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  /** ISO date. Rendered as a real <time>, because "last updated" is the first thing a reader checks. */
  updated: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="container-bazaar py-10 md:py-16">
      <article className="mx-auto max-w-[68ch]">
        <header className="space-y-3 border-b border-border pb-6">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">{summary}</p>
          <p className="bz-label text-muted-foreground">
            Last updated{' '}
            <time dateTime={updated} className="numeric">
              {new Date(updated).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          </p>
        </header>

        <div
          className={[
            'mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground',
            '[&_h2]:font-display [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground',
            '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-foreground',
            '[&_p]:text-pretty',
            '[&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5',
            '[&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5',
            '[&_strong]:font-semibold [&_strong]:text-foreground',
            '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
            '[&_table]:w-full [&_table]:text-left [&_th]:py-2 [&_th]:font-semibold [&_th]:text-foreground [&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:align-top',
          ].join(' ')}
        >
          {children}
        </div>
      </article>
    </div>
  );
}

/**
 * The banner every one of these pages carries.
 *
 * These documents describe what the software actually does, which is the part
 * an engineer can write truthfully. They are not legal advice and have not been
 * reviewed by a Nepali lawyer, and shipping them as if they had would be the
 * dishonest kind of placeholder. The launch checklist in docs/LAUNCH.md blocks
 * on replacing this notice with a reviewed document.
 */
export function ReviewNotice() {
  return (
    <aside
      role="note"
      className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-caution"
    >
      <strong className="font-semibold">Before launch:</strong> this policy accurately
      describes how the software behaves, but it has not been reviewed by a lawyer
      qualified in Nepal. Have it reviewed against the Consumer Protection Act 2075 and
      the Individual Privacy Act 2075 before taking real orders.
    </aside>
  );
}
