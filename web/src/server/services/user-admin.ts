import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db, invitations, roles, teams, userPropertyRoles, users } from '@/db';
import { ROLE_DEFINITIONS, type RoleKey } from '@/lib/constants';
import type { Session } from '@/server/auth';

/**
 * Guards around the user lifecycle (PRD 9.3). These are invariants of the
 * organization, not UI conveniences, so they live next to the data and every
 * write path consults them.
 */

export class LifecycleError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
    this.name = 'LifecycleError';
  }
}

/** Users holding an org-scoped admin grant and still able to sign in. */
export function activeOrgAdmins(organizationId: string) {
  return db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(userPropertyRoles)
    .innerJoin(roles, eq(roles.id, userPropertyRoles.roleId))
    .innerJoin(users, eq(users.id, userPropertyRoles.userId))
    .where(
      and(
        eq(userPropertyRoles.organizationId, organizationId),
        eq(roles.key, 'org_admin'),
        eq(users.status, 'active'),
      ),
    )
    .all();
}

/**
 * PRD 9.3 rules 7 and 5: nobody removes themselves, and the last organization
 * admin cannot be stood down before a replacement exists — otherwise the tenant
 * becomes unadministrable.
 */
export function assertCanChangeStatus(session: Session, targetUserId: string, nextStatus: 'active' | 'suspended' | 'deactivated') {
  if (targetUserId === session.user.id && nextStatus !== 'active') {
    throw new LifecycleError('You cannot suspend or deactivate your own account.');
  }

  if (nextStatus === 'active') return;

  const admins = activeOrgAdmins(session.user.organizationId);
  const targetIsAdmin = admins.some((a) => a.userId === targetUserId);
  if (targetIsAdmin && admins.length <= 1) {
    throw new LifecycleError(
      'This is the last active organization admin. Promote another admin first, then retry.',
    );
  }
}

export function assertCanRemoveAdminGrant(session: Session, targetUserId: string) {
  const admins = activeOrgAdmins(session.user.organizationId);
  if (admins.length <= 1 && admins.some((a) => a.userId === targetUserId)) {
    throw new LifecycleError('The organization must keep at least one active admin.');
  }
}

/**
 * Property Admins may only administer the properties they hold (PRD 9.2 note *).
 * Org Admins are unrestricted within their tenant.
 */
export function assertCanGrantOn(session: Session, propertyIds: (string | null)[]) {
  const isOrgAdmin = session.orgRoleKeys.includes('org_admin');
  if (isOrgAdmin) return;

  if (propertyIds.some((p) => p === null)) {
    throw new LifecycleError('Only an organization admin can grant organization-wide roles.', 'roleKey');
  }
  const permitted = new Set(session.propertyAccess.map((p) => p.propertyId));
  const outside = propertyIds.filter((p): p is string => Boolean(p)).filter((p) => !permitted.has(p));
  if (outside.length) {
    throw new LifecycleError('You can only assign access to properties you administer.', 'propertyIds');
  }
}

/** A discount limit can never exceed the granter's own authority. */
export function clampDiscountAuthority(session: Session, requested: number) {
  const ceiling = session.orgRoleKeys.includes('org_admin') ? 100 : session.user.canApproveDiscountUpToPercent;
  if (requested > ceiling) {
    throw new LifecycleError(
      `You can grant a discount limit up to ${ceiling}%. Ask an organization admin for anything higher.`,
      'discountLimitPercent',
    );
  }
  return requested;
}

/** Approval authority defaults follow the role, not the individual. */
export function defaultApprovalCeiling(roleKey: RoleKey) {
  switch (roleKey) {
    case 'org_admin': return 100;
    case 'property_admin': return 30;
    case 'sales_manager': return 25;
    default: return 0;
  }
}

export function replaceGrants(input: {
  organizationId: string;
  userId: string;
  roleId: string;
  roleScope: 'organization' | 'property';
  propertyIds: string[];
  teamId: string | null;
}) {
  db.delete(userPropertyRoles)
    .where(
      and(
        eq(userPropertyRoles.userId, input.userId),
        eq(userPropertyRoles.organizationId, input.organizationId),
      ),
    )
    .run();

  const targets: (string | null)[] = input.roleScope === 'organization' ? [null] : input.propertyIds;
  for (const propertyId of targets) {
    db.insert(userPropertyRoles)
      .values({
        id: `upr_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
        organizationId: input.organizationId,
        userId: input.userId,
        propertyId,
        roleId: input.roleId,
        teamId: propertyId ? input.teamId : null,
      })
      .run();
  }
}

export function systemRole(key: RoleKey) {
  const role = db.select().from(roles).where(and(eq(roles.key, key), isNull(roles.organizationId))).get();
  if (!role) throw new LifecycleError(`Role "${key}" is not configured on this platform.`);
  return role;
}

export function roleCatalogue() {
  return db
    .select()
    .from(roles)
    .where(isNull(roles.organizationId))
    .all()
    .map((r) => ({
      ...r,
      permissions: ROLE_DEFINITIONS[r.key as RoleKey]?.permissions ?? [],
    }));
}

/** Users a property admin may see: everyone sharing at least one of their properties. */
export function visibleUsers(session: Session) {
  const isOrgAdmin = session.orgRoleKeys.includes('org_admin');
  const rows = db
    .select({
      id: users.id, name: users.name, email: users.email, status: users.status,
      jobTitle: users.jobTitle, lastLoginAt: users.lastLoginAt,
      discountLimitPercent: users.discountLimitPercent,
      canApproveDiscountUpToPercent: users.canApproveDiscountUpToPercent,
      createdAt: users.createdAt, mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.organizationId, session.user.organizationId))
    .all();

  const grants = db
    .select({
      userId: userPropertyRoles.userId,
      propertyId: userPropertyRoles.propertyId,
      roleKey: roles.key,
      roleName: roles.name,
      roleScope: roles.scope,
      teamName: teams.name,
    })
    .from(userPropertyRoles)
    .innerJoin(roles, eq(roles.id, userPropertyRoles.roleId))
    .leftJoin(teams, eq(teams.id, userPropertyRoles.teamId))
    .where(eq(userPropertyRoles.organizationId, session.user.organizationId))
    .all();

  const byUser = new Map<string, typeof grants>();
  for (const g of grants) {
    const list = byUser.get(g.userId) ?? [];
    list.push(g);
    byUser.set(g.userId, list);
  }

  const permitted = new Set(session.propertyAccess.map((p) => p.propertyId));

  return rows
    .map((u) => ({ ...u, grants: byUser.get(u.id) ?? [] }))
    .filter((u) => {
      if (isOrgAdmin) return true;
      // A property admin sees org-wide users read-only plus anyone on their properties.
      return u.grants.some((g) => g.propertyId === null || permitted.has(g.propertyId));
    });
}

export function pendingInvitations(organizationId: string) {
  return db
    .select({
      id: invitations.id, email: invitations.email, name: invitations.name,
      expiresAt: invitations.expiresAt, createdAt: invitations.createdAt,
      propertyIds: invitations.propertyIds, roleName: roles.name, roleKey: roles.key,
      invitedBy: users.name,
    })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .leftJoin(users, eq(users.id, invitations.invitedByUserId))
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .all();
}
