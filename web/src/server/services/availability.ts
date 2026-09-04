import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import {
  availabilitySearches, availabilitySnapshots, db, integrationConnections,
  properties, ratePlanReferences, roomTypeReferences,
} from '@/db';
import { newId } from '@/server/crypto';
import { trackEvent, writeAudit } from '@/server/audit';
import type { Session } from '@/server/auth';
import { MockPmsAdapter } from './pms/mock-adapter';
import { effectiveRate, listRatePlans, listRoomTypes, sellableRooms } from './inventory';
import type { AvailabilityQuery, PmsAdapter } from './pms/types';
import { nightsBetween } from '@/lib/utils';

export type AvailabilityRow = {
  roomTypeId: string | null;
  roomTypeName: string;
  roomTypeCode: string;
  ratePlanId: string | null;
  ratePlanName: string;
  ratePlanCode: string;
  sellableQty: number;
  ratePerNight: number;
  totalForStay: number;
  currency: string;
  restrictions: string[];
  inclusions: string[];
  state: 'live' | 'stale' | 'manual' | 'unavailable';
};

export type AvailabilityOutcome =
  | {
      ok: true;
      searchId: string;
      rows: AvailabilityRow[];
      checkedAt: Date;
      sourceLabel: string;
      latencyMs: number;
      /** True when the newest data we have is older than the org threshold. */
      stale: boolean;
    }
  | {
      ok: false;
      searchId: string;
      kind: 'timeout' | 'error' | 'unavailable';
      message: string;
      recovery: string;
      checkedAt: Date;
      sourceLabel: string;
      /** Last-known result, always labelled stale — never presented as live (PRD FR-08). */
      lastKnown: { rows: AvailabilityRow[]; checkedAt: Date; sourceLabel: string } | null;
    };

function adapterFor(adapter: string, label: string): PmsAdapter {
  // Only one connector exists today; the switch is where the next one plugs in.
  switch (adapter) {
    case 'pms-mock':
    default:
      return new MockPmsAdapter(label);
  }
}

