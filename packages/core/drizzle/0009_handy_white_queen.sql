ALTER TABLE `debts` ADD `fecha` text;--> statement-breakpoint
UPDATE `debts` SET `fecha` = `fecha_inicio` WHERE `fecha` IS NULL;