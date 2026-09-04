'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { contacts, db, leads, tasks, userPropertyRoles, users } from '@/db';
import { assertPropertyAccess, requireSession, type Session } from '@/server/context';
import { logActivity, moveLeadStage, setPrimaryStay } from '@/server/services/leads';
import { syncLeadContextToChatwoot } from '@/server/services/chatwoot-outbound';
import { newId } from '@/server/crypto';
import { trackEvent, writeAudit } from '@/server/audit';
import { fail, failFrom, ok, type ActionResult } from '@/server/result';
import type { LeadStage } from '@/lib/constants';
import { nightsBetween } from '@/lib/utils';

/** Loads a lead and proves the caller may act on it. */
function loadLeadFor(session: Session, leadId: string) {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead || lead.organizationId !== session.user.organizationId) {
    throw new Error('Lead not found.');
  }
  assertPropertyAccess(session, lead.propertyId);
  return lead;
}

function refresh(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  revalidatePath('/pipeline');
  revalidatePath('/');
}

const qualificationSchema = z.object({
  leadId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid check-in date'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid check-out date'),
  rooms: z.coerce.number().int().min(1, 'At least one room').max(60),
  adults: z.coerce.number().int().min(1, 'At least one adult').max(120),
  children: z.coerce.number().int().min(0).max(60),
  inquiryType: z.string().min(1),
  roomPreference: z.string().max(160).optional(),
  purpose: z.string().max(200).optional(),
  specialRequest: z.string().max(1000).optional(),
  budgetNote: z.string().max(200).optional(),
});

export async function saveQualificationAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('lead.write')) return fail('Your role cannot edit leads.');

    const parsed = qualificationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
      return fail('Check the highlighted fields.', fieldErrors);
    }
    const data = parsed.data;
    const lead = loadLeadFor(session, data.leadId);

    const nights = nightsBetween(data.checkIn, data.checkOut);
    if (nights < 1) {
      return fail('Check the highlighted fields.', { checkOut: 'Check-out must be at least one night after check-in.' });
    }

    setPrimaryStay(lead.id, {
      organizationId: lead.organizationId,
      propertyId: lead.propertyId,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      nights,
      rooms: data.rooms,
      adults: data.adults,
      children: data.children,
      roomPreference: data.roomPreference || null,
      notes: data.specialRequest || null,
    });

    db.update(leads)
      .set({
        inquiryType: data.inquiryType,
        purpose: data.purpose || null,
        specialRequest: data.specialRequest || null,
        budgetNote: data.budgetNote || null,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, lead.id))
      .run();

    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'qualification_updated', title: 'Qualification updated',
      body: `${data.rooms} room(s) · ${nights} night(s) · ${data.adults} adults${data.children ? `, ${data.children} children` : ''}`,
      actorUserId: session.user.id, actorName: session.user.name,
    });
    writeAudit({
      organizationId: lead.organizationId, propertyId: lead.propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'lead.qualification_updated', entityType: 'lead', entityId: lead.id,
      summary: `${lead.code} qualification updated`,
      before: { checkIn: lead.checkIn, checkOut: lead.checkOut, rooms: lead.rooms },
      after: { checkIn: data.checkIn, checkOut: data.checkOut, rooms: data.rooms },
    });
    syncLeadContextToChatwoot({
      organizationId: lead.organizationId, leadId: lead.id, conversationId: lead.primaryConversationId,
      attributes: {
        check_in: data.checkIn, check_out: data.checkOut, rooms: data.rooms,
        adults: data.adults, children: data.children, inquiry_type: data.inquiryType,
      },
      reason: 'qualification',
    });

    refresh(lead.id);
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function changeStageAction(
  leadId: string,
  stage: LeadStage,
  extra: { lostReason?: string; lostCompetitor?: string; lostNotes?: string; cancellationReason?: string; reason?: string } = {},
): Promise<ActionResult<{ warnings?: string[] }>> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('lead.write')) return fail('Your role cannot change lead stages.');
    const lead = loadLeadFor(session, leadId);

    const result = moveLeadStage(session, lead.id, stage, extra);
    if (!result.ok) {
      return fail(result.failures.map((f) => f.message).join(' '), {
        stage: result.failures[0]?.message ?? 'This stage is not available yet.',
      });
    }
    refresh(lead.id);
    return ok({});
  } catch (err) {
    return failFrom(err);
  }
}

