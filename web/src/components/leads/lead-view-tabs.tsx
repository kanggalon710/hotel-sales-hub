import Link from 'next/link';
import { cn } from '@/lib/utils';

export type LeadView = 'all' | 'mine' | 'unassigned' | 'overdue';

export type ViewTab = { key: LeadView; label: string; count: number };

/**
 * Sudut pandang, bukan saringan tambahan.
 *
 * Saringan pada bilah di bawahnya menjawab "persempit yang mana"; tab ini
 * menjawab "kumpulan siapa yang sedang saya lihat". Jumlahnya ikut ditampilkan
 * karena tanpa itu tidak ada alasan untuk menekan tab yang kosong, dan penjual
 * jadi harus mencoba satu per satu.
 */
export function LeadViewTabs({
  tabs,
  active,
  hrefFor,
}: {
  tabs: ViewTab[];
  active: LeadView;
  hrefFor: (view: LeadView) => string;
}) {
  return (
    <nav aria-label="Sudut pandang prospek" className="scroll-x -mx-1 flex gap-1 px-1">
      {tabs.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'focus-ring flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[13px] transition-colors duration-150',
              current
                ? 'bg-surface font-medium text-ink shadow-e1 ring-1 ring-border'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                'tnum rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                current ? 'bg-primary-soft text-primary-ink' : 'bg-surface-2 text-ink-3',
              )}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
