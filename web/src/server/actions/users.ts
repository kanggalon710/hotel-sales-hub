'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, invitations, roles, userPropertyRoles, users } from '@/db';
import { requirePermission, requireSession } from '@/server/context';
import { revokeAllSessionsForUser } from '@/server/auth';
import { newId, newToken, sha256 } from '@/server/crypto';
import { trackEvent, writeAudit } from '@/server/audit';
import { fail, failFrom, ok, type ActionResult } from '@/server/result';
import { ROLE_KEYS, type RoleKey } from '@/lib/constants';
import {
  assertCanChangeStatus, assertCanGrantOn, clampDiscountAuthority, defaultApprovalCeiling,
  LifecycleError, replaceGrants, systemRole,
} from '@/server/services/user-admin';

const INVITE_TTL_DAYS = 7;

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Enter the person’s full name'),
  email: z.string().trim().toLowerCase().email('Enter a valid work email'),
  roleKey: z.enum(ROLE_KEYS),
  propertyIds: z.array(z.string()).default([]),
  teamId: z.string().optional(),
  discountLimitPercent: z.coerce.number().min(0).max(100).default(0),
});

/**
 * Step 1-3 of the user lifecycle (PRD 9.3): invite with a scoped, expiring token.
 * The raw token is returned once so an admin can hand it over; only its hash is
 * stored.
 */
export async function inviteUserAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ link: string; email: string }>> {
  try {
    const session = await requireSession();
    requirePermission(session, 'user.manage');

    const parsed = inviteSchema.safeParse({
      name: formData.get('name'),
      email: formData.get('email'),
      roleKey: formData.get('roleKey'),
      propertyIds: formData.getAll('propertyIds').map(String).filter(Boolean),
      teamId: formData.get('teamId') || undefined,
      discountLimitPercent: formData.get('discountLimitPercent') ?? 0,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
      return fail('Check the highlighted fields.', fieldErrors);
    }
    const data = parsed.data;
    const role = systemRole(data.roleKey as RoleKey);

    if (role.scope === 'property' && data.propertyIds.length === 0) {
      return fail('Check the highlighted fields.', {
        propertyIds: 'Choose at least one property for this role.',
      });
    }
    assertCanGrantOn(session, role.scope === 'organization' ? [null] : data.propertyIds);
    const discountLimit = clampDiscountAuthority(session, data.discountLimitPercent);

    const existing = db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(and(eq(users.organizationId, session.user.organizationId), eq(users.email, data.email)))
      .get();
    if (existing && existing.status === 'active') {
      return fail('Check the highlighted fields.', {
        email: 'Someone with this email is already active. Edit their access instead.',
      });
    }

    const token = newToken();
    const id = newId('inv');
    db.insert(invitations)
      .values({
        id,
        organizationId: session.user.organizationId,
        email: data.email,
        name: data.name,
        tokenHash: sha256(token),
        roleId: role.id,
        propertyIds: JSON.stringify(role.scope === 'organization' ? [] : data.propertyIds),
        teamId: data.teamId ?? null,
        discountLimitPercent: discountLimit,
        invitedByUserId: session.user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      })
      .run();

    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'user.invited',
      entityType: 'invitation',
      entityId: id,
      summary: `Invited ${data.email} as ${role.name}${data.propertyIds.length ? ` for ${data.propertyIds.length} property(ies)` : ' (organization-wide)'}`,
      severity: 'warning',
    });
    trackEvent('user_invited', { organizationId: session.user.organizationId, userId: session.user.id }, { roleKey: data.roleKey });

    revalidatePath('/settings/users');
    return ok({ link: `/accept-invite?token=${token}`, email: data.email });
  } catch (err) {
    if (err instanceof LifecycleError) return fail(err.message, err.field ? { [err.field]: err.message } : undefined);
    return failFrom(err);
  }
}

export async function resendInvitationAction(invitationId: string): Promise<ActionResult<{ link: string }>> {
  try {
    const session = await requireSession();
    requirePermission(session, 'user.manage');

    const invite = db
      .select()
      .from(invitations)
      .where(
        and(eq(invitations.id, invitationId), eq(invitations.organizationId, session.user.organizationId)),
      )
      .get();
    if (!invite) return fail('Invitation not found.');
    if (invite.acceptedAt) return fail('That invitation has already been accepted.');

    // Re-issuing mints a new token and invalidates the previous link.
    const token = newToken();
    db.update(invitations)
      .set({
        tokenHash: sha256(token),
        revokedAt: null,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      })
      .where(eq(invitations.id, invite.id))
      .run();

    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'user.invitation_resent',
      entityType: 'invitation',
      entityId: invite.id,
      summary: `Reissued the invitation for ${invite.email}; the previous link no longer works`,
      severity: 'warning',
    });

    revalidatePath('/settings/users');
    return ok({ link: `/accept-invite?token=${token}` });
  } catch (err) {
    return failFrom(err);
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'user.manage');

    const invite = db
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, session.user.organizationId)))
      .get();
    if (!invite) return fail('Invitation not found.');

    db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, invite.id)).run();
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'user.invitation_revoked',
      entityType: 'invitation',
      entityId: invite.id,
      summary: `Revoked the invitation for ${invite.email}`,
      severity: 'warning',
    });

    revalidatePath('/settings/users');
    return ok();
  } catch (err) {
    return failFrom(err);
  }
}

