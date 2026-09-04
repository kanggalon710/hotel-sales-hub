import 'server-only';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  contacts, conversationReferences, db, deadLetterEvents, externalIdentityMappings,
  integrationConnections, leads, mappingRules, properties, tasks, webhookEvents,
} from '@/db';
import { LABEL_ROOM_INQUIRY, MAX_WEBHOOK_ATTEMPTS } from '@/lib/constants';
import { normalizeEmail, normalizePhone } from '@/lib/phone';
import { fingerprint, newId } from '@/server/crypto';
import { trackEvent, writeAudit } from '@/server/audit';
import { logActivity } from './leads';
import { parseJson } from '@/lib/utils';

/* --------------------------------- types --------------------------------- */

export type ChatwootPayload = {
  event?: string;
  id?: number | string;
  account?: { id?: number | string };
  inbox?: { id?: number | string; name?: string; channel_type?: string };
  /**
   * Untuk `conversation_updated` dan `conversation_status_changed`, Chatwoot
   * menyebar atribut percakapan di tingkat atas, sehingga id inbox dan kanalnya
   * ada di akar payload, bukan di dalam `inbox` maupun `conversation`.
   * https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks
   */
  inbox_id?: number | string;
  channel?: string;
  conversation?: {
    id?: number | string;
    status?: string;
    inbox_id?: number | string;
    labels?: string[];
    meta?: { assignee?: { id?: number | string; name?: string } };
  };
  contact?: { id?: number | string; name?: string; phone_number?: string; email?: string; identifier?: string };
  sender?: { id?: number | string; name?: string; phone_number?: string; email?: string; type?: string };
  content?: string;
  message_type?: string | number;
  created_at?: string | number;
  labels?: string[];
  status?: string;
  assignee?: { id?: number | string; name?: string };
  changed_attributes?: unknown;
};

export type IngestOutcome = {
  status: 'processed' | 'duplicate' | 'ignored' | 'failed' | 'dead_letter';
  summary: string;
  leadId?: string | null;
  eventId: string;
};

const str = (v: unknown) => (v === undefined || v === null ? null : String(v));

/**
 * Step 1-4 of PRD 10.3: receive, record, deduplicate, persist the envelope.
 * Returns the stored event; a replay of the same external identity is recorded
 * as a duplicate and produces no second business effect.
 */
export function recordWebhookEvent(input: {
  connectionId: string | null;
  organizationId: string | null;
  payload: ChatwootPayload;
  rawBody: string;
  correlationId: string;
}) {
  const eventType = input.payload.event ?? 'unknown';
  const accountId = str(input.payload.account?.id);

  // Identity is derived from the entity the event is about, not the wall clock,
  // so a retried delivery collapses onto the same fingerprint.
  const identity = [
    'chatwoot',
    accountId,
    eventType,
    str(input.payload.id),
    str(input.payload.conversation?.id),
    str(input.payload.contact?.id),
    str(input.payload.created_at),
  ];
  const fp = fingerprint(identity);

  const existing = db.select().from(webhookEvents).where(eq(webhookEvents.fingerprint, fp)).get();
  if (existing) {
    db.insert(webhookEvents)
      .values({
        id: newId('whe'),
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        provider: 'chatwoot',
        eventType,
        fingerprint: `${fp}-dup-${Date.now()}`,
        payload: input.rawBody,
        externalAccountId: accountId,
        correlationId: input.correlationId,
        status: 'duplicate',
        attempts: 0,
        resultSummary: `Duplicate of ${existing.id}, no business effect applied`,
        processedAt: new Date(),
      })
      .run();
    return { event: existing, duplicate: true as const };
  }

  const id = newId('whe');
  db.insert(webhookEvents)
    .values({
      id,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      provider: 'chatwoot',
      eventType,
      fingerprint: fp,
      payload: input.rawBody,
      externalAccountId: accountId,
      correlationId: input.correlationId,
      status: 'received',
      attempts: 0,
    })
    .run();

  return { event: db.select().from(webhookEvents).where(eq(webhookEvents.id, id)).get()!, duplicate: false as const };
}

