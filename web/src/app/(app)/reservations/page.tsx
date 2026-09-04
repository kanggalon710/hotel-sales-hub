import type { Metadata } from 'next';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { CalendarCheck } from 'lucide-react';
import { db, properties, reservationReferences, reservationRequests, users } from '@/db';
import { getPropertyScope, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Ref } from '@/components/ui/bits';
import { ListState, PermissionDenied } from '@/components/ui/states';
import { RowLink, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { formatMoney, formatStayDate, relativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Reservations' };
export const dynamic = 'force-dynamic';

const ACTIVE = ['submitted', 'under_review', 'on_hold', 'alternative_proposed'];
const CLOSED = ['confirmed', 'rejected', 'expired', 'cancelled'];

export default async function ReservationsPage() {
  const session = await requireSession();
  const scope = await getPropertyScope(session);

  const canSee =
    session.permissions.has('reservation.queue.read') || session.permissions.has('reservation.request');
  if (!canSee) {
    return (
      <PageShell>
        <PermissionDenied what="the reservation queue" />
      </PageShell>
    );
  }

  const locale = session.organization.locale;
  const scopedIds = scope.scopedIds.length ? scope.scopedIds : ['__none__'];

  const rows = db
    .select({
      id: reservationRequests.id, code: reservationRequests.code, status: reservationRequests.status,
      kind: reservationRequests.kind, guestName: reservationRequests.guestName,
      checkIn: reservationRequests.checkIn, checkOut: reservationRequests.checkOut,
      rooms: reservationRequests.rooms, roomTypeName: reservationRequests.roomTypeName,
      ratePlanName: reservationRequests.ratePlanName, totalAmount: reservationRequests.totalAmount,
      currency: reservationRequests.currency, submittedAt: reservationRequests.submittedAt,
      holdExpiresAt: reservationRequests.holdExpiresAt, leadId: reservationRequests.leadId,
      propertyCode: properties.code, requestedBy: users.name,
      reference: reservationReferences.externalReference,
    })
    .from(reservationRequests)
    .innerJoin(properties, eq(properties.id, reservationRequests.propertyId))
    .leftJoin(users, eq(users.id, reservationRequests.requestedByUserId))
    .leftJoin(reservationReferences, eq(reservationReferences.reservationRequestId, reservationRequests.id))
    .where(
      and(
        eq(reservationRequests.organizationId, session.user.organizationId),
        inArray(reservationRequests.propertyId, scopedIds),
      ),
    )
    .orderBy(asc(reservationRequests.submittedAt))
    .all();

  const active = rows.filter((r) => ACTIVE.includes(r.status));
  const closed = rows.filter((r) => CLOSED.includes(r.status)).reverse();

  function renderTable(list: typeof rows, emptyTitle: string, emptyBody: string) {
    if (list.length === 0) return <ListState title={emptyTitle} description={emptyBody} />;
    return (
      <TableScroll>
        <Table className="min-w-[1000px]">
          <thead>
            <tr>
              <Th>Request</Th>
              <Th>Guest</Th>
              <Th>Stay</Th>
              <Th>Room &amp; rate</Th>
              <Th numeric>Value</Th>
              <Th>Status</Th>
              <Th>Waiting</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <Tr key={r.id} interactive>
                <Td className="whitespace-nowrap">
                  <RowLink href={`/reservations/${r.id}`}>
                    <Ref className="text-ink group-hover:text-primary-ink">{r.code}</Ref>
                  </RowLink>
                  <span className="mt-0.5 block text-[11px] text-ink-3">
                    {scope.isAllView ? `${r.propertyCode} · ` : ''}
                    {titleCase(r.kind)}
                    {r.requestedBy ? ` · by ${r.requestedBy}` : ''}
                  </span>
                </Td>
                <Td className="text-ink">{r.guestName}</Td>
                <Td className="whitespace-nowrap">
                  {formatStayDate(r.checkIn, locale)} → {formatStayDate(r.checkOut, locale)}
                  <span className="mt-0.5 block text-[11px] text-ink-3">{r.rooms} room{r.rooms === 1 ? '' : 's'}</span>
                </Td>
                <Td>
                  {r.roomTypeName}
                  <span className="mt-0.5 block text-[11px] text-ink-3">{r.ratePlanName}</span>
                </Td>
                <Td numeric className="font-mono text-ink">
                  {formatMoney(r.totalAmount, r.currency, locale, { compact: true })}
                </Td>
                <Td>
                  <StatusBadge status={r.status} variant="dot" />
                  {r.reference ? (
                    <span className="mt-1 block font-mono text-[10px] text-success-ink">{r.reference}</span>
                  ) : null}
                </Td>
                <Td>
                  <span className="font-mono text-[11px] text-ink-3">
                    {r.holdExpiresAt
                      ? `hold ${relativeTime(r.holdExpiresAt)}`
                      : r.submittedAt
                        ? relativeTime(r.submittedAt)
                        : '–'}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Reservation queue"
        count={`${active.length} waiting`}
        description="Structured requests from sales. Confirming needs a PMS reference or an authorized manual one."
        meta={
          <span className="rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-2">
            {active.length} waiting · {closed.length} closed
          </span>
        }
      />

      <Card>
        <CardHeader
          title="Needs a decision"
          subtitle="Oldest first. The guest is waiting on this."
          icon={<CalendarCheck aria-hidden className="size-4" />}
        />
        {renderTable(active, 'Nothing waiting', 'Every submitted request has been decided. New ones appear here as sales submits them.')}
      </Card>

      <Card>
        <CardHeader title="Recently decided" subtitle="Confirmed, rejected, or expired." />
        {renderTable(closed.slice(0, 20), 'No decided requests yet', 'Once you confirm or reject a request it moves here with its reference.')}
      </Card>
    </PageShell>
  );
}
