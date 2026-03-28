-- AlterTable
ALTER TABLE `task` ADD COLUMN `cancelRequestedAt` DATETIME(3) NULL,
    MODIFY `status` ENUM('pending', 'running', 'success', 'failed', 'cancelled') NOT NULL DEFAULT 'pending';
