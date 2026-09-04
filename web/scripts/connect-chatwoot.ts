/**
 * Points the CRM at a real Chatwoot account and prints the webhook URL to paste
 * back into it. Idempotent: run it again to rotate the token or change the URL.
 *
 *   CHATWOOT_BASE_URL=https://chatwoot.example.com \
 *   CHATWOOT_ACCOUNT_ID=1 \
 *   CHATWOOT_API_TOKEN=... \
 *   APP_URL=https://crm.example.com \
 *   npm run chatwoot:connect
 *
 * Nothing is written to Chatwoot. This only prepares the CRM side; the runbook
 * in docs/CHATWOOT-INTEGRATION.md lists what a human must create over there.
 */
import { eq, and } from 'drizzle-orm';
import { encryptSecret, newId, newToken } from '../src/server/crypto.ts';
import * as s from './db.ts';
import { db } from './db.ts';

const baseUrl = (process.env.CHATWOOT_BASE_URL ?? '').replace(/\/$/, '');
const accountId = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const apiToken = process.env.CHATWOOT_API_TOKEN ?? '';
const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const label = process.env.CHATWOOT_LABEL ?? 'Chatwoot';

if (!baseUrl) {
  console.error('CHATWOOT_BASE_URL is required, for example https://chatwoot.example.com');
  process.exit(1);
}

const org = db.select().from(s.organizations).get();
if (!org) {
  console.error('No organization found. Run `npm run db:seed` first.');
  process.exit(1);
}

const existing = db
  .select()
  .from(s.integrationConnections)
  .where(
    and(
      eq(s.integrationConnections.organizationId, org.id),
      eq(s.integrationConnections.provider, 'chatwoot'),
    ),
  )
  .get();

// The secret is shown once here and stored encrypted; it is never readable again.
const webhookSecret = process.env.CHATWOOT_WEBHOOK_SECRET ?? `whsec_${newToken().slice(0, 32)}`;

const values = {
  organizationId: org.id,
  provider: 'chatwoot',
  adapter: 'chatwoot',
  label,
  baseUrl,
  externalAccountId: accountId,
  webhookSecretCiphertext: encryptSecret(webhookSecret),
  status: apiToken ? 'degraded' : 'action_required',
  statusReason: apiToken
    ? 'Connected. Mappings and custom attributes still need to be created in Chatwoot.'
    : 'No API token stored, so outbound writes back to Chatwoot are disabled.',
  active: true,
  updatedAt: new Date(),
  ...(apiToken
    ? { apiTokenCiphertext: encryptSecret(apiToken), apiTokenLast4: apiToken.slice(-4) }
    : {}),
};

let connectionId: string;
if (existing) {
  connectionId = existing.id;
  db.update(s.integrationConnections).set(values).where(eq(s.integrationConnections.id, existing.id)).run();
  console.log(`Updated existing Chatwoot connection ${connectionId}`);
} else {
  connectionId = newId('con');
  db.insert(s.integrationConnections).values({ id: connectionId, ...values }).run();
  console.log(`Created Chatwoot connection ${connectionId}`);
}

console.log('');
console.log('  Base URL   ', baseUrl);
console.log('  Account    ', accountId);
console.log('  API token  ', apiToken ? `stored, ending ${apiToken.slice(-4)}` : 'NOT SET (outbound writes disabled)');
console.log('');
console.log('  Paste this into Chatwoot -> Settings -> Integrations -> Webhooks:');
console.log(`    ${appUrl}/api/webhooks/chatwoot/${connectionId}?token=${webhookSecret}`);
console.log('');
console.log('  Subscribe it to these events (PRD 10.3):');
for (const e of [
  'conversation_created', 'conversation_updated', 'conversation_status_changed',
  'message_created', 'contact_created', 'contact_updated',
]) {
  console.log(`    - ${e}`);
}
console.log('');
console.log('  The webhook secret is shown once. Store it now if you need it again.');
console.log('  Next: map each inbox to a property under Integrations -> Mappings in the CRM.');
