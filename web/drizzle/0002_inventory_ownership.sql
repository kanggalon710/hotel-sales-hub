ALTER TABLE `properties` ADD `inventory_source` text DEFAULT 'crm' NOT NULL;--> statement-breakpoint
ALTER TABLE `rate_plan_references` ADD `base_rate_per_night` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rate_plan_references` ADD `room_type_surcharges` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `rate_plan_references` ADD `source` text DEFAULT 'crm' NOT NULL;--> statement-breakpoint
ALTER TABLE `rate_plan_references` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;--> statement-breakpoint
ALTER TABLE `room_type_references` ADD `description` text;--> statement-breakpoint
ALTER TABLE `room_type_references` ADD `total_rooms` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `room_type_references` ADD `source` text DEFAULT 'crm' NOT NULL;--> statement-breakpoint
ALTER TABLE `room_type_references` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;