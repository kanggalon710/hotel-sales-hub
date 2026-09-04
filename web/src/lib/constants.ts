/**
 * Domain vocabulary and the RBAC matrix.
 * Role capabilities are transcribed from PRD section 9.2; stage rules from 11.2/11.5 and 12.1.
 */

/* ----------------------------- Permissions ----------------------------- */

export const PERMISSIONS = [
  'org.manage',
  'property.manage',
  'user.manage',
  'integration.manage',
  'lead.read.all',
  'lead.read.assigned',
  'lead.read.limited',
  'lead.write',
  'lead.reassign',
  'contact.merge',
  'quotation.create',
  'discount.approve',
  'reservation.request',
  'reservation.confirm',
  'reservation.queue.read',
  'guest.pii.full',
  'guest.pii.scoped',
  'guest.pii.masked',
  'availability.search',
  'data.export',
  'audit.read',
  'report.read',
  'report.cross_property',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  'org_admin',
  'property_admin',
  'sales_manager',
  'sales_agent',
  'reservation_fo',
  'guest_relations',
  'analyst',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_DEFINITIONS: Record<
  RoleKey,
  { name: string; description: string; scope: 'organization' | 'property'; permissions: Permission[] }
> = {
  org_admin: {
    name: 'Organization Admin',
    description: 'Full control of the organization, properties, users, and integrations.',
    scope: 'organization',
    permissions: [
      'org.manage', 'property.manage', 'user.manage', 'integration.manage',
      'lead.read.all', 'lead.write', 'lead.reassign', 'contact.merge',
      'quotation.create', 'discount.approve', 'availability.search',
      'reservation.request', 'reservation.confirm', 'reservation.queue.read',
      'guest.pii.full', 'data.export', 'audit.read', 'report.read', 'report.cross_property',
    ],
  },
  property_admin: {
    name: 'Property Admin',
    description: 'Manages configuration, users, and integrations for the properties they own.',
    scope: 'property',
    permissions: [
      'property.manage', 'user.manage', 'integration.manage',
      'lead.read.all', 'lead.write', 'lead.reassign', 'contact.merge',
      'quotation.create', 'discount.approve', 'availability.search',
      'reservation.request', 'reservation.confirm', 'reservation.queue.read',
      'guest.pii.full', 'data.export', 'audit.read', 'report.read',
    ],
  },
  sales_manager: {
    name: 'Sales Manager',
    description: 'Owns pipeline, assignment, SLA, discount approval, and forecast.',
    scope: 'property',
    permissions: [
      'lead.read.all', 'lead.write', 'lead.reassign',
      'quotation.create', 'discount.approve', 'availability.search',
      'reservation.request', 'guest.pii.full', 'data.export', 'report.read',
    ],
  },
  sales_agent: {
    name: 'Sales Agent',
    description: 'Works assigned inquiries from first message to confirmed booking.',
    scope: 'property',
    permissions: [
      'lead.read.assigned', 'lead.write', 'quotation.create',
      'availability.search', 'reservation.request', 'guest.pii.scoped',
    ],
  },
  reservation_fo: {
    name: 'Reservation / Front Office',
    description: 'Verifies inventory and confirms holds and reservations.',
    scope: 'property',
    permissions: [
      'lead.read.limited', 'availability.search', 'reservation.queue.read',
      'reservation.confirm', 'guest.pii.scoped',
    ],
  },
  guest_relations: {
    name: 'Guest Relations',
    description: 'Handles pre-arrival and post-stay guest context and preferences.',
    scope: 'property',
    permissions: ['lead.read.limited', 'guest.pii.scoped'],
  },
  analyst: {
    name: 'Management / Analyst',
    description: 'Reads performance across properties without changing operational data.',
    scope: 'organization',
    permissions: ['lead.read.all', 'guest.pii.masked', 'report.read', 'report.cross_property', 'data.export'],
  },
};

/* -------------------------------- Stages -------------------------------- */

export type LeadStage =
  | 'new_inquiry' | 'assigned' | 'qualified' | 'availability_checked'
  | 'quotation_sent' | 'follow_up' | 'deposit_pending' | 'confirmed'
  | 'lost' | 'cancelled';

export type StageGate =
  | 'owner' | 'qualification' | 'availability' | 'quotation_sent'
  | 'reservation_reference' | 'lost_reason' | 'cancellation_reason';

export const LEAD_STAGES: {
  key: LeadStage;
  label: string;
  order: number;
  probability: number;
  kind: 'open' | 'won' | 'lost' | 'cancelled';
  /** Server-enforced preconditions for entering this stage (PRD FR-07). */
  gates: StageGate[];
  /** Shown when a transition is refused: what is still missing. */
  hint: string;
  /** What the stage means in the sales process. Used where the stage is
   *  described rather than enforced, such as an empty pipeline column. */
  meaning: string;
}[] = [
  { key: 'new_inquiry', label: 'New Inquiry', order: 1, probability: 10, kind: 'open', gates: [], hint: 'Respond before the SLA timer expires.', meaning: 'Arrived from a conversation. Nobody has replied yet.' },
  { key: 'assigned', label: 'Assigned', order: 2, probability: 20, kind: 'open', gates: ['owner'], hint: 'An owner must be set.', meaning: 'Someone owns it, but qualification is not complete.' },
  { key: 'qualified', label: 'Qualified', order: 3, probability: 35, kind: 'open', gates: ['owner', 'qualification'], hint: 'Stay dates, occupancy, and contact method are required.', meaning: 'Dates, occupancy, and a contact method are all known.' },
  { key: 'availability_checked', label: 'Availability Checked', order: 4, probability: 50, kind: 'open', gates: ['owner', 'qualification', 'availability'], hint: 'Run an availability search first.', meaning: 'Rooms and rates have been confirmed against the PMS.' },
  { key: 'quotation_sent', label: 'Quotation Sent', order: 5, probability: 65, kind: 'open', gates: ['owner', 'qualification', 'quotation_sent'], hint: 'A quotation version must be sent.', meaning: 'A priced offer is with the guest, awaiting an answer.' },
  { key: 'follow_up', label: 'Follow-up', order: 6, probability: 70, kind: 'open', gates: ['owner'], hint: 'Keep a next follow-up date on the lead.', meaning: 'Chasing a decision on an offer already sent.' },
  { key: 'deposit_pending', label: 'Deposit Pending', order: 7, probability: 85, kind: 'open', gates: ['owner', 'quotation_sent'], hint: 'Awaiting deposit against a confirmed offer.', meaning: 'The guest accepted. Waiting on the deposit.' },
  { key: 'confirmed', label: 'Confirmed', order: 8, probability: 100, kind: 'won', gates: ['reservation_reference'], hint: 'Needs a PMS reference or an authorized manual confirmation.', meaning: 'Booked, with a reservation reference to prove it.' },
  { key: 'lost', label: 'Lost', order: 9, probability: 0, kind: 'lost', gates: ['lost_reason'], hint: 'A lost reason is mandatory.', meaning: 'Closed without a booking, with a recorded reason.' },
  { key: 'cancelled', label: 'Cancelled', order: 10, probability: 0, kind: 'cancelled', gates: ['cancellation_reason'], hint: 'Record the cancellation source and reason.', meaning: 'Called off after being agreed.' },
];

export const STAGE_MAP = new Map(LEAD_STAGES.map((s) => [s.key, s]));
export const OPEN_STAGES = LEAD_STAGES.filter((s) => s.kind === 'open').map((s) => s.key);
export const PIPELINE_STAGES = LEAD_STAGES.filter((s) => s.kind === 'open' || s.kind === 'won').map((s) => s.key);

export const LOST_REASONS = [
  'Rate too high', 'No availability', 'Chose competitor', 'Dates changed',
  'Guest unresponsive', 'Booked via OTA', 'Trip cancelled', 'Other',
] as const;

/**
 * Tingkat loyalitas tamu. Nilainya sama dengan yang tersimpan di
 * `contacts.guest_tier`; labelnya dipisah supaya kolom tabel tidak menampilkan
 * kata mentah seperti "gold" begitu saja.
 */
export const GUEST_TIERS = [
  { key: 'none', label: 'Belum berjenjang' },
  { key: 'member', label: 'Anggota' },
  { key: 'silver', label: 'Perak' },
  { key: 'gold', label: 'Emas' },
  { key: 'platinum', label: 'Platina' },
] as const;

export function guestTierLabel(key: string | null | undefined) {
  return GUEST_TIERS.find((t) => t.key === key)?.label ?? 'Belum berjenjang';
}

export const INQUIRY_TYPES = [
  { key: 'fit', label: 'FIT / Direct room' },
  { key: 'corporate', label: 'Corporate' },
  { key: 'group', label: 'Group / MICE' },
  { key: 'wedding', label: 'Wedding' },
  { key: 'long_stay', label: 'Long stay' },
  { key: 'other', label: 'Other' },
] as const;

export const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'website', label: 'Website chat' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'email', label: 'Email' },
  { key: 'walk_in', label: 'Walk-in / phone' },
  { key: 'other', label: 'Other' },
] as const;

