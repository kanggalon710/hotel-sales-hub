CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text,
	`lead_id` text,
	`contact_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`actor_user_id` text,
	`actor_name` text,
	`actor_type` text DEFAULT 'user' NOT NULL,
	`source` text DEFAULT 'crm' NOT NULL,
	`is_internal` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activities_lead_idx` ON `activities` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activities_contact_idx` ON `activities` (`contact_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`kind` text DEFAULT 'discount' NOT NULL,
	`lead_id` text,
	`quotation_version_id` text,
	`requested_by_user_id` text,
	`requested_discount_percent` real DEFAULT 0 NOT NULL,
	`requester_limit_percent` real DEFAULT 0 NOT NULL,
	`amount_impact` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by_user_id` text,
	`decided_at` integer,
	`decision_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `approval_status_idx` ON `approval_requests` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`property_id` text,
	`actor_user_id` text,
	`actor_name` text,
	`actor_type` text DEFAULT 'user' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`before` text,
	`after` text,
	`ip` text,
	`user_agent` text,
	`correlation_id` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_org_idx` ON `audit_logs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `availability_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`lead_id` text,
	`connection_id` text,
	`actor_user_id` text,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`nights` integer NOT NULL,
	`rooms` integer NOT NULL,
	`adults` integer NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`rate_context` text,
	`status` text NOT NULL,
	`source_kind` text DEFAULT 'pms' NOT NULL,
	`source_label` text NOT NULL,
	`latency_ms` integer,
	`error` text,
	`checked_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `avail_lead_idx` ON `availability_searches` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `avail_prop_idx` ON `availability_searches` (`property_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `availability_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`search_id` text NOT NULL,
	`room_type_id` text,
	`room_type_name` text NOT NULL,
	`rate_plan_id` text,
	`rate_plan_name` text NOT NULL,
	`sellable_qty` integer DEFAULT 0 NOT NULL,
	`rate_per_night` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`restrictions` text DEFAULT '[]' NOT NULL,
	`inclusions` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'live' NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`search_id`) REFERENCES `availability_searches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_type_references`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rate_plan_id`) REFERENCES `rate_plan_references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshot_search_idx` ON `availability_snapshots` (`search_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`medium` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`source` text DEFAULT 'chatwoot' NOT NULL,
	`captured_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`full_name` text NOT NULL,
	`phone_normalized` text,
	`phone_raw` text,
	`email` text,
	`email_normalized` text,
	`preferred_language` text,
	`guest_tier` text DEFAULT 'none' NOT NULL,
	`nationality` text,
	`corporate_account_id` text,
	`consent_status` text DEFAULT 'unknown' NOT NULL,
	`last_stay_date` text,
	`stay_count` integer DEFAULT 0 NOT NULL,
	`preferences` text DEFAULT '[]' NOT NULL,
	`merged_into_contact_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`corporate_account_id`) REFERENCES `corporate_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contacts_org_phone_idx` ON `contacts` (`organization_id`,`phone_normalized`);--> statement-breakpoint
CREATE INDEX `contacts_org_email_idx` ON `contacts` (`organization_id`,`email_normalized`);--> statement-breakpoint
CREATE TABLE `conversation_references` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`external_conversation_id` text NOT NULL,
	`external_inbox_id` text,
	`inbox_name` text,
	`channel` text,
	`contact_id` text,
	`property_id` text,
	`conversation_status` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`assigned_external_agent_id` text,
	`assigned_user_id` text,
	`last_message_at` integer,
	`last_message_preview` text,
	`last_message_from` text,
	`deep_link` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conv_conn_ext_uq` ON `conversation_references` (`connection_id`,`external_conversation_id`);--> statement-breakpoint
CREATE INDEX `conv_contact_idx` ON `conversation_references` (`contact_id`);--> statement-breakpoint
CREATE TABLE `corporate_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`industry` text,
	`country` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `corp_org_idx` ON `corporate_accounts` (`organization_id`);--> statement-breakpoint
CREATE TABLE `dead_letter_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`webhook_event_id` text NOT NULL,
	`reason` text NOT NULL,
	`action_required` text,
	`resolved_at` integer,
	`resolved_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`webhook_event_id`) REFERENCES `webhook_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dlq_org_idx` ON `dead_letter_events` (`organization_id`,`resolved_at`);--> statement-breakpoint
