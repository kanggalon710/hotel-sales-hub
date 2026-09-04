import 'server-only';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import {
  approvalRequests, contacts, db, leads, properties, quotationItems, quotations,
  quotationVersions, tasks, users,
} from '@/db';
import { newId } from '@/server/crypto';
import { trackEvent, writeAudit } from '@/server/audit';
import { logActivity } from './leads';
import { syncLeadContextToChatwoot } from './chatwoot-outbound';
import type { Session } from '@/server/auth';
import { nightsBetween } from '@/lib/utils';
import { priceQuotation, type Pricing, type PricingInput } from '@/lib/pricing';

export { priceQuotation };
export type { Pricing, PricingInput };

export type QuoteLineInput = {
  roomTypeId: string | null;
  roomTypeName: string;
  ratePlanId: string | null;
  ratePlanName: string;
  rooms: number;
  ratePerNight: number;
  inclusions: string[];
};


function nextCode(organizationId: string, propertyCode: string) {
  const count = db
    .select({ id: quotations.id })
    .from(quotations)
    .where(eq(quotations.organizationId, organizationId))
    .all().length;
  return `QT-${propertyCode}-${String(count + 1).padStart(4, '0')}`;
}

export type CreateVersionInput = {
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
  snapshotCheckedAt: Date | null;
  /** Set when revising: the version being replaced. */
  supersedesVersionId?: string | null;
};

