CREATE TABLE `pipeline_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`template_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`kind` text DEFAULT 'open' NOT NULL,
	`gates` text DEFAULT '[]' NOT NULL,
	`colour` text DEFAULT 'neutral' NOT NULL,
	`probability` integer DEFAULT 0 NOT NULL,
	`hint` text,
	`meaning` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `pipeline_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_stage_key_uq` ON `pipeline_stages` (`template_id`,`key`);--> statement-breakpoint
CREATE INDEX `pipeline_stage_order_idx` ON `pipeline_stages` (`template_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `pipeline_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`inquiry_type` text DEFAULT 'fit' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pipeline_org_idx` ON `pipeline_templates` (`organization_id`,`archived_at`);--> statement-breakpoint
ALTER TABLE `leads` ADD `pipeline_template_id` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `priority` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `pipeline_template_id` text;