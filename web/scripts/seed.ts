/**
 * Seeds a demo tenant: two properties, the seven predefined roles, a connected
 * Chatwoot account with inbox mappings (one deliberately unmapped), inventory
 * references, and a pipeline spread across every stage so reports have shape.
 *
 *   npm run db:seed
 */
import { hashPassword, newId, newToken, sha256, encryptSecret, fingerprint } from '../src/server/crypto.ts';
import { LEAD_STAGES, ROLE_DEFINITIONS, ROLE_KEYS, type RoleKey } from '../src/lib/constants.ts';
import { eq } from 'drizzle-orm';
import * as s from './db.ts';
import { db, raw } from './db.ts';

const DEMO_PASSWORD = 'Passw0rd!2026';
const now = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;

const ago = (ms: number) => new Date(now - ms);
const ahead = (ms: number) => new Date(now + ms);
const isoDay = (offset: number) => new Date(now + offset * DAY).toISOString().slice(0, 10);
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

/* ------------------------------- reset ------------------------------- */

const TABLES = [
  'pipeline_stages', 'pipeline_templates',
  'product_events', 'notifications', 'audit_logs', 'deposit_status_references',
  'reservation_references', 'reservation_requests', 'approval_requests', 'quotation_items',
  'quotation_versions', 'quotations', 'availability_snapshots', 'availability_searches',
  'stay_requests', 'rate_plan_references', 'room_type_references', 'tasks', 'activities',
  'lead_stage_history', 'leads', 'conversation_references', 'campaigns', 'consents',
  'contacts', 'corporate_accounts', 'sync_jobs', 'dead_letter_events', 'webhook_events',
  'external_identity_mappings', 'mapping_rules', 'integration_connections', 'sessions',
  'invitations', 'user_property_roles', 'users', 'role_permissions', 'roles', 'teams',
  'properties', 'organizations',
];
raw.pragma('foreign_keys = OFF');
for (const t of TABLES) raw.prepare(`DELETE FROM ${t}`).run();
raw.pragma('foreign_keys = ON');

/* -------------------------- roles + permissions -------------------------- */

const roleIds = {} as Record<RoleKey, string>;
for (const key of ROLE_KEYS) {
  const def = ROLE_DEFINITIONS[key];
  const id = newId('rol');
  roleIds[key] = id;
  db.insert(s.roles).values({
    id, organizationId: null, key, name: def.name,
    description: def.description, scope: def.scope, isSystem: true,
  }).run();
  for (const permission of def.permissions) {
    db.insert(s.rolePermissions).values({ id: newId('rpm'), roleId: id, permission }).run();
  }
}

/* ------------------------- organization + properties ------------------------- */

const orgId = newId('org');
db.insert(s.organizations).values({
  id: orgId,
  name: 'Nusantara Hospitality Group',
  slug: 'nusantara',
  currency: 'IDR',
  timezone: 'Asia/Jakarta',
  locale: 'id-ID',
  taxPercent: 11,
  servicePercent: 10,
  quotationValidityHours: 48,
  firstResponseSlaMinutes: 15,
  availabilityStaleAfterMinutes: 15,
  createdAt: ago(180 * DAY),
}).run();

const props = [
  // Jakarta mengelola kamarnya sendiri di CRM: inilah keadaan sebuah hotel
  // sebelum PMS terpasang, dan yang membuat layar Kamar & Tarif bisa disunting.
  { id: newId('prp'), code: 'KLJ', name: 'The Kalyana Jakarta', city: 'Jakarta', country: 'ID', inventorySource: 'crm' as const },
  // Bali sudah tersambung PMS: kamar dan tarifnya cermin, terkunci dari sini.
  { id: newId('prp'), code: 'AMB', name: 'Amanaya Bali Resort', city: 'Badung', country: 'ID', inventorySource: 'pms' as const },
];
for (const p of props) {
  db.insert(s.properties).values({
    id: p.id, organizationId: orgId, name: p.name, code: p.code,
    city: p.city, country: p.country, timezone: 'Asia/Jakarta', currency: 'IDR',
    inventorySource: p.inventorySource,
    taxPercent: 11, servicePercent: 10, active: true, createdAt: ago(180 * DAY),
  }).run();
}
const [KLJ, AMB] = props;

const teams = {
  kljSales: newId('tem'), kljRes: newId('tem'), ambSales: newId('tem'), ambRes: newId('tem'),
};
const teamRows = [
  { id: teams.kljSales, propertyId: KLJ.id, name: 'Jakarta Sales', kind: 'sales' },
  { id: teams.kljRes, propertyId: KLJ.id, name: 'Jakarta Reservations', kind: 'reservation' },
  { id: teams.ambSales, propertyId: AMB.id, name: 'Bali Sales', kind: 'sales' },
  { id: teams.ambRes, propertyId: AMB.id, name: 'Bali Reservations', kind: 'reservation' },
];
for (const t of teamRows) {
  db.insert(s.teams).values({ ...t, organizationId: orgId, createdAt: ago(180 * DAY) }).run();
}

/* --------------------------------- users --------------------------------- */

type SeedUser = {
  key: string; name: string; email: string; jobTitle: string; role: RoleKey;
  properties: (string | null)[]; teamId?: string | null;
  discountLimitPercent?: number; approveUpTo?: number;
};

const seedUsers: SeedUser[] = [
  { key: 'admin', name: 'Wulan Prameswari', email: 'admin@nusantara-hotels.test', jobTitle: 'Group IT & Revenue Systems', role: 'org_admin', properties: [null], discountLimitPercent: 100, approveUpTo: 100 },
  { key: 'pa', name: 'Bagus Hendrawan', email: 'property.admin@nusantara-hotels.test', jobTitle: 'Property Admin, Jakarta', role: 'property_admin', properties: [KLJ.id], discountLimitPercent: 30, approveUpTo: 30 },
  { key: 'manager', name: 'Ratna Kusumaningrum', email: 'manager@nusantara-hotels.test', jobTitle: 'Director of Sales', role: 'sales_manager', properties: [KLJ.id, AMB.id], teamId: teams.kljSales, discountLimitPercent: 25, approveUpTo: 25 },
  { key: 'agent1', name: 'Dimas Ardiansyah', email: 'agent@nusantara-hotels.test', jobTitle: 'Sales Executive', role: 'sales_agent', properties: [KLJ.id], teamId: teams.kljSales, discountLimitPercent: 10 },
  { key: 'agent2', name: 'Siti Larasati', email: 'agent2@nusantara-hotels.test', jobTitle: 'Sales Executive', role: 'sales_agent', properties: [KLJ.id], teamId: teams.kljSales, discountLimitPercent: 10 },
  { key: 'agent3', name: 'Komang Aditya', email: 'agent3@nusantara-hotels.test', jobTitle: 'Sales Executive, Bali', role: 'sales_agent', properties: [AMB.id], teamId: teams.ambSales, discountLimitPercent: 10 },
  { key: 'fo', name: 'Nadia Rahmawati', email: 'reservations@nusantara-hotels.test', jobTitle: 'Reservations Supervisor', role: 'reservation_fo', properties: [KLJ.id, AMB.id], teamId: teams.kljRes },
  { key: 'gr', name: 'Ayu Permatasari', email: 'guest.relations@nusantara-hotels.test', jobTitle: 'Guest Relations Manager', role: 'guest_relations', properties: [KLJ.id] },
  { key: 'analyst', name: 'Rizky Nugroho', email: 'analyst@nusantara-hotels.test', jobTitle: 'Commercial Analyst', role: 'analyst', properties: [null] },
];

const passwordHash = hashPassword(DEMO_PASSWORD);
const U = {} as Record<string, string>;
for (const u of seedUsers) {
  const uid = newId('usr');
  U[u.key] = uid;
  db.insert(s.users).values({
    id: uid, organizationId: orgId, email: u.email, name: u.name, jobTitle: u.jobTitle,
    passwordHash, status: 'active', mustChangePassword: false,
    discountLimitPercent: u.discountLimitPercent ?? 0,
    canApproveDiscountUpToPercent: u.approveUpTo ?? 0,
    createdAt: ago(120 * DAY),
  }).run();
  for (const propertyId of u.properties) {
    db.insert(s.userPropertyRoles).values({
      id: newId('upr'), organizationId: orgId, userId: uid, propertyId,
      roleId: roleIds[u.role], teamId: propertyId ? (u.teamId ?? null) : null,
      createdAt: ago(120 * DAY),
    }).run();
  }
}

