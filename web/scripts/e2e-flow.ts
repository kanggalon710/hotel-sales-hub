/**
 * Menelusuri satu siklus hidup penuh lewat jalur kode produksi yang asli:
 * pesan WhatsApp masuk dari Chatwoot, menjadi prospek, naik tiap tahap pipeline
 * dengan gerbangnya, dikutip, dipesan, ditutup, lalu apa yang terjadi sesudahnya.
 *
 * Tujuannya bukan lulus, tapi jujur. Setiap langkah melaporkan apa adanya, dan
 * langkah yang gagal tidak menghentikan sisanya, supaya satu jalan buntu tidak
 * menyembunyikan jalan buntu berikutnya.
 *
 *   DATABASE_FILE=... CRM_SECRET_KEY=... node --experimental-strip-types scripts/e2e-flow.ts
 */
import { and, eq } from 'drizzle-orm';
import * as s from './db.ts';
import * as s2 from './db.ts';
import { db } from './db.ts';
import { newId } from '../src/server/crypto.ts';
import { ROLE_DEFINITIONS, type RoleKey } from '../src/lib/constants.ts';
import { recordWebhookEvent, processWebhookEvent } from '../src/server/services/chatwoot-ingest.ts';
import { moveLeadStage, checkStageGates, setPrimaryStay } from '../src/server/services/leads.ts';
import { searchAvailability } from '../src/server/services/availability.ts';
import { createQuotationVersion, sendQuotation, setQuotationOutcome } from '../src/server/services/quotations.ts';
import { createReservationRequest, decideReservation } from '../src/server/services/reservations.ts';
import { createRoomType, createRatePlan, listRoomTypes, listRatePlans, sellableRooms } from '../src/server/services/inventory.ts';
import { runAfterSalesSweep, winBackCandidates } from '../src/server/services/after-sales.ts';

let pass = 0, fail = 0, gap = 0;
const step = (n: string) => console.log(`\n${'─'.repeat(64)}\n▶ ${n}`);
const ok = (m: string) => { pass++; console.log(`  ✔ ${m}`); };
const bad = (m: string) => { fail++; console.log(`  ✘ ${m}`); };
// Disimpan agar langkah yang belum ada bisa ditandai tanpa dianggap gagal.
const missing = (m: string) => { gap += 1; console.log(`  ◻ BELUM ADA: ${m}`); };
void missing;

/* ---------------------------------------------------------------- setup -- */
const org = db.select().from(s.organizations).get();
if (!org) { console.error('Jalankan db:bootstrap dulu.'); process.exit(1); }
const ORG = org;
const admin = db.select().from(s.users).where(eq(s.users.organizationId, org.id)).get()!;

const propertyId = newId('prp');
db.insert(s.properties).values({
  id: propertyId, organizationId: org.id, name: 'Hotel Arkanova Jakarta', code: 'HAJ',
  city: 'Jakarta', country: 'ID', currency: 'IDR', timezone: 'Asia/Jakarta',
  inventorySource: 'crm', active: true,
}).run();

const session = {
  sessionId: newId('ses'),
  user: {
    id: admin.id, name: admin.name, email: admin.email, organizationId: org.id,
    jobTitle: admin.jobTitle, mustChangePassword: false,
    discountLimitPercent: 100, canApproveDiscountUpToPercent: 100,
  },
  organization: {
    id: org.id, name: org.name, currency: org.currency, locale: org.locale, timezone: org.timezone,
    taxPercent: org.taxPercent, servicePercent: org.servicePercent,
    quotationValidityHours: org.quotationValidityHours,
    firstResponseSlaMinutes: org.firstResponseSlaMinutes,
    availabilityStaleAfterMinutes: org.availabilityStaleAfterMinutes,
  },
  orgRoleKeys: ['org_admin' as RoleKey],
  propertyAccess: [{ propertyId, propertyName: 'Hotel Arkanova Jakarta', roleKeys: ['org_admin' as RoleKey], teamId: null }],
  permissions: new Set(ROLE_DEFINITIONS.org_admin.permissions),
} as never;

