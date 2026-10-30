CREATE TABLE `duplicate_findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nivel` text NOT NULL,
	`movement_a_id` integer NOT NULL,
	`movement_b_id` integer,
	`candidato_json` text,
	`motivo` text NOT NULL,
	`score` real,
	`detectado_en` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	FOREIGN KEY (`movement_a_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movement_b_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_findings_estado` ON `duplicate_findings` (`estado`);--> statement-breakpoint
CREATE TABLE `invisible_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`direccion` text,
	`patron` text NOT NULL,
	`modo` text DEFAULT 'exacto' NOT NULL,
	`activa` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE `movements` ADD `imported_at` text;--> statement-breakpoint
ALTER TABLE `movements` ADD `source_image_hash` text;