// A pending invitation so the user-management screen has a live example.
const inviteToken = newToken();
db.insert(s.invitations).values({
  id: newId('inv'), organizationId: orgId, email: 'new.agent@nusantara-hotels.test',
  name: 'Farhan Maulana', tokenHash: sha256(inviteToken), roleId: roleIds.sales_agent,
  propertyIds: JSON.stringify([KLJ.id]), teamId: teams.kljSales, discountLimitPercent: 10,
  invitedByUserId: U.admin, expiresAt: ahead(5 * DAY), createdAt: ago(2 * DAY),
}).run();

console.log(`\nInvitation link for Farhan Maulana:\n  /accept-invite?token=${inviteToken}\n`);

/* --------------------------- pipeline template --------------------------- */

// The built-in stage vocabulary becomes a real, editable template. Everything
// downstream reads stages from here, so an admin can rename or recolour them.
const fitTemplateId = newId('ptl');
db.insert(s.pipelineTemplates).values({
  id: fitTemplateId, organizationId: orgId, name: 'FIT (direct room sales)',
  description: 'The default path for an individual guest booking rooms directly.',
  inquiryType: 'fit', isDefault: true, createdAt: ago(180 * DAY), updatedAt: ago(180 * DAY),
}).run();

LEAD_STAGES.forEach((st, i) => {
  const colour =
    st.kind === 'won' ? 'success' : st.kind === 'lost' ? 'danger' : st.kind === 'cancelled' ? 'neutral'
    : st.key === 'new_inquiry' ? 'accent' : st.key === 'follow_up' || st.key === 'deposit_pending' ? 'warning' : 'info';
  db.insert(s.pipelineStages).values({
    id: newId('pst'), organizationId: orgId, templateId: fitTemplateId,
    key: st.key, label: st.label, kind: st.kind,
    // Only the optional gates are stored; mandatory ones come from the kind.
    gates: JSON.stringify(st.gates.filter((g) => !['reservation_reference', 'lost_reason', 'cancellation_reason'].includes(g))),
    colour, probability: st.probability, hint: st.hint, meaning: st.meaning, sortOrder: i,
    createdAt: ago(180 * DAY),
  }).run();
});

// A second template shows the settings screen doing real work.
const groupTemplateId = newId('ptl');
db.insert(s.pipelineTemplates).values({
  id: groupTemplateId, organizationId: orgId, name: 'Group & MICE',
  description: 'Longer path for block bookings, with a site inspection before quoting.',
  inquiryType: 'group', isDefault: false, createdAt: ago(40 * DAY), updatedAt: ago(40 * DAY),
}).run();
[
  { key: 'new_inquiry', label: 'New Enquiry', kind: 'open', colour: 'accent', probability: 10, gates: [] },
  { key: 'assigned', label: 'Assigned', kind: 'open', colour: 'info', probability: 20, gates: ['owner'] },
  { key: 'site_inspection', label: 'Site Inspection', kind: 'open', colour: 'info', probability: 35, gates: ['owner'] },
  { key: 'proposal_sent', label: 'Proposal Sent', kind: 'open', colour: 'primary', probability: 60, gates: ['owner', 'quotation_sent'] },
  { key: 'contract', label: 'Contract & Deposit', kind: 'open', colour: 'warning', probability: 85, gates: ['quotation_sent'] },
  { key: 'definite', label: 'Definite', kind: 'won', colour: 'success', probability: 100, gates: [] },
  { key: 'lost', label: 'Lost', kind: 'lost', colour: 'danger', probability: 0, gates: [] },
  { key: 'cancelled', label: 'Cancelled', kind: 'cancelled', colour: 'neutral', probability: 0, gates: [] },
].forEach((st, i) => {
  db.insert(s.pipelineStages).values({
    id: newId('pst'), organizationId: orgId, templateId: groupTemplateId,
    key: st.key, label: st.label, kind: st.kind, gates: JSON.stringify(st.gates),
    colour: st.colour, probability: st.probability, sortOrder: i, createdAt: ago(40 * DAY),
  }).run();
});

for (const p of props) {
  db.update(s.properties).set({ pipelineTemplateId: fitTemplateId }).where(eq(s.properties.id, p.id)).run();
}

/* ------------------------- integrations + inventory ------------------------- */

const chatwootId = newId('con');
db.insert(s.integrationConnections).values({
  id: chatwootId, organizationId: orgId, provider: 'chatwoot', adapter: 'chatwoot',
  label: 'Nusantara Chatwoot (self-hosted)', baseUrl: 'https://chat.nusantara-hotels.test',
  externalAccountId: '1',
  apiTokenCiphertext: encryptSecret('cw_demo_access_token_9f2b7d'),
  apiTokenLast4: '7d6b',
  webhookSecretCiphertext: encryptSecret('whsec_demo_nusantara'),
  status: 'healthy', lastTestedAt: ago(3 * HOUR),
  lastTestResult: JSON.stringify({ ok: true, account: { id: 1, name: 'Nusantara Hospitality' }, inboxes: 4 }),
  lastEventAt: ago(6 * 60_000), timeoutMs: 6000, active: true, createdAt: ago(90 * DAY),
}).run();

const pmsId = newId('con');
db.insert(s.integrationConnections).values({
  id: pmsId, organizationId: orgId, provider: 'pms', adapter: 'pms-mock',
  label: 'Opera Cloud (sandbox adapter)', baseUrl: 'https://pms-sandbox.nusantara-hotels.test',
  externalAccountId: 'NHG-SANDBOX',
  apiTokenCiphertext: encryptSecret('pms_demo_token_5512aa'), apiTokenLast4: '12aa',
  status: 'degraded', statusReason: 'Sandbox latency above 2s on 3 of the last 20 calls',
  lastTestedAt: ago(40 * 60_000),
  lastTestResult: JSON.stringify({ ok: true, latencyMs: 2140, note: 'sandbox' }),
  lastEventAt: ago(12 * 60_000), timeoutMs: 6000, active: true, createdAt: ago(60 * DAY),
}).run();

const inboxes = [
  { ext: '11', name: 'WhatsApp · Jakarta Sales', channel: 'whatsapp', propertyId: KLJ.id, teamId: teams.kljSales, sales: true },
  { ext: '12', name: 'Instagram · Kalyana Jakarta', channel: 'instagram', propertyId: KLJ.id, teamId: teams.kljSales, sales: true },
  { ext: '13', name: 'WhatsApp · Bali Reservations', channel: 'whatsapp', propertyId: AMB.id, teamId: teams.ambSales, sales: true },
  { ext: '14', name: 'Website Chat · Guest Support', channel: 'website', propertyId: KLJ.id, teamId: null, sales: false },
];
const inboxMapIds: Record<string, string> = {};
for (const i of inboxes) {
  const mid = newId('map');
  inboxMapIds[i.ext] = mid;
  db.insert(s.mappingRules).values({
    id: mid, organizationId: orgId, connectionId: chatwootId, kind: 'inbox',
    externalId: i.ext, externalName: i.name, channel: i.channel,
    propertyId: i.propertyId, teamId: i.teamId, inquiryType: i.sales ? 'fit' : null,
    isSalesInbox: i.sales, triggerLabels: JSON.stringify(i.sales ? [] : ['room-inquiry']),
    status: 'mapped', createdAt: ago(90 * DAY),
  }).run();
}

// Unmapped inbox + agent: these must land in the review queue, never a random property (PRD FR-03).
db.insert(s.mappingRules).values({
  id: newId('map'), organizationId: orgId, connectionId: chatwootId, kind: 'inbox',
  externalId: '19', externalName: 'WhatsApp · Wedding Enquiries (new)', channel: 'whatsapp',
  isSalesInbox: false, triggerLabels: '[]', status: 'unmapped', createdAt: ago(2 * DAY),
}).run();

const agentMap = [
  { ext: '101', userId: U.agent1 }, { ext: '102', userId: U.agent2 },
  { ext: '103', userId: U.agent3 }, { ext: '104', userId: U.manager },
  { ext: '105', userId: U.fo },
];
for (const a of agentMap) {
  db.insert(s.mappingRules).values({
    id: newId('map'), organizationId: orgId, connectionId: chatwootId, kind: 'agent',
    externalId: a.ext, externalName: seedUsers.find((u) => U[u.key] === a.userId)?.name ?? null,
    userId: a.userId, status: 'mapped', isSalesInbox: false, triggerLabels: '[]', createdAt: ago(90 * DAY),
  }).run();
}
db.insert(s.mappingRules).values({
  id: newId('map'), organizationId: orgId, connectionId: chatwootId, kind: 'agent',
  externalId: '118', externalName: 'night.desk@nusantara-hotels.test',
  status: 'unmapped', isSalesInbox: false, triggerLabels: '[]', createdAt: ago(1 * DAY),
}).run();