export async function searchAvailability(
  session: Session,
  input: {
    propertyId: string;
    leadId?: string | null;
    checkIn: string;
    checkOut: string;
    rooms: number;
    adults: number;
    children: number;
    rateContext?: string | null;
    simulate?: AvailabilityQuery['simulate'];
  },
): Promise<AvailabilityOutcome> {
  const orgId = session.user.organizationId;
  const property = db
    .select({
      id: properties.id, code: properties.code, name: properties.name,
      currency: properties.currency, inventorySource: properties.inventorySource,
    })
    .from(properties)
    .where(and(eq(properties.id, input.propertyId), eq(properties.organizationId, orgId)))
    .get();
  if (!property) throw new Error('Property not found in this organization.');

  const connection = db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.organizationId, orgId), eq(integrationConnections.provider, 'pms'), eq(integrationConnections.active, true)))
    .get();

  const nights = nightsBetween(input.checkIn, input.checkOut);
  const searchId = newId('avs');
  const ctx = { organizationId: orgId, propertyId: input.propertyId, userId: session.user.id };
  const staleAfterMs = session.organization.availabilityStaleAfterMinutes * 60_000;

  // Inventaris milik CRM. Hotel yang mendefinisikan kamar dan tarifnya sendiri
  // tidak perlu PMS untuk menjawab "masih ada kamar?": jawabannya adalah alotmen
  // dikurangi reservasi yang menumpuk pada rentang tanggal itu. Sebelumnya jalur
  // ini tidak ada, sehingga properti tanpa PMS selalu berakhir di konfirmasi
  // manual meskipun datanya lengkap.
  if (property.inventorySource === 'crm') {
    const checkedAt = new Date();
    const started = Date.now();
    const roomTypes = listRoomTypes(orgId, input.propertyId).filter((r) => r.active);
    const ratePlans = listRatePlans(orgId, input.propertyId).filter((p) => p.active);
    const sourceLabel = 'Inventaris hotel (CRM)';

    if (roomTypes.length === 0 || ratePlans.length === 0) {
      db.insert(availabilitySearches).values({
        id: searchId, organizationId: orgId, propertyId: input.propertyId, leadId: input.leadId ?? null,
        connectionId: null, actorUserId: session.user.id, checkIn: input.checkIn, checkOut: input.checkOut,
        nights, rooms: input.rooms, adults: input.adults, children: input.children,
        rateContext: input.rateContext ?? null, status: 'error', sourceKind: 'crm',
        sourceLabel, latencyMs: 0, checkedAt,
      }).run();
      return {
        ok: false, searchId, kind: 'error', checkedAt, sourceLabel, lastKnown: null,
        message: 'Properti ini belum punya tipe kamar atau paket tarif yang aktif.',
        recovery: 'Buka Pengaturan → Kamar & Tarif, lalu definisikan minimal satu tipe kamar dan satu paket tarif.',
      };
    }

    const rows: AvailabilityRow[] = [];
    for (const room of roomTypes) {
      const free = sellableRooms(room, input.checkIn, input.checkOut);
      // Kapasitas orang membatasi kamar sama nyatanya seperti jumlah kamar.
      const fitsParty = room.maxAdults * input.rooms >= input.adults
        && room.maxChildren * input.rooms >= input.children;
      for (const plan of ratePlans) {
        const rate = effectiveRate(plan, room.code);
        const restrictions: string[] = [];
        if (nights < plan.minStay) restrictions.push(`Minimal ${plan.minStay} malam`);
        if (!fitsParty) restrictions.push(`Kapasitas ${room.maxAdults} dewasa / ${room.maxChildren} anak per kamar`);
        if (!plan.refundable) restrictions.push('Tidak dapat dibatalkan');
        const blocked = free < input.rooms || nights < plan.minStay || !fitsParty;
        rows.push({
          roomTypeId: room.id, roomTypeName: room.name, roomTypeCode: room.code,
          ratePlanId: plan.id, ratePlanName: plan.name, ratePlanCode: plan.code,
          sellableQty: free, ratePerNight: rate,
          totalForStay: rate * nights * input.rooms,
          currency: plan.currency, restrictions, inclusions: plan.inclusionList,
          state: blocked ? 'unavailable' : 'live',
        });
      }
    }

    const latencyMs = Date.now() - started;
    db.insert(availabilitySearches).values({
      id: searchId, organizationId: orgId, propertyId: input.propertyId, leadId: input.leadId ?? null,
      connectionId: null, actorUserId: session.user.id, checkIn: input.checkIn, checkOut: input.checkOut,
      nights, rooms: input.rooms, adults: input.adults, children: input.children,
      rateContext: input.rateContext ?? null, status: 'success', sourceKind: 'crm',
      sourceLabel, latencyMs, checkedAt,
    }).run();

    for (const row of rows) {
      db.insert(availabilitySnapshots).values({
        id: newId('avn'), organizationId: orgId, searchId,
        roomTypeId: row.roomTypeId, roomTypeName: row.roomTypeName,
        ratePlanId: row.ratePlanId, ratePlanName: row.ratePlanName,
        sellableQty: row.sellableQty, ratePerNight: row.ratePerNight, currency: row.currency,
        restrictions: JSON.stringify(row.restrictions), inclusions: JSON.stringify(row.inclusions),
        state: row.state, checkedAt,
      }).run();
    }

    trackEvent('availability_searched', ctx, { propertyId: input.propertyId, offers: rows.length });
    writeAudit({
      organizationId: orgId, propertyId: input.propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'availability.searched', entityType: 'availability_search', entityId: searchId,
      summary: `Ketersediaan dicek ${input.checkIn} → ${input.checkOut} (${input.rooms} kamar) dari inventaris hotel`,
    });

    return { ok: true, searchId, rows, checkedAt, sourceLabel, latencyMs, stale: false };
  }

  // No connector configured: the product still works, but only via explicit manual confirmation.
  if (!connection) {
    const checkedAt = new Date();
    db.insert(availabilitySearches).values({
      id: searchId, organizationId: orgId, propertyId: input.propertyId, leadId: input.leadId ?? null,
      connectionId: null, actorUserId: session.user.id, checkIn: input.checkIn, checkOut: input.checkOut,
      nights, rooms: input.rooms, adults: input.adults, children: input.children,
      rateContext: input.rateContext ?? null, status: 'manual', sourceKind: 'manual',
      sourceLabel: 'Manual confirmation', latencyMs: 0, checkedAt,
    }).run();
    return {
      ok: false, searchId, kind: 'error', checkedAt, sourceLabel: 'Manual confirmation',
      message: 'No PMS/CRS connector is configured for this organization.',
      recovery: 'Confirm the rooms with the front office and record the result as a manual confirmation before quoting.',
      lastKnown: null,
    };
  }

  const rooms = db.select().from(roomTypeReferences).where(eq(roomTypeReferences.propertyId, input.propertyId)).all();
  const plans = db.select().from(ratePlanReferences).where(eq(ratePlanReferences.propertyId, input.propertyId)).all();
  const roomByCode = new Map(rooms.map((r) => [r.code, r]));
  const planByCode = new Map(plans.map((p) => [p.code, p]));

  const adapter = adapterFor(connection.adapter, connection.label);
  const result = await adapter.searchAvailability({
    propertyId: input.propertyId,
    externalPropertyCode: property.code,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    rooms: input.rooms,
    adults: input.adults,
    children: input.children,
    rateContext: input.rateContext,
    simulate: input.simulate,
  });


  if (!result.ok) {
    db.insert(availabilitySearches).values({
      id: searchId, organizationId: orgId, propertyId: input.propertyId, leadId: input.leadId ?? null,
      connectionId: connection.id, actorUserId: session.user.id, checkIn: input.checkIn, checkOut: input.checkOut,
      nights, rooms: input.rooms, adults: input.adults, children: input.children,
      rateContext: input.rateContext ?? null,
      status: result.kind === 'unavailable' ? 'unavailable' : result.kind,
      sourceKind: 'pms', sourceLabel: result.sourceLabel, latencyMs: result.latencyMs,
      error: result.message, checkedAt: result.checkedAt,
    }).run();

    trackEvent('availability_failed', ctx, { kind: result.kind, propertyId: input.propertyId });

    // Surface the last successful look-up, explicitly marked stale.
    const previous = db
      .select({ id: availabilitySearches.id, checkedAt: availabilitySearches.checkedAt, sourceLabel: availabilitySearches.sourceLabel })
      .from(availabilitySearches)
      .where(
        and(
          eq(availabilitySearches.propertyId, input.propertyId),
          eq(availabilitySearches.checkIn, input.checkIn),
          eq(availabilitySearches.checkOut, input.checkOut),
          eq(availabilitySearches.status, 'success'),
        ),
      )
      .orderBy(desc(availabilitySearches.checkedAt))
      .get();

    const lastKnown = previous
      ? {
          checkedAt: previous.checkedAt,
          sourceLabel: previous.sourceLabel,
          rows: db
            .select()
            .from(availabilitySnapshots)
            .where(eq(availabilitySnapshots.searchId, previous.id))
            .all()
            .map((s) => ({
              roomTypeId: s.roomTypeId,
              roomTypeName: s.roomTypeName,
              roomTypeCode: roomByCode.get(s.roomTypeName)?.code ?? '',
              ratePlanId: s.ratePlanId,
              ratePlanName: s.ratePlanName,
              ratePlanCode: '',
              sellableQty: s.sellableQty,
              ratePerNight: s.ratePerNight,
              totalForStay: s.ratePerNight * nights * input.rooms,
              currency: s.currency,
              restrictions: JSON.parse(s.restrictions) as string[],
              inclusions: JSON.parse(s.inclusions) as string[],
              // Cached rows are always stale here, regardless of age.
              state: 'stale' as const,
            })),
        }
      : null;

    return {
      ok: false, searchId, kind: result.kind, message: result.message, recovery: result.recovery,
      checkedAt: result.checkedAt, sourceLabel: result.sourceLabel, lastKnown,
    };
  }

  db.insert(availabilitySearches).values({
    id: searchId, organizationId: orgId, propertyId: input.propertyId, leadId: input.leadId ?? null,
    connectionId: connection.id, actorUserId: session.user.id, checkIn: input.checkIn, checkOut: input.checkOut,
    nights, rooms: input.rooms, adults: input.adults, children: input.children,
    rateContext: input.rateContext ?? null, status: 'success', sourceKind: 'pms',
    sourceLabel: result.sourceLabel, latencyMs: result.latencyMs, checkedAt: result.checkedAt,
  }).run();

  const rows: AvailabilityRow[] = result.offers.map((offer) => {
    const room = roomByCode.get(offer.roomTypeCode);
    const plan = planByCode.get(offer.ratePlanCode);
    return {
      roomTypeId: room?.id ?? null,
      roomTypeName: room?.name ?? offer.roomTypeCode,
      roomTypeCode: offer.roomTypeCode,
      ratePlanId: plan?.id ?? null,
      ratePlanName: plan?.name ?? offer.ratePlanCode,
      ratePlanCode: offer.ratePlanCode,
      sellableQty: offer.sellableQty,
      ratePerNight: offer.ratePerNight,
      totalForStay: offer.ratePerNight * nights * input.rooms,
      currency: offer.currency,
      restrictions: offer.restrictions,
      inclusions: offer.inclusions,
      state: offer.sellableQty === 0 ? 'unavailable' : 'live',
    };
  });

  for (const row of rows) {
    db.insert(availabilitySnapshots).values({
      id: newId('avn'), organizationId: orgId, searchId,
      roomTypeId: row.roomTypeId, roomTypeName: row.roomTypeName,
      ratePlanId: row.ratePlanId, ratePlanName: row.ratePlanName,
      sellableQty: row.sellableQty, ratePerNight: row.ratePerNight, currency: row.currency,
      restrictions: JSON.stringify(row.restrictions), inclusions: JSON.stringify(row.inclusions),
      state: row.state, checkedAt: result.checkedAt,
    }).run();
  }

  trackEvent('availability_searched', ctx, { propertyId: input.propertyId, offers: rows.length });
  writeAudit({
    organizationId: orgId, propertyId: input.propertyId,
    actorUserId: session.user.id, actorName: session.user.name,
    action: 'availability.searched', entityType: 'availability_search', entityId: searchId,
    summary: `Availability checked for ${input.checkIn} → ${input.checkOut} (${input.rooms} rooms) via ${result.sourceLabel}`,
  });

  return {
    ok: true, searchId, rows, checkedAt: result.checkedAt,
    sourceLabel: result.sourceLabel, latencyMs: result.latencyMs,
    stale: Date.now() - result.checkedAt.getTime() > staleAfterMs,
  };
}

/** Most recent search for a lead, used to show freshness in the cockpit. */
export function latestSearchForLead(leadId: string, staleAfterMinutes: number) {
  const search = db
    .select()
    .from(availabilitySearches)
    .where(and(eq(availabilitySearches.leadId, leadId), eq(availabilitySearches.status, 'success')))
    .orderBy(desc(availabilitySearches.checkedAt))
    .get();
  if (!search) return null;

  const snapshots = db
    .select()
    .from(availabilitySnapshots)
    .where(eq(availabilitySnapshots.searchId, search.id))
    .all();

  const stale = Date.now() - search.checkedAt.getTime() > staleAfterMinutes * 60_000;
  return {
    search,
    stale,
    snapshots: snapshots.map((s) => ({
      ...s,
      restrictions: JSON.parse(s.restrictions) as string[],
      inclusions: JSON.parse(s.inclusions) as string[],
      state: (stale && s.state === 'live' ? 'stale' : s.state) as AvailabilityRow['state'],
    })),
  };
}
