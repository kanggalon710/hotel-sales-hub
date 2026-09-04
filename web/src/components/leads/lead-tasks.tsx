'use client';

import { useActionState, useState, useTransition } from 'react';
import { CalendarPlus, Check, Clock } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { completeTaskAction, scheduleFollowUpAction } from '@/server/actions/leads';
import { cn, formatDateTime, isOverdue, relativeTime } from '@/lib/utils';

export type LeadTask = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  dueAt: number | null;
  assigneeName: string | null;
};

export function LeadTasks({
  leadId,
  tasks,
  canWrite,
}: {
  leadId: string;
  tasks: LeadTask[];
  canWrite: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(scheduleFollowUpAction, null);
  const [completing, startCompleting] = useTransition();
  const toast = useToast();

  const errors = state?.ok === false ? state.fieldErrors : undefined;
  // Lazy init: computed once when the component mounts, not on every render.
  const [defaultDue] = useState(() => new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0, 16));

  function complete(taskId: string, title: string) {
    startCompleting(async () => {
      const result = await completeTaskAction(taskId);
      if (result.ok) toast.push({ tone: 'success', title: 'Task completed', body: title });
      else toast.push({ tone: 'error', title: 'Could not complete the task', body: result.error });
    });
  }

  if (state?.ok && adding && !pending) setTimeout(() => setAdding(false), 0);

  return (
    <Card>
      <CardHeader
        title="Open tasks"
        subtitle={tasks.length ? `${tasks.length} waiting` : 'Nothing scheduled'}
        action={
          canWrite ? (
            <Button variant="ghost" onClick={() => setAdding((v) => !v)} icon={<CalendarPlus aria-hidden className="size-3.5" />}>
              {adding ? 'Cancel' : 'Schedule'}
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-3">
        {adding ? (
          <form action={action} className="space-y-3 rounded-md border border-border bg-surface-inset p-3">
            <input type="hidden" name="leadId" value={leadId} />
            <Field label="What needs doing" htmlFor={`task-title-${leadId}`} required error={errors?.title}>
              <Input
                id={`task-title-${leadId}`}
                name="title"
                defaultValue="Follow up with the guest"
                required
              />
            </Field>
            <Field label="Due" htmlFor={`task-due-${leadId}`} required error={errors?.dueAt}>
              <Input id={`task-due-${leadId}`} name="dueAt" type="datetime-local" defaultValue={defaultDue} required />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm" loading={pending}>
                Schedule follow-up
              </Button>
            </div>
          </form>
        ) : null}

        {tasks.length === 0 && !adding ? (
          <p className="py-3 text-center text-[12px] text-ink-3">
            No open tasks. Schedule a follow-up so this lead does not go quiet.
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => {
              const overdue = isOverdue(task.dueAt);
              return (
                <li
                  key={task.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md border border-border bg-surface-inset p-2.5',
                    overdue && 'border-warning-ink/40',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-ink">{task.title}</span>
                    {task.description ? (
                      <span className="mt-0.5 block text-[11px] leading-4 text-ink-2">{task.description}</span>
                    ) : null}
                    <span
                      className={cn(
                        'mt-1 flex items-center gap-1 font-mono text-[10px]',
                        overdue ? 'text-warning-ink' : 'text-ink-3',
                      )}
                    >
                      <Clock aria-hidden className="size-3" />
                      {task.dueAt ? (
                        <>
                          {overdue ? 'overdue ' : 'due '}
                          <time dateTime={new Date(task.dueAt).toISOString()} title={formatDateTime(task.dueAt)}>
                            {relativeTime(task.dueAt)}
                          </time>
                        </>
                      ) : (
                        'no due date'
                      )}
                      {task.assigneeName ? ` · ${task.assigneeName}` : ' · unassigned'}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Mark "${task.title}" as done`}
                    onClick={() => complete(task.id, task.title)}
                    loading={completing}
                    className="shrink-0"
                  >
                    <Check aria-hidden className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
