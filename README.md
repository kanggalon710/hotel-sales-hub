# Hotel Sales & Guest Relationship Hub

Chatwoot-integrated hotel sales CRM, built from `PRD-CRM-Hotel-Chatwoot.md`.

A hotel defines its own rooms and rates, an inquiry arriving in Chatwoot becomes
a lead, the lead moves through a configurable pipeline to a confirmed
reservation, and the relationship continues after the guest checks out.

- **Concept & boundaries:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **PRD → code:** [docs/TRACEABILITY.md](docs/TRACEABILITY.md)
- **Design system & responsive contract:** [docs/DESIGN.md](docs/DESIGN.md)
- **Connecting a real Chatwoot:** [docs/CHATWOOT-INTEGRATION.md](docs/CHATWOOT-INTEGRATION.md)
- **Room inventory & after-stay:** [docs/HOTEL-INVENTORY-AND-AFTERSALES.md](docs/HOTEL-INVENTORY-AND-AFTERSALES.md)
- **Configurable pipelines:** [docs/PIPELINE-CONFIGURABILITY.md](docs/PIPELINE-CONFIGURABILITY.md)
- **Defect audit (EN + ID):** [docs/AUDIT.md](docs/AUDIT.md)

## Run the demo tenant

```bash
cd web && npm install && npm run db:migrate && npm run db:seed && npm run dev
```

Open http://localhost:3000 and sign in with any seeded account (password `Passw0rd!2026`):

| Email | Role | What you will see |
|---|---|---|
| admin@nusantara-hotels.test | Organization Admin | Everything, both properties |
| manager@nusantara-hotels.test | Sales Manager | Pipeline, approvals queue |
| agent@nusantara-hotels.test | Sales Agent | Own leads, availability, quotations |
| reservations@nusantara-hotels.test | Reservation / Front Office | Handoff queue with confirm/hold/reject/alternative |
| analyst@nusantara-hotels.test | Analyst | Reports; guest PII masked |

The demo carries two properties on purpose: **The Kalyana Jakarta** owns its
inventory in the CRM, so Settings → Rooms & Rates is editable there, while
**Amanaya Bali Resort** mirrors a PMS and is read-only.

`npm run db:reset:demo` wipes and rebuilds the demo tenant. Rebuilding signs
everyone out, because sessions live in the database.

## Run a real deployment

`db:seed` builds the **demo** tenant and is wrong for a live deployment: it
ships fabricated properties, inbox mappings and a sandbox Chatwoot connection
that a real connection would then inherit. Use `db:bootstrap` instead — it
creates the system roles, one organization and one administrator, and nothing
else.

```bash
cd web && npm run db:migrate
ORG_NAME="Your Group" ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" npm run db:bootstrap
```

It refuses to run on a database that already has an organization, and prints a
one-time password when `ADMIN_PASSWORD` is not supplied, so no password has to
be typed into a shell history.

## Tests

```bash
npm run test:ingest   # 37 checks — the Chatwoot connector against real payload shapes
npm run e2e           # 23 checks — one full lifecycle through the production code paths
```

`test:ingest` replays captured Chatwoot payloads in **both** shapes it actually
sends. `message_created` wraps each part as an object; the `conversation_*`
events spread conversation attributes across the payload root, putting the guest
at `meta.sender` and the inbox at `inbox_id`. Reading only the first shape meant
real conversations never became leads — see [docs/AUDIT.md](docs/AUDIT.md).

`e2e` walks a single guest from an inbound WhatsApp message to a win-back task:
inventory, inbox mapping, lead creation, pipeline gates, availability from the
hotel's own allotment, quotation, reservation, allotment decrement, and the
after-stay sweep.

Neither suite stops at the first failing step, so one dead end cannot hide the
next.

## Try the integration locally

```bash
CONN=$(sqlite3 web/data/crm.sqlite "select id from integration_connections where provider='chatwoot'")
curl -X POST "http://localhost:3000/api/webhooks/chatwoot/$CONN?token=whsec_demo_nusantara" \
  -H 'Content-Type: application/json' \
  -d '{"event":"conversation_created","id":1,"inbox_id":11,"channel":"Channel::Whatsapp",
       "status":"open","account_id":1,
       "meta":{"sender":{"id":5001,"name":"Test Guest","phone_number":"0812-0000-0001","type":"contact"}}}'
```

That is the flat shape a real Chatwoot sends for conversation events. Send it
twice and the second response is `status: "duplicate"` — deduplication keys on
the conversation, not the clock, so a redelivery cannot create a second lead.

To see the dead-letter path, send a **different** conversation from an unmapped
inbox. Changing `inbox_id` alone is not enough: the same `id` is still the same
conversation, so it would be deduplicated instead.

```bash
curl -X POST "http://localhost:3000/api/webhooks/chatwoot/$CONN?token=whsec_demo_nusantara" \
  -H 'Content-Type: application/json' \
  -d '{"event":"conversation_created","id":2,"inbox_id":19,"channel":"Channel::Whatsapp",
       "status":"open","account_id":1,
       "meta":{"sender":{"id":5002,"name":"Unmapped Guest","phone_number":"0812-0000-0002","type":"contact"}}}'
```

It lands in the dead-letter queue at `/integrations/health` naming the inbox and
the exact fix.

The endpoint fails closed: no token is `401`, an unreadable secret is `503`
naming `CRM_SECRET_KEY`, and a wrong token is `401`.

The CRM panel Chatwoot embeds is `/panel?conversation=<chatwoot conversation id>`.

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_FILE` | SQLite path | `./data/crm.sqlite` |
| `CRM_SECRET_KEY` | AES key for stored secrets (≥ 32 chars). **Required in production.** | dev fallback |
| `CHATWOOT_LIVE` | `1` to call the real Chatwoot API from the outbound queue | simulated |
| `APP_URL` | Overrides the public origin used to build the webhook URL | derived from request headers |

`APP_URL` is only needed when TLS terminates somewhere the request headers do
not describe. Left unset, the origin comes from `x-forwarded-host` and
`x-forwarded-proto`, so a deployment behind a reverse proxy shows the right
webhook URL with no configuration.