/**
 * Steps 5-9: normalize, resolve, apply idempotently, then either succeed or
 * schedule a retry / move to the dead-letter queue.
 */
export function processWebhookEvent(eventId: string): IngestOutcome {
  const event = db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).get();
  if (!event) return { status: 'failed', summary: 'Event not found.', eventId };

  const attempts = event.attempts + 1;
  const payload = parseJson<ChatwootPayload>(event.payload, {});

  try {
    const result = applyEvent(event.id, event.connectionId, payload);

    db.update(webhookEvents)
      .set({
        status: result.status === 'ignored' ? 'ignored' : event.status === 'dead_letter' ? 'recovered' : 'processed',
        attempts,
        processedAt: new Date(),
        resultSummary: result.summary,
        lastError: null,
        nextRetryAt: null,
        organizationId: result.organizationId ?? event.organizationId,
      })
      .where(eq(webhookEvents.id, event.id))
      .run();

    // A previously dead-lettered event that now succeeds closes its DLQ entry.
    db.update(deadLetterEvents)
      .set({ resolvedAt: new Date() })
      .where(and(eq(deadLetterEvents.webhookEventId, event.id), isNull(deadLetterEvents.resolvedAt)))
      .run();

    if (event.connectionId) {
      db.update(integrationConnections)
        .set({ lastEventAt: new Date() })
        .where(eq(integrationConnections.id, event.connectionId))
        .run();
    }

    trackEvent('webhook_processed', { organizationId: result.organizationId }, { eventType: event.eventType });
    return { status: result.status === 'ignored' ? 'ignored' : 'processed', summary: result.summary, leadId: result.leadId, eventId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown processing error';
    const actionRequired = err instanceof MappingError ? err.actionRequired : 'Inspect the payload and retry once the cause is fixed.';
    const exhausted = attempts >= MAX_WEBHOOK_ATTEMPTS || err instanceof MappingError;

    db.update(webhookEvents)
      .set({
        status: exhausted ? 'dead_letter' : 'failed',
        attempts,
        lastError: message,
        processedAt: new Date(),
        // Exponential backoff between retries.
        nextRetryAt: exhausted ? null : new Date(Date.now() + Math.min(2 ** attempts, 60) * 1000),
      })
      .where(eq(webhookEvents.id, event.id))
      .run();

    if (exhausted) {
      const open = db
        .select({ id: deadLetterEvents.id })
        .from(deadLetterEvents)
        .where(and(eq(deadLetterEvents.webhookEventId, event.id), isNull(deadLetterEvents.resolvedAt)))
        .get();
      if (!open) {
        db.insert(deadLetterEvents)
          .values({
            id: newId('dlq'),
            organizationId: event.organizationId,
            webhookEventId: event.id,
            reason: message,
            actionRequired,
          })
          .run();

        if (event.organizationId) {
          writeAudit({
            organizationId: event.organizationId,
            actorType: 'integration',
            actorName: 'Chatwoot connector',
            action: 'integration.event.dead_letter',
            entityType: 'webhook_event',
            entityId: event.id,
            summary: message,
            severity: 'action_required',
            correlationId: event.correlationId,
          });
        }
      }
    }

    trackEvent('webhook_failed', { organizationId: event.organizationId }, { eventType: event.eventType, message });
    return { status: exhausted ? 'dead_letter' : 'failed', summary: message, eventId };
  }
}

/** Raised when a human must fix configuration; retrying unchanged cannot help. */
class MappingError extends Error {
  readonly actionRequired: string;
  constructor(message: string, actionRequired: string) {
    super(message);
    this.actionRequired = actionRequired;
    this.name = 'MappingError';
  }
}

type ApplyResult = {
  status: 'processed' | 'ignored';
  summary: string;
  organizationId: string | null;
  leadId?: string | null;
};

