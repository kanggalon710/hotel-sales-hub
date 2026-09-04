# Product Requirements Document (PRD)

## Hotel Sales & Guest Relationship Hub — Chatwoot Integrated CRM

| Metadata | Nilai |
|---|---|
| Status | Draft untuk product discovery dan technical planning |
| Versi | 1.0 |
| Tanggal | 3 September 2026 |
| Target pengguna | Hotel bintang 4–5, independent hotel, dan hotel group |
| Fokus rilis | CRM sales hotel, integrasi Chatwoot, user management, availability, quotation, dan reservation handoff |
| Platform utama | Web desktop responsif; quick actions pada tablet/mobile |

---

## 1. Ringkasan Eksekutif

Hotel Sales & Guest Relationship Hub adalah CRM operasional khusus hotel yang mengubah percakapan omnichannel di Chatwoot menjadi lead yang terstruktur, aktivitas follow-up, pencarian ketersediaan kamar, quotation, dan handoff reservasi.

Chatwoot tetap menjadi sumber utama percakapan. CRM menjadi sumber utama data lead, pipeline, tugas sales, quotation, dan profil hubungan tamu. PMS/CRS tetap menjadi sumber resmi ketersediaan, rate, hold, dan reservasi. Produk menghubungkan ketiga sistem tersebut tanpa membuat sumber data operasional yang saling bertentangan.

MVP ditujukan untuk alur direct room sales/FIT. Arsitektur, permission, dan model datanya harus dapat dikembangkan untuk corporate sales, group/MICE, wedding, travel agent, long stay, after-sales, loyalty, payment, dan accounting integration.

---

## 2. Latar Belakang dan Problem Statement

Inquiry hotel datang dari WhatsApp, Instagram, website chat, Facebook, dan kanal lainnya. Percakapan biasanya ditangani di inbox, sedangkan data kamar, rate, tamu, quotation, dan reservasi tersebar di sistem atau pencatatan berbeda. Akibatnya, sales harus berpindah aplikasi, follow-up mudah terlewat, front office menerima informasi yang tidak lengkap, dan manajemen sulit mengukur conversion serta potensi revenue.

Masalah dialami setiap hari oleh sales, reservation/front office, guest relations, dan sales manager. Jika tidak diselesaikan, hotel kehilangan lead, memperlambat response time, berisiko memberikan informasi kamar yang tidak akurat, dan tidak memiliki histori hubungan tamu yang dapat digunakan untuk repeat business.

### 2.1 Masalah utama

1. Percakapan tidak otomatis menjadi data lead yang dapat dikelola.
2. Satu tamu dapat muncul sebagai beberapa contact tanpa identitas tunggal.
3. Status percakapan sering disalahgunakan sebagai status penjualan.
4. Sales tidak dapat melihat availability dan rate dalam konteks percakapan.
5. Handoff dari sales ke reservation/front office tidak terstruktur.
6. Follow-up, quotation expiry, dan deposit reminder mudah terlewat.
7. Hak akses user belum mencerminkan organisasi hotel dan property.
8. Manajemen tidak memiliki funnel, conversion, channel attribution, dan performance data yang konsisten.

---

## 3. Visi Produk

Menjadi **hotel sales operating system** yang membuat setiap inquiry dapat ditindaklanjuti secara cepat, terukur, aman, dan konsisten dari percakapan pertama hingga reservasi dan hubungan pasca-menginap.

### 3.1 Prinsip produk

1. **Conversation in context** — sales tetap dapat bekerja dari Chatwoot dengan konteks CRM yang relevan.
2. **One source of truth** — Chatwoot untuk percakapan, CRM untuk sales process, PMS/CRS untuk inventory dan reservasi.
3. **Next action first** — setiap lead menampilkan tindakan berikutnya yang paling relevan.
4. **Role-aware** — pengalaman dan akses mengikuti tanggung jawab user.
5. **Multi-property ready** — organisasi, property, tim, user, mata uang, dan timezone tidak di-hardcode.
6. **Traceable by default** — perubahan penting memiliki actor, waktu, sumber, dan audit trail.
7. **Human confirmation for high-risk actions** — harga, diskon, hold, dan reservasi tidak dikonfirmasi otomatis tanpa rule dan otorisasi yang jelas.

---

## 4. Goals dan Success Outcomes

Target berikut merupakan hipotesis awal dan harus dikalibrasi setelah baseline pilot hotel tersedia.

### 4.1 User goals

1. Minimal 95% inquiry yang memenuhi rule sales otomatis dibuat atau ditautkan ke lead dalam waktu maksimal 60 detik.
2. Minimal 90% sales pilot dapat menyelesaikan alur inquiry → availability → quotation tanpa bantuan setelah onboarding.
3. Median waktu membuat quotation standar di bawah 3 menit, di luar waktu respons PMS/CRS.
4. Mengurangi lead tanpa follow-up melewati SLA minimal 30% dalam 90 hari setelah implementasi.
5. Semua request ke front office/reservation memiliki data wajib yang lengkap dan status yang dapat dilacak.

### 4.2 Business goals

1. Menyediakan conversion funnel yang dapat ditelusuri dari source/channel sampai booking.
2. Menyediakan estimasi pipeline value dan room nights per property, channel, dan sales.
3. Meningkatkan quotation-to-booking conversion pada pilot; target final ditentukan setelah baseline 30 hari.
4. Menyediakan fondasi multi-tenant yang dapat digunakan oleh independent hotel maupun hotel group.

