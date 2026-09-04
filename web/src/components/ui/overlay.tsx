'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useOverlay(open: boolean, onClose: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  const restoreTo = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const node = ref.current;
    // Focus the first control in the body; the close button is a last resort,
    // so opening a drawer does not spotlight the way out of it.
    const first =
      node?.querySelector<HTMLElement>('[data-autofocus]') ??
      node?.querySelector<HTMLElement>(FOCUSABLE.split(',').map((sel) => `[data-overlay-body] ${sel}`).join(',')) ??
      node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && idx <= 0) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && idx === items.length - 1) {
        e.preventDefault();
        items[0].focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

function Scrim({ onClose }: { onClose: () => void }) {
  return <div className="scrim-in absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onClose} aria-hidden />;
}

/**
 * Drawer: a side panel on tablet and up, a full-height sheet on phones.
 * Structure is fixed — header, scrolling body, sticky footer — so every
 * workflow feels like the same object.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}) {
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  const widths = { md: 'sm:max-w-[520px]', lg: 'sm:max-w-[720px]', xl: 'sm:max-w-[960px]' };
  return (
    <div className="fixed inset-0 z-1000 flex justify-end">
      <Scrim onClose={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={cn(
          'drawer-in relative flex h-full w-full flex-col bg-surface-3 shadow-e4',
          'sm:border-l sm:border-border',
          widths[width],
        )}
      >
        <header className="hairline-b flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="drawer-title" className="t-title truncate">{title}</h2>
            {description ? <p className="t-meta mt-1">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`} className="-mt-1 sm:-mr-2">
            <X aria-hidden className="size-4" />
          </Button>
        </header>
        <div data-overlay-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <footer className="hairline-t flex flex-wrap items-center justify-end gap-2 bg-surface px-5 py-3.5 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Modal: a focused decision. Centered on tablet and up; a bottom sheet on
 * phones, where a centered box is awkward to reach.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = 'neutral',
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: 'neutral' | 'danger';
  size?: 'md' | 'lg';
}) {
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-1000 flex items-end justify-center sm:items-center sm:p-6">
      <Scrim onClose={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'sheet-in sm:modal-in relative w-full rounded-t-2xl bg-surface-3 shadow-e4 sm:rounded-xl sm:border sm:border-border',
          size === 'lg' ? 'sm:max-w-[640px]' : 'sm:max-w-[460px]',
          'max-h-[92dvh] flex flex-col',
        )}
      >
        {/* Grab handle on phones */}
        <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border-strong sm:hidden" />
        <header className="px-6 pt-5 pb-3">
          {tone === 'danger' ? <span className="t-label mb-2 block text-danger-ink">Destructive action</span> : null}
          <h2 id="modal-title" className="t-title">{title}</h2>
          {description ? <p className="t-small mt-1.5 text-ink-2">{description}</p> : null}
        </header>
        {children ? <div data-overlay-body className="min-h-0 flex-1 overflow-y-auto px-6 py-2">{children}</div> : null}
        <footer className="flex flex-wrap items-center justify-end gap-2 px-6 pb-6 pt-4">
          {footer ?? <Button variant="secondary" onClick={onClose}>Close</Button>}
        </footer>
      </div>
    </div>
  );
}
