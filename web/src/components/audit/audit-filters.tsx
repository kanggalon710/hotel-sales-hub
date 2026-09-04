'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input, Select } from '@/components/ui/field';
import { cn } from '@/lib/utils';

export function AuditFilters({
  categories,
  current,
  total,
}: {
  categories: { key: string; label: string }[];
  current: { q: string; category: string; days: number };
  total: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(current.q);
  const [pending, start] = useTransition();

  function push(next: Partial<typeof current>) {
    const merged = { ...current, q, ...next };
    const sp = new URLSearchParams();
    if (merged.q) sp.set('q', merged.q);
    if (merged.category) sp.set('category', merged.category);
    if (merged.days !== 30) sp.set('days', String(merged.days));
    start(() => router.replace(`/audit${sp.size ? `?${sp}` : ''}`, { scroll: false }));
  }

  useEffect(() => {
    if (q === current.q) return;
    const t = setTimeout(() => push({ q }), 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', pending && 'opacity-70')}>
      <div className="relative min-w-[14rem] flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search summary, actor, or action" aria-label="Search audit log" className="pl-9" />
      </div>
      <Select value={current.category} onChange={(e) => push({ category: e.target.value })} aria-label="Category" className="w-auto min-w-[12rem]">
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </Select>
      <Select value={String(current.days)} onChange={(e) => push({ days: Number(e.target.value) })} aria-label="Period" className="w-auto">
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
      </Select>
      <span className="t-meta tnum ml-auto">{total} entr{total === 1 ? 'y' : 'ies'}</span>
    </div>
  );
}
