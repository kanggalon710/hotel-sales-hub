import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import {
  activities, availabilitySearches, contacts, db, leads, leadStageHistory, quotations,
  quotationVersions, reservationReferences, reservationRequests, stayRequests, tasks,
} from '@/db';
import { LEAD_STAGES, STAGE_MAP, type LeadStage, type StageGate } from '@/lib/constants';
import { templateForLead, type StageDef } from './pipelines';
import type { StageKind } from '@/lib/pipeline';
import { newId } from '@/server/crypto';
import { trackEvent, writeAudit } from '@/server/audit';
import { syncLeadContextToChatwoot } from './chatwoot-outbound';
import type { Session } from '@/server/auth';

export type GateFailure = { gate: StageGate; message: string };

/**
 * Checks the server-side preconditions for entering a stage (PRD FR-07).
 * The UI mirrors these, but this function is the authority.
 */
/**
 * The stage definition in force for a lead: from its pipeline template when one
 * is set, otherwise the built-in vocabulary. Gates always come from here, never
 * from a label, so renaming a stage cannot weaken what it enforces.
 */
export function resolveStage(
  organizationId: string,
  pipelineTemplateId: string | null,
  stageKey: string,
): Pick<StageDef, 'key' | 'label' | 'kind' | 'gates' | 'probability' | 'hint' | 'meaning'> | null {
  const template = templateForLead(organizationId, pipelineTemplateId);
  const fromTemplate = template?.stages.find((s) => s.key === stageKey);
  if (fromTemplate) return fromTemplate;

  const builtin = STAGE_MAP.get(stageKey as LeadStage);
  return builtin
    ? {
        key: builtin.key,
        label: builtin.label,
        kind: builtin.kind as StageKind,
        gates: builtin.gates,
        probability: builtin.probability,
        hint: builtin.hint,
        meaning: builtin.meaning,
      }
    : null;
}

export function checkStageGates(
  leadId: string,
  target: LeadStage,
  overrides: { lostReason?: string | null; cancellationReason?: string | null } = {},
): GateFailure[] {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return [{ gate: 'owner', message: 'Lead not found.' }];

  const def = resolveStage(lead.organizationId, lead.pipelineTemplateId, target);
  if (!def) return [{ gate: 'owner', message: `Unknown stage "${target}".` }];

  const failures: GateFailure[] = [];

  for (const gate of def.gates) {
    switch (gate) {
      case 'owner': {
        if (!lead.ownerUserId) failures.push({ gate, message: 'Assign an owner before moving this lead forward.' });
        break;
      }
      case 'qualification': {
        const contact = db.select().from(contacts).where(eq(contacts.id, lead.contactId)).get();
        const missing: string[] = [];
        if (!lead.checkIn || !lead.checkOut) missing.push('check-in and check-out dates');
        if (!lead.rooms) missing.push('number of rooms');
        if (!lead.adults) missing.push('number of adults');
        if (!lead.inquiryType) missing.push('inquiry type');
        if (!contact?.phoneNormalized && !contact?.email) missing.push('a valid phone number or email');
        if (missing.length) {
          failures.push({ gate, message: `Qualification is incomplete. Add ${missing.join(', ')}.` });
        }
        break;
      }
      case 'availability': {
        const search = db
          .select({ id: availabilitySearches.id })
          .from(availabilitySearches)
          .where(and(eq(availabilitySearches.leadId, leadId), eq(availabilitySearches.status, 'success')))
          .get();
        if (!search) {
          failures.push({ gate, message: 'Run an availability search for these dates first.' });
        }
        break;
      }
      case 'quotation_sent': {
        const sent = db
          .select({ id: quotationVersions.id })
          .from(quotationVersions)
          .innerJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
          .where(and(eq(quotations.leadId, leadId), inArray(quotationVersions.status, ['sent', 'accepted'])))
          .get();
        if (!sent) failures.push({ gate, message: 'Send a quotation to the guest before this stage.' });
        break;
      }
      case 'reservation_reference': {
        const ref = db
          .select({ id: reservationReferences.id })
          .from(reservationReferences)
          .innerJoin(reservationRequests, eq(reservationRequests.id, reservationReferences.reservationRequestId))
          .where(eq(reservationRequests.leadId, leadId))
          .get();
        if (!ref) {
          failures.push({
            gate,
            message: 'Confirmed requires a PMS reservation reference, or an authorized manual confirmation from the front office.',
          });
        }
        break;
      }
      case 'lost_reason': {
        if (!(overrides.lostReason ?? lead.lostReason)) {
          failures.push({ gate, message: 'A lost reason is required before closing this lead as lost.' });
        }
        break;
      }
      case 'cancellation_reason': {
        if (!(overrides.cancellationReason ?? lead.cancellationReason)) {
          failures.push({ gate, message: 'Record the cancellation reason before cancelling this lead.' });
        }
        break;
      }
    }
  }

  return failures;
}

export function stageStatus(stage: LeadStage): 'open' | 'won' | 'lost' | 'cancelled' {
  return STAGE_MAP.get(stage)?.kind ?? 'open';
}