/* ------------------------------------------------------- 1. inventaris -- */
step('1. Hotel mendefinisikan kamar dan tarifnya sendiri (tanpa PMS)');
const rt = createRoomType(org.id, propertyId, {
  code: 'DLXK', name: 'Deluxe King', totalRooms: 12, maxAdults: 2, maxChildren: 1,
  bedType: 'King', sizeSqm: 32, description: 'Kamar deluxe dengan ranjang king', active: true,
});
if (rt.ok) ok('Tipe kamar "Deluxe King" dibuat, alotmen 12 kamar');
else bad(`Tipe kamar gagal: ${rt.reason}`);

const rp = createRatePlan(org.id, propertyId, {
  code: 'BAR', name: 'Best Available Rate', mealPlan: 'breakfast',
  baseRatePerNight: 1_450_000, refundable: true, minStay: 1,
  inclusions: ['Sarapan 2 orang', 'WiFi'], policies: 'Batal gratis H-2',
  roomTypeSurcharges: {}, active: true,
});
if (rp.ok) ok('Paket tarif "BAR" dibuat, Rp 1.450.000/malam');
else bad(`Paket tarif gagal: ${rp.reason}`);

const rooms = listRoomTypes(org.id, propertyId);
const plans = listRatePlans(org.id, propertyId);
const free = rooms[0] ? sellableRooms(rooms[0], '2026-10-10', '2026-10-12') : 0;
if (free === 12) ok(`Ketersediaan dihitung CRM: ${free} kamar bebas 10-12 Okt`);
else bad(`Ketersediaan salah: ${free}`);

/* --------------------------------------------------- 2. koneksi chatwoot -- */
step('2. Koneksi Chatwoot dan pemetaan inbox');
const connId = newId('con');
db.insert(s.integrationConnections).values({
  id: connId, organizationId: org.id, provider: 'chatwoot', adapter: 'chatwoot',
  label: 'Chatwoot Produksi', baseUrl: 'https://chatwoot.example.com', externalAccountId: '1',
  status: 'healthy', active: true,
}).run();
db.insert(s.mappingRules).values({
  id: newId('map'), organizationId: org.id, connectionId: connId, kind: 'inbox',
  externalId: '2', externalName: 'Pararel', propertyId, isSalesInbox: true,
  status: 'mapped', channel: 'whatsapp', inquiryType: 'fit',
}).run();
ok('Inbox 2 (Pararel/WhatsApp) dipetakan ke Hotel Arkanova Jakarta sebagai inbox penjualan');

/* ------------------------------------------------- 3. chat masuk -> lead -- */
step('3. Pesan WhatsApp masuk dari Chatwoot menjadi prospek');
function feed(payload: Record<string, unknown>, label: string) {
  const rec = recordWebhookEvent({
    connectionId: connId, organizationId: ORG.id,
    payload: payload as never, rawBody: JSON.stringify(payload), correlationId: newId('cor'),
  });
  const out = processWebhookEvent(rec.event.id);
  console.log(`  · ${label} → ${out.status}: ${out.summary}`);
  return out;
}

const CONV = 9001;
feed({
  event: 'conversation_created', id: CONV,
  account: { id: 1 }, inbox: { id: 2, name: 'Pararel', channel_type: 'Channel::Whatsapp' },
  conversation: { id: CONV, status: 'open', inbox_id: 2 },
  contact: { id: 5001, name: 'Budi Santoso', phone_number: '+628123456789' },
}, 'conversation_created');

const msg = feed({
  event: 'message_created', id: 77001,
  account: { id: 1 }, inbox: { id: 2, channel_type: 'Channel::Whatsapp' },
  conversation: { id: CONV, status: 'open', inbox_id: 2 },
  sender: { id: 5001, name: 'Budi Santoso', phone_number: '+628123456789', type: 'contact' },
  message_type: 'incoming',
  content: 'Halo, saya mau tanya kamar untuk 10-12 Oktober, 2 orang dewasa.',
}, 'message_created');

