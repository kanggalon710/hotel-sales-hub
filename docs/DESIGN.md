# Design decisions

## Direction

Light-first, blue-and-white. This **supersedes PRD §15.1 ("dark-first")** on the product owner's instruction. Dark mode remains a full, equal-quality alternative behind the header toggle.

The register is an *operations desk*, not a dashboard. A light blue gradient ground carries the product colour, white surfaces carry the work, and navigation is tinted blue so the workspace reads as the clean area. One action colour (`#0070f3`) is used sparingly; a single warm gold accent is the only non-blue note, reserved for hospitality moments such as guest tier. Hierarchy comes from a real type scale, not from boxes.

### Palette roles

| Token | Light | Job |
|---|---|---|
| `--bg` + `--bg-gradient` | `#eef4fc`, gradient `#e4edfa → #f4f9ff → #edf4fd` | Fixed page ground |
| `--surface` | `#ffffff` | Panels, cards, tables |
| `--sidebar` | gradient `#dbe8f8 → #eaf2fc` | Navigation, with white active pills |
| `--lane` | `#dde8f7` | Kanban columns, deeper than the ground so white cards lift |
| `--primary` | `#0070f3` | The single action colour |
| `--accent` | `#96661a` | Guest tier and other hospitality moments |

### Two families, no more

Inter for everything read as language. JetBrains Mono for everything read as a value: lead and quotation codes, money, timestamps, PMS references. That is the whole type system.

Headings are separated from body by **size and weight**, not by a third family. The earlier build carried Plus Jakarta Sans as a display face on top of these two, which read as three competing voices on one screen for no functional gain.

### Columns are designed, not discovered

Header and cell alignment can be perfectly correct and the table can still read as crooked, because the browser sizes columns from content. Measured on the Leads table before the fix: Progress 281px, Guests 112px. The column carrying the least information was the widest on screen, and the total overflowed a 1440px viewport.

Tables that matter now declare their proportions, and `Table` switches to a fixed layout when they do:

```tsx
<Table columns={['24%', '15%', '18%', '10%', '13%', '11%', '9%']}>
```

Two rules follow. Percentages total 100, and a column is never hidden with CSS while its `<col>` stays in the group, because that shifts every column after it. If a column is not worth showing at a width, it is not in the table at that width.

### Tables never squeeze

A table that does not fit must scroll, not compress. Compressing wraps a date across six lines and turns a 60px row into a 200px one.

Every table therefore declares a `min-width` that reflects its column count, and `TableScroll` handles the overflow. Dates, record codes, money, and references carry `whitespace-nowrap`; numeric cells get it automatically. Verified: quotation rows are a uniform 63px.

### Copy

No em dashes. Sentences use commas, colons, or full stops; a lone `–` (en dash) marks an empty value in tables.

### One list pattern, everywhere

Six list pages used the shared `Table` primitive and Leads used a bespoke flex row. That single exception was the inconsistency: values did not line up under headers, and each row carried a wide gap where a column should have been.

Leads now uses the same table from 1024px up, with a stacked card row below it. The rule is: **a list of records is a table wherever a shared column grid fits.** Text left aligned, money right aligned, one alignment edge per column, no column left holding empty space. The progress rail needs real width to read, so it appears from 1280px.

### My Day groups by the kind of attention

My Day flattened six different kinds of work into one list ranked by an abstract priority: unanswered inquiries, overdue tasks, expiring quotations, the front-office queue, discount approvals, and integration failures. Those have different owners, different clocks, and different actions. Ranking an SLA breach against a webhook mapping error is not a real comparison, so the list could not be read.

It is now three named groups, each stating the question it answers:

| Group | Question | What is in it |
|---|---|---|
| Past due | The clock has already run out on these. | Breached SLAs, expired quotations, intake blocked by an unmapped inbox |
| Needs attention today | Still inside its window, but not for long. | Inquiries within SLA, overdue follow-ups, quotations expiring within 24h |
| Waiting on your decision | Nobody else can move these forward. | Discount approvals, front-office review queue |

