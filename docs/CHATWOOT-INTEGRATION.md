# Chatwoot integration runbook

Written against a live self-hosted instance, inspected 4 September 2026.
Host, account and agent details below are placeholders; substitute your own.

## What a fresh instance typically looks like

| Item | Value |
|---|---|
| Base URL | `https://chatwoot.example.com` |
| Deployment | Self-hosted (answers PRD open question 22.1) |
| Account id | `1` |
| Interface locale | Indonesian |
| Inboxes | **1** — id `2`, "Pararel", WhatsApp |
| Agents | **1** — one Administrator |
| Labels | **none** |
| Custom attributes | **none**, on either conversation or contact |
| Existing webhook | `http://127.0.0.1:8000/webhook/chatwoot`, subscribed to `message_created` only |

## Five gaps between that and what the CRM needs

**1. The existing webhook points at a laptop.** `127.0.0.1:8000` resolves to the Chatwoot server itself, so it reaches nothing. It is also subscribed to one event where the connector needs six. Leave it alone if another service owns it; the CRM adds its own endpoint rather than editing that one.

**2. The CRM must be reachable from Chatwoot.** Inbound events cannot arrive until the CRM answers on a public URL. Once it does, the webhook URL shown on the Integrations page is correct automatically: the origin is read from the request (`x-forwarded-host` / `x-forwarded-proto`), so a deployment behind nginx needs no configuration. Set `APP_URL` only to override that, for example when TLS terminates somewhere the headers do not describe.

Verify reachability before touching Chatwoot. A deployed endpoint answers with the CRM's own JSON, not an nginx error page:

```bash
curl -s -X POST https://<crm public url>/api/webhooks/chatwoot/con_probe \
  -H 'content-type: application/json' -d '{"event":"ping"}'
# {"ok":false,"error":"Unknown webhook endpoint."}   <- route is live
```

**3. No custom attributes exist.** PRD 10.5 names the keys the CRM writes back. They must be created in Chatwoot first, or every outbound write fails.

Conversation attributes:

| Key | Type |
|---|---|
| `crm_lead_id` | Text |
| `property_id` | Text |
| `inquiry_type` | List |
| `check_in` | Date |
| `check_out` | Date |
| `rooms` | Number |
| `adults` | Number |
| `children` | Number |
| `pipeline_stage` | List |
| `assigned_sales` | Text |
| `estimated_value` | Number |
| `quotation_id` | Text |
| `reservation_id` | Text |
| `next_follow_up_at` | Date |

Contact attributes:

| Key | Type |
|---|---|
| `crm_contact_id` | Text |
| `guest_tier` | List |
| `preferred_language` | Text |
| `corporate_account_id` | Text |
| `consent_status` | List |
| `last_stay_date` | Date |

**4. No labels.** With a single inbox this does not block anything: mark inbox `2` as a sales inbox in the CRM and every conversation there becomes a lead. Labels only matter once a non-sales inbox exists, at which point create `room-inquiry` and set it as that inbox's trigger label.

**5. No API access token issued.** Needed only for outbound writes (attributes, labels, quotation delivery). Inbound ingestion works without it. Create one under Profile Settings, Access Token.

## Order of work

0. Decide which tenant the deployment holds. `db:seed` builds the demo tenant and is wrong for a live deployment: it ships fabricated properties, inbox mappings and a sandbox Chatwoot connection, and `chatwoot:connect` updates that same connection row in place, so a real Chatwoot would inherit all of it. For a real deployment run `db:migrate` then `db:bootstrap`, which creates the system roles, one organization and one administrator and nothing else.

   ```bash
   ORG_NAME="Your Group" ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" npm run db:bootstrap
   ```

   It refuses to run on a database that already has an organization, and prints a one-time password when `ADMIN_PASSWORD` is not supplied.

1. Deploy the CRM behind a public URL, and confirm the probe above answers.
2. Create the custom attributes above in Chatwoot.
3. Issue an API access token.
4. Run the connector setup, which prints the webhook URL:

   ```bash
   CHATWOOT_BASE_URL=https://chatwoot.example.com \
   CHATWOOT_ACCOUNT_ID=1 \
   CHATWOOT_API_TOKEN=<token> \
   APP_URL=https://<crm public url> \
   npm run chatwoot:connect
   ```

5. Paste that URL into Chatwoot, Settings, Integrations, Webhooks, subscribed to all six events.
6. In the CRM, open Integrations, Mappings. Inbox `2` appears after the first event arrives. Map it to a property, set it as a sales inbox, and map that agent to a CRM user.
7. Set `CHATWOOT_LIVE=1` to switch the outbound queue from simulated to real delivery.

## What this changes about the demo tenant

Nothing until step 4 runs. The seeded connection stays a sandbox with its own inbox and agent mappings, so the app remains demoable offline. `npm run chatwoot:connect` updates that same connection row in place rather than creating a second one.

## Answered PRD open questions

- **22.1** Chatwoot is self-hosted at `chatwoot.example.com`.
- **22.2** One account (`1`) for this organization, so the single-account MVP shape holds.
- **22.3** One inbox today, WhatsApp, which becomes the sales inbox for the pilot property.

Still open, and needed before the commercial half can be piloted: which PMS/CRS (22.4), tax and discount authority (22.5), and who owns final confirmation (22.6).

## Going live: what the deployment changed

Publishing the CRM turned three of these from theory into things that had to be right.

| Was | Now |
|---|---|
| The Integrations page built the webhook URL from `APP_URL ?? 'http://localhost:3000'`. With `APP_URL` unset it showed a localhost URL that looked valid, would be pasted into Chatwoot, and would silently never deliver — the same failure as the pre-existing `127.0.0.1:8000` webhook. | The origin is derived from the request in `src/server/origin.ts`. `APP_URL` still wins when set. |
| Every outbound job was dispatched with `POST`. | The method travels with the route. Updating a contact is `PUT`; a `POST` there updates nothing. Conversation writes stay `POST`. |
| A failed outbound job recorded `Chatwoot responded 422`. | The refusal reason from the response body is recorded with it, so the dead-letter queue says which custom attribute or label is missing. |
| The property cookie was set without `secure`. | It matches the session cookie and is `secure` in production. |

`CHATWOOT_LIVE=1` is the switch between a simulated outbound queue and real API calls. Leave it off until the custom attributes exist in Chatwoot, otherwise every write fails on a missing attribute definition and lands in the dead-letter queue.
