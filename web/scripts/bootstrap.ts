/**
 * Creates an empty, production tenant: the system roles, one organization, and
 * one administrator. Nothing else.
 *
 * `db:seed` builds the demo tenant, which is the right thing for a laptop and
 * the wrong thing for a live deployment: it ships fabricated properties, leads,
 * inbox mappings and a fake Chatwoot connection that a real connection would
 * then inherit. Use this instead when the deployment is meant to hold real data.
 *
 *   ORG_NAME="Arkanova Hospitality" \
 *   ADMIN_EMAIL=you@example.com \
 *   ADMIN_NAME="Your Name" \
 *   npm run db:bootstrap
 *
 * ADMIN_PASSWORD is optional. Leave it unset and a one-time password is
 * generated and printed, with a forced change at first login, so no password
 * has to be typed into a shell history.
 */
import { eq } from 'drizzle-orm';
import { hashPassword, newId, newToken } from '../src/server/crypto.ts';
import { ROLE_DEFINITIONS, ROLE_KEYS, type RoleKey } from '../src/lib/constants.ts';
import * as s from './db.ts';
import { db, raw } from './db.ts';

raw.pragma('foreign_keys = ON');

const orgName = process.env.ORG_NAME?.trim();
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminName = process.env.ADMIN_NAME?.trim();

if (!orgName || !adminEmail || !adminName) {
  console.error('ORG_NAME, ADMIN_EMAIL and ADMIN_NAME are all required.');
  process.exit(1);
}

if (db.select().from(s.organizations).get()) {
  console.error('This database already has an organization. Bootstrap refuses to run on a populated database.');
  console.error('To start over, delete the database file, run `npm run db:migrate`, then run this again.');
  process.exit(1);
}

const slug = (process.env.ORG_SLUG ?? orgName)
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// Roles are global (organizationId null) and only need provisioning once.
const roleIds = {} as Record<RoleKey, string>;
for (const key of ROLE_KEYS) {
  const existing = db.select().from(s.roles).where(eq(s.roles.key, key)).get();
  if (existing) { roleIds[key] = existing.id; continue; }
  const def = ROLE_DEFINITIONS[key];
  const id = newId('rol');
  roleIds[key] = id;
  db.insert(s.roles).values({
    id, organizationId: null, key, name: def.name,
    description: def.description, scope: def.scope, isSystem: true,
  }).run();
  for (const permission of def.permissions) {
    db.insert(s.rolePermissions).values({ id: newId('rpm'), roleId: id, permission }).run();
  }
}

const orgId = newId('org');
db.insert(s.organizations).values({
  id: orgId,
  name: orgName,
  slug,
  currency: process.env.ORG_CURRENCY ?? 'IDR',
  timezone: process.env.ORG_TIMEZONE ?? 'Asia/Jakarta',
  locale: process.env.ORG_LOCALE ?? 'id-ID',
  taxPercent: Number(process.env.ORG_TAX_PERCENT ?? 11),
  servicePercent: Number(process.env.ORG_SERVICE_PERCENT ?? 10),
  quotationValidityHours: 48,
  firstResponseSlaMinutes: 15,
  availabilityStaleAfterMinutes: 15,
}).run();

const supplied = process.env.ADMIN_PASSWORD;
const password = supplied ?? `${newToken().slice(0, 16)}Aa1!`;
const userId = newId('usr');
db.insert(s.users).values({
  id: userId, organizationId: orgId, email: adminEmail, name: adminName,
  jobTitle: process.env.ADMIN_TITLE ?? 'Administrator',
  passwordHash: hashPassword(password),
  status: 'active',
  mustChangePassword: !supplied,
  discountLimitPercent: 100,
  canApproveDiscountUpToPercent: 100,
}).run();

// null propertyId is the organization-wide grant.
db.insert(s.userPropertyRoles).values({
  id: newId('upr'), organizationId: orgId, userId, propertyId: null,
  roleId: roleIds.org_admin, teamId: null,
}).run();

console.log(`Organization  ${orgName}  (${orgId})`);
console.log(`Administrator ${adminEmail}`);
console.log(supplied
  ? '\nPassword: the one you supplied.'
  : `\nOne-time password: ${password}\nYou must change it at first login. It is not stored anywhere else.`);
console.log('\nNext: sign in, create your properties under Settings, then run `npm run chatwoot:connect`.');
