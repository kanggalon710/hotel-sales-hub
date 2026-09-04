# Inventaris kamar dan siklus setelah menginap

Dokumen ini menjelaskan dua lubang struktural yang ditemukan lewat penelusuran
alur nyata, dan bentuk perbaikannya.

## Masalah 1: aplikasi tidak bisa hidup tanpa PMS

PRD menetapkan PMS/CRS sebagai pemilik inventaris, dan kode mengikutinya secara
harfiah. Tabelnya bernama `room_type_references` dan `rate_plan_references`:
keduanya cermin, bukan inventaris. Isinya hanya memberi nama pada penawaran yang
dikembalikan adapter, tanpa jumlah kamar dan tanpa tarif.

Akibatnya berantai:

| Gejala | Sebab |
|---|---|
| Tidak ada layar untuk menambah kamar | Tabelnya memang bukan milik CRM, jadi tak pernah dibuatkan UI |
| Sebuah properti terasa "hanya nama" | Properti tidak punya struktur hotel: tak ada kamar, tarif, atau kapasitas |
| Cek ketersediaan selalu buntu | `searchAvailability` langsung mengembalikan "No PMS/CRS connector is configured" dan menyuruh menelepon front office |

Sebuah hotel harus bisa berjualan sebelum PMS-nya ada. Data yang terlihat dummy
sebenarnya gejala dari ini, bukan penyebabnya.

### Bentuk perbaikan: kepemilikan inventaris yang eksplisit

`properties.inventorySource` menentukan siapa yang berwenang, per properti:

| Modus | Arti |
|---|---|
| `crm` (bawaan) | Hotel mendefinisikan tipe kamar dan paket tarifnya di aplikasi ini. Ketersediaan dihitung CRM. |
| `pms` | PMS yang berwenang. Tipe kamar dan paket tarif menjadi cermin baca-saja, ketersediaan dari adapter. |

Baris membawa asal-usulnya sendiri di `source` (`crm` atau `pms`). Baris hasil
sinkronisasi ditolak untuk disunting, karena suntingan lokal akan tertimpa diam
diam pada sinkronisasi berikutnya.

Kolom yang membuat inventaris menjadi nyata:

- `room_type_references.total_rooms` — alotmen kamar fisik
- `rate_plan_references.base_rate_per_night` — tarif dasar per malam
- `rate_plan_references.room_type_surcharges` — selisih per tipe kamar, sehingga
  satu paket melayani semua tipe tanpa menggandakan barisnya

### Ketersediaan tanpa PMS

```
sisa kamar = total_rooms − Σ kamar pada reservasi yang menumpuk
```

Yang dihitung hanya reservasi berstatus `on_hold` dan `confirmed`. `draft` dan
`submitted` belum memakan kamar karena belum ada komitmen ke tamu. Dua rentang
inap dianggap menumpuk bila `checkIn < checkOut_lain` dan `checkOut > checkIn_lain`.

Batasan yang ikut dinilai: minimal inap paket, dan kapasitas dewasa/anak per
tipe kamar. Baris yang gagal salah satunya tetap ditampilkan dengan alasannya,
bukan disembunyikan, supaya penjual tahu apa yang menghalangi.

### Pengaman

- Alotmen tidak boleh turun di bawah jumlah kamar yang sudah terikat reservasi
  berjalan, karena ketersediaan akan berbohong. Pesannya menyebut angkanya.
- Tipe kamar atau paket tarif yang pernah dipakai penawaran atau reservasi tidak
  bisa dihapus, hanya dinonaktifkan, supaya riwayat tidak putus acuannya.
- Kode unik per properti, dan hanya huruf, angka, serta tanda hubung, karena
  kode ikut dipakai pada penawaran dan pemetaan PMS.

## Masalah 2: siklus hidup berhenti saat pemesanan

Pipeline berakhir di `confirmed`. Sesudah itu tidak terjadi apa-apa. `stayCount`
dan `lastStayDate` pada kontak ada di skema dan ditampilkan di layar, tetapi
tidak pernah ditulis, sehingga tamu yang sudah lima kali menginap tetap terlihat
seperti orang asing.

### Bentuk perbaikan: sapuan pasca-inap

`runAfterSalesSweep` mengambil reservasi terkonfirmasi yang tanggal check-out-nya
sudah lewat, lalu:

1. menaikkan `stayCount` dan memajukan `lastStayDate` pada kontak,
2. membuat tugas **pasca-inap**: ucapan terima kasih dan permintaan ulasan,
3. membuat tugas **ajak kembali** yang jatuh tempo beberapa bulan kemudian.

Yang dipakai adalah tugas, bukan tahap pipeline tambahan, karena prospeknya
memang sudah selesai. Yang berlanjut adalah hubungan dengan tamunya, dan tugas
sudah punya tempat di layar "Hari Saya" tempat staf bekerja setiap hari.

Sapuan aman dijalankan berulang: reservasi yang sudah diproses ditandai
`stay_completed_at`, dan hanya yang belum bertanda yang diambil.

Jaraknya diatur per organisasi:

| Setelan | Bawaan | Arti |
|---|---|---|
| `post_stay_follow_up_days` | 1 | Jeda ucapan terima kasih setelah check-out |
| `win_back_after_days` | 150 | Jeda ajakan menginap lagi |

`winBackCandidates` menyusun daftar tamu yang layak didekati: pernah menginap,
jeda sejak inap terakhir sudah lewat, diurutkan dari yang paling sering
menginap. Tamu yang mencabut persetujuan (`consent_status = 'withdrawn'`) tidak
pernah masuk daftar.

