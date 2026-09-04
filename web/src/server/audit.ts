import 'server-only';
import { db, auditLogs, productEvents } from '@/db';
import { newId } from './crypto';

type AuditInput = {
  organizationId?: string | null;
  propertyId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorType?: 'user' | 'system' | 'integration';
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  severity?: 'info' | 'warning' | 'action_required' | 'critical';
};

/** Append-only audit trail (PRD FR-12). Never throws into the caller's path. */
export function writeAudit(input: AuditInput) {
  try {
    db.insert(auditLogs)
      .values({
        id: newId('aud'),
        organizationId: input.organizationId ?? null,
        propertyId: input.propertyId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorName: input.actorName ?? null,
        actorType: input.actorType ?? 'user',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
        before: input.before === undefined ? null : JSON.stringify(input.before),
        after: input.after === undefined ? null : JSON.stringify(input.after),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        correlationId: input.correlationId ?? null,
        severity: input.severity ?? 'info',
      })
      .run();
  } catch (err) {
    console.error('[audit] failed to persist entry', { action: input.action, err });
  }
}

/** Product analytics stream from PRD 18.1. */
export function trackEvent(
  name: string,
  ctx: {
    organizationId?: string | null;
    propertyId?: string | null;
    userId?: string | null;
    correlationId?: string | null;
  } = {},
  properties?: Record<string, unknown>,
) {
  try {
    db.insert(productEvents)
      .values({
        id: newId('evt'),
        organizationId: ctx.organizationId ?? null,
        propertyId: ctx.propertyId ?? null,
        userId: ctx.userId ?? null,
        name,
        properties: properties ? JSON.stringify(properties) : null,
        correlationId: ctx.correlationId ?? null,
      })
      .run();
  } catch (err) {
    console.error('[analytics] failed to persist event', { name, err });
  }
}