const roomTypeDefs = [
  { code: 'DLX', name: 'Deluxe King', maxAdults: 2, maxChildren: 1, bed: 'King', size: 36, rate: 1_450_000 },
  { code: 'PREM', name: 'Premier Twin', maxAdults: 2, maxChildren: 2, bed: 'Twin', size: 42, rate: 1_850_000 },
  { code: 'EXEC', name: 'Executive Suite', maxAdults: 3, maxChildren: 2, bed: 'King', size: 68, rate: 3_250_000 },
  { code: 'VILLA', name: 'One-Bedroom Pool Villa', maxAdults: 2, maxChildren: 2, bed: 'King', size: 120, rate: 5_400_000 },
];
const ratePlanDefs = [
  { code: 'BAR-RO', name: 'Best Available, Room Only', meal: 'room_only', refundable: true, minStay: 1, inclusions: ['Wi-Fi', 'Gym & pool access'] },
  { code: 'BAR-BB', name: 'Best Available, Breakfast', meal: 'breakfast', refundable: true, minStay: 1, inclusions: ['Wi-Fi', 'Breakfast for 2', 'Gym & pool access'] },
  { code: 'ADV-NR', name: 'Advance Purchase, Non-refundable', meal: 'breakfast', refundable: false, minStay: 2, inclusions: ['Wi-Fi', 'Breakfast for 2', 'Late checkout 14:00'] },
  { code: 'STAY3', name: 'Stay 3 Pay 2, Breakfast', meal: 'breakfast', refundable: true, minStay: 3, inclusions: ['Wi-Fi', 'Breakfast for 2', '1 night free'] },
];

const roomTypes: Record<string, { id: string; code: string; name: string; rate: number; maxAdults: number }[]> = {};
const ratePlans: Record<string, { id: string; code: string; name: string; refundable: boolean; minStay: number }[]> = {};

for (const p of props) {
  const isResort = p.code === 'AMB';
  roomTypes[p.id] = [];
  ratePlans[p.id] = [];
  for (const rt of roomTypeDefs) {
    if (rt.code === 'VILLA' && !isResort) continue;
    if (rt.code === 'PREM' && isResort) continue;
    const rid = newId('rmt');
    const rate = isResort ? Math.round(rt.rate * 1.25) : rt.rate;
    db.insert(s.roomTypeReferences).values({
      id: rid, organizationId: orgId, propertyId: p.id,
      connectionId: p.inventorySource === 'pms' ? pmsId : null,
      externalId: p.inventorySource === 'pms' ? `${p.code}-${rt.code}` : null,
      code: rt.code, name: rt.name,
      maxAdults: rt.maxAdults, maxChildren: rt.maxChildren, bedType: rt.bed, sizeSqm: rt.size,
      // Alotmen nyata: tanpa ini properti terlihat punya nol kamar dan tidak
      // ada satu pun tanggal yang bisa dijual.
      totalRooms: rt.code === 'VILLA' ? 8 : rt.code === 'EXEC' ? 10 : 24,
      source: p.inventorySource,
      active: true,
      lastSyncedAt: p.inventorySource === 'pms' ? ago(2 * HOUR) : null,
      createdAt: ago(60 * DAY),
    }).run();
    roomTypes[p.id].push({ id: rid, code: rt.code, name: rt.name, rate, maxAdults: rt.maxAdults });
  }
  for (const rp of ratePlanDefs) {
    const rid = newId('rtp');
    db.insert(s.ratePlanReferences).values({
      id: rid, organizationId: orgId, propertyId: p.id,
      connectionId: p.inventorySource === 'pms' ? pmsId : null,
      externalId: p.inventorySource === 'pms' ? `${p.code}-${rp.code}` : null,
      code: rp.code, name: rp.name,
      mealPlan: rp.meal, refundable: rp.refundable, minStay: rp.minStay,
      inclusions: JSON.stringify(rp.inclusions),
      policies: rp.refundable
        ? 'Free cancellation up to 48 hours before arrival. 1 night deposit to hold.'
        : 'Non-refundable. Full prepayment required at confirmation.',
      currency: 'IDR',
      // Tarif dasar diambil dari tipe kamar termurah properti ini; selisih tiap
      // tipe disimpan terpisah supaya satu paket melayani semua tipe kamar.
      baseRatePerNight: Math.min(...roomTypes[p.id].map((r) => r.rate)),
      roomTypeSurcharges: JSON.stringify(Object.fromEntries(
        roomTypes[p.id].map((r) => [r.code, r.rate - Math.min(...roomTypes[p.id].map((x) => x.rate))]),
      )),
      source: p.inventorySource,
      active: true, lastSyncedAt: ago(2 * HOUR), createdAt: ago(60 * DAY),
    }).run();
    ratePlans[p.id].push({ id: rid, code: rp.code, name: rp.name, refundable: rp.refundable, minStay: rp.minStay });
  }
}

const campaignId = newId('cmp');
db.insert(s.campaigns).values({
  id: campaignId, organizationId: orgId, name: 'Ramadan Staycation 2026',
  source: 'instagram', medium: 'social', active: true, createdAt: ago(30 * DAY),
}).run();

/* --------------------------- pipeline demo data --------------------------- */

type LeadSpec = {
  guest: string; phone: string; email: string | null; nationality?: string;
  tier?: 'none' | 'member' | 'silver' | 'gold' | 'platinum';
  property: string; owner: string | null; teamId: string | null;
  channel: string; inbox: string; stage: string; status?: 'open' | 'won' | 'lost' | 'cancelled';
  inSpanDays: number; nights: number; rooms: number; adults: number; children?: number;
  roomCode: string; rateCode: string; discountPercent?: number;
  createdAgoHours: number; purpose?: string; special?: string;
  lostReason?: string; overdueFollowUp?: boolean; note?: string;
};