Rows inside a group are alike, so the row shape can be consistent. A group with nothing in it does not render.

The right rail used to repeat the Leads list. It is now *Arriving this week*: stays starting in the next seven days, which is hotel context no other screen gives.

### A detail header carries four things

The lead header consumed 42% of a phone screen before any content, and its meta line wrapped to three rows with orphaned `·` separators at the line ends. Worse, most of it was already on screen twice: the property was in the top bar, the stay dates were in the Qualification card directly below, and the channel and created date belonged with the rest of the record.

A detail header now carries exactly four things:

1. **Who** the record is about, with its reference
2. **What state** it is in
3. **How much** it is worth
4. **The next action**

Everything else moves to the panel that owns it. On a phone the name takes the full width and the money moves to its own row, because a truncated guest name (`Hendra Gunawan` shown as `Hendr…`) is worse than one extra row. Measured result: 42% down to 34%, name intact, no horizontal overflow.

### Empty states describe, they do not instruct

Each pipeline stage carries two separate strings, because they answer different questions:

- `hint` is the **gate**: what is still missing when a transition is refused. "Stay dates, occupancy, and contact method are required."
- `meaning` is the **description**: what the stage is in the sales process. "Dates, occupancy, and a contact method are all known."

An empty column shows the meaning. Using the gate there produced "Nothing in Qualified. Stay dates, occupancy, and contact method are required." which reads as an instruction with no object. The meaning also serves as the column's tooltip, so the board teaches the pipeline to anyone reading it.

### Actions are not properties

The lead cockpit had a floating bar mixing four buttons, two labelled selects, and a destructive text action, sitting between the header and the first card with no alignment to either. Owner also appeared twice: once in that bar and once in the details panel.

The split is now explicit:

- **Actions** (check availability, build quotation, request handoff) sit in the page header beside the entity they act on. One primary, the rest secondary, and the destructive *Close as lost* inside an overflow menu.
- **Properties** (owner, stage) are editable rows in the Lead details panel, with the label-above-control layout every other form uses.

If a control changes a field on the record, it is a property. If it starts a workflow, it is an action. They do not share a row.

### Page headers and filters

A list page must show real rows in the first third of the screen. That budget drives three rules:

1. **Title scales.** `t-title` (20px) on a phone, `t-display` (30px) from 640px. The row count sits beside the title, never on its own line.
2. **Descriptions are for wide screens.** `PageHeader` renders them from 640px up. On a phone they are prose the user did not ask for.
3. **Filters collapse.** Below 1024px every filter lives behind one button that opens a bottom sheet with visible labels; from 1024px the same controls render inline with `aria-label` only. One definition, two layouts.

Measured on a 375×812 phone, the Leads list went from 45% of the screen consumed before the first row to 23%, with four full rows visible.

## What changed and why

