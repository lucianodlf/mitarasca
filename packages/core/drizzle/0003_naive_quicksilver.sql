ALTER TABLE `movements` ADD `source_movement_id` integer;--> statement-breakpoint
CREATE INDEX `idx_movements_source_movement_id` ON `movements` (`source_movement_id`);