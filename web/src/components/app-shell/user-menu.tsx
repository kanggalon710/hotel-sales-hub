'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/bits';
import { logoutAction } from '@/server/actions/auth';

export function UserMenu({
  name,
  email,
  roleSummary,
}: {
  name: string;
  email: string;
  roleSummary: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2"
      >
        <Avatar name={name} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-ink">{name}</span>
          <span className="block truncate text-[11px] text-ink-3">{roleSummary}</span>
        </span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-ink-3" />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="rise-in absolute bottom-[calc(100%+6px)] left-0 z-50 w-full min-w-[210px] overflow-hidden rounded-xl border border-border bg-surface-3 p-1 shadow-e3"
          >
            <p className="truncate px-2.5 py-2 font-mono text-[11px] text-ink-3">{email}</p>
            <Link
              href="/change-password"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="focus-ring flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <KeyRound aria-hidden className="size-4" />
              Change password
            </Link>
            <form action={logoutAction}>
              {/* Sign-out sits below a divider, away from ordinary navigation. */}
              <button
                type="submit"
                role="menuitem"
                className="focus-ring mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md border-t border-border px-2.5 py-2 pt-2.5 text-[13px] text-danger-ink hover:bg-danger-soft"
              >
                <LogOut aria-hidden className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
