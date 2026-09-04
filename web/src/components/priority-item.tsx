import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Priority = 'critical' | 'high' | 'normal';

const tones: Record<Priority, { rail: string; chip: string }> = {
  critical: { rail: 'bg-danger', chip: 'bg-danger-soft text-danger-ink' },
  high: { rail: 'bg-warning', chip: 'bg-warning-soft text-warning-ink' },
  normal: { rail: 'bg-primary', chip: 'bg-primary-soft text-primary-ink' },
};

/** One actionable row in the My Day priority queue. */
export function PriorityItem({
  priority,
  title,
  subtitle,
  due,
  href,
  actionLabel,
}: {
  priority: Priority;
  title: string;
  subtitle: string;
  due: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <li className="group relative">
      <Link
        href={href}
        className="focus-ring flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-inset sm:px-5"
      >
        {/* The group states the kind of urgency; the rail states its weight. */}
        <span aria-hidden className={cn('h-9 w-1 shrink-0 rounded-full', tones[priority].rail)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">{title}</span>
          <span className="t-meta mt-0.5 block truncate">{subtitle}</span>
        </span>
        <span className="hidden shrink-0 text-right sm:block">
          <span className="block font-mono text-[12px] text-ink-3">{due}</span>
          <span className="mt-0.5 block text-[12px] font-medium text-primary-ink">{actionLabel}</span>
        </span>
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary-ink"
        />
      </Link>
    </li>
  );
}
