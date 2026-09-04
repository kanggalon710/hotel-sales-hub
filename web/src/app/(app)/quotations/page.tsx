import type { Metadata } from 'next';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { contacts, db, leads, properties, quotations, quotationVersions, users } from '@/db';
import { getPropertyScope, requireSession } from '@/server/context';
import { expireStaleQuotations } from '@/server/services/quotations';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Metric, MetricStrip, Ref } from '@/components/ui/bits';
import { ListState, PermissionDenied } from '@/components/ui/states';
import { RowLink, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { formatDateTime, formatMoney, formatStayDate, relativeTime } from '@/lib/utils';
import { requestNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Quotations' };
export const dynamic = 'force-dynamic';

export default async function QuotationsPage() {
  const session = await requireSession();
  const scope = await getPropertyScope(session);

  if (!session.permissions.has('quotation.create') && !session.permissions.has('lead.read.all')) {
    return (
      <PageShell>
        <PermissionDenied what="quotations" />
      </PageShell>
    );
  }

  // Expiry is a data fact, not a display trick: sweep before reading.
  expireStaleQuotations(session.user.organizationId);

  const locale = session.organization.locale;
  const scopedIds = scope.scopedIds.length ? scope.scopedIds : ['__none__'];

  const rows = db
    .select({
      versionId: quotationVersions.id,
      code: quotations.code,
      version: quotationVersions.version,
      status: quotationVersions.status,
      total: quotationVersions.total,
      currency: quotationVersions.currency,
      discountPercent: quotationVersions.discountPercentEffective,
      validUntil: quotationVersions.validUntil,
      sentAt: quotationVersions.sentAt,
      createdAt: quotationVersions.createdAt,
      checkIn: quotationVersions.checkIn,
      checkOut: quotationVersions.checkOut,
      leadId: quotations.leadId,
      guestName: contacts.fullName,
      propertyCode: properties.code,
      ownerName: users.name,
      isCurrent: quotations.currentVersionId,
    })
    .from(quotationVersions)
    .innerJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
    .innerJoin(leads, eq(leads.id, quotations.leadId))
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(properties, eq(properties.id, quotations.propertyId))
    .leftJoin(users, eq(users.id, leads.ownerUserId))
    .where(
      and(
        eq(quotations.organizationId, session.user.organizationId),
        inArray(quotations.propertyId, scopedIds),
      ),
    )
    .orderBy(desc(quotationVersions.createdAt))
    .limit(150)
    .all();

  const current = rows.filter((r) => r.versionId === r.isCurrent);
  const byStatus = (s: string[]) => current.filter((r) => s.includes(r.status));
  const sent = byStatus(['sent']);
  const accepted = byStatus(['accepted']);
  const pendingApproval = byStatus(['pending_approval']);
  const acceptedValue = accepted.reduce((sum, r) => sum + r.total, 0);
  const now = requestNow();

  return (
    <PageShell>
      <PageHeader
        title="Quotations"
        count={`${rows.length} version${rows.length === 1 ? '' : 's'}`}
        description="Every version is an immutable priced snapshot with its own rate provenance and expiry."
      />

      <MetricStrip>
        <Metric label="Sent, awaiting reply" value={sent.length} sub="live offers" tone={sent.length ? 'primary' : 'neutral'} />
        <Metric label="Pending approval" value={pendingApproval.length} sub="cannot be sent yet" tone={pendingApproval.length ? 'warning' : 'neutral'} />
        <Metric label="Accepted" value={accepted.length} sub={formatMoney(acceptedValue, session.organization.currency, locale, { compact: true })} tone="success" />
        <Metric
          label="Expiring in 24h"
          value={sent.filter((r) => r.validUntil.getTime() - now < 86_400_000).length}
          sub="chase or revise"
          tone="warning"
        />
      </MetricStrip>

      <Card>
        <CardHeader
          title="All quotations"
          subtitle="Superseded versions stay listed so a price can always be traced back."
          action={<span className="font-mono text-[11px] text-ink-3">{rows.length} versions</span>}
        />
        {rows.length === 0 ? (
          <ListState
            title="No quotations yet"
            description="Build the first one from a lead once availability has been checked."
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[1040px]">
              <thead>
                <tr>
                  <Th>Quotation</Th>
                  <Th>Guest</Th>
                  <Th>Stay</Th>
                  <Th numeric>Total</Th>
                  <Th numeric>Discount</Th>
                  <Th>Status</Th>
                  <Th>Validity</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const expiringSoon = r.status === 'sent' && r.validUntil.getTime() - now < 86_400_000;
                  return (
                    <Tr key={r.versionId} interactive>
                      <Td className="whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <RowLink href={`/leads/${r.leadId}`}>
                            <Ref className="text-ink group-hover:text-primary-ink">{r.code}</Ref>
                          </RowLink>
                          <span className="rounded bg-surface-2 px-1 text-[10px] text-ink-3">v{r.version}</span>
                        </span>
                        <span className="t-meta mt-0.5 block">
                          {scope.isAllView ? `${r.propertyCode} · ` : ''}
                          {r.ownerName ?? 'unassigned'}
                        </span>
                      </Td>
                      <Td className="text-ink">{r.guestName}</Td>
                      <Td className="whitespace-nowrap">
                        {formatStayDate(r.checkIn, locale)} → {formatStayDate(r.checkOut, locale)}
                      </Td>
                      <Td numeric className="font-mono text-ink">
                        {formatMoney(r.total, r.currency, locale, { compact: true })}
                      </Td>
                      <Td numeric className={r.discountPercent > 0 ? 'text-warning-ink' : 'text-ink-3'}>
                        {r.discountPercent > 0 ? `${r.discountPercent}%` : '–'}
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} variant="dot" />
                      </Td>
                      <Td>
                        <span
                          className={`whitespace-nowrap font-mono text-[11px] ${expiringSoon ? 'text-warning-ink' : 'text-ink-3'}`}
                          title={formatDateTime(r.validUntil, locale)}
                        >
                          {r.status === 'expired' ? 'expired' : relativeTime(r.validUntil)}
                        </span>
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
