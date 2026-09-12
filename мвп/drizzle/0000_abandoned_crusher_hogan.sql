CREATE TABLE IF NOT EXISTS `workspace_records` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mode` text NOT NULL,
	`user_id` text,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_records_kind_mode` ON `workspace_records` (`kind`,`mode`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_records_user` ON `workspace_records` (`user_id`);