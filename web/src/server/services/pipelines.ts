import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, leads, pipelineStages, pipelineTemplates, properties } from '@/db';
import { LEAD_STAGES, type StageGate } from '@/lib/constants';
import { effectiveGates, MANDATORY_GATES, stageKeyFrom, type StageColour, type StageKind } from '@/lib/pipeline';
import { newId } from '@/server/crypto';
import { parseJson } from '@/lib/utils';

export class PipelineError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
    this.name = 'PipelineError';
  }
}

export type StageDef = {
  id: string;
  key: string;
  label: string;
  kind: StageKind;
  gates: StageGate[];
  colour: StageColour;
  probability: number;
  hint: string | null;
  meaning: string | null;
  sortOrder: number;
};

export type TemplateDef = {
  id: string;
  name: string;
  description: string | null;
  inquiryType: string;
  isDefault: boolean;
  archivedAt: Date | null;
  stages: StageDef[];
  leadCount: number;
};

function toStage(row: typeof pipelineStages.$inferSelect): StageDef {
  const kind = row.kind as StageKind;
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    kind,
    // Mandatory gates are re-applied on read, so a stale row cannot weaken them.
    gates: effectiveGates(kind, parseJson<StageGate[]>(row.gates, [])),
    colour: row.colour as StageColour,
    probability: row.probability,
    hint: row.hint,
    meaning: row.meaning,
    sortOrder: row.sortOrder,
  };
}

export function listTemplates(organizationId: string, includeArchived = false): TemplateDef[] {
  const templates = db
    .select()
    .from(pipelineTemplates)
    .where(
      includeArchived
        ? eq(pipelineTemplates.organizationId, organizationId)
        : and(eq(pipelineTemplates.organizationId, organizationId), isNull(pipelineTemplates.archivedAt)),
    )
    .orderBy(asc(pipelineTemplates.name))
    .all();
  if (!templates.length) return [];

  const ids = templates.map((t) => t.id);
  const stages = db
    .select()
    .from(pipelineStages)
    .where(inArray(pipelineStages.templateId, ids))
    .orderBy(asc(pipelineStages.sortOrder))
    .all();

  const counts = new Map<string, number>();
  for (const row of db
    .select({ id: leads.pipelineTemplateId, n: sql<number>`count(*)` })
    .from(leads)
    .where(inArray(leads.pipelineTemplateId, ids))
    .groupBy(leads.pipelineTemplateId)
    .all()) {
    if (row.id) counts.set(row.id, Number(row.n));
  }

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    inquiryType: t.inquiryType,
    isDefault: t.isDefault,
    archivedAt: t.archivedAt,
    stages: stages.filter((s) => s.templateId === t.id).map(toStage),
    leadCount: counts.get(t.id) ?? 0,
  }));
}

export function getTemplate(organizationId: string, templateId: string): TemplateDef | null {
  return listTemplates(organizationId, true).find((t) => t.id === templateId) ?? null;
}

/** The template a lead's stage vocabulary belongs to, falling back to the default. */
export function templateForLead(organizationId: string, templateId: string | null): TemplateDef | null {
  const all = listTemplates(organizationId, true);
  return all.find((t) => t.id === templateId) ?? all.find((t) => t.isDefault && !t.archivedAt) ?? all[0] ?? null;
}

export function defaultTemplate(organizationId: string): TemplateDef | null {
  const active = listTemplates(organizationId);
  return active.find((t) => t.isDefault) ?? active[0] ?? null;
}

/** Template used for a new lead: the property's choice, else the org default. */
export function templateForProperty(organizationId: string, propertyId: string): TemplateDef | null {
  const property = db.select().from(properties).where(eq(properties.id, propertyId)).get();
  if (property?.pipelineTemplateId) {
    const chosen = listTemplates(organizationId).find((t) => t.id === property.pipelineTemplateId);
    if (chosen) return chosen;
  }
  return defaultTemplate(organizationId);
}

/* ------------------------------- mutations ------------------------------- */