export async function assignLeadAction(leadId: string, userId: string | null): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const lead = loadLeadFor(session, leadId);

    // Claiming an unassigned lead is allowed for anyone who can edit leads;
    // reassigning someone else's requires the reassign permission.
    const claimingSelf = userId === session.user.id && !lead.ownerUserId;
    if (!claimingSelf && !session.permissions.has('lead.reassign')) {
      return fail('Only a manager or admin can reassign a lead that already has an owner.');
    }
    if (!session.permissions.has('lead.write')) return fail('Your role cannot edit leads.');

    if (userId) {
      const target = db
        .select({ id: users.id, name: users.name })
        .from(users)
        .innerJoin(userPropertyRoles, eq(userPropertyRoles.userId, users.id))
        .where(
          and(
            eq(users.id, userId),
            eq(users.organizationId, session.user.organizationId),
            eq(users.status, 'active'),
          ),
        )
        .get();
      if (!target) return fail('That user is not active in this organization.');
    }

    const previous = lead.ownerUserId
      ? db.select({ name: users.name }).from(users).where(eq(users.id, lead.ownerUserId)).get()?.name
      : null;
    const nextName = userId ? db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name : null;

    db.update(leads)
      .set({
        ownerUserId: userId,
        stage: lead.stage === 'new_inquiry' && userId ? 'assigned' : lead.stage,
        firstRespondedAt: lead.firstRespondedAt ?? (userId ? new Date() : null),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, lead.id))
      .run();

    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'lead_assigned',
      title: userId ? `Assigned to ${nextName}` : 'Owner removed',
      body: previous ? `Previously ${previous}` : null,
      actorUserId: session.user.id, actorName: session.user.name,
    });
    writeAudit({
      organizationId: lead.organizationId, propertyId: lead.propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'lead.assigned', entityType: 'lead', entityId: lead.id,
      summary: `${lead.code} assigned to ${nextName ?? 'nobody'}`,
      before: { owner: previous }, after: { owner: nextName },
    });
    trackEvent('lead_assigned', {
      organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id,
    }, { leadId: lead.id, ownerUserId: userId });

    syncLeadContextToChatwoot({
      organizationId: lead.organizationId, leadId: lead.id, conversationId: lead.primaryConversationId,
      attributes: { assigned_sales: nextName ?? null }, reason: 'assign',
    });

    refresh(lead.id);
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function addNoteAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const leadId = String(formData.get('leadId') ?? '');
    const body = String(formData.get('body') ?? '').trim();
    if (!body) return fail('Check the highlighted fields.', { body: 'Write something before saving.' });

    const lead = loadLeadFor(session, leadId);
    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'note', title: 'Internal note', body,
      actorUserId: session.user.id, actorName: session.user.name,
    });
    refresh(lead.id);
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function scheduleFollowUpAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('lead.write')) return fail('Your role cannot edit leads.');
    const leadId = String(formData.get('leadId') ?? '');
    const dueAtRaw = String(formData.get('dueAt') ?? '');
    const title = String(formData.get('title') ?? '').trim() || 'Follow up with the guest';

    const dueAt = new Date(dueAtRaw);
    if (Number.isNaN(dueAt.getTime())) {
      return fail('Check the highlighted fields.', { dueAt: 'Pick a valid date and time.' });
    }
    const lead = loadLeadFor(session, leadId);

    db.insert(tasks).values({
      id: newId('tsk'), organizationId: lead.organizationId, propertyId: lead.propertyId,
      leadId: lead.id, contactId: lead.contactId,
      assigneeUserId: lead.ownerUserId ?? session.user.id,
      title, type: 'follow_up', priority: 'normal', status: 'open', dueAt,
      createdByUserId: session.user.id,
    }).run();

    db.update(leads)
      .set({ nextFollowUpAt: dueAt, nextActionLabel: title, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
      .run();

    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'follow_up_created', title: `Follow-up scheduled: ${title}`,
      body: dueAt.toISOString(), actorUserId: session.user.id, actorName: session.user.name,
    });
    trackEvent('follow_up_created', {
      organizationId: lead.organizationId, propertyId: lead.propertyId, userId: session.user.id,
    });
    syncLeadContextToChatwoot({
      organizationId: lead.organizationId, leadId: lead.id, conversationId: lead.primaryConversationId,
      attributes: { next_follow_up_at: dueAt.toISOString() }, reason: 'follow-up',
    });

    refresh(lead.id);
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function completeTaskAction(taskId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!task || task.organizationId !== session.user.organizationId) return fail('Task not found.');
    if (task.propertyId) assertPropertyAccess(session, task.propertyId);

    db.update(tasks)
      .set({ status: 'done', completedAt: new Date(), completedByUserId: session.user.id })
      .where(eq(tasks.id, taskId))
      .run();

    if (task.leadId) {
      const remaining = db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.leadId, task.leadId), eq(tasks.status, 'open')))
        .all();
      if (remaining.length === 0) {
        db.update(leads).set({ nextFollowUpAt: null }).where(eq(leads.id, task.leadId)).run();
      }
      logActivity({
        organizationId: task.organizationId, propertyId: task.propertyId, leadId: task.leadId,
        type: 'task_completed', title: `Completed: ${task.title}`,
        actorUserId: session.user.id, actorName: session.user.name,
      });
      trackEvent('follow_up_completed', { organizationId: task.organizationId, userId: session.user.id });
      refresh(task.leadId);
    } else {
      revalidatePath('/');
    }
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function markFirstResponseAction(leadId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const lead = loadLeadFor(session, leadId);
    if (lead.firstRespondedAt) return ok();

    db.update(leads)
      .set({ firstRespondedAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
      .run();
    logActivity({
      organizationId: lead.organizationId, propertyId: lead.propertyId, leadId: lead.id, contactId: lead.contactId,
      type: 'first_response', title: 'First response recorded',
      actorUserId: session.user.id, actorName: session.user.name,
    });
    refresh(lead.id);
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function updateContactAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!session.permissions.has('lead.write')) return fail('Your role cannot edit guest details.');
    const contactId = String(formData.get('contactId') ?? '');
    const contact = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
    if (!contact || contact.organizationId !== session.user.organizationId) return fail('Guest not found.');

    const fullName = String(formData.get('fullName') ?? '').trim();
    const phone = String(formData.get('phone') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const language = String(formData.get('preferredLanguage') ?? '').trim();

    if (!fullName) return fail('Check the highlighted fields.', { fullName: 'A guest name is required.' });
    if (!phone && !email) {
      return fail('Check the highlighted fields.', { phone: 'Provide at least a phone number or an email address.' });
    }

    db.update(contacts)
      .set({
        fullName,
        phoneRaw: phone || null,
        phoneNormalized: phone ? normalizePhone(phone) : null,
        email: email || null,
        emailNormalized: email ? email.toLowerCase() : null,
        preferredLanguage: language || null,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId))
      .run();

    writeAudit({
      organizationId: contact.organizationId, actorUserId: session.user.id, actorName: session.user.name,
      action: 'contact.updated', entityType: 'contact', entityId: contactId,
      summary: `Guest ${fullName} updated`,
      before: { name: contact.fullName, phone: contact.phoneNormalized, email: contact.email },
      after: { name: fullName, phone, email },
    });

    revalidatePath('/guests');
    revalidatePath(`/guests/${contactId}`);
    revalidatePath('/leads');
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

/** Best-effort E.164 normalisation; Indonesian local format is the common case here. */
function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('62')) return `+${digits}`;
  return digits ? `+${digits}` : null;
}
