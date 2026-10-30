CREATE TABLE `movement_shares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movement_id` integer NOT NULL,
	`persona_tag_id` integer,
	`pagado` integer DEFAULT false NOT NULL,
	`fecha_pago` text,
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`persona_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_movement_shares_movement_id` ON `movement_shares` (`movement_id`);--> statement-breakpoint
ALTER TABLE `movements` ADD `pago_total_propio` integer;