export function createQuotationVersion(session: Session, input: CreateVersionInput) {
  const lead = db.select().from(leads).where(eq(leads.id, input.leadId)).get();
  if (!lead) throw new Error('Lead not found.');
  if (!lead.checkIn || !lead.checkOut) throw new Error('The lead needs check-in and check-out dates before quoting.');
  if (input.lines.length === 0) throw new Error('Add at least one room line.');

  const property = db.select().from(properties).where(eq(properties.id, lead.propertyId)).get()!;
  const servicePercent = property.servicePercent ?? session.organization.servicePercent;
  const taxPercent = property.taxPercent ?? session.organization.taxPercent;
  const nights = nightsBetween(lead.checkIn, lead.checkOut);
  const currency = property.currency ?? session.organization.currency;

  const pricing = priceQuotation({
    lines: input.lines,
    nights,
    discountType: input.discountType,
    discountValue: input.discountValue,
    servicePercent,
    taxPercent,
  });

  // Anything above the author's own authority parks in Pending Approval and
  // cannot be sent as an approved offer (PRD FR-09).
  const limit = session.user.discountLimitPercent;
  const needsApproval = pricing.discountPercentEffective > limit + 0.001;

  let quotation = db.select().from(quotations).where(eq(quotations.leadId, input.leadId)).orderBy(desc(quotations.createdAt)).get();
  if (!quotation) {
    const id = newId('quo');
    db.insert(quotations).values({
      id, organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id,
      code: nextCode(lead.organizationId, property.code), status: 'draft', currency,
      createdByUserId: session.user.id,
    }).run();
    quotation = db.select().from(quotations).where(eq(quotations.id, id)).get()!;
  }

  const priorVersions = db
    .select({ version: quotationVersions.version })
    .from(quotationVersions)
    .where(eq(quotationVersions.quotationId, quotation.id))
    .all();
  const version = priorVersions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

  const status = needsApproval ? 'pending_approval' : 'draft';
  const versionId = newId('qvr');
  const validUntil = new Date(Date.now() + input.validityHours * 3_600_000);

  db.insert(quotationVersions).values({
    id: versionId, organizationId: lead.organizationId, quotationId: quotation.id, version, status,
    subtotal: pricing.subtotal, discountType: input.discountType, discountValue: input.discountValue,
    discountAmount: pricing.discountAmount, discountPercentEffective: pricing.discountPercentEffective,
    netAmount: pricing.netAmount, servicePercent, serviceAmount: pricing.serviceAmount,
    taxPercent, taxAmount: pricing.taxAmount, total: pricing.total, currency,
    nights, checkIn: lead.checkIn, checkOut: lead.checkOut,
    adults: lead.adults ?? 2, children: lead.children ?? 0,
    inclusions: JSON.stringify(input.inclusions), policies: input.policies, notes: input.notes,
    validUntil, availabilitySearchId: input.availabilitySearchId,
    snapshotSource: input.snapshotSource, snapshotCheckedAt: input.snapshotCheckedAt,
    createdByUserId: session.user.id,
  }).run();

  input.lines.forEach((line, i) => {
    db.insert(quotationItems).values({
      id: newId('qit'), organizationId: lead.organizationId, versionId,
      roomTypeId: line.roomTypeId, roomTypeName: line.roomTypeName,
      ratePlanId: line.ratePlanId, ratePlanName: line.ratePlanName,
      rooms: line.rooms, nights, ratePerNight: line.ratePerNight,
      lineTotal: line.rooms * line.ratePerNight * nights, currency,
      inclusions: JSON.stringify(line.inclusions), sortOrder: i,
    }).run();
  });

  // Supersede the previous version rather than editing it.
  if (input.supersedesVersionId) {
    db.update(quotationVersions)
      .set({ status: 'superseded', supersededByVersionId: versionId })
      .where(eq(quotationVersions.id, input.supersedesVersionId))
      .run();
  }

  db.update(quotations)
    .set({ currentVersionId: versionId, status, updatedAt: new Date() })
    .where(eq(quotations.id, quotation.id))
    .run();

  if (needsApproval) {
    db.insert(approvalRequests).values({
      id: newId('apr'), organizationId: lead.organizationId, propertyId: lead.propertyId,
      kind: 'discount', leadId: lead.id, quotationVersionId: versionId,
      requestedByUserId: session.user.id,
      requestedDiscountPercent: pricing.discountPercentEffective,
      requesterLimitPercent: limit, amountImpact: pricing.discountAmount, currency,
      reason: input.notes, status: 'pending',
    }).run();

    for (const approver of approversFor(lead.organizationId, lead.propertyId, pricing.discountPercentEffective)) {
      db.insert(tasks).values({
        id: newId('tsk'), organizationId: lead.organizationId, propertyId: lead.propertyId,
        leadId: lead.id, assigneeUserId: approver,
        title: `Approve ${pricing.discountPercentEffective}% discount on ${quotation.code}`,
        description: `Requested by ${session.user.name}, above their ${limit}% limit.`,
        type: 'approval', priority: 'high', status: 'open',
        dueAt: new Date(Date.now() + 4 * 3_600_000), createdByUserId: session.user.id,
      }).run();
    }

    trackEvent('quotation_submitted', { organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id }, { versionId });
  } else {
    trackEvent('quotation_created', { organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id }, { versionId });
  }

  logActivity({
    organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
    type: needsApproval ? 'quotation_submitted' : 'quotation_created',
    title: needsApproval
      ? `${quotation.code} v${version} submitted for discount approval`
      : `${quotation.code} v${version} drafted`,
    body: `${input.lines.length} room line(s) · ${nights} nights · total ${pricing.total.toLocaleString('id-ID')} ${currency}`,
    actorUserId: session.user.id, actorName: session.user.name,
  });

  writeAudit({
    organizationId: lead.organizationId, propertyId: lead.propertyId,
    actorUserId: session.user.id, actorName: session.user.name,
    action: needsApproval ? 'quotation.submitted' : 'quotation.created',
    entityType: 'quotation_version', entityId: versionId,
    summary: `${quotation.code} v${version} (${pricing.discountPercentEffective}% discount, total ${pricing.total})`,
    after: pricing,
    severity: needsApproval ? 'warning' : 'info',
  });

  return { quotationId: quotation.id, versionId, code: quotation.code, version, status, pricing, needsApproval };
}

/** Managers/admins on the property who may approve at least this discount. */
function approversFor(organizationId: string, propertyId: string, discountPercent: number) {
  return db
    .select({ id: users.id, limit: users.canApproveDiscountUpToPercent })
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.status, 'active')))
    .all()
    .filter((u) => u.limit >= discountPercent)
    .map((u) => u.id);
}

