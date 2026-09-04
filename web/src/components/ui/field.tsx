import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-md border border-border-strong bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-ink-3 focus:border-primary focus:outline-none focus:shadow-[0_0_0_3px_var(--primary-soft)] ' +
  'disabled:cursor-not-allowed disabled:bg-surface-inset disabled:opacity-60 ' +
  'read-only:bg-surface-inset read-only:text-ink-2 aria-invalid:border-danger';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="t-small flex items-center gap-1 font-medium text-ink">
        {label}
        {required ? (
          <>
            <span className="text-danger" aria-hidden>*</span>
            <span className="sr-only">(required)</span>
          </>
        ) : null}
      </label>
      {children}
      {hint && !error ? <p className="t-meta">{hint}</p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-[12px] leading-4 text-danger-ink">
          <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(control, 'resize-y py-2.5 leading-relaxed', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(control, 'h-10 cursor-pointer appearance-none pr-9', className)} {...props}>
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  },
);

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; hint?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 py-1.5', className)}>
      <input
        type="checkbox"
        className="focus-ring mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--primary)]"
        {...props}
      />
      <span className="min-w-0">
        <span className="t-small block text-ink">{label}</span>
        {hint ? <span className="t-meta block">{hint}</span> : null}
      </span>
    </label>
  );
}

export function ErrorSummary({ errors, className }: { errors: string[]; className?: string }) {
  if (!errors.length) return null;
  return (
    <div role="alert" className={cn('rounded-md border border-danger/30 bg-danger-soft px-3.5 py-3 text-[13px] text-danger-ink', className)}>
      <p className="flex items-center gap-1.5 font-medium">
        <AlertCircle aria-hidden className="size-4" />
        {errors.length === 1 ? 'This needs attention' : `${errors.length} things need attention`}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] leading-5">
        {errors.map((e) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}
