import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { Activity, GitBranch, Plug } from 'lucide-react';
import { db, integrationConnections, mappingRules } from '@/db';
import { requirePermission, requireSession } from '@/server/context';
import { requestOrigin } from '@/server/origin';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConnectionCard } from '@/components/integrations/connection-card';
import { formatDateTime, parseJson, relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const session = await requireSession();
  requirePermission(session, 'integration.manage');
  const locale = session.organization.locale;

  const connections = db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.organizationId, session.user.organizationId))
    .all();

  const unmappedByConnection = new Map<string, number>();
  for (const rule of db.select().from(mappingRules).where(eq(mappingRules.organizationId, session.user.organizationId)).all()) {
    if (rule.status === 'unmapped') {
      unmappedByConnection.set(rule.connectionId, (unmappedByConnection.get(rule.connectionId) ?? 0) + 1);
    }
  }

  const origin = await requestOrigin();

  return (
    <PageShell className="max-w-[1100px]">
      <PageHeader
        title="Integrations"
        description="Chatwoot owns conversations. The PMS/CRS owns inventory and reservations. This is where those connections are configured and watched."
        actions={
          <div className="flex gap-2">
            <Link
              href="/integrations/mappings"
              className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3.5 text-[13px] font-medium hover:bg-surface-3"
            >
              <GitBranch aria-hidden className="size-4" />
              Mappings
            </Link>
            <Link
              href="/integrations/health"
              className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:bg-primary-hover"
            >
              <Activity aria-hidden className="size-4" />
              Health &amp; events
            </Link>
          </div>
        }
      />

      {connections.map((c) => (
        <ConnectionCard
          key={c.id}
          connection={{
            id: c.id,
            provider: c.provider,
            adapter: c.adapter,
            label: c.label,
            baseUrl: c.baseUrl ?? '',
            externalAccountId: c.externalAccountId ?? '',
            status: c.status,
            statusReason: c.statusReason,
            timeoutMs: c.timeoutMs,
            tokenLast4: c.apiTokenLast4,
            hasWebhookSecret: Boolean(c.webhookSecretCiphertext),
            lastTestedAt: c.lastTestedAt ? formatDateTime(c.lastTestedAt, locale) : null,
            lastTestSummary: parseJson<{ summary?: string }>(c.lastTestResult, {}).summary ?? null,
            lastEventAt: c.lastEventAt ? relativeTime(c.lastEventAt) : null,
            unmappedCount: unmappedByConnection.get(c.id) ?? 0,
            webhookUrl: `${origin}/api/webhooks/chatwoot/${c.id}`,
          }}
        />
      ))}

      <Card>
        <CardHeader
          title="How the connection is expected to behave"
          icon={<Plug aria-hidden className="size-4" />}
        />
        <CardBody>
          <ul className="space-y-2.5 text-[13px] leading-5 text-ink-2">
            <li>
              <strong className="font-medium text-ink">Secrets are write-only.</strong> Once saved, an API token is
              never shown again, only its last four characters. Leaving the field blank keeps the stored value.
            </li>
            <li>
              <strong className="font-medium text-ink">Unmapped routing never guesses.</strong> An event from an
              inbox or agent with no mapping goes to the dead-letter queue with the exact fix, rather than landing
              on an arbitrary property.
            </li>
            <li>
              <strong className="font-medium text-ink">Every inbound event is deduplicated</strong> on its external
              identity, so a redelivery cannot create a second lead or a second activity.
            </li>
            <li>
              <strong className="font-medium text-ink">Outbound writes carry an idempotency key</strong> and a source
              marker, so CRM updates cannot loop back in through the webhook.
            </li>
          </ul>
        </CardBody>
      </Card>
    </PageShell>
  );
}
