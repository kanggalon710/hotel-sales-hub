import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, integrationConnections, syncJobs } from '@/db';
import { decryptSecret } from '@/server/crypto';
import { writeAudit } from '@/server/audit';
import { parseJson } from '@/lib/utils';

const ENDPOINTS: Record<string, (accountId: string, target: string) => string> = {
  update_conversation_attributes: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/custom_attributes`,
  update_contact_attributes: (a, t) => `/api/v1/accounts/${a}/contacts/${t}`,
  add_label: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/labels`,
  send_message: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/messages`,
  private_note: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/messages`,
  assign: (a, t) => `/api/v1/accounts/${a}/conversations/${t}/assignments`,
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
        const path = ENDPOINTS[job.kind]?.(connection.externalAccountId ?? '1', job.targetExternalId);
        if (!token || !connection.baseUrl || !path) throw new Error('Connection is missing a base URL, token, or endpoint mapping.');

        const response = await fetch(`${connection.baseUrl.replace(/\/$/, '')}${path}`, {
          method: 'POST',
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
        if (!response.ok) throw new Error(`Chatwoot responded ${response.status}`);
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
