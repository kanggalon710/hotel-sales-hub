import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  activities, contacts, conversationReferences, db, leads, properties,
  quotations, quotationVersions, reservationReferences, reservationRequests,
} from '@/db';
import {
  getPropertyScope, leadVisibility, maskEmail, maskName, maskPhone, piiLevel, requireSession,
} from '@/server/context';
import { PageShell } from '@/components/page-header';
import { Card, CardBody, CardHeader, DataRow } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Avatar, Metric, MetricStrip, Ref } from '@/components/ui/bits';
import { ListState, PermissionDenied } from '@/components/ui/states';
import { ActivityTimeline } from '@/components/leads/activity-timeline';
import { formatMoney, formatStayDate, formatStayRange, parseJson, relativeTime, titleCase } from '@/lib/utils';
import { conversationDeepLink } from '@/server/services/chatwoot-ingest';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = db.select({ name: contacts.fullName }).from(contacts).where(eq(contacts.id, id)).get();
  return { title: row ? `${row.name} · Guest` : 'Guest' };
}

export default async function Guest360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const scope = await getPropertyScope(session);
  if (leadVisibility(session) === 'none') {
    return (
      <PageShell>
        <PermissionDenied what="guest profiles" />
      </PageShell>
    );
  }

  const level = piiLevel(session);
  const locale = session.organization.locale;

  const contact = db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.organizationId, session.user.organizationId)))
    .get();
  if (!contact) notFound();

  const permitted = scope.permittedIds.length ? scope.permittedIds : ['__none__'];

  const guestLeads = db
    .select({
      id: leads.id, code: leads.code, stage: leads.stage, status: leads.status,
      checkIn: leads.checkIn, checkOut: leads.checkOut, estimatedValue: leads.estimatedValue,
      currency: leads.currency, propertyName: properties.name, createdAt: leads.createdAt,
    })
    .from(leads)
    .innerJoin(properties, eq(properties.id, leads.propertyId))
    .where(and(eq(leads.contactId, contact.id), inArray(leads.propertyId, permitted)))
    .orderBy(desc(leads.createdAt))
    .all();

  const leadIds = guestLeads.map((l) => l.id);

  const conversations = db
    .select()
    .from(conversationReferences)
    .where(eq(conversationReferences.contactId, contact.id))
    .orderBy(desc(conversationReferences.lastMessageAt))
    .all();

  const quotationRows = leadIds.length
    ? db
        .select({
          code: quotations.code, status: quotationVersions.status, total: quotationVersions.total,
          currency: quotationVersions.currency, leadId: quotations.leadId, version: quotationVersions.version,
        })
        .from(quotationVersions)
        .innerJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
        .where(and(inArray(quotations.leadId, leadIds), eq(quotationVersions.id, quotations.currentVersionId)))
        .all()
    : [];

  const reservations = leadIds.length
    ? db
        .select({
          code: reservationRequests.code, status: reservationRequests.status,
          checkIn: reservationRequests.checkIn, checkOut: reservationRequests.checkOut,
          total: reservationRequests.totalAmount, currency: reservationRequests.currency,
          reference: reservationReferences.externalReference, id: reservationRequests.id,
        })
        .from(reservationRequests)
        .leftJoin(reservationReferences, eq(reservationReferences.reservationRequestId, reservationRequests.id))
        .where(inArray(reservationRequests.leadId, leadIds))
        .orderBy(desc(reservationRequests.createdAt))
        .all()
    : [];

  const timeline = db
    .select()
    .from(activities)
    .where(eq(activities.contactId, contact.id))
    .orderBy(desc(activities.createdAt))
    .limit(25)
    .all();

  const openValue = guestLeads.filter((l) => l.status === 'open').reduce((s, l) => s + l.estimatedValue, 0);
  const wonValue = guestLeads.filter((l) => l.status === 'won').reduce((s, l) => s + l.estimatedValue, 0);
  const preferences = parseJson<string[]>(contact.preferences, []);

  return (
    <PageShell className="max-w-[1300px]">
      <Link href="/guests" className="focus-ring tap inline-flex items-center gap-1.5 rounded text-[12px] text-ink-3 hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to guests
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={contact.fullName} className="size-11 text-sm" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="t-title">{maskName(contact.fullName, level)}</h1>
              {contact.guestTier !== 'none' ? (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-ink">
                  {contact.guestTier}
                </span>
              ) : null}
            </div>
            <p className="mt-1 font-mono text-[12px] text-ink-3">
              {maskPhone(contact.phoneNormalized, level)} · {maskEmail(contact.email, level)}
            </p>
          </div>
        </div>
      </header>

      <MetricStrip>
        <Metric label="Previous stays" value={contact.stayCount} sub={contact.lastStayDate ? `last ${formatStayDate(contact.lastStayDate, locale)}` : 'no recorded stay'} />
        <Metric label="Leads" value={guestLeads.length} sub={`${guestLeads.filter((l) => l.status === 'open').length} open`} />
        <Metric label="Open pipeline" value={formatMoney(openValue, session.organization.currency, locale, { compact: true })} tone="primary" />
        <Metric label="Confirmed value" value={formatMoney(wonValue, session.organization.currency, locale, { compact: true })} tone="success" />
      </MetricStrip>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Leads" subtitle="One guest can hold several opportunities across properties and dates." />
            {guestLeads.length === 0 ? (
              <ListState title="No leads in your scope" description="This guest may have leads at properties you cannot access." />
            ) : (
              <ul className="divide-y divide-border">
                {guestLeads.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <Link href={`/leads/${l.id}`} className="focus-ring tap rounded">
                          <Ref className="text-ink hover:text-primary-ink">{l.code}</Ref>
                        </Link>
                        <StatusBadge status={l.stage} />
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-3">
                        {l.propertyName} · {formatStayRange(l.checkIn, l.checkOut, locale)} · created {relativeTime(l.createdAt)}
                      </p>
                    </div>
                    <span className="tnum font-mono text-[13px] text-ink">
                      {formatMoney(l.estimatedValue, l.currency, locale, { compact: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Quotations and reservations" />
            <CardBody className="space-y-4">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Quotations</h3>
                {quotationRows.length === 0 ? (
                  <p className="mt-1.5 text-[12px] text-ink-3">None yet.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {quotationRows.map((q) => (
                      <li key={`${q.code}-${q.version}`} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <Ref>{q.code}</Ref>
                          <StatusBadge status={q.status} />
                        </span>
                        <span className="tnum font-mono text-[12px] text-ink-2">
                          {formatMoney(q.total, q.currency, locale, { compact: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Reservations</h3>
                {reservations.length === 0 ? (
                  <p className="mt-1.5 text-[12px] text-ink-3">None yet.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {reservations.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3">
                        <span className="flex flex-wrap items-center gap-2">
                          <Link href={`/reservations/${r.id}`} className="focus-ring rounded">
                            <Ref className="hover:text-primary-ink">{r.code}</Ref>
                          </Link>
                          <StatusBadge status={r.status} />
                          {r.reference ? (
                            <span className="font-mono text-[10px] text-success-ink">{r.reference}</span>
                          ) : null}
                        </span>
                        <span className="tnum font-mono text-[12px] text-ink-2">
                          {formatMoney(r.total, r.currency, locale, { compact: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <CardBody>
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
            <CardHeader title="Profile" />
            <CardBody>
              <dl className="divide-y divide-border/70">
                <DataRow label="Phone" value={maskPhone(contact.phoneNormalized, level)} mono />
                <DataRow label="Email" value={maskEmail(contact.email, level)} mono />
                <DataRow label="Language" value={contact.preferredLanguage?.toUpperCase() ?? '–'} />
                <DataRow label="Nationality" value={contact.nationality ?? '–'} />
                <DataRow label="Consent" value={titleCase(contact.consentStatus)} />
                <DataRow label="Created" value={relativeTime(contact.createdAt)} />
              </dl>
              {preferences.length ? (
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-wide text-ink-3">Preferences</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {preferences.map((p) => (
                      <span key={p} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">{p}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Conversations" subtitle="Identifiers and deep links only. Chatwoot keeps the transcript." />
            <CardBody>
              {conversations.length === 0 ? (
                <p className="text-[12px] text-ink-3">No linked conversations.</p>
              ) : (
                <ul className="space-y-2.5">
                  {conversations.map((c) => (
                    <li key={c.id} className="rounded-md bg-surface-inset px-2.5 py-2">
                      <p className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-ink">{c.inboxName ?? titleCase(c.channel ?? 'channel')}</span>
                        <span className="font-mono text-[10px] text-ink-3">#{c.externalConversationId}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-3">
                        {titleCase(c.conversationStatus ?? '–')} · {relativeTime(c.lastMessageAt)}
                      </p>
                      {conversationDeepLink(c) ? (
                        <a
                          href={conversationDeepLink(c)!}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="focus-ring tap mt-1 inline-flex items-center gap-1 rounded text-[11px] text-primary-ink hover:underline"
                        >
                          Open in Chatwoot
                          <ExternalLink aria-hidden className="size-3" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
