'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, properties } from '@/db';
import { requirePermission, requireSession } from '@/server/context';
import { writeAudit } from '@/server/audit';
import { fail, failFrom, ok, type ActionResult } from '@/server/result';
import {
  createRatePlan, createRoomType, removeRatePlan, removeRoomType,
  updateRatePlan, updateRoomType,
} from '@/server/services/inventory';

function refresh() {
  revalidatePath('/settings/rooms');
  revalidatePath('/settings');
  revalidatePath('/availability');
}

/** Kode dipakai pada penawaran dan sinkronisasi PMS, jadi bentuknya dijaga. */
const code = z.string().trim().toUpperCase()
  .min(2, 'Kode minimal 2 karakter')
  .max(12, 'Kode maksimal 12 karakter')
  .regex(/^[A-Z0-9-]+$/, 'Kode hanya boleh huruf, angka, dan tanda hubung');

const roomSchema = z.object({
  propertyId: z.string().min(1),
  id: z.string().optional(),
  code,
  name: z.string().trim().min(2, 'Beri nama tipe kamar'),
  totalRooms: z.coerce.number().int().min(0, 'Jumlah kamar tidak boleh negatif').max(5000),
  maxAdults: z.coerce.number().int().min(1, 'Minimal 1 dewasa').max(20),
  maxChildren: z.coerce.number().int().min(0).max(20),
  bedType: z.string().trim().optional(),
  sizeSqm: z.coerce.number().int().min(0).max(2000).optional(),
  description: z.string().trim().optional(),
  active: z.coerce.boolean().optional(),
});

const planSchema = z.object({
  propertyId: z.string().min(1),
  id: z.string().optional(),
  code,
  name: z.string().trim().min(2, 'Beri nama paket tarif'),
  mealPlan: z.enum(['room_only', 'breakfast', 'half_board', 'full_board']),
  baseRatePerNight: z.coerce.number().min(0, 'Tarif tidak boleh negatif'),
  refundable: z.coerce.boolean().optional(),
  minStay: z.coerce.number().int().min(1, 'Minimal 1 malam').max(365),
  inclusions: z.string().trim().optional(),
  policies: z.string().trim().optional(),
  active: z.coerce.boolean().optional(),
});

/** Properti yang inventarisnya dipegang PMS tidak boleh disunting dari sini. */
async function guardProperty(organizationId: string, propertyId: string) {
  const property = db.select().from(properties)
    .where(eq(properties.id, propertyId)).get();
  if (!property || property.organizationId !== organizationId) {
    return { error: 'Properti tidak ditemukan.' };
  }
  return { property };
}

export async function saveRoomTypeAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'property.manage');
    const parsed = roomSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      );
      return fail('Periksa kembali isian formulir.', fieldErrors);
    }
    const input = parsed.data;
    const guard = await guardProperty(session.user.organizationId, input.propertyId);
    if (guard.error) return fail(guard.error);

    const payload = {
      code: input.code, name: input.name, totalRooms: input.totalRooms,
      maxAdults: input.maxAdults, maxChildren: input.maxChildren,
      bedType: input.bedType || null, sizeSqm: input.sizeSqm ?? null,
      description: input.description || null, active: input.active ?? true,
    };

    const result = input.id
      ? updateRoomType(session.user.organizationId, input.id, payload)
      : createRoomType(session.user.organizationId, input.propertyId, payload);
    if (!result.ok) return fail(result.reason);

    writeAudit({
      organizationId: session.user.organizationId, propertyId: input.propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: input.id ? 'inventory.room_type_updated' : 'inventory.room_type_created',
      entityType: 'room_type', entityId: input.id ?? 'baru',
      summary: `Tipe kamar ${input.code} (${input.name}) · alotmen ${input.totalRooms} kamar`,
    });
    refresh();
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function removeRoomTypeAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'property.manage');
    const id = String(formData.get('id') ?? '');
    if (!id) return fail('Tipe kamar tidak dikenali.');
    const result = removeRoomType(session.user.organizationId, id);
    if (!result.ok) return fail(result.reason);
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'inventory.room_type_removed', entityType: 'room_type', entityId: id,
      summary: 'Tipe kamar dihapus karena belum pernah dipakai.',
    });
    refresh();
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function saveRatePlanAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'property.manage');
    const parsed = planSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      );
      return fail('Periksa kembali isian formulir.', fieldErrors);
    }
    const input = parsed.data;
    const guard = await guardProperty(session.user.organizationId, input.propertyId);
    if (guard.error) return fail(guard.error);

    // Selisih tarif per tipe kamar dikirim sebagai pasangan field `sur_<KODE>`.
    const surcharges: Record<string, number> = {};
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith('sur_')) continue;
      const amount = Number(value);
      if (Number.isFinite(amount) && amount !== 0) surcharges[key.slice(4)] = amount;
    }

    const payload = {
      code: input.code, name: input.name, mealPlan: input.mealPlan,
      baseRatePerNight: input.baseRatePerNight,
      refundable: input.refundable ?? false,
      minStay: input.minStay,
      inclusions: (input.inclusions ?? '').split(',').map((v) => v.trim()).filter(Boolean),
      policies: input.policies || null,
      roomTypeSurcharges: surcharges,
      active: input.active ?? true,
    };

    const result = input.id
      ? updateRatePlan(session.user.organizationId, input.id, payload)
      : createRatePlan(session.user.organizationId, input.propertyId, payload);
    if (!result.ok) return fail(result.reason);

    writeAudit({
      organizationId: session.user.organizationId, propertyId: input.propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: input.id ? 'inventory.rate_plan_updated' : 'inventory.rate_plan_created',
      entityType: 'rate_plan', entityId: input.id ?? 'baru',
      summary: `Paket tarif ${input.code} (${input.name}) · dasar ${input.baseRatePerNight}/malam`,
    });
    refresh();
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function removeRatePlanAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'property.manage');
    const id = String(formData.get('id') ?? '');
    if (!id) return fail('Paket tarif tidak dikenali.');
    const result = removeRatePlan(session.user.organizationId, id);
    if (!result.ok) return fail(result.reason);
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'inventory.rate_plan_removed', entityType: 'rate_plan', entityId: id,
      summary: 'Paket tarif dihapus karena belum pernah dipakai.',
    });
    refresh();
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

export async function setInventorySourceAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'property.manage');
    const propertyId = String(formData.get('propertyId') ?? '');
    const source = String(formData.get('inventorySource') ?? '');
    if (source !== 'crm' && source !== 'pms') return fail('Sumber inventaris tidak dikenali.');
    const guard = await guardProperty(session.user.organizationId, propertyId);
    if (guard.error) return fail(guard.error);

    db.update(properties).set({ inventorySource: source })
      .where(eq(properties.id, propertyId)).run();
    writeAudit({
      organizationId: session.user.organizationId, propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'inventory.source_changed', entityType: 'property', entityId: propertyId,
      summary: source === 'crm'
        ? 'Inventaris kamar dipegang CRM. Ketersediaan dihitung dari alotmen.'
        : 'Inventaris kamar dipegang PMS. Ketersediaan diambil dari konektor.',
    });
    refresh();
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}
