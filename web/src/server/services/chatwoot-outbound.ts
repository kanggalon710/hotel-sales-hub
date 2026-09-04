import 'server-only';
import { and, eq } from 'drizzle-orm';
import { conversationReferences, db, integrationConnections, syncJobs } from '@/db';
import { newId } from '@/server/crypto';

export type OutboundKind =
  | 'update_contact_attributes'
  | 'update_conversation_attributes'
  | 'add_label'
  | 'send_message'
  | 'private_note'
  | 'assign';

/**
 * Queues an outbound CRM -> Chatwoot write (PRD 10.6). Every job carries an
 * idempotency key and a source marker so a replay cannot loop back into the
 * inbound connector or apply twice.
 *
 * Jobs are drained by `processSyncJobs`; nothing here talks to the network on
 * the request path.
 */
export function enqueueChatwootSync(input: {
  organizationId: string;
  connectionId: string;
  kind: OutboundKind;
  targetExternalId: string;
  payload: Record<string, unknown>;
  /** Stable per logical change, so retries and double-clicks collapse into one job. */
  idempotencyKey: string;
}) {
  const existing = db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(eq(syncJobs.idempotencyKey, input.idempotencyKey))
    .get();
  if (existing) return existing.id;

  const id = newId('syn');
  db.insert(syncJobs)
    .values({
      id,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      kind: input.kind,
      targetExternalId: input.targetExternalId,
      payload: JSON.stringify({ ...input.payload, _source: 'crm' }),
      idempotencyKey: input.idempotencyKey,
      status: 'pending',
    })
    .run();
  return id;
}

/** Conversation custom attributes the CRM owns (PRD 10.5). */
export function syncLeadContextToChatwoot(input: {
  organizationId: string;
  leadId: string;
  conversationId: string | null;
  attributes: Record<string, unknown>;
  reason: string;
}) {
  if (!input.conversationId) return;

  const conv = db
    .select({
      externalId: conversationReferences.externalConversationId,
      connectionId: conversationReferences.connectionId,
    })
    .from(conversationReferences)
    .where(eq(conversationReferences.id, input.conversationId))
    .get();
  if (!conv) return;

  const active = db
    .select({ id: integrationConnections.id })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.id, conv.connectionId), eq(integrationConnections.active, true)))
    .get();
  if (!active) return;

  enqueueChatwootSync({
    organizationId: input.organizationId,
    connectionId: conv.connectionId,
    kind: 'update_conversation_attributes',
    targetExternalId: conv.externalId,
    payload: input.attributes,
    idempotencyKey: `lead:${input.leadId}:${input.reason}:${JSON.stringify(input.attributes)}`.slice(0, 200),
  });
}
