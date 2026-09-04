import 'server-only';
import { and, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import {
  availabilitySearches, contacts, db, depositStatusReferences, leads, properties,
  quotations, quotationVersions, reservationReferences, reservationRequests, users,
} from '@/db';
import { buildStaySteps } from '@/server/lead-progress';
import { leadScopeWhere, maskEmail, maskName, maskPhone, piiLevel, type PropertyScope, type Session } from '@/server/context';
import type { StayStep } from '@/components/live-stay-strip';

export type LeadFilters = {
  stages?: string[];
  status?: 'open' | 'closed' | 'all';
  ownerUserId?: string | 'unassigned' | null;
  search?: string;
  overdueOnly?: boolean;
  limit?: number;
  sort?: 'recent' | 'value' | 'checkin' | 'sla';
};

export type LeadRow = {
  id: string;
  code: string;
  stage: string;
  status: string;
  propertyId: string;
  propertyName: string;
  propertyCode: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestTier: string;
  contactId: string;
  ownerUserId: string | null;
  ownerName: string | null;
  channel: string | null;
  source: string | null;
  inquiryType: string;
  checkIn: string | null;
  checkOut: string | null;
  rooms: number | null;
  adults: number | null;
  children: number | null;
  estimatedValue: number;
  currency: string;
  probability: number;
  nextActionLabel: string | null;
  nextFollowUpAt: number | null;
  slaDueAt: number | null;
  firstRespondedAt: number | null;
  lastActivityAt: number | null;
  createdAt: number;
  lostReason: string | null;
  steps: StayStep[];
  quotationCode: string | null;
  quotationStatus: string | null;
  quotationTotal: number | null;
  quotationValidUntil: number | null;
  reservationStatus: string | null;
  reservationReference: string | null;
  availabilityCheckedAt: number | null;
  availabilityStale: boolean;
};

const CLOSED = ['lost', 'cancelled'];

/**
 * Single entry point for reading leads. Scope, visibility, and PII masking are
 * applied here so no caller can accidentally widen them.
 */
export function listLeads(session: Session, scope: PropertyScope, filters: LeadFilters = {}): LeadRow[] {
  const base = leadScopeWhere(session, scope);
  if (!base) return [];

  const clauses: SQL[] = [base];

  if (filters.stages?.length) clauses.push(inArray(leads.stage, filters.stages));
  if (filters.status === 'open') clauses.push(eq(leads.status, 'open'));
  if (filters.status === 'closed') clauses.push(inArray(leads.status, CLOSED));
  if (filters.ownerUserId === 'unassigned') clauses.push(sql`${leads.ownerUserId} is null`);
  else if (filters.ownerUserId) clauses.push(eq(leads.ownerUserId, filters.ownerUserId));
  if (filters.overdueOnly) {
    clauses.push(sql`${leads.nextFollowUpAt} is not null and ${leads.nextFollowUpAt} < ${Date.now()}`);
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(
      or(
        like(sql`lower(${contacts.fullName})`, term),
        like(sql`lower(${leads.code})`, term),
        like(sql`lower(coalesce(${contacts.email}, ''))`, term),
        like(sql`coalesce(${contacts.phoneNormalized}, '')`, term),
      )!,
    );
  }

  const order =
    filters.sort === 'value' ? desc(leads.estimatedValue)
    : filters.sort === 'checkin' ? sql`${leads.checkIn} asc nulls last`
    : filters.sort === 'sla' ? sql`${leads.slaFirstResponseDueAt} asc nulls last`
    : desc(leads.updatedAt);

  const rows = db
    .select({
      id: leads.id, code: leads.code, stage: leads.stage, status: leads.status,
      propertyId: leads.propertyId, propertyName: properties.name, propertyCode: properties.code,
      contactId: contacts.id, guestName: contacts.fullName, guestPhone: contacts.phoneNormalized,
      guestEmail: contacts.email, guestTier: contacts.guestTier,
      ownerUserId: leads.ownerUserId, ownerName: users.name,
      channel: leads.channel, source: leads.source, inquiryType: leads.inquiryType,
      checkIn: leads.checkIn, checkOut: leads.checkOut, rooms: leads.rooms,
      adults: leads.adults, children: leads.children,
      estimatedValue: leads.estimatedValue, currency: leads.currency, probability: leads.probability,
      nextActionLabel: leads.nextActionLabel, nextFollowUpAt: leads.nextFollowUpAt,
      slaDueAt: leads.slaFirstResponseDueAt, firstRespondedAt: leads.firstRespondedAt,
      lastActivityAt: leads.lastActivityAt, createdAt: leads.createdAt, lostReason: leads.lostReason,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(properties, eq(properties.id, leads.propertyId))
    .leftJoin(users, eq(users.id, leads.ownerUserId))
    .where(and(...clauses))
    .orderBy(order)
    .limit(filters.limit ?? 200)
    .all();

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const level = piiLevel(session);
  const staleAfter = session.organization.availabilityStaleAfterMinutes;

  /* Batched companions — one query per relation, never per row. */

  const latestAvailability = new Map<string, { checkedAt: Date; source: string; state: string }>();
  for (const a of db
    .select({
      leadId: availabilitySearches.leadId,
      checkedAt: availabilitySearches.checkedAt,
      source: availabilitySearches.sourceLabel,
      status: availabilitySearches.status,
    })
    .from(availabilitySearches)
    .where(inArray(availabilitySearches.leadId, ids))
    .orderBy(desc(availabilitySearches.checkedAt))
    .all()) {
    if (a.leadId && !latestAvailability.has(a.leadId)) {
      latestAvailability.set(a.leadId, { checkedAt: a.checkedAt, source: a.source, state: a.status });
    }
  }

  const latestQuotation = new Map<
    string,
    { code: string; status: string; total: number; currency: string; validUntil: Date | null; versionId: string }
  >();
  for (const q of db
    .select({
      leadId: quotations.leadId, code: quotations.code, status: quotationVersions.status,
      total: quotationVersions.total, currency: quotationVersions.currency,
      validUntil: quotationVersions.validUntil, versionId: quotationVersions.id,
      createdAt: quotationVersions.createdAt,
    })
    .from(quotations)
    .innerJoin(quotationVersions, eq(quotationVersions.id, quotations.currentVersionId))
    .where(inArray(quotations.leadId, ids))
    .orderBy(desc(quotationVersions.createdAt))
    .all()) {
    if (!latestQuotation.has(q.leadId)) latestQuotation.set(q.leadId, q);
  }

  const latestReservation = new Map<string, { status: string; reference: string | null }>();
  for (const r of db
    .select({
      leadId: reservationRequests.leadId,
      status: reservationRequests.status,
      reference: reservationReferences.externalReference,
      createdAt: reservationRequests.createdAt,
    })
    .from(reservationRequests)
    .leftJoin(reservationReferences, eq(reservationReferences.reservationRequestId, reservationRequests.id))
    .where(inArray(reservationRequests.leadId, ids))
    .orderBy(desc(reservationRequests.createdAt))
    .all()) {
    if (!latestReservation.has(r.leadId)) latestReservation.set(r.leadId, { status: r.status, reference: r.reference });
  }

  const deposits = new Map<string, { status: string; dueAt: Date | null }>();
  for (const d of db
    .select({ leadId: depositStatusReferences.leadId, status: depositStatusReferences.status, dueAt: depositStatusReferences.dueAt })
    .from(depositStatusReferences)
    .where(inArray(depositStatusReferences.leadId, ids))
    .all()) {
    if (d.leadId && !deposits.has(d.leadId)) deposits.set(d.leadId, { status: d.status, dueAt: d.dueAt });
  }

  const now = Date.now();
  return rows.map((r) => {
    const availability = latestAvailability.get(r.id) ?? null;
    const quotation = latestQuotation.get(r.id) ?? null;
    const reservation = latestReservation.get(r.id) ?? null;
    const deposit = deposits.get(r.id) ?? null;

    return {
      ...r,
      guestName: maskName(r.guestName, level),
      guestPhone: maskPhone(r.guestPhone, level),
      guestEmail: maskEmail(r.guestEmail, level),
      nextFollowUpAt: r.nextFollowUpAt?.getTime() ?? null,
      slaDueAt: r.slaDueAt?.getTime() ?? null,
      firstRespondedAt: r.firstRespondedAt?.getTime() ?? null,
      lastActivityAt: r.lastActivityAt?.getTime() ?? null,
      createdAt: r.createdAt.getTime(),
      quotationCode: quotation?.code ?? null,
      quotationStatus: quotation?.status ?? null,
      quotationTotal: quotation?.total ?? null,
      quotationValidUntil: quotation?.validUntil?.getTime() ?? null,
      reservationStatus: reservation?.status ?? null,
      reservationReference: reservation?.reference ?? null,
      availabilityCheckedAt: availability?.checkedAt.getTime() ?? null,
      availabilityStale: availability ? now - availability.checkedAt.getTime() > staleAfter * 60_000 : false,
      steps: buildStaySteps(
        {
          stage: r.stage, status: r.status, createdAt: r.createdAt,
          firstRespondedAt: r.firstRespondedAt, slaDueAt: r.slaDueAt,
          availability, quotation, deposit, reservation, staleAfterMinutes: staleAfter,
        },
        now,
      ),
    };
  });
}

export function countLeadsByStage(session: Session, scope: PropertyScope) {
  const base = leadScopeWhere(session, scope);
  if (!base) return new Map<string, { count: number; value: number }>();
  const rows = db
    .select({
      stage: leads.stage,
      count: sql<number>`count(*)`,
      value: sql<number>`coalesce(sum(${leads.estimatedValue}), 0)`,
    })
    .from(leads)
    .where(base)
    .groupBy(leads.stage)
    .all();
  return new Map(rows.map((r) => [r.stage, { count: Number(r.count), value: Number(r.value) }]));
}
