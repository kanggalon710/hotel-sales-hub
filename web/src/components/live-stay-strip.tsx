import * as React from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepState = 'done' | 'current' | 'pending' | 'blocked';

export type StayStep = {
  key: 'inquiry' | 'availability' | 'quotation' | 'deposit' | 'booking';
  state: StepState;
  meta?: string | null;
  warning?: string | null;
};

const LABELS: Record<StayStep['key'], string> = {
  inquiry: 'Inquiry',
  availability: 'Availability',
  quotation: 'Quotation',
  deposit: 'Deposit',
  booking: 'Booking',
};

const STATE_LABEL: Record<StepState, string> = {
  done: 'completed',
  current: 'in progress',
  pending: 'not started',
  blocked: 'needs attention',
};

/**
 * Live Stay Strip — the commercial journey as one horizontal rail.
 *
 * A filled track runs up to the current step; each node carries its own state
 * as shape + text. The compact form is a single track with numbered nodes for
 * list rows, replacing the five-icon rail that read as decoration.
 */
export function LiveStayStrip({ steps, className, compact }: { steps: StayStep[]; className?: string; compact?: boolean }) {
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const currentIndex = steps.findIndex((s) => s.state === 'current' || s.state === 'blocked');
  const reach = currentIndex >= 0 ? currentIndex : doneCount;
  const fill = steps.length > 1 ? (reach / (steps.length - 1)) * 100 : 0;
  const blocked = steps.find((s) => s.state === 'blocked');

  if (compact) {
    const active = steps[currentIndex] ?? steps[Math.min(doneCount, steps.length - 1)];
    return (
      <div className={cn('flex min-w-0 items-center gap-2', className)} aria-label="Stay progress">
        <div className="relative h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2 sm:w-16">
          <div
            aria-hidden
            className={cn('absolute inset-y-0 left-0 rounded-full', blocked ? 'bg-danger' : 'bg-success')}
            style={{ width: `${Math.max(fill, doneCount ? 8 : 0)}%` }}
          />
        </div>
        {/* Tight rows get the label only; the full state stays in the title and
            in the screen-reader text on the full strip. */}
        <span
          title={blocked ? blocked.warning ?? undefined : active ? `${LABELS[active.key]}, ${active.meta ?? STATE_LABEL[active.state]}` : undefined}
          className={cn('t-meta min-w-0 truncate', blocked && 'text-danger-ink')}
        >
          {blocked ? blocked.warning ?? `${LABELS[blocked.key]} needs attention` : active ? LABELS[active.key] : '–'}
        </span>
      </div>
    );
  }

  return (
    <ol className={cn('relative flex w-full items-start', className)} aria-label="Stay progress">
      {/* Track */}
      <span aria-hidden className="absolute left-[10%] right-[10%] top-[11px] h-0.5 bg-border" />
      <span
        aria-hidden
        className={cn('absolute left-[10%] top-[11px] h-0.5 transition-[width] duration-500', blocked ? 'bg-danger' : 'bg-success')}
        style={{ width: `${fill * 0.8}%` }}
      />

      {steps.map((step) => {
        const isCurrent = step.state === 'current';
        const isBlocked = step.state === 'blocked';
        const isDone = step.state === 'done';
        return (
          <li
            key={step.key}
            aria-current={isCurrent ? 'step' : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center text-center"
          >
            <span
              className={cn(
                'relative z-10 flex size-6 items-center justify-center rounded-full border-2 bg-surface',
                isDone && 'border-success bg-success text-white',
                isCurrent && 'border-primary text-primary',
                isBlocked && 'border-danger bg-danger text-white',
                step.state === 'pending' && 'border-border-strong text-ink-3',
              )}
            >
              {isDone ? (
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
              ) : isBlocked ? (
                <TriangleAlert aria-hidden className="size-3" strokeWidth={2.5} />
              ) : isCurrent ? (
                <span aria-hidden className="stay-pulse size-2 rounded-full bg-primary" />
              ) : (
                <span aria-hidden className="size-1.5 rounded-full bg-border-strong" />
              )}
            </span>
            <span
              className={cn(
                'mt-2 text-[12px] font-medium',
                isCurrent ? 'text-ink' : isBlocked ? 'text-danger-ink' : isDone ? 'text-ink-2' : 'text-ink-3',
              )}
            >
              {LABELS[step.key]}
              <span className="sr-only">, {STATE_LABEL[step.state]}</span>
            </span>
            <span
              title={step.warning ?? step.meta ?? undefined}
              className={cn(
                'mt-0.5 hidden max-w-full truncate px-1 font-mono text-[10.5px] sm:block',
                step.warning ? 'text-danger-ink' : 'text-ink-3',
              )}
            >
              {step.warning ?? step.meta ?? ' '}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
