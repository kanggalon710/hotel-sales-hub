# PRD → implementation traceability

Status legend: ✅ implemented · ◐ partial (noted) · ⏳ not in this build

## P0 scope (PRD §7.1)

| # | P0 item | Where | Status |
|---|---|---|---|
| 1 | Multi-tenant org, multi-property | `organizations`, `properties`; `leadScopeWhere`; property switcher | ✅ |
| 2 | User invitation / activation / deactivation, predefined roles, property scope, permission enforcement | `src/server/actions/users.ts`, `services/user-admin.ts`, `constants.ts` role matrix, `/settings/users` | ✅ |
| 3 | Chatwoot connection + agent/user mapping | `/integrations`, `/integrations/mappings`, `mapping_rules` | ✅ |
| 4 | Webhook ingestion, retry, dedup, monitoring, dead-letter | `api/webhooks/chatwoot/[connectionId]`, `services/chatwoot-ingest.ts`, `/integrations/health` | ✅ |
| 5 | Contact + conversation context sync | `resolveContact`, `conversation_references` | ✅ |
| 6 | Rule-based lead creation/linking | `applyEvent` (sales inbox ∨ trigger label; link to open lead per contact+property) | ✅ (manual *Create/Link* from panel links to `/leads?q=`; no dedicated link UI) ◐ |
| 7 | Contact dedup + manual merge | normalized phone/email match; `merge_review` task | ◐ merge action UI not built |
| 8 | Pipeline, assignment, timeline, tasks, SLA, lost reason | `services/leads.ts` gates, `/leads`, `/pipeline`, cockpit | ✅ |
| 9 | CRM context panel from Chatwoot | `/panel?conversation=<id>` (iframe target), permission-scoped buttons, stale labelling | ✅ |
| 10 | Availability via one adapter or manual fallback | `services/availability.ts`, `MockPmsAdapter`, manual path when no connector | ✅ |
| 11 | Quotation draft/calc/expiry/revision/approval/delivery | `services/quotations.ts`, builder drawer, `/approvals`, `expireStaleQuotations` | ✅ |
| 12 | Reservation request queue + handoff status | `services/reservations.ts`, `/reservations`, decision UI | ✅ |
| 13 | Guest 360 basic | `/guests/[id]` with PII level | ✅ |
| 14 | Operational dashboard + funnel | `/` My Day, `/reports` | ✅ |
| 15 | Audit trail, export control, integration health | `audit_logs`, `/audit`, `data.export` permission, `/integrations/health` | ◐ export permission exists; no export action yet |

## Functional requirements (§14)

| FR | Acceptance criterion | Evidence |
|---|---|---|
| FR-01 | Cross-tenant/property access denied + security event | `assertPropertyAccess`, `requirePermission` write `access.denied*` audit rows; `/audit` shows them |
| FR-02 | Suspended session rejected; unauthorised approval refused; role change immediate | `getSession` re-reads status; `decideApproval` checks approver ceiling; grants re-read per request |
| FR-03 | Connection test shows identity + time; unmapped inbox → review, no random property | `testConnectionAction`; `MappingError` → dead letter with fix text |
| FR-04 | Duplicate payload → one effect; retry after transient failure → Recovered | fingerprint dedup (verified with curl replay); `status=recovered` on retry success |
| FR-05 | Same normalized phone → linked, no second contact; ambiguity → review | `resolveContact` (verified: `0812-7788-9900` and `+6281277889900` → one contact) |
| FR-06 | Support inbox without label → no lead; sales rule → lead with source/inbox/property/contact/conversation/SLA | verified via webhook tests 1 and 6 |
| FR-07 | Expiring quotation → task; Lost without reason → rejected | `sendQuotation` creates `quotation_expiry` task; `lost_reason` gate |
| FR-08 | PMS timeout → actionable error, no cache-as-live; stale → labelled | `AvailabilityOutcome.lastKnown` rows forced to `stale`; sandbox `simulate=timeout` |
| FR-09 | Discount above limit → Pending Approval, unsendable; snapshot immutable | `createQuotationVersion`; `sendQuotation` refuses `pending_approval` |
| FR-10 | Missing mandatory data → listed fields; alternative visible on lead | `HandoffError.missing`; `alternative_note` rendered in cockpit |
| FR-11 | Guest 360 with PII by role | `piiLevel` → `maskPhone/maskEmail/maskName` |
| FR-12 | Audit coverage, in-app notifications, reporting dimensions | `writeAudit` at every consequential action; `notifications`; `/reports` by channel/owner/property |

## Non-functional (§17) — honest status

- Reliability: idempotent inbound/outbound ✅; reconciliation job ⏳.
- Security: secrets AES-256-GCM at rest, scrypt passwords, server-side authz, session revocation, login throttling ✅; MFA/SSO ⏳ (P1).
- Observability: correlation ids on events and audit rows ✅; metrics/alerting export ⏳.
- Extensibility: adapter contract, config-driven tax/service/SLA/staleness, no hard-coded currency ✅; feature flags ⏳.
