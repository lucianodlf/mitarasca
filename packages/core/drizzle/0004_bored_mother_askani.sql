CREATE TABLE `debt_personas` (
	`debt_id` integer NOT NULL,
	`persona_tag_id` integer NOT NULL,
	PRIMARY KEY(`debt_id`, `persona_tag_id`),
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`persona_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`descripcion` text NOT NULL,
	`direccion` text NOT NULL,
	`medio_pago_tag_id` integer,
	`importe_total` real NOT NULL,
	`cant_cuotas` integer NOT NULL,
	`ajuste_manual` real DEFAULT 0 NOT NULL,
	`fecha_inicio` text NOT NULL,
	FOREIGN KEY (`medio_pago_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debt_id` integer NOT NULL,
	`nro` integer NOT NULL,
	`side` text NOT NULL,
	`persona_tag_id` integer,
	`importe` real NOT NULL,
	`fecha_prevista` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`movement_id` integer,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`persona_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_installments_debt_id` ON `installments` (`debt_id`);--> statement-breakpoint
CREATE INDEX `idx_installments_fecha_prevista` ON `installments` (`fecha_prevista`);