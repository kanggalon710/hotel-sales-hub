'use client';

import { useActionState } from 'react';
import { Building2, Check } from 'lucide-react';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { InlineError } from '@/components/ui/states';
import { updateOrganizationAction } from '@/server/actions/organization';

export function OrganizationForm({
  values,
}: {
  values: {
    name: string; currency: string; locale: string; timezone: string;
    taxPercent: number; servicePercent: number; quotationValidityHours: number;
    firstResponseSlaMinutes: number; availabilityStaleAfterMinutes: number;
  };
}) {
  const [state, action, pending] = useActionState(updateOrganizationAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader
        title="Organization defaults"
        subtitle="These values drive quotation pricing, SLA timers, and how quickly availability is considered stale."
        icon={<Building2 aria-hidden className="size-4" />}
      />
      <form action={action}>
        <CardBody className="space-y-4">
          {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}
          {state?.ok ? (
            <p className="rounded-md bg-success-soft px-3 py-2 text-[12px] text-success-ink">
              Saved. New quotations and SLA timers use these values immediately.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Organization name" htmlFor="org-name" required error={errors?.name} className="sm:col-span-2">
              <Input id="org-name" name="name" defaultValue={values.name} required />
            </Field>
            <Field label="Currency" htmlFor="org-currency" required error={errors?.currency} hint="ISO code, e.g. IDR">
              <Input id="org-currency" name="currency" defaultValue={values.currency} maxLength={3} required />
            </Field>
            <Field label="Locale" htmlFor="org-locale" required error={errors?.locale} hint="Number and date formatting">
              <Input id="org-locale" name="locale" defaultValue={values.locale} required />
            </Field>
            <Field label="Timezone" htmlFor="org-tz" required error={errors?.timezone} hint="IANA name" className="sm:col-span-2">
              <Input id="org-tz" name="timezone" defaultValue={values.timezone} required />
            </Field>
          </div>

          <fieldset className="rounded-md border border-border bg-surface-inset p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Commercial defaults
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tax %" htmlFor="org-tax" required error={errors?.taxPercent} hint="Applied to net + service">
                <Input id="org-tax" name="taxPercent" type="number" step="0.5" min={0} max={50} defaultValue={values.taxPercent} required />
              </Field>
              <Field label="Service charge %" htmlFor="org-service" required error={errors?.servicePercent} hint="Applied to the net amount">
                <Input id="org-service" name="servicePercent" type="number" step="0.5" min={0} max={50} defaultValue={values.servicePercent} required />
              </Field>
              <Field label="Quotation validity (hours)" htmlFor="org-validity" required error={errors?.quotationValidityHours}>
                <Input id="org-validity" name="quotationValidityHours" type="number" min={1} max={720} defaultValue={values.quotationValidityHours} required />
              </Field>
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-border bg-surface-inset p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Service levels
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First-response SLA (minutes)"
                htmlFor="org-sla"
                required
                error={errors?.firstResponseSlaMinutes}
                hint="Starts when a lead is created from a conversation."
              >
                <Input id="org-sla" name="firstResponseSlaMinutes" type="number" min={1} max={1440} defaultValue={values.firstResponseSlaMinutes} required />
              </Field>
              <Field
                label="Availability goes stale after (minutes)"
                htmlFor="org-stale"
                required
                error={errors?.availabilityStaleAfterMinutes}
                hint="Beyond this, a cached result is labelled stale and cannot be quoted from without a recheck."
              >
                <Input id="org-stale" name="availabilityStaleAfterMinutes" type="number" min={1} max={1440} defaultValue={values.availabilityStaleAfterMinutes} required />
              </Field>
            </div>
          </fieldset>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" loading={pending} icon={<Check aria-hidden className="size-4" />}>
            Save organization
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
