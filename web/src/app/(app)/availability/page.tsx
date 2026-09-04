import type { Metadata } from 'next';
import { getPropertyScope, requirePermission, requireSession } from '@/server/context';
import { PageHeader, PageShell } from '@/components/page-header';
import { AvailabilitySearchPanel } from '@/components/availability/availability-search-panel';
import { todayISO } from '@/lib/utils';

export const metadata: Metadata = { title: 'Availability' };
export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const session = await requireSession();
  requirePermission(session, 'availability.search');
  const scope = await getPropertyScope(session);

  return (
    <PageShell className="max-w-[1200px]">
      <PageHeader
        title="Availability"
        description="Live room and rate look-up. Every result carries its source and the time it was checked, and cached data is always labelled stale."
      />
      <AvailabilitySearchPanel
        properties={scope.all.map((p) => ({ id: p.propertyId, name: p.propertyName, code: p.propertyCode }))}
        defaultPropertyId={scope.currentPropertyId ?? scope.all[0]?.propertyId ?? ''}
        defaults={{ checkIn: todayISO(7), checkOut: todayISO(9), locale: session.organization.locale }}
      />
    </PageShell>
  );
}