const specs: LeadSpec[] = [
  { guest: 'Anindya Kirana', phone: '+6281234550101', email: 'anindya.kirana@gmail.test', tier: 'gold', property: KLJ.id, owner: null, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'new_inquiry', inSpanDays: 21, nights: 2, rooms: 1, adults: 2, roomCode: 'DLX', rateCode: 'BAR-BB', createdAgoHours: 0.4, purpose: 'Anniversary weekend', note: 'Asked for a high floor with city view.' },
  { guest: 'Michael Tan', phone: '+6591234567', email: 'm.tan@apacventures.test', property: KLJ.id, owner: null, teamId: teams.kljSales, channel: 'instagram', inbox: '12', stage: 'new_inquiry', inSpanDays: 9, nights: 3, rooms: 2, adults: 4, roomCode: 'PREM', rateCode: 'BAR-BB', createdAgoHours: 1.1, purpose: 'Business trip' },
  { guest: 'Rina Halimah', phone: '+6281199920344', email: null, property: AMB.id, owner: null, teamId: teams.ambSales, channel: 'whatsapp', inbox: '13', stage: 'new_inquiry', inSpanDays: 40, nights: 4, rooms: 1, adults: 2, children: 2, roomCode: 'VILLA', rateCode: 'STAY3', createdAgoHours: 3.5, purpose: 'Family holiday', note: 'SLA already breached. Nobody has replied.' },
  { guest: 'Daniel Wibowo', phone: '+6281255510777', email: 'daniel.wibowo@nusatek.test', tier: 'member', property: KLJ.id, owner: U.agent1, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'assigned', inSpanDays: 14, nights: 2, rooms: 3, adults: 6, roomCode: 'DLX', rateCode: 'BAR-BB', createdAgoHours: 6, purpose: 'Team offsite' },
  { guest: 'Priya Ramachandran', phone: '+919812345670', email: 'priya.r@globalpharma.test', property: KLJ.id, owner: U.agent2, teamId: teams.kljSales, channel: 'website', inbox: '14', stage: 'assigned', inSpanDays: 30, nights: 5, rooms: 1, adults: 1, roomCode: 'EXEC', rateCode: 'BAR-RO', createdAgoHours: 20, purpose: 'Conference' },
  { guest: 'Bayu Setiawan', phone: '+6281377712399', email: 'bayu.setiawan@mail.test', property: AMB.id, owner: U.agent3, teamId: teams.ambSales, channel: 'instagram', inbox: '12', stage: 'qualified', inSpanDays: 25, nights: 3, rooms: 1, adults: 2, roomCode: 'VILLA', rateCode: 'BAR-BB', createdAgoHours: 30, purpose: 'Honeymoon', special: 'Flower bath on arrival, private dinner on night 2.' },
  { guest: 'Clara Meijer', phone: '+31612345678', email: 'clara.meijer@post.test', tier: 'silver', property: AMB.id, owner: U.agent3, teamId: teams.ambSales, channel: 'whatsapp', inbox: '13', stage: 'qualified', inSpanDays: 55, nights: 7, rooms: 1, adults: 2, roomCode: 'VILLA', rateCode: 'STAY3', createdAgoHours: 46, purpose: 'Long holiday' },
  { guest: 'Hendra Gunawan', phone: '+6281566634512', email: 'hendra.g@bumiraya.test', property: KLJ.id, owner: U.agent1, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'availability_checked', inSpanDays: 12, nights: 2, rooms: 4, adults: 8, roomCode: 'PREM', rateCode: 'BAR-BB', createdAgoHours: 52, purpose: 'Board meeting' },
  { guest: 'Aisha Nurhaliza', phone: '+6281744498821', email: 'aisha.nur@mail.test', tier: 'member', property: KLJ.id, owner: U.agent2, teamId: teams.kljSales, channel: 'instagram', inbox: '12', stage: 'availability_checked', inSpanDays: 18, nights: 3, rooms: 1, adults: 2, children: 1, roomCode: 'DLX', rateCode: 'BAR-BB', createdAgoHours: 70, purpose: 'School holiday' },
  { guest: 'Yusuke Watanabe', phone: '+819012345678', email: 'y.watanabe@sakura-trading.test', property: KLJ.id, owner: U.agent1, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'quotation_sent', inSpanDays: 10, nights: 4, rooms: 2, adults: 3, roomCode: 'EXEC', rateCode: 'BAR-BB', discountPercent: 8, createdAgoHours: 96, purpose: 'Client hosting' },
  { guest: 'Fitriani Dewi', phone: '+6281822245670', email: 'fitriani.dewi@mail.test', tier: 'gold', property: AMB.id, owner: U.agent3, teamId: teams.ambSales, channel: 'whatsapp', inbox: '13', stage: 'quotation_sent', inSpanDays: 33, nights: 5, rooms: 2, adults: 4, children: 2, roomCode: 'VILLA', rateCode: 'STAY3', discountPercent: 5, createdAgoHours: 120, purpose: 'Extended family trip' },
  { guest: 'Oliver Brandt', phone: '+4915112345678', email: 'o.brandt@eurotech.test', property: KLJ.id, owner: U.agent2, teamId: teams.kljSales, channel: 'website', inbox: '14', stage: 'quotation_sent', inSpanDays: 6, nights: 2, rooms: 1, adults: 1, roomCode: 'DLX', rateCode: 'ADV-NR', createdAgoHours: 44, purpose: 'Site visit', note: 'Quotation expires within 12 hours.' },
  { guest: 'Nadine Suryani', phone: '+6281933356780', email: 'nadine.suryani@mail.test', property: KLJ.id, owner: U.agent1, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'follow_up', inSpanDays: 20, nights: 3, rooms: 1, adults: 2, roomCode: 'PREM', rateCode: 'BAR-BB', discountPercent: 12, createdAgoHours: 150, purpose: 'Leisure', overdueFollowUp: true, note: 'Follow-up is overdue and appears on My Day.' },
  { guest: 'Ahmad Faisal', phone: '+6281244478900', email: 'ahmad.faisal@perdanagroup.test', tier: 'platinum', property: KLJ.id, owner: U.manager, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'follow_up', inSpanDays: 16, nights: 2, rooms: 6, adults: 12, roomCode: 'DLX', rateCode: 'BAR-BB', discountPercent: 22, createdAgoHours: 170, purpose: 'Corporate retreat', note: 'Discount above agent limit, pending approval.' },
  { guest: 'Sophia Lim', phone: '+60123456789', email: 'sophia.lim@peninsula.test', property: AMB.id, owner: U.agent3, teamId: teams.ambSales, channel: 'instagram', inbox: '12', stage: 'deposit_pending', inSpanDays: 28, nights: 4, rooms: 1, adults: 2, roomCode: 'VILLA', rateCode: 'BAR-BB', createdAgoHours: 200, purpose: 'Birthday' },
  { guest: 'Gregorius Santoso', phone: '+6281777712340', email: 'greg.santoso@mail.test', property: KLJ.id, owner: U.agent2, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'deposit_pending', inSpanDays: 8, nights: 2, rooms: 2, adults: 4, roomCode: 'PREM', rateCode: 'BAR-BB', createdAgoHours: 190, purpose: 'Family gathering' },
  { guest: 'Emma Fletcher', phone: '+447700900123', email: 'emma.fletcher@mail.test', tier: 'silver', property: AMB.id, owner: U.agent3, teamId: teams.ambSales, channel: 'whatsapp', inbox: '13', stage: 'confirmed', status: 'won', inSpanDays: 15, nights: 6, rooms: 1, adults: 2, roomCode: 'VILLA', rateCode: 'STAY3', createdAgoHours: 320, purpose: 'Wellness retreat' },
  { guest: 'Reza Pratama', phone: '+6281388823450', email: 'reza.pratama@sentosaenergi.test', tier: 'gold', property: KLJ.id, owner: U.agent1, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'confirmed', status: 'won', inSpanDays: 5, nights: 3, rooms: 3, adults: 5, roomCode: 'EXEC', rateCode: 'BAR-BB', discountPercent: 10, createdAgoHours: 400, purpose: 'Executive visit' },
  { guest: 'Laura Beltran', phone: '+34612345678', email: 'laura.beltran@mail.test', property: AMB.id, owner: U.agent3, teamId: teams.ambSales, channel: 'website', inbox: '14', stage: 'confirmed', status: 'won', inSpanDays: 45, nights: 5, rooms: 2, adults: 4, roomCode: 'VILLA', rateCode: 'BAR-BB', createdAgoHours: 500, purpose: 'Group of friends' },
  { guest: 'Tommy Kurniawan', phone: '+6281255567890', email: 'tommy.k@mail.test', property: KLJ.id, owner: U.agent2, teamId: teams.kljSales, channel: 'instagram', inbox: '12', stage: 'lost', status: 'lost', inSpanDays: -3, nights: 2, rooms: 1, adults: 2, roomCode: 'DLX', rateCode: 'BAR-BB', createdAgoHours: 480, purpose: 'Weekend break', lostReason: 'Rate too high' },
  { guest: 'Vera Anggraini', phone: '+6281900012345', email: 'vera.anggraini@mail.test', property: KLJ.id, owner: U.agent1, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'lost', status: 'lost', inSpanDays: -10, nights: 3, rooms: 2, adults: 4, roomCode: 'PREM', rateCode: 'BAR-BB', createdAgoHours: 620, purpose: 'Leisure', lostReason: 'Booked via OTA' },
  { guest: 'Kevin Ho', phone: '+85298765432', email: 'kevin.ho@mail.test', property: AMB.id, owner: U.agent3, teamId: teams.ambSales, channel: 'whatsapp', inbox: '13', stage: 'lost', status: 'lost', inSpanDays: -6, nights: 4, rooms: 1, adults: 2, roomCode: 'VILLA', rateCode: 'BAR-BB', createdAgoHours: 700, purpose: 'Holiday', lostReason: 'No availability' },
  { guest: 'Intan Maharani', phone: '+6281611123400', email: 'intan.maharani@mail.test', property: KLJ.id, owner: U.agent2, teamId: teams.kljSales, channel: 'whatsapp', inbox: '11', stage: 'cancelled', status: 'cancelled', inSpanDays: 4, nights: 2, rooms: 1, adults: 2, roomCode: 'DLX', rateCode: 'BAR-BB', createdAgoHours: 300, purpose: 'Leisure' },
];

const STAGE_ORDER = ['new_inquiry', 'assigned', 'qualified', 'availability_checked', 'quotation_sent', 'follow_up', 'deposit_pending', 'confirmed'];
const stageIndex = (st: string) => {
  const i = STAGE_ORDER.indexOf(st);
  return i === -1 ? STAGE_ORDER.length - 1 : i;
};
const PROBABILITY: Record<string, number> = {
  new_inquiry: 10, assigned: 20, qualified: 35, availability_checked: 50,
  quotation_sent: 65, follow_up: 70, deposit_pending: 85, confirmed: 100, lost: 0, cancelled: 0,
};

