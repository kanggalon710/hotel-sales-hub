import type { Permission } from '@/lib/constants';

/** Icon is a key, not a component: this config crosses the server/client boundary. */
export type NavIcon =
  | 'my-day' | 'leads' | 'pipeline' | 'availability' | 'quotations'
  | 'approvals' | 'reservations' | 'guests' | 'after-sales' | 'reports'
  | 'integrations' | 'settings' | 'audit';

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Visible when the caller holds ANY of these. Server routes re-check regardless. */
  anyOf: Permission[];
  exact?: boolean;
  description: string;
};

export type NavGroup = { label: string; items: NavItem[] };

const READ_LEADS: Permission[] = ['lead.read.all', 'lead.read.assigned', 'lead.read.limited'];

/**
 * Kelompok mengikuti perjalanan tamu, bukan struktur tim: apa yang dikerjakan
 * hari ini, cara menjualnya, hubungan dengan tamunya, lalu angka-angkanya.
 *
 * "Relationships" sebelumnya mencampur Tamu dengan Laporan, dua hal yang tidak
 * berhubungan, dan perjalanan itu sendiri berhenti di penjualan seolah tamu
 * lenyap begitu memesan. Pasca-Inap menutup lingkarnya.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Kerja harian',
    items: [
      { href: '/', label: 'Hari Saya', icon: 'my-day', anyOf: READ_LEADS, exact: true, description: 'Antrean prioritas, tugas terlambat, penawaran kedaluwarsa' },
      { href: '/leads', label: 'Prospek', icon: 'leads', anyOf: READ_LEADS, description: 'Daftar, saringan, penugasan' },
      { href: '/pipeline', label: 'Pipeline', icon: 'pipeline', anyOf: READ_LEADS, description: 'Papan per tahap dan properti' },
    ],
  },
  {
    label: 'Penjualan',
    items: [
      { href: '/availability', label: 'Ketersediaan', icon: 'availability', anyOf: ['availability.search'], description: 'Cari kamar dan tarif' },
      { href: '/quotations', label: 'Penawaran', icon: 'quotations', anyOf: ['quotation.create', 'lead.read.all'], description: 'Draf, persetujuan, terkirim, diterima' },
      { href: '/approvals', label: 'Persetujuan', icon: 'approvals', anyOf: ['discount.approve'], description: 'Diskon di atas batas wewenang' },
      { href: '/reservations', label: 'Reservasi', icon: 'reservations', anyOf: ['reservation.queue.read', 'reservation.request'], description: 'Antrean front office' },
    ],
  },
  {
    label: 'Tamu',
    items: [
      { href: '/guests', label: 'Tamu', icon: 'guests', anyOf: READ_LEADS, description: 'Profil dan riwayat menginap' },
      { href: '/after-sales', label: 'Pasca-Inap', icon: 'after-sales', anyOf: READ_LEADS, description: 'Ucapan terima kasih dan ajakan menginap lagi' },
    ],
  },
  {
    label: 'Analisis',
    items: [
      { href: '/reports', label: 'Laporan', icon: 'reports', anyOf: ['report.read'], description: 'Corong, kanal, SLA, malam kamar' },
    ],
  },
  {
    label: 'Administrasi',
    items: [
      { href: '/integrations', label: 'Integrasi', icon: 'integrations', anyOf: ['integration.manage'], description: 'Chatwoot, PMS, kesehatan, pemetaan' },
      { href: '/settings', label: 'Pengaturan', icon: 'settings', anyOf: ['org.manage', 'property.manage', 'user.manage'], description: 'Organisasi, properti, kamar, pengguna, peran' },
      { href: '/audit', label: 'Log Audit', icon: 'audit', anyOf: ['audit.read'], description: 'Siapa mengubah apa, dan kapan' },
    ],
  },
];

export function visibleNav(permissions: Set<Permission>): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.anyOf.some((p) => permissions.has(p))),
  })).filter((g) => g.items.length > 0);
}
