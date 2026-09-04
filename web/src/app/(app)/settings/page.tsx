import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { BedDouble, Building2, GitBranch, ShieldCheck, Users2 } from 'lucide-react';
import { db, organizations, properties, users } from '@/db';
import { canAny, requireSession } from '@/server/context';
import { roleCatalogue } from '@/server/services/user-admin';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PermissionDenied } from '@/components/ui/states';
import { OrganizationForm } from '@/components/settings/organization-form';
import { PropertyList } from '@/components/settings/property-list';
import { RoleMatrix } from '@/components/settings/role-matrix';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  if (!canAny(session, 'org.manage', 'property.manage', 'user.manage')) {
    return (
      <PageShell>
        <PermissionDenied what="organization settings" />
      </PageShell>
    );
  }

  const org = db.select().from(organizations).where(eq(organizations.id, session.user.organizationId)).get()!;
  const props = db
    .select()
    .from(properties)
    .where(eq(properties.organizationId, session.user.organizationId))
    .all()
    .filter((p) => session.propertyAccess.some((a) => a.propertyId === p.id) || session.orgRoleKeys.includes('org_admin'));

  const userCount = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, session.user.organizationId), eq(users.status, 'active')))
    .all().length;

  const isOrgAdmin = session.orgRoleKeys.includes('org_admin');

  return (
    <PageShell narrow>
      <PageHeader
        title="Settings"
        description="Organization defaults, properties, people, and the permission model they all run on."
        actions={
          <>
          <Link
            href="/settings/rooms"
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-2"
          >
            <BedDouble aria-hidden className="size-4" />
            Kamar &amp; Tarif
          </Link>
          <Link
            href="/settings/pipelines"
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-2"
          >
            <GitBranch aria-hidden className="size-4" />
            Pipelines
          </Link>
          <Link
            href="/settings/users"
            className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:bg-primary-hover"
          >
            <Users2 aria-hidden className="size-4" />
            Manage users ({userCount})
          </Link>
          </>
        }
      />

      {session.permissions.has('org.manage') ? (
        <OrganizationForm
          values={{
            name: org.name,
            currency: org.currency,
            locale: org.locale,
            timezone: org.timezone,
            taxPercent: org.taxPercent,
            servicePercent: org.servicePercent,
            quotationValidityHours: org.quotationValidityHours,
            firstResponseSlaMinutes: org.firstResponseSlaMinutes,
            availabilityStaleAfterMinutes: org.availabilityStaleAfterMinutes,
          postStayFollowUpDays: org.postStayFollowUpDays,
          winBackAfterDays: org.winBackAfterDays,
          }}
        />
      ) : (
        <Card>
          <CardHeader title="Organization" subtitle="Read-only for your role." icon={<Building2 aria-hidden className="size-4" />} />
          <CardBody>
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                ['Name', org.name],
                ['Currency', org.currency],
                ['Timezone', org.timezone],
                ['Tax', `${org.taxPercent}%`],
                ['Service charge', `${org.servicePercent}%`],
                ['First-response SLA', `${org.firstResponseSlaMinutes} minutes`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-3">{label}</dt>
                  <dd className="mt-0.5 text-[13px] text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}

      <PropertyList
        properties={props.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          city: p.city,
          country: p.country,
          timezone: p.timezone,
          currency: p.currency,
          taxPercent: p.taxPercent,
          servicePercent: p.servicePercent,
          active: p.active,
        }))}
        orgDefaults={{ currency: org.currency, timezone: org.timezone, taxPercent: org.taxPercent, servicePercent: org.servicePercent }}
        canCreate={isOrgAdmin}
        canEdit={session.permissions.has('property.manage')}
      />

      <Card>
        <CardHeader
          title="Permission model"
          subtitle="Predefined roles for the MVP. Every check runs on the server, so hiding a menu is never the control."
          icon={<ShieldCheck aria-hidden className="size-4" />}
        />
        <RoleMatrix roles={roleCatalogue().map((r) => ({ key: r.key, name: r.name, scope: r.scope, permissions: r.permissions as string[] }))} />
      </Card>
    </PageShell>
  );
}
