import * as React from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'primary';

const tones: Record<Tone, { pill: string; dot: string; text: string }> = {
  neutral: { pill: 'bg-neutral-soft text-ink-2', dot: 'bg-ink-3', text: 'text-ink-2' },
  info: { pill: 'bg-info-soft text-info-ink', dot: 'bg-info', text: 'text-info-ink' },
  primary: { pill: 'bg-primary-soft text-primary-ink', dot: 'bg-primary', text: 'text-primary-ink' },
  success: { pill: 'bg-success-soft text-success-ink', dot: 'bg-success', text: 'text-success-ink' },
  warning: { pill: 'bg-warning-soft text-warning-ink', dot: 'bg-warning', text: 'text-warning-ink' },
  danger: { pill: 'bg-danger-soft text-danger-ink', dot: 'bg-danger', text: 'text-danger-ink' },
  accent: { pill: 'bg-accent-soft text-accent-ink', dot: 'bg-accent', text: 'text-accent-ink' },
};

/**
 * Two presentations of the same status vocabulary:
 *   - `pill`  when the status is the point (a header, a decision)
 *   - `dot`   in dense rows, so a list is not a wall of pills
 * Both keep the text, so nothing is conveyed by colour alone.
 */
export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
  variant = 'pill',
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  title?: string;
  variant?: 'pill' | 'dot';
}) {
  if (variant === 'dot') {
    return (
      <span title={title} className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', tones[tone].text, className)}>
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', tones[tone].dot)} />
        {children}
      </span>
    );
  }
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-px text-[11.5px] font-medium leading-5',
        tones[tone].pill,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', tones[tone].dot)} />
      {children}
    </span>
  );
}

export const STATUS_STYLES: Record<string, { label: string; tone: Tone }> = {
  new_inquiry: { label: 'New inquiry', tone: 'accent' },
  assigned: { label: 'Assigned', tone: 'info' },
  qualified: { label: 'Qualified', tone: 'info' },
  availability_checked: { label: 'Availability checked', tone: 'primary' },
  quotation_sent: { label: 'Quotation sent', tone: 'primary' },
  follow_up: { label: 'Follow-up', tone: 'warning' },
  deposit_pending: { label: 'Deposit pending', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },

  draft: { label: 'Draft', tone: 'neutral' },
  pending_approval: { label: 'Pending approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'info' },
  sent: { label: 'Sent', tone: 'primary' },
  accepted: { label: 'Accepted', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  expired: { label: 'Expired', tone: 'danger' },
  superseded: { label: 'Superseded', tone: 'neutral' },

  submitted: { label: 'Submitted', tone: 'info' },
  under_review: { label: 'Under review', tone: 'warning' },
  alternative_proposed: { label: 'Alternative proposed', tone: 'accent' },
  on_hold: { label: 'On hold', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },

  live: { label: 'Live', tone: 'success' },
  stale: { label: 'Stale, recheck required', tone: 'warning' },
  manual: { label: 'Manual confirmation', tone: 'info' },
  unavailable: { label: 'Unavailable', tone: 'danger' },

  healthy: { label: 'Healthy', tone: 'success' },
  degraded: { label: 'Degraded', tone: 'warning' },
  disconnected: { label: 'Disconnected', tone: 'danger' },
  action_required: { label: 'Action required', tone: 'danger' },
  received: { label: 'Received', tone: 'neutral' },
  processed: { label: 'Processed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  dead_letter: { label: 'Dead letter', tone: 'danger' },
  recovered: { label: 'Recovered', tone: 'success' },
  ignored: { label: 'Ignored', tone: 'neutral' },
  duplicate: { label: 'Duplicate, no effect', tone: 'neutral' },

  invited: { label: 'Invited', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'warning' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
  open: { label: 'Open', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
  mapped: { label: 'Mapped', tone: 'success' },
  unmapped: { label: 'Unmapped', tone: 'danger' },
  paid: { label: 'Paid', tone: 'success' },
  partial: { label: 'Partial', tone: 'warning' },
  pending: { label: 'Pending', tone: 'warning' },
  none: { label: 'None', tone: 'neutral' },
  success: { label: 'Success', tone: 'success' },
  timeout: { label: 'Timed out', tone: 'danger' },
};

export function StatusBadge({
  status,
  className,
  labelOverride,
  short,
  variant = 'pill',
}: {
  status: string;
  className?: string;
  labelOverride?: string;
  short?: boolean;
  variant?: 'pill' | 'dot';
}) {
  const s = STATUS_STYLES[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral' as Tone };
  const label = labelOverride ?? (short ? s.label.split(' · ')[0] : s.label);
  return (
    <Badge tone={s.tone} className={className} title={s.label} variant={variant}>
      {label}
    </Badge>
  );
}
