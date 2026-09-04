'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, BarChart3, BedDouble, CalendarCheck, Contact, FileText, HeartHandshake, Kanban, LayoutGrid, Menu, Plug, Settings, ShieldCheck, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavGroup, NavIcon } from './nav-config';
import { Button } from '@/components/ui/button';

const ICONS: Record<NavIcon, typeof LayoutGrid> = {
  'my-day': LayoutGrid, leads: Users, pipeline: Kanban, availability: BedDouble,
  quotations: FileText, approvals: ShieldCheck, reservations: CalendarCheck,
  guests: Contact, 'after-sales': HeartHandshake, reports: BarChart3,
  integrations: Plug, settings: Settings, audit: Activity,
};

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navigation is a plain list: group label, item, done. Active state is a
 * filled pill with the label in ink — visible from across the room, not a
 * two-pixel bar you have to hunt for.
 */
function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="t-label px-3 pb-2">{group.label}</p>
          <ul className="space-y-px">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'focus-ring flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors duration-150 lg:h-9 lg:text-[13.5px]',
                      active
                        ? 'bg-sidebar-active font-medium text-ink shadow-e1'
                        : 'text-ink-2 hover:bg-white/55 hover:text-ink',
                    )}
                  >
                    <Icon aria-hidden className={cn('size-[18px] shrink-0', active ? 'text-ink' : 'text-ink-3')} strokeWidth={active ? 2.2 : 1.8} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-16 items-center gap-2.5 px-5">
      <span className="flex size-7 items-center justify-center rounded-md bg-ink text-ink-inverse">
        <BedDouble aria-hidden className="size-4" />
      </span>
      <span className="t-heading">Hotel Sales Hub</span>
    </div>
  );
}

export function DesktopSidebar({ groups, footer }: { groups: NavGroup[]; footer: React.ReactNode }) {
  return (
    <aside
      className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col self-start border-r border-sidebar-border lg:flex"
      style={{ backgroundImage: 'var(--sidebar)' }}
    >
      <Brand />
      <NavList groups={groups} />
      <div className="border-t border-sidebar-border p-3">{footer}</div>
    </aside>
  );
}

export function MobileNav({ groups, footer }: { groups: NavGroup[]; footer: React.ReactNode }) {
  // `open` can only become true from a click, so the portal target always
  // exists by the time we render it. No mounted guard is needed.
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Escape closes the drawer, matching every other overlay in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Any route change closes it, including back/forward. Adjusting state during
  // render is React's documented pattern for reacting to a changed input, and
  // avoids the extra commit an effect would cost.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <>
      <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
        <Menu aria-hidden className="size-5" />
      </Button>
      {/*
        Portalled to <body>. The top bar uses backdrop-blur, which makes it a
        containing block for fixed children: rendered in place, this drawer
        collapsed to the height of the bar and clipped most of the menu.
      */}
      {open
        ? createPortal(
        <div className="fixed inset-0 z-1000 flex lg:hidden">
          <div className="scrim-in absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative flex h-dvh w-[300px] max-w-[85vw] flex-col shadow-e4"
            style={{ backgroundImage: 'var(--sidebar)', animation: 'drawer-in 220ms var(--ease-out-quint) both' }}
          >
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close navigation">
                <X aria-hidden className="size-4" />
              </Button>
            </div>
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
            <div className="border-t border-sidebar-border p-3">{footer}</div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}
