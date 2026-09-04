import type { Metadata } from 'next';
import { Suspense } from 'react';
import { and, eq, inArray } from 'drizzle-orm';
import { Kanban } from 'lucide-react';
import { db, userPropertyRoles, users } from '@/db';
import { getPropertyScope, leadVisibility, requireSession } from '@/server/context';
import { countLeads, listLeads, type LeadFilters } from '@/server/queries/leads';
import { requestNow } from '@/lib/clock';
import { PageHeader, PageShell } from '@/components/page-header';
import { LeadFilterBar } from '@/components/leads/lead-filter-bar';
import { LeadListItem } from '@/components/leads/lead-list-item';
import { LeadsTable } from '@/components/leads/leads-table';
import { LeadViewTabs, type LeadView } from '@/components/leads/lead-view-tabs';
import { Pagination } from '@/components/ui/pagination';
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

  const PAGE_SIZE = 25;
  const view = (one('view') as LeadView) ?? 'all';
  const page = Math.max(1, Number(one('page') ?? '1') || 1);

  /* Saringan yang berasal dari bilah di bawah tab. */
  const baseFilters: LeadFilters = {
    stages: one('stage') ? [one('stage')!] : undefined,
    status: (one('status') as 'open' | 'closed' | 'all') ?? 'open',
    ownerUserId: one('owner') as string | undefined,
    search: one('q'),
    overdueOnly: one('overdue') === '1',
    sort: (one('sort') as 'recent' | 'value' | 'checkin' | 'sla') ?? 'recent',
  };

  /* Sudut pandang menimpa pemilik dan keterlambatan, karena itulah yang
     dimaksudkan tab: "kumpulan siapa", bukan "persempit yang mana". */
  const viewFilters: LeadFilters =
    view === 'mine' ? { ...baseFilters, ownerUserId: session.user.id }
    : view === 'unassigned' ? { ...baseFilters, ownerUserId: 'unassigned' }
    : view === 'overdue' ? { ...baseFilters, overdueOnly: true }
    : baseFilters;

  const total = countLeads(session, scope, viewFilters);
  /* Nomor halaman datang dari URL, jadi ia bisa berupa apa saja. Tanpa dijepit,
     `?page=99` menghasilkan tabel kosong dengan keterangan yang mustahil. */
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, lastPage);
  const leadsList = listLeads(session, scope, {
    ...viewFilters,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });

  /* Jumlah pada tab menghormati saringan yang sedang aktif, sehingga angkanya
     selalu menjelaskan apa yang akan muncul bila tab itu ditekan. */
  const tabs = [
    { key: 'all' as const, label: 'Semua', count: countLeads(session, scope, baseFilters) },
    { key: 'mine' as const, label: 'Milik saya', count: countLeads(session, scope, { ...baseFilters, ownerUserId: session.user.id }) },
    { key: 'unassigned' as const, label: 'Belum ditugaskan', count: countLeads(session, scope, { ...baseFilters, ownerUserId: 'unassigned' }) },
    { key: 'overdue' as const, label: 'Terlambat', count: countLeads(session, scope, { ...baseFilters, overdueOnly: true }) },
  ];

  /* Berpindah tab mengembalikan ke halaman pertama; berpindah halaman
     mempertahankan tab dan seluruh saringannya. */
  const queryWith = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const value = Array.isArray(v) ? v[0] : v;
      if (value) params.set(k, value);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/leads?${qs}` : '/leads';
  };

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

  /* Sudut pandang ikut dihitung sebagai penyempitan. Tanpa itu, tab "Milik
     saya" yang kosong akan berbunyi "belum ada prospek" padahal prospeknya ada,
     hanya saja bukan milik orang ini. */
  const hasFilters = Boolean(
    one('q') || one('stage') || one('owner') || one('overdue')
    || (one('status') && one('status') !== 'open')
    || view !== 'all',
  );

  return (
    <PageShell>
      <PageHeader
        title="Leads"
        count={`${total} prospek`}
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

      <LeadViewTabs
        tabs={tabs}
        active={view}
        hrefFor={(next) => queryWith({ view: next === 'all' ? undefined : next, page: undefined })}
      />

      <Suspense fallback={<div className="h-16" />}>
        <LeadFilterBar owners={owners} showOwnerFilter={canSeeOthers} total={total} />
      </Suspense>

      <Card className="overflow-hidden">
        {leadsList.length === 0 ? (
          hasFilters ? (
            <ListState
              kind="filtered"
              title={
                view === 'mine' ? 'Belum ada prospek yang menjadi tanggung jawab Anda'
                : view === 'unassigned' ? 'Semua prospek sudah ada pemiliknya'
                : view === 'overdue' ? 'Tidak ada tindak lanjut yang terlambat'
                : 'Tidak ada prospek yang cocok dengan saringan ini'
              }
              description={
                view === 'all'
                  ? 'Longgarkan saringan tahap, pemilik, atau status, atau bersihkan semuanya untuk melihat daftar penuh.'
                  : 'Pilih tab Semua untuk melihat seluruh prospek yang bisa Anda akses.'
              }
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
            <Pagination
              page={currentPage}
              pageSize={PAGE_SIZE}
              total={total}
              label="prospek"
              hrefFor={(next) => queryWith({ page: next === 1 ? undefined : String(next) })}
            />
          </>
        )}
      </Card>
    </PageShell>
  );
}

export function LeadsLoading() {
  return <TableSkeleton rows={8} cols={5} />;
}