const lead = db.select().from(s.leads).where(eq(s.leads.organizationId, org.id)).get();
if (lead) {
  const leadContact = db.select().from(s.contacts).where(eq(s.contacts.id, lead.contactId)).get();
  ok(`Prospek dibuat otomatis: ${lead.code} · ${leadContact?.fullName ?? '?'} · tahap "${lead.stage}"`);
  if (leadContact) ok(`Kontak tamu tersimpan: ${leadContact.fullName}`);
  else bad('Kontak tamu tidak dibuat');
  const acts = db.select().from(s.activities).where(eq(s.activities.leadId, lead.id)).all();
  if (acts.length) ok(`${acts.length} aktivitas tercatat dari percakapan`);
  else bad('Isi percakapan tidak tercatat sebagai aktivitas');
} else {
  bad(`Prospek TIDAK dibuat dari chat masuk (${msg.status}: ${msg.summary})`);
}

/* -------------------------------------------------------- 4. pipeline -- */
step('4. Menaikkan prospek tahap demi tahap, dengan gerbangnya');
if (lead) {
  setPrimaryStay(lead.id, {
    organizationId: ORG.id, propertyId, checkIn: '2026-10-10', checkOut: '2026-10-12',
    nights: 2, rooms: 1, adults: 2, children: 0, roomPreference: 'Deluxe King', notes: null,
  });
  db.update(s.leads).set({ ownerUserId: admin.id, inquiryType: 'fit' }).where(eq(s.leads.id, lead.id)).run();

  for (const target of ['assigned', 'qualified'] as const) {
    const r = moveLeadStage(session, lead.id, target);
    if (r.ok) ok(`Naik ke "${target}"`);
    else bad(`Gagal ke "${target}": ${r.failures.map((f) => f.message).join('; ')}`);
  }

  const gates = checkStageGates(lead.id, 'availability_checked', {});
  console.log(`  · gerbang "availability_checked": ${gates.length ? gates.map((g) => g.message).join('; ') : 'terbuka'}`);

  const av = await searchAvailability(session, {
    propertyId, leadId: lead.id, checkIn: '2026-10-10', checkOut: '2026-10-12',
    rooms: 1, adults: 2, children: 0, rateContext: null,
  });
  if (av.ok) ok(`Cek ketersediaan berhasil lewat ${av.sourceLabel}`);
  else bad(`Cek ketersediaan gagal: ${av.message}`);
}

/* ------------------------------------------------------ 5. penawaran -- */
step('5. Penawaran dibuat, dikirim, dan diterima tamu');
let versionId: string | null = null;
if (lead && rooms[0] && plans[0]) {
  try {
    const v = createQuotationVersion(session, {
      leadId: lead.id,
      lines: [{
        roomTypeId: rooms[0].id, roomTypeName: rooms[0].name,
        ratePlanId: plans[0].id, ratePlanName: plans[0].name,
        rooms: 1, ratePerNight: plans[0].baseRatePerNight, inclusions: plans[0].inclusionList,
      }],
      discountType: 'none', discountValue: 0, validityHours: 48,
      policies: null, notes: null, inclusions: [],
      availabilitySearchId: null, snapshotSource: null, snapshotCheckedAt: null,
    });
    versionId = v.versionId;
    ok(`Penawaran ${v.code} v${v.version} dibuat, total Rp ${v.pricing.total.toLocaleString('id-ID')}${v.needsApproval ? ' (perlu persetujuan)' : ''}`);
  } catch (e) { bad(`Penawaran gagal: ${(e as Error).message}`); }

  if (versionId) {
    try { sendQuotation(session, versionId); ok('Penawaran dikirim ke tamu'); }
    catch (e) { bad(`Kirim penawaran gagal: ${(e as Error).message}`); }
    try { setQuotationOutcome(session, versionId, 'accepted'); ok('Tamu menerima penawaran'); }
    catch (e) { bad(`Terima penawaran gagal: ${(e as Error).message}`); }
  }
}

