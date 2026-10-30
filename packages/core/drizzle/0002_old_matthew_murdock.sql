CREATE TABLE `proration_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`op` text NOT NULL,
	`factor` real NOT NULL,
	`activo` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proration_presets_nombre_unique` ON `proration_presets` (`nombre`);