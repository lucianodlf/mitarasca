ALTER TABLE `debts` ADD `persona_tag_id` integer REFERENCES tags(id);--> statement-breakpoint
ALTER TABLE `debts` ADD `parent_debt_id` integer REFERENCES debts(id);--> statement-breakpoint
UPDATE `debts` SET `persona_tag_id` = (SELECT `persona_tag_id` FROM `debt_personas` dp WHERE dp.`debt_id` = `debts`.`id` LIMIT 1);--> statement-breakpoint
DELETE FROM `installments` WHERE `persona_tag_id` IS NOT NULL;--> statement-breakpoint
DELETE FROM `movements` WHERE `installment_id` IS NOT NULL AND `installment_id` NOT IN (SELECT `id` FROM `installments`);--> statement-breakpoint
DROP TABLE `debt_personas`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debt_id` integer NOT NULL,
	`nro` integer NOT NULL,
	`importe` real NOT NULL,
	`fecha_prevista` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`movement_id` integer,
	`fecha_pago` text,
	`observacion` text,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_installments`("id", "debt_id", "nro", "importe", "fecha_prevista", "estado", "movement_id", "fecha_pago", "observacion") SELECT "id", "debt_id", "nro", "importe", "fecha_prevista", "estado", "movement_id", "fecha_pago", "observacion" FROM `installments`;--> statement-breakpoint
DROP TABLE `installments`;--> statement-breakpoint
ALTER TABLE `__new_installments` RENAME TO `installments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_installments_debt_id` ON `installments` (`debt_id`);--> statement-breakpoint
CREATE INDEX `idx_installments_fecha_prevista` ON `installments` (`fecha_prevista`);
