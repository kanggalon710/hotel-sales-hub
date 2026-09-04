import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Surfaces come in two weights. `Panel` is a bounded white block for content
 * that needs an edge (tables, forms). `Section` is just a heading and
 * whitespace, for content that reads better without a box.
 */
export function Card({
  className,
  children,
  as: Tag = 'section',
  quiet,
}: {
  className?: string;
  children: React.ReactNode;
  as?: 'section' | 'div' | 'article' | 'aside';
  quiet?: boolean;
}) {
  return <Tag className={cn(quiet ? 'panel-quiet' : 'panel', className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        // Di telepon aksi turun ke bawah judul. Saat sebaris, tombol dengan
        // label panjang menyisakan kolom sempit untuk subjudul, sehingga
        // kalimatnya pecah jadi menara dua kata yang tidak terbaca.
        'flex flex-col items-start gap-2 px-5 pt-4 pb-3',
        'sm:flex-row sm:items-start sm:justify-between sm:gap-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 shrink-0 text-ink-3">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="t-heading truncate">{title}</h2>
          {subtitle ? <p className="t-meta mt-0.5 max-w-prose">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <footer className={cn('hairline-t flex items-center justify-end gap-2 px-5 py-3.5', className)}>
      {children}
    </footer>
  );
}

/** Section = heading + whitespace, no box. For page-level grouping. */
export function Section({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="t-heading">{title}</h2>
          {subtitle ? <p className="t-meta mt-0.5">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DataRow({
  label,
  value,
  mono,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2', className)}>
      <dt className="t-small shrink-0 text-ink-3">{label}</dt>
      <dd className={cn('t-small min-w-0 text-right text-ink', mono && 'font-mono text-[12.5px]')}>{value}</dd>
    </div>
  );
}
