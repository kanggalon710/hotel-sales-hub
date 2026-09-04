'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

const OPTIONS = [7, 30, 90, 365];

export function ReportPeriod({ days }: { days: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div
      role="group"
      aria-label="Reporting period"
      className={cn('flex rounded-md border border-border bg-surface p-0.5', pending && 'opacity-60')}
    >
      {OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={d === days}
          onClick={() => start(() => router.replace(`/reports?days=${d}`, { scroll: false }))}
          className={cn(
            // min-h-8 keeps each segment a legal touch target; the group stays on the header row.
            'focus-ring flex min-h-8 cursor-pointer items-center justify-center rounded px-2.5 text-[12px] font-medium transition-colors duration-150',
            d === days ? 'bg-primary-soft text-primary-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
          )}
        >
          {d === 365 ? '1y' : `${d}d`}
        </button>
      ))}
    </div>
  );
}
