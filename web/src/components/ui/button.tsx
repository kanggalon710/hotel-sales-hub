import * as React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'link';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

/*
 * One primary per view. Secondary is the workhorse: a white button with a
 * hairline, which is what keeps a busy screen from turning blue.
 */
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active border border-transparent shadow-e1',
  secondary: 'bg-surface text-ink border border-border-strong hover:bg-surface-2 active:bg-surface-inset',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink',
  subtle: 'bg-primary-soft text-primary-ink border border-transparent hover:bg-primary/15',
  danger: 'bg-danger text-white border border-transparent hover:brightness-95 active:brightness-90',
  link: 'bg-transparent text-primary-ink border border-transparent underline-offset-4 hover:underline px-0',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-md',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
  icon: 'size-9 rounded-md',
  'icon-sm': 'size-8 rounded-md',
};

const base =
  'focus-ring inline-flex cursor-pointer select-none items-center justify-center font-medium whitespace-nowrap ' +
  'transition-[background-color,border-color,color,box-shadow,filter] duration-150 ease-out touch-manipulation';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, icon, children, disabled, ...props },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(base, 'disabled:cursor-not-allowed disabled:opacity-45', variants[variant], sizes[size], className)}
      {...props}
    >
      {/* `icon` is the leading glyph for labelled buttons; icon-only buttons pass
          the glyph as children, so both are rendered. */}
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {loading && (size === 'icon' || size === 'icon-sm') ? null : children}
    </button>
  );
});

export function LinkButton({
  href,
  className,
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