/**
 * Suspension and deactivation revoke every live session immediately, which is
 * what makes the "old cookie stops working" acceptance criterion true (FR-02).
 */
export async function setUserStatusAction(
  userId: string,
  status: 'active' | 'suspended' | 'deactivated',
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'user.manage');

    const target = db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, session.user.organizationId)))
      .get();
    if (!target) return fail('User not found.');

    assertCanChangeStatus(session, userId, status);

    db.update(users)
      .set({
        status,
        deactivatedAt: status === 'deactivated' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .run();

    if (status !== 'active') revokeAllSessionsForUser(userId);

    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: `user.${status}`,
      entityType: 'user',
      entityId: userId,
      summary:
        status === 'active'
          ? `Reactivated ${target.name} (${target.email})`
          : `${status === 'suspended' ? 'Suspended' : 'Deactivated'} ${target.name} (${target.email}); all sessions revoked`,
      before: { status: target.status },
      after: { status },
      severity: 'warning',
    });
    trackEvent(status === 'suspended' ? 'user_suspended' : status === 'active' ? 'user_activated' : 'user_deactivated', {
      organizationId: session.user.organizationId,
      userId: session.user.id,
    });

    revalidatePath('/settings/users');
    return ok();
  } catch (err) {
    if (err instanceof LifecycleError) return fail(err.message);
    return failFrom(err);
  }
}

const accessSchema = z.object({
  userId: z.string().min(1),
  roleKey: z.enum(ROLE_KEYS),
  propertyIds: z.array(z.string()).default([]),
  teamId: z.string().optional(),
  discountLimitPercent: z.coerce.number().min(0).max(100).default(0),
  canApproveDiscountUpToPercent: z.coerce.number().min(0).max(100).default(0),
});

export async function updateUserAccessAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'user.manage');

    const parsed = accessSchema.safeParse({
      userId: formData.get('userId'),
      roleKey: formData.get('roleKey'),
      propertyIds: formData.getAll('propertyIds').map(String).filter(Boolean),
      teamId: formData.get('teamId') || undefined,
      discountLimitPercent: formData.get('discountLimitPercent') ?? 0,
      canApproveDiscountUpToPercent: formData.get('canApproveDiscountUpToPercent') ?? 0,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
      return fail('Check the highlighted fields.', fieldErrors);
    }
    const data = parsed.data;

    const target = db
      .select()
      .from(users)
      .where(and(eq(users.id, data.userId), eq(users.organizationId, session.user.organizationId)))
      .get();
    if (!target) return fail('User not found.');

    const role = systemRole(data.roleKey as RoleKey);
    if (role.scope === 'property' && data.propertyIds.length === 0) {
      return fail('Check the highlighted fields.', { propertyIds: 'Choose at least one property for this role.' });
    }
    assertCanGrantOn(session, role.scope === 'organization' ? [null] : data.propertyIds);

    // Demoting the last admin would lock the tenant out of its own settings.
    const wasOrgAdmin = db
      .select({ key: roles.key })
      .from(userPropertyRoles)
      .innerJoin(roles, eq(roles.id, userPropertyRoles.roleId))
      .where(eq(userPropertyRoles.userId, data.userId))
      .all()
      .some((r) => r.key === 'org_admin');
    if (wasOrgAdmin && data.roleKey !== 'org_admin') {
      const { assertCanRemoveAdminGrant } = await import('@/server/services/user-admin');
      assertCanRemoveAdminGrant(session, data.userId);
    }

    const discountLimit = clampDiscountAuthority(session, data.discountLimitPercent);
    const approvalCeiling = clampDiscountAuthority(
      session,
      Math.min(data.canApproveDiscountUpToPercent, defaultApprovalCeiling(data.roleKey as RoleKey)),
    );

    const before = { roleKey: wasOrgAdmin ? 'org_admin' : undefined, limit: target.discountLimitPercent };

    replaceGrants({
      organizationId: session.user.organizationId,
      userId: data.userId,
      roleId: role.id,
      roleScope: role.scope as 'organization' | 'property',
      propertyIds: data.propertyIds,
      teamId: data.teamId ?? null,
    });

    db.update(users)
      .set({
        discountLimitPercent: discountLimit,
        canApproveDiscountUpToPercent: approvalCeiling,
        updatedAt: new Date(),
      })
      .where(eq(users.id, data.userId))
      .run();

    // The next request re-reads permissions, so a role change takes effect immediately.
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'user.access_changed',
      entityType: 'user',
      entityId: data.userId,
      summary: `${target.name} is now ${role.name}${data.propertyIds.length ? ` on ${data.propertyIds.length} property(ies)` : ' organization-wide'}, discount limit ${discountLimit}%`,
      before,
      after: { roleKey: data.roleKey, propertyIds: data.propertyIds, limit: discountLimit, approvalCeiling },
      severity: 'warning',
    });

    revalidatePath('/settings/users');
    return ok();
  } catch (err) {
    if (err instanceof LifecycleError) return fail(err.message, err.field ? { [err.field]: err.message } : undefined);
    return failFrom(err);
  }
}
