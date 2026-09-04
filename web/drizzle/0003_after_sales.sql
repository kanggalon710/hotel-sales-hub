ALTER TABLE `organizations` ADD `post_stay_follow_up_days` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `win_back_after_days` integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE `reservation_requests` ADD `stay_completed_at` integer;