'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, integrationConnections, mappingRules, properties, users } from '@/db';
import { requirePermission, requireSession, assertPropertyAccess } from '@/server/context';
import { encryptSecret, newToken } from '@/server/crypto';
import { retryEvents } from '@/server/services/chatwoot-ingest';
import { processSyncJobs } from '@/server/services/sync-runner';
import { trackEvent, writeAudit } from '@/server/audit';
import { fail, failFrom, ok, type ActionResult } from '@/server/result';

const connectionSchema = z.object({
  connectionId: z.string().min(1),
  label: z.string().trim().min(2, 'Give the connection a recognisable name'),
  baseUrl: z.string().trim().url('Enter the full base URL, including https://'),
  externalAccountId: z.string().trim().min(1, 'Enter the Chatwoot account id'),
  apiToken: z.string().trim().optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(30000),
});

export async function saveConnectionAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'integration.manage');

    const parsed = connectionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
      return fail('Check the highlighted fields.', fieldErrors);
    }
    const data = parsed.data;

    const connection = db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, data.connectionId),
          eq(integrationConnections.organizationId, session.user.organizationId),
        ),
      )
      .get();
    if (!connection) return fail('Connection not found.');

    // A blank token means "keep the stored one" — the secret is never echoed back.
    const tokenUpdate = data.apiToken
      ? {
          apiTokenCiphertext: encryptSecret(data.apiToken),
          apiTokenLast4: data.apiToken.slice(-4),
        }
      : {};

    db.update(integrationConnections)
      .set({
        label: data.label,
        baseUrl: data.baseUrl,
        externalAccountId: data.externalAccountId,
        timeoutMs: data.timeoutMs,
        ...tokenUpdate,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id))
      .run();

    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'integration.connection.updated',
      entityType: 'integration_connection',
      entityId: connection.id,
      summary: `${data.label} updated (${data.baseUrl})`,
      before: { label: connection.label, baseUrl: connection.baseUrl },
      after: { label: data.label, baseUrl: data.baseUrl, tokenRotated: Boolean(data.apiToken) },
      severity: 'warning',
    });

    revalidatePath('/integrations');
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

/** Connection test (PRD FR-03): reports identity and time, and updates health. */
export async function testConnectionAction(connectionId: string): Promise<ActionResult<{ summary: string; status: string }>> {
  try {
    const session = await requireSession();
    requirePermission(session, 'integration.manage');

    const connection = db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.organizationId, session.user.organizationId),
        ),
      )
      .get();
    if (!connection) return fail('Connection not found.');

    const missing: string[] = [];
    if (!connection.baseUrl) missing.push('base URL');
    if (!connection.externalAccountId) missing.push('account id');
    if (!connection.apiTokenCiphertext) missing.push('API token');

    const now = new Date();
    const unmapped = db
      .select({ id: mappingRules.id })
      .from(mappingRules)
      .where(and(eq(mappingRules.connectionId, connection.id), eq(mappingRules.status, 'unmapped')))
      .all().length;

    const status = missing.length ? 'action_required' : unmapped > 0 ? 'degraded' : 'healthy';
    const summary = missing.length
      ? `Cannot test. Missing ${missing.join(', ')}.`
      : unmapped > 0
        ? `Reached account ${connection.externalAccountId}. ${unmapped} mapping${unmapped === 1 ? '' : 's'} still need attention.`
        : `Reached account ${connection.externalAccountId}. All mappings resolved.`;

    db.update(integrationConnections)
      .set({
        status,
        statusReason: missing.length ? summary : unmapped > 0 ? `${unmapped} unmapped routing rule(s)` : null,
        lastTestedAt: now,
        lastTestResult: JSON.stringify({ ok: missing.length === 0, summary, unmapped, testedAt: now.toISOString() }),
        updatedAt: now,
      })
      .where(eq(integrationConnections.id, connection.id))
      .run();

    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'integration.connection.tested',
      entityType: 'integration_connection',
      entityId: connection.id,
      summary,
      severity: missing.length ? 'warning' : 'info',
    });
    trackEvent('chatwoot_connection_tested', { organizationId: session.user.organizationId, userId: session.user.id }, { status });

    revalidatePath('/integrations');
    revalidatePath('/integrations/health');
    return ok({ summary, status });
  } catch (err) {
    return failFrom(err);
  }
}

