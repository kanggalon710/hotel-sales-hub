/**
 * Data model for the Hotel Sales & Guest Relationship Hub.
 * Mirrors PRD section 16 (Core Data Model).
 *
 * Portability notes:
 * - Enum-like columns are `text` with TS union types in `src/lib/constants.ts`,
 *   so the schema moves to Postgres without an enum migration.
 * - Stay dates are date-only strings (`YYYY-MM-DD`) to stay timezone-safe.
 * - Free-form payloads are JSON-encoded `text` (SQLite has no native json type).
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () => text('id').primaryKey();
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/* ------------------------------------------------------------------ *
 * 16.1 Organizational entities
 * ------------------------------------------------------------------ */

export const organizations = sqliteTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  currency: text('currency').notNull().default('IDR'),
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  locale: text('locale').notNull().default('id-ID'),
  // Commercial defaults; overridable per property (PRD 17.5 - nothing hardcoded).
  taxPercent: real('tax_percent').notNull().default(11),
  servicePercent: real('service_percent').notNull().default(10),
  quotationValidityHours: integer('quotation_validity_hours').notNull().default(48),
  firstResponseSlaMinutes: integer('first_response_sla_minutes').notNull().default(15),
  availabilityStaleAfterMinutes: integer('availability_stale_after_minutes').notNull().default(15),
  /** Berapa hari setelah check-out ucapan terima kasih dan permintaan ulasan jatuh tempo. */
  postStayFollowUpDays: integer('post_stay_follow_up_days').notNull().default(1),
  /** Berapa hari setelah check-out tamu diingatkan untuk menginap lagi. */
  winBackAfterDays: integer('win_back_after_days').notNull().default(150),
  createdAt: createdAt(),
});

export const properties = sqliteTable(
  'properties',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    city: text('city'),
    country: text('country'),
    timezone: text('timezone'),
    currency: text('currency'),
    /**
     * Siapa pemilik inventaris kamar properti ini.
     *   'crm' - hotel mendefinisikan kamar dan tarifnya di sini. Ketersediaan
     *           dihitung CRM dari alotmen dikurangi reservasi yang menumpuk.
     *   'pms' - PMS/CRS yang memiliki inventaris. Kamar dan tarif hanya cermin
     *           yang disinkronkan, dan ketersediaan datang dari adapter.
     * Default 'crm' karena sebuah hotel harus bisa beroperasi sebelum ada PMS.
     */
    inventorySource: text('inventory_source').notNull().default('crm'),
    taxPercent: real('tax_percent'),
    servicePercent: real('service_percent'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    /** Default template for new leads at this property. */
    pipelineTemplateId: text('pipeline_template_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('properties_org_code_uq').on(t.organizationId, t.code)],
);

export const teams = sqliteTable(
  'teams',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').references(() => properties.id),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('sales'), // sales | reservation | guest_relations
    createdAt: createdAt(),
  },
  (t) => [index('teams_org_idx').on(t.organizationId, t.propertyId)],
);

export const roles = sqliteTable(
  'roles',
  {
    id: id(),
    // null organizationId => system role shared by every tenant (PRD 7.2: custom roles are P1).
    organizationId: text('organization_id').references(() => organizations.id),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    scope: text('scope').notNull().default('property'), // organization | property
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('roles_org_key_uq').on(t.organizationId, t.key)],
);

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    id: id(),
    roleId: text('role_id').notNull().references(() => roles.id),
    permission: text('permission').notNull(),
  },
  (t) => [uniqueIndex('role_permissions_uq').on(t.roleId, t.permission)],
);

export const users = sqliteTable(
  'users',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    email: text('email').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    jobTitle: text('job_title'),
    passwordHash: text('password_hash'),
    status: text('status').notNull().default('invited'), // invited | active | suspended | deactivated
    mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
    // Discount the user may approve without escalation (PRD 11.3 step 6).
    discountLimitPercent: real('discount_limit_percent').notNull().default(0),
    canApproveDiscountUpToPercent: real('can_approve_discount_up_to_percent').notNull().default(0),
    isPlatformAdmin: integer('is_platform_admin', { mode: 'boolean' }).notNull().default(false),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
    deactivatedAt: integer('deactivated_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_org_email_uq').on(t.organizationId, t.email)],
);

