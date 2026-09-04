/**
 * Menjalankan setiap bentuk payload Chatwoot yang nyata melalui konektor asli.
 *
 * Tes ini ada karena tiga bug berturut-turut lolos ke produksi: id inbox yang
 * tidak terbaca, kontak yang tidak ditemukan, dan agen yang tidak dikenali.
 * Ketiganya lolos dari pengujian sebelumnya karena payload buatan sendiri
 * selalu berbentuk seperti yang dibayangkan penulisnya. Setiap pemeriksaan di
 * sini menyebutkan apa yang seharusnya terjadi, bukan sekadar "tidak error".
 *
 *   DATABASE_FILE=... CRM_SECRET_KEY=... npm run test:ingest
 */
import { and, eq } from 'drizzle-orm';
import * as s from './db.ts';
import { db } from './db.ts';
import { newId } from '../src/server/crypto.ts';
import { recordWebhookEvent, processWebhookEvent } from '../src/server/services/chatwoot-ingest.ts';
import { flat, nested, malformed, INBOX, AGENT, CONTACT, CONVERSATION_ID, type Payload } from './fixtures/chatwoot-payloads.ts';

/** Percakapan datar dengan id sendiri, untuk menguji batas deduplikasi. */
function flatDistinct(id: number): Payload {
  return {
    event: 'conversation_created', id, inbox_id: INBOX.id, channel: INBOX.channel_type,
    status: 'open',
    meta: { sender: { id: 600 + id, name: `Tamu ${id}`, phone_number: `+62811999${id}`, type: 'contact' } },
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass += 1; console.log(`    ✔ ${label}`); }
  else { fail += 1; failures.push(label); console.log(`    ✘ ${label}${detail ? ` — ${detail}` : ''}`); }
}

function group(name: string) {
  console.log(`\n${'─'.repeat(70)}\n▶ ${name}`);
}

/* ------------------------------------------------------------------ setup -- */

const org = db.select().from(s.organizations).get();
if (!org) { console.error('Jalankan db:bootstrap dulu.'); process.exit(1); }
const ORG = org;
const admin = db.select().from(s.users).where(eq(s.users.organizationId, ORG.id)).get()!;

const propertyId = newId('prp');
db.insert(s.properties).values({
  id: propertyId, organizationId: ORG.id, name: 'Hotel Uji Konektor', code: 'HUK',
  timezone: 'Asia/Jakarta', currency: 'IDR', inventorySource: 'crm', active: true,
}).run();

const connId = newId('con');
db.insert(s.integrationConnections).values({
  id: connId, organizationId: ORG.id, provider: 'chatwoot', adapter: 'chatwoot',
  label: 'Chatwoot Uji', baseUrl: 'https://chatwoot.example.com', externalAccountId: '1',
  status: 'healthy', active: true,
}).run();

db.insert(s.mappingRules).values({
  id: newId('map'), organizationId: ORG.id, connectionId: connId, kind: 'inbox',
  externalId: String(INBOX.id), externalName: INBOX.name, propertyId,
  isSalesInbox: true, status: 'mapped', channel: 'whatsapp', inquiryType: 'fit',
}).run();

db.insert(s.mappingRules).values({
  id: newId('map'), organizationId: ORG.id, connectionId: connId, kind: 'agent',
  externalId: String(AGENT.id), externalName: AGENT.name, userId: admin.id,
  status: 'mapped',
}).run();

type Outcome = ReturnType<typeof processWebhookEvent>;

/**
 * Meniru route webhook persis: bila pencatatan mengenali duplikat, route
 * berhenti di situ dan tidak memproses apa pun. Memprosesnya tetap akan
 * menjalankan ulang payload LAMA yang tersimpan, karena `recordWebhookEvent`
 * mengembalikan event yang sudah ada, bukan yang baru dikirim.
 */
function feed(payload: Payload): Outcome {
  const rec = recordWebhookEvent({
    connectionId: connId, organizationId: ORG.id,
    payload: payload as never, rawBody: JSON.stringify(payload), correlationId: newId('cor'),
  });
  if (rec.duplicate) {
    return { status: 'duplicate', summary: 'Duplikat dari event yang sudah diproses, diabaikan.', eventId: rec.event.id };
  }
  return processWebhookEvent(rec.event.id);
}

