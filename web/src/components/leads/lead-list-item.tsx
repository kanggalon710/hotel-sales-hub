import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/bits';
import type { LeadRow } from '@/server/queries/leads';
import { formatMoney, formatStayRange } from '@/lib/utils';

/**
 * Phone and tablet form of a lead row. Below the table breakpoint a grid stops
 * helping, so this is a single left-aligned block with the value on the right:
 * guest, then reference, then stay, then state. One alignment edge throughout.
 */
export function LeadListItem({
  lead,
  locale,
  showProperty,
  compact,
  now,
}: {
  lead: LeadRow;
  locale: string;
  showProperty?: boolean;
  /** Narrow rails, such as the My Day sidebar: guest, stay, value, state. */
  compact?: boolean;
  now: number;
}) {
  const overdue = lead.status === 'open' && lead.nextFollowUpAt != null && lead.nextFollowUpAt < now;
  const slaBreach = lead.status === 'open' && !lead.firstRespondedAt && lead.slaDueAt != null && lead.slaDueAt < now;
  const value = lead.estimatedValue > 0 ? formatMoney(lead.estimatedValue, lead.currency, locale, { compact: true }) : '–';

  if (compact) {
    return (
      <article className="group relative flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-inset sm:px-5">
        <Avatar name={lead.guestName} size="xs" className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <Link
              href={`/leads/${lead.id}`}
              className="focus-ring min-w-0 truncate rounded text-[13px] font-medium text-ink after:absolute after:inset-0 group-hover:text-primary-ink"
            >
              {lead.guestName}
            </Link>
            <span className="tnum shrink-0 font-mono text-[12.5px] text-ink">{value}</span>
          </div>
          <p className="t-meta mt-0.5 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{formatStayRange(lead.checkIn, lead.checkOut, locale)}</span>
            <span className="shrink-0">
              {slaBreach ? (
                <span className="text-danger-ink">Reply overdue</span>
              ) : overdue ? (
                <span className="text-warning-ink">Follow-up overdue</span>
              ) : (
                <StatusBadge status={lead.stage} variant="dot" />
              )}
            </span>
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-inset sm:px-5">
      <Avatar name={lead.guestName} size="sm" className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/leads/${lead.id}`}
            className="focus-ring min-w-0 truncate rounded text-[14px] font-semibold text-ink after:absolute after:inset-0 group-hover:text-primary-ink"
          >
            {lead.guestName}
          </Link>
          <span className="tnum shrink-0 font-mono text-[13px] font-medium text-ink">{value}</span>
        </div>

        <p className="t-meta mt-0.5 truncate">
          <span className="font-mono">{lead.code}</span>
          {showProperty ? ` · ${lead.propertyCode}` : ''}
          {lead.ownerName ? ` · ${lead.ownerName}` : ' · unassigned'}
          {lead.guestTier !== 'none' ? <span className="text-accent-ink"> · {lead.guestTier}</span> : null}
        </p>

        <p className="t-small mt-1 truncate text-ink-2">
          {formatStayRange(lead.checkIn, lead.checkOut, locale)}
          <span className="text-ink-3">
            {' · '}
            {lead.rooms ?? '–'} rm · {lead.adults ?? 0}A
            {lead.children ? ` ${lead.children}C` : ''}
          </span>
        </p>

        <div className="mt-1.5">
          {slaBreach ? (
            <span className="t-meta text-danger-ink">Reply overdue</span>
          ) : overdue ? (
            <span className="t-meta text-warning-ink">Follow-up overdue</span>
          ) : (
            <StatusBadge status={lead.stage} variant="dot" />
          )}
        </div>
      </div>

      <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
    </article>
  );
}
