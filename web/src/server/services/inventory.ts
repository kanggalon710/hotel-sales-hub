import 'server-only';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  db, properties, quotationItems, ratePlanReferences, reservationRequests,
  roomTypeReferences,
} from '@/db';
import { newId } from '@/server/crypto';
import { parseJson } from '@/lib/utils';

/**
 * Inventaris kamar milik CRM.
 *
 * Sebelum modul ini ada, `room_type_references` hanya cermin data PMS: ia
 * memberi nama pada penawaran yang dikembalikan adapter, tidak menyimpan jumlah
 * kamar maupun tarif. Akibatnya sebuah properti tanpa PMS tidak punya kamar sama
 * sekali, dan `searchAvailability` hanya bisa menyuruh orang menelepon front
 * office. Sebuah hotel harus bisa beroperasi sebelum PMS-nya ada, jadi CRM kini
 * boleh menjadi pemilik inventaris (`properties.inventorySource = 'crm'`).
 *
 * Status yang benar-benar memakan kamar. 'draft' dan 'submitted' belum, karena
 * belum ada komitmen ke tamu; 'on_hold' dan 'confirmed' sudah.
 */
export const BLOCKING_RESERVATION_STATUSES = ['on_hold', 'confirmed'] as const;

export const MEAL_PLANS = [
  { key: 'room_only', label: 'Kamar saja' },
  { key: 'breakfast', label: 'Termasuk sarapan' },
  { key: 'half_board', label: 'Setengah papan' },
  { key: 'full_board', label: 'Penuh papan' },
] as const;

export type RoomTypeInput = {
  code: string;
  name: string;
  totalRooms: number;
  maxAdults: number;
  maxChildren: number;
  bedType?: string | null;
  sizeSqm?: number | null;
  description?: string | null;
  active: boolean;
};

export type RatePlanInput = {
  code: string;
  name: string;
  mealPlan: string;
  baseRatePerNight: number;
  refundable: boolean;
  minStay: number;
  inclusions: string[];
  policies?: string | null;
  roomTypeSurcharges: Record<string, number>;
  active: boolean;
};

export type Guard = { ok: true } | { ok: false; reason: string };

/** Dua rentang inap bertumpuk bila yang satu mulai sebelum yang lain selesai. */
function overlaps(checkIn: string, checkOut: string) {
  return and(
    sql`${reservationRequests.checkIn} < ${checkOut}`,
    sql`${reservationRequests.checkOut} > ${checkIn}`,
  );
}

/**
 * Kamar yang sudah terikat untuk satu tipe pada satu rentang tanggal. Ini yang
 * dikurangkan dari alotmen; tanpa ini "ketersediaan" hanya angka statis yang
 * tidak pernah turun ketika reservasi bertambah.
 */
