import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, BedDouble } from 'lucide-react';
import { db, properties } from '@/db';
import { canAny, getPropertyScope, requireSession } from '@/server/context';
import { listRatePlans, listRoomTypes } from '@/server/services/inventory';
import { PageHeader, PageShell } from '@/components/page-header';
import { PermissionDenied } from '@/components/ui/states';
import { RoomInventory } from '@/components/settings/room-inventory';

export const metadata: Metadata = { title: 'Kamar & Tarif' };

export default async function RoomsPage() {
  const session = await requireSession();
  const canEdit = session.permissions.has('property.manage');
  if (!canAny(session, 'org.manage', 'property.manage')) {
    return <PermissionDenied />;
  }

  const scope = await getPropertyScope(session);
  // Inventaris selalu milik satu properti, jadi layar ini mengikuti properti
  // yang sedang dipilih daripada mencampur beberapa hotel dalam satu tabel.
  const propertyId = scope.current?.propertyId ?? scope.permittedIds[0];
  const property = propertyId
    ? db.select().from(properties)
        .where(and(eq(properties.id, propertyId), eq(properties.organizationId, session.user.organizationId)))
        .get()
    : undefined;

  if (!property) {
    return (
      <PageShell narrow>
        <PageHeader title="Kamar & Tarif" description="Belum ada properti yang bisa dikelola." />
      </PageShell>
    );
  }

  const roomTypes = listRoomTypes(session.user.organizationId, property.id);
  const ratePlans = listRatePlans(session.user.organizationId, property.id);
  const totalRooms = roomTypes.filter((r) => r.active).reduce((sum, r) => sum + r.totalRooms, 0);

  return (
    <PageShell narrow>
      <Link href="/settings" className="focus-ring tap inline-flex items-center gap-1.5 rounded text-[12px] text-ink-3 hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Kembali ke pengaturan
      </Link>

      <PageHeader
        eyebrow={property.name}
        title="Kamar & Tarif"
        count={`${totalRooms} kamar`}
        description="Apa yang dijual hotel ini dan berapa harganya. Angka di sini yang menentukan jawaban cek ketersediaan, bukan tebakan."
        actions={<BedDouble aria-hidden className="size-5 text-ink-3" />}
      />

      <RoomInventory
        propertyId={property.id}
        propertyName={property.name}
        inventorySource={property.inventorySource}
        currency={property.currency ?? session.organization.currency}
        locale={session.organization.locale}
        roomTypes={roomTypes.map((r) => ({
          id: r.id, code: r.code, name: r.name, totalRooms: r.totalRooms,
          maxAdults: r.maxAdults, maxChildren: r.maxChildren, bedType: r.bedType,
          sizeSqm: r.sizeSqm, description: r.description, source: r.source, active: r.active,
        }))}
        ratePlans={ratePlans.map((p) => ({
          id: p.id, code: p.code, name: p.name, mealPlan: p.mealPlan,
          baseRatePerNight: p.baseRatePerNight, refundable: p.refundable,
          minStay: p.minStay, inclusionList: p.inclusionList, policies: p.policies,
          surcharges: p.surcharges, source: p.source, active: p.active,
        }))}
        canEdit={canEdit}
      />
    </PageShell>
  );
}
