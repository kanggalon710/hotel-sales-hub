import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { and, eq, isNull, or } from 'drizzle-orm';
import {
  db, organizations, properties, rolePermissions, roles, sessions, userPropertyRoles, users,
} from '@/db';
import type { Permission, RoleKey } from '@/lib/constants';
import { newId, newToken, sha256 } from './crypto';
import { writeAudit } from './audit';

export const SESSION_COOKIE = 'crm_session';
export const PROPERTY_COOKIE = 'crm_property';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type PropertyAccess = {
  propertyId: string;
  propertyName: string;
  propertyCode: string;
  roleKey: RoleKey;
  roleName: string;
  teamId: string | null;
};

export type Session = {
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
    organizationId: string;
    jobTitle: string | null;
    mustChangePassword: boolean;
    discountLimitPercent: number;
    canApproveDiscountUpToPercent: number;
  };
  organization: {
    id: string;
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    taxPercent: number;
    servicePercent: number;
    quotationValidityHours: number;
    firstResponseSlaMinutes: number;
    availabilityStaleAfterMinutes: number;
  };
  /** Org-wide roles (property_id IS NULL) plus every per-property grant. */
  orgRoleKeys: RoleKey[];
  propertyAccess: PropertyAccess[];
  permissions: Set<Permission>;
};

export async function createSession(userId: string) {
  const token = newToken();
  const hdrs = await headers();
  db.insert(sessions)
    .values({
      id: newId('ses'),
      userId,
      tokenHash: sha256(token),
      ip: hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: hdrs.get('user-agent')?.slice(0, 400) ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      lastSeenAt: new Date(),
    })
    .run();

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token))).run();
  }
  jar.delete(SESSION_COOKIE);
}

/** Suspend/deactivate must invalidate every live session (PRD 9.3 rule 5, FR-02). */
export function revokeAllSessionsForUser(userId: string) {
  db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .run();
}

/**
 * Resolves the caller. Deduped per request via React cache so a page can ask
 * repeatedly without extra queries. Status is re-read every time, so a
 * suspended user's existing cookie stops working immediately.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      jobTitle: users.jobTitle,
      mustChangePassword: users.mustChangePassword,
      discountLimitPercent: users.discountLimitPercent,
      canApproveDiscountUpToPercent: users.canApproveDiscountUpToPercent,
      organizationId: users.organizationId,
      orgName: organizations.name,
      currency: organizations.currency,
      locale: organizations.locale,
      timezone: organizations.timezone,
      taxPercent: organizations.taxPercent,
      servicePercent: organizations.servicePercent,
      quotationValidityHours: organizations.quotationValidityHours,
      firstResponseSlaMinutes: organizations.firstResponseSlaMinutes,
      availabilityStaleAfterMinutes: organizations.availabilityStaleAfterMinutes,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .get();

  if (!row) return null;
  if (row.revokedAt || row.expiresAt.getTime() < Date.now() || row.status !== 'active') return null;

  const grants = db
    .select({
      propertyId: userPropertyRoles.propertyId,
      teamId: userPropertyRoles.teamId,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
      propertyName: properties.name,
      propertyCode: properties.code,
      propertyActive: properties.active,
    })
    .from(userPropertyRoles)
    .innerJoin(roles, eq(roles.id, userPropertyRoles.roleId))
    .leftJoin(properties, eq(properties.id, userPropertyRoles.propertyId))
    .where(eq(userPropertyRoles.userId, row.userId))
    .all();

  const permissions = new Set<Permission>();
  if (grants.length) {
    const perms = db
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(or(...grants.map((g) => eq(rolePermissions.roleId, g.roleId))))
      .all();
    for (const p of perms) permissions.add(p.permission as Permission);
  }

  const orgRoleKeys = grants.filter((g) => !g.propertyId).map((g) => g.roleKey as RoleKey);
  const orgWide = orgRoleKeys.length > 0;

  // An organization-scoped grant implies access to every active property in the tenant.
  const allProps = orgWide
    ? db
        .select({ id: properties.id, name: properties.name, code: properties.code })
        .from(properties)
        .where(and(eq(properties.organizationId, row.organizationId), eq(properties.active, true)))
        .all()
    : [];

  const access = new Map<string, PropertyAccess>();
  for (const g of grants) {
    if (!g.propertyId || !g.propertyActive) continue;
    access.set(g.propertyId, {
      propertyId: g.propertyId,
      propertyName: g.propertyName ?? 'Unknown property',
      propertyCode: g.propertyCode ?? '–',
      roleKey: g.roleKey as RoleKey,
      roleName: g.roleName,
      teamId: g.teamId,
    });
  }
  if (orgWide) {
    const orgGrant = grants.find((g) => !g.propertyId)!;
    for (const p of allProps) {
      if (!access.has(p.id)) {
        access.set(p.id, {
          propertyId: p.id,
          propertyName: p.name,
          propertyCode: p.code,
          roleKey: orgGrant.roleKey as RoleKey,
          roleName: orgGrant.roleName,
          teamId: null,
        });
      }
    }
  }

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      name: row.name,
      email: row.email,
      organizationId: row.organizationId,
      jobTitle: row.jobTitle,
      mustChangePassword: row.mustChangePassword,
      discountLimitPercent: row.discountLimitPercent,
      canApproveDiscountUpToPercent: row.canApproveDiscountUpToPercent,
    },
    organization: {
      id: row.organizationId,
      name: row.orgName,
      currency: row.currency,
      locale: row.locale,
      timezone: row.timezone,
      taxPercent: row.taxPercent,
      servicePercent: row.servicePercent,
      quotationValidityHours: row.quotationValidityHours,
      firstResponseSlaMinutes: row.firstResponseSlaMinutes,
      availabilityStaleAfterMinutes: row.availabilityStaleAfterMinutes,
    },
    orgRoleKeys,
    propertyAccess: [...access.values()].sort((a, b) => a.propertyName.localeCompare(b.propertyName)),
    permissions,
  };
});

export function touchSession(sessionId: string) {
  db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId)).run();
}

export function logSecurityEvent(
  action: string,
  summary: string,
  ctx: { organizationId?: string | null; actorUserId?: string | null; actorName?: string | null } = {},
) {
  writeAudit({
    ...ctx,
    action,
    entityType: 'security',
    summary,
    severity: 'warning',
    actorType: ctx.actorUserId ? 'user' : 'system',
  });
}
