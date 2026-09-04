'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Building2, Check, ChevronsUpDown, Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setCurrentPropertyAction } from '@/server/actions/auth';
import type { PropertyAccess } from '@/server/auth';

/**
 * Current Property is visible in the header on every page (PRD 8.2). "All permitted"
 * is only offered to users who actually hold more than one property.
 */
export function PropertySwitcher({
  properties,
  currentId,
  allowAll,
}: {
  properties: PropertyAccess[];
  currentId: string | null;
  allowAll: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const current = properties.find((p) => p.propertyId === currentId) ?? null;

  function choose(id: string) {
    setOpen(false);
    startTransition(async () => {
      await setCurrentPropertyAction(id);
      router.refresh();
    });
  }

  if (properties.length === 0) {
    return (
      <span className="rounded-md border border-warning-ink/35 bg-warning-soft px-2.5 py-1 text-[11px] text-warning-ink">
        No property access
      </span>
    );
  }

  const singleton = properties.length === 1;

  return (
    <div className="relative w-fit max-w-full">
      <button
        type="button"
        onClick={() => !singleton && setOpen((v) => !v)}
        aria-haspopup={singleton ? undefined : 'listbox'}
        aria-expanded={singleton ? undefined : open}
        disabled={singleton || pending}
        className={cn(
          'focus-ring flex h-10 w-full max-w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-left transition-colors',
          !singleton && 'cursor-pointer hover:border-border-strong',
          pending && 'opacity-60',
        )}
      >
        {current ? (
          <Building2 aria-hidden className="size-3.5 shrink-0 text-primary-ink" />
        ) : (
          <Globe2 aria-hidden className="size-3.5 shrink-0 text-accent-ink" />
        )}
        <span className="min-w-0">
          <span className="t-label block leading-3">Property</span>
          <span className="block max-w-[10rem] truncate text-[13px] font-medium leading-4 text-ink sm:max-w-[16rem]">
            {current ? current.propertyName : 'All permitted properties'}
          </span>
        </span>
        {!singleton ? <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-ink-3" /> : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <ul
            role="listbox"
            aria-label="Choose current property"
            className="rise-in absolute left-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-xl border border-border bg-surface-3 p-1.5 shadow-e3"
          >
            {allowAll ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!currentId}
                  onClick={() => choose('all')}
                  className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <Globe2 aria-hidden className="size-4 text-accent-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink">All permitted properties</span>
                    <span className="block text-[11px] text-ink-3">Across all {properties.length} properties</span>
                  </span>
                  {!currentId ? <Check aria-hidden className="size-4 text-primary-ink" /> : null}
                </button>
              </li>
            ) : null}
            {properties.map((p) => (
              <li key={p.propertyId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.propertyId === currentId}
                  onClick={() => choose(p.propertyId)}
                  className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <Building2 aria-hidden className="size-4 text-primary-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{p.propertyName}</span>
                    <span className="block text-[11px] text-ink-3">
                      <span className="font-mono">{p.propertyCode}</span> · {p.roleName}
                    </span>
                  </span>
                  {p.propertyId === currentId ? <Check aria-hidden className="size-4 text-primary-ink" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
