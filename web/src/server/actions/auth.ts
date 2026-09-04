'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, invitations, roles, userPropertyRoles, users } from '@/db';
import {
  createSession, destroyCurrentSession, getSession, logSecurityEvent,
  PROPERTY_COOKIE, revokeAllSessionsForUser,
} from '@/server/auth';
import { hashPassword, newId, sha256, verifyPassword } from '@/server/crypto';
import { trackEvent, writeAudit } from '@/server/audit';
import { rateLimit, resetRateLimit } from '@/server/rate-limit';
import { fail, ok, type ActionResult } from '@/server/result';
import { parseJson } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export async function loginAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return fail('Check the highlighted fields.', fieldErrors);
  }

  const email = parsed.data.email.toLowerCase();
  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

  // Throttle per identity and per source to blunt credential stuffing.
  for (const key of [`login:${email}`, `login-ip:${ip}`]) {
    const limited = rateLimit(key, 8, 10 * 60_000);
    if (!limited.allowed) {
      logSecurityEvent('auth.login.throttled', `Login throttled for ${email} from ${ip}`);
      return fail('Too many attempts. Wait a few minutes and try again.');
    }
  }

  const user = db.select().from(users).where(eq(users.email, email)).get();

  // One generic message either way, so the form never confirms which emails exist.
  const invalid = fail('Email or password is incorrect.');
  if (!user) {
    logSecurityEvent('auth.login.failed', `Login attempt for unknown address ${email} from ${ip}`);
    return invalid;
  }
  if (!verifyPassword(parsed.data.password, user.passwordHash)) {
    logSecurityEvent('auth.login.failed', `Wrong password for ${email} from ${ip}`, {
      organizationId: user.organizationId, actorUserId: user.id, actorName: user.name,
    });
    return invalid;
  }
  if (user.status === 'invited') {
    return fail('Your account has not been activated yet. Use the invitation link that was emailed to you.');
  }
  if (user.status !== 'active') {
    logSecurityEvent('auth.login.blocked', `Blocked sign-in for ${user.status} account ${email}`, {
      organizationId: user.organizationId, actorUserId: user.id, actorName: user.name,
    });
    return fail('This account is not active. Contact your administrator.');
  }

  resetRateLimit(`login:${email}`);
  await createSession(user.id);
  db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)).run();
  writeAudit({
    organizationId: user.organizationId, actorUserId: user.id, actorName: user.name,
    action: 'auth.login', entityType: 'session',
    summary: `${user.name} signed in`, ip,
  });
  trackEvent('user_signed_in', { organizationId: user.organizationId, userId: user.id });

  redirect(user.mustChangePassword ? '/change-password' : '/');
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    writeAudit({
      organizationId: session.user.organizationId, actorUserId: session.user.id,
      actorName: session.user.name, action: 'auth.logout', entityType: 'session',
      summary: `${session.user.name} signed out`,
    });
  }
  await destroyCurrentSession();
  redirect('/login');
}

/** Current Property selection (PRD 8.2). Rejects anything outside granted scope. */
export async function setCurrentPropertyAction(propertyId: string) {
  const session = await getSession();
  if (!session) return fail('Your session has expired. Sign in again.');
  if (propertyId !== 'all' && !session.propertyAccess.some((p) => p.propertyId === propertyId)) {
    logSecurityEvent('access.denied.property', `Property switch rejected for ${session.user.email}`, {
      organizationId: session.user.organizationId, actorUserId: session.user.id, actorName: session.user.name,
    });
    return fail('You do not have access to that property.');
  }
  const jar = await cookies();
  jar.set(PROPERTY_COOKIE, propertyId, { path: '/', sameSite: 'lax', maxAge: 90 * 86_400 });
  return ok();
}

const passwordPolicy = z
  .string()
  .min(12, 'Use at least 12 characters')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[0-9]/, 'Include a number');

