'use client';

import { useActionState, useState } from 'react';
import { Building2, Check, Pencil, Plus } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { InlineError, ListState } from '@/components/ui/states';
import { savePropertyAction } from '@/server/actions/organization';

export type PropertyView = {
  id: string;
  name: string;
  code: string;
  city: string | null;
  country: string | null;
  timezone: string | null;
  currency: string | null;
  taxPercent: number | null;
  servicePercent: number | null;
  active: boolean;
};

export function PropertyList({
  properties,
  orgDefaults,
  canCreate,
  canEdit,
}: {
  properties: PropertyView[];
  orgDefaults: { currency: string; timezone: string; taxPercent: number; servicePercent: number };
  canCreate: boolean;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title="Properties"
        subtitle="Each property may override the organization's currency, tax, and service charge. Blank means inherit."
        icon={<Building2 aria-hidden className="size-4" />}
        action={
          canCreate ? (
            <Button
              variant="secondary"
              onClick={() => setEditing(editing === 'new' ? null : 'new')}
              icon={<Plus aria-hidden className="size-4" />}
            >
              {editing === 'new' ? 'Cancel' : 'Add property'}
            </Button>
          ) : null
        }
      />

      {editing === 'new' ? (
        <div className="border-b border-border p-4">
          <PropertyForm orgDefaults={orgDefaults} onDone={() => setEditing(null)} />
        </div>
      ) : null}

      {properties.length === 0 ? (
        <ListState title="No properties yet" description="Add the first property before inviting users or mapping inboxes." />
      ) : (
        <ul className="divide-y divide-border">
          {properties.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{p.name}</span>
                    <span className="rounded bg-surface-2 px-1.5 font-mono text-[11px] text-ink-2">{p.code}</span>
                    {!p.active ? <Badge tone="neutral">Inactive</Badge> : null}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-3">
                    {[p.city, p.country].filter(Boolean).join(', ') || 'No location set'}
                    {' · '}
                    {p.currency ?? `${orgDefaults.currency} (inherited)`}
                    {' · tax '}
                    {p.taxPercent ?? orgDefaults.taxPercent}%
                    {p.taxPercent == null ? ' (inherited)' : ''}
                    {' · service '}
                    {p.servicePercent ?? orgDefaults.servicePercent}%
                    {p.servicePercent == null ? ' (inherited)' : ''}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(editing === p.id ? null : p.id)}
                    icon={<Pencil aria-hidden className="size-3.5" />}
                  >
                    {editing === p.id ? 'Cancel' : 'Edit'}
                  </Button>
                ) : null}
              </div>

              {editing === p.id ? (
                <div className="mt-3">
                  <PropertyForm property={p} orgDefaults={orgDefaults} onDone={() => setEditing(null)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PropertyForm({
  property,
  orgDefaults,
  onDone,
}: {
  property?: PropertyView;
  orgDefaults: { currency: string; timezone: string; taxPercent: number; servicePercent: number };
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(savePropertyAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const id = property?.id ?? 'new';

  if (state?.ok && !pending) setTimeout(onDone, 0);

  return (
    <form action={action} className="space-y-3 rounded-md border border-border bg-surface-inset p-3">
      {property ? <input type="hidden" name="propertyId" value={property.id} /> : null}
      {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name" htmlFor={`p-name-${id}`} required error={errors?.name} className="sm:col-span-2">
          <Input id={`p-name-${id}`} name="name" defaultValue={property?.name} required />
        </Field>
        <Field label="Code" htmlFor={`p-code-${id}`} required error={errors?.code} hint="Used in lead and quotation numbers">
          <Input id={`p-code-${id}`} name="code" defaultValue={property?.code} maxLength={8} required />
        </Field>
        <Field label="Currency" htmlFor={`p-cur-${id}`} hint={`Blank inherits ${orgDefaults.currency}`}>
          <Input id={`p-cur-${id}`} name="currency" defaultValue={property?.currency ?? ''} maxLength={3} />
        </Field>
        <Field label="City" htmlFor={`p-city-${id}`}>
          <Input id={`p-city-${id}`} name="city" defaultValue={property?.city ?? ''} />
        </Field>
        <Field label="Country" htmlFor={`p-country-${id}`}>
          <Input id={`p-country-${id}`} name="country" defaultValue={property?.country ?? ''} />
        </Field>
        <Field label="Tax %" htmlFor={`p-tax-${id}`} hint={`Blank inherits ${orgDefaults.taxPercent}%`}>
          <Input id={`p-tax-${id}`} name="taxPercent" type="number" step="0.5" min={0} max={50} defaultValue={property?.taxPercent ?? ''} />
        </Field>
        <Field label="Service %" htmlFor={`p-svc-${id}`} hint={`Blank inherits ${orgDefaults.servicePercent}%`}>
          <Input id={`p-svc-${id}`} name="servicePercent" type="number" step="0.5" min={0} max={50} defaultValue={property?.servicePercent ?? ''} />
        </Field>
      </div>

      {property ? (
        <Checkbox
          name="active"
          defaultChecked={property.active}
          label="Property is active"
          hint="Deactivating hides it from property switchers and new assignments; existing records are untouched."
        />
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm" loading={pending} icon={<Check aria-hidden className="size-3.5" />}>
          {property ? 'Save property' : 'Create property'}
        </Button>
      </div>
    </form>
  );
}