export function moveLeadStage(
  session: Session,
  leadId: string,
  target: LeadStage,
  extra: { lostReason?: string; lostCompetitor?: string; lostNotes?: string; cancellationReason?: string; cancellationSource?: string; reason?: string } = {},
): { ok: true } | { ok: false; failures: GateFailure[] } {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return { ok: false, failures: [{ gate: 'owner', message: 'Lead not found.' }] };

  const failures = checkStageGates(leadId, target, {
    lostReason: extra.lostReason,
    cancellationReason: extra.cancellationReason,
  });
  if (failures.length) return { ok: false, failures };

  const def = resolveStage(lead.organizationId, lead.pipelineTemplateId, target)!;
  const status = def.kind;
  const now = new Date();

  db.update(leads)
    .set({
      stage: target,
      status,
      probability: def.probability,
      lostReason: target === 'lost' ? (extra.lostReason ?? lead.lostReason) : lead.lostReason,
      lostCompetitor: target === 'lost' ? (extra.lostCompetitor ?? null) : lead.lostCompetitor,
      lostNotes: target === 'lost' ? (extra.lostNotes ?? null) : lead.lostNotes,
      cancellationReason: target === 'cancelled' ? (extra.cancellationReason ?? lead.cancellationReason) : lead.cancellationReason,
      cancellationSource: target === 'cancelled' ? (extra.cancellationSource ?? 'guest') : lead.cancellationSource,
      closedAt: status === 'open' ? null : now,
      nextFollowUpAt: status === 'open' ? lead.nextFollowUpAt : null,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(eq(leads.id, leadId))
    .run();

  db.insert(leadStageHistory)
    .values({
      id: newId('lsh'),
      organizationId: lead.organizationId,
      leadId,
      fromStage: lead.stage,
      toStage: target,
      actorUserId: session.user.id,
      actorType: 'user',
      reason: extra.reason ?? extra.lostReason ?? extra.cancellationReason ?? null,
    })
    .run();

  logActivity({
    organizationId: lead.organizationId,
    propertyId: lead.propertyId,
    leadId,
    contactId: lead.contactId,
    type: 'stage_changed',
    title: `Stage moved to ${def.label}`,
    body: extra.reason ?? extra.lostReason ?? extra.cancellationReason ?? null,
    actorUserId: session.user.id,
    actorName: session.user.name,
  });

  // Open tasks on a closed lead would show up forever in someone's My Day.
  if (status !== 'open') {
    db.update(tasks)
      .set({ status: 'cancelled', completedAt: now })
      .where(and(eq(tasks.leadId, leadId), eq(tasks.status, 'open')))
      .run();
  }

  writeAudit({
    organizationId: lead.organizationId,
    propertyId: lead.propertyId,
    actorUserId: session.user.id,
    actorName: session.user.name,
    action: 'lead.stage_changed',
    entityType: 'lead',
    entityId: leadId,
    summary: `${lead.code} moved ${lead.stage} → ${target}`,
    before: { stage: lead.stage, status: lead.status },
    after: { stage: target, status },
  });

  trackEvent('stage_changed', { organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id }, {
    leadId, from: lead.stage, to: target,
  });

  syncLeadContextToChatwoot({
    organizationId: lead.organizationId,
    leadId,
    conversationId: lead.primaryConversationId,
    attributes: { crm_lead_id: lead.code, pipeline_stage: target },
    reason: `stage:${target}`,
  });

  return { ok: true };
}

export function logActivity(input: {
  organizationId: string;
  propertyId?: string | null;
  leadId?: string | null;
  contactId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorType?: 'user' | 'system';
  source?: 'crm' | 'chatwoot' | 'pms' | 'system';
  metadata?: unknown;
}) {
  db.insert(activities)
    .values({
      id: newId('act'),
      organizationId: input.organizationId,
      propertyId: input.propertyId ?? null,
      leadId: input.leadId ?? null,
      contactId: input.contactId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      actorUserId: input.actorUserId ?? null,
      actorName: input.actorName ?? null,
      actorType: input.actorType ?? 'user',
      source: input.source ?? 'crm',
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
    })
    .run();

  if (input.leadId) {
    db.update(leads).set({ lastActivityAt: new Date() }).where(eq(leads.id, input.leadId)).run();
  }
}

/** Keeps the denormalised stay fields on the lead in step with its primary stay request. */
export function setPrimaryStay(
  leadId: string,
  stay: {
    organizationId: string;
    propertyId: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    rooms: number;
    adults: number;
    children: number;
    roomPreference?: string | null;
    notes?: string | null;
  },
) {
  const existing = db
    .select({ id: stayRequests.id })
    .from(stayRequests)
    .where(and(eq(stayRequests.leadId, leadId), eq(stayRequests.isPrimary, true)))
    .get();

  if (existing) {
    db.update(stayRequests)
      .set({ ...stay, updatedAt: new Date() })
      .where(eq(stayRequests.id, existing.id))
      .run();
  } else {
    db.insert(stayRequests).values({ id: newId('sty'), leadId, isPrimary: true, ...stay }).run();
  }

  db.update(leads)
    .set({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      rooms: stay.rooms,
      adults: stay.adults,
      children: stay.children,
      roomPreference: stay.roomPreference ?? null,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))
    .run();
}

/** Next best action for a lead, used for the cockpit's single primary CTA. */
export function nextAction(stage: string, status: string) {
  if (status !== 'open') return { label: 'Reopen lead', href: null, kind: 'reopen' as const };
  switch (stage) {
    case 'new_inquiry':
      return { label: 'Reply and qualify', href: null, kind: 'qualify' as const };
    case 'assigned':
      return { label: 'Complete qualification', href: null, kind: 'qualify' as const };
    case 'qualified':
      return { label: 'Check availability', href: null, kind: 'availability' as const };
    case 'availability_checked':
      return { label: 'Build quotation', href: null, kind: 'quote' as const };
    case 'quotation_sent':
    case 'follow_up':
      return { label: 'Request reservation', href: null, kind: 'reserve' as const };
    case 'deposit_pending':
      return { label: 'Update deposit status', href: null, kind: 'deposit' as const };
    default:
      return { label: 'Open guest profile', href: null, kind: 'guest' as const };
  }
}

export function leadStageOptions() {
  return LEAD_STAGES.map((s) => ({ key: s.key, label: s.label, hint: s.hint }));
}
