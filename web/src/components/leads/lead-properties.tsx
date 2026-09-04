'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

import { assignLeadAction, changeStageAction } from '@/server/actions/leads';

/**
 * Owner and stage are properties of the lead, not actions, so they live in the
 * details panel as editable rows rather than as controls wedged between
 * buttons. Both write through their own server action, so no shared state is
 * needed with the action bar.
 */
export function LeadProperties({
  leadId,
  stage,
  status,
  ownerUserId,
  assignable,
  canWrite,
  canReassign,
  stages,
  pipelineName,
  onCloseAsLost,
}: {
  leadId: string;
  stage: string;
  status: string;
  ownerUserId: string | null;
  assignable: { id: string; name: string }[];
  canWrite: boolean;
  canReassign: boolean;
  /** The lead's own pipeline, so a renamed stage shows its new name here too. */
  stages: { key: string; label: string; kind: string; hint: string }[];
  pipelineName: string | null;
  onCloseAsLost?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const isClosed = status !== 'open';
  const stageDef = stages.find((s) => s.key === stage) ?? null;

  function assign(userId: string) {
    start(async () => {
      const result = await assignLeadAction(leadId, userId || null);
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not assign', body: result.error });
        return;
      }
      toast.push({ tone: 'success', title: 'Owner updated' });
      router.refresh();
    });
  }

  function moveStage(next: string) {
    start(async () => {
      const result = await changeStageAction(leadId, next as never);
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Stage change blocked', body: result.error });
        router.refresh();
        return;
      }
      toast.push({ tone: 'success', title: `Moved to ${stages.find((s) => s.key === next)?.label ?? next}` });
      router.refresh();
    });
  }

  if (!canWrite) {
    return (
      <>
        <PropertyRow label="Owner">
          {assignable.find((u) => u.id === ownerUserId)?.name ?? 'Unassigned'}
        </PropertyRow>
        <PropertyRow label="Stage">{stageDef?.label ?? stage}</PropertyRow>
      </>
    );
  }

  return (
    <>
      <PropertyRow label="Owner" htmlFor="lead-owner">
        <Select
          id="lead-owner"
          value={ownerUserId ?? ''}
          onChange={(e) => assign(e.target.value)}
          disabled={pending || (!canReassign && Boolean(ownerUserId))}
          title={!canReassign && ownerUserId ? 'Only a manager can reassign a lead that already has an owner' : undefined}
          className="h-9 text-[13px]"
        >
          <option value="">Unassigned</option>
          {assignable.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </PropertyRow>

      <PropertyRow
        label="Stage"
        htmlFor="lead-stage"
        hint={isClosed ? undefined : (pipelineName ? `${stageDef?.hint ?? ''} Pipeline: ${pipelineName}.` : stageDef?.hint)}
      >
        <Select
          id="lead-stage"
          value={stage}
          onChange={(e) => (stages.find((s) => s.key === e.target.value)?.kind === 'lost' ? onCloseAsLost?.() : moveStage(e.target.value))}
          disabled={pending || isClosed}
          className="h-9 text-[13px]"
        >
          {stages.filter((s) => s.kind !== 'cancelled').map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </Select>
      </PropertyRow>
    </>
  );
}

/** Label above value, matching every other form control in the product. */
function PropertyRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2">
      <label htmlFor={htmlFor} className="t-label block">{label}</label>
      <div className="mt-1.5 text-[13px] text-ink">{children}</div>
      {hint ? <p className="t-meta mt-1">{hint}</p> : null}
    </div>
  );
}
