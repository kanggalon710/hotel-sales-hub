# Audit integrasi Chatwoot · Chatwoot Integration Audit

5 September 2026 · `hotel-sales-hub` → `omni.arkanova.co.id`
13 temuan · 5 belum ditangani · commit terakhir `e26f7fe`

Ringkasan dua bahasa. Uraian tiap temuan tersedia pada dokumen audit terbitan.

---

## Bahasa Indonesia

Tiga belas cacat ditemukan ketika CRM disambungkan ke Chatwoot yang sesungguhnya.
Sebelas di antaranya tidak pernah tampak di lingkungan demo, dan justru di
situlah temuan yang sebenarnya: persoalannya bukan tiga belas kekeliruan yang
berdiri sendiri, melainkan **lima kebiasaan kerja** yang terus-menerus
melahirkannya.

### Istilah yang dipakai berulang

| Istilah | Arti |
|---|---|
| gagal terbuka | Pemeriksaan keamanan yang justru meloloskan permintaan ketika prasyaratnya tidak terpenuhi (*fail-open*) |
| gagal tertutup | Kebalikannya: prasyarat yang tidak terpenuhi berarti penolakan (*fail-closed*) |
| payload | Badan data yang dikirim Chatwoot pada setiap panggilan webhook |
| antrean gagal | Penampungan peristiwa yang tidak dapat diproses dan menunggu penanganan manusia (*dead letter*) |
| prospek | Calon pemesan yang lahir dari sebuah percakapan (*lead*) |

### Daftar temuan

| ID | Temuan | Keparahan | Status | Commit |
|---|---|---|---|---|
| D-01 | Pemeriksaan webhook gagal dalam keadaan terbuka | Kritis | Sudah diterapkan | `1367f39` |
| D-02 | Data tamu tidak ditemukan pada payload bentuk datar | Kritis | Belum diterapkan | `e26f7fe` |
| D-03 | ID inbox hanya dibaca dari dua bentuk payload | Tinggi | Belum diterapkan | `045f4b7` |
| D-04 | Hotel tidak dapat mendefinisikan kamarnya sendiri | Tinggi | Belum diterapkan | `c137d03` |
| D-05 | Layanan pascainap tidak memiliki pemicu maupun tampilan | Tinggi | Belum diterapkan | `6b5fc7b` |
| D-06 | Pranala ke Chatwoot dibekukan saat peristiwa diterima | Sedang | Belum diterapkan | `59b57ec` |
| D-07 | Penugasan agen tidak pernah sampai ke CRM | Sedang | Belum diterapkan | `e26f7fe` |
| D-08 | Pesan antrean gagal menyamakan dua sebab yang berbeda | Sedang | Belum diterapkan | `e26f7fe` |
| D-09 | Data peragaan ikut terpasang di lingkungan produksi | Sedang | Sudah diterapkan | `b7b26fa` |
| D-10 | Pembaruan kontak dikirim dengan POST, seharusnya PUT | Sedang | Sudah diterapkan | `61f4fe7` |
| D-11 | ID akun hanya dibaca dari satu bentuk payload | Rendah | Belum diterapkan | `e26f7fe` |
| D-12 | Kuki properti tidak bertanda `secure` | Rendah | Sudah diterapkan | `61f4fe7` |
| D-13 | Alamat webhook jatuh ke localhost bila variabel lingkungan kosong | Rendah | Sudah diterapkan | `61f4fe7` |

### Lima kebiasaan yang melahirkannya

Menambal tiga belas cacat satu per satu tidak akan mencegah munculnya yang
keempat belas. Berikut polanya, dan inilah bagian yang sesungguhnya perlu
diubah.

**A. Payload pengujian disusun oleh penulis kodenya sendiri.** Payload buatan
sendiri selalu berbentuk sebagaimana penulisnya membayangkan, sehingga ia hanya
membuktikan bahwa kode itu sesuai dengan dugaan penulisnya. D-02, D-03, D-07,
dan D-11 seluruhnya lolos karena sebab ini.

**B. Pemeriksaan dilakukan terhadap data peragaan, bukan data nyata.**
Lingkungan peragaan selalu membenarkan asumsi yang membentuknya. D-04 dan D-09
baru tampak setelah aplikasi berhadapan dengan hotel sungguhan yang belum
memiliki PMS.