let leadSeq = 0;
let quoteSeq = 0;
let resSeq = 0;
const nextCode = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, '0')}`;
const orgTax = 11;
const orgService = 10;

for (const spec of specs) {
  const propertyId = spec.property;
  const propCode = props.find((p) => p.id === propertyId)!.code;
  const rt = roomTypes[propertyId].find((r) => r.code === spec.roomCode) ?? roomTypes[propertyId][0];
  const rp = ratePlans[propertyId].find((r) => r.code === spec.rateCode) ?? ratePlans[propertyId][0];
  const createdAt = ago(spec.createdAgoHours * HOUR);
  const checkIn = isoDay(spec.inSpanDays);
  const checkOut = isoDay(spec.inSpanDays + spec.nights);
  const idx = stageIndex(spec.stage);

  const contactId = newId('cnt');
  db.insert(s.contacts).values({
    id: contactId, organizationId: orgId, fullName: spec.guest,
    phoneNormalized: spec.phone, phoneRaw: spec.phone,
    email: spec.email, emailNormalized: spec.email?.toLowerCase() ?? null,
    preferredLanguage: spec.phone.startsWith('+62') ? 'id' : 'en',
    guestTier: spec.tier ?? 'none', nationality: spec.nationality ?? null,
    consentStatus: spec.email ? 'granted' : 'unknown',
    lastStayDate: spec.tier && spec.tier !== 'none' ? isoDay(-120) : null,
    stayCount: spec.tier === 'platinum' ? 11 : spec.tier === 'gold' ? 6 : spec.tier === 'silver' ? 3 : spec.tier === 'member' ? 1 : 0,
    preferences: JSON.stringify(spec.tier && spec.tier !== 'none' ? ['High floor', 'Late checkout', 'Still water'] : []),
    createdAt, updatedAt: createdAt,
  }).run();

  const inbox = inboxes.find((i) => i.ext === spec.inbox)!;
  const convId = newId('cnv');
  const extConvId = String(4200 + leadSeq);
  db.insert(s.conversationReferences).values({
    id: convId, organizationId: orgId, connectionId: chatwootId,
    externalConversationId: extConvId, externalInboxId: inbox.ext, inboxName: inbox.name,
    channel: spec.channel, contactId, propertyId,
    conversationStatus: idx >= 6 ? 'resolved' : 'open',
    labels: JSON.stringify(inbox.sales ? ['room-inquiry'] : ['room-inquiry', 'website']),
    assignedExternalAgentId: spec.owner ? agentMap.find((a) => a.userId === spec.owner)?.ext ?? null : null,
    assignedUserId: spec.owner,
    lastMessageAt: ago(Math.max(0.2, spec.createdAgoHours * 0.35) * HOUR),
    lastMessagePreview: idx === 0
      ? `Hi, is a ${rt.name} available for ${spec.nights} nights from ${checkIn}?`
      : 'Thanks, let me discuss with my team and come back to you.',
    lastMessageFrom: idx === 0 ? 'contact' : 'contact',
    deepLink: `https://chat.nusantara-hotels.test/app/accounts/1/conversations/${extConvId}`,
    createdAt, updatedAt: createdAt,
  }).run();
  db.insert(s.externalIdentityMappings).values({
    id: newId('eim'), organizationId: orgId, connectionId: chatwootId, provider: 'chatwoot',
    entityType: 'contact', externalId: String(9100 + leadSeq), internalId: contactId,
    lastSyncedAt: createdAt, createdAt,
  }).run();

  leadSeq += 1;
  const leadId = newId('led');
  const leadCode = nextCode('LEAD', leadSeq);
  const nights = spec.nights;
  const baseRate = rt.rate;
  const estimatedValue = baseRate * spec.rooms * nights;
  const slaDue = new Date(createdAt.getTime() + 15 * 60_000);
  const firstResponded = idx >= 1 ? new Date(createdAt.getTime() + (6 + (leadSeq % 9)) * 60_000) : null;

  db.insert(s.leads).values({
    id: leadId, organizationId: orgId, propertyId, contactId, primaryConversationId: convId,
    code: leadCode, stage: spec.stage, status: spec.status ?? 'open',
    inquiryType: 'fit', pipelineTemplateId: fitTemplateId,
    priority: spec.rooms >= 4 ? 'high' : spec.tier === 'platinum' || spec.tier === 'gold' ? 'high' : 'normal',
    source: spec.channel === 'website' ? 'website' : spec.channel,
    channel: spec.channel, campaignId: spec.channel === 'instagram' ? campaignId : null,
    ownerUserId: spec.owner, teamId: spec.teamId,
    probability: PROBABILITY[spec.stage] ?? 10,
    estimatedValue, currency: 'IDR',
    checkIn, checkOut, rooms: spec.rooms, adults: spec.adults, children: spec.children ?? 0,
    roomPreference: rt.name, purpose: spec.purpose ?? null, specialRequest: spec.special ?? null,
    language: spec.phone.startsWith('+62') ? 'id' : 'en',
    nextActionLabel: idx === 0 ? 'Send first response' : idx >= 6 ? 'Confirm deposit' : 'Follow up with guest',
    nextFollowUpAt: spec.status && spec.status !== 'open'
      ? null
      : spec.overdueFollowUp
        ? ago(26 * HOUR)
        : ahead(((leadSeq % 4) + 1) * 8 * HOUR),
    slaFirstResponseDueAt: slaDue,
    firstRespondedAt: firstResponded,
    lastActivityAt: ago(Math.max(0.2, spec.createdAgoHours * 0.3) * HOUR),
    lostReason: spec.lostReason ?? null,
    lostCompetitor: spec.lostReason === 'Booked via OTA' ? 'Agoda' : null,
    lostNotes: spec.lostReason ? 'Guest confirmed by message that they will not proceed.' : null,
    cancellationSource: spec.status === 'cancelled' ? 'guest' : null,
    cancellationReason: spec.status === 'cancelled' ? 'Travel plans changed' : null,
    closedAt: spec.status && spec.status !== 'open' ? ago(24 * HOUR) : null,
    createdAt, updatedAt: ago(2 * HOUR),
  }).run();

  db.insert(s.stayRequests).values({
    id: newId('sty'), organizationId: orgId, propertyId, leadId, isPrimary: true,
    checkIn, checkOut, nights, rooms: spec.rooms, adults: spec.adults,
    children: spec.children ?? 0, roomPreference: rt.name, notes: spec.special ?? null,
    createdAt, updatedAt: createdAt,
  }).run();

  // Stage history walks the lead from New Inquiry to its current stage.
  const walked = spec.status && spec.status !== 'open' && spec.status !== 'won'
    ? [...STAGE_ORDER.slice(0, Math.max(1, idx)), spec.stage]
    : STAGE_ORDER.slice(0, idx + 1);
  let prev: string | null = null;
  walked.forEach((st, i) => {
    db.insert(s.leadStageHistory).values({
      id: newId('lsh'), organizationId: orgId, leadId, fromStage: prev, toStage: st,
      actorUserId: i === 0 ? null : spec.owner, actorType: i === 0 ? 'system' : 'user',
      reason: i === 0 ? 'Created from Chatwoot sales inbox rule' : null,
      createdAt: new Date(createdAt.getTime() + i * 3 * HOUR),
    }).run();
    prev = st;
  });

  db.insert(s.activities).values({
    id: newId('act'), organizationId: orgId, propertyId, leadId, contactId,
    type: 'lead_created', title: 'Lead created from Chatwoot',
    body: `Matched sales inbox "${inbox.name}" (${spec.channel}). Conversation #${extConvId}.`,
    actorName: 'Chatwoot connector', actorType: 'system', source: 'chatwoot', createdAt,
  }).run();
  if (spec.note) {
    db.insert(s.activities).values({
      id: newId('act'), organizationId: orgId, propertyId, leadId, contactId,
      type: 'note', title: 'Internal note', body: spec.note,
      actorUserId: spec.owner, actorName: seedUsers.find((u) => U[u.key] === spec.owner)?.name ?? 'System',
      actorType: spec.owner ? 'user' : 'system', source: 'crm',
      createdAt: new Date(createdAt.getTime() + 40 * 60_000),
    }).run();
  }

  if ((spec.status ?? 'open') === 'open' && spec.owner) {
    db.insert(s.tasks).values({
      id: newId('tsk'), organizationId: orgId, propertyId, leadId, contactId,
      assigneeUserId: spec.owner,
      title: idx >= 6 ? `Chase deposit for ${spec.guest}` : `Follow up ${spec.guest} about ${checkIn}`,
      description: idx >= 6 ? 'Confirm transfer receipt and send the confirmation letter.' : null,
      type: idx >= 6 ? 'deposit' : 'follow_up',
      priority: spec.overdueFollowUp ? 'high' : 'normal',
      status: 'open',
      dueAt: spec.overdueFollowUp ? ago(26 * HOUR) : ahead(((leadSeq % 4) + 1) * 8 * HOUR),
      createdByUserId: spec.owner, createdAt,
    }).run();
  }
  if (idx === 0) {
    db.insert(s.tasks).values({
      id: newId('tsk'), organizationId: orgId, propertyId, leadId, contactId,
      assigneeUserId: null, title: `Respond to new inquiry from ${spec.guest}`,
      type: 'follow_up', priority: spec.createdAgoHours > 1 ? 'urgent' : 'high',
      status: 'open', dueAt: slaDue, createdAt,
    }).run();
  }

  /* availability search (stage >= availability_checked) */
  let searchId: string | null = null;
  let snapshotCheckedAt: Date | null = null;
  if (idx >= 3) {
    searchId = newId('avs');
    snapshotCheckedAt = ago((6 + (leadSeq % 30)) * HOUR);
    // Anything older than the org freshness threshold must read as stale, not live.
    const isStale = now - snapshotCheckedAt.getTime() > 15 * 60_000;
    db.insert(s.availabilitySearches).values({
      id: searchId, organizationId: orgId, propertyId, leadId, connectionId: pmsId,
      actorUserId: spec.owner, checkIn, checkOut, nights, rooms: spec.rooms,
      adults: spec.adults, children: spec.children ?? 0, rateContext: 'fit',
      status: 'success', sourceKind: 'pms', sourceLabel: 'Opera Cloud (sandbox adapter)',
      latencyMs: 380 + (leadSeq % 7) * 95, checkedAt: snapshotCheckedAt, createdAt: snapshotCheckedAt,
    }).run();
    for (const [i, room] of roomTypes[propertyId].entries()) {
      for (const plan of ratePlans[propertyId].slice(0, 3)) {
        const qty = (i + leadSeq) % 5 === 0 ? 0 : 2 + ((i + leadSeq) % 6);
        const multiplier = plan.code === 'ADV-NR' ? 0.88 : plan.code === 'STAY3' ? 0.8 : plan.code === 'BAR-BB' ? 1.06 : 1;
        db.insert(s.availabilitySnapshots).values({
          id: newId('avn'), organizationId: orgId, searchId,
          roomTypeId: room.id, roomTypeName: room.name,
          ratePlanId: plan.id, ratePlanName: plan.name,
          sellableQty: qty, ratePerNight: Math.round((room.rate * multiplier) / 1000) * 1000,
          currency: 'IDR',
          restrictions: JSON.stringify(
            [plan.minStay > 1 ? `Min stay ${plan.minStay} nights` : null, !plan.refundable ? 'Non-refundable' : null].filter(Boolean),
          ),
          inclusions: ratePlanDefs.find((d) => d.code === plan.code)
            ? JSON.stringify(ratePlanDefs.find((d) => d.code === plan.code)!.inclusions)
            : '[]',
          state: qty === 0 ? 'unavailable' : isStale ? 'stale' : 'live',
          checkedAt: snapshotCheckedAt,
        }).run();
      }
    }
  }

  /* quotation (stage >= quotation_sent) */
  let versionId: string | null = null;
  let quotationTotal = 0;
  if (idx >= 4) {
    quoteSeq += 1;
    const quotationId = newId('quo');
    const quoteCode = `QT-${propCode}-${String(quoteSeq).padStart(4, '0')}`;
    const quoteCreated = ago((spec.createdAgoHours - 12) * HOUR);
    const ratePerNight = Math.round((baseRate * (spec.rateCode === 'BAR-BB' ? 1.06 : 1)) / 1000) * 1000;
    const subtotal = ratePerNight * spec.rooms * nights;
    const discountPercent = spec.discountPercent ?? 0;
    const discountAmount = Math.round((subtotal * discountPercent) / 100);
    const netAmount = subtotal - discountAmount;
    const serviceAmount = Math.round((netAmount * orgService) / 100);
    const taxAmount = Math.round(((netAmount + serviceAmount) * orgTax) / 100);
    const total = netAmount + serviceAmount + taxAmount;
    quotationTotal = total;

    // Above an agent's authority the version parks in Pending Approval and cannot be sent.
    const overLimit = discountPercent > 10 && spec.owner !== U.manager;
    const status = overLimit ? 'pending_approval' : idx >= 6 ? 'accepted' : 'sent';
    // Keep live-stage quotations genuinely live; only the flagged one is near expiry.
    const naturalExpiry = new Date(quoteCreated.getTime() + 48 * HOUR);
    const validUntil = spec.note?.includes('expires')
      ? ahead(11 * HOUR)
      : naturalExpiry.getTime() > now || idx >= 6
        ? naturalExpiry
        : ahead(((leadSeq % 3) + 2) * DAY);

    db.insert(s.quotations).values({
      id: quotationId, organizationId: orgId, propertyId, leadId, code: quoteCode,
      status, currency: 'IDR', createdByUserId: spec.owner, createdAt: quoteCreated, updatedAt: quoteCreated,
    }).run();

    versionId = newId('qvr');
    db.insert(s.quotationVersions).values({
      id: versionId, organizationId: orgId, quotationId, version: 1, status,
      subtotal, discountType: discountPercent ? 'percent' : 'none', discountValue: discountPercent,
      discountAmount, discountPercentEffective: discountPercent, netAmount,
      servicePercent: orgService, serviceAmount, taxPercent: orgTax, taxAmount, total,
      currency: 'IDR', nights, checkIn, checkOut, adults: spec.adults, children: spec.children ?? 0,
      inclusions: JSON.stringify(ratePlanDefs.find((d) => d.code === spec.rateCode)?.inclusions ?? []),
      policies: ratePlanDefs.find((d) => d.code === spec.rateCode)?.refundable
        ? 'Free cancellation up to 48 hours before arrival. One night deposit required to hold.'
        : 'Non-refundable. Full prepayment required at confirmation.',
      notes: spec.special ?? null,
      validUntil,
      availabilitySearchId: searchId,
      snapshotSource: 'Opera Cloud (sandbox adapter)', snapshotCheckedAt,
      createdByUserId: spec.owner,
      approvedByUserId: overLimit ? null : spec.owner,
      approvedAt: overLimit ? null : quoteCreated,
      sentAt: overLimit ? null : new Date(quoteCreated.getTime() + 30 * 60_000),
      sentVia: overLimit ? null : 'chatwoot',
      respondedAt: idx >= 6 ? ago(20 * HOUR) : null,
      createdAt: quoteCreated,
    }).run();
    db.update(s.quotations).set({ currentVersionId: versionId }).where(eq(s.quotations.id, quotationId)).run();

    db.insert(s.quotationItems).values({
      id: newId('qit'), organizationId: orgId, versionId,
      roomTypeId: rt.id, roomTypeName: rt.name, ratePlanId: rp.id, ratePlanName: rp.name,
      rooms: spec.rooms, nights, ratePerNight, lineTotal: subtotal, currency: 'IDR',
      inclusions: JSON.stringify(ratePlanDefs.find((d) => d.code === spec.rateCode)?.inclusions ?? []),
      sortOrder: 0,
    }).run();

    if (overLimit) {
      db.insert(s.approvalRequests).values({
        id: newId('apr'), organizationId: orgId, propertyId, kind: 'discount', leadId,
        quotationVersionId: versionId, requestedByUserId: spec.owner,
        requestedDiscountPercent: discountPercent, requesterLimitPercent: 10,
        amountImpact: discountAmount, currency: 'IDR',
        reason: 'Repeat corporate guest, competitor quoted lower for the same dates.',
        status: 'pending', createdAt: quoteCreated,
      }).run();
      db.insert(s.tasks).values({
        id: newId('tsk'), organizationId: orgId, propertyId, leadId,
        assigneeUserId: U.manager, title: `Approve ${discountPercent}% discount for ${spec.guest}`,
        description: `Requested by ${seedUsers.find((u) => U[u.key] === spec.owner)?.name}. Impact ${discountAmount.toLocaleString('id-ID')} IDR.`,
        type: 'approval', priority: 'high', status: 'open',
        dueAt: ahead(4 * HOUR), createdByUserId: spec.owner, createdAt: quoteCreated,
      }).run();
    }

    db.insert(s.activities).values({
      id: newId('act'), organizationId: orgId, propertyId, leadId, contactId,
      type: overLimit ? 'quotation_submitted' : 'quotation_sent',
      title: overLimit ? `Quotation ${quoteCode} submitted for approval` : `Quotation ${quoteCode} sent via Chatwoot`,
      body: `${spec.rooms} × ${rt.name} · ${rp.name} · ${nights} nights · total ${total.toLocaleString('id-ID')} IDR`,
      actorUserId: spec.owner, actorName: seedUsers.find((u) => U[u.key] === spec.owner)?.name,
      source: 'crm', createdAt: quoteCreated,
    }).run();
  }

  /* reservation handoff (stage >= deposit_pending) */
  if (idx >= 6) {
    resSeq += 1;
    const reqId = newId('rrq');
    const reqCode = `RR-${propCode}-${String(resSeq).padStart(4, '0')}`;
    const submittedAt = ago((spec.createdAgoHours - 30) * HOUR);
    const confirmed = spec.stage === 'confirmed';
    db.insert(s.reservationRequests).values({
      id: reqId, organizationId: orgId, propertyId, leadId, quotationVersionId: versionId,
      code: reqCode, kind: 'reservation', status: confirmed ? 'confirmed' : 'under_review',
      guestName: spec.guest, guestPhone: spec.phone, guestEmail: spec.email,
      checkIn, checkOut, nights, rooms: spec.rooms, adults: spec.adults, children: spec.children ?? 0,
      roomTypeId: rt.id, roomTypeName: rt.name, ratePlanId: rp.id, ratePlanName: rp.name,
      totalAmount: quotationTotal, currency: 'IDR',
      specialRequest: spec.special ?? null,
      requestedByUserId: spec.owner, assignedToUserId: U.fo,
      submittedAt, reviewStartedAt: new Date(submittedAt.getTime() + 25 * 60_000),
      decidedAt: confirmed ? new Date(submittedAt.getTime() + 3 * HOUR) : null,
      decidedByUserId: confirmed ? U.fo : null,
      decisionNote: confirmed ? 'Inventory verified in PMS and reservation created.' : null,
      holdExpiresAt: confirmed ? null : ahead(20 * HOUR),
      createdAt: submittedAt, updatedAt: submittedAt,
    }).run();

    if (confirmed) {
      db.insert(s.reservationReferences).values({
        id: newId('rrf'), organizationId: orgId, reservationRequestId: reqId,
        provider: 'pms-mock', kind: 'reservation',
        externalReference: `NHG${propCode}${String(88000 + resSeq)}`,
        confirmationType: 'pms', raw: JSON.stringify({ pmsStatus: 'RESERVED', folio: `F${90000 + resSeq}` }),
        createdByUserId: U.fo, createdAt: new Date(submittedAt.getTime() + 3 * HOUR),
      }).run();
    }
    db.insert(s.depositStatusReferences).values({
      id: newId('dep'), organizationId: orgId, reservationRequestId: reqId, leadId,
      status: confirmed ? 'paid' : 'pending',
      amount: Math.round(quotationTotal * 0.3), currency: 'IDR',
      dueAt: confirmed ? null : ahead(2 * DAY), source: 'manual',
      updatedByUserId: confirmed ? U.fo : null,
      createdAt: submittedAt, updatedAt: submittedAt,
    }).run();
    db.insert(s.activities).values({
      id: newId('act'), organizationId: orgId, propertyId, leadId, contactId,
      type: confirmed ? 'reservation_confirmed' : 'reservation_requested',
      title: confirmed ? `Reservation confirmed (${reqCode})` : `Reservation request ${reqCode} submitted`,
      body: confirmed ? 'Front office verified inventory and created the reservation in the PMS.' : 'Awaiting front-office verification.',
      actorUserId: confirmed ? U.fo : spec.owner,
      actorName: confirmed ? 'Nadia Rahmawati' : seedUsers.find((u) => U[u.key] === spec.owner)?.name,
      source: confirmed ? 'pms' : 'crm', createdAt: submittedAt,
    }).run();
  }
}

