CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`nombre` text NOT NULL,
	`color` text DEFAULT '#6b7280' NOT NULL,
	`activo` integer DEFAULT true NOT NULL
);