---

## 5. Non-Goals Rilis MVP

1. **Menggantikan Chatwoot** — CRM tidak membangun ulang omnichannel inbox atau messaging transport.
2. **Menggantikan PMS/CRS** — CRM tidak menjadi sumber final inventory, folio, room assignment, atau reservation ledger.
3. **Membangun channel manager OTA** — distribusi inventory ke OTA merupakan inisiatif terpisah.
4. **Membangun accounting/general ledger** — MVP hanya dapat menampilkan status deposit yang berasal dari integrasi atau input berizin.
5. **Membangun housekeeping system** — status clean/dirty hanya dikonsumsi jika relevan untuk same-day sale.
6. **AI autonomous booking** — AI tidak boleh menjanjikan kamar, rate, atau booking tanpa validasi sistem sumber.
7. **Campaign automation kompleks** — after-sales lengkap, loyalty, dan marketing orchestration ditempatkan pada fase lanjutan.

---

## 6. Persona dan Jobs to Be Done

### 6.1 Sales Agent

Menerima inquiry, memahami kebutuhan, memeriksa kamar, membuat quotation, melakukan follow-up, dan mendorong lead sampai confirmed booking.

### 6.2 Sales Manager

Mengawasi pipeline, workload, SLA, discount approval, forecast, conversion, dan coaching terhadap sales agent.

### 6.3 Reservation/Front Office

Memverifikasi availability, menilai special request, menyetujui hold, membuat atau mengonfirmasi reservasi, dan memberikan alternatif.

### 6.4 Guest Relations/After-sales

Melihat konteks tamu, menangani kebutuhan pre-arrival/post-stay, serta menjaga histori preferensi dan service recovery.

### 6.5 Property Admin/Hotel Admin

Mengelola user, tim, role, property, pipeline, SLA, mapping Chatwoot, template, dan konfigurasi integrasi.

### 6.6 Management/Analyst

Melihat performa lintas property tanpa mengubah data operasional.

### 6.7 Platform Super Admin

Mengelola tenant, subscription, health status, dan dukungan platform tanpa memperoleh akses rutin terhadap data tamu.

---

## 7. Product Scope dan Prioritas

### 7.1 P0 — Must Have untuk MVP

1. Multi-tenant organization dan multi-property foundation.
2. User invitation, activation/deactivation, predefined roles, property scope, dan permission enforcement.
3. Chatwoot account connection dan agent/user mapping.
4. Webhook ingestion, retry, deduplication, monitoring, dan dead-letter handling.
5. Sinkronisasi contact dan conversation context.
6. Rule-based lead creation/linking dari sales inbox atau label yang dikonfigurasi.
7. Contact deduplication berbasis normalized phone/email dengan manual merge berizin.
8. Lead pipeline, assignment, activity timeline, tasks, follow-up SLA, dan lost reason.
9. Panel konteks CRM yang dapat dibuka dari Chatwoot.
10. Availability search melalui satu PMS/CRS adapter pertama atau manual confirmation fallback.
11. Quotation draft, calculation, expiry, revision, approval dasar, dan delivery melalui Chatwoot.
12. Reservation/front-office request queue dan status handoff.
13. Guest 360 versi dasar.
14. Dashboard operasional dan funnel dasar.
15. Audit trail, export control, dan integration health page.

### 7.2 P1 — Should Have setelah MVP

1. Custom role dan granular permission builder.
2. Multiple pipeline templates untuk FIT, corporate, dan group/MICE.
3. Dashboard app/panel yang lebih dalam di Chatwoot.
4. Quotation view/open/accept tracking.
5. Payment link dan deposit reconciliation.
6. Pre-arrival dan post-stay workflow.
7. Duplicate suggestion berbasis fuzzy matching.
8. SSO dan mandatory MFA policy.
9. Saved views, workload balancing, bulk actions, dan advanced SLA.
10. Multiple PMS/CRS connectors.

### 7.3 P2 — Future Considerations

1. Corporate account, contracted rate, RFP, dan production tracking.
2. Group/MICE, room block, banquet, event proposal, dan BEO.
3. Loyalty, segmentation, campaign, dan repeat guest automation.
4. AI conversation summary, intent extraction, next-best-action, dan quotation assistant.
5. Accounting interface, invoice, tax document, dan revenue reconciliation.
6. Custom workflow builder, marketplace connector, dan public partner API.
7. SSO/SCIM enterprise provisioning dan advanced data residency controls.

---

## 8. Information Architecture

### 8.1 Navigasi utama

- **My Day:** priority queue, overdue tasks, new inquiries, pending deposits, expiring quotations.
- **Leads:** list, saved views, filters, assignment, and bulk actions.
- **Pipeline:** kanban berdasarkan stage dan property.
- **Availability:** room/rate search.
- **Quotations:** draft, approval, sent, accepted, expired, declined.
- **Reservations:** request, hold, pending confirmation, confirmed, cancelled.
- **Guests:** guest profile dan history.
- **Accounts:** corporate/group foundation; dapat disembunyikan pada MVP.
- **Reports:** funnel, sales performance, channel, response SLA, room nights, revenue opportunity.
- **Integrations:** Chatwoot, PMS/CRS, health, logs, mappings.
- **Settings:** organization, properties, users, teams, roles, pipeline, templates, SLA, audit.

### 8.2 Context switching

