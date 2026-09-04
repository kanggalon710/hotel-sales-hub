'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, CircleAlert, Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/utils';

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: string;
  createdAt: number;
};

const ICONS: Record<string, React.ReactNode> = {
  info: <Info aria-hidden className="size-3.5 text-primary-ink" />,
  warning: <TriangleAlert aria-hidden className="size-3.5 text-warning-ink" />,
  action_required: <ShieldAlert aria-hidden className="size-3.5 text-danger-ink" />,
  critical: <CircleAlert aria-hidden className="size-3.5 text-danger-ink" />,
};

export function NotificationsMenu({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const count = items.length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications, none unread'}
      >
        <span className="relative">
          <Bell aria-hidden className="size-4" />
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-4 text-white"
            >
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </span>
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Notifications"
            className="rise-in absolute right-0 top-[calc(100%+6px)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface-3 shadow-e3"
          >
            <header className="border-b border-border px-3 py-2.5">
              <h2 className="text-[12px] font-semibold">Notifications</h2>
            </header>
            {count === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-ink-3">You are all caught up.</p>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto">
                {items.map((n) => {
                  const inner = (
                    <span className="flex gap-2.5 px-3 py-2.5">
                      <span className="mt-0.5 shrink-0">{ICONS[n.severity] ?? ICONS.info}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-ink">{n.title}</span>
                        {n.body ? <span className="mt-0.5 block text-[11px] leading-4 text-ink-2">{n.body}</span> : null}
                        <span className="mt-1 block font-mono text-[10px] text-ink-3">{relativeTime(n.createdAt)}</span>
                      </span>
                    </span>
                  );
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link href={n.link} onClick={() => setOpen(false)} className="focus-ring block hover:bg-surface-2">
                          {inner}
                        </Link>
                      ) : (
                        <div>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