## Menjalankan tesnya

`npm run e2e` menelusuri satu siklus penuh lewat jalur kode produksi:

```
1. Hotel mendefinisikan kamar dan tarifnya sendiri (tanpa PMS)
2. Koneksi Chatwoot dan pemetaan inbox
3. Pesan WhatsApp masuk dari Chatwoot menjadi prospek
4. Menaikkan prospek tahap demi tahap, dengan gerbangnya
5. Penawaran dibuat, dikirim, dan diterima tamu
6. Reservasi diajukan ke front office dan dikonfirmasi
7. Alotmen berkurang setelah reservasi terkonfirmasi
8. Riwayat inap, ucapan terima kasih, dan ajakan kembali
```

Tes tidak berhenti pada langkah yang gagal, supaya satu jalan buntu tidak
menyembunyikan jalan buntu berikutnya.

Modul di `src/` bisa dijalankan Node biasa lewat `scripts/alias-loader.mjs`,
yang menyelesaikan alias `@/` dan impor tanpa ekstensi sebagaimana dilakukan
bundler. Tanpa itu, lapisan layanan hanya bisa diuji lewat server.

## Tata letak dan navigasi

### Navigasi mengikuti perjalanan tamu

Kelompok menu sebelumnya menamai dirinya "Relationships" lalu mengisinya dengan
Tamu dan Laporan, dua hal yang tidak berhubungan. Lebih penting lagi, perjalanan
itu berhenti di penjualan, seolah tamu lenyap begitu memesan.

| Kelompok | Isi | Pertanyaan yang dijawab |
|---|---|---|
| Kerja harian | Hari Saya, Prospek, Pipeline | Apa yang harus saya kerjakan sekarang? |
| Penjualan | Ketersediaan, Penawaran, Persetujuan, Reservasi | Bagaimana saya menjualnya? |
| Tamu | Tamu, Pasca-Inap | Bagaimana hubungan dengan tamunya? |
| Analisis | Laporan | Bagaimana hasilnya? |
| Administrasi | Integrasi, Pengaturan, Log Audit | Bagaimana sistemnya diatur? |

### Layar Pasca-Inap

Sapuan dijalankan saat halaman dibuka, mengikuti pola `expireStaleQuotations`
pada halaman Penawaran. Karena idempoten, membuka halaman dua kali tidak
menggandakan tugas. Sebelum ini `runAfterSalesSweep` tidak pernah dipanggil
siapa pun: mesinnya ada, pemicunya tidak.

Halaman menjawab tiga pertanyaan berbeda, dan susunannya mengikuti urutan itu:

1. **Ringkasan** — berapa inap selesai, berapa tamu berulang, berapa yang menunggu.
2. **Baru selesai menginap** — siapa yang belum diucapkan terima kasih.
3. **Waktunya diajak kembali** — siapa yang jedanya sudah lewat, yang paling sering menginap didahulukan.

### Cacat tata letak yang ditemukan lewat peninjauan visual

| Cacat | Sebab | Perbaikan |
|---|---|---|
| Subjudul kartu pecah jadi menara dua kata di telepon | `CardHeader` menyusun judul dan tombol sebaris di semua lebar; tombol berlabel panjang menyisakan kolom sempit | Aksi turun ke bawah judul di bawah 640px, tetap sebaris di atasnya |
| Header kolom "Sudah menginap" terpotong | 18% dari 720px tidak cukup untuk teks header, padahal isinya hanya "5x" | Header dipendekkan jadi "Menginap", lebar kolom disusun ulang |
| Properti bermodus CRM menampilkan seluruh kamarnya terkunci PMS | Seed menandai semua baris `source: 'pms'` sementara properti bawaannya `inventorySource: 'crm'` | Seed memberi Jakarta modus CRM dan Bali modus PMS, sehingga demo memperlihatkan keduanya dan tidak ada layar yang kontradiktif |
| "in 1d" muncul di halaman berbahasa Indonesia | `relativeTime` hanya punya keluaran bahasa Inggris | Dilokalkan: "1 hr lagi", "4 jam lalu", "baru saja" |
| Kolom tingkat tamu menampilkan kata mentah "gold" | Tidak ada konstanta label untuk `contacts.guest_tier` | `GUEST_TIERS` dan `guestTierLabel()` di `lib/constants` |

### Riwayat inap pada tenant demo

Seed kini menambahkan lima inap yang sudah selesai dengan jarak berbeda-beda,
sehingga sebagian tamu jatuh tempo untuk diajak kembali dan sebagian belum.
`stay_completed_at` sengaja dibiarkan kosong: sapuanlah yang mengisinya saat
halaman pertama kali dibuka, sehingga demo memperlihatkan mekanismenya bekerja,
bukan hasil yang sudah dipalsukan.

## Yang masih berbahasa Inggris

Navigasi, Pasca-Inap, Kamar & Tarif, pesan kesalahan modul inventaris, jarak
waktu, dan tingkat tamu sudah berbahasa Indonesia. Isi halaman lama (Hari Saya,
Prospek, Pipeline, Penawaran, Reservasi, Laporan) masih berbahasa Inggris.
Menerjemahkannya sepotong-sepotong menghasilkan campuran yang lebih buruk
daripada satu bahasa yang konsisten, jadi sisanya menunggu satu lintasan penuh
dengan lapisan i18n yang benar.
