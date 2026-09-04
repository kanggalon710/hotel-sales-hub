import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import {
  db, depositStatusReferences, leads, properties, quotationVersions,
  reservationReferences, reservationRequests, users,
} from '@/db';
import { assertPropertyAccess, maskEmail, maskPhone, piiLevel, requireSession } from '@/server/context';
import { PageShell } from '@/components/page-header';
import { Card, CardBody, CardHeader, DataRow } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Ref } from '@/components/ui/bits';
import { ReservationDecision } from '@/components/reservations/reservation-decision';
import { formatDateTime, formatMoney, formatStayDate, relativeTime, titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = db.select({ code: reservationRequests.code }).from(reservationRequests).where(eq(reservationRequests.id, id)).get();
  return { title: row ? `${row.code} · Reservation` : 'Reservation request' };
}

export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const level = piiLevel(session);
  const locale = session.organization.locale;

  const request = db
    .select()
    .from(reservationRequests)
    .where(and(eq(reservationRequests.id, id), eq(reservationRequests.organizationId, session.user.organizationId)))
    .get();
  if (!request) notFound();
  assertPropertyAccess(session, request.propertyId);

  const property = db.select().from(properties).where(eq(properties.id, request.propertyId)).get()!;
  const lead = db.select().from(leads).where(eq(leads.id, request.leadId)).get()!;
  const requestedBy = request.requestedByUserId
    ? db.select({ name: users.name }).from(users).where(eq(users.id, request.requestedByUserId)).get()
    : null;
  const decidedBy = request.decidedByUserId
    ? db.select({ name: users.name }).from(users).where(eq(users.id, request.decidedByUserId)).get()
    : null;
  const reference = db
    .select()
    .from(reservationReferences)
    .where(eq(reservationReferences.reservationRequestId, request.id))
    .get();
  const deposit = db
    .select()
    .from(depositStatusReferences)
    .where(eq(depositStatusReferences.reservationRequestId, request.id))
    .orderBy(desc(depositStatusReferences.createdAt))
    .get();
  const quotation = request.quotationVersionId
    ? db.select().from(quotationVersions).where(eq(quotationVersions.id, request.quotationVersionId)).get()
    : null;

  const canDecide = session.permissions.has('reservation.confirm');

  return (
    <PageShell className="max-w-[1200px]">
      <Link
        href="/reservations"
        className="focus-ring tap inline-flex items-center gap-1.5 rounded text-[12px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to queue
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="t-title">{request.guestName}</h1>
            <Ref>{request.code}</Ref>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            {property.name} · {titleCase(request.kind)} request
            {requestedBy ? ` · raised by ${requestedBy.name}` : ''}
            {request.submittedAt ? ` · ${relativeTime(request.submittedAt)}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="tnum font-mono text-lg font-medium text-ink">
            {formatMoney(request.totalAmount, request.currency, locale)}
          </p>
          {reference ? (
            <p className="mt-1 font-mono text-[11px] text-success-ink">
              {reference.externalReference}
              {reference.confirmationType === 'manual_authorized' ? ' · manual' : ' · PMS'}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Everything you need to decide" subtitle="Complete by construction, because sales cannot submit a partial request." />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <DataRow label="Check-in" value={formatStayDate(request.checkIn, locale)} />
                <DataRow label="Check-out" value={formatStayDate(request.checkOut, locale)} />
                <DataRow label="Nights" value={request.nights} />
                <DataRow label="Rooms" value={request.rooms} />
                <DataRow label="Occupancy" value={`${request.adults} adults${request.children ? `, ${request.children} children` : ''}`} />
                <DataRow label="Room type" value={request.roomTypeName ?? '–'} />
                <DataRow label="Rate plan" value={request.ratePlanName ?? '–'} />
                <DataRow label="Guest phone" value={maskPhone(request.guestPhone, level)} mono />
                <DataRow label="Guest email" value={maskEmail(request.guestEmail, level)} mono />
                <DataRow label="Lead" value={<Link href={`/leads/${lead.id}`} className="focus-ring tap rounded text-primary-ink hover:underline">{lead.code}</Link>} />
              </dl>

              {request.specialRequest ? (
                <div className="mt-4 rounded-md border border-accent-ink/25 bg-accent-soft px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-accent-ink">Special request</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-ink">{request.specialRequest}</p>
                </div>
              ) : null}
              {request.internalNote ? (
                <div className="mt-3 rounded-md bg-surface-inset px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-ink-3">Note from sales</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{request.internalNote}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>

          {canDecide ? (
            <ReservationDecision
              requestId={request.id}
              status={request.status}
              code={request.code}
              guestName={request.guestName}
              hasPmsConnector
            />
          ) : (
            <Card>
              <CardHeader title="Decision" subtitle="Read-only for your role." />
              <CardBody>
                <p className="text-[13px] text-ink-2">
                  Only a reservation or front-office role can confirm, hold, reject, or propose an alternative for
                  this request.
                </p>
              </CardBody>
            </Card>
          )}

          {request.decisionNote || request.alternativeNote ? (
            <Card>
              <CardHeader title="Front-office response" subtitle={decidedBy ? `Recorded by ${decidedBy.name}` : undefined} />
              <CardBody className="space-y-2">
                {request.alternativeNote ? (
                  <p className="rounded-md bg-accent-soft px-3 py-2 text-[13px] leading-5 text-accent-ink">
                    {request.alternativeNote}
                  </p>
                ) : null}
                {request.decisionNote ? (
                  <p className="rounded-md bg-surface-inset px-3 py-2 text-[13px] leading-5 text-ink-2">
                    {request.decisionNote}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <dl className="divide-y divide-border/70">
                <DataRow label="Submitted" value={formatDateTime(request.submittedAt, locale)} />
                <DataRow label="Review started" value={formatDateTime(request.reviewStartedAt, locale)} />
                <DataRow label="Decided" value={formatDateTime(request.decidedAt, locale)} />
                <DataRow
                  label="Hold expires"
                  value={request.holdExpiresAt ? relativeTime(request.holdExpiresAt) : '–'}
                />
              </dl>
            </CardBody>
          </Card>

          {quotation ? (
            <Card>
              <CardHeader title="Priced from" subtitle="The immutable quotation version behind this request." />
              <CardBody>
                <dl className="divide-y divide-border/70">
                  <DataRow label="Total" value={formatMoney(quotation.total, quotation.currency, locale)} mono />
                  <DataRow label="Discount" value={`${quotation.discountPercentEffective}%`} />
                  <DataRow label="Service" value={`${quotation.servicePercent}%`} />
                  <DataRow label="Tax" value={`${quotation.taxPercent}%`} />
                  <DataRow label="Rates from" value={quotation.snapshotSource ?? 'manual'} />
                  <DataRow label="Checked" value={formatDateTime(quotation.snapshotCheckedAt, locale)} />
                </dl>
              </CardBody>
            </Card>
          ) : null}

          {deposit ? (
            <Card>
              <CardHeader title="Deposit" />
              <CardBody>
                <div className="flex items-center justify-between">
                  <StatusBadge status={deposit.status} />
                  <span className="tnum font-mono text-[13px] text-ink">
                    {formatMoney(deposit.amount, deposit.currency, locale)}
                  </span>
                </div>
                {deposit.dueAt ? (
                  <p className="mt-2 font-mono text-[11px] text-ink-3">due {relativeTime(deposit.dueAt)}</p>
                ) : null}
                <p className="mt-2 text-[11px] leading-4 text-ink-3">
                  Deposit status is a reference only. Payment reconciliation lives outside this MVP.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </aside>
      </div>
    </PageShell>
  );
}
