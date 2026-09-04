import type { Metadata } from 'next';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { ShieldCheck } from 'lucide-react';
import {
  approvalRequests, contacts, db, leads, properties, quotations, quotationVersions, users,
} from '@/db';
import { getPropertyScope, requirePermission, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { ListState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/badge';
import { ApprovalRow } from '@/components/approvals/approval-row';
import { formatMoney, relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Approvals' };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const session = await requireSession();
  requirePermission(session, 'discount.approve');
  const scope = await getPropertyScope(session);
  const locale = session.organization.locale;
  const scopedIds = scope.scopedIds.length ? scope.scopedIds : ['__none__'];

  const rows = db
    .select({
      id: approvalRequests.id,
      status: approvalRequests.status,
      discount: approvalRequests.requestedDiscountPercent,
      requesterLimit: approvalRequests.requesterLimitPercent,
      impact: approvalRequests.amountImpact,
      currency: approvalRequests.currency,
      reason: approvalRequests.reason,
      createdAt: approvalRequests.createdAt,
      decidedAt: approvalRequests.decidedAt,
      decisionNote: approvalRequests.decisionNote,
      requestedBy: users.name,
      leadId: approvalRequests.leadId,
      guestName: contacts.fullName,
      propertyName: properties.name,
      quotationCode: quotations.code,
      versionTotal: quotationVersions.total,
      versionSubtotal: quotationVersions.subtotal,
    })
    .from(approvalRequests)
    .leftJoin(users, eq(users.id, approvalRequests.requestedByUserId))
    .leftJoin(leads, eq(leads.id, approvalRequests.leadId))
    .leftJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(properties, eq(properties.id, approvalRequests.propertyId))
    .leftJoin(quotationVersions, eq(quotationVersions.id, approvalRequests.quotationVersionId))
    .leftJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
    .where(
      and(
        eq(approvalRequests.organizationId, session.user.organizationId),
        inArray(approvalRequests.propertyId, scopedIds),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt))
    .all();

  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending');

  return (
    <PageShell narrow>
      <PageHeader
        title="Discount approvals"
        description={`You can approve up to ${session.user.canApproveDiscountUpToPercent}%. Anything higher must be escalated.`}
        meta={
          <span className="rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-2">
            {pending.length} pending
          </span>
        }
      />

      <Card>
        <CardHeader
          title="Waiting on you"
          subtitle="A quotation above the author's limit cannot be sent until it is decided."
          icon={<ShieldCheck aria-hidden className="size-4" />}
        />
        {pending.length === 0 ? (
          <ListState
            title="No discounts waiting"
            description="Requests appear here as soon as a quotation exceeds its author's discount limit."
          />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((r) => (
              <ApprovalRow
                key={r.id}
                id={r.id}
                discount={r.discount}
                requesterLimit={r.requesterLimit}
                impact={formatMoney(r.impact, r.currency, locale)}
                total={r.versionTotal ? formatMoney(r.versionTotal, r.currency, locale) : '–'}
                guestName={r.guestName ?? 'Unknown guest'}
                propertyName={r.propertyName}
                quotationCode={r.quotationCode ?? '–'}
                requestedBy={r.requestedBy ?? 'Unknown'}
                requestedAgo={relativeTime(r.createdAt)}
                reason={r.reason}
                leadId={r.leadId}
                approverLimit={session.user.canApproveDiscountUpToPercent}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent decisions" />
        {decided.length === 0 ? (
          <ListState title="Nothing decided yet" description="Approved and rejected requests are kept here for audit." />
        ) : (
          <ul className="divide-y divide-border">
            {decided.slice(0, 15).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">
                    {r.discount}% on {r.quotationCode} · {r.guestName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {r.propertyName} · requested by {r.requestedBy} · decided {relativeTime(r.decidedAt)}
                    {r.decisionNote ? ` · “${r.decisionNote}”` : ''}
                  </p>
                </div>
                <StatusBadge status={r.status === 'approved' ? 'approved' : 'rejected'} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