export function decideApproval(
  session: Session,
  approvalId: string,
  decision: 'approved' | 'rejected',
  note: string | null,
) {
  const approval = db.select().from(approvalRequests).where(eq(approvalRequests.id, approvalId)).get();
  if (!approval) throw new Error('Approval request not found.');
  if (approval.status !== 'pending') throw new Error('This request has already been decided.');
  if (approval.organizationId !== session.user.organizationId) throw new Error('Approval request not found.');

  // Approving beyond your own authority is exactly the thing this queue prevents.
  if (decision === 'approved' && approval.requestedDiscountPercent > session.user.canApproveDiscountUpToPercent) {
    throw new Error(
      `Your approval limit is ${session.user.canApproveDiscountUpToPercent}%. Escalate this ${approval.requestedDiscountPercent}% request to an administrator.`,
    );
  }

  db.update(approvalRequests)
    .set({ status: decision, decidedByUserId: session.user.id, decidedAt: new Date(), decisionNote: note })
    .where(eq(approvalRequests.id, approvalId))
    .run();

  if (approval.quotationVersionId) {
    const nextStatus = decision === 'approved' ? 'approved' : 'draft';
    db.update(quotationVersions)
      .set({
        status: nextStatus,
        approvedByUserId: decision === 'approved' ? session.user.id : null,
        approvedAt: decision === 'approved' ? new Date() : null,
      })
      .where(eq(quotationVersions.id, approval.quotationVersionId))
      .run();

    const version = db.select().from(quotationVersions).where(eq(quotationVersions.id, approval.quotationVersionId)).get();
    if (version) {
      db.update(quotations).set({ status: nextStatus, updatedAt: new Date() }).where(eq(quotations.id, version.quotationId)).run();
    }
  }

  db.update(tasks)
    .set({ status: 'done', completedAt: new Date(), completedByUserId: session.user.id })
    .where(and(eq(tasks.leadId, approval.leadId!), eq(tasks.type, 'approval'), eq(tasks.status, 'open')))
    .run();

  const lead = approval.leadId ? db.select().from(leads).where(eq(leads.id, approval.leadId)).get() : null;
  if (lead) {
    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: `discount_${decision}`,
      title: `${approval.requestedDiscountPercent}% discount ${decision}`,
      body: note,
      actorUserId: session.user.id, actorName: session.user.name,
    });
  }

  writeAudit({
    organizationId: approval.organizationId, propertyId: approval.propertyId,
    actorUserId: session.user.id, actorName: session.user.name,
    action: `approval.${decision}`, entityType: 'approval_request', entityId: approvalId,
    summary: `${approval.requestedDiscountPercent}% discount ${decision} by ${session.user.name}`,
    after: { decision, note },
    severity: 'warning',
  });

  trackEvent(decision === 'approved' ? 'quotation_approved' : 'quotation_rejected', {
    organizationId: approval.organizationId, propertyId: approval.propertyId, userId: session.user.id,
  });

  return { ok: true as const };
}