- User yang memiliki akses lebih dari satu property harus memilih **Current Property** atau **All Permitted Properties**.
- Current Property harus terlihat pada header setiap halaman.
- Create/update action selalu terikat pada satu property.
- Laporan lintas property hanya tersedia bagi role yang memiliki izin.

---

## 9. User Management dan Access Control

### 9.1 Hierarki akun

```text
Platform
└── Organization / Hotel Group (tenant)
    ├── Property A
    │   ├── Department / Team
    │   └── Users
    └── Property B
        ├── Department / Team
        └── Users
```

Satu user dapat menjadi anggota beberapa property dengan role berbeda. Semua query dan action harus memeriksa `organization_id`, `property_scope`, dan permission efektif pada server; penyembunyian menu di UI tidak dianggap sebagai kontrol keamanan.

### 9.2 Predefined roles MVP

| Kemampuan | Org Admin | Property Admin | Sales Manager | Sales Agent | Reservation/FO | Guest Relations | Analyst |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Kelola organization | ✓ | — | — | — | — | — | — |
| Kelola property config | ✓ | ✓ | — | — | — | — | — |
| Invite/deactivate user | ✓ | ✓* | — | — | — | — | — |
| Kelola Chatwoot/PMS integration | ✓ | ✓* | — | — | — | — | — |
| Lihat semua lead property | ✓ | ✓ | ✓ | Sesuai assignment/team | Limited | Limited | Read-only |
| Buat/edit lead | ✓ | ✓ | ✓ | ✓ | Limited | Limited | — |
| Reassign lead | ✓ | ✓ | ✓ | — | — | — | — |
| Buat quotation | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Approve discount | Configurable | Configurable | Sesuai limit | — | — | — | — |
| Request hold/reservation | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Confirm hold/reservation | Configurable | ✓ | — | — | ✓ | — | — |
| Lihat/edit guest PII | ✓ | ✓ | ✓ | Scoped | Scoped | Scoped | Masked |
| Export data | Configurable | Configurable | Configurable | — | — | — | Configurable |
| Lihat audit log | ✓ | ✓* | — | — | — | — | Optional |

`*` Hanya untuk property yang dikelola.

### 9.3 User lifecycle P0

1. Admin mengundang user melalui email.
2. User menerima invitation yang memiliki masa berlaku.
3. Admin menentukan organization, property, team, role, dan discount authority.
4. User wajib mengganti password pada aktivasi apabila local authentication digunakan.
5. Admin dapat suspend/deactivate user dan seluruh session aktif harus dicabut.
6. Data historis tetap mempertahankan nama actor walaupun user dinonaktifkan.
7. User tidak dapat menghapus dirinya sendiri atau admin terakhir organisasi.
8. Perubahan role, scope, dan status tercatat di audit log.

### 9.4 Chatwoot agent mapping

- Setiap CRM user yang bekerja dari Chatwoot dapat dipetakan ke satu Chatwoot agent per connected account.
- Mapping menggunakan immutable external ID; email hanya membantu proses pencocokan awal.
- Unmapped agent tidak boleh memperoleh akses CRM otomatis.
- Assignment dari Chatwoot diterjemahkan ke CRM jika mapping valid dan user memiliki akses property.
- Deaktivasi di salah satu sistem menampilkan mismatch alert kepada admin; auto-deactivation dapat menjadi P1.

---

## 10. Chatwoot Integration Concept

### 10.1 System ownership

| Data | System of Record |
|---|---|
| Messages, inbox, conversation delivery/status | Chatwoot |
| Contact identity dasar dari channel | Chatwoot, lalu di-resolve ke CRM guest/contact |
| Lead, stage, follow-up, tasks, quotation | CRM |
| Availability, rate restriction, hold, reservation | PMS/CRS |
| Analytics lintas sales workflow | CRM analytics layer |

### 10.2 Mapping entitas

| Chatwoot | CRM | Catatan |
|---|---|---|
| Account | Organization connection | MVP: satu active Chatwoot account per organization; data model mendukung lebih dari satu |
| Inbox | Channel/property routing rule | Satu inbox dapat dipetakan ke property dan inquiry type |
| Team | CRM team mapping | Tidak otomatis memberikan permission |
| Agent | CRM user mapping | Menggunakan external ID |
| Contact | Person/contact identity | Satu contact dapat memiliki banyak conversations dan opportunities |
| Conversation | Interaction/inquiry context | Tidak sama dengan lead stage |
| Label | Classification/routing signal | Bukan sumber resmi pipeline stage |
| Conversation status | Messaging workload state | Bukan sales outcome |
| Custom attributes | CRM identifiers/context summary | Data kompleks tetap disimpan di CRM |

### 10.3 Event inbound P0

Connector berlangganan event yang tersedia dan dibutuhkan, minimal:

- `conversation_created`
- `conversation_updated`
- `conversation_status_changed`
- `message_created`
- `contact_created`
- `contact_updated`

Setiap event harus melalui alur:

1. Receive dan mencatat timestamp serta source account.
2. Authenticate/validate request sesuai kemampuan deployment Chatwoot.
3. Simpan event envelope untuk troubleshooting dengan kontrol retensi.
4. Deduplicate menggunakan external event identity/fingerprint.
5. Normalize payload ke internal event schema.
6. Resolve tenant, inbox mapping, property, contact, agent, dan conversation.
7. Apply business rule secara idempotent.
8. Mark success atau retry dengan exponential backoff.
9. Pindahkan ke dead-letter queue setelah batas retry dan tampilkan action kepada admin.

