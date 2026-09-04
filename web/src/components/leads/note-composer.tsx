'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { addNoteAction } from '@/server/actions/leads';

export function NoteComposer({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(addNoteAction, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  const error = state?.ok === false ? (state.fieldErrors?.body ?? state.error) : null;

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor={`note-${leadId}`} className="sr-only">
        Add an internal note
      </label>
      <Textarea
        id={`note-${leadId}`}
        name="body"
        rows={2}
        placeholder="Add an internal note: what the guest said, what you promised, what to watch."
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <p role="alert" className="text-[11px] text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={pending} icon={<Send aria-hidden className="size-3.5" />}>
          Add note
        </Button>
      </div>
    </form>
  );
}
