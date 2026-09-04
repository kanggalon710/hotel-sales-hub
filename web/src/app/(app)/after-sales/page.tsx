import type { Metadata } from 'next';
import Link from 'next/link';
import { HeartHandshake } from 'lucide-react';
import { getPropertyScope, requireSession } from '@/server/context';
import { afterSalesBoard, runAfterSalesSweep } from '@/server/services/after-sales';
import { requestNow } from '@/lib/clock';
import { PageHeader, PageShell } from '@/components/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Metric, MetricStrip } from '@/components/ui/bits';
import { ListState } from '@/components/ui/states';
import { RowLink, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PermissionDenied } from '@/components/ui/states';
import { formatStayDate, relativeTime } from '@/lib/utils';
import { guestTierLabel } from '@/lib/constants';

export const metadata: Metadata = { title: 'Pasca-Inap' };

export default async function AfterSalesPage() {
  const session = await requireSession();
  const canRead = session.permissions.has('lead.read.all')
    || session.permissions.has('lead.read.assigned')
    || session.permissions.has('lead.read.limited');
  if (!canRead) return <PermissionDenied />;

  const scope = await getPropertyScope(session);
  const propertyIds = scope.current ? [scope.current.propertyId] : scope.permittedIds;

  // Sapuan dijalankan saat halaman dibuka, mengikuti pola expireStaleQuotations.
  // Idempoten, jadi membuka halaman dua kali tidak menggandakan tugas.
  runAfterSalesSweep(session.user.organizationId);
  const board = afterSalesBoard(session.user.organizationId, propertyIds);
  const now = requestNow();
  const locale = session.organization.locale;

  return (
    <PageShell>
      <PageHeader
        title="Pasca-Inap"
        description="Tamu yang baru selesai menginap, dan tamu yang sudah waktunya diajak kembali. Menarik tamu lama jauh lebih murah daripada mencari tamu baru."
        actions={<HeartHandshake aria-hidden className="size-5 text-ink-3" />}
      />

      <MetricStrip label="Ringkasan pasca-inap">
        <Metric label="Inap selesai" value={board.metrics.staysCompleted} sub="tercatat seluruhnya" />
        <Metric label="Tamu berulang" value={board.metrics.repeatGuests} sub="menginap lebih dari sekali" tone="success" />
        <Metric label="Terima kasih tertunda" value={board.metrics.thanksOutstanding} sub="menunggu tindakan" tone={board.metrics.thanksOutstanding > 0 ? 'warning' : 'neutral'} />
        <Metric label="Ajakan kembali" value={board.metrics.winBackOutstanding} sub="terjadwal" />
      </MetricStrip>

      <Card>
        <CardHeader
          title="Baru selesai menginap"
          subtitle="Ucapkan terima kasih lewat kanal yang tamu pakai, lalu minta ulasan selagi ingatannya masih segar."
          action={<span className="tnum t-meta">{board.pendingThanks.length}</span>}
        />
        {board.pendingThanks.length === 0 ? (
          <ListState
            title="Tidak ada yang menunggu"
            description="Tugas terima kasih muncul di sini sehari setelah tamu check-out."
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[720px]" columns={['32%', '14%', '18%', '18%', '18%']}>
              <thead>
                <tr>
                  <Th>Tamu</Th>
                  <Th numeric>Menginap</Th>
                  <Th>Inap terakhir</Th>
                  <Th>Jatuh tempo</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {board.pendingThanks.map((t) => (
                  <Tr key={t.taskId} interactive>
                    <Td>
                      <RowLink href={`/guests/${t.contactId}`} className="block truncate">
                        {t.guestName}
                      </RowLink>
                    </Td>
                    <Td numeric>{t.stayCount}x</Td>
                    <Td className="whitespace-nowrap">{t.lastStayDate ? formatStayDate(t.lastStayDate, locale) : '–'}</Td>
                    <Td className="whitespace-nowrap">{t.dueAt ? relativeTime(t.dueAt, now) : '–'}</Td>
                    <Td>
                      <Badge tone={t.dueAt && t.dueAt.getTime() < now ? 'warning' : 'neutral'}>
                        {t.dueAt && t.dueAt.getTime() < now ? 'Terlambat' : 'Terjadwal'}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Waktunya diajak kembali"
          subtitle="Tamu yang jeda sejak inap terakhirnya sudah melewati ambang organisasi. Yang paling sering menginap didahulukan."
          action={<span className="tnum t-meta">{board.dueWinBack.length}</span>}
        />
        {board.dueWinBack.length === 0 ? (
          <ListState
            title="Belum ada yang jatuh tempo"
            description="Tamu muncul di sini setelah jeda sejak inap terakhirnya melewati ambang yang diatur di Pengaturan."
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[760px]" columns={['30%', '14%', '18%', '16%', '22%']}>
              <thead>
                <tr>
                  <Th>Tamu</Th>
                  <Th numeric>Menginap</Th>
                  <Th>Inap terakhir</Th>
                  <Th>Tingkat</Th>
                  <Th>Kontak</Th>
                </tr>
              </thead>
              <tbody>
                {board.dueWinBack.map((g) => (
                  <Tr key={g.id} interactive>
                    <Td>
                      <RowLink href={`/guests/${g.id}`} className="block truncate">
                        {g.fullName}
                      </RowLink>
                    </Td>
                    <Td numeric className="text-ink">{g.stayCount}x</Td>
                    <Td className="whitespace-nowrap">{g.lastStayDate ? formatStayDate(g.lastStayDate, locale) : '–'}</Td>
                    <Td><Badge tone={g.stayCount >= 3 ? 'success' : 'neutral'}>{guestTierLabel(g.guestTier)}</Badge></Td>
                    <Td className="truncate font-mono text-[12px]">{g.phone ?? '–'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>

      <p className="t-meta">
        Jeda ucapan terima kasih dan ajakan kembali diatur per organisasi di{' '}
        <Link href="/settings" className="focus-ring tap rounded text-primary-ink hover:underline">Pengaturan</Link>.
      </p>
    </PageShell>
  );
}
