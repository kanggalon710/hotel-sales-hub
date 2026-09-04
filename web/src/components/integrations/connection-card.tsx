'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, PlugZap, RefreshCw } from 'lucide-react';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/badge';
import { InlineError } from '@/components/ui/states';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { rotateWebhookSecretAction, saveConnectionAction, testConnectionAction } from '@/server/actions/integrations';

export type ConnectionView = {
  id: string;
  provider: string;
  adapter: string;
  label: string;
  baseUrl: string;
  externalAccountId: string;
  status: string;
  statusReason: string | null;
  timeoutMs: number;
  tokenLast4: string | null;
  hasWebhookSecret: boolean;
  lastTestedAt: string | null;
  lastTestSummary: string | null;
  lastEventAt: string | null;
  unmappedCount: number;
  webhookUrl: string;
};

export function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, saving] = useActionState(saveConnectionAction, null);
  const [testing, startTest] = useTransition();
  const [rotating, startRotate] = useTransition();
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;

  function copy(value: string, what: string) {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
      },
      () => toast.push({ tone: 'error', title: 'Could not copy', body: 'Copy it manually from the field.' }),
    );
  }

  function test() {
    startTest(async () => {
      const result = await testConnectionAction(connection.id);
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Connection test failed', body: result.error });
        return;
      }
      toast.push({
        tone: result.data.status === 'healthy' ? 'success' : 'warning',
        title: `Connection ${result.data.status.replace('_', ' ')}`,
        body: result.data.summary,
      });
      router.refresh();
    });
  }

  function rotate() {
    startRotate(async () => {
      const result = await rotateWebhookSecretAction(connection.id);
      setConfirmRotate(false);
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not rotate the secret', body: result.error });
        return;
      }
      setNewSecret(result.data.secret);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader
          title={connection.label}
          subtitle={`${connection.provider === 'chatwoot' ? 'Conversations' : 'Inventory and reservations'} · adapter ${connection.adapter}`}
          icon={<PlugZap aria-hidden className="size-4" />}
          action={
            <div className="flex items-center gap-2">
              {connection.unmappedCount > 0 ? (
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning-ink">
                  {connection.unmappedCount} unmapped
                </span>
              ) : null}
              <StatusBadge status={connection.status} />
            </div>
          }
        />

        <form action={action}>
          <input type="hidden" name="connectionId" value={connection.id} />
          <CardBody className="space-y-4">
            {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}
            {state?.ok ? (
              <p className="rounded-md bg-success-soft px-3 py-2 text-[12px] text-success-ink">Connection saved.</p>
            ) : null}
            {connection.statusReason ? (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-ink">{connection.statusReason}</p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" htmlFor={`label-${connection.id}`} required error={errors?.label}>
                <Input id={`label-${connection.id}`} name="label" defaultValue={connection.label} required />
              </Field>
              <Field
                label="Base URL"
                htmlFor={`url-${connection.id}`}
                required
                error={errors?.baseUrl}
                hint="Cloud or self-hosted origin, without a trailing slash."
              >
                <Input id={`url-${connection.id}`} name="baseUrl" type="url" defaultValue={connection.baseUrl} required />
              </Field>
              <Field label="Account id" htmlFor={`acct-${connection.id}`} required error={errors?.externalAccountId}>
                <Input id={`acct-${connection.id}`} name="externalAccountId" defaultValue={connection.externalAccountId} required />
              </Field>
              <Field
                label="Request timeout (ms)"
                htmlFor={`timeout-${connection.id}`}
                error={errors?.timeoutMs}
                hint="Applies per outbound call to this connector."
              >
                <Input id={`timeout-${connection.id}`} name="timeoutMs" type="number" min={1000} max={30000} step={500} defaultValue={connection.timeoutMs} />
              </Field>
            </div>

            <Field
              label="API access token"
              htmlFor={`token-${connection.id}`}
              hint={
                connection.tokenLast4
                  ? `A token ending ••••${connection.tokenLast4} is stored. Leave blank to keep it; enter a new one to replace it.`
                  : 'No token stored yet.'
              }
            >
              <Input
                id={`token-${connection.id}`}
                name="apiToken"
                type="password"
                autoComplete="off"
                placeholder={connection.tokenLast4 ? '•••••••••••••••' : 'Paste the access token'}
              />
            </Field>

            {connection.provider === 'chatwoot' ? (
              <div className="rounded-md border border-border bg-surface-inset p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Webhook endpoint</p>
                <p className="mt-1 text-[11px] leading-4 text-ink-3">
                  Add this URL in Chatwoot under Settings → Integrations → Webhooks, and append{' '}
                  <code className="text-ink-2">?token=&lt;secret&gt;</code> or send it as{' '}
                  <code className="text-ink-2">X-Webhook-Token</code>.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1.5 font-mono text-[11px] text-ink-2">
                    {connection.webhookUrl}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => copy(connection.webhookUrl, 'url')}
                    icon={copied === 'url' ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                  >
                    {copied === 'url' ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRotate(true)}
                    icon={<KeyRound aria-hidden className="size-3.5" />}
                  >
                    Rotate secret
                  </Button>
                </div>
                <p className="mt-2 font-mono text-[10px] text-ink-3">
                  {connection.hasWebhookSecret ? 'A webhook secret is set.' : 'No webhook secret, so the endpoint accepts unauthenticated posts.'}
                </p>
              </div>
            ) : null}

            <dl className="grid gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-ink-3">Last tested</dt>
                <dd className="mt-0.5 font-mono text-[11px] text-ink-2">{connection.lastTestedAt ?? 'never'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-ink-3">Last event</dt>
                <dd className="mt-0.5 font-mono text-[11px] text-ink-2">{connection.lastEventAt ?? 'none yet'}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-[11px] uppercase tracking-wide text-ink-3">Last test result</dt>
                <dd className="mt-0.5 text-[11px] leading-4 text-ink-2">{connection.lastTestSummary ?? '–'}</dd>
              </div>
            </dl>
          </CardBody>

          <CardFooter>
            <Button type="button" variant="secondary" onClick={test} loading={testing} icon={<RefreshCw aria-hidden className="size-4" />}>
              Test connection
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save connection
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Modal
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        title="Rotate the webhook secret?"
        description="Chatwoot will stop delivering events until you paste the new secret into its webhook configuration."
        tone="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRotate(false)}>Cancel</Button>
            <Button variant="danger" onClick={rotate} loading={rotating}>Rotate secret</Button>
          </>
        }
      />

      <Modal
        open={Boolean(newSecret)}
        onClose={() => setNewSecret(null)}
        title="Copy the new webhook secret now"
        description="This is the only time it is shown. If you lose it, rotate again."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => newSecret && copy(newSecret, 'secret')}
              icon={copied === 'secret' ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            >
              {copied === 'secret' ? 'Copied' : 'Copy secret'}
            </Button>
            <Button variant="primary" onClick={() => setNewSecret(null)}>Done</Button>
          </>
        }
      >
        <code className="block break-all rounded-md bg-surface-inset px-3 py-2.5 font-mono text-[12px] text-ink">
          {newSecret}
        </code>
      </Modal>
    </>
  );
}
