'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Activity } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/utils';

type Conn = {
  id: string;
  provider: string;
  label: string;
  status: string;
  lastEventAt: number | null;
};

const RANK: Record<string, number> = { action_required: 3, disconnected: 3, degraded: 2, healthy: 1 };

/** Integration health is a permanent header affordance, not something buried in settings. */
export function ConnectionPulse({ connections, canManage }: { connections: Conn[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  if (connections.length === 0) return null;

  const worst = connections.reduce((a, b) => ((RANK[b.status] ?? 0) > (RANK[a.status] ?? 0) ? b : a));
  const needsAttention = (RANK[worst.status] ?? 0) > 1;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Integration health: ${worst.status.replace('_', ' ')}`}
      >
        <span className="relative">
          <Activity aria-hidden className="size-4" />
          <span
            aria-hidden
            className={`absolute -right-1 -top-1 size-2 rounded-full ${
              needsAttention ? 'bg-warning' : 'bg-success'
            } ${worst.status === 'healthy' ? '' : 'stay-pulse'}`}
          />
        </span>
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Integration health"
            className="rise-in absolute right-0 top-[calc(100%+6px)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface-3 shadow-e3"
          >
            <header className="border-b border-border px-3 py-2.5">
              <h2 className="text-[12px] font-semibold">Integration health</h2>
            </header>
            <ul className="divide-y divide-border">
              {connections.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-ink">{c.label}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink-3">
                      {c.lastEventAt ? `last event ${relativeTime(c.lastEventAt)}` : 'no events yet'}
                    </span>
                  </span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
            {canManage ? (
              <div className="border-t border-border p-2">
                <Link
                  href="/integrations/health"
                  onClick={() => setOpen(false)}
                  className="focus-ring block rounded-md px-2 py-1.5 text-[12px] font-medium text-primary-ink hover:bg-surface-2"
                >
                  Open integration health →
                </Link>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
