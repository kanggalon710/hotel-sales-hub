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

**2. The CRM has no public address yet.** Chatwoot must reach the CRM over the network. Until the CRM is deployed behind a public URL, inbound events cannot arrive at all. This is the one true blocker; everything else below can be prepared first.

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

1. Deploy the CRM behind a public URL and set `APP_URL`.
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