/** A user may hold different roles on different properties (PRD 9.1). */
export const userPropertyRoles = sqliteTable(
  'user_property_roles',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    userId: text('user_id').notNull().references(() => users.id),
    // null propertyId => organization-wide scope (Org Admin, Analyst).
    propertyId: text('property_id').references(() => properties.id),
    roleId: text('role_id').notNull().references(() => roles.id),
    teamId: text('team_id').references(() => teams.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('upr_user_property_role_uq').on(t.userId, t.propertyId, t.roleId),
    index('upr_user_idx').on(t.userId),
  ],
);

export const invitations = sqliteTable(
  'invitations',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    email: text('email').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    roleId: text('role_id').notNull().references(() => roles.id),
    propertyIds: text('property_ids').notNull().default('[]'),
    teamId: text('team_id').references(() => teams.id),
    discountLimitPercent: real('discount_limit_percent').notNull().default(0),
    invitedByUserId: text('invited_by_user_id').references(() => users.id),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('invitations_org_email_idx').on(t.organizationId, t.email)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/* ------------------------------------------------------------------ *
 * 16.4 Integration entities
 * ------------------------------------------------------------------ */

export const integrationConnections = sqliteTable(
  'integration_connections',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    provider: text('provider').notNull(), // chatwoot | pms
    adapter: text('adapter').notNull().default('chatwoot'), // chatwoot | pms-mock
    label: text('label').notNull(),
    baseUrl: text('base_url'),
    externalAccountId: text('external_account_id'),
    /** Secrets are stored encrypted and never returned to the client (PRD FR-03). */
    apiTokenCiphertext: text('api_token_ciphertext'),
    apiTokenLast4: text('api_token_last4'),
    webhookSecretCiphertext: text('webhook_secret_ciphertext'),
    status: text('status').notNull().default('disconnected'), // healthy | degraded | disconnected | action_required
    statusReason: text('status_reason'),
    lastTestedAt: integer('last_tested_at', { mode: 'timestamp_ms' }),
    lastTestResult: text('last_test_result'),
    lastEventAt: integer('last_event_at', { mode: 'timestamp_ms' }),
    timeoutMs: integer('timeout_ms').notNull().default(6000),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('conn_org_provider_idx').on(t.organizationId, t.provider)],
);

/** Inbox / team / agent routing (PRD 10.2, FR-03). Unmapped rows go to a review queue. */
export const mappingRules = sqliteTable(
  'mapping_rules',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    connectionId: text('connection_id').notNull().references(() => integrationConnections.id),
    kind: text('kind').notNull(), // inbox | team | agent
    externalId: text('external_id').notNull(),
    externalName: text('external_name'),
    channel: text('channel'), // whatsapp | instagram | website | facebook | email | other
    propertyId: text('property_id').references(() => properties.id),
    teamId: text('team_id').references(() => teams.id),
    userId: text('user_id').references(() => users.id),
    inquiryType: text('inquiry_type'),
    isSalesInbox: integer('is_sales_inbox', { mode: 'boolean' }).notNull().default(false),
    triggerLabels: text('trigger_labels').notNull().default('[]'),
    status: text('status').notNull().default('unmapped'), // mapped | unmapped
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('mapping_conn_kind_ext_uq').on(t.connectionId, t.kind, t.externalId)],
);

export const externalIdentityMappings = sqliteTable(
  'external_identity_mappings',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    connectionId: text('connection_id').notNull().references(() => integrationConnections.id),
    provider: text('provider').notNull(),
    entityType: text('entity_type').notNull(), // contact | conversation | agent | inbox | room_type | rate_plan
    externalId: text('external_id').notNull(),
    internalId: text('internal_id').notNull(),
    syncVersion: text('sync_version'),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('eim_conn_type_ext_uq').on(t.connectionId, t.entityType, t.externalId),
    index('eim_internal_idx').on(t.entityType, t.internalId),
  ],
);