| Before | After | Reason |
|---|---|---|
| Navy ground + electric blue + cyan | Light blue gradient ground, white surfaces, blue navigation, PRD blue for actions only, gold for hospitality accents | Cyan on white is unusable; the dark navy/blue/cyan triad is the most generic dashboard palette |
| Everything 11–13px | Seven-step scale: display 30/26 · title 20 · heading 15 · body 14 · small 13 · meta 12 · label 11 caps | Without size steps the eye has nowhere to start |
| Every block a bordered card | Two surface weights: `panel` (bounded, for tables/forms) and `Section` (heading + whitespace) | Uniform boxes destroy rhythm |
| Pill badges everywhere | `pill` when status is the point; `dot` in dense rows | A wall of pills has no signal |
| Four identical stat tiles | One `MetricStrip` divided by hairlines; number dominant | The four-tile row is the most recognisable generated-UI tell |
| Kanban: 280px columns, five-icon rail per card | 286px lanes filling the viewport height, independent scroll; card = guest → stay → value → owner + one signal; phone shows one stage with a picker | Signal over decoration; a phone cannot pan nine columns |
| Pipeline header ate the top third of the screen | One compact line: title plus inline totals, so lanes start immediately below | The board is the page |
| Live Stay Strip as five circles | A filled track with labelled nodes; compact form is a progress bar + one line of text | The rail read as ornament; the track reads as progress |
| Modals centered everywhere | Centered ≥640px; bottom sheet with grab handle below | Reachability on phones |
| Prose full of em dashes | Commas, colons, and full stops; en dash only for empty values | Em dashes everywhere read as machine-written |
| List header ate 45% of a phone screen | 20px title with the count beside it, description from 640px up, filters behind one button | Content should start in the first third of the screen |
| Three font families | Inter and JetBrains Mono only | A display face that adds no function adds a third voice |
| Nine pages, two metric patterns | One `MetricStrip` everywhere | My Day had the strip; eight other pages still had the four-box grid |
| Tables compressed until dates wrapped six lines deep | `min-width` per table plus `whitespace-nowrap` on values | Scrolling is the correct failure mode for a table, squeezing is not |
| Column widths decided by content | Declared percentages with a fixed layout | Progress was 281px wide and Guests 112px, purely by accident |
| My Day ranked six kinds of work in one list | Three named groups, each answering its own question | An SLA breach and a webhook error cannot be ranked against each other |
| Kanban cards repeated the stage they sat in | Card shows owner and one warning; the column states the stage | Redundant, and it was what squeezed the card footer |
| Lead header ate 42% of a phone screen and wrapped to three lines | Four things only: who, what state, how much, next action | Property, stay dates, channel and created were all already on screen elsewhere |
| Empty columns showed entry requirements | Each stage has a `meaning` separate from its `hint` | A gate message has no object when nothing is there to gate |

## Responsive contract

| Width | Layout decisions |
|---|---|
| < 640 | One column · sidebar as a portalled full-height drawer · sheets from the bottom · kanban one stage at a time with a picker · list rows put the stage under the guest so the name keeps full width · gutters 16px |
| 640–1023 | List rows become two columns (identity, stay) with the value on the right · sidebar drawer · gutters 24px |
| 1024–1439 | Persistent 240px sidebar · list rows gain a progress column · two-column workspaces · gutters 32px |
| ≥ 1440 | Content capped at 1440px (`PageShell`); the pipeline board runs full width |

Two bugs this contract caught, both now fixed and worth remembering: the top bar's `backdrop-blur` made it a containing block, which collapsed the fixed mobile drawer to the height of the bar (fixed by portalling to `document.body`), and the drawer trigger had no `shrink-0`, so flex squeezed it to 2px wide.

Every multi-column grid uses `minmax(0, …)` tracks so a long label can never widen the page. Wide tables scroll inside `TableScroll`; the page body never scrolls sideways.

## Accessibility baseline (WCAG 2.1 AA)

- Text pairs verified ≥ 4.5:1 in both themes (`--ink-2` on `--bg`: 7.3:1 light).
- Status is text + dot/shape, never colour alone.
- Focus ring on every interactive element (`.focus-ring`, 2px + offset).
- Drawers and modals trap focus, restore focus, close on Escape.
- `prefers-reduced-motion` reduces every animation to ≤ 0.01ms.
- Icon-only buttons carry `aria-label`; tables carry captions or `aria-label`; the funnel is a real `<ol>` with text values.

## Measured UI audit

The layout is verified by measurement rather than by eye. A script runs in the
page and reports five classes of defect, and the pass is green only when every
route returns an empty list.

| Check | What it catches |
|---|---|
| `clipped` | A leaf whose `scrollWidth` exceeds its `clientWidth` and that is not deliberately truncated. Catches money overflowing a column that was sized for prose. |
| `escapes` | An element whose box leaves the `<main>` column without sitting inside a scroll container. |
| `small-tap` | Below 640px, an interactive element under 32px tall. An element whose `::after` is an `inset-0` overlay is measured at its row height, because that overlay is the real hit area. |
| `overflow-x` | The document scrolling sideways. |
| `empty` | A route rendering almost no content, which usually means a failed query rather than an empty state. |