### 10.4 Lead creation rules

Conversation tidak selalu menjadi lead. Lead dibuat atau ditautkan jika salah satu kondisi terpenuhi:

- Conversation berasal dari sales inbox yang dikonfigurasi; atau
- Conversation mendapat label pemicu seperti `room-inquiry`; atau
- User menekan **Create/Link Lead** dari panel CRM.

Sebelum membuat lead baru, sistem mencari:

1. Lead aktif untuk contact, property, dan stay period yang sama/berdekatan.
2. Lead aktif dari conversation yang sudah tertaut.
3. Contact/guest yang cocok berdasarkan normalized phone/email.

Jika kecocokan ambigu, sistem membuat review task; sistem tidak boleh melakukan merge irreversible otomatis.

### 10.5 Custom attributes minimum

**Contact attributes:**

- `crm_contact_id`
- `guest_tier`
- `preferred_language`
- `corporate_account_id`
- `consent_status`
- `last_stay_date`

**Conversation attributes:**

- `crm_lead_id`
- `property_id`
- `inquiry_type`
- `check_in`
- `check_out`
- `rooms`
- `adults`
- `children`
- `pipeline_stage`
- `assigned_sales`
- `estimated_value`
- `quotation_id`
- `reservation_id`
- `next_follow_up_at`

Attribute harus menggunakan key yang versioned/stable. Penghapusan atau perubahan tipe memerlukan migration plan.

### 10.6 Outbound CRM → Chatwoot

CRM dapat:

1. Memperbarui configured custom attributes.
2. Menambahkan label klasifikasi sesuai rule.
3. Mengirim quotation link/message melalui conversation yang tepat.
4. Menambahkan private note untuk perubahan internal penting jika diaktifkan.
5. Mengarahkan conversation ke mapped team/agent bila diizinkan.
6. Menyediakan deep link dari Chatwoot ke CRM lead dan dari CRM ke Chatwoot conversation.

Outbound update wajib memiliki idempotency key dan source marker untuk mencegah integration loop.

### 10.7 CRM context di Chatwoot

Panel konteks minimal menampilkan:

- Guest/contact summary.
- Lead ID, property, stage, owner, estimated value.
- Check-in/out, rooms, guests, dan preference.
- Availability status dan waktu pengecekan terakhir.
- Quotation status dan expiry.
- Reservation/deposit status.
- Next action dan follow-up due date.
- Tombol `Open Lead`, `Check Availability`, `Create Quote`, dan `Request Reservation` sesuai permission.

Panel harus tetap berguna pada kondisi PMS unavailable dengan menampilkan last-known status sebagai **stale**, bukan sebagai live availability.

### 10.8 Conversation storage dan privacy

- Chatwoot tetap menyimpan transcript utama.
- CRM menyimpan external identifiers, event metadata, selected excerpts/notes yang diperlukan, dan deep link.
- Pengambilan transcript lengkap dilakukan on-demand sesuai permission dan policy.
- Retensi payload webhook, transcript cache, attachment, dan PII harus configurable per organization pada fase enterprise.

### 10.9 Referensi kemampuan Chatwoot

- Webhook events: <https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook>
- Contacts API: <https://developers.chatwoot.com/api-reference/contacts/create-contact>
- Conversations API: <https://developers.chatwoot.com/api-reference/conversations/create-new-conversation>
- Messages API: <https://developers.chatwoot.com/api-reference/messages/create-new-message>
- Custom attributes: <https://www.chatwoot.com/hc/user-guide/articles/1677502327-how-to-create-and-use-custom-attributes>
- Automation: <https://www.chatwoot.com/hc/user-guide/articles/1677689800-how-to-use-automation>

---

## 11. Core Workflow

### 11.1 Inquiry → Lead

1. Guest mengirim pesan ke channel yang masuk ke Chatwoot.
2. Connector menerima conversation/contact event.
3. CRM menyelesaikan identity dan memeriksa rule.
4. CRM membuat atau menautkan lead.
5. Property/team/agent ditentukan dari mapping dan routing rule.
6. Sales menerima notification dan SLA timer dimulai.
7. CRM ID dan context penting ditulis kembali ke Chatwoot.

### 11.2 Lead Qualification

Field wajib sebelum availability/quotation:

- Property.
- Check-in dan check-out.
- Rooms, adults, children.
- Inquiry type/segment.
- Contact method yang valid.
- Assigned sales/team.

Field tambahan: room preference, budget, purpose, company, special request, language, dan source campaign.

### 11.3 Availability → Quotation

1. Sales melakukan search menggunakan stay criteria.
2. CRM meminta data live dari PMS/CRS.
3. Hasil menampilkan room type, sellable quantity, rate plan, restrictions, inclusions, dan timestamp.
4. Sales memilih kombinasi kamar/rate.
5. CRM membuat quotation snapshot beserta tax/service/discount.
6. Discount di atas limit user masuk approval queue.
7. Quotation disimpan sebagai draft, direview, lalu dikirim melalui Chatwoot.

### 11.4 Quotation → Reservation Handoff