/* ---------------------- integration event history ---------------------- */

const eventKinds = ['message_created', 'conversation_created', 'contact_updated', 'conversation_status_changed'];
for (let i = 0; i < 46; i += 1) {
  const receivedAt = ago((i * 37 + 4) * 60_000);
  const kind = pick(eventKinds, i);
  const inbox = pick(inboxes, i);
  db.insert(s.webhookEvents).values({
    id: newId('whe'), organizationId: orgId, connectionId: chatwootId, provider: 'chatwoot',
    eventType: kind, fingerprint: fingerprint(['chatwoot', '1', kind, `seed-${i}`]),
    payload: JSON.stringify({ event: kind, account: { id: 1 }, inbox: { id: Number(inbox.ext), name: inbox.name }, id: 7000 + i }),
    externalAccountId: '1', correlationId: newId('cor'),
    status: 'processed', attempts: 1,
    resultSummary: kind === 'conversation_created' ? 'Linked to existing lead' : 'Context updated',
    receivedAt, processedAt: new Date(receivedAt.getTime() + 900),
  }).run();
}

// Duplicate delivery: recorded, but produced no second business effect (PRD FR-04).
const dupFingerprint = fingerprint(['chatwoot', '1', 'message_created', 'seed-3']);
db.insert(s.webhookEvents).values({
  id: newId('whe'), organizationId: orgId, connectionId: chatwootId, provider: 'chatwoot',
  eventType: 'message_created', fingerprint: `${dupFingerprint}-replay`,
  payload: JSON.stringify({ event: 'message_created', account: { id: 1 }, id: 7003, replay: true }),
  externalAccountId: '1', correlationId: newId('cor'), status: 'duplicate', attempts: 1,
  resultSummary: 'Duplicate of an already-processed event, ignored',
  receivedAt: ago(52 * 60_000), processedAt: ago(52 * 60_000),
}).run();

