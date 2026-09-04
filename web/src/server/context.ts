import 'server-only';
import { cookies } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { leads } from '@/db';
import type { Permission } from '@/lib/constants';
import { getSession, PROPERTY_COOKIE, type PropertyAccess, type Session } from './auth';
import { writeAudit } from './audit';

export type { Session, PropertyAccess };

export class AccessError extends Error {
  constructor(
    message: string,
    readonly permission?: Permission,
  ) {
    super(message);
    this.name = 'AccessError';
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.mustChangePassword) redirect('/change-password');
  return session;
}

/** Session without the forced-password-change redirect, for that screen itself. */
export async function requireRawSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export function can(session: Session, permission: Permission) {
  return session.permissions.has(permission);
}

export function canAny(session: Session, ...permissions: Permission[]) {
  return permissions.some((p) => session.permissions.has(p));
}

/** Page-level guard. Renders the app's forbidden boundary rather than leaking data. */
export function requirePermission(session: Session, permission: Permission) {
  if (!session.permissions.has(permission)) {
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'access.denied',
      entityType: 'permission',
      entityId: permission,
      summary: `Blocked ${session.user.email} from an action requiring "${permission}"`,
      severity: 'warning',
    });
    forbidden();
  }
}

/* --------------------------- Property scoping --------------------------- */

export type PropertyScope = {
  /** Selected property, or null when the user is viewing all permitted properties. */
  currentPropertyId: string | null;
  current: PropertyAccess | null;
  /** Every property the caller may read — the only ids a query may ever touch. */
  permittedIds: string[];
  /** Ids in effect for the current view. */
  scopedIds: string[];
  all: PropertyAccess[];
  isAllView: boolean;
};

/**
 * Resolves the Current Property selection (PRD 8.2). An unknown or unpermitted
 * cookie value degrades to "all permitted" instead of leaking another tenant's
 * property, and every query uses `scopedIds`.
 */
export async function getPropertyScope(session: Session): Promise<PropertyScope> {
  const jar = await cookies();
  const raw = jar.get(PROPERTY_COOKIE)?.value ?? null;
  const permittedIds = session.propertyAccess.map((p) => p.propertyId);
  const selected =
    raw && raw !== 'all' ? (session.propertyAccess.find((p) => p.propertyId === raw) ?? null) : null;

  return {
    currentPropertyId: selected?.propertyId ?? null,
    current: selected,
    permittedIds,
    scopedIds: selected ? [selected.propertyId] : permittedIds,
    all: session.propertyAccess,
    isAllView: !selected,
  };
}

/** Server-side tenant + property check. UI hiding is never the control (PRD 9.1). */
export function assertPropertyAccess(session: Session, propertyId: string) {
  const ok = session.propertyAccess.some((p) => p.propertyId === propertyId);
  if (!ok) {
    writeAudit({
      organizationId: session.user.organizationId,
      propertyId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'access.denied.property',
      entityType: 'property',
      entityId: propertyId,
      summary: `Blocked ${session.user.email} from property ${propertyId} (outside granted scope)`,
      severity: 'warning',
    });
    throw new AccessError('You do not have access to this property.');
  }
}

export type LeadVisibility = 'all' | 'assigned' | 'limited' | 'none';

export function leadVisibility(session: Session): LeadVisibility {
  if (session.permissions.has('lead.read.all')) return 'all';
  if (session.permissions.has('lead.read.assigned')) return 'assigned';
  if (session.permissions.has('lead.read.limited')) return 'limited';
  return 'none';
}

/**
 * SQL predicate implementing tenant isolation + property scope + row visibility.
 * Returns null when the caller may see nothing at all.
 */
export function leadScopeWhere(session: Session, scope: PropertyScope): SQL | null {
  const visibility = leadVisibility(session);
  if (visibility === 'none' || scope.scopedIds.length === 0) return null;

  const base = and(
    eq(leads.organizationId, session.user.organizationId),
    inArray(leads.propertyId, scope.scopedIds),
  )!;

  if (visibility === 'all') return base;

  if (visibility === 'assigned') {
    const teamIds = session.propertyAccess.map((p) => p.teamId).filter((t): t is string => Boolean(t));
    const own = or(
      eq(leads.ownerUserId, session.user.id),
      isNull(leads.ownerUserId), // unassigned inquiries stay claimable
      ...(teamIds.length ? [inArray(leads.teamId, teamIds)] : []),
    )!;
    return and(base, own)!;
  }

  // Reservation/FO and guest relations: leads that have reached commercial handoff.
  return and(
    base,
    inArray(leads.stage, ['availability_checked', 'quotation_sent', 'follow_up', 'deposit_pending', 'confirmed']),
  )!;
}

/* ------------------------------ PII masking ----------------------------- */

export type PiiLevel = 'full' | 'scoped' | 'masked';

/**
 * PRD 9.2 grants three levels. `scoped` shows guest contact details on records
 * the caller may already access; `masked` (Analyst) never reveals them.
 */
export function piiLevel(session: Session): PiiLevel {
  if (session.permissions.has('guest.pii.full')) return 'full';
  if (session.permissions.has('guest.pii.scoped')) return 'scoped';
  return 'masked';
}

export function maskPhone(phone: string | null | undefined, level: PiiLevel) {
  if (!phone) return '–';
  if (level !== 'masked') return phone;
  const tail = phone.slice(-3);
  return `${phone.slice(0, 3)}${'•'.repeat(Math.max(3, phone.length - 6))}${tail}`;
}

export function maskEmail(email: string | null | undefined, level: PiiLevel) {
  if (!email) return '–';
  if (level !== 'masked') return email;
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(3, local.length - 1))}@${domain}`;
}

export function maskName(name: string, level: PiiLevel) {
  if (level !== 'masked') return name;
  const parts = name.trim().split(/\s+/);
  return parts.map((p, i) => (i === 0 ? p : `${p[0]}.`)).join(' ');
}
