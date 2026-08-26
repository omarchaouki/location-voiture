CREATE TABLE `impersonation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`session_id` text NOT NULL,
	`admin_user_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`write_enabled` integer DEFAULT false NOT NULL,
	`write_enabled_at` text,
	`reason` text,
	`expires_at` text NOT NULL,
	`ended_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `impersonation_sessions_session_unique` ON `impersonation_sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `impersonation_admin_idx` ON `impersonation_sessions` (`admin_user_id`,`created_at`);