export const webhookEvents = sqliteTable(
  'webhook_events',
  {
    id: id(),
    // Null until the tenant is resolved: an unresolvable event must not be attributed to a random tenant.
    organizationId: text('organization_id').references(() => organizations.id),
    connectionId: text('connection_id').references(() => integrationConnections.id),
    provider: text('provider').notNull().default('chatwoot'),
    eventType: text('event_type').notNull(),
    /** Dedup key derived from external event identity (PRD 10.3 step 4, FR-04). */
    fingerprint: text('fingerprint').notNull(),
    payload: text('payload').notNull(),
    externalAccountId: text('external_account_id'),
    correlationId: text('correlation_id').notNull(),
    status: text('status').notNull().default('received'),
    // received | processed | failed | dead_letter | recovered | ignored | duplicate
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    resultSummary: text('result_summary'),
    receivedAt: createdAt(),
    processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
    nextRetryAt: integer('next_retry_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('webhook_fingerprint_uq').on(t.fingerprint),
    index('webhook_status_idx').on(t.status, t.receivedAt),
    index('webhook_org_idx').on(t.organizationId, t.receivedAt),
  ],
);

export const deadLetterEvents = sqliteTable(
  'dead_letter_events',
  {
    id: id(),
    organizationId: text('organization_id').references(() => organizations.id),
    webhookEventId: text('webhook_event_id').notNull().references(() => webhookEvents.id),
    reason: text('reason').notNull(),
    actionRequired: text('action_required'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    resolvedByUserId: text('resolved_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('dlq_org_idx').on(t.organizationId, t.resolvedAt)],
);

/** Outbound CRM -> Chatwoot work, keyed by idempotency to prevent integration loops (PRD 10.6). */
export const syncJobs = sqliteTable(
  'sync_jobs',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    connectionId: text('connection_id').notNull().references(() => integrationConnections.id),
    kind: text('kind').notNull(), // update_contact_attributes | update_conversation_attributes | add_label | send_message | private_note | assign
    targetExternalId: text('target_external_id').notNull(),
    payload: text('payload').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('pending'), // pending | success | failed
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: createdAt(),
    processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('sync_idempotency_uq').on(t.idempotencyKey),
    index('sync_status_idx').on(t.status, t.createdAt),
  ],
);

/* ------------------------------------------------------------------ *
 * 16.2 CRM entities
 * ------------------------------------------------------------------ */

export const corporateAccounts = sqliteTable(
  'corporate_accounts',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    name: text('name').notNull(),
    industry: text('industry'),
    country: text('country'),
    createdAt: createdAt(),
  },
  (t) => [index('corp_org_idx').on(t.organizationId)],
);

export const contacts = sqliteTable(
  'contacts',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    fullName: text('full_name').notNull(),
    /** E.164 where derivable; the raw channel value is kept for traceability (PRD FR-05). */
    phoneNormalized: text('phone_normalized'),
    phoneRaw: text('phone_raw'),
    email: text('email'),
    emailNormalized: text('email_normalized'),
    preferredLanguage: text('preferred_language'),
    guestTier: text('guest_tier').notNull().default('none'), // none | member | silver | gold | platinum
    nationality: text('nationality'),
    corporateAccountId: text('corporate_account_id').references(() => corporateAccounts.id),
    consentStatus: text('consent_status').notNull().default('unknown'), // unknown | granted | withdrawn
    lastStayDate: text('last_stay_date'),
    stayCount: integer('stay_count').notNull().default(0),
    preferences: text('preferences').notNull().default('[]'),
    /** Survivor id after a manual merge; history is preserved (PRD FR-11). */
    mergedIntoContactId: text('merged_into_contact_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('contacts_org_phone_idx').on(t.organizationId, t.phoneNormalized),
    index('contacts_org_email_idx').on(t.organizationId, t.emailNormalized),
  ],
);

export const consents = sqliteTable('consents', {
  id: id(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  contactId: text('contact_id').notNull().references(() => contacts.id),
  type: text('type').notNull(), // marketing | transactional | data_processing
  status: text('status').notNull(), // granted | withdrawn
  source: text('source').notNull().default('chatwoot'),
  capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: createdAt(),
});

export const campaigns = sqliteTable('campaigns', {
  id: id(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  source: text('source').notNull(),
  medium: text('medium'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
});

/** CRM keeps identifiers + metadata only; Chatwoot owns the transcript (PRD 10.8). */
export const conversationReferences = sqliteTable(
  'conversation_references',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    connectionId: text('connection_id').notNull().references(() => integrationConnections.id),
    externalConversationId: text('external_conversation_id').notNull(),
    externalInboxId: text('external_inbox_id'),
    inboxName: text('inbox_name'),
    channel: text('channel'),
    contactId: text('contact_id').references(() => contacts.id),
    propertyId: text('property_id').references(() => properties.id),
    conversationStatus: text('conversation_status'), // Chatwoot workload state, NOT a sales stage
    labels: text('labels').notNull().default('[]'),
    assignedExternalAgentId: text('assigned_external_agent_id'),
    assignedUserId: text('assigned_user_id').references(() => users.id),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
    lastMessagePreview: text('last_message_preview'),
    lastMessageFrom: text('last_message_from'), // contact | agent
    deepLink: text('deep_link'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('conv_conn_ext_uq').on(t.connectionId, t.externalConversationId),
    index('conv_contact_idx').on(t.contactId),
  ],
);

export const leads = sqliteTable(
  'leads',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').notNull().references(() => properties.id),
    contactId: text('contact_id').notNull().references(() => contacts.id),
    primaryConversationId: text('primary_conversation_id').references(() => conversationReferences.id),
    code: text('code').notNull(),
    stage: text('stage').notNull().default('new_inquiry'),
    status: text('status').notNull().default('open'), // open | won | lost | cancelled
    inquiryType: text('inquiry_type').notNull().default('fit'),
    /** The template whose stage vocabulary `stage` belongs to. */
    pipelineTemplateId: text('pipeline_template_id'),
    source: text('source'),
    channel: text('channel'),
    campaignId: text('campaign_id').references(() => campaigns.id),
    ownerUserId: text('owner_user_id').references(() => users.id),
    teamId: text('team_id').references(() => teams.id),
    probability: integer('probability').notNull().default(10),
    /** Business importance, independent of how urgent the clock is. */
    priority: text('priority').notNull().default('normal'),
    estimatedValue: real('estimated_value').notNull().default(0),
    currency: text('currency').notNull().default('IDR'),
    /** Denormalised copy of the primary stay request for list/filter performance. */
    checkIn: text('check_in'),
    checkOut: text('check_out'),
    rooms: integer('rooms'),
    adults: integer('adults'),
    children: integer('children'),
    roomPreference: text('room_preference'),
    budgetNote: text('budget_note'),
    purpose: text('purpose'),
    specialRequest: text('special_request'),
    language: text('language'),
    nextActionLabel: text('next_action_label'),
    nextFollowUpAt: integer('next_follow_up_at', { mode: 'timestamp_ms' }),
    slaFirstResponseDueAt: integer('sla_first_response_due_at', { mode: 'timestamp_ms' }),
    firstRespondedAt: integer('first_responded_at', { mode: 'timestamp_ms' }),
    lastActivityAt: integer('last_activity_at', { mode: 'timestamp_ms' }),
    lostReason: text('lost_reason'),
    lostCompetitor: text('lost_competitor'),
    lostNotes: text('lost_notes'),
    cancellationSource: text('cancellation_source'),
    cancellationReason: text('cancellation_reason'),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('leads_org_code_uq').on(t.organizationId, t.code),
    index('leads_scope_idx').on(t.organizationId, t.propertyId, t.stage),
    index('leads_owner_idx').on(t.ownerUserId, t.status),
    index('leads_contact_idx').on(t.contactId),
  ],
);

export const leadStageHistory = sqliteTable(
  'lead_stage_history',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    leadId: text('lead_id').notNull().references(() => leads.id),
    fromStage: text('from_stage'),
    toStage: text('to_stage').notNull(),
    actorUserId: text('actor_user_id').references(() => users.id),
    actorType: text('actor_type').notNull().default('user'), // user | system
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('lsh_lead_idx').on(t.leadId, t.createdAt)],
);

/** Timeline entries. Notes are activities of type `note` (PRD 16.2 Activity + Note). */
export const activities = sqliteTable(
  'activities',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').references(() => properties.id),
    leadId: text('lead_id').references(() => leads.id),
    contactId: text('contact_id').references(() => contacts.id),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    actorUserId: text('actor_user_id').references(() => users.id),
    actorName: text('actor_name'),
    actorType: text('actor_type').notNull().default('user'), // user | system
    source: text('source').notNull().default('crm'), // crm | chatwoot | pms | system
    isInternal: integer('is_internal', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata'),
    createdAt: createdAt(),
  },
  (t) => [
    index('activities_lead_idx').on(t.leadId, t.createdAt),
    index('activities_contact_idx').on(t.contactId, t.createdAt),
  ],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').references(() => properties.id),
    leadId: text('lead_id').references(() => leads.id),
    contactId: text('contact_id').references(() => contacts.id),
    assigneeUserId: text('assignee_user_id').references(() => users.id),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type').notNull().default('follow_up'),
    // follow_up | approval | quotation_expiry | deposit | mapping_review | merge_review | reservation_review
    priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
    status: text('status').notNull().default('open'), // open | done | cancelled
    dueAt: integer('due_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    completedByUserId: text('completed_by_user_id').references(() => users.id),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('tasks_assignee_idx').on(t.assigneeUserId, t.status, t.dueAt),
    index('tasks_lead_idx').on(t.leadId, t.status),
  ],
);

/* ------------------------------------------------------------------ *
 * Pipeline configuration (PRD 7.2 item 2, 17.5: stages are not hardcoded)
 * ------------------------------------------------------------------ */

/**
 * A named set of stages. A property or an inquiry type picks one. Templates are
 * archived rather than deleted, because every lead that ever used one still
 * references it.
 */
export const pipelineTemplates = sqliteTable(
  'pipeline_templates',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    name: text('name').notNull(),
    description: text('description'),
    /** Which kind of business this template is for: fit | corporate | group | ... */
    inquiryType: text('inquiry_type').notNull().default('fit'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('pipeline_org_idx').on(t.organizationId, t.archivedAt)],
);

/**
 * One column of a template.
 *
 * `kind` is the load-bearing field, not `key`. An organization may rename a
 * stage to anything ("Definite", "Sudah Deposit"), but the kind decides which
 * gates the server enforces and how the stage counts in the funnel. That is why
 * a stage can be renamed freely and its kind cannot be edited after leads exist
 * in it.
 */
export const pipelineStages = sqliteTable(
  'pipeline_stages',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    templateId: text('template_id').notNull().references(() => pipelineTemplates.id),
    /** Stable within a template; this is what `leads.stage` stores. */
    key: text('key').notNull(),
    label: text('label').notNull(),
    /** open | won | lost | cancelled. Decides the mandatory gates. */
    kind: text('kind').notNull().default('open'),
    /** Optional extra gates on top of the ones the kind mandates. */
    gates: text('gates').notNull().default('[]'),
    colour: text('colour').notNull().default('neutral'),
    probability: integer('probability').notNull().default(0),
    hint: text('hint'),
    meaning: text('meaning'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('pipeline_stage_key_uq').on(t.templateId, t.key),
    index('pipeline_stage_order_idx').on(t.templateId, t.sortOrder),
  ],
);

/* ------------------------------------------------------------------ *
 * 16.3 Commercial entities
 * ------------------------------------------------------------------ */

export const roomTypeReferences = sqliteTable(
  'room_type_references',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').notNull().references(() => properties.id),
    connectionId: text('connection_id').references(() => integrationConnections.id),
    externalId: text('external_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    maxAdults: integer('max_adults').notNull().default(2),
    maxChildren: integer('max_children').notNull().default(1),
    bedType: text('bed_type'),
    sizeSqm: integer('size_sqm'),
    description: text('description'),
    /**
     * Jumlah kamar fisik bertipe ini. Inilah alotmen yang dipakai CRM untuk
     * menghitung ketersediaan saat properti bermodus 'crm'. Bernilai 0 pada
     * baris yang dicerminkan dari PMS, karena di sana PMS yang berwenang.
     */
    totalRooms: integer('total_rooms').notNull().default(0),
    /** 'crm' bila dibuat orang di aplikasi ini, 'pms' bila hasil sinkronisasi. */
    source: text('source').notNull().default('crm'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('room_type_prop_code_uq').on(t.propertyId, t.code)],
);

export const ratePlanReferences = sqliteTable(
  'rate_plan_references',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').notNull().references(() => properties.id),
    connectionId: text('connection_id').references(() => integrationConnections.id),
    externalId: text('external_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    mealPlan: text('meal_plan').notNull().default('room_only'), // room_only | breakfast | half_board | full_board
    refundable: integer('refundable', { mode: 'boolean' }).notNull().default(true),
    minStay: integer('min_stay').notNull().default(1),
    inclusions: text('inclusions').notNull().default('[]'),
    policies: text('policies'),
    currency: text('currency').notNull().default('IDR'),
    /**
     * Tarif dasar per kamar per malam, sebelum pajak dan servis. Dipakai saat
     * properti bermodus 'crm'; pada modus 'pms' harga datang dari adapter.
     */
    baseRatePerNight: real('base_rate_per_night').notNull().default(0),
    /** Selisih tarif per tipe kamar, JSON {roomTypeCode: tambahanPerMalam}. */
    roomTypeSurcharges: text('room_type_surcharges').notNull().default('{}'),
    source: text('source').notNull().default('crm'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('rate_plan_prop_code_uq').on(t.propertyId, t.code)],
);

/** What the guest asked for. A lead has exactly one primary stay request. */
export const stayRequests = sqliteTable(
  'stay_requests',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').notNull().references(() => properties.id),
    leadId: text('lead_id').notNull().references(() => leads.id),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(true),
    checkIn: text('check_in').notNull(),
    checkOut: text('check_out').notNull(),
    nights: integer('nights').notNull(),
    rooms: integer('rooms').notNull().default(1),
    adults: integer('adults').notNull().default(2),
    children: integer('children').notNull().default(0),
    roomPreference: text('room_preference'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('stay_lead_idx').on(t.leadId, t.isPrimary)],
);

export const availabilitySearches = sqliteTable(
  'availability_searches',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').notNull().references(() => properties.id),
    leadId: text('lead_id').references(() => leads.id),
    connectionId: text('connection_id').references(() => integrationConnections.id),
    actorUserId: text('actor_user_id').references(() => users.id),
    checkIn: text('check_in').notNull(),
    checkOut: text('check_out').notNull(),
    nights: integer('nights').notNull(),
    rooms: integer('rooms').notNull(),
    adults: integer('adults').notNull(),
    children: integer('children').notNull().default(0),
    rateContext: text('rate_context'),
    /** success | failed | timeout | unavailable | manual — never silently downgraded to "live". */
    status: text('status').notNull(),
    sourceKind: text('source_kind').notNull().default('pms'), // pms | manual
    sourceLabel: text('source_label').notNull(),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('avail_lead_idx').on(t.leadId, t.createdAt), index('avail_prop_idx').on(t.propertyId, t.createdAt)],
);

export const availabilitySnapshots = sqliteTable(
  'availability_snapshots',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    searchId: text('search_id').notNull().references(() => availabilitySearches.id),
    roomTypeId: text('room_type_id').references(() => roomTypeReferences.id),
    roomTypeName: text('room_type_name').notNull(),
    ratePlanId: text('rate_plan_id').references(() => ratePlanReferences.id),
    ratePlanName: text('rate_plan_name').notNull(),
    sellableQty: integer('sellable_qty').notNull().default(0),
    ratePerNight: real('rate_per_night').notNull().default(0),
    currency: text('currency').notNull().default('IDR'),
    restrictions: text('restrictions').notNull().default('[]'),
    inclusions: text('inclusions').notNull().default('[]'),
    /** live | stale | manual | unavailable (PRD FR-08). */
    state: text('state').notNull().default('live'),
    checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('snapshot_search_idx').on(t.searchId)],
);

export const quotations = sqliteTable(
  'quotations',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').notNull().references(() => properties.id),
    leadId: text('lead_id').notNull().references(() => leads.id),
    code: text('code').notNull(),
    currentVersionId: text('current_version_id'),
    status: text('status').notNull().default('draft'),
    currency: text('currency').notNull().default('IDR'),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('quotations_org_code_uq').on(t.organizationId, t.code),
    index('quotations_lead_idx').on(t.leadId),
  ],
);

/** Immutable priced snapshot. A revision creates a new version and supersedes the old (PRD FR-09). */
export const quotationVersions = sqliteTable(
  'quotation_versions',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    quotationId: text('quotation_id').notNull().references(() => quotations.id),
    version: integer('version').notNull(),
    status: text('status').notNull().default('draft'),
    // draft | pending_approval | approved | sent | accepted | declined | expired | superseded
    subtotal: real('subtotal').notNull().default(0),
    discountType: text('discount_type').notNull().default('none'), // none | percent | amount
    discountValue: real('discount_value').notNull().default(0),
    discountAmount: real('discount_amount').notNull().default(0),
    discountPercentEffective: real('discount_percent_effective').notNull().default(0),
    netAmount: real('net_amount').notNull().default(0),
    servicePercent: real('service_percent').notNull().default(0),
    serviceAmount: real('service_amount').notNull().default(0),
    taxPercent: real('tax_percent').notNull().default(0),
    taxAmount: real('tax_amount').notNull().default(0),
    total: real('total').notNull().default(0),
    currency: text('currency').notNull().default('IDR'),
    nights: integer('nights').notNull().default(1),
    checkIn: text('check_in').notNull(),
    checkOut: text('check_out').notNull(),
    adults: integer('adults').notNull().default(2),
    children: integer('children').notNull().default(0),
    inclusions: text('inclusions').notNull().default('[]'),
    policies: text('policies'),
    notes: text('notes'),
    validUntil: integer('valid_until', { mode: 'timestamp_ms' }).notNull(),
    /** Provenance of the rates that were priced (PRD 15.2 rule 8). */
    availabilitySearchId: text('availability_search_id').references(() => availabilitySearches.id),
    snapshotSource: text('snapshot_source'),
    snapshotCheckedAt: integer('snapshot_checked_at', { mode: 'timestamp_ms' }),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    approvedByUserId: text('approved_by_user_id').references(() => users.id),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    sentVia: text('sent_via'),
    respondedAt: integer('responded_at', { mode: 'timestamp_ms' }),
    supersededByVersionId: text('superseded_by_version_id'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('qv_quotation_version_uq').on(t.quotationId, t.version),
    index('qv_status_idx').on(t.organizationId, t.status, t.validUntil),
  ],
);

export const quotationItems = sqliteTable(
  'quotation_items',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    versionId: text('version_id').notNull().references(() => quotationVersions.id),
    roomTypeId: text('room_type_id').references(() => roomTypeReferences.id),
    roomTypeName: text('room_type_name').notNull(),
    ratePlanId: text('rate_plan_id').references(() => ratePlanReferences.id),
    ratePlanName: text('rate_plan_name').notNull(),
    rooms: integer('rooms').notNull().default(1),
    nights: integer('nights').notNull().default(1),
    ratePerNight: real('rate_per_night').notNull().default(0),
    lineTotal: real('line_total').notNull().default(0),
    currency: text('currency').notNull().default('IDR'),
    inclusions: text('inclusions').notNull().default('[]'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('qi_version_idx').on(t.versionId, t.sortOrder)],
);

export const approvalRequests = sqliteTable(
  'approval_requests',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').notNull().references(() => properties.id),
    kind: text('kind').notNull().default('discount'),
    leadId: text('lead_id').references(() => leads.id),
    quotationVersionId: text('quotation_version_id').references(() => quotationVersions.id),
    requestedByUserId: text('requested_by_user_id').references(() => users.id),
    requestedDiscountPercent: real('requested_discount_percent').notNull().default(0),
    requesterLimitPercent: real('requester_limit_percent').notNull().default(0),
    amountImpact: real('amount_impact').notNull().default(0),
    currency: text('currency').notNull().default('IDR'),
    reason: text('reason'),
    status: text('status').notNull().default('pending'), // pending | approved | rejected | cancelled
    decidedByUserId: text('decided_by_user_id').references(() => users.id),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [index('approval_status_idx').on(t.organizationId, t.status, t.createdAt)],
);

export const reservationRequests = sqliteTable(
  'reservation_requests',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    propertyId: text('property_id').notNull().references(() => properties.id),
    leadId: text('lead_id').notNull().references(() => leads.id),
    quotationVersionId: text('quotation_version_id').references(() => quotationVersions.id),
    code: text('code').notNull(),
    kind: text('kind').notNull().default('reservation'), // hold | reservation
    status: text('status').notNull().default('draft'),
    // draft | submitted | under_review | alternative_proposed | on_hold | confirmed | rejected | expired | cancelled
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone'),
    guestEmail: text('guest_email'),
    checkIn: text('check_in').notNull(),
    checkOut: text('check_out').notNull(),
    nights: integer('nights').notNull().default(1),
    rooms: integer('rooms').notNull().default(1),
    adults: integer('adults').notNull().default(2),
    children: integer('children').notNull().default(0),
    roomTypeId: text('room_type_id').references(() => roomTypeReferences.id),
    roomTypeName: text('room_type_name'),
    ratePlanId: text('rate_plan_id').references(() => ratePlanReferences.id),
    ratePlanName: text('rate_plan_name'),
    totalAmount: real('total_amount').notNull().default(0),
    currency: text('currency').notNull().default('IDR'),
    specialRequest: text('special_request'),
    internalNote: text('internal_note'),
    requestedByUserId: text('requested_by_user_id').references(() => users.id),
    assignedToUserId: text('assigned_to_user_id').references(() => users.id),
    /**
     * Diisi saat sapuan after-sales sudah memproses inap ini. Tanpa penanda,
     * sapuan berikutnya akan membuat tugas duplikat setiap kali dijalankan.
     */
    stayCompletedAt: integer('stay_completed_at', { mode: 'timestamp_ms' }),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
    reviewStartedAt: integer('review_started_at', { mode: 'timestamp_ms' }),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    decidedByUserId: text('decided_by_user_id').references(() => users.id),
    decisionNote: text('decision_note'),
    alternativeNote: text('alternative_note'),
    holdExpiresAt: integer('hold_expires_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('resreq_org_code_uq').on(t.organizationId, t.code),
    index('resreq_queue_idx').on(t.organizationId, t.propertyId, t.status, t.submittedAt),
  ],
);

/** Confirmation evidence: a PMS reference, or an explicitly authorized manual one (PRD FR-10). */
export const reservationReferences = sqliteTable(
  'reservation_references',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    reservationRequestId: text('reservation_request_id').notNull().references(() => reservationRequests.id),
    provider: text('provider').notNull().default('pms-mock'),
    kind: text('kind').notNull().default('reservation'), // hold | reservation
    externalReference: text('external_reference').notNull(),
    confirmationType: text('confirmation_type').notNull().default('pms'), // pms | manual_authorized
    raw: text('raw'),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('resref_request_idx').on(t.reservationRequestId)],
);

export const depositStatusReferences = sqliteTable(
  'deposit_status_references',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    reservationRequestId: text('reservation_request_id').notNull().references(() => reservationRequests.id),
    leadId: text('lead_id').references(() => leads.id),
    status: text('status').notNull().default('pending'), // none | pending | partial | paid | refunded
    amount: real('amount').notNull().default(0),
    currency: text('currency').notNull().default('IDR'),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }),
    source: text('source').notNull().default('manual'), // manual | integration
    updatedByUserId: text('updated_by_user_id').references(() => users.id),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => [index('deposit_request_idx').on(t.reservationRequestId)],
);

