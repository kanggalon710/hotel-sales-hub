'use client';

import { useActionState, useId, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FormAlert } from '@/components/form-alert';
import { acceptInvitationAction } from '@/server/actions/auth';

export function AcceptInviteForm({
  token,
  email,
  suggestedName,
  roleName,
  orgName,
  propertyCount,
  propertyNames,
}: {
  token: string;
  email: string;
  suggestedName: string;
  roleName: string;
  orgName: string;
  propertyCount: number;
  propertyNames: string[];
}) {
  const [state, action, pending] = useActionState(acceptInvitationAction, null);
  const [name, setName] = useState(suggestedName);
  const ids = { name: useId(), password: useId(), confirm: useId() };
  const errors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <div>
      <header className="mb-6">
        <h1 className="t-display">Activate your account</h1>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-2">
          {orgName} invited you as <strong className="font-medium text-ink">{roleName}</strong>
          {propertyCount > 0
            ? ` for ${propertyNames.length ? propertyNames.join(', ') : `${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'}`}`
            : ' across the whole organization'}
          .
        </p>
      </header>

      <div className="mb-5 rounded-md border border-border bg-surface px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-ink-3">Signing in as</p>
        <p className="mt-0.5 font-mono text-[13px] text-ink">{email}</p>
      </div>

      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="token" value={token} />
        {state?.ok === false && !state.fieldErrors ? <FormAlert message={state.error} /> : null}

        <Field label="Your full name" htmlFor={ids.name} required error={errors?.name}>
          <Input
            id={ids.name}
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Create a password"
          htmlFor={ids.password}
          required
          error={errors?.password}
          hint="At least 12 characters, with an uppercase letter, a lowercase letter, and a number."
        >
          <Input id={ids.password} name="password" type="password" autoComplete="new-password" required />
        </Field>

        <Field label="Confirm password" htmlFor={ids.confirm} required error={errors?.confirmPassword}>
          <Input id={ids.confirm} name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full" icon={<UserCheck aria-hidden className="size-4" />}>
          {pending ? 'Activating…' : 'Activate account'}
        </Button>
      </form>
    </div>
  );
}
