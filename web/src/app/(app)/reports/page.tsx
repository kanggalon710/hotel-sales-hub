import type { Metadata } from 'next';
import { and, eq, gte } from 'drizzle-orm';
import { BarChart3 } from 'lucide-react';
import { approvalRequests, db, leads, properties, users } from '@/db';
import { getPropertyScope, leadScopeWhere, requirePermission, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Meter, Metric, MetricStrip } from '@/components/ui/bits';
import { Funnel } from '@/components/reports/funnel';
import { ReportPeriod } from '@/components/reports/report-period';
import { ListState } from '@/components/ui/states';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { formatMoney, nightsBetween, pct, titleCase } from '@/lib/utils';
import { requestNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const FUNNEL_STEPS = [
  { key: 'inquiry', label: 'Inquiries received', stages: ['new_inquiry', 'assigned', 'qualified', 'availability_checked', 'quotation_sent', 'follow_up', 'deposit_pending', 'confirmed', 'lost', 'cancelled'] },
  { key: 'qualified', label: 'Qualified', stages: ['qualified', 'availability_checked', 'quotation_sent', 'follow_up', 'deposit_pending', 'confirmed'] },
  { key: 'availability', label: 'Availability checked', stages: ['availability_checked', 'quotation_sent', 'follow_up', 'deposit_pending', 'confirmed'] },
  { key: 'quoted', label: 'Quotation sent', stages: ['quotation_sent', 'follow_up', 'deposit_pending', 'confirmed'] },
  { key: 'deposit', label: 'Deposit pending', stages: ['deposit_pending', 'confirmed'] },
  { key: 'confirmed', label: 'Confirmed', stages: ['confirmed'] },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await requireSession();
  requirePermission(session, 'report.read');
  const scope = await getPropertyScope(session);
  const { days } = await searchParams;

  const windowDays = Number(days) === 7 || Number(days) === 90 || Number(days) === 365 ? Number(days) : 30;
  const now = requestNow();
  const since = new Date(now - windowDays * 86_400_000);
  const locale = session.organization.locale;
  const currency = session.organization.currency;

  const base = leadScopeWhere(session, scope);
  if (!base) {
    return (
      <PageShell>
        <ListState kind="denied" title="No properties in scope" description="Ask an administrator for access to a property." />
      </PageShell>
    );
  }
  const where = and(base, gte(leads.createdAt, since))!;

  const rows = db
    .select({
      id: leads.id, stage: leads.stage, status: leads.status, channel: leads.channel,
      source: leads.source, value: leads.estimatedValue, ownerUserId: leads.ownerUserId,
      ownerName: users.name, propertyName: properties.name, rooms: leads.rooms,
      checkIn: leads.checkIn, checkOut: leads.checkOut, lostReason: leads.lostReason,
      createdAt: leads.createdAt, firstRespondedAt: leads.firstRespondedAt,
      slaDueAt: leads.slaFirstResponseDueAt, nextFollowUpAt: leads.nextFollowUpAt,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.ownerUserId))
    .leftJoin(properties, eq(properties.id, leads.propertyId))
    .where(where)
    .all();

  const total = rows.length;
  const confirmed = rows.filter((r) => r.stage === 'confirmed');
  const lost = rows.filter((r) => r.status === 'lost');

  const funnelSteps = FUNNEL_STEPS.map((step) => {
    const matching = step.key === 'inquiry' ? rows : rows.filter((r) => step.stages.includes(r.stage));
    return {
      key: step.key,
      label: step.label,
      count: matching.length,
      value: matching.reduce((s, r) => s + r.value, 0),
    };
  });

  const roomNights = confirmed.reduce(
    (sum, r) => sum + (r.rooms ?? 0) * (r.checkIn && r.checkOut ? nightsBetween(r.checkIn, r.checkOut) : 0),
    0,
  );
  const revenueOpportunity = rows.filter((r) => r.status === 'open').reduce((s, r) => s + r.value, 0);

  const responded = rows.filter((r) => r.firstRespondedAt);
  const avgFirstResponseMin = responded.length
    ? Math.round(
        responded.reduce((s, r) => s + (r.firstRespondedAt!.getTime() - r.createdAt.getTime()), 0) /
          responded.length /
          60_000,
      )
    : null;
  const withinSla = responded.filter((r) => r.slaDueAt && r.firstRespondedAt!.getTime() <= r.slaDueAt.getTime()).length;
  const slaCompliance = responded.length ? pct(withinSla, responded.length) : 0;
  const overdueFollowUps = rows.filter(
    (r) => r.status === 'open' && r.nextFollowUpAt && r.nextFollowUpAt.getTime() < now,
  ).length;

  const group = <K extends string>(items: typeof rows, key: (r: (typeof rows)[number]) => K | null) => {
    const map = new Map<K, { count: number; value: number; won: number }>();
    for (const r of items) {
      const k = key(r);
      if (!k) continue;
      const entry = map.get(k) ?? { count: 0, value: 0, won: 0 };
      entry.count += 1;
      entry.value += r.value;
      if (r.stage === 'confirmed') entry.won += 1;
      map.set(k, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  };

  const byChannel = group(rows, (r) => r.channel);
  const byOwner = group(rows, (r) => r.ownerName);
  const byProperty = group(rows, (r) => r.propertyName);
  const byLostReason = group(lost, (r) => r.lostReason);
  const maxChannel = Math.max(1, ...byChannel.map(([, v]) => v.count));

  const approvals = db
    .select({ status: approvalRequests.status, discount: approvalRequests.requestedDiscountPercent })
    .from(approvalRequests)
    .where(and(eq(approvalRequests.organizationId, session.user.organizationId), gte(approvalRequests.createdAt, since)))
    .all();
  const approvedCount = approvals.filter((a) => a.status === 'approved').length;
  const avgDiscount = approvals.length
    ? Math.round((approvals.reduce((s, a) => s + a.discount, 0) / approvals.length) * 10) / 10
    : 0;

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        description={
          scope.current
            ? `${scope.current.propertyName} · leads created in the last ${windowDays} days.`
            : `All ${scope.permittedIds.length} permitted properties · leads created in the last ${windowDays} days.`
        }
        actions={<ReportPeriod days={windowDays} />}
      />

      <MetricStrip>
        <Metric label="Leads" value={total} sub={`${rows.filter((r) => r.status === 'open').length} still open`} />
        <Metric
          label="Inquiry → confirmed"
          value={`${pct(confirmed.length, total)}%`}
          sub={`${confirmed.length} confirmed`}
          tone={pct(confirmed.length, total) >= 15 ? 'success' : 'neutral'}
        />
        <Metric label="Room nights" value={roomNights} sub="from confirmed leads" tone="primary" />
        <Metric label="Revenue opportunity" value={formatMoney(revenueOpportunity, currency, locale, { compact: true })} sub="open pipeline" />
        <Metric
          label="First response SLA"
          value={`${slaCompliance}%`}
          sub={avgFirstResponseMin != null ? `avg ${avgFirstResponseMin} min` : 'no responses yet'}
          tone={slaCompliance >= 90 ? 'success' : slaCompliance >= 70 ? 'warning' : 'danger'}
        />
      </MetricStrip>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Conversion funnel"
            subtitle="Counts are cumulative: a confirmed lead also counts as quoted and qualified."
            icon={<BarChart3 aria-hidden className="size-4" />}
          />
          <Funnel steps={funnelSteps} currency={currency} locale={locale} />
        </Card>

        <Card>
          <CardHeader title="Channel performance" subtitle="Where inquiries come from, and which ones convert." />
          <CardBody className="space-y-3">
            {byChannel.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-ink-3">No channel data in this period.</p>
            ) : (
              byChannel.map(([channel, v]) => (
                <div key={channel}>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-ink">{titleCase(channel)}</span>
                    <span className="tnum font-mono text-[11px] text-ink-3">
                      {v.count} leads · {pct(v.won, v.count)}% confirmed ·{' '}
                      {formatMoney(v.value, currency, locale, { compact: true })}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Meter value={v.count} max={maxChannel} label={`${channel}: ${v.count} leads`} />
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sales performance" subtitle="Leads owned, conversion, and pipeline value." />
          {byOwner.length === 0 ? (
            <ListState title="No assigned leads" description="Leads appear here once they have an owner." />
          ) : (
            <TableScroll>
              <Table className="min-w-[520px]">
                <thead>
                  <tr>
                    <Th>Owner</Th>
                    <Th numeric>Leads</Th>
                    <Th numeric>Confirmed</Th>
                    <Th numeric>Rate</Th>
                    <Th numeric>Pipeline</Th>
                  </tr>
                </thead>
                <tbody>
                  {byOwner.map(([owner, v]) => (
                    <Tr key={owner}>
                      <Td className="text-ink">{owner}</Td>
                      <Td numeric>{v.count}</Td>
                      <Td numeric>{v.won}</Td>
                      <Td numeric className={pct(v.won, v.count) >= 20 ? 'text-success-ink' : ''}>
                        {pct(v.won, v.count)}%
                      </Td>
                      <Td numeric className="font-mono">{formatMoney(v.value, currency, locale, { compact: true })}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Why leads are lost" subtitle="Ranked by frequency in this period." />
            <CardBody>
              {byLostReason.length === 0 ? (
                <p className="py-3 text-center text-[12px] text-ink-3">No lost leads in this period.</p>
              ) : (
                <ul className="space-y-2">
                  {byLostReason.map(([reason, v]) => (
                    <li key={reason} className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="text-ink-2">{reason}</span>
                      <span className="tnum font-mono text-[11px] text-ink-3">
                        {v.count} · {pct(v.count, lost.length)}% of losses
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Rate governance" subtitle="Discount approvals in this period." />
            <CardBody>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-3">Requests</dt>
                  <dd className="tnum mt-0.5 text-lg font-semibold">{approvals.length}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-3">Approval rate</dt>
                  <dd className="tnum mt-0.5 text-lg font-semibold">
                    {approvals.length ? `${pct(approvedCount, approvals.length)}%` : '–'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-3">Average discount</dt>
                  <dd className="tnum mt-0.5 text-lg font-semibold">{avgDiscount}%</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-3">Overdue follow-ups</dt>
                  <dd className={`tnum mt-0.5 text-lg font-semibold ${overdueFollowUps ? 'text-warning-ink' : ''}`}>
                    {overdueFollowUps}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      {scope.isAllView && byProperty.length > 1 ? (
        <Card>
          <CardHeader title="By property" subtitle="Cross-property comparison for the same period." />
          <TableScroll>
            <Table className="min-w-[520px]">
              <thead>
                <tr>
                  <Th>Property</Th>
                  <Th numeric>Leads</Th>
                  <Th numeric>Confirmed</Th>
                  <Th numeric>Rate</Th>
                  <Th numeric>Pipeline</Th>
                </tr>
              </thead>
              <tbody>
                {byProperty.map(([name, v]) => (
                  <Tr key={name}>
                    <Td className="text-ink">{name}</Td>
                    <Td numeric>{v.count}</Td>
                    <Td numeric>{v.won}</Td>
                    <Td numeric>{pct(v.won, v.count)}%</Td>
                    <Td numeric className="font-mono">{formatMoney(v.value, currency, locale, { compact: true })}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </Card>
      ) : null}
    </PageShell>
  );
}
