'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, BarChart3, BedDouble, CalendarCheck, Contact, FileText, HeartHandshake, Kanban,
  LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Plug, Settings, ShieldCheck, Users, X,
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
function NavList({
  groups,
  onNavigate,
  collapsed,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={cn('flex-1 space-y-6 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
      {groups.map((group) => (
        <div key={group.label}>
          {/* Saat menciut, label kelompok diganti garis: judul dua huruf lebih
              membingungkan daripada pemisah yang jujur. */}
          {collapsed
            ? <div aria-hidden className="mx-2 mb-2 h-px bg-sidebar-border" />
            : <p className="t-label px-3 pb-2 text-sidebar-label">{group.label}</p>}
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
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'focus-ring flex h-10 items-center rounded-lg text-[14px] transition-colors duration-150 lg:h-9 lg:text-[13.5px]',
                      collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                      active
                        ? 'bg-sidebar-active font-medium text-sidebar-ink'
                        : 'text-sidebar-ink-2 hover:bg-sidebar-hover hover:text-sidebar-ink',
                    )}
                  >
                    <Icon aria-hidden className={cn('size-[18px] shrink-0', active ? 'text-sidebar-ink' : 'text-sidebar-ink-3')} strokeWidth={active ? 2.2 : 1.8} />
                    <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
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

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn('flex h-16 items-center gap-2.5', collapsed ? 'justify-center px-2' : 'px-5')}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary">
        <BedDouble aria-hidden className="size-4" />
      </span>
      <span className={cn('t-heading text-sidebar-ink', collapsed && 'sr-only')}>Hotel Sales Hub</span>
    </div>
  );
}

/*
 * Atribut <html data-nav> adalah sumber kebenaran, dan React berlangganan
 * padanya — pola yang sama dengan tombol tema. Menyimpannya di state React lalu
 * membacanya di dalam effect akan memicu render berantai, dan React 19 memang
 * melarangnya.
 */
function subscribeNav(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav'] });
  return () => observer.disconnect();
}
const navSnapshot = () => document.documentElement.getAttribute('data-nav') === 'collapsed';
const navServerSnapshot = () => false;

/**
 * Sidebar menciut menjadi rel ikon, bukan menghilang sama sekali.
 *
 * Menyembunyikannya seluruhnya memang mengembalikan paling banyak ruang, tetapi
 * juga menghapus satu-satunya peta yang dimiliki orang atas aplikasi ini, dan
 * memaksa satu klik tambahan untuk setiap perpindahan. Rel selebar 64px
 * mengembalikan 176px sambil menjaga setiap tujuan tetap sekali klik.
 *
 * Pilihannya diingat peramban, karena melipat ulang sidebar pada setiap
 * perpindahan halaman lebih menjengkelkan daripada tidak bisa melipat sama
 * sekali. Nilainya dipasang sebelum cat pertama di layout akar, sehingga
 * lebarnya tidak berkedip saat halaman dimuat.
 */
export function DesktopSidebar({ groups, footer }: { groups: NavGroup[]; footer: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeNav, navSnapshot, navServerSnapshot);

  function toggle() {
    const next = !collapsed;
    if (next) document.documentElement.setAttribute('data-nav', 'collapsed');
    else document.documentElement.removeAttribute('data-nav');
    try {
      if (next) localStorage.setItem('crm-nav', 'collapsed');
      else localStorage.removeItem('crm-nav');
    } catch {
      /* penyimpanan diblokir: lipatan tetap berlaku untuk tampilan ini */
    }
  }

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col self-start border-r border-sidebar-border transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[64px]' : 'w-[240px]',
      )}
      style={{ background: 'var(--sidebar)' }}
    >
      <Brand collapsed={collapsed} />
      <NavList groups={groups} collapsed={collapsed} />

      <div data-sidebar-footer className={cn('border-t border-sidebar-border', collapsed ? 'p-2' : 'p-3')}>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={collapsed}
          title={collapsed ? 'Lebarkan navigasi' : 'Ciutkan navigasi'}
          className={cn(
            'focus-ring mb-1 flex h-9 w-full items-center rounded-lg text-[13px] text-sidebar-ink-2 transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
          )}
        >
          {collapsed
            ? <PanelLeftOpen aria-hidden className="size-[18px] shrink-0" />
            : <PanelLeftClose aria-hidden className="size-[18px] shrink-0" />}
          <span className={cn('truncate', collapsed && 'sr-only')}>Ciutkan navigasi</span>
        </button>
        {footer}
      </div>
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
            style={{ background: 'var(--sidebar)', animation: 'drawer-in 220ms var(--ease-out-quint) both' }}
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
