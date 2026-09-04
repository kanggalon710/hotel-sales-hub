'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { LEAD_STAGES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export type OwnerOption = { id: string; name: string };

type Values = { stage: string; status: string; owner: string; sort: string; overdue: boolean };

/**
 * Filters are URL state, so a filtered view is shareable and survives a refresh.
 *
 * Layout follows the space available rather than one compromise for both:
 *   phone   search + a single Filters button that opens a bottom sheet, so the
 *           list starts near the top instead of below three rows of selects
 *   ≥1024   the same controls inline, where there is room for them
 */
export function LeadFilterBar({
  owners,
  showOwnerFilter,
  total,
}: {
  owners: OwnerOption[];
  showOwnerFilter: boolean;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [sheetOpen, setSheetOpen] = useState(false);

  const values: Values = {
    stage: params.get('stage') ?? '',
    status: params.get('status') ?? 'open',
    owner: params.get('owner') ?? '',
    sort: params.get('sort') ?? 'recent',
    overdue: params.get('overdue') === '1',
  };

  function apply(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.replace(`/leads?${sp.toString()}`, { scroll: false }));
  }

  // Debounced search keeps typing responsive without a request per keystroke.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (search === current) return;
    const t = setTimeout(() => apply({ q: search || null }), 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeCount =
    (values.stage ? 1 : 0) +
    (values.owner ? 1 : 0) +
    (values.overdue ? 1 : 0) +
    (values.status !== 'open' ? 1 : 0);

  function clearAll() {
    setSearch('');
    setSheetOpen(false);
    startTransition(() => router.replace('/leads', { scroll: false }));
  }


  return (
    <div className={cn('space-y-2', pending && 'opacity-70 transition-opacity')}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest, code, phone"
            aria-label="Search leads"
            className="pl-9"
          />
        </div>

        {/* Phone and tablet: one button instead of a wall of selects. */}
        <Button
          className="shrink-0 lg:hidden"
          variant={activeCount ? 'subtle' : 'secondary'}
          onClick={() => setSheetOpen(true)}
          icon={<SlidersHorizontal aria-hidden className="size-4" />}
          aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
        >
          <span className="max-[420px]:sr-only">Filters</span>
          {activeCount ? <span className="tnum ml-0.5">({activeCount})</span> : null}
        </Button>
      </div>

      {/* Desktop: the same controls inline, where there is room. */}
      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        <Controls values={values} owners={owners} showOwnerFilter={showOwnerFilter} apply={apply} variant="inline" />
      </div>

      {/* The count lives beside the page title, so this row only appears when
          there is something to undo. */}
      {activeCount || search ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="t-meta tnum">
            {total} match{total === 1 ? '' : 'es'}
          </span>
          <span aria-hidden className="t-meta">·</span>
          <button
            type="button"
            onClick={clearAll}
            className="focus-ring tap inline-flex cursor-pointer items-center gap-1 rounded text-[12px] font-medium text-primary-ink hover:underline"
          >
            <X aria-hidden className="size-3" />
            Clear filters
          </button>
        </div>
      ) : null}

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter leads"
        description={`${total} lead${total === 1 ? '' : 's'} match right now.`}
        footer={
          <>
            <Button variant="ghost" onClick={clearAll}>Clear all</Button>
            <Button variant="primary" onClick={() => setSheetOpen(false)}>Show results</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Controls values={values} owners={owners} showOwnerFilter={showOwnerFilter} apply={apply} variant="sheet" />
        </div>
      </Modal>
    </div>
  );
}

/**
 * One definition of the controls, rendered two ways. The sheet shows visible
 * labels; the inline row relies on the chosen value plus an aria-label, which
 * is what a filter row on a wide screen actually needs.
 */
function Controls({
  values,
  owners,
  showOwnerFilter,
  apply,
  variant,
}: {
  values: Values;
  owners: OwnerOption[];
  showOwnerFilter: boolean;
  apply: (next: Record<string, string | null>) => void;
  variant: 'inline' | 'sheet';
}) {
  const sheet = variant === 'sheet';
  const id = (name: string) => `f-${variant}-${name}`;

  const wrap = (name: string, label: string, control: React.ReactNode) =>
    sheet ? (
      <Field key={name} label={label} htmlFor={id(name)}>
        {control}
      </Field>
    ) : (
      <div key={name}>{control}</div>
    );

  return (
    <>
      {wrap(
        'stage',
        'Stage',
        <Select
          id={id('stage')}
          value={values.stage}
          onChange={(e) => apply({ stage: e.target.value || null })}
          aria-label="Filter by stage"
          className={sheet ? undefined : 'w-auto min-w-[9.5rem]'}
        >
          <option value="">All stages</option>
          {LEAD_STAGES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </Select>,
      )}

      {showOwnerFilter
        ? wrap(
            'owner',
            'Owner',
            <Select
              id={id('owner')}
              value={values.owner}
              onChange={(e) => apply({ owner: e.target.value || null })}
              aria-label="Filter by owner"
              className={sheet ? undefined : 'w-auto min-w-[9rem]'}
            >
              <option value="">All owners</option>
              <option value="unassigned">Unassigned</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>,
          )
        : null}

      {wrap(
        'status',
        'Status',
        <Select
          id={id('status')}
          value={values.status}
          onChange={(e) => apply({ status: e.target.value })}
          aria-label="Filter by status"
          className={sheet ? undefined : 'w-auto min-w-[7.5rem]'}
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </Select>,
      )}

      {wrap(
        'sort',
        'Sort by',
        <Select
          id={id('sort')}
          value={values.sort}
          onChange={(e) => apply({ sort: e.target.value })}
          aria-label="Sort leads"
          className={sheet ? undefined : 'w-auto min-w-[9rem]'}
        >
          <option value="recent">Recently updated</option>
          <option value="value">Highest value</option>
          <option value="checkin">Arrival date</option>
          <option value="sla">SLA deadline</option>
        </Select>,
      )}

      <Button
        variant={values.overdue ? 'subtle' : 'ghost'}
        onClick={() => apply({ overdue: values.overdue ? null : '1' })}
        aria-pressed={values.overdue}
        className={sheet ? 'w-full justify-start' : undefined}
      >
        Overdue only
      </Button>
    </>
  );
}