export async function changePasswordAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail('Your session has expired. Sign in again.');

  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  const user = db.select().from(users).where(eq(users.id, session.user.id)).get();
  if (!user) return fail('Account not found.');
  if (!verifyPassword(current, user.passwordHash)) {
    return fail('Check the highlighted fields.', { currentPassword: 'That is not your current password.' });
  }
  const parsed = passwordPolicy.safeParse(next);
  if (!parsed.success) {
    return fail('Check the highlighted fields.', { newPassword: parsed.error.issues[0].message });
  }
  if (next !== confirm) {
    return fail('Check the highlighted fields.', { confirmPassword: 'The two passwords do not match.' });
  }
  if (verifyPassword(next, user.passwordHash)) {
    return fail('Check the highlighted fields.', { newPassword: 'Choose a password you have not used here before.' });
  }

  db.update(users)
    .set({ passwordHash: hashPassword(next), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .run();

  // Every other device is signed out, then this one gets a fresh session.
  revokeAllSessionsForUser(user.id);
  await createSession(user.id);
  writeAudit({
    organizationId: user.organizationId, actorUserId: user.id, actorName: user.name,
    action: 'user.password_changed', entityType: 'user', entityId: user.id,
    summary: `${user.name} changed their password; other sessions revoked`, severity: 'warning',
  });
  redirect('/');
}

export async function acceptInvitationAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get('token') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (!token) return fail('This invitation link is not valid.');

  const invite = db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .get();

  if (!invite) return fail('This invitation is no longer valid. Ask your administrator to resend it.');
  if (invite.expiresAt.getTime() < Date.now()) {
    return fail('This invitation has expired. Ask your administrator to resend it.');
  }
  if (!name) return fail('Check the highlighted fields.', { name: 'Enter your full name' });

  const parsed = passwordPolicy.safeParse(password);
  if (!parsed.success) return fail('Check the highlighted fields.', { password: parsed.error.issues[0].message });
  if (password !== confirm) {
    return fail('Check the highlighted fields.', { confirmPassword: 'The two passwords do not match.' });
  }

  const existing = db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, invite.organizationId), eq(users.email, invite.email)))
    .get();

  const role = db.select().from(roles).where(eq(roles.id, invite.roleId)).get();
  const propertyIds = parseJson<string[]>(invite.propertyIds, []);
  const userId = existing?.id ?? newId('usr');

  if (existing) {
    db.update(users)
      .set({
        name, passwordHash: hashPassword(password), status: 'active',
        mustChangePassword: false, updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .run();
  } else {
    db.insert(users)
      .values({
        id: userId, organizationId: invite.organizationId, email: invite.email, name,
        passwordHash: hashPassword(password), status: 'active', mustChangePassword: false,
        discountLimitPercent: invite.discountLimitPercent,
      })
      .run();
  }

  const targets = role?.scope === 'organization' ? [null] : propertyIds;
  for (const propertyId of targets) {
    const dupe = db
      .select({ id: userPropertyRoles.id })
      .from(userPropertyRoles)
      .where(
        and(
          eq(userPropertyRoles.userId, userId),
          eq(userPropertyRoles.roleId, invite.roleId),
          propertyId ? eq(userPropertyRoles.propertyId, propertyId) : isNull(userPropertyRoles.propertyId),
        ),
      )
      .get();
    if (dupe) continue;
    db.insert(userPropertyRoles)
      .values({
        id: newId('upr'), organizationId: invite.organizationId, userId,
        propertyId, roleId: invite.roleId, teamId: invite.teamId,
      })
      .run();
  }

  db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id)).run();
  writeAudit({
    organizationId: invite.organizationId, actorUserId: userId, actorName: name,
    action: 'user.activated', entityType: 'user', entityId: userId,
    summary: `${name} (${invite.email}) activated their account as ${role?.name ?? 'user'}`,
  });
  trackEvent('user_activated', { organizationId: invite.organizationId, userId });

  await createSession(userId);
  redirect('/');
}
