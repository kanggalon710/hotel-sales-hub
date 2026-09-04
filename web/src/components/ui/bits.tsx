import * as React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-[11px]', lg: 'size-10 text-[13px]' };
  const hue = Array.from(name).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', sizes[size], className)}
      style={{
        background: `color-mix(in oklch, oklch(0.62 0.12 ${hue}) 18%, var(--surface-2))`,
        color: `oklch(0.42 0.12 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function PersonChip({ name, meta }: { name: string | null | undefined; meta?: string }) {
  if (!name) return <span className="t-small text-ink-3">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar name={name} size="xs" />
      <span className="t-small min-w-0 truncate text-ink-2">{name}</span>
      {meta ? <span className="t-meta shrink-0">{meta}</span> : null}
    </span>
  );
}

/**
 * Empat kartu terpisah dengan jarak di antaranya, mengikuti rujukan Nexus CRM.
 *
 * Sebelumnya keempatnya menyatu dalam satu bilah yang dibelah garis rambut.
 * Bentuk kartu terpisah membuat tiap angka berdiri sebagai satu objek, dan
 * itulah yang membuatnya terbaca sekali pandang pada layar lebar.
 */
export function MetricStrip({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        'grid grid-cols-2 gap-3',
        'sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] sm:gap-4',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  sub,
  delta,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number | null;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary';
  href?: string;
}) {
  const toneText: Record<string, string> = {
    neutral: 'text-ink',
    success: 'text-success-ink',
    warning: 'text-warning-ink',
    danger: 'text-danger-ink',
    primary: 'text-primary-ink',
  };
  const Wrapper: React.ElementType = href ? 'a' : 'div';
  return (
    <Wrapper
      href={href}
      className={cn(
        'block rounded-md border border-border bg-surface px-4 py-4 shadow-e1 sm:px-5',
        href && 'focus-ring cursor-pointer transition-colors hover:bg-surface-inset',
      )}
    >
      {/* Dua baris disediakan untuk label, supaya metrik yang namanya membungkus
          tidak mendorong angkanya turun lebih rendah daripada tetangganya. */}
      <p className="t-label min-h-[2lh]">{label}</p>
      <p className={cn('tnum mt-1.5 text-[21px] font-semibold leading-none tracking-[-0.02em] sm:text-[26px]', toneText[tone])}>
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {sub ? <span className="t-meta">{sub}</span> : null}
        {delta != null ? (
          <span className={cn('tnum inline-flex items-center gap-0.5 text-[12px] font-medium', delta > 0 ? 'text-success-ink' : delta < 0 ? 'text-danger-ink' : 'text-ink-3')}>
            {delta > 0 ? <ArrowUpRight aria-hidden className="size-3" /> : delta < 0 ? <ArrowDownRight aria-hidden className="size-3" /> : null}
            {delta > 0 ? '+' : ''}{delta}%
          </span>
        ) : null}
      </div>
    </Wrapper>
  );
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="t-heading">{children}</h2>
      {action}
    </div>
  );
}

export function Ref({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[12px] tracking-tight text-ink-2', className)}>{children}</span>;
}

export function KeyValue({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="t-label">{i.label}</dt>
          <dd className="t-small mt-1 truncate text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ value, max, tone = 'primary', label }: { value: number; max: number; tone?: 'primary' | 'accent' | 'success' | 'warning' | 'danger'; label?: string }) {
  const width = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  const bg: Record<string, string> = { primary: 'bg-primary', accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' };
  return (
    <div role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', bg[tone])} style={{ width: `${width}%` }} />
    </div>
  );
}