function applyEvent(eventId: string, connectionId: string | null, payload: ChatwootPayload): ApplyResult {
  const accountId = str(payload.account?.id);

  const connection = connectionId
    ? db.select().from(integrationConnections).where(eq(integrationConnections.id, connectionId)).get()
    : accountId
      ? db
          .select()
          .from(integrationConnections)
          .where(
            and(
              eq(integrationConnections.provider, 'chatwoot'),
              eq(integrationConnections.externalAccountId, accountId),
              eq(integrationConnections.active, true),
            ),
          )
          .get()
      : undefined;

  if (!connection) {
    throw new MappingError(
      `No active Chatwoot connection matches account ${accountId ?? 'unknown'}`,
      'Connect this Chatwoot account under Integrations, then retry the event.',
    );
  }

  const orgId = connection.organizationId;
  const eventType = payload.event ?? 'unknown';

  const externalConversationId = str(payload.conversation?.id) ?? (eventType.startsWith('conversation') ? str(payload.id) : null);
  // Tiga bentuk, satu arti. Tanpa cabang ketiga, setiap event tingkat percakapan
  // dari Chatwoot asli berakhir di dead letter sebagai "Inbox unknown", betapa
  // pun benarnya pemetaan inbox itu dibuat.
  const externalInboxId =
    str(payload.inbox?.id) ?? str(payload.conversation?.inbox_id) ?? str(payload.inbox_id) ?? null;

  /* ------------------------------ contact events ------------------------------ */

  const contactPayload = payload.contact ?? (payload.sender?.type === 'contact' ? payload.sender : null);

  if (eventType === 'contact_created' || eventType === 'contact_updated') {
    if (!contactPayload) return { status: 'ignored', summary: 'Contact event without a contact body.', organizationId: orgId };
    const contact = resolveContact(orgId, connection.id, contactPayload);
    return {
      status: 'processed',
      summary: `Contact ${contact.fullName} ${contact.created ? 'created' : 'updated'} from Chatwoot`,
      organizationId: orgId,
    };
  }

  if (!externalConversationId) {
    return { status: 'ignored', summary: `Event "${eventType}" carries no conversation reference.`, organizationId: orgId };
  }

  /* ------------------------------ inbox mapping ------------------------------ */

  const existingConversation = db
    .select()
    .from(conversationReferences)
    .where(
      and(
        eq(conversationReferences.connectionId, connection.id),
        eq(conversationReferences.externalConversationId, externalConversationId),
      ),
    )
    .get();

  const inboxRule = externalInboxId
    ? db
        .select()
        .from(mappingRules)
        .where(
          and(
            eq(mappingRules.connectionId, connection.id),
            eq(mappingRules.kind, 'inbox'),
            eq(mappingRules.externalId, externalInboxId),
          ),
        )
        .get()
    : undefined;

  // No random default property: an unmapped inbox is a configuration problem.
  if (!existingConversation && (!inboxRule || inboxRule.status !== 'mapped' || !inboxRule.propertyId)) {
    throw new MappingError(
      `Inbox ${externalInboxId ?? 'unknown'} (${payload.inbox?.name ?? 'unnamed'}) is not mapped to a property`,
      'Map this inbox to a property in Integrations → Mappings, then retry.',
    );
  }

  const propertyId = existingConversation?.propertyId ?? inboxRule!.propertyId!;
  const property = db.select().from(properties).where(eq(properties.id, propertyId)).get();
  if (!property || property.organizationId !== orgId) {
    throw new MappingError(
      'The mapped property no longer exists in this organization',
      'Re-map the inbox to an active property, then retry.',
    );
  }

  /* ------------------------------ agent mapping ------------------------------ */

  const assigneeExternalId = str(payload.conversation?.meta?.assignee?.id) ?? str(payload.assignee?.id);
  let assignedUserId: string | null = existingConversation?.assignedUserId ?? null;

  if (assigneeExternalId) {
    const agentRule = db
      .select()
      .from(mappingRules)
      .where(
        and(
          eq(mappingRules.connectionId, connection.id),
          eq(mappingRules.kind, 'agent'),
          eq(mappingRules.externalId, assigneeExternalId),
        ),
      )
      .get();

    if (!agentRule || agentRule.status !== 'mapped' || !agentRule.userId) {
      throw new MappingError(
        `Assigned agent ${assigneeExternalId} is not mapped to a CRM user`,
        'Map this Chatwoot agent to a CRM user with access to this property, then retry.',
      );
    }
    assignedUserId = agentRule.userId;
  }

  /* --------------------------------- contact --------------------------------- */

  const contactSource = contactPayload ?? payload.sender ?? null;
  const contact = contactSource
    ? resolveContact(orgId, connection.id, contactSource)
    : existingConversation?.contactId
      ? { id: existingConversation.contactId, fullName: 'Existing guest', created: false, ambiguous: false }
      : null;

  if (!contact) {
    return { status: 'ignored', summary: 'Conversation event without an identifiable contact.', organizationId: orgId };
  }

  /* ------------------------------ conversation ------------------------------ */

  const labels = payload.conversation?.labels ?? payload.labels ?? [];
  const status = payload.conversation?.status ?? payload.status ?? null;
  const isIncoming = payload.message_type === 'incoming' || payload.message_type === 0;
  const now = new Date();

  const conversationId = existingConversation?.id ?? newId('cnv');
  const deepLink = connection.baseUrl
    ? `${connection.baseUrl.replace(/\/$/, '')}/app/accounts/${connection.externalAccountId ?? '1'}/conversations/${externalConversationId}`
    : null;

  if (existingConversation) {
    db.update(conversationReferences)
      .set({
        conversationStatus: status ?? existingConversation.conversationStatus,
        labels: labels.length ? JSON.stringify(labels) : existingConversation.labels,
        assignedExternalAgentId: assigneeExternalId ?? existingConversation.assignedExternalAgentId,
        assignedUserId: assignedUserId ?? existingConversation.assignedUserId,
        contactId: existingConversation.contactId ?? contact.id,
        lastMessageAt: payload.content ? now : existingConversation.lastMessageAt,
        lastMessagePreview: payload.content ? payload.content.slice(0, 240) : existingConversation.lastMessagePreview,
        lastMessageFrom: payload.content ? (isIncoming ? 'contact' : 'agent') : existingConversation.lastMessageFrom,
        updatedAt: now,
      })
      .where(eq(conversationReferences.id, existingConversation.id))
      .run();
  } else {
    db.insert(conversationReferences)
      .values({
        id: conversationId,
        organizationId: orgId,
        connectionId: connection.id,
        externalConversationId,
        externalInboxId,
        inboxName: inboxRule?.externalName ?? payload.inbox?.name ?? null,
        channel: inboxRule?.channel ?? payload.inbox?.channel_type ?? payload.channel ?? null,
        contactId: contact.id,
        propertyId,
        conversationStatus: status,
        labels: JSON.stringify(labels),
        assignedExternalAgentId: assigneeExternalId,
        assignedUserId,
        lastMessageAt: payload.content ? now : null,
        lastMessagePreview: payload.content?.slice(0, 240) ?? null,
        lastMessageFrom: payload.content ? (isIncoming ? 'contact' : 'agent') : null,
        deepLink,
      })
      .run();
  }

  /* -------------------------------- lead rules -------------------------------- */

  const triggerLabels = inboxRule ? parseJson<string[]>(inboxRule.triggerLabels, []) : [];
  const hasTriggerLabel = labels.some(
    (l) => l === LABEL_ROOM_INQUIRY || triggerLabels.includes(l),
  );
  const fromSalesInbox = Boolean(inboxRule?.isSalesInbox);
  const eligible = fromSalesInbox || hasTriggerLabel;

  const linkedLead = db
    .select()
    .from(leads)
    .where(and(eq(leads.primaryConversationId, conversationId), eq(leads.status, 'open')))
    .get();

  if (linkedLead) {
    if (assignedUserId && !linkedLead.ownerUserId) {
      db.update(leads).set({ ownerUserId: assignedUserId, stage: 'assigned', updatedAt: now }).where(eq(leads.id, linkedLead.id)).run();
    }
    if (isIncoming && payload.content) {
      logActivity({
        organizationId: orgId, propertyId, leadId: linkedLead.id, contactId: contact.id,
        type: 'message_received', title: 'Guest replied in Chatwoot',
        body: payload.content.slice(0, 240), actorType: 'system', actorName: 'Chatwoot connector', source: 'chatwoot',
      });
    }
    return {
      status: 'processed',
      summary: `Context updated on existing lead ${linkedLead.code}`,
      organizationId: orgId,
      leadId: linkedLead.id,
    };
  }

  if (!eligible) {
    return {
      status: 'processed',
      summary: `Conversation stored without a lead, because the inbox is not a sales inbox and no trigger label is present`,
      organizationId: orgId,
    };
  }

  // Before creating: an active lead for the same contact and property is the same opportunity.
  const openForContact = db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, orgId),
        eq(leads.contactId, contact.id),
        eq(leads.propertyId, propertyId),
        eq(leads.status, 'open'),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .get();

  if (openForContact) {
    if (!openForContact.primaryConversationId) {
      db.update(leads).set({ primaryConversationId: conversationId, updatedAt: now }).where(eq(leads.id, openForContact.id)).run();
    }
    logActivity({
      organizationId: orgId, propertyId, leadId: openForContact.id, contactId: contact.id,
      type: 'conversation_linked', title: 'New conversation linked to this lead',
      body: `Conversation #${externalConversationId} from ${inboxRule?.externalName ?? 'Chatwoot'}`,
      actorType: 'system', actorName: 'Chatwoot connector', source: 'chatwoot',
    });
    trackEvent('conversation_linked', { organizationId: orgId, propertyId }, { leadId: openForContact.id });
    return {
      status: 'processed',
      summary: `Linked to existing open lead ${openForContact.code} for this guest and property`,
      organizationId: orgId,
      leadId: openForContact.id,
    };
  }

  const leadId = createLead({
    organizationId: orgId,
    propertyId,
    contactId: contact.id,
    conversationId,
    ownerUserId: assignedUserId,
    teamId: inboxRule?.teamId ?? null,
    channel: inboxRule?.channel ?? payload.inbox?.channel_type ?? payload.channel ?? null,
    source: inboxRule?.channel ?? 'chatwoot',
    inquiryType: inboxRule?.inquiryType ?? 'fit',
    slaMinutes: 15,
    inboxName: inboxRule?.externalName ?? payload.inbox?.name ?? 'Chatwoot',
    firstMessage: payload.content ?? null,
  });

  // Ambiguous identity is flagged for a human rather than merged automatically.
  if (contact.ambiguous) {
    db.insert(tasks)
      .values({
        id: newId('tsk'),
        organizationId: orgId,
        propertyId,
        contactId: contact.id,
        leadId,
        assigneeUserId: null,
        title: `Review possible duplicate guest: ${contact.fullName}`,
        description: 'More than one existing contact matched this phone or email. Confirm identity before merging.',
        type: 'merge_review',
        priority: 'normal',
        status: 'open',
        dueAt: new Date(Date.now() + 2 * 86_400_000),
      })
      .run();
  }

  return { status: 'processed', summary: `Created lead from ${inboxRule?.externalName ?? 'Chatwoot'}`, organizationId: orgId, leadId };
}

