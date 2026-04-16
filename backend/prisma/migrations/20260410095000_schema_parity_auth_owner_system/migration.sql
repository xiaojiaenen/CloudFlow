-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    `status` ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_status_idx`(`role`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed a non-login system owner so existing workflows/tasks can be backfilled safely.
INSERT INTO `User` (`id`, `email`, `name`, `passwordHash`, `role`, `status`, `createdAt`, `updatedAt`)
VALUES (
  'system_migration_owner',
  'system-migration-owner@cloudflow.local',
  'System Migration Owner',
  'disabled-account',
  'admin',
  'suspended',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE `WorkflowTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `sourceWorkflowId` VARCHAR(191) NULL,
    `publisherId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `tags` JSON NOT NULL,
    `definition` JSON NOT NULL,
    `authorName` VARCHAR(191) NOT NULL DEFAULT 'CloudFlow',
    `published` BOOLEAN NOT NULL DEFAULT false,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `installCount` INTEGER NOT NULL DEFAULT 0,
    `rating` DOUBLE NOT NULL DEFAULT 4.8,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkflowTemplate_slug_key`(`slug`),
    INDEX `WorkflowTemplate_sourceWorkflowId_idx`(`sourceWorkflowId`),
    INDEX `WorkflowTemplate_publisherId_idx`(`publisherId`),
    INDEX `WorkflowTemplate_published_deletedAt_idx`(`published`, `deletedAt`),
    INDEX `WorkflowTemplate_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemConfig` (
    `id` VARCHAR(191) NOT NULL,
    `platformName` VARCHAR(191) NOT NULL DEFAULT 'CloudFlow',
    `supportEmail` VARCHAR(191) NULL,
    `smtpHost` VARCHAR(191) NULL,
    `smtpPort` INTEGER NOT NULL DEFAULT 587,
    `smtpUser` VARCHAR(191) NULL,
    `smtpPass` VARCHAR(191) NULL,
    `smtpSecure` BOOLEAN NOT NULL DEFAULT false,
    `smtpFrom` VARCHAR(191) NULL,
    `minioEndpoint` VARCHAR(191) NULL,
    `minioPort` INTEGER NOT NULL DEFAULT 9000,
    `minioUseSSL` BOOLEAN NOT NULL DEFAULT false,
    `minioAccessKey` VARCHAR(191) NULL,
    `minioSecretKey` VARCHAR(191) NULL,
    `minioBucket` VARCHAR(191) NULL DEFAULT 'cloudflow-task-artifacts',
    `screenshotIntervalMs` INTEGER NOT NULL DEFAULT 500,
    `screenshotPersistIntervalMs` INTEGER NOT NULL DEFAULT 3000,
    `taskRetentionDays` INTEGER NOT NULL DEFAULT 30,
    `monitorPageSize` INTEGER NOT NULL DEFAULT 10,
    `globalTaskConcurrency` INTEGER NOT NULL DEFAULT 2,
    `perUserTaskConcurrency` INTEGER NOT NULL DEFAULT 1,
    `manualTaskPriority` INTEGER NOT NULL DEFAULT 1,
    `scheduledTaskPriority` INTEGER NOT NULL DEFAULT 10,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Workflow`
    ADD COLUMN `ownerId` VARCHAR(191) NULL,
    ADD COLUMN `status` ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'active';

-- Backfill existing workflows to the system owner.
UPDATE `Workflow`
SET `ownerId` = 'system_migration_owner'
WHERE `ownerId` IS NULL;

-- AlterTable
ALTER TABLE `Workflow`
    MODIFY `ownerId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Workflow_ownerId_idx` ON `Workflow`(`ownerId`);

-- CreateIndex
CREATE INDEX `Workflow_status_idx` ON `Workflow`(`status`);

-- AlterTable
ALTER TABLE `Task`
    ADD COLUMN `ownerId` VARCHAR(191) NULL,
    ADD COLUMN `queuePriority` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `tempDir` VARCHAR(191) NULL,
    ADD COLUMN `workerPid` INTEGER NULL,
    ADD COLUMN `resourceHeartbeatAt` DATETIME(3) NULL,
    ADD COLUMN `memoryRssMb` DOUBLE NULL,
    ADD COLUMN `peakMemoryRssMb` DOUBLE NULL,
    ADD COLUMN `heapUsedMb` DOUBLE NULL,
    ADD COLUMN `peakHeapUsedMb` DOUBLE NULL,
    ADD COLUMN `cpuPercent` DOUBLE NULL,
    ADD COLUMN `peakCpuPercent` DOUBLE NULL;

-- Backfill existing tasks from workflow owner.
UPDATE `Task` t
JOIN `Workflow` w ON w.`id` = t.`workflowId`
SET t.`ownerId` = w.`ownerId`
WHERE t.`ownerId` IS NULL;

-- AlterTable
ALTER TABLE `Task`
    MODIFY `ownerId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Task_ownerId_idx` ON `Task`(`ownerId`);

-- AlterTable
ALTER TABLE `TaskExecutionEvent`
    ADD COLUMN `storageProvider` VARCHAR(191) NULL,
    ADD COLUMN `storageBucket` VARCHAR(191) NULL,
    ADD COLUMN `storageKey` VARCHAR(191) NULL,
    ADD COLUMN `sizeBytes` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Workflow` ADD CONSTRAINT `Workflow_ownerId_fkey`
FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_ownerId_fkey`
FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowTemplate` ADD CONSTRAINT `WorkflowTemplate_sourceWorkflowId_fkey`
FOREIGN KEY (`sourceWorkflowId`) REFERENCES `Workflow`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowTemplate` ADD CONSTRAINT `WorkflowTemplate_publisherId_fkey`
FOREIGN KEY (`publisherId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
