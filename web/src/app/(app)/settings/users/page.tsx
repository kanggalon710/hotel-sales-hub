import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db, properties, teams } from '@/db';
import { requirePermission, requireSession } from '@/server/context';
import { pendingInvitations, roleCatalogue, visibleUsers } from '@/server/services/user-admin';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { ListState } from '@/components/ui/states';
import { UserAdmin } from '@/components/settings/user-admin';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { requestNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await requireSession();
  requirePermission(session, 'user.manage');
  const orgId = session.user.organizationId;
  const locale = session.organization.locale;

  const now = requestNow();
  const people = visibleUsers(session);
  const invites = pendingInvitations(orgId);

  const propertyOptions = db
    .select({ id: properties.id, name: properties.name, code: properties.code })
    .from(properties)
    .where(and(eq(properties.organizationId, orgId), eq(properties.active, true)))
    .all()
    .filter((p) => session.orgRoleKeys.includes('org_admin') || session.propertyAccess.some((a) => a.propertyId === p.id));

  const teamOptions = db
    .select({ id: teams.id, name: teams.name, propertyId: teams.propertyId })
    .from(teams)
    .where(eq(teams.organizationId, orgId))
    .all();

  return (
    <PageShell narrow>
      <Link href="/settings" className="focus-ring tap inline-flex items-center gap-1.5 rounded text-[12px] text-ink-3 hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to settings
      </Link>

      <PageHeader
        title="Users and access"
        description="Invite people, scope them to properties, and set discount authority. Suspending someone revokes their sessions immediately."
      />

      <UserAdmin
        currentUserId={session.user.id}
        isOrgAdmin={session.orgRoleKeys.includes('org_admin')}
        approvalCeiling={session.orgRoleKeys.includes('org_admin') ? 100 : session.user.canApproveDiscountUpToPercent}
        users={people.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          status: u.status,
          jobTitle: u.jobTitle,
          lastLogin: u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'never',
          mustChangePassword: u.mustChangePassword,
          discountLimitPercent: u.discountLimitPercent,
          canApproveDiscountUpToPercent: u.canApproveDiscountUpToPercent,
          roleKey: u.grants[0]?.roleKey ?? '',
          roleName: u.grants[0]?.roleName ?? 'No role',
          roleScope: u.grants[0]?.roleScope ?? 'property',
          propertyIds: u.grants.map((g) => g.propertyId).filter((p): p is string => Boolean(p)),
          teamId: null,
          teamNames: [...new Set(u.grants.map((g) => g.teamName).filter(Boolean))] as string[],
        }))}
        invitations={invites.map((i) => ({
          id: i.id,
          email: i.email,
          name: i.name,
          roleName: i.roleName,
          invitedBy: i.invitedBy ?? 'Unknown',
          expiresLabel: relativeTime(i.expiresAt),
          expiresAt: formatDateTime(i.expiresAt, locale),
          expired: i.expiresAt.getTime() < now,
        }))}
        roles={roleCatalogue().map((r) => ({ key: r.key, name: r.name, scope: r.scope, description: r.description }))}
        properties={propertyOptions}
        teams={teamOptions}
      />

      {people.length === 0 ? (
        <Card>
          <CardHeader title="No users visible" />
          <ListState title="Nobody to show" description="You can only see users who share a property with you." />
        </Card>
      ) : null}
    </PageShell>
  );
}
