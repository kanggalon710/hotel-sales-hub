'use server';

import { revalidatePath } from 'next/cache';
import { desc, eq } from 'drizzle-orm';
import { db, leads, quotations, quotationVersions } from '@/db';
import { assertPropertyAccess, requireSession, type Session } from '@/server/context';
import { searchAvailability } from '@/server/services/availability';
import {
  createQuotationVersion, decideApproval, sendQuotation, setQuotationOutcome, type QuoteLineInput,
} from '@/server/services/quotations';
import {
  createReservationRequest, decideReservation, HandoffError, updateDepositStatus,
  type FrontOfficeDecision,
} from '@/server/services/reservations';
import { moveLeadStage } from '@/server/services/leads';
import { fail, failFrom, ok, type ActionResult } from '@/server/result';
import type { AvailabilityOutcome } from '@/server/services/availability';

function leadFor(session: Session, leadId: string) {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead || lead.organizationId !== session.user.organizationId) throw new Error('Lead not found.');
  assertPropertyAccess(session, lead.propertyId);
  return lead;
}

function refreshLead(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  revalidatePath('/pipeline');
  revalidatePath('/quotations');
  revalidatePath('/reservations');
  revalidatePath('/approvals');
  revalidatePath('/');
}

/* ------------------------------ availability ------------------------------ */

export async function searchAvailabilityAction(input: {
  propertyId: string;
  leadId?: string | null;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  simulate?: 'ok' | 'timeout' | 'sold_out' | 'error';
}): Promise<ActionResult<AvailabilityOutcome>> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('availability.search')) {
      return fail('Your role cannot search availability.');
    }
    assertPropertyAccess(session, input.propertyId);
    if (input.leadId) leadFor(session, input.leadId);

    const outcome = await searchAvailability(session, {
      propertyId: input.propertyId,
      leadId: input.leadId ?? null,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      adults: input.adults,
      children: input.children,
      simulate: input.simulate,
    });

    // A successful check is evidence, so the pipeline can move on its own.
    if (outcome.ok && input.leadId) {
      const lead = db.select().from(leads).where(eq(leads.id, input.leadId)).get();
      if (lead && ['assigned', 'qualified'].includes(lead.stage)) {
        moveLeadStage(session, lead.id, 'availability_checked', { reason: 'Availability confirmed from PMS' });
      }
      refreshLead(input.leadId);
    }
    return ok(outcome);
  } catch (err) {
    return failFrom(err, 'The availability search could not be completed.');
  }
}

/* -------------------------------- quotations -------------------------------- */

export async function createQuotationAction(input: {
  leadId: string;
  lines: QuoteLineInput[];
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  validityHours: number;
  policies: string | null;
  notes: string | null;
  inclusions: string[];
  availabilitySearchId: string | null;
  snapshotSource: string | null;
  snapshotCheckedAtMs: number | null;
  supersedesVersionId?: string | null;
}): Promise<ActionResult<{ versionId: string; code: string; needsApproval: boolean; total: number }>> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('quotation.create')) return fail('Your role cannot create quotations.');
    leadFor(session, input.leadId);

    if (!input.lines.length) return fail('Add at least one room line before saving.');

    const result = createQuotationVersion(session, {
      leadId: input.leadId,
      lines: input.lines,
      discountType: input.discountType,
      discountValue: input.discountValue,
      validityHours: input.validityHours,
      policies: input.policies,
      notes: input.notes,
      inclusions: input.inclusions,
      availabilitySearchId: input.availabilitySearchId,
      snapshotSource: input.snapshotSource,
      snapshotCheckedAt: input.snapshotCheckedAtMs ? new Date(input.snapshotCheckedAtMs) : null,
      supersedesVersionId: input.supersedesVersionId ?? null,
    });

    refreshLead(input.leadId);
    return ok({
      versionId: result.versionId,
      code: result.code,
      needsApproval: result.needsApproval,
      total: result.pricing.total,
    });
  } catch (err) {
    return failFrom(err, 'The quotation could not be saved.');
  }
}