/* ----------------------------------------------------- 6. reservasi -- */
step('6. Reservasi diajukan ke front office dan dikonfirmasi');
if (lead) {
  try {
    const rr = createReservationRequest(session, {
      leadId: lead.id, quotationVersionId: versionId, kind: 'reservation',
      roomTypeId: rooms[0]?.id ?? null, roomTypeName: rooms[0]?.name ?? null,
      ratePlanId: plans[0]?.id ?? null, ratePlanName: plans[0]?.name ?? null,
      totalAmount: 2_900_000, specialRequest: 'Kamar lantai tinggi', internalNote: null,
    });
    const reqId = rr.id;
    ok(`Permintaan reservasi dibuat: ${rr.code ?? reqId}`);
    await decideReservation(session, reqId, { action: 'start_review' });
    await decideReservation(session, reqId, { action: 'confirm', manualReference: 'PMS-88123' });
    const saved = db.select().from(s2.reservationRequests).where(eq(s2.reservationRequests.id, reqId)).get();
    if (saved?.status === 'confirmed') ok(`Front office mengonfirmasi, status "${saved.status}"`);
    else bad(`Konfirmasi tidak tersimpan, status "${saved?.status}"`);
  } catch (e) { bad(`Reservasi gagal: ${(e as Error).message}`); }

  const won = moveLeadStage(session, lead.id, 'confirmed');
  if (won.ok) ok('Prospek ditutup sebagai "confirmed" (menang)');
  else bad(`Gagal menutup: ${won.failures.map((f) => f.message).join('; ')}`);
}

/* --------------------------------------------------- 7. alotmen turun -- */
step('7. Alotmen berkurang setelah reservasi terkonfirmasi');
if (rooms[0]) {
  const after = sellableRooms(rooms[0], '2026-10-10', '2026-10-12');
  if (after === 11) ok(`Sisa kamar turun 12 → ${after} setelah 1 kamar dipesan`);
  else bad(`Sisa kamar tidak turun sebagaimana mestinya: ${after} (harusnya 11)`);
}

/* ------------------------------------------------------ 8. after-sales -- */
step('8. Setelah tamu menginap: riwayat, ucapan terima kasih, dan ajakan kembali');
// Waktu dimajukan ke sesudah check-out supaya sapuan melihat inap yang selesai,
// tanpa harus mengubah tanggal reservasinya.
const afterCheckout = new Date('2026-10-13T09:00:00Z');
const sweep = runAfterSalesSweep(ORG.id, afterCheckout);
if (sweep.staysCompleted === 1) ok(`Inap selesai diproses: ${sweep.details.join(', ')}`);
else bad(`Sapuan memproses ${sweep.staysCompleted} inap, harusnya 1`);

const guest = lead ? db.select().from(s.contacts).where(eq(s.contacts.id, lead.contactId)).get() : null;
if (guest?.stayCount === 1 && guest.lastStayDate === '2026-10-12') ok(`Riwayat tamu diperbarui: ${guest.stayCount} kali menginap, terakhir ${guest.lastStayDate}`);
else bad(`Riwayat tamu salah: stayCount=${guest?.stayCount}, lastStayDate=${guest?.lastStayDate}`);

const afterTasks = lead
  ? db.select().from(s.tasks).where(and(eq(s.tasks.leadId, lead.id), eq(s.tasks.status, 'open'))).all()
  : [];
const postStay = afterTasks.find((t) => t.type === 'post_stay');
const winBack = afterTasks.find((t) => t.type === 'win_back');
if (postStay) ok(`Tugas pasca-inap dibuat, jatuh tempo ${postStay.dueAt?.toISOString().slice(0, 10)}: "${postStay.title}"`);
else bad('Tugas pasca-inap tidak dibuat');
if (winBack) ok(`Tugas ajakan kembali dibuat, jatuh tempo ${winBack.dueAt?.toISOString().slice(0, 10)}: "${winBack.title}"`);
else bad('Tugas ajakan kembali tidak dibuat');

const again = runAfterSalesSweep(ORG.id, afterCheckout);
if (again.staysCompleted === 0) ok('Sapuan diulang tidak menggandakan tugas (idempoten)');
else bad(`Sapuan diulang memproses ulang ${again.staysCompleted} inap`);

const candidates = winBackCandidates(ORG.id, new Date('2027-05-01T00:00:00Z'));
if (candidates.length === 1) ok(`Tamu masuk daftar ajakan kembali setelah jeda: ${candidates[0].fullName} (${candidates[0].stayCount}x)`);
else bad(`Daftar ajakan kembali berisi ${candidates.length} tamu, harusnya 1`);

/* ------------------------------------------------------------ ringkas -- */
console.log(`\n${'═'.repeat(64)}`);
console.log(`  BERHASIL ${pass}   GAGAL ${fail}   BELUM ADA ${gap}`);
console.log(`${'═'.repeat(64)}\n`);