1. Sales menandai guest interested/accepted atau menerima signal acceptance.
2. Sales membuat request hold/reservation.
3. Reservation/front office memverifikasi inventory dan detail wajib.
4. Front office dapat confirm, propose alternative, request info, atau reject dengan reason.
5. PMS/CRS menghasilkan hold/reservation reference.
6. CRM memperbarui status dan memberi tahu sales.
7. Pipeline bergerak ke Deposit Pending atau Confirmed sesuai rule.

### 11.5 Lead Closure

- `Won/Confirmed` hanya jika reservation reference atau authorized manual confirmation tersedia.
- `Lost` wajib memiliki reason dan optional competitor/notes.
- `Cancelled` menyimpan cancellation source/reason.
- Menutup conversation di Chatwoot tidak otomatis menandai lead sebagai lost.

---

## 12. Pipeline dan Status Model

### 12.1 Default FIT pipeline

1. New Inquiry
2. Assigned
3. Qualified
4. Availability Checked
5. Quotation Sent
6. Follow-up
7. Deposit Pending
8. Confirmed
9. Lost
10. Cancelled

### 12.2 Quotation status

`Draft → Pending Approval → Approved → Sent → Accepted/Declined/Expired/Superseded`

### 12.3 Reservation request status

`Draft → Submitted → Under Review → Alternative Proposed/On Hold → Confirmed/Rejected/Expired/Cancelled`

Setiap transition harus memiliki permission, validation, event timestamp, dan actor.

---

## 13. User Stories Prioritas

### P0

1. Sebagai sales agent, saya ingin inquiry dari sales inbox otomatis muncul sebagai lead agar tidak kehilangan peluang.
2. Sebagai sales agent, saya ingin membuka CRM context dari Chatwoot agar dapat bekerja tanpa kehilangan konteks percakapan.
3. Sebagai sales agent, saya ingin memeriksa availability dan rate berdasarkan kebutuhan tamu agar dapat memberi pilihan yang akurat.
4. Sebagai sales agent, saya ingin membuat dan mengirim quotation dari lead agar penawaran dapat dilacak.
5. Sebagai sales agent, saya ingin melihat next action dan follow-up deadline agar lead tidak terabaikan.
6. Sebagai reservation/front office, saya ingin menerima request lengkap dan terstruktur agar dapat mengonfirmasi tanpa mencari informasi dari chat panjang.
7. Sebagai sales manager, saya ingin mengatur assignment dan melihat pipeline agar dapat mengelola workload serta forecast.
8. Sebagai sales manager, saya ingin menyetujui atau menolak diskon di atas limit agar rate governance terjaga.
9. Sebagai admin, saya ingin memetakan inbox, agent, team, dan property agar event Chatwoot diarahkan dengan benar.
10. Sebagai admin, saya ingin mengatur user, role, property scope, dan status akun agar akses sesuai tanggung jawab.
11. Sebagai admin, saya ingin melihat event gagal dan mencoba ulang setelah masalah diperbaiki agar integrasi dapat dipulihkan.
12. Sebagai analyst, saya ingin melihat funnel berdasarkan property, source, channel, dan sales tanpa mengubah data.

### Edge cases

1. Sebagai sales, saya ingin melihat peringatan jika availability sudah stale agar tidak menjanjikan inventory lama.
2. Sebagai admin, saya ingin event duplikat tidak membuat lead atau activity ganda.
3. Sebagai admin, saya ingin unmapped inbox/agent masuk review queue agar data tidak diberikan ke user yang salah.
4. Sebagai sales, saya ingin dapat menautkan conversation ke lead yang sudah ada agar satu tamu tidak menghasilkan pipeline ganda.
5. Sebagai front office, saya ingin memberikan alternatif saat kamar tidak tersedia agar opportunity tidak langsung hilang.

---

## 14. Functional Requirements dan Acceptance Criteria

### FR-01 — Tenant dan property isolation (P0)

- Semua record bisnis memiliki organization scope; record operasional memiliki property scope yang relevan.
- Server menolak cross-tenant access walaupun ID valid diketahui user.
- User multi-property hanya dapat melihat property yang diberikan.

**Acceptance criteria**

- Given user Property A, when meminta lead Property B tanpa izin, then sistem mengembalikan access denied dan mencatat security event.
- Given Org Admin, when memilih All Permitted Properties, then data hanya berasal dari organization yang sama.

### FR-02 — User lifecycle dan RBAC (P0)

- Admin dapat invite, resend, revoke invitation, activate, suspend, dan deactivate user.
- Permission diperiksa pada setiap protected action.
- Last organization admin tidak dapat dinonaktifkan sebelum pengganti tersedia.

**Acceptance criteria**

- Given suspended user, when menggunakan session lama, then session ditolak.
- Given Sales Agent tanpa approval authority, when mencoba menyetujui diskon, then action ditolak dan tidak ada status berubah.
- Given role berubah, when user melakukan request berikutnya, then permission terbaru berlaku.

### FR-03 — Chatwoot connection dan mapping (P0)

- Admin dapat menyimpan connection, melakukan connection test, dan memetakan account/inbox/team/agent.
- Secret tidak pernah ditampilkan kembali secara utuh setelah disimpan.
- Status koneksi: Healthy, Degraded, Disconnected, atau Action Required.

**Acceptance criteria**

- Given valid credentials, when admin menjalankan test, then sistem menampilkan account identity dan waktu test.
- Given inbox belum dipetakan, when event diterima, then event masuk mapping review dan tidak membuat lead pada property acak.

### FR-04 — Reliable webhook ingestion (P0)

