import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { BedDouble, Inbox } from 'lucide-react';
import {
  approvalRequests, contacts, db, deadLetterEvents, leads, quotations, quotationVersions,
  reservationRequests, tasks, users,
} from '@/db';
import { getPropertyScope, leadScopeWhere, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { PriorityItem, type Priority } from '@/components/priority-item';
import { Card, CardHeader } from '@/components/ui/card';
import { Metric, MetricStrip } from '@/components/ui/bits';
import { ListState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/badge';
import { RowLink, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { LinkButton } from '@/components/ui/button';
import { formatMoney, formatStayDate, relativeTime, titleCase } from '@/lib/utils';
import { requestNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'My Day' };
export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

export default async function MyDayPage() {
  const session = await requireSession();
  const scope = await getPropertyScope(session);
  const locale = session.organization.locale;
  const now = requestNow();
  const orgId = session.user.organizationId;
  const scopeWhere = leadScopeWhere(session, scope);

  /* ---------------------------- priority sources ---------------------------- */

  const unansweredInquiries = scopeWhere
    ? db
        .select({
          id: leads.id, code: leads.code, guestName: contacts.fullName,
          channel: leads.channel, slaDueAt: leads.slaFirstResponseDueAt,
          createdAt: leads.createdAt, ownerUserId: leads.ownerUserId,
        })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .where(and(scopeWhere, eq(leads.status, 'open'), isNull(leads.firstRespondedAt)))
        .orderBy(asc(leads.slaFirstResponseDueAt))
        .limit(10)
        .all()
    : [];

  const myOverdueTasks = db
    .select({
      id: tasks.id, title: tasks.title, description: tasks.description, type: tasks.type,
      dueAt: tasks.dueAt, leadId: tasks.leadId, priority: tasks.priority,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, orgId),
        eq(tasks.status, 'open'),
        or(eq(tasks.assigneeUserId, session.user.id), isNull(tasks.assigneeUserId)),
        lt(tasks.dueAt, new Date(now)),
      ),
    )
    .orderBy(asc(tasks.dueAt))
    .limit(10)
    .all();

  const expiringQuotations = scopeWhere
    ? db
        .select({
          id: quotations.id, code: quotations.code, leadId: quotations.leadId,
          guestName: contacts.fullName, validUntil: quotationVersions.validUntil,
          total: quotationVersions.total, currency: quotationVersions.currency,
        })
        .from(quotations)
        .innerJoin(quotationVersions, eq(quotationVersions.id, quotations.currentVersionId))
        .innerJoin(leads, eq(leads.id, quotations.leadId))
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .where(
          and(
            scopeWhere,
            inArray(quotationVersions.status, ['sent', 'approved']),
            lt(quotationVersions.validUntil, new Date(now + DAY)),
          ),
        )
        .orderBy(asc(quotationVersions.validUntil))
        .limit(8)
        .all()
    : [];

  const canSeeQueue = session.permissions.has('reservation.queue.read');
  const reservationQueue = canSeeQueue
    ? db
        .select({
          id: reservationRequests.id, code: reservationRequests.code,
          guestName: reservationRequests.guestName, status: reservationRequests.status,
          checkIn: reservationRequests.checkIn, submittedAt: reservationRequests.submittedAt,
          holdExpiresAt: reservationRequests.holdExpiresAt,
        })
        .from(reservationRequests)
        .where(
          and(
            eq(reservationRequests.organizationId, orgId),
            inArray(reservationRequests.propertyId, scope.scopedIds.length ? scope.scopedIds : ['__none__']),
            inArray(reservationRequests.status, ['submitted', 'under_review', 'on_hold']),
          ),
        )
        .orderBy(asc(reservationRequests.submittedAt))
        .limit(8)
        .all()
    : [];

  const canApprove = session.permissions.has('discount.approve');
  const pendingApprovals = canApprove
    ? db
        .select({
          id: approvalRequests.id, discount: approvalRequests.requestedDiscountPercent,
          impact: approvalRequests.amountImpact, currency: approvalRequests.currency,
          createdAt: approvalRequests.createdAt, guestName: contacts.fullName, leadId: approvalRequests.leadId,
        })
        .from(approvalRequests)
        .innerJoin(leads, eq(leads.id, approvalRequests.leadId))
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .where(and(eq(approvalRequests.organizationId, orgId), eq(approvalRequests.status, 'pending')))
        .orderBy(asc(approvalRequests.createdAt))
        .limit(6)
        .all()
    : [];

  const canManageIntegrations = session.permissions.has('integration.manage');
  const openDeadLetters = canManageIntegrations
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(deadLetterEvents)
        .where(and(eq(deadLetterEvents.organizationId, orgId), isNull(deadLetterEvents.resolvedAt)))
        .get()?.count ?? 0
    : 0;

  const depositPending = scopeWhere
    ? db
        .select({ count: sql<number>`count(*)`, value: sql<number>`coalesce(sum(${leads.estimatedValue}),0)` })
        .from(leads)
        .where(and(scopeWhere, eq(leads.stage, 'deposit_pending')))
        .get()
    : { count: 0, value: 0 };

  /* ------------------------------ arrivals ------------------------------ */

  // Hotel context the Leads page does not give: who walks through the door soon.
  const weekAhead = new Date(now + 7 * DAY).toISOString().slice(0, 10);
  const today = new Date(now).toISOString().slice(0, 10);
  const arrivals = scopeWhere
    ? db
        .select({
          id: leads.id, code: leads.code, guestName: contacts.fullName, stage: leads.stage,
          checkIn: leads.checkIn, checkOut: leads.checkOut, rooms: leads.rooms,
          value: leads.estimatedValue, currency: leads.currency, ownerName: users.name,
        })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .leftJoin(users, eq(users.id, leads.ownerUserId))
        .where(
          and(
            scopeWhere,
            inArray(leads.stage, ['deposit_pending', 'confirmed', 'quotation_sent']),
            gte(leads.checkIn, today),
            lte(leads.checkIn, weekAhead),
          ),
        )
        .orderBy(asc(leads.checkIn))
        .limit(8)
        .all()
    : [];

  /* --------------------------- attention grouping --------------------------- */

  /*
   * Work is grouped by the kind of attention it needs, not flattened into one
   * mixed list. Six different clocks (an SLA, a task due date, a quotation
   * expiry, a hold, an approval age, an integration failure) cannot be ranked
   * against each other honestly, so they are not: each group states its own
   * question, and the rows inside a group are alike.
   */
  type Item = {
    key: string; title: string; subtitle: string; due: string;
    href: string; actionLabel: string; sortAt: number;
  };

  const blocked: Item[] = [];
  const dueToday: Item[] = [];
  const decisions: Item[] = [];

  for (const q of unansweredInquiries) {
    const breached = q.slaDueAt != null && q.slaDueAt.getTime() < now;
    const item: Item = {
      key: `inq-${q.id}`,
      title: q.guestName,
      subtitle: `${q.code} · ${q.channel ?? 'chat'} · arrived ${relativeTime(q.createdAt, now)}${q.ownerUserId ? '' : ' · unassigned'}`,
      due: q.slaDueAt ? `reply ${relativeTime(q.slaDueAt, now)}` : 'no SLA set',
      href: `/leads/${q.id}`,
      actionLabel: 'Reply',
      sortAt: q.slaDueAt?.getTime() ?? now,
    };
    (breached ? blocked : dueToday).push(item);
  }

  const inquiryLeadIds = new Set(unansweredInquiries.map((q) => q.id));
  for (const t of myOverdueTasks) {
    // An inquiry already listed above covers its own follow-up task.
    if (t.leadId && inquiryLeadIds.has(t.leadId)) continue;
    dueToday.push({
      key: `task-${t.id}`,
      title: t.title,
      subtitle: t.description ?? `${t.type.replace(/_/g, ' ')} · assigned to you`,
      due: t.dueAt ? relativeTime(t.dueAt, now) : 'no due date',
      href: t.leadId ? `/leads/${t.leadId}` : '/leads',
      actionLabel: 'Resolve',
      sortAt: t.dueAt?.getTime() ?? now,
    });
  }

  for (const q of expiringQuotations) {
    const expired = q.validUntil.getTime() < now;
    const item: Item = {
      key: `quo-${q.id}`,
      title: `${q.code} · ${q.guestName}`,
      subtitle: `${formatMoney(q.total, q.currency, locale, { compact: true })} · ${expired ? 'the guest is looking at a dead offer' : 'chase a decision or issue a revision'}`,
      due: expired ? `expired ${relativeTime(q.validUntil, now)}` : `expires ${relativeTime(q.validUntil, now)}`,
      href: `/leads/${q.leadId}`,
      actionLabel: expired ? 'Revise' : 'Follow up',
      sortAt: q.validUntil.getTime(),
    };
    (expired ? blocked : dueToday).push(item);
  }

  if (openDeadLetters > 0) {
    blocked.push({
      key: 'dlq',
      title: `${openDeadLetters} Chatwoot event${openDeadLetters === 1 ? '' : 's'} could not be processed`,
      subtitle: 'An unmapped inbox or agent. No leads are created from these until the mapping is fixed.',
      due: 'blocking intake',
      href: '/integrations/health',
      actionLabel: 'Fix mapping',
      sortAt: 0,
    });
  }

  for (const a of pendingApprovals) {
    decisions.push({
      key: `apr-${a.id}`,
      title: `${a.discount}% discount · ${a.guestName}`,
      subtitle: `Impact ${formatMoney(a.impact, a.currency, locale, { compact: true })} · the quotation cannot be sent until you decide`,
      due: `waiting ${relativeTime(a.createdAt, now)}`,
      href: '/approvals',
      actionLabel: 'Decide',
      sortAt: a.createdAt.getTime(),
    });
  }

  for (const r of reservationQueue) {
    decisions.push({
      key: `res-${r.id}`,
      title: `${r.code} · ${r.guestName}`,
      subtitle: `${titleCase(r.status)} · arrival ${formatStayDate(r.checkIn, locale)}`,
      due: r.holdExpiresAt ? `hold ends ${relativeTime(r.holdExpiresAt, now)}` : r.submittedAt ? `waiting ${relativeTime(r.submittedAt, now)}` : '–',
      href: `/reservations/${r.id}`,
      actionLabel: 'Review',
      sortAt: r.submittedAt?.getTime() ?? now,
    });
  }

  const bySort = (a: Item, b: Item) => a.sortAt - b.sortAt;
  blocked.sort(bySort);
  dueToday.sort(bySort);
  decisions.sort(bySort);

  const groups: { key: string; title: string; question: string; tone: Priority; items: Item[]; href: string }[] = [
    { key: 'blocked', title: 'Past due', question: 'The clock has already run out on these.', tone: 'critical' as Priority, items: blocked, href: '/leads?overdue=1' },
    { key: 'today', title: 'Needs attention today', question: 'Still inside its window, but not for long.', tone: 'high' as Priority, items: dueToday, href: '/leads' },
    { key: 'decide', title: 'Waiting on your decision', question: 'Nobody else can move these forward.', tone: 'normal' as Priority, items: decisions, href: canApprove ? '/approvals' : '/reservations' },
  ].filter((g) => g.items.length > 0);

  const slaBreaches = unansweredInquiries.filter((q) => q.slaDueAt && q.slaDueAt.getTime() < now).length;
  const totalWaiting = blocked.length + dueToday.length + decisions.length;

  return (
    <PageShell className="max-w-[1100px]">
      <PageHeader
        title="My Day"
        count={totalWaiting > 0 ? `${totalWaiting} item${totalWaiting === 1 ? '' : 's'} need you` : 'nothing waiting'}
        description={
          scope.current
            ? `${session.user.name.split(' ')[0]} · ${scope.current.propertyName} · ${scope.current.roleName}`
            : `${session.user.name.split(' ')[0]} · ${scope.permittedIds.length} permitted properties`
        }
        actions={
          <>
            {session.permissions.has('availability.search') ? (
              <LinkButton href="/availability" icon={<BedDouble aria-hidden className="size-4" />}>
                <span className="max-sm:sr-only">Check availability</span>
              </LinkButton>
            ) : null}
            <LinkButton href="/leads" variant="primary" icon={<Inbox aria-hidden className="size-4" />}>
              <span className="max-sm:sr-only">All leads</span>
            </LinkButton>
          </>
        }
      />

      <MetricStrip label="Today at a glance">
        <Metric
          label="Past SLA"
          value={slaBreaches}
          sub={slaBreaches ? 'reply now' : 'all within SLA'}
          tone={slaBreaches ? 'danger' : 'neutral'}
          href="/leads?status=open&stage=new_inquiry"
        />
        <Metric
          label="Overdue follow-ups"
          value={myOverdueTasks.length}
          sub="assigned to you"
          tone={myOverdueTasks.length ? 'warning' : 'neutral'}
          href="/leads?overdue=1"
        />
        <Metric
          label="Quotations expiring"
          value={expiringQuotations.length}
          sub="within 24 hours"
          tone={expiringQuotations.length ? 'warning' : 'neutral'}
          href="/quotations"
        />
        <Metric
          label="Deposit pending"
          value={Number(depositPending?.count ?? 0)}
          sub={formatMoney(Number(depositPending?.value ?? 0), session.organization.currency, locale, { compact: true })}
          href="/leads?stage=deposit_pending"
        />
      </MetricStrip>

      {groups.length === 0 ? (
        <Card>
          <ListState
            title="Nothing is waiting on you"
            description="No breached SLAs, overdue follow-ups, expiring quotations, or pending decisions in this scope."
          />
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.key}>
            <CardHeader
              title={group.title}
              subtitle={group.question}
              action={
                <span className="flex items-center gap-3">
                  <span className="tnum t-meta">{group.items.length}</span>
                  <Link href={group.href} className="focus-ring tap rounded text-[12px] font-medium text-primary-ink hover:underline">
                    View all
                  </Link>
                </span>
              }
            />
            <ul className="divide-y divide-border">
              {group.items.slice(0, 6).map((i) => (
                <PriorityItem
                  key={i.key}
                  priority={group.tone}
                  title={i.title}
                  subtitle={i.subtitle}
                  due={i.due}
                  href={i.href}
                  actionLabel={i.actionLabel}
                />
              ))}
            </ul>
            {group.items.length > 6 ? (
              <p className="t-meta border-t border-border px-5 py-2.5">
                {group.items.length - 6} more in this group.
              </p>
            ) : null}
          </Card>
        ))
      )}

      <Card>
        <CardHeader
          title="Arriving this week"
          subtitle="Stays starting in the next seven days, so nothing lands on the front desk as a surprise."
          action={<span className="tnum t-meta">{arrivals.length}</span>}
        />
        {arrivals.length === 0 ? (
          <ListState title="No arrivals in the next seven days" description="Confirmed and deposit-pending stays appear here as their dates approach." />
        ) : (
          <TableScroll>
            {/* Money is the one column that must never overflow, so it is sized
                from its widest real value rather than getting the remainder. */}
            <Table className="min-w-[720px]" columns={['24%', '20%', '12%', '13%', '16%', '15%']}>
              <thead>
                <tr>
                  <Th>Guest</Th>
                  <Th>Stay</Th>
                  <Th>Rooms</Th>
                  <Th>Owner</Th>
                  <Th>Stage</Th>
                  <Th numeric>Value</Th>
                </tr>
              </thead>
              <tbody>
                {arrivals.map((a) => (
                  <Tr key={a.id} interactive>
                    <Td>
                      <RowLink href={`/leads/${a.id}`} className="block truncate">
                        {a.guestName}
                      </RowLink>
                      <span className="t-meta block truncate font-mono">{a.code}</span>
                    </Td>
                    <Td className="truncate whitespace-nowrap">
                      {formatStayDate(a.checkIn, locale)} → {formatStayDate(a.checkOut, locale)}
                    </Td>
                    <Td className="truncate">{a.rooms ?? '–'}</Td>
                    <Td className="truncate">{a.ownerName ?? 'Unassigned'}</Td>
                    <Td><StatusBadge status={a.stage} variant="dot" /></Td>
                    <Td numeric className="font-mono text-ink">
                      {formatMoney(a.value, a.currency, locale, { compact: true })}
                    </Td>
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
