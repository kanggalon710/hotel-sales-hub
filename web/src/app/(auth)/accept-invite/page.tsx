import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { CircleAlert } from 'lucide-react';
import { db, invitations, organizations, properties, roles } from '@/db';
import { sha256 } from '@/server/crypto';
import { parseJson } from '@/lib/utils';
import { requestNow } from '@/lib/clock';
import { AcceptInviteForm } from './accept-invite-form';

export const metadata: Metadata = { title: 'Accept invitation' };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const invite = token
    ? db
        .select({
          id: invitations.id,
          email: invitations.email,
          name: invitations.name,
          expiresAt: invitations.expiresAt,
          propertyIds: invitations.propertyIds,
          roleName: roles.name,
          orgName: organizations.name,
        })
        .from(invitations)
        .innerJoin(roles, eq(roles.id, invitations.roleId))
        .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
        .where(
          and(
            eq(invitations.tokenHash, sha256(token)),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .get()
    : null;

  if (!invite || invite.expiresAt.getTime() < requestNow()) {
    return (
      <div className="space-y-4">
        <span className="flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
          <CircleAlert aria-hidden className="size-5" />
        </span>
        <h1 className="t-display">This invitation is not usable</h1>
        <p className="text-[13px] leading-6 text-ink-2">
          It may have expired, already been used, or been revoked. Ask your hotel administrator to send a new
          invitation from Settings → Users.
        </p>
        <Link
          href="/login"
          className="focus-ring tap inline-flex text-[13px] font-medium text-primary-ink hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  const ids = parseJson<string[]>(invite.propertyIds, []);
  const propertyNames = ids.length
    ? db.select({ name: properties.name }).from(properties).where(inArray(properties.id, ids)).all().map((p) => p.name)
    : [];

  return (
    <AcceptInviteForm
      token={token!}
      email={invite.email}
      suggestedName={invite.name}
      roleName={invite.roleName}
      orgName={invite.orgName}
      propertyCount={ids.length}
      propertyNames={propertyNames.slice(0, ids.length)}
    />
  );
}
