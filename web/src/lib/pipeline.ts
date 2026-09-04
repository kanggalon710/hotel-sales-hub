/**
 * The rules that survive renaming.
 *
 * An organization may call a stage anything it likes. What it may not do is
 * change what a *kind* of stage means, because gates, the funnel, and every
 * conversion metric are keyed on kind rather than on a label.
 */
import type { StageGate } from './constants';

export const STAGE_KINDS = ['open', 'won', 'lost', 'cancelled'] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  open: 'In progress',
  won: 'Won',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

export const STAGE_KIND_MEANING: Record<StageKind, string> = {
  open: 'The lead is still being worked. Counts as pipeline.',
  won: 'A booking exists. Counts as converted revenue.',
  lost: 'Closed without a booking. Counts against conversion.',
  cancelled: 'Agreed, then called off. Excluded from conversion.',
};

/**
 * Gates the server always enforces for a kind. These cannot be switched off,
 * because each one guards an invariant the PRD states outright: a won lead must
 * be backed by a reservation reference (FR-10), a lost lead must carry a reason
 * (FR-07).
 */
export const MANDATORY_GATES: Record<StageKind, StageGate[]> = {
  open: [],
  won: ['reservation_reference'],
  lost: ['lost_reason'],
  cancelled: ['cancellation_reason'],
};

/** Gates an administrator may add to a stage on top of the mandatory ones. */
export const OPTIONAL_GATES: { gate: StageGate; label: string; help: string }[] = [
  { gate: 'owner', label: 'Requires an owner', help: 'The lead must be assigned before it can enter this stage.' },
  { gate: 'qualification', label: 'Requires qualification', help: 'Stay dates, occupancy, and a contact method must be present.' },
  { gate: 'availability', label: 'Requires an availability check', help: 'A successful PMS search must exist for this stay.' },
  { gate: 'quotation_sent', label: 'Requires a sent quotation', help: 'A quotation version must have been sent to the guest.' },
];

/** Colours a stage column may use. Named, so they stay inside the palette. */
export const STAGE_COLOURS = ['neutral', 'info', 'primary', 'accent', 'warning', 'success', 'danger'] as const;
export type StageColour = (typeof STAGE_COLOURS)[number];

export const COLOUR_DOT: Record<StageColour, string> = {
  neutral: 'bg-ink-3',
  info: 'bg-info',
  primary: 'bg-primary',
  accent: 'bg-accent',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
};

/** The full gate set for a stage: what the kind demands plus what was added. */
export function effectiveGates(kind: StageKind, extra: StageGate[]): StageGate[] {
  return [...new Set([...MANDATORY_GATES[kind], ...extra])];
}

/** A stage key derived from a label, unique within its template. */
export function stageKeyFrom(label: string, taken: string[]) {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'stage';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export const LEAD_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const PRIORITY_LABEL: Record<LeadPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const PRIORITY_TONE: Record<LeadPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
};
