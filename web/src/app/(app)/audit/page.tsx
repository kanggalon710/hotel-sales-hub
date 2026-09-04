import type { Metadata } from 'next';
import { and, desc, eq, gte, like, or, sql } from 'drizzle-orm';
import { auditLogs, db, properties } from '@/db';
import { getPropertyScope, requirePermission, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge, type Tone } from '@/components/ui/badge';
import { ListState } from '@/components/ui/states';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { AuditFilters } from '@/components/audit/audit-filters';
import { formatDateTime, parseJson, relativeTime } from '@/lib/utils';
import { requestNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<string, Tone> = {
  info: 'neutral',
  warning: 'warning',
  action_required: 'danger',
  critical: 'danger',
};

/** Action prefixes map to the categories PRD FR-12 requires the log to cover. */
const CATEGORIES: { key: string; label: string; prefixes: string[] }[] = [
  { key: 'security', label: 'Security & sign-in', prefixes: ['auth.', 'access.'] },
  { key: 'users', label: 'Users & roles', prefixes: ['user.'] },
  { key: 'integration', label: 'Integrations', prefixes: ['integration.'] },
  { key: 'sales', label: 'Leads & assignment', prefixes: ['lead.', 'contact.'] },
  { key: 'commercial', label: 'Quotations & approvals', prefixes: ['quotation.', 'approval.', 'availability.'] },
  { key: 'reservations', label: 'Holds & reservations', prefixes: ['reservation.', 'deposit.'] },
  { key: 'config', label: 'Configuration', prefixes: ['organization.', 'property.', 'export.'] },
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; days?: string }>;
}) {
  const session = await requireSession();
  requirePermission(session, 'audit.read');
  const scope = await getPropertyScope(session);
  const { q, category, days } = await searchParams;
  const locale = session.organization.locale;
  const now = requestNow();

  const windowDays = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(now - windowDays * 86_400_000);
  const cat = CATEGORIES.find((c) => c.key === category);
  const term = q?.trim().toLowerCase();

  const rows = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      summary: auditLogs.summary,
      actorName: auditLogs.actorName,
      actorType: auditLogs.actorType,
      severity: auditLogs.severity,
      ip: auditLogs.ip,
      before: auditLogs.before,
      after: auditLogs.after,
      correlationId: auditLogs.correlationId,
      createdAt: auditLogs.createdAt,
      propertyCode: properties.code,
    })
    .from(auditLogs)
    .leftJoin(properties, eq(properties.id, auditLogs.propertyId))
    .where(
      and(
        eq(auditLogs.organizationId, session.user.organizationId),
        gte(auditLogs.createdAt, since),
        // A property admin sees org-wide entries plus their own properties' entries.
        session.orgRoleKeys.length
          ? undefined
          : or(sql`${auditLogs.propertyId} is null`, sql`${auditLogs.propertyId} in (${sql.join(scope.permittedIds.map((id) => sql`${id}`), sql`, `)})`),
        cat ? or(...cat.prefixes.map((p) => like(auditLogs.action, `${p}%`))) : undefined,
        term
          ? or(
              like(sql`lower(${auditLogs.summary})`, `%${term}%`),
              like(sql`lower(coalesce(${auditLogs.actorName}, ''))`, `%${term}%`),
              like(sql`lower(${auditLogs.action})`, `%${term}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(300)
    .all();

  const hasFilters = Boolean(term || cat);

  return (
    <PageShell>
      <PageHeader
        title="Audit log"
        description="Every consequential change with its actor, source, and timestamp. Entries are append-only; deactivating a user does not erase their name from history."
      />

      <AuditFilters
        categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
        current={{ q: q ?? '', category: category ?? '', days: windowDays }}
        total={rows.length}
      />

      <Card>
        {rows.length === 0 ? (
          <ListState
            kind={hasFilters ? 'filtered' : 'empty'}
            title={hasFilters ? 'No entries match these filters' : 'Nothing recorded in this period'}
            description={hasFilters ? 'Widen the period or clear the search.' : 'Entries appear as soon as anyone signs in or changes a record.'}
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[880px]">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>What happened</Th>
                  <Th>Action</Th>
                  <Th>Severity</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const before = parseJson<Record<string, unknown> | null>(r.before, null);
                  const after = parseJson<Record<string, unknown> | null>(r.after, null);
                  return (
                    <Tr key={r.id}>
                      <Td className="whitespace-nowrap align-top">
                        <span className="block text-ink" title={formatDateTime(r.createdAt, locale)}>{relativeTime(r.createdAt, now)}</span>
                        <span className="t-meta block whitespace-nowrap font-mono">{formatDateTime(r.createdAt, locale)}</span>
                      </Td>
                      <Td className="align-top">
                        <span className="block text-ink">{r.actorName ?? (r.actorType === 'system' ? 'System' : 'Integration')}</span>
                        <span className="t-meta block">
                          {r.actorType}
                          {r.ip ? ` · ${r.ip}` : ''}
                        </span>
                      </Td>
                      <Td className="max-w-[34rem] align-top">
                        <span className="block text-ink">{r.summary}</span>
                        {(before || after) ? (
                          <details className="mt-1">
                            <summary className="t-meta cursor-pointer select-none text-primary-ink">Show change</summary>
                            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                              {before ? (
                                <pre className="overflow-x-auto rounded-md bg-surface-inset p-2 font-mono text-[11px] leading-4 text-ink-2">
                                  {`before\n${JSON.stringify(before, null, 1)}`}
                                </pre>
                              ) : null}
                              {after ? (
                                <pre className="overflow-x-auto rounded-md bg-surface-inset p-2 font-mono text-[11px] leading-4 text-ink-2">
                                  {`after\n${JSON.stringify(after, null, 1)}`}
                                </pre>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                      </Td>
                      <Td className="align-top">
                        <span className="block whitespace-nowrap font-mono text-[12px] text-ink-2">{r.action}</span>
                        <span className="t-meta block font-mono">
                          {r.entityType}
                          {r.propertyCode ? ` · ${r.propertyCode}` : ''}
                        </span>
                      </Td>
                      <Td className="align-top">
                        <Badge tone={SEVERITY_TONE[r.severity] ?? 'neutral'} variant="dot">{r.severity.replace('_', ' ')}</Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>
    </PageShell>
  );
}
