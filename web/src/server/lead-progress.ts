import 'server-only';
import type { StayStep } from '@/components/live-stay-strip';
import { relativeTime } from '@/lib/utils';

export type ProgressInput = {
  stage: string;
  status: string;
  createdAt: Date;
  firstRespondedAt: Date | null;
  slaDueAt: Date | null;
  availability: { checkedAt: Date; source: string; state: string } | null;
  quotation: {
    code: string;
    status: string;
    total: number;
    currency: string;
    validUntil: Date | null;
  } | null;
  deposit: { status: string; dueAt: Date | null } | null;
  reservation: { status: string; reference: string | null } | null;
  /** Freshness threshold from organization settings. */
  staleAfterMinutes: number;
};

/**
 * Derives the five Live Stay Strip steps from real records rather than the
 * pipeline stage alone, so the strip cannot claim progress the data does not
 * support (e.g. "Booking done" without a reservation reference).
 */
export function buildStaySteps(input: ProgressInput, now = Date.now()): StayStep[] {
  const closed = input.status === 'lost' || input.status === 'cancelled';

  /* Inquiry */
  const slaBreached =
    !input.firstRespondedAt && input.slaDueAt != null && input.slaDueAt.getTime() < now;
  const inquiry: StayStep = input.firstRespondedAt
    ? { key: 'inquiry', state: 'done', meta: `replied ${relativeTime(input.firstRespondedAt, now)}` }
    : slaBreached
      ? { key: 'inquiry', state: 'blocked', warning: `reply overdue ${relativeTime(input.slaDueAt, now)}` }
      : { key: 'inquiry', state: 'current', meta: input.slaDueAt ? `reply due ${relativeTime(input.slaDueAt, now)}` : 'awaiting reply' };

  /* Availability */
  let availability: StayStep;
  if (input.availability) {
    const ageMinutes = (now - input.availability.checkedAt.getTime()) / 60_000;
    const stale = ageMinutes > input.staleAfterMinutes || input.availability.state === 'stale';
    availability = stale
      ? { key: 'availability', state: 'done', warning: `stale ${relativeTime(input.availability.checkedAt, now)}` }
      : { key: 'availability', state: 'done', meta: `live · ${relativeTime(input.availability.checkedAt, now)}` };
  } else if (['qualified', 'availability_checked'].includes(input.stage)) {
    availability = { key: 'availability', state: 'current', meta: 'not checked yet' };
  } else {
    availability = { key: 'availability', state: 'pending', meta: null };
  }

  /* Quotation */
  let quotation: StayStep;
  const q = input.quotation;
  if (!q) {
    quotation = ['availability_checked'].includes(input.stage)
      ? { key: 'quotation', state: 'current', meta: 'ready to quote' }
      : { key: 'quotation', state: 'pending', meta: null };
  } else if (q.status === 'pending_approval') {
    quotation = { key: 'quotation', state: 'blocked', warning: `${q.code} needs approval` };
  } else if (q.status === 'expired') {
    quotation = { key: 'quotation', state: 'blocked', warning: `${q.code} expired` };
  } else if (q.status === 'declined') {
    quotation = { key: 'quotation', state: 'blocked', warning: `${q.code} declined` };
  } else if (q.status === 'draft' || q.status === 'approved') {
    quotation = { key: 'quotation', state: 'current', meta: `${q.code} not sent` };
  } else {
    const expiringSoon =
      q.validUntil != null && q.validUntil.getTime() > now && q.validUntil.getTime() - now < 24 * 3_600_000;
    quotation = expiringSoon
      ? { key: 'quotation', state: 'done', warning: `expires ${relativeTime(q.validUntil, now)}` }
      : { key: 'quotation', state: 'done', meta: `${q.code} ${q.status}` };
  }

  /* Deposit */
  const d = input.deposit;
  const deposit: StayStep = !d
    ? { key: 'deposit', state: 'pending', meta: null }
    : d.status === 'paid'
      ? { key: 'deposit', state: 'done', meta: 'received' }
      : d.status === 'partial'
        ? { key: 'deposit', state: 'current', meta: 'partially received' }
        : d.dueAt && d.dueAt.getTime() < now
          ? { key: 'deposit', state: 'blocked', warning: `overdue ${relativeTime(d.dueAt, now)}` }
          : { key: 'deposit', state: 'current', meta: d.dueAt ? `due ${relativeTime(d.dueAt, now)}` : 'awaiting payment' };

  /* Booking — only a real reference counts as done (PRD FR-10). */
  const r = input.reservation;
  let booking: StayStep;
  if (r?.reference) {
    booking = { key: 'booking', state: 'done', meta: r.reference };
  } else if (r?.status === 'rejected') {
    booking = { key: 'booking', state: 'blocked', warning: 'request rejected' };
  } else if (r?.status === 'alternative_proposed') {
    booking = { key: 'booking', state: 'blocked', warning: 'alternative proposed' };
  } else if (r) {
    booking = { key: 'booking', state: 'current', meta: r.status.replace(/_/g, ' ') };
  } else {
    booking = { key: 'booking', state: 'pending', meta: null };
  }

  const steps = [inquiry, availability, quotation, deposit, booking];
  if (closed) {
    // A closed lead never shows an "in progress" step; unreached steps read as not started.
    return steps.map((s) => (s.state === 'current' ? { ...s, state: 'pending' as const } : s));
  }
  return steps;
}
