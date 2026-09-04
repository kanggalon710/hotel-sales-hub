'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Avatar } from '@/components/ui/bits';
import { Select } from '@/components/ui/field';
import { cn, formatMoney, formatStayDate, relativeTime } from '@/lib/utils';
import type { LeadRow } from '@/server/queries/leads';
import { COLOUR_DOT, type StageColour } from '@/lib/pipeline';

export type BoardColumn = {
  key: string;
  label: string;
  probability: number;
  /** Configured in settings; tints the column header dot. */
  colour: StageColour;
  /** What the stage means, shown when the column is empty. */
  meaning: string;
  leads: LeadRow[];
  value: number;
};

/**
 * Kanban with two deliberate layouts:
 *   ≥ 768px  — horizontal columns (320px), each scrolling on its own; the page
 *              never scrolls sideways, the board does, with snap and edge controls.
 *   < 768px  — one stage at a time with a stage picker and prev/next. A phone
 *              is not a place to pan across nine columns.
 */
export function PipelineBoard({
  columns,
  locale,
  currency,
  showProperty,
  now,
}: {
  columns: BoardColumn[];
  locale: string;
  currency: string;
  showProperty: boolean;
  now: number;
}) {
  const firstWithLeads = columns.findIndex((c) => c.leads.length > 0);
  const [activeKey, setActiveKey] = useState(columns[Math.max(0, firstWithLeads)]?.key ?? columns[0]?.key);
  const activeIndex = Math.max(0, columns.findIndex((c) => c.key === activeKey));
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  function nudge(dir: -1 | 1) {
    scroller.current?.scrollBy({ left: dir * 336, behavior: 'smooth' });
  }


  const edgeButton =
    'focus-ring flex size-8 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface hover:bg-surface-2 disabled:cursor-default disabled:opacity-35';

  return (
    <>
      {/* ---------- phone: one stage at a time ---------- */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveKey(columns[Math.max(0, activeIndex - 1)].key)}
            disabled={activeIndex === 0}
            aria-label="Previous stage"
            className="focus-ring flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-strong bg-surface disabled:opacity-40"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <Select value={activeKey} onChange={(e) => setActiveKey(e.target.value)} aria-label="Stage">
              {columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} ({c.leads.length})
                </option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            onClick={() => setActiveKey(columns[Math.min(columns.length - 1, activeIndex + 1)].key)}
            disabled={activeIndex === columns.length - 1}
            aria-label="Next stage"
            className="focus-ring flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-strong bg-surface disabled:opacity-40"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>

        <ol className="mt-3 flex shrink-0 items-center gap-1" aria-hidden>
          {columns.map((c, i) => (
            <li key={c.key} className={cn('h-1 flex-1 rounded-full', i === activeIndex ? 'bg-ink' : c.leads.length ? 'bg-border-strong' : 'bg-border')} />
          ))}
        </ol>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <ColumnBody column={columns[activeIndex]} locale={locale} showProperty={showProperty} now={now} />
        </div>
      </div>

      {/* ---------- tablet / desktop: horizontal board ---------- */}
      <div className="hidden min-h-0 flex-1 md:flex md:flex-col">
        <div className="relative min-h-0 flex-1">
          <button type="button" onClick={() => nudge(-1)} disabled={!edges.left} aria-label="Scroll columns left" className={cn(edgeButton, 'absolute -left-1 top-1/2 z-20 -translate-y-1/2 shadow-e2', !edges.left && 'invisible')}>
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button type="button" onClick={() => nudge(1)} disabled={!edges.right} aria-label="Scroll columns right" className={cn(edgeButton, 'absolute -right-1 top-1/2 z-20 -translate-y-1/2 shadow-e2', !edges.right && 'invisible')}>
            <ChevronRight aria-hidden className="size-4" />
          </button>

          <div ref={scroller} className="scroll-x -mx-1 flex h-full gap-3 px-1">
            {columns.map((column) => (
              <section
                key={column.key}
                aria-label={`${column.label}, ${column.leads.length} leads`}
                className="flex h-full w-[286px] shrink-0 flex-col rounded-xl bg-lane"
              >
                <header className="flex shrink-0 items-baseline justify-between gap-2 px-3 pb-2 pt-2.5">
                  <h2 title={column.meaning} className="flex min-w-0 items-center gap-1.5 truncate text-[13px] font-semibold text-ink">
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', COLOUR_DOT[column.colour])} />
                    {column.label}
                    <span className="tnum ml-1.5 font-mono text-[11.5px] font-normal text-ink-3">{column.leads.length}</span>
                  </h2>
                  <span className="tnum shrink-0 font-mono text-[11.5px] text-ink-3">
                    {column.value > 0 ? formatMoney(column.value, currency, locale, { compact: true }) : '–'}
                  </span>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                  <ColumnBody column={column} locale={locale} showProperty={showProperty} now={now} />
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function ColumnBody({ column, locale, showProperty, now }: { column: BoardColumn; locale: string; showProperty: boolean; now: number }) {
  if (column.leads.length === 0) {
    return (
      <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 text-center">
        <p className="t-small font-medium text-ink-2">No leads here</p>
        {/* What the stage means, not what a lead needs to enter it. */}
        <p className="t-meta mt-1 max-w-[210px] text-balance">{column.meaning}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {column.leads.map((lead) => (
        <li key={lead.id}>
          <BoardCard lead={lead} locale={locale} showProperty={showProperty} now={now} />
        </li>
      ))}
    </ul>
  );
}

/** Reading order: guest → stay → value. Owner and at most one warning at the foot. */
function BoardCard({ lead, locale, showProperty, now }: { lead: LeadRow; locale: string; showProperty: boolean; now: number }) {
  const overdue = lead.nextFollowUpAt != null && lead.nextFollowUpAt < now;
  const slaBreach = !lead.firstRespondedAt && lead.slaDueAt != null && lead.slaDueAt < now;
  const warning = slaBreach
    ? `Reply ${relativeTime(lead.slaDueAt, now)}`
    : overdue
      ? `Follow-up ${relativeTime(lead.nextFollowUpAt, now)}`
      : null;

  return (
    <article className="group relative rounded-lg border border-border bg-surface px-3 py-2.5 shadow-e1 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-e2">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/leads/${lead.id}`} className="focus-ring min-w-0 rounded after:absolute after:inset-0">
          <span className="block truncate text-[13.5px] font-semibold leading-snug text-ink group-hover:text-primary-ink">{lead.guestName}</span>
        </Link>
        <span className="tnum shrink-0 font-mono text-[12.5px] font-medium text-ink">
          {lead.estimatedValue > 0 ? formatMoney(lead.estimatedValue, lead.currency, locale, { compact: true }) : '–'}
        </span>
      </div>

      <p className="mt-0.5 truncate text-[11.5px] leading-snug text-ink-3">
        {lead.checkIn ? `${formatStayDate(lead.checkIn, locale)} · ${lead.rooms ?? 1} rm` : 'No dates yet'}
        {showProperty ? ` · ${lead.propertyCode}` : ''}
      </p>

      {/*
        No progress rail here: the column the card sits in already states the
        stage, so repeating it inside the card was both redundant and the reason
        this row ran out of width. Owner plus one warning is what the card adds.
      */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {lead.ownerName ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={lead.ownerName} size="xs" />
            <span className="truncate text-[11.5px] text-ink-3">{lead.ownerName.split(' ')[0]}</span>
          </span>
        ) : (
          <span className="text-[11.5px] font-medium text-warning-ink">Unassigned</span>
        )}
        {warning ? (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-[10.5px] text-warning-ink">
            <Clock aria-hidden className="size-3" />
            {warning}
          </span>
        ) : null}
      </div>
    </article>
  );
}