/**
 * Identity resolution (PRD FR-05): exact normalized phone/email match links to
 * an existing guest; two different candidates are reported as ambiguous rather
 * than merged.
 */
function resolveContact(
  organizationId: string,
  connectionId: string,
  payload: NonNullable<ChatwootPayload['contact']>,
) {
  const externalId = str(payload.id);
  const phone = normalizePhone(payload.phone_number);
  const email = normalizeEmail(payload.email);
  const name = payload.name?.trim() || phone || email || 'Unknown guest';

  if (externalId) {
    const mapped = db
      .select({ internalId: externalIdentityMappings.internalId })
      .from(externalIdentityMappings)
      .where(
        and(
          eq(externalIdentityMappings.connectionId, connectionId),
          eq(externalIdentityMappings.entityType, 'contact'),
          eq(externalIdentityMappings.externalId, externalId),
        ),
      )
      .get();
    if (mapped) {
      const existing = db.select().from(contacts).where(eq(contacts.id, mapped.internalId)).get();
      if (existing) {
        db.update(contacts)
          .set({
            fullName: payload.name?.trim() || existing.fullName,
            phoneNormalized: phone ?? existing.phoneNormalized,
            phoneRaw: payload.phone_number ?? existing.phoneRaw,
            email: email ?? existing.email,
            emailNormalized: email ?? existing.emailNormalized,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, existing.id))
          .run();
        return { id: existing.id, fullName: existing.fullName, created: false, ambiguous: false };
      }
    }
  }

  const candidates =
    phone || email
      ? db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.organizationId, organizationId),
              isNull(contacts.mergedIntoContactId),
              or(
                ...(phone ? [eq(contacts.phoneNormalized, phone)] : []),
                ...(email ? [eq(contacts.emailNormalized, email)] : []),
              )!,
            ),
          )
          .all()
      : [];

  const distinct = new Set(candidates.map((c) => c.id));

  if (candidates.length > 0) {
    const survivor = candidates[0];
    db.update(contacts)
      .set({
        phoneNormalized: survivor.phoneNormalized ?? phone,
        emailNormalized: survivor.emailNormalized ?? email,
        email: survivor.email ?? payload.email ?? null,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, survivor.id))
      .run();
    linkExternalContact(organizationId, connectionId, externalId, survivor.id);
    return { id: survivor.id, fullName: survivor.fullName, created: false, ambiguous: distinct.size > 1 };
  }

  const id = newId('cnt');
  db.insert(contacts)
    .values({
      id,
      organizationId,
      fullName: name,
      phoneNormalized: phone,
      phoneRaw: payload.phone_number ?? null,
      email: payload.email ?? null,
      emailNormalized: email,
      consentStatus: 'unknown',
      preferences: '[]',
    })
    .run();
  linkExternalContact(organizationId, connectionId, externalId, id);
  return { id, fullName: name, created: true, ambiguous: false };
}

