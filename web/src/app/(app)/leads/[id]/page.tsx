import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { ExternalLink, MessageSquare } from 'lucide-react';
import {
  activities, contacts, conversationReferences, db, depositStatusReferences, leads,
  leadStageHistory, properties, quotationItems, quotations, quotationVersions,
  ratePlanReferences, reservationReferences, reservationRequests, roomTypeReferences,
  tasks, userPropertyRoles, users,
} from '@/db';
import {
  assertPropertyAccess, getPropertyScope, leadScopeWhere, maskEmail, maskPhone,
  piiLevel, requireSession,
} from '@/server/context';
import { latestSearchForLead } from '@/server/services/availability';
import { buildStaySteps } from '@/server/lead-progress';
import { templateForLead } from '@/server/services/pipelines';
import { conversationDeepLink } from '@/server/services/chatwoot-ingest';
import { STAGE_KIND_MEANING } from '@/lib/pipeline';
import { PageShell } from '@/components/page-header';
import { Card, CardBody, CardHeader, DataRow } from '@/components/ui/card';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { Avatar, Ref } from '@/components/ui/bits';
import { LiveStayStrip } from '@/components/live-stay-strip';
import { ListState } from '@/components/ui/states';
import { LeadActions } from '@/components/leads/lead-actions';
import { LeadProperties } from '@/components/leads/lead-properties';
import { QualificationForm } from '@/components/leads/qualification-form';
import { LeadTasks } from '@/components/leads/lead-tasks';
import { NoteComposer } from '@/components/leads/note-composer';
import { ActivityTimeline } from '@/components/leads/activity-timeline';
import { parseJson, formatMoney, formatDateTime, relativeTime, titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = db.select({ code: leads.code }).from(leads).where(eq(leads.id, id)).get();
  return { title: row ? `${row.code} · Lead` : 'Lead' };
}

