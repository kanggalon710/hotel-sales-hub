import type { Permission } from '@/lib/constants';

/** Icon is a key, not a component: this config crosses the server/client boundary. */
export type NavIcon =
  | 'my-day' | 'leads' | 'pipeline' | 'availability' | 'quotations'
  | 'approvals' | 'reservations' | 'guests' | 'reports'
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

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'My Day', icon: 'my-day', anyOf: READ_LEADS, exact: true, description: 'Priority queue, overdue tasks, expiring quotations' },
      { href: '/leads', label: 'Leads', icon: 'leads', anyOf: READ_LEADS, description: 'List, filters, assignment' },
      { href: '/pipeline', label: 'Pipeline', icon: 'pipeline', anyOf: READ_LEADS, description: 'Kanban by stage and property' },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { href: '/availability', label: 'Availability', icon: 'availability', anyOf: ['availability.search'], description: 'Room and rate search' },
      { href: '/quotations', label: 'Quotations', icon: 'quotations', anyOf: ['quotation.create', 'lead.read.all'], description: 'Draft, approval, sent, accepted' },
      { href: '/approvals', label: 'Approvals', icon: 'approvals', anyOf: ['discount.approve'], description: 'Discount requests above agent limits' },
      { href: '/reservations', label: 'Reservations', icon: 'reservations', anyOf: ['reservation.queue.read', 'reservation.request'], description: 'Front-office request queue' },
    ],
  },
  {
    label: 'Relationships',
    items: [
      { href: '/guests', label: 'Guests', icon: 'guests', anyOf: READ_LEADS, description: 'Guest 360 profiles and history' },
      { href: '/reports', label: 'Reports', icon: 'reports', anyOf: ['report.read'], description: 'Funnel, channel, SLA, room nights' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/integrations', label: 'Integrations', icon: 'integrations', anyOf: ['integration.manage'], description: 'Chatwoot, PMS, health, mappings' },
      { href: '/settings', label: 'Settings', icon: 'settings', anyOf: ['org.manage', 'property.manage', 'user.manage'], description: 'Organization, properties, users, roles' },
      { href: '/audit', label: 'Audit log', icon: 'audit', anyOf: ['audit.read'], description: 'Who changed what, and when' },
    ],
  },
];

export function visibleNav(permissions: Set<Permission>): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.anyOf.some((p) => permissions.has(p))),
  })).filter((g) => g.items.length > 0);
}
