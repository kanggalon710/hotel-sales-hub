'use client';

import { useActionState, useId } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FormAlert } from '@/components/form-alert';
import { changePasswordAction } from '@/server/actions/auth';

export function ChangePasswordForm({ forced, name }: { forced: boolean; name: string }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const errors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <div>
      <header className="mb-7">
        <h1 className="t-display">
          {forced ? 'Set a new password' : 'Change your password'}
        </h1>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-2">
          {forced
            ? `Welcome, ${name}. Choose your own password before you continue.`
            : 'Changing your password signs you out of every other device.'}
        </p>
      </header>

      <form action={action} className="space-y-4" noValidate>
        {state?.ok === false && !state.fieldErrors ? <FormAlert message={state.error} /> : null}

        <Field label="Current password" htmlFor={ids.current} required error={errors?.currentPassword}>
          <Input id={ids.current} name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>

        <Field
          label="New password"
          htmlFor={ids.next}
          required
          error={errors?.newPassword}
          hint="At least 12 characters, with an uppercase letter, a lowercase letter, and a number."
        >
          <Input id={ids.next} name="newPassword" type="password" autoComplete="new-password" required />
        </Field>

        <Field label="Confirm new password" htmlFor={ids.confirm} required error={errors?.confirmPassword}>
          <Input id={ids.confirm} name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full" icon={<KeyRound aria-hidden className="size-4" />}>
          {pending ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </div>
  );
}
