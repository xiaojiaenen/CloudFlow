-- AlterTable
ALTER TABLE `TaskExecutionEvent`
    MODIFY `type` ENUM('log', 'screenshot', 'status', 'extract', 'data_write') NOT NULL;

-- CreateTable
CREATE TABLE `DataCollection` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `schemaJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DataCollection_ownerId_key_key`(`ownerId`, `key`),
    INDEX `DataCollection_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    INDEX `DataCollection_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataRecord` (
    `id` VARCHAR(191) NOT NULL,
    `collectionId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `recordKey` VARCHAR(191) NOT NULL,
    `dataJson` JSON NOT NULL,
    `sourceWorkflowId` VARCHAR(191) NULL,
    `lastTaskId` VARCHAR(191) NULL,
    `lastBatchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DataRecord_collectionId_recordKey_key`(`collectionId`, `recordKey`),
    INDEX `DataRecord_collectionId_createdAt_idx`(`collectionId`, `createdAt`),
    INDEX `DataRecord_ownerId_updatedAt_idx`(`ownerId`, `updatedAt`),
    INDEX `DataRecord_sourceWorkflowId_idx`(`sourceWorkflowId`),
    INDEX `DataRecord_lastTaskId_idx`(`lastTaskId`),
    INDEX `DataRecord_lastBatchId_idx`(`lastBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataWriteBatch` (
    `id` VARCHAR(191) NOT NULL,
    `collectionId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `workflowId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NULL,
    `writeMode` ENUM('insert', 'upsert', 'skip_duplicates') NOT NULL,
    `recordMode` ENUM('single', 'array') NOT NULL,
    `insertedCount` INTEGER NOT NULL DEFAULT 0,
    `updatedCount` INTEGER NOT NULL DEFAULT 0,
    `skippedCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DataWriteBatch_taskId_createdAt_idx`(`taskId`, `createdAt`),
    INDEX `DataWriteBatch_collectionId_createdAt_idx`(`collectionId`, `createdAt`),
    INDEX `DataWriteBatch_workflowId_createdAt_idx`(`workflowId`, `createdAt`),
    INDEX `DataWriteBatch_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataWriteBatchRow` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `collectionId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `workflowId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `recordKey` VARCHAR(191) NULL,
    `operation` ENUM('insert', 'update', 'skip', 'error') NOT NULL,
    `dataJson` JSON NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DataWriteBatchRow_batchId_createdAt_idx`(`batchId`, `createdAt`),
    INDEX `DataWriteBatchRow_collectionId_createdAt_idx`(`collectionId`, `createdAt`),
    INDEX `DataWriteBatchRow_taskId_createdAt_idx`(`taskId`, `createdAt`),
    INDEX `DataWriteBatchRow_workflowId_createdAt_idx`(`workflowId`, `createdAt`),
    INDEX `DataWriteBatchRow_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DataCollection` ADD CONSTRAINT `DataCollection_ownerId_fkey`
FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRecord` ADD CONSTRAINT `DataRecord_collectionId_fkey`
FOREIGN KEY (`collectionId`) REFERENCES `DataCollection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRecord` ADD CONSTRAINT `DataRecord_ownerId_fkey`
FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRecord` ADD CONSTRAINT `DataRecord_sourceWorkflowId_fkey`
FOREIGN KEY (`sourceWorkflowId`) REFERENCES `Workflow`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRecord` ADD CONSTRAINT `DataRecord_lastTaskId_fkey`
FOREIGN KEY (`lastTaskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRecord` ADD CONSTRAINT `DataRecord_lastBatchId_fkey`
FOREIGN KEY (`lastBatchId`) REFERENCES `DataWriteBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatch` ADD CONSTRAINT `DataWriteBatch_collectionId_fkey`
FOREIGN KEY (`collectionId`) REFERENCES `DataCollection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatch` ADD CONSTRAINT `DataWriteBatch_taskId_fkey`
FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatch` ADD CONSTRAINT `DataWriteBatch_workflowId_fkey`
FOREIGN KEY (`workflowId`) REFERENCES `Workflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatch` ADD CONSTRAINT `DataWriteBatch_ownerId_fkey`
FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatchRow` ADD CONSTRAINT `DataWriteBatchRow_batchId_fkey`
FOREIGN KEY (`batchId`) REFERENCES `DataWriteBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatchRow` ADD CONSTRAINT `DataWriteBatchRow_collectionId_fkey`
FOREIGN KEY (`collectionId`) REFERENCES `DataCollection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatchRow` ADD CONSTRAINT `DataWriteBatchRow_taskId_fkey`
FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatchRow` ADD CONSTRAINT `DataWriteBatchRow_workflowId_fkey`
FOREIGN KEY (`workflowId`) REFERENCES `Workflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataWriteBatchRow` ADD CONSTRAINT `DataWriteBatchRow_ownerId_fkey`
FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