- Event diproses idempotent dan dapat di-retry.
- Failure dapat dilihat berdasarkan tenant, type, reason, attempt, dan timestamp.
- Admin dapat retry setelah mapping/configuration diperbaiki.

**Acceptance criteria**

- Given payload yang sama diterima dua kali, when diproses, then hanya satu business effect tercipta.
- Given transient downstream failure, when retry berhasil, then event berstatus Recovered tanpa lead duplikat.

### FR-05 — Contact identity resolution (P0)

- Nomor telepon disimpan dalam format normalized international jika memungkinkan.
- Exact email/phone match memberikan candidate link.
- Merge contact manual hanya tersedia bagi role berizin dan dapat diaudit.

**Acceptance criteria**

- Given existing contact dengan nomor normalized sama, when conversation baru masuk, then conversation ditautkan tanpa membuat contact kedua.
- Given konflik dua kandidat, when identity tidak pasti, then sistem meminta review dan tidak auto-merge.

### FR-06 — Lead creation dan linking (P0)

- Lead otomatis hanya dibuat berdasarkan configured sales rule.
- Satu conversation hanya dapat memiliki satu active primary lead link pada waktu yang sama.
- User dapat create/link/unlink sesuai permission dan audit policy.

**Acceptance criteria**

- Given conversation dari support inbox, when tidak ada trigger label, then CRM tidak membuat sales lead.
- Given conversation memenuhi sales rule, when event diproses, then lead memiliki source, inbox, property, contact, conversation ID, dan SLA timestamp.

### FR-07 — Pipeline, assignment, task, dan SLA (P0)

- Lead memiliki stage, owner/team, probability, estimated value, next action, dan activity history.
- Stage transition dapat memiliki required fields.
- Overdue follow-up muncul pada My Day dan manager view.

**Acceptance criteria**

- Given quotation akan kedaluwarsa, when masuk reminder window, then owner menerima task/notification.
- Given lead ditandai Lost, when lost reason kosong, then perubahan ditolak.

### FR-08 — Availability (P0)

- Search menggunakan property, date, occupancy, rooms, segment/rate context.
- Result membedakan live, stale, manual confirmation, dan unavailable.
- Result menyertakan source dan checked-at timestamp.

**Acceptance criteria**

- Given PMS timeout, when sales mencari kamar, then sistem menampilkan error yang dapat ditindaklanjuti dan tidak menampilkan cache sebagai live.
- Given cached result melewati freshness threshold, when ditampilkan, then status jelas `Stale — recheck required`.

### FR-09 — Quotation (P0)

- Quotation menyimpan versioned snapshot room/rate, inclusions, policies, tax, service, discount, currency, dan expiry.
- Calculation dilakukan server-side dan hasil tersimpan immutable per version.
- Revisi membuat version baru; quotation lama berstatus Superseded.

**Acceptance criteria**

- Given discount di atas user limit, when submit, then quotation menjadi Pending Approval dan tidak dapat dikirim sebagai approved offer.
- Given rate PMS berubah, when quotation lama dibuka, then nilai snapshot tetap sama dan sistem menawarkan recheck/revise.

### FR-10 — Reservation handoff (P0)

- Request memuat lead, guest, stay, room/rate, quotation, special request, dan owner.
- Reservation/front office dapat confirm, reject, request info, atau offer alternative.
- Confirmed state memerlukan PMS reference atau authorized manual reference.

**Acceptance criteria**

- Given request tidak memiliki mandatory data, when sales submit, then sistem menunjukkan field yang belum lengkap.
- Given front office memberi alternatif, when sales membuka lead, then alternative dan next action terlihat tanpa membaca log teknis.

### FR-11 — Guest 360 (P0)

- Menampilkan identity, conversations, leads, quotation, reservation references, activity, dan basic preference.
- PII ditampilkan atau dimask sesuai role.
- Contact merge mempertahankan history dan external mappings.

### FR-12 — Audit, notification, dan reporting (P0)

- Audit minimal mencakup login/security event, user/role change, integration config, merge, assignment, stage, quotation, approval, hold, dan reservation status.
- Notification memiliki in-app delivery; channel tambahan dapat menjadi P1.
- Reporting membedakan source, channel, property, owner, stage, dan time period.

---

## 15. UX/UI Requirements

### 15.1 Arah desain

- **Design direction:** Luxury Operational CRM — professional, calm, premium, dan data-rich.
- **Typography:** Plus Jakarta Sans untuk heading, Inter untuk dense UI, JetBrains Mono untuk ID, amount, dan sync timestamp.
- **Primary accent:** `#0070F3`; contextual accent `#00D4FF`.
- **Theme:** dark-first dengan light-mode toggle yang setara kualitasnya.
- **Differentiator:** Live Stay Strip yang menunjukkan Inquiry → Availability → Quotation → Deposit → Booking.

### 15.2 Usability rules

1. Current property selalu terlihat.
2. Primary action mengikuti state lead.
3. Destructive/financial action membutuhkan confirmation dan permission.
4. Tidak boleh ada nested modal; gunakan page, drawer, atau single modal.
5. Loading menggunakan contextual skeleton.
6. Setiap list/table memiliki empty, error, loading, filtered-empty, dan permission-denied state.
7. Status menggunakan kombinasi text, icon, dan semantic color.
8. Data availability/rate selalu menampilkan source serta checked-at time.
9. Desktop dioptimalkan untuk workflow penuh; mobile/tablet untuk quick actions.
10. Target WCAG 2.1 AA untuk contrast, keyboard navigation, focus, label, dan error messaging.

