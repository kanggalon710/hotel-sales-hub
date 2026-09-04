import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import {
  contacts, db, depositStatusReferences, integrationConnections, leads, properties,
  quotationVersions, reservationReferences, reservationRequests, tasks,
} from '@/db';
import { RESERVATION_TRANSITIONS, type ReservationStatus } from '@/lib/constants';
import { newId } from '@/server/crypto';
import { trackEvent, writeAudit } from '@/server/audit';
import { logActivity, moveLeadStage } from './leads';
import { syncLeadContextToChatwoot } from './chatwoot-outbound';
import { MockPmsAdapter } from './pms/mock-adapter';
import type { Session } from '@/server/auth';
import { nightsBetween } from '@/lib/utils';

export class HandoffError extends Error {
  readonly missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.missing = missing;
    this.name = 'HandoffError';
  }
}

function assertTransition(from: ReservationStatus, to: ReservationStatus) {
  if (!RESERVATION_TRANSITIONS[from]?.includes(to)) {
    throw new HandoffError(`A request in "${from.replace(/_/g, ' ')}" cannot move to "${to.replace(/_/g, ' ')}".`);
  }
}

function nextCode(organizationId: string, propertyCode: string) {
  const count = db
    .select({ id: reservationRequests.id })
    .from(reservationRequests)
    .where(eq(reservationRequests.organizationId, organizationId))
    .all().length;
  return `RR-${propertyCode}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Builds the front-office handoff. Mandatory data is checked here, so the queue
 * never receives a request the front office cannot act on (PRD FR-10).
 */
export function createReservationRequest(
  session: Session,
  input: {
    leadId: string;
    quotationVersionId: string | null;
    kind: 'hold' | 'reservation';
    roomTypeId: string | null;
    roomTypeName: string | null;
    ratePlanId: string | null;
    ratePlanName: string | null;
    totalAmount: number;
    specialRequest: string | null;
    internalNote: string | null;
  },
) {
  const lead = db.select().from(leads).where(eq(leads.id, input.leadId)).get();
  if (!lead) throw new HandoffError('Lead not found.');
  if (lead.organizationId !== session.user.organizationId) throw new HandoffError('Lead not found.');

  const contact = db.select().from(contacts).where(eq(contacts.id, lead.contactId)).get();
  const property = db.select().from(properties).where(eq(properties.id, lead.propertyId)).get()!;

  const missing: string[] = [];
  if (!lead.checkIn || !lead.checkOut) missing.push('Check-in and check-out dates');
  if (!lead.rooms) missing.push('Number of rooms');
  if (!lead.adults) missing.push('Number of adults');
  if (!contact?.fullName) missing.push('Guest name');
  if (!contact?.phoneNormalized && !contact?.email) missing.push('Guest phone or email');
  if (!input.roomTypeName) missing.push('Room type');
  if (!input.ratePlanName) missing.push('Rate plan');
  if (!input.totalAmount) missing.push('Total amount');
  if (missing.length) {
    throw new HandoffError('This request is missing information the front office needs.', missing);
  }

  const id = newId('rrq');
  const code = nextCode(lead.organizationId, property.code);
  const now = new Date();

  db.insert(reservationRequests).values({
    id, organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id,
    quotationVersionId: input.quotationVersionId, code, kind: input.kind, status: 'submitted',
    guestName: contact!.fullName, guestPhone: contact!.phoneNormalized, guestEmail: contact!.email,
    checkIn: lead.checkIn!, checkOut: lead.checkOut!, nights: nightsBetween(lead.checkIn!, lead.checkOut!),
    rooms: lead.rooms!, adults: lead.adults!, children: lead.children ?? 0,
    roomTypeId: input.roomTypeId, roomTypeName: input.roomTypeName,
    ratePlanId: input.ratePlanId, ratePlanName: input.ratePlanName,
    totalAmount: input.totalAmount, currency: lead.currency,
    specialRequest: input.specialRequest ?? lead.specialRequest,
    internalNote: input.internalNote,
    requestedByUserId: session.user.id, submittedAt: now,
    holdExpiresAt: input.kind === 'hold' ? new Date(now.getTime() + 24 * 3_600_000) : null,
  }).run();

  db.insert(tasks).values({
    id: newId('tsk'), organizationId: lead.organizationId, propertyId: lead.propertyId,
    leadId: lead.id, assigneeUserId: null,
    title: `Review ${code} for ${contact!.fullName}`,
    description: `${lead.rooms} × ${input.roomTypeName}, arrival ${lead.checkIn}.`,
    type: 'reservation_review', priority: 'high', status: 'open',
    dueAt: new Date(now.getTime() + 4 * 3_600_000), createdByUserId: session.user.id,
  }).run();

  logActivity({
    organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
    type: 'reservation_requested', title: `${input.kind === 'hold' ? 'Hold' : 'Reservation'} request ${code} submitted`,
    body: `${lead.rooms} × ${input.roomTypeName} · ${input.ratePlanName} · awaiting front-office verification.`,
    actorUserId: session.user.id, actorName: session.user.name,
  });

  writeAudit({
    organizationId: lead.organizationId, propertyId: lead.propertyId,
    actorUserId: session.user.id, actorName: session.user.name,
    action: 'reservation.requested', entityType: 'reservation_request', entityId: id,
    summary: `${code} submitted for ${contact!.fullName} (${lead.checkIn} → ${lead.checkOut})`,
  });
  trackEvent('reservation_requested', {
    organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id,
  }, { requestId: id, kind: input.kind });

  syncLeadContextToChatwoot({
    organizationId: lead.organizationId, leadId: lead.id, conversationId: lead.primaryConversationId,
    attributes: { reservation_id: code, pipeline_stage: lead.stage },
    reason: `reservation:${id}`,
  });

  return { id, code };
}

export type FrontOfficeDecision =
  | { action: 'start_review' }
  | { action: 'confirm'; manualReference?: string | null; note?: string | null }
  | { action: 'hold'; note?: string | null; hours?: number }
  | { action: 'reject'; note: string }
  | { action: 'alternative'; note: string };

export async function decideReservation(session: Session, requestId: string, decision: FrontOfficeDecision) {
  const request = db.select().from(reservationRequests).where(eq(reservationRequests.id, requestId)).get();
  if (!request) throw new HandoffError('Reservation request not found.');
  if (request.organizationId !== session.user.organizationId) throw new HandoffError('Reservation request not found.');

  const lead = db.select().from(leads).where(eq(leads.id, request.leadId)).get()!;
  const property = db.select().from(properties).where(eq(properties.id, request.propertyId)).get()!;
  const from = request.status as ReservationStatus;
  const now = new Date();

  if (decision.action === 'start_review') {
    assertTransition(from, 'under_review');
    db.update(reservationRequests)
      .set({ status: 'under_review', reviewStartedAt: now, assignedToUserId: session.user.id, updatedAt: now })
      .where(eq(reservationRequests.id, requestId))
      .run();
    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'reservation_review_started', title: `${request.code} picked up by front office`,
      actorUserId: session.user.id, actorName: session.user.name,
    });
    return { ok: true as const, status: 'under_review' as const };
  }

  if (decision.action === 'hold') {
    assertTransition(from, 'on_hold');
    const hours = decision.hours ?? 24;
    db.update(reservationRequests)
      .set({
        status: 'on_hold', kind: 'hold', decisionNote: decision.note ?? null,
        holdExpiresAt: new Date(now.getTime() + hours * 3_600_000), updatedAt: now,
      })
      .where(eq(reservationRequests.id, requestId))
      .run();
    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'reservation_on_hold', title: `${request.code} placed on hold for ${hours}h`,
      body: decision.note ?? null, actorUserId: session.user.id, actorName: session.user.name,
    });
    writeAudit({
      organizationId: lead.organizationId, propertyId: lead.propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'reservation.hold', entityType: 'reservation_request', entityId: requestId,
      summary: `${request.code} held for ${hours} hours`, severity: 'warning',
    });
    return { ok: true as const, status: 'on_hold' as const };
  }

  if (decision.action === 'reject') {
    assertTransition(from, 'rejected');
    if (!decision.note?.trim()) throw new HandoffError('A rejection needs a reason the sales owner can act on.');
    db.update(reservationRequests)
      .set({ status: 'rejected', decidedAt: now, decidedByUserId: session.user.id, decisionNote: decision.note, updatedAt: now })
      .where(eq(reservationRequests.id, requestId))
      .run();
    closeReviewTasks(requestId, request.leadId, session.user.id);
    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'reservation_rejected', title: `${request.code} rejected by front office`,
      body: decision.note, actorUserId: session.user.id, actorName: session.user.name,
    });
    notifyOwnerTask(lead, `${request.code} was rejected, decide next step`, decision.note, session.user.id);
    writeAudit({
      organizationId: lead.organizationId, propertyId: lead.propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'reservation.rejected', entityType: 'reservation_request', entityId: requestId,
      summary: `${request.code} rejected: ${decision.note}`, severity: 'warning',
    });
    trackEvent('reservation_rejected', { organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id });
    return { ok: true as const, status: 'rejected' as const };
  }

  if (decision.action === 'alternative') {
    assertTransition(from, 'alternative_proposed');
    if (!decision.note?.trim()) throw new HandoffError('Describe the alternative so sales can offer it without reading the log.');
    db.update(reservationRequests)
      .set({ status: 'alternative_proposed', alternativeNote: decision.note, decidedAt: now, decidedByUserId: session.user.id, updatedAt: now })
      .where(eq(reservationRequests.id, requestId))
      .run();
    closeReviewTasks(requestId, request.leadId, session.user.id);
    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'reservation_alternative', title: `Front office proposed an alternative for ${request.code}`,
      body: decision.note, actorUserId: session.user.id, actorName: session.user.name,
    });
    notifyOwnerTask(lead, `Alternative offered on ${request.code}, relay to guest`, decision.note, session.user.id);
    trackEvent('reservation_alternative', { organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id });
    return { ok: true as const, status: 'alternative_proposed' as const };
  }

  /* confirm */
  assertTransition(from, 'confirmed');

  const connection = db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.organizationId, lead.organizationId), eq(integrationConnections.provider, 'pms'), eq(integrationConnections.active, true)))
    .get();

  let reference: string | null = null;
  let confirmationType: 'pms' | 'manual_authorized' = 'pms';
  let raw: unknown = null;

  if (decision.manualReference?.trim()) {
    // Manual confirmation is allowed but recorded as such, never disguised as PMS truth.
    reference = decision.manualReference.trim();
    confirmationType = 'manual_authorized';
  } else if (connection) {
    const adapter = new MockPmsAdapter(connection.label);
    const created = await adapter.createReservation({
      externalPropertyCode: property.code,
      roomTypeCode: request.roomTypeName ?? 'DLX',
      ratePlanCode: request.ratePlanName ?? 'BAR-BB',
      checkIn: request.checkIn, checkOut: request.checkOut,
      rooms: request.rooms, adults: request.adults, children: request.children,
      guestName: request.guestName, totalAmount: request.totalAmount, currency: request.currency,
      specialRequest: request.specialRequest,
    });
    if (!created.ok) throw new HandoffError(`${created.message} ${created.recovery}`);
    reference = created.reference;
    raw = created.raw;
  } else {
    throw new HandoffError(
      'No PMS connector is available. Enter an authorized manual reference to confirm this reservation.',
    );
  }

  db.update(reservationRequests)
    .set({
      status: 'confirmed', decidedAt: now, decidedByUserId: session.user.id,
      decisionNote: decision.note ?? null, holdExpiresAt: null, updatedAt: now,
    })
    .where(eq(reservationRequests.id, requestId))
    .run();

  db.insert(reservationReferences).values({
    id: newId('rrf'), organizationId: lead.organizationId, reservationRequestId: requestId,
    provider: connection?.adapter ?? 'manual', kind: 'reservation',
    externalReference: reference!, confirmationType,
    raw: raw ? JSON.stringify(raw) : null, createdByUserId: session.user.id,
  }).run();

  const deposit = db
    .select({ id: depositStatusReferences.id })
    .from(depositStatusReferences)
    .where(eq(depositStatusReferences.reservationRequestId, requestId))
    .get();
  if (!deposit) {
    db.insert(depositStatusReferences).values({
      id: newId('dep'), organizationId: lead.organizationId, reservationRequestId: requestId,
      leadId: lead.id, status: 'pending', amount: Math.round(request.totalAmount * 0.3),
      currency: request.currency, dueAt: new Date(now.getTime() + 2 * 86_400_000),
      source: 'manual', updatedByUserId: session.user.id,
    }).run();
  }

  closeReviewTasks(requestId, request.leadId, session.user.id);

  logActivity({
    organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
    type: 'reservation_confirmed',
    title: `${request.code} confirmed with ${reference}`,
    body: confirmationType === 'manual_authorized'
      ? 'Authorized manual confirmation recorded by the front office.'
      : 'Reservation created in the PMS.',
    actorUserId: session.user.id, actorName: session.user.name, source: 'pms',
  });

  writeAudit({
    organizationId: lead.organizationId, propertyId: lead.propertyId,
    actorUserId: session.user.id, actorName: session.user.name,
    action: 'reservation.confirmed', entityType: 'reservation_request', entityId: requestId,
    summary: `${request.code} confirmed with ${confirmationType === 'pms' ? 'PMS' : 'manual'} reference ${reference}`,
    after: { reference, confirmationType }, severity: 'warning',
  });
  trackEvent('reservation_confirmed', {
    organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id,
  }, { requestId, confirmationType });

  // Pipeline follows the evidence: Confirmed once a reference exists, else Deposit Pending.
  const target = 'confirmed';
  const moved = moveLeadStage(session, lead.id, target, { reason: `Reservation ${request.code} confirmed (${reference})` });
  if (!moved.ok) {
    moveLeadStage(session, lead.id, 'deposit_pending', { reason: `Reservation ${request.code} confirmed, awaiting deposit` });
  }

  return { ok: true as const, status: 'confirmed' as const, reference, confirmationType };
}

function closeReviewTasks(requestId: string, leadId: string, userId: string) {
  db.update(tasks)
    .set({ status: 'done', completedAt: new Date(), completedByUserId: userId })
    .where(and(eq(tasks.leadId, leadId), eq(tasks.type, 'reservation_review'), eq(tasks.status, 'open')))
    .run();
}

function notifyOwnerTask(
  lead: { id: string; organizationId: string; propertyId: string; ownerUserId: string | null },
  title: string,
  description: string | null,
  actorId: string,
) {
  if (!lead.ownerUserId) return;
  db.insert(tasks).values({
    id: newId('tsk'), organizationId: lead.organizationId, propertyId: lead.propertyId,
    leadId: lead.id, assigneeUserId: lead.ownerUserId, title, description,
    type: 'follow_up', priority: 'high', status: 'open',
    dueAt: new Date(Date.now() + 3 * 3_600_000), createdByUserId: actorId,
  }).run();
}

export function updateDepositStatus(
  session: Session,
  requestId: string,
  status: 'none' | 'pending' | 'partial' | 'paid' | 'refunded',
  amount: number | null,
) {
  const request = db.select().from(reservationRequests).where(eq(reservationRequests.id, requestId)).get();
  if (!request || request.organizationId !== session.user.organizationId) {
    throw new HandoffError('Reservation request not found.');
  }
  const existing = db
    .select()
    .from(depositStatusReferences)
    .where(eq(depositStatusReferences.reservationRequestId, requestId))
    .orderBy(desc(depositStatusReferences.createdAt))
    .get();

  if (existing) {
    db.update(depositStatusReferences)
      .set({ status, amount: amount ?? existing.amount, updatedByUserId: session.user.id, updatedAt: new Date() })
      .where(eq(depositStatusReferences.id, existing.id))
      .run();
  } else {
    db.insert(depositStatusReferences).values({
      id: newId('dep'), organizationId: request.organizationId, reservationRequestId: requestId,
      leadId: request.leadId, status, amount: amount ?? 0, currency: request.currency,
      source: 'manual', updatedByUserId: session.user.id,
    }).run();
  }

  const lead = db.select().from(leads).where(eq(leads.id, request.leadId)).get()!;
  logActivity({
    organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
    type: 'deposit_updated', title: `Deposit marked ${status}`,
    actorUserId: session.user.id, actorName: session.user.name,
  });
  writeAudit({
    organizationId: lead.organizationId, propertyId: lead.propertyId,
    actorUserId: session.user.id, actorName: session.user.name,
    action: 'deposit.updated', entityType: 'reservation_request', entityId: requestId,
    summary: `Deposit for ${request.code} set to ${status}`, severity: 'warning',
  });
  return { ok: true as const };
}

/** Quotation version details used to prefill a reservation request. */
export function quotationForHandoff(leadId: string) {
  return db
    .select({
      versionId: quotationVersions.id,
      total: quotationVersions.total,
      currency: quotationVersions.currency,
      status: quotationVersions.status,
    })
    .from(quotationVersions)
    .innerJoin(leads, eq(leads.id, leadId))
    .where(eq(quotationVersions.organizationId, leads.organizationId))
    .orderBy(desc(quotationVersions.createdAt))
    .get();
}