CREATE TABLE `deposit_status_references` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`reservation_request_id` text NOT NULL,
	`lead_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`due_at` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_by_user_id` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_request_id`) REFERENCES `reservation_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deposit_request_idx` ON `deposit_status_references` (`reservation_request_id`);--> statement-breakpoint
CREATE TABLE `external_identity_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`provider` text NOT NULL,
	`entity_type` text NOT NULL,
	`external_id` text NOT NULL,
	`internal_id` text NOT NULL,
	`sync_version` text,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eim_conn_type_ext_uq` ON `external_identity_mappings` (`connection_id`,`entity_type`,`external_id`);--> statement-breakpoint
CREATE INDEX `eim_internal_idx` ON `external_identity_mappings` (`entity_type`,`internal_id`);--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`adapter` text DEFAULT 'chatwoot' NOT NULL,
	`label` text NOT NULL,
	`base_url` text,
	`external_account_id` text,
	`api_token_ciphertext` text,
	`api_token_last4` text,
	`webhook_secret_ciphertext` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`status_reason` text,
	`last_tested_at` integer,
	`last_test_result` text,
	`last_event_at` integer,
	`timeout_ms` integer DEFAULT 6000 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conn_org_provider_idx` ON `integration_connections` (`organization_id`,`provider`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`role_id` text NOT NULL,
	`property_ids` text DEFAULT '[]' NOT NULL,
	`team_id` text,
	`discount_limit_percent` real DEFAULT 0 NOT NULL,
	`invited_by_user_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invitations_org_email_idx` ON `invitations` (`organization_id`,`email`);--> statement-breakpoint
CREATE TABLE `lead_stage_history` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`actor_user_id` text,
	`actor_type` text DEFAULT 'user' NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lsh_lead_idx` ON `lead_stage_history` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`primary_conversation_id` text,
	`code` text NOT NULL,
	`stage` text DEFAULT 'new_inquiry' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`inquiry_type` text DEFAULT 'fit' NOT NULL,
	`source` text,
	`channel` text,
	`campaign_id` text,
	`owner_user_id` text,
	`team_id` text,
	`probability` integer DEFAULT 10 NOT NULL,
	`estimated_value` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`check_in` text,
	`check_out` text,
	`rooms` integer,
	`adults` integer,
	`children` integer,
	`room_preference` text,
	`budget_note` text,
	`purpose` text,
	`special_request` text,
	`language` text,
	`next_action_label` text,
	`next_follow_up_at` integer,
	`sla_first_response_due_at` integer,
	`first_responded_at` integer,
	`last_activity_at` integer,
	`lost_reason` text,
	`lost_competitor` text,
	`lost_notes` text,
	`cancellation_source` text,
	`cancellation_reason` text,
	`closed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`primary_conversation_id`) REFERENCES `conversation_references`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_org_code_uq` ON `leads` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `leads_scope_idx` ON `leads` (`organization_id`,`property_id`,`stage`);--> statement-breakpoint
CREATE INDEX `leads_owner_idx` ON `leads` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `leads_contact_idx` ON `leads` (`contact_id`);--> statement-breakpoint
CREATE TABLE `mapping_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text NOT NULL,
	`external_name` text,
	`channel` text,
	`property_id` text,
	`team_id` text,
	`user_id` text,
	`inquiry_type` text,
	`is_sales_inbox` integer DEFAULT false NOT NULL,
	`trigger_labels` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'unmapped' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_conn_kind_ext_uq` ON `mapping_rules` (`connection_id`,`kind`,`external_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notif_user_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`timezone` text DEFAULT 'Asia/Jakarta' NOT NULL,
	`locale` text DEFAULT 'id-ID' NOT NULL,
	`tax_percent` real DEFAULT 11 NOT NULL,
	`service_percent` real DEFAULT 10 NOT NULL,
	`quotation_validity_hours` integer DEFAULT 48 NOT NULL,
	`first_response_sla_minutes` integer DEFAULT 15 NOT NULL,
	`availability_stale_after_minutes` integer DEFAULT 15 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `product_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`property_id` text,
	`user_id` text,
	`name` text NOT NULL,
	`properties` text,
	`correlation_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pevents_name_idx` ON `product_events` (`name`,`created_at`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`city` text,
	`country` text,
	`timezone` text,
	`currency` text,
	`tax_percent` real,
	`service_percent` real,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `properties_org_code_uq` ON `properties` (`organization_id`,`code`);--> statement-breakpoint
CREATE TABLE `quotation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`version_id` text NOT NULL,
	`room_type_id` text,
	`room_type_name` text NOT NULL,
	`rate_plan_id` text,
	`rate_plan_name` text NOT NULL,
	`rooms` integer DEFAULT 1 NOT NULL,
	`nights` integer DEFAULT 1 NOT NULL,
	`rate_per_night` real DEFAULT 0 NOT NULL,
	`line_total` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`inclusions` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `quotation_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_type_references`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rate_plan_id`) REFERENCES `rate_plan_references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `qi_version_idx` ON `quotation_items` (`version_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `quotation_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`quotation_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`discount_percent_effective` real DEFAULT 0 NOT NULL,
	`net_amount` real DEFAULT 0 NOT NULL,
	`service_percent` real DEFAULT 0 NOT NULL,
	`service_amount` real DEFAULT 0 NOT NULL,
	`tax_percent` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`nights` integer DEFAULT 1 NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`adults` integer DEFAULT 2 NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`inclusions` text DEFAULT '[]' NOT NULL,
	`policies` text,
	`notes` text,
	`valid_until` integer NOT NULL,
	`availability_search_id` text,
	`snapshot_source` text,
	`snapshot_checked_at` integer,
	`created_by_user_id` text,
	`approved_by_user_id` text,
	`approved_at` integer,
	`sent_at` integer,
	`sent_via` text,
	`responded_at` integer,
	`superseded_by_version_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`availability_search_id`) REFERENCES `availability_searches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qv_quotation_version_uq` ON `quotation_versions` (`quotation_id`,`version`);--> statement-breakpoint
