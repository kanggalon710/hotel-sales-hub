'use client';

import { useActionState, useId, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { FormAlert } from '@/components/form-alert';
import { INQUIRY_TYPES } from '@/lib/constants';
import { saveQualificationAction } from '@/server/actions/leads';
import { formatStayDate, nightsBetween, titleCase } from '@/lib/utils';

type Values = {
  checkIn: string; checkOut: string; rooms: number; adults: number; children: number;
  inquiryType: string; roomPreference: string; purpose: string; specialRequest: string; budgetNote: string;
};

/**
 * Qualification fields the PRD marks mandatory before availability or quoting
 * (11.2). Read-only until the user chooses to edit, so the cockpit stays calm.
 */
export function QualificationForm({
  leadId,
  values,
  canWrite,
}: {
  leadId: string;
  values: Values;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(saveQualificationAction, null);
  const [draft, setDraft] = useState(values);
  const ids = {
    checkIn: useId(), checkOut: useId(), rooms: useId(), adults: useId(),
    children: useId(), inquiryType: useId(), roomPreference: useId(),
    purpose: useId(), specialRequest: useId(), budgetNote: useId(),
  };
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const nights = draft.checkIn && draft.checkOut ? nightsBetween(draft.checkIn, draft.checkOut) : 0;

  // Close the editor once the action reports success.
  if (state?.ok && editing && !pending) setTimeout(() => setEditing(false), 0);

  const missing = [
    !values.checkIn || !values.checkOut ? 'stay dates' : null,
    !values.rooms ? 'rooms' : null,
    !values.adults ? 'adults' : null,
  ].filter(Boolean) as string[];

  if (!editing) {
    return (
      <Card>
        <CardHeader
          title="Qualification"
          subtitle={
            missing.length
              ? `Incomplete. Add ${missing.join(', ')} before checking availability.`
              : 'Complete. Availability and quotation are unlocked.'
          }
          action={
            canWrite ? (
              <Button variant="ghost" onClick={() => setEditing(true)} icon={<Pencil aria-hidden className="size-3.5" />}>
                Edit
              </Button>
            ) : null
          }
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {[
              { label: 'Check-in', value: values.checkIn ? formatStayDate(values.checkIn) : '–' },
              { label: 'Check-out', value: values.checkOut ? formatStayDate(values.checkOut) : '–' },
              { label: 'Nights', value: values.checkIn && values.checkOut ? nightsBetween(values.checkIn, values.checkOut) : '–' },
              { label: 'Rooms', value: values.rooms || '–' },
              { label: 'Adults', value: values.adults || '–' },
              { label: 'Children', value: values.children ?? 0 },
              { label: 'Inquiry type', value: titleCase(values.inquiryType) },
              { label: 'Room preference', value: values.roomPreference || '–' },
            ].map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-ink-3">{row.label}</dt>
                <dd className="mt-0.5 truncate text-[13px] text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
          {values.specialRequest ? (
            <div className="mt-3 rounded-md bg-surface-inset px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-ink-3">Special request</p>
              <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{values.specialRequest}</p>
            </div>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Qualification" subtitle="These fields gate availability, quoting, and the front-office handoff." />
      <form action={action}>
        <input type="hidden" name="leadId" value={leadId} />
        <CardBody className="space-y-4">
          {state?.ok === false && !state.fieldErrors ? <FormAlert message={state.error} /> : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Check-in" htmlFor={ids.checkIn} required error={errors?.checkIn}>
              <Input
                id={ids.checkIn} name="checkIn" type="date" required value={draft.checkIn}
                onChange={(e) => setDraft({ ...draft, checkIn: e.target.value })}
              />
            </Field>
            <Field
              label="Check-out"
              htmlFor={ids.checkOut}
              required
              error={errors?.checkOut}
              hint={nights > 0 ? `${nights} night${nights === 1 ? '' : 's'}` : undefined}
            >
              <Input
                id={ids.checkOut} name="checkOut" type="date" required value={draft.checkOut}
                onChange={(e) => setDraft({ ...draft, checkOut: e.target.value })}
              />
            </Field>
            <Field label="Inquiry type" htmlFor={ids.inquiryType} required>
              <Select
                id={ids.inquiryType} name="inquiryType" value={draft.inquiryType}
                onChange={(e) => setDraft({ ...draft, inquiryType: e.target.value })}
              >
                {INQUIRY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Rooms" htmlFor={ids.rooms} required error={errors?.rooms}>
              <Input
                id={ids.rooms} name="rooms" type="number" inputMode="numeric" min={1} max={60} required
                value={draft.rooms} onChange={(e) => setDraft({ ...draft, rooms: Number(e.target.value) })}
              />
            </Field>
            <Field label="Adults" htmlFor={ids.adults} required error={errors?.adults}>
              <Input
                id={ids.adults} name="adults" type="number" inputMode="numeric" min={1} max={120} required
                value={draft.adults} onChange={(e) => setDraft({ ...draft, adults: Number(e.target.value) })}
              />
            </Field>
            <Field label="Children" htmlFor={ids.children}>
              <Input
                id={ids.children} name="children" type="number" inputMode="numeric" min={0} max={60}
                value={draft.children} onChange={(e) => setDraft({ ...draft, children: Number(e.target.value) })}
              />
            </Field>
            <Field label="Room preference" htmlFor={ids.roomPreference}>
              <Input
                id={ids.roomPreference} name="roomPreference" value={draft.roomPreference}
                onChange={(e) => setDraft({ ...draft, roomPreference: e.target.value })}
                placeholder="High floor, king bed"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Purpose of stay" htmlFor={ids.purpose}>
              <Input
                id={ids.purpose} name="purpose" value={draft.purpose}
                onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                placeholder="Business trip, honeymoon, conference"
              />
            </Field>
            <Field label="Budget note" htmlFor={ids.budgetNote} hint="Internal only, never shown to the guest.">
              <Input
                id={ids.budgetNote} name="budgetNote" value={draft.budgetNote}
                onChange={(e) => setDraft({ ...draft, budgetNote: e.target.value })}
                placeholder="Under 2 juta per night"
              />
            </Field>
          </div>

          <Field label="Special request" htmlFor={ids.specialRequest} hint="Carried into the front-office handoff.">
            <Textarea
              id={ids.specialRequest} name="specialRequest" value={draft.specialRequest}
              onChange={(e) => setDraft({ ...draft, specialRequest: e.target.value })}
              placeholder="Connecting rooms, early check-in, dietary needs"
            />
          </Field>
        </CardBody>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="button" variant="ghost" onClick={() => { setDraft(values); setEditing(false); }}
            icon={<X aria-hidden className="size-3.5" />}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending} icon={<Check aria-hidden className="size-4" />}>
            Save qualification
          </Button>
        </footer>
      </form>
    </Card>
  );
}
