import 'server-only';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { contacts, db, leads, organizations, reservationRequests, tasks } from '@/db';
import { newId } from '@/server/crypto';
import { writeAudit } from '@/server/audit';

/**
 * Siklus hidup setelah tamu menginap.
 *
 * Sebelum modul ini ada, pipeline berhenti di "confirmed": pemesanan tercatat,
 * lalu tidak terjadi apa-apa lagi. `stayCount` dan `lastStayDate` pada kontak
 * hanya ditampilkan di layar, tidak pernah ditulis, sehingga tamu yang sudah
 * lima kali menginap tetap terlihat seperti orang asing. Padahal menarik tamu
 * kembali jauh lebih murah daripada mencari tamu baru.
 *
 * Sapuan ini mengambil reservasi terkonfirmasi yang tanggal check-out-nya sudah
 * lewat, lalu:
 *   1. menaikkan riwayat inap pada kontak,
 *   2. membuat tugas pasca-inap (terima kasih dan permintaan ulasan),
 *   3. membuat tugas ajakan kembali yang jatuh tempo beberapa bulan kemudian.
 *
 * Tugas dipakai, bukan tahap pipeline baru, karena prospeknya memang sudah
 * selesai. Yang berlanjut adalah hubungan dengan tamunya, dan tugas sudah punya
 * tempat di layar "Hari Saya" tempat staf bekerja setiap hari.
 */

export const AFTER_SALES_TASK_TYPES = {
  postStay: 'post_stay',
  winBack: 'win_back',
} as const;

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 86_400_000);
}

export type SweepResult = {
  staysCompleted: number;
  postStayTasks: number;
  winBackTasks: number;
  details: string[];
};

/**
 * Aman dijalankan berulang: reservasi yang sudah diproses ditandai
 * `stayCompletedAt`, dan hanya reservasi tanpa penanda yang diambil.
 */
export function runAfterSalesSweep(organizationId: string, now = new Date()): SweepResult {
  const org = db.select().from(organizations).where(eq(organizations.id, organizationId)).get();
  const result: SweepResult = { staysCompleted: 0, postStayTasks: 0, winBackTasks: 0, details: [] };
  if (!org) return result;

  const today = isoDay(now);
  const due = db
    .select()
    .from(reservationRequests)
    .where(and(
      eq(reservationRequests.organizationId, organizationId),
      eq(reservationRequests.status, 'confirmed'),
      isNull(reservationRequests.stayCompletedAt),
      lte(reservationRequests.checkOut, today),
    ))
    .all();

  for (const stay of due) {
    const lead = db.select().from(leads).where(eq(leads.id, stay.leadId)).get();
    if (!lead) continue;
    const contact = db.select().from(contacts).where(eq(contacts.id, lead.contactId)).get();
    if (!contact) continue;

    // 1. Riwayat inap. `lastStayDate` hanya maju, supaya pengisian mundur atas
    //    reservasi lama tidak menarik tanggal terakhir menjadi lebih tua.
    const nextLastStay = !contact.lastStayDate || stay.checkOut > contact.lastStayDate
      ? stay.checkOut
      : contact.lastStayDate;
    db.update(contacts)
      .set({
        stayCount: sql`${contacts.stayCount} + 1`,
        lastStayDate: nextLastStay,
        updatedAt: now,
      })
      .where(eq(contacts.id, contact.id))
      .run();

    const owner = lead.ownerUserId ?? null;

    // 2. Tugas pasca-inap.
    db.insert(tasks).values({
      id: newId('tsk'), organizationId, propertyId: stay.propertyId,
      leadId: lead.id, contactId: contact.id, assigneeUserId: owner,
      title: `Terima kasih dan minta ulasan: ${contact.fullName}`,
      description: `${contact.fullName} baru saja menyelesaikan inap ${stay.checkIn} sampai ${stay.checkOut} (${stay.roomTypeName ?? 'kamar'}). Sampaikan terima kasih lewat kanal yang dia pakai, lalu minta ulasan.`,
      type: AFTER_SALES_TASK_TYPES.postStay, priority: 'normal', status: 'open',
      dueAt: addDays(now, org.postStayFollowUpDays),
    }).run();
    result.postStayTasks += 1;

    // 3. Tugas ajakan kembali.
    db.insert(tasks).values({
      id: newId('tsk'), organizationId, propertyId: stay.propertyId,
      leadId: lead.id, contactId: contact.id, assigneeUserId: owner,
      title: `Ajak menginap lagi: ${contact.fullName}`,
      description: `Inap terakhir ${stay.checkOut}. Total ${contact.stayCount + 1} kali menginap. Tawarkan penawaran tamu berulang untuk tanggal yang relevan.`,
      type: AFTER_SALES_TASK_TYPES.winBack, priority: 'low', status: 'open',
      dueAt: addDays(now, org.winBackAfterDays),
    }).run();
    result.winBackTasks += 1;

    db.update(reservationRequests)
      .set({ stayCompletedAt: now })
      .where(eq(reservationRequests.id, stay.id))
      .run();
    result.staysCompleted += 1;
    result.details.push(`${contact.fullName} · ${stay.code} · inap ke-${contact.stayCount + 1}`);

    writeAudit({
      organizationId, propertyId: stay.propertyId,
      actorType: 'system', actorName: 'After-sales sweep',
      action: 'aftersales.stay_completed', entityType: 'reservation_request', entityId: stay.id,
      summary: `Inap ${stay.code} selesai. Riwayat tamu diperbarui dan tugas pasca-inap dibuat.`,
    });
  }

  return result;
}

/** Tamu yang layak didekati lagi, untuk papan tamu berulang. */
export function winBackCandidates(organizationId: string, now = new Date(), limit = 25) {
  const org = db.select().from(organizations).where(eq(organizations.id, organizationId)).get();
  const threshold = isoDay(addDays(now, -(org?.winBackAfterDays ?? 150)));
  return db
    .select({
      id: contacts.id, fullName: contacts.fullName, stayCount: contacts.stayCount,
      lastStayDate: contacts.lastStayDate, guestTier: contacts.guestTier,
      phone: contacts.phoneNormalized, consentStatus: contacts.consentStatus,
    })
    .from(contacts)
    .where(and(
      eq(contacts.organizationId, organizationId),
      sql`${contacts.stayCount} > 0`,
      sql`${contacts.lastStayDate} is not null`,
      lte(contacts.lastStayDate, threshold),
      // Tamu yang menarik persetujuannya tidak boleh dihubungi lagi untuk pemasaran.
      sql`${contacts.consentStatus} <> 'withdrawn'`,
    ))
    .orderBy(sql`${contacts.stayCount} desc, ${contacts.lastStayDate} asc`)
    .limit(limit)
    .all();
}
