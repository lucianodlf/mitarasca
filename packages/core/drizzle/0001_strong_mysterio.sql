CREATE TABLE `movement_tags` (
	`movement_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`movement_id`, `tag_id`),
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`direccion` text NOT NULL,
	`monto_total` real NOT NULL,
	`regla_op` text DEFAULT 'none' NOT NULL,
	`regla_factor` real,
	`monto_efectivo` real NOT NULL,
	`detalle` text NOT NULL,
	`observacion` text,
	`installment_id` integer
);
--> statement-breakpoint
CREATE INDEX `idx_movements_fecha` ON `movements` (`fecha`);