/* ------------------------------------------------------------------ *
 * Audit, notifications, analytics (PRD FR-12, 18.1)
 * ------------------------------------------------------------------ */

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: id(),
    organizationId: text('organization_id').references(() => organizations.id),
    propertyId: text('property_id').references(() => properties.id),
    actorUserId: text('actor_user_id').references(() => users.id),
    /** Kept denormalised so history still names the actor after deactivation (PRD 9.3 rule 6). */
    actorName: text('actor_name'),
    actorType: text('actor_type').notNull().default('user'), // user | system | integration
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    summary: text('summary').notNull(),
    before: text('before'),
    after: text('after'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    correlationId: text('correlation_id'),
    severity: text('severity').notNull().default('info'), // info | warning | action_required | critical
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_org_idx').on(t.organizationId, t.createdAt),
    index('audit_entity_idx').on(t.entityType, t.entityId),
  ],
);

export const notifications = sqliteTable(
  'notifications',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    userId: text('user_id').notNull().references(() => users.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    severity: text('severity').notNull().default('info'),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('notif_user_idx').on(t.userId, t.readAt, t.createdAt)],
);

/** Product analytics stream (PRD 18.1). */
export const productEvents = sqliteTable(
  'product_events',
  {
    id: id(),
    organizationId: text('organization_id').references(() => organizations.id),
    propertyId: text('property_id').references(() => properties.id),
    userId: text('user_id').references(() => users.id),
    name: text('name').notNull(),
    properties: text('properties'),
    correlationId: text('correlation_id'),
    createdAt: createdAt(),
  },
  (t) => [index('pevents_name_idx').on(t.name, t.createdAt)],
);
