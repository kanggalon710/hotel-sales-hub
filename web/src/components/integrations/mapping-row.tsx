'use client';

import { useActionState, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/badge';
import { InlineError } from '@/components/ui/states';
import { INQUIRY_TYPES } from '@/lib/constants';
import { saveMappingAction } from '@/server/actions/integrations';
import { titleCase } from '@/lib/utils';

export type MappingRule = {
  id: string;
  kind: 'inbox' | 'agent';
  externalId: string;
  externalName: string | null;
  channel: string | null;
  status: string;
  propertyId: string | null;
  teamId: string | null;
  userId: string | null;
  inquiryType: string | null;
  isSalesInbox: boolean;
  triggerLabels: string;
  connectionLabel: string;
};

export function MappingRow({
  rule,
  properties,
  teams,
  users,
}: {
  rule: MappingRule;
  properties: { id: string; name: string }[];
  teams: { id: string; name: string; propertyId: string | null }[];
  users: { id: string; name: string; email: string }[];
}) {
  const [editing, setEditing] = useState(rule.status === 'unmapped');
  const [state, action, pending] = useActionState(saveMappingAction, null);
  const [propertyId, setPropertyId] = useState(rule.propertyId ?? '');
  const errors = state?.ok === false ? state.fieldErrors : undefined;

  if (state?.ok && editing && !pending) setTimeout(() => setEditing(false), 0);

  const propertyName = properties.find((p) => p.id === rule.propertyId)?.name;
  const userName = users.find((u) => u.id === rule.userId)?.name;
  const scopedTeams = teams.filter((t) => !propertyId || t.propertyId === propertyId);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-ink">{rule.externalName ?? `${titleCase(rule.kind)} ${rule.externalId}`}</span>
            <span className="font-mono text-[11px] text-ink-3">#{rule.externalId}</span>
            <StatusBadge status={rule.status} />
            {rule.isSalesInbox ? (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary-ink">
                Sales inbox
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] text-ink-3">
            {rule.connectionLabel}
            {rule.channel ? ` · ${titleCase(rule.channel)}` : ''}
            {rule.kind === 'inbox'
              ? propertyName
                ? ` · routes to ${propertyName}`
                : ' · no property assigned'
              : userName
                ? ` · ${userName}`
                : ' · no CRM user assigned'}
          </p>
        </div>
        {!editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} icon={<Pencil aria-hidden className="size-3.5" />}>
            Edit
          </Button>
        ) : null}
      </div>

      {editing ? (
        <form action={action} className="mt-3 space-y-3 rounded-md border border-border bg-surface-inset p-3">
          <input type="hidden" name="mappingId" value={rule.id} />
          {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}

          {rule.kind === 'inbox' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Property" htmlFor={`prop-${rule.id}`} required error={errors?.propertyId}>
                  <Select
                    id={`prop-${rule.id}`}
                    name="propertyId"
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                  >
                    <option value="">Choose a property…</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Default team" htmlFor={`team-${rule.id}`}>
                  <Select id={`team-${rule.id}`} name="teamId" defaultValue={rule.teamId ?? ''}>
                    <option value="">No default team</option>
                    {scopedTeams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Inquiry type" htmlFor={`type-${rule.id}`}>
                  <Select id={`type-${rule.id}`} name="inquiryType" defaultValue={rule.inquiryType ?? 'fit'}>
                    {INQUIRY_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Checkbox
                name="isSalesInbox"
                defaultChecked={rule.isSalesInbox}
                label="Treat as a sales inbox"
                hint="Every eligible conversation here becomes a lead automatically."
              />

              <Field
                label="Trigger labels"
                htmlFor={`labels-${rule.id}`}
                hint="Comma separated. For non-sales inboxes, only conversations carrying one of these become leads."
              >
                <Input id={`labels-${rule.id}`} name="triggerLabels" defaultValue={rule.triggerLabels} placeholder="room-inquiry, group-booking" />
              </Field>
            </>
          ) : (
            <Field
              label="CRM user"
              htmlFor={`user-${rule.id}`}
              required
              hint="Assignment from Chatwoot only applies when this user also has access to the conversation's property."
            >
              <Select id={`user-${rule.id}`} name="userId" defaultValue={rule.userId ?? ''}>
                <option value="">Not mapped</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
                ))}
              </Select>
            </Field>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" loading={pending} icon={<Check aria-hidden className="size-3.5" />}>
              Save mapping
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