export default async function LeadCockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const scope = await getPropertyScope(session);
  const level = piiLevel(session);
  const locale = session.organization.locale;

  const scopeWhere = leadScopeWhere(session, { ...scope, scopedIds: scope.permittedIds });
  const lead = scopeWhere
    ? db.select().from(leads).where(and(scopeWhere, eq(leads.id, id))).get()
    : undefined;
  if (!lead) notFound();
  assertPropertyAccess(session, lead.propertyId);

  const contact = db.select().from(contacts).where(eq(contacts.id, lead.contactId)).get()!;
  const property = db.select().from(properties).where(eq(properties.id, lead.propertyId)).get()!;
  const conversation = lead.primaryConversationId
    ? db.select().from(conversationReferences).where(eq(conversationReferences.id, lead.primaryConversationId)).get()
    : null;

  const timeline = db
    .select()
    .from(activities)
    .where(eq(activities.leadId, lead.id))
    .orderBy(desc(activities.createdAt))
    .limit(40)
    .all();

  const stageHistory = db
    .select()
    .from(leadStageHistory)
    .where(eq(leadStageHistory.leadId, lead.id))
    .orderBy(asc(leadStageHistory.createdAt))
    .all();

  const openTasks = db
    .select({
      id: tasks.id, title: tasks.title, description: tasks.description, type: tasks.type,
      priority: tasks.priority, dueAt: tasks.dueAt, assigneeName: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeUserId))
    .where(and(eq(tasks.leadId, lead.id), eq(tasks.status, 'open')))
    .orderBy(asc(tasks.dueAt))
    .all();

  const availability = latestSearchForLead(lead.id, session.organization.availabilityStaleAfterMinutes);

  const quotationRows = db
    .select({
      quotationId: quotations.id, code: quotations.code,
      versionId: quotationVersions.id, version: quotationVersions.version,
      status: quotationVersions.status, total: quotationVersions.total,
      subtotal: quotationVersions.subtotal, discountAmount: quotationVersions.discountAmount,
      discountPercent: quotationVersions.discountPercentEffective,
      serviceAmount: quotationVersions.serviceAmount, taxAmount: quotationVersions.taxAmount,
      servicePercent: quotationVersions.servicePercent, taxPercent: quotationVersions.taxPercent,
      currency: quotationVersions.currency, validUntil: quotationVersions.validUntil,
      nights: quotationVersions.nights, snapshotSource: quotationVersions.snapshotSource,
      snapshotCheckedAt: quotationVersions.snapshotCheckedAt, sentAt: quotationVersions.sentAt,
      createdAt: quotationVersions.createdAt, policies: quotationVersions.policies,
      isCurrent: quotations.currentVersionId,
    })
    .from(quotationVersions)
    .innerJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
    .where(eq(quotations.leadId, lead.id))
    .orderBy(desc(quotationVersions.createdAt))
    .all();

  const versionIds = quotationRows.map((q) => q.versionId);
  const itemsByVersion = new Map<string, { name: string; plan: string; rooms: number; nights: number; rate: number; total: number }[]>();
  if (versionIds.length) {
    for (const item of db.select().from(quotationItems).where(inArray(quotationItems.versionId, versionIds)).all()) {
      const list = itemsByVersion.get(item.versionId) ?? [];
      list.push({
        name: item.roomTypeName, plan: item.ratePlanName, rooms: item.rooms,
        nights: item.nights, rate: item.ratePerNight, total: item.lineTotal,
      });
      itemsByVersion.set(item.versionId, list);
    }
  }

  const reservations = db
    .select({
      id: reservationRequests.id, code: reservationRequests.code, status: reservationRequests.status,
      kind: reservationRequests.kind, roomTypeName: reservationRequests.roomTypeName,
      ratePlanName: reservationRequests.ratePlanName, totalAmount: reservationRequests.totalAmount,
      currency: reservationRequests.currency, submittedAt: reservationRequests.submittedAt,
      decisionNote: reservationRequests.decisionNote, alternativeNote: reservationRequests.alternativeNote,
      holdExpiresAt: reservationRequests.holdExpiresAt,
      reference: reservationReferences.externalReference,
      confirmationType: reservationReferences.confirmationType,
    })
    .from(reservationRequests)
    .leftJoin(reservationReferences, eq(reservationReferences.reservationRequestId, reservationRequests.id))
    .where(eq(reservationRequests.leadId, lead.id))
    .orderBy(desc(reservationRequests.createdAt))
    .all();

  const deposit = db
    .select()
    .from(depositStatusReferences)
    .where(eq(depositStatusReferences.leadId, lead.id))
    .orderBy(desc(depositStatusReferences.createdAt))
    .get();

  const roomTypes = db
    .select({ id: roomTypeReferences.id, code: roomTypeReferences.code, name: roomTypeReferences.name })
    .from(roomTypeReferences)
    .where(and(eq(roomTypeReferences.propertyId, lead.propertyId), eq(roomTypeReferences.active, true)))
    .all();
  const ratePlans = db
    .select({
      id: ratePlanReferences.id, code: ratePlanReferences.code, name: ratePlanReferences.name,
      inclusions: ratePlanReferences.inclusions, policies: ratePlanReferences.policies,
    })
    .from(ratePlanReferences)
    .where(and(eq(ratePlanReferences.propertyId, lead.propertyId), eq(ratePlanReferences.active, true)))
    .all();

  const assignable = db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userPropertyRoles, eq(userPropertyRoles.userId, users.id))
    .where(
      and(
        eq(users.organizationId, session.user.organizationId),
        eq(users.status, 'active'),
        eq(userPropertyRoles.propertyId, lead.propertyId),
      ),
    )
    .all();

  const currentQuote = quotationRows.find((q) => q.versionId === q.isCurrent) ?? quotationRows[0] ?? null;
  const latestReservation = reservations[0] ?? null;

  const steps = buildStaySteps({
    stage: lead.stage,
    status: lead.status,
    createdAt: lead.createdAt,
    firstRespondedAt: lead.firstRespondedAt,
    slaDueAt: lead.slaFirstResponseDueAt,
    availability: availability
      ? { checkedAt: availability.search.checkedAt, source: availability.search.sourceLabel, state: availability.stale ? 'stale' : 'live' }
      : null,
    quotation: currentQuote
      ? { code: currentQuote.code, status: currentQuote.status, total: currentQuote.total, currency: currentQuote.currency, validUntil: currentQuote.validUntil }
      : null,
    deposit: deposit ? { status: deposit.status, dueAt: deposit.dueAt } : null,
    reservation: latestReservation ? { status: latestReservation.status, reference: latestReservation.reference } : null,
    staleAfterMinutes: session.organization.availabilityStaleAfterMinutes,
  });

  const canWrite = session.permissions.has('lead.write');
  const template = templateForLead(session.user.organizationId, lead.pipelineTemplateId);
  const stageDef = template?.stages.find((st) => st.key === lead.stage) ?? null;

  return (
    <PageShell>
      {/*
        The header carries four things: who, what state, how much, and the next
        action. Everything else was duplicated elsewhere on the same screen and
        has been removed: the property is already in the top bar, the stay dates
        are in the Qualification card directly below, and channel and created
        date live in the Lead details panel. That run-on meta line wrapped to
        three rows with orphaned separators and pushed real content off a phone.
      */}
      <header className="space-y-4">
        {/*
          The guest name is the most important string on the page, so on a phone
          it gets the full width and the money moves to its own row underneath.
          From 640px there is room for both side by side.
        */}
        <div className="space-y-2 sm:flex sm:items-start sm:justify-between sm:gap-6 sm:space-y-0">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={contact.fullName} size="lg" className="shrink-0" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-2">
                <h1 className="t-title min-w-0 truncate">{contact.fullName}</h1>
                <Ref className="shrink-0">{lead.code}</Ref>
              </div>
              <p className="mt-1 flex min-w-0 items-center gap-2">
                <StatusBadge status={lead.stage} variant="dot" />
                {contact.guestTier !== 'none' ? (
                  <span className="t-label shrink-0 text-accent-ink">{contact.guestTier}</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-3 sm:block sm:shrink-0 sm:text-right">
            <p className="tnum whitespace-nowrap font-mono text-[15px] font-medium text-ink">
              {formatMoney(lead.estimatedValue, lead.currency, locale)}
            </p>
            {stageDef ? (
              <p className="tnum t-meta whitespace-nowrap sm:mt-0.5">
                {stageDef.probability}% · {formatMoney((lead.estimatedValue * stageDef.probability) / 100, lead.currency, locale, { compact: true })}
              </p>
            ) : null}
          </div>
        </div>

        <LeadActions
          canWrite={canWrite}
          canQuote={session.permissions.has('quotation.create')}
          canSearch={session.permissions.has('availability.search')}
          canRequestReservation={session.permissions.has('reservation.request')}
          discountLimitPercent={session.user.discountLimitPercent}
          currentUserId={session.user.id}
          lead={{
            id: lead.id, code: lead.code, stage: lead.stage, status: lead.status,
            propertyId: lead.propertyId, propertyName: property.name,
            checkIn: lead.checkIn, checkOut: lead.checkOut,
            rooms: lead.rooms ?? 1, adults: lead.adults ?? 2, children: lead.children ?? 0,
            currency: lead.currency, ownerUserId: lead.ownerUserId,
            specialRequest: lead.specialRequest,
            firstRespondedAt: lead.firstRespondedAt?.getTime() ?? null,
          }}
          roomTypes={roomTypes}
          ratePlans={ratePlans.map((r) => ({ ...r, inclusions: parseJson<string[]>(r.inclusions, []) }))}
          latestQuote={
            currentQuote
              ? {
                  versionId: currentQuote.versionId, code: currentQuote.code, version: currentQuote.version,
                  status: currentQuote.status, total: currentQuote.total, currency: currentQuote.currency,
                  roomTypeName: itemsByVersion.get(currentQuote.versionId)?.[0]?.name ?? null,
                  ratePlanName: itemsByVersion.get(currentQuote.versionId)?.[0]?.plan ?? null,
                }
              : null
          }
          defaults={{
            servicePercent: property.servicePercent ?? session.organization.servicePercent,
            taxPercent: property.taxPercent ?? session.organization.taxPercent,
            validityHours: session.organization.quotationValidityHours,
            locale,
          }}
          latestSearch={
            availability
              ? {
                  id: availability.search.id,
                  checkedAt: availability.search.checkedAt.getTime(),
                  sourceLabel: availability.search.sourceLabel,
                  stale: availability.stale,
                }
              : null
          }
        />

        <LiveStayStrip steps={steps} />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <QualificationForm
            leadId={lead.id}
            canWrite={canWrite}
            values={{
              checkIn: lead.checkIn ?? '',
              checkOut: lead.checkOut ?? '',
              rooms: lead.rooms ?? 1,
              adults: lead.adults ?? 2,
              children: lead.children ?? 0,
              inquiryType: lead.inquiryType,
              roomPreference: lead.roomPreference ?? '',
              purpose: lead.purpose ?? '',
              specialRequest: lead.specialRequest ?? '',
              budgetNote: lead.budgetNote ?? '',
            }}
          />

          {/* Availability provenance: source and checked-at are always shown (PRD 15.2 rule 8). */}
          <Card>
            <CardHeader
              title="Availability"
              subtitle={
                availability
                  ? `${availability.search.sourceLabel} · checked ${relativeTime(availability.search.checkedAt)}`
                  : 'No availability has been checked for this stay yet.'
              }
              action={
                availability ? <StatusBadge status={availability.stale ? 'stale' : 'live'} /> : null
              }
            />
            {availability ? (
              <TableScroll>
                {/* Per-night rate is a full rupiah figure, not a compact one, so it
                    needs more width than the descriptive columns beside it. */}
                <Table className="min-w-[620px]" columns={['26%', '28%', '13%', '21%', '12%']}>
                  <thead>
                    <tr>
                      <Th>Room type</Th>
                      <Th>Rate plan</Th>
                      <Th numeric>Available</Th>
                      <Th numeric>Per night</Th>
                      <Th>State</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {availability.snapshots.slice(0, 8).map((s) => (
                      <Tr key={s.id}>
                        <Td className="truncate text-ink">{s.roomTypeName}</Td>
                        <Td className="truncate">{s.ratePlanName}</Td>
                        <Td numeric>{s.sellableQty}</Td>
                        <Td numeric className="font-mono text-ink">
                          {formatMoney(s.ratePerNight, s.currency, locale)}
                        </Td>
                        <Td><StatusBadge status={s.state} short variant="dot" /></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            ) : (
              <ListState
                title="No availability check yet"
                description="Search the PMS for these dates to see sellable rooms and live rates before quoting."
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Quotations"
              subtitle="Each revision is an immutable priced snapshot; older versions are superseded, never edited."
              action={<span className="font-mono text-[11px] text-ink-3">{quotationRows.length} version{quotationRows.length === 1 ? '' : 's'}</span>}
            />
            {quotationRows.length === 0 ? (
              <ListState
                title="No quotation yet"
                description="Build one from an availability result so the offer carries its own rate provenance."
              />
            ) : (
              <ul className="divide-y divide-border">
                {quotationRows.map((q) => {
                  const items = itemsByVersion.get(q.versionId) ?? [];
                  return (
                    <li key={q.versionId} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <Ref className="text-[13px] text-ink">{q.code}</Ref>
                            <span className="rounded bg-surface-2 px-1.5 text-[11px] text-ink-3">v{q.version}</span>
                            <StatusBadge status={q.status} />
                          </p>
                          <p className="mt-1 text-[12px] text-ink-2">
                            {items.map((i) => `${i.rooms} × ${i.name} · ${i.plan}`).join(' · ') || '–'}
                          </p>
                          <p className="mt-1 font-mono text-[10px] text-ink-3">
                            {q.snapshotSource ? `rates from ${q.snapshotSource}` : 'manual rates'}
                            {q.snapshotCheckedAt ? ` · checked ${formatDateTime(q.snapshotCheckedAt, locale)}` : ''}
                            {' · valid until '}
                            {formatDateTime(q.validUntil, locale)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="tnum font-mono text-[15px] font-medium text-ink">
                            {formatMoney(q.total, q.currency, locale)}
                          </p>
                          <p className="tnum mt-0.5 font-mono text-[10px] text-ink-3">
                            net {formatMoney(q.subtotal - q.discountAmount, q.currency, locale, { compact: true })}
                            {q.discountPercent ? ` · −${q.discountPercent}%` : ''}
                            {` · svc ${q.servicePercent}% · tax ${q.taxPercent}%`}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Reservation handoff"
              subtitle="Confirmed requires a PMS reference or an authorized manual confirmation."
            />
            {reservations.length === 0 ? (
              <ListState
                title="Nothing handed off yet"
                description="Once the guest accepts, send a structured request so the front office can act without reading the chat."
              />
            ) : (
              <ul className="divide-y divide-border">
                {reservations.map((r) => (
                  <li key={r.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <Link href={`/reservations/${r.id}`} className="focus-ring rounded">
                            <Ref className="text-[13px] text-ink hover:text-primary-ink">{r.code}</Ref>
                          </Link>
                          <StatusBadge status={r.status} />
                          {r.reference ? (
                            <span className="rounded bg-success-soft px-1.5 py-0.5 font-mono text-[10px] text-success-ink">
                              {r.reference}
                              {r.confirmationType === 'manual_authorized' ? ' (manual)' : ''}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-[12px] text-ink-2">
                          {r.roomTypeName} · {r.ratePlanName} · {titleCase(r.kind)}
                        </p>
                        {r.alternativeNote ? (
                          <p className="mt-1.5 rounded-md bg-accent-soft px-2 py-1.5 text-[12px] text-accent-ink">
                            Alternative offered: {r.alternativeNote}
                          </p>
                        ) : null}
                        {r.decisionNote && r.status === 'rejected' ? (
                          <p className="mt-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-[12px] text-danger-ink">
                            Rejected: {r.decisionNote}
                          </p>
                        ) : null}
                      </div>
                      <p className="tnum shrink-0 font-mono text-[13px] text-ink">
                        {formatMoney(r.totalAmount, r.currency, locale, { compact: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity" subtitle="Every change carries an actor, a source, and a timestamp." />
            <CardBody className="space-y-4">
              <NoteComposer leadId={lead.id} />
              <ActivityTimeline
                items={timeline.map((a) => ({
                  id: a.id, type: a.type, title: a.title, body: a.body,
                  actorName: a.actorName, actorType: a.actorType, source: a.source,
                  createdAt: a.createdAt.getTime(),
                }))}
              />
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader
              title="Guest"
              action={
                <Link href={`/guests/${contact.id}`} className="focus-ring tap rounded text-[11px] font-medium text-primary-ink hover:underline">
                  Guest 360
                </Link>
              }
            />
            <CardBody>
              <dl className="divide-y divide-border/70">
                <DataRow label="Phone" value={maskPhone(contact.phoneNormalized, level)} mono />
                <DataRow label="Email" value={maskEmail(contact.email, level)} mono />
                <DataRow label="Language" value={contact.preferredLanguage?.toUpperCase() ?? '–'} />
                <DataRow label="Tier" value={titleCase(contact.guestTier)} />
                <DataRow label="Previous stays" value={contact.stayCount} />
                <DataRow label="Consent" value={titleCase(contact.consentStatus)} />
              </dl>
              {parseJson<string[]>(contact.preferences, []).length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {parseJson<string[]>(contact.preferences, []).map((p) => (
                    <span key={p} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">
                      {p}
                    </span>
                  ))}
                </div>
              ) : null}
              {level === 'masked' ? (
                <p className="mt-3 rounded-md bg-warning-soft px-2 py-1.5 text-[11px] text-warning-ink">
                  Contact details are masked for your role.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Conversation" icon={<MessageSquare aria-hidden className="size-4" />} />
            <CardBody>
              {conversation ? (
                <div className="space-y-3">
                  <dl className="divide-y divide-border/70">
                    <DataRow label="Inbox" value={conversation.inboxName ?? '–'} />
                    <DataRow label="Channel" value={titleCase(conversation.channel ?? '–')} />
                    <DataRow
                      label="Chatwoot status"
                      value={<span className="text-ink-3">{titleCase(conversation.conversationStatus ?? '–')}</span>}
                    />
                    <DataRow label="Last message" value={relativeTime(conversation.lastMessageAt)} />
                  </dl>
                  {conversation.lastMessagePreview ? (
                    <p className="rounded-md bg-surface-inset px-2.5 py-2 text-[12px] leading-5 text-ink-2">
                      “{conversation.lastMessagePreview}”
                    </p>
                  ) : null}
                  <p className="text-[11px] leading-4 text-ink-3">
                    Chatwoot remains the system of record for messages. The CRM stores identifiers and a deep link,
                    not the transcript.
                  </p>
                  {conversationDeepLink(conversation) ? (
                    <a
                      href={conversationDeepLink(conversation)!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="focus-ring tap inline-flex items-center gap-1.5 rounded text-[12px] font-medium text-primary-ink hover:underline"
                    >
                      Open in Chatwoot
                      <ExternalLink aria-hidden className="size-3" />
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-[12px] text-ink-3">
                  No conversation is linked. Link one from the CRM panel inside Chatwoot.
                </p>
              )}
            </CardBody>
          </Card>

          <LeadTasks leadId={lead.id} tasks={openTasks.map((t) => ({ ...t, dueAt: t.dueAt?.getTime() ?? null }))} canWrite={canWrite} />

          <Card>
            <CardHeader title="Lead details" subtitle="Owner and stage are editable here." />
            <CardBody>
              {/* Editable properties first, then the read-only record. */}
              <div className="divide-y divide-border/70">
                <LeadProperties
                  leadId={lead.id}
                  stage={lead.stage}
                  status={lead.status}
                  ownerUserId={lead.ownerUserId}
                  assignable={assignable}
                  canWrite={canWrite}
                  canReassign={session.permissions.has('lead.reassign')}
                  stages={(template?.stages ?? []).map((st) => ({
                    key: st.key,
                    label: st.label,
                    kind: st.kind,
                    hint: st.meaning ?? STAGE_KIND_MEANING[st.kind],
                  }))}
                  pipelineName={template?.name ?? null}
                />
              </div>
              <dl className="mt-1 divide-y divide-border/70 border-t border-border/70 pt-1">
                <DataRow label="Property" value={`${property.name} (${property.code})`} />
                <DataRow label="Channel" value={titleCase(lead.channel ?? '–')} />
                <DataRow label="Source" value={titleCase(lead.source ?? '–')} />
                <DataRow label="Created" value={relativeTime(lead.createdAt)} />
                <DataRow label="Inquiry type" value={titleCase(lead.inquiryType)} />
                <DataRow
                  label="First response"
                  value={
                    lead.firstRespondedAt
                      ? relativeTime(lead.firstRespondedAt)
                      : <span className="text-danger-ink">not yet, due {relativeTime(lead.slaFirstResponseDueAt)}</span>
                  }
                />
                <DataRow label="Next follow-up" value={lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt, locale) : '–'} />
                {lead.lostReason ? <DataRow label="Lost reason" value={lead.lostReason} /> : null}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stage history" />
            <CardBody>
              <ol className="space-y-2.5">
                {stageHistory.map((h) => (
                  <li key={h.id} className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong" />
                    <div className="min-w-0">
                      <p className="text-[12px] text-ink">
                        {template?.stages.find((st) => st.key === h.toStage)?.label ?? h.toStage}
                      </p>
                      <p className="font-mono text-[10px] text-ink-3">
                        {formatDateTime(h.createdAt, locale)} · {h.actorType === 'system' ? 'system' : 'user'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
