ALTER TABLE `debts` ADD `concepto_tag_id` integer REFERENCES tags(id);--> statement-breakpoint
ALTER TABLE `debts` ADD `frecuencia` text DEFAULT 'mensual' NOT NULL;--> statement-breakpoint
ALTER TABLE `debts` ADD `frecuencia_dias` integer;--> statement-breakpoint
ALTER TABLE `debts` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `installments` ADD `fecha_pago` text;