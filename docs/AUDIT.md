# Audit integrasi Chatwoot · Chatwoot Integration Audit

5 September 2026 · `hotel-sales-hub` → `omni.arkanova.co.id`
13 cacat · 5 hal masih terbuka · commit terakhir `e26f7fe`

Versi ringkas dua bahasa. Uraian per temuan ada di dokumen audit terbitan.

---

## Bahasa Indonesia

Tiga belas cacat ditemukan saat menyambungkan CRM ke Chatwoot sungguhan. Sebelas
di antaranya tidak pernah muncul di lingkungan demo, dan itulah temuan yang
sebenarnya: bukan tiga belas kesalahan terpisah, melainkan **lima kebiasaan
kerja** yang menghasilkannya berulang kali.

### Daftar temuan

| ID | Temuan | Tingkat | Status | Commit |
|---|---|---|---|---|
| D-01 | Autentikasi webhook gagal-terbuka | Kritis | Hidup | `1367f39` |
| D-02 | Tamu tidak ditemukan pada payload datar | Kritis | Menunggu deploy | `e26f7fe` |
| D-03 | Id inbox hanya dibaca dari dua bentuk | Tinggi | Menunggu deploy | `045f4b7` |
| D-04 | Hotel tidak bisa mendefinisikan kamarnya | Tinggi | Menunggu deploy | `c137d03` |
| D-05 | Layanan pasca-inap tanpa pemicu dan tanpa layar | Tinggi | Menunggu deploy | `6b5fc7b` |
| D-06 | Tautan Chatwoot dibekukan saat event masuk | Sedang | Menunggu deploy | `59b57ec` |
| D-07 | Penugasan agen tidak pernah sampai | Sedang | Menunggu deploy | `e26f7fe` |
| D-08 | Pesan dead letter menyatukan dua sebab berbeda | Sedang | Menunggu deploy | `e26f7fe` |
| D-09 | Tenant demo terkirim ke produksi | Sedang | Hidup | `b7b26fa` |
| D-10 | Pembaruan kontak memakai POST, bukan PUT | Sedang | Hidup | `61f4fe7` |
| D-11 | Id akun hanya dibaca dari satu bentuk | Rendah | Menunggu deploy | `e26f7fe` |
| D-12 | Cookie properti tanpa penanda `secure` | Rendah | Hidup | `61f4fe7` |
| D-13 | URL webhook jatuh ke localhost bila env kosong | Rendah | Hidup | `61f4fe7` |

### Lima kebiasaan yang menghasilkannya

**A. Payload uji ditulis sendiri.** Payload buatan sendiri selalu berbentuk
seperti yang dibayangkan penulisnya, jadi ia hanya membuktikan kode sesuai
dugaan penulisnya. D-02, D-03, D-07, dan D-11 lolos karena ini.

**B. Verifikasi terhadap tenant demo.** Demo selalu setuju dengan asumsi yang
membuatnya. D-04 dan D-09 hanya terlihat setelah aplikasi menghadapi hotel
sungguhan yang belum punya PMS.

**C. Pemeriksaan yang dilewati bila prasyaratnya hilang.** D-01 memakai
`if (expected)`. Ketika secret tidak bisa didekripsi, seluruh pemeriksaan
dilewati dan endpoint menerima siapa pun.

**D. Nilai turunan dibekukan ke basis data.** D-06 menyimpan host koneksi ke
setiap baris percakapan. Mengganti Base URL tidak menyentuh tautan lama.

**E. Fitur ditulis tanpa pemanggil.** D-05 punya layanan lengkap beserta tesnya,
tetapi tidak ada layar dan tidak ada yang menjalankannya.

### Dua bentuk payload Chatwoot

| Bagian | Bentuk bersarang | Bentuk datar |
|---|---|---|
| Akun | `account.id` | `account_id` |
| Inbox | `inbox.id` | `inbox_id` |
| Kanal | `inbox.channel_type` | `channel` |
| Percakapan | `conversation.id` | `id` |
| Tamu | `sender` / `contact` | `meta.sender` |
| Agen | `conversation.meta.assignee` | `meta.assignee` |

Konektor semula hanya membaca kolom tengah. Akibat terparah: **setiap
`conversation_created` dari Chatwoot sungguhan tidak pernah menjadi prospek.**
Chat WhatsApp masuk, tidak ada yang muncul di CRM, tidak ada pesan kesalahan.

### Masih terbuka

| ID | Temuan |
|---|---|
| A-01 | Enam fungsi yang diekspor tidak pernah dipanggil: `stageStatus`, `nextAction`, `leadStageOptions`, `templateForProperty`, `quotationForHandoff`, `pendingSyncCount` |
| A-02 | Komentar `nextAction` mengklaim ia menggerakkan tombol utama kokpit prospek, padahal tidak ada yang memanggilnya |
| A-03 | Empat fungsi diekspor padahal hanya dipakai di dalam berkasnya: `enqueueChatwootSync`, `committedRooms`, `resolveStage`, `activeOrgAdmins` |
| A-04 | Bahasa antarmuka masih campur |
| A-05 | Delapan dari tiga belas perbaikan belum ter-deploy |

