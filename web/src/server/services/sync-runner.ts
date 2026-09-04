import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, integrationConnections, syncJobs } from '@/db';
import { decryptSecret } from '@/server/crypto';
import { writeAudit } from '@/server/audit';
import { parseJson } from '@/lib/utils';

/**
 * Chatwoot application API routes, with the method each one requires.
 *
 * The method is not uniform: conversation writes are POST, but updating a
 * contact is PUT. Sending POST to the contact route does not update anything,
 * so the method has to travel with the path rather than be assumed.
 * https://developers.chatwoot.com/api-reference/contacts/update-contact
 */
type Endpoint = { method: 'POST' | 'PUT'; path: (accountId: string, target: string) => string };

const ENDPOINTS: Record<string, Endpoint> = {
  update_conversation_attributes: { method: 'POST', path: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/custom_attributes` },
  update_contact_attributes: { method: 'PUT', path: (a, t) => `/api/v1/accounts/${a}/contacts/${t}` },
  add_label: { method: 'POST', path: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/labels` },
  send_message: { method: 'POST', path: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/messages` },
  private_note: { method: 'POST', path: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/messages` },
  assign: { method: 'POST', path: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/assignments` },
};

/**
 * Drains queued outbound writes to Chatwoot.
 *
 * Without CHATWOOT_LIVE=1 the jobs are marked delivered without a network call,
 * which is what the demo tenant runs on. The dispatch path is the same either
 * way, so pointing it at a real Chatwoot is a configuration change.
 */
export async function processSyncJobs(organizationId: string, limit = 25) {
  const live = process.env.CHATWOOT_LIVE === '1';
  const jobs = db
    .select()
    .from(syncJobs)
    .where(and(eq(syncJobs.organizationId, organizationId), eq(syncJobs.status, 'pending')))
    .orderBy(asc(syncJobs.createdAt))
    .limit(limit)
    .all();

  let delivered = 0;
  let failed = 0;

  for (const job of jobs) {
    const connection = db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, job.connectionId))
      .get();

    if (!connection || !connection.active) {
      db.update(syncJobs)
        .set({ status: 'failed', attempts: job.attempts + 1, lastError: 'Connection missing or disabled', processedAt: new Date() })
        .where(eq(syncJobs.id, job.id))
        .run();
      failed += 1;
      continue;
    }

    try {
      if (live) {
        const token = decryptSecret(connection.apiTokenCiphertext);
        const endpoint = ENDPOINTS[job.kind];
        const path = endpoint?.path(connection.externalAccountId ?? '1', job.targetExternalId);
        if (!token || !connection.baseUrl || !endpoint || !path) throw new Error('Connection is missing a base URL, token, or endpoint mapping.');

        const response = await fetch(`${connection.baseUrl.replace(/\/$/, '')}${path}`, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
            api_access_token: token,
            // Marks our own writes so the inbound connector can ignore the echo.
            'X-CRM-Source': 'hotel-sales-hub',
            'X-Idempotency-Key': job.idempotencyKey,
          },
          body: JSON.stringify(parseJson<Record<string, unknown>>(job.payload, {})),
          signal: AbortSignal.timeout(connection.timeoutMs),
        });
        if (!response.ok) {
          // Chatwoot explains the refusal in the body ("custom attribute
          // definition not found", "label not found"). A bare status code sends
          // whoever reads the dead-letter queue back to guessing.
          const detail = (await response.text().catch(() => '')).trim().slice(0, 300);
          throw new Error(`Chatwoot responded ${response.status}${detail ? `: ${detail}` : ''}`);
        }
      }

      db.update(syncJobs)
        .set({ status: 'success', attempts: job.attempts + 1, processedAt: new Date(), lastError: null })
        .where(eq(syncJobs.id, job.id))
        .run();
      delivered += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown delivery error';
      db.update(syncJobs)
        .set({ status: job.attempts + 1 >= 4 ? 'failed' : 'pending', attempts: job.attempts + 1, lastError: message, processedAt: new Date() })
        .where(eq(syncJobs.id, job.id))
        .run();
      failed += 1;
      writeAudit({
        organizationId,
        actorType: 'integration',
        actorName: 'Chatwoot connector',
        action: 'integration.outbound.failed',
        entityType: 'sync_job',
        entityId: job.id,
        summary: `Outbound ${job.kind} to conversation ${job.targetExternalId} failed: ${message}`,
        severity: 'warning',
      });
    }
  }

  return { attempted: jobs.length, delivered, failed, live };
}

export function pendingSyncCount(organizationId: string) {
  return db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(and(eq(syncJobs.organizationId, organizationId), inArray(syncJobs.status, ['pending'])))
    .all().length;
}
