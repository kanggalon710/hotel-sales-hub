import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db, deadLetterEvents, integrationConnections, syncJobs, webhookEvents } from '@/db';
import { requirePermission, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Metric, MetricStrip } from '@/components/ui/bits';
import { ListState } from '@/components/ui/states';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { HealthActions } from '@/components/integrations/health-actions';
import { formatDateTime, relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Integration health' };
export const dynamic = 'force-dynamic';

export default async function IntegrationHealthPage() {
  const session = await requireSession();
  requirePermission(session, 'integration.manage');
  const orgId = session.user.organizationId;
  const locale = session.organization.locale;

  const events = db
    .select({
      id: webhookEvents.id,
      eventType: webhookEvents.eventType,
      status: webhookEvents.status,
      attempts: webhookEvents.attempts,
      lastError: webhookEvents.lastError,
      resultSummary: webhookEvents.resultSummary,
      receivedAt: webhookEvents.receivedAt,
      correlationId: webhookEvents.correlationId,
      connectionLabel: integrationConnections.label,
    })
    .from(webhookEvents)
    .leftJoin(integrationConnections, eq(integrationConnections.id, webhookEvents.connectionId))
    .where(eq(webhookEvents.organizationId, orgId))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(60)
    .all();

  const deadLetters = db
    .select({
      id: deadLetterEvents.id,
      reason: deadLetterEvents.reason,
      actionRequired: deadLetterEvents.actionRequired,
      createdAt: deadLetterEvents.createdAt,
      eventId: deadLetterEvents.webhookEventId,
      eventType: webhookEvents.eventType,
      attempts: webhookEvents.attempts,
    })
    .from(deadLetterEvents)
    .innerJoin(webhookEvents, eq(webhookEvents.id, deadLetterEvents.webhookEventId))
    .where(and(eq(deadLetterEvents.organizationId, orgId), isNull(deadLetterEvents.resolvedAt)))
    .orderBy(desc(deadLetterEvents.createdAt))
    .all();

  const outbound = db
    .select({
      id: syncJobs.id, kind: syncJobs.kind, status: syncJobs.status, attempts: syncJobs.attempts,
      target: syncJobs.targetExternalId, lastError: syncJobs.lastError, createdAt: syncJobs.createdAt,
    })
    .from(syncJobs)
    .where(eq(syncJobs.organizationId, orgId))
    .orderBy(desc(syncJobs.createdAt))
    .limit(25)
    .all();

  const tally = db
    .select({ status: webhookEvents.status, count: sql<number>`count(*)` })
    .from(webhookEvents)
    .where(eq(webhookEvents.organizationId, orgId))
    .groupBy(webhookEvents.status)
    .all();
  const counts = Object.fromEntries(tally.map((t) => [t.status, Number(t.count)]));
  const processed = (counts.processed ?? 0) + (counts.recovered ?? 0) + (counts.ignored ?? 0);
  const totalHandled = processed + (counts.failed ?? 0) + (counts.dead_letter ?? 0);
  const successRate = totalHandled ? Math.round((processed / totalHandled) * 1000) / 10 : 100;
  const pendingOutbound = outbound.filter((o) => o.status === 'pending').length;

  return (
    <PageShell narrow>
      <Link href="/integrations" className="focus-ring tap inline-flex items-center gap-1.5 rounded text-[12px] text-ink-3 hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to integrations
      </Link>

      <PageHeader
        title="Integration health"
        description="Inbound events, failures that need a human, and the outbound queue back to Chatwoot."
        actions={<HealthActions deadLetterCount={deadLetters.length} pendingOutbound={pendingOutbound} />}
      />

      <MetricStrip>
        <Metric label="Processed" value={processed} sub="inbound events" tone="success" />
        <Metric label="Needs attention" value={deadLetters.length} sub="dead-lettered" tone={deadLetters.length ? 'danger' : 'neutral'} />
        <Metric label="Duplicates ignored" value={counts.duplicate ?? 0} sub="no double effect" />
        <Metric label="Success rate" value={`${successRate}%`} sub="excluding duplicates" tone={successRate >= 98 ? 'success' : 'warning'} />
      </MetricStrip>

      <Card>
        <CardHeader
          title="Needs attention"
          subtitle="These events created nothing. Fix the cause, then retry. Processing is idempotent, so a retry cannot duplicate work."
        />
        {deadLetters.length === 0 ? (
          <ListState
            title="Nothing in the dead-letter queue"
            description="Every inbound event has been processed or safely ignored."
          />
        ) : (
          <ul className="divide-y divide-border">
            {deadLetters.map((d) => (
              <li key={d.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <StatusBadge status="dead_letter" />
                      <span className="font-mono text-[11px] text-ink-3">{d.eventType}</span>
                    </p>
                    <p className="mt-1.5 text-[13px] text-ink">{d.reason}</p>
                    {d.actionRequired ? (
                      <p className="mt-1 rounded-md bg-warning-soft px-2 py-1.5 text-[12px] leading-5 text-warning-ink">
                        {d.actionRequired}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 font-mono text-[10px] text-ink-3">
                    {d.attempts} attempts · {relativeTime(d.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent inbound events" action={<span className="font-mono text-[11px] text-ink-3">{events.length} shown</span>} />
        {events.length === 0 ? (
          <ListState title="No events yet" description="Events appear here as soon as Chatwoot starts delivering to the webhook URL." />
        ) : (
          <TableScroll>
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Status</Th>
                  <Th>Result</Th>
                  <Th numeric>Attempts</Th>
                  <Th>Received</Th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <Tr key={e.id}>
                    <Td>
                      <span className="font-mono text-[12px] text-ink">{e.eventType}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-ink-3">{e.correlationId}</span>
                    </Td>
                    <Td><StatusBadge status={e.status} short /></Td>
                    <Td className="max-w-[26rem]">
                      <span className="block truncate" title={e.lastError ?? e.resultSummary ?? ''}>
                        {e.lastError ?? e.resultSummary ?? '–'}
                      </span>
                    </Td>
                    <Td numeric>{e.attempts}</Td>
                    <Td>
                      <span className="font-mono text-[11px] text-ink-3" title={formatDateTime(e.receivedAt, locale)}>
                        {relativeTime(e.receivedAt)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Outbound queue"
          subtitle="CRM → Chatwoot writes. Each job has an idempotency key so a retry cannot apply twice."
        />
        {outbound.length === 0 ? (
          <ListState title="Nothing queued" description="Attribute updates and quotation deliveries appear here." />
        ) : (
          <TableScroll>
            <Table className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>Job</Th>
                  <Th>Target</Th>
                  <Th>Status</Th>
                  <Th numeric>Attempts</Th>
                  <Th>Queued</Th>
                </tr>
              </thead>
              <tbody>
                {outbound.map((o) => (
                  <Tr key={o.id}>
                    <Td className="font-mono text-[12px]">{o.kind}</Td>
                    <Td className="font-mono text-[11px]">#{o.target}</Td>
                    <Td>
                      <StatusBadge status={o.status === 'success' ? 'processed' : o.status === 'failed' ? 'failed' : 'received'} />
                      {o.lastError ? (
                        <span className="mt-0.5 block max-w-[16rem] truncate text-[10px] text-danger-ink" title={o.lastError}>
                          {o.lastError}
                        </span>
                      ) : null}
                    </Td>
                    <Td numeric>{o.attempts}</Td>
                    <Td><span className="font-mono text-[11px] text-ink-3">{relativeTime(o.createdAt)}</span></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>
    </PageShell>
  );
}