const leadCount = () => db.select().from(s.leads).where(eq(s.leads.organizationId, ORG.id)).all().length;
const conversation = (externalId: string | number) =>
  db.select().from(s.conversationReferences)
    .where(and(
      eq(s.conversationReferences.connectionId, connId),
      eq(s.conversationReferences.externalConversationId, String(externalId)),
    ))
    .get();

/* ----------------------------------------------- 1. bentuk datar percakapan -- */

group('1. Bentuk datar: atribut percakapan tersebar di akar payload');

const before = leadCount();
const created = feed(flat.conversationCreated());
check('conversation_created diproses, bukan dead letter', created.status === 'processed', `${created.status}: ${created.summary}`);
check('satu prospek terbentuk', leadCount() === before + 1, `jumlah ${leadCount()}, sebelumnya ${before}`);

const conv = conversation(CONVERSATION_ID);
check('percakapan tercatat dengan id eksternalnya', !!conv);
check('inbox terbaca dari inbox_id di akar', conv?.externalInboxId === String(INBOX.id), `terbaca "${conv?.externalInboxId}"`);
check('kanal terbaca dari channel di akar', !!conv?.channel, `terbaca "${conv?.channel}"`);

const leadRow = conv?.id
  ? db.select().from(s.leads).where(eq(s.leads.primaryConversationId, conv.id)).get()
  : undefined;
const guest = leadRow ? db.select().from(s.contacts).where(eq(s.contacts.id, leadRow.contactId)).get() : undefined;
check('kontak terbaca dari meta.sender', guest?.fullName === CONTACT.name, `terbaca "${guest?.fullName}"`);
check('nomor telepon tamu ikut tersimpan', guest?.phoneNormalized === CONTACT.phone_number, `terbaca "${guest?.phoneNormalized}"`);

const statusChanged = feed(flat.conversationStatusChanged());
check('conversation_status_changed diproses', statusChanged.status === 'processed', `${statusChanged.status}: ${statusChanged.summary}`);
check('status percakapan ikut diperbarui', conversation(CONVERSATION_ID)?.conversationStatus === 'resolved',
  `terbaca "${conversation(CONVERSATION_ID)?.conversationStatus}"`);

const updated = feed(flat.conversationUpdated());
check('conversation_updated diproses', updated.status === 'processed', `${updated.status}: ${updated.summary}`);
check('status kembali ke open', conversation(CONVERSATION_ID)?.conversationStatus === 'open',
  `terbaca "${conversation(CONVERSATION_ID)?.conversationStatus}"`);

/* ------------------------------------------------------- 2. penugasan agen -- */

group('2. Penugasan agen dari meta.assignee di akar payload');

const assigned = feed(flat.conversationAssigned());
check('percakapan yang ditugaskan diproses', assigned.status === 'processed', `${assigned.status}: ${assigned.summary}`);
check('agen terpetakan ke pengguna CRM', conversation(4301)?.assignedUserId === admin.id,
  `terbaca "${conversation(4301)?.assignedUserId}"`);
check('id agen eksternal terbaca dari meta.assignee', conversation(4301)?.assignedExternalAgentId === String(AGENT.id),
  `terbaca "${conversation(4301)?.assignedExternalAgentId}"`);

const labelled = feed(flat.conversationLabelled());
check('label percakapan diproses', labelled.status === 'processed', `${labelled.status}: ${labelled.summary}`);
check('label tersimpan', (conversation(4302)?.labels ?? '').includes('room-inquiry'),
  `terbaca ${conversation(4302)?.labels}`);

/* --------------------------------------------------- 3. bentuk bersarang -- */

group('3. Bentuk bersarang: message_created dan contact_*');

const incoming = feed(nested.messageCreatedIncoming());
check('pesan masuk diproses', incoming.status === 'processed', `${incoming.status}: ${incoming.summary}`);
check('cuplikan pesan terakhir tersimpan', !!conversation(CONVERSATION_ID)?.lastMessagePreview);
check('arah pesan terakhir dari tamu', conversation(CONVERSATION_ID)?.lastMessageFrom === 'contact',
  `terbaca "${conversation(CONVERSATION_ID)?.lastMessageFrom}"`);