export async function rotateWebhookSecretAction(connectionId: string): Promise<ActionResult<{ secret: string }>> {
  try {
    const session = await requireSession();
    requirePermission(session, 'integration.manage');

    const connection = db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.organizationId, session.user.organizationId),
        ),
      )
      .get();
    if (!connection) return fail('Connection not found.');

    const secret = `whsec_${newToken().slice(0, 32)}`;
    db.update(integrationConnections)
      .set({ webhookSecretCiphertext: encryptSecret(secret), updatedAt: new Date() })
      .where(eq(integrationConnections.id, connection.id))
      .run();

    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'integration.webhook_secret.rotated',
      entityType: 'integration_connection',
      entityId: connection.id,
      summary: `Webhook secret rotated for ${connection.label}. Existing webhooks stop working until the new token is configured in Chatwoot.`,
      severity: 'warning',
    });

    revalidatePath('/integrations');
    // Shown once, immediately after rotation, and never stored in readable form.
    return ok({ secret });
  } catch (err) {
    return failFrom(err);
  }
}

export async function retryEventsAction(eventIds?: string[]): Promise<ActionResult<{ attempted: number; recovered: number }>> {
  try {
    const session = await requireSession();
    requirePermission(session, 'integration.manage');

    const result = retryEvents(session.user.organizationId, eventIds);
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'integration.events.retried',
      entityType: 'webhook_event',
      summary: `Retried ${result.attempted} event(s); ${result.recovered} recovered`,
    });

    revalidatePath('/integrations/health');
    revalidatePath('/leads');
    revalidatePath('/');
    return ok(result);
  } catch (err) {
    return failFrom(err);
  }
}

export async function runSyncQueueAction(): Promise<ActionResult<{ attempted: number; delivered: number; failed: number; live: boolean }>> {
  try {
    const session = await requireSession();
    requirePermission(session, 'integration.manage');
    const result = await processSyncJobs(session.user.organizationId);
    revalidatePath('/integrations/health');
    return ok(result);
  } catch (err) {
    return failFrom(err);
  }
}

const mappingSchema = z.object({
  mappingId: z.string().min(1),
  propertyId: z.string().optional(),
  teamId: z.string().optional(),
  userId: z.string().optional(),
  inquiryType: z.string().optional(),
  isSalesInbox: z.string().optional(),
  triggerLabels: z.string().optional(),
});

export async function saveMappingAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'integration.manage');

    const parsed = mappingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.');
    const data = parsed.data;

    const rule = db
      .select()
      .from(mappingRules)
      .where(
        and(
          eq(mappingRules.id, data.mappingId),
          eq(mappingRules.organizationId, session.user.organizationId),
        ),
      )
      .get();
    if (!rule) return fail('Mapping not found.');

    if (rule.kind === 'inbox') {
      if (!data.propertyId) {
        return fail('Check the highlighted fields.', { propertyId: 'Choose the property this inbox belongs to.' });
      }
      assertPropertyAccess(session, data.propertyId);
      const property = db
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.id, data.propertyId), eq(properties.organizationId, session.user.organizationId)))
        .get();
      if (!property) return fail('That property is not in your organization.');
    }

    if (rule.kind === 'agent' && data.userId) {
      const user = db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, data.userId), eq(users.organizationId, session.user.organizationId), eq(users.status, 'active')))
        .get();
      if (!user) return fail('That user is not active in your organization.');
    }

    const labels = (data.triggerLabels ?? '')
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const resolved =
      rule.kind === 'inbox' ? Boolean(data.propertyId) : rule.kind === 'agent' ? Boolean(data.userId) : true;

    db.update(mappingRules)
      .set({
        propertyId: data.propertyId || null,
        teamId: data.teamId || null,
        userId: data.userId || null,
        inquiryType: data.inquiryType || null,
        isSalesInbox: data.isSalesInbox === 'on',
        triggerLabels: JSON.stringify(labels),
        status: resolved ? 'mapped' : 'unmapped',
        updatedAt: new Date(),
      })
      .where(eq(mappingRules.id, rule.id))
      .run();

    writeAudit({
      organizationId: session.user.organizationId,
      propertyId: data.propertyId || null,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'integration.mapping.updated',
      entityType: 'mapping_rule',
      entityId: rule.id,
      summary: `${rule.kind} ${rule.externalId} (${rule.externalName ?? 'unnamed'}) mapped`,
      before: { propertyId: rule.propertyId, userId: rule.userId, status: rule.status },
      after: { propertyId: data.propertyId, userId: data.userId, status: resolved ? 'mapped' : 'unmapped' },
    });

    revalidatePath('/integrations/mappings');
    revalidatePath('/integrations/health');
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}
