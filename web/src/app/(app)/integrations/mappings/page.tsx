import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db, integrationConnections, mappingRules, properties, teams, users } from '@/db';
import { requirePermission, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { ListState } from '@/components/ui/states';
import { MappingRow } from '@/components/integrations/mapping-row';
import { parseJson } from '@/lib/utils';

export const metadata: Metadata = { title: 'Mappings' };
export const dynamic = 'force-dynamic';

export default async function MappingsPage() {
  const session = await requireSession();
  requirePermission(session, 'integration.manage');
  const orgId = session.user.organizationId;

  const rules = db
    .select({
      id: mappingRules.id, kind: mappingRules.kind, externalId: mappingRules.externalId,
      externalName: mappingRules.externalName, channel: mappingRules.channel,
      propertyId: mappingRules.propertyId, teamId: mappingRules.teamId, userId: mappingRules.userId,
      inquiryType: mappingRules.inquiryType, isSalesInbox: mappingRules.isSalesInbox,
      triggerLabels: mappingRules.triggerLabels, status: mappingRules.status,
      connectionLabel: integrationConnections.label,
    })
    .from(mappingRules)
    .innerJoin(integrationConnections, eq(integrationConnections.id, mappingRules.connectionId))
    .where(eq(mappingRules.organizationId, orgId))
    .orderBy(asc(mappingRules.kind), asc(mappingRules.externalId))
    .all();

  const propertyOptions = db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.organizationId, orgId), eq(properties.active, true)))
    .all()
    .filter((p) => session.propertyAccess.some((a) => a.propertyId === p.id));

  const teamOptions = db
    .select({ id: teams.id, name: teams.name, propertyId: teams.propertyId })
    .from(teams)
    .where(eq(teams.organizationId, orgId))
    .all();

  const userOptions = db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, orgId), eq(users.status, 'active')))
    .all();

  const inboxes = rules.filter((r) => r.kind === 'inbox');
  const agents = rules.filter((r) => r.kind === 'agent');
  const unmapped = rules.filter((r) => r.status === 'unmapped').length;

  return (
    <PageShell narrow>
      <Link href="/integrations" className="focus-ring tap inline-flex items-center gap-1.5 rounded text-[12px] text-ink-3 hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to integrations
      </Link>

      <PageHeader
        title="Routing mappings"
        description="Which inbox belongs to which property, and which Chatwoot agent is which CRM user. Nothing routes by guesswork."
        meta={
          unmapped > 0 ? (
            <span className="rounded-md bg-warning-soft px-2 py-1 text-[11px] text-warning-ink">
              {unmapped} unmapped. Events from these are held in the dead-letter queue
            </span>
          ) : (
            <span className="rounded-md bg-success-soft px-2 py-1 text-[11px] text-success-ink">
              All routing resolved
            </span>
          )
        }
      />

      <Card>
        <CardHeader
          title="Inboxes → property"
          subtitle="A sales inbox creates leads automatically. Others create leads only when a trigger label is present."
        />
        {inboxes.length === 0 ? (
          <ListState title="No inboxes discovered yet" description="Inboxes appear once Chatwoot delivers its first event." />
        ) : (
          <ul className="divide-y divide-border">
            {inboxes.map((r) => (
              <MappingRow
                key={r.id}
                rule={{
                  id: r.id, kind: 'inbox', externalId: r.externalId, externalName: r.externalName,
                  channel: r.channel, status: r.status, propertyId: r.propertyId, teamId: r.teamId,
                  userId: r.userId, inquiryType: r.inquiryType, isSalesInbox: r.isSalesInbox,
                  triggerLabels: parseJson<string[]>(r.triggerLabels, []).join(', '),
                  connectionLabel: r.connectionLabel,
                }}
                properties={propertyOptions}
                teams={teamOptions}
                users={userOptions}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Agents → CRM user"
          subtitle="Mapping uses the immutable Chatwoot agent id. An unmapped agent never gets CRM access implicitly."
        />
        {agents.length === 0 ? (
          <ListState title="No agents discovered yet" description="Agents appear once they are assigned to a conversation." />
        ) : (
          <ul className="divide-y divide-border">
            {agents.map((r) => (
              <MappingRow
                key={r.id}
                rule={{
                  id: r.id, kind: 'agent', externalId: r.externalId, externalName: r.externalName,
                  channel: r.channel, status: r.status, propertyId: r.propertyId, teamId: r.teamId,
                  userId: r.userId, inquiryType: r.inquiryType, isSalesInbox: r.isSalesInbox,
                  triggerLabels: parseJson<string[]>(r.triggerLabels, []).join(', '),
                  connectionLabel: r.connectionLabel,
                }}
                properties={propertyOptions}
                teams={teamOptions}
                users={userOptions}
              />
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
