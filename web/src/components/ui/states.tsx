import * as React from 'react';
import { Inbox, Lock, RefreshCw, SearchX, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />;
}

/** Contextual skeleton that mirrors the shape of the table it replaces (PRD 15.2 rule 5). */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-label="Loading">
      <span className="sr-only">Loading data</span>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-8', c === 0 ? 'w-[26%]' : c === cols - 1 ? 'w-[12%]' : 'w-[18%]')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('panel space-y-3 p-5', className)} role="status" aria-label="Loading">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

type StateKind = 'empty' | 'filtered' | 'error' | 'denied';

const presets: Record<StateKind, { icon: React.ReactNode; tone: string }> = {
  empty: { icon: <Inbox aria-hidden className="size-5" />, tone: 'text-ink-3 bg-neutral-soft' },
  filtered: { icon: <SearchX aria-hidden className="size-5" />, tone: 'text-ink-3 bg-neutral-soft' },
  error: { icon: <TriangleAlert aria-hidden className="size-5" />, tone: 'text-danger-ink bg-danger-soft' },
  denied: { icon: <Lock aria-hidden className="size-5" />, tone: 'text-warning-ink bg-warning-soft' },
};

/**
 * The five list states the PRD requires (15.2 rule 6): empty, filtered-empty,
 * error, permission-denied — loading is handled by the skeletons above.
 */
export function ListState({
  kind = 'empty',
  title,
  description,
  action,
  className,
}: {
  kind?: StateKind;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const p = presets[kind];
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center', className)}
      role={kind === 'error' ? 'alert' : undefined}
    >
      <span className={cn('flex size-11 items-center justify-center rounded-full', p.tone)}>{p.icon}</span>
      <div className="max-w-sm space-y-1.5">
        <p className="t-heading">{title}</p>
        {description ? <p className="t-small text-ink-2">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PermissionDenied({ what = 'this data' }: { what?: string }) {
  return (
    <ListState
      kind="denied"
      title="You do not have access"
      description={`Your role does not include permission to view ${what}. Ask an administrator if you need it.`}
    />
  );
}

export function InlineError({ message, retry }: { message: string; retry?: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-md border border-danger-ink/30 bg-danger-soft px-3 py-2 text-[13px] text-danger-ink"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {retry ?? null}
    </div>
  );
}

export function RefreshHint({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
      <RefreshCw aria-hidden className="size-3" />
      {label}
    </span>
  );
}
