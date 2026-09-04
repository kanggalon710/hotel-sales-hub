'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, organizations, properties } from '@/db';
import { assertPropertyAccess, requirePermission, requireSession } from '@/server/context';
import { newId } from '@/server/crypto';
import { writeAudit } from '@/server/audit';
import { fail, failFrom, ok, type ActionResult } from '@/server/result';

/**
 * Commercial and operational defaults are configuration, never constants
 * (PRD 17.5). Currency, tax, service charge, SLA, and freshness thresholds all
 * live here and cascade to every calculation.
 */
const orgSchema = z.object({
  name: z.string().trim().min(2, 'Enter the organization name'),
  currency: z.string().trim().length(3, 'Use a 3-letter ISO currency code').toUpperCase(),
  locale: z.string().trim().min(2, 'Enter a locale such as id-ID'),
  timezone: z.string().trim().min(3, 'Enter an IANA timezone such as Asia/Jakarta'),
  taxPercent: z.coerce.number().min(0).max(50),
  servicePercent: z.coerce.number().min(0).max(50),
  quotationValidityHours: z.coerce.number().int().min(1).max(720),
  firstResponseSlaMinutes: z.coerce.number().int().min(1).max(1440),
  availabilityStaleAfterMinutes: z.coerce.number().int().min(1).max(1440),
  postStayFollowUpDays: z.coerce.number().int().min(0).max(30),
  winBackAfterDays: z.coerce.number().int().min(7).max(1095),
});

export async function updateOrganizationAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');

    const parsed = orgSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
      return fail('Check the highlighted fields.', fieldErrors);
    }
    const data = parsed.data;

    const before = db.select().from(organizations).where(eq(organizations.id, session.user.organizationId)).get();
    db.update(organizations).set(data).where(eq(organizations.id, session.user.organizationId)).run();

    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'organization.updated',
      entityType: 'organization',
      entityId: session.user.organizationId,
      summary: `Organization settings updated (tax ${data.taxPercent}%, service ${data.servicePercent}%, SLA ${data.firstResponseSlaMinutes}m)`,
      before: before
        ? {
            taxPercent: before.taxPercent,
            servicePercent: before.servicePercent,
            firstResponseSlaMinutes: before.firstResponseSlaMinutes,
            availabilityStaleAfterMinutes: before.availabilityStaleAfterMinutes,
          }
        : undefined,
      after: data,
      severity: 'warning',
    });

    revalidatePath('/settings');
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

const propertySchema = z.object({
  propertyId: z.string().optional(),
  name: z.string().trim().min(2, 'Enter the property name'),
  code: z.string().trim().min(2, 'Use a short code such as KLJ').max(8).toUpperCase(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  taxPercent: z.union([z.coerce.number().min(0).max(50), z.literal('')]).optional(),
  servicePercent: z.union([z.coerce.number().min(0).max(50), z.literal('')]).optional(),
  active: z.string().optional(),
});

export async function savePropertyAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'property.manage');

    const parsed = propertySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
      return fail('Check the highlighted fields.', fieldErrors);
    }
    const data = parsed.data;
    const orgId = session.user.organizationId;

    const numeric = (v: number | '' | undefined) => (v === '' || v === undefined ? null : Number(v));

    if (data.propertyId) {
      const existing = db
        .select()
        .from(properties)
        .where(and(eq(properties.id, data.propertyId), eq(properties.organizationId, orgId)))
        .get();
      if (!existing) return fail('Property not found.');
      assertPropertyAccess(session, existing.id);

      db.update(properties)
        .set({
          name: data.name,
          code: data.code,
          city: data.city || null,
          country: data.country || null,
          timezone: data.timezone || null,
          currency: data.currency || null,
          taxPercent: numeric(data.taxPercent),
          servicePercent: numeric(data.servicePercent),
          active: data.active === 'on',
        })
        .where(eq(properties.id, existing.id))
        .run();

      writeAudit({
        organizationId: orgId,
        propertyId: existing.id,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'property.updated',
        entityType: 'property',
        entityId: existing.id,
        summary: `Property ${data.name} (${data.code}) updated`,
        before: { name: existing.name, code: existing.code, active: existing.active },
        after: { name: data.name, code: data.code, active: data.active === 'on' },
        severity: 'warning',
      });
    } else {
      // Only an org admin may add a property; a property admin administers what exists.
      if (!session.orgRoleKeys.includes('org_admin')) {
        return fail('Only an organization admin can add a property.');
      }
      const duplicate = db
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.organizationId, orgId), eq(properties.code, data.code)))
        .get();
      if (duplicate) {
        return fail('Check the highlighted fields.', { code: 'That property code is already in use.' });
      }

      const id = newId('prp');
      db.insert(properties)
        .values({
          id,
          organizationId: orgId,
          name: data.name,
          code: data.code,
          city: data.city || null,
          country: data.country || null,
          timezone: data.timezone || null,
          currency: data.currency || null,
          taxPercent: numeric(data.taxPercent),
          servicePercent: numeric(data.servicePercent),
          active: true,
        })
        .run();

      writeAudit({
        organizationId: orgId,
        propertyId: id,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'property.created',
        entityType: 'property',
        entityId: id,
        summary: `Property ${data.name} (${data.code}) created`,
        severity: 'warning',
      });
    }

    revalidatePath('/settings');
    revalidatePath('/settings/properties');
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}