const outgoing = feed(nested.messageCreatedOutgoing());
check('pesan keluar diproses', outgoing.status === 'processed', `${outgoing.status}: ${outgoing.summary}`);
check('arah pesan terakhir dari agen', conversation(CONVERSATION_ID)?.lastMessageFrom === 'agent',
  `terbaca "${conversation(CONVERSATION_ID)?.lastMessageFrom}"`);

const contactCreated = feed(nested.contactCreated());
check('contact_created diproses', contactCreated.status === 'processed', `${contactCreated.status}: ${contactCreated.summary}`);

const contactUpdated = feed(nested.contactUpdated());
check('contact_updated diproses', contactUpdated.status === 'processed', `${contactUpdated.status}: ${contactUpdated.summary}`);

const beforeNested = leadCount();
const nestedConv = feed(nested.conversationCreatedNested());
check('bentuk bersarang lama tidak regresi', nestedConv.status === 'processed', `${nestedConv.status}: ${nestedConv.summary}`);
check('prospek kedua terbentuk dari bentuk bersarang', leadCount() === beforeNested + 1,
  `jumlah ${leadCount()}, sebelumnya ${beforeNested}`);

/* ------------------------------------------------------- 4. deduplikasi -- */

group('4. Deduplikasi: pengiriman ulang tidak boleh menggandakan');

const beforeDupe = leadCount();
// Payload yang sama persis, dikirim ulang sebagaimana Chatwoot mengulang
// pengiriman yang gagal. Identitasnya sama, jadi harus dikenali sebagai ulangan.
const dupe = feed(flat.conversationCreated());
check('pengiriman ulang dikenali sebagai duplikat', dupe.status === 'duplicate', `${dupe.status}: ${dupe.summary}`);
check('tidak ada prospek tambahan', leadCount() === beforeDupe, `jumlah ${leadCount()}, sebelumnya ${beforeDupe}`);

// Dua pembaruan berbeda untuk percakapan berbeda harus tetap keduanya diproses.
const distinctA = feed(flatDistinct(4310));
const distinctB = feed(flatDistinct(4311));
check('percakapan berbeda tidak saling menganggap duplikat',
  distinctA.status === 'processed' && distinctB.status === 'processed',
  `${distinctA.status} / ${distinctB.status}`);

/* --------------------------------------------------- 5. kegagalan jelas -- */

group('5. Kegagalan harus jelas sebabnya, bukan diam');

const noInbox = feed(malformed.conversationWithoutInbox());
check('payload tanpa id inbox masuk dead letter', noInbox.status === 'dead_letter', `${noInbox.status}: ${noInbox.summary}`);
check('pesannya menyebut id tidak terbaca, bukan pemetaan hilang',
  /tidak memuat id inbox/i.test(noInbox.summary), noInbox.summary);
check('pesannya menyebut kunci payload yang diterima',
  noInbox.summary.includes('meta') || noInbox.summary.includes('kunci yang diterima'), noInbox.summary);

const unmappedInbox = feed(malformed.conversationUnmappedInbox());
check('inbox tanpa pemetaan masuk dead letter', unmappedInbox.status === 'dead_letter', `${unmappedInbox.status}: ${unmappedInbox.summary}`);
check('pesannya menyebut nomor inboxnya', unmappedInbox.summary.includes('999'), unmappedInbox.summary);
check('pesannya membedakan diri dari id tak terbaca',
  !/tidak memuat id inbox/i.test(unmappedInbox.summary), unmappedInbox.summary);

const unmappedAgent = feed(malformed.conversationUnmappedAgent());
check('agen tanpa pemetaan masuk dead letter', unmappedAgent.status === 'dead_letter', `${unmappedAgent.status}: ${unmappedAgent.summary}`);
check('pesannya menyebut nama agennya', unmappedAgent.summary.includes('Agen Malam'), unmappedAgent.summary);

const unknown = feed(malformed.unknownEvent());
check('event tanpa acuan percakapan diabaikan, bukan gagal', unknown.status === 'ignored', `${unknown.status}: ${unknown.summary}`);

/* ------------------------------------------------------------- ringkas -- */

console.log(`\n${'═'.repeat(70)}`);
console.log(`  BERHASIL ${pass}   GAGAL ${fail}`);
if (fail) {
  console.log('\n  Yang gagal:');
  for (const f of failures) console.log(`    · ${f}`);
}
console.log(`${'═'.repeat(70)}\n`);
process.exit(fail ? 1 : 0);
