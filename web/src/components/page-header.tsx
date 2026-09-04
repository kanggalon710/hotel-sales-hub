import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Page header.
 *
 * On a phone this is one compact row: a 20px title with the actions beside it.
 * The description is prose that helps on a wide screen and only costs vertical
 * space on a small one, so it appears from 640px up. Nothing here should push
 * the actual content below the fold.
 */
export function PageHeader({
  title,
  count,
  description,
  actions,
  meta,
  eyebrow,
  className,
}: {
  title: string;
  /** Row count, shown beside the title so it never costs its own line. */
  count?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 sm:items-end sm:gap-6', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="t-label mb-1.5">{eyebrow}</p> : null}
        <div className="flex items-baseline gap-2.5">
          <h1 className="t-title sm:t-display">{title}</h1>
          {count != null ? <span className="tnum t-meta shrink-0">{count}</span> : null}
        </div>
        {description ? <p className="t-body mt-2 hidden max-w-2xl text-ink-2 sm:block">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Kerangka halaman: satu jarak tepi per titik henti, dan konten rata kiri.
 *
 *   telepon 16px · tablet 24px · desktop 32px
 *
 * Rata kiri, bukan di tengah. Sebelumnya kerangka ini memakai `mx-auto`, dan
 * tiap halaman memilih batas lebarnya sendiri: ada tujuh nilai berbeda di
 * seluruh aplikasi. Akibatnya isi halaman bergeser kiri dan kanan setiap kali
 * orang berpindah menu, karena sisa ruangnya dibagi dua. Dengan rata kiri,
 * tepi kiri setiap halaman berada di titik yang sama persis, dan yang berbeda
 * hanya di mana ia berakhir.
 *
 * Hanya ada dua lebar baca. `narrow` untuk halaman yang isinya formulir dan
 * teks, karena baris yang terlalu panjang melelahkan; bawaannya untuk tabel
 * dan papan, yang justru butuh ruang.
 */
export function PageShell({
  children,
  className,
  narrow,
  wide,
}: {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'w-full space-y-4 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8',
        wide ? 'max-w-none' : narrow ? 'max-w-[1120px]' : 'max-w-[1440px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
