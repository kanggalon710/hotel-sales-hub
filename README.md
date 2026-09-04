# Hotel Sales & Guest Relationship Hub

Chatwoot-integrated hotel sales CRM, built from `PRD-CRM-Hotel-Chatwoot.md`.

- **Concept & boundaries:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **PRD → code:** [docs/TRACEABILITY.md](docs/TRACEABILITY.md)
- **Design system & responsive contract:** [docs/DESIGN.md](docs/DESIGN.md)
- **Connecting the real Chatwoot:** [docs/CHATWOOT-INTEGRATION.md](docs/CHATWOOT-INTEGRATION.md)
- **Configurable pipelines (plan):** [docs/PIPELINE-CONFIGURABILITY.md](docs/PIPELINE-CONFIGURABILITY.md)

## Run it

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

`npm run db:reset` wipes and reseeds. Reseeding signs everyone out (sessions live in the database).

## Try the integration

```bash
CONN=$(sqlite3 web/data/crm.sqlite "select id from integration_connections where provider='chatwoot'")
curl -X POST "http://localhost:3000/api/webhooks/chatwoot/$CONN?token=whsec_demo_nusantara" \
  -H 'Content-Type: application/json' \
  -d '{"event":"conversation_created","id":1,"created_at":"2026-09-03T10:00:00Z","account":{"id":1},
       "inbox":{"id":11,"name":"WhatsApp — Jakarta Sales","channel_type":"whatsapp"},
       "conversation":{"id":1,"status":"open","inbox_id":11,"labels":[]},
       "contact":{"id":5001,"name":"Test Guest","phone_number":"0812-0000-0001"},
       "content":"Ada kamar untuk tanggal 20?"}'
```

Send it twice: the second response is `status: "duplicate"`. Send it to inbox `19` (unmapped) and it lands in the dead-letter queue at `/integrations/health` with the exact fix.

The CRM panel Chatwoot embeds is `/panel?conversation=<chatwoot conversation id>`.

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_FILE` | SQLite path | `./data/crm.sqlite` |
| `CRM_SECRET_KEY` | AES key for stored secrets (≥ 32 chars). **Required in production.** | dev fallback |
| `CHATWOOT_LIVE` | `1` to call the real Chatwoot API from the outbound queue | simulated |
| `APP_URL` | Public origin, used to build the webhook URL shown in settings | `http://localhost:3000` |