export function createTemplate(
  organizationId: string,
  input: { name: string; description?: string | null; inquiryType: string; copyFromId?: string | null },
) {
  const name = input.name.trim();
  if (name.length < 2) throw new PipelineError('Give the pipeline a name.', 'name');

  const templateId = newId('ptl');
  db.insert(pipelineTemplates)
    .values({
      id: templateId,
      organizationId,
      name,
      description: input.description?.trim() || null,
      inquiryType: input.inquiryType,
      isDefault: listTemplates(organizationId).length === 0,
    })
    .run();

  // A new pipeline starts from a working one rather than an empty board, since
  // an empty board cannot satisfy the won/lost invariants.
  const source = input.copyFromId
    ? getTemplate(organizationId, input.copyFromId)?.stages
    : null;
  const stages: Omit<StageDef, 'id'>[] = source?.length
    ? source.map((st) => ({ key: st.key, label: st.label, kind: st.kind, gates: st.gates, colour: st.colour, probability: st.probability, hint: st.hint, meaning: st.meaning, sortOrder: st.sortOrder }))
    : LEAD_STAGES.map((s, i) => ({
        key: s.key,
        label: s.label,
        kind: s.kind as StageKind,
        gates: s.gates,
        colour: 'neutral' as StageColour,
        probability: s.probability,
        hint: s.hint,
        meaning: s.meaning,
        sortOrder: i,
      }));

  for (const stage of stages) {
    db.insert(pipelineStages)
      .values({
        id: newId('pst'),
        organizationId,
        templateId,
        key: stage.key,
        label: stage.label,
        kind: stage.kind,
        gates: JSON.stringify(stage.gates.filter((g) => !MANDATORY_GATES[stage.kind].includes(g))),
        colour: stage.colour,
        probability: stage.probability,
        hint: stage.hint,
        meaning: stage.meaning,
        sortOrder: stage.sortOrder,
      })
      .run();
  }
  return templateId;
}

export function renameTemplate(organizationId: string, templateId: string, name: string, description: string | null) {
  if (name.trim().length < 2) throw new PipelineError('Give the pipeline a name.', 'name');
  db.update(pipelineTemplates)
    .set({ name: name.trim(), description: description?.trim() || null, updatedAt: new Date() })
    .where(and(eq(pipelineTemplates.id, templateId), eq(pipelineTemplates.organizationId, organizationId)))
    .run();
}

export function setDefaultTemplate(organizationId: string, templateId: string) {
  const target = getTemplate(organizationId, templateId);
  if (!target) throw new PipelineError('Pipeline not found.');
  if (target.archivedAt) throw new PipelineError('An archived pipeline cannot be the default.');
  db.update(pipelineTemplates).set({ isDefault: false }).where(eq(pipelineTemplates.organizationId, organizationId)).run();
  db.update(pipelineTemplates).set({ isDefault: true, updatedAt: new Date() }).where(eq(pipelineTemplates.id, templateId)).run();
}

/**
 * Archive, never delete: leads keep pointing at the template that gave them
 * their stage vocabulary, so removing the row would orphan their history.
 */
export function archiveTemplate(organizationId: string, templateId: string) {
  const target = getTemplate(organizationId, templateId);
  if (!target) throw new PipelineError('Pipeline not found.');
  if (target.isDefault) throw new PipelineError('Make another pipeline the default before archiving this one.');

  const inUse = db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.organizationId, organizationId), eq(properties.pipelineTemplateId, templateId)))
    .all();
  if (inUse.length) {
    throw new PipelineError(`${inUse.length} propert${inUse.length === 1 ? 'y' : 'ies'} still use this pipeline. Point them elsewhere first.`);
  }

  db.update(pipelineTemplates).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(pipelineTemplates.id, templateId)).run();
}