### 15.3 Key screens MVP

1. Login/invitation/password recovery.
2. My Day.
3. Lead list dan Pipeline board.
4. Lead Sales Cockpit.
5. Availability Search.
6. Quotation Builder dan Preview.
7. Reservation/Front Office Queue.
8. Guest 360.
9. Sales Manager Dashboard.
10. User, Team, Role, dan Property Management.
11. Chatwoot Integration Setup dan Health.
12. Audit Log.

---

## 16. Core Data Model

### 16.1 Organizational entities

- Organization
- Property
- Department/Team
- User
- Role
- Permission
- UserPropertyRole
- IntegrationConnection
- ExternalIdentityMapping

### 16.2 CRM entities

- Contact/Guest
- CorporateAccount (foundation)
- ConversationReference
- Lead/Opportunity
- LeadStageHistory
- Activity
- Task
- Note
- Consent
- Source/Campaign

### 16.3 Commercial entities

- StayRequest
- AvailabilitySearch
- AvailabilitySnapshot
- RoomTypeReference
- RatePlanReference
- Quotation
- QuotationVersion
- QuotationItem
- ApprovalRequest
- ReservationRequest
- ReservationReference
- DepositStatusReference

### 16.4 Integration entities

- WebhookEvent
- SyncJob
- SyncAttempt
- MappingRule
- DeadLetterEvent
- IntegrationAudit

Semua external entity menyimpan provider, external ID, connection ID, last synced at, dan sync version bila tersedia.

---

## 17. Non-Functional Requirements

### 17.1 Reliability

- Business operation idempotent untuk webhook dan outbound sync.
- Target 99% eligible Chatwoot events diproses dalam 60 detik pada kondisi normal.
- Integration failure tidak boleh menghapus data bisnis yang sudah valid.
- Retry, dead-letter queue, dan reconciliation job tersedia.

### 17.2 Performance

- P95 halaman CRM utama tampil interaktif di bawah 3 detik pada koneksi kantor normal, di luar dependency eksternal.
- P95 local search/filter response di bawah 1 detik untuk volume pilot yang disepakati.
- Availability timeout dan cache policy configurable per connector.

### 17.3 Security dan privacy

- TLS untuk data in transit dan encryption at rest untuk sensitive secrets/data.
- Secret disimpan di secret manager atau encrypted storage.
- Authorization dilakukan server-side.
- Session revocation pada suspend/deactivate.
- Rate limiting, login protection, dan security logging.
- PII masking dan export permission.
- Backup, restore test, retention, dan deletion workflow harus didokumentasikan sebelum production.

### 17.4 Observability

- Structured logs menggunakan correlation ID, tenant, connector, dan event/job ID tanpa membocorkan secret.
- Metrics: webhook volume, processing latency, failures, retries, stale mappings, PMS latency, quotation/send failure.
- Alert severity: info, warning, action required, critical.

### 17.5 Scalability dan extensibility

- Connector menggunakan adapter contract agar PMS/CRS berikutnya tidak mengubah core CRM.
- Pipeline, stage, role, currency, locale, tax, dan timezone tidak di-hardcode.
- Feature flag tersedia untuk rilis bertahap per tenant/property.

---

## 18. Analytics dan Instrumentation

### 18.1 Product events minimum

- `chatwoot_connection_tested`
- `webhook_received`
- `webhook_processed`
- `webhook_failed`
- `lead_created`
- `conversation_linked`
- `lead_assigned`
- `stage_changed`
- `follow_up_created/completed/overdue`
- `availability_searched/succeeded/failed`
- `quotation_created/submitted/approved/sent/accepted/expired`
- `reservation_requested/alternative/confirmed/rejected`
- `contact_merge_reviewed/completed`
- `user_invited/activated/suspended`

### 18.2 Business metrics

- First response time dan SLA compliance.
- Inquiry-to-qualified conversion.
- Qualified-to-quotation conversion.
- Quotation-to-confirmed conversion.
- Lead velocity dan time in stage.
- Revenue opportunity dan room nights.
- Conversion per property, channel, source, segment, dan sales.
- Follow-up overdue rate.
- Lost reason distribution.
- Discount approval rate dan average discount.
- Integration error/recovery rate.

---

## 19. Rollout Plan

### Phase 0 — Discovery dan Definition

- Interview sales, manager, reservation/front office, admin, dan management.
- Pilih pilot property, Chatwoot deployment, serta PMS/CRS pertama.
- Dokumentasikan current process, baseline metrics, data mapping, dan access policy.
- Finalisasi wireframe, prototype, API feasibility, dan security review.

### Phase 1 — Foundation

- Organization/property/user/RBAC.
- CRM core, pipeline, tasks, audit.
- Chatwoot connection, mapping, webhook ingestion, identity, dan lead creation.
- Pilot menggunakan sandbox/staging Chatwoot.

### Phase 2 — Commercial Workflow

- PMS/CRS adapter pertama.
- Availability, quotation, approval, front-office queue, dan reservation reference.
- End-to-end UAT menggunakan skenario hotel nyata.

### Phase 3 — Controlled Pilot

- Satu property, sejumlah kecil sales/FO users, dan selected inbox.
- Parallel monitoring dan daily reconciliation pada periode awal.
- Ukur baseline vs outcome; perbaiki mapping, UX, dan SLA.