export function sendQuotation(session: Session, versionId: string) {
  const version = db.select().from(quotationVersions).where(eq(quotationVersions.id, versionId)).get();
  if (!version) throw new Error('Quotation version not found.');
  if (version.organizationId !== session.user.organizationId) throw new Error('Quotation version not found.');

  if (version.status === 'pending_approval') {
    throw new Error('This quotation is waiting for discount approval and cannot be sent yet.');
  }
  if (!['draft', 'approved'].includes(version.status)) {
    throw new Error(`A quotation in "${version.status}" state cannot be sent.`);
  }
  if (version.validUntil.getTime() < Date.now()) {
    throw new Error('This quotation has already expired. Create a revision with a new validity window.');
  }

  const quotation = db.select().from(quotations).where(eq(quotations.id, version.quotationId)).get()!;
  const lead = db.select().from(leads).where(eq(leads.id, quotation.leadId)).get()!;
  const contact = db.select().from(contacts).where(eq(contacts.id, lead.contactId)).get();

  db.update(quotationVersions)
    .set({ status: 'sent', sentAt: new Date(), sentVia: 'chatwoot' })
    .where(eq(quotationVersions.id, versionId))
    .run();
  db.update(quotations).set({ status: 'sent', updatedAt: new Date() }).where(eq(quotations.id, quotation.id)).run();

  // Delivery goes out through the conversation the guest already uses (PRD 10.6).
  if (lead.primaryConversationId) {
    syncLeadContextToChatwoot({
      organizationId: lead.organizationId, leadId: lead.id, conversationId: lead.primaryConversationId,
      attributes: { quotation_id: quotation.code, pipeline_stage: 'quotation_sent', estimated_value: version.total },
      reason: `quote-sent:${versionId}`,
    });
  }

  logActivity({
    organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
    type: 'quotation_sent',
    title: `${quotation.code} v${version.version} sent via Chatwoot`,
    body: `To ${contact?.fullName ?? 'guest'} · valid until ${version.validUntil.toISOString().slice(0, 16).replace('T', ' ')} · total ${version.total.toLocaleString('id-ID')} ${version.currency}`,
    actorUserId: session.user.id, actorName: session.user.name,
  });

  // A reminder before the offer dies on the guest's phone.
  const reminderAt = new Date(version.validUntil.getTime() - 6 * 3_600_000);
  if (reminderAt.getTime() > Date.now() && lead.ownerUserId) {
    db.insert(tasks).values({
      id: newId('tsk'), organizationId: lead.organizationId, propertyId: lead.propertyId,
      leadId: lead.id, assigneeUserId: lead.ownerUserId,
      title: `${quotation.code} expires soon, follow up`,
      description: 'Chase a decision or issue a revision before the quotation expires.',
      type: 'quotation_expiry', priority: 'high', status: 'open',
      dueAt: reminderAt, createdByUserId: session.user.id,
    }).run();
  }

  writeAudit({
    organizationId: lead.organizationId, propertyId: lead.propertyId,
    actorUserId: session.user.id, actorName: session.user.name,
    action: 'quotation.sent', entityType: 'quotation_version', entityId: versionId,
    summary: `${quotation.code} v${version.version} sent to ${contact?.fullName ?? 'guest'} via Chatwoot`,
  });
  trackEvent('quotation_sent', { organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id }, { versionId });

  return { ok: true as const, code: quotation.code, leadId: lead.id };
}

export function setQuotationOutcome(session: Session, versionId: string, outcome: 'accepted' | 'declined') {
  const version = db.select().from(quotationVersions).where(eq(quotationVersions.id, versionId)).get();
  if (!version || version.organizationId !== session.user.organizationId) throw new Error('Quotation version not found.');
  if (version.status !== 'sent') throw new Error('Only a sent quotation can be marked accepted or declined.');

  db.update(quotationVersions).set({ status: outcome, respondedAt: new Date() }).where(eq(quotationVersions.id, versionId)).run();
  db.update(quotations).set({ status: outcome, updatedAt: new Date() }).where(eq(quotations.id, version.quotationId)).run();

  const quotation = db.select().from(quotations).where(eq(quotations.id, version.quotationId)).get()!;
  const lead = db.select().from(leads).where(eq(leads.id, quotation.leadId)).get()!;

  logActivity({
    organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
    type: `quotation_${outcome}`, title: `${quotation.code} ${outcome} by the guest`,
    actorUserId: session.user.id, actorName: session.user.name,
  });
  writeAudit({
    organizationId: lead.organizationId, propertyId: lead.propertyId,
    actorUserId: session.user.id, actorName: session.user.name,
    action: `quotation.${outcome}`, entityType: 'quotation_version', entityId: versionId,
    summary: `${quotation.code} marked ${outcome}`,
  });
  trackEvent(`quotation_${outcome}`, { organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id });
  return { ok: true as const, leadId: lead.id };
}

/** Sweeps quotations past their validity window. Safe to run repeatedly. */
export function expireStaleQuotations(organizationId: string) {
  const now = new Date();
  const stale = db
    .select({ id: quotationVersions.id, quotationId: quotationVersions.quotationId })
    .from(quotationVersions)
    .where(
      and(
        eq(quotationVersions.organizationId, organizationId),
        inArray(quotationVersions.status, ['sent', 'approved', 'pending_approval']),
        lt(quotationVersions.validUntil, now),
      ),
    )
    .all();

  for (const v of stale) {
    db.update(quotationVersions).set({ status: 'expired' }).where(eq(quotationVersions.id, v.id)).run();
    db.update(quotations).set({ status: 'expired', updatedAt: now }).where(eq(quotations.id, v.quotationId)).run();
  }
  return stale.length;
}
