CREATE TABLE `vehicle_daily_km` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`vehicle_id` text NOT NULL,
	`on_day` text NOT NULL,
	`km` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'gps' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_daily_km_unique` ON `vehicle_daily_km` (`org_id`,`vehicle_id`,`on_day`);--> statement-breakpoint
CREATE INDEX `vehicle_daily_km_idx` ON `vehicle_daily_km` (`org_id`,`vehicle_id`,`on_day`);