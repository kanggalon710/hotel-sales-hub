import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { BedDouble, CalendarCheck, ExternalLink, FileText, Lock } from 'lucide-react';
import {
  contacts, conversationReferences, db, depositStatusReferences, leads, properties,
  quotations, quotationVersions, reservationReferences, reservationRequests, users,
} from '@/db';
import { getSession } from '@/server/auth';
import { getPropertyScope, leadScopeWhere, maskEmail, maskPhone, piiLevel } from '@/server/context';
import { latestSearchForLead } from '@/server/services/availability';
import { buildStaySteps } from '@/server/lead-progress';
import { LiveStayStrip } from '@/components/live-stay-strip';
import { StatusBadge } from '@/components/ui/badge';
import { formatMoney, formatStayRange, relativeTime, titleCase } from '@/lib/utils';
import { requestNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'CRM panel' };
export const dynamic = 'force-dynamic';

/**
 * CRM context panel for Chatwoot (PRD 10.7).
 *
 * Chatwoot loads this page in its dashboard-app iframe with the conversation id.
 * It is a read-and-jump surface: the essentials in one column, and deep links
 * into the full cockpit for anything that changes data. It degrades honestly —
 * a stale availability check is labelled stale, and a user without a CRM
 * session sees a sign-in prompt, never another tenant's data.
 */
export default async function ChatwootPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string; account?: string }>;
}) {
  const { conversation, account } = await searchParams;
  const session = await getSession();
  const now = requestNow();

  if (!session) {
    return (
      <PanelFrame>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-neutral-soft text-ink-3">
            <Lock aria-hidden className="size-5" />
          </span>
          <p className="t-heading">Sign in to see CRM context</p>
          <p className="t-meta max-w-[240px]">Your CRM session is separate from Chatwoot. Sign in once and this panel stays available.</p>
          <a href="/login" target="_blank" rel="noreferrer" className="focus-ring t-small rounded font-medium text-primary-ink hover:underline">
            Open sign-in →
          </a>
        </div>
      </PanelFrame>
    );
  }

  if (!conversation) {
    return (
      <PanelFrame>
        <p className="t-meta py-10 text-center">Open a conversation in Chatwoot to see its CRM context here.</p>
      </PanelFrame>
    );
  }

  const conv = db
    .select()
    .from(conversationReferences)
    .where(
      and(
        eq(conversationReferences.organizationId, session.user.organizationId),
        eq(conversationReferences.externalConversationId, String(conversation)),
      ),
    )
    .get();

  const scope = await getPropertyScope(session);
  const permittedScope = { ...scope, scopedIds: scope.permittedIds };
  const scopeWhere = leadScopeWhere(session, permittedScope);
  const lead = conv && scopeWhere
    ? db.select().from(leads).where(and(scopeWhere, eq(leads.primaryConversationId, conv.id))).orderBy(desc(leads.createdAt)).get()
    : undefined;

  if (!conv || !lead) {
    return (
      <PanelFrame>
        <div className="space-y-4 py-6 text-center">
          <p className="t-heading">No lead linked to this conversation</p>
          <p className="t-meta">
            {conv ? 'The conversation is known to the CRM but has no lead in your scope.' : 'This conversation has not reached the CRM yet, or its inbox is not mapped.'}
          </p>
          <a href={`/leads?q=${encodeURIComponent(String(conversation))}`} target="_blank" rel="noreferrer" className="focus-ring t-small inline-flex rounded font-medium text-primary-ink hover:underline">
            Create or link a lead →
          </a>
        </div>
      </PanelFrame>
    );
  }

  const contact = db.select().from(contacts).where(eq(contacts.id, lead.contactId)).get()!;
  const property = db.select().from(properties).where(eq(properties.id, lead.propertyId)).get()!;
  const owner = lead.ownerUserId ? db.select({ name: users.name }).from(users).where(eq(users.id, lead.ownerUserId)).get() : null;
  const level = piiLevel(session);
  const locale = session.organization.locale;

  const availability = latestSearchForLead(lead.id, session.organization.availabilityStaleAfterMinutes);
  const quote = db
    .select({ code: quotations.code, status: quotationVersions.status, total: quotationVersions.total, currency: quotationVersions.currency, validUntil: quotationVersions.validUntil })
    .from(quotations)
    .innerJoin(quotationVersions, eq(quotationVersions.id, quotations.currentVersionId))
    .where(eq(quotations.leadId, lead.id))
    .orderBy(desc(quotationVersions.createdAt))
    .get();
  const reservation = db
    .select({ code: reservationRequests.code, status: reservationRequests.status, reference: reservationReferences.externalReference })
    .from(reservationRequests)
    .leftJoin(reservationReferences, eq(reservationReferences.reservationRequestId, reservationRequests.id))
    .where(eq(reservationRequests.leadId, lead.id))
    .orderBy(desc(reservationRequests.createdAt))
    .get();
  const deposit = db.select().from(depositStatusReferences).where(eq(depositStatusReferences.leadId, lead.id)).orderBy(desc(depositStatusReferences.createdAt)).get();

  const steps = buildStaySteps({
    stage: lead.stage, status: lead.status, createdAt: lead.createdAt,
    firstRespondedAt: lead.firstRespondedAt, slaDueAt: lead.slaFirstResponseDueAt,
    availability: availability ? { checkedAt: availability.search.checkedAt, source: availability.search.sourceLabel, state: availability.stale ? 'stale' : 'live' } : null,
    quotation: quote ? { code: quote.code, status: quote.status, total: quote.total, currency: quote.currency, validUntil: quote.validUntil } : null,
    deposit: deposit ? { status: deposit.status, dueAt: deposit.dueAt } : null,
    reservation: reservation ? { status: reservation.status, reference: reservation.reference } : null,
    staleAfterMinutes: session.organization.availabilityStaleAfterMinutes,
  }, now);

  const canSearch = session.permissions.has('availability.search');
  const canQuote = session.permissions.has('quotation.create');
  const canReserve = session.permissions.has('reservation.request');

  return (
    <PanelFrame>
      <header>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{contact.fullName}</p>
            <p className="t-meta mt-0.5 font-mono">{lead.code} · {property.code}</p>
          </div>
          <StatusBadge status={lead.stage} />
        </div>
        <dl className="mt-3 space-y-1">
          <Row label="Stay" value={formatStayRange(lead.checkIn, lead.checkOut, locale)} />
          <Row label="Guests" value={`${lead.rooms ?? '–'} rm · ${lead.adults ?? 0}A${lead.children ? ` ${lead.children}C` : ''}`} />
          <Row label="Owner" value={owner?.name ?? 'Unassigned'} />
          <Row label="Value" value={lead.estimatedValue ? formatMoney(lead.estimatedValue, lead.currency, locale, { compact: true }) : '–'} mono />
          <Row label="Phone" value={maskPhone(contact.phoneNormalized, level)} mono />
          <Row label="Email" value={maskEmail(contact.email, level)} mono />
        </dl>
      </header>

      <section className="hairline-t pt-4">
        <LiveStayStrip steps={steps} />
      </section>

      <section className="hairline-t space-y-2 pt-4">
        <p className="t-label">Latest</p>
        <Line
          label="Availability"
          value={availability ? `${availability.search.sourceLabel.split(' (')[0]} · ${relativeTime(availability.search.checkedAt, now)}` : 'not checked'}
          badge={availability ? (availability.stale ? 'stale' : 'live') : null}
        />
        <Line
          label="Quotation"
          value={quote ? `${quote.code} · ${formatMoney(quote.total, quote.currency, locale, { compact: true })} · ${quote.validUntil.getTime() < now ? 'expired' : `expires ${relativeTime(quote.validUntil, now)}`}` : 'none yet'}
          badge={quote?.status ?? null}
        />
        <Line
          label="Reservation"
          value={reservation ? `${reservation.code}${reservation.reference ? ` · ${reservation.reference}` : ''}` : 'not requested'}
          badge={reservation?.status ?? null}
        />
        <Line
          label="Deposit"
          value={deposit ? `${formatMoney(deposit.amount, deposit.currency, locale, { compact: true })}${deposit.dueAt ? ` · due ${relativeTime(deposit.dueAt, now)}` : ''}` : '–'}
          badge={deposit?.status ?? null}
        />
        <Line
          label="Next action"
          value={lead.nextActionLabel ?? '–'}
          sub={lead.nextFollowUpAt ? `due ${relativeTime(lead.nextFollowUpAt, now)}` : undefined}
        />
      </section>

      {/* Buttons are permission-scoped (PRD 10.7); each opens the cockpit in a new tab. */}
      <section className="hairline-t grid grid-cols-2 gap-2 pt-4">
        <PanelLink href={`/leads/${lead.id}`} primary>Open lead</PanelLink>
        {canSearch ? <PanelLink href={`/leads/${lead.id}#availability`} icon={<BedDouble aria-hidden className="size-4" />}>Check availability</PanelLink> : null}
        {canQuote ? <PanelLink href={`/leads/${lead.id}#quote`} icon={<FileText aria-hidden className="size-4" />}>Create quote</PanelLink> : null}
        {canReserve ? <PanelLink href={`/leads/${lead.id}#reserve`} icon={<CalendarCheck aria-hidden className="size-4" />}>Request reservation</PanelLink> : null}
      </section>

      <p className="t-meta pt-2 text-center">
        {titleCase(conv.channel ?? 'chat')} · #{conv.externalConversationId}
        {account ? ` · account ${account}` : ''}
      </p>
    </PanelFrame>
  );
}

