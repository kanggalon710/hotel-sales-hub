import type { Metadata } from 'next';
import { Suspense } from 'react';
import { and, eq, inArray } from 'drizzle-orm';
import { Kanban } from 'lucide-react';
import { db, userPropertyRoles, users } from '@/db';
import { getPropertyScope, leadVisibility, requireSession } from '@/server/context';
import { listLeads } from '@/server/queries/leads';
import { requestNow } from '@/lib/clock';
import { PageHeader, PageShell } from '@/components/page-header';
import { LeadFilterBar } from '@/components/leads/lead-filter-bar';
import { LeadListItem } from '@/components/leads/lead-list-item';
import { LeadsTable } from '@/components/leads/leads-table';
import { Card } from '@/components/ui/card';
import { ListState, PermissionDenied, TableSkeleton } from '@/components/ui/states';
import { LinkButton } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const scope = await getPropertyScope(session);

  if (leadVisibility(session) === 'none') {
    return (
      <PageShell>
        <PermissionDenied what="leads" />
      </PageShell>
    );
  }

  const now = requestNow();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const leadsList = listLeads(session, scope, {
    stages: one('stage') ? [one('stage')!] : undefined,
    status: (one('status') as 'open' | 'closed' | 'all') ?? 'open',
    ownerUserId: one('owner') as string | undefined,
    search: one('q'),
    overdueOnly: one('overdue') === '1',
    sort: (one('sort') as 'recent' | 'value' | 'checkin' | 'sla') ?? 'recent',
    limit: 120,
  });

  const canSeeOthers = session.permissions.has('lead.read.all');
  const owners = canSeeOthers && scope.permittedIds.length
    ? db
        .selectDistinct({ id: users.id, name: users.name })
        .from(users)
        .innerJoin(userPropertyRoles, eq(userPropertyRoles.userId, users.id))
        .where(
          and(
            eq(users.organizationId, session.user.organizationId),
            eq(users.status, 'active'),
            inArray(userPropertyRoles.propertyId, scope.permittedIds),
          ),
        )
        .all()
    : [];

  const hasFilters = Boolean(one('q') || one('stage') || one('owner') || one('overdue') || (one('status') && one('status') !== 'open'));

  return (
    <PageShell>
      <PageHeader
        title="Leads"
        count={`${leadsList.length} lead${leadsList.length === 1 ? '' : 's'}`}
        description={
          canSeeOthers
            ? 'Every lead in the properties you can access.'
            : 'Leads assigned to you or your team, plus unclaimed inquiries.'
        }
        actions={
          <LinkButton
            href="/pipeline"
            aria-label="Pipeline view"
            icon={<Kanban aria-hidden className="size-4" />}
            className="max-sm:size-9 max-sm:px-0"
          >
            <span className="max-sm:sr-only">Pipeline view</span>
          </LinkButton>
        }
      />

      <Suspense fallback={<div className="h-16" />}>
        <LeadFilterBar owners={owners} showOwnerFilter={canSeeOthers} total={leadsList.length} />
      </Suspense>

      <Card className="overflow-hidden">
        {leadsList.length === 0 ? (
          hasFilters ? (
            <ListState
              kind="filtered"
              title="No leads match these filters"
              description="Try widening the stage, owner, or status filter, or clear all filters to see the full list."
            />
          ) : (
            <ListState
              title="No leads yet"
              description="Inquiries arriving in a mapped Chatwoot sales inbox become leads automatically. You can also link an existing conversation from the CRM panel."
            />
          )
        ) : (
          <>
            {/* One list, two presentations: a shared column grid where there is
                room for it, a stacked row where there is not. */}
            <div className="hidden lg:block">
              <LeadsTable
                leads={leadsList}
                locale={session.organization.locale}
                showProperty={scope.isAllView}
                showOwner={canSeeOthers}
                now={now}
              />
            </div>
            <ul className="divide-y divide-border lg:hidden">
              {leadsList.map((lead) => (
                <li key={lead.id}>
                  <LeadListItem lead={lead} locale={session.organization.locale} showProperty={scope.isAllView} now={now} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </PageShell>
  );
}

export function LeadsLoading() {
  return <TableSkeleton rows={8} cols={5} />;
}
