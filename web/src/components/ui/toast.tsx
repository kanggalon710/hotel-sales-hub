'use client';

import * as React from 'react';
import { Check, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
type Toast = { id: string; tone: ToastTone; title: string; body?: string; action?: { label: string; onClick: () => void } };

const ToastContext = React.createContext<{
  push: (t: Omit<Toast, 'id'>) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const tones: Record<ToastTone, { cls: string; icon: React.ReactNode }> = {
  success: { cls: 'border-success-ink/35 bg-surface-3', icon: <Check aria-hidden className="size-4 text-success-ink" /> },
  error: { cls: 'border-danger-ink/40 bg-surface-3', icon: <XCircle aria-hidden className="size-4 text-danger-ink" /> },
  warning: { cls: 'border-warning-ink/40 bg-surface-3', icon: <TriangleAlert aria-hidden className="size-4 text-warning-ink" /> },
  info: { cls: 'border-border-strong bg-surface-3', icon: <Info aria-hidden className="size-4 text-primary-ink" /> },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);

  const remove = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [...prev, { ...t, id }]);
      // Auto-dismiss inside the 3-5s window; errors linger so they can be read.
      window.setTimeout(() => remove(id), t.tone === 'error' ? 8000 : 4500);
    },
    [remove],
  );

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Announced politely; a toast never steals focus. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-1100 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rise-in pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-e3',
              tones[t.tone].cls,
            )}
          >
            <span className="mt-0.5 shrink-0">{tones[t.tone].icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">{t.title}</p>
              {t.body ? <p className="mt-0.5 text-xs leading-5 text-ink-2">{t.body}</p> : null}
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.onClick();
                    remove(t.id);
                  }}
                  className="focus-ring mt-1.5 cursor-pointer rounded text-xs font-medium text-primary-ink hover:underline"
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Dismiss notification"
              className="focus-ring -mr-1 -mt-1 cursor-pointer rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