Run it against all 20 routes at 375, 768 and 1440.

### Defects this pass found and fixed

| Defect | Cause | Fix |
|---|---|---|
| Row links were 16–21px tall, far under any touch minimum | Only the text was the target; six tables each linked from a bare `<Link>` | `RowLink` in `ui/table.tsx` stretches an `inset-0` overlay across the row, so the whole row is the target. `Tr interactive` supplies the `relative`. |
| Bare inline links ("Back to settings", "View all", lead refs) were 17–21px | Text links carry no padding of their own | One `tap` utility: a 36px hit area below 640px, inert above it, so desktop loses no vertical rhythm. Applied at 12 sites. |
| `Rp 306,4 jt` clipped inside a metric | 26px value in a half-width phone cell | Value steps to 21px below `sm`; cell padding 20px → 16px. |
| Money overflowed its column on My Day and the lead cockpit | Percentages gave the money column the remainder rather than its measured need | Columns rebalanced from the widest real value. Numeric cells are `whitespace-nowrap`, so a too-narrow money column fails loudly instead of wrapping. |
| Metric values sat 15px apart across one strip | One-line labels next to two-line labels | The label reserves `min-h-[2lh]`. The strip reads as one row, so the numbers sit on one line. |
| Reporting-period segments were 30px tall | `py-1.5` on a 12px label | `min-h-8` on each segment; the group stays on the header row. |

### One false positive worth recording

`/settings` reported the document scrolling to 818px on a 375px viewport. It does
not. The browser pane emulates the layout viewport (`clientWidth` 375) but leaves
`innerWidth` at the real pane width (796), and `position: fixed` resolves against
the latter, so the toast viewport landed off-screen and inflated `scrollWidth`.
On a device the two agree. Confirm any fixed-position finding against
`innerWidth === document.documentElement.clientWidth` before chasing it.


## Palet: Nexus CRM (keluarga Untitled UI)

Arah warna diambil dari berkas Figma rujukan *Nexus CRM — UI Design System &
Screens*, dibaca lewat Figma MCP pada simpul `18:362` (layar Kontak) dan `5:3`
(sidebar), bukan dikira-kira dari tangkapan layar. Pembacaan pertama saya dari
gambar meleset di hampir semua nilai: sidebar saya kira gradien indigo, padahal
ia `#101828` rata dan netral.

### Sidebar

| Peran | Nilai | Catatan |
|---|---|---|
| Latar | `#101828` | Rata, bukan gradien |
| Butir aktif | `#1d2939` dengan teks putih | Radius 8px |
| Butir tidak aktif | `#d0d5dd` | |
| Label kelompok | `#475467` | 10px, semibold, tracking 0.8px |
| Subjudul dan peran | `#667085` | |
| Garis pemisah | `#1d2939` | |

Sidebar adalah permukaan tersendiri, jadi ia membawa tintanya sendiri
(`--sidebar-ink`, `--sidebar-ink-2`, `--sidebar-ink-3`, `--sidebar-label`).
Memakai `--ink` halaman di sana akan menghasilkan tulisan gelap di atas latar
gelap.

### Ruang kerja

| Peran | Nilai |
|---|---|
| Ground | `#f9fafb` |
| Permukaan kartu | `#ffffff` |
| Permukaan kedua | `#f2f4f7` |
| Garis | `#eaecf0`, tegas `#d0d5dd` |
| Tinta | `#101828` · `#475467` · `#667085` |
| Merek | `#6938ef`, tekan `#5925dc`, lembut `#f4f3ff` |
| Berhasil | `#12b76a` / `#027a48` pada `#ecfdf3` |
| Peringatan | `#f79009` / `#b54708` pada `#fffaeb` |
| Bahaya | `#f04438` / `#b42318` pada `#fef3f2` |
| Informasi | `#2e90fa` / `#175cd3` pada `#eff8ff` |