**C. Pemeriksaan yang terlewat ketika prasyaratnya tidak ada.** D-01
menggunakan `if (expected)`. Ketika kunci rahasia gagal didekripsi, seluruh
pemeriksaan terlewat dan endpoint menerima permintaan dari siapa pun.

**D. Nilai turunan dibekukan ke dalam basis data.** D-06 menuliskan alamat host
koneksi ke setiap baris percakapan. Mengganti Base URL tidak menyentuh satu pun
pranala lama, dan tidak ada apa pun yang memberi peringatan.

**E. Fitur ditulis tanpa ada yang memanggilnya.** D-05 memiliki layanan yang
lengkap beserta pengujiannya, tetapi tidak memiliki tampilan dan tidak ada satu
pun bagian yang menjalankannya.

### Dua bentuk payload Chatwoot

| Bagian | Bentuk bersarang | Bentuk datar |
|---|---|---|
| Akun | `account.id` | `account_id` |
| Inbox | `inbox.id` | `inbox_id` |
| Kanal | `inbox.channel_type` | `channel` |
| Percakapan | `conversation.id` | `id` |
| Tamu | `sender` / `contact` | `meta.sender` |
| Agen | `conversation.meta.assignee` | `meta.assignee` |

Konektor semula hanya membaca kolom tengah. Akibat yang paling merugikan:
**setiap peristiwa `conversation_created` dari Chatwoot yang sesungguhnya tidak
pernah menjadi prospek.** Pesan WhatsApp masuk, tidak ada apa pun yang muncul di
CRM, dan tidak ada satu pun pesan kesalahan.

### Belum ditangani

| ID | Temuan |
|---|---|
| A-01 | Enam fungsi yang diekspor tidak pernah dipanggil dari mana pun: `stageStatus`, `nextAction`, `leadStageOptions`, `templateForProperty`, `quotationForHandoff`, `pendingSyncCount` |
| A-02 | Komentar pada `nextAction` menyatakan fungsi itu menggerakkan tombol utama kokpit prospek, padahal tidak ada yang memanggilnya |
| A-03 | Empat fungsi diekspor meskipun hanya dipakai di dalam berkasnya sendiri: `enqueueChatwootSync`, `committedRooms`, `resolveStage`, `activeOrgAdmins` |
| A-04 | Bahasa antarmuka masih bercampur: navigasi dan halaman baru berbahasa Indonesia, halaman lama berbahasa Inggris |
| A-05 | Delapan dari tiga belas perbaikan belum diterapkan ke lingkungan produksi |

### Aturan agar tidak berulang

1. **Uji integrasi dengan payload yang disalin, bukan yang dikarang.** Setiap
   kali kode mengambil nilai dari payload pihak lain, seluruh bentuk yang
   mungkin dikirim pihak itu harus ikut diuji.
2. **Pemeriksaan keamanan harus gagal dalam keadaan tertutup.** Kredensial yang
   hilang atau tidak terbaca berarti penolakan, bukan jalan pintas.
3. **Turunkan nilai dari konfigurasi pada saat dibaca.** Simpanlah hanya nilai
   yang memang harus menjadi potret sejarah, dan tuliskan alasannya.
4. **Tidak boleh ada fungsi yang diekspor tanpa pemanggil.** Layanan tanpa
   tampilan dan tanpa pemicu berarti belum selesai.
5. **Data peragaan harus mustahil dikira data produksi.** Nama perintahnya wajib
   menyatakan yang sebenarnya.
6. **Pesan kesalahan harus memisahkan sebab yang penanganannya berbeda.**
7. **Periksalah sistem yang hidup dari luar.** Pengakuan sebuah antarmuka
   tentang dirinya sendiri bukanlah bukti.

---

## English

Thirteen defects surfaced when the CRM was connected to a real Chatwoot
instance. Eleven of them had never appeared in the demo environment, and that is
where the real finding lies: the problem is not thirteen separate mistakes but
**five working habits** that kept producing them.

### Recurring terms

| Term | Meaning |
|---|---|
| fail open | A security check that lets a request through when its precondition is not met |
| fail closed | The opposite: an unmet precondition means refusal |
| payload | The body of data Chatwoot sends on each webhook call |
| dead letter | Where events that cannot be processed wait for a human to resolve them |
| lead | A prospective booking created from a conversation |

### Finding register

