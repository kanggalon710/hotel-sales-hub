import type { Metadata } from 'next';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { contacts, db, leads } from '@/db';
import { getPropertyScope, leadVisibility, maskEmail, maskName, maskPhone, piiLevel, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/bits';
import { ListState, PermissionDenied } from '@/components/ui/states';
import { RowLink, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { GuestSearch } from '@/components/guests/guest-search';
import { formatMoney, formatStayDate, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Guests' };
export const dynamic = 'force-dynamic';

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const scope = await getPropertyScope(session);
  if (leadVisibility(session) === 'none') {
    return (
      <PageShell>
        <PermissionDenied what="guest profiles" />
      </PageShell>
    );
  }

  const { q } = await searchParams;
  const level = piiLevel(session);
  const locale = session.organization.locale;
  const scopedIds = scope.scopedIds.length ? scope.scopedIds : ['__none__'];

  const term = q?.trim().toLowerCase();
  const rows = db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      phone: contacts.phoneNormalized,
      email: contacts.email,
      tier: contacts.guestTier,
      stayCount: contacts.stayCount,
      lastStayDate: contacts.lastStayDate,
      leadCount: sql<number>`count(distinct ${leads.id})`,
      pipelineValue: sql<number>`coalesce(sum(case when ${leads.status} = 'open' then ${leads.estimatedValue} else 0 end), 0)`,
      lastActivity: sql<number>`max(coalesce(${leads.lastActivityAt}, ${leads.createdAt}))`,
    })
    .from(contacts)
    .leftJoin(leads, and(eq(leads.contactId, contacts.id), inArray(leads.propertyId, scopedIds)))
    .where(
      and(
        eq(contacts.organizationId, session.user.organizationId),
        sql`${contacts.mergedIntoContactId} is null`,
        term
          ? or(
              like(sql`lower(${contacts.fullName})`, `%${term}%`),
              like(sql`lower(coalesce(${contacts.email}, ''))`, `%${term}%`),
              like(sql`coalesce(${contacts.phoneNormalized}, '')`, `%${term}%`),
            )
          : undefined,
      ),
    )
    .groupBy(contacts.id)
    .orderBy(desc(sql`max(coalesce(${leads.lastActivityAt}, ${leads.createdAt}))`))
    .limit(100)
    .all();

  return (
    <PageShell>
      <PageHeader
        title="Guests"
        count={`${rows.length} guest${rows.length === 1 ? '' : 's'}`}
        description="One identity per guest across every channel and conversation. Contact details follow your role's PII level."
        meta={
          level === 'masked' ? (
            <span className="rounded-md bg-warning-soft px-2 py-1 text-[11px] text-warning-ink">
              Contact details are masked for your role
            </span>
          ) : null
        }
      />

      <GuestSearch initial={q ?? ''} />

      <Card>
        <CardHeader title="Guest directory" action={<span className="font-mono text-[11px] text-ink-3">{rows.length} guests</span>} />
        {rows.length === 0 ? (
          term ? (
            <ListState kind="filtered" title="No guest matches that search" description="Try a partial name, phone number, or email address." />
          ) : (
            <ListState title="No guests yet" description="Guests are created automatically when a Chatwoot contact first reaches a mapped inbox." />
          )
        ) : (
          <TableScroll>
            <Table className="min-w-[880px]">
              <thead>
                <tr>
                  <Th>Guest</Th>
                  <Th>Contact</Th>
                  <Th>Tier</Th>
                  <Th numeric>Stays</Th>
                  <Th numeric>Leads</Th>
                  <Th numeric>Open pipeline</Th>
                  <Th>Last stay</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <Tr key={g.id} interactive>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Avatar name={g.fullName} size="sm" />
                        <RowLink href={`/guests/${g.id}`} className="text-[13px]">
                          {maskName(g.fullName, level)}
                        </RowLink>
                      </span>
                    </Td>
                    <Td>
                      <span className="block font-mono text-[11px]">{maskPhone(g.phone, level)}</span>
                      <span className="block font-mono text-[11px] text-ink-3">{maskEmail(g.email, level)}</span>
                    </Td>
                    <Td>{g.tier === 'none' ? '–' : titleCase(g.tier)}</Td>
                    <Td numeric>{g.stayCount}</Td>
                    <Td numeric>{Number(g.leadCount)}</Td>
                    <Td numeric className="font-mono text-ink">
                      {Number(g.pipelineValue) > 0
                        ? formatMoney(Number(g.pipelineValue), session.organization.currency, locale, { compact: true })
                        : '–'}
                    </Td>
                    <Td className="whitespace-nowrap">{g.lastStayDate ? formatStayDate(g.lastStayDate, locale) : '–'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>
    </PageShell>
  );
}
