'use client';

import { AlertCircle } from 'lucide-react';

/** Form-level error banner. `role="alert"` announces it as soon as it renders. */
export function FormAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-danger-ink/35 bg-danger-soft px-3 py-2.5 text-[13px] leading-5 text-danger-ink"
    >
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
