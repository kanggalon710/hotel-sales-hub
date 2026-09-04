# Architecture — Hotel Sales & Guest Relationship Hub

This document explains *why the code is shaped the way it is*. Anything derivable from reading the code is left out.

## 1. Three systems, three owners

The PRD's central rule (§3.1, §10.1) is that no system duplicates another's truth.

| Concern | System of record | What the CRM stores about it |
|---|---|---|
| Messages, inbox, conversation delivery/status | **Chatwoot** | external ids, inbox mapping, last-message preview, deep link — never the transcript |
| Contact identity from a channel | Chatwoot → **resolved to CRM guest** | one `contacts` row per person, `external_identity_mappings` per channel identity |
| Lead, stage, tasks, quotation, handoff | **CRM** | authoritative |
| Availability, rates, holds, reservations | **PMS/CRS** | `availability_snapshots` with source + `checked_at`; `reservation_references` as evidence |

Consequences that show up in code:

- `conversation_references.conversation_status` is Chatwoot's *workload* state. It is displayed in grey and never feeds `leads.stage` (§2.1 item 3, §11.5).
- `leads.stage = 'confirmed'` is gated on a `reservation_references` row (`checkStageGates` in `src/server/services/leads.ts`). A stage cannot claim a booking that no reference proves.
- Availability rows carry `state ∈ {live, stale, manual, unavailable}` and the UI renders the state with text, never just colour (FR-08).

## 2. Request path

```
Browser ──► Next.js App Router (server components)
              │  requireSession()  → session + permissions (cache() per request)
              │  getPropertyScope() → Current Property / All permitted
              │  leadScopeWhere()   → SQL predicate = tenant ∩ property ∩ row visibility
              ▼
           Drizzle ORM ──► SQLite (dev) · Postgres-portable schema
```

- **Tenant isolation is a SQL predicate, not a filter in JavaScript.** Every lead query goes through `leadScopeWhere`. A valid id outside scope returns "not found", and the attempt is written to `audit_logs` with `severity=warning` (FR-01).
- **Server actions are the only write path.** Each one re-derives the session, checks the permission, asserts property access, then calls a service. UI visibility is a convenience (`visibleNav`), never the control (§9.1).
- **Sessions are rows.** Suspending a user updates `sessions.revoked_at`; the next request re-reads `users.status`, so an existing cookie stops working immediately (FR-02).

## 3. Integration pipeline (Chatwoot inbound)

`POST /api/webhooks/chatwoot/[connectionId]` implements §10.3 step by step:

1. **Authenticate** — shared secret in `X-Webhook-Token` / `?token=`, compared against the encrypted `webhook_secret_ciphertext`.
2. **Record the envelope** — raw body into `webhook_events` with a `correlation_id`.
3. **Deduplicate** — `fingerprint = sha256(provider, account, event, id, conversation id, contact id, created_at)`. A replay is stored as `status=duplicate` and produces no effect (FR-04).
4. **Resolve** — connection → inbox mapping → property; assignee → agent mapping → user; contact → identity resolution.
5. **Apply rules** — lead is created only if the inbox is a sales inbox *or* a trigger label is present; otherwise the conversation is stored without a lead (FR-06).
6. **Fail honestly** — a `MappingError` (unmapped inbox/agent) skips retries and goes straight to `dead_letter_events` with an `action_required` sentence. Transient errors back off exponentially up to `MAX_WEBHOOK_ATTEMPTS`.
7. **Recover** — an admin fixes the mapping and hits *Retry*; because step 3 is keyed on external identity, a retry cannot double-create.

Identity resolution (FR-05) links on normalized E.164 phone or lowercased email. Two *different* candidates → `merge_review` task; the system never auto-merges.

## 4. Outbound (CRM → Chatwoot)

`sync_jobs` is a queue with a unique `idempotency_key` per logical change (`lead:<id>:<reason>:<payload>`). Every payload carries `_source: 'crm'` and every HTTP call sends `X-CRM-Source`, so an echo arriving back through the webhook can be recognised (§10.6). Without `CHATWOOT_LIVE=1` the runner marks jobs delivered without a network call — the demo tenant has no real Chatwoot.

## 5. PMS adapter contract

`src/server/services/pms/types.ts` defines `PmsAdapter`. The CRM core only ever calls `searchAvailability` and `createReservation`; adding a vendor is a new file implementing that interface (§17.5). `MockPmsAdapter` behaves like a vendor: variable inventory, sold-out room types, and explicit `timeout | error | unavailable` outcomes so the failure UI is exercised, not imagined.

## 6. Commercial invariants

- **Pricing is one function** (`src/lib/pricing.ts`) used by the server (authoritative) and the builder (preview). Service charge on net, tax on net + service.
- **Quotation versions are immutable.** A revision inserts a new `quotation_versions` row and marks the previous `superseded` (FR-09).
- **Discount authority is per user.** `users.discount_limit_percent` gates *creation*; `can_approve_discount_up_to_percent` gates *approval*. Exceeding the former parks the version in `pending_approval`; exceeding the latter is refused server-side even if the button was clicked.
- **Handoff completeness is checked at creation** (`createReservationRequest`), so the front-office queue never receives a request it cannot act on (FR-10).

## 7. What is deliberately not here

- No transcript storage, no message sending outside the queue, no channel-manager or accounting logic (§5 non-goals).
- No email delivery for invitations — the link is shown once to the admin.
- SQLite is the development database. The schema uses text enums, integer timestamps, and JSON-as-text so the same Drizzle schema targets Postgres with a driver swap.