Huruf tetap Inter, sama seperti rujukan. Kartu memakai radius 8px, bukan 12px:
tepi yang lebih lunak membuat tabel sepadat ini terasa kabur.

### Yang berubah bentuknya

Metrik kembali menjadi empat kartu terpisah dengan jarak di antaranya, mengikuti
rujukan. Sebelumnya keempatnya menyatu dalam satu bilah yang dibelah garis
rambut, atas permintaan sebelumnya. Bentuk kartu terpisah membuat tiap angka
berdiri sebagai satu objek.

Arah biru muda yang dipakai sebelum ini digantikan seluruhnya. Itu juga
keputusan yang diminta sebelumnya, jadi perubahannya disebutkan di sini agar
tidak tampak seperti kelalaian.


## Tab, penomoran halaman, dan grafik

Tiga pola dari rujukan Nexus yang diterapkan setelah paletnya.

### Sudut pandang, bukan saringan tambahan

Bilah tab di atas daftar prospek menjawab pertanyaan yang berbeda dari bilah
saringan di bawahnya. Tab menjawab "kumpulan siapa yang sedang saya lihat":
Semua, Milik saya, Belum ditugaskan, Terlambat. Saringan menjawab "persempit
yang mana": tahap, pemilik, status, urutan.

Jumlah pada tiap tab menghormati saringan yang sedang aktif, sehingga angkanya
selalu menjelaskan apa yang akan muncul bila tab itu ditekan. Tanpa angka itu,
tidak ada alasan untuk menekan tab yang kosong, dan penjual harus mencobanya
satu per satu.

Klausa saringan dipisah ke satu fungsi yang dipakai bersama oleh penghitung dan
daftar. Bila keduanya menyusun klausanya sendiri, cepat atau lambat jumlah pada
tab tidak lagi cocok dengan isi tabel di bawahnya.

### Penomoran halaman menutup kebocoran, bukan sekadar menghias

Daftar prospek sebelumnya dipotong pada `limit: 120` tanpa memberi tanda apa
pun. Prospek ke-121 dan seterusnya hilang diam-diam: tidak ada tombol, tidak ada
keterangan, tidak ada cara mengetahuinya dari layar. Ini cacat kebenaran, bukan
celah tampilan.

Sekarang 25 baris per halaman dengan keterangan "Menampilkan 1–25 dari N".
Bagian terpenting justru kalimat jumlahnya, karena itulah yang memberitahu bahwa
masih ada sisa.

Nomor halaman datang dari URL, jadi ia bisa berupa apa saja. `?page=99` pada
daftar berisi 16 baris dijepit kembali ke halaman terakhir yang sah; tanpa itu
layar akan berbunyi "Menampilkan 2476–16 dari 16" di atas tabel kosong.

### Grafik digambar tanpa pustaka

Laporan mendapat grafik batang dan donat. Keduanya SVG yang digambar di server.
Data yang ditampilkan hanya belasan titik; memuat pustaka grafik untuk itu
berarti mengirim ratusan kilobyte demi belasan persegi panjang.

Yang penting tetap dipenuhi: sumbu dibulatkan ke atas ke angka yang enak dibaca
sehingga batang tertinggi tidak menyentuh tepi, setiap label menyebut nilai yang
benar-benar dicapai grafik, dan warnanya diambil dari token tema sehingga
terbaca pada kedua tema.

Donat dibatasi lima tahap teratas ditambah "Lainnya". Paletnya berisi enam
warna; membiarkan sepuluh tahap memutarinya membuat dua tahap berbeda tampil
sewarna, dan donat yang warnanya berulang tidak lagi bisa dibaca.

### Pesan kosong ikut mengetahui tab yang aktif

Tab "Milik saya" yang kosong dahulu berbunyi "belum ada prospek", padahal
prospeknya ada, hanya saja bukan milik orang itu. Tiap tab kini punya kalimat
kosongnya sendiri, dan semuanya menawarkan jalan keluar yang sama: kembali ke
tab Semua.
