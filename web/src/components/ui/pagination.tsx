import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Penomoran halaman untuk daftar yang panjang.
 *
 * Sebelum ini daftar prospek dipotong pada 120 baris tanpa memberi tanda apa
 * pun, sehingga prospek ke-121 dan seterusnya hilang diam-diam. Yang paling
 * penting di sini bukan tombolnya, melainkan kalimat jumlahnya: ia
 * memberitahu bahwa masih ada sisa.
 */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  label = 'baris',
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // Jendela sempit di sekitar halaman sekarang, dengan halaman pertama dan
  // terakhir selalu terjangkau.
  const window = new Set<number>([1, pages, page, page - 1, page + 1]);
  const numbers = [...window].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  return (
    <nav
      aria-label="Penomoran halaman"
      className="hairline-t flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="t-meta tnum">
        Menampilkan {first}–{last} dari {total} {label}
      </p>

      <div className="flex items-center gap-1">
        <PageLink href={hrefFor(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
          <ChevronLeft aria-hidden className="size-4" />
        </PageLink>

        {numbers.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - numbers[i - 1] > 1 ? <span className="px-1 text-[12px] text-ink-3">…</span> : null}
            <PageLink href={hrefFor(n)} current={n === page}>
              <span className="tnum">{n}</span>
            </PageLink>
          </span>
        ))}

        <PageLink href={hrefFor(page + 1)} disabled={page >= pages} aria-label="Halaman berikutnya">
          <ChevronRight aria-hidden className="size-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  children,
  current,
  disabled,
  'aria-label': ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const shared = 'focus-ring flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 text-[13px] transition-colors duration-150';

  if (disabled) {
    return (
      <span aria-hidden className={cn(shared, 'cursor-not-allowed text-ink-3 opacity-45')}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={current ? 'page' : undefined}
      className={cn(
        shared,
        current
          ? 'bg-surface font-medium text-ink ring-1 ring-border-strong'
          : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </Link>
  );
}