export function addStage(
  organizationId: string,
  templateId: string,
  input: { label: string; kind: StageKind; colour: StageColour; probability: number },
) {
  const template = getTemplate(organizationId, templateId);
  if (!template) throw new PipelineError('Pipeline not found.');
  if (input.label.trim().length < 2) throw new PipelineError('Give the stage a name.', 'label');

  const key = stageKeyFrom(input.label, template.stages.map((s) => s.key));
  const sortOrder = Math.max(-1, ...template.stages.map((s) => s.sortOrder)) + 1;

  db.insert(pipelineStages)
    .values({
      id: newId('pst'),
      organizationId,
      templateId,
      key,
      label: input.label.trim(),
      kind: input.kind,
      gates: '[]',
      colour: input.colour,
      probability: Math.max(0, Math.min(100, input.probability)),
      sortOrder,
    })
    .run();
  return key;
}

export function updateStage(
  organizationId: string,
  stageId: string,
  input: { label: string; colour: StageColour; probability: number; gates: StageGate[]; meaning?: string | null },
) {
  const row = db
    .select()
    .from(pipelineStages)
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.organizationId, organizationId)))
    .get();
  if (!row) throw new PipelineError('Stage not found.');
  if (input.label.trim().length < 2) throw new PipelineError('Give the stage a name.', 'label');

  const kind = row.kind as StageKind;
  // Only the optional gates are stored; the mandatory ones are re-applied on read.
  const extra = input.gates.filter((g) => !MANDATORY_GATES[kind].includes(g));

  db.update(pipelineStages)
    .set({
      label: input.label.trim(),
      colour: input.colour,
      probability: Math.max(0, Math.min(100, input.probability)),
      gates: JSON.stringify(extra),
      meaning: input.meaning?.trim() || row.meaning,
    })
    .where(eq(pipelineStages.id, stageId))
    .run();
}

/** Stages cannot be deleted while leads sit in them, and a kind cannot vanish. */
export function removeStage(organizationId: string, stageId: string) {
  const row = db
    .select()
    .from(pipelineStages)
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.organizationId, organizationId)))
    .get();
  if (!row) throw new PipelineError('Stage not found.');

  const occupied = db
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.organizationId, organizationId), eq(leads.stage, row.key)))
    .get();
  if (Number(occupied?.n ?? 0) > 0) {
    throw new PipelineError(`${occupied!.n} lead(s) are in this stage. Move them first, then delete it.`);
  }

  const siblings = db.select().from(pipelineStages).where(eq(pipelineStages.templateId, row.templateId)).all();
  const sameKind = siblings.filter((s) => s.kind === row.kind);
  if (sameKind.length <= 1 && row.kind !== 'open') {
    throw new PipelineError(
      `This is the only ${row.kind} stage. A pipeline needs one, otherwise a lead can never be marked ${row.kind}.`,
    );
  }
  if (sameKind.length <= 1 && row.kind === 'open') {
    throw new PipelineError('A pipeline needs at least one in-progress stage.');
  }

  db.delete(pipelineStages).where(eq(pipelineStages.id, stageId)).run();
}

export function reorderStage(organizationId: string, stageId: string, direction: 'up' | 'down') {
  const row = db
    .select()
    .from(pipelineStages)
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.organizationId, organizationId)))
    .get();
  if (!row) throw new PipelineError('Stage not found.');

  const siblings = db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.templateId, row.templateId))
    .orderBy(asc(pipelineStages.sortOrder))
    .all();

  const index = siblings.findIndex((s) => s.id === stageId);
  const swapWith = direction === 'up' ? siblings[index - 1] : siblings[index + 1];
  if (!swapWith) return;

  db.update(pipelineStages).set({ sortOrder: swapWith.sortOrder }).where(eq(pipelineStages.id, row.id)).run();
  db.update(pipelineStages).set({ sortOrder: row.sortOrder }).where(eq(pipelineStages.id, swapWith.id)).run();
}

export function setPropertyTemplate(organizationId: string, propertyId: string, templateId: string | null) {
  if (templateId) {
    const template = listTemplates(organizationId).find((t) => t.id === templateId);
    if (!template) throw new PipelineError('Pipeline not found or archived.');
  }
  db.update(properties)
    .set({ pipelineTemplateId: templateId })
    .where(and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId)))
    .run();
}