function linkExternalContact(
  organizationId: string,
  connectionId: string,
  externalId: string | null,
  internalId: string,
) {
  if (!externalId) return;
  const existing = db
    .select({ id: externalIdentityMappings.id })
    .from(externalIdentityMappings)
    .where(
      and(
        eq(externalIdentityMappings.connectionId, connectionId),
        eq(externalIdentityMappings.entityType, 'contact'),
        eq(externalIdentityMappings.externalId, externalId),
      ),
    )
    .get();
  if (existing) {
    db.update(externalIdentityMappings)
      .set({ internalId, lastSyncedAt: new Date() })
      .where(eq(externalIdentityMappings.id, existing.id))
      .run();
    return;
  }
  db.insert(externalIdentityMappings)
    .values({
      id: newId('eim'),
      organizationId,
      connectionId,
      provider: 'chatwoot',
      entityType: 'contact',
      externalId,
      internalId,
      lastSyncedAt: new Date(),
    })
    .run();
}

function createLead(input: {
  organizationId: string;
  propertyId: string;
  contactId: string;
  conversationId: string;
  ownerUserId: string | null;
  teamId: string | null;
  channel: string | null;
  source: string | null;
  inquiryType: string;
  slaMinutes: number;
  inboxName: string;
  firstMessage: string | null;
}) {
  const count = db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.organizationId, input.organizationId))
    .all().length;
  const code = `LEAD-${String(count + 1).padStart(4, '0')}`;
  const id = newId('led');
  const now = new Date();

  db.insert(leads)
    .values({
      id,
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      contactId: input.contactId,
      primaryConversationId: input.conversationId,
      code,
      stage: input.ownerUserId ? 'assigned' : 'new_inquiry',
      status: 'open',
      inquiryType: input.inquiryType,
      source: input.source,
      channel: input.channel,
      ownerUserId: input.ownerUserId,
      teamId: input.teamId,
      probability: input.ownerUserId ? 20 : 10,
      estimatedValue: 0,
      currency: 'IDR',
      nextActionLabel: 'Send first response',
      slaFirstResponseDueAt: new Date(now.getTime() + input.slaMinutes * 60_000),
      lastActivityAt: now,
    })
    .run();

  logActivity({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    leadId: id,
    contactId: input.contactId,
    type: 'lead_created',
    title: 'Lead created from Chatwoot',
    body: `Matched sales rule on "${input.inboxName}". ${input.firstMessage ? `First message: “${input.firstMessage.slice(0, 160)}”` : ''}`,
    actorType: 'system',
    actorName: 'Chatwoot connector',
    source: 'chatwoot',
  });

  db.insert(tasks)
    .values({
      id: newId('tsk'),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      leadId: id,
      contactId: input.contactId,
      assigneeUserId: input.ownerUserId,
      title: `Respond to new inquiry ${code}`,
      type: 'follow_up',
      priority: 'high',
      status: 'open',
      dueAt: new Date(now.getTime() + input.slaMinutes * 60_000),
    })
    .run();

  writeAudit({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    actorType: 'integration',
    actorName: 'Chatwoot connector',
    action: 'lead.created',
    entityType: 'lead',
    entityId: id,
    summary: `${code} created from ${input.inboxName}`,
  });
  trackEvent('lead_created', { organizationId: input.organizationId, propertyId: input.propertyId }, { leadId: id });

  return id;
}