### Phase 4 — Scale dan Fast Follows

- Property tambahan.
- After-sales, payment/deposit, custom roles, SSO, dan connector berikutnya.

Tidak ada estimasi tanggal final sebelum Chatwoot deployment, PMS/CRS vendor, API access, channel scope, dan pilot property dikonfirmasi.

---

## 20. Dependencies

1. Chatwoot base URL/deployment model, API access token, account/inbox structure, dan webhook reachability.
2. PMS/CRS vendor, API documentation, sandbox, credentials, rate limit, dan certification process.
3. Hotel organization/property structure dan user access policy.
4. Rate, tax, service charge, discount, cancellation, hold, dan reservation policy.
5. WhatsApp/template requirements yang dikelola melalui Chatwoot/channel provider.
6. Infrastructure untuk queue, secret management, observability, backup, dan notification delivery.

---

## 21. Risks dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Chatwoot webhook duplicate/out-of-order | Lead/activity ganda atau status mundur | Idempotency, event version/timestamp, reconciliation |
| Contact duplicate antar-channel | Guest 360 terpecah | Normalization, candidate matching, manual merge audit |
| PMS tidak menyediakan API memadai | Availability tidak real-time | Adapter assessment, manual confirmation fallback, explicit freshness state |
| Mapping inbox/property salah | Data dan assignment salah | Mapping test, review queue, no-random-default rule |
| User memiliki scope berlebihan | Privacy/security incident | Server-side RBAC, least privilege, audit, periodic access review |
| Sales menganggap cache sebagai live | Overbooking/misinformation | Source + timestamp, stale badge, forced recheck before hold |
| Stage dan label tidak konsisten | Reporting tidak akurat | CRM as stage source, controlled taxonomy, validation |
| Scope melebar ke PMS/accounting | MVP terlambat | Enforce non-goals dan phased roadmap |

---

## 22. Open Questions

### Blocking sebelum technical design final

1. **[Stakeholder]** Chatwoot menggunakan cloud atau self-hosted? Versi dan base URL?
2. **[Stakeholder]** Satu organization menggunakan satu atau beberapa Chatwoot account?
3. **[Stakeholder]** Inbox mana yang dianggap sales inbox dan bagaimana mapping-nya ke property?
4. **[Stakeholder/Engineering]** PMS/CRS pertama apa, dan apakah tersedia sandbox serta write API untuk hold/reservation?
5. **[Finance/Management]** Bagaimana tax, service charge, currency, rounding, discount authority, dan quotation validity ditentukan?
6. **[Operations]** Siapa yang memiliki otoritas final terhadap hold dan confirmed booking?
7. **[Security/Management]** Apakah hotel memerlukan SSO/MFA pada pilot atau dapat menggunakan local authentication?
8. **[Legal/Security]** Kebijakan retensi conversation metadata, guest PII, consent, dan data export?

### Non-blocking untuk MVP awal

1. **[Product]** Apakah after-sales dimulai dari pre-arrival upsell atau post-stay survey?
2. **[Product]** Apakah manager membutuhkan custom pipeline pada pilot?
3. **[Design]** Apakah sales lebih sering bekerja dari desktop, tablet, atau Chatwoot mobile?
4. **[Data]** Revenue metric menggunakan quotation gross, net, atau confirmed PMS revenue?
5. **[Operations]** Apakah satu conversation dapat memuat beberapa stay request aktif?

---

## 23. Definition of Done MVP

MVP dinyatakan siap pilot apabila:

- [ ] Organization, property, user, role, dan scope telah melalui security test.
- [ ] Chatwoot connection dan mapping berhasil pada staging/pilot account.
- [ ] Inquiry eligible dapat membuat atau menautkan lead tanpa duplikasi.
- [ ] Sales dapat melakukan qualification, availability search, quotation, dan reservation request end-to-end.
- [ ] Front office dapat merespons request dan status kembali terlihat oleh sales.
- [ ] Quotation calculation, versioning, expiry, dan approval lulus test.
- [ ] PMS unavailable, stale data, duplicate event, unmapped agent/inbox, dan retry scenario lulus test.
- [ ] Audit event penting dapat ditelusuri.
- [ ] Dashboard dan analytics event tervalidasi terhadap sample data.
- [ ] Accessibility, responsive layout, empty/loading/error state, dan permission-denied state lulus QA.
- [ ] Backup/restore, monitoring, incident owner, dan rollback plan tersedia.
- [ ] Pilot users menyelesaikan usability test untuk lima core workflows.

---

## 24. Product Decision Log Awal

| Keputusan | Alasan |
|---|---|
| Chatwoot bukan CRM source of truth | Conversation status berbeda dengan sales pipeline |
| PMS/CRS tetap menguasai availability dan reservation | Mencegah inventory ganda dan overbooking |
| Contact, conversation, dan lead adalah entitas berbeda | Satu tamu dapat memiliki banyak conversation dan opportunity |
| MVP fokus direct room sales/FIT | Memberi jalur tercepat untuk membuktikan nilai produk |
| Predefined roles P0; custom roles P1 | Memastikan keamanan tanpa memperbesar scope awal |
| Manual confirmation fallback didukung | Produk tetap dapat dipilotkan saat PMS write API terbatas |
| Full transcript tidak diduplikasi secara default | Mengurangi privacy, storage, dan synchronization risk |