CREATE INDEX `qv_status_idx` ON `quotation_versions` (`organization_id`,`status`,`valid_until`);--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`code` text NOT NULL,
	`current_version_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotations_org_code_uq` ON `quotations` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `quotations_lead_idx` ON `quotations` (`lead_id`);--> statement-breakpoint
CREATE TABLE `rate_plan_references` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`connection_id` text,
	`external_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`meal_plan` text DEFAULT 'room_only' NOT NULL,
	`refundable` integer DEFAULT true NOT NULL,
	`min_stay` integer DEFAULT 1 NOT NULL,
	`inclusions` text DEFAULT '[]' NOT NULL,
	`policies` text,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_plan_prop_code_uq` ON `rate_plan_references` (`property_id`,`code`);--> statement-breakpoint
CREATE TABLE `reservation_references` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`reservation_request_id` text NOT NULL,
	`provider` text DEFAULT 'pms-mock' NOT NULL,
	`kind` text DEFAULT 'reservation' NOT NULL,
	`external_reference` text NOT NULL,
	`confirmation_type` text DEFAULT 'pms' NOT NULL,
	`raw` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_request_id`) REFERENCES `reservation_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resref_request_idx` ON `reservation_references` (`reservation_request_id`);--> statement-breakpoint
CREATE TABLE `reservation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`quotation_version_id` text,
	`code` text NOT NULL,
	`kind` text DEFAULT 'reservation' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`guest_name` text NOT NULL,
	`guest_phone` text,
	`guest_email` text,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`nights` integer DEFAULT 1 NOT NULL,
	`rooms` integer DEFAULT 1 NOT NULL,
	`adults` integer DEFAULT 2 NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`room_type_id` text,
	`room_type_name` text,
	`rate_plan_id` text,
	`rate_plan_name` text,
	`total_amount` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`special_request` text,
	`internal_note` text,
	`requested_by_user_id` text,
	`assigned_to_user_id` text,
	`submitted_at` integer,
	`review_started_at` integer,
	`decided_at` integer,
	`decided_by_user_id` text,
	`decision_note` text,
	`alternative_note` text,
	`hold_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_type_references`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rate_plan_id`) REFERENCES `rate_plan_references`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resreq_org_code_uq` ON `reservation_requests` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `resreq_queue_idx` ON `reservation_requests` (`organization_id`,`property_id`,`status`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_permissions_uq` ON `role_permissions` (`role_id`,`permission`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`scope` text DEFAULT 'property' NOT NULL,
	`is_system` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_org_key_uq` ON `roles` (`organization_id`,`key`);--> statement-breakpoint
CREATE TABLE `room_type_references` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`connection_id` text,
	`external_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`max_adults` integer DEFAULT 2 NOT NULL,
	`max_children` integer DEFAULT 1 NOT NULL,
	`bed_type` text,
	`size_sqm` integer,
	`active` integer DEFAULT true NOT NULL,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_type_prop_code_uq` ON `room_type_references` (`property_id`,`code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `stay_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`is_primary` integer DEFAULT true NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`nights` integer NOT NULL,
	`rooms` integer DEFAULT 1 NOT NULL,
	`adults` integer DEFAULT 2 NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`room_preference` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stay_lead_idx` ON `stay_requests` (`lead_id`,`is_primary`);--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_external_id` text NOT NULL,
	`payload` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`processed_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_idempotency_uq` ON `sync_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `sync_status_idx` ON `sync_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text,
	`lead_id` text,
	`contact_id` text,
	`assignee_user_id` text,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'follow_up' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`completed_by_user_id` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assignee_user_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_lead_idx` ON `tasks` (`lead_id`,`status`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'sales' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `teams_org_idx` ON `teams` (`organization_id`,`property_id`);--> statement-breakpoint
CREATE TABLE `user_property_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`property_id` text,
	`role_id` text NOT NULL,
	`team_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upr_user_property_role_uq` ON `user_property_roles` (`user_id`,`property_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `upr_user_idx` ON `user_property_roles` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`job_title` text,
	`password_hash` text,
	`status` text DEFAULT 'invited' NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`discount_limit_percent` real DEFAULT 0 NOT NULL,
	`can_approve_discount_up_to_percent` real DEFAULT 0 NOT NULL,
	`is_platform_admin` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`deactivated_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_org_email_uq` ON `users` (`organization_id`,`email`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`connection_id` text,
	`provider` text DEFAULT 'chatwoot' NOT NULL,
	`event_type` text NOT NULL,
	`fingerprint` text NOT NULL,
	`payload` text NOT NULL,
	`external_account_id` text,
	`correlation_id` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`result_summary` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`processed_at` integer,
	`next_retry_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_fingerprint_uq` ON `webhook_events` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `webhook_status_idx` ON `webhook_events` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `webhook_org_idx` ON `webhook_events` (`organization_id`,`created_at`);