function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[420px] space-y-4 bg-bg p-4 text-ink">
      <div className="flex items-center justify-between">
        <span className="t-label">Hotel Sales Hub</span>
        <Link href="/" target="_blank" rel="noreferrer" className="focus-ring t-meta inline-flex items-center gap-1 rounded hover:text-ink">
          Open CRM <ExternalLink aria-hidden className="size-3" />
        </Link>
      </div>
      {children}
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="t-meta shrink-0">{label}</dt>
      <dd className={`t-small min-w-0 truncate text-right text-ink ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </div>
  );
}

function Line({ label, value, badge, sub }: { label: string; value: string; badge?: string | null; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="t-small text-ink-2">{label}</p>
        <p className="t-small truncate text-ink">{value}</p>
        {sub ? <p className="t-meta">{sub}</p> : null}
      </div>
      {badge ? <StatusBadge status={badge} short variant="dot" /> : null}
    </div>
  );
}

function PanelLink({ href, children, primary, icon }: { href: string; children: React.ReactNode; primary?: boolean; icon?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[13px] font-medium ${
        primary ? 'col-span-2 bg-primary text-on-primary hover:bg-primary-hover' : 'border border-border-strong bg-surface text-ink hover:bg-surface-2'
      }`}
    >
      {icon}
      {children}
    </a>
  );
}
