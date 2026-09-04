'use client';

import { useActionState, useId, useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FormAlert } from '@/components/form-alert';
import { loginAction } from '@/server/actions/auth';

const DEMO_ACCOUNTS = [
  { email: 'admin@nusantara-hotels.test', role: 'Organization Admin' },
  { email: 'manager@nusantara-hotels.test', role: 'Sales Manager' },
  { email: 'agent@nusantara-hotels.test', role: 'Sales Agent' },
  { email: 'reservations@nusantara-hotels.test', role: 'Reservation / Front Office' },
  { email: 'analyst@nusantara-hotels.test', role: 'Analyst (masked PII)' },
];

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('admin@nusantara-hotels.test');
  const [password, setPassword] = useState('Passw0rd!2026');
  const emailId = useId();
  const passwordId = useId();
  const errors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <div>
      <header className="mb-7">
        <h1 className="t-display">Sign in</h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          Use the work account your hotel administrator set up for you.
        </p>
      </header>

      <form action={action} className="space-y-4" noValidate>
        {state?.ok === false && !state.fieldErrors ? <FormAlert message={state.error} /> : null}

        <Field label="Work email" htmlFor={emailId} required error={errors?.email}>
          <Input
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors?.email)}
            placeholder="you@hotel.com"
          />
        </Field>

        <Field label="Password" htmlFor={passwordId} required error={errors?.password}>
          <div className="relative">
            <Input
              id={passwordId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors?.password)}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="focus-ring absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:text-ink"
            >
              {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            </button>
          </div>
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full" icon={<LogIn aria-hidden className="size-4" />}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <section className="mt-8 rounded-lg border border-border bg-surface p-3.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Demo accounts</h2>
        <p className="mt-1 text-[11px] leading-4 text-ink-3">
          Every account uses <code className="text-ink-2">Passw0rd!2026</code>. Each role sees a different app.
        </p>
        <ul className="mt-2.5 space-y-1">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword('Passw0rd!2026');
                }}
                className="focus-ring flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="truncate font-mono text-[11px] text-ink-2">{a.email}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{a.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
