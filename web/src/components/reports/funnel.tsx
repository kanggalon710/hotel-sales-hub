import { ArrowDown } from 'lucide-react';
import { cn, formatMoney, pct } from '@/lib/utils';

export type FunnelStep = { key: string; label: string; count: number; value: number };

/**
 * Conversion funnel rendered as an ordered list of labelled bars.
 *
 * The list *is* the accessible fallback: every stage shows its count, its share
 * of the top of funnel, and the step-to-step conversion as text, so nothing
 * depends on reading a shape or a colour.
 */
export function Funnel({
  steps,
  currency,
  locale,
}: {
  steps: FunnelStep[];
  currency: string;
  locale: string;
}) {
  const top = steps[0]?.count ?? 0;
  if (top === 0) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-ink-3">
        No leads in this period yet. The funnel appears once inquiries arrive.
      </p>
    );
  }

  // The largest single drop is worth pointing at rather than leaving to be spotted.
  let worstIndex = -1;
  let worstDrop = 0;
  steps.forEach((s, i) => {
    if (i === 0) return;
    const drop = steps[i - 1].count - s.count;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstIndex = i;
    }
  });

  return (
    <ol className="space-y-1 p-4">
      {steps.map((step, i) => {
        const share = pct(step.count, top);
        const prev = i > 0 ? steps[i - 1].count : null;
        const stepConversion = prev != null ? pct(step.count, prev) : null;
        const isWorst = i === worstIndex && worstDrop > 0;

        return (
          <li key={step.key}>
            {i > 0 ? (
              <p
                className={cn(
                  'flex items-center gap-1 py-0.5 pl-3 font-mono text-[10px]',
                  isWorst ? 'text-danger-ink' : 'text-ink-3',
                )}
              >
                <ArrowDown aria-hidden className="size-3" />
                {stepConversion}% continue
                <span className="text-ink-3">
                  ({prev! - step.count} dropped{isWorst ? ', largest drop' : ''})
                </span>
              </p>
            ) : null}

            <div className="group relative overflow-hidden rounded-md border border-border bg-surface-inset">
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-primary-soft transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(share, 2)}%` }}
              />
              <div className="relative flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-[13px] font-medium text-ink">{step.label}</span>
                <span className="flex items-center gap-3">
                  <span className="tnum font-mono text-[11px] text-ink-3">
                    {formatMoney(step.value, currency, locale, { compact: true })}
                  </span>
                  <span className="tnum font-mono text-[11px] text-ink-2">{share}%</span>
                  <span className="tnum min-w-8 text-right font-mono text-[13px] font-medium text-ink">
                    {step.count}
                  </span>
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
