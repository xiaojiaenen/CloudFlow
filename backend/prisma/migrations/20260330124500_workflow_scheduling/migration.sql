-- AlterTable
ALTER TABLE `Workflow`
    ADD COLUMN `scheduleEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `scheduleCron` VARCHAR(191) NULL,
    ADD COLUMN `scheduleTimezone` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Workflow_scheduleEnabled_idx` ON `Workflow`(`scheduleEnabled`);
