# Configurable pipelines: what to take from Cekat AI, and what not to

Observed on `chat.cekat.ai/tickets`, 4 September 2026, logged in as an administrator.

## What Cekat AI actually does

| Concept | Implementation |
|---|---|
| Multiple boards | A "Select Board" dropdown with `+ Create New Board`. An `Edit` toggle turns the list into rename/delete mode. |
| User-defined statuses | Kanban columns *are* statuses. `+ Add Status` appends a column. Each column has an overflow menu with `Change Color` and `Delete Status`. |
| Two views, one dataset | `Kanban View` / `List View` toggle. Board, filter, and sort state carry across both. |
| Priority as its own axis | `Low / Medium / High / Urgent`, shown as a chip beside the status chip. Independent of which column the card is in. |
| Filter sheet | Created date, Priority (multi-select), Created by, Assignee. `Reset all` and `Apply`. |
| Sort sheet | Newest created, Oldest created, Updated recently, Urgent first. `Apply`. |
| Card anatomy | Status chip, priority chip, `#id` + title, assignee avatar, date, overflow menu. |
| List pagination | `Showing 10 of N results`, Previous / Next. |

## What is worth taking

**1. The pipeline should be data, not a constant.** Today our stages live in `src/lib/constants.ts` as a hardcoded array. The PRD already asks for this to change: §7.2 item 2 lists "multiple pipeline templates for FIT, corporate, and group/MICE" as P1, and §17.5 says pipeline, stage, role, currency, locale, tax, and timezone must not be hardcoded. Cekat's board picker is a clean shape for it.

**2. Priority as a separate axis.** We currently infer urgency from the SLA clock and the follow-up date. That is good for *time*, but a manager cannot say "this 6-room corporate lead matters more than that 1-room weekend break". An explicit priority is one column and one chip, and it makes the My Day "Needs attention today" group sortable by something other than a due date.

**3. Saved views.** PRD §7.2 item 9 lists saved views as P1. Cekat's boards are effectively saved views with their own column set. Ours can be simpler: a saved filter + sort + view mode, named, per user, optionally shared to a team.

**4. Filter by created date and created by.** Our filter sheet has stage, owner, status, sort, overdue. Adding date-created and created-by is cheap and covers the "what came in last week" question we cannot answer today.

## What must not be copied

**1. Free-form `Delete Status`.** Our stages are not labels. Each one carries server-enforced gates (FR-07): `Confirmed` requires a reservation reference, `Lost` requires a reason, `Quotation Sent` requires a sent version. Deleting `Confirmed` would break the invariant that a won lead is backed by evidence, and would silently corrupt the funnel report and every conversion metric.

The rule to implement instead: **a stage template may add, rename, reorder, and recolour its own stages, but every template must map each of its stages to one of the fixed kinds** (`open`, `won`, `lost`, `cancelled`) and the gates travel with the kind. A hotel can call the won stage "Definite" or "Confirmed" or "Sudah Deposit"; it still cannot enter it without a reservation reference.

**2. Generic tickets.** Cekat cards are `#id + title`. Ours carry a guest, stay dates, occupancy, and value because a hotel lead is not a support ticket. The card anatomy stays hotel-specific.

**3. Board deletion without migration.** Deleting a board in Cekat is a two-click affair. For us, a pipeline template is referenced by every lead that ever used it. Deletion must be an archive, and switching a property's template must ask what happens to leads sitting in a stage the new template does not have.

## Proposed data model

Three new tables, one new column:

```
pipeline_templates      id, organization_id, name, inquiry_type, is_default, archived_at
pipeline_stages         id, template_id, key, label, kind, gates(json), colour,
                        probability, sort_order
saved_views             id, organization_id, user_id, team_id?, name, entity,
                        filters(json), sort, view_mode, is_shared

leads.pipeline_template_id   -> pipeline_templates.id
leads.priority               -> low | normal | high | urgent
properties.pipeline_template_id (default for new leads at that property)
```

`LEAD_STAGES` in `constants.ts` becomes the seed for a single "FIT (default)" template rather than the source of truth. `checkStageGates` reads gates from the stage row instead of the constant. Everything else, including the Live Stay Strip, already derives from records rather than stage names, so it is unaffected.

## Built (4 September 2026)

The pipeline is now configuration. `LEAD_STAGES` seeds a template rather than being the source of truth; `checkStageGates` resolves the stage from the lead's template and falls back to the built-in vocabulary only when no template is set.

### The safety design, and why it differs from Cekat

Cekat lets you delete any status. We cannot, because our stages guard invariants. The resolution is that **`kind` is load-bearing, `label` is not**:

| Kind | Always enforces | Editable |
|---|---|---|
| In progress | nothing | label, colour, probability, optional gates |
| Won | a reservation reference | label, colour, probability |
| Lost | a reason | label, colour, probability |
| Cancelled | a reason | label, colour, probability |

So a hotel may call the won stage "Definite" or "Sudah Deposit"; it still cannot be entered without a reservation reference, and the funnel stays comparable across pipelines.

Four guards, all verified against the running app:

1. A stage holding leads cannot be deleted. Verified: *"3 lead(s) are in this stage. Move them first, then delete it."*
2. The last stage of a kind cannot be deleted. Verified: *"This is the only won stage. A pipeline needs one, otherwise a lead can never be marked won."*
3. A template in use by a property cannot be archived until those properties point elsewhere.
4. A template is archived, never deleted, because leads reference it for their stage vocabulary.

Mandatory gates are re-applied when a stage is read, so a hand-edited row cannot weaken them.

### What shipped

- `pipeline_templates`, `pipeline_stages`; `leads.pipeline_template_id`, `leads.priority`, `properties.pipeline_template_id`
- `/settings/pipelines`: pipeline picker, create (copying an existing set or the built-in FIT path), rename, make default, archive; per-stage add, rename, recolour, reorder, delete, and optional-gate editing; a per-property pipeline assignment table
- The board reads its columns, colours, order, and empty-state copy from the template
- The lead cockpit's stage picker reads the lead's own template
- Seed ships two templates: FIT (10 stages, default) and Group & MICE (8 stages, with a Site Inspection step and a won stage named "Definite")

### Still to do from this plan

Priority is on `leads` but not yet surfaced in the filter, sort, or card. Saved views and the created-date filter are untouched.

## Suggested order

| Slice | Work | Value |
|---|---|---|
| **1. Priority** | One column, one chip, one filter, one sort option. | Immediate, no migration risk. |
| **2. Saved views** | One table, a dropdown beside the filter button, reusing the existing URL filter state. | High: answers PRD §7.2 item 9, and the filter state already serialises. |
| **3. Filter additions** | Created date and created-by in the existing sheet. | Cheap, closes a real gap. |
| **4. Pipeline templates** | The three tables above, a settings screen, gate migration, template switcher on the board. | Largest. Answers PRD §7.2 item 2, but touches stage transitions, reporting, and the seed. |

Slices 1 to 3 are additive and safe. Slice 4 changes an invariant-bearing part of the system and deserves its own review, because a mistake there corrupts the funnel silently rather than loudly.

## What still needs deciding before slice 4

- Is a template chosen per property, per inquiry type, or both? The PRD implies inquiry type (FIT, corporate, group/MICE), but properties may want their own.
- What happens to open leads when a template changes underneath them?
- Do custom stages need their own gates, or is mapping to the four kinds enough for the pilot? Mapping alone is far simpler and probably sufficient.
