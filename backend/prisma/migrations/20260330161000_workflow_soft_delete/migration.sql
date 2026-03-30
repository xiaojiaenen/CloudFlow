-- AlterTable
ALTER TABLE `Workflow`
    ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Workflow_deletedAt_idx` ON `Workflow`(`deletedAt`);
