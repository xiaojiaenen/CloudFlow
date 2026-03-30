-- AlterTable
ALTER TABLE `Task`
    ADD COLUMN `triggerSource` ENUM('manual', 'schedule') NOT NULL DEFAULT 'manual';
