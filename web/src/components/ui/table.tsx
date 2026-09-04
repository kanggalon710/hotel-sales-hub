import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function TableScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)} tabIndex={0} role="region" aria-label="Table, scrollable">
      {children}
    </div>
  );
}

/**
 * `columns` turns on a fixed layout with designed proportions. Without it the
 * browser sizes columns from content, which produces accidental widths: the
 * column carrying the least information can end up the widest on the screen.
 * Percentages must total 100.
 */
export function Table({
  className,
  children,
  columns,
}: {
  className?: string;
  children: React.ReactNode;
  columns?: string[];
}) {
  return (
    <table className={cn('w-full min-w-[720px] border-collapse text-left', columns && 'table-fixed', className)}>
      {columns ? (
        <colgroup>
          {columns.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
      ) : null}
      {children}
    </table>
  );
}

/* Header cells are quiet: small caps in ink-3 on the plain surface, one hairline below. */
export function Th({
  className, children, numeric, sort, scope = 'col',
}: { className?: string; children: React.ReactNode; numeric?: boolean; sort?: 'ascending' | 'descending' | 'none'; scope?: 'col' | 'row' }) {
  return (
    <th
      scope={scope}
      aria-sort={sort}
      className={cn(
        't-label sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface px-4 py-2.5 font-medium',
        numeric && 'whitespace-nowrap text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, numeric, colSpan }: { className?: string; children: React.ReactNode; numeric?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('t-small border-b border-border px-5 py-3 align-middle text-ink-2', numeric && 'tnum whitespace-nowrap text-right', className)}>
      {children}
    </td>
  );
}

export function Tr({ className, children, interactive }: { className?: string; children: React.ReactNode; interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'last:[&>td]:border-b-0',
        // `relative` lets RowLink stretch its hit area over the whole row.
        interactive && 'group relative cursor-pointer transition-colors duration-150 hover:bg-surface-inset',
        className,
      )}
    >
      {children}
    </tr>
  );
}

/**
 * The primary link of an interactive row. It looks like a text link but its hit
 * area covers the entire row, so a tap does not have to land on 19px of text.
 * Any other interactive element in the row needs `relative z-10` to stay above it.
 */
export function RowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'focus-ring rounded font-medium text-ink after:absolute after:inset-0 group-hover:text-primary-ink',
        className,
      )}
    >
      {children}
    </Link>
  );
}