export function committedRooms(
  propertyId: string,
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
  exceptReservationId?: string,
) {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${reservationRequests.rooms}), 0)` })
    .from(reservationRequests)
    .where(
      and(
        eq(reservationRequests.propertyId, propertyId),
        eq(reservationRequests.roomTypeId, roomTypeId),
        inArray(reservationRequests.status, [...BLOCKING_RESERVATION_STATUSES]),
        overlaps(checkIn, checkOut),
        exceptReservationId ? ne(reservationRequests.id, exceptReservationId) : undefined,
      ),
    )
    .get();
  return row?.total ?? 0;
}

/** Sisa kamar yang boleh dijual, tidak pernah negatif. */
export function sellableRooms(
  roomType: { id: string; propertyId: string; totalRooms: number },
  checkIn: string,
  checkOut: string,
) {
  const taken = committedRooms(roomType.propertyId, roomType.id, checkIn, checkOut);
  return Math.max(0, roomType.totalRooms - taken);
}

export function listRoomTypes(organizationId: string, propertyId: string) {
  return db
    .select()
    .from(roomTypeReferences)
    .where(and(
      eq(roomTypeReferences.organizationId, organizationId),
      eq(roomTypeReferences.propertyId, propertyId),
    ))
    .all();
}

export function listRatePlans(organizationId: string, propertyId: string) {
  return db
    .select()
    .from(ratePlanReferences)
    .where(and(
      eq(ratePlanReferences.organizationId, organizationId),
      eq(ratePlanReferences.propertyId, propertyId),
    ))
    .all()
    .map((p) => ({
      ...p,
      inclusionList: parseJson<string[]>(p.inclusions, []),
      surcharges: parseJson<Record<string, number>>(p.roomTypeSurcharges, {}),
    }));
}

/**
 * Baris hasil sinkronisasi PMS tidak boleh disunting di sini. PMS yang berwenang
 * atasnya, dan suntingan lokal akan tertimpa diam-diam pada sinkron berikutnya.
 */
function assertEditable(row: { source: string }, what: string): Guard {
  if (row.source === 'pms') {
    return { ok: false, reason: `${what} ini disinkronkan dari PMS, jadi hanya bisa diubah di sistem tersebut.` };
  }
  return { ok: true };
}

export function createRoomType(organizationId: string, propertyId: string, input: RoomTypeInput): Guard & { id?: string } {
  const clash = db.select({ id: roomTypeReferences.id }).from(roomTypeReferences)
    .where(and(eq(roomTypeReferences.propertyId, propertyId), eq(roomTypeReferences.code, input.code))).get();
  if (clash) return { ok: false, reason: `Kode "${input.code}" sudah dipakai tipe kamar lain di properti ini.` };

  const id = newId('rmt');
  db.insert(roomTypeReferences).values({
    id, organizationId, propertyId, connectionId: null, externalId: null,
    code: input.code, name: input.name,
    maxAdults: input.maxAdults, maxChildren: input.maxChildren,
    bedType: input.bedType ?? null, sizeSqm: input.sizeSqm ?? null,
    description: input.description ?? null,
    totalRooms: input.totalRooms, source: 'crm', active: input.active,
  }).run();
  return { ok: true, id };
}

export function updateRoomType(organizationId: string, id: string, input: RoomTypeInput): Guard {
  const row = db.select().from(roomTypeReferences)
    .where(and(eq(roomTypeReferences.id, id), eq(roomTypeReferences.organizationId, organizationId))).get();
  if (!row) return { ok: false, reason: 'Tipe kamar tidak ditemukan.' };
  const editable = assertEditable(row, 'Tipe kamar');
  if (!editable.ok) return editable;

  const clash = db.select({ id: roomTypeReferences.id }).from(roomTypeReferences)
    .where(and(
      eq(roomTypeReferences.propertyId, row.propertyId),
      eq(roomTypeReferences.code, input.code),
      ne(roomTypeReferences.id, id),
    )).get();
  if (clash) return { ok: false, reason: `Kode "${input.code}" sudah dipakai tipe kamar lain di properti ini.` };

  // Menurunkan alotmen di bawah kamar yang sudah dijanjikan akan membuat
  // ketersediaan berbohong, jadi ditolak dengan angka yang menjelaskan.
  const peak = db
    .select({ total: sql<number>`coalesce(max(t.total), 0)` })
    .from(sql`(select sum(${reservationRequests.rooms}) as total
               from ${reservationRequests}
               where ${reservationRequests.roomTypeId} = ${id}
                 and ${reservationRequests.status} in ('on_hold','confirmed')
               group by ${reservationRequests.checkIn}) as t`)
    .get();
  const committed = peak?.total ?? 0;
  if (input.totalRooms < committed) {
    return {
      ok: false,
      reason: `Ada ${committed} kamar yang sudah terikat reservasi berjalan, jadi alotmen tidak bisa turun ke ${input.totalRooms}.`,
    };
  }

  db.update(roomTypeReferences).set({
    code: input.code, name: input.name,
    maxAdults: input.maxAdults, maxChildren: input.maxChildren,
    bedType: input.bedType ?? null, sizeSqm: input.sizeSqm ?? null,
    description: input.description ?? null,
    totalRooms: input.totalRooms, active: input.active, updatedAt: new Date(),
  }).where(eq(roomTypeReferences.id, id)).run();
  return { ok: true };
}

/**
 * Menghapus tipe kamar yang pernah dipakai akan memutus riwayat: penawaran dan
 * reservasi lama kehilangan acuannya. Yang sudah terpakai hanya boleh
 * dinonaktifkan, sehingga hilang dari pilihan baru tanpa merusak yang lampau.
 */
export function removeRoomType(organizationId: string, id: string): Guard {
  const row = db.select().from(roomTypeReferences)
    .where(and(eq(roomTypeReferences.id, id), eq(roomTypeReferences.organizationId, organizationId))).get();
  if (!row) return { ok: false, reason: 'Tipe kamar tidak ditemukan.' };
  const editable = assertEditable(row, 'Tipe kamar');
  if (!editable.ok) return editable;

  // `stay_requests` hanya menyimpan preferensi kamar sebagai teks bebas, jadi
  // tidak ikut mengunci: yang mengikat adalah penawaran dan reservasi.
  const used =
    db.select({ id: reservationRequests.id }).from(reservationRequests).where(eq(reservationRequests.roomTypeId, id)).get() ??
    db.select({ id: quotationItems.id }).from(quotationItems).where(eq(quotationItems.roomTypeId, id)).get();
  if (used) {
    return { ok: false, reason: 'Tipe kamar ini sudah dipakai pada penawaran atau reservasi. Nonaktifkan saja agar riwayatnya tetap utuh.' };
  }

  db.delete(roomTypeReferences).where(eq(roomTypeReferences.id, id)).run();
  return { ok: true };
}

export function createRatePlan(organizationId: string, propertyId: string, input: RatePlanInput): Guard & { id?: string } {
  const clash = db.select({ id: ratePlanReferences.id }).from(ratePlanReferences)
    .where(and(eq(ratePlanReferences.propertyId, propertyId), eq(ratePlanReferences.code, input.code))).get();
  if (clash) return { ok: false, reason: `Kode "${input.code}" sudah dipakai paket tarif lain di properti ini.` };

  const property = db.select().from(properties).where(eq(properties.id, propertyId)).get();
  const id = newId('rpl');
  db.insert(ratePlanReferences).values({
    id, organizationId, propertyId, connectionId: null, externalId: null,
    code: input.code, name: input.name, mealPlan: input.mealPlan,
    refundable: input.refundable, minStay: input.minStay,
    inclusions: JSON.stringify(input.inclusions),
    policies: input.policies ?? null,
    currency: property?.currency ?? 'IDR',
    baseRatePerNight: input.baseRatePerNight,
    roomTypeSurcharges: JSON.stringify(input.roomTypeSurcharges),
    source: 'crm', active: input.active,
  }).run();
  return { ok: true, id };
}

export function updateRatePlan(organizationId: string, id: string, input: RatePlanInput): Guard {
  const row = db.select().from(ratePlanReferences)
    .where(and(eq(ratePlanReferences.id, id), eq(ratePlanReferences.organizationId, organizationId))).get();
  if (!row) return { ok: false, reason: 'Paket tarif tidak ditemukan.' };
  const editable = assertEditable(row, 'Paket tarif');
  if (!editable.ok) return editable;

  const clash = db.select({ id: ratePlanReferences.id }).from(ratePlanReferences)
    .where(and(
      eq(ratePlanReferences.propertyId, row.propertyId),
      eq(ratePlanReferences.code, input.code),
      ne(ratePlanReferences.id, id),
    )).get();
  if (clash) return { ok: false, reason: `Kode "${input.code}" sudah dipakai paket tarif lain di properti ini.` };

  db.update(ratePlanReferences).set({
    code: input.code, name: input.name, mealPlan: input.mealPlan,
    refundable: input.refundable, minStay: input.minStay,
    inclusions: JSON.stringify(input.inclusions),
    policies: input.policies ?? null,
    baseRatePerNight: input.baseRatePerNight,
    roomTypeSurcharges: JSON.stringify(input.roomTypeSurcharges),
    active: input.active, updatedAt: new Date(),
  }).where(eq(ratePlanReferences.id, id)).run();
  return { ok: true };
}

export function removeRatePlan(organizationId: string, id: string): Guard {
  const row = db.select().from(ratePlanReferences)
    .where(and(eq(ratePlanReferences.id, id), eq(ratePlanReferences.organizationId, organizationId))).get();
  if (!row) return { ok: false, reason: 'Paket tarif tidak ditemukan.' };
  const editable = assertEditable(row, 'Paket tarif');
  if (!editable.ok) return editable;

  const used =
    db.select({ id: reservationRequests.id }).from(reservationRequests).where(eq(reservationRequests.ratePlanId, id)).get() ??
    db.select({ id: quotationItems.id }).from(quotationItems).where(eq(quotationItems.ratePlanId, id)).get();
  if (used) {
    return { ok: false, reason: 'Paket tarif ini sudah dipakai pada penawaran atau reservasi. Nonaktifkan saja agar riwayatnya tetap utuh.' };
  }

  db.delete(ratePlanReferences).where(eq(ratePlanReferences.id, id)).run();
  return { ok: true };
}

/** Tarif efektif satu paket untuk satu tipe kamar, termasuk selisihnya. */
export function effectiveRate(
  plan: { baseRatePerNight: number; surcharges: Record<string, number> },
  roomTypeCode: string,
) {
  return plan.baseRatePerNight + (plan.surcharges[roomTypeCode] ?? 0);
}
