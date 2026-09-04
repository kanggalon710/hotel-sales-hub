'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, ChevronDown, ChevronUp, GitBranch, Lock, Pencil, Plus, Star, Trash2,
} from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Drawer, Modal } from '@/components/ui/overlay';
import { InlineError, ListState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  COLOUR_DOT, MANDATORY_GATES, OPTIONAL_GATES, STAGE_COLOURS, STAGE_KINDS,
  STAGE_KIND_LABEL, STAGE_KIND_MEANING, type StageColour, type StageKind,
} from '@/lib/pipeline';
import type { StageGate } from '@/lib/constants';
import {
  addStageAction, archiveTemplateAction, createTemplateAction, removeStageAction,
  renameTemplateAction, reorderStageAction, setDefaultTemplateAction,
  setPropertyTemplateAction, updateStageAction,
} from '@/server/actions/pipelines';
import { cn } from '@/lib/utils';

export type StageView = {
  id: string; key: string; label: string; kind: StageKind; gates: StageGate[];
  colour: StageColour; probability: number; meaning: string | null;
};
export type TemplateView = {
  id: string; name: string; description: string | null; inquiryType: string;
  isDefault: boolean; archived: boolean; leadCount: number; stages: StageView[];
};

export function PipelineSettings({
  templates,
  properties,
  inquiryTypes,
}: {
  templates: TemplateView[];
  properties: { id: string; name: string; code: string; templateId: string | null }[];
  inquiryTypes: { key: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const active = templates.filter((t) => !t.archived);
  const [selectedId, setSelectedId] = useState(active.find((t) => t.isDefault)?.id ?? active[0]?.id ?? '');
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [editingStage, setEditingStage] = useState<StageView | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, start] = useTransition();

  const selected = templates.find((t) => t.id === selectedId) ?? active[0];

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not apply that', body: result.error });
        return;
      }
      toast.push({ tone: 'success', title: success });
      router.refresh();
    });
  }

  if (!selected) {
    return (
      <Card>
        <ListState
          title="No pipeline configured"
          description="Create one to define the stages a lead moves through."
          action={<Button variant="primary" onClick={() => setCreating(true)} icon={<Plus aria-hidden className="size-4" />}>Create pipeline</Button>}
        />
        <CreateTemplateDrawer
          open={creating}
          onClose={() => setCreating(false)}
          templates={templates}
          inquiryTypes={inquiryTypes}
          onDone={() => { setCreating(false); router.refresh(); }}
        />
      </Card>
    );
  }

  return (
    <>
      {/* Board picker, in the style of a board switcher but naming the consequence. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPicker((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={picker}
            className="focus-ring flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-left hover:border-border-strong"
          >
            <GitBranch aria-hidden className="size-4 text-ink-3" />
            <span className="min-w-0">
              <span className="t-label block leading-3">Pipeline</span>
              <span className="block max-w-[16rem] truncate text-[13px] font-medium text-ink">{selected.name}</span>
            </span>
            <ChevronDown aria-hidden className="size-3.5 text-ink-3" />
          </button>

          {picker ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPicker(false)} aria-hidden />
              <ul role="listbox" className="rise-in absolute left-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-xl border border-border bg-surface-3 p-1.5 shadow-e3">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={t.id === selected.id}
                      onClick={() => { setSelectedId(t.id); setPicker(false); }}
                      className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{t.name}</span>
                        <span className="t-meta block">
                          {t.stages.length} stages · {t.leadCount} leads
                          {t.isDefault ? ' · default' : ''}
                          {t.archived ? ' · archived' : ''}
                        </span>
                      </span>
                      {t.id === selected.id ? <Check aria-hidden className="size-4 text-primary-ink" /> : null}
                    </button>
                  </li>
                ))}
                <li className="mt-1 border-t border-border pt-1">
                  <Button variant="primary" size="sm" className="w-full" onClick={() => { setPicker(false); setCreating(true); }} icon={<Plus aria-hidden className="size-3.5" />}>
                    Create pipeline
                  </Button>
                </li>
              </ul>
            </>
          ) : null}
        </div>

        {selected.isDefault ? (
          <Badge tone="primary">Default for new leads</Badge>
        ) : !selected.archived ? (
          <Button variant="ghost" size="sm" loading={pending} onClick={() => run(() => setDefaultTemplateAction(selected.id), 'Default pipeline changed')} icon={<Star aria-hidden className="size-3.5" />}>
            Make default
          </Button>
        ) : (
          <Badge tone="neutral">Archived</Badge>
        )}

        <div className="ms-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditingTemplate(true)} icon={<Pencil aria-hidden className="size-3.5" />}>
            Rename
          </Button>
          {!selected.archived && !selected.isDefault ? (
            <Button variant="ghost" size="sm" className="text-danger-ink" onClick={() => setConfirmArchive(true)}>
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Stages"
          subtitle={selected.description ?? 'The columns a lead moves through on the board.'}
          action={
            !selected.archived ? (
              <Button variant="secondary" size="sm" onClick={() => setAddingStage(true)} icon={<Plus aria-hidden className="size-3.5" />}>
                Add stage
              </Button>
            ) : null
          }
        />
        <ul className="divide-y divide-border">
          {selected.stages.map((stage, index) => (
            <li key={stage.id} className="flex items-start gap-3 px-5 py-3">
              <span aria-hidden className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', COLOUR_DOT[stage.colour])} />

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-medium text-ink">{stage.label}</span>
                  <Badge tone={stage.kind === 'won' ? 'success' : stage.kind === 'lost' ? 'danger' : stage.kind === 'cancelled' ? 'neutral' : 'info'}>
                    {STAGE_KIND_LABEL[stage.kind]}
                  </Badge>
                  <span className="tnum t-meta">{stage.probability}%</span>
                </p>
                <p className="t-meta mt-0.5">{stage.meaning ?? STAGE_KIND_MEANING[stage.kind]}</p>
                {stage.gates.length ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {stage.gates.map((g) => {
                      const mandatory = MANDATORY_GATES[stage.kind].includes(g);
                      return (
                        <span
                          key={g}
                          title={mandatory ? 'Enforced because of the stage kind. It cannot be removed.' : 'Added by an administrator.'}
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
                            mandatory ? 'bg-warning-soft text-warning-ink' : 'bg-surface-2 text-ink-2',
                          )}
                        >
                          {mandatory ? <Lock aria-hidden className="size-3" /> : null}
                          {g.replace(/_/g, ' ')}
                        </span>
                      );
                    })}
                  </p>
                ) : null}
              </div>

              {!selected.archived ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${stage.label} earlier`} disabled={index === 0 || pending} onClick={() => run(() => reorderStageAction(stage.id, 'up'), 'Order updated')}>
                    <ChevronUp aria-hidden className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${stage.label} later`} disabled={index === selected.stages.length - 1 || pending} onClick={() => run(() => reorderStageAction(stage.id, 'down'), 'Order updated')}>
                    <ChevronDown aria-hidden className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${stage.label}`} onClick={() => setEditingStage(stage)}>
                    <Pencil aria-hidden className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${stage.label}`} className="text-danger-ink" loading={pending} onClick={() => run(() => removeStageAction(stage.id), `${stage.label} deleted`)}>
                    <Trash2 aria-hidden className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="t-meta border-t border-border px-5 py-3">
          A stage marked <strong className="font-medium text-ink-2">Won</strong> always requires a reservation reference,
          and one marked <strong className="font-medium text-ink-2">Lost</strong> always requires a reason. Renaming does
          not change that, which is why the funnel stays comparable across pipelines.
        </p>
      </Card>

      <Card>
        <CardHeader title="Which property uses which pipeline" subtitle="New leads at a property start on its pipeline. Blank means the organization default." />
        <ul className="divide-y divide-border">
          {properties.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{p.name}</span>
                <span className="t-meta block font-mono">{p.code}</span>
              </span>
              <Select
                value={p.templateId ?? ''}
                aria-label={`Pipeline for ${p.name}`}
                disabled={pending}
                onChange={(e) => run(() => setPropertyTemplateAction(p.id, e.target.value || null), `${p.name} updated`)}
                className="h-9 w-auto min-w-[14rem] text-[13px]"
              >
                <option value="">Organization default</option>
                {templates.filter((t) => !t.archived).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      </Card>

      <CreateTemplateDrawer open={creating} onClose={() => setCreating(false)} templates={templates} inquiryTypes={inquiryTypes} onDone={() => { setCreating(false); router.refresh(); }} />
      <RenameTemplateDrawer template={editingTemplate ? selected : null} onClose={() => setEditingTemplate(false)} onDone={() => { setEditingTemplate(false); router.refresh(); }} />
      <AddStageDrawer templateId={addingStage ? selected.id : null} onClose={() => setAddingStage(false)} onDone={() => { setAddingStage(false); router.refresh(); }} />
      <EditStageDrawer stage={editingStage} onClose={() => setEditingStage(null)} onDone={() => { setEditingStage(null); router.refresh(); }} />

      <Modal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={`Archive "${selected.name}"?`}
        description={`It disappears from pickers but stays attached to ${selected.leadCount} lead(s) so their history keeps making sense. Nothing is deleted.`}
        tone="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmArchive(false)}>Keep it</Button>
            <Button variant="danger" loading={pending} onClick={() => { setConfirmArchive(false); run(() => archiveTemplateAction(selected.id), 'Pipeline archived'); }}>
              Archive pipeline
            </Button>
          </>
        }
      />
    </>
  );
}

/* --------------------------------- drawers --------------------------------- */

function CreateTemplateDrawer({
  open, onClose, templates, inquiryTypes, onDone,
}: {
  open: boolean;
  onClose: () => void;
  templates: TemplateView[];
  inquiryTypes: { key: string; label: string }[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createTemplateAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  if (state?.ok && open && !pending) setTimeout(onDone, 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create a pipeline"
      description="It starts from a working set of stages, because an empty board cannot satisfy the won and lost rules."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-pipeline" variant="primary" loading={pending}>Create pipeline</Button>
        </>
      }
    >
      <form id="create-pipeline" action={action} className="space-y-4">
        {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}
        <Field label="Name" htmlFor="tpl-name" required error={errors?.name}>
          <Input id="tpl-name" name="name" data-autofocus placeholder="Group &amp; MICE" required />
        </Field>
        <Field label="What it is for" htmlFor="tpl-type" hint="Used to suggest the pipeline for that kind of inquiry.">
          <Select id="tpl-type" name="inquiryType" defaultValue="fit">
            {inquiryTypes.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Start from" htmlFor="tpl-copy" hint="Copy the stages of an existing pipeline, or start from the built-in FIT path.">
          <Select id="tpl-copy" name="copyFromId" defaultValue="">
            <option value="">Built-in FIT stages</option>
            {templates.filter((t) => !t.archived).map((t) => (
              <option key={t.id} value={t.id}>Copy of {t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="tpl-desc">
          <Textarea id="tpl-desc" name="description" rows={2} placeholder="Longer path for block bookings, with a site inspection before quoting." />
        </Field>
      </form>
    </Drawer>
  );
}

function RenameTemplateDrawer({ template, onClose, onDone }: { template: TemplateView | null; onClose: () => void; onDone: () => void }) {
  const [state, action, pending] = useActionState(renameTemplateAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  if (state?.ok && template && !pending) setTimeout(onDone, 0);
  if (!template) return null;

  return (
    <Drawer open onClose={onClose} title={`Rename "${template.name}"`} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="rename-pipeline" variant="primary" loading={pending}>Save</Button>
      </>
    }>
      <form id="rename-pipeline" key={template.id} action={action} className="space-y-4">
        <input type="hidden" name="templateId" value={template.id} />
        {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}
        <Field label="Name" htmlFor="rn-name" required error={errors?.name}>
          <Input id="rn-name" name="name" defaultValue={template.name} data-autofocus required />
        </Field>
        <Field label="Description" htmlFor="rn-desc">
          <Textarea id="rn-desc" name="description" rows={2} defaultValue={template.description ?? ''} />
        </Field>
      </form>
    </Drawer>
  );
}

function AddStageDrawer({ templateId, onClose, onDone }: { templateId: string | null; onClose: () => void; onDone: () => void }) {
  const [state, action, pending] = useActionState(addStageAction, null);
  const [kind, setKind] = useState<StageKind>('open');
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  if (state?.ok && templateId && !pending) setTimeout(onDone, 0);
  if (!templateId) return null;

  return (
    <Drawer open onClose={onClose} title="Add a stage" description="Its kind decides what the server enforces, so choose that first." footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="add-stage" variant="primary" loading={pending}>Add stage</Button>
      </>
    }>
      <form id="add-stage" action={action} className="space-y-4">
        <input type="hidden" name="templateId" value={templateId} />
        {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}

        <Field label="Name" htmlFor="st-label" required error={errors?.label}>
          <Input id="st-label" name="label" data-autofocus placeholder="Site Inspection" required />
        </Field>

        <Field label="Kind" htmlFor="st-kind" required hint={STAGE_KIND_MEANING[kind]}>
          <Select id="st-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as StageKind)}>
            {STAGE_KINDS.map((k) => (
              <option key={k} value={k}>{STAGE_KIND_LABEL[k]}</option>
            ))}
          </Select>
        </Field>

        {MANDATORY_GATES[kind].length ? (
          <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] leading-5 text-warning-ink">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            A {STAGE_KIND_LABEL[kind].toLowerCase()} stage always enforces: {MANDATORY_GATES[kind].map((g) => g.replace(/_/g, ' ')).join(', ')}. This cannot be switched off.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Colour" htmlFor="st-colour">
            <Select id="st-colour" name="colour" defaultValue="info">
              {STAGE_COLOURS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Probability %" htmlFor="st-prob" hint="Used for the weighted forecast.">
            <Input id="st-prob" name="probability" type="number" min={0} max={100} defaultValue={50} />
          </Field>
        </div>
      </form>
    </Drawer>
  );
}

function EditStageDrawer({ stage, onClose, onDone }: { stage: StageView | null; onClose: () => void; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateStageAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  if (state?.ok && stage && !pending) setTimeout(onDone, 0);
  if (!stage) return null;

  const mandatory = MANDATORY_GATES[stage.kind];

  return (
    <Drawer open onClose={onClose} title={`Edit "${stage.label}"`} description={`Kind: ${STAGE_KIND_LABEL[stage.kind]}. ${STAGE_KIND_MEANING[stage.kind]}`} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="edit-stage" variant="primary" loading={pending}>Save stage</Button>
      </>
    }>
      <form id="edit-stage" key={stage.id} action={action} className="space-y-4">
        <input type="hidden" name="stageId" value={stage.id} />
        {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}

        <Field label="Name" htmlFor="es-label" required error={errors?.label}>
          <Input id="es-label" name="label" defaultValue={stage.label} data-autofocus required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Colour" htmlFor="es-colour">
            <Select id="es-colour" name="colour" defaultValue={stage.colour}>
              {STAGE_COLOURS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Probability %" htmlFor="es-prob">
            <Input id="es-prob" name="probability" type="number" min={0} max={100} defaultValue={stage.probability} />
          </Field>
        </div>

        <Field label="What this stage means" htmlFor="es-meaning" hint="Shown when the column is empty, and as its tooltip.">
          <Textarea id="es-meaning" name="meaning" rows={2} defaultValue={stage.meaning ?? ''} />
        </Field>

        <fieldset>
          <legend className="t-small font-medium text-ink">Requirements to enter this stage</legend>
          {mandatory.length ? (
            <p className="mt-1.5 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] leading-5 text-warning-ink">
              <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Always enforced: {mandatory.map((g) => g.replace(/_/g, ' ')).join(', ')}. This comes from the stage kind.
            </p>
          ) : null}
          <div className="mt-2 space-y-0.5 rounded-md border border-border bg-surface-inset p-2">
            {OPTIONAL_GATES.map((g) => (
              <Checkbox
                key={g.gate}
                name="gates"
                value={g.gate}
                defaultChecked={stage.gates.includes(g.gate)}
                label={g.label}
                hint={g.help}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Drawer>
  );
}