/** Admin-triggered retry after a mapping or configuration fix (PRD FR-04). */
export function retryEvents(organizationId: string, eventIds?: string[]) {
  const pending = db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.organizationId, organizationId),
        inArray(webhookEvents.status, ['failed', 'dead_letter']),
        ...(eventIds?.length ? [inArray(webhookEvents.id, eventIds)] : []),
      ),
    )
    .all();

  let recovered = 0;
  for (const e of pending) {
    const result = processWebhookEvent(e.id);
    if (result.status === 'processed' || result.status === 'ignored') recovered += 1;
  }
  return { attempted: pending.length, recovered };
}

/**
 * Tautan ke percakapan di Chatwoot, dibentuk saat ditampilkan.
 *
 * Sebelumnya tautan ini dibekukan ke dalam baris pada saat event masuk. Begitu
 * Base URL koneksi diubah - misalnya berpindah dari instance demo ke instance
 * sungguhan - setiap tautan lama tetap menunjuk host lama tanpa memberi tanda
 * apa pun, dan yang mengeklik hanya menemui domain yang tidak ada. Host adalah
 * milik koneksi, bukan milik percakapan, jadi dibaca dari koneksi setiap kali.
 */
export function conversationDeepLink(conversation: {
  connectionId: string;
  externalConversationId: string;
  deepLink?: string | null;
}) {
  const connection = db
    .select({ baseUrl: integrationConnections.baseUrl, accountId: integrationConnections.externalAccountId })
    .from(integrationConnections)
    .where(eq(integrationConnections.id, conversation.connectionId))
    .get();
  if (!connection?.baseUrl) return conversation.deepLink ?? null;
  const base = connection.baseUrl.replace(/\/$/, '');
  return `${base}/app/accounts/${connection.accountId ?? '1'}/conversations/${conversation.externalConversationId}`;
}