// Two failures that need an admin: an unmapped inbox and an unmapped agent.
const failures = [
  { type: 'conversation_created', reason: 'Inbox 19 ("WhatsApp · Wedding Enquiries (new)") is not mapped to a property', action: 'Map inbox 19 in Integrations → Mappings, then retry.' },
  { type: 'conversation_updated', reason: 'Assigned agent 118 (night.desk@nusantara-hotels.test) is not mapped to a CRM user', action: 'Map agent 118 to a CRM user with access to this property, then retry.' },
];
failures.forEach((f, i) => {
  const eventId = newId('whe');
  const receivedAt = ago((90 + i * 45) * 60_000);
  db.insert(s.webhookEvents).values({
    id: eventId, organizationId: orgId, connectionId: chatwootId, provider: 'chatwoot',
    eventType: f.type, fingerprint: fingerprint(['chatwoot', '1', f.type, `fail-${i}`]),
    payload: JSON.stringify({ event: f.type, account: { id: 1 }, inbox: { id: 19 }, assignee: { id: 118 } }),
    externalAccountId: '1', correlationId: newId('cor'),
    status: 'dead_letter', attempts: 5, lastError: f.reason,
    receivedAt, processedAt: new Date(receivedAt.getTime() + 4200),
  }).run();
  db.insert(s.deadLetterEvents).values({
    id: newId('dlq'), organizationId: orgId, webhookEventId: eventId,
    reason: f.reason, actionRequired: f.action, createdAt: new Date(receivedAt.getTime() + 4200),
  }).run();
  db.insert(s.tasks).values({
    id: newId('tsk'), organizationId: orgId, propertyId: null, assigneeUserId: U.admin,
    title: 'Resolve unmapped Chatwoot routing', description: f.action,
    type: 'mapping_review', priority: 'high', status: 'open',
    dueAt: ahead(6 * HOUR), createdAt: new Date(receivedAt.getTime() + 4200),
  }).run();
});

for (let i = 0; i < 8; i += 1) {
  const createdAt = ago((i * 26 + 3) * 60_000);
  db.insert(s.syncJobs).values({
    id: newId('syn'), organizationId: orgId, connectionId: chatwootId,
    kind: i % 3 === 0 ? 'send_message' : 'update_conversation_attributes',
    targetExternalId: String(4200 + i),
    payload: JSON.stringify(i % 3 === 0 ? { message: 'Quotation link sent' } : { crm_lead_id: nextCode('LEAD', i + 1), pipeline_stage: 'quotation_sent' }),
    idempotencyKey: `seed-sync-${i}`, status: i === 5 ? 'failed' : 'success', attempts: i === 5 ? 3 : 1,
    lastError: i === 5 ? 'Chatwoot returned 502 while updating custom attributes' : null,
    createdAt, processedAt: new Date(createdAt.getTime() + 700),
  }).run();
}

/* ------------------------- duplicate contact review ------------------------- */

const dupContactId = newId('cnt');
db.insert(s.contacts).values({
  id: dupContactId, organizationId: orgId, fullName: 'A. Kirana',
  phoneNormalized: '+6281234550101', phoneRaw: '0812-3455-0101',
  email: 'anindya.k@work.test', emailNormalized: 'anindya.k@work.test',
  preferredLanguage: 'id', guestTier: 'none', consentStatus: 'unknown',
  preferences: '[]', createdAt: ago(3 * HOUR), updatedAt: ago(3 * HOUR),
}).run();
db.insert(s.tasks).values({
  id: newId('tsk'), organizationId: orgId, propertyId: KLJ.id, contactId: dupContactId,
  assigneeUserId: U.pa, title: 'Review possible duplicate guest: A. Kirana',
  description: 'Same normalized phone as Anindya Kirana but a different email. Merge only after confirming identity.',
  type: 'merge_review', priority: 'normal', status: 'open', dueAt: ahead(2 * DAY), createdAt: ago(3 * HOUR),
}).run();

/* --------------------------- notifications + audit --------------------------- */

