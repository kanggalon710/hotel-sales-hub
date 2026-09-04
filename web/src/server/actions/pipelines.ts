'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission, requireSession } from '@/server/context';
import { writeAudit } from '@/server/audit';
import { fail, failFrom, ok, type ActionResult } from '@/server/result';
import { STAGE_COLOURS, STAGE_KINDS } from '@/lib/pipeline';
import {
  addStage, archiveTemplate, createTemplate, getTemplate, PipelineError, removeStage,
  renameTemplate, reorderStage, setDefaultTemplate, setPropertyTemplate, updateStage,
} from '@/server/services/pipelines';
import type { StageGate } from '@/lib/constants';

const GATES = ['owner', 'qualification', 'availability', 'quotation_sent'] as const;

function refresh() {
  revalidatePath('/settings/pipelines');
  revalidatePath('/settings');
  revalidatePath('/pipeline');
  revalidatePath('/leads');
}

function handle(err: unknown) {
  if (err instanceof PipelineError) return fail(err.message, err.field ? { [err.field]: err.message } : undefined);
  return failFrom(err);
}

export async function createTemplateAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');
    const parsed = z
      .object({
        name: z.string().trim().min(2, 'Give the pipeline a name'),
        description: z.string().trim().optional(),
        inquiryType: z.string().min(1),
        copyFromId: z.string().optional(),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return fail('Check the highlighted fields.', { name: parsed.error.issues[0].message });
    }

    const id = createTemplate(session.user.organizationId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      inquiryType: parsed.data.inquiryType,
      copyFromId: parsed.data.copyFromId || null,
    });
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'pipeline.template_created', entityType: 'pipeline_template', entityId: id,
      summary: `Pipeline "${parsed.data.name}" created`, severity: 'warning',
    });
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}

export async function renameTemplateAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');
    const templateId = String(formData.get('templateId') ?? '');
    const name = String(formData.get('name') ?? '');
    const description = String(formData.get('description') ?? '');
    const before = getTemplate(session.user.organizationId, templateId);

    renameTemplate(session.user.organizationId, templateId, name, description);
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'pipeline.template_renamed', entityType: 'pipeline_template', entityId: templateId,
      summary: `Pipeline renamed to "${name.trim()}"`,
      before: { name: before?.name }, after: { name: name.trim() },
    });
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}

export async function setDefaultTemplateAction(templateId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');
    setDefaultTemplate(session.user.organizationId, templateId);
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'pipeline.default_changed', entityType: 'pipeline_template', entityId: templateId,
      summary: 'Default pipeline changed', severity: 'warning',
    });
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}

export async function archiveTemplateAction(templateId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');
    const before = getTemplate(session.user.organizationId, templateId);
    archiveTemplate(session.user.organizationId, templateId);
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'pipeline.template_archived', entityType: 'pipeline_template', entityId: templateId,
      summary: `Pipeline "${before?.name}" archived; ${before?.leadCount ?? 0} lead(s) keep it for history`,
      severity: 'warning',
    });
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}

export async function addStageAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');
    const parsed = z
      .object({
        templateId: z.string().min(1),
        label: z.string().trim().min(2, 'Give the stage a name'),
        kind: z.enum(STAGE_KINDS),
        colour: z.enum(STAGE_COLOURS),
        probability: z.coerce.number().min(0).max(100),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return fail('Check the highlighted fields.', { label: parsed.error.issues[0].message });
    }

    addStage(session.user.organizationId, parsed.data.templateId, {
      label: parsed.data.label,
      kind: parsed.data.kind,
      colour: parsed.data.colour,
      probability: parsed.data.probability,
    });
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'pipeline.stage_added', entityType: 'pipeline_template', entityId: parsed.data.templateId,
      summary: `Stage "${parsed.data.label}" added as ${parsed.data.kind}`,
    });
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}

export async function updateStageAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');
    const stageId = String(formData.get('stageId') ?? '');
    const label = String(formData.get('label') ?? '');
    const colour = String(formData.get('colour') ?? 'neutral');
    const probability = Number(formData.get('probability') ?? 0);
    const meaning = String(formData.get('meaning') ?? '');
    const gates = formData.getAll('gates').map(String).filter((g): g is StageGate => (GATES as readonly string[]).includes(g));

    updateStage(session.user.organizationId, stageId, {
      label,
      colour: colour as never,
      probability,
      gates,
      meaning,
    });
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'pipeline.stage_updated', entityType: 'pipeline_stage', entityId: stageId,
      summary: `Stage "${label.trim()}" updated`, after: { gates, probability },
    });
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}

export async function removeStageAction(stageId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');
    removeStage(session.user.organizationId, stageId);
    writeAudit({
      organizationId: session.user.organizationId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'pipeline.stage_removed', entityType: 'pipeline_stage', entityId: stageId,
      summary: 'Stage deleted', severity: 'warning',
    });
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}

export async function reorderStageAction(stageId: string, direction: 'up' | 'down'): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'org.manage');
    reorderStage(session.user.organizationId, stageId, direction);
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}

export async function setPropertyTemplateAction(propertyId: string, templateId: string | null): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requirePermission(session, 'property.manage');
    setPropertyTemplate(session.user.organizationId, propertyId, templateId);
    writeAudit({
      organizationId: session.user.organizationId, propertyId,
      actorUserId: session.user.id, actorName: session.user.name,
      action: 'pipeline.property_template_set', entityType: 'property', entityId: propertyId,
      summary: templateId ? 'Property pipeline changed' : 'Property reverted to the default pipeline',
      severity: 'warning',
    });
    refresh();
    return ok();
  } catch (err) {
    return handle(err);
  }
}