### Aturan agar tidak berulang

1. Uji integrasi dengan payload yang disalin, bukan yang dikarang.
2. Pemeriksaan keamanan gagal-tertutup. Kredensial hilang adalah penolakan.
3. Turunkan dari konfigurasi saat dibaca. Simpan hanya potret sejarah yang memang perlu.
4. Tidak ada fungsi yang diekspor tanpa pemanggil.
5. Data demo harus mustahil disangka produksi.
6. Pesan kesalahan membedakan sebab yang penanganannya berbeda.
7. Periksa sistem hidup dari luar. Klaim antarmuka bukan bukti.

---

## English

Thirteen defects surfaced while connecting the CRM to a real Chatwoot instance.
Eleven never appeared in the demo environment, and that is the actual finding:
not thirteen separate mistakes, but **five working habits** that kept producing
them.

### Finding register

| ID | Finding | Severity | Status | Commit |
|---|---|---|---|---|
| D-01 | Webhook authentication failed open | Critical | Live | `1367f39` |
| D-02 | Guest never found in flat payloads | Critical | Awaiting deploy | `e26f7fe` |
| D-03 | Inbox id read from only two shapes | High | Awaiting deploy | `045f4b7` |
| D-04 | Hotel could not define its own rooms | High | Awaiting deploy | `c137d03` |
| D-05 | After-sales service had no trigger and no screen | High | Awaiting deploy | `6b5fc7b` |
| D-06 | Chatwoot deep links frozen at ingest | Medium | Awaiting deploy | `59b57ec` |
| D-07 | Agent assignment never arrived | Medium | Awaiting deploy | `e26f7fe` |
| D-08 | Dead-letter messages conflated two causes | Medium | Awaiting deploy | `e26f7fe` |
| D-09 | Demo tenant shipped to production | Medium | Live | `b7b26fa` |
| D-10 | Contact update sent POST instead of PUT | Medium | Live | `61f4fe7` |
| D-11 | Account id read from one shape only | Low | Awaiting deploy | `e26f7fe` |
| D-12 | Property cookie missing the `secure` flag | Low | Live | `61f4fe7` |
| D-13 | Webhook URL fell back to localhost when env was unset | Low | Live | `61f4fe7` |

### The five habits behind them

**A. Test payloads written by the same hand as the code.** A self-written
payload is always shaped the way its author imagined, so it only proves the code
matches that imagination. D-02, D-03, D-07 and D-11 slipped through on this.

**B. Verified against the demo tenant.** A demo always agrees with the
assumptions that built it. D-04 and D-09 only became visible once the app met a
real hotel with no PMS.

**C. Checks that skip when their precondition is missing.** D-01 used
`if (expected)`. When the secret could not be decrypted, the whole check was
skipped and the endpoint accepted anyone.

**D. Derived values frozen into storage.** D-06 wrote the connection host into
every conversation row. Changing the base URL touched none of the old links.

**E. Features written without a caller.** D-05 had a complete service and its own
tests, but no screen and nothing to run it.

### The two Chatwoot payload shapes

| Part | Nested shape | Flat shape |
|---|---|---|
| Account | `account.id` | `account_id` |
| Inbox | `inbox.id` | `inbox_id` |
| Channel | `inbox.channel_type` | `channel` |
| Conversation | `conversation.id` | `id` |
| Guest | `sender` / `contact` | `meta.sender` |
| Agent | `conversation.meta.assignee` | `meta.assignee` |

The connector read only the middle column. The costliest consequence: **every
`conversation_created` from a real Chatwoot never became a lead.** A WhatsApp
message arrives, nothing appears in the CRM, and no error is raised.

### Still open

| ID | Finding |
|---|---|
| A-01 | Six exported functions are never called: `stageStatus`, `nextAction`, `leadStageOptions`, `templateForProperty`, `quotationForHandoff`, `pendingSyncCount` |
| A-02 | `nextAction`'s own comment claims it powers the lead cockpit's primary button, yet nothing calls it |
| A-03 | Four functions exported but used only inside their own file: `enqueueChatwootSync`, `committedRooms`, `resolveStage`, `activeOrgAdmins` |
| A-04 | Interface language is mixed |
| A-05 | Eight of the thirteen fixes are not yet deployed |

### Rules to stop the repeat

1. Test integrations against captured payloads, not invented ones.
2. Security checks fail closed. A missing credential is a refusal.
3. Derive from configuration at read time. Store only genuine snapshots.
4. No exported function without a caller.
5. Demo data must be impossible to mistake for production.
6. Error messages separate causes that need different actions.
7. Probe the live system from outside. An interface's claim is not evidence.

---

## Verifikasi · Verification

| | |
|---|---|
| `npm run test:ingest` | 37 / 37 · bentuk payload asli · real payload shapes |
| `npm run e2e` | 23 / 23 · chat masuk sampai ajakan kembali · inbound chat to win-back |
| Webhook tanpa token · no token | `401` (sebelumnya · previously `202`) |