const notifs = [
  { userId: U.agent1, kind: 'sla_warning', title: 'New inquiry waiting', body: 'Anindya Kirana, WhatsApp Jakarta Sales. First response due in 6 minutes.', link: '/leads', severity: 'warning' },
  { userId: U.manager, kind: 'approval_pending', title: '22% discount needs approval', body: 'Ahmad Faisal · The Kalyana Jakarta · 6 rooms', link: '/approvals', severity: 'action_required' },
  { userId: U.fo, kind: 'reservation_request', title: '2 reservation requests waiting', body: 'Sophia Lim and Gregorius Santoso are under review.', link: '/reservations', severity: 'info' },
  { userId: U.admin, kind: 'integration_health', title: '2 Chatwoot events need mapping', body: 'Inbox 19 and agent 118 are unmapped.', link: '/integrations/health', severity: 'action_required' },
];
notifs.forEach((n, i) => {
  db.insert(s.notifications).values({
    id: newId('ntf'), organizationId: orgId, userId: n.userId, kind: n.kind,
    title: n.title, body: n.body, link: n.link, severity: n.severity,
    readAt: null, createdAt: ago((i + 1) * 25 * 60_000),
  }).run();
});

const audits: { action: string; entityType: string; summary: string; actor: string; severity?: string }[] = [
  { action: 'auth.login', entityType: 'session', summary: 'Wulan Prameswari signed in from 103.28.14.9', actor: U.admin },
  { action: 'integration.connection.tested', entityType: 'integration_connection', summary: 'Chatwoot connection test succeeded (account "Nusantara Hospitality")', actor: U.admin },
  { action: 'integration.mapping.updated', entityType: 'mapping_rule', summary: 'Inbox 13 mapped to Amanaya Bali Resort / Bali Sales', actor: U.admin },
  { action: 'user.invited', entityType: 'user', summary: 'Invited new.agent@nusantara-hotels.test as Sales Agent (The Kalyana Jakarta)', actor: U.admin },
  { action: 'lead.assigned', entityType: 'lead', summary: 'LEAD-0004 assigned to Dimas Ardiansyah', actor: U.manager },
  { action: 'quotation.sent', entityType: 'quotation', summary: 'QT-KLJ-0001 sent to Yusuke Watanabe via Chatwoot', actor: U.agent1 },
  { action: 'approval.requested', entityType: 'approval_request', summary: '22% discount requested on QT-KLJ-0005 (above 10% agent limit)', actor: U.manager, severity: 'warning' },
  { action: 'reservation.confirmed', entityType: 'reservation_request', summary: 'RR-AMB-0001 confirmed with PMS reference NHGAMB88001', actor: U.fo },
  { action: 'access.denied.property', entityType: 'property', summary: 'Blocked agent3@nusantara-hotels.test from The Kalyana Jakarta (outside granted scope)', actor: U.agent3, severity: 'warning' },
  { action: 'export.requested', entityType: 'report', summary: 'Rizky Nugroho exported the conversion funnel for Q3', actor: U.analyst },
];
audits.forEach((a, i) => {
  const name = seedUsers.find((u) => U[u.key] === a.actor)?.name ?? 'System';
  db.insert(s.auditLogs).values({
    id: newId('aud'), organizationId: orgId, propertyId: null, actorUserId: a.actor,
    actorName: name, actorType: 'user', action: a.action, entityType: a.entityType,
    entityId: null, summary: a.summary, ip: '103.28.14.9',
    severity: (a.severity ?? 'info') as 'info', createdAt: ago((i + 1) * 3 * HOUR),
  }).run();
});

for (const [i, name] of ['lead_created', 'availability_searched', 'quotation_sent', 'reservation_confirmed', 'webhook_processed'].entries()) {
  for (let k = 0; k < 12; k += 1) {
    db.insert(s.productEvents).values({
      id: newId('evt'), organizationId: orgId, propertyId: pick(props, k).id,
      userId: pick([U.agent1, U.agent2, U.agent3], k), name,
      properties: JSON.stringify({ seeded: true }),
      createdAt: ago((i * 12 + k) * 4 * HOUR),
    }).run();
  }
}

/* ------------------------- riwayat inap yang sudah lewat ------------------------- *
 * Hotel yang sudah berjalan punya tamu yang pernah menginap. Tanpa riwayat ini
 * layar Pasca-Inap tampak mati padahal berfungsi, dan tidak ada tamu yang layak
 * diajak kembali. Tanggalnya dibuat di masa lalu dengan jarak yang berbeda-beda
 * supaya sebagian jatuh tempo untuk diajak kembali dan sebagian belum.
 * ------------------------------------------------------------------------- */

const pastStays: { guest: string; phone: string; daysAgo: number; nights: number; stays: number }[] = [
  { guest: 'Ibu Kartika Wijaya', phone: '+6281100200301', daysAgo: 210, nights: 3, stays: 4 },
  { guest: 'Bapak Hendra Gunawan', phone: '+6281100200302', daysAgo: 175, nights: 2, stays: 3 },
  { guest: 'Ms. Amelia Foster', phone: '+6281100200303', daysAgo: 160, nights: 5, stays: 2 },
  { guest: 'Bapak Yusuf Rahman', phone: '+6281100200304', daysAgo: 40, nights: 2, stays: 1 },
  { guest: 'Ibu Sinta Melati', phone: '+6281100200305', daysAgo: 6, nights: 1, stays: 1 },
];

for (const [i, past] of pastStays.entries()) {
  const propertyId = pick(props, i).id;
  const propCode = props.find((p) => p.id === propertyId)!.code;
  const checkOutMs = Date.now() - past.daysAgo * DAY;
  const checkOut = new Date(checkOutMs).toISOString().slice(0, 10);
  const checkIn = new Date(checkOutMs - past.nights * DAY).toISOString().slice(0, 10);
  const rt = roomTypes[propertyId][i % roomTypes[propertyId].length];
  const rp = ratePlans[propertyId][i % ratePlans[propertyId].length];

  const contactId = newId('cnt');
  db.insert(s.contacts).values({
    id: contactId, organizationId: orgId, fullName: past.guest,
    phoneNormalized: past.phone, preferredLanguage: 'id',
    guestTier: past.stays >= 4 ? 'gold' : past.stays >= 2 ? 'silver' : 'member',
    consentStatus: 'granted',
    // Riwayat sudah terisi: sapuan pasca-inap akan menambah satu di atasnya.
    lastStayDate: checkOut, stayCount: past.stays,
    createdAt: ago((past.daysAgo + 30) * DAY),
  }).run();

  const leadId = newId('led');
  db.insert(s.leads).values({
    id: leadId, organizationId: orgId, propertyId, contactId,
    code: `LEAD-9${String(i + 1).padStart(3, '0')}`,
    stage: 'confirmed', status: 'won', inquiryType: 'fit', channel: 'whatsapp',
    ownerUserId: pick([U.agent1, U.agent2, U.agent3], i),
    checkIn, checkOut, rooms: 1, adults: 2, children: 0,
    estimatedValue: rt.rate * past.nights, currency: 'IDR',
    createdAt: ago((past.daysAgo + 20) * DAY), updatedAt: ago(past.daysAgo * DAY),
  }).run();

  const reqId = newId('rrq');
  db.insert(s.reservationRequests).values({
    id: reqId, organizationId: orgId, propertyId, leadId, quotationVersionId: null,
    code: `RR-${propCode}-9${String(i + 1).padStart(3, '0')}`,
    kind: 'reservation', status: 'confirmed',
    guestName: past.guest, guestPhone: past.phone, guestEmail: null,
    checkIn, checkOut, nights: past.nights, rooms: 1, adults: 2, children: 0,
    roomTypeId: rt.id, roomTypeName: rt.name, ratePlanId: rp.id, ratePlanName: rp.name,
    totalAmount: rt.rate * past.nights, currency: 'IDR',
    requestedByUserId: pick([U.agent1, U.agent2, U.agent3], i), assignedToUserId: U.fo,
    submittedAt: ago((past.daysAgo + 10) * DAY),
    decidedAt: ago((past.daysAgo + 9) * DAY), decidedByUserId: U.fo,
    // Sengaja dibiarkan kosong: sapuan pasca-inap yang akan mengisinya, sehingga
    // demo memperlihatkan mekanismenya bekerja, bukan hasil yang sudah dipalsukan.
    stayCompletedAt: null,
    createdAt: ago((past.daysAgo + 10) * DAY), updatedAt: ago(past.daysAgo * DAY),
  }).run();
}

const counts = TABLES.map((t) => `${t}=${(raw.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c}`)
  .filter((r) => !r.endsWith('=0'));

console.log('Seed complete.');
console.log(counts.join('  '));
console.log(`\nSign in with any of these (password: ${DEMO_PASSWORD}):`);
for (const u of seedUsers) console.log(`  ${u.email.padEnd(42)} ${ROLE_DEFINITIONS[u.role].name}`);