| ID | Finding | Severity | Status | Commit |
|---|---|---|---|---|
| D-01 | Webhook check failed open | Critical | Deployed | `1367f39` |
| D-02 | Guest never found in the flat payload shape | Critical | Not deployed | `e26f7fe` |
| D-03 | Inbox ID read from only two payload shapes | High | Not deployed | `045f4b7` |
| D-04 | A hotel could not define its own rooms | High | Not deployed | `c137d03` |
| D-05 | The after-stay service had neither a trigger nor a screen | High | Not deployed | `6b5fc7b` |
| D-06 | Chatwoot links frozen at the moment an event arrived | Medium | Not deployed | `59b57ec` |
| D-07 | Agent assignments never reached the CRM | Medium | Not deployed | `e26f7fe` |
| D-08 | Dead-letter messages conflated two different causes | Medium | Not deployed | `e26f7fe` |
| D-09 | Demo data shipped into the production environment | Medium | Deployed | `b7b26fa` |
| D-10 | Contact updates sent as POST where Chatwoot requires PUT | Medium | Deployed | `61f4fe7` |
| D-11 | Account ID read from one payload shape only | Low | Not deployed | `e26f7fe` |
| D-12 | Property cookie set without the `secure` flag | Low | Deployed | `61f4fe7` |
| D-13 | Webhook address fell back to localhost when the environment variable was unset | Low | Deployed | `61f4fe7` |

### The five habits behind them

Patching thirteen defects one at a time will not prevent the fourteenth. These
are the patterns, and this is the part that genuinely has to change.

**A. Test payloads written by the same hand as the code.** A self-written
payload always takes the shape its author imagined, so it proves only that the
code matches that imagination. D-02, D-03, D-07 and D-11 all slipped through for
this reason.

**B. Verified against demo data rather than real data.** A demo environment
always agrees with the assumptions that built it. D-04 and D-09 became visible
only once the application met a real hotel that had no PMS yet.

**C. Checks that are skipped when their precondition is absent.** D-01 used
`if (expected)`. When the secret failed to decrypt, the entire check was skipped
and the endpoint accepted requests from anyone.

**D. Derived values frozen into the database.** D-06 wrote the connection host
into every conversation row. Changing the base URL touched none of the old
links, and nothing raised a warning.

**E. Features written with nothing to call them.** D-05 had a complete service
and its own tests, but no screen and nothing to run it.

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
`conversation_created` event from a real Chatwoot instance failed to become a
lead.** A WhatsApp message arrives, nothing appears in the CRM, and no error is
raised.

### Still outstanding

| ID | Finding |
|---|---|
| A-01 | Six exported functions are never called from anywhere: `stageStatus`, `nextAction`, `leadStageOptions`, `templateForProperty`, `quotationForHandoff`, `pendingSyncCount` |
| A-02 | The comment on `nextAction` states that it drives the lead cockpit's primary button, yet nothing calls it |
| A-03 | Four functions are exported although they are used only inside their own file: `enqueueChatwootSync`, `committedRooms`, `resolveStage`, `activeOrgAdmins` |
| A-04 | The interface language is still mixed: navigation and new pages in Indonesian, older pages in English |
| A-05 | Eight of the thirteen fixes have not been deployed to production |

### Rules to stop the repeat

1. **Test integrations against captured payloads, never invented ones.**
   Wherever code reads a value out of another party's payload, every shape that
   party can send has to be exercised.
2. **Security checks must fail closed.** A credential that is missing or
   unreadable means refusal, not a shortcut.
3. **Derive values from configuration at read time.** Store only what genuinely
   has to be a historical snapshot, and write down why.
4. **No function may be exported without a caller.** A service with no screen
   and no trigger is unfinished.
5. **Demo data must be impossible to mistake for production data.** The command
   names have to say which is which.
6. **Error messages must separate causes that call for different actions.**
7. **Probe the running system from outside.** An interface's claim about itself
   is not evidence.

---

## Bukti pemeriksaan · Verification evidence

| | |
|---|---|
| `npm run test:ingest` | 37 / 37 · bentuk payload sesungguhnya · real payload shapes |
| `npm run e2e` | 23 / 23 · pesan masuk hingga ajakan kembali · inbound message to win-back |
| Webhook tanpa token · without a token | `401` (sebelumnya · previously `202`) |

Kedua rangkaian pengujian tidak berhenti pada langkah yang gagal, supaya satu
jalan buntu tidak menyembunyikan jalan buntu berikutnya.

Neither suite stops at the first failing step, so one dead end cannot hide the
next.