export async function sendQuotationAction(versionId: string): Promise<ActionResult<{ code: string }>> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('quotation.create')) return fail('Your role cannot send quotations.');

    const version = db.select().from(quotationVersions).where(eq(quotationVersions.id, versionId)).get();
    if (!version) return fail('Quotation version not found.');
    const quotation = db.select().from(quotations).where(eq(quotations.id, version.quotationId)).get()!;
    leadFor(session, quotation.leadId);

    const result = sendQuotation(session, versionId);
    moveLeadStage(session, quotation.leadId, 'quotation_sent', { reason: `${result.code} sent to guest` });
    refreshLead(quotation.leadId);
    return ok({ code: result.code });
  } catch (err) {
    return failFrom(err, 'The quotation could not be sent.');
  }
}

export async function setQuotationOutcomeAction(
  versionId: string,
  outcome: 'accepted' | 'declined',
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('quotation.create')) return fail('Your role cannot update quotations.');
    const version = db.select().from(quotationVersions).where(eq(quotationVersions.id, versionId)).get();
    if (!version) return fail('Quotation version not found.');
    const quotation = db.select().from(quotations).where(eq(quotations.id, version.quotationId)).get()!;
    leadFor(session, quotation.leadId);

    const result = setQuotationOutcome(session, versionId, outcome);
    refreshLead(result.leadId);
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function decideApprovalAction(
  approvalId: string,
  decision: 'approved' | 'rejected',
  note: string | null,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('discount.approve')) {
      return fail('Your role cannot approve discounts.');
    }
    decideApproval(session, approvalId, decision, note);
    revalidatePath('/approvals');
    revalidatePath('/quotations');
    revalidatePath('/');
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

/* ------------------------------- reservations ------------------------------- */

export async function requestReservationAction(input: {
  leadId: string;
  kind: 'hold' | 'reservation';
  roomTypeId: string | null;
  roomTypeName: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  totalAmount: number;
  specialRequest: string | null;
  internalNote: string | null;
}): Promise<ActionResult<{ code: string }>> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('reservation.request')) {
      return fail('Your role cannot request reservations.');
    }
    const lead = leadFor(session, input.leadId);

    const latestVersion = db
      .select({ id: quotationVersions.id })
      .from(quotationVersions)
      .innerJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
      .where(eq(quotations.leadId, lead.id))
      .orderBy(desc(quotationVersions.createdAt))
      .get();

    const created = createReservationRequest(session, {
      leadId: input.leadId,
      quotationVersionId: latestVersion?.id ?? null,
      kind: input.kind,
      roomTypeId: input.roomTypeId,
      roomTypeName: input.roomTypeName,
      ratePlanId: input.ratePlanId,
      ratePlanName: input.ratePlanName,
      totalAmount: input.totalAmount,
      specialRequest: input.specialRequest,
      internalNote: input.internalNote,
    });

    refreshLead(input.leadId);
    return ok({ code: created.code });
  } catch (err) {
    if (err instanceof HandoffError) {
      return fail(
        err.missing.length ? `${err.message} Missing: ${err.missing.join(', ')}.` : err.message,
      );
    }
    return failFrom(err);
  }
}

export async function decideReservationAction(
  requestId: string,
  decision: FrontOfficeDecision,
): Promise<ActionResult<{ status: string; reference?: string | null }>> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('reservation.confirm')) {
      return fail('Only reservation or front-office roles can decide on this request.');
    }
    const result = await decideReservation(session, requestId, decision);
    revalidatePath('/reservations');
    revalidatePath(`/reservations/${requestId}`);
    revalidatePath('/leads');
    revalidatePath('/pipeline');
    revalidatePath('/');
    return ok({ status: result.status, reference: 'reference' in result ? result.reference : null });
  } catch (err) {
    if (err instanceof HandoffError) return fail(err.message);
    return failFrom(err);
  }
}

export async function updateDepositAction(
  requestId: string,
  status: 'none' | 'pending' | 'partial' | 'paid' | 'refunded',
  amount: number | null,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('reservation.confirm') && !session.permissions.has('lead.write')) {
      return fail('Your role cannot update deposit status.');
    }
    updateDepositStatus(session, requestId, status, amount);
    revalidatePath('/reservations');
    revalidatePath(`/reservations/${requestId}`);
    revalidatePath('/');
    return ok();
  } catch (err) {
    if (err instanceof HandoffError) return fail(err.message);
    return failFrom(err);
  }
}