/* ------------------------- Commercial state models ------------------------- */

export type QuotationStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'sent'
  | 'accepted' | 'declined' | 'expired' | 'superseded';

/** PRD 12.2. */
export const QUOTATION_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  draft: ['pending_approval', 'approved', 'superseded'],
  pending_approval: ['approved', 'draft', 'superseded'],
  approved: ['sent', 'superseded'],
  sent: ['accepted', 'declined', 'expired', 'superseded'],
  accepted: ['superseded'],
  declined: ['superseded'],
  expired: ['superseded'],
  superseded: [],
};

export type ReservationStatus =
  | 'draft' | 'submitted' | 'under_review' | 'alternative_proposed'
  | 'on_hold' | 'confirmed' | 'rejected' | 'expired' | 'cancelled';

/** PRD 12.3. */
export const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'cancelled', 'expired'],
  under_review: ['alternative_proposed', 'on_hold', 'confirmed', 'rejected', 'cancelled'],
  alternative_proposed: ['submitted', 'under_review', 'cancelled', 'expired'],
  on_hold: ['confirmed', 'rejected', 'expired', 'cancelled'],
  confirmed: ['cancelled'],
  rejected: [],
  expired: [],
  cancelled: [],
};

/** PRD FR-08: availability freshness is always explicit, never implied. */
export type AvailabilityState = 'live' | 'stale' | 'manual' | 'unavailable';

export const CONNECTION_STATUSES = ['healthy', 'degraded', 'disconnected', 'action_required'] as const;

export const WEBHOOK_EVENT_TYPES = [
  'conversation_created', 'conversation_updated', 'conversation_status_changed',
  'message_created', 'contact_created', 'contact_updated',
] as const;

export const MAX_WEBHOOK_ATTEMPTS = 5;

export const LABEL_ROOM_INQUIRY = 'room-inquiry';
